#!/usr/bin/env python3
"""第3版の場面の土地の種類（水・川原の石・岩・森）と、木を植える位置。川は river.py の川筋（航空写真から写したもの）から作る。

  python3 landcover.py      # → work/landcover/near_cover.png（R=水・G=川原の石・B=岩・A=森。near の標高の格子の範囲、2倍の細かさ）
                            #   work/terrain/near_carved.npy（川床をならした near の標高。川原は平らに、流れは少し低く）
                            #   work/landcover/trees.npz（x, y：場面の座標 m、kind：0 モミ・1 カラマツ・2 川岸の若木、size：大きさの倍率）
                            #   work/landcover/check.jpg（確かめ用）

航空写真はつぎはぎ（撮った日・向きの違う写真）で、色から水や石を分けると、つぎ目で崩れる。そこで川は、写真から目で写した
川の真ん中の線（river.py）に、川原の幅・流れの幅を、なめらかにゆらぐ幅で付けて作る。岩は急な斜面（標高から）。ほかは森。
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import geo3  # noqa: E402
import river  # noqa: E402

WORK = os.environ.get("PC_OPENING3_WORK", os.path.join(HERE, "work"))
OUT = os.path.join(WORK, "landcover")
SPACING = 4.6  # 木の間隔（m）
TREELINE = 2450.0  # これより高い所には高い木を植えない（上高地のまわりの森林限界はおよそ 2500m）
COVER_SCALE = 2  # 土地の種類の絵は、標高の格子の何倍の細かさか
ROCK_SLOPE = 50.0  # これより急な斜面は岩（木を植えない）


def smooth_noise(s: np.ndarray, period: float, seed: int) -> np.ndarray:
    """川に沿った距離 s（m）の、なめらかなゆらぎ（-1〜1）。いくつかの波の重ね合わせ"""
    rng = np.random.default_rng(seed)
    out = np.zeros_like(s)
    amp = 1.0
    total = 0.0
    for k in range(4):
        f = (2.0 ** k) / period
        out += amp * np.sin(2 * np.pi * f * s + rng.uniform(0, 2 * np.pi))
        total += amp
        amp *= 0.55
    return out / total


def pond_radius(dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
    """大正池の中心からの距離（池の縁で 1）。楕円の縁を、向きによってなめらかにゆらす"""
    ang = np.arctan2(dy, dx)
    wob = 1.0 + 0.16 * np.sin(3 * ang + 0.7) + 0.09 * np.sin(5 * ang + 2.1) + 0.05 * np.sin(9 * ang + 4.0)
    return np.hypot(dx / river.POND["rx"], dy / river.POND["ry"]) / wob


def polyline_frame(px: np.ndarray, py: np.ndarray, line: np.ndarray):
    """点（px, py）から川の真ん中の線へ：一番近い距離・その所の川に沿った距離 s・どちら側か（左が正）"""
    a = line[:-1]
    b = line[1:]
    ab = b - a
    L = np.hypot(ab[:, 0], ab[:, 1])
    s0 = np.concatenate([[0.0], np.cumsum(L)])[:-1]
    best = np.full(px.shape, np.inf)
    bs = np.zeros(px.shape)
    side = np.zeros(px.shape)
    for i in range(len(a)):
        t = ((px - a[i, 0]) * ab[i, 0] + (py - a[i, 1]) * ab[i, 1]) / (L[i] ** 2)
        t = np.clip(t, 0.0, 1.0)
        qx = a[i, 0] + t * ab[i, 0]
        qy = a[i, 1] + t * ab[i, 1]
        d = np.hypot(px - qx, py - qy)
        m = d < best
        best = np.where(m, d, best)
        bs = np.where(m, s0[i] + t * L[i], bs)
        cross = ab[i, 0] * (py - a[i, 1]) - ab[i, 1] * (px - a[i, 0])
        side = np.where(m, np.sign(cross), side)
    return best, bs, side


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    dem = np.load(os.path.join(WORK, "terrain", "near.npy")).astype(np.float64)
    with open(os.path.join(WORK, "terrain", "near.json")) as f:
        dm = json.load(f)
    line = np.array([geo3.local(*c) for c in river.CENTER], dtype=np.float64)
    # 細かく分けた川の線（なめらかに）
    seg = np.hypot(*np.diff(line, axis=0).T)
    s_pts = np.concatenate([[0.0], np.cumsum(seg)])
    ss = np.arange(0.0, s_pts[-1], 4.0)
    fine = np.stack([np.interp(ss, s_pts, line[:, 0]), np.interp(ss, s_pts, line[:, 1])], -1)
    fine = np.stack([ndimage.gaussian_filter1d(fine[:, 0], 4, mode="nearest"), ndimage.gaussian_filter1d(fine[:, 1], 4, mode="nearest")], -1)

    # ---- 標高の格子での川床（下流ほど低く、なめらか）
    x, y = geo3.grid_xy(dm, dem.shape)
    XX, YY = np.meshgrid(x, y)
    pad = 160.0
    box = (XX > fine[:, 0].min() - pad) & (XX < fine[:, 0].max() + pad) & (YY > fine[:, 1].min() - pad) & (YY < fine[:, 1].max() + pad)
    d_g, s_g, side_g = (np.full(dem.shape, np.inf), np.zeros(dem.shape), np.zeros(dem.shape))
    dd, sv, sd = polyline_frame(XX[box], YY[box], fine)
    d_g[box], s_g[box], side_g[box] = dd, sv, sd
    # 川の真ん中の線の上の標高（まわり 12m の一番低い所）を、下流ほど低くなるようにならす
    zc = geo3.sample(ndimage.minimum_filter(dem, size=7), dm, fine[:, 0], fine[:, 1])
    zc = ndimage.gaussian_filter1d(zc, 10, mode="nearest")
    zc = np.minimum.accumulate(zc[::-1])[::-1]  # 上流（s が大きい）ほど高く、下流は上流より高くならない
    zc = np.maximum.accumulate(zc)  # s が大きいほど高い
    zbed = np.interp(s_g, ss, zc)
    # 幅（川原・流れ）。大正池に近いほど広い
    wg = 17.0 + 9.0 * smooth_noise(s_g, 520.0, 1) + np.interp(s_g, [0, 150, 350], [45, 12, 0])
    off = 0.40 * wg * smooth_noise(s_g, 380.0, 2)  # 流れは川原の中を蛇行する
    ww = 6.0 + 2.5 * smooth_noise(s_g, 260.0, 3)
    signed = d_g * side_g
    in_bed = d_g < wg
    in_water = np.abs(signed - off) < ww
    bank = np.clip((d_g - wg) / 22.0, 0.0, 1.0)  # 川原の外 22m で元の地面へ
    bump = 0.35 * ndimage.gaussian_filter(np.random.default_rng(5).normal(0, 1, dem.shape), 2.0)
    carved = dem.copy()
    zband = np.where(in_water, zbed - 0.6, zbed + 0.25 + np.maximum(bump, -0.2))
    zband = ndimage.gaussian_filter(zband, 1.3)  # 流れと川原の境目の段差を、なだらかな水際に
    near_bank = d_g < wg + 22.0
    carved[near_bank] = zband[near_bank] * (1 - bank[near_bank]) + dem[near_bank] * bank[near_bank]
    # 大正池：池の水面（まわりより低く平ら）
    px_, py_ = geo3.local(river.POND["lon"], river.POND["lat"])
    pond_r = pond_radius(XX - px_, YY - py_)
    pond = pond_r < 1.0
    zpond = float(zc[0]) - 0.8
    pb = np.clip((pond_r - 1.0) / 0.25, 0, 1)
    carved = np.where(pond_r < 1.25, np.minimum(carved, zpond * (1 - pb) + carved * pb), carved)
    np.save(os.path.join(WORK, "terrain", "near_carved.npy"), carved.astype(np.float32))
    # 水面の高さ（流れと池の所。まわり 1 画素も含める）。ほかは NaN
    level = np.where(in_bed | in_water | (pond_r < 1.0), np.where(pond_r < 1.0, zpond + 0.45, zbed - 0.15), np.nan)
    grow = ndimage.binary_dilation(~np.isnan(level), iterations=2)
    filled = ndimage.generic_filter(np.nan_to_num(level, nan=-1e9), np.max, size=5)
    level = np.where(grow & np.isnan(level), filled, level)
    level[level < -1e8] = np.nan
    np.save(os.path.join(WORK, "terrain", "water_level.npy"), level.astype(np.float32))
    # 水深（瀬の白い波に使う）と、流れの向き（下流へ。川の真ん中の線の向きの逆。池はほとんど流れない）
    depth = np.where(np.isnan(level), 0.0, np.clip(level - carved, 0.0, 3.0))
    tx = np.gradient(fine[:, 0])
    ty = np.gradient(fine[:, 1])
    tn = np.hypot(tx, ty) + 1e-9
    fxs, fys = -tx / tn, -ty / tn  # s が増える向き（上流）の逆
    fx = np.interp(s_g, ss, fxs)
    fy = np.interp(s_g, ss, fys)
    slow = np.clip(1.0 - pond_r, 0.0, 1.0) * 0.9  # 池の中はゆっくり
    np.save(os.path.join(WORK, "terrain", "water_depth.npy"), depth.astype(np.float32))
    np.save(os.path.join(WORK, "terrain", "water_flow.npy"), np.stack([fx * (1 - slow), fy * (1 - slow)], -1).astype(np.float32))
    with open(os.path.join(WORK, "terrain", "near_carved.json"), "w") as f:
        json.dump(dict(dm, carved_from="near", river=dict(z_low=float(zc[0]), z_high=float(zc[-1]), length=float(ss[-1]))), f, indent=1)

    # ---- 土地の種類の絵（2倍の細かさ）
    H, W = dem.shape[0] * COVER_SCALE, dem.shape[1] * COVER_SCALE
    sx = (np.arange(W) + 0.5) / COVER_SCALE - 0.5
    sy = (np.arange(H) + 0.5) / COVER_SCALE - 0.5
    cx = np.interp(sx, np.arange(dem.shape[1]), x)
    cy = np.interp(sy, np.arange(dem.shape[0]), y)
    CX, CY = np.meshgrid(cx, cy)
    cbox = (CX > fine[:, 0].min() - pad) & (CX < fine[:, 0].max() + pad) & (CY > fine[:, 1].min() - pad) & (CY < fine[:, 1].max() + pad)
    d_c = np.full((H, W), np.inf)
    s_c = np.zeros((H, W))
    side_c = np.zeros((H, W))
    dd, sv, sd = polyline_frame(CX[cbox], CY[cbox], fine)
    d_c[cbox], s_c[cbox], side_c[cbox] = dd, sv, sd
    wg_c = 17.0 + 9.0 * smooth_noise(s_c, 520.0, 1) + np.interp(s_c, [0, 150, 350], [45, 12, 0])
    off_c = 0.40 * wg_c * smooth_noise(s_c, 380.0, 2)
    ww_c = 6.0 + 2.5 * smooth_noise(s_c, 260.0, 3)
    water_c = (np.abs(d_c * side_c - off_c) < ww_c) & (d_c < wg_c)
    pond_c = pond_radius(CX - px_, CY - py_) < 1.0
    water_c |= pond_c
    gravel_c = (d_c < wg_c) & ~water_c
    z_c = ndimage.zoom(carved, COVER_SCALE, order=1)
    gy, gx = np.gradient(z_c, 3.85 / COVER_SCALE)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    rock_c = ((slope > ROCK_SLOPE) | (z_c > 2520)) & ~water_c & ~gravel_c
    forest_c = ~water_c & ~gravel_c & ~rock_c & (z_c < TREELINE + 120)

    def soft(m, s=0.8):
        return ndimage.gaussian_filter(m.astype(np.float32), s)

    cover = np.dstack([soft(water_c), soft(gravel_c), soft(rock_c, 1.5), soft(forest_c, 1.5)])
    # 濡れ（水際から 6m で乾く）
    wetd = ndimage.distance_transform_edt(~water_c) * (3.85 / COVER_SCALE)
    Image.fromarray((np.clip(1.0 - wetd / 6.0, 0, 1) * 255 + 0.5).astype(np.uint8), "L").save(os.path.join(OUT, "near_wet.png"))
    Image.fromarray((np.clip(cover, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(OUT, "near_cover.png"))
    chk = np.zeros((H, W, 3), np.float32)
    chk[forest_c] = [0.12, 0.30, 0.12]
    chk[rock_c] = [0.55, 0.5, 0.5]
    chk[gravel_c] = [0.9, 0.88, 0.8]
    chk[water_c] = [0.1, 0.4, 0.9]
    Image.fromarray((chk * 255).astype(np.uint8)).resize((W // 2, H // 2)).save(os.path.join(OUT, "check.jpg"), quality=88)
    print(f"水 {water_c.mean() * 100:.2f}%・川原 {gravel_c.mean() * 100:.2f}%・岩 {rock_c.mean() * 100:.1f}%・森 {forest_c.mean() * 100:.1f}%", flush=True)

    # ---- 木の位置：少しずらした格子。森の所だけ（川原・水・岩・高すぎる所は除く。川原の縁から 2m あける）
    rng = np.random.default_rng(3)
    gxs = np.arange(x.min(), x.max(), SPACING)
    gys = np.arange(y.min(), y.max(), SPACING)
    PX, PY = np.meshgrid(gxs, gys)
    PX = (PX + rng.uniform(-0.45, 0.45, PX.shape) * SPACING).ravel()
    PY = (PY + rng.uniform(-0.45, 0.45, PY.shape) * SPACING).ravel()
    ci = np.clip(np.round((y.max() - PY) / (y.max() - y.min()) * (H - 1)).astype(int), 0, H - 1)
    cj = np.clip(np.round((PX - x.min()) / (x.max() - x.min()) * (W - 1)).astype(int), 0, W - 1)
    margin = ndimage.binary_dilation(water_c | gravel_c, iterations=1)
    ok = forest_c[ci, cj] & ~margin[ci, cj]
    zz = z_c[ci, cj]
    keep = ok & (rng.uniform(0, 1, len(PX)) < 0.93)
    near_line = np.clip((zz - (TREELINE - 400)) / 400, 0, 1)
    keep &= rng.uniform(0, 1, len(PX)) > near_line * 0.6
    PX, PY, zz, near_line = PX[keep], PY[keep], zz[keep], near_line[keep]
    p_larch = np.interp(zz, [1480, 1650, 2000], [0.50, 0.32, 0.08])
    kind = (rng.uniform(0, 1, len(PX)) < p_larch).astype(np.int8)
    size = rng.uniform(0.78, 1.25, len(PX)) * (1.0 - 0.35 * near_line)
    # 川岸の茂み（若木。川原の縁から外へ 0〜14m）：kind 2
    edge = ndimage.distance_transform_edt(~(water_c | gravel_c)) * (3.85 / COVER_SCALE)
    bx, by = np.meshgrid(np.arange(x.min(), x.max(), 2.2), np.arange(y.min(), y.max(), 2.2))
    bx = (bx + rng.uniform(-0.45, 0.45, bx.shape) * 2.2).ravel()
    by = (by + rng.uniform(-0.45, 0.45, by.shape) * 2.2).ravel()
    bi = np.clip(np.round((y.max() - by) / (y.max() - y.min()) * (H - 1)).astype(int), 0, H - 1)
    bj = np.clip(np.round((bx - x.min()) / (x.max() - x.min()) * (W - 1)).astype(int), 0, W - 1)
    e = edge[bi, bj]
    bk = (e > 1.0) & (e < 14.0) & forest_c[bi, bj] & (rng.uniform(0, 1, len(bx)) < np.interp(e, [1, 4, 14], [0.9, 0.8, 0.25]))
    bx, by = bx[bk], by[bk]
    PX = np.concatenate([PX, bx])
    PY = np.concatenate([PY, by])
    kind = np.concatenate([kind, np.full(len(bx), 2, np.int8)])
    size = np.concatenate([size, rng.uniform(0.55, 1.15, len(bx))])
    np.savez_compressed(os.path.join(OUT, "trees.npz"), x=PX.astype(np.float32), y=PY.astype(np.float32), kind=kind, size=size.astype(np.float32))
    # 川原の石と流木（3m おきの格子から、まばらに。水際に多い）：kind 0〜13 は石（rock_moss_set・boulder）、14・15 は流木
    rx, ry = np.meshgrid(np.arange(x.min(), x.max(), 3.0), np.arange(y.min(), y.max(), 3.0))
    rx = (rx + rng.uniform(-0.5, 0.5, rx.shape) * 3.0).ravel()
    ry = (ry + rng.uniform(-0.5, 0.5, ry.shape) * 3.0).ravel()
    ri = np.clip(np.round((y.max() - ry) / (y.max() - y.min()) * (H - 1)).astype(int), 0, H - 1)
    rj = np.clip(np.round((rx - x.min()) / (x.max() - x.min()) * (W - 1)).astype(int), 0, W - 1)
    wet = ndimage.distance_transform_edt(~water_c) * (3.85 / COVER_SCALE)  # 水からの距離（m）
    g = gravel_c[ri, rj]
    p_rock = np.where(g, np.interp(wet[ri, rj], [0, 3, 12], [0.55, 0.30, 0.12]), 0.0)
    rk = rng.uniform(0, 1, len(rx)) < p_rock
    rx, ry = rx[rk], ry[rk]
    rkind = rng.integers(0, 14, len(rx)).astype(np.int8)
    drift = rng.uniform(0, 1, len(rx)) < 0.04
    rkind[drift] = 14 + rng.integers(0, 2, int(drift.sum()))
    rsize = np.where(drift, rng.uniform(0.8, 1.4, len(rx)), rng.uniform(0.18, 0.75, len(rx)) ** 1.3)
    np.savez_compressed(os.path.join(OUT, "rocks.npz"), x=rx.astype(np.float32), y=ry.astype(np.float32), kind=rkind, size=rsize.astype(np.float32))
    print(f"川原の石 {int((~drift).sum())}・流木 {int(drift.sum())}", flush=True)
    print(f"木 {len(PX)} 本（カラマツ {int(kind.sum())}）。川床 {zc[0]:.1f}〜{zc[-1]:.1f}m（長さ {ss[-1]:.0f}m）", flush=True)


if __name__ == "__main__":
    main()
