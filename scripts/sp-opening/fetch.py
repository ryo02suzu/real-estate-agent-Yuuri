#!/usr/bin/env python3
"""国土地理院の標高タイルを取ってきて、1枚につなぎ合わせる（work/ に。Git には入れない）。

  python3 fetch.py            # 下の SETS を全部
  python3 fetch.py dem5a      # 名前を選んで

保存するもの：work/<名前>.npy（標高 m。float32）と work/<名前>.json（ズーム・左上のタイル番号・枚数・種類）。
形は PC の scripts/pc-opening/fetch.py と同じなので、geo.py の pixel_lonlat・height_at がそのまま使える。
取ってきたタイルは work/tiles/ に置き、2回目からは読み直さない（タイルを取る道具は PC の fetch.get を使う）。
"""

from __future__ import annotations

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from PIL import Image

import importlib.util

import common as C
from geo import TILE, decode_gsi, tile_range  # noqa: E402

# PC の scripts/pc-opening/fetch.py（get だけ使う）。このファイルと同じ名前なので、場所を指定して読む
_spec = importlib.util.spec_from_file_location("pc_fetch", os.path.join(C.PC, "fetch.py"))
pc_fetch = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pc_fetch)

# 範囲（西, 南, 東, 北）とズーム。富士山の西の面（カメラの側）と山頂の円錐は 5m（航空レーザ測量）、山全体は 10m、まわりは 約 15m
SETS = {
    # 山頂の西 6.5km 〜 東 2.5km、南北 4.6km（見える西の面・左右の肩・山頂のふち）
    "dem5a": dict(kind="dem5a", z=15, bbox=(138.6558, 35.3191, 138.7549, 35.4021)),
    # 山全体（約 10km 四方）。山頂の東側（朝日をさえぎる側）と、低い肩の輪郭
    "dem14": dict(kind="dem", z=14, bbox=(138.617, 35.270, 138.837, 35.451)),
    # まわり（雲海の下になる低い所の形。影の計算にも使う）
    "dem13": dict(kind="dem", z=13, bbox=(138.50, 35.20, 138.95, 35.52)),
}


def mosaic(name: str, kind: str, z: int, bbox) -> None:
    x0, y0, x1, y1 = tile_range(bbox, z)
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    out = np.full((ny * TILE, nx * TILE), np.nan, dtype=np.float32)
    for ty in range(ny):
        for tx in range(nx):
            x, y = x0 + tx, y0 + ty
            path = os.path.join(C.WORK, "tiles", kind + "_png", str(z), str(x), f"{y}.png")
            data = pc_fetch.get(C.TILE_URL[kind].format(z=z, x=x, y=y), path)
            if data is None:
                continue
            out[ty * TILE : (ty + 1) * TILE, tx * TILE : (tx + 1) * TILE] = decode_gsi(np.asarray(Image.open(io.BytesIO(data)).convert("RGB")))
        print(f"  {name}: {ty + 1}/{ny} 行", flush=True)
    nan = np.isnan(out)
    out[nan] = 0.0
    np.save(os.path.join(C.WORK, f"{name}.npy"), out)
    meta = dict(kind=kind, z=z, x0=x0, y0=y0, nx=nx, ny=ny, bbox=list(bbox), source=C.TILE_URL[kind], nodata=float(nan.mean()))
    with open(os.path.join(C.WORK, f"{name}.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"{name}: {out.shape[1]}×{out.shape[0]} 画素、{nx * ny} 枚、標高 {out.min():.0f}〜{out.max():.0f}m、データの無い所 {nan.mean() * 100:.2f}%", flush=True)


def main() -> None:
    C.ensure_work()
    for name in sys.argv[1:] or list(SETS):
        s = SETS[name]
        mosaic(name, s["kind"], s["z"], s["bbox"])


if __name__ == "__main__":
    main()
