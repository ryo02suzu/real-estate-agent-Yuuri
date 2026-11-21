#!/usr/bin/env python3
"""上高地のまわりの航空写真（photo.py で色の偏りを均したもの）から、晩秋の朝の地面の色を作る。

航空写真は、撮った日・時刻の違う写真のつぎはぎで、影（山の影・雲の影）も写っている。そのまま貼ると、
こちらで当てる朝日の影と食い違い、継ぎ目も見える。そこで写真は「何がある所か（森・岩・川原・草地）」と
「細かい模様（木の一本ずつ・岩の凹凸。約 60m より細かい濃淡）」だけに使い、色そのものは晩秋の色で塗り直す。
写真の影で暗い所は、標高と傾き（fetch.py の near、約 7.7m ごと）から決める。

本物の11月上旬の上高地に合わせる：
  - 谷と低い斜面（海抜 1500〜1900m あたり）の落葉樹は、カラマツの金色と、葉を落とした木の灰色がかった茶
  - 針葉樹・ハイマツは、暗く青みのある緑
  - 開けた草地は枯れ草の色、川原は白っぽい灰色、岩は灰色
  - 海抜 2600m あたりより上の、急すぎない所に初雪（急な岩壁には積もらない。細かい凹凸に沿って筋になる）

  python3 autumn.py   # work/near_photo_fix.jpg → work/near_photo_autumn.jpg（と、森の割合 work/near_forest.png）
"""

from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from geo import TILE, bilinear  # noqa: E402
from photo import to_linear, to_srgb  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
Image.MAX_IMAGE_PIXELS = None

# 色（線形の反射の強さ）
CONIFER = (0.040, 0.056, 0.042)  # 針葉樹（暗く青みのある緑）
PINE = (0.034, 0.048, 0.036)  # ハイマツ
LARCH = (0.30, 0.185, 0.050)  # カラマツの金
LARCH2 = (0.25, 0.135, 0.040)  # 少し赤みのある金
BARE = (0.090, 0.078, 0.072)  # 葉を落とした木（灰色がかった茶）
RUST = (0.15, 0.085, 0.052)  # 高い所の落葉低木（赤茶）
STRAW = (0.24, 0.185, 0.110)  # 枯れ草
ROCK = (0.20, 0.19, 0.18)  # 岩（灰色）
GRAVEL = (0.21, 0.20, 0.185)  # 川原（白っぽい灰色の石）
SNOW = (0.80, 0.81, 0.84)
# 雪の線（海抜 m）。この間で増える（ゆらぎで上下に ±120m）
SNOW_LINE = (2650.0, 2850.0)


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def noise(shape: tuple[int, int], scale_px: float, seed: int) -> np.ndarray:
    """なめらかなゆらぎ（平均 0・ばらつき 1）。scale_px は模様の大きさ（画素）"""
    rng = np.random.default_rng(seed)
    h, w = shape
    gh, gw = max(2, int(h / scale_px) + 3), max(2, int(w / scale_px) + 3)
    g = rng.standard_normal((gh, gw)).astype(np.float32)
    im = Image.fromarray(g, mode="F").resize((int((gw - 1) * scale_px), int((gh - 1) * scale_px)), Image.BICUBIC)
    a = np.asarray(im, dtype=np.float32)[:h, :w]
    return (a - a.mean()) / max(1e-6, float(a.std()))


def fbm(shape, scale_px: float, seed: int, octaves: int = 4) -> np.ndarray:
    out = np.zeros(shape, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        out += amp * noise(shape, scale_px / (2**o), seed + o)
        tot += amp
        amp *= 0.5
    return out / tot


def box_blur(a: np.ndarray, s: int) -> np.ndarray:
    """まわり（s 画素）の平均（小さくして戻す）"""
    h, w = a.shape
    small = Image.fromarray(a.astype(np.float32), mode="F").resize((max(1, w // s), max(1, h // s)), Image.BOX)
    return np.asarray(small.resize((w, h), Image.BILINEAR), dtype=np.float32)


def col(c) -> np.ndarray:
    return np.array(c, np.float32)


def main() -> None:
    with open(os.path.join(WORK, "near_photo.json")) as f:
        pm = json.load(f)
    with open(os.path.join(WORK, "near.json")) as f:
        dm = json.load(f)
    dem = np.load(os.path.join(WORK, "near.npy")).astype(np.float32)
    im = np.asarray(Image.open(os.path.join(WORK, "near_photo_fix.jpg")).convert("RGB"), dtype=np.float32) / 255.0
    H, W = im.shape[:2]
    # 写真の画素 → 標高の格子の位置（ズームの違いをそろえる）
    k = 2.0 ** (dm["z"] - pm["z"])
    fy = (pm["y0"] * TILE + np.arange(H) + 0.5) * k - dm["y0"] * TILE - 0.5
    fx = (pm["x0"] * TILE + np.arange(W) + 0.5) * k - dm["x0"] * TILE - 0.5
    FY, FX = np.meshgrid(fy, fx, indexing="ij")
    elev = bilinear(dem, FY, FX).astype(np.float32)
    lat_c = (dm["bbox"][1] + dm["bbox"][3]) / 2.0
    px_m = 156543.03392 / (2 ** dm["z"]) * math.cos(math.radians(lat_c))
    gy, gx = np.gradient(dem, px_m)
    slope = bilinear(np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32), FY, FX).astype(np.float32)
    del FY, FX, gx, gy

    lin = to_linear(im)
    R, G, B = lin[..., 0], lin[..., 1], lin[..., 2]
    lum = 0.2126 * R + 0.7152 * G + 0.0722 * B
    mx = np.maximum(np.maximum(R, G), B)
    sat = (mx - np.minimum(np.minimum(R, G), B)) / np.maximum(mx, 1e-4)
    green = np.clip((G - np.maximum(R, B)) / np.maximum(G, 1e-4) * 3.5, 0.0, 1.0)
    l60 = box_blur(lum, 16)  # 約 60m
    l250 = box_blur(lum, 64)  # 約 250m
    rel = np.clip(lum / np.maximum(l60, 1e-4), 0.45, 1.7)  # 細かい模様（木の一本ずつ・岩）
    rel_mid = np.clip(l60 / np.maximum(l250, 1e-4), 0.5, 1.6)  # 林の中の明るい所・暗い所
    # 写真の影（まわりよりずっと暗く、色の分からない所）。そこは標高と傾きで決める
    shade = np.maximum(1.0 - smoothstep(0.018, 0.045, l60), 1.0 - smoothstep(0.35, 0.7, l60 / np.maximum(l250, 1e-4)))

    n_stand = fbm((H, W), 40.0, 11)  # 約 150m の林のまとまり
    n_crown = fbm((H, W), 3.0, 21, 2)  # 木の一本ずつ
    n_snow = fbm((H, W), 50.0, 31)
    n_snow2 = fbm((H, W), 6.0, 41, 3)

    # 高さの帯
    low = 1.0 - smoothstep(1850.0, 2150.0, elev)  # 谷と低い斜面
    subalp = smoothstep(2050.0, 2300.0, elev) * (1.0 - smoothstep(2450.0, 2650.0, elev))
    alp = smoothstep(2350.0, 2550.0, elev)
    steep = smoothstep(50.0, 64.0, slope)

    # 岩：急な所・高い所（ハイマツの無い所）、写真で白っぽく色の無い所（崩れた斜面・岩屑）。
    # 写真の色は継ぎ目ごとに青み・緑みがばらつくので、森か岩かは、まず標高と傾きで決める
    plant = green * (1.0 - shade)
    pine = alp * smoothstep(0.15, 0.45, plant) * (1.0 - smoothstep(0.09, 0.16, l60))  # 高い所の暗い緑＝ハイマツ
    scar = (1.0 - green) * smoothstep(0.16, 0.26, l60) * (1.0 - smoothstep(0.12, 0.28, sat)) * (1.0 - shade)
    gravel = scar * (1.0 - smoothstep(1700.0, 1900.0, elev))
    rock = np.maximum(np.maximum(steep, smoothstep(2450.0, 2750.0, elev) * (1.0 - pine)), scar * (1.0 - gravel))
    rock = np.clip(rock, 0.0, 1.0)
    veg = np.clip(1.0 - rock - gravel, 0.0, 1.0)
    # 植物の中身：落葉樹の割合は林のまとまりごとに変え、写真で明るい所を少し多く
    brightp = smoothstep(0.92, 1.18, rel_mid)
    decid = np.clip(0.42 + 0.32 * n_stand + 0.3 * (brightp - 0.5) * (1.0 - shade), 0.0, 1.0) * (1.0 - alp)
    larch_share = np.clip(0.75 * low * smoothstep(-0.6, 0.4, n_stand + 0.2), 0.0, 1.0)
    c_con = col(CONIFER) * (1.0 - alp[..., None]) + col(PINE) * alp[..., None]
    pick = smoothstep(-0.2, 0.5, n_crown)[..., None]
    c_larch = col(LARCH) * (1 - pick) + col(LARCH2) * pick
    c_dec = c_larch * larch_share[..., None] + col(BARE) * (1.0 - larch_share[..., None])
    c_dec = c_dec * (1.0 - subalp[..., None]) + col(RUST) * subalp[..., None]
    c_veg = c_con * (1.0 - decid[..., None]) + c_dec * decid[..., None]
    # 開けた草地（明るく黄みの緑・平ら・低い所）
    meadow = green * smoothstep(0.16, 0.26, l60) * (1.0 - smoothstep(6.0, 16.0, slope)) * low * (1.0 - shade)
    c_veg = c_veg * (1.0 - meadow[..., None]) + col(STRAW) * meadow[..., None]
    out = c_veg * veg[..., None] + col(ROCK) * rock[..., None] + col(GRAVEL) * gravel[..., None]
    # 細かい模様をのせる（写真の濃淡。影の中は弱く）
    texture = rel ** (1.0 - 0.5 * shade)
    out *= texture[..., None]

    # 初雪：標高・ゆらぎ。急な所（38°〜）には積もらず、細かい凹凸に沿って筋になる。ハイマツの上はまだら
    line = smoothstep(SNOW_LINE[0], SNOW_LINE[1], elev + 120.0 * n_snow)
    hold = 1.0 - smoothstep(30.0, 46.0, slope + 6.0 * n_snow2)
    snow = line * hold * (1.0 - 0.45 * veg * smoothstep(-0.2, 0.6, n_snow2))
    snow = np.clip(snow, 0.0, 1.0)[..., None]
    out = out * (1 - snow) + col(SNOW) * np.clip(0.88 + 0.12 * rel, 0.75, 1.05)[..., None] * snow

    res = (to_srgb(out) * 255.0 + 0.5).astype(np.uint8)
    Image.fromarray(res).save(os.path.join(WORK, "near_photo_autumn.jpg"), quality=94)
    # 急な斜面用：真上から貼った写真は斜面で縦に引きのばされて筋になるので、急な所は色の並びだけ（ぼかした写真）を使う
    Image.fromarray(res).filter(ImageFilter.GaussianBlur(2.5)).save(os.path.join(WORK, "near_photo_autumn_soft.jpg"), quality=92)
    forest = (np.clip(veg * (1.0 - snow[..., 0]) * (1.0 - meadow), 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(forest).resize((W // 2, H // 2), Image.BOX).save(os.path.join(WORK, "near_forest.png"))
    print("near_photo_autumn.jpg", res.shape, f"雪 {float(snow.mean()):.3f}", f"落葉樹 {float((decid * veg).mean()):.3f}", f"岩 {float(rock.mean()):.3f}", f"影 {float(shade.mean()):.3f}")


if __name__ == "__main__":
    main()
