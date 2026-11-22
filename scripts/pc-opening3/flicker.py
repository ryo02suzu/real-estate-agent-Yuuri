#!/usr/bin/env python3
"""手分けして描いたコマの、つなぎ目のちらつきを調べる（集めたあと、動画にする前に）。

  python3 flicker.py <コマの場所（0000.png…）> [--bounds 240,248,…] [--from 0] [--to 506]

となりのコマとの差 d(i)=|f(i+1)-f(i)|（1280×720 に縮めた明るさを 40×40 の区画に分け、区画ごとの平均の上位 5%）を出し、
前後 2 つずつの d の中央値で割った比 r(i) を出す。カメラが動いていても、ふつうのコマ送りなら r はほぼ 1。描く組の境目で
木の形・向き・色が変わると、そこだけ r が跳ねる（3回目の描き分けでは、作業場の 5 コマごとに森がちらついた）。
--bounds に描く組の始まりのコマ（b）を渡すと、その境目（b-1→b）の r を並べる。4回目は 81 か所とも 0.93〜1.06 だった。
"""

from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image


def load(src: str, i: int) -> np.ndarray | None:
    p = os.path.join(src, f"{i:04d}.png")
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert("L").resize((1280, 720), Image.BILINEAR)
    return np.asarray(im, np.float32) / 255.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--bounds", default="")
    ap.add_argument("--from", dest="lo", type=int, default=0)
    ap.add_argument("--to", dest="hi", type=int, default=506)
    a = ap.parse_args()

    d: dict[int, float] = {}
    prev = load(a.src, a.lo)
    for i in range(a.lo, a.hi):
        cur = load(a.src, i + 1)
        if prev is not None and cur is not None:
            t = np.abs(cur - prev).reshape(18, 40, 32, 40).mean(axis=(1, 3)).ravel()
            d[i] = float(np.percentile(t, 95))
        prev = cur

    r: dict[int, float] = {}
    for i in sorted(d):
        nb = [d[j] for j in (i - 2, i - 1, i + 1, i + 2) if j in d]
        if len(nb) >= 2:
            r[i] = d[i] / max(1e-6, float(np.median(nb)))
    print(f"調べたつなぎ目 {len(r)}")
    print("跳ねの大きい順（i→i+1）:")
    for i in sorted(r, key=lambda k: -r[k])[:12]:
        print(f"  {i:4d}→{i + 1:<4d} r={r[i]:5.2f}")
    bounds = [int(b) for b in a.bounds.split(",") if b.strip()]
    got = [r[b - 1] for b in bounds if b - 1 in r]
    if got:
        print(f"描く組の境目 {len(got)} か所：r の最小 {min(got):.2f}・最大 {max(got):.2f}（1.15 を超える所 {sum(x > 1.15 for x in got)}）")
        for b in bounds:
            if b - 1 in r and r[b - 1] > 1.15:
                print(f"  ちらつきの疑い {b - 1}→{b} r={r[b - 1]:.2f}")


if __name__ == "__main__":
    main()
