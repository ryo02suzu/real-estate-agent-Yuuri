#!/usr/bin/env python3
"""真上から見た日本（オープニングの最後・PC のホームの背景）の、地面の色の地図を作る。

  python3 home_prep.py   # → work/home_albedo.png（色。透明度＝陸の割合）と work/home_dem.npy（標高 m）
  python3 home_prep.py --wide   # 広い版（home.py --extent）→ work/home_albedo_w.png・home_dem_w.npy と、細かい版の下地の
                                #   work/home_land_w.npy・home_sea_w.npy（混ぜる前の陸の色・海の色）

陸：日本は国土地理院 全国ランドサットモザイク画像（lndst）、まわりの国は世界衛星モザイク画像（modis）。
海：衛星画像の海（海底の地形の陰影・雲・抜け）は使わず、海の深さ（dem8）で色を決める。
標高タイルには、まわりから飛び抜けた値（例：富山の平野で 18111m）がわずかにあるので、まわりの値に置き換える。
どれも同じズーム 8 の格子（PC の地図と同じメルカトル図法）にそろえる。
"""

from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
TILE = 256
Image.MAX_IMAGE_PIXELS = None


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def fix_spikes(h: np.ndarray, limit: float = 1500.0) -> np.ndarray:
    """まわり 3×3 の真ん中の値より limit 以上高い・低い画素を、真ん中の値に置き換える"""
    p = np.pad(h, 1, mode="edge")
    stack = np.stack([p[i : i + h.shape[0], j : j + h.shape[1]] for i in range(3) for j in range(3)])
    med = np.median(stack, axis=0)
    bad = np.abs(h - med) > limit
    out = h.copy()
    out[bad] = med[bad]
    return out, int(bad.sum())


def region_mean(img: np.ndarray, mask: np.ndarray, sigma: float) -> np.ndarray:
    """mask の所だけの、なめらかな平均の色（8 画素ずつまとめてからぼかす。sigma はまとめた後の画素。元の大きさに戻す）"""
    H, W = mask.shape
    k = 8
    h8, w8 = H // k, W // k
    m = mask[: h8 * k, : w8 * k].reshape(h8, k, w8, k).mean(axis=(1, 3))
    v = (img[: h8 * k, : w8 * k] * mask[: h8 * k, : w8 * k, None]).reshape(h8, k, w8, k, 3).mean(axis=(1, 3))
    r = int(3 * sigma)
    kern = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    kern /= kern.sum()

    def blur(a):
        p = np.pad(a, [(r, r), (r, r)] + [(0, 0)] * (a.ndim - 2), mode="edge")
        p = np.apply_along_axis(lambda x: np.convolve(x, kern, mode="valid"), 0, p)
        return np.apply_along_axis(lambda x: np.convolve(x, kern, mode="valid"), 1, p)

    mean = blur(v) / np.maximum(blur(m), 1e-6)[..., None]
    out = np.stack([np.asarray(Image.fromarray(mean[..., c].astype(np.float32), mode="F").resize((W, H), Image.BILINEAR)) for c in range(3)], -1)
    return out


def smooth_noise(shape, scale: int, seed: int) -> np.ndarray:
    """なめらかなむら（0〜1）。粗い乱数を拡大する"""
    rng = np.random.default_rng(seed)
    small = rng.random((shape[0] // scale + 2, shape[1] // scale + 2)).astype(np.float32)
    im = Image.fromarray(small, mode="F").resize((shape[1], shape[0]), Image.BICUBIC)
    return np.clip(np.asarray(im), 0.0, 1.0)


def main() -> None:
    import sys

    wide = "--wide" in sys.argv[1:]  # PC のホームの背景（広い版）
    dem_name, mod_name, suffix = ("dem8w", "modisw", "_w") if wide else ("dem8", "modis", "")
    with open(os.path.join(WORK, f"{dem_name}.json")) as f:
        meta = json.load(f)
    h, n = fix_spikes(np.load(os.path.join(WORK, f"{dem_name}.npy")))
    if wide:
        # 広い版はズーム 5 の2倍で描くので、ズーム 7 の細かさ（半分）で十分。メモリも 1/4 にする
        F = 2
        H8, W8 = h.shape
        h = h[: H8 // F * F, : W8 // F * F].reshape(H8 // F, F, W8 // F, F).mean(axis=(1, 3))
        meta = dict(meta, z=meta["z"] - 1, x0=meta["x0"] / F, y0=meta["y0"] / F)
    H, W = h.shape
    np.save(os.path.join(WORK, f"home_dem{suffix}.npy"), h.astype(np.float32))
    with open(os.path.join(WORK, f"home_dem{suffix}.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"標高 {W}×{H}、飛び抜けた値を {n} 画素直した。標高 {h.min():.0f}〜{h.max():.0f}m")

    # 陸の色：ランドサット（日本）を、世界衛星モザイク（まわりの国）の上に重ねる
    with open(os.path.join(WORK, "lndst.json")) as f:
        lm = json.load(f)
    with open(os.path.join(WORK, f"{mod_name}.json")) as f:
        mm = json.load(f)
    # ランドサット（日本だけ）を、標高の格子の中の位置に置く（同じ格子なら、そのまま。広い版は半分に縮める）
    sl = 2.0 ** (meta["z"] - lm["z"])
    lim = Image.open(os.path.join(WORK, "lndst.png")).convert("RGBA")
    if sl != 1:
        lim = lim.resize((int(round(lim.width * sl)), int(round(lim.height * sl))), Image.BILINEAR)
    lsrc = np.asarray(lim, dtype=np.float32) / 255.0
    lox, loy = int(round((lm["x0"] * sl - meta["x0"]) * TILE)), int(round((lm["y0"] * sl - meta["y0"]) * TILE))
    lnd = np.zeros((H, W, 4), dtype=np.float32)
    lys, lxs = slice(max(0, loy), min(H, loy + lsrc.shape[0])), slice(max(0, lox), min(W, lox + lsrc.shape[1]))
    lnd[lys, lxs] = lsrc[lys.start - loy : lys.stop - loy, lxs.start - lox : lxs.stop - lox]
    mod_im = Image.open(os.path.join(WORK, f"{mod_name}.png")).convert("RGBA")
    sm = 2.0 ** (meta["z"] - mm["z"])  # ズーム 7 → 標高の格子（8 なら2倍、広い版の 7 ならそのまま）
    if sm != 1:
        mod_im = mod_im.resize((int(round(mod_im.width * sm)), int(round(mod_im.height * sm))), Image.BILINEAR)
    ox = int(round((mm["x0"] * sm - meta["x0"]) * TILE))
    oy = int(round((mm["y0"] * sm - meta["y0"]) * TILE))
    mod = np.zeros((H, W, 4), dtype=np.float32)
    src = np.asarray(mod_im, dtype=np.float32) / 255.0
    ys, xs = slice(max(0, oy), min(H, oy + src.shape[0])), slice(max(0, ox), min(W, ox + src.shape[1]))
    mod[ys, xs] = src[ys.start - oy : ys.stop - oy, xs.start - ox : xs.stop - ox]
    # ランドサットの画像の無い所は、透明ではなく白で塗られているので、白い所も世界衛星モザイクにする
    lnd_ok = (lnd[..., 3] > 0.5) & (lnd[..., :3].min(axis=-1) < 0.92)
    is_land = h > 0
    L = to_linear(lnd[..., :3])
    M = to_linear(mod[..., :3])
    # 日本のランドサットは青みがかっているので、約 30km より大きな範囲の色を、世界衛星モザイクの自然な色に合わせる
    # （細かい模様＝街・田畑・山の陰影はランドサットのまま）。世界衛星モザイクの継ぎ目（中国東北部の斜めの線）も、
    # 約 60km より大きな範囲の色を均して目立たなくする
    both = (lnd_ok & is_land).astype(np.float32)
    gain = np.clip(region_mean(M, both, 6.0) / np.maximum(region_mean(L, both, 6.0), 1e-4), 0.5, 2.2)
    L = L * gain
    mland = is_land.astype(np.float32)
    M = M * np.clip(region_mean(M, mland, 40.0) / np.maximum(region_mean(M, mland, 3.0), 1e-4), 0.6, 1.6)
    land_rgb = np.where(lnd_ok[..., None], L, M)

    # 海の色：深いほど濃い紺、浅い所は少し明るく（湾・瀬戸内は少し緑がかる）。なめらかなむらを少し
    depth = np.clip(-h, 0.0, None)
    t = np.clip(np.log1p(depth) / np.log1p(4000.0), 0.0, 1.0)[..., None]
    deep = to_linear(np.array([6, 18, 40]) / 255.0)
    shelf = to_linear(np.array([12, 34, 58]) / 255.0)
    shallow = to_linear(np.array([30, 66, 78]) / 255.0)
    k = np.clip(t * 1.6, 0.0, 1.0)
    sea = np.where(t < 0.62, shallow * (1 - k) + shelf * k, shelf * (1 - (t - 0.62) / 0.38) + deep * ((t - 0.62) / 0.38))
    sea = sea * (0.92 + 0.16 * smooth_noise((H, W), 64, 5)[..., None])

    # 陸の割合（海岸は 1 画素ほどでなめらかに）
    land = np.clip((h + 4.0) / 8.0, 0.0, 1.0)
    rgb = sea * (1 - land[..., None]) + land_rgb * land[..., None]
    if wide:
        # 細かい版（home_hd_prep.py）の下地：混ぜる前の陸の色と海の色（線形。大きな範囲の色合わせ済み）
        np.save(os.path.join(WORK, "home_land_w.npy"), land_rgb.astype(np.float16))
        np.save(os.path.join(WORK, "home_sea_w.npy"), sea.astype(np.float16))
    out = np.dstack([to_srgb(rgb), land]) * 255.0 + 0.5
    Image.fromarray(out.astype(np.uint8), mode="RGBA").save(os.path.join(WORK, f"home_albedo{suffix}.png"))
    with open(os.path.join(WORK, f"home_albedo{suffix}.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"home_albedo.png {W}×{H}  陸 {land.mean() * 100:.0f}%")


if __name__ == "__main__":
    main()
