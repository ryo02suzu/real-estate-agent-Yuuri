#!/usr/bin/env python3
"""PC のオープニングの最後のコマ（atmos.py final → work/frames）を、アプリで流す動画にする。

  python3 encode.py [--src work/frames] [--out ../../public/opening] [--preview]

  - opening-av1.webm：AV1（Chrome・Edge・Firefox・新しい Safari）。小さい
  - opening.mp4：H.264（AV1 を読めないブラウザ用）。画面に出し始めるのが早いように、目次を先頭に置く
音は入れない。--preview は、間引いて描いたコマ（同じ番号が無い所は、前のコマをくり返す）で、流れを確かめる仮の動画を作る。
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import path as P  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "opening"))
COLOR = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]


def run(cmd: list[str]) -> None:
    print(" ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(WORK, "frames"))
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args()
    total = int(round(P.T_END * P.FPS))
    src = a.src
    tmp = None
    have = {int(n[:4]) for n in os.listdir(src) if n.endswith(".png")}
    missing = [f for f in range(total) if f not in have]
    if missing:
        if not a.preview:
            sys.exit(f"コマが足りません（{len(missing)} コマ。最初は {missing[0]}）。--preview で仮の動画にできます")
        tmp = tempfile.mkdtemp(prefix="opening-")
        last = None
        for f in range(total):
            if f in have:
                last = f
            if last is None:
                last = min(have)
            os.symlink(os.path.join(os.path.abspath(src), f"{last:04d}.png"), os.path.join(tmp, f"{f:04d}.png"))
        src = tmp
    os.makedirs(a.out, exist_ok=True)
    pattern = os.path.join(src, "%04d.png")
    common = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-framerate", str(P.FPS), "-i", pattern, "-an", "-pix_fmt", "yuv420p", *COLOR]
    fast = a.preview  # 仮の動画は速く作る
    run([*common, "-c:v", "libsvtav1", "-preset", "10" if fast else "4", "-crf", "33", "-g", "60", "-svtav1-params", "tune=0", os.path.join(a.out, "opening-av1.webm")])
    run([*common, "-c:v", "libx264", "-preset", "veryfast" if fast else "slow", "-crf", "21", "-profile:v", "high", "-level", "4.0", "-g", "60", "-movflags", "+faststart", "-tune", "film", os.path.join(a.out, "opening.mp4")])
    for n in ("opening-av1.webm", "opening.mp4"):
        print(n, f"{os.path.getsize(os.path.join(a.out, n)) / 1e6:.1f} MB")
    if tmp:
        shutil.rmtree(tmp)


if __name__ == "__main__":
    main()
