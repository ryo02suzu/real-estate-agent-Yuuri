#!/usr/bin/env python3
"""オープニング第3版の最後の色の仕上げ（集めた 507 コマ全部に、同じだけかける）。

  python3 grade3.py <入る PNG の場所> <出す PNG の場所> [--frames 0-506] [--sheet 見本.jpg]

post3.py の仕上げ（AgX・かすみ・朝もや）のままだと、黒が持ち上がって（いちばん暗い 1% でも明るさ 0.14〜0.18）、
全体が白っぽく平たく見えた。手分けして描いたコマ（作業場と GitHub Actions）を同じにそろえるため、描き直さずに、
集めたあとの絵にかける：
- 黒を締める（明るさ 0.07 → 0）・白をすこし広げる（0.93 → 1。明るい雲は肩をなだらかに丸めて、白く飛ばさない）
- ごく弱い S 字（明暗の差）・彩度を少し（1.06 倍）
- 最後の白い雲（post3.py の end_white と同じ 19.6〜21.1 秒）に合わせて、かけ具合を 0 へ戻す
  （最後のコマは、アプリの白 #f3f1ec のまま）
- 1/255 のごく弱い揺らぎ（ディザ）を足して、空のなめらかな所に段が出ないようにする
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image

FPS = 24
BLACK = 0.07
WHITE = 0.93
KNEE = 0.88  # ここから上は、なだらかに 1 へ近づける（白く飛ばさない）
S_CURVE = 0.06
SAT = 1.06
END_WHITE = (19.6, 21.1)  # post3.py の LOOK["end_white"] と同じ
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def smoothstep(a: float, b: float, x: float) -> float:
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)


def grade(a: np.ndarray) -> np.ndarray:
    """a：0〜1 の RGB（表示の色。AgX のあと）"""
    y = (a - BLACK) / (WHITE - BLACK)
    hi = y > KNEE
    y = np.where(hi, KNEE + (1 - KNEE) * np.tanh((y - KNEE) / (1 - KNEE)), y)
    y = np.clip(y, 0.0, 1.0)
    y = y + S_CURVE * np.sin((y - 0.5) * np.pi) * 0.5
    lum = (y @ LUMA)[..., None]
    y = lum + (y - lum) * SAT
    return np.clip(y, 0.0, 1.0)


def strength(frame: int) -> float:
    return 1.0 - smoothstep(*END_WHITE, frame / FPS)


def frames_arg(s: str) -> list[int]:
    out: list[int] = []
    for part in s.split(","):
        if "-" in part:
            a, b = (int(v) for v in part.split("-"))
            out += range(a, b + 1)
        elif part.strip():
            out.append(int(part))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--frames", default="0-506")
    args = ap.parse_args()
    os.makedirs(args.dst, exist_ok=True)
    rng = np.random.default_rng(5)
    for f in frames_arg(args.frames):
        src = os.path.join(args.src, f"{f:04d}.png")
        dst = os.path.join(args.dst, f"{f:04d}.png")
        if os.path.exists(dst):
            continue
        a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255.0
        g = strength(f)
        if g > 0:
            a = a + g * (grade(a) - a)
            a = a + (rng.random(a.shape[:2], dtype=np.float32)[..., None] - rng.random(a.shape[:2], dtype=np.float32)[..., None]) / 255.0 * g
        Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst, compress_level=1)
        if f % 50 == 0:
            print(f"コマ {f}（かけ具合 {g:.2f}）", flush=True)
    print("色の仕上げ：終わり", file=sys.stderr)


if __name__ == "__main__":
    main()
