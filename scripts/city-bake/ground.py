# 地面と山：地理院タイル（シームレス空中写真・標高）を、距離に応じた細かさの四分木で集め、メッシュにする
# 出力：ground/<z>_<x>_<y>.bin（float32 の位置 xyz と uv、uint32 の三角形）と画像、ground.json（一覧）
import os, math, os, sys, json, io, struct, urllib.request, concurrent.futures as cf
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import CAM, ecef, to_enu, GEOID, enu_basis
CACHE = 'gsi'
os.makedirs(CACHE, exist_ok=True); os.makedirs('ground', exist_ok=True)
def tile_bounds(z, x, y):
    n = 2 ** z
    lon0 = x / n * 360 - 180; lon1 = (x + 1) / n * 360 - 180
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat0, lat1, lon0, lon1
def latlon_of(z, fx, fy):
    n = 2 ** z
    lon = fx / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * fy / n))))
    return lat, lon
def get(url, path):
    if os.path.exists(path): return open(path, 'rb').read() if os.path.getsize(path) > 0 else None
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                b = r.read(); open(path, 'wb').write(b); return b
        except urllib.error.HTTPError as e:
            if e.code == 404: open(path, 'wb').close(); return None
        except Exception:
            pass
    return None
o, R = None, None
TEX_PX = 9.2e-4 * 1.5  # 画面の 1 画素 ≒ 0.0526°。テクスチャの 1 画素がこれより小さくなるまで細かくする
def stats(z, x, y):
    lat0, lat1, lon0, lon1 = tile_bounds(z, x, y)
    pts = []
    for la in np.linspace(lat0, lat1, 5):
        for lo in np.linspace(lon0, lon1, 5):
            v = to_enu(ecef(la, lo, GEOID + 20)); pts.append(v)
    pts = np.array(pts)
    d = np.hypot(pts[:, 0], pts[:, 1])
    az = (np.degrees(np.arctan2(pts[:, 0], pts[:, 1])) % 360)
    da = (az - CAM['heading'] + 540) % 360 - 180
    hv = CAM['hfov'] / 2 + 8
    # タイルの中にカメラの真下が入るときも
    inside = lat0 <= CAM['lat'] <= lat1 and lon0 <= CAM['lon'] <= lon1
    # 角度の範囲が視界と重なるか（タイルが大きいときは範囲で）
    lo_a, hi_a = da.min(), da.max()
    overl = inside or (hi_a >= -hv and lo_a <= hv and (hi_a - lo_a) < 300)
    return d.min(), d.max(), overl
def refine(z, x, y, out, zmax=17, dmax=135000, dmin_show=300):
    dn, dx, ov = stats(z, x, y)
    if not ov or dn > dmax: return
    texel = 127200 / 2 ** z  # m / px（北緯 35.7°）
    if z < zmax and texel > TEX_PX * max(dn, 1):
        for cx in (0, 1):
            for cy in (0, 1): refine(z + 1, 2 * x + cx, 2 * y + cy, out, zmax, dmax)
    else:
        if dx < dmin_show: return
        out.append((z, x, y, dn))
def deg2tile(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n); y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y
def dem_tile(z, x, y):
    # 5m（z15）→ 10m（z14 まで）。標高 = (R*65536+G*256+B)*0.01、無効は (128,0,0)
    if z >= 15:
        b = get(f'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/15/{x}/{y}.png', f'{CACHE}/dem5a_15_{x}_{y}.png')
        if b: return 15, b
        return None
    b = get(f'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png', f'{CACHE}/dem_{z}_{x}_{y}.png')
    return (z, b) if b else None
def decode_dem(b):
    a = np.asarray(Image.open(io.BytesIO(b)).convert('RGB'), dtype=np.int64)
    v = a[..., 0] * 65536 + a[..., 1] * 256 + a[..., 2]
    v = np.where(v >= 2 ** 23, v - 2 ** 24, v).astype(np.float64) * 0.01
    v[(a[..., 0] == 128) & (a[..., 1] == 0) & (a[..., 2] == 0)] = np.nan
    return v
DEMS = {}
def height_at(lat, lon, zdem):
    # zdem の DEM（無ければ粗いもの）で双一次補間。海は 0
    for zz in ([15, 14] if zdem >= 15 else []) + list(range(min(zdem, 14), 7, -1)):
        n = 2 ** zz
        fx = (lon + 180) / 360 * n; fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
        tx, ty = int(fx), int(fy)
        key = (zz, tx, ty)
        if key not in DEMS:
            r = dem_tile(zz, tx, ty) if zz >= 15 else (lambda b: (zz, b) if b else None)(get(f'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{zz}/{tx}/{ty}.png', f'{CACHE}/dem_{zz}_{tx}_{ty}.png'))
            DEMS[key] = decode_dem(r[1]) if r else None
        g = DEMS[key]
        if g is None: continue
        px = (fx - tx) * 256 - 0.5; py = (fy - ty) * 256 - 0.5
        x0 = int(np.clip(math.floor(px), 0, 254)); y0 = int(np.clip(math.floor(py), 0, 254))
        ax = np.clip(px - x0, 0, 1); ay = np.clip(py - y0, 0, 1)
        q = g[y0:y0 + 2, x0:x0 + 2]
        if np.isnan(q).all(): continue
        q = np.where(np.isnan(q), np.nanmean(q), q)
        return float(q[0, 0] * (1 - ax) * (1 - ay) + q[0, 1] * ax * (1 - ay) + q[1, 0] * (1 - ax) * ay + q[1, 1] * ax * ay)
    return 0.0
def build(z, x, y, dn):
    img = get(f'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', f'{CACHE}/photo_{z}_{x}_{y}.jpg')
    if not img: return None
    n = 16 if z >= 14 else (32 if z >= 12 else 64)
    zdem = 15 if z >= 15 else min(z + 2, 14)
    o_, R_ = None, None
    pos, uv = [], []
    for j in range(n + 1):
        for i in range(n + 1):
            lat, lon = latlon_of(z, x + i / n, y + j / n)
            h = height_at(lat, lon, zdem)
            v = to_enu(ecef(lat, lon, h + GEOID)); pos.append(v); uv.append((i / n, 1 - j / n))
    idx = []
    for j in range(n):
        for i in range(n):
            a = j * (n + 1) + i; b = a + 1; c = a + n + 1; d = c + 1
            idx += [a, c, b, b, c, d]
    # 継ぎ目を隠すすそ（下に垂らす）
    drop = 15 if z >= 15 else (60 if z >= 13 else 400)
    edge = [j * (n + 1) + i for j, i in [(0, i) for i in range(n + 1)]] , [j * (n + 1) + n for j in range(n + 1)], [n * (n + 1) + i for i in range(n, -1, -1)], [j * (n + 1) for j in range(n, -1, -1)]
    for e in edge:
        base = len(pos)
        for k in e:
            p = np.array(pos[k]); up = p / max(np.linalg.norm(p), 1)
            pos.append((p[0], p[1], p[2] - drop)); uv.append(uv[k])
        for t in range(len(e) - 1):
            a, b = e[t], e[t + 1]; c, d = base + t, base + t + 1
            idx += [a, b, c, b, d, c]
    P = np.array(pos, dtype=np.float32); U = np.array(uv, dtype=np.float32); I = np.array(idx, dtype=np.uint32)
    name = f'{z}_{x}_{y}'
    with open(f'ground/{name}.bin', 'wb') as fh:
        fh.write(struct.pack('<III', len(P), len(I), 0)); fh.write(P.tobytes()); fh.write(U.tobytes()); fh.write(I.tobytes())
    return {'name': name, 'z': z, 'img': f'gsi/photo_{z}_{x}_{y}.jpg', 'dist': dn}
if __name__ == '__main__':
    tiles = []
    for x in range(2 ** 8):
        pass
    # 起点：z8 で視界のまわりのタイル
    cx, cy = deg2tile(CAM['lat'], CAM['lon'], 8)
    for x in range(cx - 2, cx + 2):
        for y in range(cy - 2, cy + 3):
            refine(8, x, y, tiles)
    print('leaf tiles', len(tiles), 'by z', {z: sum(1 for t in tiles if t[0] == z) for z in sorted({t[0] for t in tiles})}, flush=True)
    res = []
    with cf.ThreadPoolExecutor(12) as ex:
        for r in ex.map(lambda t: build(*t), tiles):
            if r: res.append(r)
    json.dump(res, open('ground.json', 'w'))
    print('built', len(res))
