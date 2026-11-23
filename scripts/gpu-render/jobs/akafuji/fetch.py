#!/usr/bin/env python3
"""赤富士の試し撮りの材料：国土地理院の標高タイルと航空写真（全国最新写真（シームレス））を取ってきて、1 枚ずつにつなぐ。

  python3 fetch.py <作業フォルダ>

作るもの（作業フォルダの中）：
  dem.npy / dem.json      … 標高（m。float32）。富士山の東の面とまわり（山中湖・忍野・御殿場）。ズーム 14（10m）
  photo.jpg / photo.json  … 航空写真。dem と同じ範囲。ズーム 15（約 4m）
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
    "photo": "/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
}
# 範囲（西, 南, 東, 北）。富士山の山頂（35.3606, 138.7274）の西 3km から、東の山中湖・忍野の先まで
BBOX = (138.69, 35.30, 138.93, 35.47)
SETS = {"dem": ("dem", 14), "photo": ("photo", 15)}
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
    kind, z = SETS[name]
    x0, y0, x1, y1 = tile_range(BBOX, z)
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    if kind == "dem":
        out = np.full((ny * TILE, nx * TILE), np.nan, dtype=np.float32)
    else:
        out = np.zeros((ny * TILE, nx * TILE, 3), dtype=np.uint8)
    ext = "png" if kind == "dem" else "jpg"
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
        out[sl] = decode_dem(img) if kind == "dem" else img

    done = 0
    with ThreadPoolExecutor(WORKERS) as ex:
        for _ in ex.map(one, jobs):
            done += 1
            if done % 100 == 0 or done == len(jobs):
                print(f"  {name}: {done}/{len(jobs)} 枚（{time.time() - t0:.0f} 秒）", flush=True)
    meta = {"z": z, "x0": x0, "y0": y0, "nx": nx, "ny": ny, "kind": kind, "bbox": BBOX}
    if kind == "dem":
        nan = np.isnan(out)
        out[nan] = np.nanmin(out) if (~nan).any() else 0.0
        np.save(os.path.join(work, "dem.npy"), out)
    else:
        Image.fromarray(out).save(os.path.join(work, "photo.jpg"), quality=95)
    json.dump(meta, open(os.path.join(work, f"{name}.json"), "w"))
    print(f"{name}: {nx}x{ny} タイル（z{z}。取れなかった {missing[0]} 枚）", flush=True)


if __name__ == "__main__":
    work = sys.argv[1] if len(sys.argv) > 1 else "work"
    os.makedirs(work, exist_ok=True)
    for name in SETS:
        mosaic(work, name)
