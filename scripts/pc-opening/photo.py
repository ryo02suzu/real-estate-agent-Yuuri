#!/usr/bin/env python3
"""航空写真（fetch.py の near_photo）の色の偏りを均して、地面の色に使える1枚にする。

国土地理院の全国最新写真は、撮った年・季節・時刻の違う写真をつなぎ合わせてあるので、四角や斜めの継ぎ目で
色（青っぽい・緑・暗い）が大きく変わる。そのまま貼ると地図のつぎはぎに見えるので、約 1.2km より大きな範囲の
色の偏りを、写真全体の真ん中の色にそろえる（それより細かい模様＝木・岩・沢・川原は残す）。

  python3 photo.py near_photo   # → work/near_photo_fix.jpg
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
Image.MAX_IMAGE_PIXELS = None


def to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """ガウスでぼかす（縦・横に分けて。端は端の値でのばす）"""
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, ((r, r), (r, r), (0, 0)), mode="edge")
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, p)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, p)


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else "near_photo"
    im = np.asarray(Image.open(os.path.join(WORK, f"{name}.jpg")).convert("RGB"), dtype=np.float32) / 255.0
    lin = to_linear(im)
    H, W = lin.shape[:2]
    k = 8
    small = lin[: H // k * k, : W // k * k].reshape(H // k, k, W // k, k, 3).mean(axis=(1, 3))
    # 約 1.2km（写真の 1 画素は約 3.9m。8 画素ずつまとめたので 1 画素 約 31m）
    big = blur(small, 38.0)
    ref = np.median(small.reshape(-1, 3), axis=0)
    gain_small = np.clip(ref / np.maximum(big, 1e-4), 0.35, 2.8).astype(np.float32)
    gain = np.stack(
        [np.asarray(Image.fromarray(gain_small[..., c], mode="F").resize((W, H), Image.BILINEAR)) for c in range(3)], -1
    )
    out = lin * gain
    Image.fromarray((to_srgb(out) * 255.0 + 0.5).astype(np.uint8)).save(os.path.join(WORK, f"{name}_fix.jpg"), quality=92)
    print(f"{name}_fix.jpg  真ん中の色（線形）{np.round(ref, 4)}  明るさの直しの幅 {gain_small.min():.2f}〜{gain_small.max():.2f}")


if __name__ == "__main__":
    main()
