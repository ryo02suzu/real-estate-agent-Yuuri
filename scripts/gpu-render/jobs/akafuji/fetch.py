#!/usr/bin/env python3
"""赤富士の試し撮りの材料：国土地理院の標高タイルと航空写真（全国最新写真（シームレス））を取ってきて、1 枚ずつにつなぐ。

  python3 fetch.py <作業フォルダ> [名前...]   # 名前を省くと環境変数 FETCH（既定 "dem photo"）

作るもの（作業フォルダの中。<名前>.npy か <名前>.jpg と、<名前>.json）：
  dem      … 標高（m。float32）。富士山とまわり（山中湖・忍野・御殿場）。ズーム 14（10m）
  photo    … 航空写真。dem と同じ範囲。ズーム 15（約 4m）
  dem5     … 雲海より上に出る山の部分（標高 1,800m より上と少しの余白）の、航空レーザーの細かい標高（DEM5A。ズーム 15・5m）
  photo16  … dem5 と同じ範囲の航空写真。ズーム 16（約 2m）
  photo17  … 山頂のまわり（約 6km 四方）の航空写真。ズーム 17（約 1m。4K で山頂を近くに見るとき）
取ったタイルは <作業フォルダ>/tiles に残し、2 回目からは読み直さない。国土地理院の負担にならないよう、全体で 1 秒に 8 枚までにする
（GPU の機械は日本の外にあり 1 枚ごとの待ちが長いので、つなぎっぱなしの 6 本で取る。速さの上限は 1 本のときと同じ）。
User-Agent は一般的な名前（個人の情報は入れない）。
出典：「地理院タイル（標高タイル・全国最新写真（シームレス））を加工して作成」（国土地理院。https://maps.gsi.go.jp/development/ichiran.html）
"""
from __future__ import annotations

import http.client
import io
import json
import math
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
TILE = 256
UA = "Mozilla/5.0 (compatible; terrain-fetch/1.0)"
HOST = "cyberjapandata.gsi.go.jp"
PATH = {
    "dem": "/xyz/dem_png/{z}/{x}/{y}.png",
    "dem5a": "/xyz/dem5a_png/{z}/{x}/{y}.png",
    "photo": "/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
}
# 範囲（西, 南, 東, 北）。富士山の山頂（35.3606, 138.7274）の西 5km（西の裾が雲海に沈む所の先）から、東の山中湖・忍野の先まで
BBOX = (138.67, 35.30, 138.93, 35.47)
# 雲海（上面 約 2,050m）より上に出る山の部分：標高 1,800m より上（手元の 10m の標高で測った 138.6835〜138.7878・
# 35.3204〜35.4071）に、少し余白
CONE = (138.678, 35.315, 138.793, 35.412)
# 山頂のまわり（約 6km 四方）
TOP = (138.692, 35.332, 138.763, 35.389)
SETS = {
    "dem": ("dem", 14, BBOX),
    "photo": ("photo", 15, BBOX),
    "dem5": ("dem5a", 15, CONE),
    "photo16": ("photo", 16, CONE),
    "photo17": ("photo", 17, TOP),
}
RATE = 8.0  # 全体で 1 秒に何枚まで
WORKERS = 6
_lock = threading.Lock()
_next = [0.0]
_local = threading.local()


def tile_range(bbox, z):
    w, s, e, n = bbox
    def xy(lon, lat):
        x = (lon + 180) / 360 * 2**z
        y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 2**z
        return x, y
    x0, y0 = xy(w, n)
    x1, y1 = xy(e, s)
    return int(x0), int(y0), int(x1), int(y1)


def _slot() -> None:
    """全体で 1 秒に RATE 枚を超えないよう、順番を待つ"""
    with _lock:
        now = time.time()
        at = max(now, _next[0])
        _next[0] = at + 1.0 / RATE
    if at > now:
        time.sleep(at - now)


def _conn() -> http.client.HTTPSConnection:
    c = getattr(_local, "c", None)
    if c is None:
        c = _local.c = http.client.HTTPSConnection(HOST, timeout=30)
    return c


def get(path_url: str, path: str) -> bytes | None:
    if os.path.exists(path):
        return open(path, "rb").read() or None
    data = None
    for attempt in range(5):
        _slot()
        try:
            c = _conn()
            c.request("GET", path_url, headers={"User-Agent": UA, "Connection": "keep-alive"})
            r = c.getresponse()
            body = r.read()
            if r.status == 200:
                data = body
                break
            if r.status == 404:
                data = b""
                break
            time.sleep(2 * (attempt + 1))
        except (OSError, http.client.HTTPException):
            # つなぎ直す
            try:
                _local.c.close()
            except Exception:
                pass
            _local.c = None
            time.sleep(2 * (attempt + 1))
    if data is None:
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    open(tmp, "wb").write(data)
    os.replace(tmp, path)
    return data or None


def decode_dem(rgb: np.ndarray) -> np.ndarray:
    """標高タイルの色（R*2^16 + G*2^8 + B）を m に。無い所（128,0,0）は NaN"""
    r, g, b = (rgb[..., i].astype(np.int64) for i in range(3))
    v = r * 65536 + g * 256 + b
    h = np.where(v < 2**23, v, v - 2**24).astype(np.float64) * 0.01
    h[v == 2**23] = np.nan
    return h.astype(np.float32)


def mosaic(work: str, name: str) -> None:
    kind, z, bbox = SETS[name]
    x0, y0, x1, y1 = tile_range(bbox, z)
    if name == "photo":
        # 広い範囲の写真は、標高（dem・ズーム 14）のタイルの範囲をすき間なく覆う（地形の端まで色が付くように）
        dk, dz, dbox = SETS["dem"]
        a0, b0, a1, b1 = tile_range(dbox, dz)
        f = 2 ** (z - dz)
        x0, y0, x1, y1 = a0 * f, b0 * f, (a1 + 1) * f - 1, (b1 + 1) * f - 1
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    is_dem = kind.startswith("dem")
    if is_dem:
        out = np.full((ny * TILE, nx * TILE), np.nan, dtype=np.float32)
    else:
        out = np.zeros((ny * TILE, nx * TILE, 3), dtype=np.uint8)
    ext = "png" if is_dem else "jpg"
    jobs = [(tx, ty) for ty in range(ny) for tx in range(nx)]
    t0 = time.time()
    missing = [0]

    def one(job):
        tx, ty = job
        x, y = x0 + tx, y0 + ty
        data = get(PATH[kind].format(z=z, x=x, y=y), os.path.join(work, "tiles", kind, str(z), str(x), f"{y}.{ext}"))
        if data is None:
            missing[0] += 1
            return
        img = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"))
        sl = (slice(ty * TILE, (ty + 1) * TILE), slice(tx * TILE, (tx + 1) * TILE))
        out[sl] = decode_dem(img) if is_dem else img

    done = 0
    with ThreadPoolExecutor(WORKERS) as ex:
        for _ in ex.map(one, jobs):
            done += 1
            if done % 100 == 0 or done == len(jobs):
                print(f"  {name}: {done}/{len(jobs)} 枚（{time.time() - t0:.0f} 秒）", flush=True)
    meta = {"z": z, "x0": x0, "y0": y0, "nx": nx, "ny": ny, "kind": kind, "bbox": bbox}
    if is_dem:
        nan = np.isnan(out)
        meta["nan"] = int(nan.sum())
        if name == "dem":
            # 広い範囲の標高は、無い所（湖など）をいちばん低い値で埋める。細かい標高（dem5）は NaN のまま残し、scene.py が dem で埋める
            out[nan] = np.nanmin(out) if (~nan).any() else 0.0
        np.save(os.path.join(work, f"{name}.npy"), out)
    else:
        Image.fromarray(out).save(os.path.join(work, f"{name}.jpg"), quality=95)
    json.dump(meta, open(os.path.join(work, f"{name}.json"), "w"))
    print(f"{name}: {nx}x{ny} タイル（z{z}。取れなかった {missing[0]} 枚{'・標高の無い画素 ' + str(meta['nan']) if is_dem else ''}）", flush=True)


if __name__ == "__main__":
    work = sys.argv[1] if len(sys.argv) > 1 else "work"
    os.makedirs(work, exist_ok=True)
    names = sys.argv[2:] or os.environ.get("FETCH", "dem photo").split()
    for name in names:
        if name not in SETS:
            sys.exit(f"知らない名前: {name}（{' '.join(SETS)}）")
        mosaic(work, name)
