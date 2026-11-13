# 焼き込み（2 倍）→ 画素ごとの世界座標・種類・建物番号、質感の無い建物の色を補う
import os, numpy as np, json, math, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_bake import load
from geo import CAM
alb = load('albedo').astype(np.float32) / 255; nrm = load('normal'); geo = load('geo', np.float32)
H2, W2 = alb.shape[:2]
typ = nrm[..., 3].astype(np.int32)
N = nrm[..., :3].astype(np.float32) / 255 * 2 - 1
N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-6)
dist = geo[..., 0]; gid = np.rint(geo[..., 1]).astype(np.int64); wz = geo[..., 2]; wallU = geo[..., 3]
# 外装を作り直す高層ビル（facades.json）は質感の無い建物として扱う（post2 で階ごとの外装を描く）
FAC = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'facades.json')))
for gs in FAC:
    if gs.isdigit(): typ[gid == int(gs)] = 2
# 視線の向き → 世界座標
h, p = math.radians(CAM['heading']), math.radians(CAM['pitch'])
f = np.array([math.sin(h) * math.cos(p), math.cos(h) * math.cos(p), math.sin(p)])
r = np.cross(f, [0, 0, 1]); r /= np.linalg.norm(r); u = np.cross(r, f)
tx = math.tan(math.radians(CAM['hfov'] / 2)); ty = tx / CAM['aspect']
jj, ii = np.meshgrid(np.arange(W2), np.arange(H2))
sx = (2 * (jj + 0.5) / W2 - 1) * tx; sy = (1 - 2 * (ii + 0.5) / H2) * ty
D = f[None, None] + r[None, None] * sx[..., None] + u[None, None] * sy[..., None]
D /= np.linalg.norm(D, axis=-1, keepdims=True)
WP = D * dist[..., None]
np.save('bake/dirs.npy', D.astype(np.float32))
# 建物の表：gid → [用途, 高さ, 階数, lon, lat, lod2]
B = json.load(open('buildings.json'))
nb = len(B)
H_ = np.array([(b[1] if b and b[1] else 0) for b in B], np.float32)
ST = np.array([(b[2] if b and b[2] else 0) for b in B], np.float32)
US = np.array([(b[0] if b else 0) for b in B], np.int32)
# 建物ごとの足元の高さ（その建物の画素の最低 z）。画面で見えている範囲での近似
gb = np.where((typ == 1) | (typ == 2), gid, 0)
base = np.full(nb, np.inf, np.float32)
np.minimum.at(base, gb[gb > 0], wz[gb > 0])
# 屋根の上端（見えている最高 z）
top = np.full(nb, -np.inf, np.float32); np.maximum.at(top, gb[gb > 0], wz[gb > 0])
# 見えている下端が地面より上のこともあるので、高さの属性から足元を推定：top - H
est = np.where(np.isfinite(top) & (H_ > 0), top - H_, base)
base = np.where(np.isfinite(base), np.minimum(base, est), est)
hab = np.where(gb > 0, wz - base[gb], 0)
np.save('bake/hab.npy', hab.astype(np.float32))
np.savez_compressed('bake/core.npz', typ=typ.astype(np.uint8), gid=gid.astype(np.int32), dist=dist, wz=wz, wallU=wallU)
np.save('bake/N.npy', N.astype(np.float32))
np.save('bake/base.npy', base)
print('size', W2, H2, 'buildings visible', int((np.isfinite(top)).sum()))
