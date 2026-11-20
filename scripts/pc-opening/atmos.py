#!/usr/bin/env python3
"""PC のオープニング CG：film.py が描いた「面」の絵に、空気（かすみ・朝もや・光の筋）と仕上げを足す。

  python3 atmos.py local [--frames 140-479] [--src work/film/local] [--out work/frames] [--preview]

上高地の場面で足すもの（奥行き＝カメラから当たった所までの距離を使う）：
  - かすみ：低い所ほど濃い空気。遠くほど空の地平線の色（film.py sky で描いた全天の空の色）に近づく
  - 光の筋：かすみの中で、朝日が当たっている所と山の影になっている所を分ける（地形から「この高さより上は日が当たる」
    という高さの地図を作り、カメラから当たった所までの間で、日の当たる空気の割合を数える）。朝日の方を見ると筋になる
  - 朝もや：上高地の谷底（海抜 1650m より低い所）の、地面すれすれの薄い霧。まだら（約 250m の模様）で、ゆっくり流れる
  - 光のにじみ（明るい所のまわり）、色の仕上げ（AgX。金色の光・藍の影）、周辺を少し暗く、ごく細かい粒
出力は 1920×1080 の 8bit の PNG（work/frames/<コマ番号>.png）。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import numpy as np
import OpenEXR
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import path as P  # noqa: E402
from geo import R_EARTH  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))


# ---------------------------------------------------------------- 読み書き


def read_exr(path: str) -> dict:
    f = OpenEXR.File(path)
    out = {}
    for p in f.parts:
        for k, v in p.channels.items():
            out[k.split(".", 1)[1] if "." in k else k] = np.asarray(v.pixels, dtype=np.float32)
    return out


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------- 仕上げ（AgX）

AGX = np.array(
    [[0.842479062253094, 0.0784335999999992, 0.0792237451477643], [0.0423282422610123, 0.878468636469772, 0.0791661274605434], [0.0423756549057051, 0.0784336, 0.879142973793104]],
    dtype=np.float32,
)
AGX_INV = np.array(
    [[1.19687900512017, -0.0980208811401368, -0.0990297440797205], [-0.0528968517574562, 1.15190312990417, -0.0989611768448433], [-0.0529716355144438, -0.0980434501171241, 1.15107367264116]],
    dtype=np.float32,
)


def agx(rgb: np.ndarray, slope=(1.0, 1.0, 1.0), power=(1.0, 1.0, 1.0), sat: float = 1.0) -> np.ndarray:
    """光の量（線形）→ 画面の色（0〜1。ガンマ約 2.2 で符号化）。Blender の AgX と同じ考え方の近似"""
    lo, hi = -12.47393, 4.026069
    v = np.maximum(rgb, 1e-10) @ AGX.T
    v = (np.clip(np.log2(np.maximum(v, 1e-10)), lo, hi) - lo) / (hi - lo)
    x2 = v * v
    x4 = x2 * x2
    v = 15.5 * x4 * x2 - 40.14 * x4 * v + 31.96 * x4 - 6.868 * x2 * v + 0.4298 * x2 + 0.1191 * v - 0.00232
    v = np.maximum(np.clip(v, 0, 1) * np.asarray(slope, np.float32), 0.0) ** np.asarray(power, np.float32)
    lum = v @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    v = lum[..., None] + sat * (v - lum[..., None])
    return np.clip(v @ AGX_INV.T, 0.0, 1.0)


def bloom(rgb: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """明るい所のまわりの、レンズと空気による光のにじみ（太陽は強すぎるので抑えてからぼかす）"""
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    k = np.clip((lum - 1.2) / np.maximum(lum, 1e-6), 0.0, 1.0)
    src = rgb * k[..., None]
    m = src.max(-1, keepdims=True)
    src = src * (np.minimum(m, 40.0) / np.maximum(m, 1e-6))  # 太陽の円の明るさを頭打ちに
    h, w = lum.shape
    out = np.zeros_like(rgb)
    small = src
    for sigma, amt in ((0.004, 0.10), (0.012, 0.06), (0.035, 0.05), (0.09, 0.04)):
        s = sigma * w
        f = max(1, int(s / 3))
        sm = small[::f, ::f] if f > 1 else small
        b = np.stack([ndimage.gaussian_filter(sm[..., c], s / f, mode="nearest") for c in range(3)], -1)
        if f > 1:
            b = np.stack([np.asarray(Image.fromarray(b[..., c]).resize((w, h), Image.BILINEAR)) for c in range(3)], -1)
        out += amt * b
    return rgb + strength * out


def look_at(look: dict, key: str, t: float, default):
    """仕上げの値。(秒, 値) の並びなら、その秒の値を間からなめらかに出す"""
    v = look.get(key, default)
    if isinstance(v, list):
        ts = [k[0] for k in v]
        vals = [np.atleast_1d(np.asarray(k[1], np.float32)) for k in v]
        if t <= ts[0]:
            out = vals[0]
        elif t >= ts[-1]:
            out = vals[-1]
        else:
            i = int(np.searchsorted(ts, t)) - 1
            u = float(smoothstep(0.0, 1.0, (t - ts[i]) / (ts[i + 1] - ts[i])))
            out = vals[i] * (1 - u) + vals[i + 1] * u
        return float(out[0]) if out.size == 1 else tuple(float(x) for x in out)
    return v


def tone(lin: np.ndarray, f: int, look: dict) -> np.ndarray:
    """色の仕上げ（光のにじみ・金色の光と藍の影・AgX）→ 画面の色（0〜1）。粒と周辺の暗さは final で足す"""
    t = f / P.FPS
    x = bloom(lin * (2.0 ** look_at(look, "exposure", t, 0.0)), look.get("bloom", 1.0))
    lum = x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    k = smoothstep(0.02, 0.6, lum)[..., None]
    x = x * (np.array(look.get("shadow", (0.94, 0.98, 1.08)), np.float32) * (1 - k) + np.array(look.get("light", (1.06, 1.0, 0.9)), np.float32) * k)
    return agx(x, look.get("slope", (1.0, 1.0, 1.0)), look_at(look, "power", t, (1.0, 1.0, 1.0)), look_at(look, "sat", t, 1.0))


def grain_vignette(v: np.ndarray, f: int, amount: float = 0.16, grain: float = 0.006) -> np.ndarray:
    """周辺を少し暗く、ごく細かい粒（コマごとに変わる。映像の帯状のむらも防ぐ）→ 8bit"""
    h, w = v.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r2 = ((xx - w / 2) / (w / 2)) ** 2 * 0.75 + ((yy - h / 2) / (h / 2)) ** 2 * 0.75
    v = v * (1.0 - amount * smoothstep(0.25, 1.6, r2))[..., None]
    rng = np.random.default_rng(1000 + f)
    v = v + rng.standard_normal((h, w, 1)).astype(np.float32) * grain
    return (np.clip(v, 0, 1) * 255.0 + 0.5).astype(np.uint8)


# ---------------------------------------------------------------- カメラの光線


def rays(f: int, scene: str, w: int, h: int):
    c = P.camera(scene, f)
    fpx = c["focal"] / 36.0 * w
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = (xs + 0.5 - w / 2) / fpx
    dy = -(ys + 0.5 - h / 2) / fpx
    d = dx[..., None] * c["right"].astype(np.float32) + dy[..., None] * c["up"].astype(np.float32) + c["fwd"].astype(np.float32)
    n = np.linalg.norm(d, axis=-1, keepdims=True)
    return c, d / n, n[..., 0]


# ---------------------------------------------------------------- 上高地の場面の空気


class Local:
    """上高地の場面の空気（かすみ・光の筋・朝もや）"""

    G = 40.0  # 地形の格子（m）
    X0, X1, Y0, Y1 = -30000.0, 70000.0, -40000.0, 40000.0

    def __init__(self) -> None:
        self.sun = P.sun_dir("local").astype(np.float32)
        nx = int((self.X1 - self.X0) / self.G) + 1
        ny = int((self.Y1 - self.Y0) / self.G) + 1
        xs = self.X0 + np.arange(nx) * self.G
        ys = self.Y0 + np.arange(ny) * self.G
        cache = os.path.join(WORK, "atmos_local.npz")
        if os.path.exists(cache):
            z = np.load(cache)
            self.H, self.S = z["H"], z["S"]
        else:
            Y, X = np.meshgrid(ys, xs, indexing="ij")
            lat = P.P1[0] + np.degrees(Y / R_EARTH)
            lon = P.P1[1] + np.degrees(X / (R_EARTH * math.cos(math.radians(P.P1[0]))))
            self.H = P.ground(lat.ravel(), lon.ravel()).reshape(X.shape).astype(np.float32)
            self.S = self.shadow_height(self.H)
            np.savez(cache, H=self.H, S=self.S)
        self.sky = self.load_sky()
        az = math.atan2(self.sun[0], self.sun[1])
        self.c_amb = self.sky_at(np.array([[math.sin(az + math.pi), math.cos(az + math.pi), 0.035]], np.float32))[0]

    def shadow_height(self, H: np.ndarray) -> np.ndarray:
        """「この高さより上は朝日が当たる」高さの地図。太陽の向きにそろえて回した格子で、太陽の側から順に見ていく"""
        sx, sy, sz = (float(v) for v in self.sun)
        hl = math.hypot(sx, sy)
        ux, uy = sx / hl, sy / hl  # 太陽の方へ向かう水平の向き
        tan_el = sz / hl
        ny, nx = H.shape
        # 回した格子：u（太陽の方へ）・v（横）。元の格子の (列, 行) を読む
        diag = int(math.hypot(nx, ny)) + 4
        us = np.arange(diag) - diag / 2
        vs = np.arange(diag) - diag / 2
        V, U = np.meshgrid(vs, us, indexing="ij")
        cx, cy = (nx - 1) / 2, (ny - 1) / 2
        col = cx + U * ux - V * uy
        row = cy + (U * uy + V * ux)  # 格子の行は y（北）が増える向き
        Hr = ndimage.map_coordinates(H, [row, col], order=1, mode="constant", cval=-1000.0).astype(np.float32)
        # 太陽の側（u の大きい方）から：S[u] = max(H[u], S[u+1] − 格子 × tan(高さ))
        Sr = Hr.copy()
        drop = self.G * tan_el
        for j in range(diag - 2, -1, -1):
            np.maximum(Sr[:, j], Sr[:, j + 1] - drop, out=Sr[:, j])
        # 元の格子へ戻す
        Yg, Xg = np.mgrid[0:ny, 0:nx].astype(np.float32)
        dxg, dyg = Xg - cx, Yg - cy
        u = dxg * ux + dyg * uy + diag / 2
        v = -dxg * uy + dyg * ux + diag / 2
        return ndimage.map_coordinates(Sr, [v, u], order=1, mode="nearest").astype(np.float32)

    def load_sky(self) -> np.ndarray:
        d = read_exr(os.path.join(WORK, "sky_local.exr"))
        return d["Combined"][..., :3]

    def sky_at(self, d: np.ndarray) -> np.ndarray:
        """向き d（東・北・上）の空の色（全天の絵から）。PANO_CENTER は全天の絵の真ん中の向き"""
        h, w = self.sky.shape[:2]
        az = np.arctan2(d[..., 0], d[..., 1])  # 北 0・東 +
        el = np.arcsin(np.clip(d[..., 2], -1, 1))
        u = ((az - PANO_AZ0) / (2 * np.pi) + 0.5) % 1.0 * w - 0.5  # 東 → 南（時計回り）で右へ（太陽の位置で確かめた）
        v = (0.5 - el / np.pi) * h - 0.5
        return np.stack([ndimage.map_coordinates(self.sky[..., c], [v, u], order=1, mode="wrap") for c in range(3)], -1)

    def grid(self, A: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(A, [(y - self.Y0) / self.G, (x - self.X0) / self.G], order=1, mode="nearest")

    def apply(self, f: int, rgb: np.ndarray, Z: np.ndarray) -> np.ndarray:
        h, w = Z.shape
        cam, d, norm = rays(f, "local", w, h)
        t_now = f / P.FPS
        sky = Z > 1e8
        L = np.where(sky, 40000.0, Z * norm).astype(np.float32)
        pos = cam["pos"].astype(np.float32)
        alt_c = float(pos[2] + (pos[0] ** 2 + pos[1] ** 2) / (2 * R_EARTH))
        dz = d[..., 2]
        # かすみ：低い所ほど濃い（海抜 h0 で sig0、高さ Hs ごとに 1/e）
        sig0, h0, Hs = LOOK_LOCAL["haze"], 1500.0, 1300.0
        a = np.exp(-(alt_c - h0) / Hs)
        with np.errstate(over="ignore", divide="ignore", invalid="ignore"):
            tau = np.where(np.abs(dz) > 1e-4, sig0 * Hs / dz * (a - np.exp(-(alt_c + dz * L - h0) / Hs)), sig0 * a * L)
        tau = np.nan_to_num(np.maximum(tau, 0.0), posinf=50.0).astype(np.float32)
        T = np.exp(-tau)
        # 光の筋：カメラから当たった所までの空気のうち、日の当たる割合（かすみの濃さと透け具合で重みを付ける）
        N = 28
        jit = ((np.arange(w)[None, :] * 0.7548776662 + np.arange(h)[:, None] * 0.5698402910) % 1.0).astype(np.float32)
        lit = np.zeros((h, w), np.float32)
        wsum = np.zeros((h, w), np.float32)
        for i in range(N):
            s = ((i + jit) / N) ** 1.7
            t = L * s
            dt = L * (((i + 1 + jit) / N) ** 1.7 - s)
            px = pos[0] + d[..., 0] * t
            py = pos[1] + d[..., 1] * t
            pz = pos[2] + dz * t
            alt = pz + (px * px + py * py) / (2 * R_EARTH)
            dens = np.exp(-(alt - h0) / Hs)
            S = self.grid(self.S, px, py)
            vis = smoothstep(-30.0, 30.0, alt - S)
            # その点までの透け具合（一様に近いとみなして、ここまでの割合で）
            wgt = dens * dt * np.exp(-tau * s)
            lit += wgt * vis
            wsum += wgt
        frac = lit / np.maximum(wsum, 1e-9)
        frac = ndimage.uniform_filter(frac, 3)
        c_dir = self.sky_at(np.concatenate([d[..., :2], np.clip(d[..., 2:3], 0.02, 0.07)], -1))
        c_sun = np.maximum(c_dir - self.c_amb, 0.0)
        inscat = (1.0 - T)[..., None] * (self.c_amb + frac[..., None] * c_sun)
        out = rgb * T[..., None] + inscat
        # 朝もや（谷底の地面すれすれ。まだらで、ゆっくり流れる）
        hx = pos[0] + d[..., 0] * L
        hy = pos[1] + d[..., 1] * L
        g = self.grid(self.H, hx, hy)
        valley = smoothstep(1620.0, 1530.0, g) * smoothstep(3500.0, 1500.0, hx) * (~sky)
        n = mist_noise(hx + 2.2 * t_now * 60.0, hy + 0.8 * t_now * 60.0)
        sina = np.maximum(-dz, 0.035)
        Hm = 45.0
        taum = LOOK_LOCAL["mist"] * valley * n * Hm / sina * (1.0 - np.exp(-L * sina / Hm))
        Tm = np.exp(-taum)[..., None]
        vis_hit = smoothstep(-30.0, 30.0, (g + 25.0) - self.grid(self.S, hx, hy))[..., None]
        c_mist = self.c_amb * 0.95 + vis_hit * self.sky_at(np.concatenate([d[..., :2], np.full_like(d[..., 2:3], 0.05)], -1)) * 0.5
        out = out * Tm + (1.0 - Tm) * c_mist * T[..., None] ** 0.3
        # 空の上の方は深い青に（偏光フィルターをかけたように。太陽から離れるほど）
        cos_sun = d @ self.sun
        deep = smoothstep(0.06, 0.55, dz) * smoothstep(0.995, 0.85, cos_sun) * sky
        out = out * (1.0 - 0.3 * deep[..., None] * np.array([1.0, 0.9, 0.7], np.float32))
        return out


# ---------------------------------------------------------------- 列島の場面の空気（宇宙に近い高さから見る地球の大気）


class Global:
    """地球を包む大気（空気の分子による青い散乱と、ちり・もやによる散乱）。地球の丸い影（夜明けの線）も入る。
    単位は km。地球の中心は (0, 0, -R)。カメラから当たった所（または宇宙）までの光の道で、朝日に照らされた空気から
    来る光を足し、当たった所の色は大気を通った分だけ弱める"""

    R = 6371.0088
    TOP = 90.0
    BR = np.array([5.8e-3, 13.5e-3, 33.1e-3], np.float32)  # 空気の分子（海面、1/km）
    HR = 8.0
    BM = 0.009  # ちり・もや（海面、1/km。よく晴れた朝）
    HM = 1.2
    G = 0.76

    def __init__(self) -> None:
        # 太陽の方への透け具合の表（高さ × 太陽の天頂の cos）
        hs = np.linspace(0.0, self.TOP, 96)
        mus = np.linspace(-1.0, 1.0, 256)
        Hh, Mu = np.meshgrid(hs, mus, indexing="ij")
        r0 = self.R + Hh
        # 地球に当たるか（太陽の光が地平線の下から来る）
        sin2 = 1.0 - Mu**2
        blocked = (Mu < 0) & (r0 * np.sqrt(np.maximum(sin2, 0)) < self.R)
        # 大気の上までの距離
        b = r0 * Mu
        tmax = -b + np.sqrt(np.maximum(b * b - (r0 * r0 - (self.R + self.TOP) ** 2), 0.0))
        n = 96
        od = np.zeros(Hh.shape + (3,), np.float32)
        for i in range(n):
            t = tmax * (i + 0.5) / n
            r = np.sqrt(r0 * r0 + t * t + 2 * r0 * t * Mu)
            hh = np.maximum(r - self.R, 0.0)
            od += ((self.BR * np.exp(-hh / self.HR)[..., None]) + 1.1 * self.BM * np.exp(-hh / self.HM)[..., None]) * (tmax / n)[..., None]
        T = np.exp(-od)
        # 地球の影のふちは柔らかく（太陽の円の大きさと、大気で光が曲がる分）
        cut = r0 * np.sqrt(np.maximum(sin2, 0)) - self.R
        soft = smoothstep(-6.0, 2.0, np.where(Mu < 0, cut, 10.0))
        self.lut = (T * soft[..., None]).astype(np.float32)
        self.lut_h = hs
        self.lut_mu = mus

    def t_sun(self, hh: np.ndarray, mu: np.ndarray) -> np.ndarray:
        fi = np.clip(hh / self.TOP, 0, 1) * (len(self.lut_h) - 1)
        fj = (np.clip(mu, -1, 1) + 1.0) / 2.0 * (len(self.lut_mu) - 1)
        return np.stack([ndimage.map_coordinates(self.lut[..., c], [fi, fj], order=1, mode="nearest") for c in range(3)], -1)

    def apply(self, f: int, rgb: np.ndarray, Z: np.ndarray) -> np.ndarray:
        """空気の光と透け具合は、なめらかなので半分の大きさで数えて広げる（当たった所の色は元の大きさのまま）"""
        H, W = Z.shape
        Zs = Z.reshape(H // 2, 2, W // 2, 2).min(axis=(1, 3))  # 近い方（山のふちで、空気が前に出すぎないように）
        acc, Tview = self.scatter(f, Zs, W, H)
        up = lambda a: np.stack([np.asarray(Image.fromarray(a[..., c]).resize((W, H), Image.BILINEAR)) for c in range(3)], -1)
        acc, Tview = up(acc), up(Tview)
        surf = Z < 1e8
        space = np.array(LOOK_GLOBAL["space"], np.float32)
        base = np.where(surf[..., None], rgb, space)
        return base * Tview + acc * LOOK_GLOBAL["sun"]

    def scatter(self, f: int, Z: np.ndarray, W0: int, H0: int):
        h, w = Z.shape
        t_now = f / P.FPS
        cam, d, norm = rays(f, "global", w, h)
        # 半分の大きさの格子でも、元の画面と同じ画角にする（rays は画素の数から角度を決める）
        sun = P.sun_dir("global", t_now).astype(np.float32)
        o = cam["pos"].astype(np.float32)
        oc = o - np.array([0.0, 0.0, -self.R], np.float32)
        rt = self.R + self.TOP
        b = d @ oc
        c = float(oc @ oc) - rt * rt
        disc = b * b - c
        inside = disc > 0
        sq = np.sqrt(np.maximum(disc, 0.0))
        t0 = np.maximum(-b - sq, 0.0)
        t1 = -b + sq
        surf = Z < 1e8
        L = np.where(surf, Z * norm, np.inf)
        t1 = np.where(surf, np.minimum(t1, L), t1)
        seg = np.where(inside, np.maximum(t1 - t0, 0.0), 0.0)
        cos_t = d @ sun
        pr = 3.0 / (16.0 * np.pi) * (1.0 + cos_t**2)
        g = self.G
        pm = 3.0 / (8.0 * np.pi) * (1 - g * g) * (1 + cos_t**2) / ((2 + g * g) * np.maximum(1 + g * g - 2 * g * cos_t, 1e-4) ** 1.5)
        N = 64
        acc = np.zeros((h, w, 3), np.float32)
        od = np.zeros((h, w, 3), np.float32)
        jit = ((np.arange(w)[None, :] * 0.7548776662 + np.arange(h)[:, None] * 0.5698402910) % 1.0).astype(np.float32)
        dt = seg / N
        for i in range(N):
            t = t0 + (i + jit) * dt
            p = oc[None, None, :] + d * t[..., None]
            r = np.linalg.norm(p, axis=-1)
            hh = np.maximum(r - self.R, 0.0)
            mu = (p @ sun) / np.maximum(r, 1e-6)
            dr = np.exp(-hh / self.HR)[..., None] * self.BR
            dm = (np.exp(-hh / self.HM) * self.BM)[..., None]
            ext = dr + 1.1 * dm
            Ts = self.t_sun(hh, mu)
            Tv = np.exp(-(od + ext * (dt * 0.5)[..., None]))
            acc += Tv * Ts * (dr * pr[..., None] + dm * pm[..., None]) * dt[..., None]
            od += ext * dt[..., None]
        return acc.astype(np.float32), np.exp(-od).astype(np.float32)


LOOK_GLOBAL = {
    "sun": 11.0,
    "space": (0.0004, 0.0007, 0.0016),
    "power": (1.12, 1.14, 1.18),
    "slope": (1.04, 1.0, 0.96),
    "exposure": -1.2,
    "bloom": 0.8,
    "sat": 1.15,
    "shadow": (0.9, 0.96, 1.14),
    "light": (1.1, 1.0, 0.86),
    "vignette": 0.2,
    "grain": 0.006,
}


PANO_AZ0 = math.pi / 2  # 全天の絵の真ん中の向き（東）。film.py の render_sky のカメラの向きと同じ


def mist_noise(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """朝もやのまだら（0.12〜1.7 くらい）。約 700m と 200m の模様（川に沿って流れる薄い霧）"""
    out = np.zeros_like(x)
    for scale, amp, seed in ((700.0, 0.75, 7), (200.0, 0.25, 8)):
        g = np.random.default_rng(seed).random((256, 256)).astype(np.float32)
        u, v = x / scale, y / scale
        out += amp * ndimage.map_coordinates(g, [v % 256, u % 256], order=3, mode="grid-wrap")
    return np.clip((out - 0.25) * 2.2, 0.12, 1.7)


LOOK_LOCAL = {
    "power": [(4.2, (1.06, 1.07, 1.1)), (8.6, (1.08, 1.09, 1.12)), (9.6, (1.2, 1.22, 1.28))],
    "slope": (1.05, 1.0, 0.95),
    "haze": 1.0 / 65000.0,
    "mist": 1.0 / 2200.0,
    "exposure": [(4.2, -0.55), (8.3, -0.75), (9.6, -1.5)],
    "bloom": 1.0,
    "sat": [(4.2, 1.18), (9.6, 1.3)],
    "shadow": (0.88, 0.96, 1.16),
    "light": (1.14, 1.0, 0.8),
    "vignette": 0.16,
    "grain": 0.006,
}


def over_swans(lin: np.ndarray, path: str) -> np.ndarray:
    """白鳥（swans.py。背景は透明で、色は透明度をかけた値）を重ねる。光のにじみの前なので、朝日の中では光に溶ける"""
    if not os.path.exists(path):
        return lin
    s = read_exr(path)["Combined"]
    a = np.clip(s[..., 3:4], 0.0, 1.0)
    return s[..., :3] + lin * (1.0 - a)


# ---------------------------------------------------------------- 雲の中を抜ける（場面のつなぎ目と、最後）


class Clouds:
    """カメラのまわりの薄い雲（3次元のゆらぎ。カメラに対して流れる）。画面の色で重ねる（半分の大きさで数えて広げる）"""

    def __init__(self) -> None:
        self.g = np.random.default_rng(17).random((64, 64, 64)).astype(np.float32)

    def field(self, p: np.ndarray) -> np.ndarray:
        """ゆらぎ（0〜1）。p は m（…, 3）"""
        out = np.zeros(p.shape[:-1], np.float32)
        tot = 0.0
        for scale, amp in ((70.0, 1.0), (28.0, 0.5), (11.0, 0.25)):
            q = p / scale
            out += amp * ndimage.map_coordinates(self.g, [q[..., 0] % 64, q[..., 1] % 64, q[..., 2] % 64], order=1, mode="grid-wrap")
            tot += amp
        return out / tot

    def layer(self, f: int, scene: str, W: int, H: int, amount: float, flow: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """雲の色（画面の色）と、覆う割合。flow はカメラから見た雲の流れ（右・上・前 m/秒）"""
        w, h = W // 2, H // 2
        t = f / P.FPS
        cam = P.camera(scene, f)
        sun = P.sun_dir(scene, t) if scene == "global" else P.sun_dir(scene)
        sun_c = np.array([sun @ cam["right"], sun @ cam["up"], sun @ cam["fwd"]], np.float32)
        sun_c /= np.linalg.norm(sun_c)
        fpx = cam["focal"] / 36.0 * w
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.stack([(xs + 0.5 - w / 2) / fpx, -(ys + 0.5 - h / 2) / fpx, np.ones_like(xs)], -1)
        d /= np.linalg.norm(d, axis=-1, keepdims=True)
        thr = 0.72 - 0.42 * amount  # 濃くなるほど、雲の所が増える
        k = 0.05 + 0.5 * amount**2
        N = 22
        col = np.zeros((h, w, 3), np.float32)
        trans = np.ones((h, w), np.float32)
        lit_c = np.array([1.0, 0.95, 0.86], np.float32)
        shade_c = np.array([0.8, 0.81, 0.85], np.float32)
        off = flow * t
        for i in range(N):
            z0 = 2.0 + 260.0 * (i / N) ** 2
            z1 = 2.0 + 260.0 * ((i + 1) / N) ** 2
            p = d * ((z0 + z1) / 2) + off
            dens = np.maximum(self.field(p) - thr, 0.0) * k * 40.0
            probe = np.maximum(self.field(p + sun_c * 9.0) - thr, 0.0) * k * 40.0
            light = np.exp(-probe * 6.0)[..., None]
            c = shade_c + (lit_c - shade_c) * light
            a = 1.0 - np.exp(-dens * (z1 - z0) / 40.0)
            col += trans[..., None] * a[..., None] * c
            trans *= 1.0 - a
        alpha = 1.0 - trans
        # いちばん濃いところは、画面全部が雲（白い）
        full = float(smoothstep(0.78, 1.0, amount))
        avg = col.sum((0, 1)) / max(1e-6, alpha.sum())
        col = col + (1.0 - alpha)[..., None] * avg * full
        alpha = alpha + (1.0 - alpha) * full
        up = lambda a: np.asarray(Image.fromarray(a).resize((W, H), Image.BILINEAR))
        col = np.stack([up(col[..., c]) for c in range(3)], -1)
        return col, up(alpha.astype(np.float32))


END_WHITE = (0.955, 0.945, 0.925)  # 最後の雲の白（アプリはこの色からホームへ移る）


def compose_final(out: str, frames: list[int], post: str) -> None:
    """2つの場面をつなぎ、雲の中を抜けるところを重ね、粒と周辺の暗さを足して、最後のコマにする"""
    clouds = Clouds()
    cut = int(round(P.CUT_LOCAL * P.FPS))
    os.makedirs(out, exist_ok=True)
    for f in frames:
        t = f / P.FPS
        scene = "global" if f < cut else "local"
        src = os.path.join(post, scene, f"{f:04d}.png")
        if not os.path.exists(src):
            continue  # まだ描いていないコマ（間引いて描いたとき）
        im = Image.open(src).convert("RGB")
        v = np.asarray(im, np.float32) / 255.0
        amount = P.cloudiness(t)
        if amount > 0.003:
            H, W = v.shape[:2]
            ending = t > P.CUT_LOCAL + 2.0
            flow = np.array([0.0, -95.0, 30.0], np.float32) if ending else np.array([0.0, 0.0, 140.0], np.float32)
            col, alpha = clouds.layer(f, scene, W, H, amount, flow)
            v = v * (1.0 - alpha[..., None]) + col * alpha[..., None]
            if ending:  # 最後はむらのない白へ
                e = float(smoothstep(P.T_END - 0.35, P.T_END - 1.0 / P.FPS, t))
                v = v * (1 - e) + np.array(END_WHITE, np.float32) * e
        Image.fromarray(grain_vignette(v, f, 0.16 * (1.0 - amount), 0.006)).save(os.path.join(out, f"{f:04d}.png"))
        print(f"仕上げ コマ {f}", flush=True)


_ATM: dict = {}


def _scene_frame(job: tuple) -> int:
    """1コマ（並べて動かす作業の 1 つ）：空気を足し、白鳥を重ね、色を仕上げて PNG にする"""
    scene, f, src, out, swans = job
    if scene not in _ATM:
        _ATM[scene] = Local() if scene == "local" else Global()
    look = LOOK_LOCAL if scene == "local" else LOOK_GLOBAL
    d = read_exr(os.path.join(src, f"{f:04d}.exr"))
    lin = _ATM[scene].apply(f, d["Combined"][..., :3], d["Depth.Z"])
    lin = over_swans(lin, os.path.join(swans, f"{f:04d}.exr"))
    v = tone(lin, f, look)
    Image.fromarray((np.clip(v, 0, 1) * 255.0 + 0.5).astype(np.uint8)).save(os.path.join(out, f"{f:04d}.png"))
    return f


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("scene", choices=["local", "global", "final"])
    ap.add_argument("--frames", default="")
    ap.add_argument("--src", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--swans", default=os.path.join(WORK, "film", "swans"))
    ap.add_argument("--post", default=os.path.join(WORK, "post"))
    ap.add_argument("--jobs", type=int, default=1, help="いくつ並べて動かすか（コマごとに分ける）")
    a = ap.parse_args()
    sel = None
    if a.frames:
        sel = set()
        for part in a.frames.split(","):
            lo, _, hi = part.partition("-")
            sel |= set(range(int(lo), int(hi or lo) + 1))
    if a.scene == "final":
        frames = list(range(int(round(P.T_END * P.FPS))))
        if sel is not None:
            frames = [f for f in frames if f in sel]
        out = a.out or os.path.join(WORK, "frames")
        if a.jobs > 1:
            from multiprocessing import Pool

            chunks = [frames[i :: a.jobs] for i in range(a.jobs)]
            with Pool(a.jobs) as pool:
                pool.starmap(compose_final, [(out, c, a.post) for c in chunks])
        else:
            compose_final(out, frames, a.post)
        return
    src = a.src or os.path.join(WORK, "film", a.scene)
    out = a.out or os.path.join(a.post, a.scene)
    os.makedirs(out, exist_ok=True)
    frames = sorted(int(n[:4]) for n in os.listdir(src) if n.endswith(".exr"))
    if sel is not None:
        frames = [f for f in frames if f in sel]
    if a.scene == "local":
        Local()  # 地形の影の高さの地図を先に作っておく（並べて動かす作業が、それぞれ作り直さないように）
    jobs = [(a.scene, f, src, out, a.swans) for f in frames]
    if a.jobs > 1:
        from multiprocessing import Pool

        with Pool(a.jobs) as pool:
            for f in pool.imap_unordered(_scene_frame, jobs):
                print(f"コマ {f}", flush=True)
    else:
        for j in jobs:
            print(f"コマ {_scene_frame(j)}", flush=True)


if __name__ == "__main__":
    main()
