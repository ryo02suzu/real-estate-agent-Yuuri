#!/usr/bin/env python3
"""MICHILU 第4版オープニング「地球」の材料を集める（python3 + numpy + Pillow だけで動く）。

使い方:  python3 globe_fetch.py --data work/globe            全部そろえる（取ったものは raw/ に残し、二度は取らない）
         python3 globe_fetch.py --data work/globe --scan      雲の日付えらび用の小さな絵だけ取って表にする
出所と条件は notes/globe.md。取り方: 1 つの相手に毎秒 4 回まで・名乗りは汎用。
"""
from __future__ import annotations
import argparse, json, math, os, sys, time, urllib.request, urllib.error, io
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
UA = "opening-render-fetch/1.0 (generic python client)"
GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
GSI = "https://cyberjapandata.gsi.go.jp/xyz"
CLOUD_DATE = "2025-11-07"          # 雲の日（--scan で選んだ。中部が晴れ、日本海・太平洋に雲。2026-11-03 以降は取れなかった）
CLOUD_LAYER = "VIIRS_SNPP_CorrectedReflectance_TrueColor"
STEP = 0.006                        # 広域の格子（度/画素）
REG = (120.0, 24.0, 152.0, 52.0)    # 広域 lon0, lat0, lon1, lat1
PATCH = (135.5, 34.0, 140.5, 38.5)  # 中部の細かい区画
PSTEP = 0.0014
SUN_AZ = 115.0

_last: dict[str, float] = {}

def get(url: str, cache: str, tries: int = 3) -> bytes | None:
    """取得（キャッシュ付き。404 は None を覚える）。"""
    if os.path.exists(cache):
        b = open(cache, "rb").read()
        return b if b else None
    host = url.split("/")[2]
    for k in range(tries):
        dt = time.time() - _last.get(host, 0)
        if dt < 0.27:
            time.sleep(0.27 - dt)
        _last[host] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                b = r.read()
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            open(cache, "wb").write(b)
            return b
        except urllib.error.HTTPError as e:
            if e.code in (404, 403):
                os.makedirs(os.path.dirname(cache), exist_ok=True)
                open(cache, "wb").write(b"")
                return None
            time.sleep(2 + 3 * k)
        except Exception:
            time.sleep(2 + 3 * k)
    raise RuntimeError("取得できない: " + url[:100])

def wms(raw, layer, bbox, w, h, date=None, fmt="image/jpeg", tag=""):
    x0, y0, x1, y1 = bbox
    u = (f"{GIBS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS={layer}&STYLES=&SRS=EPSG:4326"
         f"&BBOX={x0},{y0},{x1},{y1}&WIDTH={w}&HEIGHT={h}&FORMAT={fmt}&TRANSPARENT=FALSE")
    if date:
        u += f"&TIME={date}"
    ext = "jpg" if "jpeg" in fmt else "png"
    b = get(u, f"{raw}/wms_{layer}_{date}_{tag}_{w}x{h}.{ext}")
    if b is None:
        raise RuntimeError("WMS 空: " + layer)
    return np.asarray(Image.open(io.BytesIO(b)).convert("RGB"))

# ---------- 国土地理院タイル（ウェブメルカトル）→ 緯度経度の格子 ----------
def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def mosaic(raw, kind, ext, z, bbox, decode):
    """bbox を含むタイルを集めて 1 枚（メルカトルのまま）にする。返り値: (配列, x0タイル, y0タイル)"""
    x0, ya = tile_xy(bbox[0], bbox[3], z)
    x1, yb = tile_xy(bbox[2], bbox[1], z)
    tx0, tx1, ty0, ty1 = int(x0), int(x1), int(ya), int(yb)
    ch = 3
    out = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256, ch), np.uint8)
    have = np.zeros((ty1 - ty0 + 1, tx1 - tx0 + 1), bool)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            b = get(f"{GSI}/{kind}/{z}/{tx}/{ty}.{ext}", f"{raw}/{kind}/{z}/{tx}_{ty}.{ext}")
            if b is None:
                continue
            im = np.asarray(Image.open(io.BytesIO(b)).convert("RGB"))
            out[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = im
            have[ty - ty0, tx - tx0] = True
    return out, tx0, ty0, have

def to_latlon(mos, tx0, ty0, z, bbox, step, order=1):
    """メルカトルの大きな絵 → 緯度経度（度/画素 step）。経度は線形、緯度は行ごとの補間。float32 で返す。"""
    lon0, lat0, lon1, lat1 = bbox
    W = int(round((lon1 - lon0) / step)); H = int(round((lat1 - lat0) / step))
    n = 2 ** z
    lons = lon0 + (np.arange(W) + 0.5) * step
    px = ((lons + 180) / 360 * n - tx0) * 256 - 0.5
    lats = lat1 - (np.arange(H) + 0.5) * step
    py = ((1 - np.arcsinh(np.tan(np.radians(lats))) / math.pi) / 2 * n - ty0) * 256 - 0.5
    mh, mw = mos.shape[:2]
    px = np.clip(px, 0, mw - 1); py = np.clip(py, 0, mh - 1)
    xi = np.minimum(px.astype(int), mw - 2); fx = (px - xi).astype(np.float32)
    out = np.zeros((H, W) + mos.shape[2:], np.float32)
    for r0 in range(0, H, 256):
        r1 = min(H, r0 + 256)
        yi = np.minimum(py[r0:r1].astype(int), mh - 2); fy = (py[r0:r1] - yi).astype(np.float32)
        a = mos[yi][:, xi].astype(np.float32); b = mos[yi][:, xi + 1].astype(np.float32)
        c = mos[yi + 1][:, xi].astype(np.float32); d = mos[yi + 1][:, xi + 1].astype(np.float32)
        fxx = fx[None, :]; fyy = fy[:, None]
        if mos.ndim == 3:
            fxx = fxx[..., None]; fyy = fyy[..., None]
        out[r0:r1] = (a * (1 - fxx) + b * fxx) * (1 - fyy) + (c * (1 - fxx) + d * fxx) * fyy
    return out

def dem_decode(rgb):
    v = (rgb[..., 0].astype(np.int64) << 16) + (rgb[..., 1].astype(np.int64) << 8) + rgb[..., 2]
    h = np.where(v < 2 ** 23, v * 0.01, (v - 2 ** 24) * 0.01).astype(np.float32)
    na = (v == 2 ** 23)
    return h, na

def dem_grid(raw, z, bbox, step):
    """標高（m）と「海または範囲外」の印。海は 0 m。"""
    mos, tx0, ty0, have = mosaic(raw, "dem_png", "png", z, bbox, None)
    h, na = dem_decode(mos)
    h[na] = 0.0
    valid = (~na) & np.kron(have, np.ones((256, 256), bool))
    hg = to_latlon(h, tx0, ty0, z, bbox, step)
    vg = to_latlon(valid.astype(np.float32), tx0, ty0, z, bbox, step)
    return hg, vg

# ---------- 地形から作る物 ----------
def km_per_px(bbox, step, H):
    lats = bbox[3] - (np.arange(H) + 0.5) * step
    dy = 111.32 * step
    dx = 111.32 * step * np.cos(np.radians(lats))
    return dx.astype(np.float32), dy

def slopes(hg, bbox, step):
    H = hg.shape[0]
    dx, dy = km_per_px(bbox, step, H)
    gx = (np.roll(hg, -1, 1) - np.roll(hg, 1, 1)) / (2 * dx[:, None] * 1000)
    gy = (np.roll(hg, 1, 0) - np.roll(hg, -1, 0)) / (2 * dy * 1000)   # 北向きが正
    return gx.astype(np.float32), gy.astype(np.float32)

def horizon(hg, bbox, step, az=SUN_AZ, dmax=160.0):
    """太陽の方位へ向かって見た、地平線の高さ角（度）。地球の丸みの落ち込みを引く。"""
    H, W = hg.shape
    dx, dy = km_per_px(bbox, step, H)
    sx, sy = math.sin(math.radians(az)), math.cos(math.radians(az))   # 東・北の向き
    rows = np.arange(H)[:, None]; cols = np.arange(W)[None, :]
    best = np.full((H, W), -90.0, np.float32)
    d = 0.6
    while d < dmax:
        ox = (d * sx / dx)[:, None]            # 列方向の移動（画素）
        oy = -d * sy / dy                       # 行方向（北が上）
        cc = np.clip(np.rint(cols + ox).astype(int), 0, W - 1)
        rr = np.clip(np.rint(rows + oy).astype(int), 0, H - 1)
        drop = d * d / (2 * 6371.0)
        ang = np.degrees(np.arctan2(hg[rr, cc] / 1000.0 - hg / 1000.0 - drop, d))
        np.maximum(best, ang, out=best)
        d *= 1.12
    return np.clip(best, 0, 25.5)

def snow(hg, lat):
    """11 月上旬の雪線（目安）: 中部 2,600 m、北へ行くほど低い。"""
    line = np.maximum(2600.0 - 330.0 * np.clip(lat - 36.0, -6, 12), 1250.0)
    return np.clip((hg - line) / 350.0, 0, 1)

def save_gray(a, path):
    Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), "L").save(path, optimize=False)

def smooth_mask(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def blur_box(a, k):
    """軽いぼかし（箱を 3 回）。k は半径の画素。"""
    from numpy.lib.stride_tricks import sliding_window_view as sw
    out = a.astype(np.float32)
    for _ in range(3):
        for ax in (0, 1):
            c = np.cumsum(np.pad(out, [(k + 1, k) if i == ax else (0, 0) for i in range(out.ndim)], mode="edge"), axis=ax, dtype=np.float64)
            n = 2 * k + 1
            sl = [slice(None)] * out.ndim
            hi = list(sl); lo = list(sl)
            hi[ax] = slice(n, None); lo[ax] = slice(0, -n)
            out = ((c[tuple(hi)] - c[tuple(lo)]) / n).astype(np.float32)
    return out

# ---------- 雲の日えらび ----------
def scan(raw):
    print("日付 / 中部の雲量 / 日本海 / 太平洋 / 取りこぼし(黒)")
    for y in (2026, 2025):
        for d in range(1, 11):
            date = f"{y}-11-{d:02d}"
            im = wms(raw, CLOUD_LAYER, (120, 24, 152, 52), 640, 560, date, tag="scan").astype(np.float32) / 255
            mn = im.min(-1); sat = im.max(-1) - mn
            cl = smooth_mask(mn, 0.55, 0.8) * (1 - smooth_mask(sat, 0.12, 0.3))
            blank = (im.max(-1) < 0.02).mean()
            def box(l0, a0, l1, a1):
                x0 = int((l0 - 120) / 32 * 640); x1 = int((l1 - 120) / 32 * 640)
                y0 = int((52 - a1) / 28 * 560); y1 = int((52 - a0) / 28 * 560)
                return cl[y0:y1, x0:x1].mean()
            print(date, f"{box(136, 35, 139, 38):.2f} {box(130, 38, 136, 44):.2f} {box(140, 28, 148, 36):.2f} {blank:.2f}")


NE_LAND = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson"

def land_mask(raw, bbox, step, ss=2):
    """ナチュラルアース 10m の陸地（パブリックドメイン）を塗って、縁がなめらかな陸の印にする。"""
    b = get(NE_LAND, raw + "/ne_10m_land.geojson")
    gj = json.loads(b)
    lon0, lat0, lon1, lat1 = bbox
    W = int(round((lon1 - lon0) / step)); H = int(round((lat1 - lat0) / step))
    from PIL import ImageDraw
    out = np.zeros((H, W), np.float32)
    band = 1024
    for r0 in range(0, H, band):
        r1 = min(H, r0 + band)
        im = Image.new("L", (W * ss, (r1 - r0) * ss), 0)
        dr = ImageDraw.Draw(im)
        def pts(ring):
            return [((x - lon0) / step * ss, ((lat1 - y) / step - r0) * ss) for x, y in ring]
        for f in gj["features"]:
            g = f["geometry"]
            polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
            for poly in polys:
                xs = [p[0] for p in poly[0]]; ys = [p[1] for p in poly[0]]
                if max(xs) < lon0 or min(xs) > lon1 or max(ys) < lat0 or min(ys) > lat1:
                    continue
                dr.polygon(pts(poly[0]), fill=255)
                for hole in poly[1:]:
                    dr.polygon(pts(hole), fill=0)
        a = np.asarray(im, np.float32) / 255
        out[r0:r1] = a.reshape(r1 - r0, ss, W, ss).mean((1, 3))
    return out

def fill_from(rgb, w, ks=(5, 20, 80)):
    """重み w の所の色で、重みの無い所を埋める（海に陸の色を、陸に海の色を混ぜないため）。"""
    num = None
    res = rgb.copy(); have = (w > 0.5)
    for k in ks:
        wn = blur_box(w.astype(np.float32), k)
        cn = blur_box(rgb * w[..., None], k) / np.maximum(wn, 1e-4)[..., None]
        use = (~have) & (wn > 0.02)
        res[use] = cn[use]; have = have | use
    return res

def cloud_alpha(obs, base, hg=None):
    """雲の濃さ。観測 = 地面 * (1 - a) + 白 * a から a を解く。色のついた物（地面・海）は外す。"""
    o = obs.astype(np.float32) / 255; b = base.astype(np.float32) / 255
    a = np.clip((o - b) / np.maximum(1 - b, 0.15), 0, 1).mean(-1)
    sat = o.max(-1) - o.min(-1)
    a = a * (1 - smooth_mask(sat, 0.10, 0.28)) * smooth_mask(o.min(-1), 0.25, 0.5)
    a = smooth_mask(a, 0.22, 0.85)
    if hg is not None:
        a = a * (1 - smooth_mask(hg, 1800.0, 2400.0))   # 高い山の白は雪（雲にしない）
    a[o.max(-1) < 0.02] = 0          # 観測の無い所
    return a

def lights_glow(v):
    """夜の灯り。点にならないよう、やわらかい光のにじみを足す（半径 2・8・30 画素）。"""
    l = np.clip((v.astype(np.float32) - 52.0) / 203.0, 0, 1) ** 2.2     # 下地の灰色（地形の陰影）を引く
    g = l + 0.5 * blur_box(l, 2) + 0.22 * blur_box(l, 8) + 0.08 * blur_box(l, 30)
    return np.clip(g, 0, 1) ** (1 / 2.2)

def save_rgb(a, path, q=92):
    Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).save(path, quality=q, subsampling=0)

def product_region(tag, raw, out, bbox, step, z, photo_kind, photo_z, with_horizon=True):
    meta = {"bbox": bbox, "step": step}
    lon0, lat0, lon1, lat1 = bbox
    W = int(round((lon1 - lon0) / step)); H = int(round((lat1 - lat0) / step)); meta["size"] = [W, H]
    print(tag, "格子", W, H, flush=True)
    hg, vg = dem_grid(raw, z, bbox, step)
    land = land_mask(raw, bbox, step)
    np.save(f"{out}/{tag}_dem.npy", hg.astype(np.float16))
    # 色: 地理院の写真（陸）+ NASA Blue Marble（海・外国）
    mos, tx0, ty0, have = mosaic(raw, photo_kind, "jpg", photo_z, bbox, None)
    gsi = to_latlon(mos, tx0, ty0, photo_z, bbox, step)
    bm = wms(raw, "BlueMarble_NextGeneration", bbox, W, H, None, tag=tag).astype(np.float32)
    landc = fill_from(gsi, (land > 0.5).astype(np.float32))
    seac = fill_from(bm, (land < 0.5).astype(np.float32))
    lat = (lat1 - (np.arange(H) + 0.5) * step)[:, None]
    sn = snow(hg, lat) * (land > 0.5)
    landc = landc * (1 - 0.92 * sn[..., None]) + np.array([238, 242, 250], np.float32) * 0.92 * sn[..., None]
    rgb = landc * land[..., None] + seac * (1 - land[..., None])
    save_rgb(rgb, f"{out}/{tag}_rgb.jpg")
    save_gray(land, f"{out}/{tag}_land.png")
    # 地形: 斜面（東・北）と太陽の方向の地平線
    gx, gy = slopes(hg, bbox, step)
    rel = np.zeros((H, W, 3), np.float32)
    rel[..., 0] = 127.5 + gx * 180; rel[..., 1] = 127.5 + gy * 180
    rel[..., 2] = horizon(hg, bbox, step) * 10 if with_horizon else 0
    save_rgb(rel, f"{out}/{tag}_relief.png")
    # 灯りと雲
    lt = wms(raw, "VIIRS_Black_Marble", bbox, W, H, None, tag=tag).max(-1)
    save_gray(lights_glow(lt), f"{out}/{tag}_lights.png")
    ob = wms(raw, CLOUD_LAYER, bbox, W, H, CLOUD_DATE, tag=tag)
    save_gray(cloud_alpha(ob, bm, hg), f"{out}/{tag}_cloud.png")
    json.dump(meta, open(f"{out}/{tag}.json", "w"))
    return rgb

def build(data, raw):
    os.makedirs(data, exist_ok=True)
    meta = {"cloud_date": CLOUD_DATE, "cloud_layer": CLOUD_LAYER, "sun_az": SUN_AZ}
    gb = (-180.0, -90.0, 180.0, 90.0)
    if not os.path.exists(data + "/G_cloud.png"):
        bm = wms(raw, "BlueMarble_NextGeneration", gb, 8192, 4096, None, tag="g").astype(np.float32)
        save_rgb(bm, data + "/G_rgb.jpg")
        lt = wms(raw, "VIIRS_Black_Marble", gb, 8192, 4096, None, tag="g").max(-1)
        save_gray(lights_glow(lt), data + "/G_lights.png")
        ob = wms(raw, CLOUD_LAYER, gb, 8192, 4096, CLOUD_DATE, tag="g")
        save_gray(cloud_alpha(ob, bm), data + "/G_cloud.png")
        del bm, lt, ob
    if not os.path.exists(data + "/G_land.png"):
        save_gray(land_mask(raw, gb, 360.0 / 8192), data + "/G_land.png")
    meta["G"] = {"bbox": gb, "size": [8192, 4096]}
    if not os.path.exists(data + "/R.json"):
        product_region("R", raw, data, REG, STEP, 8, "seamlessphoto", 8)
    meta["R"] = json.load(open(data + "/R.json"))
    if not os.path.exists(data + "/C.json"):
        product_region("C", raw, data, PATCH, PSTEP, 10, "seamlessphoto", 10)
    meta["C"] = json.load(open(data + "/C.json"))
    json.dump(meta, open(data + "/meta.json", "w"), indent=1)
    print("できた", data)

# ---------- 手順 2: 山へ降りるための細かい 2 段（M: z12、F: z14） ----------
DETAIL = {
    # 北アルプスを中心に、近づくほど細かい写真と標高（実際の形の面にも使う）
    "M": dict(bbox=(136.9, 35.6, 138.5, 37.25), step=0.0004, z=12, hz=160.0, match_m=700.0),
    "F": dict(bbox=(137.38, 36.0, 137.95, 36.66), step=0.0001, z=14, hz=14.0, match_m=500.0),
}

def horizon_local(hg, bbox, step, dmax, az=SUN_AZ):
    """horizon() と同じ。ただし絵の外へ出た所は数えない（ふちの高さで偽の影を作らない）。"""
    H, W = hg.shape
    dx, dy = km_per_px(bbox, step, H)
    sx, sy = math.sin(math.radians(az)), math.cos(math.radians(az))
    rows = np.arange(H)[:, None]; cols = np.arange(W)[None, :]
    best = np.zeros((H, W), np.float32)
    d = 0.3
    while d < dmax:
        cc = np.rint(cols + (d * sx / dx)[:, None]).astype(np.int32)
        rr = np.rint(rows - d * sy / dy).astype(np.int32)
        ok = (cc >= 0) & (cc < W) & (rr >= 0) & (rr < H)
        cc = np.clip(cc, 0, W - 1); rr = np.clip(rr, 0, H - 1)
        ang = np.degrees(np.arctan2(hg[rr, cc] / 1000.0 - hg / 1000.0 - d * d / (2 * 6371.0), d))
        ang[~ok] = 0
        np.maximum(best, ang, out=best)
        d *= 1.10
    return np.clip(best, 0, 25.5)

def fbm(shape, scales, seed):
    """やわらかい雑音（-1〜1 くらい）。固定の種。scales は画素。"""
    from scipy.ndimage import zoom
    rng = np.random.default_rng(seed)
    H, W = shape
    out = np.zeros(shape, np.float32); amp = 1.0; tot = 0.0
    for sc in scales:
        sc = max(2, int(sc))
        h, w = H // sc + 2, W // sc + 2
        g = rng.standard_normal((h, w)).astype(np.float32)
        z = zoom(g, sc, order=1)[:H, :W]
        out += amp * z; tot += amp; amp *= 0.6
    return out / tot * 2.0

def coarse_sample(data, bbox, W, H, step):
    """C の色の絵を、この区画の格子へ（双一次）。"""
    from scipy.ndimage import map_coordinates
    cm = json.load(open(data + "/C.json"))
    cb = cm["bbox"]; cs = cm["step"]
    img = np.asarray(Image.open(data + "/C_rgb.jpg").convert("RGB"), np.float32)
    lon0, lat0, lon1, lat1 = bbox
    xs = (lon0 + (np.arange(W) + 0.5) * step - cb[0]) / cs - 0.5
    ys = (cb[3] - (lat1 - (np.arange(H) + 0.5) * step)) / cs - 0.5
    out = np.zeros((H, W, 3), np.float32)
    for r0 in range(0, H, 512):
        r1 = min(H, r0 + 512)
        yy, xx = np.meshgrid(ys[r0:r1], xs, indexing="ij")
        for c in range(3):
            out[r0:r1, :, c] = map_coordinates(img[..., c], [yy, xx], order=1, mode="nearest")
    return out

def product_detail(tag, raw, data, rgb_only=False):
    cfg = DETAIL[tag]; bbox, step, z = cfg["bbox"], cfg["step"], cfg["z"]
    lon0, lat0, lon1, lat1 = bbox
    W = int(round((lon1 - lon0) / step)); H = int(round((lat1 - lat0) / step))
    print(tag, "格子", W, H, flush=True)
    hg, vg = dem_grid(raw, z, bbox, step)
    np.save(f"{data}/{tag}_dem.npy", hg.astype(np.float16))
    mos, tx0, ty0, have = mosaic(raw, "seamlessphoto", "jpg", z, bbox, None)
    ph = to_latlon(mos, tx0, ty0, z, bbox, step); del mos
    co = coarse_sample(data, bbox, W, H, step)
    lat = (lat1 - (np.arange(H) + 0.5) * step)[:, None]
    gx, gy = slopes(hg, bbox, step)
    slope = np.hypot(gx, gy)
    # 色あわせ: 雪の無い所で、広い範囲の平均の色を荒い段（C）に合わせる（細かさは残す）
    w = ((1 - snow(hg, lat)) * (vg > 0.5)).astype(np.float32)
    K = max(2, int(round(cfg.get("match_m", 1500.0) / (111320 * step * 0.8))))   # 写真の撮影日の違いで出る四角い色むらを、この広さで荒い段へ合わせて消す
    den = np.maximum(blur_box(w, K), 1e-3)
    mc = blur_box(co * w[..., None], K) / den[..., None]
    mp = blur_box(ph * w[..., None], K) / den[..., None]
    ratio = np.where(den[..., None] > 0.05, mc / np.maximum(mp, 8.0), 1.0)
    ph = ph * np.clip(ratio, 0.55, 1.8); del mc, mp, ratio, den, w
    # 11 月上旬の新雪: 雪線の上。雪線は雑音で揺らす・急な岩壁には積もりにくい
    px = 111320 * step
    n1 = fbm((H, W), (400 / px, 1800 / px), 7001 + (tag == "F"))
    line = np.maximum(2600.0 - 330.0 * np.clip(lat - 36.0, -6, 12), 1250.0) + 170.0 * n1
    cov = np.clip((hg - line) / 300.0, 0, 1) * (1 - 0.7 * smooth_mask(slope, 0.8, 1.6)) * (0.88 + 0.12 * n1)
    cov = np.clip(cov, 0, 1) * (vg > 0.5)
    land = ph * (1 - 0.9 * cov[..., None]) + np.array([238, 242, 250], np.float32) * 0.9 * cov[..., None]
    vs = blur_box(vg.astype(np.float32), 1)
    rgb = land * vs[..., None] + co * (1 - vs[..., None])
    if rgb_only:       # 色だけ作り直す（できあがりを一度に入れ替える）
        save_rgb(rgb, f"{data}/{tag}_rgb_new.jpg", q=93); os.replace(f"{data}/{tag}_rgb_new.jpg", f"{data}/{tag}_rgb.jpg"); return
    save_rgb(rgb, f"{data}/{tag}_rgb.jpg", q=93); del rgb, land, ph, co, n1, cov
    rel = np.zeros((H, W, 3), np.float32)
    g = 112.0            # 急な面でも切れないよう感度を下げて入れる（読む側で 180 相当に直す）
    rel[..., 0] = 127.5 + gx * g; rel[..., 1] = 127.5 + gy * g
    hz = horizon_local(hg, bbox, step, cfg["hz"])
    if tag == "F":
        from scipy.ndimage import map_coordinates
        mm = json.load(open(f"{data}/M.json")); mb = mm["bbox"]; ms = mm["step"]
        mh = np.asarray(Image.open(f"{data}/M_relief.png"))[..., 2].astype(np.float32) / 10.0
        xs = (lon0 + (np.arange(W) + 0.5) * step - mb[0]) / ms - 0.5
        ys = (mb[3] - (lat1 - (np.arange(H) + 0.5) * step)) / ms - 0.5
        for r0 in range(0, H, 512):
            r1 = min(H, r0 + 512)
            yy, xx = np.meshgrid(ys[r0:r1], xs, indexing="ij")
            hz[r0:r1] = np.maximum(hz[r0:r1], map_coordinates(mh, [yy, xx], order=1, mode="nearest"))
    rel[..., 2] = hz * 10
    save_rgb(rel, f"{data}/{tag}_relief.png"); del rel, hz, gx, gy, slope
    if tag == "M":
        # 谷にたまる低い雲（雲海）: 高さ 1,500 m 以下の盆地・谷を満たす。山の東側（松本・安曇野）を厚く
        lon = (lon0 + (np.arange(W) + 0.5) * step)[None, :]
        hb = blur_box(hg, 3)
        base = np.clip((1500.0 - hb) / 450.0, 0, 1)
        east = smooth_mask(lon, 137.70, 137.86) * 0.85 + 0.15
        nz = fbm((H, W), (2500 / px, 9000 / px), 7100)
        a = smooth_mask(base * east * (0.85 + 0.35 * nz), 0.18, 0.7) * (vg > 0.5)
        save_gray(a, f"{data}/M_low.png"); del a, base, nz
    json.dump({"bbox": list(bbox), "step": step, "size": [W, H], "relief_gain": g}, open(f"{data}/{tag}.json", "w"))
    del hg, vg

def build_detail(data, raw):
    for tag in ("M", "F"):
        if not os.path.exists(f"{data}/{tag}.json"):
            product_detail(tag, raw, data)
    meta = json.load(open(data + "/meta.json"))
    for tag in ("M", "F"):
        meta[tag] = json.load(open(f"{data}/{tag}.json"))
    json.dump(meta, open(data + "/meta.json", "w"), indent=1)
    print("細かい 2 段 できた")

# ======================================================================================
# 第 2 版（r2）の材料: 実写の暮らし（2025-11-30 の雲・夜の灯り・標高から作る雪と影）
#   W2 = 世界の中くらい（0.01°）、J = 日本まわり（0.0025°≒280 m）、C2 = 中部（0.001°≒110 m）
#   どれも「材料そのもの」を保存する（雪・雲の濃さ・灯りの強さは描くときに物理で作る）:
#     <tag>_rgb.jpg（陸=地理院の写真/海=Blue Marble の反射率）・<tag>_land.png・<tag>_lights.png（Black Marble の 8bit そのまま）
#     <tag>_cloud.png（16bit: 雲の見かけの反射率 a。地面の色を引いたもの）・<tag>_dem.npy（m）・<tag>_hz.png（太陽の方位 115° の地平線の高さ角 ×10）
# ======================================================================================
R2_CLOUD_DATE = "2025-11-30"
R2 = {
    "W2": dict(bbox=(85.0, 0.0, 185.0, 65.0), step=0.01, dem=None, photo=None),
    "J": dict(bbox=(124.0, 30.0, 148.0, 46.0), step=0.0025, dem=9, photo=9),
    "C2": dict(bbox=(135.5, 34.0, 140.5, 38.5), step=0.001, dem=11, photo=11),
}

def wms_big(raw, layer, bbox, step, date, tag, src_step=None, piece=3200):
    """WMS を piece 画素四方ごとに取って 1 枚に貼る。src_step を指定すると、元の細かさで取って bicubic で step に拡大する。"""
    lon0, lat0, lon1, lat1 = bbox
    W = int(round((lon1 - lon0) / step)); H = int(round((lat1 - lat0) / step))
    ss = src_step or step
    out = np.zeros((H, W, 3), np.uint8)
    pw = int(piece * step / ss)
    nx = -(-W // piece); ny = -(-H // piece)
    for j in range(ny):
        for i in range(nx):
            x0 = i * piece; x1 = min(W, x0 + piece); y0 = j * piece; y1 = min(H, y0 + piece)
            bb = (lon0 + x0 * step, lat1 - y1 * step, lon0 + x1 * step, lat1 - y0 * step)
            w = max(8, int(round((x1 - x0) * step / ss))); h = max(8, int(round((y1 - y0) * step / ss)))
            im = wms(raw, layer, bb, w, h, date, tag=f"{tag}_{i}_{j}")
            if (w, h) != (x1 - x0, y1 - y0):
                im = np.asarray(Image.fromarray(im).resize((x1 - x0, y1 - y0), Image.BICUBIC))
            out[y0:y1, x0:x1] = im
    return out

def horizon_big(hg, bbox, step, dmax=160.0, az=SUN_AZ, chunk=800):
    """horizon_local() を行ごとの塊で（メモリを抑える）。塊の上下に余白をつけて計算する。"""
    H, W = hg.shape
    out = np.zeros((H, W), np.float32)
    pad = int(dmax / (111.32 * step)) + 4
    lon0, lat0, lon1, lat1 = bbox
    for r0 in range(0, H, chunk):
        r1 = min(H, r0 + chunk); a0 = max(0, r0 - pad); a1 = min(H, r1 + pad)
        sub_bbox = (lon0, lat1 - a1 * step, lon1, lat1 - a0 * step)
        hz = horizon_local(hg[a0:a1], sub_bbox, step, dmax, az)
        out[r0:r1] = hz[r0 - a0:r1 - a0]
    return out

def r2_product(tag, raw, data):
    cfg = R2[tag]; bbox, step = cfg["bbox"], cfg["step"]
    lon0, lat0, lon1, lat1 = bbox
    W = int(round((lon1 - lon0) / step)); H = int(round((lat1 - lat0) / step))
    print(tag, "格子", W, H, flush=True)
    os.makedirs(data + "/r2", exist_ok=True)
    o = f"{data}/r2/{tag}"
    land = land_mask(raw, bbox, step, ss=2 if step >= 0.002 else 3)
    save_gray(land, o + "_land.png")
    # 色: 陸は地理院の写真、海・外国は Blue Marble（500 m。bicubic で拡大）
    bm = wms_big(raw, "BlueMarble_NextGeneration", bbox, step, None, tag + "bm", src_step=max(step, 0.0045))
    if cfg["photo"]:
        mos, tx0, ty0, have = mosaic(raw, "seamlessphoto", "jpg", cfg["photo"], bbox, None)
        gsi = to_latlon(mos, tx0, ty0, cfg["photo"], bbox, step); del mos
        vv = to_latlon(np.kron(have, np.ones((256, 256), np.float32)), tx0, ty0, cfg["photo"], bbox, step)   # 写真のある所
        lm = ((land > 0.5) & (vv > 0.97)).astype(np.float32)
        gsi = fill_from(gsi, lm)
        # 写真の無い陸（朝鮮半島など）と海は Blue Marble。陸の写真との境は 1 画素ぶんなだらかに
        wph = blur_box(lm, 1) * (land > 0.3)
        rgb = gsi * wph[..., None] + bm.astype(np.float32) * (1 - wph[..., None]); del gsi, vv, wph
    else:
        rgb = bm.astype(np.float32)
    save_rgb(rgb, o + "_rgb.jpg", q=94)
    base_min = rgb.min(-1) / 255.0; del rgb
    # 雲: VIIRS の真色（2025-11-30）。見かけの反射率 = min(R,G,B) から、地面の min を引いて残りで割る（しきい値は使わない）
    ob = wms_big(raw, CLOUD_LAYER, bbox, step, R2_CLOUD_DATE, tag + "cl", src_step=max(step, 0.0022))
    m = ob.min(-1).astype(np.float32) / 255.0; blank = ob.max(-1) < 6; del ob
    gb = np.clip(base_min * 1.05 + 0.02, 0.03, 0.42)
    a = np.clip((m - gb) / np.maximum(0.97 - gb, 0.2), 0, 1); a[blank] = 0
    Image.fromarray((a * 65535 + 0.5).astype(np.uint16)).save(o + "_cloud.png")
    del m, gb, a, blank, base_min
    # 夜の灯り（Black Marble の 8bit。0.0045° が元の細かさ）
    lt = wms_big(raw, "VIIRS_Black_Marble", bbox, step, None, tag + "lt", src_step=max(step, 0.0045)).max(-1)
    Image.fromarray(lt).save(o + "_lights.png"); del lt
    if cfg["dem"]:
        hg, vg = dem_grid(raw, cfg["dem"], bbox, step)
        np.save(o + "_dem.npy", hg.astype(np.float16))
        hz = horizon_big(hg, bbox, step)
        save_gray(hz / 25.5, o + "_hz.png")
    json.dump({"bbox": list(bbox), "step": step, "size": [W, H]}, open(o + ".json", "w"))

def r2_global(raw, data):
    """G = 世界全体（0.044°）。色は Blue Marble、灯りは Black Marble の 8bit そのまま、陸の印は Natural Earth。"""
    o = f"{data}/r2/G"
    gb = (-180.0, -90.0, 180.0, 90.0)
    bm = wms(raw, "BlueMarble_NextGeneration", gb, 8192, 4096, None, tag="g")
    Image.fromarray(bm).save(o + "_rgb.jpg", quality=94); del bm
    lt = wms(raw, "VIIRS_Black_Marble", gb, 8192, 4096, None, tag="g").max(-1)
    Image.fromarray(lt).save(o + "_lights.png"); del lt
    save_gray(land_mask(raw, gb, 360.0 / 8192), o + "_land.png")
    json.dump({"bbox": list(gb), "step": 360.0 / 8192, "size": [8192, 4096]}, open(o + ".json", "w"))

def build_r2(data, raw, only=None):
    os.makedirs(data + "/r2", exist_ok=True)
    if not os.path.exists(f"{data}/r2/G.json"):
        r2_global(raw, data)
    for tag in (only or ["W2", "J", "C2"]):
        if not os.path.exists(f"{data}/r2/{tag}.json"):
            r2_product(tag, raw, data)
    meta = {"cloud_date": R2_CLOUD_DATE, "cloud_layer": CLOUD_LAYER, "sun_az": SUN_AZ}
    for tag in ["G"] + list(R2):
        if os.path.exists(f"{data}/r2/{tag}.json"):
            meta[tag] = json.load(open(f"{data}/r2/{tag}.json"))
    json.dump(meta, open(data + "/r2/meta.json", "w"), indent=1)
    print("r2 できた")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--scan", action="store_true")
    ap.add_argument("--rgb-only", action="store_true", help="細かい 2 段の色だけ作り直す（色あわせの調整用）")
    ap.add_argument("--detail", action="store_true", help="手順 2: 北アルプスの細かい 2 段（z12・z14）を足す")
    ap.add_argument("--r2", nargs="*", help="第 2 版の材料（W2 J C2 のうち指定したものだけ。空なら全部）")
    ap.add_argument("--only-lights", action="store_true", help="灯りだけ作り直す（調整用）")
    a = ap.parse_args()
    data = os.path.abspath(a.data); raw = data + "/raw"
    os.makedirs(raw, exist_ok=True)
    if a.scan:
        scan(raw); return
    if a.r2 is not None:
        build_r2(data, raw, a.r2 or None); return
    if a.only_lights:
        for tag, bb, w, h in (("G", (-180.0, -90.0, 180.0, 90.0), 8192, 4096), ("R", REG, 5333, 4667), ("C", PATCH, 3571, 3214)):
            lt = wms(raw, "VIIRS_Black_Marble", bb, w, h, None, tag=tag.lower() if tag == "G" else tag).max(-1)
            save_gray(lights_glow(lt), f"{data}/{tag}_lights.png")
        return
    if a.rgb_only:
        for tag in ("M", "F"):
            product_detail(tag, raw, data, rgb_only=True)
        return
    if a.detail:
        build_detail(data, raw); return
    build(data, raw)

if __name__ == "__main__":
    main()
