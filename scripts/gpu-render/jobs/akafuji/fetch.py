#!/usr/bin/env python3
"""赤富士の試し撮りの材料：国土地理院の標高タイルと航空写真（全国最新写真（シームレス））を取ってきて、1 枚ずつにつなぐ。

  python3 fetch.py <作業フォルダ>

作るもの（作業フォルダの中）：
  dem.npy / dem.json      … 標高（m。float32）。富士山の東の面とまわり（山中湖・忍野・御殿場）。ズーム 14（10m）
  photo.jpg / photo.json  … 航空写真。dem と同じ範囲。ズーム 15（約 4m）
取ったタイルは <作業フォルダ>/tiles に残し、2 回目からは読み直さない。国土地理院の負担にならないよう、1 秒に 8 枚までにする。
出典：「地理院タイル（標高タイル・全国最新写真（シームレス））を加工して作成」（国土地理院。https://maps.gsi.go.jp/development/ichiran.html）
"""
from __future__ import annotations

import io
import json
import math
import os
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
TILE = 256
UA = {"User-Agent": "michilu-opening (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
URL = {
    "dem": "https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png",
    "photo": "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
}
# 範囲（西, 南, 東, 北）。富士山の山頂（35.3606, 138.7274）の西 3km から、東の山中湖・忍野の先まで
BBOX = (138.69, 35.30, 138.93, 35.47)
SETS = {"dem": ("dem", 14), "photo": ("photo", 15)}
_last = [0.0]


def tile_range(bbox, z):
    w, s, e, n = bbox
    def xy(lon, lat):
        x = (lon + 180) / 360 * 2**z
        y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 2**z
        return x, y
    x0, y0 = xy(w, n)
    x1, y1 = xy(e, s)
    return int(x0), int(y0), int(x1), int(y1)


def get(url: str, path: str) -> bytes | None:
    if os.path.exists(path):
        return open(path, "rb").read() or None
    wait = 1 / 8 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                data = b""
                break
            time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    else:
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(data)
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
    for ty in range(ny):
        for tx in range(nx):
            x, y = x0 + tx, y0 + ty
            ext = "png" if kind == "dem" else "jpg"
            data = get(URL[kind].format(z=z, x=x, y=y), os.path.join(work, "tiles", kind, str(z), str(x), f"{y}.{ext}"))
            if data is None:
                continue
            img = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"))
            sl = (slice(ty * TILE, (ty + 1) * TILE), slice(tx * TILE, (tx + 1) * TILE))
            out[sl] = decode_dem(img) if kind == "dem" else img
        print(f"  {name}: {ty + 1}/{ny} 行", flush=True)
    meta = {"z": z, "x0": x0, "y0": y0, "nx": nx, "ny": ny, "kind": kind, "bbox": BBOX}
    if kind == "dem":
        nan = np.isnan(out)
        out[nan] = np.nanmin(out) if (~nan).any() else 0.0
        np.save(os.path.join(work, "dem.npy"), out)
    else:
        Image.fromarray(out).save(os.path.join(work, "photo.jpg"), quality=95)
    json.dump(meta, open(os.path.join(work, f"{name}.json"), "w"))
    print(f"{name}: {nx}x{ny} タイル（z{z}）", flush=True)


if __name__ == "__main__":
    work = sys.argv[1] if len(sys.argv) > 1 else "work"
    os.makedirs(work, exist_ok=True)
    for name in SETS:
        mosaic(work, name)
