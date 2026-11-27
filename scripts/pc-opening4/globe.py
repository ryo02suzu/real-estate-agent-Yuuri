"""MICHILU 第4版オープニング：宇宙からの場面（コマ 0〜135）。Blender 5.3 の Cycles（CPU）で描く。

使い方（どちらでも同じ）:
  blender -b --factory-startup --python globe.py -- data=<材料の場所> out=<出力先> frame=77 [res=1920x1080 samples=64 threads=2 border=x0,y0,x1,y1 exr=0]
  python (bpy) globe.py data=... out=... frame=...      （bpy を入れた Python からも動く）
  frame は 77 / 0-135 / 0,12,24 のように書ける。border は描く範囲の画素（左上が原点）。
材料は globe_fetch.py が作る。中で使うのは bpy・mathutils・numpy・標準ライブラリだけ。

しくみ
  ・地球は半径 6371 km の球（1 単位 = 1 km）。世界の座標は北アルプス（36.29N 137.65E）の海面を原点とした 東・北・上。
  ・色・灯り・雲・陸の印・斜面・太陽の方向の地平線は、緯度経度の絵（G=世界 8192x4096 → R=日本とまわり 0.006° → C=中部 0.0014°）を重ねて貼る。
  ・雲は半径 +3.5 km の薄い球。地面に影を落とす（Cycles が光線で計算する）。
  ・空気（青い縁・朝焼けの帯・もや）は、描いたあとに numpy で 1 画素ずつ光線をたどって足す（太陽の光が空気を通る量は表にして引く）。
  ・カメラと太陽はコマ番号だけで決まる関数（camera_state / sun_state）。乱数は固定の種。
"""
from __future__ import annotations

import json, types
import math
import os
import sys
import time

import numpy as np

try:
    import bpy
    from mathutils import Matrix, Vector, Quaternion
except Exception:  # 道すじの確認だけなら bpy なしでも読める
    bpy = None

FPS = 24.0
R_EARTH = 6371.0                    # km
T_LAT, T_LON = 36.29, 137.65        # 北アルプス（穂高）
SUN_AZ = 115.0                      # 北から時計回り（山の場面と同じ）
CUT_FRAME = 131                     # ここから山の場面
CLOUD_H = 3.5                       # 雲の球の高さ km
ATM_TOP = 100.0                     # 空気の上端 km
SENSOR = 36.0                       # mm

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

def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)

# ---------------------------------------------------------------- 座標
def _basis(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    e = np.array([-math.sin(lo), math.cos(lo), 0.0])
    n = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    u = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    return e, n, u

E_T, N_T, U_T = _basis(T_LAT, T_LON)
P_T = R_EARTH * U_T                                   # 目印の地球中心座標
M_W = np.array([E_T, N_T, U_T])                       # 地球中心座標のベクトル → 世界（東・北・上）
CENTER_W = -M_W @ P_T                                 # 地球の中心の世界座標 = (0,0,-R)

def ecef_to_world(p):
    return M_W @ (np.asarray(p, float) - P_T)

def vec_to_world(v):
    return M_W @ np.asarray(v, float)

def lonlat_ecef(lat, lon, alt=0.0):
    la, lo = math.radians(lat), math.radians(lon)
    return (R_EARTH + alt) * np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])

def along(bearing_deg, dist_km, alt=0.0):
    """目印から方位 bearing へ地面ぞいに dist km 進んだ点（地球中心座標）。"""
    b = math.radians(bearing_deg)
    d = math.sin(b) * E_T + math.cos(b) * N_T
    th = dist_km / R_EARTH
    q = math.cos(th) * U_T + math.sin(th) * d
    return (R_EARTH + alt) * q

# ---------------------------------------------------------------- カメラと太陽（コマ番号だけの関数）
# 手順 2: 3.4 秒から急降下し、4.7 秒から急にゆるめて（尾根をじっくり見せ）、5.1 秒に雲の層の上のふち（9.6 km）、5.458 秒（コマ 131）に 3.05 km
KT = [0.0, 1.7, 3.4, 3.8, 4.15, 4.45, 4.7, 4.9, 5.1, 5.458, 5.625]
_f_lnD = pchip(KT, np.log([1450.0, 1000.0, 550.0, 330.0, 185.0, 105.0, 62.0, 43.0, 33.0, 15.0, 13.0]))   # 目印までの地面ぞいの距離 km
_f_lnH = pchip(KT, np.log([1150.0, 820.0, 300.0, 135.0, 62.0, 31.0, 18.5, 12.8, 9.6, 3.05, 2.8]))        # 海面からの高さ km
_f_aim = pchip(KT, [0.0, 0.0, 0.0, 5.0, 10.0, 16.0, 22.0, 28.0, 32.0, 36.0, 38.0])                      # 見る点（目印から先 km）
_f_el = pchip([0.0, 1.0, 1.8, 2.6, 3.4, 4.4, 5.458, 5.625], [-14.0, -9.5, -4.5, -0.5, 2.2, 3.8, 5.0, 5.3])
_f_ev = pchip([0.0, 1.8, 3.4, 5.625], [3.2, 3.7, 3.8, 3.9])               # 露出（絞りのかわり。段）

VIEWS = {  # 出だしのカメラの方位（目印から見て）。終わりは 20°（向き 200°）で同じ
    "nne": 20.0, "ene": 70.0, "se": 135.0,
}
VIEW_START = {"nne": 20.0, "ene": 70.0, "se": 135.0}

def camera_state(frame, view="nne"):
    """カメラの位置（世界座標 km）・前・上・焦点距離 mm・高さ km を返す。"""
    t = frame / FPS
    D = math.exp(_f_lnD(t)); h = math.exp(_f_lnH(t))
    b0 = VIEW_START[view]
    beta = 20.0 + (b0 - 20.0) * (1.0 - smooth(0.2, 4.6, t))                 # 位置の方位が 20° へ回る
    cam = along(beta, D, h)
    aim = along(beta + 180.0, _f_aim(t), 1.5)
    up = unit(cam)
    fwd_aim = unit(aim - cam)
    # 始めは地平線が上のふちに来るように（数日の下げ角）、あとは見る点を向く
    dip = math.degrees(math.acos(R_EARTH / (R_EARTH + h)))
    vfov = 2 * math.degrees(math.atan(SENSOR * 9 / 16 / 2 / lens_mm(t)))
    dep_h = dip + vfov * 0.42
    horiz = unit(fwd_aim - up * np.dot(fwd_aim, up))
    dep_aim = math.degrees(math.asin(np.clip(-np.dot(fwd_aim, up), -1, 1)))
    w = smooth(0.3, 3.5, t)
    dep = (1 - w) * dep_h + w * dep_aim
    dep += 9.0 * smooth(3.4, 4.1, t) * (1.0 - smooth(4.5, 5.3, t))          # 急降下の間だけ少し下を向く（地平線が画面から外れ、また戻る）
    dr = math.radians(dep)
    fwd = unit(horiz * math.cos(dr) - up * math.sin(dr))
    return dict(pos=ecef_to_world(cam), fwd=vec_to_world(fwd), up=vec_to_world(up), lens=lens_mm(t), h=h, D=D,
                dep=dep, beta=beta)

def project(frame, lat, lon, alt=0.0, view="nne", W=1920, H=1080):
    """緯度経度の点がコマ frame の画面のどこに写るか（画素, 左上が原点）。カメラの後ろなら None。確認用。"""
    cs = camera_state(frame, view)
    p = ecef_to_world(lonlat_ecef(lat, lon, alt)) - cs["pos"]
    f = unit(cs["fwd"]); up = unit(cs["up"] - f * np.dot(cs["up"], f)); r = unit(np.cross(f, up)); u = np.cross(r, f)
    z = float(p @ f)
    if z <= 0:
        return None
    k = (SENSOR / 2) / cs["lens"]
    x = float(p @ r) / z / k; y = float(p @ u) / z / k / (H / W)
    return (x + 1) / 2 * W, (1 - y) / 2 * H

def lens_mm(t):
    return 35.0 - 7.0 * smooth(3.4, 5.2, t)

def sun_state(frame):
    """太陽の向き（世界座標。光源へ向かう単位ベクトル）。北アルプスでの高さ _f_el、方位 115°。"""
    el = math.radians(_f_el(frame / FPS)); az = math.radians(SUN_AZ)
    return np.array([math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)])

def exposure_ev(frame):
    return float(_f_ev(frame / FPS))

def white_fog(frame):
    """雲の中。コマ 123→129 で、雲の層の白から一様な最後の白（f3f1ec）へ。0〜1。"""
    return smooth(123.0, 129.0, frame)

# ---------------------------------------------------------------- 空気の表（太陽の光が空気を通る量）
BETA_R = np.array([0.0058, 0.0135, 0.0331])           # 1/km（海面の空気）
BETA_M = 0.0045                                         # 1/km
BETA_M_EXT = BETA_M / 0.9
OZONE = np.array([0.00065, 0.00188, 0.000085])        # 1/km
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
        zh = np.degrees(np.arccos(R_EARTH / r)) + 90.0            # その高さから見た地平線の天頂角
        self.zh = zh
        xg = (np.arange(self.NX) / (self.NX - 1)) ** 2             # 0 = 地平線すれすれ
        self.xg = xg
        tab = np.zeros((self.NR, self.NX, 3))
        for i in range(self.NR):
            x = xg * zh[i]
            zen = np.radians(zh[i] - x)                            # 地平線より上へ x 度
            tab[i] = self._col(r[i], np.cos(zen))
        self.tab = tab                                             # 3 つ: レイリー・ミー・オゾンの柱

    @staticmethod
    def _col(r, mu, n=96):
        """点（中心から r）から方向 mu（天頂側 cos）へ空気の上端まで進む間の 3 つの柱（km 単位の密度の積分）。"""
        mu = np.atleast_1d(mu)
        ra = R_EARTH + ATM_TOP
        b = r * mu
        disc = np.sqrt(np.maximum(b * b - r * r + ra * ra, 0))
        L = -b + disc
        out = np.zeros((len(mu), 3))
        f = (np.arange(n) + 0.5) / n
        for k in range(n):
            s = L * f[k]
            rr = np.sqrt(r * r + s * s + 2 * r * mu * s)
            dr_, dm_, do_ = dens(rr - R_EARTH)
            out[:, 0] += dr_ * L / n; out[:, 1] += dm_ * L / n; out[:, 2] += do_ * L / n
        return out

    def lookup(self, r, mu):
        """r, mu は同じ形の配列。戻りは (...,3) の柱。地面にさえぎられる向きは大きな値にする。"""
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
    """柱（レイリー・ミー・オゾン）→ 光の通りぬける割合 RGB。"""
    tau = BETA_R * cols[..., 0:1] + BETA_M_EXT * cols[..., 1:2] + OZONE * cols[..., 2:3]
    return np.exp(-tau)

def sun_curves():
    """地上で見たときの、太陽の光の色（高さの関数）と空の明かり。1 次元の画像 512x2（行 0: 光、行 1: 空）。"""
    el = np.linspace(-20.0, 90.0, 512)
    tab = AirTable()
    mu = np.sin(np.radians(el))
    cols = np.stack([tab.lookup(np.full_like(mu, R_EARTH), mu)], 0)[0]
    # 地面に当たる光は、太陽が地平線より下ならゼロ（空の明かりが受け持つ）。大気の屈折ぶんだけ少し延ばす
    tr = extinction(cols) * smooth_arr(el, -0.3, 0.6)[:, None]
    # 空の明かり: 昼は青、日の出日の入りの前後は暖色〜紫、夜は深い青
    blue = np.array([0.42, 0.62, 1.0]); warm = np.array([1.0, 0.66, 0.40]); violet = np.array([0.55, 0.45, 1.0])
    amp = np.where(el >= 0, 0.032, 0.032 * np.exp(el / 2.6)) + 0.0009
    wt = np.exp(-((el - 0.5) / 3.8) ** 2)
    wv = np.exp(-((el + 8.0) / 5.0) ** 2) * 0.5
    col = blue[None] * (1 - wt[:, None]) + warm[None] * wt[:, None]
    col = col * (1 - wv[:, None]) + violet[None] * wv[:, None]
    sky = col * amp[:, None]
    img = np.zeros((2, 512, 4), np.float32)
    img[0, :, :3] = tr; img[1, :, :3] = sky; img[:, :, 3] = 1.0
    return img

def smooth_arr(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

# ---------------------------------------------------------------- 引数
def parse_args(argv):
    a = dict(data="work/globe", out="work/globe_out", frame="77", res="1920x1080", samples="64", threads="2",
             border="", exr="0", view="nne", tag="", ev="0", air="0.3", denoise="0", terrain="1", deck="1")
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    for s in argv:
        if "=" in s:
            k, v = s.split("=", 1)
            a[k] = v
    return a

def frame_list(s):
    out = []
    for part in s.split(","):
        if "-" in part:
            rng, _, st = part.partition("/")          # 0-134/2 = 2 コマおき
            x, y = rng.split("-"); out += list(range(int(x), int(y) + 1, int(st or 1)))
        else:
            out.append(int(part))
    return out

# ---------------------------------------------------------------- 式を節（ノード）に変える小さな道具
class Ex:
    """スカラーの式。+ - * / と関数でノードをつなぐ。"""
    nt = None
    def __init__(self, sock):
        self.s = sock
    @staticmethod
    def _n(op, a, b=None, clamp=False):
        n = Ex.nt.nodes.new("ShaderNodeMath"); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, Ex):
                Ex.nt.links.new(v.s, n.inputs[i])
            else:
                n.inputs[i].default_value = float(v)
        return Ex(n.outputs[0])
    def __add__(s, o): return Ex._n("ADD", s, o)
    def __radd__(s, o): return Ex._n("ADD", o, s)
    def __sub__(s, o): return Ex._n("SUBTRACT", s, o)
    def __rsub__(s, o): return Ex._n("SUBTRACT", o, s)
    def __mul__(s, o): return Ex._n("MULTIPLY", s, o)
    def __rmul__(s, o): return Ex._n("MULTIPLY", o, s)
    def __truediv__(s, o): return Ex._n("DIVIDE", s, o)
    def __rtruediv__(s, o): return Ex._n("DIVIDE", o, s)
    def __neg__(s): return Ex._n("MULTIPLY", s, -1.0)

def fn(op, a, b=None, clamp=False):
    return Ex._n(op, a, b, clamp)

def sstep(x, a, b):
    n = Ex.nt.nodes.new("ShaderNodeMapRange"); n.interpolation_type = "SMOOTHSTEP"; n.clamp = True
    Ex.nt.links.new(x.s, n.inputs[0])
    for i, v in ((1, a), (2, b)):
        if isinstance(v, Ex):
            Ex.nt.links.new(v.s, n.inputs[i])
        else:
            n.inputs[i].default_value = float(v)
    return Ex(n.outputs[0])

def mix_f(a, b, f):
    """a*(1-f) + b*f（スカラー）"""
    return a * (1 - f) + b * f

class Vx:
    """3 次元ベクトルの式。"""
    def __init__(self, sock):
        self.s = sock
    @staticmethod
    def _n(op, a, b=None, scale=None):
        n = Ex.nt.nodes.new("ShaderNodeVectorMath"); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, Vx):
                Ex.nt.links.new(v.s, n.inputs[i])
            else:
                n.inputs[i].default_value = tuple(float(c) for c in v)
        if scale is not None:
            if isinstance(scale, Ex):
                Ex.nt.links.new(scale.s, n.inputs[3])
            else:
                n.inputs[3].default_value = float(scale)
        return n
    def __add__(s, o): return Vx(Vx._n("ADD", s, o).outputs[0])
    def __sub__(s, o): return Vx(Vx._n("SUBTRACT", s, o).outputs[0])

def vscale(a, k): return Vx(Vx._n("SCALE", a, None, scale=k).outputs[0])
def vdot(a, b): return Ex(Vx._n("DOT_PRODUCT", a, b).outputs["Value"])
def vcross(a, b): return Vx(Vx._n("CROSS_PRODUCT", a, b).outputs[0])
def vnorm(a): return Vx(Vx._n("NORMALIZE", a).outputs[0])
def vlen(a): return Ex(Vx._n("LENGTH", a).outputs["Value"])

def vsep(a):
    n = Ex.nt.nodes.new("ShaderNodeSeparateXYZ"); Ex.nt.links.new(a.s, n.inputs[0])
    return Ex(n.outputs[0]), Ex(n.outputs[1]), Ex(n.outputs[2])

def vcomb(x, y, z):
    n = Ex.nt.nodes.new("ShaderNodeCombineXYZ")
    for i, v in enumerate((x, y, z)):
        if isinstance(v, Ex):
            Ex.nt.links.new(v.s, n.inputs[i])
        else:
            n.inputs[i].default_value = float(v)
    return Vx(n.outputs[0])

def vconst(v):
    n = Ex.nt.nodes.new("ShaderNodeCombineXYZ")
    for i in range(3):
        n.inputs[i].default_value = float(v[i])
    return Vx(n.outputs[0]), n

# ---------------------------------------------------------------- 材料（地球・雲）
class Planet:
    def __init__(self, data, args):
        self.data = data; self.args = args
        self.meta = json.load(open(data + "/meta.json"))
        self.img = {}
        self.sun_nodes = None

    def load(self, name, fname, colour):
        im = bpy.data.images.load(os.path.join(self.data, fname), check_existing=True)
        im.colorspace_settings.name = "sRGB" if colour else "Non-Color"
        im.alpha_mode = "CHANNEL_PACKED"
        self.img[name] = im
        return im

    def tex(self, name, uv, interp="Linear", ext="EXTEND"):
        n = Ex.nt.nodes.new("ShaderNodeTexImage"); n.image = self.img[name]
        n.interpolation = interp; n.extension = ext
        Ex.nt.links.new(uv.s, n.inputs[0])
        return Vx(n.outputs[0])

    def build(self):
        d = self.data
        for k, f, c in (("G_rgb", "G_rgb.jpg", True), ("G_lights", "G_lights.png", False), ("G_cloud", "G_cloud.png", False),
                        ("G_land", "G_land.png", False)):
            self.load(k, f, c)
        for t in ("R", "C"):
            for k, f, c in ((t + "_rgb", f"{t}_rgb.jpg", True), (t + "_land", f"{t}_land.png", False),
                            (t + "_relief", f"{t}_relief.png", False), (t + "_lights", f"{t}_lights.png", False),
                            (t + "_cloud", f"{t}_cloud.png", False)):
                self.load(k, f, c)
        for t in ("M", "F"):                                   # 手順 2: 北アルプスの細かい段（無ければ飛ばす）
            if t in self.meta and os.path.exists(os.path.join(d, f"{t}_rgb.jpg")):
                self.load(t + "_rgb", f"{t}_rgb.jpg", True); self.load(t + "_relief", f"{t}_relief.png", False)
        if "M" in self.meta and os.path.exists(os.path.join(d, "M_low.png")):
            self.load("M_low", "M_low.png", False)
        # 太陽の光の色・空の明かり（1 次元の画像）
        curves = sun_curves()
        im = bpy.data.images.new("suncurve", 512, 2, float_buffer=True, alpha=True)
        im.colorspace_settings.name = "Non-Color"
        im.pixels.foreach_set(curves.reshape(-1)); im.update()
        self.img["curve"] = im

    # ----- 共通の「位置から緯度経度・太陽の高さ」
    def geo(self, world=False):
        tc = Ex.nt.nodes.new("ShaderNodeTexCoord")
        P = Vx(tc.outputs["Object"])
        if world:      # 面の頂点が世界座標（物は単位行列）のとき: 地球中心座標へ直す（位置の細かさを保つため地形はこちら）
            v = P - tuple(float(c) for c in CENTER_W)
            P = vcomb(vdot(v, tuple(M_W[:, 0])), vdot(v, tuple(M_W[:, 1])), vdot(v, tuple(M_W[:, 2])))
        x, y, z = vsep(P)
        r = vlen(P)
        lon = fn("ARCTAN2", y, x) * 57.29577951
        lat = fn("ARCSINE", z / r) * 57.29577951
        n = vnorm(P)
        sv, snode = vconst((0, 0, 1))
        self.sun_nodes = snode
        u = vdot(n, sv)
        el = fn("ARCSINE", u) * 57.29577951
        return dict(P=P, n=n, lon=lon, lat=lat, u=u, el=el)

    def uv(self, g, bb):
        lon0, lat0, lon1, lat1 = bb
        return vcomb((g["lon"] - lon0) / (lon1 - lon0), (g["lat"] - lat0) / (lat1 - lat0), 0.0)

    def window(self, g, bb, feather):
        lon0, lat0, lon1, lat1 = bb
        a = sstep(g["lon"], lon0, lon0 + feather) * (1 - sstep(g["lon"], lon1 - feather, lon1))
        b = sstep(g["lat"], lat0, lat0 + feather) * (1 - sstep(g["lat"], lat1 - feather, lat1))
        return a * b

    def layered(self, g, key):
        """G → R → C の順に重ねた値（ベクトルの 3 成分。灰色の絵は第 1 成分）。"""
        mG = self.meta["G"]["bbox"]; mR = self.meta["R"]["bbox"]; mC = self.meta["C"]["bbox"]
        out = None
        for tag, bb, fe in (("G", mG, 0.0), ("R", mR, 1.2), ("C", mC, 0.12),
                            ("M", self.meta.get("M", {}).get("bbox"), 0.08), ("F", self.meta.get("F", {}).get("bbox"), 0.03)):
            name = f"{tag}_{key}"
            if name not in self.img or bb is None:
                continue
            t = self.tex(name, self.uv(g, bb))
            if key == "relief" and tag in ("M", "F"):      # 細かい段は斜面の感度 112 で入れてある → 180 相当へ
                kk = 180.0 / self.meta[tag].get("relief_gain", 112.0)
                nd = Vx._n("MULTIPLY_ADD", t, (kk, kk, 1.0)); nd.inputs[2].default_value = (0.5 - 0.5 * kk, 0.5 - 0.5 * kk, 0.0)
                t = Vx(nd.outputs[0])
            if out is None:
                out = t
            else:
                w = self.window(g, bb, fe)
                m = Ex.nt.nodes.new("ShaderNodeMix"); m.data_type = "VECTOR"
                Ex.nt.links.new(w.s, m.inputs[0]); Ex.nt.links.new(out.s, m.inputs[4]); Ex.nt.links.new(t.s, m.inputs[5])
                out = Vx(m.outputs[1])
        return out

    def curve(self, el, row):
        v = 0.25 if row == 0 else 0.75
        uvv = vcomb((el + 20.0) / 110.0, v, 0.0)
        n = Ex.nt.nodes.new("ShaderNodeTexImage"); n.image = self.img["curve"]
        n.interpolation = "Linear"; n.extension = "EXTEND"
        Ex.nt.links.new(uvv.s, n.inputs[0])
        return Vx(n.outputs[0])

    def planet_material(self, world=False):
        m = bpy.data.materials.new("planet_t" if world else "planet"); m.use_nodes = True
        nt = m.node_tree; nt.nodes.clear(); Ex.nt = nt
        g = self.geo(world)
        col = self.layered(g, "rgb"); land = self.layered(g, "land"); rel = self.layered(g, "relief")
        lig = self.layered(g, "lights"); cld = self.layered(g, "cloud")
        landv = vsep(land)[0]
        gxs, gys, hs = vsep(rel)
        ex = float(self.args.get("relief", 1.6))
        gx = (gxs - 0.5) * (1 / 180.0 * 255.0) * ex
        gy = (gys - 0.5) * (1 / 180.0 * 255.0) * ex
        Hdeg = hs * 25.5
        # 地面の向き（東・北）と斜面で曲げた法線
        zz, _ = vconst((0, 0, 1))
        E = vnorm(vcross(zz, g["n"])); N = vcross(g["n"], E)
        nn = vnorm(g["n"] - vscale(E, gx) - vscale(N, gy))
        if world:
            nw = vcomb(vdot(nn, tuple(M_W[0])), vdot(nn, tuple(M_W[1])), vdot(nn, tuple(M_W[2])))
            vt = types.SimpleNamespace(outputs=[nw.s])
        else:
            vt = nt.nodes.new("ShaderNodeVectorTransform"); vt.vector_type = "NORMAL"
            vt.convert_from = "OBJECT"; vt.convert_to = "WORLD"
            nt.links.new(nn.s, vt.inputs[0])
        # 光と空
        tr = self.curve(g["el"], 0); sky = self.curve(g["el"], 1)
        shade = sstep(g["el"], Hdeg - 0.5, Hdeg + 0.8)
        # 陸（拡散）
        cl = nt.nodes.new("ShaderNodeMixRGB"); cl.blend_type = "MULTIPLY"; cl.inputs[0].default_value = 1.0
        hsn = nt.nodes.new("ShaderNodeHueSaturation")       # 11 月の山: 緑を落ち着かせる（写真は夏の色）
        hsn.inputs["Saturation"].default_value = float(self.args.get("sat", 0.70)); hsn.inputs["Value"].default_value = float(self.args.get("val", 0.88))
        nt.links.new(col.s, hsn.inputs["Color"])
        nt.links.new(hsn.outputs["Color"], cl.inputs[1]); nt.links.new(tr.s, cl.inputs[2])
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
        cs = nt.nodes.new("ShaderNodeMixRGB"); cs.blend_type = "MIX"
        nt.links.new(shade.s, cs.inputs[0]); cs.inputs[1].default_value = (0, 0, 0, 1); nt.links.new(cl.outputs[0], cs.inputs[2])
        nt.links.new(cs.outputs[0], diff.inputs["Color"]); nt.links.new(vt.outputs[0], diff.inputs["Normal"])
        # 海（光沢）
        pr = nt.nodes.new("ShaderNodeBsdfPrincipled")
        sc = nt.nodes.new("ShaderNodeMixRGB"); sc.blend_type = "MULTIPLY"; sc.inputs[0].default_value = 1.0
        sdark = nt.nodes.new("ShaderNodeMixRGB"); sdark.blend_type = "MULTIPLY"; sdark.inputs[0].default_value = 1.0
        k_sea = float(self.args.get('seak', 10.0)); nt.links.new(col.s, sdark.inputs[1]); sdark.inputs[2].default_value = (0.55 * k_sea, 0.65 * k_sea, 0.8 * k_sea, 1)
        nt.links.new(sdark.outputs[0], sc.inputs[1]); nt.links.new(tr.s, sc.inputs[2])
        nt.links.new(sc.outputs[0], pr.inputs["Base Color"])
        pr.inputs["Roughness"].default_value = float(self.args.get("rough", 0.42))
        pr.inputs["IOR"].default_value = 1.33
        pr.inputs["Specular IOR Level"].default_value = 0.5
        nt.links.new(vt.outputs[0], pr.inputs["Normal"])
        # 海の鏡のように返す空（フレネル）
        fr = nt.nodes.new("ShaderNodeFresnel"); fr.inputs["IOR"].default_value = 1.33
        em_sky_s = nt.nodes.new("ShaderNodeEmission")
        sk3 = nt.nodes.new("ShaderNodeVectorMath"); sk3.operation = "SCALE"; nt.links.new(sky.s, sk3.inputs[0])
        nt.links.new(fr.outputs[0], sk3.inputs[3])
        k = nt.nodes.new("ShaderNodeVectorMath"); k.operation = "SCALE"; nt.links.new(sk3.outputs[0], k.inputs[0]); k.inputs[3].default_value = float(self.args.get('skyrefl', 0.7))
        nt.links.new(k.outputs[0], em_sky_s.inputs["Color"])
        sea = nt.nodes.new("ShaderNodeAddShader"); nt.links.new(pr.outputs[0], sea.inputs[0]); nt.links.new(em_sky_s.outputs[0], sea.inputs[1])
        # 陸と海を混ぜる（陸の印）
        lm = sstep(landv, 0.35, 0.65)
        mixs = nt.nodes.new("ShaderNodeMixShader"); nt.links.new(lm.s, mixs.inputs[0])
        nt.links.new(sea.outputs[0], mixs.inputs[1]); nt.links.new(diff.outputs[0], mixs.inputs[2])
        # 空の明かり（地面の色 x 空）と夜の灯り
        amb = nt.nodes.new("ShaderNodeMixRGB"); amb.blend_type = "MULTIPLY"; amb.inputs[0].default_value = 1.0
        nt.links.new(hsn.outputs["Color"], amb.inputs[1]); nt.links.new(sky.s, amb.inputs[2])
        # 灯り: 色のばらつき（オレンジ〜白）と日の出とともに消える・雲の下は弱まる
        lv = vsep(lig)[0]
        lin = fn("POWER", lv, 2.2)
        lin_m = lin * sstep(landv * 4.0, 0.0, 1.0) * (1 - sstep(g["el"], -6.0, 2.0))
        cv = vsep(cld)[0]
        lin_m = lin_m * (1 - 0.85 * cv)
        nz = nt.nodes.new("ShaderNodeTexNoise"); nz.noise_dimensions = "3D"; nz.inputs["Scale"].default_value = 0.0035
        nz.inputs["Detail"].default_value = 3.0
        nt.links.new(g["P"].s, nz.inputs["Vector"])
        cr = nt.nodes.new("ShaderNodeValToRGB")
        cr.color_ramp.elements[0].color = (1.0, 0.50, 0.18, 1); cr.color_ramp.elements[1].color = (1.0, 0.86, 0.66, 1)
        cr.color_ramp.elements[0].position = 0.35; cr.color_ramp.elements[1].position = 0.65
        nt.links.new(nz.outputs["Fac"], cr.inputs[0])
        lc = nt.nodes.new("ShaderNodeVectorMath"); lc.operation = "SCALE"; nt.links.new(cr.outputs[0], lc.inputs[0])
        nt.links.new((lin_m * float(self.args.get("lights", 0.09))).s, lc.inputs[3])
        emi = nt.nodes.new("ShaderNodeEmission")
        tot = nt.nodes.new("ShaderNodeVectorMath"); tot.operation = "ADD"
        nt.links.new(lc.outputs[0], tot.inputs[0]); nt.links.new(amb.outputs[0], tot.inputs[1])
        nt.links.new(tot.outputs[0], emi.inputs["Color"])
        # 陸だけに空の明かり。海は上で別に足した
        em_mask = nt.nodes.new("ShaderNodeMixShader")
        tz = nt.nodes.new("ShaderNodeEmission"); tz.inputs["Color"].default_value = (0, 0, 0, 1)
        em_mask.inputs[0].default_value = 1.0; nt.links.new(tz.outputs[0], em_mask.inputs[1]); nt.links.new(emi.outputs[0], em_mask.inputs[2])
        fin = nt.nodes.new("ShaderNodeAddShader"); nt.links.new(mixs.outputs[0], fin.inputs[0]); nt.links.new(em_mask.outputs[0], fin.inputs[1])
        out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(fin.outputs[0], out.inputs[0])
        return m

    def cloud_material(self, low=False):
        m = bpy.data.materials.new("lowcloud" if low else "cloud"); m.use_nodes = True
        nt = m.node_tree; nt.nodes.clear(); Ex.nt = nt
        g = self.geo(low)
        if low:       # 谷にたまる雲（雲海）: 材料の絵 × 細かい雑音で縁をほぐす
            bb = self.meta["M"]["bbox"]
            a0 = vsep(self.tex("M_low", self.uv(g, bb)))[0] * self.window(g, bb, 0.04)
            nz = nt.nodes.new("ShaderNodeTexNoise"); nz.noise_dimensions = "3D"; nz.inputs["Scale"].default_value = 5.0
            nz.inputs["Detail"].default_value = 2.5; nz.inputs["Roughness"].default_value = 0.6
            nt.links.new(g["P"].s, nz.inputs["Vector"])
            a = sstep(a0 * (0.75 + 0.5 * Ex(nz.outputs["Fac"])), 0.42, 0.80)     # 谷の奥だけ残す（広がりすぎない）
            alpha = fn("MINIMUM", a * 0.98, 1.0)
            nz2 = nt.nodes.new("ShaderNodeTexNoise"); nz2.noise_dimensions = "3D"; nz2.inputs["Scale"].default_value = 14.0
            nz2.inputs["Detail"].default_value = 2.5; nz2.inputs["Roughness"].default_value = 0.6
            nt.links.new(g["P"].s, nz2.inputs["Vector"])
            a = a * 0.5 + Ex(nz2.outputs["Fac"]) * 0.9
            LOWVAR = 0.72 + 0.7 * Ex(nz2.outputs["Fac"])
        else:
            cld = self.layered(g, "cloud"); a = vsep(cld)[0]
            alpha = fn("MINIMUM", a * float(self.args.get("cloudk", 0.95)), 1.0)
        tr = self.curve(g["el"], 0); sky = self.curve(g["el"], 1)
        # 雲の凹凸（濃さの勾配で法線を曲げる）
        bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.8 if not low else 1.0; bump.inputs["Distance"].default_value = 3.0 if not low else 0.04
        nt.links.new(a.s, bump.inputs["Height"])
        dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
        cm = nt.nodes.new("ShaderNodeMixRGB"); cm.blend_type = "MULTIPLY"; cm.inputs[1].default_value = (0.92, 0.93, 0.96, 1)
        cm.inputs[0].default_value = 1.0
        if low:       # 雲海の明るさのむら（粒だった雲の頂）
            cm1 = nt.nodes.new("ShaderNodeMixRGB"); cm1.blend_type = "MULTIPLY"; cm1.inputs[0].default_value = 1.0
            trw = nt.nodes.new("ShaderNodeMixRGB"); trw.blend_type = "MIX"; trw.inputs[0].default_value = 0.55
            nt.links.new(tr.s, trw.inputs[1]); trw.inputs[2].default_value = (1.0, 1.0, 1.0, 1.0)      # 色の赤みを半分にする（雲は白）
            nt.links.new(trw.outputs[0], cm1.inputs[1]); nt.links.new(vcomb(LOWVAR, LOWVAR, LOWVAR).s, cm1.inputs[2]); nt.links.new(cm1.outputs[0], cm.inputs[2])
        else:
            nt.links.new(tr.s, cm.inputs[2])
        nt.links.new(cm.outputs[0], dif.inputs["Color"]); nt.links.new(bump.outputs[0], dif.inputs["Normal"])
        tl = nt.nodes.new("ShaderNodeBsdfTranslucent"); nt.links.new(cm.outputs[0], tl.inputs["Color"])
        dm = nt.nodes.new("ShaderNodeMixShader"); dm.inputs[0].default_value = 0.35
        nt.links.new(dif.outputs[0], dm.inputs[1]); nt.links.new(tl.outputs[0], dm.inputs[2])
        em = nt.nodes.new("ShaderNodeEmission")
        sk = nt.nodes.new("ShaderNodeVectorMath"); sk.operation = "SCALE"; nt.links.new(sky.s, sk.inputs[0]); sk.inputs[3].default_value = 1.6
        nt.links.new(sk.outputs[0], em.inputs["Color"])
        add = nt.nodes.new("ShaderNodeAddShader"); nt.links.new(dm.outputs[0], add.inputs[0]); nt.links.new(em.outputs[0], add.inputs[1])
        tp = nt.nodes.new("ShaderNodeBsdfTransparent")
        mx = nt.nodes.new("ShaderNodeMixShader"); nt.links.new(alpha.s, mx.inputs[0])
        nt.links.new(tp.outputs[0], mx.inputs[1]); nt.links.new(add.outputs[0], mx.inputs[2])
        out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(mx.outputs[0], out.inputs[0])
        return m

# ---------------------------------------------------------------- 場面
SUN_NODES = []
TERR = {}

def sphere(name, radius, segs, rings, mat):
    """球を numpy で作る（bpy.ops の球は大きいと極端に遅いため）。三角形だけ・外向き。"""
    th = np.pi * np.arange(1, rings) / rings
    ph = 2 * np.pi * np.arange(segs) / segs
    rows = np.stack([np.sin(th)[:, None] * np.cos(ph)[None], np.sin(th)[:, None] * np.sin(ph)[None],
                     np.broadcast_to(np.cos(th)[:, None], (rings - 1, segs))], -1).reshape(-1, 3)
    co = np.concatenate([rows, [[0, 0, 1.0], [0, 0, -1.0]]]) * radius
    top, bot = len(rows), len(rows) + 1
    j = np.arange(segs); j1 = (j + 1) % segs
    tris = []
    for i in range(rings - 2):
        a_ = i * segs + j; b_ = i * segs + j1; d_ = (i + 1) * segs + j; c_ = (i + 1) * segs + j1
        tris.append(np.stack([a_, d_, c_], 1)); tris.append(np.stack([a_, c_, b_], 1))
    tris.append(np.stack([np.full(segs, top), j1, j], 1))
    last = (rings - 2) * segs
    tris.append(np.stack([np.full(segs, bot), last + j1, last + j], 1))
    f = np.concatenate(tris).astype(np.int32)
    me = bpy.data.meshes.new(name)
    me.from_pydata(co.astype(np.float32).tolist(), [], f.tolist())
    me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    me.shade_smooth() if hasattr(me, "shade_smooth") else None
    # 向きの確認（外向きでなければ裏返す）
    p0 = me.polygons[len(me.polygons) // 2]
    if np.dot(np.array(p0.normal), np.array(p0.center)) < 0:
        raise RuntimeError("球の面の向きが内向き")
    return o

def build_scene(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = int(args["samples"]); cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.02
    cy.max_bounces = 2; cy.diffuse_bounces = 1; cy.glossy_bounces = 1; cy.transparent_max_bounces = 16
    cy.transmission_bounces = 1; cy.volume_bounces = 0; cy.caustics_reflective = False; cy.caustics_refractive = False
    cy.use_denoising = args.get('denoise', '0') == '1'
    if cy.use_denoising:
        cy.denoiser = 'OPENIMAGEDENOISE'
    cy.shading_system = False
    sc.render.threads_mode = "FIXED"; sc.render.threads = int(args["threads"])
    w, h = (int(x) for x in args["res"].lower().split("x"))
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.render.fps = 24
    sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = 0.3
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"
    sc.display_settings.display_device = "sRGB"
    sc.render.image_settings.file_format = "OPEN_EXR"; sc.render.image_settings.color_depth = "32"
    sc.render.image_settings.color_mode = "RGBA"
    w0 = bpy.data.worlds.new("w"); w0.use_nodes = True
    w0.node_tree.nodes["Background"].inputs["Color"].default_value = (0, 0, 0, 1)
    sc.world = w0
    # 地球と雲
    t0 = time.time()
    P = Planet(os.path.abspath(args["data"]), args); P.build()
    print(f"材料の読みこみ {time.time() - t0:.1f}s", flush=True)
    mp = P.planet_material(); sun_nodes = [P.sun_nodes]
    print(f"材料（地球）{time.time() - t0:.1f}s", flush=True)
    earth = sphere("earth", R_EARTH, 1024, 512, mp)
    mc = P.cloud_material(); sun_nodes.append(P.sun_nodes)
    cloud = sphere("cloud", R_EARTH + CLOUD_H, 768, 384, mc)
    cloud.visible_glossy = False
    TERR.clear()
    TERR["earth"] = earth; TERR["cloud"] = cloud
    if args.get("terrain", "1") == "1":
        TERR["mat"] = P.planet_material(world=True); sun_nodes.append(P.sun_nodes)
        TERR["h"] = Height(os.path.abspath(args["data"]))
        if "M_low" in P.img:
            ml = P.cloud_material(low=True); sun_nodes.append(P.sun_nodes)
            co_, tr_ = grid_mesh(P.meta["M"]["bbox"], 0.002, 0.002, 1.52, 0.07)
            TERR["low"] = make_mesh("lowcloud", co_, tr_, ml, shadow=True)
            TERR["low"].visible_glossy = False
    print(f"球 {time.time() - t0:.1f}s", flush=True)
    # 物の向きは地球中心座標 → 世界（行が 東・北・上）
    M4 = Matrix(((*M_W[0], 0), (*M_W[1], 0), (*M_W[2], 0), (0, 0, 0, 1)))
    for o in (earth, cloud):
        o.matrix_world = Matrix.Translation(Vector(CENTER_W)) @ M4
    # 太陽
    sun = bpy.data.lights.new("sun", "SUN"); sun.angle = math.radians(0.53)
    sun.energy = float(args.get("sunk", math.pi * 3.0))
    so = bpy.data.objects.new("sun", sun); sc.collection.objects.link(so)
    cam = bpy.data.cameras.new("cam"); cam.sensor_width = SENSOR; cam.sensor_fit = "HORIZONTAL"
    cam.clip_start = 0.05; cam.clip_end = 40000.0
    co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
    co.rotation_mode = "QUATERNION"
    return sc, co, so, sun_nodes, earth, cloud, M4

def cam_matrix(cs):
    f = unit(cs["fwd"]); up = unit(cs["up"] - f * np.dot(cs["up"], f))
    r = unit(np.cross(f, up)); u = np.cross(r, f)
    return Matrix(((r[0], u[0], -f[0], cs["pos"][0]), (r[1], u[1], -f[1], cs["pos"][1]),
                   (r[2], u[2], -f[2], cs["pos"][2]), (0, 0, 0, 1)))

def place(sc, co, so, sun_nodes, frame, view):
    sc.frame_set(frame)
    for df in (-1, 0, 1):
        cs = camera_state(frame + df, view)
        m = cam_matrix(cs)
        co.location = m.to_translation(); co.rotation_quaternion = m.to_quaternion()
        co.keyframe_insert("location", frame=frame + df); co.keyframe_insert("rotation_quaternion", frame=frame + df)
        co.data.lens = cs["lens"]; co.data.keyframe_insert("lens", frame=frame + df)
    s = sun_state(frame)
    so.rotation_mode = "QUATERNION"
    so.rotation_quaternion = Vector(s).to_track_quat("Z", "Y")
    # 太陽の向きを、地球中心座標（物の中の座標）で材料へ渡す
    s_ecef = M_W.T @ s
    for n in sun_nodes:
        for i in range(3):
            n.inputs[i].default_value = float(s_ecef[i])
    sc.frame_set(frame)

# ---------------------------------------------------------------- 手順 2: 地形の面（カメラの近くほど細かい）と雲の層
from scipy.ndimage import map_coordinates

def _ss(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

class Height:
    """標高（m）を緯度経度から読む。R → C → M → F の順に、絵と同じ窓でなめらかに重ねる（絵と面がずれないため）。"""
    def __init__(self, data):
        meta = json.load(open(data + "/meta.json"))
        self.lv = []
        for tag, fe in (("R", 0.0), ("C", 0.12), ("M", 0.08), ("F", 0.03)):
            f = f"{data}/{tag}_dem.npy"
            if tag in meta and os.path.exists(f):
                self.lv.append((np.load(f).astype(np.float32), meta[tag]["bbox"], meta[tag]["step"], fe))

    def __call__(self, lon, lat):
        h = None
        for a, bb, st, fe in self.lv:
            v = map_coordinates(a, [(bb[3] - lat) / st - 0.5, (lon - bb[0]) / st - 0.5], order=1, mode="nearest")
            if h is None:
                h = v * ((lon >= bb[0]) & (lon <= bb[2]) & (lat >= bb[1]) & (lat <= bb[3]))
            else:
                w = _ss(lon, bb[0], bb[0] + fe) * (1 - _ss(lon, bb[2] - fe, bb[2])) * _ss(lat, bb[1], bb[1] + fe) * (1 - _ss(lat, bb[3] - fe, bb[3]))
                h = h + w * (v - h)
        return h

def lonlat_world(lon, lat, alt_km):
    la, lo = np.radians(lat), np.radians(lon); r = R_EARTH + alt_km
    p = np.stack([r * np.cos(la) * np.cos(lo), r * np.cos(la) * np.sin(lo), r * np.sin(la)], -1)
    return (p - P_T) @ M_W.T

TERRAIN_FROM = 56          # このコマから地形の面を使う（高さの倍率を 56→84 で 0→1 にして、ぽんと出さない）
TERRAIN_N = 768

def terrain_mesh(cs, frame, hfun, N=TERRAIN_N):
    """カメラの足もとを中心に、入れ子の四角い輪（距離が 2 倍になるごとに目が 2 倍荒くなる）で作る。
    画面に入らない目は作らない。輪の境目は、細かい側のふちの間の点を荒い側の線上に乗せて隙間を無くす。"""
    s0 = 0.015 * 2.0 ** max(0, math.ceil(math.log2(max(cs["h"], 1e-3) / 12.0)))
    K = 0
    while N * s0 * 2 ** K < 1500.0:
        K += 1
    mlon = 111.320 * math.cos(math.radians(T_LAT)); mlat = 110.574
    dlon, dlat = 1.0 / mlon, 1.0 / mlat
    ce = M_W.T @ np.asarray(cs["pos"]) + P_T
    clat = math.degrees(math.asin(ce[2] / np.linalg.norm(ce))); clon = math.degrees(math.atan2(ce[1], ce[0]))
    cx = (clon - T_LON) * mlon; cy = (clat - T_LAT) * mlat
    sK = s0 * 2 ** K
    icK, jcK = int(round(cx / sK)), int(round(cy / sK))
    f = unit(cs["fwd"]); up = unit(cs["up"] - f * np.dot(cs["up"], f)); r_ = unit(np.cross(f, up)); u_ = np.cross(r_, f)
    tanH = (SENSOR / 2) / cs["lens"]; tanV = tanH * 9 / 16
    hs = smooth(56.0, 84.0, frame)
    pos_l, tri_l, base = [], [], 0
    W1 = 2 * N + 1
    for k in range(K + 1):
        s = s0 * 2 ** k; ic = icK * 2 ** (K - k); jc = jcK * 2 ** (K - k)
        CI, CJ = np.meshgrid(np.arange(ic - N, ic + N), np.arange(jc - N, jc + N), indexing="ij")
        CI = CI.ravel(); CJ = CJ.ravel()
        lon_c = T_LON + (CI + 0.5) * s * dlon; lat_c = T_LAT + (CJ + 0.5) * s * dlat
        ok = (lon_c > 120) & (lon_c < 152) & (lat_c > 24) & (lat_c < 52)
        if k > 0:
            ok &= ~((CI >= ic - N // 2) & (CI < ic + N // 2) & (CJ >= jc - N // 2) & (CJ < jc + N // 2))
        v = lonlat_world(lon_c[ok], lat_c[ok], 1.5) - cs["pos"]
        z = v @ f; x = v @ r_; y = v @ u_
        keep = (z > -3.5) & (np.abs(x) < np.maximum(z, 0) * tanH * 1.3 + 3.5 + s) & (np.abs(y) < np.maximum(z, 0) * tanV * 1.4 + 3.5 + s)
        idx = np.nonzero(ok)[0][keep]
        if len(idx) == 0:
            continue
        ci, cj = CI[idx], CJ[idx]
        a = (ci - (ic - N)) * W1 + (cj - (jc - N))
        ids = np.stack([a, a + W1, a + W1 + 1, a + 1], 1)               # 00, 10, 11, 01（東・北が増える向き）
        uq, inv = np.unique(ids.ravel(), return_inverse=True)
        inv = inv.reshape(-1, 4)
        I = uq // W1 + (ic - N); J = uq % W1 + (jc - N)
        lon = T_LON + I * s * dlon; lat = T_LAT + J * s * dlat
        Hm = hfun(lon, lat).astype(np.float64)
        if k < K:                                                          # 外側のふちの「間の点」を荒い側の線に乗せる
            ev = (np.abs(I - ic) == N) & ((J - jc) % 2 != 0)
            eh = (np.abs(J - jc) == N) & ((I - ic) % 2 != 0)
            if ev.any():
                Hm[ev] = 0.5 * (hfun(lon[ev], lat[ev] - s * dlat) + hfun(lon[ev], lat[ev] + s * dlat))
            if eh.any():
                Hm[eh] = 0.5 * (hfun(lon[eh] - s * dlon, lat[eh]) + hfun(lon[eh] + s * dlon, lat[eh]))
        land = (Hm[inv] > 0.5).any(1)
        tri_keep = inv[land]
        if len(tri_keep) == 0:
            continue
        used = np.unique(tri_keep.ravel())
        remap = np.full(len(uq), -1, np.int64); remap[used] = np.arange(len(used))
        tk = remap[tri_keep]
        pos_l.append(lonlat_world(lon[used], lat[used], np.maximum(Hm[used], 0) * hs / 1000.0 + 0.003).astype(np.float32))
        tri_l.append(np.concatenate([tk[:, [0, 1, 2]], tk[:, [0, 2, 3]]]).astype(np.int32) + base)
        base += len(used)
    return np.concatenate(pos_l), np.concatenate(tri_l)

def make_mesh(name, co, tris, mat, shadow=False):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co)); me.vertices.foreach_set("co", np.ascontiguousarray(co, np.float32).ravel())
    nt = len(tris)
    me.loops.add(nt * 3); me.loops.foreach_set("vertex_index", np.ascontiguousarray(tris, np.int32).ravel())
    me.polygons.add(nt); me.polygons.foreach_set("loop_start", np.arange(nt, dtype=np.int32) * 3)
    try:
        me.polygons.foreach_set("loop_total", np.full(nt, 3, np.int32))
    except Exception:
        pass
    me.update(calc_edges=False, calc_edges_loose=False) if False else me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    o.visible_shadow = shadow            # 影は地平線の絵と雲の球だけが作る（面は影を落とさない）
    return o

def grid_mesh(bbox, dlon, dlat, alt_km, bump_km=0.0):
    nx = int(round((bbox[2] - bbox[0]) / dlon)); ny = int(round((bbox[3] - bbox[1]) / dlat))
    lon, lat = np.meshgrid(bbox[0] + np.arange(nx + 1) * (bbox[2] - bbox[0]) / nx, bbox[1] + np.arange(ny + 1) * (bbox[3] - bbox[1]) / ny, indexing="ij")
    alt = np.full(lon.size, alt_km)
    if bump_km > 0:      # 雲海の面のうねり（固定の雑音。2 km と 0.6 km の波）
        rng = np.random.default_rng(20261127 + 21)
        from scipy.ndimage import zoom
        n1 = zoom(rng.standard_normal((nx // 20 + 2, ny // 20 + 2)), 20, order=1)[:nx + 1, :ny + 1]
        n2 = zoom(rng.standard_normal((nx // 6 + 2, ny // 6 + 2)), 6, order=1)[:nx + 1, :ny + 1]
        alt = alt + bump_km * (0.7 * n1 + 0.45 * n2).ravel()
    co = lonlat_world(lon.ravel(), lat.ravel(), alt).astype(np.float32)
    a = (np.arange(nx)[:, None] * (ny + 1) + np.arange(ny)[None, :]).ravel()
    q = np.stack([a, a + ny + 1, a + ny + 2, a + 1], 1)
    return co, np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]]]).astype(np.int32)

# ----- 高さ 2.6〜9.6 km の雲の層（描いたあとに、視線に沿って数値でたどって足す）
Z_TOP, Z_BOT = 9.6, 2.4
END_LIN = np.array([7.0372, 6.4638, 4.5385])   # 最後の白: AgX を通すとちょうど f3f1ec（243,241,236）になる線形の値（2026-11-27 に測った）
_NV = None

def noise_vol():
    global _NV
    if _NV is None:
        n = 64
        rng = np.random.default_rng(20261127 + 7)
        F = np.fft.fftn(rng.standard_normal((n, n, n)))
        k = np.sqrt(sum(np.fft.fftfreq(n).reshape([-1 if i == a else 1 for i in range(3)]) ** 2 for a in range(3)))
        k[0, 0, 0] = 1.0
        a = np.fft.ifftn(F * k ** -1.3).real
        _NV = np.clip((a - a.mean()) / a.std() / 2.4, -1, 1).astype(np.float32)
    return _NV

def fbm3(p, scales=(40.0, 12.0, 3.6), zstretch=2.5):
    vol = noise_vol(); out = 0.0; amp = 1.0; tot = 0.0
    for i, L in enumerate(scales):
        c = np.stack([p[:, 0] / L * 64 + 17.0 * i, p[:, 1] / L * 64 + 5.0 * i, p[:, 2] * zstretch / L * 64 + 31.0 * i])
        out = out + amp * map_coordinates(vol, c, order=1, mode="grid-wrap")
        tot += amp; amp *= 0.55
    return out / tot * 1.9

def cloud_deck(d, cpos, s, frame, key, core=0.0, th=0.12, ns=36):
    """視線 d（N,3）が高さ Z_BOT〜Z_TOP の雲の層を通りぬける割合 T（N）と、雲の光 S（N,3。最終の線形の明るさ）。
    上のふちは薄いちぎれ雲、深くなるほど一面の白。目印（北アルプス）から遠いほど途切れる。"""
    n = d.shape[0]
    T = np.ones(n); S = np.zeros((n, 3))
    rt, rb = R_EARTH + Z_TOP, R_EARTH + Z_BOT
    b = d @ cpos; c0 = cpos @ cpos
    dt_ = b * b - (c0 - rt * rt)
    ok = dt_ > 0
    sq = np.sqrt(np.maximum(dt_, 0)); t1, t2 = -b - sq, -b + sq
    db = b * b - (c0 - rb * rb); okb = db > 0
    sb = np.sqrt(np.maximum(db, 0)); u1, u2 = -b - sb, -b + sb
    ta = np.maximum(t1, 0.0); te = t2.copy()
    if c0 < rb * rb:                       # カメラが層より下
        ta = np.where(okb, np.maximum(ta, u2), ta)
    else:
        te = np.where(okb & (u1 > 0), np.minimum(te, u1), te)
    seg = te - ta
    ok &= (seg > 1e-4) & (te > 0)
    ii = np.nonzero(ok)[0]
    if len(ii) == 0:
        return T, S
    dd_ = d[ii]; ta_ = ta[ii]; sg = seg[ii]; ds = sg / ns
    jit = np.full(len(ii), 0.5)          # 揺らさない（粒が出るため）。雲はなめらかなので段は出ない
    Ti = np.ones(len(ii)); Si = np.zeros((len(ii), 3))
    warm = np.array([1.10, 0.97, 0.84]); white = np.array([1.0, 1.0, 1.0])
    for k in range(ns):
        tt = ta_ + sg * (k + jit) / ns
        p = cpos[None] + dd_ * tt[:, None]
        r = np.linalg.norm(p, axis=1); z = r - R_EARTH
        dist = R_EARTH * np.arccos(np.clip(p[:, 2] / r, -1, 1))   # 世界座標では目印は真上（0,0,R）
        cover = 1.0 - _ss(dist, 45.0, 110.0)
        q = fbm3(p)
        # 薄い層（7.6〜9.6 km）: 切れ目のあるちぎれ雲。上のふちほど薄い
        thin = 0.26 * _ss(z, Z_TOP, Z_TOP - 0.8) * _ss(z, 7.6, 8.3) * np.clip((q - th - 1.6 * (1.0 - cover)) / 0.55, 0, 1)
        # 芯（雲の中へ入るとき、コマ 119→125.5 で育つ）: 9.4 km から地面近くまで一面の白
        sig = thin
        if core > 0:
            sig = sig + 2.2 * core * _ss(z, 9.4, 8.4) * _ss(z, Z_BOT, Z_BOT + 0.6) * np.clip((q + 1.3 - 2.0 * (1.0 - cover)) / 0.6, 0, 1)
        a = 1.0 - np.exp(-sig * ds)
        depth = Z_TOP - z
        e = np.exp(-np.clip(depth, 0, None) / 0.9)
        col = (warm[None] * e[:, None] + white[None] * (1 - e)[:, None]) * (0.95 + 0.25 * np.exp(-np.clip(depth, 0, None) / 1.1))[:, None]
        Si += (Ti * a)[:, None] * col * END_LIN[None]
        Ti = Ti * (1.0 - a)
    T[ii] = Ti; S[ii] = Si
    return T, S

# ---------------------------------------------------------------- 空気（描いたあとに足す）
STARS = None

def stars_dirs():
    rng = np.random.default_rng((20261127, 1))
    n = 2600
    v = rng.normal(size=(n, 3)); v /= np.linalg.norm(v, axis=1)[:, None]
    mag = 1.0 / (rng.random(n) ** 0.9 + 0.05)             # 暗い星ばかり
    return v, np.clip(mag * 0.0016, 0, 0.03)

def pixel_rays(cs, W, H, xc, yc):
    """画素の中心座標（xc: 横, yc: 縦。画素 i の中心は i+0.5）の 1 次元の並びから、視線の向きの格子を作る。"""
    f = unit(cs["fwd"]); up = unit(cs["up"] - f * np.dot(cs["up"], f))
    r = unit(np.cross(f, up)); u = np.cross(r, f)
    xs = np.asarray(xc) / W * 2 - 1
    ys = 1 - np.asarray(yc) / H * 2
    k = (SENSOR / 2) / cs["lens"]
    X, Y = np.meshgrid(xs * k, ys * k * (H / W))
    d = f[None, None] + X[..., None] * r[None, None] + Y[..., None] * u[None, None]
    return d / np.linalg.norm(d, axis=-1, keepdims=True)

def march(d, cpos, s, air, ns):
    """視線 d（N,3）をたどって、通りぬける割合 Tv と、まわりこむ光 inscat（N,3）を返す。"""
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
    inscat = np.zeros((d.shape[0], 3)); Tv = np.ones((d.shape[0], 3))
    cosv = d @ s
    phR = 3 / (16 * math.pi) * (1 + cosv ** 2)
    g = 0.78
    phM = 3 / (8 * math.pi) * ((1 - g * g) * (1 + cosv ** 2)) / ((2 + g * g) * np.maximum(1 + g * g - 2 * g * cosv, 1e-4) ** 1.5)
    ds = seg / ns
    for k in range(ns):
        tt = ta0 + seg * (k + 0.5) / ns
        p = cpos[None] + d * tt[:, None]
        rr = np.linalg.norm(p, axis=1)
        dr_, dm_, do_ = dens(rr - R_EARTH)
        cols = air.lookup(rr, (p @ s) / rr)
        Ts = extinction(cols)
        sc_ = (BETA_R[None] * (dr_ * phR)[:, None] + BETA_M * (dm_ * phM)[:, None]) * math.pi
        inscat += Tv * Ts * sc_ * ds[:, None]
        Tv = Tv * np.exp(-(BETA_R[None] * dr_[:, None] + BETA_M_EXT * dm_[:, None] + OZONE[None] * do_[:, None]) * ds[:, None])
    return Tv, inscat

def atmosphere(L, cs, frame, W, H, box, air, args):
    """L: 描いた地面・雲の光（線形 RGB, 高さ x 幅 x 3）に、空気の通りぬけ・まわりこむ光を足す。
    空気はなめらかなので、大きな絵では半分の細かさで計算して引きのばす。"""
    x0, y0, x1, y1 = box
    s = unit(sun_state(frame))
    cpos = np.array(cs["pos"]) - CENTER_W
    bw, bh = x1 - x0, y1 - y0
    sc = 2 if (W * H > 2.5e6 and min(bw, bh) >= 64) else 1
    gw, gh = (bw + sc - 1) // sc, (bh + sc - 1) // sc
    xc = x0 + sc * (np.arange(gw) + 0.5); yc = y0 + sc * (np.arange(gh) + 0.5)
    Tv = np.empty((gh, gw, 3)); sk = np.empty((gh, gw, 3))
    Tc = np.ones((gh, gw, 1)); Sc = np.zeros((gh, gw, 3))
    use_deck = args.get("deck", "1") == "1" and frame >= 84
    gain = float(args.get("_gain", 1.0))
    NS = int(args.get("ns", 40))
    for r0 in range(0, gh, 96):
        r1 = min(gh, r0 + 96)
        d = pixel_rays(cs, W, H, xc, yc[r0:r1]); shp = d.shape[:2]
        t_, i_ = march(d.reshape(-1, 3), cpos, s, air, NS)
        Tv[r0:r1] = t_.reshape(shp + (3,)); sk[r0:r1] = i_.reshape(shp + (3,))
        if use_deck:
            tc_, sc_ = cloud_deck(d.reshape(-1, 3), cpos, s, frame, frame * 1000 + r0, smooth(119.0, 125.5, frame), 0.55 - 0.40 * smooth(106.0, 123.0, frame))
            Tc[r0:r1, :, 0] = tc_.reshape(shp); Sc[r0:r1] = sc_.reshape(shp + (3,)) / gain
    sk *= float(args.get("air", 1.0))
    if sc == 1:
        return (L * Tc + Sc) * Tv + sk
    # 引きのばし（線形補間）。格子の i 番目は画素座標 x0 + sc*(i+0.5)
    def up(a):
        fx = (np.arange(bw) + 0.5 - sc * 0.5) / sc; fy = (np.arange(bh) + 0.5 - sc * 0.5) / sc
        fx = np.clip(fx, 0, gw - 1); fy = np.clip(fy, 0, gh - 1)
        ix = np.minimum(fx.astype(int), max(gw - 2, 0)); iy = np.minimum(fy.astype(int), max(gh - 2, 0))
        ax = (fx - ix)[None, :, None]; ay = (fy - iy)[:, None, None]
        ix1 = np.minimum(ix + 1, gw - 1); iy1 = np.minimum(iy + 1, gh - 1)
        top = a[iy][:, ix] * (1 - ax) + a[iy][:, ix1] * ax
        bot = a[iy1][:, ix] * (1 - ax) + a[iy1][:, ix1] * ax
        return top * (1 - ay) + bot * ay
    return (L * up(Tc) + up(Sc)) * up(Tv) + up(sk)

def add_stars(img, cs, W, H, box):
    v, br = stars_dirs()
    x0, y0, x1, y1 = box
    f = unit(cs["fwd"]); up = unit(cs["up"] - f * np.dot(cs["up"], f)); r = unit(np.cross(f, up)); u = np.cross(r, f)
    vw = v @ M_W.T
    z = vw @ f; ok = z > 0.01
    k = (SENSOR / 2) / cs["lens"]
    X = (vw @ r) / z / k; Y = (vw @ u) / z / k / (H / W)
    px = ((X + 1) / 2 * W).astype(int); py = ((1 - Y) / 2 * H).astype(int)
    for i in np.nonzero(ok & (px >= x0) & (px < x1) & (py >= y0) & (py < y1))[0]:
        yy, xx = py[i] - y0, px[i] - x0
        base = img[yy, xx]
        img[yy, xx] = base + br[i] * np.array([0.85, 0.9, 1.0]) * (0.2 / max(0.2, base.max() * 40))

# ---------------------------------------------------------------- 描く・仕上げる
def render_frame(sc, co, so, sun_nodes, frame, args, air, out_dir):
    W, H = sc.render.resolution_x, sc.render.resolution_y
    box = (0, 0, W, H)
    if args["border"]:
        x0, y0, x1, y1 = (int(float(v)) for v in args["border"].split(","))
        sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x = x0 / W; sc.render.border_max_x = x1 / W
        sc.render.border_min_y = 1 - y1 / H; sc.render.border_max_y = 1 - y0 / H
        box = (x0, y0, x1, y1)
    else:
        sc.render.use_border = False
    tm = time.time()
    if "mat" in TERR:
        if "obj" in TERR:
            me_old = TERR["obj"].data; bpy.data.objects.remove(TERR.pop("obj")); bpy.data.meshes.remove(me_old)
        if frame >= TERRAIN_FROM:
            cs0 = camera_state(frame, args["view"])
            pos_, tri_ = terrain_mesh(cs0, frame, TERR["h"])
            TERR["obj"] = make_mesh("terrain", pos_, tri_, TERR["mat"])
            print(f"地形の面 {len(pos_) / 1e6:.2f}M 頂点 {len(tri_) / 1e6:.2f}M 面 {time.time() - tm:.1f}s", flush=True)
        if "low" in TERR:
            TERR["low"].hide_render = frame < 70
    sc.render.motion_blur_shutter = float(args.get("shutter", 0.12 + 0.18 * (1 - smooth(70.0, 80.0, frame)) + 0.12 * smooth(104.0, 118.0, frame)))   # 急降下は速いので短く
    place(sc, co, so, sun_nodes, frame, args["view"])
    sc.render.image_settings.file_format = "OPEN_EXR"; sc.render.image_settings.color_depth = "32"
    sc.render.image_settings.color_mode = "RGBA"; sc.view_settings.view_transform = "Standard"
    tmp = os.path.join(out_dir, f"_raw_{frame:04d}.exr")
    sc.render.filepath = tmp

    def one_pass(transparent, spp):
        sc.render.film_transparent = transparent; sc.cycles.samples = spp
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(tmp, check_existing=False)
        bw, bh = im.size
        a = np.empty(bw * bh * 4, np.float32); im.pixels.foreach_get(a)
        a = a.reshape(bh, bw, 4)[::-1].copy()                  # 上が先頭に
        bpy.data.images.remove(im); os.remove(tmp)
        return a
    cam_vis = ("cloud", "low")
    t0 = time.time()
    # 1 回目: 地面と海（雲は影だけ落とす）。2 回目: 雲だけ（透明の確率ゆらぎの粒を、サンプル数を増やして消す）
    for k in ("cloud", "low"):
        if k in TERR:
            TERR[k].visible_camera = False
    for k in ("earth", "obj"):
        if k in TERR:
            TERR[k].visible_camera = True
    arr = one_pass(False, int(args["samples"]))[..., :3]
    for k in ("cloud", "low"):
        if k in TERR:
            TERR[k].visible_camera = True
    for k in ("earth", "obj"):
        if k in TERR:
            TERR[k].visible_camera = False
    ca = one_pass(True, int(float(args.get("csamples", 2)) * int(args["samples"])))
    for k in ("earth", "obj"):
        if k in TERR:
            TERR[k].visible_camera = True
    sc.render.film_transparent = False
    arr = arr * (1.0 - ca[..., 3:4]) + ca[..., :3]
    dt = time.time() - t0
    cs = camera_state(frame, args["view"])
    x0, y0, x1, y1 = box
    arr = np.ascontiguousarray(arr[: y1 - y0, : x1 - x0])
    t1 = time.time()
    gain = 2.0 ** (exposure_ev(frame) + float(args["ev"]))
    a2 = dict(args); a2["_gain"] = gain
    lin = atmosphere(np.ascontiguousarray(arr), cs, frame, W, H, box, air, a2)
    add_stars(lin, cs, W, H, box)
    lin = lin * gain
    fog = white_fog(frame)
    if fog > 0:        # 最後は一様な白（f3f1ec）。ほんの少しだけ、ゆっくり動くむらを残す
        yy, xx = np.mgrid[box[1]:box[3], box[0]:box[2]]
        nzz = map_coordinates(noise_vol(), [xx.ravel() / W * 20.0 + frame * 0.15, yy.ravel() / W * 20.0, np.full(xx.size, 3.0)],
                              order=1, mode="grid-wrap").reshape(xx.shape)
        lin = lin * (1 - fog) + END_LIN[None, None] * (1.0 + 0.015 * nzz[..., None]) * fog
    return lin, dt, time.time() - t1

def save_png(lin, path, sc):
    h, w = lin.shape[:2]
    im = bpy.data.images.new("res", w, h, float_buffer=True, alpha=True)
    im.colorspace_settings.name = "Linear Rec.709"
    rgba = np.ones((h, w, 4), np.float32); rgba[..., :3] = lin[::-1]
    im.pixels.foreach_set(rgba.reshape(-1)); im.update()
    sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGB"; sc.render.image_settings.color_depth = "8"
    im.save_render(path, scene=sc)
    bpy.data.images.remove(im)

def save_exr(lin, path, sc):
    h, w = lin.shape[:2]
    im = bpy.data.images.new("resx", w, h, float_buffer=True, alpha=True)
    im.colorspace_settings.name = "Linear Rec.709"
    rgba = np.ones((h, w, 4), np.float32); rgba[..., :3] = lin[::-1]
    im.pixels.foreach_set(rgba.reshape(-1)); im.update()
    im.file_format = "OPEN_EXR"
    im.filepath_raw = path
    im.save()
    bpy.data.images.remove(im)

def main(argv=None):
    args = parse_args(sys.argv if argv is None else argv)
    out_dir = os.path.abspath(args["out"]); os.makedirs(out_dir, exist_ok=True)
    sc, co, so, sun_nodes, earth, cloud, M4 = build_scene(args)
    air = AirTable()
    for f in frame_list(args["frame"]):
        lin, dt, dp = render_frame(sc, co, so, sun_nodes, f, args, air, out_dir)
        suffix = ("_" + args["tag"]) if args["tag"] else ""
        if args["border"]:
            suffix += "_b" + args["border"].replace(",", "-")
        save_png(lin, os.path.join(out_dir, f"globe_{f:04d}{suffix}.png"), sc)
        if args["exr"] == "1":
            save_exr(lin, os.path.join(out_dir, f"globe_{f:04d}{suffix}.exr"), sc)
        print(f"frame {f}: render {dt:.1f}s post {dp:.1f}s", flush=True)

if __name__ == "__main__":
    main()
