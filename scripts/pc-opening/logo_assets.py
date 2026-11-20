#!/usr/bin/env python3
"""PC のオープニングのロゴ（金と白の新しいロゴ）を、出し方「朝日の光から生まれる」のための部品に分ける。

  python3 logo_assets.py   # assets/michilu-logo.webp → public/opening/logo/*.webp と lib/app/opening-logo.json

部品：光の点（star）・円弧（arc）・山（mountain）・文字 1 字ずつ（l0〜l6）・下の波（wave）・金の所（gold。最後に光がなでる所）。
形の情報（円弧の中心・半径など）は lib/app/opening-logo.json に書く。
形は変えない（画像を切り分けるだけ。全部を重ねると元の画像と同じになる）。どの部品も元の画像と同じ大きさ・同じ位置の
透明な画像なので、アプリは同じ場所に重ねるだけでよい。opening-logo.json には、円弧の中心・半径・光の点の角度・文字の左右の位置
（画像の幅・高さに対する割合）を書く（アプリが円弧を描く向きや、文字を出す順を決めるのに使う）。
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "assets", "michilu-logo.webp")
OUT = os.path.join(ROOT, "public", "opening", "logo")
WIDTH = 1600  # 書き出す幅（画面の幅 1920 で約 770px に出すので、2 倍の細かさの画面でもくっきり）
STAR = (1337.0, 218.0)  # 光の点（元の画像の画素）


def main() -> None:
    im = np.asarray(Image.open(SRC).convert("RGBA")).astype(np.float32) / 255.0
    H, W = im.shape[:2]
    a = im[..., 3]
    R, B = im[..., 0], im[..., 2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    star_ell = np.clip(1.0 - ((xx - STAR[0]) / 210.0) ** 2 - ((yy - STAR[1]) / 95.0) ** 2, 0, 1) ** 0.6
    # 円弧：山より上の金の画素から、円を当てはめる
    gold_px = (a > 0.35) & ((R - B) > 0.16)
    pick = gold_px & (yy < 200) & (star_ell < 0.01)
    px, py = xx[pick], yy[pick]
    A = np.stack([px, py, np.ones_like(px)], 1)
    D, E, F = np.linalg.lstsq(A, -(px**2 + py**2), rcond=None)[0]
    cx, cy = -D / 2, -E / 2
    Rr = float(np.sqrt(cx**2 + cy**2 - F))
    r = np.hypot(xx - cx, yy - cy)
    ang = np.degrees(np.arctan2(yy - cy, xx - cx))  # 右が 0°、下が +90°（画像の向き）
    band = np.clip(1.0 - (np.abs(r - Rr) - 26.0) / 8.0, 0, 1)
    band = band * np.clip((ang + 160.0) / 2.0, 0, 1) * np.clip((14.0 - ang) / 2.0, 0, 1)
    text_band = (yy >= 443) & (yy <= 608)
    goldness = np.clip(((R - B) - 0.08) / 0.08, 0, 1)
    band = np.where(text_band, band * goldness, band)
    tail = text_band & (xx >= 1375) & (xx <= 1424)  # 「I」と「L」のあいだを降りる円弧の端
    band = np.where(tail, 1.0, band)
    arc = band
    star = star_ell * (1 - band)
    mountain = (yy < 443) * (1 - band) * (1 - star_ell)
    wave = (yy > 608) * (1 - band) * (1 - star_ell)
    text = text_band * (1 - band) * (1 - star_ell)
    occ = ((a > 0.08) & text_band & (band < 0.5)).sum(0)
    letters = []
    x = 0
    while x < W:
        if occ[x] > 0:
            x0 = x
            while x < W and occ[x] > 0:
                x += 1
            if x - x0 > 8:
                letters.append((x0, x))
        x += 1
    assert len(letters) == 7, letters  # M I C H I L U
    os.makedirs(OUT, exist_ok=True)
    h = int(round(H * WIDTH / W))

    def save(name: str, mask: np.ndarray) -> None:
        part = im.copy()
        part[..., 3] = a * np.clip(mask, 0.0, 1.0)
        out = Image.fromarray((part * 255.0 + 0.5).astype(np.uint8), "RGBA").resize((WIDTH, h), Image.LANCZOS)
        out.save(os.path.join(OUT, f"{name}.webp"), quality=92, method=6)

    save("star", star)
    save("arc", arc)
    save("mountain", mountain)
    save("wave", wave)
    # 文字：となりの文字との間で分ける（ぼかした影もその文字に付ける）
    edges = [0] + [int((letters[i][1] + letters[i + 1][0]) / 2) for i in range(6)] + [W]
    for i in range(7):
        save(f"l{i}", text * ((xx >= edges[i]) & (xx < edges[i + 1])))
    # 金の所（光がなでる所）：金色で、はっきりした画素
    gold = np.clip(((R - B) - 0.1) / 0.1, 0, 1) * (a > 0.3) * (1 - text)
    save("gold", gold)
    meta = {
        "width": WIDTH,
        "height": h,
        "center": [float(cx / W), float(cy / H)],
        "radius": [float(Rr / W), float(Rr / H)],
        "starAngle": float(np.degrees(np.arctan2(STAR[1] - cy, STAR[0] - cx))),
        "arcFrom": -160.0,
        "arcTo": 14.0,
        "star": [STAR[0] / W, STAR[1] / H],
        "letters": [[x0 / W, x1 / W] for x0, x1 in letters],
        "mountain": [float(xx[(mountain > 0.5) & (a > 0.2)].min() / W), float(xx[(mountain > 0.5) & (a > 0.2)].max() / W)],
        "wave": [float(xx[(wave > 0.5) & (a > 0.2)].min() / W), float(xx[(wave > 0.5) & (a > 0.2)].max() / W)],
    }
    with open(os.path.join(ROOT, "lib", "app", "opening-logo.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(json.dumps(meta, ensure_ascii=False))
    print("部品", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
