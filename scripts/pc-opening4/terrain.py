#!/usr/bin/env python3
"""地形（吊尾根のヒーロー止め絵）：標高データの取得・段つきの面・岩の置き方。第4版 PLAN 2・3・4 章。

使い方（Blender 5.3 の python で）：
  python terrain.py fetch            # 国土地理院の 1m 標高・5m 標高・航空写真を WORK/terrain4 に取る（取ったタイルは取り直さない）
  python terrain.py render hero [--res 3840x2160] [--spp 128] [--blur] [--out PATH]
  python terrain.py render back ...  # 同じ場所から北東（尾根ぞいの日なたの壁）を見る
出典：「地理院タイル（標高タイル（DEM1A・DEM5A）・全国最新写真（シームレス））を加工して作成」（国土地理院）。
"""
from __future__ import annotations

import http.client
import io
import json
import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import config  # noqa: E402

WORK = str(config.WORK)
TDIR = os.path.join(WORK, "terrain4")
from pathlib import Path  # noqa: E402
TPATH = Path(TDIR)
UA = "Mozilla/5.0 (compatible; terrain-fetch/1.0)"
HOST = "cyberjapandata.gsi.go.jp"
LAT0, LON0 = 36.2868, 137.6525          # L2：吊尾根の奥穂高岳寄り
HEADING = 200.0                          # カメラの向き（北から時計回り）
# 取る範囲（中心のタイルから前後左右に何枚）
SETS = {
    "dem1a": ("dem1a_png", 17, 5),       # 約 0.96m・約 2.7km 四方
    "photo17": ("seamlessphoto", 17, 5),  # 同じ範囲の航空写真（色むらだけに使う）
    "dem5a": ("dem5a_png", 15, 4),       # 約 3.8m・約 8.8km 四方
}
_conn = None
_last = [0.0]


def _tile_xy(lat, lon, z):
    n = 2 ** z
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def _get(url_path, cache):
    """1 秒に 4 枚まで（全体）。つなぎっぱなし。取ったタイルは残す"""
    global _conn
    if os.path.exists(cache):
        return open(cache, "rb").read() or None
    data = None
    for attempt in range(5):
        wait = 0.26 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            if _conn is None:
                _conn = http.client.HTTPSConnection(HOST, timeout=30)
            _conn.request("GET", url_path, headers={"User-Agent": UA, "Connection": "keep-alive"})
            r = _conn.getresponse()
            body = r.read()
            if r.status == 200:
                data = body
                break
            if r.status == 404:
                data = b""
                break
            time.sleep(2 * (attempt + 1))
        except (OSError, http.client.HTTPException):
            _conn = None
            time.sleep(2 * (attempt + 1))
    if data is None:
        return None
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    open(cache + ".part", "wb").write(data)
    os.replace(cache + ".part", cache)
    return data or None


def decode_dem(rgb):
    r, g, b = (rgb[..., i].astype(np.int64) for i in range(3))
    v = r * 65536 + g * 256 + b
    h = np.where(v < 2 ** 23, v, v - 2 ** 24).astype(np.float64) * 0.01
    h[v == 2 ** 23] = np.nan
    return h.astype(np.float32)


def fetch(names=None):
    from PIL import Image
    os.makedirs(TDIR, exist_ok=True)
    for name in names or SETS:
        kind, z, k = SETS[name]
        cx, cy = _tile_xy(LAT0, LON0, z)
        x0, y0 = cx - k, cy - k
        nt = 2 * k + 1
        isdem = kind.startswith("dem")
        out = np.full((nt * 256, nt * 256), np.nan, np.float32) if isdem else np.zeros((nt * 256, nt * 256, 3), np.uint8)
        miss = 0
        t0 = time.time()
        for ty in range(nt):
            for tx in range(nt):
                x, y = x0 + tx, y0 + ty
                ext = "png" if isdem else "jpg"
                d = _get(f"/xyz/{kind}/{z}/{x}/{y}.{ext}", os.path.join(TDIR, "tiles", kind, str(z), str(x), f"{y}.{ext}"))
                if d is None:
                    miss += 1
                    continue
                img = np.asarray(Image.open(io.BytesIO(d)).convert("RGB"))
                sl = (slice(ty * 256, (ty + 1) * 256), slice(tx * 256, (tx + 1) * 256))
                out[sl] = decode_dem(img) if isdem else img
        meta = {"z": z, "x0": x0, "y0": y0, "nx": nt, "ny": nt, "kind": kind}
        if isdem:
            meta["nan_fraction"] = float(np.isnan(out).mean())
            np.save(os.path.join(TDIR, f"{name}.npy"), out)
        else:
            Image.fromarray(out).save(os.path.join(TDIR, f"{name}.jpg"), quality=95)
        json.dump(meta, open(os.path.join(TDIR, f"{name}.json"), "w"))
        print(f"{name}: {nt}x{nt} 枚 取れなかった {miss} 枚 {time.time() - t0:.0f} 秒", flush=True)


# ---------------------------------------------------------------------------------------------
# 標高：細かい標高（1m）→ 5m → 谷（10m）→ 広い範囲の順に、縁をなだらかに重ねる。3 次補間（1m の格子が 0.125m の面に菱形に出ないように）
# ---------------------------------------------------------------------------------------------
from scipy import ndimage as ndi  # noqa: E402

import geo4  # noqa: E402


def smooth(a, b, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


class Layer:
    def __init__(self, grid, feather):
        a = grid.arr.astype(np.float64)
        bad = ~np.isfinite(a)
        if bad.any():
            idx = ndi.distance_transform_edt(bad, return_distances=False, return_indices=True)
            a = a[tuple(idx)]
        self.coef = ndi.spline_filter(a, order=3, mode="nearest")
        self.g = grid
        self.feather = feather
        self.pix = geo4.EARTH * geo4.K0 / (2.0 ** grid.meta["z"] * 256.0)

    def weight(self, e, n):
        r, c = self.g.rc(e, n)
        m = np.minimum(np.minimum(r, self.g.H - 1 - r), np.minimum(c, self.g.W - 1 - c))
        return smooth(0.0, self.feather, m * self.pix)

    def sample(self, e, n):
        r, c = self.g.rc(e, n)
        return ndi.map_coordinates(self.coef, [r.ravel(), c.ravel()], order=3, prefilter=False, mode="nearest").reshape(r.shape)


class Height:
    """本当の標高（m）。細かい順に上書きする。"""

    def __init__(self):
        mk = geo4.Grid
        self.mid = Layer(mk("mid", config.WIDE_DIR), 1.0)
        self.layers = [Layer(mk("far", config.TERRAIN_DIR), 1500.0), Layer(mk("valley", config.TERRAIN_DIR), 400.0),
                       Layer(mk("dem5a", TPATH), 150.0), Layer(mk("dem1a", TPATH), 60.0)]
        self.photo = None

    def __call__(self, e, n):
        h = self.mid.sample(e, n)
        for L in self.layers:
            w = L.weight(e, n)
            sel = w > 0
            if sel.any():
                hs = L.sample(e[sel], n[sel])
                h[sel] = h[sel] * (1 - w[sel]) + hs * w[sel]
        return h

    def photo_fields(self, e, n):
        """航空写真（1m）から色むら（色合いの比）と緑の濃さ。写真の外は (1,1,1) と -1（＝使わない）"""
        if self.photo is None:
            from PIL import Image
            Image.MAX_IMAGE_PIXELS = None
            g = geo4.Grid("dem1a", TPATH)
            a = np.asarray(Image.open(os.path.join(TDIR, "photo17.jpg")).convert("RGB")).astype(np.float32) / 255.0
            lin = a ** 2.2
            low = np.stack([ndi.gaussian_filter(lin[..., i], 3.0) for i in range(3)], -1)
            lum = low.mean(-1, keepdims=True) + 1e-4
            ratio = low / lum
            ratio /= np.median(ratio.reshape(-1, 3), axis=0)
            green = ndi.gaussian_filter(lin[..., 1] - 0.5 * (lin[..., 0] + lin[..., 2]), 1.5)
            # 写真の撮影の影は割る：緑の濃さは明るさで割った比にする
            green = green / (ndi.gaussian_filter(lin.mean(-1), 6.0) + 0.02)
            self.photo = (g, ratio.astype(np.float32), green.astype(np.float32), Layer(g, 40.0))
        g, ratio, green, lay = self.photo
        r, c = g.rc(e, n)
        out = np.ones(e.shape + (3,), np.float32)
        gr = np.full(e.shape, -1.0, np.float32)
        ok = (r > 1) & (r < g.H - 2) & (c > 1) & (c < g.W - 2)
        if ok.any():
            rr, cc = r[ok], c[ok]
            for i in range(3):
                out[..., i][ok] = ndi.map_coordinates(ratio[..., i], [rr, cc], order=1, mode="nearest")
            gr[ok] = ndi.map_coordinates(green, [rr, cc], order=1, mode="nearest")
            w = lay.weight(e, n)
            out = 1.0 + (out - 1.0) * w[..., None]
        return np.clip(1.0 + 0.5 * (out - 1.0), 0.85, 1.15), gr


# ---------------------------------------------------------------------------------------------
# 位置から決まる乱数・雑音（物の番号でなく場所の格子から。何台で描いても同じ絵）
# ---------------------------------------------------------------------------------------------
def hashf(ix, iy, seed):
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + int(seed) * 2246822519) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float64) / 16777216.0


def vnoise(E, N, scale, seed):
    """なめらかな値雑音 0..1（1 周期が scale m）"""
    u, v = E / scale, N / scale
    ix, iy = np.floor(u), np.floor(v)
    fu, fv = u - ix, v - iy
    fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
    a, b = hashf(ix, iy, seed), hashf(ix + 1, iy, seed)
    c, d = hashf(ix, iy + 1, seed), hashf(ix + 1, iy + 1, seed)
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv


def vor(E, N, L, phi_deg, aniso, seed):
    """ずらした格子の最近点（ボロノイ）。割れ目の向き phi・細長さ aniso でそろえた座標で"""
    ph = math.radians(phi_deg)
    cs, sn = math.cos(ph), math.sin(ph)
    u = (E * cs + N * sn) / (L * aniso)
    v = (-E * sn + N * cs) / L
    ix, iy = np.floor(u), np.floor(v)
    b1 = np.full(E.shape, 1e9)
    b2 = np.full(E.shape, 1e9)
    bx = np.zeros(E.shape)
    by = np.zeros(E.shape)
    bpx = np.zeros(E.shape)
    bpy = np.zeros(E.shape)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            cx, cy = ix + dx, iy + dy
            px = cx + 0.15 + 0.7 * hashf(cx, cy, seed)
            py = cy + 0.15 + 0.7 * hashf(cx, cy, seed + 1)
            d = np.hypot(u - px, v - py)
            nb = d < b1
            nb2 = (~nb) & (d < b2)
            b2 = np.where(nb, b1, np.where(nb2, d, b2))
            bx, by = np.where(nb, cx, bx), np.where(nb, cy, by)
            bpx, bpy = np.where(nb, px, bpx), np.where(nb, py, bpy)
            b1 = np.where(nb, d, b1)
    return b1, b2, bx, by, u - bpx, v - bpy


# 割れ目の向き（東から反時計まわり）。穂高の稜線の節理に合わせた 2 組
JOINT_A, JOINT_B = 38.0, 118.0


def block_band(E, N, L, phi, aniso, seed, ceff, amp=0.11):
    """割れ目で区切られた岩のかたまり。上面は少し傾き、縁は面取りされ、境は溝になる"""
    d1, d2, cx, cy, du, dv = vor(E, N, L, phi, aniso, seed)
    e = (d2 - d1) * 0.5
    ra, rb, rc = hashf(cx, cy, seed + 2), hashf(cx, cy, seed + 3), hashf(cx, cy, seed + 4)
    top = (ra - 0.5) * 2 * amp * L
    plane = (rb - 0.5) * 2 * 0.40 * du * L * aniso + (rc - 0.5) * 2 * 0.18 * dv * L
    wed = np.maximum(0.09, 1.6 * ceff / L)
    g = smooth(0.0, wed, e)
    dz = (top + plane) * g - 0.045 * L * (1.0 - smooth(0.0, wed * 0.55, e))
    crack = 1.0 - smooth(0.0, wed * 0.8, e)
    return dz, crack


def stair(u):
    f = u - np.floor(u)
    return np.floor(u) + smooth(0.60, 1.0, f)


def rock_detail(E, N, z0, slope, ceff, zabs):
    """0.1〜30m の岩の形を足す：かたまり 4 段・層の段差 2 段・ガレ。ceff（その場所の面の細かさ）より細かい段は切る。
    返す：(高さの足し分 m, 割れ目の濃さ 0..1)"""
    rock = np.maximum(smooth(2250.0, 2650.0, zabs), smooth(28.0, 44.0, slope))
    steep = smooth(14.0, 46.0, slope)
    gain = rock * (0.35 + 0.65 * steep)
    dz = np.zeros(E.shape)
    crack = np.zeros(E.shape)
    for L, phi, an, seed in ((0.9, JOINT_A, 1.6, 101), (2.7, JOINT_B, 1.8, 211), (8.0, JOINT_A, 1.5, 307), (24.0, JOINT_B, 1.7, 419), (62.0, JOINT_A, 1.6, 509), (150.0, JOINT_B, 1.5, 613)):
        w = smooth(2.2, 4.2, L / ceff)
        if w <= 0.001:
            continue
        a, c = block_band(E, N, L, phi + 6 * (seed % 5), an, seed, ceff, amp=0.11 if L < 30 else (0.085 if L < 100 else 0.05))
        dz += gain * w * a
        crack = np.maximum(crack, w * c * rock)
    # 層・節理の面にそった段差（急な面の水平な棚）
    z1 = z0 + dz
    for P, seed, wgt in ((1.6, 31, 0.55), (5.5, 47, 0.8), (17.0, 59, 0.9), (44.0, 61, 0.9)):
        w = smooth(2.2, 4.2, P * 0.5 / ceff)
        if w <= 0.001:
            continue
        warp = 1.4 * (vnoise(E, N, 7.0 * P / 1.6, seed) - 0.5) * 2 + 0.7 * (vnoise(E, N, 2.3 * P / 1.6, seed + 1) - 0.5) * 2
        u = z1 / P + warp
        gate = rock * smooth(26.0, 50.0, slope) * wgt
        dz += (stair(u) - u) * P * gate * 0.55 * w
    # ガレ（割れた石の山）：中くらいの傾きの岩の地面
    w = smooth(2.2, 4.2, 0.9 / ceff)
    if w > 0.001:
        d1, d2, cx, cy, du, dv = vor(E, N, 0.8, 17.0, 1.0, 523)
        r = hashf(cx, cy, 524)
        dome = np.clip(1.0 - (d1 / (0.46 + 0.1 * r)) ** 2, 0.0, 1.0)
        talus = rock * smooth(8.0, 20.0, slope) * (1 - smooth(40.0, 55.0, slope))
        dz += talus * w * 0.30 * (0.4 + r) * np.sqrt(dome) * 0.5
        crack = np.maximum(crack, talus * w * (1 - smooth(0.0, 0.2, (d2 - d1) * 0.5)) * 0.7)
    return dz, np.clip(crack, 0, 1)


def snow_field(Z, zabs, E, N, c, rockrel):
    """新雪：上を向いた面・くぼみ・棚に積もり、急な面と風に吹かれる尾根は岩が出る。
    返す：(積もった厚さ m, 雪の濃さ 0..1)"""
    def g(a, s_m):
        return ndi.gaussian_filter(a, max(s_m / c, 0.7), mode="nearest")
    sm = g(Z, 0.45)
    gy, gx = np.gradient(sm, c)
    th = np.degrees(np.arctan(np.hypot(gx, gy)))
    hollow = smooth(-0.05, 0.65, g(Z, 3.0) - Z)
    crest = Z - g(Z, 12.0)
    wind = 1.0 - 0.85 * smooth(0.6, 4.5, crest)
    nx = -gx / np.sqrt(1 + gx * gx + gy * gy)
    wind *= 1.0 - 0.45 * smooth(0.15, 0.75, -nx)          # 西風にさらされる面は少ない
    alt = smooth(2300.0, 2650.0, zabs)
    sl = 1.0 - smooth(30.0, 50.0, th)
    patch = 0.62 * vnoise(E, N, 21.0, 701) + 0.38 * vnoise(E, N, 5.5, 702)
    s = sl * alt * wind * (0.50 + 0.85 * hollow) * (0.55 + 0.95 * patch) * rockrel
    m = smooth(0.26, 0.42, s)
    m = ndi.gaussian_filter(m, max(0.12 / c, 0.6))
    depth = m * (0.05 + 0.10 * sl + 0.55 * hollow * sl)
    Zs = Z + depth
    Zs = Zs * (1 - 0.8 * m) + g(Zs, 0.35) * 0.8 * m
    return Zs - Z, m


# ---------------------------------------------------------------------------------------------
# 面（段つきの輪：中心ほど細かい）
# ---------------------------------------------------------------------------------------------
C0 = 0.125
NCELL = 512
NRING = 12


class Rings:
    """中心 (ce, cn) のまわりに、細かさが 2 倍ずつ粗くなる 12 枚の四角い輪。座標は中心を原点にした東・北・本当の高さ"""

    def __init__(self, ce, cn, hfun=None):
        self.ce, self.cn = float(ce), float(cn)
        self.h = hfun or Height()
        self.rings = []

    def build(self, log=print):
        N = NCELL
        t0 = time.time()
        for k in range(NRING):
            c = C0 * 2 ** k
            R = N // 2 * c
            ii = np.arange(N + 1) - N // 2
            E = self.ce + ii[None, :] * c + np.zeros((N + 1, 1))
            Nn = self.cn + ii[:, None] * c + np.zeros((1, N + 1))
            rinf = np.maximum(np.abs(E - self.ce), np.abs(Nn - self.cn))
            ceff = c * (1.0 + smooth(0.7 * R, R, rinf))
            ceff = np.max(ceff) if False else ceff
            hb = self.h(E, Nn)
            sm = ndi.gaussian_filter(hb, max(c, 1.0) / c if c < 1.0 else 1.0, mode="nearest")
            gy, gx = np.gradient(sm, c)
            slope = np.degrees(np.arctan(np.hypot(gx, gy)))
            dz = np.zeros_like(hb)
            crack = np.zeros_like(hb)
            # 面の細かさ ceff は場所で変わる。割り当ては 2 段（c と 2c）で作って混ぜる
            lo = (rinf <= 0.7 * R)
            for ce_val, sel in ((c, None), (2 * c, None)):
                d_, c_ = rock_detail(E, Nn, hb, slope, ce_val, hb)
                if ce_val == c:
                    dz_a, cr_a = d_, c_
                else:
                    dz_b, cr_b = d_, c_
            wmix = smooth(0.7 * R, R, rinf)
            dz = dz_a * (1 - wmix) + dz_b * wmix
            crack = cr_a * (1 - wmix) + cr_b * wmix
            z0 = hb + dz
            rockrel = np.maximum(smooth(2250.0, 2650.0, z0), 0.0)
            sd, sm_ = snow_field(z0, z0, E, Nn, c, 1.0)
            z = z0 + sd
            tint, green = self.h.photo_fields(E, Nn)
            zr = hb
            vegr = (1 - smooth(2300.0, 2600.0, zr)) * (1 - smooth(34.0, 52.0, slope)) * (0.55 + 0.45 * vnoise(E, Nn, 40.0, 811))
            veg = np.where(green > -0.5, np.clip(smooth(0.05, 0.20, green), 0, 1) * (1 - smooth(2380.0, 2580.0, zr)) * (1 - smooth(38.0, 54.0, slope)), vegr)
            veg = veg * (1 - 0.9 * sm_)
            # 地球の丸み（カメラから見て水平線で下がる）
            drop = ((E - self.ce) ** 2 + (Nn - self.cn) ** 2) / (2.0 * geo4.R_EARTH)
            self.rings.append(dict(k=k, c=c, R=R, E=E - self.ce, N=Nn - self.cn, z=(z - drop).astype(np.float32),
                                   snow=sm_.astype(np.float32), crack=crack.astype(np.float32), veg=veg.astype(np.float32),
                                   tint=tint, depth=sd.astype(np.float32), slope=slope.astype(np.float32), zabs=z.astype(np.float32)))
            log(f"  輪 {k}: 細かさ {c:g}m 半幅 {R:g}m  {time.time() - t0:.0f} 秒")
        return self

    def z_at(self, e, n):
        """中心からの東・北（m）での面の高さ（いちばん細かい輪で双線形）"""
        e, n = np.asarray(e, float), np.asarray(n, float)
        out = np.zeros(e.shape)
        done = np.zeros(e.shape, bool)
        for rg in self.rings:
            c, R = rg["c"], rg["R"]
            inside = (np.abs(e) < R * 0.98) & (np.abs(n) < R * 0.98) & ~done
            if inside.any():
                fi = (e[inside] / c) + NCELL / 2
                fj = (n[inside] / c) + NCELL / 2
                out[inside] = ndi.map_coordinates(rg["z"], [fj, fi], order=1)
                done |= inside
        return out

    def normal_at(self, e, n, d=0.8):
        zx = (self.z_at(e + d, n) - self.z_at(e - d, n)) / (2 * d)
        zy = (self.z_at(e, n + d) - self.z_at(e, n - d)) / (2 * d)
        nn = np.stack([-zx, -zy, np.ones_like(zx)], -1)
        return nn / np.linalg.norm(nn, axis=-1, keepdims=True)

    def mesh_arrays(self):
        """すべての輪を 1 枚の面にまとめる。穴（内側の輪の場所）は抜き、境に下向きのスカートを付ける（すき間が見えないように）"""
        N = NCELL
        co, fa, att_snow, att_crack, att_veg, att_tint = [], [], [], [], [], []
        base = 0
        for rg in self.rings:
            k, c = rg["k"], rg["c"]
            cells = np.ones((N, N), bool)
            if k > 0:
                cells[N // 4: 3 * N // 4, N // 4: 3 * N // 4] = False
            rr, cc = np.nonzero(cells)
            a = rr * (N + 1) + cc
            quads = np.stack([a, a + 1, a + N + 2, a + N + 1], 1)
            used = np.zeros((N + 1) * (N + 1), bool)
            used[quads.ravel()] = True
            # スカートの縁（外周と穴の周り）
            edges = []
            ring_idx = np.arange(N + 1)
            outer = [(0, ring_idx), (N, ring_idx)]
            lines = []
            for i in range(N):
                lines += [(0 * (N + 1) + i, 0 * (N + 1) + i + 1), (N * (N + 1) + i, N * (N + 1) + i + 1),
                          (i * (N + 1), (i + 1) * (N + 1)), (i * (N + 1) + N, (i + 1) * (N + 1) + N)]
            if k > 0:
                h0, h1 = N // 4, 3 * N // 4
                for i in range(h0, h1):
                    lines += [(h0 * (N + 1) + i, h0 * (N + 1) + i + 1), (h1 * (N + 1) + i, h1 * (N + 1) + i + 1),
                              (i * (N + 1) + h0, (i + 1) * (N + 1) + h0), (i * (N + 1) + h1, (i + 1) * (N + 1) + h1)]
            lines = np.array(lines)
            used[lines.ravel()] = True
            newid = np.cumsum(used) - 1
            nv = int(used.sum())
            zf = rg["z"].ravel()
            P = np.stack([rg["E"].ravel(), rg["N"].ravel(), zf], 1)[used]
            q = newid[quads]
            # スカート
            depth = 1.5 * c + 0.4
            sk_idx = np.unique(lines.ravel())
            sk_new = np.full((N + 1) * (N + 1), -1)
            sk_new[sk_idx] = nv + np.arange(len(sk_idx))
            Psk = np.stack([rg["E"].ravel()[sk_idx], rg["N"].ravel()[sk_idx], zf[sk_idx] - depth], 1)
            sq = np.stack([newid[lines[:, 0]], newid[lines[:, 1]], sk_new[lines[:, 1]], sk_new[lines[:, 0]]], 1)
            pts = np.concatenate([P, Psk]).astype(np.float32)
            allq = np.concatenate([q, sq]) + base
            co.append(pts)
            fa.append(allq.astype(np.int32))
            for lst, key in ((att_snow, "snow"), (att_crack, "crack"), (att_veg, "veg")):
                f = rg[key].ravel()
                lst.append(np.concatenate([f[used], f[sk_idx]]).astype(np.float32))
            t = rg["tint"].reshape(-1, 3)
            tt = np.concatenate([t[used], t[sk_idx]])
            att_tint.append(np.concatenate([tt, np.ones((len(tt), 1), np.float32)], 1).astype(np.float32))
            base += len(pts)
        return (np.concatenate(co), np.concatenate(fa), np.concatenate(att_snow), np.concatenate(att_crack),
                np.concatenate(att_veg), np.concatenate(att_tint))


def place_rocks(rg, n_total=360, seed=7):
    """置く岩の位置・大きさ・向き（中心からの東・北）。穂高の岩稜：高い所の尾根ぞいと谷のガレに多く、近くほど密。
    場所だけから決める乱数（物の番号 → default_rng((種類, 番号))）"""
    items = []
    k = 0
    tries = 0
    while len(items) < n_total and tries < 40000:
        tries += 1
        r = default_rng_((seed, 1, tries))
        u = r.random()
        dist = 18.0 + 420.0 * u ** 2
        ang = r.random() * 2 * math.pi
        e, n = dist * math.cos(ang), dist * math.sin(ang)
        z = float(rg.z_at(np.array([e]), np.array([n]))[0])
        nrm = rg.normal_at(np.array([e]), np.array([n]))[0]
        slope = math.degrees(math.acos(min(1.0, nrm[2])))
        rock = float(smooth(2300.0, 2650.0, z + 0.0) if False else smooth(2300.0, 2650.0, z))
        zb = rg.z_at(np.array([e + 6.0]), np.array([n]))[0] + rg.z_at(np.array([e - 6.0]), np.array([n]))[0] + \
            rg.z_at(np.array([e]), np.array([n + 6.0]))[0] + rg.z_at(np.array([e]), np.array([n - 6.0]))[0]
        conc = zb / 4.0 - z                      # 正＝くぼみ（ガレの溜まる所）
        crest = -conc                           # 正＝尾根の出っぱり
        p = 0.15 + 0.85 * rock
        p *= 0.35 + 0.65 * float(smooth(10.0, 28.0, slope)) * (1.0 - 0.7 * float(smooth(60.0, 78.0, slope)))
        p *= 0.55 + 0.45 * float(smooth(-0.3, 1.5, conc)) + 0.45 * float(smooth(0.2, 2.0, crest))
        if r.random() > min(1.0, p):
            continue
        big = r.random() < 0.07
        if big and slope > 38:
            size = math.exp(r.uniform(math.log(6.0), math.log(15.0)))
            kind = "cliff"
        else:
            size = math.exp(r.uniform(math.log(0.45), math.log(3.4))) * (1.0 + 0.9 * float(smooth(120.0, 420.0, dist)))
            kind = "rock"
        items.append(dict(e=e, n=n, z=z, normal=nrm.tolist(), size=size, kind=kind, yaw=r.random() * 360.0,
                          tilt=r.normal(0, 14.0), tiltdir=r.random() * 360.0, model=int(r.integers(0, 1000)),
                          sink=r.uniform(0.18, 0.38), aniso=r.uniform(0.8, 1.25), val=r.random()))
    return items


def default_rng_(key):
    return np.random.default_rng(key)


# ---------------------------------------------------------------------------------------------
# 場面を組んで描く（止め絵用）
# ---------------------------------------------------------------------------------------------
VIEWS = {
    # 名前: (向き, 傾き, 輪の中心をカメラの前へずらす m, 速さ m/s)
    "hero": dict(heading=200.0, pitch=-10.0, ahead=45.0, speed=60.0),
    "back": dict(heading=40.0, pitch=-4.0, ahead=45.0, speed=60.0),
}


def render_view(view="hero", res=(3840, 2160), spp=128, blur=True, out=None, rocks=360, exposure=0.0, borders=None, adaptive=False, log=print):
    import bpy
    import resource
    from mathutils import Euler, Matrix, Quaternion, Vector
    import ground
    t0 = time.time()
    V = VIEWS[view]
    h = Height()
    ce0, cn0 = geo4.to_local(LON0, LAT0)
    hd = math.radians(V["heading"])
    fwd = np.array([math.sin(hd), math.cos(hd)])
    cache = os.path.join(WORK, "terrain4", f"rings_{view}.npz")
    R = Rings(ce0 + V["ahead"] * fwd[0], cn0 + V["ahead"] * fwd[1], h).build(log)
    co, fa, a_snow, a_crack, a_veg, a_tint = R.mesh_arrays()
    log(f"面 {len(fa)} 枚（{time.time() - t0:.0f} 秒）")
    # カメラ：道すじ（route.json のコマ 240＝10.0 秒）。尾根の 18m 上・向き 201°・傾き -9.9°・横の傾き -0.8°
    rt = {"e": ce0, "n": cn0, "z": 0.0, "heading_deg": V["heading"], "pitch_deg": V["pitch"], "roll_deg": 0.0}
    try:
        for q in json.load(open(os.path.join(WORK, "route.json"))):
            if q["f"] == 240:
                rt = q
    except OSError:
        pass
    if view == "hero":
        hd = math.radians(rt["heading_deg"])
        V = dict(V, heading=rt["heading_deg"], pitch=rt["pitch_deg"], speed=rt.get("speed", V["speed"]))
        ce0, cn0 = rt["e"], rt["n"]
    dxy = np.array([ce0 - R.ce, cn0 - R.cn])
    ox, oy = np.meshgrid(np.linspace(-6, 6, 9), np.linspace(-6, 6, 9))
    zc = float(R.z_at(dxy[0] + ox, dxy[1] + oy).max())
    cam_pos = Vector((dxy[0], dxy[1], max(rt["z"], zc + 17.0) if view == "hero" else zc + 20.0))
    log(f"カメラ {cam_pos[:]}  尾根の高さ {zc:.1f}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    me = bpy.data.meshes.new("terrain")
    me.vertices.add(len(co))
    me.vertices.foreach_set("co", co.ravel())
    me.loops.add(len(fa) * 4)
    me.loops.foreach_set("vertex_index", fa.ravel())
    me.polygons.add(len(fa))
    me.polygons.foreach_set("loop_start", np.arange(len(fa), dtype=np.int32) * 4)
    me.polygons.foreach_set("loop_total", np.full(len(fa), 4, np.int32)) if False else None
    me.update()
    for nm, ty, arr, key in (("snow", "FLOAT", a_snow, "value"), ("crack", "FLOAT", a_crack, "value"), ("veg", "FLOAT", a_veg, "value"),
                             ("tint", "FLOAT_COLOR", a_tint, "color")):
        at = me.attributes.new(nm, ty, "POINT")
        at.data.foreach_set(key, arr.ravel())
    me.shade_smooth()
    ob = bpy.data.objects.new("terrain", me)
    sc.collection.objects.link(ob)
    # 材質の座標は「本当の東・北」にそろえる（輪の中心が変わっても柄が動かない）
    mat = ground.build_terrain_material(offset=(R.ce - 1300.0, R.cn - 4200.0))
    me.materials.append(mat)
    log(f"地形の材質 {time.time() - t0:.0f} 秒")

    # 置く岩
    if rocks:
        models = ground.load_rock_models(log)
        plc = place_rocks(R, rocks)
        rock_models = [m for m in models if m[2] == "rock"]
        cliff_models = [m for m in models if m[2] == "cliff"]
        for i, p in enumerate(plc):
            pool = cliff_models if p["kind"] == "cliff" else rock_models
            nm, lods, _ = pool[p["model"] % len(pool)]
            dist = math.hypot(p["e"] - dxy[0], p["n"] - dxy[1])
            mesh = lods[min(len(lods) - 1, 0 if dist < 60 else 1 if dist < 200 else 2 if dist < 600 else 3)]
            o = bpy.data.objects.new(f"rock{i:03d}", mesh)
            sc.collection.objects.link(o)
            nrm = Vector(p["normal"])
            up = Vector((0, 0, 1))
            w = 0.9 if p["kind"] == "cliff" else 0.45
            ax = (up * (1 - w) + nrm * w)
            td = math.radians(p["tiltdir"])
            tl = math.radians(p["tilt"])
            ax = (ax + Vector((math.cos(td), math.sin(td), 0)) * math.tan(tl)).normalized()
            q = ax.to_track_quat("Z", "Y") @ Quaternion((0, 0, 1), math.radians(p["yaw"]))
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = q
            s = p["size"]
            o.scale = (s * p["aniso"], s / p["aniso"], s * (0.75 + 0.5 * p["val"]))
            o.location = (p["e"], p["n"], p["z"] - p["sink"] * s * 0.45)
        log(f"岩 {len(plc)} 個（{len(models)} 種）{time.time() - t0:.0f} 秒")

    sc.world = ground.make_world(115.0, 5.0)
    cam = bpy.data.cameras.new("cam")
    cam.lens = 24.0
    cam.sensor_width = 36.0
    cam.clip_start = 1.0
    cam.clip_end = 200000.0
    co_ = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co_)
    sc.camera = co_
    pitch = math.radians(V["pitch"])
    d = Vector((math.sin(hd) * math.cos(pitch), math.cos(hd) * math.cos(pitch), math.sin(pitch)))
    co_.rotation_mode = "QUATERNION"
    co_.rotation_quaternion = d.to_track_quat("-Z", "Y") @ Quaternion((0, 0, 1), -math.radians(rt["roll_deg"] if view == "hero" else 0.0))
    spd = V["speed"]
    vel = Vector((math.sin(hd), math.cos(hd), 0.0)) * spd
    sc.render.fps = 24
    sc.frame_start, sc.frame_end = 1, 3
    for fr in (1, 3):
        co_.location = cam_pos + vel * ((fr - 2) / 24.0)
        co_.keyframe_insert("location", frame=fr)
    for fc in co_.animation_data.action.layers[0].strips[0].channelbags[0].fcurves if hasattr(co_.animation_data.action, "layers") else co_.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    sc.frame_set(2)
    r = sc.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y, r.resolution_percentage = res[0], res[1], 100
    r.threads_mode, r.threads = "FIXED", 2
    r.use_motion_blur = bool(blur)
    r.motion_blur_shutter = 0.5
    for obj in (r, sc.cycles):
        if hasattr(obj, "motion_blur_position"):
            obj.motion_blur_position = "CENTER"
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = spp
    cy.use_adaptive_sampling = adaptive
    cy.adaptive_threshold = float(os.environ.get("TERRAIN_ADAPT", "0.03"))
    cy.adaptive_min_samples = max(16, spp // 4)
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    cy.denoising_prefilter = "ACCURATE"
    cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces, cy.transmission_bounces = 6, 3, 3, 2
    cy.volume_bounces = 1
    cy.sample_clamp_indirect = 8.0
    cy.volume_step_rate = 1.0
    cy.use_light_tree = True
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = exposure
    sc.display_settings.display_device = "sRGB"
    out = out or os.path.join(HERE, "review", "terrain", f"{view}.png")
    r.image_settings.file_format = "PNG"
    r.image_settings.color_depth = "8"
    r.filepath = out
    t1 = time.time()
    log(f"組み立て {t1 - t0:.0f} 秒。描く {res[0]}x{res[1]} {spp} 回 ぶれ={blur}")
    if borders:
        # 4K の画面のまま、枠の中だけ描く（左上が原点の画素。1:1 の切り出し用）
        r.use_border = True
        r.use_crop_to_border = True
        base_out = out[:-4] if out.endswith(".png") else out
        for i, (x0, y0, x1, y1) in enumerate(borders):
            r.border_min_x, r.border_max_x = x0 / res[0], x1 / res[0]
            r.border_min_y, r.border_max_y = 1 - y1 / res[1], 1 - y0 / res[1]
            r.filepath = f"{base_out}_{i}.png"
            bpy.ops.render.render(write_still=True)
            log(f"  枠 {i} {(time.time() - t1) / 60:.1f} 分")
    else:
        bpy.ops.render.render(write_still=True)
    t2 = time.time()
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1048576.0
    log(f"描画 {(t2 - t1) / 60:.1f} 分・メモリ最大 {rss:.1f}GB → {out}")
    return out


def _main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd")
    ap.add_argument("view", nargs="?", default="hero")
    ap.add_argument("--res", default="3840x2160")
    ap.add_argument("--spp", type=int, default=128)
    ap.add_argument("--blur", action="store_true")
    ap.add_argument("--out", default=None)
    ap.add_argument("--rocks", type=int, default=360)
    ap.add_argument("--exposure", type=float, default=0.0)
    ap.add_argument("--adaptive", action="store_true")
    ap.add_argument("--borders", default=None, help="x0,y0,x1,y1;... 左上原点の画素")
    a = ap.parse_args()
    if a.cmd == "fetch":
        fetch()
    elif a.cmd == "render":
        w, h_ = (int(x) for x in a.res.split("x"))
        render_view(a.view, (w, h_), a.spp, a.blur, a.out, a.rocks, a.exposure,
                    [tuple(int(v) for v in b.split(",")) for b in a.borders.split(";")] if a.borders else None, a.adaptive)


if __name__ == "__main__":
    _main()
