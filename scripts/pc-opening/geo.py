"""PC のオープニング CG の地形の計算（タイルの番号・標高の読み方・地球の丸みを入れた座標）。

Blender の外（fetch.py）でも中（animatic.py）でも使うので、numpy だけで書く。
座標は「ある1点（原点）を地面に置いた、東・北・上の向きの座標」（ENU）。地球は半径 R_EARTH の球として、
遠くの地面ほど丸みの分だけ下がる（100km 先で約 0.8km）。
"""

from __future__ import annotations

import math

import numpy as np

R_EARTH = 6371008.8  # 地球の平均の半径（m）
TILE = 256  # タイル1枚の画素


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[float, float]:
    """経度・緯度 → タイルの番号（小数つき。整数部がタイル、小数部がタイルの中の位置）"""
    n = 2.0**z
    x = (lon + 180.0) / 360.0 * n
    r = math.radians(lat)
    y = (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * n
    return x, y


def tile_range(bbox: tuple[float, float, float, float], z: int) -> tuple[int, int, int, int]:
    """経緯度の範囲（西, 南, 東, 北）を覆うタイルの番号の範囲（x0, y0, x1, y1。両端を含む）"""
    w, s, e, n = bbox
    x0, y0 = lonlat_to_tile(w, n, z)
    x1, y1 = lonlat_to_tile(e, s, z)
    return int(x0), int(y0), int(x1), int(y1)


def decode_gsi(rgb: np.ndarray) -> np.ndarray:
    """国土地理院の標高タイル（dem_png）の色 → 標高（m）。データの無い所（海など）は NaN"""
    v = (rgb[..., 0].astype(np.int64) << 16) | (rgb[..., 1].astype(np.int64) << 8) | rgb[..., 2].astype(np.int64)
    none = v == (1 << 23)
    v = np.where(v > (1 << 23), v - (1 << 24), v)
    h = v.astype(np.float64) * 0.01
    h[none] = np.nan
    return h.astype(np.float32)


def decode_terrarium(rgb: np.ndarray) -> np.ndarray:
    """AWS Terrain Tiles（terrarium）の色 → 標高（m。海は海底の深さで負）"""
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    return (r * 256.0 + g + b / 256.0) - 32768.0


def pixel_lonlat(meta: dict, shape: tuple[int, int], step: int = 1) -> tuple[np.ndarray, np.ndarray]:
    """つなぎ合わせた標高（meta は fetch.py の .json）の画素の中心の経度（列ごと）と緯度（行ごと）。step 画素ごとに間引く"""
    n = 2.0 ** meta["z"]
    rows = np.arange(0, shape[0], step)
    cols = np.arange(0, shape[1], step)
    x = meta["x0"] + (cols + 0.5) / TILE
    y = meta["y0"] + (rows + 0.5) / TILE
    lon = x / n * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * y / n))))
    return lon, lat


def enu(lat, lon, h, lat0: float, lon0: float, r: float = R_EARTH):
    """経度・緯度・高さ（m）→ 原点（lat0, lon0 の地面）から見た 東・北・上（m）。地球の丸みを入れる"""
    lat = np.asarray(lat, dtype=np.float64)
    lon = np.asarray(lon, dtype=np.float64)
    h = np.asarray(h, dtype=np.float64)
    p, l = np.radians(lat), np.radians(lon)
    p0, l0 = math.radians(lat0), math.radians(lon0)
    rr = r + h
    X = rr * np.cos(p) * np.cos(l)
    Y = rr * np.cos(p) * np.sin(l)
    Z = rr * np.sin(p)
    dx = X - r * math.cos(p0) * math.cos(l0)
    dy = Y - r * math.cos(p0) * math.sin(l0)
    dz = Z - r * math.sin(p0)
    e = -math.sin(l0) * dx + math.cos(l0) * dy
    nn = -math.sin(p0) * math.cos(l0) * dx - math.sin(p0) * math.sin(l0) * dy + math.cos(p0) * dz
    u = math.cos(p0) * math.cos(l0) * dx + math.cos(p0) * math.sin(l0) * dy + math.sin(p0) * dz
    return e, nn, u


def local_axes(lat: float, lon: float, lat0: float, lon0: float) -> np.ndarray:
    """ある地点の 東・北・上 の向き（その地点の地面に沿った向き）を、原点の座標で表した 3×3（行が 東・北・上）"""

    def ecef_axes(p, l):
        return np.array(
            [
                [-math.sin(l), math.cos(l), 0.0],
                [-math.sin(p) * math.cos(l), -math.sin(p) * math.sin(l), math.cos(p)],
                [math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p)],
            ]
        )

    a = ecef_axes(math.radians(lat), math.radians(lon))
    a0 = ecef_axes(math.radians(lat0), math.radians(lon0))
    return a @ a0.T


def bilinear(h: np.ndarray, fy: np.ndarray, fx: np.ndarray) -> np.ndarray:
    """格子の値 h を、小数の行・列（fy, fx）で読む（端は端の値）"""
    H, W = h.shape
    fy = np.clip(fy, 0, H - 1.001)
    fx = np.clip(fx, 0, W - 1.001)
    y0 = np.floor(fy).astype(int)
    x0 = np.floor(fx).astype(int)
    ty = fy - y0
    tx = fx - x0
    a = h[y0, x0] * (1 - tx) + h[y0, x0 + 1] * tx
    b = h[y0 + 1, x0] * (1 - tx) + h[y0 + 1, x0 + 1] * tx
    return a * (1 - ty) + b * ty


def height_at(mosaic: np.ndarray, meta: dict, lat, lon) -> np.ndarray:
    """つなぎ合わせた標高から、経度・緯度の地点の標高（m）を読む"""
    lat = np.atleast_1d(np.asarray(lat, dtype=np.float64))
    lon = np.atleast_1d(np.asarray(lon, dtype=np.float64))
    n = 2.0 ** meta["z"]
    x = (lon + 180.0) / 360.0 * n
    r = np.radians(lat)
    y = (1.0 - np.log(np.tan(r) + 1.0 / np.cos(r)) / np.pi) / 2.0 * n
    fx = (x - meta["x0"]) * TILE - 0.5
    fy = (y - meta["y0"]) * TILE - 0.5
    return bilinear(mosaic, fy, fx)


def inside_polygon(lon: np.ndarray, lat: np.ndarray, poly: list[tuple[float, float]]) -> np.ndarray:
    """点（lon, lat。同じ形の配列）が多角形（(lon, lat) の並び）の内側か"""
    inside = np.zeros(np.broadcast(lon, lat).shape, dtype=bool)
    lon, lat = np.broadcast_arrays(lon, lat)
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        cross = (y1 > lat) != (y2 > lat)
        with np.errstate(divide="ignore", invalid="ignore"):
            xin = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
        inside ^= cross & (lon < xin)
    return inside
