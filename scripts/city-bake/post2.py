# 質感の無い建物の色（屋根は空中写真、壁は用途の色と窓の帯）、木の色、窓の層（窓ごとの鍵・階の鍵・用途）
import os, numpy as np, json, math, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_bake import load
Image.MAX_IMAGE_PIXELS = None
alb = load('albedo').astype(np.float32) / 255
c = np.load('bake/core.npz'); typ = c['typ'].astype(np.int32); gid = c['gid'].astype(np.int64); dist = c['dist']; wz = c['wz']; wallU = c['wallU']
N = np.load('bake/N.npy'); D = np.load('bake/dirs.npy'); hab = np.load('bake/hab.npy')
WP = D * dist[..., None]
H2, W2 = typ.shape
B = json.load(open('buildings.json')); nb = len(B)
H_ = np.array([(b[1] if b and b[1] else 0) for b in B], np.float32)
ST = np.array([(b[2] if b and b[2] else 0) for b in B], np.float32)
US = np.array([(b[0] if b else 0) for b in B], np.int32)
def ucls(u):
    if u in (401, 421): return 1
    if u in (402, 404): return 2
    if u == 403: return 3
    if 411 <= u <= 415: return 4
    if u in (422, 431, 441, 452, 453): return 5
    return 6
CL = np.array([ucls(u) for u in US], np.int32)
# 階の高さ
fh = np.where((ST > 0) & (H_ > 0), H_ / np.maximum(ST, 1), 0)
deflt = np.where(CL == 4, 3.0, np.where(CL == 1, 4.0, 3.4))
fh = np.where((fh >= 2.6) & (fh <= 6.5), fh, deflt).astype(np.float32)
# 窓の列の間隔と幅、窓の帯（階の中の高さの範囲）
SP = {1: (1.8, 0.85), 2: (4.0, 0.6), 3: (3.4, 0.45), 4: (3.4, 0.5), 5: (3.2, 0.5), 6: (3.0, 0.5)}
VB = {1: (0.22, 0.88), 2: (0.25, 0.85), 3: (0.32, 0.8), 4: (0.3, 0.86), 5: (0.3, 0.8), 6: (0.3, 0.82)}
isb = ((typ == 1) | (typ == 2)) & (gid > 0)
wall = isb & (np.abs(N[..., 2]) < 0.35)
roof = isb & (N[..., 2] >= 0.6)
g = np.where(isb, gid, 0)
cls = CL[g]; f_h = fh[g]
# 外装を作り直す高層ビル（facades.json）は用途を指定どおりに（点灯のまとまりと階の鍵がその用途で決まる）
FAC = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'facades.json')))
for gs, spec in FAC.items():
    if gs.isdigit(): cls[gid == int(gs)] = spec.get('cls', 1)
fl = np.floor(np.maximum(hab, 0) / f_h).astype(np.int32)
v = np.maximum(hab, 0) / f_h - fl
tab = lambda T, i: np.array([0] + [T[k][i] for k in range(1, 7)], np.float32)[cls]
sp = tab(SP, 0); ww = tab(SP, 1); v0 = tab(VB, 0); v1 = tab(VB, 1)
col = np.floor(wallU / sp).astype(np.int64); uu = wallU / sp - np.floor(wallU / sp)
# 1 階の店舗・ロビーは大きな窓
gnd = fl == 0
inwin = wall & (fl >= 0) & (hab < H_[g] - 1.2) & (((v > v0) & (v < v1) & (np.abs(uu - 0.5) < ww / 2)) | (gnd & (v > 0.12) & (v < 0.8) & (np.abs(uu - 0.5) < 0.42)))
# 鍵：建物・階・列からの擬似乱数（0〜255）
def h32(x):
    x = (x ^ (x >> 16)) * 0x45d9f3b & 0xffffffff
    x = (x ^ (x >> 16)) * 0x45d9f3b & 0xffffffff
    return x ^ (x >> 16)
# 点灯のまとまり：オフィスは 4 列（区画）、商業は 3 列、住宅は 2 列（住戸）、ホテルは 1 列（客室）
grp = np.where(cls == 1, 4, np.where(cls == 2, 3, np.where(cls == 3, 1, 2)))
colg = np.floor_divide(col, grp)
wkey = (h32((g * 7919 + fl * 104729 + colg * 1299709) & 0xffffffff) & 255).astype(np.uint8)
fkey = (h32((g * 2654435761 + fl * 97) & 0xffffffff) & 255).astype(np.uint8)
gkey = (h32((g * 40503) & 0xffffffff) & 255).astype(np.uint8)
# ---- 色：質感の無い建物 ----
Image.MAX_IMAGE_PIXELS = None
mos = {k: np.asarray(Image.open(f'mosaic-{k}.png').convert('RGB'), dtype=np.float32) / 255 for k in ('near', 'far')}
G = json.load(open('mosaics.json'))
def sample_mosaic(x, y):
    out = np.zeros(x.shape + (3,), np.float32); ok = np.zeros(x.shape, bool)
    for k in ('near', 'far'):
        gg = G[k]; n = gg['n']
        px = (x - (gg['cx'] - gg['half'])) / (2 * gg['half']) * n; py = ((gg['cy'] + gg['half']) - y) / (2 * gg['half']) * n
        m = (~ok) & (px >= 0) & (px < n - 1) & (py >= 0) & (py < n - 1)
        out[m] = mos[k][py[m].astype(int), px[m].astype(int)]; ok |= m
    return out, ok
A = alb[..., :3].copy()
un = (typ == 2) & isb
ur = un & roof
rc, ok = sample_mosaic(WP[..., 0], WP[..., 1])
A[ur & ok] = rc[ur & ok] * 0.95
# 壁：用途ごとの色の幅（東京の建物に多い明るい灰・白・ベージュ・茶のタイル・濃いガラス）
PAL = {1: [(0.62, 0.64, 0.66), (0.48, 0.52, 0.56), (0.70, 0.70, 0.68), (0.36, 0.42, 0.48)], 2: [(0.72, 0.70, 0.66), (0.60, 0.58, 0.55), (0.78, 0.76, 0.72)],
       3: [(0.74, 0.72, 0.68), (0.62, 0.60, 0.58)], 4: [(0.80, 0.78, 0.74), (0.72, 0.68, 0.62), (0.62, 0.55, 0.48), (0.84, 0.83, 0.80), (0.55, 0.50, 0.46)],
       5: [(0.70, 0.70, 0.68), (0.64, 0.62, 0.58)], 6: [(0.68, 0.66, 0.62), (0.58, 0.56, 0.54), (0.74, 0.72, 0.68)]}
base = np.zeros(H2 * W2 * 3, np.float32).reshape(H2, W2, 3)
for k, pl in PAL.items():
    pl = np.array(pl, np.float32)
    m = un & (cls == k)
    base[m] = pl[gkey[m] % len(pl)]
uw = un & ~roof
glass = np.array([0.16, 0.19, 0.23], np.float32)
noise = (np.random.default_rng(3).random((H2, W2)) - 0.5)[..., None] * 0.04
wallc = base * (0.92 + 0.08 * (gkey[..., None] / 255)) + noise
A[uw] = wallc[uw]
A[uw & inwin] = (glass + (base * 0.15))[uw & inwin]
# ---- 目立つ高層ビルの外装（facades.json）：実際の階数で各階の帯・ガラス・方立を描く。ガラスは窓として扱う（夜の点灯・空の映り込み）----
def facade(spec, h, u):
    fh = spec['H'] / spec['floors']
    f = h / fh; fl = np.floor(f); v = f - fl
    bh = spec.get('bandH', 0.8) / fh
    gcol = np.array(spec['glass'], np.float32); bcol = np.array(spec['band'], np.float32); mcol = np.array(spec.get('mullion', spec['band']), np.float32)
    inb = v < bh
    ms, mw = spec.get('mullSp', 1.6), spec.get('mullW', 0.1)
    uu = u / ms - np.floor(u / ms)
    onm = (np.abs(uu - 0.5) > 0.5 - mw / ms / 2) & ~inb
    col = np.where(inb[:, None], bcol, np.where(onm[:, None], mcol, gcol))
    # 帯の上の庇の影（バルコニー）
    led = spec.get('ledge', 0.0)
    if led > 0: col = col * np.where(inb, 1.0, 1 - led * np.exp(-np.clip(v - bh, 0, None) * fh / 0.6))[:, None]
    # 階・列ごとのブラインドの開きのばらつき
    key = (h32((fl.astype(np.int64) * 7919 + np.floor(u / ms).astype(np.int64) * 104729) & 0xffffffff) & 255) / 255
    col = col * (1 + (key - 0.5) * spec.get('var', 0.1))[:, None]
    return np.clip(col, 0, 1).astype(np.float32), ~inb & ~onm
for gs, spec in FAC.items():
    if not gs.isdigit(): continue
    gi = int(gs); m = (gid == gi) & un & ~roof
    if not m.any(): continue
    col, gm = facade(spec, hab[m], wallU[m])
    A[m] = col
    inwin[m] = gm & (hab[m] < spec['H'] - 1.0)
    print('facade', gs, spec['name'], 'px', int(m.sum()))
# 斜めの屋根や庇など（|n.z| が中間）も壁色に
# ---- 木 ----
tree = typ == 5
tk = (h32((np.floor(WP[..., 0] / 6).astype(np.int64) * 73856093 ^ np.floor(WP[..., 1] / 6).astype(np.int64) * 19349663) & 0xffffffff) & 255) / 255
leaf = np.stack([0.20 + 0.08 * tk, 0.30 + 0.10 * tk, 0.16 + 0.05 * tk], -1).astype(np.float32)
shade = (0.75 + 0.25 * np.clip(N[..., 2], 0, 1))[..., None]
A[tree] = (leaf * shade)[tree]
np.save('bake/albedo_filled.npy', A)
np.savez_compressed('bake/win.npz', inwin=inwin, wkey=wkey, fkey=fkey, cls=cls.astype(np.uint8), fl=fl.astype(np.int16), gkey=gkey)
Image.fromarray((np.clip(A, 0, 1) * 255).astype(np.uint8)).resize((W2 // 2, H2 // 2), Image.LANCZOS).save('out/b-albedo2.png')
Image.fromarray((inwin * 255).astype(np.uint8)).resize((W2 // 2, H2 // 2), Image.BOX).save('out/b-win.png')
print('walls', int(wall.sum()), 'windows px', int(inwin.sum()), 'untextured', int(un.sum()), 'roof filled', int((ur & ok).sum()))
