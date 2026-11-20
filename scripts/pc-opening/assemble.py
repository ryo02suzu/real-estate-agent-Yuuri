#!/usr/bin/env python3
"""描いたコマを1本の動画にする（PC のオープニング CG）。

  python3 assemble.py [animatic] [--labels] [--logo ロゴの画像]

work/<名前>/{global,local,top}/<コマ番号>.png を、つなぎ目（雲の中）で切り替えながら並べ、雲の中の白さを足して、
work/<名前>.mp4（H.264）にする。--labels は、下書きを見て話すための秒と場面の名前を左下に入れる。
--logo は、アプリが動画の上に重ねる予定のロゴを、下書きの中で仮に重ねてみる（本番の動画には入れない）。
必要なもの：Python 3・numpy・Pillow・FFmpeg
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import path as P

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
CLOUD = np.array([246.0, 248.0, 251.0])  # 雲の中の白
FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

# 場面の名前（下書きの左下に出す）
BEATS = [
    (0.0, "夜明けの海"),
    (0.6, "列島が海から現れる"),
    (3.6, "列島を見渡して、北アルプスへ"),
    (5.1, "雲を抜ける"),
    (5.95, "穂高の稜線をかすめ、岳沢を降りる"),
    (7.0, "上高地の谷底（森と梓川）"),
    (8.6, "東の稜線より高く上がる"),
    (10.3, "雲海と朝日・ロゴ"),
    (12.35, "真上から見た日本 → PC のホームの地図へ"),
]
# ロゴ（仮）：朝日が見えてから出し、光の点を朝日に重ねる。最後は左上（ヘッダーの位置）へ
LOGO_IN = (10.4, 11.3)
LOGO_TO_HEADER = (12.2, 13.3)
LOGO_FLARE = (0.6358, 0.2734)  # ロゴの画像の中の光の点（幅・高さに対する割合）
LOGO_WIDTH = 0.40  # 画面の幅に対するロゴの幅
HEADER = (0.018, 0.022, 0.085)  # ヘッダーのロゴの左・上（画面の幅・高さに対する割合）と幅


def sun_on_screen(f: int, W: int, H: int) -> tuple[float, float] | None:
    """上高地の場面のコマ f で、朝日が画面のどこに映るか（画素）。後ろにあれば None"""
    c = P.camera("local", f)
    s = P.sun_dir("local")
    x, y, z = float(np.dot(s, c["right"])), float(np.dot(s, c["up"])), float(np.dot(s, c["fwd"]))
    if z <= 0.05:
        return None
    k = c["focal"] / 36.0 * W
    return W / 2 + x / z * k, H / 2 - y / z * k


def ease(u: float) -> float:
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?", default="animatic")
    ap.add_argument("--labels", action="store_true")
    ap.add_argument("--logo", default="")
    ap.add_argument("--crf", type=int, default=20)
    a = ap.parse_args()
    src = os.path.join(WORK, a.name)
    tmp = os.path.join(WORK, a.name + "-frames")
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    total = int(round(P.T_END * P.FPS))
    cut1, cut2 = int(round(P.CUT_LOCAL * P.FPS)), int(round(P.CUT_TOP * P.FPS))
    logo = Image.open(a.logo).convert("RGBA") if a.logo else None
    last_logo = None
    font = None
    for f in range(total):
        t = f / P.FPS
        scene = "global" if f < cut1 else "local" if f < cut2 else "top"
        im = Image.open(os.path.join(src, scene, f"{f:04d}.png")).convert("RGB")
        W, H = im.size
        w = P.whiteness(t)
        if w > 0:
            arr = np.asarray(im, dtype=np.float64) * (1 - w) + CLOUD * w
            im = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
        if logo is not None and t >= LOGO_IN[0]:
            alpha = ease((t - LOGO_IN[0]) / (LOGO_IN[1] - LOGO_IN[0]))
            lw = LOGO_WIDTH * W
            sun = sun_on_screen(f, W, H) if scene == "local" and t < LOGO_TO_HEADER[0] else None
            if sun is not None:
                x0, y0 = sun[0] - LOGO_FLARE[0] * lw, sun[1] - LOGO_FLARE[1] * lw * logo.height / logo.width
                last_logo = (x0, y0, lw)
            x0, y0, lw0 = last_logo
            u = ease((t - LOGO_TO_HEADER[0]) / (LOGO_TO_HEADER[1] - LOGO_TO_HEADER[0]))
            x = x0 + (HEADER[0] * W - x0) * u
            y = y0 + (HEADER[1] * H - y0) * u
            lw = lw0 + (HEADER[2] * W - lw0) * u
            lh = lw * logo.height / logo.width
            lg = logo.resize((max(1, round(lw)), max(1, round(lh))), Image.LANCZOS)
            if alpha < 1:
                lg.putalpha(lg.getchannel("A").point(lambda v: round(v * alpha)))
            im.paste(lg, (round(x), round(y)), lg)
        if a.labels:
            font = font or ImageFont.truetype(FONT, max(12, H // 26))
            beat = [b for b in BEATS if b[0] <= t][-1][1]
            d = ImageDraw.Draw(im)
            text = f"{t:4.1f}秒  {beat}"
            d.rectangle((0, H - font.size - 12, d.textlength(text, font=font) + 16, H), fill=(0, 0, 0))
            d.text((8, H - font.size - 7), text, font=font, fill=(255, 255, 255))
        im.save(os.path.join(tmp, f"{f:04d}.png"))
    out = os.path.join(WORK, a.name + ".mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(P.FPS), "-i", os.path.join(tmp, "%04d.png"),
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(a.crf), "-preset", "slow", "-movflags", "+faststart", out],
        check=True,
    )
    print(out, f"{os.path.getsize(out) / 1e6:.1f}MB", f"{total} コマ")


if __name__ == "__main__":
    main()
