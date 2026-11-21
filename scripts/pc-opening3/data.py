#!/usr/bin/env python3
"""PC のオープニング第3版の地形と写真（上高地・梓川の谷と穂高）を、国土地理院のタイルから作る。

  python3 data.py      # → work/terrain/*.npy・*.json（標高 m。北が上）と work/photo/*.jpg・*.json

- near：川の上を低く飛ぶ所。標高は 5m（dem5a。無い所は 10m の dem を引き伸ばして埋める）
- valley：谷と穂高の全体（見える範囲）。標高は 10m（ズーム 14）
（写真は、川筋を写し取るのに使った（river.py）。場面には写真の色を使わないので、ここでは取らない。取るときは photo=ズーム を足す）
- far：遠くの山並み。標高はズーム 11（約 76m）
出典：国土地理院（地理院タイル：標高タイル（基盤地図情報 数値標高モデル）・全国最新写真（シームレス））。
タイルは scripts/pc-opening/fetch.py と同じ置き場（work/tiles）に置き、2回目からは取り直さない。
"""

from __future__ import annotations

import io
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "pc-opening"))

import fetch  # noqa: E402
from geo import decode_gsi, tile_range  # noqa: E402

WORK = os.environ.get("PC_OPENING3_WORK", os.path.join(HERE, "work"))
fetch.URL["dem5a"] = "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png"
TILES = os.path.join(HERE, "..", "pc-opening", "work", "tiles")

# 範囲（西, 南, 東, 北）
SETS = {
    "near": dict(bbox=(137.600, 36.212, 137.668, 36.268), dem=("dem5a", 15), fill=("gsi", 14)),
    "valley": dict(bbox=(137.540, 36.170, 137.760, 36.340), dem=("gsi", 14)),
    "far": dict(bbox=(137.0, 35.6, 138.6, 36.9), dem=("gsi", 11)),
}


def tile(kind: str, z: int, x: int, y: int) -> bytes | None:
    ext = "jpg" if kind == "photo" else "png"
    return fetch.get(fetch.URL[kind].format(z=z, x=x, y=y), os.path.join(TILES, kind, str(z), str(x), f"{y}.{ext}"))


def dem(kind: str, z: int, bbox) -> tuple[np.ndarray, dict]:
    x0, y0, x1, y1 = tile_range(bbox, z)
    out = np.full(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.nan, np.float32)
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            data = tile(kind, z, tx, ty)
            if data:
                out[(ty - y0) * 256 : (ty - y0 + 1) * 256, (tx - x0) * 256 : (tx - x0 + 1) * 256] = decode_gsi(np.asarray(Image.open(io.BytesIO(data)).convert("RGB")))
    return out, dict(z=z, x0=x0, y0=y0, nx=x1 - x0 + 1, ny=y1 - y0 + 1, bbox=bbox, kind=kind)


def photo(z: int, bbox) -> tuple[Image.Image, dict]:
    x0, y0, x1, y1 = tile_range(bbox, z)
    out = Image.new("RGB", ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256), (60, 70, 60))
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            data = tile("photo", z, tx, ty)
            if data:
                out.paste(Image.open(io.BytesIO(data)).convert("RGB"), ((tx - x0) * 256, (ty - y0) * 256))
    return out, dict(z=z, x0=x0, y0=y0, nx=x1 - x0 + 1, ny=y1 - y0 + 1, bbox=bbox)


def main() -> None:
    os.makedirs(os.path.join(WORK, "terrain"), exist_ok=True)
    os.makedirs(os.path.join(WORK, "photo"), exist_ok=True)
    for name, s in SETS.items():
        kind, z = s["dem"]
        h, meta = dem(kind, z, s["bbox"])
        if "fill" in s:
            # 5m の無い所（NaN）は 10m を引き伸ばして埋める
            fk, fz = s["fill"]
            lo, lm = dem(fk, fz, s["bbox"])
            k = 2 ** (z - fz)
            up = np.kron(np.nan_to_num(lo, nan=0.0), np.ones((k, k), np.float32))
            ox, oy = meta["x0"] * 256 - lm["x0"] * 256 * k, meta["y0"] * 256 - lm["y0"] * 256 * k
            up = up[oy : oy + h.shape[0], ox : ox + h.shape[1]]
            miss = np.isnan(h)
            h[miss] = up[miss]
            meta["filled"] = float(miss.mean())
        h = np.nan_to_num(h, nan=0.0)
        np.save(os.path.join(WORK, "terrain", f"{name}.npy"), h)
        with open(os.path.join(WORK, "terrain", f"{name}.json"), "w") as f:
            json.dump(meta, f, indent=1)
        print(f"{name}: 標高 {h.shape[1]}×{h.shape[0]}（{kind} z{z}）{h.min():.0f}〜{h.max():.0f}m 埋めた {meta.get('filled', 0) * 100:.0f}%", flush=True)
        if "photo" in s:
            im, pm = photo(s["photo"], s["bbox"])
            im.save(os.path.join(WORK, "photo", f"{name}.jpg"), quality=93)
            with open(os.path.join(WORK, "photo", f"{name}.json"), "w") as f:
                json.dump(pm, f, indent=1)
            print(f"{name}: 写真 {im.width}×{im.height}（z{s['photo']}）", flush=True)


if __name__ == "__main__":
    main()
