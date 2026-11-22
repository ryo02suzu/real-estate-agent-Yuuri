#!/usr/bin/env python3
"""225 コマ全部を描く（面 → 雲と空気 → 仕上げ）。区間ごとに設定を変え、描き終えたコマは描き直さない（途中から再開できる）。

  python3 run_all.py [--blender 〈bpy を入れた python〉] [--numba 〈numba を入れた python〉] [--threads 4] [--only film|clouds|post]
                    [--frames 0-11,40]   # そのコマだけ（手分けして描くとき。5.6 秒からの間引く区間 168-224 は、まとめて 1 つの組に）

区間ごとの設定（1080×2340。2 倍では描かない：動画は 1.5〜2MB に縮めるので、2 倍の細かさは残らない）：
  0.0〜2.4 秒（雲の中）    面 16 サンプル（富士は雲ごしでほとんど見えない）、雲は時間 2 分け・奥は半分の大きさ
  2.4〜3.2 秒（抜ける）     面 24 サンプル、雲は時間 2 分け
  3.2〜5.6 秒（対面）       面 24 サンプル、雲は時間を分けない（ゆっくりなので動きのぶれはほぼ無い）
  5.6〜7.5 秒（ほとんど止まる） 3 コマおきに描き、間は post.py が前後を混ぜて作る
見込み：4 コアで 約 8 時間（2026-11-21 の見た目の確認の 3 枚で測った時間から）。
面はノイズ除去をかけ、かける前の絵と 7:3 で混ぜる（post.py）。
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common as C

FILM = os.path.join(C.WORK, "film_final")
CLOUDS = os.path.join(C.WORK, "clouds_final")
FRAMES = os.path.join(C.WORK, "frames")

# (最初のコマ, 最後のコマ, 何コマおき, 面のサンプル, 雲の時間の分け, 雲の奥の大きさ)
SEGMENTS = [
    (0, 71, 1, 16, 2, 0.5),  # 雲の中：富士は雲ごし。奥のもやは半分の大きさ
    (72, 95, 1, 24, 2, 1.0),  # 雲を抜ける：速いので時間 2 分け
    (96, 167, 1, 24, 1, 1.0),  # 対面：ゆっくり押し込む（動きのぶれはほぼ無いので時間を分けない）
    (168, 224, 3, 24, 2, 1.0),  # ほとんど止まる：3 コマおき（間は post.py が混ぜる）
]


def parse_frames(spec: str) -> list[int]:
    """「0-11,40」→ [0, 1, …, 11, 40]"""
    out: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = (int(v) for v in part.split("-"))
            out += range(lo, hi + 1)
        elif part.strip():
            out.append(int(part))
    return sorted(set(out))


def frames_of(seg) -> list[int]:
    lo, hi, step = seg[:3]
    fs = list(range(lo, hi + 1, step))
    if fs[-1] != hi:
        fs.append(hi)  # 最後のコマは必ず描く（間を混ぜるため）
    return fs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--blender", default=sys.executable)
    ap.add_argument("--numba", default=sys.executable)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--only", default="")
    ap.add_argument("--frames", default="", help="描くコマ（例 0-11,40）。無ければ全部")
    a = ap.parse_args()
    want = set(parse_frames(a.frames)) if a.frames else set(range(C.N_FRAMES))
    for d in (FILM, CLOUDS, FRAMES):
        os.makedirs(d, exist_ok=True)
    t0 = time.time()
    here = C.HERE
    if a.only in ("", "film"):
        for seg in SEGMENTS:
            todo = [f for f in frames_of(seg) if f in want and not os.path.exists(os.path.join(FILM, f"{f:04d}.exr"))]
            if todo:
                subprocess.run([a.blender, "-I", "-B", os.path.join(here, "film.py"), "--frames", ",".join(map(str, todo)), "--scale", "0.5",
                                "--spp", str(seg[3]), "--threads", str(a.threads), "--denoise", "--out", FILM], check=True)
    if a.only in ("", "clouds"):
        for seg in SEGMENTS:
            for f in frames_of(seg):
                if f not in want:
                    continue
                out = os.path.join(CLOUDS, f"{f:04d}.npz")
                if not os.path.exists(out):
                    subprocess.run([a.numba, "-I", "-B", os.path.join(here, "clouds.py"), "--frame", str(f), "--scale", "0.5", "--sub", str(seg[4]),
                                    "--farscale", str(seg[5]), "--threads", str(a.threads), "--film", FILM, "--out", out], check=True)
    if a.only in ("", "post"):
        todo = [f for f in sorted(want) if not os.path.exists(os.path.join(FRAMES, f"{f:04d}.png"))]
        for i in range(0, len(todo), 15):
            subprocess.run([sys.executable, "-I", "-B", os.path.join(here, "post.py"), "--frames", ",".join(map(str, todo[i : i + 15])),
                            "--film", FILM, "--clouds", CLOUDS, "--out", FRAMES], check=True)
    print(f"全体 {(time.time() - t0) / 3600:.2f} 時間", flush=True)


if __name__ == "__main__":
    main()
