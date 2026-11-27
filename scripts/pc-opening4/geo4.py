"""座標と標高（numpy だけ）。東・北・上（m）。原点は河童橋（config の ORIGIN_*）。

標高は国土地理院の 10m 標高（ウェブメルカトル z14 のタイルをつないだもの）と、広い範囲の z11。
谷の格子の外は広い格子で読む。高さは本当の標高（強調しない）。
"""
from __future__ import annotations

import json
import math

import numpy as np

import config

EARTH = 40075016.686
R_EARTH = 6371008.8
K0 = math.cos(math.radians(config.ORIGIN_LAT))


def merc(lon, lat):
    lon = np.asarray(lon, dtype=np.float64)
    lat = np.asarray(lat, dtype=np.float64)
    return (lon + 180.0) / 360.0, (1.0 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2.0


MX0, MY0 = (float(v) for v in merc(config.ORIGIN_LON, config.ORIGIN_LAT))


def to_local(lon, lat):
    """経度・緯度 → 東・北（m）"""
    mx, my = merc(lon, lat)
    return (mx - MX0) * EARTH * K0, -(my - MY0) * EARTH * K0


def to_lonlat(e, n):
    """東・北（m）→ 経度・緯度"""
    mx = MX0 + np.asarray(e, dtype=np.float64) / (EARTH * K0)
    my = MY0 - np.asarray(n, dtype=np.float64) / (EARTH * K0)
    return mx * 360.0 - 180.0, np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * my))))


def curvature_drop(e, n):
    """地球の丸みで下がる高さ（m）"""
    return (np.asarray(e) ** 2 + np.asarray(n) ** 2) / (2.0 * R_EARTH)


class Grid:
    """タイルをつないだ標高の格子"""

    def __init__(self, name: str, directory=None):
        d = directory or config.TERRAIN_DIR
        self.arr = np.load(d / f"{name}.npy").astype(np.float32)
        self.meta = json.loads((d / f"{name}.json").read_text())
        self.n = 2.0 ** self.meta["z"]
        self.H, self.W = self.arr.shape
        # 画素の真ん中の東・北（行・列ごと）
        cols = np.arange(self.W) + 0.5
        rows = np.arange(self.H) + 0.5
        mx = (self.meta["x0"] + cols / 256.0) / self.n
        my = (self.meta["y0"] + rows / 256.0) / self.n
        self.xs = (mx - MX0) * EARTH * K0
        self.ys = -(my - MY0) * EARTH * K0

    def rc(self, e, n):
        mx = MX0 + np.asarray(e) / (EARTH * K0)
        my = MY0 - np.asarray(n) / (EARTH * K0)
        c = mx * self.n * 256.0 - self.meta["x0"] * 256.0 - 0.5
        r = my * self.n * 256.0 - self.meta["y0"] * 256.0 - 0.5
        return r, c

    def inside(self, e, n, margin=2):
        r, c = self.rc(e, n)
        return (r >= margin) & (r <= self.H - 1 - margin) & (c >= margin) & (c <= self.W - 1 - margin)

    def sample(self, e, n):
        r, c = self.rc(e, n)
        r = np.clip(r, 0, self.H - 1.000001)
        c = np.clip(c, 0, self.W - 1.000001)
        r0 = np.floor(r).astype(int)
        c0 = np.floor(c).astype(int)
        fr = r - r0
        fc = c - c0
        a = self.arr
        top = a[r0, c0] * (1 - fc) + a[r0, c0 + 1] * fc
        bot = a[r0 + 1, c0] * (1 - fc) + a[r0 + 1, c0 + 1] * fc
        return top * (1 - fr) + bot * fr


class Dem:
    """標高（m。本当の高さ・双線形）。谷の格子の外は広い格子"""

    def __init__(self, wide: bool = False):
        self.valley = Grid("valley")
        self.far = Grid("far")
        # 広い格子（東経 136.9〜139.1・北緯 35.25〜37.0）。far の外で使う（八ヶ岳・富士山まで届く）
        self.mid = Grid("mid", config.WIDE_DIR) if wide else None

    def height(self, e, n):
        e = np.asarray(e, dtype=np.float64)
        n = np.asarray(n, dtype=np.float64)
        hv = self.valley.sample(e, n)
        hf = self.far.sample(e, n)
        if self.mid is not None:
            hf = np.where(self.far.inside(e, n), hf, self.mid.sample(e, n))
        return np.where(self.valley.inside(e, n), hv, hf).astype(np.float64)

    def slope_deg(self, e, n, d=15.0):
        """傾き（度）。±d m の差から"""
        dx = (self.height(e + d, n) - self.height(e - d, n)) / (2 * d)
        dy = (self.height(e, n + d) - self.height(e, n - d)) / (2 * d)
        return np.degrees(np.arctan(np.hypot(dx, dy)))
