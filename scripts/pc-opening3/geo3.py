"""第3版の場面の座標（Blender の外でも中でも使う。numpy だけ）。

場面の原点は大正池の少し上流（ORIGIN の経度・緯度）。座標は東・北・上（m）。地形は本当の高さ（強調しない）。
メルカトルの位置（0〜1）から m へは、原点の緯度の縮尺で直す（この広さ（20km）なら、ずれは 0.2% ほど）。
遠い所は地球の丸みの分だけ下げる（10km 先で約 8m）。
"""

from __future__ import annotations

import math

import numpy as np

EARTH = 40075016.686  # 赤道の長さ（m）
R_EARTH = 6371008.8
ORIGIN = (137.6270, 36.2330)  # 経度・緯度（大正池の上流の梓川）
K0 = math.cos(math.radians(ORIGIN[1]))


def merc(lon, lat):
    """経度・緯度 → メルカトルの位置（0〜1。左上が 0）"""
    lon = np.asarray(lon, dtype=np.float64)
    lat = np.asarray(lat, dtype=np.float64)
    return (lon + 180.0) / 360.0, (1.0 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2.0


MX0, MY0 = (float(v) for v in merc(*ORIGIN))


def local_from_merc(mx, my):
    """メルカトルの位置 → 場面の座標（東, 北。m）"""
    return (np.asarray(mx) - MX0) * EARTH * K0, -(np.asarray(my) - MY0) * EARTH * K0


def merc_from_local(x, y):
    return MX0 + np.asarray(x) / (EARTH * K0), MY0 - np.asarray(y) / (EARTH * K0)


def local(lon, lat):
    return local_from_merc(*merc(lon, lat))


def lonlat(x, y):
    mx, my = merc_from_local(x, y)
    return mx * 360.0 - 180.0, np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * my))))


def grid_xy(meta: dict, shape, step: int = 1):
    """タイルをつないだ格子（meta は data.py の .json）の画素の真ん中の、場面の座標（列ごとの x、行ごとの y）"""
    n = 2.0 ** meta["z"]
    cols = np.arange(0, shape[1], step) + 0.5
    rows = np.arange(0, shape[0], step) + 0.5
    mx = (meta["x0"] + cols / 256.0) / n
    my = (meta["y0"] + rows / 256.0) / n
    x, _ = local_from_merc(mx, np.full_like(mx, MY0))
    _, y = local_from_merc(np.full_like(my, MX0), my)
    return x, y


def curvature_drop(x, y):
    """地球の丸みで下がる高さ（m）"""
    d2 = np.asarray(x) ** 2 + np.asarray(y) ** 2
    return d2 / (2.0 * R_EARTH)


def sample(arr: np.ndarray, meta: dict, x, y, order: int = 1):
    """格子の配列を、場面の座標（x, y）で読む（双線形。範囲の外は端の値）"""
    n = 2.0 ** meta["z"]
    mx, my = merc_from_local(x, y)
    c = mx * n * 256.0 - meta["x0"] * 256.0 - 0.5
    r = my * n * 256.0 - meta["y0"] * 256.0 - 0.5
    H, W = arr.shape[:2]
    c = np.clip(c, 0, W - 1.000001)
    r = np.clip(r, 0, H - 1.000001)
    c0 = np.floor(c).astype(int)
    r0 = np.floor(r).astype(int)
    fc = c - c0
    fr = r - r0
    if arr.ndim == 3:
        fc = fc[..., None]
        fr = fr[..., None]
    a = arr[r0, c0] * (1 - fc) + arr[r0, np.minimum(c0 + 1, W - 1)] * fc
    b = arr[np.minimum(r0 + 1, H - 1), c0] * (1 - fc) + arr[np.minimum(r0 + 1, H - 1), np.minimum(c0 + 1, W - 1)] * fc
    return a * (1 - fr) + b * fr
