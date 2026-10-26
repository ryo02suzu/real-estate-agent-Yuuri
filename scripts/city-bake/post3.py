# 1 倍に縮めて詰める：色・法線と空の見え方・距離と種類・窓・塔と道路。影用の高さ地図（真上）と航空障害灯の位置
import os, numpy as np, json, math, sys, os
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_bake import load
from geo import CAM, GEOID
Image.MAX_IMAGE_PIXELS = None
os.makedirs('layers', exist_ok=True)
c = np.load('bake/core.npz'); typ = c['typ'].astype(np.int32); gid = c['gid'].astype(np.int64); dist = c['dist']; wz = c['wz']
N = np.load('bake/N.npy'); D = np.load('bake/dirs.npy'); A = np.load('bake/albedo_filled.npy')
w = np.load('bake/win.npz'); inwin = w['inwin']; wkey = w['wkey']; fkey = w['fkey']; cls = w['cls']; gkey = w['gkey']
twr = load('tower')
WP = D * dist[..., None]
H2, W2 = typ.shape; H, W = H2 // 2, W2 // 2
R_EARTH = 6371000.0
# 遠くの地面 → 山（地形）。標高（T.P.）を出す
elev = wz + (CAM['h'] - GEOID) + dist ** 2 / (2 * R_EARTH) * (1 - 0.13)
terrain = (typ == 3) & (dist > 22000)
T = typ.copy(); T[terrain] = 6
# ---- 影用の高さ地図（真上、近く 9km 四方）----
dsm = load('dsm', np.float32)  # (dist, gid, z, wallU)
dz = dsm[..., 2].copy(); dz[dsm[..., 0] <= 0] = -300
G = json.load(open('mosaics.json'))['near']
n_d = dz.shape[0]; mpp = 2 * G['half'] / n_d
def dsm_at(x, y):
    px = np.clip(((x - (G['cx'] - G['half'])) / mpp).astype(int), 0, n_d - 1); py = np.clip((((G['cy'] + G['half']) - y) / mpp).astype(int), 0, n_d - 1)
    return dz[py, px]
inside = (np.abs(WP[..., 0] - G['cx']) < G['half'] - 50) & (np.abs(WP[..., 1] - G['cy']) < G['half'] - 50) & (typ > 0)
# 空の見え方（8 方向の地平角から）
svf = np.ones((H2, W2), np.float32)
idx = np.where(inside)
px, py, pz = WP[..., 0][idx], WP[..., 1][idx], WP[..., 2][idx]
nx, ny = N[..., 0][idx], N[..., 1][idx]
steps = np.geomspace(3.0, 600.0, 18)
acc = np.zeros(len(px), np.float32)
for k in range(8):
    a = k * math.pi / 4; dx, dy = math.cos(a), math.sin(a)
    # 壁は外向きの側から（面の裏側の方向は半分ふさがっているとみなす）
    facing = (nx * dx + ny * dy) >= -0.2
    best = np.zeros(len(px), np.float32)
    for s in steps:
        h = dsm_at(px + dx * (s + 1.2), py + dy * (s + 1.2))
        best = np.maximum(best, np.clip((h - pz - 0.8) / s, 0, None))
    sinh2 = best ** 2 / (1 + best ** 2)
    acc += np.where(facing, 1 - sinh2, 0.25)
svf[idx] = acc / 8
# ---- 道路（地面の画素だけ）----
rmask = {k: np.asarray(Image.open(f'roads-{k}.png')) for k in ('near', 'far')}
rdir = {k: np.asarray(Image.open(f'roaddir-{k}.png')) for k in ('near', 'far')}
MG = json.load(open('mosaics.json'))
road = np.zeros((H2, W2), np.uint8); rd = np.zeros((H2, W2), np.uint8)
gr = (typ == 3) & ~terrain
for k in ('near', 'far'):
    g = MG[k]; n = g['n']
    pxk = ((WP[..., 0] - (g['cx'] - g['half'])) / (2 * g['half']) * n).astype(int); pyk = (((g['cy'] + g['half']) - WP[..., 1]) / (2 * g['half']) * n).astype(int)
    m = gr & (road == 0) & (pxk >= 0) & (pxk < n) & (pyk >= 0) & (pyk < n)
    road[m] = rmask[k][pyk[m], pxk[m]]; rd[m] = rdir[k][pyk[m], pxk[m]]
rcls = road >> 6  # 0 無し 1 生活道路 2 国道・都道 3 高速
ang = rd.astype(np.float32) / 255 * math.pi
ru = (WP[..., 0] * np.cos(ang) + WP[..., 1] * np.sin(ang))  # 道に沿った座標（m）
# ---- 縮めて詰める（k=2 → 1179×825（3 倍の端末）、k=3 → 786×550（2 倍の端末））----
def pack(k, tag):
    H, W = H2 // k, W2 // k
    def blk(a): return a[:H * k, :W * k].reshape(H, k, W, k, *a.shape[2:]).swapaxes(1, 2).reshape(H, W, k * k, *a.shape[2:])
    cov = blk((typ > 0).astype(np.float32)).mean(2)
    geom = blk(typ > 0)
    def gmean(a):
        b = blk(a.astype(np.float32)); m = geom.astype(np.float32)
        while m.ndim < b.ndim: m = m[..., None]
        return (b * m).sum(2) / np.maximum(m.sum(2), 1e-6)
    alb1 = gmean(A)
    n1 = gmean(N); n1 /= np.maximum(np.linalg.norm(n1, axis=-1, keepdims=True), 1e-6)
    svf1 = np.where(cov > 0, gmean(svf), 1.0)
    ld = np.log(np.clip(dist, 100, 200000) / 100) / math.log(2000)
    d1 = gmean(ld)
    el1 = gmean(np.clip(elev, 0, 4080))
    pri = np.array([0, 3, 3, 1, 5, 2, 0])
    tb = blk(T)
    best_t = np.zeros((H, W), np.int32); best_s = np.full((H, W), -1)
    for t in (6, 3, 5, 2, 1, 4):
        cnt = (tb == t).sum(2); sc = cnt * 10 + pri[t]
        m = (cnt > 0) & (sc > best_s); best_t[m] = t; best_s[m] = sc[m]
    win1 = blk(inwin.astype(np.float32)).mean(2)
    iw = blk(inwin); first = np.argmax(iw, axis=2)[..., None]
    pk = lambda a: np.take_along_axis(blk(a), first, 2)[..., 0]
    wk1 = pk(wkey); fk1 = pk(fkey); cl1 = pk(cls)
    tp = blk(twr[..., 0]).max(2); te = blk(twr[..., 1].astype(np.float32)).mean(2); tt = blk(twr[..., 2]).max(2)
    rcov = blk((rcls > 0).astype(np.float32)).mean(2); rc1 = blk(rcls).max(2)
    rd1 = blk(rd)[..., 0]; ru1 = blk(ru.astype(np.float32))[..., 0]
    u8 = lambda x: np.clip(np.rint(x), 0, 255).astype(np.uint8)
    d16 = np.clip(np.rint(d1 * 65535), 0, 65535).astype(np.int32)
    aux = np.where(best_t == 3, rc1, np.where((best_t == 1) | (best_t == 2), cl1, 0))
    q = lambda x, bits: (np.rint(np.clip(x, 0, 1) * (2 ** bits - 1)) / (2 ** bits - 1) * 255)
    d16 = (d16 >> 4) << 4
    out = {
        'albedo': np.dstack([u8(np.clip(alb1, 0, 1) * 255), u8(cov * 255)]),
        'normal': np.dstack([u8(q(n1 * 0.5 + 0.5, 6)), u8(q(svf1, 4))]),
        'geo': np.dstack([u8(d16 >> 8), u8(d16 & 255), u8(best_t * 32 + aux)]),
        'win': np.dstack([u8(q(win1, 4)), u8((wk1 >> 4) * 17), u8((fk1 >> 4) * 17)]),
        'emis': np.dstack([
            u8(np.where(best_t == 4, np.where(tp > 0, (tp - 1) * 32 + np.minimum(tt, 16), 0), np.where(best_t == 6, el1 / 16, np.where(best_t == 3, rcov * 255, 0)))),
            u8(np.where(best_t == 4, te, np.where(best_t == 3, rd1, 0))),
            u8(np.where(best_t == 3, np.mod(ru1, 256), 0))]),
    }
    os.makedirs(f'layers/{tag}', exist_ok=True)
    for name, a in out.items():
        im = Image.fromarray(a, 'RGBA' if a.shape[2] == 4 else 'RGB')
        if name in ('albedo',): im.save(f'layers/{tag}/{name}.webp', quality=90, method=6, alpha_quality=100)
        elif name == 'normal': im.save(f'layers/{tag}/{name}.webp', lossless=True, method=6)
        else: im.save(f'layers/{tag}/{name}.webp', lossless=True, method=6)
    np.savez_compressed(f'bake/l{tag}.npz', **{k: v for k, v in out.items()})
pack(2, '3x'); pack(3, '2x')
dmax = dz.reshape(2048, 2, 2048, 2).max(axis=(1, 3))
# 視界に入る地面（焼き込みの画素の世界座標）から 600m の範囲だけ残す
from scipy import ndimage
seen = np.zeros((2048, 2048), bool)
gx = ((WP[..., 0] - (G['cx'] - G['half'])) / (2 * G['half']) * 2048).astype(int); gy = (((G['cy'] + G['half']) - WP[..., 1]) / (2 * G['half']) * 2048).astype(int)
ok = (typ > 0) & (gx >= 0) & (gx < 2048) & (gy >= 0) & (gy < 2048)
seen[gy[ok], gx[ok]] = True
keep = ndimage.binary_dilation(seen, iterations=int(600 / (2 * G['half'] / 2048)))
ground = np.median(dmax[keep])
dmax = np.where(keep, dmax, ground)
dmax = np.rint((dmax + 300) / 3.2) * 3.2 - 300
Image.fromarray(np.clip(np.rint((dmax + 300) / 1.6), 0, 255).astype(np.uint8), 'L').convert('RGB').save('layers/dsm.webp', lossless=True, method=6)
for root, _, files in os.walk('layers'):
    for f in sorted(files): print(os.path.join(root, f), os.path.getsize(os.path.join(root, f)) // 1024, 'KB')
