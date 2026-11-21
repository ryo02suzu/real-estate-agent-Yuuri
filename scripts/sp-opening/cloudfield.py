"""雲海の形（numpy だけ。Blender の中でも、体積の雲を描く clouds.py でも使う）。

雲海は「上面の高さの地図」（2次元）と、それを3次元に崩すゆらぎ（clouds.py）で作る。上面の高さの地図は、
カメラの通り道のまわりは細かく（8m）、まわりは 32m、遠くは 200m ごとに前もって計算して work/cloudtop.npz に置く。
雲の上面の高さは平均で約 1,290m、もくもくした頭は 1,400m 前後まで。雲の底は約 800m。カメラが雲を抜ける所には、
頭が一つ立っている（2.75 秒に、その頭のてっぺんを抜ける）。座標は山頂を原点にした 東・北（m）。
"""

from __future__ import annotations

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import common as C

BASE = 800.0  # 雲の底（m）
MEAN_TOP = 1290.0  # 上面の平均（m）
HEAD_T = 2.6  # カメラが雲の頭のてっぺんを抜ける秒（2.8 秒には頭の 約 20m 上）
# 上面のうねり（大きさ m, 高さ m, 種）。頭は丸く、間は深いくびれ
OCTAVES = ((9000.0, 45.0, 11), (2600.0, 40.0, 12), (900.0, 70.0, 13), (300.0, 55.0, 14), (110.0, 26.0, 15), (40.0, 8.0, 16))
GRIDS = (("fine", 8.0), ("mid", 32.0), ("far", 200.0))


def vnoise(x: np.ndarray, y: np.ndarray, seed: int) -> np.ndarray:
    """なめらかなゆらぎ（0〜1）。PC の film.value_noise と同じ作り"""
    g = np.random.default_rng(seed).random((256, 256)).astype(np.float32)
    xi = np.floor(x).astype(np.int64)
    yi = np.floor(y).astype(np.int64)
    fx, fy = (x - xi).astype(np.float32), (y - yi).astype(np.float32)
    ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    a, b = g[yi & 255, xi & 255], g[yi & 255, (xi + 1) & 255]
    c, d = g[(yi + 1) & 255, xi & 255], g[(yi + 1) & 255, (xi + 1) & 255]
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy


def top_formula(x: np.ndarray, y: np.ndarray, spacing: float, head_xy: tuple[float, float, float]) -> np.ndarray:
    """上面の高さ（m）。spacing より細かいうねりは入れない（遠くの雲が細かすぎてちらつかないように）"""
    x = np.asarray(x, np.float64)
    y = np.asarray(y, np.float64)
    h = np.full(x.shape, MEAN_TOP)
    for scale, amp, seed in OCTAVES:
        w = np.clip((scale / spacing - 2.0) / 2.0, 0.0, 1.0)
        if not np.any(w):
            continue
        # うねりの向きを octave ごとに回す（格子の癖をそろえない）
        a = seed * 0.7
        u = (x * math.cos(a) - y * math.sin(a)) / scale + seed * 13.1
        v = (x * math.sin(a) + y * math.cos(a)) / scale + seed * 7.3
        n = vnoise(u, v, seed)
        bill = (((2.0 * n - 1.0) ** 2) + 0.03) ** 0.375  # 丸い頭、くびれも丸く
        h = h + w * amp * (bill - 0.5) * 2.0
    # カメラが抜ける所の頭（半径 約 160m）。てっぺんは、その秒のカメラの高さ。まわりのうねりに丸く盛り上げる
    hx, hy, hz = head_xy
    r2 = ((x - hx) ** 2 + (y - hy) ** 2) / 160.0**2
    head = np.exp(-r2 * 1.2)
    h = h * (1 - head) + hz * head
    return h


def build(head_xy: tuple[float, float, float], center: tuple[float, float]) -> dict:
    """上面の高さの地図を3つの細かさで作る（fine：カメラの通り道のまわり 7km 四方、mid：80km 四方、far：320km 四方）"""
    cx, cy = center
    out = {}
    for name, g in GRIDS:
        half = {"fine": 3500.0, "mid": 40000.0, "far": 160000.0}[name]
        x0, y0 = (cx - half, cy - half) if name == "fine" else (-half + 10000.0, -half)
        n = int(2 * half / g) + 1
        xs = x0 + np.arange(n) * g
        ys = y0 + np.arange(n) * g
        X, Y = np.meshgrid(xs, ys)  # 行は北へ
        out[name] = dict(x0=float(x0), y0=float(y0), g=g, h=top_formula(X, Y, g, head_xy).astype(np.float32))
        print(f"  雲の上面 {name}: {n}×{n}（{g:.0f}m ごと）", flush=True)
    return out


def save(grids: dict) -> None:
    np.savez(os.path.join(C.WORK, "cloudtop.npz"), **{f"{k}_h": v["h"] for k, v in grids.items()})
    with open(os.path.join(C.WORK, "cloudtop.json"), "w") as f:
        json.dump({k: dict(x0=v["x0"], y0=v["y0"], g=v["g"], n=int(v["h"].shape[0])) for k, v in grids.items()}, f, indent=1)


_G: dict = {}


def load() -> dict:
    if not _G:
        z = np.load(os.path.join(C.WORK, "cloudtop.npz"))
        with open(os.path.join(C.WORK, "cloudtop.json")) as f:
            meta = json.load(f)
        for k, m in meta.items():
            _G[k] = dict(m, h=z[f"{k}_h"])
    return _G


def bilinear(gr: dict, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    n = gr["n"]
    fx = np.clip((x - gr["x0"]) / gr["g"], 0, n - 1.001)
    fy = np.clip((y - gr["y0"]) / gr["g"], 0, n - 1.001)
    ix = np.floor(fx).astype(np.int64)
    iy = np.floor(fy).astype(np.int64)
    tx, ty = fx - ix, fy - iy
    h = gr["h"]
    a = h[iy, ix] * (1 - tx) + h[iy, ix + 1] * tx
    b = h[iy + 1, ix] * (1 - tx) + h[iy + 1, ix + 1] * tx
    return a * (1 - ty) + b * ty


def edge_weight(gr: dict, x: np.ndarray, y: np.ndarray, border: float) -> np.ndarray:
    """格子の内側ほど 1、ふちの border m で 0 へ（細かい格子と粗い格子をなめらかにつなぐ）"""
    span = (gr["n"] - 1) * gr["g"]
    dx = np.minimum(x - gr["x0"], gr["x0"] + span - x)
    dy = np.minimum(y - gr["y0"], gr["y0"] + span - y)
    return np.clip(np.minimum(dx, dy) / border, 0.0, 1.0)


def top(x, y) -> np.ndarray:
    """上面の高さ（m）を、いちばん細かい格子から読む（格子のふちはなめらかにつなぐ）"""
    g = load()
    x = np.asarray(x, np.float64)
    y = np.asarray(y, np.float64)
    h = bilinear(g["far"], x, y)
    for name, border in (("mid", 4000.0), ("fine", 400.0)):
        w = edge_weight(g[name], x, y, border)
        if np.any(w > 0):
            h = h * (1 - w) + bilinear(g[name], x, y) * w
    return h


def main() -> None:
    sys.path.insert(0, C.HERE)
    import path as P

    p = P.plan()
    cam = P.camera(int(round(HEAD_T * C.FPS)), p)
    head = (float(cam["pos"][0]), float(cam["pos"][1]), float(cam["alt"]) - 2.0)
    c0 = P.camera(0, p)["pos"]
    c1 = P.camera(C.N_FRAMES - 1, p)["pos"]
    center = (float((c0[0] + c1[0]) / 2 + 1500.0), float((c0[1] + c1[1]) / 2))  # 通り道と、その前（富士の方）
    grids = build(head, center)
    save(grids)
    print(f"雲の頭（カメラが {HEAD_T} 秒に抜ける所）: x={head[0]:.0f} y={head[1]:.0f}、上面 {float(top(np.array([head[0]]), np.array([head[1]]))[0]):.0f}m")


if __name__ == "__main__":
    main()
