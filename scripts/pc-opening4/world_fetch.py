#!/usr/bin/env python3
"""実写の世界の材料（第4版）：国土地理院の標高タイルと航空写真（全国最新写真（シームレス））を取り、世界.py が読む形にそろえる。

  python3 world_fetch.py <データのフォルダ> --shot reveal|c2|all [--cache <タイルの置き場>] [--dry-run]
（場面ごとにフォルダを分ける。同じ名前の段（dem12 など）は場面ごとに範囲が違うため。タイルは --cache で共有できる）

numpy と Pillow だけで動く（bpy は要らない）。GPU の機械で新しく clone しただけでも、これ 1 本で材料が揃う。
カメラは同じフォルダの cameras.json から読み、「どのカメラからも見える範囲」のタイルだけを取る（距離の段ごとに細かさを変える）。
  reveal … コマ 458〜719（尾根を越えて雲海が開ける）   c2 … コマ 131〜300（吊尾根のあたり）   all … コマ 131〜719

作るもの（フォルダの中）：
  標高   dem1a / dem5a / dem14 / dem13 / dem12 … <名前>.npy（float32・m。無い画素は NaN）と <名前>.json
  写真   p17 / p16 / p15 / p14 / p13 / p12 / pfuji … <名前>.jpg と <名前>.json
  json の中身：z（ズーム）・x0・y0（左上のタイル）・nx・ny（タイルの数）・rmax（この段を使うカメラからの距離 m。pfuji は box）・tiles（取れた枚数）
  fetch_report.json … 取った枚数と容量（MB）
取ったタイルは <フォルダ>/tiles/ に残し、2 回目からは取り直さない（無かったタイルも空のファイルで覚える）。
負担をかけないよう、全体で 1 秒に 4 枚まで（つなぎっぱなしの 3 本で分け合う）。User-Agent は一般的な名前。
出典：「地理院タイル（標高タイル・全国最新写真（シームレス））を加工して作成」（国土地理院。https://maps.gsi.go.jp/development/ichiran.html）
"""
from __future__ import annotations

import argparse
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
HERE = os.path.dirname(os.path.abspath(__file__))
TILE = 256
UA = "Mozilla/5.0 (compatible; terrain-fetch/1.0)"
HOST = "cyberjapandata.gsi.go.jp"
RATE = 4.0  # 全体で 1 秒に何枚まで
WORKERS = 3
PATHS = {
    "dem1a": "/xyz/dem1a_png/{z}/{x}/{y}.png",
    "dem5a": "/xyz/dem5a_png/{z}/{x}/{y}.png",
    "dem": "/xyz/dem_png/{z}/{x}/{y}.png",
    "photo": "/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
}
# 名前, 種類, ズーム, カメラからの距離の上限（m）。粗い段から細かい段へ（world.py は距離で重ねる）
LAYERS = [
    ("dem12", "dem", 12, 150000.0), ("dem13", "dem", 13, 60000.0), ("dem14", "dem", 14, 24000.0),
    ("dem5a", "dem5a", 15, 3500.0), ("dem1a", "dem1a", 17, 1200.0),
    ("p12", "photo", 12, 150000.0), ("p13", "photo", 13, 55000.0), ("p14", "photo", 14, 20000.0),
    ("p15", "photo", 15, 8000.0), ("p16", "photo", 16, 3000.0), ("p17", "photo", 17, 1000.0),
]
# 富士山のまわり（135km 先でも 1 画素 33m ほど。ズーム 13 の 15m で足りる）：西, 南, 東, 北
FUJI_BOX = (138.55, 35.20, 138.95, 35.52)
SHOTS = {"reveal": (458, 719), "c2": (131, 300), "all": (131, 719)}

# 原点（河童橋）。config.py と同じ値（このファイルだけで動くよう写してある）
ORIGIN_LAT, ORIGIN_LON = 36.2490, 137.6380
EARTH = 40075016.686
K0 = math.cos(math.radians(ORIGIN_LAT))


def merc(lon, lat):
    lon = np.asarray(lon, dtype=np.float64)
    lat = np.asarray(lat, dtype=np.float64)
    return (lon + 180.0) / 360.0, (1.0 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2.0


MX0, MY0 = (float(v) for v in merc(ORIGIN_LON, ORIGIN_LAT))


def tile_enu(z, x, y):
    """タイルの中心の東・北（m）"""
    n = 2.0**z
    return ((x + 0.5) / n - MX0) * EARTH * K0, -((y + 0.5) / n - MY0) * EARTH * K0


def tile_size_m(z):
    return EARTH * K0 / 2.0**z


def load_cameras(frames):
    doc = json.load(open(os.path.join(HERE, "cameras.json")))["frames"]
    a, b = frames
    sel = [doc[str(f)] for f in range(a, b + 1, 4) if str(f) in doc]
    sel += [doc[str(f)] for f in (a, b) if str(f) in doc]
    cams = []
    for c in sel:
        hfov = 2 * math.degrees(math.atan(18.0 / c["lens_mm"]))
        cams.append((c["pos"][0], c["pos"][1], c["heading_deg"], hfov / 2 + 14.0))
    return np.array(cams)


def needed_tiles(cams, z, rmax, box=None):
    """どれかのカメラから、視野（＋余白）の中・距離 rmax の中に入るタイル（x, y）の一覧"""
    ts = tile_size_m(z)
    half = ts * 0.7072
    es, ns = cams[:, 0], cams[:, 1]
    x_lo = (MX0 + (es.min() - rmax) / (EARTH * K0)) * 2**z
    x_hi = (MX0 + (es.max() + rmax) / (EARTH * K0)) * 2**z
    y_lo = (MY0 - (ns.max() + rmax) / (EARTH * K0)) * 2**z
    y_hi = (MY0 - (ns.min() - rmax) / (EARTH * K0)) * 2**z
    xs = np.arange(int(x_lo), int(x_hi) + 1)
    ys = np.arange(int(y_lo), int(y_hi) + 1)
    X, Y = np.meshgrid(xs, ys)
    X, Y = X.ravel(), Y.ravel()
    te, tn = tile_enu(z, X, Y)
    ok = np.zeros(len(X), dtype=bool)
    for ce, cn, hd, ha in cams:
        dx, dy = te - ce, tn - cn
        d = np.hypot(dx, dy)
        ang = np.degrees(np.arctan2(dx, dy))
        diff = np.abs((ang - hd + 180.0) % 360.0 - 180.0)
        tol = np.degrees(np.arctan2(half, np.maximum(d, 1.0)))
        ok |= ((d <= rmax + half) & ((diff <= ha + tol) | (d <= 600.0 + half)))
    if box is not None:
        w, s, e, n = box
        lon = (X + 0.5) / 2**z * 360.0 - 180.0
        lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (Y + 0.5) / 2**z))))
        ok &= (lon >= w) & (lon <= e) & (lat >= s) & (lat <= n)
    return list(zip(X[ok].tolist(), Y[ok].tolist()))


_lock = threading.Lock()
_next = [0.0]
_local = threading.local()
CACHE = [None]  # タイルの置き場（既定は <フォルダ>/tiles。--cache で別の場所にすると、場面をまたいで共有できる）
STAT = {"req": 0, "bytes": 0, "cached": 0, "missing": 0}


def _slot():
    with _lock:
        now = time.time()
        at = max(now, _next[0])
        _next[0] = at + 1.0 / RATE
    if at > now:
        time.sleep(at - now)


def get(url_path, cache):
    """タイルを返す（無ければ None）。取ったものは cache に残す。無かったタイルは空のファイルで覚える"""
    if os.path.exists(cache):
        with _lock:
            STAT["cached"] += 1
        return open(cache, "rb").read() or None
    data = None
    for attempt in range(5):
        _slot()
        try:
            c = getattr(_local, "c", None)
            if c is None:
                c = _local.c = http.client.HTTPSConnection(HOST, timeout=30)
            c.request("GET", url_path, headers={"User-Agent": UA, "Connection": "keep-alive"})
            r = c.getresponse()
            body = r.read()
            with _lock:
                STAT["req"] += 1
            if r.status == 200:
                data = body
                break
            if r.status in (403, 404):
                data = b""
                break
            time.sleep(2 * (attempt + 1))
        except (OSError, http.client.HTTPException):
            try:
                _local.c.close()
            except Exception:
                pass
            _local.c = None
            time.sleep(2 * (attempt + 1))
    if data is None:
        return None
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    with open(cache + ".part", "wb") as fh:
        fh.write(data)
    os.replace(cache + ".part", cache)
    with _lock:
        STAT["bytes"] += len(data)
        if not data:
            STAT["missing"] += 1
    return data or None


def decode_dem(rgb):
    r, g, b = (rgb[..., i].astype(np.int64) for i in range(3))
    v = r * 65536 + g * 256 + b
    h = np.where(v < 2**23, v, v - 2**24).astype(np.float64) * 0.01
    h[v == 2**23] = np.nan
    return h.astype(np.float32)


def mosaic(data_dir, name, kind, z, tiles, rmax, box=None):
    xs = [t[0] for t in tiles]
    ys = [t[1] for t in tiles]
    x0, y0 = min(xs), min(ys)
    nx, ny = max(xs) - x0 + 1, max(ys) - y0 + 1
    is_dem = kind != "photo"
    ext = "png" if is_dem else "jpg"
    if is_dem:
        out = np.full((ny * TILE, nx * TILE), np.nan, dtype=np.float32)
    else:
        out = np.full((ny * TILE, nx * TILE, 3), 128, dtype=np.uint8)
    got = [0]

    def one(t):
        x, y = t
        d = get(PATHS[kind].format(z=z, x=x, y=y), os.path.join(CACHE[0] or os.path.join(data_dir, "tiles"), kind, str(z), str(x), f"{y}.{ext}"))
        if d is None:
            return
        img = np.asarray(Image.open(io.BytesIO(d)).convert("RGB"))
        sl = (slice((y - y0) * TILE, (y - y0 + 1) * TILE), slice((x - x0) * TILE, (x - x0 + 1) * TILE))
        out[sl] = decode_dem(img) if is_dem else img
        got[0] += 1

    t0 = time.time()
    with ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(one, tiles))
    meta = {"name": name, "kind": kind, "z": z, "x0": x0, "y0": y0, "nx": nx, "ny": ny, "rmax": rmax,
            "tiles": got[0], "requested": len(tiles)}
    if box is not None:
        meta["box"] = list(box)
    if is_dem:
        np.save(os.path.join(data_dir, f"{name}.npy"), out)
    else:
        Image.fromarray(out).save(os.path.join(data_dir, f"{name}.jpg"), quality=90)
    json.dump(meta, open(os.path.join(data_dir, f"{name}.json"), "w"))
    print(f"{name}: z{z} {len(tiles)} 枚（取れた {got[0]}）{nx}x{ny} タイル {time.time() - t0:.0f} 秒", flush=True)
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--shot", default="reveal", choices=list(SHOTS))
    ap.add_argument("--cache", default=None, help="タイルの置き場（既定は <フォルダ>/tiles）")
    ap.add_argument("--dry-run", action="store_true", help="枚数だけ数える")
    a = ap.parse_args()
    os.makedirs(a.data_dir, exist_ok=True)
    CACHE[0] = a.cache
    cams = load_cameras(SHOTS[a.shot])
    jobs = [(n, k, z, r, None) for n, k, z, r in LAYERS]
    if a.shot != "c2":
        jobs.append(("pfuji", "photo", 13, 160000.0, FUJI_BOX))
    report = {"shot": a.shot, "layers": {}}
    total = 0
    for name, kind, z, rmax, box in jobs:
        tiles = needed_tiles(cams, z, rmax, box)
        report["layers"][name] = len(tiles)
        total += len(tiles)
        if a.dry_run:
            print(f"{name}: z{z} {len(tiles)} 枚")
            continue
        if tiles:
            mosaic(a.data_dir, name, kind, z, tiles, rmax, box)
    print(f"合計 {total} 枚")
    if not a.dry_run:
        report.update(total_tiles=total, requests=STAT["req"], cached=STAT["cached"], missing=STAT["missing"],
                      megabytes=round(STAT["bytes"] / 1e6, 1))
        json.dump(report, open(os.path.join(a.data_dir, f"fetch_report_{a.shot}.json"), "w"), indent=1)
        print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
