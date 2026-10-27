# 東京タワーの格子の模型（本物の写真と公開の寸法から）。カメラの ENU で出力する
#  寸法：高さ 333m、塔脚の中心の間隔 88.0m、下のアーチの頂点 約 38m、大展望台（メインデッキ）は地上 120〜130m の 2 階建て、
#  特別展望台（トップデッキ）は地上 223.5m。その上に円筒形のアンテナ（直径 13m・高さ 12m、地上 239〜251m）、
#  格子のアンテナ（幅 約 3.5m、〜314m）と柱（〜333m）。公式の「150m・250m」は海抜の値
#  幅：ほぼ水平に見た本物の写真から、高さごとに測った外形（PROFILE、一辺の外側）。横の梁の高さも写真から（下は約 12m、上は約 5.7m ごと）
#  塗り分け：大展望台より下はインターナショナルオレンジ、大展望台の側面は白、その上（130〜333m）は 7 等分で橙と白を交互（いちばん下と上が橙）
#  属性：色（rgb）、部位（0 格子 1 大展望台のガラス 2 トップデッキのガラス 3 アンテナ 4 フットタウン・芯 5 大展望台の上部 6 トップデッキの上部）、
#        ランドマークライトの当たり（0〜1）、段（ダイヤモンドヴェールの 17 段）
import os, json, math, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import ecef, enu_basis, cam_frame, GEOID
prof = json.load(open('tower-profile.json'))
ROT = math.radians(prof['rot_deg'])
LAT, LON = prof['lat'], prof['lon']
Z0 = prof['z0']  # 塔の足元の高さ（塔の位置の ENU、楕円体高 GEOID 基準）
CX, CY = prof['center_enu_tower']

# 外形（一辺の外側の幅 m）と脚（隅の組み立て柱）の幅
PROFILE = [(0, 94.0), (6, 88.6), (14, 79.5), (20, 74.0), (28, 66.0), (36, 57.5), (41.5, 52.5), (48, 47.5), (54.3, 43.0), (60, 39.5),
           (66.5, 35.6), (72, 32.6), (78.2, 30.0), (84, 28.0), (89, 26.4), (94, 25.0), (98.8, 24.0), (104, 22.8), (109.5, 21.6), (115, 20.8),
           (120, 20.3), (130, 18.6), (141, 17.3), (150, 16.2), (159, 15.0), (170, 13.9), (181, 12.8), (189, 12.0), (200, 10.9), (210, 10.1),
           (217, 9.6), (224, 9.2), (239, 8.6)]
LEGW = [(0, 6.5), (20, 5.0), (41.5, 3.6), (80, 2.8), (120, 2.2), (130, 2.0), (160, 1.6), (200, 1.3), (239, 1.1)]
LOWER = [41.5, 54.3, 66.5, 78.2, 89.0, 98.8, 109.5, 120.0]
UPPER = list(np.linspace(130.0, 239.0, 20))
def interp(K, z):
    if z <= K[0][0]: return K[0][1]
    for (z0, a), (z1, b) in zip(K, K[1:]):
        if z <= z1: return a + (b - a) * (z - z0) / (z1 - z0)
    return K[-1][1]
def h(z): return interp(PROFILE, z) / 2
def wl(z): return interp(LEGW, z)

ORANGE = (0.85, 0.28, 0.12); WHITE = (0.90, 0.90, 0.88); GLASS = (0.30, 0.33, 0.36); DECKW = (0.88, 0.88, 0.86)
ROOF = (0.70, 0.70, 0.68); CORE = (0.60, 0.58, 0.55); FOOT = (0.44, 0.31, 0.27); DISH = (0.93, 0.93, 0.91)
BAND0, TOP = 130.0, 333.0
BOUNDS = [BAND0 + k * (TOP - BAND0) / 7 for k in range(1, 7)]
def paint(z):
    if z < BAND0: return ORANGE
    k = min(6, int((z - BAND0) / ((TOP - BAND0) / 7)))
    return ORANGE if k % 2 == 0 else WHITE
def emis(z, part):
    if part in (1, 2): return 1.0
    if part == 4: return 0.0
    if part in (5, 6): return 0.8
    if part == 3: return 0.45 if z < 252 else (0.35 if z < 300 else 0.15)
    # ランドマークライト：足元と大展望台から照らす。上に行くほど少し弱い
    return 0.95 if z < 130 else 0.95 - 0.35 * min(1.0, (z - 130) / 109)
def tier(z): return min(16, int(max(z, 0) / (239 / 17)))

P, C, PART, EM, TIER, I = [], [], [], [], [], []
def vtx(p, col, part):
    P.append(np.asarray(p, float)); C.append(col); PART.append(part); EM.append(emis(p[2], part)); TIER.append(tier(p[2]))
def quad(base, a, b, c, d): I.extend([base + a, base + b, base + c, base + a, base + c, base + d])
def beam(a, b, w, t=None, part=0, col=None, face=None):
    """角材 a→b。w は面の中の太さ、t は面に直交の厚み（face＝外向き）。col が無ければ塗り分けの境で分けて塗る"""
    a = np.asarray(a, float); b = np.asarray(b, float)
    if col is None:
        za, zb = a[2], b[2]; lo, hi = min(za, zb), max(za, zb)
        cuts = [c for c in BOUNDS if lo < c < hi]
        if cuts:
            ts = sorted((c - za) / (zb - za) for c in cuts)
            pts = [a] + [a + (b - a) * s for s in ts] + [b]
            for p0, p1 in zip(pts, pts[1:]): beam(p0, p1, w, t, part, paint((p0[2] + p1[2]) / 2), face)
            return
        col = paint((za + zb) / 2)
    d = b - a; L = np.linalg.norm(d)
    if L < 1e-6: return
    d = d / L
    ref = np.asarray(face, float) if face is not None else (np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0]))
    u = ref - d * (ref @ d)
    if np.linalg.norm(u) < 1e-6: u = np.cross(d, [0, 0, 1.0])
    u = u / np.linalg.norm(u); v = np.cross(d, u)
    t = w if t is None else t
    base = len(P)
    for p in (a, b):
        for s1, s2 in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vtx(p + u * (t / 2) * s1 + v * (w / 2) * s2, col, part)
    for f in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (0, 3, 2, 1), (4, 5, 6, 7)): quad(base, *f)
def ring(pts2, z0, z1, col, part, caps=False, capcol=None):
    """平面の多角形（反時計回り）の側面（z0〜z1）。caps で上下のふた"""
    n = len(pts2); base = len(P)
    for z in (z0, z1):
        for x, y in pts2: vtx((x, y, z), col, part)
    for k in range(n): quad(base, k, (k + 1) % n, n + (k + 1) % n, n + k)
    if caps:
        for z, top in ((z0, False), (z1, True)):
            b2 = len(P); vtx((0, 0, z), capcol or col, part)
            for x, y in pts2: vtx((x, y, z), capcol or col, part)
            for k in range(n):
                a_, b_ = 1 + k, 1 + (k + 1) % n
                I.extend([b2, b2 + a_, b2 + b_] if top else [b2, b2 + b_, b2 + a_])
def circle(r, n=32, ph=0.0): return [(r * math.cos(ph + 2 * math.pi * k / n), r * math.sin(ph + 2 * math.pi * k / n)) for k in range(n)]
def octa(A, c):
    a = A / 2
    return [(a, -(a - c)), (a, a - c), (a - c, a), (-(a - c), a), (-a, a - c), (-a, -(a - c)), (-(a - c), -a), (a - c, -a)]
def disc(center, normal, r, col, part=0, n=14):
    center = np.asarray(center, float); nn = np.asarray(normal, float); nn = nn / np.linalg.norm(nn)
    u = np.cross(nn, [0, 0, 1.0]); u = u / np.linalg.norm(u); v = np.cross(nn, u)
    base = len(P); vtx(center + nn * 0.35, col, part)
    for k in range(n):
        a = 2 * math.pi * k / n; vtx(center + (u * math.cos(a) + v * math.sin(a)) * r, col, part)
    for k in range(n): I.extend([base, base + 1 + k, base + 1 + (k + 1) % n])

# 面：axis 0 は x = ±h の面、1 は y = ±h の面。s は面の中の横の座標、inset は外形から内への距離
FACES = [(0, 1), (0, -1), (1, 1), (1, -1)]
def fp(axis, sign, s, z, inset=0.0):
    off = sign * (h(z) - inset)
    return (off, s, z) if axis == 0 else (s, off, z)
def fnorm(axis, sign): return (sign, 0, 0) if axis == 0 else (0, sign, 0)
def zsteps(z0, z1, step):
    n = max(1, int(math.ceil((z1 - z0) / step)))
    return [z0 + (z1 - z0) * k / n for k in range(n + 1)]

# ---- 脚（隅の組み立て柱）：4 本の弦材と、各面の斜めの綴り材・横の桟 ----
for sx in (-1, 1):
    for sy in (-1, 1):
        def chord(i, z):
            ox = h(z) - (wl(z) if i in (1, 3) else 0); oy = h(z) - (wl(z) if i in (2, 3) else 0)
            return np.array([sx * ox, sy * oy, z])
        zs = sorted(set([round(z, 3) for z in zsteps(0, 41.5, 2.0) + zsteps(41.5, 160, 3.0)]))
        for z0, z1 in zip(zs, zs[1:]):
            cs = max(0.35, 0.2 * wl(z0))
            for i in range(4): beam(chord(i, z0), chord(i, z1), cs)
        # 160m より上は 1 本の柱
        for z0, z1 in zip(zsteps(160, 239, 4.0), zsteps(160, 239, 4.0)[1:]):
            cz = lambda z: np.array([sx * (h(z) - wl(z) / 2), sy * (h(z) - wl(z) / 2), z])
            beam(cz(z0), cz(z1), wl(z0) * 0.8)
        # 綴り材（ジグザグ）と横の桟。脚の幅ほどの間隔
        z = 0.0; k = 0
        while z < 158:
            dz = max(1.6, wl(z) * 0.95); z1 = min(160.0, z + dz)
            for i0, i1 in ((0, 1), (0, 2), (1, 3), (2, 3)):
                a0, b1 = (chord(i0, z), chord(i1, z1)) if k % 2 == 0 else (chord(i1, z), chord(i0, z1))
                beam(a0, b1, 0.3)
                beam(chord(i0, z1), chord(i1, z1), 0.26)
            z = z1; k += 1

# ---- 面の横の梁（下はトラス、上は 1 本の梁と外へ少し張り出す桁）と斜材 ----
for axis, sign in FACES:
    fn = fnorm(axis, sign)
    for zk in LOWER:
        if zk >= 120: continue
        for dz in (-0.8, 0.8):
            z = zk + dz; s = h(z) - wl(z)
            beam(fp(axis, sign, -s, z, wl(z) / 2), fp(axis, sign, s, z, wl(z) / 2), 0.55, 0.6, face=fn)
        s = h(zk) - wl(zk); n = max(4, int(2 * s / 2.2)); xs = np.linspace(-s, s, n + 1)
        for k in range(n):
            za, zb = (zk - 0.8, zk + 0.8) if k % 2 == 0 else (zk + 0.8, zk - 0.8)
            beam(fp(axis, sign, xs[k], za, wl(za) / 2), fp(axis, sign, xs[k + 1], zb, wl(zb) / 2), 0.28, 0.3, face=fn)
    # 下の段：大きなバツ印と菱形
    for z0, z1 in zip(LOWER, LOWER[1:]):
        a0, a1 = z0 + 0.8, z1 - 0.8; zm = (a0 + a1) / 2
        e = lambda z: h(z) - wl(z)
        BL, BR = fp(axis, sign, -e(a0), a0, wl(a0) / 2), fp(axis, sign, e(a0), a0, wl(a0) / 2)
        TL, TR = fp(axis, sign, -e(a1), a1, wl(a1) / 2), fp(axis, sign, e(a1), a1, wl(a1) / 2)
        ML, MR = fp(axis, sign, -e(zm), zm, wl(zm) / 2), fp(axis, sign, e(zm), zm, wl(zm) / 2)
        BC, TC = fp(axis, sign, 0, a0, wl(a0) / 2), fp(axis, sign, 0, a1, wl(a1) / 2)
        beam(BL, TR, 0.95, 0.6, face=fn); beam(BR, TL, 0.95, 0.6, face=fn)
        for p, q in ((ML, TC), (TC, MR), (MR, BC), (BC, ML)): beam(p, q, 0.7, 0.5, face=fn)
    # 上の段：横の梁と X
    for i, (z0, z1) in enumerate(zip(UPPER, UPPER[1:])):
        e = lambda z: h(z) - wl(z) / 2
        beam(fp(axis, sign, -e(z1), z1, wl(z1) / 2), fp(axis, sign, e(z1), z1, wl(z1) / 2), 0.55, 0.5, face=fn)
        if i % 2 == 1 and z1 < 236:
            hh = h(z1) + 0.6
            p0 = (sign * hh, -hh, z1) if axis == 0 else (-hh, sign * hh, z1); p1 = (sign * hh, hh, z1) if axis == 0 else (hh, sign * hh, z1)
            beam(p0, p1, 0.3, 0.3, face=fn)
        BL, TR = fp(axis, sign, -e(z0), z0, wl(z0) / 2), fp(axis, sign, e(z1), z1, wl(z1) / 2)
        BR, TL = fp(axis, sign, e(z0), z0, wl(z0) / 2), fp(axis, sign, -e(z1), z1, wl(z1) / 2)
        beam(BL, TR, 0.5, 0.45, face=fn); beam(BR, TL, 0.5, 0.45, face=fn)
    # 大展望台の下の梁（120m）と、上（130m）から最初の段
    s = h(119.2) - wl(119.2); beam(fp(axis, sign, -s, 119.2, wl(119.2) / 2), fp(axis, sign, s, 119.2, wl(119.2) / 2), 0.7, 0.7, face=fn)
    # アーチ（各面。脚の内側から立ち上がり、41.5m の梁の下で頂点）
    for off, ztop in ((0.0, 39.6), (1.7, 37.6)):
        pts = []
        X0 = h(6) - wl(6) - off
        for k in range(25):
            t = math.pi * k / 24
            zz = 6 + (ztop - 6) * math.sin(t) ** 0.85
            xx = -X0 * math.cos(t)
            pts.append(np.array(fp(axis, sign, xx, zz, wl(zz) / 2)))
        for p, q in zip(pts, pts[1:]): beam(p, q, 0.75, 0.7, face=fn)
        if off == 0.0: outer = pts
        else: inner = pts
    for k in range(24):
        beam(outer[k], inner[k + 1] if k % 2 == 0 else inner[k], 0.3, 0.3, face=fn)

# ---- 段ごとの水平の斜材（平面のバツ）----
for zk in LOWER[:-1] + UPPER[1::2]:
    e = h(zk) - wl(zk)
    beam((-e, -e, zk), (e, e, zk), 0.45); beam((-e, e, zk), (e, -e, zk), 0.45)
# ---- 上の部分の内側の枠（アンテナの支持。橙の段が詰まって見える）----
for z0, z1 in zip(UPPER, UPPER[1:]):
    if z0 < 159: continue
    q0, q1 = 0.55 * h(z0), 0.55 * h(z1)
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)): beam((sx * q0, sy * q0, z0), (sx * q1, sy * q1, z1), 0.35)
    for (ax, ay), (bx, by) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
        beam((ax * q0, ay * q0, z0), (bx * q1, by * q1, z1), 0.25)
        beam((ax * q1, ay * q1, z1), (bx * q1, by * q1, z1), 0.25)

# ---- 中央の芯（エレベーターと階段。フットタウンの屋上から大展望台まで）とフットタウン ----
ring([(5, -4), (5, 4), (-5, 4), (-5, -4)], 20.4, 120.0, CORE, 4)
ring([(25, -28), (25, 28), (-25, 28), (-25, -28)], 0.0, 20.4, FOOT, 4, caps=True, capcol=(0.52, 0.5, 0.47))

# ---- 大展望台（120〜130m、2 階建て。角を落とした四角、白い枠と 2 段の窓）----
A, CH = 30.0, 5.0
for z0, z1, col, part, inset in ((120.0, 121.0, DECKW, 0, 0.0), (121.0, 124.4, GLASS, 1, 0.35), (124.4, 125.6, DECKW, 0, 0.0),
                                  (125.6, 129.0, GLASS, 1, 0.35), (129.0, 130.0, DECKW, 5, 0.0)):
    ring(octa(A - 2 * inset, CH - inset * 0.4), z0, z1, col, part)
ring(octa(A, CH), 120.0, 120.0001, DECKW, 0, caps=True, capcol=DECKW)
ring(octa(A, CH), 130.0, 130.0001, ROOF, 5, caps=True, capcol=ROOF)
# 窓の縦の枠（白い太い枠、約 1.7m ごと。遠目にはガラスと枠が半々で明るい灰色に見える）
oc = octa(A - 0.5, CH - 0.2)
for k in range(8):
    (x0, y0), (x1, y1) = oc[k], oc[(k + 1) % 8]
    L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L / 1.7))
    nx, ny = (y1 - y0) / L, -(x1 - x0) / L
    for j in range(n + 1):
        t = j / n; x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for z0, z1 in ((121.0, 124.4), (125.6, 129.0)):
            beam((x, y, z0), (x, y, z1), 0.6, 0.4, part=0, col=DECKW, face=(nx, ny, 0))
# 大展望台の上の白い機械室とパラボラアンテナ
ring([(4.5, -4.5), (4.5, 4.5), (-4.5, 4.5), (-4.5, -4.5)], 130.0, 136.5, WHITE, 0, caps=True, capcol=WHITE)
DISHES = [(0, 1, -3.0, 134.0, 1.6, 0.4), (0, 1, 4.5, 147.0, 1.3, -0.5), (1, 1, 2.0, 138.5, 1.7, 0.3), (1, 1, -4.0, 151.0, 1.3, -0.3),
          (0, -1, 1.5, 136.0, 1.5, 0.5), (1, -1, -2.5, 142.0, 1.6, -0.4), (0, 1, 0.5, 155.5, 1.2, 0.2), (1, 1, 5.0, 133.5, 1.4, 0.6),
          (0, -1, -4.0, 149.0, 1.3, -0.2), (1, -1, 3.5, 156.0, 1.2, 0.3)]
for axis, sign, s, z, r, yaw in DISHES:
    c = np.array(fp(axis, sign, s, z, -1.2)); n0 = np.array(fnorm(axis, sign), float)
    side = np.array((0, 1, 0) if axis == 0 else (1, 0, 0), float)
    disc(c, n0 * math.cos(yaw) + side * math.sin(yaw), r, DISH)

# ---- トップデッキ（223.5〜229.5m）、円筒形のアンテナ（239〜251m）と台 ----
for z0, z1, col, part, inset in ((223.5, 224.6, WHITE, 0, 0.0), (224.6, 228.3, GLASS, 2, 0.25), (228.3, 229.5, WHITE, 6, 0.0)):
    ring(octa(10.6 - 2 * inset, 1.6 - inset * 0.4), z0, z1, col, part)
ring(octa(10.6, 1.6), 223.5, 223.5001, WHITE, 0, caps=True, capcol=WHITE)
ring(octa(10.6, 1.6), 229.5, 229.5001, WHITE, 6, caps=True, capcol=WHITE)
ring(circle(7.0, 32), 238.5, 239.0, WHITE, 3, caps=True, capcol=WHITE)
ring(circle(6.5, 40), 239.0, 246.0, WHITE, 3)
ring(circle(6.5, 40), 246.0, 251.0, ORANGE, 3)
ring(circle(6.5, 40), 251.0, 251.0001, ORANGE, 3, caps=True, capcol=ORANGE)
for z in np.arange(239.6, 251.0, 0.95):
    ring(circle(6.78, 40), z, z + 0.28, WHITE if z < 246 else ORANGE, 3)
# 円筒の上から格子のアンテナへの斜めの支え
HM = [(251, 1.75), (257, 1.65), (260, 2.15), (264, 2.15), (267, 1.85), (276, 1.8), (304, 1.5), (306, 1.15), (314, 1.0)]
def hm(z): return interp(HM, z)
for k in range(8):
    a = 2 * math.pi * (k + 0.5) / 8
    beam((6.0 * math.cos(a), 6.0 * math.sin(a), 251.0), (hm(257) * math.copysign(1, math.cos(a)), hm(257) * math.copysign(1, math.sin(a)), 257.0), 0.45, part=3)
# 格子のアンテナ（4 本の弦材、約 2.4m ごとの横材と X）
zs = zsteps(251.0, 314.0, 2.4)
for z0, z1 in zip(zs, zs[1:]):
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        beam((sx * hm(z0), sy * hm(z0), z0), (sx * hm(z1), sy * hm(z1), z1), 0.34, part=3)
    for (ax, ay), (bx, by) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
        beam((ax * hm(z1), ay * hm(z1), z1), (bx * hm(z1), by * hm(z1), z1), 0.18, part=3)
        beam((ax * hm(z0), ay * hm(z0), z0), (bx * hm(z1), by * hm(z1), z1), 0.16, part=3)
        beam((bx * hm(z0), by * hm(z0), z0), (ax * hm(z1), ay * hm(z1), z1), 0.16, part=3)
for zp, hp in ((262.0, 2.6), (304.5, 1.95)):
    for (ax, ay), (bx, by) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
        beam((ax * hp, ay * hp, zp), (bx * hp, by * hp, zp), 0.3, part=3)
# 柱（314〜333m）
for z0, z1 in zip(zsteps(314.0, 333.0, 2.0), zsteps(314.0, 333.0, 2.0)[1:]):
    r0, r1 = 0.42 - 0.2 * (z0 - 314) / 19, 0.42 - 0.2 * (z1 - 314) / 19
    base = len(P)
    for z, r in ((z0, r0), (z1, r1)):
        for x, y in circle(r, 10): vtx((x, y, z), ORANGE, 3)
    for k in range(10): quad(base, k, (k + 1) % 10, 10 + (k + 1) % 10, 10 + k)

P = np.array(P); C = np.array(C, dtype=np.float32)
np.savez_compressed('tower-local.npz', P=P.astype(np.float32), I=np.array(I, np.uint32), C=C, part=np.array(PART, np.uint8))
# 塔のローカル（回転）→ 塔の位置の ENU → ECEF → カメラの ENU
cr, sr = math.cos(ROT), math.sin(ROT)
Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
local = P @ Rz.T + np.array([CX, CY, Z0])
Rt = enu_basis(LAT, LON); ot = ecef(LAT, LON, GEOID)
E = local @ Rt + ot
o, R = cam_frame()
Pc = ((E - o) @ R.T).astype(np.float32)
I = np.array(I, dtype=np.uint32)
attrs = np.stack([C[:, 0], C[:, 1], C[:, 2], np.array(PART, np.float32), np.array(EM, np.float32), np.array(TIER, np.float32)], 1).astype(np.float32)
with open('tower.bin', 'wb') as f:
    f.write(struct.pack('<III', len(Pc), len(I), 6)); f.write(Pc.tobytes()); f.write(attrs.tobytes()); f.write(I.tobytes())
# 塔の向き（カメラの ENU）：ローカルの x・y 軸（焼き込みの後処理と描画で、面の向きの割合に使う）
ax_enu = (np.array([cr, sr, 0]) @ Rt) @ R.T; ay_enu = (np.array([-sr, cr, 0]) @ Rt) @ R.T
json.dump({'ax': ax_enu.tolist(), 'ay': ay_enu.tolist(), 'base': Pc[np.argmin(P[:, 2])].tolist(), 'top': Pc[np.argmax(P[:, 2])].tolist()}, open('tower-axes.json', 'w'))
# 航空障害灯（赤）：柱の先、アンテナの途中、円筒の上の縁、トップデッキと大展望台の角
lights = [(0, 0, 333.6, 'top'), (0, 0, 305.0, 'mid')] + [(6.7 * math.cos(a), 6.7 * math.sin(a), 251.4, 'deck') for a in (0.785, 3.927)] \
    + [(sx * 13.0, sy * 13.0, 130.4, 'deck') for sx, sy in ((-1, -1), (1, 1))]
Lp = np.array([[x, y, z] for x, y, z, _ in lights]) @ Rz.T + np.array([CX, CY, Z0])
Lc = (((Lp @ Rt + ot) - o) @ R.T)
json.dump([{'p': p.tolist(), 'kind': k} for p, (_, _, _, k) in zip(Lc, lights)], open('tower-lights.json', 'w'))
print('tower verts', len(Pc), 'tris', len(I) // 3, 'base (cam ENU)', Pc[np.argmin(P[:, 2])].round(1), 'top', Pc[np.argmax(P[:, 2])].round(1))
