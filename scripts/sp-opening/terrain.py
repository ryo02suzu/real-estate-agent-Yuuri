"""富士山の標高（5m → 10m → 約15m の順に、細かい方を使う）と、カメラから見た山の輪郭（numpy だけ）。"""

from __future__ import annotations

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import common as C
from geo import R_EARTH, height_at  # noqa: E402

_D: dict = {}
ORDER = ("dem5a", "dem14", "dem13")  # 細かい順


def dem(name: str):
    if name not in _D:
        h = np.load(os.path.join(C.WORK, f"{name}.npy"))
        with open(os.path.join(C.WORK, f"{name}.json")) as f:
            m = json.load(f)
        _D[name] = (h, m)
    return _D[name]


def inside(meta: dict, lat, lon, margin: float = 0.0015):
    w, s, e, n = meta["bbox"]
    return (lon > w + margin) & (lon < e - margin) & (lat > s + margin) & (lat < n - margin)


def ground(lat, lon) -> np.ndarray:
    """標高（m）。その地点を含む、いちばん細かいデータで読む（どのデータにも無い所は 0）"""
    lat = np.atleast_1d(np.asarray(lat, np.float64))
    lon = np.atleast_1d(np.asarray(lon, np.float64))
    out = np.zeros(lat.shape)
    done = np.zeros(lat.shape, bool)
    for name in ORDER:
        h, m = dem(name)
        sel = ~done & inside(m, lat, lon)
        if sel.any():
            out[sel] = height_at(h, m, lat[sel], lon[sel])
            done |= sel
    return out


def offset_latlon(lat0: float, lon0: float, east, north):
    """小さなずれ（m）→ 緯度・経度"""
    return lat0 + np.degrees(np.asarray(north) / R_EARTH), lon0 + np.degrees(np.asarray(east) / (R_EARTH * math.cos(math.radians(lat0))))


def bearing_point(lat0: float, lon0: float, bearing_deg: float, dist: float) -> tuple[float, float]:
    """(lat0, lon0) から方位 bearing_deg に dist m 進んだ地点（大円）"""
    d = dist / R_EARTH
    b = math.radians(bearing_deg)
    p1, l1 = math.radians(lat0), math.radians(lon0)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), math.degrees(l2)


def profile(cam_lat: float, cam_lon: float, cam_h: float, azs: np.ndarray, r0: float, r1: float, step: float = 4.0):
    """山の輪郭：方位ごとの、地形のいちばん高く見える角度（度。地球の丸みを入れ、屈折は入れない）とその距離"""
    rs = np.arange(r0, r1, step)
    best = np.full(len(azs), -90.0)
    dist = np.zeros(len(azs))
    for k0 in range(0, len(azs), 48):
        a = np.radians(azs[k0 : k0 + 48])[:, None]
        lat, lon = offset_latlon(cam_lat, cam_lon, rs[None, :] * np.sin(a), rs[None, :] * np.cos(a))
        h = ground(lat.ravel(), lon.ravel()).reshape(lat.shape)
        el = np.degrees(np.arctan2(h - rs[None, :] ** 2 / (2 * R_EARTH) - cam_h, rs[None, :]))
        i = np.argmax(el, axis=1)
        best[k0 : k0 + 48] = el[np.arange(len(i)), i]
        dist[k0 : k0 + 48] = rs[i]
    return best, dist
