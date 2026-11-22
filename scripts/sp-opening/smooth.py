#!/usr/bin/env python3
"""雲の中を昇る間（0〜2.5 秒）のちらつきを、前後のコマを混ぜてなめらかにする（集めた 225 コマに、動画にする前にかける）。

  python3 smooth.py <入る PNG の場所> <出す PNG の場所>

雲の中は最も速いとき 1 コマに約 10m 昇るので、十数 m〜百 m の雲のかたまり・すき間から差し込む光の筋・透ける富士の影が、
1 コマごとに現れたり消えたりする（描いた 225 コマで、帯の中の明るさが 1 コマで 8〜17% 変わる所があった）。動画で見ると
ちらついて見えるので、長めのシャッターで撮ったのと同じように、前後のコマを光の量のまま（線形）重みをつけて混ぜる。
- 混ぜる幅（ガウスの σ）：雲の中（〜2.0 秒）は 2.5 コマ。2.0〜2.47 秒でだんだん 0 へ（雲海を抜ける 2.5 秒からは混ぜない。くっきり抜ける）
- 混ぜる相手は、混ぜる区間の中のコマだけ（抜けたあとのコマは混ぜない）
- 雲海の頭を抜ける瞬間（2.60→2.63 秒）は、描いた絵では 1 コマで金のもやから澄んだ景色へ切り替わる（雲の面の厚みが数 m で、
  1 コマに約 3m 昇るため）。本物では最後の薄いもやが数コマかけて晴れるので、抜けた直後の 3 コマに、直前のもやを大きくぼかした
  ものを 6 割・3.5 割・1.5 割かぶせる（形のある物は重ねないので、二重には見えない）
- ごく弱い揺らぎ（ディザ）を足して、なめらかな所に段が出ないようにする
"""

from __future__ import annotations

import math
import os
import sys

import numpy as np
from PIL import Image

N = 225
FULL_TO = 60  # ここまでは σ = SIGMA
ZERO_AT = 74  # ここで σ = 0（2.47 秒。雲海を抜けるのは 2.5〜2.6 秒）
SIGMA = 2.5
EXIT = 79  # 雲海の頭を抜けて、澄んだ最初のコマ
EXIT_VEIL = (0.6, 0.35, 0.15)  # 抜けた直後の 3 コマにかぶせる、直前のもやの濃さ


def sigma(i: int) -> float:
    if i <= FULL_TO:
        return SIGMA
    if i >= ZERO_AT:
        return 0.0
    return SIGMA * (ZERO_AT - i) / (ZERO_AT - FULL_TO)


def to_lin(a: np.ndarray) -> np.ndarray:
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def to_srgb(a: np.ndarray) -> np.ndarray:
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    cache: dict[int, np.ndarray] = {}

    def lin(k: int) -> np.ndarray:
        if k not in cache:
            a = np.asarray(Image.open(os.path.join(src, f"{k:04d}.png")).convert("RGB"), np.float32) / 255.0
            cache[k] = to_lin(a)
        return cache[k]

    rng = np.random.default_rng(3)
    for i in range(N):
        out = os.path.join(dst, f"{i:04d}.png")
        s = sigma(i)
        if EXIT <= i < EXIT + len(EXIT_VEIL):
            from scipy import ndimage

            veil = ndimage.gaussian_filter(lin(EXIT - 1), sigma=(40, 40, 0))
            a = EXIT_VEIL[i - EXIT]
            acc = lin(i) * (1 - a) + veil * a
            v = to_srgb(acc) + (rng.random(acc.shape[:2], dtype=np.float32)[..., None] - 0.5) / 255.0
            Image.fromarray((np.clip(v, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out, compress_level=1)
            continue
        if s <= 0.05:
            Image.open(os.path.join(src, f"{i:04d}.png")).convert("RGB").save(out, compress_level=1)
            continue
        r = int(math.ceil(2.5 * s))
        ks = [k for k in range(i - r, i + r + 1) if 0 <= k < ZERO_AT]
        w = np.array([math.exp(-0.5 * ((k - i) / s) ** 2) for k in ks], np.float32)
        w /= w.sum()
        acc = np.zeros_like(lin(i))
        for wk, k in zip(w, ks):
            acc += wk * lin(k)
        v = to_srgb(acc) + (rng.random(acc.shape[:2], dtype=np.float32)[..., None] - 0.5) / 255.0
        Image.fromarray((np.clip(v, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out, compress_level=1)
        for k in list(cache):
            if k < i - r and k != EXIT - 1:
                del cache[k]
        if i % 15 == 0:
            print(f"コマ {i}（σ {s:.2f}・{len(ks)} コマを混ぜた）", flush=True)
    print("なめらかにした：終わり", flush=True)


if __name__ == "__main__":
    main()
