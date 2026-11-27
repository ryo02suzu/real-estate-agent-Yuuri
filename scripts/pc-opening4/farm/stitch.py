#!/usr/bin/env python3
"""タイルを 1 枚に貼る。重なりの中は直線の重みで混ぜる（タイルごとのノイズ除去の継ぎ目を消す）。
  python3 farm/stitch.py <dest> <layout.json> --out full.png      （EXR があれば full.exr も）
<dest>/<タイル名>/out/ の中の frame_*.png（と .exr）を使う（--pattern で変える）。numpy + Pillow（EXR は OpenEXR）。"""
import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("dest")
ap.add_argument("layout")
ap.add_argument("--out", default="full.png")
ap.add_argument("--pattern", default="frame_[0-9]*")
ap.add_argument("--margin", type=int, default=2, help="タイルのふちの何画素を捨てるか（border の丸め）")
a = ap.parse_args()
L = json.load(open(a.layout))
W, H = L["width"], L["height"]
ov = max(1, L["overlap"])


def find(tile, ext):
    fs = sorted(f for f in glob.glob(os.path.join(a.dest, tile["name"], "out", a.pattern + ext)) if "_geo" not in f)
    return fs[0] if fs else None


def weight(t):
    """タイルの重み（W×H）：中は 1、ふちは外へ向かって 0 に落ちる。ただし絵のふちは落とさない。"""
    x0, y0, x1, y1 = t["x0"], t["y0"], t["x1"], t["y1"]
    xs = np.arange(W, dtype=np.float64) + 0.5
    ys = np.arange(H, dtype=np.float64) + 0.5
    def ramp(v, lo, hi, edge_lo, edge_hi):
        r = np.ones_like(v)
        m = a.margin
        if not edge_lo:
            r = np.minimum(r, np.clip((v - lo - m) / ov, 0, 1))
        if not edge_hi:
            r = np.minimum(r, np.clip((hi - m - v) / ov, 0, 1))
        r[(v < lo) | (v > hi)] = 0
        return r
    wx = ramp(xs, x0, x1, x0 == 0, x1 == W)
    wy = ramp(ys, y0, y1, y0 == 0, y1 == H)
    return wy[:, None] * wx[None, :]


def paste(kind, load):
    acc = norm = None
    n = 0
    for t in L["tiles"]:
        f = find(t, kind)
        if not f:
            print(f"無いタイル: {t['name']} ({kind})", file=sys.stderr)
            continue
        img = load(f).astype(np.float32)
        if img.shape[:2] != (H, W):
            sys.exit(f"{f} の大きさ {img.shape[:2]} が layout の {(H, W)} と違います")
        w = weight(t).astype(np.float32)[:, :, None]
        if acc is None:
            acc, norm = np.zeros_like(img), np.zeros((H, W, 1), np.float32)
        acc += img * w
        norm += w
        n += 1
    if acc is None:
        return None, 0
    hole = norm[:, :, 0] <= 1e-6
    out = acc / np.maximum(norm, 1e-6)
    if hole.any():
        print(f"穴（どのタイルにも無い画素）{int(hole.sum())} 個", file=sys.stderr)
    return out, n


png, n = paste(".png", lambda f: np.asarray(Image.open(f).convert("RGB")))
if png is not None:
    Image.fromarray(np.clip(png + 0.5, 0, 255).astype(np.uint8)).save(a.out)
    print(f"{a.out}: {n}/{len(L['tiles'])} タイル")
else:
    print("PNG のタイルが 1 つもありません", file=sys.stderr)


def load_exr(f):
    import OpenEXR
    with OpenEXR.File(f) as ex:
        ch = ex.channels()
        key = "RGBA" if "RGBA" in ch else ("RGB" if "RGB" in ch else next(iter(ch)))
        return np.asarray(ch[key].pixels)[:, :, :3]


if any(find(t, ".exr") for t in L["tiles"]):
    try:
        exr, n2 = paste(".exr", load_exr)
        import OpenEXR
        out = os.path.splitext(a.out)[0] + ".exr"
        OpenEXR.File({"compression": OpenEXR.ZIP_COMPRESSION}, {"RGB": exr.astype(np.float32)}).write(out)
        print(f"{out}: {n2} タイル")
    except ImportError:
        print("OpenEXR が無いので EXR は貼りません", file=sys.stderr)
