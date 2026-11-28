#!/usr/bin/env python3
"""世界の絵の仕上げ（numpy + Pillow）。タイルに分けて描いた絵は、つないだあとに太陽のにじみ（グレア）と粒を足す
（タイルごとにコンポジターのグレアをかけると、継ぎ目に縦の筋が出るため。タイルの描画は glare=0 で）。

  python3 world_post.py in.png out.png --marks frame_0600_marks.json [--full 3840x2160 --crop x0,y0] [--lens 35] [--glow 0.22] [--grain 1.5]

in.png が全体の絵の一部（1:1 の切り出し）なら --full で全体の大きさ、--crop で in.png の左上の全体の中での位置を渡す。
太陽の位置は marks.json の "sun"（描いた絵の大きさでの座標）。表示用の 8 ビットの絵に足すので、物理の値ではなく見た目の合わせ（EXR 用の本式は後の合成で）。
"""
import json
import math
import sys

import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
src, dst = args[0], args[1]
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float64) / 255.0
h, w, _ = im.shape
fw, fh = (int(v) for v in opts.get("full", f"{w}x{h}").split("x"))
cx, cy = (int(v) for v in opts.get("crop", "0,0").split(","))
lens = float(opts.get("lens", "35"))
sun = [m for m in json.load(open(opts["marks"])) if m["name"] == "sun"][0]
k = float(opts.get("glow", "0.22"))
grain = float(opts.get("grain", "1.5"))
fpx = lens / 36.0 * fw
yy, xx = np.mgrid[0:h, 0:w]
r = np.hypot(xx + cx - sun["x"], yy + cy - sun["y"]) / fpx
r = np.degrees(r)                                            # 太陽からの角度（度）


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


psf = 0.55 / (1.0 + (r / 0.45) ** 2) + 0.45 / (1.0 + (r / 3.2) ** 2) ** 1.15
psf *= 1.0 - smooth(r, 8.0, 18.0)                           # 15 度ほどで消える
lin = np.where(im <= 0.04045, im / 12.92, ((im + 0.055) / 1.055) ** 2.4)
lin = lin + k * psf[..., None] * np.array([1.0, 0.90, 0.74])[None, None, :]
out = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.clip(lin, 0, None) ** (1 / 2.4) - 0.055)
rs = np.random.RandomState(int(opts.get("seed", "3")))
out = out + rs.normal(0, grain / 255.0, out.shape)
Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst, quality=92) if dst.endswith(".jpg") else Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst)
print("saved", dst, "sun at", round(sun["x"]), round(sun["y"]))
