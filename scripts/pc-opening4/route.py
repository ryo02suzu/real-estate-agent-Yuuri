"""山の場面（コマ 131〜599）のカメラの道すじ。numpy だけ（図を描くときだけ Pillow）。

使い方
    python3 route.py          # 表（0.5 秒ごと）と、決まりを破っている所を出す。WORK/route.json も書く
    python3 route.py --plot   # review/route/route-map.jpg・route-profile.jpg を書く

道すじは 3 本（つなぎ目①②で切れる。つなぎ目の前後 4 コマはもやの中で、位置は飛んでよい）。
  seg0: コマ 131〜229   涸沢の上 → 吊尾根 → 岳沢の上
  seg1: コマ 230〜371   梓川の森 → 梢すれすれ → 川すれすれ
  seg2: コマ 372〜599   東の尾根の森 → 尾根越え → 朝日と雲海へ漂う
位置は 時間の三次スプライン（速さ・加速が途切れない）。水平は「曲線 × 道のり s(t)」、高さは
「足元の面（地面＋木・水）を先読みしてなめらかにしたもの ＋ 指定した高さ」。
座標は東・北・上（m）。上は本当の標高（地球の丸みは引かない。場面を組む側で curvature_drop を引く）。
"""
from __future__ import annotations

import json
import math
import sys

import numpy as np

import config
import geo4

G = 9.81
DT = 1.0 / 96.0          # 細かい時間の刻み（コマの 4 分の 1）
PRE, POST = 48, 96       # 道すじの前後に足す細かいコマ数（先読み・なめらかにする用）

# ---------------------------------------------------------------------------
# 道すじの表（ここを直す）
#   名前, seg, 時刻(秒), 位置, 高さの決め方, 値
#   高さの決め方: 'abs' 標高(m) / 'rock' 地面の上(m) / 'tree' 梢の上(m) / 'water' 水面の上(m)
#   位置: ll(緯度, 経度) / between(A, B, 割合) / ext(A, B, 倍) / fwd(A, 方位, m)
#   時刻と位置の間隔で速さが決まる（s(t) の三次スプライン）。L0〜L10 は計画の点。縮めた時間割は config.py
# ---------------------------------------------------------------------------
PLAN = {  # 計画 2 章の点（緯度, 経度）
    "L0": (36.2948, 137.6561), "L1": (36.2927, 137.6552), "L2": (36.2868, 137.6525),
    "L3": (36.2851, 137.6517), "L4": (36.2542, 137.6485), "L5": (36.2537, 137.6495),
    "L6": (36.2533, 137.6509), "L7": (36.2530, 137.6522), "L8": (36.2432, 137.6873),
    "L9": (36.2423, 137.6894), "OKUHO": (36.2892, 137.6483),
}


def ll(lat, lon):
    e, n = geo4.to_local(lon, lat)
    return float(e), float(n)


PT = {k: ll(*v) for k, v in PLAN.items()}


def between(a, b, f):
    return (PT[a][0] + (PT[b][0] - PT[a][0]) * f, PT[a][1] + (PT[b][1] - PT[a][1]) * f)


def ext(a, b, k):
    """A から B へ向かう線を k 倍にした先（A + k (B - A)）"""
    return between(a, b, k)


def fwd(a, heading, m):
    h = math.radians(heading)
    return (PT[a][0] + m * math.sin(h), PT[a][1] + m * math.cos(h))


def _p(name, pos):
    PT[name] = pos
    return pos


F = lambda f: f / 24.0  # コマ番号 → 秒
C1, C2 = config.SEAM_FRAMES
HEAD = 118.0

# L9 の先は方位 118° の直線。L8 は尾根の手前 106 m（つなぎ目②の出口なので、どこでもよい）
L9T = 16.9
_p("L8x", ext("L9", "L8", 0.375))     # 尾根の手前 80 m（つなぎ目②の出口。どこでもよい）
_p("L4x", ext("L5", "L4", 1.45))      # つなぎ目①の出口（L5 の手前 152 m）
_p("L3x", fwd("L2", 200.9, 128.0))
_p("L2a", between("L2", "L3x", 0.42))
_p("L7x", between("L6", "L7", 0.68))   # つなぎ目②の入口
_p("L6a", between("L6", "L7x", 0.45))
_p("L5a", between("L5", "L6", 0.5))
_p("L5b", between("L5a", "L6", 0.51))
_p("L4a", between("L4x", "L5", 0.625))
_p("L8a", between("L8x", "L9", 0.55))
_p("L1a", between("L1", "L2", 0.443))
_p("L1b", between("L1", "L2", 0.761))
_p("L1c", between("L1", "L2", 0.934))
_p("L0x", ext("L1", "L0", 0.77))
_p("L9b", fwd("L9", HEAD, 20.0))
_p("L9c", fwd("L9", HEAD, 29.0))
_p("L9e", fwd("L9", HEAD, 68.4))

WAYPOINTS = [
    # ---- seg0 涸沢の上 → 吊尾根 → 岳沢の上 ----
    ("L0", 0, F(131), PT["L0x"], "abs", 3000.0),
    ("L1", 0, 5.80, PT["L1"], "abs", 2900.0),
    ("L1a", 0, 6.5, PT["L1a"], "rock", 250.0),
    ("L1b", 0, 7.2, PT["L1b"], "rock", 150.0),
    ("L1c", 0, 7.8, PT["L1c"], "rock", 80.0),
    ("L2", 0, 8.3, PT["L2"], "rock", 26.0),
    ("L2a", 0, 8.95, PT["L2a"], "rock", 80.0),
    ("L3", 0, F(C1 - 1), PT["L3x"], "abs", 3060.0),
    # ---- seg1 梓川の森 → 梢すれすれ → 川すれすれ ----
    ("L4", 1, F(C1), PT["L4x"], "tree", 75.0),
    ("L4a", 1, 10.34, PT["L4a"], "tree", 42.0),
    ("L5", 1, 11.1, PT["L5"], "tree", 13.2),
    ("L5a", 1, 12.5, PT["L5a"], "tree", 13.0),
    ("L5b", 1, 13.3, PT["L5b"], "water", 14.5),
    ("L6", 1, 14.1, PT["L6"], "water", 8.0),
    ("L6a", 1, 14.9, PT["L6a"], "water", 20.0),
    ("L7", 1, F(C2 - 1), PT["L7x"], "water", 27.0),
    # ---- seg2 東の尾根の森 → 尾根越え → 漂う（方位 118° の直線） ----
    ("L8", 2, F(C2), PT["L8x"], "tree", 24.0),
    ("L8a", 2, 16.2, PT["L8a"], "tree", 19.0),
    ("L9", 2, L9T, PT["L9"], "tree", 15.0),
    ("L9b", 2, 17.6, PT["L9b"], "abs", 2245.0),
    ("L9c", 2, 18.4, PT["L9c"], "abs", 2256.0),
    ("L10", 2, F(599), PT["L9e"], "abs", 2318.0),
]

# 区間: (seg, 最初のコマ, 最後のコマ, 始めの速さ m/秒, 終わりの速さ m/秒)  つなぎ目の前後で速さを ±20% にそろえる
SEGMENTS = [(0, 131, C1 - 1, 540.0, 140.0), (1, C1, C2 - 1, 150.0, 84.0), (2, C2, 599, 70.0, 6.0)]

# 見せ場の窓（秒）。この中は flow 4.5 まで、外は 3 まで
HERO = {"H1 吊尾根": (7.3, 9.6), "H2 梢と川": (10.2, 15.3), "H3 尾根越え": (15.4, 17.5)}
RIVER = (ll(36.2533, 137.6509), ll(36.2530, 137.6522))  # L6-L7 の川筋（水）
RIVER_R = 60.0
TREE_H = 25.0

# 向きを寄せる先: 名前, 時刻と重み。C1 は穂高の岸壁（奥穂高岳あたり）、L9 の先は方位 118°・地平線 55%
WALL_W = [(F(131), 0.6), (6.5, 0.5), (8.3, 0.0)]
EAST_W = [(L9T - 0.4, 0.0), (L9T + 0.6, 1.0)]
WALL_ALT = 3040.0
PITCH_FOLLOW = 0.45   # 上下は進む向きの 6 割だけ追う（急な上り下りでも画面が暴れない）
EAST_PITCH = 2.0   # 地平線をコマの高さの 55%（上から測る）に置くための上向き（28mm・縦 20.25mm）
TILT_T0, TILT_DEG = 24.0, 12.0
LOOK_AHEAD = 0.6
ROLL_BIAS = [(0, 0), (7.5, 0), (8.2, -4), (8.7, -4), (9.2, -10), (F(C1 - 1), -16), (F(C1), -16), (10.2, -8), (11.0, 0), (30, 0)]
LENS = [(0, 28), (6.6, 28), (7.4, 24), (13.9, 24), (14.8, 28), (18.0, 28), (19.2, 35), (30, 35)]
DRIFT_T = 18.4
MAX_TURN, MAX_ROLL = 35.0, 35.0


# ---------------------------------------------------------------------------
# 数値の道具（numpy だけ）
# ---------------------------------------------------------------------------
class CSpline:
    """三次スプライン。端は自然（d0 なし）か、端の傾き指定。範囲の外は端の傾きで直線"""

    def __init__(self, x, y, d0=None, d1=None):
        x = np.asarray(x, float)
        y = np.asarray(y, float)
        n = len(x)
        h = np.diff(x)
        A = np.zeros((n, n))
        b = np.zeros(n)
        for i in range(1, n - 1):
            A[i, i - 1], A[i, i], A[i, i + 1] = h[i - 1], 2 * (h[i - 1] + h[i]), h[i]
            b[i] = 6 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1])
        if d0 is None:
            A[0, 0] = 1.0
        else:
            A[0, 0], A[0, 1], b[0] = 2 * h[0], h[0], 6 * ((y[1] - y[0]) / h[0] - d0)
        if d1 is None:
            A[-1, -1] = 1.0
        else:
            A[-1, -2], A[-1, -1], b[-1] = h[-1], 2 * h[-1], 6 * (d1 - (y[-1] - y[-2]) / h[-1])
        self.x, self.y, self.M, self.h = x, y, np.linalg.solve(A, b), h

    def _in(self, t):
        x, y, M, h = self.x, self.y, self.M, self.h
        i = np.clip(np.searchsorted(x, t) - 1, 0, len(x) - 2)
        a, b = x[i + 1] - t, t - x[i]
        v = M[i] * a ** 3 / (6 * h[i]) + M[i + 1] * b ** 3 / (6 * h[i]) + (y[i] / h[i] - M[i] * h[i] / 6) * a + (y[i + 1] / h[i] - M[i + 1] * h[i] / 6) * b
        d = -M[i] * a ** 2 / (2 * h[i]) + M[i + 1] * b ** 2 / (2 * h[i]) - (y[i] / h[i] - M[i] * h[i] / 6) + (y[i + 1] / h[i] - M[i + 1] * h[i] / 6)
        return v, d

    def __call__(self, t):
        t = np.asarray(t, float)
        v, _ = self._in(np.clip(t, self.x[0], self.x[-1]))
        lo, hi = t < self.x[0], t > self.x[-1]
        if lo.any() or hi.any():
            _, d0 = self._in(np.array([self.x[0]]))
            _, d1 = self._in(np.array([self.x[-1]]))
            v = np.where(lo, self.y[0] + d0[0] * (t - self.x[0]), v)
            v = np.where(hi, self.y[-1] + d1[0] * (t - self.x[-1]), v)
        return v


def pchip(x, y):
    """単調な Hermite 補間（Fritsch-Carlson）。範囲の外は端の値"""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    h = np.diff(x)
    dl = np.diff(y) / h
    d = np.zeros(len(x))
    for k in range(1, len(x) - 1):
        if dl[k - 1] * dl[k] > 0:
            w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
            d[k] = (w1 + w2) / (w1 / dl[k - 1] + w2 / dl[k])
    d[0], d[-1] = dl[0], dl[-1]

    def f(t):
        t = np.clip(np.asarray(t, float), x[0], x[-1])
        i = np.clip(np.searchsorted(x, t) - 1, 0, len(x) - 2)
        s = (t - x[i]) / h[i]
        h00, h10, h01, h11 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s, -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
        return h00 * y[i] + h10 * h[i] * d[i] + h01 * y[i + 1] + h11 * h[i] * d[i + 1]

    return f


def gsm(y, sigma):
    """ガウスでなめらかに（端は点対称に折り返す）。sigma は刻みの数"""
    y = np.asarray(y, float)
    if sigma <= 0:
        return y
    r = int(4 * sigma) + 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    return np.convolve(np.pad(y, r, mode="reflect", reflect_type="odd"), k, mode="valid")


def smooth01(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def knots(t, table):
    """(時刻, 値) の表をなめらかにつなぐ"""
    tt = np.array([a for a, _ in table], float)
    vv = np.array([b for _, b in table], float)
    i = np.clip(np.searchsorted(tt, t) - 1, 0, len(tt) - 2)
    s = smooth01((t - tt[i]) / (tt[i + 1] - tt[i]))
    return vv[i] + (vv[i + 1] - vv[i]) * s


def wrap(a):
    return (a + 180.0) % 360.0 - 180.0


# ---------------------------------------------------------------------------
# 足元の面
# ---------------------------------------------------------------------------
_dem = None


def dem():
    global _dem
    if _dem is None:
        _dem = geo4.Dem()
    return _dem


def river_dist(e, n):
    (ax, ay), (bx, by) = RIVER
    dx, dy = bx - ax, by - ay
    u = np.clip(((e - ax) * dx + (n - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(e - (ax + u * dx), n - (ay + u * dy))


def surface(e, n):
    """(地面, 面（梢・水面）, 水の上か, 傾き)"""
    d = dem()
    g = d.height(e, n)
    sl = d.slope_deg(e, n)
    water = river_dist(e, n) < RIVER_R
    tree = np.where((g < 2400.0) & (sl < 35.0) & ~water, TREE_H, 0.0)
    return g, g + tree, water, sl


# ---------------------------------------------------------------------------
# 1 本の道すじをつくる
# ---------------------------------------------------------------------------
def build_segment(seg, f0, f1, v0, v1):  # noqa: C901
    wps = [w for w in WAYPOINTS if w[1] == seg]
    tw = np.array([w[2] for w in wps])
    pos = np.array([w[3] for w in wps])
    # 水平の曲線（弦の長さで媒介変数。自然スプライン。両端は直線で延長）
    u = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(pos, axis=0).T))])
    ce, cn = CSpline(u, pos[:, 0]), CSpline(u, pos[:, 1])
    ug = np.arange(-800.0, u[-1] + 1200.0, 0.25)
    pe, pn = ce(ug), cn(ug)
    sg = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(pe), np.diff(pn)))])
    sg -= np.interp(0.0, ug, sg)            # u=0 で s=0
    s_w = np.interp(u, ug, sg)
    st = CSpline(tw, s_w, v0, v1)           # 道のり s(t)
    t = (f0 * 4 + np.arange(-PRE, (f1 - f0) * 4 + POST + 1)) / 96.0
    s = st(t)
    uu = np.interp(s, sg, ug)
    e, n = ce(uu), cn(uu)
    g, S, water, sl = surface(e, n)
    # 指定の高さ → 足元の面からの高さ c(t)
    ws = [w for w in wps]
    sf = lookahead_surface(S)
    cw, tz = [], []
    for w in ws:
        ew, nw = w[3]
        gw, Sw, _, _ = surface(np.array([ew]), np.array([nw]))
        base = {"abs": 0.0, "rock": gw[0], "tree": Sw[0], "water": gw[0]}[w[4]]
        zw = w[5] + base
        iw = int(round((w[2] * 96.0 - (f0 * 4 - PRE))))
        cw.append(zw - sf[min(max(iw, 0), len(sf) - 1)])
        tz.append(zw)
    cfun = pchip(tw, np.array(cw))
    c = cfun(t)
    z = sf + c
    # 両端の外（先読み・なめらかにする用の足し分）は、端の傾きでそのまま延ばす（つなぎ目の降りる角度が端の地形に引かれない）
    for sel, ref in ((t > tw[-1], (t <= tw[-1]) & (t > tw[-1] - 0.3)), (t < tw[0], (t >= tw[0]) & (t < tw[0] + 0.3))):
        a1, b1 = np.polyfit(t[ref], z[ref], 1)
        z[sel] = a1 * t[sel] + b1
    zfun = pchip(tw, np.array(tz))
    m = 0.78 * c
    for _ in range(10):                      # 面の下に入らないように持ち上げて、なめらかに（最後は必ず面の上）
        z = gsm(z, 6)
        z = z + np.maximum(S + m - z, 0.0)
    z = gsm(z, 6)
    z = z + np.maximum(1.5 * gsm(np.maximum(S + m - z, 0.0), 10), 0.0)   # 最後の持ち上げは段差にならないようゆるやかに
    # 速さ・向き
    z[:] = z
    return dict(seg=seg, f0=f0, f1=f1, t=t, e=e, n=n, z=z, g=g, S=S, water=water, sl=sl, s=s, tw=tw)


def lookahead_surface(S):
    """足元の面の、少し先（0.8 秒）までの最大をなめらかにしたもの（尾根の手前で先に上がる）"""
    k0, k1 = 19, 77
    pad = np.pad(S, (k0, k1), mode="edge")
    win = np.lib.stride_tricks.sliding_window_view(pad, k0 + k1 + 1)
    return gsm(win.max(axis=1), 26)


def orient(sg):
    """向き（方位・上下・傾き・レンズ）を細かい刻みで"""
    t, e, n, z = sg["t"], sg["e"], sg["n"], sg["z"]
    k = int(round(LOOK_AHEAD * 96))
    pe, pn, pz = (np.pad(a, (0, k), mode="edge")[k:] for a in (e, n, z))
    # 先読みの方向（道すじの方向）
    de, dn, dz = pe - e, pn - n, pz - z
    h_a = np.degrees(np.arctan2(de, dn))
    p_a = np.degrees(np.arctan2(dz, np.hypot(de, dn)))
    # C1: 岸壁へ
    wall = np.array([*PT["OKUHO"]])
    h_w = np.degrees(np.arctan2(wall[0] - e, wall[1] - n))
    p_w = np.degrees(np.arctan2(WALL_ALT - z, np.hypot(wall[0] - e, wall[1] - n)))
    w1 = knots(t, WALL_W)
    h = h_a + w1 * wrap(h_w - h_a)
    p = PITCH_FOLLOW * p_a + w1 * (p_w - PITCH_FOLLOW * p_a)
    # L9 の先: 方位 118°・地平線 55%
    w2 = knots(t, EAST_W)
    h = h + w2 * wrap(HEAD - h)
    p = p + w2 * (EAST_PITCH - p)
    p = p + TILT_DEG * smooth01((t - TILT_T0) / (config.DURATION - TILT_T0))
    h = np.degrees(np.unwrap(np.radians(h)))
    h = gsm(h, 22)
    p = gsm(p, 32)
    # 傾き: 道すじの横の加速度から ＋ 手で足す傾き
    vh = np.hypot(np.gradient(e, DT), np.gradient(n, DT))
    psi = gsm(np.unwrap(np.arctan2(np.gradient(e), np.gradient(n))), 9)
    a_lat = vh * np.gradient(psi, DT)
    roll = np.degrees(np.arctan(a_lat / (8 * G))) + knots(t, ROLL_BIAS)
    roll = np.clip(gsm(roll, 14), -MAX_ROLL, MAX_ROLL)
    lens = knots(t, LENS)
    flight = np.degrees(np.arctan2(np.gradient(z), np.hypot(np.gradient(e), np.gradient(n))))
    sg.update(head=h, pitch=p, roll=roll, lens=lens, flight=flight)
    return sg


# ---------------------------------------------------------------------------
# 全コマ
# ---------------------------------------------------------------------------
def build():
    segs = [orient(build_segment(*s)) for s in SEGMENTS]
    recs = {}
    for sg in segs:
        for f in range(sg["f0"], sg["f1"] + 1):
            k = (f - sg["f0"]) * 4 + PRE
            sl = slice(k - 1, k + 2)
            v3 = np.array([sg["e"][k + 1] - sg["e"][k - 1], sg["n"][k + 1] - sg["n"][k - 1], sg["z"][k + 1] - sg["z"][k - 1]]) / (2 * DT)
            speed = float(np.linalg.norm(v3))
            kk = slice(k - 2, k + 3, 4)
            hr = (sg["head"][k + 2] - sg["head"][k - 2]) / (4 * DT)
            pr = (sg["pitch"][k + 2] - sg["pitch"][k - 2]) / (4 * DT)
            turn = math.hypot(hr * math.cos(math.radians(sg["pitch"][k])), pr)
            clear = float(sg["z"][k] - sg["S"][k])
            recs[f] = dict(f=f, t=f / 24.0, seg=sg["seg"], e=float(sg["e"][k]), n=float(sg["n"][k]), z=float(sg["z"][k]),
                           heading_deg=float(sg["head"][k] % 360.0), pitch_deg=float(sg["pitch"][k]), roll_deg=float(sg["roll"][k]),
                           lens_mm=float(sg["lens"][k]), ground=float(sg["g"][k]), clearance=clear, speed=speed,
                           flow=speed / max(clear, 1.0), turn=turn, flight=float(sg["flight"][k]), vz=float(v3[2]),
                           water=bool(sg["water"][k]), head_raw=float(sg["head"][k]), seam=False)
    # つなぎ目: 前後 4 コマの向き・傾き・レンズは、前の出口から後ろの入口へなめらかにつなぐ
    for c in config.SEAM_FRAMES:
        a, b = recs[c - config.SEAM_HALF - 1], recs[c + config.SEAM_HALF]
        for f in range(c - config.SEAM_HALF, c + config.SEAM_HALF):
            s = float(smooth01((f - (c - config.SEAM_HALF - 1)) / (2 * config.SEAM_HALF + 1)))
            r = recs[f]
            r["seam"] = True
            r["heading_raw"] = a["head_raw"] + wrap(b["head_raw"] - a["head_raw"]) * s
            r["heading_deg"] = r["heading_raw"] % 360.0
            for key in ("pitch_deg", "roll_deg", "lens_mm"):
                r[key] = a[key] + (b[key] - a[key]) * s
    out = []
    for f in range(config.FIRST_MOUNTAIN_FRAME, config.FRAMES):
        r = recs[f]
        lon, lat = geo4.to_lonlat(r["e"], r["n"])
        r["lat"], r["lon"] = float(lat), float(lon)
        out.append(r)
    return out, segs


def write_json(out):
    config.WORK.mkdir(parents=True, exist_ok=True)
    keys = ["f", "t", "e", "n", "z", "lat", "lon", "heading_deg", "pitch_deg", "roll_deg", "lens_mm", "ground", "clearance", "speed", "flow", "seg", "seam"]
    data = [{k: (round(r[k], 4) if isinstance(r[k], float) else r[k]) for k in keys} for r in out]
    (config.WORK / "route.json").write_text(json.dumps(data, ensure_ascii=False))
    return data


_cache = None


def _load():
    global _cache
    if _cache is None:
        p = config.WORK / "route.json"
        if not p.exists():
            write_json(build()[0])
        _cache = {d["f"]: d for d in json.loads(p.read_text())}
    return _cache


def camera_at(frame):
    """コマ（131〜599）のカメラ。e, n, z は東・北・標高（m）。向きは度（方位は北から時計回り・上下は上が正・傾きは右が正）"""
    return dict(_load()[int(frame)])


def all_positions():
    """全コマの (コマ, 東, 北, 上) の配列（細かさの段 LOD を全コマのカメラから決めるため）"""
    c = _load()
    return np.array([[f, c[f]["e"], c[f]["n"], c[f]["z"]] for f in sorted(c)])


# ---------------------------------------------------------------------------
# 検査と表
# ---------------------------------------------------------------------------
def beat_of(t):
    for name, a, b in reversed(config.BEATS):
        if a <= t < b and name[0] in "CDE":
            return name.split()[0]
    for name, a, b in config.BEATS:
        if a <= t < b:
            return name.split()[0]
    return "-"


def in_hero(t):
    return any(a <= t <= b for a, b in HERO.values())


def check(out):
    v = []
    byf = {r["f"]: r for r in out}

    def rng(frames, msg):
        if not frames:
            return
        runs, s = [], frames[0]
        for a, b in zip(frames, frames[1:] + [None]):
            if b is None or b != a + 1:
                runs.append((s, a))
                s = b
        v.extend(f"{msg}: コマ {a}〜{b}（{a/24:.2f}〜{b/24:.2f} 秒）" for a, b in runs)

    ok = [r for r in out if not r["seam"]]
    rng([r["f"] for r in ok if r["flow"] > 4.5], "flow が 4.5 を超える")
    rng([r["f"] for r in ok if r["flow"] > 3.0 and not in_hero(r["t"])], "見せ場の外で flow が 3 を超える")
    rng([r["f"] for r in ok if r["clearance"] < 6.0], "高さが 6m 未満")
    rng([r["f"] for r in ok if r["turn"] > MAX_TURN], "向きの回る速さが 35°/秒を超える")
    rng([r["f"] for r in out if abs(r["roll_deg"]) > MAX_ROLL + 0.01], "傾きが 35° を超える")
    rng([r["f"] for r in ok if r["t"] < DRIFT_T and r["speed"] < 3.0], "18.4 秒より前に止まりかけ（3 m/秒未満）")
    rng([r["f"] for r in ok if r["t"] >= DRIFT_T and not (10.0 <= r["speed"] <= 15.0)], "18.4 秒より後の漂う速さが 10〜15 m/秒の外")
    # 吊尾根
    a, b = HERO["H1 吊尾根"]
    w = [r for r in ok if a <= r["t"] <= b]
    mc = min(r["clearance"] for r in w)
    if not 15.0 <= mc <= 30.0:
        v.append(f"吊尾根の最小の高さ {mc:.1f}m が 15〜30m の外")
    r2 = [r for r in ok if abs(r["t"] - 8.3) < 0.05]
    rng([r["f"] for r in r2 if not 15.0 <= r["clearance"] <= 30.0], "L2 の前後 0.05 秒で岩の上 15〜30m の外")
    # 梢と川
    t5, t6 = 11.1, 14.1
    tree = [r for r in ok if t5 <= r["t"] <= t6 and not r["water"]]
    zone_in = min([r["t"] for r in ok if t5 <= r["t"] <= t6 and r["water"]] or [t6])
    rng([r["f"] for r in tree if r["t"] < zone_in and not 8.0 <= r["clearance"] <= 15.0], "梢の上 8〜15m の外（川の手前）")
    rng([r["f"] for r in ok if -0.3 <= r["t"] - t6 <= 0.15 and r["water"] and not 6.0 <= r["clearance"] <= 10.0], "L6 の前 0.3 秒〜後 0.15 秒で水面の上 6〜10m の外")
    # 尾根越え
    rng([r["f"] for r in ok if -0.3 <= r["t"] - L9T <= 0.15 and not 12.0 <= r["clearance"] <= 20.0], "L9 の前後 0.3 秒で梢の上 12〜20m の外")
    # つなぎ目
    for c in config.SEAM_FRAMES:
        a, b = byf[c - 1], byf[c]
        if abs(b["speed"] / a["speed"] - 1) > 0.2:
            v.append(f"つなぎ目 {c}: 速さ {a['speed']:.0f}→{b['speed']:.0f} m/秒（±20% の外）")
        if abs(b["flight"] - a["flight"]) > 2.0:
            v.append(f"つなぎ目 {c}: 降りる角度 {a['flight']:.1f}→{b['flight']:.1f}°（±2° の外）")
        if abs(b["roll_deg"] - a["roll_deg"]) > 2.0:
            v.append(f"つなぎ目 {c}: 傾き {a['roll_deg']:.1f}→{b['roll_deg']:.1f}°（±2° の外）")
    a, b = byf[C2 - 1], byf[C2]
    if abs(wrap(b["head_raw"] - a["head_raw"])) > 3.0 + 40:
        pass  # つなぎ目②の向きは、もやの中でそろえる（下で見る）
    # 速さが 1 コマで 25% 以上変わる所（高さのカクつき）
    rng([f for f in range(config.FIRST_MOUNTAIN_FRAME + 1, config.FRAMES)
         if not (byf[f]["seam"] or byf[f - 1]["seam"] or f in config.SEAM_FRAMES)
         and abs(byf[f]["speed"] - byf[f - 1]["speed"]) > 0.25 * byf[f - 1]["speed"] + 2.0], "速さが 1 コマで急に変わる")
    # 加速の連続・位置の飛び（つなぎ目以外）
    for f in range(config.FIRST_MOUNTAIN_FRAME + 1, config.FRAMES):
        if byf[f]["seam"] or byf[f - 1]["seam"] or f in config.SEAM_FRAMES:
            continue
        d = math.dist((byf[f]["e"], byf[f]["n"], byf[f]["z"]), (byf[f - 1]["e"], byf[f - 1]["n"], byf[f - 1]["z"]))
        if d > 1.3 * max(byf[f]["speed"], byf[f - 1]["speed"]) / 24 + 0.5:
            v.append(f"コマ {f}: 位置が飛ぶ（{d:.1f}m）")
    return v


def table(out, step=0.5):
    print(f"{'t':>5} {'beat':>4} {'lat':>9} {'lon':>9} {'alt':>6} {'ground':>6} {'clear':>5} {'speed':>5} {'flow':>4} {'head':>5} {'pitch':>5} {'roll':>5} {'lens':>4}")
    byf = {r["f"]: r for r in out}
    t = 5.5
    while t < 25.0:
        f = int(round(t * 24))
        if f in byf:
            r = byf[f]
            print(f"{r['t']:5.2f} {beat_of(r['t']):>4} {r['lat']:9.5f} {r['lon']:9.5f} {r['z']:6.0f} {r['ground']:6.0f} {r['clearance']:5.1f} {r['speed']:5.0f} {r['flow']:4.1f} {r['heading_deg']:5.0f} {r['pitch_deg']:5.1f} {r['roll_deg']:5.1f} {r['lens_mm']:4.0f}"
                  + ("  もや" if r["seam"] else ""))
        t += step


# ---------------------------------------------------------------------------
# 図（Pillow）
# ---------------------------------------------------------------------------
def plot(out, segs):
    from PIL import Image, ImageDraw, ImageFont

    outdir = config.HERE / "review" / "route"
    outdir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    d = dem()
    g = d.valley
    colors = [(255, 120, 60), (60, 200, 255), (255, 230, 60)]
    # --- 平面図 ---
    e0, e1, n0, n1, sc = -400.0, 5300.0, -1400.0, 5600.0, 0.18
    W, H = int((e1 - e0) * sc), int((n1 - n0) * sc)
    ee = e0 + (np.arange(W) + 0.5) / sc
    nn = n1 - (np.arange(H) + 0.5) / sc
    E, N = np.meshgrid(ee, nn)
    h = d.height(E, N)
    gx = (d.height(E + 12, N) - d.height(E - 12, N)) / 24.0
    gy = (d.height(E, N + 12) - d.height(E, N - 12)) / 24.0
    az, el = math.radians(315.0), math.radians(40.0)
    lx, ly, lz = math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)
    nz = 1.0 / np.sqrt(gx ** 2 + gy ** 2 + 1.0)
    shade = np.clip(nz * lz + (-gx * nz) * lx + (-gy * nz) * ly, 0, 1)
    tone = 70 + 150 * shade
    hh = np.clip((h - 1400.0) / 1800.0, 0, 1)
    rgb = np.stack([tone * (0.75 + 0.25 * hh), tone * (0.85 + 0.1 * hh), tone * (0.7 + 0.3 * hh)], -1)
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    P = lambda e, n: ((e - e0) * sc, (n1 - n) * sc)
    for sg in segs:
        k0, k1 = PRE, (sg["f1"] - sg["f0"]) * 4 + PRE
        pts = [P(sg["e"][k], sg["n"][k]) for k in range(k0, k1 + 1)]
        dr.line(pts, fill=colors[sg["seg"]], width=3)
    for a, b in ((0, 1), (1, 2)):
        pa = P(segs[a]["e"][(segs[a]["f1"] - segs[a]["f0"]) * 4 + PRE], segs[a]["n"][(segs[a]["f1"] - segs[a]["f0"]) * 4 + PRE])
        pb = P(segs[b]["e"][PRE], segs[b]["n"][PRE])
        for q in range(0, 20, 2):  # つなぎ目の飛びは点線
            x0 = pa[0] + (pb[0] - pa[0]) * q / 20.0
            y0 = pa[1] + (pb[1] - pa[1]) * q / 20.0
            x1 = pa[0] + (pb[0] - pa[0]) * (q + 1) / 20.0
            y1 = pa[1] + (pb[1] - pa[1]) * (q + 1) / 20.0
            dr.line([(x0, y0), (x1, y1)], fill=(255, 255, 255), width=2)
    for r in out:
        if r["f"] % 24 == 0 and not r["seam"]:
            x, y = P(r["e"], r["n"])
            dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 255), outline=(0, 0, 0))
            dr.text((x + 5, y - 5), f"{r['t']:.0f}s", fill=(255, 255, 255), font=font)
    for w in WAYPOINTS:
        if w[0] in ("L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10"):
            x, y = P(*w[3])
            dr.text((x - 22, y + 4), w[0], fill=(255, 40, 40), font=font)
    sx, sy = P(*PT["OKUHO"])
    dr.text((sx, sy), "Okuhotaka", fill=(0, 0, 0), font=font)
    ex, ey = P(0, 0)
    dr.text((ex, ey), "Kappabashi", fill=(0, 0, 0), font=font)
    dr.text((8, 8), "route map  orange=seg0  cyan=seg1  yellow=seg2  dashed=seam jump", fill=(255, 255, 255), font=font)
    im.save(outdir / "route-map.jpg", quality=85)
    # --- 高さと速さ ---
    W2, H2 = 1280, 900
    img = Image.new("RGB", (W2, H2), (250, 250, 247))
    dr = ImageDraw.Draw(img)
    T0, T1 = 5.4, 25.0
    X = lambda t: 70 + (t - T0) / (T1 - T0) * (W2 - 100)
    panels = [(30, 340, "altitude (m): camera, ground, surface (tree top)", 1400, 3200, False),
              (400, 590, "speed (m/s, log)", 5, 700, True), (650, 860, "flow = speed / clearance (1/s)", 0, 6, False)]
    ts = np.array([r["t"] for r in out])
    ser = {"z": np.array([r["z"] for r in out]), "g": np.array([r["ground"] for r in out]),
           "S": np.array([r["z"] - r["clearance"] for r in out]), "v": np.array([r["speed"] for r in out]),
           "fl": np.array([r["flow"] for r in out])}
    seam = np.array([r["seam"] for r in out])
    for (ya, yb, title, lo, hi, lg) in panels:
        Y = (lambda v: yb - (math.log10(max(v, lo)) - math.log10(lo)) / (math.log10(hi) - math.log10(lo)) * (yb - ya)) if lg else (lambda v: yb - (v - lo) / (hi - lo) * (yb - ya))
        dr.rectangle([70, ya, W2 - 30, yb], outline=(120, 120, 120))
        dr.text((74, ya - 14), title, fill=(0, 0, 0), font=font)
        for a, b in HERO.values():
            dr.rectangle([X(a), ya, X(b), yb], fill=(255, 240, 215))
        for c in config.SEAM_FRAMES:
            dr.rectangle([X((c - 4) / 24), ya, X((c + 4) / 24), yb], fill=(215, 225, 240))
        for tt in range(6, 26):
            dr.line([(X(tt), yb), (X(tt), yb + 4)], fill=(0, 0, 0))
            if yb == 860 or yb == 340 and tt % 2 == 0:
                dr.text((X(tt) - 6, yb + 6), str(tt), fill=(0, 0, 0), font=font)

        def line(v, col):
            pts = []
            for k in range(len(ts)):
                if seam[k]:
                    if len(pts) > 1:
                        dr.line(pts, fill=col, width=2)
                    pts = []
                else:
                    pts.append((X(ts[k]), Y(v[k])))
            if len(pts) > 1:
                dr.line(pts, fill=col, width=2)

        if title.startswith("altitude"):
            line(ser["g"], (120, 90, 60))
            line(ser["S"], (30, 130, 40))
            line(ser["z"], (220, 40, 40))
        elif title.startswith("speed"):
            line(ser["v"], (30, 60, 200))
            for v in (10, 100):
                dr.line([(70, Y(v)), (W2 - 30, Y(v))], fill=(200, 200, 200))
                dr.text((30, Y(v) - 5), str(v), fill=(0, 0, 0), font=font)
        else:
            line(ser["fl"], (160, 40, 160))
            for v, col in ((3, (60, 160, 60)), (4.5, (220, 60, 60))):
                dr.line([(70, Y(v)), (W2 - 30, Y(v))], fill=col)
                dr.text((30, Y(v) - 5), str(v), fill=col, font=font)
        if title.startswith("altitude"):
            for v in range(1500, 3200, 500):
                dr.text((30, Y(v) - 5), str(v), fill=(0, 0, 0), font=font)
    dr.text((900, 36), "orange=hero pass, blue=seam (haze)", fill=(0, 0, 0), font=font)
    img.save(outdir / "route-profile.jpg", quality=88)
    print("図:", outdir / "route-map.jpg", outdir / "route-profile.jpg")


def main():
    out, segs = build()
    write_json(out)
    table(out)
    v = check(out)
    print(f"\n決まり破り {len(v)} 件")
    for m in v:
        print(" -", m)
    if "--plot" in sys.argv:
        plot(out, segs)
    return 1 if v else 0


if __name__ == "__main__":
    sys.exit(main())
