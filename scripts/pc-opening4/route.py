"""山の場面（コマ 131〜719）のカメラの道すじ。numpy だけ（図を描くときだけ Pillow）。計画 PLAN.md の 2・4 章（30.0 秒版）。

使い方
    python3 route.py          # 表（1 秒ごと）と、決まりを破っている所を出す。WORK/route.json も書く
    python3 route.py --plot   # review/route/route-map.jpg・route-profile.jpg を書く

道すじは 3 本（つなぎ目①②で切れる。つなぎ目の前後 4 コマはもやの中で、位置・向きは飛んでよい）。
  seg0: コマ 131〜303   涸沢の上 → 吊尾根 → 岳沢の上（L0〜L3）
  seg1: コマ 304〜461   梓川の森 → 梢すれすれ → 川すれすれ → 上流（L4〜L7）
  seg2: コマ 462〜719   東の尾根の森 → 尾根越え → 朝日と雲海へ漂う（L8〜L10）
水平は「点を通る曲線 × 道のり s(t)」。s(t) は区間ごとに決めた速さの形（SPEED）を足して、点の時刻にぴったり合わせる。
高さは「足元の面（地面＋木・水）を先読みしてなめらかにしたもの ＋ 指定した高さ」。
向きは手で決めた向きの表、上下は「地平線（尾根の線）の見える位置」から決め、回る速さは決まりの上限で刻んで抑える。
最後に、ごく弱い決まった揺れ（0.05〜0.1°・2〜6Hz）を足す。
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
# 道すじの表（ここを直す）。L0〜L10 は計画 2 章の点（緯度, 経度）。時刻・高さも計画のとおり
# ---------------------------------------------------------------------------
PLAN = {
    "L0": (36.2948, 137.6561), "L1": (36.2927, 137.6552), "L2": (36.2868, 137.6525),
    "L3": (36.2851, 137.6517), "L4": (36.2542, 137.6485), "L5": (36.2537, 137.6495),
    "L6": (36.2533, 137.6509), "L7": (36.2530, 137.6522), "L8": (36.2432, 137.6873),
    "L9": (36.2423, 137.6894), "L10a": (36.2421, 137.6901), "L10": (36.2418, 137.6908),
}


def ll(lat, lon):
    e, n = geo4.to_local(lon, lat)
    return float(e), float(n)


PT = {k: ll(*v) for k, v in PLAN.items()}
C1, C2 = config.SEAM_FRAMES
HALF = config.SEAM_HALF

# seg, 名前, 時刻(秒)。水平の位置はこの点を通る（計画の時刻）
PINS = {
    0: [("L0", 5.45), ("L1", 5.90), ("L2", 10.0), ("L3", 12.5)],
    1: [("L4", 12.8), ("L5", 14.0), ("L6", 17.4), ("L7", 19.1)],
    2: [("L8", 19.4), ("L9", 22.4), ("L10", 30.0)],
}
# 区間ごとの速さの形 (時刻, m/秒)。点の時刻・位置から出る本当の速さに合うよう、区間ごとに全体を少し伸ばす（route.py の出力 k）
SPEED = {
    0: [(5.45, 560), (5.9, 545), (6.4, 350), (7.0, 205), (7.6, 125), (8.2, 82), (9.1, 62), (10.0, 55),
        (11.0, 60), (11.8, 85), (12.5, 140)],
    1: [(12.8, 150), (13.2, 100), (13.6, 65), (14.0, 44), (15.0, 41), (16.2, 38), (17.4, 36), (18.2, 62), (19.1, 105)],
    2: [(19.4, 100), (20.4, 82), (21.4, 66), (22.4, 52), (23.2, 38), (24.0, 22), (24.4, 17), (24.9, 14), (30.0, 12.5)],
}
# 高さの決め方: 'abs' 標高(m) / 'rock' 地面の上(m) / 'tree' 梢の上(m) / 'water' 水面の上(m) / 'l9' 尾根越え(L9)の高さからの差(m)
HEIGHTS = {
    0: [(5.45, "abs", 3000.0), (5.9, "abs", 2900.0), (6.5, "abs", 2930.0), (7.2, "abs", 2975.0), (7.8, "abs", 3012.0),
        (8.2, "abs", 3025.0), (8.9, "abs", 3033.0), (9.3, "abs", 3041.0), (9.6, "abs", 3052.0), (10.0, "rock", 20.0), (10.6, "abs", 3062.0),
        (11.2, "abs", 3050.0), (11.8, "abs", 3024.0), (12.5, "abs", 2995.0)],
    1: [(12.8, "tree", 60.0), (13.2, "tree", 40.0), (13.6, "tree", 26.0), (13.8, "tree", 19.0), (14.0, "tree", 10.5), (14.8, "tree", 11.0),
        (15.6, "tree", 10.0), (16.2, "water", 10.8), (16.8, "water", 9.9), (17.4, "water", 9.0), (18.0, "water", 22.0),
        (18.6, "water", 38.5), (19.1, "water", 45.0)],
    2: [(19.4, "tree", 30.0), (20.2, "tree", 26.0), (21.0, "tree", 22.0), (21.8, "tree", 18.0), (22.4, "tree", 15.0),
        ],
}
# カメラの向き（方位。北から時計回り）の表
HEAD = {
    0: [(5.45, 200.0), (8.0, 203.0), (10.0, 201.0), (12.5, 201.0)],
    1: [(12.8, 118.0), (14.0, 113.0), (15.7, 110.0), (17.4, 108.0), (19.1, 112.0)],
    2: [(19.4, 112.0), (21.0, 114.0), (22.4, 115.0), (24.4, 119.0), (30.0, 119.0)],
}
# 傾き（右が正。左へ傾くのは負）に足す分
ROLL_BIAS = {
    0: [(5.0, 0), (9.9, 0), (10.5, -5), (11.2, -12), (12.5, -14), (13, -14)],
    1: [(12.8, -11.5), (13.5, -7), (14.3, -1.5), (15.5, -2), (17.0, 0), (19.1, 0)],
    2: [(19.4, 0), (30, 0)],
}
LENS = [(0, 28), (7.8, 28), (8.6, 24), (17.4, 24), (19.1, 28), (23.0, 28), (24.5, 35), (30, 35)]   # 計画: C2・D は 24、E は 28、F は 35
SEGMENTS = [(0, 131, C1 - 1), (1, C1, C2 - 1), (2, C2, config.FRAMES - 1)]

# 見せ場の窓（秒）。この中は flow 4.5・曲がる速さ 10°/秒まで、外は 3・20°/秒まで
HERO = {"C2 吊尾根": (8.2, 11.2), "D2 梢と川": (13.65, 18.0), "E 尾根越え": (19.4, 23.4)}
TREE_H = 25.0
# 川筋（L6→L7 の直線）。川の手前は岸の木がだんだん低くなる「すき間」（左右の木は高いまま）
RIVER_HALF = 45.0
GAP0, GAP1 = -110.0, -40.0     # 川筋の方向の距離（L6 から。m）。-110 から木が低くなり始め、-40 から水面
_d6 = np.array(PT["L7"]) - np.array(PT["L6"])
RIVER_DIR = _d6 / np.hypot(*_d6)

PITCH0 = -1.5            # コマ 131 の上下（宇宙の場面とのつなぎ）
C1_SKY_FRAC = 0.22       # C1: 尾根の線を、画面の真ん中から上へ 画面の高さの 22%（上から 28%）に置く
E_SKY_FRAC = 0.10        # E: 尾根の線を上から 40%
DRIFT_RISE = 0.8         # 尾根越えの後に上がる速さ m/秒
POST_CREST_PITCH = -2.0
TILT_T0, TILT_DEG = 29.0, 12.0
LOOK_AHEAD = 0.6
MAX_ROLL = 35.0
SHAKE = [(2.3, 0.045), (3.7, 0.030), (5.4, 0.020)]   # 揺れ (Hz, 度)。合わせて 0.095°。決まった位相

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
        _dem = geo4.Dem(wide=True)
    return _dem


def river_coords(e, n):
    """L6 を原点に、川筋の方向の距離 ax と横の距離 lat（m）"""
    x = np.asarray(e) - PT["L6"][0]
    y = np.asarray(n) - PT["L6"][1]
    return x * RIVER_DIR[0] + y * RIVER_DIR[1], -x * RIVER_DIR[1] + y * RIVER_DIR[0]


def surface(e, n):
    """(地面, 面（梢・水面）, 水の上か, 傾き)"""
    d = dem()
    g = d.height(e, n)
    sl = d.slope_deg(e, n)
    ax, lat = river_coords(e, n)
    corridor = (np.abs(lat) < RIVER_HALF) & (ax > GAP0 - 20.0)
    gap = 1.0 - smooth01((ax - GAP0) / (GAP1 - GAP0))      # 川の手前で 1 → 0（木が低くなる）
    tree = np.where((g < 2400.0) & (sl < 35.0), TREE_H, 0.0)
    tree = np.where(corridor, tree * gap, tree)
    water = corridor & (ax > GAP1)
    return g, g + tree, water, sl


def skyline_deg(e, n, z, hdg):
    """カメラから向き hdg（度）の方向に見える、尾根の線（いちばん高く見える所）の上下の角（度）。木も含む"""
    dist = 15.0 * 1.06 ** np.arange(120)
    h = np.radians(np.asarray(hdg, float))
    EE = e[:, None] + np.sin(h)[:, None] * dist[None, :]
    NN = n[:, None] + np.cos(h)[:, None] * dist[None, :]
    S = surface(EE.ravel(), NN.ravel())[1].reshape(EE.shape)
    return np.degrees(np.max(np.arctan2(S - z[:, None] - dist[None, :] ** 2 / (2 * geo4.R_EARTH), dist[None, :]), axis=1))


def z9():
    """尾根越え（L9）の高さ"""
    return float(surface(np.array([PT["L9"][0]]), np.array([PT["L9"][1]]))[1][0]) + 15.0


# ---------------------------------------------------------------------------
# 1 本の道すじをつくる
# ---------------------------------------------------------------------------
def build_segment(seg, f0, f1):  # noqa: C901
    pins = PINS[seg]
    tw = np.array([p[1] for p in pins])
    pos = np.array([PT[p[0]] for p in pins])
    u = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(pos, axis=0).T))])
    ce, cn = CSpline(u, pos[:, 0]), CSpline(u, pos[:, 1])
    ug = np.arange(-800.0, u[-1] + 1200.0, 0.25)
    pe, pn = ce(ug), cn(ug)
    sg = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(pe), np.diff(pn)))])
    sg -= np.interp(0.0, ug, sg)
    s_w = np.interp(u, ug, sg)
    t = (f0 * 4 + np.arange(-PRE, (f1 - f0) * 4 + POST + 1)) / 96.0
    # 速さの形を足して道のり S(t)。点と点の間で、点の道のりに合うよう伸ばす
    kt = np.array([a for a, _ in SPEED[seg]])
    kv = np.log(np.array([b for _, b in SPEED[seg]], float))
    v = np.exp(pchip(kt, kv)(t))
    S = np.concatenate([[0.0], np.cumsum(0.5 * (v[1:] + v[:-1]) * DT)])
    Sp = np.interp(tw, t, S)
    ks = np.diff(s_w) / np.diff(Sp)
    s = np.empty_like(t)
    for i, tt in enumerate(t):
        j = int(np.clip(np.searchsorted(tw, tt) - 1, 0, len(tw) - 2))
        s[i] = s_w[j] + (S[i] - Sp[j]) * ks[j]
    s = gsm(s, 3)
    uu = np.interp(s, sg, ug)
    e, n = ce(uu), cn(uu)
    g, Sf, water, sl = surface(e, n)
    # 指定の高さ → 足元の面からの高さ c(t)
    keys = HEIGHTS[seg]
    thw = np.array([k[0] for k in keys])
    ew, nw = np.interp(thw, t, e), np.interp(thw, t, n)
    gw, Sw, _, _ = surface(ew, nw)
    zl9 = None
    zw = []
    for i, (_, mode, val) in enumerate(keys):
        if mode == "abs":
            zw.append(val)
        elif mode == "rock" or mode == "water":
            zw.append(gw[i] + val)
        elif mode == "tree":
            zw.append(Sw[i] + val)
        else:
            zw.append(z9() + val)
    zw = np.array(zw)
    sf = lookahead_surface(Sf)
    cw = zw - np.interp(thw, t, sf)
    c = pchip(thw, cw)(t)
    z = sf + c
    for sel, ref in ((t > thw[-1], (t <= thw[-1]) & (t > thw[-1] - 0.3)), (t < thw[0], (t >= thw[0]) & (t < thw[0] + 0.3))):
        a1, b1 = np.polyfit(t[ref], z[ref], 1)
        z[sel] = a1 * t[sel] + b1
    m = np.maximum(0.78 * c, 8.0)
    for _ in range(10):
        z = gsm(z, 6)
        z = z + np.maximum(Sf + m - z, 0.0)
    z = gsm(z, 6)
    z = z + np.maximum(1.5 * gsm(np.maximum(Sf + m - z, 0.0), 10), 0.0)
    if seg == 2:
        # 尾根越えの前後は、ずっと同じ高さにならないよう一定の上がり方にする（越える前 1.6 m/秒・越えた後 0.8 m/秒）
        lin = z9() + np.where(t < 22.4, 1.6, DRIFT_RISE) * (t - 22.4)
        lin = gsm(lin, 8)
        w = smooth01((t - 21.0) / 0.8)
        z = (1 - w) * z + w * lin
    return dict(seg=seg, f0=f0, f1=f1, t=t, e=e, n=n, z=z, g=g, S=Sf, water=water, sl=sl, s=s, tw=tw, k=ks, pins=pins)


def lookahead_surface(S):
    """足元の面の、少し先（0.8 秒）までの最大をなめらかにしたもの（尾根の手前で先に上がる）"""
    k0, k1 = 19, 77
    pad = np.pad(S, (k0, k1), mode="edge")
    win = np.lib.stride_tricks.sliding_window_view(pad, k0 + k1 + 1)
    return gsm(win.max(axis=1), 26)


def slew(x, r, anchor=True):
    """変わる速さ r（度/秒。要素ごと）を超えないように刻む。前から・後ろからの 2 通りの平均（遅れが片寄らない）"""
    n = len(x)
    y = x.copy()
    for i in range(1, n):
        m = r[i] * DT
        y[i] = y[i - 1] + min(max(x[i] - y[i - 1], -m), m)
    w = x.copy()
    for i in range(n - 2, -1, -1):
        m = r[i] * DT
        w[i] = w[i + 1] + min(max(x[i] - w[i + 1], -m), m)
    b = smooth01((np.arange(n) * DT - 1.6) / 2.0) if anchor else np.ones(n)      # 始めは前から刻んだ値（宇宙の場面・前の区間と合わせた値から動かさない）
    return (1 - b) * y + b * 0.5 * (y + w)


def shake(t, axis):
    """決まった揺れ（度）。位相は固定の乱数"""
    rng = np.random.default_rng((config.SEED, 4101, axis))
    ph = rng.uniform(0, 2 * np.pi, len(SHAKE))
    sc = 0.6 if axis == 2 else 1.0
    return sc * sum(a * np.sin(2 * np.pi * f * t + p) for (f, a), p in zip(SHAKE, ph))


def orient(sg):  # noqa: C901
    """向き（方位・上下・傾き・レンズ）を細かい刻みで"""
    seg, t, e, n, z = sg["seg"], sg["t"], sg["e"], sg["n"], sg["z"]
    hk = knots(t, HEAD[seg])
    lens = knots(t, LENS)
    vfov = 2 * np.degrees(np.arctan(10.125 / lens))
    v3 = np.sqrt(np.gradient(e, DT) ** 2 + np.gradient(n, DT) ** 2 + np.gradient(z, DT) ** 2)
    if seg == 0:
        sky = skyline_deg(e, n, z, hk)
        p_sky = np.minimum(sky - C1_SKY_FRAC * vfov, 18.0)
        w = smooth01((t - 5.9) / 2.6)
        pa = (1 - w) * PITCH0 + w * p_sky
        pk = knots(t, [(8.0, 0.0), (9.2, -4.0), (10.0, -10.0), (10.7, -15.0), (11.6, -22.0), (12.5, -25.0), (13.0, -25.0)])
        wk = smooth01((t - 7.9) / 0.5)
        p = (1 - wk) * pa + wk * pk
    elif seg == 1:
        p = knots(t, [(12.0, -12.0), (12.8, -12.0), (14.0, -6.0), (15.0, -6.0), (16.0, -4.0), (17.0, -3.0), (17.4, -3.0), (18.2, 0.0), (19.1, 3.0), (19.5, 3.0)])
        sky = skyline_deg(e, n, z, hk)
    else:
        sky = skyline_deg(e, n, z, hk)
        p_sky = sky - E_SKY_FRAC * vfov
        w = smooth01((t - 22.0) / 0.9)
        p = (1 - w) * p_sky + w * POST_CREST_PITCH
    h = np.degrees(np.unwrap(np.radians(hk)))
    # 回る速さの上限: 見せ場 10°/秒・ほか 20°/秒、かつ 速さ × 回る速さ ≤ 20 m/秒²
    cap = np.where(np.array([in_hero(x, 0.0) for x in t]), 10.0, 20.0)
    L = np.minimum(cap, np.degrees(20.0 / v3)) * 0.92
    p = gsm(slew(p, L * 0.92), 6)
    p = gsm(slew(p, L * 0.88, False), 4)
    pr = np.abs(np.gradient(p, DT))
    rh = np.sqrt(np.maximum(L ** 2 - pr ** 2, (0.2 * L) ** 2)) / np.maximum(np.cos(np.radians(p)), 0.3) * 0.9
    h = gsm(slew(h, rh), 6)
    h = gsm(slew(h, rh * 0.95, False), 4)
    p_base = p + TILT_DEG * smooth01((t - TILT_T0) / (config.DURATION - TILT_T0)) if seg == 2 else p
    # 傾き: 道すじの横の加速度から ＋ 手で足す傾き
    vh = np.hypot(np.gradient(e, DT), np.gradient(n, DT))
    psi = gsm(np.unwrap(np.arctan2(np.gradient(e), np.gradient(n))), 9)
    a_lat = vh * np.gradient(psi, DT)
    roll = np.clip(np.degrees(np.arctan(a_lat / (8 * G))), -3.0, 3.0) + knots(t, ROLL_BIAS[seg])
    roll0 = np.clip(gsm(roll, 14), -MAX_ROLL, MAX_ROLL)
    flight = np.degrees(np.arctan2(np.gradient(gsm(z, 3)), np.hypot(np.gradient(gsm(e, 3)), np.gradient(gsm(n, 3)))))
    sg.update(head0=h, pitch0=p_base, roll0=roll0, lens=lens, flight=flight, sky=sky if seg != 0 else sky,
              head=h + shake(t, 0), pitch=p_base + shake(t, 1), roll=roll0 + shake(t, 2), vfov=vfov)
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
            v3 = np.array([sg["e"][k + 1] - sg["e"][k - 1], sg["n"][k + 1] - sg["n"][k - 1], sg["z"][k + 1] - sg["z"][k - 1]]) / (2 * DT)
            speed = float(np.linalg.norm(v3))
            hr = (sg["head0"][k + 2] - sg["head0"][k - 2]) / (4 * DT)
            pr = (sg["pitch0"][k + 2] - sg["pitch0"][k - 2]) / (4 * DT)
            turn = math.hypot(hr * math.cos(math.radians(sg["pitch0"][k])), pr)
            clear = float(sg["z"][k] - sg["S"][k])
            recs[f] = dict(f=f, t=f / 24.0, seg=sg["seg"], e=float(sg["e"][k]), n=float(sg["n"][k]), z=float(sg["z"][k]),
                           heading_deg=float(sg["head"][k] % 360.0), pitch_deg=float(sg["pitch"][k]), roll_deg=float(sg["roll"][k]),
                           lens_mm=float(sg["lens"][k]), ground=float(sg["g"][k]), clearance=clear, speed=speed,
                           flow=speed / max(clear, 1.0), turn=turn, flight=float(sg["flight"][k]), vz=float(v3[2]),
                           water=bool(sg["water"][k]), head_raw=float(sg["head"][k]), sky=float(sg["sky"][k]), seam=False)
    # つなぎ目: 前後 4 コマの向き・傾き・レンズは、前の出口から後ろの入口へなめらかにつなぐ（位置は飛んでよい）
    for c in config.SEAM_FRAMES:
        a, b = recs[c - HALF - 1], recs[c + HALF]
        for f in range(c - HALF, c + HALF):
            s = float(smooth01((f - (c - HALF - 1)) / (2 * HALF + 1)))
            r = recs[f]
            r["seam"] = True
            r["head_raw"] = a["head_raw"] + wrap(b["head_raw"] - a["head_raw"]) * s
            r["heading_deg"] = r["head_raw"] % 360.0
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
    if t >= 29.0:
        return "H"
    for name, a, b in reversed(config.BEATS):
        if a <= t < b and name[0] in "CDE":
            return name.split()[0]
    for name, a, b in config.BEATS:
        if a <= t < b:
            return name.split()[0]
    return "-"


def in_hero(t, margin=0.0):
    return any(a - margin <= t <= b + margin for a, b in HERO.values())


def sun_visible_from(segs):
    """E で太陽（方位 115°・高さ 5°）が尾根・木の線から出る最初の時刻（秒）。出ないなら None"""
    sg = segs[2]
    sk = skyline_deg(sg["e"], sg["n"], sg["z"], np.full(len(sg["t"]), config.SUN_AZ))
    ok = (sg["t"] >= 19.4) & (sk < config.SUN_EL - 0.27)
    return float(sg["t"][ok][0]) if ok.any() else None


def check(out, segs=None):  # noqa: C901
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
    rng([r["f"] for r in ok if r["turn"] > (10.0 if in_hero(r["t"]) else 20.0) + 0.05], "曲がる速さが上限（見せ場 10・ほか 20 °/秒）を超える")
    rng([r["f"] for r in ok if math.radians(r["turn"]) * r["speed"] > 20.0 + 0.2], "速さ × 曲がる速さが 20 m/秒² を超える")
    rng([r["f"] for r in out if abs(r["roll_deg"]) > MAX_ROLL + 0.01], "傾きが 35° を超える")
    rng([r["f"] for r in ok if r["speed"] < 10.0], "速さが 10 m/秒未満（止まりかけ）")
    # 高さがずっと同じにならない（1.2 秒の間に 0.8m 以上は上下する）
    for seg in (0, 1, 2):
        fr = [r for r in ok if r["seg"] == seg]
        zz = np.array([r["z"] for r in fr])
        bad = [fr[i]["f"] for i in range(len(fr) - 28) if np.ptp(zz[i:i + 29]) < 0.8]
        rng(bad, "1.2 秒間、高さがほぼ変わらない")
    # 吊尾根・梢と川・尾根越え
    r2 = [r for r in ok if abs(r["t"] - 10.0) < 0.05]
    rng([r["f"] for r in r2 if not 15.0 <= r["clearance"] <= 30.0], "L2（10.0 秒）の前後 0.05 秒で岩の上 15〜30m の外")
    rng([r["f"] for r in ok if 14.0 <= r["t"] <= 15.0 and not 9.0 <= r["clearance"] <= 14.5], "D2 の初め（14〜15 秒）で梢の上 9〜14.5m の外")
    rng([r["f"] for r in ok if 16.9 <= r["t"] <= 17.4 and not 7.8 <= r["clearance"] <= 10.5], "D2 の終わり（16.9〜17.5 秒）で水面の上 7.8〜10.5m の外")
    rng([r["f"] for r in ok if -0.3 <= r["t"] - 22.4 <= 0.15 and not 12.0 <= r["clearance"] <= 20.0], "L9（22.4 秒）の前後で梢の上 12〜20m の外")
    rng([r["f"] for r in ok if r["t"] >= 24.9 and not 10.0 <= r["speed"] <= 16.0], "24.9 秒より後の漂う速さが 10〜16 m/秒の外")
    rng([r["f"] for r in ok if r["t"] >= 24.9 and not 0.3 <= r["vz"] <= 1.4], "24.9 秒より後の上がる速さが 0.3〜1.4 m/秒の外")
    # C2 の向き（上下）
    r3 = [r for r in ok if abs(r["t"] - 10.0) < 0.1]
    rng([r["f"] for r in r3 if not -12.5 <= r["pitch_deg"] <= -7.5], "L2 で上下が -8〜-12° の外")
    rng([r["f"] for r in ok if 11.9 <= r["t"] <= 12.45 and not -28.0 <= r["pitch_deg"] <= -21.0], "D1 の終わりで上下が -25° 前後の外")
    rng([r["f"] for r in ok if 11.9 <= r["t"] <= 12.45 and not -16.0 <= r["roll_deg"] <= -9.5], "D1 の終わりで左へ 10〜15° の外")
    rng([r["f"] for r in ok if 24.0 <= r["t"] <= 28.5 and not -3.5 <= r["pitch_deg"] <= -0.5], "尾根越えの後（〜28.5 秒）で上下が -2° 前後の外")
    rng([r["f"] for r in ok if r["t"] >= 29.99 and not 8.0 <= r["pitch_deg"] <= 11.0], "最後に 12° 上を向く")
    # つなぎ目
    for c in config.SEAM_FRAMES:
        a, b = byf[c - HALF - 1], byf[c + HALF]
        if abs(b["speed"] / a["speed"] - 1) > 0.2:
            v.append(f"つなぎ目 {c}: 速さ {a['speed']:.0f}→{b['speed']:.0f} m/秒（±20% の外）")
        if abs(b["flight"] - a["flight"]) > 2.0:
            v.append(f"つなぎ目 {c}: 降りる角度 {a['flight']:.1f}→{b['flight']:.1f}°（±2° の外）")
        if abs(b["roll_deg"] - a["roll_deg"]) > 2.0:
            v.append(f"つなぎ目 {c}: 傾き {a['roll_deg']:.1f}→{b['roll_deg']:.1f}°（±2° の外）")
    a, b = byf[C2 - HALF - 1], byf[C2 + HALF]
    if abs(wrap(b["head_raw"] - a["head_raw"])) > 3.0:
        v.append(f"つなぎ目 {C2}: 向き {a['heading_deg']:.1f}→{b['heading_deg']:.1f}°（±3° の外）")
    # 速さ・加速のなめらかさ・位置の飛び（つなぎ目以外）
    pair = [f for f in range(config.FIRST_MOUNTAIN_FRAME + 1, config.FRAMES)
            if not (byf[f]["seam"] or byf[f - 1]["seam"]) and f not in config.SEAM_FRAMES]
    rng([f for f in pair if abs(byf[f]["speed"] - byf[f - 1]["speed"]) > 0.08 * byf[f - 1]["speed"] + 0.5], "速さが 1 コマで急に変わる")
    for f in pair:
        d = math.dist((byf[f]["e"], byf[f]["n"], byf[f]["z"]), (byf[f - 1]["e"], byf[f - 1]["n"], byf[f - 1]["z"]))
        if d > 1.3 * max(byf[f]["speed"], byf[f - 1]["speed"]) / 24 + 0.5:
            v.append(f"コマ {f}: 位置が飛ぶ（{d:.1f}m）")
    # 点を通っているか（計画の時刻・位置）
    if segs is not None:
        for sg in segs:
            for name, tp in sg["pins"]:
                i = int(np.argmin(np.abs(sg["t"] - tp)))
                dd = math.hypot(sg["e"][i] - PT[name][0], sg["n"][i] - PT[name][1])
                if dd > 4.0:
                    v.append(f"{name}（{tp} 秒）から {dd:.1f}m ずれている")
        tv = sun_visible_from(segs)
    return v


def table(out, step=1.0, segs=None):
    print(f"{'t':>5} {'beat':>4} {'alt':>6} {'clear':>6} {'speed':>5} {'flow':>4} {'head':>5} {'pitch':>6} {'roll':>5} {'lens':>4}")
    byf = {r["f"]: r for r in out}
    ts = [config.FIRST_MOUNTAIN_FRAME / 24.0] + [float(x) for x in np.arange(6.0, 30.0, step)] + [(config.FRAMES - 1) / 24.0]
    for t in ts:
        f = int(round(t * 24))
        if f in byf:
            r = byf[f]
            print(f"{r['t']:5.2f} {beat_of(r['t']):>4} {r['z']:6.0f} {r['clearance']:6.1f} {r['speed']:5.0f} {r['flow']:4.1f} {r['heading_deg']:5.0f} {r['pitch_deg']:6.1f} {r['roll_deg']:5.1f} {r['lens_mm']:4.0f}"
                  + ("  もや" if r["seam"] else ""))


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
    for name, pos in PT.items():
        x, y = P(*pos)
        dr.text((x - 22, y + 4), name, fill=(255, 40, 40), font=font)
    ex, ey = P(0, 0)
    dr.text((ex, ey), "Kappabashi", fill=(0, 0, 0), font=font)
    dr.text((8, 8), "route map  orange=seg0  cyan=seg1  yellow=seg2  dashed=seam jump", fill=(255, 255, 255), font=font)
    im.save(outdir / "route-map.jpg", quality=85)
    # --- 高さと速さ ---
    W2, H2 = 1280, 900
    img = Image.new("RGB", (W2, H2), (250, 250, 247))
    dr = ImageDraw.Draw(img)
    T0, T1 = 5.4, 30.0
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
        for tt in range(6, 31):
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
    table(out, segs=segs)
    for sg in segs:
        print("区間", sg["seg"], "道のりの伸ばし k:", " ".join(f"{k:.2f}" for k in sg["k"]))
    print("太陽が木・尾根の線から出る最初の時刻:", sun_visible_from(segs))
    byf = {r["f"]: r for r in out}
    for c in config.SEAM_FRAMES:
        a, b = byf[c - HALF - 1], byf[c + HALF]
        print(f"つなぎ目 {c}: 速さ {a['speed']:.0f}→{b['speed']:.0f}  降りる角度 {a['flight']:.1f}→{b['flight']:.1f}  傾き {a['roll_deg']:.1f}→{b['roll_deg']:.1f}  向き {a['heading_deg']:.1f}→{b['heading_deg']:.1f}")
    v = check(out, segs)
    print(f"\n決まり破り {len(v)} 件")
    for m in v:
        print(" -", m)
    if "--plot" in sys.argv:
        plot(out, segs)
    return 1 if v else 0


if __name__ == "__main__":
    sys.exit(main())
