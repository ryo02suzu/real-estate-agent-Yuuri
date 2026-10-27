# 東京タワーの層：塔だけを高い倍率で描いた焼き込み（tw_*）を、3 倍と 2 倍の端末の画素に縮める
#  twa.webp：色（RGB、sRGB に近い値）と被覆（A。透けた格子の割合）。描くときはなめらかに補間する
#  twd.webp：データ（補間しない）。上半分は見えている面の向きの割合（R 塔の x 軸・G 塔の y 軸・B 上下。合計 1）。格子は細い部材の
#            集まりなので、1 画素の中の面の向きを割合で持ち、描くときに向きごとに日と空の光を足す。
#            下半分は R 部位×32＋段（ダイヤモンドヴェールの 17 段）、G ランドマークライトの当たり、B 展望台のガラスの割合
import os, json, math, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_bake import load
REG = json.load(open('tower-region.json'))   # {'pt': [x, y, w, h]（画面 393×275 の座標）, 'ss': 1pt あたりの画素}
AX = json.load(open('tower-axes.json'))
ax, ay = np.array(AX['ax']), np.array(AX['ay'])
alb = load('tw_albedo'); nrm = load('tw_normal'); att = load('tw_attr'); geo = load('tw_geo', np.float32)
H, W = alb.shape[:2]
cov = alb[..., 3] > 127
n = nrm[..., :3].astype(np.float32) / 255 * 2 - 1
n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
wx, wy, wz = (n @ ax) ** 2, (n @ ay) ** 2, n[..., 2] ** 2
s = np.maximum(wx + wy + wz, 1e-6); wx, wy, wz = wx / s, wy / s, wz / s
lin = (alb[..., :3].astype(np.float32) / 255) ** 2.2
part = att[..., 0].astype(np.int32) - 1; em = att[..., 1].astype(np.float32) / 255; tier = att[..., 2].astype(np.int32)
part[~cov] = -1
dist = geo[..., 0]
dmean = float(dist[cov].mean())
os.makedirs('layers', exist_ok=True)
def pack(k, tag):
    h, w = H // k, W // k
    def blk(a): return a[:h * k, :w * k].reshape(h, k, w, k, *a.shape[2:]).swapaxes(1, 2).reshape(h, w, k * k, *a.shape[2:])
    # 縮小はカメラと同じ形（ガウス＋画素の箱）。塔は細くて明暗の差が大きいので、カメラの輪郭強調の分を見込んで街（0.55 画素）より
    # 小さい標準偏差 0.35 画素（0.55 だと幅 11 画素の塔の半分近くが半透明の縁になり、向こうの街が透けて見える）
    SIG = k * math.sqrt(0.35 ** 2 - 1 / 12)
    def smooth(a):
        a = a.astype(np.float32)
        if a.ndim == 3: return np.stack([ndimage.gaussian_filter(a[..., i], SIG, mode='nearest') for i in range(a.shape[2])], -1)
        return ndimage.gaussian_filter(a, SIG, mode='nearest')
    c0 = cov.astype(np.float32); c = blk(c0); cm = blk(smooth(c0)).mean(2); m = np.maximum(c.sum(2), 1e-6)
    def cmean(a):
        b = blk(smooth(a.astype(np.float32) * (c0[..., None] if a.ndim == 3 else c0))).mean(2)
        return b / np.maximum(cm[..., None] if b.ndim == 3 else cm, 1e-6)
    al = cmean(lin) ** (1 / 2.2)
    cls = np.stack([cmean(wx), cmean(wy), cmean(wz)], -1)
    pb = blk(part)
    frac = lambda ids: np.isin(pb, ids).sum(2) / m
    fg, fct, fa, fc = frac([1, 2]), frac([5, 6]), frac([3]), frac([4])
    mode12 = np.where(frac([2]) > frac([1]), 2, 1); mode56 = np.where(frac([6]) > frac([5]), 6, 5)
    pt = np.where(fg >= 0.3, mode12, np.where(fct >= 0.3, mode56, np.where(fa >= 0.4, 3, np.where(fc >= 0.5, 4, 0))))
    tb = blk(tier); tmode = np.where(c > 0, tb, 0).max(2)
    u8 = lambda x: np.clip(np.rint(x), 0, 255).astype(np.uint8)
    twa = np.dstack([u8(al * 255), u8(cm * 255)])
    twn = np.dstack([u8(cls * 255), np.full((h, w), 255, np.uint8)])
    twe = np.dstack([u8(pt * 32 + np.minimum(tmode, 16)), u8(cmean(em) * 255), u8(fg * 255), np.full((h, w), 255, np.uint8)])
    os.makedirs(f'layers/{tag}', exist_ok=True)
    Image.fromarray(twa, 'RGBA').save(f'layers/{tag}/twa.webp', lossless=True, method=6)
    Image.fromarray(np.concatenate([twn, twe], 0), 'RGBA').save(f'layers/{tag}/twd.webp', lossless=True, method=6)
    print(tag, 'tower layer', (w, h), 'covered px', int((cm > 0.01).sum()), 'mean coverage of covered', round(float(cm[cm > 0.01].mean()), 3))
ss = REG['ss']
pack(ss // 3, '3x'); pack(ss // 2, '2x')
json.dump({'pt': REG['pt'], 'dist': round(dmean, 1), 'ax': AX['ax'], 'ay': AX['ay']}, open('layers/tower.json', 'w'))
print('tower mean distance', round(dmean, 1))
