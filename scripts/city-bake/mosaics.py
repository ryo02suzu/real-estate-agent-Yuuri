# 上から見た格子（カメラの ENU、x=東 y=北）に、空中写真と道路中心線を描く
#  near: 9km 四方を 2.2m、far: 24km 四方を 6m
import os, math, os, sys, json, io, urllib.request, concurrent.futures as cf
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import CAM, ecef, enu_basis, cam_frame, GEOID
from ground import get
o, R = cam_frame()
A = 6378137.0; F = 1 / 298.257222101; E2 = F * (2 - F)
def enu_to_ll(x, y, z=GEOID):
    p = o + np.array([x, y, z - CAM['h']]) @ R  # ENU → ECEF（カメラの高さを戻す）
    lon = math.atan2(p[1], p[0]); r = math.hypot(p[0], p[1]); lat = math.atan2(p[2], r * (1 - E2))
    for _ in range(5):
        n = A / math.sqrt(1 - E2 * math.sin(lat) ** 2); lat = math.atan2(p[2] + E2 * n * math.sin(lat), r)
    return math.degrees(lat), math.degrees(lon)
GRIDS = {'near': dict(cx=-3200, cy=-1420, half=4500, n=4096, z=16), 'far': dict(cx=-11000, cy=-4900, half=12000, n=4000, z=14)}
def grid_ll(g):
    # 角の 4 点を正確に、間は双一次で（滑らかなので十分）
    xs = [g['cx'] - g['half'], g['cx'] + g['half']]; ys = [g['cy'] + g['half'], g['cy'] - g['half']]  # 画像の上が北
    c = {(i, j): enu_to_ll(xs[i], ys[j]) for i in (0, 1) for j in (0, 1)}
    u = np.linspace(0, 1, g['n'])[None, :]; v = np.linspace(0, 1, g['n'])[:, None]
    lat = c[(0, 0)][0] * (1 - u) * (1 - v) + c[(1, 0)][0] * u * (1 - v) + c[(0, 1)][0] * (1 - u) * v + c[(1, 1)][0] * u * v
    lon = c[(0, 0)][1] * (1 - u) * (1 - v) + c[(1, 0)][1] * u * (1 - v) + c[(0, 1)][1] * (1 - u) * v + c[(1, 1)][1] * u * v
    return lat, lon
def tile_xy(lat, lon, z):
    n = 2 ** z
    fx = (lon + 180) / 360 * n; fy = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n
    return fx, fy
def photo_mosaic(name, g):
    lat, lon = grid_ll(g); z = g['z']
    fx, fy = tile_xy(lat, lon, z)
    tx, ty = np.floor(fx).astype(int), np.floor(fy).astype(int)
    keys = sorted(set(zip(tx.ravel()[::97], ty.ravel()[::97])) | set(zip(tx[::64, ::64].ravel(), ty[::64, ::64].ravel())))
    # 端の取りこぼしを防ぐため、範囲の全タイル
    keys = [(x, y) for x in range(tx.min(), tx.max() + 1) for y in range(ty.min(), ty.max() + 1)]
    def fetch(k):
        x, y = k
        b = get(f'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', f'gsi/photo_{z}_{x}_{y}.jpg')
        return k, (np.asarray(Image.open(io.BytesIO(b)).convert('RGB')) if b else None)
    tiles = {}
    with cf.ThreadPoolExecutor(12) as ex:
        for k, a in ex.map(fetch, keys): tiles[k] = a
    out = np.zeros((g['n'], g['n'], 3), np.uint8)
    px = np.clip(((fx - tx) * 256).astype(int), 0, 255); py = np.clip(((fy - ty) * 256).astype(int), 0, 255)
    for (x, y), a in tiles.items():
        if a is None: continue
        m = (tx == x) & (ty == y)
        out[m] = a[py[m], px[m]]
    Image.fromarray(out).save(f'mosaic-{name}.png')
    print(name, 'photo tiles', len(keys))
    return lat, lon
CLS = {'高速自動車国道等': 3, '国道': 2, '都道府県道': 2, '市区町村道等': 1}
WID = {'19.5m以上': 24, '13m-19.5m未満': 16, '5.5m-13m未満': 9, '3m-5.5m未満': 5, '3m未満': 3}
def roads(name, g, lat, lon):
    z = 16
    fx, fy = tile_xy(lat, lon, z)
    keys = [(x, y) for x in range(int(fx.min()), int(fx.max()) + 1) for y in range(int(fy.min()), int(fy.max()) + 1)]
    os.makedirs('rdcl', exist_ok=True)
    def fetch(k):
        x, y = k
        b = get(f'https://cyberjapandata.gsi.go.jp/xyz/experimental_rdcl/{z}/{x}/{y}.geojson', f'rdcl/{z}_{x}_{y}.geojson')
        return json.loads(b) if b else None
    feats = []
    with cf.ThreadPoolExecutor(16) as ex:
        for d in ex.map(fetch, keys):
            if d: feats += d['features']
    # 緯度経度 → 格子の画素（角の対応から双一次の逆：小さい範囲なので線形で近似）
    lat0, lon0 = lat[0, 0], lon[0, 0]; lat1, lon1 = lat[-1, -1], lon[-1, -1]
    n = g['n']; m_per_px = 2 * g['half'] / n
    def topx(ll):
        return [((lo - lon0) / (lon1 - lon0) * (n - 1), (la - lat0) / (lat1 - lat0) * (n - 1)) for lo, la in ll]
    cls = Image.new('L', (n, n), 0); dirm = Image.new('L', (n, n), 0)
    dc, dd = ImageDraw.Draw(cls), ImageDraw.Draw(dirm)
    feats.sort(key=lambda f: CLS.get(f['properties'].get('rdCtg'), 1))
    for f in feats:
        p = f['properties']
        if p.get('type') == '庭園路': continue
        c = CLS.get(p.get('rdCtg'), 1)
        if p.get('motorway') == 1: c = 3
        wm = WID.get(p.get('rnkWidth'), 6)
        wpx = max(1, int(round(wm / m_per_px)))
        pts = topx(f['geometry']['coordinates'])
        if len(pts) < 2: continue
        lv = 1 if (p.get('lvOrder') or 0) > 0 else 0
        dc.line(pts, fill=c * 64 + lv * 32 + min(31, int(wm)), width=wpx)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            ang = (math.degrees(math.atan2(-(y1 - y0), x1 - x0)) % 180)
            dd.line([(x0, y0), (x1, y1)], fill=int(ang / 180 * 255), width=wpx)
    cls.save(f'roads-{name}.png'); dirm.save(f'roaddir-{name}.png')
    print(name, 'road features', len(feats))
if __name__ == '__main__':
    meta = {}
    for name, g in GRIDS.items():
        lat, lon = photo_mosaic(name, g)
        roads(name, g, lat, lon)
        meta[name] = g
    json.dump(meta, open('mosaics.json', 'w'))
