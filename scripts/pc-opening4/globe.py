"""MICHILU 第4版オープニング「宇宙から日本が現れる」（コマ 0〜135）の描き手。第 2 版（r2）。

第 1 版（Blender の Cycles 版）は、4K 全面で 1 コマ 25 分以上かかり、雲が 2 次元の切り抜きだったため、この版で作り直した。
旧版は git の履歴（コミット 33520dd の scripts/pc-opening4/globe.py）に残っている。山の場面の面（terrain_mesh など）が要るときはそちらを見る。

しくみ（すべて numpy。Blender は使わない。1 画素ずつ光線をたどる物理ベースの描き方）
  ・地球は半径 6371 km の球。座標は地球中心の座標（ECEF, km）。太陽は無限遠の 1 方向（コマごと）。
  ・材料は緯度経度の絵を入れ子にして重ねる: G（世界 0.044°）→ W2（0.01°）→ J（日本まわり 0.0025°）→ C2（中部 0.001°）。
  ・地面の光 = 反射率 x（太陽の直射 x 空気の通りぬけ x 斜面 x 地形の影 x 雲の影 + 空の明かり）。海は反射（フレネル + Cox-Munk の荒れた海の光の帯）。
  ・雲は連続した厚み（しきい値なし）から高さのある層にして、視線をたどって描き、太陽へ向けてたどって自分と地面へ影を落とす。
  ・空気は視線ぞいのレイリー・ミー・オゾンの 1 回散乱 + 多重散乱の近似。灯りは放射量から作り、雲の厚みでにじませる。
  ・カメラ・太陽・露出はコマ番号だけの関数（camera_state / sun_state / exposure_ev）。乱数は固定の種。

使い方
  python globe.py data=work/globe out=out frame=0,12,24 res=1920x1080 [border=x0,y0,x1,y1] [exr=1] [procs=4]
  python globe.py data=... previz=1 out=...        （640 幅の下絵: 海岸線 + 灯り。雲なし）
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

Image.MAX_IMAGE_PIXELS = None

FPS = 24.0
R_EARTH = 6371.0                    # km
T_LAT, T_LON = 36.29, 137.65        # 北アルプス（穂高）
SUN_AZ = 115.0                      # 北から時計回り（山の場面と同じ）
CUT_FRAME = 131                     # ここから山の場面
BEAT_A_END = 82                     # 場面 A の最後のコマは 81（3.4 秒）
ATM_TOP = 100.0                     # 空気の上端 km
SENSOR = 36.0                       # mm
CLOUD_TOP_MAX = 10.0                # 雲の層の上端 km

# ---------------------------------------------------------------- 小さな道具
def pchip(xs, ys):
    """形をくずさない 3 次補間（Fritsch-Carlson）。f(x) を返す。"""
    xs = np.asarray(xs, float); ys = np.asarray(ys, float)
    h = np.diff(xs); d = np.diff(ys) / h
    m = np.zeros(len(xs))
    m[0] = d[0]; m[-1] = d[-1]
    for i in range(1, len(xs) - 1):
        m[i] = 0.0 if d[i - 1] * d[i] <= 0 else 2 * d[i - 1] * d[i] / (d[i - 1] + d[i])
    def f(x):
        x = float(np.clip(x, xs[0], xs[-1]))
        i = int(np.clip(np.searchsorted(xs, x) - 1, 0, len(xs) - 2))
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f

def smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)

def sstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)

def nrm(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-30)

def srgb2lin(x):
    x = np.asarray(x, np.float32)
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).astype(np.float32)

def lin2srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)

# ---------------------------------------------------------------- 座標
def _basis(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    e = np.array([-math.sin(lo), math.cos(lo), 0.0])
    n = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    u = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    return e, n, u

E_T, N_T, U_T = _basis(T_LAT, T_LON)
P_T = R_EARTH * U_T                                   # 目印の地球中心座標
M_W = np.array([E_T, N_T, U_T])                       # 地球中心座標のベクトル → 世界（北アルプスの 東・北・上）
CENTER_W = -M_W @ P_T                                 # 地球の中心の世界座標 = (0,0,-R)

def ecef_to_world(p):
    return M_W @ (np.asarray(p, float) - P_T)

def vec_to_world(v):
    return M_W @ np.asarray(v, float)

def lonlat_ecef(lat, lon, alt=0.0):
    la, lo = np.radians(lat), np.radians(lon)
    return (R_EARTH + alt) * np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la) + 0 * lo], -1)

def ecef_lonlat(p):
    r = np.linalg.norm(p, axis=-1)
    return np.degrees(np.arctan2(p[..., 1], p[..., 0])), np.degrees(np.arcsin(np.clip(p[..., 2] / r, -1, 1))), r

def along(bearing_deg, dist_km, alt=0.0):
    """目印（北アルプス）から方位 bearing へ地面ぞいに dist km 進んだ点（地球中心座標）。"""
    b = math.radians(bearing_deg)
    d = math.sin(b) * E_T + math.cos(b) * N_T
    th = dist_km / R_EARTH
    q = math.cos(th) * U_T + math.sin(th) * d
    return (R_EARTH + alt) * q

def bearing_from_target(lat, lon):
    """点（緯度経度）が北アルプスから見て何度の向き・何 km かを返す。"""
    p = unit(lonlat_ecef(lat, lon))
    x = np.dot(p, E_T); y = np.dot(p, N_T)
    return math.degrees(math.atan2(x, y)) % 360.0, R_EARTH * math.acos(np.clip(np.dot(p, U_T), -1, 1))

# ---------------------------------------------------------------- カメラ・太陽・露出（コマ番号だけの関数）
def lens_mm(t):
    return 35.0 - 7.0 * smooth(3.4, 5.2, t)

# ---- 道すじ（位置は北アルプスのまわりの円: 方位 beta・地面ぞいの距離 D・高さ h。向きと下げ角は別に決める）
# 山の場面へつなぐ後半（3.4 秒〜）の D・h・見る点は、第 1 版の急降下の道すじ（手順 2）の値を鍵にしてそのまま使う。
# 降り方の作り直しは「降りる担当」の仕事（鍵の表 _TAIL を書き換えればよい）。
_KT_TAIL = [3.4, 3.8, 4.15, 4.45, 4.7, 4.9, 5.1, 5.458, 5.625]
_D_TAIL = [550.0, 330.0, 185.0, 105.0, 62.0, 43.0, 33.0, 15.0, 13.0]
_H_TAIL = [300.0, 135.0, 62.0, 31.0, 18.5, 12.8, 9.6, 3.05, 2.8]
_AIM_TAIL = [0.0, 5.0, 10.0, 16.0, 22.0, 28.0, 32.0, 36.0, 38.0]
_fD_T = pchip(_KT_TAIL, np.log(_D_TAIL)); _fH_T = pchip(_KT_TAIL, np.log(_H_TAIL)); _fAIM_T = pchip(_KT_TAIL, _AIM_TAIL)
# 出だし（0〜3.4 秒）: 高さ 2500 km から、1.0 秒までは 1% 未満 / コマでごくゆっくり進む（認識のための静止に近い時間）
_KT_HEAD = [0.0, 0.8, 1.7, 2.6, 3.4]
_D_HEAD = [1700.0, 1675.0, 1500.0, 900.0, 550.0]
_H_HEAD = [2500.0, 2470.0, 1900.0, 880.0, 300.0]
_fD_H = pchip(_KT_HEAD, np.log(_D_HEAD)); _fH_H = pchip(_KT_HEAD, np.log(_H_HEAD))
_DEP_HEAD = pchip([0.0, 1.0, 2.2, 3.4], [56.0, 56.0, 40.0, None or 30.0])
BETA0, BETA1 = 172.0, 20.0           # 北アルプスから見たカメラの方位: 南南東の太平洋の上 → 北北東（向き 200°）
TURN = dict(t0=0.8, t1=4.8, ramp=1.0)  # 回りこむ時間。角速度は台形（加速 1 秒・一定・減速 1 秒）

def turn_progress(t, t0=None, t1=None, ramp=None):
    """回りこみの進み（0〜1）。角速度が台形の積分。"""
    t0 = TURN["t0"] if t0 is None else t0; t1 = TURN["t1"] if t1 is None else t1; ramp = TURN["ramp"] if ramp is None else ramp
    T = t1 - t0; C = T - 2 * ramp; r = 1.0 / (ramp + C)
    u = min(max(t - t0, 0.0), T)
    if u < ramp:
        return r * u * u / (2 * ramp)
    if u <= ramp + C:
        return r * ramp / 2 + r * (u - ramp)
    return 1.0 - r * (T - u) ** 2 / (2 * ramp)

def beta_of(t):
    s = turn_progress(t)
    return BETA0 + (BETA1 - BETA0) * s

def camera_params(t, view=None):
    """カメラの位置 beta・D・h、向き heading（北が 0）、下げ角 dep（水平から下へ度）、レンズ mm。"""
    t = min(max(t, 0.0), 5.625)
    beta = beta_of(t)
    if t < 3.4:
        D = math.exp(_fD_H(t)); h = math.exp(_fH_H(t))
        heading = beta + 180.0
        dep = float(_DEP_HEAD(t))
    else:
        D = math.exp(_fD_T(t)); h = math.exp(_fH_T(t))
        cam = along(beta, D, h); up = unit(cam)
        aim = along(beta + 180.0, float(_fAIM_T(t)), 1.5)
        fwd_aim = unit(aim - cam)
        horiz = unit(fwd_aim - up * np.dot(fwd_aim, up))
        dep = math.degrees(math.asin(np.clip(-np.dot(fwd_aim, up), -1, 1))) + 9.0 * smooth(3.4, 4.1, t) * (1.0 - smooth(4.5, 5.3, t))
        e_c = unit(np.cross([0, 0, 1.0], up)); n_c = np.cross(up, e_c)
        heading = math.degrees(math.atan2(np.dot(horiz, e_c), np.dot(horiz, n_c)))
    return dict(beta=beta, D=D, h=h, heading=heading, dep=dep, lens=lens_mm(t))

def pose_to_cam(p):
    pos = along(p["beta"], p["D"], p["h"])
    up = unit(pos)
    e_c = unit(np.cross([0, 0, 1.0], up)); n_c = np.cross(up, e_c)
    hd = math.radians(p["heading"]); dp = math.radians(p["dep"])
    hv = math.sin(hd) * e_c + math.cos(hd) * n_c
    fwd = unit(hv * math.cos(dp) - up * math.sin(dp))
    return pos, fwd, up

def camera_state(frame, view=None):
    """カメラ（ECEF の位置 km・前・上・焦点距離 mm）。世界座標（北アルプスの東・北・上）のものも付ける。"""
    t = frame / FPS
    p = camera_params(t, view)
    pos, fwd, up = pose_to_cam(p)
    return dict(pos=pos, fwd=fwd, up=up, lens=p["lens"], h=p["h"], D=p["D"], dep=p["dep"], heading=p["heading"], beta=p["beta"],
                pos_w=ecef_to_world(pos), fwd_w=vec_to_world(fwd), up_w=vec_to_world(up))

# 太陽: 北アルプスでの高さ（度）。単調に増える。方位は常に 115°。
# 地面が日の出になる境目（太陽の高さ 0°）は、北アルプスから太陽の方へ -e*111 km の所にある。日本列島は太陽の方位に沿って
# 東端（アルプスから +270 km）から西端（-420 km）まで約 700 km なので、境目は e = -2.4° 〜 +3.8° の間で日本を横切る。
_f_el = pchip([0.0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.4, 4.4, 5.458, 5.625],
              [-12.0, -7.2, -3.9, -1.6, 0.3, 1.9, 2.9, 4.0, 5.0, 5.2])
_f_ev = pchip([0.0, 1.2, 2.4, 3.4, 5.625], [3.5, 3.4, 3.3, 3.1, 3.0])

def sun_el_deg(frame):
    return float(_f_el(frame / FPS))

def sun_state(frame):
    """太陽の向き（世界座標。光源へ向かう単位ベクトル）。北アルプスでの高さ・方位 115°。"""
    el = math.radians(sun_el_deg(frame)); az = math.radians(SUN_AZ)
    return np.array([math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)])

def sun_ecef(frame):
    return M_W.T @ sun_state(frame)

def exposure_ev(frame):
    return float(_f_ev(frame / FPS))

def project(frame, lat, lon, alt=0.0, W=1920, H=1080, view=None):
    """緯度経度の点が画面のどこに写るか（画素, 左上が原点）。カメラの後ろなら None。"""
    cs = camera_state(frame, view)
    p = lonlat_ecef(lat, lon, alt) - cs["pos"]
    f = unit(cs["fwd"]); up = unit(cs["up"] - f * np.dot(cs["up"], f)); r = unit(np.cross(f, up)); u = np.cross(r, f)
    z = float(p @ f)
    if z <= 0:
        return None
    k = (SENSOR / 2) / cs["lens"]
    x = float(p @ r) / z / k; y = float(p @ u) / z / k / (H / W)
    return (x + 1) / 2 * W, (1 - y) / 2 * H

def pixel_rays(cs, W, H, xc, yc):
    """画素の中心（xc: 横, yc: 縦。画素 i の中心は i+0.5）の 1 次元の並びから視線の向き（高さ x 幅 x 3）。"""
    f = unit(cs["fwd"]); up = unit(cs["up"] - f * np.dot(cs["up"], f))
    r = unit(np.cross(f, up)); u = np.cross(r, f)
    xs = np.asarray(xc) / W * 2 - 1
    ys = 1 - np.asarray(yc) / H * 2
    k = (SENSOR / 2) / cs["lens"]
    X, Y = np.meshgrid(xs * k, ys * k * (H / W))
    d = f[None, None] + X[..., None] * r[None, None] + Y[..., None] * u[None, None]
    return (d / np.linalg.norm(d, axis=-1, keepdims=True)).astype(np.float64)

# ---------------------------------------------------------------- 材料（緯度経度の絵の入れ子）
class Layer:
    """1 枚の緯度経度の格子。種類（key）ごとに必要になったとき読む。"""
    def __init__(self, folder, tag, meta=None, prefix=None):
        self.tag = tag; self.folder = folder; self.prefix = prefix or tag
        m = meta or json.load(open(f"{folder}/{self.prefix}.json"))
        self.bbox = m["bbox"]; self.step = m["step"]; self.W, self.H = m["size"]
        self._a = {}
    def _path(self, key):
        base = f"{self.folder}/{self.prefix}_{key}"
        for ext in ("jpg", "png", "npy"):
            if os.path.exists(f"{base}.{ext}"):
                return f"{base}.{ext}"
        return None
    def has(self, key):
        if key == "cloud_s":
            return self._path("cloud") is not None
        return self._path(key) is not None
    def arr(self, key):
        if key == "cloud_s" and key not in self._a:
            # 雲の高さを決めるためのなだらかな雲の絵（約 3 km でぼかしたもの）。高さを細かい厚みの変化に追従させない（柱にならない）
            a = np.asarray(self.arr("cloud"), np.float32)
            sg = max(1.0, 3.0 / (self.step * 111.32))
            self._a[key] = np.clip(gaussian_filter(a, sg, mode="nearest"), 0, 65535).astype(np.uint16)
        if key not in self._a:
            p = self._path(key)
            if p.endswith(".npy"):
                a = np.load(p, mmap_mode="r")
                if a.dtype == np.float16:        # map_coordinates は float16 を読めない
                    a = np.asarray(a, np.float32)
            else:
                a = np.asarray(Image.open(p))
            self._a[key] = a
        return self._a[key]
    def rc(self, lon, lat):
        return (self.bbox[3] - lat) / self.step - 0.5, (lon - self.bbox[0]) / self.step - 0.5
    def weight(self, lon, lat, feather):
        """この絵の中での重み（ふちで 0 → 内側 feather 度で 1）。"""
        b = self.bbox
        d = np.minimum(np.minimum(lon - b[0], b[2] - lon), np.minimum(lat - b[1], b[3] - lat))
        return sstep(d, 0.0, feather).astype(np.float32)
    def sample(self, key, lon, lat, ch=None, scale=1.0):
        a = self.arr(key)
        if ch is not None:
            a = a[..., ch]
        r, c = self.rc(lon, lat)
        return map_coordinates(a, [r, c], order=1, mode="nearest", output=np.float32) * np.float32(scale)

class World:
    """G（世界）→ W2 → J → C2 の入れ子。同じ点で細かい絵があればそちらへなだらかに替える。"""
    # 名前, 重みの幅（度）
    ORDER = [("G", 0.0), ("W2", 5.0), ("J", 2.4), ("C2", 0.5)]   # 重みの幅は各絵の幅の 10% 前後（継ぎ目をなだらかに）
    def __init__(self, data):
        self.data = data
        self.layers = {}
        r2 = data                                           # data は work/globe/r2（G・W2・J・C2 の .json と各種の絵が入っている）
        for tag, _ in self.ORDER:
            if os.path.exists(f"{r2}/{tag}.json"):
                self.layers[tag] = Layer(r2, tag)
        self.cache_noise = None
    def get(self, key, lon, lat, ch=None, scale=1.0, tags=None):
        """key の値を入れ子で重ねて返す（細かい絵が無ければ粗い絵）。"""
        out = None
        for tag, fe in self.ORDER:
            L = self.layers.get(tag)
            if L is None or not L.has(key) or (tags and tag not in tags):
                continue
            b = L.bbox
            if out is None:
                out = L.sample(key, lon, lat, ch, scale)
                if tag != "G":
                    out *= L.weight(lon, lat, 0.0001)
                continue
            w = L.weight(lon, lat, fe)
            sel = w > 0
            if not sel.any():
                continue
            s = L.sample(key, lon[sel], lat[sel], ch, scale)
            out[sel] = out[sel] * (1 - w[sel]) + s * w[sel]
        return out
    def has_layer(self, tag):
        return tag in self.layers


# ---------------------------------------------------------------- 雑音（固定の種。緯度経度を km にして引く）
_NZ = {}
def _noise_tile(k):
    if k not in _NZ:
        rng = np.random.default_rng(20261127 + 7 * k)
        n = 1024
        a = rng.standard_normal((n, n)).astype(np.float32)
        a = gaussian_filter(a, 0.9, mode="wrap")
        a = a / a.std() * 0.5
        _NZ[k] = a
    return _NZ[k]

def nz(xk, yk, scale_km, k=0):
    """スケール scale_km（km）の雑音。値はおよそ -1〜1（標準偏差 0.5）。"""
    t = _noise_tile(k)
    return map_coordinates(t, [yk / scale_km + 13.7 * k, xk / scale_km + 29.1 * k], order=1, mode="grid-wrap", output=np.float32)

def km_xy(lon, lat):
    return lon * (111.32 * 0.803), lat * 111.32

# ---------------------------------------------------------------- 空気（レイリー・ミー・オゾン）
BETA_R = np.array([0.0058, 0.0135, 0.0331])           # 1/km（海面の空気）
BETA_M = 0.0022                                        # 薄いもや
BETA_M_EXT = BETA_M / 0.9
OZONE = np.array([0.00065, 0.00188, 0.000085]) * 0.6        # 1/km
H_R, H_M = 8.0, 1.2

def dens(h):
    h = np.maximum(h, 0.0)
    return np.exp(-h / H_R), np.exp(-h / H_M), np.maximum(0.0, 1.0 - np.abs(h - 25.0) / 15.0)

class AirTable:
    """太陽へ向かう光線の「空気の量」の表。r（地球の中心から）と天頂角から引く。"""
    NR, NX = 48, 96
    def __init__(self):
        r = R_EARTH + ATM_TOP * (np.arange(self.NR) / (self.NR - 1)) ** 2
        self.r = r
        zh = np.degrees(np.arccos(R_EARTH / r)) + 90.0
        self.zh = zh
        xg = (np.arange(self.NX) / (self.NX - 1)) ** 2
        tab = np.zeros((self.NR, self.NX, 3))
        for i in range(self.NR):
            x = xg * zh[i]
            zen = np.radians(zh[i] - x)
            tab[i] = self._col(r[i], np.cos(zen))
        self.tab = tab

    @staticmethod
    def _col(r, mu, n=96):
        mu = np.atleast_1d(mu)
        ra = R_EARTH + ATM_TOP
        b = r * mu
        disc = np.sqrt(np.maximum(b * b - r * r + ra * ra, 0))
        L = -b + disc
        out = np.zeros((len(mu), 3))
        f = (np.arange(n) + 0.5) / n
        for k in range(n):
            s_ = L * f[k]
            rr = np.sqrt(r * r + s_ * s_ + 2 * r * mu * s_)
            dr_, dm_, do_ = dens(rr - R_EARTH)
            out[:, 0] += dr_ * L / n; out[:, 1] += dm_ * L / n; out[:, 2] += do_ * L / n
        return out

    def lookup(self, r, mu):
        """r, mu は同じ形の配列。戻りは (...,3) の柱（レイリー・ミー・オゾン）。地面にさえぎられる向きは大きな値。"""
        r = np.clip(r, R_EARTH, R_EARTH + ATM_TOP)
        ir = np.sqrt((r - R_EARTH) / ATM_TOP) * (self.NR - 1)
        i0 = np.clip(ir.astype(int), 0, self.NR - 2); fr = ir - i0
        zh = self.zh[i0] * (1 - fr) + self.zh[i0 + 1] * fr
        zen = np.degrees(np.arccos(np.clip(mu, -1, 1)))
        x = zh - zen
        blocked = x < 0
        xr = np.sqrt(np.clip(x, 0, None) / zh) * (self.NX - 1)
        j0 = np.clip(xr.astype(int), 0, self.NX - 2); fx = xr - j0
        t = self.tab
        a = t[i0, j0] * (1 - fx)[..., None] + t[i0, j0 + 1] * fx[..., None]
        b = t[i0 + 1, j0] * (1 - fx)[..., None] + t[i0 + 1, j0 + 1] * fx[..., None]
        out = a * (1 - fr)[..., None] + b * fr[..., None]
        out[blocked] = 1e3
        return out

def extinction(cols):
    tau = BETA_R * cols[..., 0:1] + BETA_M_EXT * cols[..., 1:2] + OZONE * cols[..., 2:3]
    return np.exp(-tau)

_AIR = None
def air():
    global _AIR
    if _AIR is None:
        _AIR = AirTable()
    return _AIR

def sun_trans(r, mu):
    """地面や雲に届く太陽の光の割合（RGB）。屈折ぶんだけ地平線の下 0.5° まで細く届くようにする。"""
    mu2 = np.maximum(mu, 1e-4)
    T = extinction(air().lookup(r, mu2))
    el = np.degrees(np.arcsin(np.clip(mu, -1, 1)))
    # 高い所では地平線が下がる（その高さから見た地平線までは直接見える）→ 表の「ふさがれる」で扱う。低い太陽の近くのなだらかさ
    return T * sstep(mu, -0.0105, 0.0004)[..., None] if False else T * np.where(mu > 0, 1.0, sstep(el, -0.55, 0.0))[..., None]

_SKY = None
def sky_table():
    """地面（海面）での空の明かり（水平面の放射照度。太陽の垂直の光 = 1 に対する割合。RGB）を、太陽の高さの表に。"""
    global _SKY
    if _SKY is not None:
        return _SKY
    A = air()
    els = np.concatenate([np.linspace(-20, -2, 19), np.linspace(-1.5, 6, 16), np.linspace(7, 90, 42)])
    nth, nph, ns = 18, 16, 28
    th = (np.arange(nth) + 0.5) / nth * (math.pi / 2)
    ph = (np.arange(nph) + 0.5) / nph * 2 * math.pi
    TH, PH = np.meshgrid(th, ph, indexing="ij")
    wdir = (np.sin(TH) * np.cos(TH)).ravel() * (math.pi / 2 / nth) * (2 * math.pi / nph)
    wdir = wdir / wdir.sum() * math.pi                      # 余弦で重みづけた半球の立体角の合計 = π
    dirs = np.stack([np.sin(TH) * np.cos(PH), np.sin(TH) * np.sin(PH), np.cos(TH)], -1).reshape(-1, 3)
    ra = R_EARTH + ATM_TOP
    out = np.zeros((len(els), 3))
    p0 = np.array([0.0, 0.0, R_EARTH])
    for ie, el in enumerate(els):
        s = np.array([math.cos(math.radians(el)), 0.0, math.sin(math.radians(el))])
        b = dirs @ p0; disc = np.sqrt(np.maximum(b * b - (p0 @ p0 - ra * ra), 0)); L = -b + disc
        cosg = dirs @ s
        phR = 3 / (16 * math.pi) * (1 + cosg ** 2)
        g = 0.78
        phM = 3 / (8 * math.pi) * ((1 - g * g) * (1 + cosg ** 2)) / ((2 + g * g) * np.maximum(1 + g * g - 2 * g * cosg, 1e-4) ** 1.5)
        Lrad = np.zeros((len(dirs), 3)); tau_v = np.zeros((len(dirs), 3)); Lms = np.zeros((len(dirs), 3))
        u = (np.arange(ns) + 0.5) / ns
        t_prev = np.zeros(len(dirs))
        for k in range(ns):
            tt = L * (u[k] ** 2); ds = L * (2 * u[k] / ns)
            p = p0[None] + dirs * tt[:, None]
            rr = np.linalg.norm(p, axis=1)
            dr_, dm_, do_ = dens(rr - R_EARTH)
            mu_s = (p @ s) / rr
            Ts = extinction(A.lookup(rr, mu_s))
            beta_s = BETA_R[None] * dr_[:, None]
            Tv = np.exp(-tau_v)
            Lrad += Tv * Ts * (beta_s * phR[:, None] + BETA_M * (dm_ * phM)[:, None]) * ds[:, None] * math.pi
            Lms += Tv * Ts * ((beta_s + BETA_M * dm_[:, None]) / (4 * math.pi)) * ds[:, None] * math.pi
            tau_v += (BETA_R[None] * dr_[:, None] + BETA_M_EXT * dm_[:, None] + OZONE[None] * do_[:, None]) * ds[:, None]
        ms_k = 1.3 * BETA_R * H_R                          # 2 回以上の散乱: 等方の 1 回散乱の約 0.05（赤）〜 0.35（青）
        Lt = Lrad + Lms * ms_k[None]
        out[ie] = (Lt * wdir[:, None]).sum(0) / math.pi    # 放射照度 / π = 太陽の垂直の光に対する割合
    _SKY = (els, out)
    return _SKY

def sky_frac(el_deg):
    els, tab = sky_table()
    return np.stack([np.interp(el_deg, els, tab[:, c]) for c in range(3)], -1).astype(np.float32)

# ---------------------------------------------------------------- 雲（連続した厚みから高さのある層を作る）
PK = 1.0   # 画素 1 つが地面で何 km か（描く前に決める。これより細かい雑音は入れない = 画素より細かい粒でちらつかせない）

def cloud_field(world, lon, lat):
    """雲の見かけの反射率 a（0〜1。細かい）と、高さを決めるなだらかな a_s、頂のうねり用の雑音 n を返す。
    雑音は画素の細かさ PK より細かいものは入れない（ちらつき防止）。"""
    land = np.clip(world.get("land", lon, lat, scale=1.0 / 255.0), 0, 1)
    floor = 0.09 + 0.14 * land                              # もや・地面・海の反射の下地を引く（陸は写真より衛星の色が明るいぶん多め）
    a0 = world.get("cloud", lon, lat, scale=1.0 / 65535.0, tags=("W2", "J"))
    a0 = np.clip((a0 - floor) / (1.0 - floor), 0.0, 1.0)
    as0 = world.get("cloud_s", lon, lat, scale=1.0 / 65535.0, tags=("W2", "J"))
    as0 = np.clip((as0 - floor) / (1.0 - floor), 0.0, 1.0)
    xk, yk = km_xy(lon, lat)
    w1 = float(sstep(0.7 / max(PK, 1e-3), 0.6, 2.2))
    n1 = nz(xk, yk, 0.7, 0) * w1 if w1 > 0.01 else 0.0
    n2 = nz(xk, yk, 3.2, 1)
    n = np.clip(0.55 * n1 + 0.85 * n2, -1.0, 1.0)
    a = np.clip(a0 + 1.4 * n * a0 * (1.0 - a0), 0.0, 0.985)
    a[a < 0.012] = 0.0
    return a, np.clip(as0, 0, 0.985), n

def cloud_geom(a, a_s, n):
    """a, a_s → 雲底・雲頂（海面からの高さ km）と光学的厚さ τ。厚い雲ほど高い。頂はなだらかに（柱にならない）。"""
    top = 0.8 + 2.4 * a_s ** 1.3 + 1.6 * a_s ** 3 + 0.4 * n * np.minimum(a_s * 4, 1.0)
    base = 0.45 + 0.7 * a_s
    top = np.maximum(top, base + 0.25)
    tau = 5.5 * a / (1.02 - a)
    return base, top, tau

def cloud_density(world, lon, lat, z):
    """点（経度・緯度・高さ z km）の雲の密度 ρ（1/km）。"""
    a, a_s, n = cloud_field(world, lon, lat)
    base, top, tau = cloud_geom(a, a_s, n)
    soft = 0.3
    prof = sstep(z, base - soft * 0.5, base + soft) * (1.0 - sstep(z, top - soft, top + soft * 0.5))
    return tau / (top - base) * prof

SUN_OFF = (0.15, 0.5, 1.5, 4.0)

def sun_ray_tau(world, P, s, z0, nsamp=4, dz=SUN_OFF):
    """点 P（ECEF km, N x 3。高さ z0 km）から太陽へ、雲の光学的厚さ（連続）を、高さが dz ずつ上がる点でたどって足す。"""
    r0 = np.linalg.norm(P, axis=1)
    mu = (P @ s) / r0
    sinel = np.maximum(mu, 0.02)
    tau = np.zeros(len(P), np.float32); dprev = np.zeros(len(P))
    for dzk in dz[:nsamp]:
        d = dzk / sinel
        Q = P + s[None] * d[:, None]
        lon, lat, rq = ecef_lonlat(Q)
        rho = cloud_density(world, lon.astype(np.float32), lat.astype(np.float32), (rq - R_EARTH).astype(np.float32))
        tau += rho * (d - dprev).astype(np.float32); dprev = d
    return tau

def ground_cloud_tau(world, P, s, jitter, ns=26):
    """地面の点 P から太陽へたどって、雲の影の光学的厚さを返す。高さ 0.2〜9.5 km の層を等間隔に（画素ごとにずらして）たどる。曲率は 3 次元の位置で入れる。"""
    n = P / np.linalg.norm(P, axis=1, keepdims=True)
    sinel = np.clip(n @ s, 0.0, 1.0)
    ok = sinel > np.sin(np.radians(-0.2)) * 0 + 1e-4
    tau = np.zeros(len(P), np.float32)
    zs = 0.2 + (np.arange(ns)[None, :] + jitter[:, None]) * (CLOUD_TOP_MAX - 0.2) / ns        # 高さ（N x ns）
    sin_e = np.maximum(sinel, 0.0)[:, None]
    d = R_EARTH * (-sin_e + np.sqrt(sin_e ** 2 + 2.0 * zs / R_EARTH))                            # 太陽の光が高さ zs へ上がる距離
    dprev = np.concatenate([np.zeros((len(P), 1)), d[:, :-1]], 1)
    for k in range(ns):
        Q = P + s[None] * d[:, k:k + 1]
        lon, lat, rq = ecef_lonlat(Q)
        rho = cloud_density(world, lon.astype(np.float32), lat.astype(np.float32), (rq - R_EARTH).astype(np.float32))
        tau += rho * (d[:, k] - dprev[:, k]).astype(np.float32)
    return tau * ok

# ---------------------------------------------------------------- 灯り（Black Marble の 8bit から放射量を作る）
LIGHT_BASE = 30.0
def lights_radiance(v, lon, lat):
    """v: 0〜255。下地の灰色を引いて、急な曲線（γ 2.3）で、街の中心だけが飽和し郊外が 3〜5 段下になるようにする。さらに細かい構造（道・街区）の雑音をのせる。"""
    l = np.clip((v - LIGHT_BASE) / (255.0 - LIGHT_BASE), 0, 1) ** 2.0
    xk, yk = km_xy(lon, lat)
    m = 0.55 * (1.0 + nz(xk, yk, 0.35, 2)) * (1.0 + 0.8 * nz(xk, yk, 1.4, 3)) + 0.25 * (1.0 + nz(xk, yk, 5.0, 0))
    return l * np.clip(m, 0.05, 2.2) * np.float32(1.0)

E_NIGHT = np.array([0.5, 0.8, 1.6], np.float32) * 5e-4       # 夜空の光（大気光・星明かり。放射照度 / π）。青っぽい
LIGHT_GAIN = 0.14                                            # 灯りの放射輝度のスケール（太陽の垂直の光 = π ・白い拡散面の正午 = 1 に対して）

# ---------------------------------------------------------------- 1 画素ごとの地面・雲・海
def fresnel(cos_i, n=1.34):
    """水面のフレネル反射率（偏光なしの平均）。"""
    c = np.clip(cos_i, 0, 1)
    s2 = (1.0 - c * c) / (n * n)
    ct = np.sqrt(np.maximum(1.0 - s2, 0))
    rs = ((c - n * ct) / (c + n * ct)) ** 2
    rp = ((ct - n * c) / (ct + n * c)) ** 2
    return 0.5 * (rs + rp)

def pixel_hash(px, py, seed):
    """画素の座標だけで決まる 0〜1 の乱数（タイルに分けて描いても継ぎ目が出ない）。"""
    x = (np.asarray(px, np.uint64) * np.uint64(73856093)) ^ (np.asarray(py, np.uint64) * np.uint64(19349663)) ^ np.uint64(seed * 83492791 + 1013904223)
    x ^= x >> np.uint64(13); x *= np.uint64(0x5bd1e995); x ^= x >> np.uint64(15); x *= np.uint64(0x27d4eb2d); x ^= x >> np.uint64(16)
    return ((x & np.uint64(0xFFFFFF)).astype(np.float32)) / np.float32(0x1000000)

def terrain_gradient(world, lon, lat):
    """標高 h（m）と、東・北向きの勾配（m/m）。細かい絵（J, C2）があればそちらで。"""
    h = world.get("dem", lon, lat)
    if h is None:
        z = np.zeros_like(lon)
        return z, z, z
    # 画素の細かさに合わせて（J=0.0025°, C2=0.001°）、勾配の幅を決める
    dl = np.full_like(lon, 0.0025)
    if world.has_layer("C2"):
        w = world.layers["C2"].weight(lon, lat, 0.12)
        dl = dl * (1 - w) + 0.001 * w
    ck = np.cos(np.radians(lat)) * 111320.0; kk = 111320.0
    he = world.get("dem", lon + dl, lat); hw = world.get("dem", lon - dl, lat)
    hn = world.get("dem", lon, lat + dl); hs = world.get("dem", lon, lat - dl)
    gx = (he - hw) / (2 * dl * ck); gy = (hn - hs) / (2 * dl * kk)
    return h, gx, gy

def render_strip(world, cs, frame, W, H, y0, y1, x0, x1, opts):
    """画面の y0..y1・x0..x1 の画素について、地面・海・灯り・雲の光を（空気より下の）放射輝度 RGB（線形）で返す。
    戻り: L（h,w,3）, Tcl（雲を通った地面の見え方の割合 h,w,1）, hit（地面に当たったか）, lights（地面の灯りの放射輝度 h,w,3。雲の通り抜けは別に掛ける）"""
    h, w = y1 - y0, x1 - x0
    d = pixel_rays(cs, W, H, np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5).reshape(-1, 3)
    c = cs["pos"]
    b = d @ c
    disc = b * b - (c @ c - R_EARTH ** 2)
    hit = (disc > 0) & (-b - np.sqrt(np.maximum(disc, 0)) > 0)
    t_hit = np.where(hit, -b - np.sqrt(np.maximum(disc, 0)), 0.0)
    N = len(d)
    L = np.zeros((N, 3), np.float32); lights_out = np.zeros((N, 3), np.float32)
    Tg = np.ones(N, np.float32); Lc = np.zeros((N, 3), np.float32)
    s = sun_ecef(frame)
    sun_el = math.degrees(math.asin(np.dot(s, unit(P_T))))
    gain = 2.0 ** (exposure_ev(frame) + float(opts.get("ev", 0.0)))
    idx = np.nonzero(hit)[0]
    if len(idx) == 0:
        return L.reshape(h, w, 3), hit.reshape(h, w), lights_out.reshape(h, w, 3), (d, t_hit, hit)
    dh = d[idx]; P = c[None] + dh * t_hit[idx, None]
    lon, lat, rr = ecef_lonlat(P)
    lon = lon.astype(np.float32); lat = lat.astype(np.float32)
    n = (P / rr[:, None]).astype(np.float32)
    # 材料
    rgb = np.stack([world.get("rgb", lon, lat, ch=k, scale=1 / 255.0) for k in range(3)], -1)
    land = np.clip(world.get("land", lon, lat, scale=1 / 255.0), 0, 1)
    lig_v = world.get("lights", lon, lat)
    hgt, gx, gy = terrain_gradient(world, lon, lat)
    hz = world.get("hz", lon, lat, scale=25.5 / 255.0) if opts.get("relief", "1") == "1" else np.zeros_like(lon)
    if hz is None:
        hz = np.zeros_like(lon)
    xk, yk = km_xy(lon, lat)
    # 太陽の高さ（その場の水平から）と、地形の影・斜面
    mu_s = (n @ s).astype(np.float32)
    el_loc = np.degrees(np.arcsin(np.clip(mu_s, -1, 1)))
    ex = float(opts.get("relief_ex", 1.25))
    Evec = np.cross([0.0, 0.0, 1.0], n); Evec /= np.maximum(np.linalg.norm(Evec, axis=1, keepdims=True), 1e-9)
    Nvec = np.cross(n, Evec)
    nn = n - ex * (gx[:, None] * Evec + gy[:, None] * Nvec)
    nn /= np.linalg.norm(nn, axis=1, keepdims=True)
    cos_t = np.clip(nn @ s, 0, 1)
    lit = sstep(el_loc - hz, 0.0, 0.7)
    rsurf = R_EARTH + np.maximum(hgt, 0) / 1000.0
    Tsun = sun_trans(rsurf.astype(np.float64), np.clip(mu_s, -1, 1).astype(np.float64)).astype(np.float32)
    # 雲の影（雲の層を太陽へ向けてたどる）
    jit = pixel_hash(x0 + idx % w, y0 + idx // w, 1000)
    tau_s = ground_cloud_tau(world, P, s, jit) if opts.get("clouds", "1") == "1" else np.zeros(len(idx), np.float32)
    T_dir = np.exp(-tau_s)
    T_all = 0.04 + 0.96 / (1.0 + 0.45 * tau_s)
    # 空の明かり
    skyv = (1.0 + (nn * n).sum(1)) * 0.5                            # 斜面が見ている空の割合
    occl = 1.0 - 0.35 * sstep(hz, 0.5, 12.0) * (1.0 - lit * 0)       # 谷の中は空が狭い
    Esky = sky_frac(el_loc) * (skyv * occl)[:, None] * float(opts.get("skyk", 1.4))
    Esky_thru = Esky * (0.55 + 0.45 * T_all)[:, None]
    # 夜の光（星明かり・大気光）と、雲に反射する光
    E_dir = Tsun * (cos_t * lit)[:, None]
    E_tot = E_dir * T_dir[:, None] + E_dir * ((T_all - T_dir) * 0.7)[:, None] + Esky_thru + E_NIGHT[None] * (1.0)
    # --- 陸 ---
    alb = srgb2lin(rgb)
    lum = (alb * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(1, keepdims=True)
    alb = np.clip(lum + (alb - lum) * float(opts.get("land_sat", 1.25)), 0, 1)             # 写真の色が薄いので少し濃く（11 月の山の色）
    alb = alb ** float(opts.get("land_gamma", 1.12)) * float(opts.get("land_k", 1.0))
    alb = alb * np.array([1.10, 0.98, 0.82], np.float32)[None]                        # 11 月下旬の山の色（写真は夏の緑 → 落ち葉・枯れ草のオリーブ〜茶）
    alb = alb / (1.0 + 1.2 * alb) * 1.2                                                # 街の白っぽさ（写真の明るさ）をおさえる
    # 雪（11 月下旬: 標高と緯度から。急な岩壁には積もりにくい。雑音で縁をほぐす）
    nsn = nz(xk, yk, 2.5, 4) + 0.6 * nz(xk, yk, 9.0, 5)
    line = np.maximum(2150.0 - 270.0 * np.clip(lat - 36.0, -6, 12), 700.0) + 260.0 * nsn
    slope = np.hypot(gx, gy)
    snow = np.clip((hgt - line) / 260.0, 0, 1) * (1.0 - 0.75 * sstep(slope, 0.9, 1.7)) * np.clip(0.9 + 0.3 * nsn, 0, 1.1)
    snow = np.clip(snow, 0, 1) * (land > 0.5)
    snow_alb = np.array([0.80, 0.84, 0.90], np.float32)
    alb_l = alb * (1 - snow[:, None]) + snow_alb[None] * snow[:, None]
    L_land = alb_l * E_tot
    # --- 海 ---
    sea_alb = np.clip(alb * 0.45, 0, 0.12) + np.array([0.0025, 0.007, 0.0135], np.float32)[None]
    vdir = -dh.astype(np.float32)                                   # 地面からカメラへ
    cos_v = np.clip((vdir * n).sum(1), 0.02, 1)
    # 波の傾きの分散 σ²（風 6〜8 m/s）。風のすじで ±30%
    wnoise = nz(xk, yk, 14.0, 6) + 0.5 * nz(xk, yk, 55.0, 7)
    sig2 = 0.040 * (1.0 + 0.45 * np.clip(wnoise, -1, 1))
    hv = vdir + s[None]; hv /= np.linalg.norm(hv, axis=1, keepdims=True)
    cos_b = np.clip((hv * n).sum(1), 1e-3, 1)
    tan2 = (1 - cos_b ** 2) / cos_b ** 2
    Dd = np.exp(-tan2 / (2 * sig2)) / (2 * math.pi * sig2 * cos_b ** 4)
    Fh = fresnel(np.clip((hv * vdir).sum(1), 0, 1))
    glint = (Tsun * (T_dir * (lit * (el_loc > 0))[:, None] * 0 + 0) if False else 0)
    glint_s = Fh * Dd / (4.0 * cos_v) * lit * T_dir
    glint_rgb = Tsun * glint_s[:, None] * np.float32(opts.get("glint_k", 1.0))
    # 空の映り込み（フレネル）。反射方向の空: 地平線ぞいは明るく、太陽側は明るい
    refl = 2.0 * (n * (vdir * n).sum(1, keepdims=True)) - vdir
    sin_re = np.clip((refl * n).sum(1), 0.0, 1.0)
    towards = np.clip((refl @ s), 0, 1)
    shape_sky = 0.55 + 1.9 * (1.0 - sin_re) ** 3 + 1.2 * towards ** 6 * sstep(sun_el + 6, 0, 10)
    Fv = fresnel(cos_v)
    Lsky = (sky_frac(el_loc) * float(opts.get("skyk", 1.4)) + E_NIGHT[None] * 3.0) * shape_sky[:, None]
    L_sea = sea_alb * E_tot + Fv[:, None] * Lsky * float(opts.get('sea_sky', 0.4)) + glint_rgb
    Lg = land[:, None] * L_land + (1 - land[:, None]) * L_sea
    # 灯り
    lr = lights_radiance(lig_v, lon, lat) * (land > 0.3)
    fade = 1.0 - sstep(el_loc, -2.5, 0.8)              # 太陽の光が地面に届くと灯りは見えなくなる（直射が届く 0.8° までに消える）
    lc = np.array([1.0, 0.55, 0.22], np.float32)[None] * (1 - sstep(lr, 0.25, 1.2))[:, None] + np.array([1.0, 0.86, 0.68], np.float32)[None] * sstep(lr, 0.25, 1.2)[:, None]
    light_rgb = lc * (lr * fade * LIGHT_GAIN)[:, None]
    L[idx] = Lg
    lights_out[idx] = light_rgb
    return L.reshape(h, w, 3), hit.reshape(h, w), lights_out.reshape(h, w, 3), (d, t_hit, hit)

def cloud_march(world, cs, frame, W, H, y0, y1, x0, x1, hit_info, opts, nslice=30):
    """雲の層を視線ぞいに、高さの層ごとに前から奥へたどる。戻り: 雲の光 Lc（h,w,3）、雲を通る間の見え方 Tg（h,w,1）= 地面・灯りに掛ける。"""
    d, t_hit, hit = hit_info
    N = len(d); h, w = y1 - y0, x1 - x0
    c = cs["pos"]
    s = sun_ecef(frame)
    b = d @ c; c2 = c @ c
    Lc = np.zeros((N, 3), np.float32); Tacc = np.ones(N, np.float32); tau_view = np.zeros(N, np.float32)
    jit = pixel_hash(x0 + np.arange(N) % w, y0 + np.arange(N) // w, 2000)
    sun_el = math.degrees(math.asin(np.dot(s, unit(P_T))))
    # 光の向きと視線の角度（前方散乱: 太陽の方を見るとき明るい）
    cosg = d @ s
    phase = (0.78 + 0.5 * np.clip(cosg, 0, 1) ** 3).astype(np.float32)
    for k in range(nslice):
        z = CLOUD_TOP_MAX * (1.0 - (k + jit) / nslice)
        zc = np.maximum(z, 0.0)
        disc = b * b - (c2 - (R_EARTH + zc) ** 2)
        ok = disc > 0
        tq = -b - np.sqrt(np.maximum(disc, 0))
        ok &= (tq > 0) & hit & (tq < t_hit + 1e-3)
        ii = np.nonzero(ok & (Tacc > 0.02))[0]
        if len(ii) == 0:
            continue
        Q = c[None] + d[ii] * tq[ii, None]
        lon, lat, rq = ecef_lonlat(Q)
        lon = lon.astype(np.float32); lat = lat.astype(np.float32)
        zq = (rq - R_EARTH).astype(np.float32)
        rho = cloud_density(world, lon, lat, zq)
        nq = (Q / rq[:, None]).astype(np.float32)
        cosi = np.maximum(np.abs((d[ii] * nq).sum(1)), 0.03)
        dz = CLOUD_TOP_MAX / nslice
        dtau = rho * (dz / cosi).astype(np.float32)
        al = 1.0 - np.exp(-dtau)
        jj = np.nonzero(al > 0.005)[0]
        if len(jj) == 0:
            continue
        gi = ii[jj]
        Qj = Q[jj]; nj = nq[jj]
        mu = (nj @ s).astype(np.float32)
        el_q = np.degrees(np.arcsin(np.clip(mu, -1, 1)))
        Ts = sun_trans(rq[jj], mu.astype(np.float64)).astype(np.float32)
        tau_s = sun_ray_tau(world, Qj, s, zq[jj])
        Edir = Ts * np.exp(-0.35 * tau_s)[:, None]
        Eamb = sky_frac(el_q) * float(opts.get("skyk", 1.4)) * 1.0 + E_NIGHT[None]
        # 雲どうしの自己影の弱さ: 厚い所の奥は暗く
        src = 0.92 * (Edir * phase[gi, None] + Eamb)
        Lc[gi] += (Tacc[gi] * al[jj])[:, None] * src
        Tacc[gi] *= np.exp(-dtau[jj])
        tau_view[gi] += dtau[jj]
    Tg = 1.0 / (1.0 + 0.5 * tau_view)
    return Lc.reshape(h, w, 3), Tg.reshape(h, w, 1), Tacc.reshape(h, w, 1)

# ---------------------------------------------------------------- 空気（視線ぞいの散乱）
SKYK = 0.8
AIR_K = 0.6      # 空気の濃さの倍率（1.0 = 計算どおり。0.6 に薄めると地面の色・起伏が読める。限の光の帯も残る。notes/globe.md に比較）
def atmo_march(d, cpos, s, ns=48):
    """視線 d（N,3）をたどって、通りぬける割合 Tv と、まわりこむ光 inscat（N,3。放射輝度。太陽の垂直の光 = π）を返す。"""
    A = air()
    ra = R_EARTH + ATM_TOP
    b = d @ cpos; c0 = cpos @ cpos
    disc_a = b * b - (c0 - ra * ra)
    disc_g = b * b - (c0 - R_EARTH ** 2)
    hit_a = disc_a > 0
    sa = np.sqrt(np.maximum(disc_a, 0)); sg = np.sqrt(np.maximum(disc_g, 0))
    ta0 = np.where(hit_a, np.maximum(-b - sa, 0), 0)
    ta1 = np.where(hit_a, -b + sa, 0)
    hit_g = (disc_g > 0) & (-b - sg > 0)
    tg = np.where(hit_g, -b - sg, 1e30)
    seg = np.maximum(np.minimum(ta1, tg), ta0) - ta0
    inscat = np.zeros((d.shape[0], 3)); tau_v = np.zeros((d.shape[0], 3))
    cosv = d @ s
    phR = 3 / (16 * math.pi) * (1 + cosv ** 2)
    g = 0.78
    phM = 3 / (8 * math.pi) * ((1 - g * g) * (1 + cosv ** 2)) / ((2 + g * g) * np.maximum(1 + g * g - 2 * g * cosv, 1e-4) ** 1.5)
    ms_k = 1.3 * BETA_R * H_R
    # 地平線すれすれの視線は空気の薄い所を長く通るので、通る距離の始めのほうを細かく（u の 2 乗でなく、最接近点のまわりを密に）
    u = (np.arange(ns) + 0.5) / ns
    for k in range(ns):
        # 視線が空気の上端から入る側と出る側で密度の高い（低い）方向へ細かく: 区間を 2 つの半分に分けて低い所を詰める
        tt = ta0 + seg * u[k]
        ds = seg / ns
        p = cpos[None] + d * tt[:, None]
        rr = np.linalg.norm(p, axis=1)
        dr_, dm_, do_ = dens(rr - R_EARTH)
        Ts = extinction(A.lookup(rr, (p @ s) / rr))
        beta_s = BETA_R[None] * dr_[:, None]
        Tv = np.exp(-tau_v)
        single = (beta_s * phR[:, None] + BETA_M * (dm_ * phM)[:, None])
        # 空の明かりで照らされた空気の散乱（多重散乱の近似。青い）: その場の太陽の高さの「空の明かりの割合」で等方に
        mu_p = (p @ s) / rr
        fill = (beta_s + BETA_M * dm_[:, None]) * sky_frac(np.degrees(np.arcsin(np.clip(mu_p, -1, 1)))) * float(SKYK)
        inscat += Tv * (Ts * single * math.pi + fill) * ds[:, None]
        tau_v += (beta_s + BETA_M_EXT * dm_[:, None] + OZONE[None] * do_[:, None]) * ds[:, None]
    return np.exp(-tau_v), inscat

def bilinear_up(a, sc, bw, bh, ox=0, oy=0):
    """粗い格子（i 番目 = 画素 sc*(i+0.5)）を bw x bh の画素へ線形補間。ox, oy は格子の左上から見た出力の左上の画素の位置。"""
    gh, gw = a.shape[:2]
    fx = np.clip((np.arange(bw) + ox + 0.5 - sc * 0.5) / sc, 0, gw - 1); fy = np.clip((np.arange(bh) + oy + 0.5 - sc * 0.5) / sc, 0, gh - 1)
    ix = np.minimum(fx.astype(int), max(gw - 2, 0)); iy = np.minimum(fy.astype(int), max(gh - 2, 0))
    ax = (fx - ix)[None, :, None]; ay = (fy - iy)[:, None, None]
    ix1 = np.minimum(ix + 1, gw - 1); iy1 = np.minimum(iy + 1, gh - 1)
    top = a[iy][:, ix] * (1 - ax) + a[iy][:, ix1] * ax
    bot = a[iy1][:, ix] * (1 - ax) + a[iy1][:, ix1] * ax
    return (top * (1 - ay) + bot * ay).astype(np.float32)

def stars(cs, W, H, box):
    rng = np.random.default_rng(20261127)
    n = 2600
    v = rng.normal(size=(n, 3)); v /= np.linalg.norm(v, axis=1)[:, None]
    mag = 1.0 / (rng.random(n) ** 0.9 + 0.05)
    br = np.clip(mag * 0.004, 0, 0.12)
    f = unit(cs["fwd"]); up = unit(cs["up"] - f * np.dot(cs["up"], f)); r = unit(np.cross(f, up)); u = np.cross(r, f)
    z = v @ f; ok = z > 0.01
    k = (SENSOR / 2) / cs["lens"]
    X = (v @ r) / z / k; Y = (v @ u) / z / k / (H / W)
    px = (X + 1) / 2 * W; py = (1 - Y) / 2 * H
    x0, y0, x1, y1 = box
    return px, py, br, ok & (px >= x0 - 2) & (px < x1 + 2) & (py >= y0 - 2) & (py < y1 + 2)

# ---------------------------------------------------------------- 仕上げ
def tonemap(x):
    """線形（露出済み）→ 表示（0〜1）。ACES 近似（フィルム調）。明るい所が白へ抜ける。"""
    a, b, c, d_, e = 2.51, 0.03, 2.43, 0.59, 0.14
    y = (x * (a * x + b)) / (x * (c * x + d_) + e)
    return np.clip(y, 0, 1)

def parse_args(argv):
    a = dict(data="work/globe", out="work/globe_out", frame="0", res="1920x1080", border="", exr="0", procs="1",
             ev="0", strip="96", tag="", previz="0", clouds="1", sc="2")
    for s_ in argv:
        if "=" in s_:
            k, v = s_.split("=", 1)
            a[k] = v
    return a

def frame_list(s):
    out = []
    for part in s.split(","):
        if "-" in part:
            rng, _, st = part.partition("/")
            x, y = rng.split("-"); out += list(range(int(x), int(y) + 1, int(st or 1)))
        else:
            out.append(int(part))
    return out

_WORLD = None
def get_world(data):
    global _WORLD
    if _WORLD is None:
        _WORLD = World(data)
    return _WORLD

def pixel_km(cs, W, H, py, px):
    """画面の (px, py) あたりで、画素 1 つが地面で何 km か（概算）。"""
    d = pixel_rays(cs, W, H, [px + 0.5], [py + 0.5])[0, 0]
    c = cs["pos"]; b = d @ c; disc = b * b - (c @ c - R_EARTH ** 2)
    if disc <= 0:
        return 2.0
    t = -b - math.sqrt(disc)
    ang = 2 * math.tan(math.atan((SENSOR / 2) / cs["lens"])) / W
    n = (c + d * t) / R_EARTH
    return max(0.05, t * ang / max(abs(float(d @ n)), 0.12))

def texel_report(world, frame, W=3840, H=2160, nx=96, ny=54):
    """画面の格子点ごとに、画素 1 つの地面での大きさ（km。縦横の大きいほう）と、そこで使う絵の 1 画素（km）を比べる。
    戻り: 画素より大きい絵の 1 画素（texel > pixel）になっている点の割合と、層ごとの割合。"""
    cs = camera_state(frame)
    xs = (np.arange(nx) + 0.5) / nx * W; ys = (np.arange(ny) + 0.5) / ny * H
    def hitpts(dx, dy):
        d = pixel_rays(cs, W, H, xs + dx, ys + dy).reshape(-1, 3)
        c = cs["pos"]; b = d @ c; disc = b * b - (c @ c - R_EARTH ** 2)
        ok = (disc > 0) & (-b - np.sqrt(np.maximum(disc, 0)) > 0)
        t = np.where(ok, -b - np.sqrt(np.maximum(disc, 0)), 0)
        return c[None] + d * t[:, None], ok
    P0, ok0 = hitpts(0, 0); P1, ok1 = hitpts(1, 0); P2, ok2 = hitpts(0, 1)
    ok = ok0 & ok1 & ok2
    foot = np.maximum(np.linalg.norm(P1 - P0, axis=1), np.linalg.norm(P2 - P0, axis=1))[ok]
    lon, lat, _ = ecef_lonlat(P0[ok])
    texel = np.full(len(lon), 360.0 / 8192 * 111.32 * 0.8); layer = np.array(["G"] * len(lon), dtype=object)
    for tag, fe in World.ORDER[1:]:
        L = world.layers.get(tag)
        if L is None:
            continue
        w = L.weight(lon, lat, fe)
        use = w > 0.5
        texel[use] = L.step * 111.32 * 0.85; layer[use] = tag
    ratio = texel / np.maximum(foot, 1e-6)
    res = dict(frame=frame, n=int(ok.sum()), frac_texel_larger=float((ratio > 1.0).mean()), median_foot_km=float(np.median(foot)), min_foot_km=float(foot.min()))
    for tag in ("G", "W2", "J", "C2"):
        m = layer == tag
        if m.any():
            res[tag] = dict(frac=float(m.mean()), frac_texel_larger=float((ratio[m] > 1.0).mean()), median_ratio=float(np.median(ratio[m])))
    return res

def _strip_job(args):
    global PK
    (data, frame, W, H, y0, y1, x0, x1, opts) = args
    world = get_world(data)
    cs = camera_state(frame)
    PK = pixel_km(cs, W, H, (y0 + y1) // 2, (x0 + x1) // 2)
    L, hit, lights, info = render_strip(world, cs, frame, W, H, y0, y1, x0, x1, opts)
    if opts.get("clouds", "1") == "1":
        Lc, Tg, Tacc = cloud_march(world, cs, frame, W, H, y0, y1, x0, x1, info, opts)
    else:
        Lc = np.zeros_like(L); Tg = np.ones(L.shape[:2] + (1,), np.float32)
    # 灯りは雲をにじんで通る（厚いほど広がる）: 厚み情報のある Tg で弱め、あとで全体を少しぼかす
    return y0, L, lights, Lc, Tg, hit

def render_frame(frame, W, H, box, opts, procs=1):
    """線形の画像（地面・海・灯り・雲に空気を足し、露出を掛ける前）を返す。"""
    data = opts["data"]
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    t0 = time.time()
    world = get_world(data)
    cs = camera_state(frame)
    s = sun_ecef(frame)
    # 空気（なめらかなので粗い格子で。格子は画面全体に固定（タイルに分けても同じ値になる））
    sc = int(opts.get("sc", 2)) if W * H > 1.2e6 else 1
    gi0 = max(0, x0 // sc - 1); gi1 = min(-(-W // sc), -(-x1 // sc) + 1)
    gj0 = max(0, y0 // sc - 1); gj1 = min(-(-H // sc), -(-y1 // sc) + 1)
    xc = sc * (np.arange(gi0, gi1) + 0.5); yc = sc * (np.arange(gj0, gj1) + 0.5)
    gw, gh = len(xc), len(yc)
    Tv = np.empty((gh, gw, 3), np.float32); Sc = np.empty((gh, gw, 3), np.float32)
    for r0 in range(0, gh, 64):
        r1 = min(gh, r0 + 64)
        d = pixel_rays(cs, W, H, xc, yc[r0:r1]); shp = d.shape[:2]
        t_, i_ = atmo_march(d.reshape(-1, 3).astype(np.float64), cs["pos"], s)
        Tv[r0:r1] = t_.reshape(shp + (3,)); Sc[r0:r1] = i_.reshape(shp + (3,))
    Tv = bilinear_up(Tv, sc, bw, bh, x0 - sc * gi0, y0 - sc * gj0); Sc = bilinear_up(Sc, sc, bw, bh, x0 - sc * gi0, y0 - sc * gj0)
    ak = float(opts.get('air', AIR_K))
    if ak != 1.0:
        Tv = Tv ** ak; Sc = Sc * ak
    t_atm = time.time() - t0
    # 地面・雲（帯ごと）
    sh = int(opts.get("strip", 96))
    jobs = [(data, frame, W, H, ya, min(y1, ya + sh), x0, x1, opts) for ya in range(y0, y1, sh)]
    surf = np.zeros((bh, bw, 3), np.float32); lig = np.zeros((bh, bw, 3), np.float32)
    lc = np.zeros((bh, bw, 3), np.float32); tg = np.ones((bh, bw, 1), np.float32); hits = np.zeros((bh, bw), bool)
    def put(res):
        ya, L, lights, Lc, Tg, hit = res
        r = ya - y0; n = L.shape[0]
        surf[r:r + n] = L; lig[r:r + n] = lights; lc[r:r + n] = Lc; tg[r:r + n] = Tg; hits[r:r + n] = hit
    if procs > 1:
        import multiprocessing as mp
        ctx = mp.get_context("fork")
        get_world(data)
        for k in ("rgb", "land", "lights", "cloud", "cloud_s", "dem", "hz"):
            for L_ in world.layers.values():
                if L_.has(k):
                    L_.arr(k)
        with ctx.Pool(procs) as pool:
            for res in pool.imap_unordered(_strip_job, jobs):
                put(res)
    else:
        for j in jobs:
            put(_strip_job(j))
    t_surf = time.time() - t0 - t_atm
    # 灯りの雲によるにじみ: 雲が厚い（tg が小さい）所では灯りをぼかして弱める
    blur_amt = np.clip(1.0 - tg[..., 0], 0, 1)
    lig_b = np.stack([gaussian_filter(lig[..., k], 2.4 * max(W / 3840.0, 0.5) * 3) for k in range(3)], -1)
    lig_f = lig * (1 - blur_amt[..., None]) + lig_b * blur_amt[..., None]
    # 街の光のにじみ（大気のもやで・レンズで）: 小さい半径と広い半径
    glow1 = np.stack([gaussian_filter(lig[..., k], 1.4 * W / 3840.0 * 2) for k in range(3)], -1)
    glow2 = np.stack([gaussian_filter(lig[..., k], 0.015 * W * 0.1) for k in range(3)], -1)
    lig_f = lig_f + 0.35 * glow1 + 0.9 * glow2
    base = (surf + lig_f) * tg + lc
    out = base * Tv + Sc
    return out, dict(t_atm=t_atm, t_surf=t_surf, hits=hits)

def finish(lin, frame, W, H, box, opts):
    gain = 2.0 ** (exposure_ev(frame) + float(opts.get("ev", 0.0)))
    img = lin * np.float32(gain)
    # 星（空の暗い所にだけ）
    cs = camera_state(frame)
    px, py, br, ok = stars(cs, W, H, box)
    x0, y0, x1, y1 = box
    for i in np.nonzero(ok)[0]:
        xi, yi = int(px[i]) - x0, int(py[i]) - y0
        if 0 <= xi < img.shape[1] and 0 <= yi < img.shape[0]:
            if img[yi, xi].max() < 0.05:
                img[yi, xi] += br[i] * np.array([0.85, 0.9, 1.0], np.float32)
    return img

def to_srgb8(img, seed=0, box=(0, 0, 0, 0)):
    x = tonemap(img)
    y = lin2srgb(x)
    hh, ww = y.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww]
    y = y + (pixel_hash(xx + box[0], yy + box[1], 77 + seed)[..., None] - 0.5) / 255.0
    return (np.clip(y, 0, 1) * 255 + 0.5).astype(np.uint8)

def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    data = os.path.abspath(args["data"]); out_dir = os.path.abspath(args["out"]); os.makedirs(out_dir, exist_ok=True)
    args["data"] = data
    if args.get("report", "0") == "1":
        world = get_world(data)
        for f in frame_list(args["frame"]):
            print(json.dumps(texel_report(world, f), ensure_ascii=False), flush=True)
        return
    W, H = (int(x) for x in args["res"].lower().split("x"))
    box = (0, 0, W, H)
    if args["border"]:
        v = [float(t) for t in args["border"].split(",")]
        if max(v) <= 1.0:      # 農場の形式（割合・y は下から）。画素の形式（x0,y0,x1,y1。上から）も受ける
            box = (int(round(v[0] * W)), int(round((1 - v[3]) * H)), int(round(v[2] * W)), int(round((1 - v[1]) * H)))
        else:
            box = tuple(int(t) for t in v)
    for f in frame_list(args["frame"]):
        t0 = time.time()
        lin, info = render_frame(f, W, H, box, args, procs=int(args["procs"]))
        img = finish(lin, f, W, H, box, args)
        px = to_srgb8(img, f, box)
        full = np.zeros((H, W, 3), np.uint8)
        full[box[1]:box[3], box[0]:box[2]] = px
        suffix = ("_" + args["tag"]) if args["tag"] else ""
        Image.fromarray(full).save(os.path.join(out_dir, f"frame_{f:04d}{suffix}.png"))
        if args["exr"] == "1":
            np.save(os.path.join(out_dir, f"frame_{f:04d}{suffix}.npy"), (lin * 2.0 ** exposure_ev(f)).astype(np.float16))
        import resource
        mem = max(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss) / 1048576
        print(f"frame {f}: {time.time() - t0:.1f}s (空気 {info['t_atm']:.1f}s・地面と雲 {info['t_surf']:.1f}s) 最大メモリ {mem:.1f} GB", flush=True)

if __name__ == "__main__":
    main()
