# 東京タワーの格子の模型（寸法は公開の値と PLATEAU の外形から）。カメラの ENU で出力する
#  部材の太さは実寸より少し太め：約 1.7km 先では画素に満たない部材が縮小で薄れるので、遠目に見える格子の密度（下半分で 5〜6 割）に合わせる
#  高さ 333m、大展望台（メインデッキ）145〜150m、特別展望台（トップデッキ）250m、脚の間隔 約 88m
#  塗り分け：大展望台より下はインターナショナルオレンジ、大展望台は白、その上は白とオレンジの 7 等分（最上部と最下部はオレンジ）
#  属性：色（rgb）、部位（0 格子 1 大展望台のガラス 2 特別展望台のガラス 3 アンテナ 4 フットタウン 5 チョーカー 6 ティアラ）、照明の当たり（0〜1）、段（ダイヤモンドヴェールの 17 段）
import os, json, math, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import ecef, enu_basis, cam_frame, GEOID
prof = json.load(open('tower-profile.json'))
ROT = math.radians(prof['rot_deg'])
LAT, LON = prof['lat'], prof['lon']
Z0 = prof['z0']  # 塔の足元の高さ（塔の位置の ENU、楕円体高 GEOID 基準）
CX, CY = prof['center_enu_tower']
KN = [(0, 44.0), (20, 37.5), (45, 30.5), (80, 22.8), (110, 17.6), (140, 14.6), (160, 13.0), (200, 10.6), (240, 8.6), (247, 8.2), (255, 5.6), (262, 3.4)]
def w(z):
    for (z0, a), (z1, b) in zip(KN, KN[1:]):
        if z <= z1: return a + (b - a) * (z - z0) / (z1 - z0)
    return KN[-1][1]
ORANGE = (0.80, 0.30, 0.13); WHITE = (0.90, 0.89, 0.86); GLASS = (0.16, 0.19, 0.22); GREY = (0.70, 0.70, 0.68); DECKROOF = (0.55, 0.55, 0.53)
BAND0, TOP = 158.0, 333.0
def paint(z):
    if z < 140: return ORANGE
    if z < BAND0: return WHITE
    k = int((z - BAND0) / ((TOP - BAND0) / 7))
    return ORANGE if k % 2 == 0 else WHITE
P, C, PART, EM, TIER, I = [], [], [], [], [], []
def emis(z, part):
    if part in (1, 2): return 1.0
    if part == 4: return 0.0
    if part == 3: return 0.35 if z < 300 else 0.15
    # ランドマークライト：足元と大展望台から照らす。脚とその上が明るく、上に行くほど少し弱い
    return 0.95 - 0.35 * max(0, (z - 150)) / 110 if z < 262 else 0.25
def tier(z): return min(16, int(max(z, 0) / (250 / 17)))
def box(a, b, wid, part, col=None, thick=None):
    # a→b の角材（断面 wid × thick）
    a = np.array(a, float); b = np.array(b, float); d = b - a; L = np.linalg.norm(d)
    if L < 1e-6: return
    d /= L
    up = np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(d, up); u /= np.linalg.norm(u); v = np.cross(d, u)
    hw, ht = wid / 2, (thick or wid) / 2
    corners = []
    for p in (a, b):
        for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            corners.append(p + u * hw * s + v * ht * t)
    base = len(P)
    for k, q in enumerate(corners):
        P.append(q); z = q[2]
        C.append(col or paint(z)); PART.append(part); EM.append(emis(z, part)); TIER.append(tier(z))
    for f in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (0, 3, 2, 1), (4, 5, 6, 7)):
        I.extend([base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]])
def slab(z0, z1, hw, part, col):
    # 箱（展望台・フットタウン）：側面と屋根
    corners = [(-hw, -hw), (hw, -hw), (hw, hw), (-hw, hw)]
    base = len(P)
    for z in (z0, z1):
        for x, y in corners:
            P.append(np.array([x, y, z])); C.append(col); PART.append(part); EM.append(emis(z, part)); TIER.append(tier(z))
    for f in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7), (0, 3, 2, 1)):
        I.extend([base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]])
def corner(z, sx, sy, inset=0.0):
    ww = w(z) - inset; return (sx * ww, sy * ww, z)
SIGNS = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
# 高さの区切り
levels = [0, 6, 13, 21, 30, 40, 50] + list(range(57, 140, 7)) + [140, 147, 151, 158] + list(range(163, 247, 6)) + [247, 253, 258, 262]
def legw(z): return 7.0 - 4.6 * min(z, 140) / 140 if z < 140 else 2.4 - 1.0 * min(z - 140, 120) / 120
# 脚（角の柱）。脚は 2 本の弦材とつなぎで、格子に見えるようにする
for sx, sy in SIGNS:
    for z0, z1 in zip(levels, levels[1:]):
        if z1 > 262: break
        lw = legw(z0)
        a = corner(z0, sx, sy); b = corner(z1, sx, sy)
        box(a, b, max(lw * 0.6, 1.5), 0)
        ai = corner(z0, sx, sy, inset=lw * 0.9); bi = corner(z1, sx, sy, inset=legw(z1) * 0.9)
        box(ai, bi, max(lw * 0.42, 1.1), 0)
        box(a, bi, 0.95, 0); box(ai, b, 0.95, 0)
# 各面：横材とバツ印の斜材、下はアーチ
faces = [((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))]
for (ax, ay), (bx, by) in faces:
    # アーチ（足元）：脚の内側から頂点 42m まで
    pts = []
    for k in range(13):
        s = k / 12
        z = 42 * math.sin(math.pi * s) ** 0.75
        ww = w(z) - legw(z) * 0.9
        x = ax * ww + (bx * ww - ax * ww) * s; y = ay * ww + (by * ww - ay * ww) * s
        # 面の上に乗せる（面の法線方向は角の符号で決まる）
        if ay == by: y = ay * w(z)
        if ax == bx: x = ax * w(z)
        pts.append((x, y, z))
    for p, q in zip(pts, pts[1:]): box(p, q, 2.1, 0)
    for z0, z1 in zip(levels, levels[1:]):
        if z0 < 45 or z1 > 262: continue
        a0, b0 = corner(z0, ax, ay), corner(z0, bx, by)
        a1, b1 = corner(z1, ax, ay), corner(z1, bx, by)
        box(a0, b0, 1.25, 0)
        if 140 <= z0 < 158: continue  # 大展望台の中
        box(a0, b1, 0.85, 0); box(b0, a1, 0.85, 0)
        if z1 <= 140:
            m0 = tuple((np.array(a0) + np.array(b0)) / 2); m1 = tuple((np.array(a1) + np.array(b1)) / 2)
            box(m0, m1, 0.95, 0)
# 大展望台（2 層）とトップデッキ、チョーカーとティアラ
slab(140, 141.3, 16.6, 0, WHITE); slab(141.3, 149.4, 16.4, 1, GLASS); slab(149.4, 151.0, 16.6, 0, WHITE); slab(151.0, 155.6, 15.6, 1, GLASS); slab(155.6, 158.5, 15.9, 5, WHITE)
slab(246.0, 246.9, 7.4, 0, WHITE); slab(246.9, 251.0, 7.2, 2, GLASS); slab(251.0, 253.6, 7.5, 6, WHITE)
# 上の格子からアンテナ
for z0, z1 in ((253, 262),):
    for sx, sy in SIGNS: box(corner(z0, sx, sy), corner(z1, sx, sy), 1.2, 0)
seg = [(262, 1.9), (275, 1.6), (296, 1.3), (313, 1.0), (333, 0.5)]
for (z0, r0), (z1, r1) in zip(seg, seg[1:]):
    n = 10
    for k in range(n):
        za, zb = z0 + (z1 - z0) * k / n, z0 + (z1 - z0) * (k + 1) / n
        box((0, 0, za), (0, 0, zb), 2 * (r0 + (r1 - r0) * (k + 0.5) / n), 3)
for zp, rp in ((275, 3.2), (296, 2.6), (313, 2.0)):
    slab(zp - 0.8, zp + 0.8, rp, 3, paint(zp))
# フットタウン（塔の下の 5 階建て）
slab(0, 24.0, 27.0, 4, GREY); slab(24.0, 24.6, 26.0, 4, DECKROOF)
P = np.array(P); C = np.array(C, dtype=np.float32)
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
# 航空障害灯（赤）：アンテナの先・途中・トップデッキの角
lights = [(0, 0, 334.0, 'top')] + [(0, 0, z, 'mid') for z in (296.5, 276)] + [(sx * 7.6, sy * 7.6, 254.2, 'deck') for sx, sy in SIGNS] + [(sx * 16.8, sy * 16.8, 159.0, 'deck') for sx, sy in SIGNS]
Lp = np.array([[x, y, z] for x, y, z, _ in lights]) @ Rz.T + np.array([CX, CY, Z0])
Lc = (((Lp @ Rt + ot) - o) @ R.T)
json.dump([{'p': p.tolist(), 'kind': k} for p, (_, _, _, k) in zip(Lc, lights)], open('tower-lights.json', 'w'))
print('tower verts', len(Pc), 'tris', len(I) // 3, 'base (cam ENU)', Pc[np.argmin(P[:, 2])].round(1), 'top', Pc[np.argmax(P[:, 2])].round(1))
