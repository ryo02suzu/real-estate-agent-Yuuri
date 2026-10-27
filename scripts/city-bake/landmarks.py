# 形を作り直す高層ビル（PLATEAU の LOD2 は外形を簡略にした箱なので、目立つ塔だけ本物の形にする）。カメラの ENU で出力する
#  麻布台ヒルズ森JPタワー（gid 2625）：平面は角の丸い四角（PLATEAU の屋上の輪郭から一辺 約 76m、角の半径 約 11m、向きも同じ）。
#    壁は中ほどがわずかにふくらみ、頂部は各面が二つの山（中央に縦の溝が通り、そこで低くなる）。外装は銀色のガラスと階ごとの白い帯
#  出力：landmarks.bin（頂点・色・gid・三角形）と landmarks.json（PLATEAU から抜く gid）
import os, json, math, struct, sys
import numpy as np, DracoPy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import cam_frame
o, Rc = cam_frame()
man = json.load(open('manifest.json'))
def plateau_mesh(gid):
    """PLATEAU のタイルから gid の建物の頂点（カメラの ENU）"""
    for t in man['tiles']:
        gm = t.get('gmap') or {}
        items = gm.items() if isinstance(gm, dict) else enumerate(gm)
        bs = [int(b) for b, g in items if g == gid]
        if not bs: continue
        b = open(t['path'] + '.glb', 'rb').read()
        jl = struct.unpack('<I', b[12:16])[0]; gj = json.loads(b[20:20 + jl]); binstart = 20 + jl + 8
        center = np.array(t['center'])
        V = []
        for mesh in gj['meshes']:
            for pr in mesh['primitives']:
                ext = pr['extensions']['KHR_draco_mesh_compression']
                v = gj['bufferViews'][ext['bufferView']]; off = binstart + v.get('byteOffset', 0)
                dm = DracoPy.decode(b[off:off + v['byteLength']])
                pts = np.array(dm.points, dtype=np.float64).reshape(-1, 3)
                bat = None
                for a in dm.attributes:
                    if [k for k, vv in ext['attributes'].items() if vv == a['unique_id']] == ['_BATCHID']: bat = np.array(a['data']).reshape(-1)
                if bat is None: continue
                sel = np.isin(np.rint(bat).astype(int), bs)
                P = np.stack([pts[:, 0], -pts[:, 2], pts[:, 1]], 1) + center
                V.append((P[sel] - o) @ Rc.T)
        return np.concatenate(V)
    raise SystemExit(f'gid {gid} not found')
def min_rect(pts):
    c = pts.mean(0); best = None
    for a in np.radians(np.arange(0, 90, 0.25)):
        rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
        q = (pts - c) @ rot; ar = np.ptp(q[:, 0]) * np.ptp(q[:, 1])
        if best is None or ar < best[0]:
            mid = np.array([(q[:, 0].max() + q[:, 0].min()) / 2, (q[:, 1].max() + q[:, 1].min()) / 2])
            best = (ar, a, np.ptp(q[:, 0]), np.ptp(q[:, 1]), c + mid @ rot.T)
    return best

P, C, G, I = [], [], [], []
def add_strip(ring0, ring1, col, gid):
    """二つの輪（同じ点数、閉じた多角形の 3D 点）の間の帯"""
    n = len(ring0); base = len(P)
    for p in list(ring0) + list(ring1): P.append(p); C.append(col); G.append(gid)
    for k in range(n):
        a, b = k, (k + 1) % n
        I.extend([base + a, base + b, base + n + b, base + a, base + n + b, base + n + a])
def add_cap(ring, col, gid, up=True):
    base = len(P); c = np.mean(ring, 0)
    P.append(c); C.append(col); G.append(gid)
    for p in ring: P.append(p); C.append(col); G.append(gid)
    n = len(ring)
    for k in range(n):
        a, b = 1 + k, 1 + (k + 1) % n
        I.extend([base, base + a, base + b] if up else [base, base + b, base + a])

# ---- 麻布台ヒルズ森JPタワー ----
GID = 2625
V = plateau_mesh(GID)
zg = V[:, 2].min(); ztop = V[:, 2].max()
roof = V[V[:, 2] > ztop - 25]
_, rot, sx_, sy_, ctr = min_rect(roof[:, :2])
half = (sx_ + sy_) / 4
print('JP tower: ground z', round(zg, 1), 'top z', round(ztop, 1), 'height', round(ztop - zg, 1), 'roof size', round(sx_, 1), round(sy_, 1), 'center', ctr.round(1))
ex = np.array([math.cos(rot), -math.sin(rot)]); ey = np.array([math.sin(rot), math.cos(rot)])  # 屋上の輪郭の向き（rot の逆回転の軸）
H = ztop - zg            # 頂部（山の頂点）までの高さ
RC = 11.0                # 角の半径
FL = 5.0                 # 階の高さ（ガラス 3.6m ＋ 白い帯 1.4m）
ZCROWN = H - 15.0        # 頂部の飾り（山）の始まり
def plan_ring(a, n_side=14, n_corner=8):
    """角の丸い四角（半径 RC、半分の辺 a）の周の点（ローカル）と、各点の面の中の位置 u（-1〜1、角は ±1 を越える）"""
    pts = []; us = []
    r = min(RC, a * 0.45); e = a - r
    for k in range(4):
        ang0 = k * math.pi / 2
        # 辺（中央が u=0）
        for j in range(n_side):
            t = -e + 2 * e * j / n_side
            x, y = a, t
            ca, sa = math.cos(ang0), math.sin(ang0)
            pts.append((x * ca - y * sa, x * sa + y * ca)); us.append(t / a)
        # 角
        for j in range(n_corner):
            th = (j / n_corner) * math.pi / 2
            x, y = e + r * math.cos(th), e + r * math.sin(th)
            ca, sa = math.cos(ang0), math.sin(ang0)
            pts.append((x * ca - y * sa, x * sa + y * ca)); us.append(1.0 + 0.4 * j / n_corner)
    return np.array(pts), np.array(us)
def a_of(z):
    """壁の半分の幅：中ほどが 3% ふくらむ"""
    return half * (0.985 + 0.03 * math.sin(math.pi * min(max(z / ZCROWN, 0), 1)))
def crown_z(u):
    """頂部の上端の高さ：各面に二つの山（u=±0.5 が頂点、中央 u=0 は 6m 低い溝、角へ 13m 下がる）"""
    au = min(abs(u), 1.4)
    if au < 0.5: return H - 6.0 * (1 - au / 0.5) ** 2
    return H - 13.0 * min(1.0, (au - 0.5) / 0.7) ** 2
def to_cam(xy, z):
    w = ctr + xy[:, 0:1] * ex + xy[:, 1:2] * ey
    return np.c_[w, np.full(len(xy), zg + z)]
GLASS = (0.50, 0.55, 0.61); FIN = (0.72, 0.74, 0.76); SEAM = (0.30, 0.33, 0.37); ROOFC = (0.55, 0.56, 0.57)
z = 0.0; rings = []
while z < ZCROWN - 0.01:
    for dz, col in ((3.6, GLASS), (1.4, FIN)):
        z1 = min(ZCROWN, z + dz)
        xy0, us = plan_ring(a_of(z)); xy1, _ = plan_ring(a_of(z1))
        add_strip(to_cam(xy0, z), to_cam(xy1, z1), col, GID)
        z = z1
        if z >= ZCROWN - 0.01: break
# 頂部の飾り：上端が山の形の壁（中を少し下げた屋上）
xy0, us = plan_ring(a_of(ZCROWN))
top = np.array([crown_z(u) for u in us])
nb = 6
for k in range(nb):
    za = ZCROWN + (top - ZCROWN) * k / nb; zb = ZCROWN + (top - ZCROWN) * (k + 1) / nb
    r0 = to_cam(xy0, 0); r0[:, 2] = zg + za
    r1 = to_cam(xy0, 0); r1[:, 2] = zg + zb
    add_strip(r0, r1, GLASS if k % 2 == 0 else (0.50, 0.55, 0.61), GID)
inner = to_cam(xy0 * 0.97, ZCROWN + 1.0)
add_cap(inner, ROOFC, GID)
# 各面の中央の縦の溝（暗い細い帯、幅 1.4m）
for k in range(4):
    ang0 = k * math.pi / 2; ca, sa = math.cos(ang0), math.sin(ang0)
    for z0 in np.arange(0, ZCROWN, 10.0):
        z1 = min(ZCROWN + 6, z0 + 10.0)
        quad = []
        for zz in (z0, z1):
            a = a_of(min(zz, ZCROWN)) + 0.15
            for t in (-0.7, 0.7):
                quad.append((a * ca - t * sa, a * sa + t * ca, zz))
        q = np.array(quad)
        w = ctr + q[:, 0:1] * ex + q[:, 1:2] * ey
        pts = np.c_[w, zg + q[:, 2]]
        base = len(P)
        for p in pts: P.append(p); C.append(SEAM); G.append(GID)
        I.extend([base, base + 1, base + 3, base, base + 3, base + 2])

P = np.array(P, np.float32); C = np.array(C, np.float32); G = np.array(G, np.float32); I = np.array(I, np.uint32)
with open('landmarks.bin', 'wb') as f:
    f.write(struct.pack('<II', len(P), len(I))); f.write(P.tobytes()); f.write(C.tobytes()); f.write(G.tobytes()); f.write(I.tobytes())
json.dump({'exclude': [GID], 'path': 'landmarks.bin'}, open('landmarks.json', 'w'))
print('landmarks verts', len(P), 'tris', len(I) // 3)
