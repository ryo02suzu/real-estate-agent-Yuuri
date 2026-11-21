#!/usr/bin/env python3
"""PC のホームの背景の細かい版（home_hd.py）の下ごしらえ。区画を決め、タイルを取り、区画ごとの地面の色・標高・明かりを作る。

  python3 home_hd_prep.py --parts              # 描く区画（陸のある所）を決める → work/home_hd/parts.json
  python3 home_hd_prep.py --fetch [--only 10,8]   # ズーム 9 の標高・ランドサット、ズーム 8 の世界衛星モザイクのタイルを取る
  python3 home_hd_prep.py --build [--only 10,8]   # 区画ごとの入力 → work/home_hd/in/{列}_{行}/

広い版（home.py --extent。ズーム 7 の細かさ＝256 画素のタイルで。5120×3968 画素）と同じ範囲を、4倍（ズーム 9）の細かさで
描くための区画。区画は 1024 画素四方（ズーム 9 のタイル 4×4 枚）で、列・行は範囲の左上から数える。描くのは、陸のある区画すべてと、
範囲の外の日本の島（沖縄・先島・奄美・小笠原など）の区画（日本のまわりの国の陸も描く。区画の境目で細かさや起伏の濃さが
変わらないように）。陸の無い区画（海だけ）は、広い版の絵を引き伸ばして使う（海はなめらかなので変わらない）。
細かい模様は、ランドサット（国土地理院 全国ランドサットモザイク画像）の写る陸はそれ、ほかの陸は世界衛星モザイク画像。

区画ごとの入力（work/home_hd/in/{列}_{行}/）
  albedo.png   地面の色（sRGB、透明度＝陸の割合）。描く所（区画のまわりに OVERLAP 画素の重なりを付けた 1088 画素四方）
               広い版の色（home_prep.py の混ぜる前の陸の色・海の色。大きな範囲の色合わせ済み）に、ズーム 9 のランドサット
               （無い所はズーム 8 の世界衛星モザイク）の細かい模様（その場所のまわりの平均との比）を掛ける。陸と海の境目は
               ズーム 9 の標高で決め直す
  dem.npy      標高（m、float16）。描く所のまわりに GEO_MARGIN 画素を足した範囲（区画の外の山の影も落ちるように。地面だけ作り、
               カメラには入れない）。描く所の近く（DETAIL 画素まで）はズーム 9、その外はズーム 8 の標高を引き伸ばしたもの
  dem_lo.npy   同じ範囲の、陸の起伏の大きな形（標高をぼかしたもの。海は 0）
  lights.npy   夜の街の明かり（線形、float16。night_lights.py の広い版を4倍に引き伸ばしたもの）。描く所と同じ範囲
  part.json    区画の位置（ズーム 9 の画素）と、上の3つの範囲

出典：AWS Terrain Tiles（標高）、国土地理院 全国ランドサットモザイク画像・世界衛星モザイク画像（地面の色。広い版と同じ）、
夜の街の明かりは night_lights.py の出典のとおり。
"""

from __future__ import annotations

import argparse
import io
import json
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from fetch import URL, get  # noqa: E402
from geo import decode_terrarium  # noqa: E402
from home_prep import fix_spikes, to_linear, to_srgb  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
OUT = os.path.join(WORK, "home_hd")
Image.MAX_IMAGE_PIXELS = None

Z = 9  # 細かい版のズーム（256 画素のタイルで）
K = 4  # 広い版（ズーム 7）の何倍か
PART = 1024  # 区画の大きさ（画素）
OVERLAP = 32  # 隣の区画と重ねて描く幅（つなぎ目をなめらかに混ぜる）
GEO_MARGIN = 640  # 地面だけ広く作る幅（夕日の低い光で、遠くの高い山の影が届く長さ）
LO_SIGMA = 10.0  # 起伏の大きな形を取り出すぼかし（ズーム 9 の画素）
DETAIL = 96  # 描く所のまわりで、ズーム 9 の標高を使う幅（その外はズーム 8 を引き伸ばす。影を落とすだけの所）
# 範囲の外の日本の島（ランドサットのタイルを取った範囲の外。経度・緯度）。この島のある区画も描く
ISLANDS = [
    (127.7, 26.2), (125.3, 24.8), (124.2, 24.4), (123.0, 24.45), (129.5, 28.3), (128.9, 27.8), (129.3, 28.4),
    (128.6, 27.4), (130.5, 30.4), (130.0, 29.9), (142.2, 27.1), (131.3, 25.9),
]


def wide() -> dict:
    """広い版の格子（ズーム 7。home_dem_w.json）と大きさ"""
    with open(os.path.join(WORK, "home_dem_w.json")) as f:
        meta = json.load(f)
    h, w = np.load(os.path.join(WORK, "home_dem_w.npy"), mmap_mode="r").shape
    return dict(z=meta["z"], x0=meta["x0"], y0=meta["y0"], w=w, h=h)


def origin() -> tuple[int, int]:
    """広い版の左上（ズーム 9 の画素）"""
    m = wide()
    s = 2 ** (Z - m["z"])
    return int(round(m["x0"] * 256 * s)), int(round(m["y0"] * 256 * s))


def lonlat_px(lon: float, lat: float, z: int = Z) -> tuple[float, float]:
    r = math.radians(lat)
    n = 256 * 2**z
    return (lon + 180.0) / 360.0 * n, (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * n


def parts_list() -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    """描く区画（列, 行）：陸（標高が 0m より上）のある区画すべてと、範囲の外の日本の島の区画。2つ目は、そのうちランドサットの
    写る陸のある区画（ランドサットのタイルを取る所。ほかの陸は世界衛星モザイクの模様だけ）"""
    m = wide()
    d8 = np.load(os.path.join(WORK, "dem8w.npy"), mmap_mode="r")
    with open(os.path.join(WORK, "dem8w.json")) as f:
        dm = json.load(f)
    with open(os.path.join(WORK, "lndst.json")) as f:
        lm = json.load(f)
    lnd = np.asarray(Image.open(os.path.join(WORK, "lndst.png")).convert("RGBA"))
    H, W = d8.shape
    ok = np.zeros((H, W), bool)
    ox, oy = (lm["x0"] - dm["x0"]) * 256, (lm["y0"] - dm["y0"]) * 256
    v = (lnd[..., 3] > 128) & (lnd[..., :3].min(-1) < 235)  # 写真の無い所は白
    ok[oy : oy + v.shape[0], ox : ox + v.shape[1]] = v[: H - oy, : W - ox]
    P = PART // 2  # ズーム 8 の画素で
    cols, rows = math.ceil(m["w"] * K / PART), math.ceil(m["h"] * K / PART)
    land, landsat = set(), set()
    for j in range(rows):
        for i in range(cols):
            blk = np.asarray(d8[j * P : (j + 1) * P, i * P : (i + 1) * P]) > 0
            if blk.sum() > 50:
                land.add((i, j))
            if (blk & ok[j * P : (j + 1) * P, i * P : (i + 1) * P]).sum() > 50:
                landsat.add((i, j))
    x0, y0 = origin()
    for lon, lat in ISLANDS:
        px, py = lonlat_px(lon, lat)
        ij = (int((px - x0) // PART), int((py - y0) // PART))
        land.add(ij)
        landsat.add(ij)
    key = lambda t: (t[1], t[0])  # noqa: E731
    return sorted(land, key=key), sorted(landsat, key=key)


def load_parts(key: str = "parts") -> list[tuple[int, int]]:
    with open(os.path.join(OUT, "parts.json")) as f:
        return [tuple(p) for p in json.load(f)[key]]


def areas(i: int, j: int) -> dict:
    """区画の範囲（ズーム 9 の画素。左上・右下（含まない））：区画・描く所・地面を作る所"""
    x0, y0 = origin()
    px, py = x0 + i * PART, y0 + j * PART
    part = (px, py, px + PART, py + PART)
    draw = (px - OVERLAP, py - OVERLAP, px + PART + OVERLAP, py + PART + OVERLAP)
    g = OVERLAP + GEO_MARGIN
    geo = (px - g, py - g, px + PART + g, py + PART + g)
    return dict(part=part, draw=draw, geo=geo)


def tiles_of(box: tuple[int, int, int, int], z_shift: int = 0) -> list[tuple[int, int]]:
    """範囲（ズーム 9 の画素）を覆うタイル（ズーム Z - z_shift）"""
    s = 2**z_shift
    x0, y0, x1, y1 = box
    return [(x, y) for y in range(y0 // s // 256, (y1 - 1) // s // 256 + 1) for x in range(x0 // s // 256, (x1 - 1) // s // 256 + 1)]


def tile_path(kind: str, z: int, x: int, y: int) -> str:
    ext = "jpg" if kind == "photo" else "png"
    return os.path.join(WORK, "tiles", kind, str(z), str(x), f"{y}.{ext}")


def fetch_kind(kind: str, z: int, xy: set[tuple[int, int]], threads: int) -> None:
    todo = sorted(t for t in xy if not os.path.exists(tile_path(kind, z, *t)))
    print(f"{kind} ズーム {z}：{len(xy)} 枚（まだ無い {len(todo)} 枚）", flush=True)

    def one(t):
        get(URL[kind].format(z=z, x=t[0], y=t[1]), tile_path(kind, z, *t))

    done = 0
    with ThreadPoolExecutor(threads) as ex:
        for _ in ex.map(one, todo):
            done += 1
            if done % 200 == 0:
                print(f"  {kind}: {done}/{len(todo)}", flush=True)


def fetch(parts: list[tuple[int, int]]) -> None:
    dem, lnd, mod = set(), set(), set()
    landsat = set(load_parts("landsat")) if os.path.exists(os.path.join(OUT, "parts.json")) else set(parts)
    for i, j in parts:
        a = areas(i, j)
        d = a["draw"]
        near = (d[0] - DETAIL, d[1] - DETAIL, d[2] + DETAIL, d[3] + DETAIL)
        dem.update(tiles_of(near))
        if (i, j) in landsat:
            lnd.update(tiles_of(d))
        mod.update(tiles_of(d, 1))
    # 標高は AWS（同時に取ってよい）。国土地理院のタイルは1枚ずつ（fetch.get が間を少しあける）
    fetch_kind("terrarium", Z, dem, 8)
    fetch_kind("lndst", Z, lnd, 1)
    fetch_kind("modis", Z - 1, mod, 1)


def mosaic(kind: str, z: int, box: tuple[int, int, int, int], decode) -> np.ndarray:
    """範囲（ズーム z の画素）をタイルからつなぐ。無いタイルは NaN（標高）か透明（画像）"""
    x0, y0, x1, y1 = box
    tx0, ty0, tx1, ty1 = x0 // 256, y0 // 256, (x1 - 1) // 256, (y1 - 1) // 256
    first = None
    out = None
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            p = tile_path(kind, z, tx, ty)
            data = open(p, "rb").read() if os.path.exists(p) else b""
            a = decode(data)
            if out is None:
                first = a
                out = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256) + first.shape[2:], first.dtype)
                if out.dtype.kind == "f":
                    out[:] = np.nan
            out[(ty - ty0) * 256 : (ty - ty0 + 1) * 256, (tx - tx0) * 256 : (tx - tx0 + 1) * 256] = a
    ox, oy = x0 - tx0 * 256, y0 - ty0 * 256
    return out[oy : oy + (y1 - y0), ox : ox + (x1 - x0)]


def dec_dem(data: bytes) -> np.ndarray:
    if not data:
        return np.full((256, 256), np.nan, np.float32)
    return decode_terrarium(np.asarray(Image.open(io.BytesIO(data)).convert("RGB")))


def dec_rgba(data: bytes) -> np.ndarray:
    if not data:
        return np.zeros((256, 256, 4), np.uint8)
    return np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))


def resample(a: np.ndarray, box: tuple[int, int, int, int], src_origin: tuple[float, float], scale: float, order: int = 3) -> np.ndarray:
    """粗い格子の配列 a（左上が src_origin、ズーム 9 の画素で 1 画素 = scale）を、範囲 box（ズーム 9 の画素）の各画素の
    真ん中で読む（order 3：なめらか）"""
    x0, y0, x1, y1 = box
    xs = (np.arange(x0, x1) + 0.5 - src_origin[0]) / scale - 0.5
    ys = (np.arange(y0, y1) + 0.5 - src_origin[1]) / scale - 0.5
    YY, XX = np.meshgrid(ys, xs, indexing="ij")
    if a.ndim == 2:
        return ndimage.map_coordinates(a, [YY, XX], order=order, mode="nearest")
    return np.stack([ndimage.map_coordinates(a[..., c], [YY, XX], order=order, mode="nearest") for c in range(a.shape[2])], -1)


def crop_wide(arr: np.ndarray, box: tuple[int, int, int, int], pad: int) -> tuple[np.ndarray, tuple[float, float]]:
    """広い版（ズーム 7）の配列から、範囲 box（ズーム 9 の画素）を覆う所を、まわり pad 画素（ズーム 7）付きで切り出す"""
    x0, y0 = origin()
    H, W = arr.shape[:2]
    c0 = max(0, (box[0] - x0) // K - pad)
    r0 = max(0, (box[1] - y0) // K - pad)
    c1 = min(W, (box[2] - x0) // K + pad + 1)
    r1 = min(H, (box[3] - y0) // K + pad + 1)
    return np.asarray(arr[r0:r1, c0:c1], dtype=np.float32), (x0 + c0 * K, y0 + r0 * K)


def build(i: int, j: int) -> None:
    a = areas(i, j)
    d, g = a["draw"], a["geo"]
    out = os.path.join(OUT, "in", f"{i}_{j}")
    os.makedirs(out, exist_ok=True)
    x0, y0 = origin()

    # ---- 標高：地面を作る所全体はズーム 8 を引き伸ばし、描く所の近くはズーム 9 にする
    d8 = np.load(os.path.join(WORK, "dem8w.npy"), mmap_mode="r")
    with open(os.path.join(WORK, "dem8w.json")) as f:
        dm = json.load(f)
    o8 = (dm["x0"] * 256 * 2, dm["y0"] * 256 * 2)  # ズーム 8 の格子の左上（ズーム 9 の画素）
    H8, W8 = d8.shape
    c0, r0 = max(0, int((g[0] - o8[0]) // 2) - 4), max(0, int((g[1] - o8[1]) // 2) - 4)
    c1, r1 = min(W8, int((g[2] - o8[0]) // 2) + 5), min(H8, int((g[3] - o8[1]) // 2) + 5)
    sub, _ = fix_spikes(np.asarray(d8[r0:r1, c0:c1], dtype=np.float32))
    dem = resample(sub, g, (o8[0] + c0 * 2, o8[1] + r0 * 2), 2.0, order=1).astype(np.float32)
    near = (d[0] - DETAIL, d[1] - DETAIL, d[2] + DETAIL, d[3] + DETAIL)
    h9 = mosaic("terrarium", Z, near, dec_dem)
    h9, nfix = fix_spikes(np.where(np.isnan(h9), 0.0, h9).astype(np.float32))
    # ズーム 9 の所と引き伸ばした所を、境目の 32 画素でなめらかにつなぐ
    yy, xx = np.arange(h9.shape[0])[:, None], np.arange(h9.shape[1])[None, :]
    edge = np.minimum(np.minimum(yy, h9.shape[0] - 1 - yy), np.minimum(xx, h9.shape[1] - 1 - xx))
    w = np.clip(edge / 32.0, 0.0, 1.0).astype(np.float32)
    oy, ox = near[1] - g[1], near[0] - g[0]
    blk = dem[oy : oy + h9.shape[0], ox : ox + h9.shape[1]]
    dem[oy : oy + h9.shape[0], ox : ox + h9.shape[1]] = blk * (1 - w) + h9 * w
    np.save(os.path.join(out, "dem.npy"), dem.astype(np.float16))
    # 起伏の大きな形（広い版の地面の点の間隔＝ズーム 9 の 16 画素ほど）。home_hd.py は、大きな形を広い版と同じ強さで、
    # それより細かい起伏は弱めに強調する（細かい起伏まで同じ強さにすると、谷の影が濃くなりすぎて、広い版より暗くなる）
    lo = ndimage.gaussian_filter(np.maximum(dem, 0.0), LO_SIGMA)
    np.save(os.path.join(out, "dem_lo.npy"), lo.astype(np.float16))
    hd = dem[d[1] - g[1] : d[3] - g[1], d[0] - g[0] : d[2] - g[0]]  # 描く所の標高（ズーム 9）

    # ---- 地面の色
    land_w = np.load(os.path.join(WORK, "home_land_w.npy"), mmap_mode="r")
    sea_w = np.load(os.path.join(WORK, "home_sea_w.npy"), mmap_mode="r")
    dem_w = np.load(os.path.join(WORK, "home_dem_w.npy"), mmap_mode="r")
    PAD = 6
    lw, lo = crop_wide(land_w, d, PAD)
    sw, so = crop_wide(sea_w, d, PAD)
    hw, _ = crop_wide(dem_w, d, PAD)
    # 陸の色は陸の所だけ意味があるので、海の所は一番近い陸の色で埋めてから引き伸ばす（境目が細かい版で少し動いても色がにじまない）
    landm = hw > 0
    if landm.any():
        idx = ndimage.distance_transform_edt(~landm, return_distances=False, return_indices=True)
        lw = lw[idx[0], idx[1]]
    base_land = np.clip(resample(lw, d, lo, K), 0, None)
    base_sea = np.clip(resample(sw, d, so, K), 0, None)
    # 細かい模様：ランドサット（無い所は世界衛星モザイク）の、まわり（広い版の 1 画素＝ズーム 9 の 4 画素）の平均との比
    lnd = mosaic("lndst", Z, d, dec_rgba).astype(np.float32) / 255.0
    l_ok = (lnd[..., 3] > 0.5) & (lnd[..., :3].min(-1) < 0.92)
    box8 = (d[0] // 2, d[1] // 2, (d[2] + 1) // 2, (d[3] + 1) // 2)
    mod8 = mosaic("modis", Z - 1, box8, dec_rgba).astype(np.float32) / 255.0
    mod = resample(mod8, d, (box8[0] * 2, box8[1] * 2), 2.0, order=3)
    m_ok = mod[..., 3] > 0.5
    land9 = hd > 0
    src = np.where(l_ok[..., None], to_linear(lnd[..., :3]), to_linear(np.clip(mod[..., :3], 0, 1)))
    okm = (l_ok | m_ok) & land9
    # まわりの平均（陸で写真のある所だけ。4 画素の箱で縮めてから、なめらかに戻す）
    def low(x: np.ndarray, m: np.ndarray) -> np.ndarray:
        Hh, Ww = m.shape
        hh, ww = Hh // K * K, Ww // K * K
        num = (x[:hh, :ww] * m[:hh, :ww, None]).reshape(hh // K, K, ww // K, K, -1).sum((1, 3))
        den = m[:hh, :ww].reshape(hh // K, K, ww // K, K).sum((1, 3))[..., None]
        # 写真のある陸の無い粗い画素は、まわりから埋める
        mean = np.where(den > 0, num / np.maximum(den, 1e-6), np.nan)
        bad = np.isnan(mean[..., 0])
        if bad.all():
            return np.ones_like(x)
        if bad.any():
            idx2 = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
            mean = mean[idx2[0], idx2[1]]
        up = resample(mean, (0, 0, Ww, Hh), (0.0, 0.0), K, order=3)
        return np.clip(up, 1e-4, None)
    detail = np.where(okm[..., None], src / low(src, okm.astype(np.float32)), 1.0)
    detail = np.clip(detail, 0.35, 2.8)
    land_rgb = base_land * detail
    frac = np.clip((hd + 4.0) / 8.0, 0.0, 1.0)
    rgb = base_sea * (1 - frac[..., None]) + land_rgb * frac[..., None]
    img = np.dstack([to_srgb(np.clip(rgb, 0, 1)), frac]) * 255.0 + 0.5
    Image.fromarray(img.astype(np.uint8), mode="RGBA").save(os.path.join(out, "albedo.png"))

    # ---- 夜の街の明かり（広い版を引き伸ばす）
    lt = np.load(os.path.join(WORK, "night_lights_w.npy"), mmap_mode="r")
    lc, lo2 = crop_wide(lt, d, PAD)
    lights = np.clip(resample(lc, d, lo2, K), 0, None)
    np.save(os.path.join(out, "lights.npy"), lights.astype(np.float16))
    with open(os.path.join(WORK, "night_lights_w.json")) as f:
        scale = json.load(f)["scale"]
    with open(os.path.join(out, "part.json"), "w") as f:
        json.dump(dict(index=[i, j], z=Z, **a, origin=[x0, y0], lights_scale=scale, dem_spikes_fixed=int(nfix)), f, ensure_ascii=False, indent=1)
    print(f"{i},{j}：陸 {land9.mean() * 100:.0f}%（ランドサット {l_ok[land9].mean() * 100 if land9.any() else 0:.0f}%）、標高 {hd.min():.0f}〜{hd.max():.0f}m", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--parts", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--only", default="", help="区画（列,行）をセミコロンで区切って（例 10,8;11,8）")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if a.parts:
        ps, ls = parts_list()
        with open(os.path.join(OUT, "parts.json"), "w") as f:
            json.dump(dict(z=Z, size=PART, origin=list(origin()), parts=ps, landsat=ls), f)
        print(f"区画 {len(ps)} か所（ランドサットの写る陸のある所 {len(ls)} か所）", flush=True)
    ps = [tuple(int(v) for v in s.split(",")) for s in a.only.split(";") if s] or (load_parts() if (a.fetch or a.build) else [])
    if a.fetch:
        fetch(ps)
    if a.build:
        for i, j in ps:
            build(i, j)


if __name__ == "__main__":
    main()
