#!/usr/bin/env python3
"""PC のオープニング CG に使う標高のタイルを取ってきて、1枚につなぎ合わせて保存する（work/ に。Git には入れない）。

  python3 fetch.py            # 下の SETS を全部
  python3 fetch.py near mid   # 名前を選んで

航空写真（near_photo）は work/<名前>.jpg（1枚の画像）と work/<名前>.json に保存する。

保存するもの：work/<名前>.npy（標高 m。float32）と work/<名前>.json（ズーム・左上のタイル番号・枚数・種類）。
取ってきたタイルは work/tiles/ に置き、2回目からは読み直さない。
必要なもの：Python 3・numpy・Pillow
"""

from __future__ import annotations

import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

import numpy as np
from PIL import Image

from geo import TILE, decode_gsi, decode_terrarium, tile_range

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
UA = "Mozilla/5.0 (compatible; terrain-fetch/1.0)"

# 取ってくる範囲（西, 南, 東, 北）とズーム
SETS = {
    # 日本列島と、そのまわりの海（海底の地形を含む）。列島が海から現れる場面・列島を見渡す場面
    "global": dict(kind="terrarium", z=6, bbox=(112.0, 15.0, 162.0, 55.0)),
    # 上高地・穂高・蝶ヶ岳（鷹の視点で飛ぶ所。約 7.7m ごと）
    "near": dict(kind="gsi", z=14, bbox=(137.55, 36.17, 137.82, 36.37)),
    # 北アルプスから富士山まで（稜線を越えた先に見える山並み。約 60m ごと）
    "mid": dict(kind="gsi", z=11, bbox=(136.9, 35.25, 139.1, 37.0)),
    # 上高地のまわりの航空写真（国土地理院 全国最新写真（シームレス）。約 3.9m ごと）。地面の色に使う
    "near_photo": dict(kind="photo", z=15, bbox=(137.55, 36.17, 137.82, 36.37)),
    # 真上から見た日本（PC のホームの地図と重ねる）の陸の色：日本は国土地理院 全国ランドサットモザイク画像、
    # まわりの国は国土地理院 世界衛星モザイク画像（海は使わない。海は Blender で描く）
    "lndst": dict(kind="lndst", z=8, bbox=(119.5, 30.0, 154.0, 47.2)),
    # 同じ範囲・同じ細かさの標高（海底を含む）。陸と海の境目と、海の深さの色に使う
    "dem8": dict(kind="terrarium", z=8, bbox=(119.5, 30.0, 154.0, 47.2)),
    "modis": dict(kind="modis", z=7, bbox=(119.5, 30.0, 154.0, 47.2)),
    # PC のホームの背景（広い版）：画面の大きさによらず地図と重なるよう、日本のまわりを広く（ランドサットは日本だけなので上のまま）
    "dem8w": dict(kind="terrarium", z=8, bbox=(110.0, 18.0, 165.0, 52.0)),
    "modisw": dict(kind="modis", z=7, bbox=(110.0, 18.0, 165.0, 52.0)),
}
URL = {
    "terrarium": "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    "gsi": "https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png",
    "photo": "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    "lndst": "https://cyberjapandata.gsi.go.jp/xyz/lndst/{z}/{x}/{y}.png",
    "modis": "https://cyberjapandata.gsi.go.jp/xyz/modis/{z}/{x}/{y}.png",
}


def get(url: str, path: str) -> bytes | None:
    """タイルを1枚取る（取ったものは path に置き、次からはそれを使う）。無いタイル（海の上の標高タイルなど）は None"""
    if os.path.exists(path):
        with open(path, "rb") as f:
            data = f.read()
        return data or None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            time.sleep(0.05)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                open(path, "wb").close()
                return None
            err = e
        except Exception as e:  # 通信の途切れなど
            err = e
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"取れなかった: {url}（{err}）")


def photo_mosaic(name: str, z: int, bbox: tuple[float, float, float, float], kind: str = "photo") -> None:
    """写真・衛星画像のタイルをつなぎ合わせて、1枚の画像にする（航空写真は work/<名前>.jpg、衛星画像は透明な所のある
    work/<名前>.png）"""
    x0, y0, x1, y1 = tile_range(bbox, z)
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    png = kind != "photo"
    out = Image.new("RGBA" if png else "RGB", (nx * TILE, ny * TILE), (0, 0, 0, 0) if png else (60, 70, 60))
    missing = 0
    ext = "png" if png else "jpg"
    for ty in range(ny):
        for tx in range(nx):
            x, y = x0 + tx, y0 + ty
            data = get(URL[kind].format(z=z, x=x, y=y), os.path.join(WORK, "tiles", kind, str(z), str(x), f"{y}.{ext}"))
            if data is None:
                missing += 1
                continue
            out.paste(Image.open(io.BytesIO(data)).convert("RGBA" if png else "RGB"), (tx * TILE, ty * TILE))
        print(f"  {name}: {ty + 1}/{ny} 行", flush=True)
    if png:
        out.save(os.path.join(WORK, f"{name}.png"))
    else:
        out.save(os.path.join(WORK, f"{name}.jpg"), quality=92)
    meta = dict(kind=kind, z=z, x0=x0, y0=y0, nx=nx, ny=ny, bbox=bbox, source=URL[kind])
    with open(os.path.join(WORK, f"{name}.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"{name}: {out.width}×{out.height} 画素、{nx * ny} 枚（無いタイル {missing}）", flush=True)


def mosaic(name: str, kind: str, z: int, bbox: tuple[float, float, float, float]) -> None:
    if kind in ("photo", "lndst", "modis"):
        photo_mosaic(name, z, bbox, kind)
        return
    x0, y0, x1, y1 = tile_range(bbox, z)
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    out = np.full((ny * TILE, nx * TILE), np.nan, dtype=np.float32)
    missing = 0
    for ty in range(ny):
        for tx in range(nx):
            x, y = x0 + tx, y0 + ty
            data = get(URL[kind].format(z=z, x=x, y=y), os.path.join(WORK, "tiles", kind, str(z), str(x), f"{y}.png"))
            if data is None:
                missing += 1
                continue
            rgb = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"))
            h = decode_gsi(rgb) if kind == "gsi" else decode_terrarium(rgb)
            out[ty * TILE : (ty + 1) * TILE, tx * TILE : (tx + 1) * TILE] = h
        print(f"  {name}: {ty + 1}/{ny} 行", flush=True)
    # 国土地理院の標高タイルは海にデータが無いので、海面（0m）にする
    sea = np.isnan(out)
    out[sea] = 0.0
    np.save(os.path.join(WORK, f"{name}.npy"), out)
    meta = dict(kind=kind, z=z, x0=x0, y0=y0, nx=nx, ny=ny, bbox=bbox, source=URL[kind])
    with open(os.path.join(WORK, f"{name}.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"{name}: {out.shape[1]}×{out.shape[0]} 画素、{nx * ny} 枚（無いタイル {missing}）、"
          f"標高 {np.nanmin(out):.0f}〜{np.nanmax(out):.0f}m、データの無い所 {sea.mean() * 100:.1f}%", flush=True)


def main() -> None:
    os.makedirs(WORK, exist_ok=True)
    names = sys.argv[1:] or list(SETS)
    for name in names:
        s = SETS[name]
        mosaic(name, s["kind"], s["z"], s["bbox"])


if __name__ == "__main__":
    main()
