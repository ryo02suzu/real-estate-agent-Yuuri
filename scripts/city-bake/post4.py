# 航空障害灯（航空法の決まり）と東京タワーの灯。画面の座標（0〜1）で
#  60m 以上の建物の屋上の両端に赤い灯。90m 以上は明滅（中光度赤色、毎分 20〜60 回）、150m 以上は昼は白い閃光（中光度白色）で夜は赤の明滅。
#  105m を超える建物は中間の高さ（52.5m 以下の等間隔）にも不動の赤い灯。同じ建物の灯は同期し、建物どうしは位相がずれる
#  種類：0 不動の赤、1 赤の明滅、2 東京タワーの頂（昼は白い閃光・夜は赤の明滅）、3 東京タワーの展望台（不動の赤）、4 150m 以上（昼は白い閃光・夜は赤の明滅）
import os, numpy as np, json, math, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import CAM
c = np.load('bake/core.npz'); typ = c['typ'].astype(np.int32); gid = c['gid'].astype(np.int64); dist = c['dist']; wz = c['wz']
H2, W2 = typ.shape
B = json.load(open('buildings.json'))
Hh = np.array([(b[1] if b and b[1] else 0) for b in B], np.float32)
isb = ((typ == 1) | (typ == 2)) & (gid > 0)
g = np.where(isb, gid, 0)
tall = np.where(Hh >= 60)[0]
order = np.argsort(g.ravel())
gs = g.ravel()[order]
lights = []
rng = np.random.default_rng(7)
for b in tall:
    lo, hi = np.searchsorted(gs, b), np.searchsorted(gs, b, 'right')
    if hi - lo < 6: continue
    pix = order[lo:hi]
    zz = wz.ravel()[pix]
    top = zz.max()
    roof = pix[zz >= top - 2.5]
    ys, xs = np.divmod(roof, W2)
    d = float(np.median(dist.ravel()[roof]))
    pts = [(xs.min(), ys[np.argmin(xs)]), (xs.max(), ys[np.argmax(xs)])] if xs.max() - xs.min() >= 5 else [(int(np.median(xs)), ys.min())]
    Hb = float(Hh[b])
    kind = 4 if Hb >= 150 else (1 if Hb >= 90 else 0)
    ph = float(rng.random()); per = float(rng.uniform(1.4, 2.6))
    for x, y in pts:
        lights.append([round((x + 0.5) / W2, 5), round((y - 1.5) / H2, 5), round(d), kind, round(ph, 3), round(per, 2)])
    # 中間の高さの灯（105m を超える建物。52.5m 以下の等間隔。その高さの輪郭の両端）
    if Hb > 105:
        n = int(math.ceil(Hb / 52.5)) - 1
        for i in range(1, n + 1):
            zk = top - i * Hb / (n + 1)
            lv = pix[np.abs(zz - zk) < 2.0]
            if len(lv) < 3: continue
            ys2, xs2 = np.divmod(lv, W2)
            pts2 = [(xs2.min(), ys2[np.argmin(xs2)]), (xs2.max(), ys2[np.argmax(xs2)])] if xs2.max() - xs2.min() >= 5 else [(int(np.median(xs2)), int(np.median(ys2)))]
            for x, y in pts2:
                lights.append([round((x + 0.5) / W2, 5), round(y / H2, 5), round(d), 0, round(ph, 3), round(per, 2)])
# 東京タワー：アンテナの先と展望台の角（ENU → 画面）
h, p = math.radians(CAM['heading']), math.radians(CAM['pitch'])
f = np.array([math.sin(h) * math.cos(p), math.cos(h) * math.cos(p), math.sin(p)])
r = np.cross(f, [0, 0, 1]); r /= np.linalg.norm(r); u = np.cross(r, f)
tx = math.tan(math.radians(CAM['hfov'] / 2)); ty = tx / CAM['aspect']
def proj(P):
    P = np.array(P); z = P @ f
    return (0.5 + (P @ r) / z / tx / 2, 0.5 - (P @ u) / z / ty / 2, float(np.linalg.norm(P)))
for L in json.load(open('tower-lights.json')):
    x, y, d = proj(L['p'])
    lights.append([round(x, 5), round(y, 5), round(d), 2 if L['kind'] == 'top' else 3, round(float(rng.random()), 3), 2.0])
json.dump(lights, open('layers/lights.json', 'w'))
print('aviation lights', len(lights), 'tall buildings', len(tall))
meta = {'cam': CAM, 'size': [W2 // 2, H2 // 2], 'dsm': json.load(open('mosaics.json'))['near'], 'dsmN': 2048, 'dsmZ': [-300, 1.6],
        'distLog': [100, 2000], 'types': {'building_tex': 1, 'building': 2, 'ground': 3, 'tower': 4, 'tree': 5, 'terrain': 6}}
json.dump(meta, open('layers/meta.json', 'w'))
print(meta)
