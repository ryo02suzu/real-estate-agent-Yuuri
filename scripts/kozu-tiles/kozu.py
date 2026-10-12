#!/usr/bin/env python3
"""
公図（登記所備付地図データのうち任意座標系の図面）の筆を、国土地理院の基盤地図情報の道路縁・水涯線に合わせて置き、
推定の位置（緯度経度）を付ける。市区町村ごとに動かし、置けた筆を GeoJSON の行で書き出す（タイルにするのは workflow）。

    python3 scripts/kozu-tiles/kozu.py --codes 14109 --out work/kozu-14109.geojsonl --work work

ワークフロー（.github/workflows/kozu-tiles.yml）では、次の3つに分けて動かす。
    --plan 13,14,11,12         都県の地図XMLの zip を大きさで束ね、ジョブの分け方（matrix）を書き出す。
                               大きい市区町村は「12219:2/3」（図面を3組に分けた2組目）のように分ける
    --codes … --frags … --minutes 320
                               ジョブごとに置く。置いた切れ端の形（--frags）も書き、時間が来たらそこまでの結果で終える
    --resolve 置き場 --out …     全てのジョブの結果をまとめ、ジョブをまたいで重なった切れ端を外して、タイルにする筆を書き出す

任意座標系の XML 1つ（地図名ごと）の中には、紙の公図を1枚ずつ読み取った「切れ端」が、ばらばらの位置・向きで入っている。
切れ端ごとに次のようにして置く。
  1. 切れ端の土地の筆の外周（道路・水路の筆や切れ端の外と接する線）を 1m おきの点に、土地の内側を 2m おきの点にする
  2. 調べる範囲：切れ端の筆の町丁目（国勢調査の小地域の境界。無ければ国土地理院の住所検索の点のまわり）
  3. 道路縁からの距離の画像（4m の画素）と、FFT で、回転・縮尺ごとに全ての平行移動を調べる
     （外周の点が道路縁に近いほど良く、内側の点に道路縁がかかるほど悪い）
  4. よい候補を ICP（相似変換）で詰め、さらに街区（道路の筆で分かれた土地のまとまり）ごとに少しだけ動かして合わせ直す。
     街区ごとの「外周の点が道路縁から 1m 以内の割合」の平均で採点し、2番目の候補とはっきり差があるものだけ採る
  5. 採れた切れ端の向き・縮尺の近く（同じ XML の中ではそろっていることが多い）だけで、残りを探し直す（置いたものとは重ねない）
  6. 置いた切れ端どうしが大きく重なれば確かなほうだけ残す。公共座標の筆（地籍調査などが済んだ所）の上に置いたものも外す

横浜市港北区の全体で試した結果：筆の 27% を置け（確かさの高い q=1 が 19%）、建物の形で確かめると q=1 の筆の 90% が
1.5m 以内のずれ（q=2 は 2〜5m ずれることが多い。タイルの q に入れ、アプリは「推定・確度低」とする）。
公図はもともと形がゆがんでいる（明治の図面を写したもの）ので、置いた位置は「推定」として出す。

必要なもの: scripts/kozu-tiles/requirements.txt（mojxml・numpy・scipy・shapely・pyproj・pyshp）
"""
import argparse
import concurrent.futures as cf
import glob
import gzip
import io
import json
import math
import multiprocessing
import os
import re
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import numpy as np
import shapely
from mojxml.parse import ParseOptions, parse_raw
from mojxml.reader import iter_content_xmls
from pyproj import Transformer
from scipy import fft as sfft
from scipy import ndimage
from scipy.spatial import cKDTree
from shapely import affinity, contains_xy
from shapely.geometry import MultiPolygon, Point, Polygon, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

UA = {"User-Agent": "michilu-kozu (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
CKAN = "https://www.geospatial.jp/ckan/api/3/action/package_search"
ORGS = {"08": "moj-08ibaraki", "09": "moj-09tochigi", "10": "moj-10gunma", "11": "moj-11saitama", "12": "moj-12chiba", "13": "moj-13tokyo", "14": "moj-14kanagawa"}
ESTAT = "https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=A002005212020&code={code}&coordSys=1&format=shape&downloadType=5&datum=2011"
FGD = "https://cyberjapandata.gsi.go.jp/xyz/experimental_fgd/18/{x}/{y}.geojson"
GEOCODE = "https://msearch.gsi.go.jp/address-search/AddressSearch?q={q}"
# 関東1都6県は平面直角座標系の第IX系（島しょ部を除く）
TO_M = Transformer.from_crs("EPSG:4326", "EPSG:6677", always_xy=True)
TO_LL = Transformer.from_crs("EPSG:6677", "EPSG:4326", always_xy=True)
ROADLIKE = re.compile(r"^(道|水|無地番|長狭物不明)")
KANJI = "〇一二三四五六七八九"
TAU = 6.0  # 道路縁からの距離の上限（m）
COARSE_R = 4.0  # 粗い探索の画素（m）
STEP = 0.5  # 道路縁の点の間隔（m）


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url: str, timeout: int = 120, tries: int = 5) -> bytes:
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            if i == tries - 1:
                raise
        except Exception:
            if i == tries - 1:
                raise
        time.sleep(2 * 2**i)
    raise RuntimeError(url)


# ---- 公図（任意座標系の XML）を読む ----


def kanji_chome(s: str) -> str:
    """「本町１丁目」→「本町一丁目」（国勢調査の小地域の名前に合わせる）"""
    s = s.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    return re.sub(r"(\d+)丁目", lambda m: "".join(KANJI[int(c)] for c in m.group(1)) + "丁目", s) if s else s


def moj_zip(code: str, year: str, work: str) -> str:
    """市区町村の地図XMLの zip（G空間情報センター。ログイン不要）"""
    path = os.path.join(work, f"moj-{code}-{year}.zip")
    if os.path.exists(path):
        return path
    org = ORGS[code[:2]]
    data = json.loads(get(f"{CKAN}?fq=organization:{org}&rows=1000"))
    for pkg in data["result"]["results"]:
        for res in pkg["resources"]:
            name = res.get("name") or ""
            if name.startswith(code + "-") and name.endswith(f"-{year}.zip"):
                tmp = path + ".part"
                with urllib.request.urlopen(urllib.request.Request(res["url"], headers=UA), timeout=900) as r, open(tmp, "wb") as f:
                    while chunk := r.read(1 << 20):
                        f.write(chunk)
                os.replace(tmp, path)
                return path
    raise RuntimeError(f"{code} の {year} 年版の zip が見つかりません")


def read_zip(zip_path: str) -> tuple[dict[str, list[dict]], list]:
    """任意座標系の地図ごとの筆（座標は図面の m。東・北の向き）と、公共座標系の筆の形（平面直角座標の m）"""
    sheets: dict[str, list[dict]] = {}
    public = []
    opts = ParseOptions(include_arbitrary_crs=True)
    for content in iter_content_xmls([zip_path]):
        arbitrary = "任意座標系".encode() in content[:4000]
        try:
            feats = parse_raw(content, opts if arbitrary else ParseOptions())
        except Exception as e:  # 壊れた図面は飛ばす
            log(f"::warning::読めない図面: {e}")
            continue
        if not arbitrary:
            # 公共座標の筆（緯度経度で読める）。ここには公図の切れ端を置かない
            for f in feats:
                for poly in shape(f["geometry"]).geoms if f["geometry"]["type"] == "MultiPolygon" else [shape(f["geometry"])]:
                    xs, ys = TO_M.transform(*np.array(poly.exterior.coords).T)
                    public.append(Polygon(np.column_stack([xs, ys])))
            continue
        for f in feats:
            p = f["properties"]
            if p.get("座標系") != "任意座標系":
                continue
            g = shape(f["geometry"]).buffer(0)
            if g.is_empty:
                continue
            chiban = str(p.get("地番") or "")
            sheets.setdefault(str(p.get("地図名")), []).append(
                {
                    "geom": g,
                    "chiban": chiban,
                    "kuiki": "_".join(str(p.get(k) or "") for k in ("市区町村名", "大字名", "丁目名", "小字名", "予備名")),
                    "town": kanji_chome(str(p.get("大字名") or "") + str(p.get("丁目名") or "")),
                    "road": bool(ROADLIKE.match(chiban)),
                }
            )
    return sheets, public


def public_cover(public: list) -> list:
    """公共座標の筆のある所（筆どうしのすき間を埋め、まわりを 3m 縮めた形の一つ一つ。となりに公図の筆が来てもよい）"""
    if not public:
        return []
    u = unary_union([g.buffer(0.5) for g in public]).buffer(-3.5)
    return [g for g in getattr(u, "geoms", [u]) if not g.is_empty and g.area > 100]


def parse_item(item: str) -> tuple[str, int, int]:
    """「12219」→ (12219, 1, 1)。「12219:2/3」→ (12219, 2, 3)（大きい市区町村の図面を3組に分けた2組目）"""
    m = re.fullmatch(r"(\d{5})(?::(\d+)/(\d+))?", item.strip())
    if not m or not 1 <= int(m.group(2) or 1) <= int(m.group(3) or 1):
        raise SystemExit(f"市区町村コードの書き方が違います: {item}")
    return m.group(1), int(m.group(2) or 1), int(m.group(3) or 1)


def item_label(code: str, i: int, n: int) -> str:
    return code if n == 1 else f"{code}-{i}of{n}"


def split_sheets(sheets: dict[str, list[dict]], i: int, n: int) -> dict[str, list[dict]]:
    """図面を、筆の数がそろうように n 組に分けた i 組目（1から）。同じ町の図面は同じ組にする（道路縁を何度も読まない）。
    同じ zip なら毎回同じ分け方になる"""
    if n == 1:
        return sheets
    groups: dict[str, list[str]] = {}
    for name, parcels in sheets.items():
        cnt: dict[str, int] = {}
        for p in parcels:
            cnt[p["town"]] = cnt.get(p["town"], 0) + 1
        town = max(sorted(cnt), key=lambda t: cnt[t]) if cnt else ""
        groups.setdefault(town, []).append(name)
    bins: list[list] = [[0, []] for _ in range(n)]
    for town in sorted(groups, key=lambda t: (-sum(len(sheets[s]) for s in groups[t]), t)):
        b = min(range(n), key=lambda j: (bins[j][0], j))
        bins[b][0] += sum(len(sheets[s]) for s in groups[town])
        bins[b][1] += groups[town]
    return {k: sheets[k] for k in sorted(bins[i - 1][1])}


def fragments(parcels: list[dict]) -> list[list[dict]]:
    """筆のつながり（境界を共有するもの）ごとの切れ端。大きい順"""
    geoms = [p["geom"] for p in parcels]
    u = unary_union([g.buffer(0.3) for g in geoms])
    comps = list(u.geoms) if isinstance(u, MultiPolygon) else [u]
    tree = STRtree(geoms)
    out = [[parcels[i] for i in tree.query(c, predicate="intersects")] for c in comps]
    out.sort(key=lambda fr: -len(fr))
    return out


def sample_lines(geom, step: float) -> list:
    pts = []
    gs = [geom] if geom.geom_type in ("LineString", "LinearRing") else [g for g in getattr(geom, "geoms", []) if g.geom_type in ("LineString", "LinearRing")]
    for ln in gs:
        n = max(1, int(ln.length / step))
        pts += [ln.interpolate(k * ln.length / n).coords[0] for k in range(n + 1)]
    return pts


def inner_points(g) -> np.ndarray:
    er = g.buffer(-2.5)
    if er.is_empty:
        return np.zeros((0, 2))
    x0, y0, x1, y1 = er.bounds
    gx, gy = np.meshgrid(np.arange(x0, x1, 2.0), np.arange(y0, y1, 2.0))
    m = contains_xy(er, gx, gy)
    return np.column_stack([gx[m], gy[m]])


def frag_points(frag: list[dict]):
    """外周の点・内側の点・切れ端全体の形"""
    landg = [p["geom"] for p in frag if not p["road"]]
    land = unary_union(landg) if landg else None
    whole = unary_union([p["geom"] for p in frag])
    pts = []
    if land is not None and not land.is_empty:
        pts += sample_lines(land.boundary, 1.0)
    pts += sample_lines(whole.boundary, 1.0)
    b = np.unique(np.round(np.array(pts) / 0.5) * 0.5, axis=0)
    return b, (inner_points(land) if land is not None else np.zeros((0, 2))), whole


def frag_blocks(frag: list[dict]) -> list[dict]:
    """土地の筆を、道路・水路の筆で分かれたまとまり（街区）に分ける"""
    land = [(i, p) for i, p in enumerate(frag) if not p["road"]]
    if not land:
        return []
    u = unary_union([p["geom"].buffer(0.15) for _, p in land])
    comps = list(u.geoms) if isinstance(u, MultiPolygon) else [u]
    out = []
    for comp in comps:
        members = [i for i, p in land if comp.intersects(p["geom"].representative_point())]
        g = unary_union([frag[i]["geom"] for i in members])
        b = np.array(sample_lines(g.boundary, 1.0))
        if len(b) < 20:
            out.append({"members": members, "b": None, "inner": None})
            continue
        out.append({"members": members, "b": np.unique(np.round(b / 0.5) * 0.5, axis=0), "inner": inner_points(g)})
    return out


# ---- 調べる範囲（町丁目）----


def estat_towns(code: str, work: str) -> dict[str, object]:
    """国勢調査（2020年）の小地域の境界（町丁目の名前 → 形。平面直角座標の m）"""
    import shapefile  # pyshp

    path = os.path.join(work, f"estat-{code}.zip")
    if not os.path.exists(path):
        try:
            data = get(ESTAT.format(code=code), timeout=300)
        except Exception as e:
            log(f"::warning::{code} 小地域の境界を読めません: {e}")
            return {}
        open(path, "wb").write(data)
    out: dict[str, list] = {}
    with zipfile.ZipFile(path) as z:
        base = next((n[:-4] for n in z.namelist() if n.endswith(".shp")), None)
        if not base:
            return {}
        r = shapefile.Reader(shp=io.BytesIO(z.read(base + ".shp")), dbf=io.BytesIO(z.read(base + ".dbf")), shx=io.BytesIO(z.read(base + ".shx")), encoding="cp932")
        for sr in r.iterShapeRecords():
            name = sr.record.as_dict().get("S_NAME") or ""
            g = shape(sr.shape.__geo_interface__)
            for poly in [g] if g.geom_type == "Polygon" else list(getattr(g, "geoms", [])):
                xs, ys = TO_M.transform(*np.array(poly.exterior.coords).T)
                out.setdefault(name, []).append(Polygon(np.column_stack([xs, ys])).buffer(0))
    return {k: unary_union(v) for k, v in out.items()}


_geo_cache: dict[str, object] = {}


def geocode_area(city: str, town: str):
    """小地域の名前で見つからない町（大字・字）は、国土地理院の住所検索の点のまわり 1.2km"""
    q = f"{city}{town}"
    if q in _geo_cache:
        return _geo_cache[q]
    area = None
    try:
        for r in json.loads(get(GEOCODE.format(q=urllib.parse.quote(q)), timeout=30))[:5]:
            title = r["properties"]["title"]
            if town and town.replace("丁目", "") in title.replace("丁目", ""):
                x, y = TO_M.transform(*r["geometry"]["coordinates"])
                area = Point(x, y).buffer(1200)
                break
    except Exception as e:
        log(f"  geocode {q}: {e}")
    _geo_cache[q] = area
    time.sleep(0.2)
    return area


# ---- 基盤地図情報（道路縁・水涯線）----


def tiles_for(area, z: int = 18) -> list[tuple[int, int]]:
    """範囲にかかるタイル（範囲は町丁目の形の集まりなので、外接する四角の隅のタイルは読まない）"""
    x0, y0, x1, y1 = area.bounds
    w, s = TO_LL.transform(x0, y0)
    e, n = TO_LL.transform(x1, y1)
    k = 2**z

    def tile(lat, lng):
        si = math.sin(math.radians(lat))
        return int((lng + 180) / 360 * k), int((0.5 - math.log((1 + si) / (1 - si)) / (4 * math.pi)) * k)

    tx0, ty0 = tile(n, w)
    tx1, ty1 = tile(s, e)
    xs, ys = np.meshgrid(np.arange(tx0, tx1 + 1), np.arange(ty0, ty1 + 1))
    xs, ys = xs.ravel(), ys.ravel()
    lng = (xs + 0.5) / k * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (ys + 0.5) / k))))
    cx, cy = TO_M.transform(lng, lat)
    shapely.prepare(area)
    keep = shapely.dwithin(area, shapely.points(cx, cy), 120)
    return [(int(x), int(y)) for x, y in zip(xs[keep], ys[keep])]


# タイルから残すもの（線は class → 置き場の名前、点は class → (置き場の名前, 属性)）。
# 置き方に使うのは道路縁・水涯線（r）。建物の外周（b）・町字界（c）・住居表示の街区線（s）・街区符号（a）・町字の名前（t）も、
# 国土地理院に読み直しに行かずに後で使えるよう、同じタイルから残しておく
FGD_LINES = {"RdEdg": "r", "WL": "r", "BldL": "b", "CommBdry": "c", "SBBdry": "s"}
FGD_POINTS = {"SBAPt": ("a", "sbaNo"), "CommPt": ("t", "name")}


def fgd_tile(data: dict) -> dict:
    """基盤地図情報のタイル（GeoJSON）から残す線と点（経緯度のまま）"""
    out: dict[str, list] = {k: [] for k in ("r", "b", "c", "s", "a", "t")}
    for f in data["features"]:
        pr, g = f["properties"], f["geometry"]
        cls = pr.get("class")
        if cls in FGD_LINES and g["type"] == "LineString":
            out[FGD_LINES[cls]].append(g["coordinates"])
        elif cls in FGD_POINTS and g["type"] == "Point":
            k, attr = FGD_POINTS[cls]
            out[k].append([*g["coordinates"][:2], pr.get(attr) or ""])
    return out


def fetch_fgd(tiles: list[tuple[int, int]], cache: str, threads: int = 4, rate: float = float(os.environ.get("KOZU_FGD_RATE", "8"))) -> tuple[list[np.ndarray], int]:
    """道路縁（RdEdg）・水涯線（WL）の線（平面直角座標の m）と、新しく読んだタイルの数。読んだタイルは cache に置く（fgd_tile の形）。
    国土地理院に負担をかけないよう、1秒に rate 枚まで"""
    os.makedirs(cache, exist_ok=True)
    lock = threading.Lock()
    last = [0.0]
    new = [0]

    def one(xy):
        x, y = xy
        p = os.path.join(cache, f"{x}_{y}.json")
        d = json.load(open(p)) if os.path.exists(p) else None
        # 前の形（道路縁・水涯線だけの配列）は、建物などを残すために読み直す
        if not isinstance(d, dict):
            with lock:
                wait = last[0] + 1 / rate - time.time()
                if wait > 0:
                    time.sleep(wait)
                last[0] = time.time()
            try:
                data = json.loads(get(FGD.format(x=x, y=y), timeout=60))
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                data = {"features": []}
            d = fgd_tile(data)
            with open(p + ".part", "w") as fo:
                json.dump(d, fo, separators=(",", ":"))
            os.replace(p + ".part", p)
            with lock:
                new[0] += 1
        return d["r"]

    out = []
    with cf.ThreadPoolExecutor(threads) as ex:
        for lines in ex.map(one, tiles):
            for ln in lines:
                xs, ys = TO_M.transform([q[0] for q in ln], [q[1] for q in ln])
                out.append(np.column_stack([xs, ys]))
    return out, new[0]


def densify(lines: list[np.ndarray], step: float) -> np.ndarray:
    out = []
    for ln in lines:
        for a, b in zip(ln[:-1], ln[1:]):
            n = max(1, int(np.hypot(*(b - a)) / step))
            out.append(a + (b - a) * np.linspace(0, 1, n + 1)[:, None])
    return np.vstack(out) if out else np.zeros((0, 2))


# ---- 置き方を探す ----

WORK: dict = {}


def near(bounds, pad: float) -> np.ndarray:
    """道路縁の点のうち、範囲（＋余白）の中のもの（x で並べてあるので二分探索で切り出す）"""
    pts = WORK["pts"]
    x0, y0, x1, y1 = bounds
    i0, i1 = np.searchsorted(WORK["xs"], [x0 - pad, x1 + pad])
    sub = pts[i0:i1]
    return sub[(sub[:, 1] > y0 - pad) & (sub[:, 1] < y1 + pad)]


class Raster:
    """道路縁からの距離の画像（北が上。画素 (i, j) の中心は x0 + j*r, y1 - i*r）"""

    def __init__(self, tpts, bounds, r, pad):
        x0, y0, x1, y1 = bounds
        self.r = r
        self.x0, self.y1 = x0 - pad, y1 + pad
        W = sfft.next_fast_len(int(math.ceil((x1 - x0 + 2 * pad) / r)) + 1, real=True)
        H = sfft.next_fast_len(int(math.ceil((y1 - y0 + 2 * pad) / r)) + 1, real=True)
        img = np.zeros((H, W), bool)
        j = np.round((tpts[:, 0] - self.x0) / r).astype(int)
        i = np.round((self.y1 - tpts[:, 1]) / r).astype(int)
        ok = (i >= 0) & (i < H) & (j >= 0) & (j < W)
        img[i[ok], j[ok]] = True
        dist = ndimage.distance_transform_edt(~img) * r
        self.H, self.W = H, W
        self.FD = sfft.rfft2(np.minimum(dist, TAU).astype(np.float32))
        self.FE = sfft.rfft2((dist <= 1.0).astype(np.float32))
        self.xs = self.x0 + np.arange(W) * r
        self.ys = self.y1 - np.arange(H) * r


def rot(theta: float) -> np.ndarray:
    c, s = math.cos(theta), math.sin(theta)
    return np.array([[c, -s], [s, c]])


def kernel(q, ras):
    di = np.round(-q[:, 1] / ras.r).astype(int) % ras.H
    dj = np.round(q[:, 0] / ras.r).astype(int) % ras.W
    K = np.zeros((ras.H, ras.W), np.float32)
    np.add.at(K, (di, dj), 1.0)
    return sfft.rfft2(K)


def coarse_search(b_c, i_c, ras, valid, poses, lam=1.0, keep=15):
    cands = []
    for th, s in poses:
        R = rot(th)
        F = ras.FD * np.conj(kernel((s * b_c) @ R.T, ras)) / len(b_c)
        if len(i_c):
            F += (lam * TAU / len(i_c)) * ras.FE * np.conj(kernel((s * i_c) @ R.T, ras))
        S = sfft.irfft2(F, s=(ras.H, ras.W))
        S = np.where(valid, S, np.inf)
        for f in np.argpartition(S.ravel(), 6)[:6]:
            ti, tj = divmod(int(f), ras.W)
            if np.isfinite(S[ti, tj]):
                cands.append((float(S[ti, tj]), th, s, ti, tj))
    cands.sort()
    out = []
    for c in cands:
        if all(abs(c[3] - o[3]) * ras.r > 10 or abs(c[4] - o[4]) * ras.r > 10 or abs((c[1] - o[1] + math.pi) % (2 * math.pi) - math.pi) > math.radians(6) for o in out):
            out.append(c)
        if len(out) >= keep:
            break
    return out


def umeyama(src, dst, w):
    W = w / w.sum()
    ms = (W[:, None] * src).sum(0)
    md = (W[:, None] * dst).sum(0)
    S = src - ms
    D = dst - md
    U, sig, Vt = np.linalg.svd((W[:, None] * D).T @ S)
    E = np.diag([1.0, np.sign(np.linalg.det(U @ Vt))])
    R = U @ E @ Vt
    s = (sig * np.diag(E)).sum() / (W * (S**2).sum(1)).sum()
    return s, R, md - s * R @ ms


def icp(b_c, tree, tpts, s, R, t, iters=25, lim0=4.0, smin=0.85, smax=1.15, anchor=None):
    for k in range(iters):
        q = (s * b_c) @ R.T + t
        d, idx = tree.query(q)
        w = (d < max(1.2, lim0 - k * 0.15)).astype(float)
        if w.sum() < 10:
            break
        s2, R2, t2 = umeyama(b_c, tpts[idx], w)
        if not (smin <= s2 <= smax):
            break
        if anchor is not None:
            # 街区の合わせ直し：切れ端の置き方から大きく離れない
            a_s, a_R, a_t, max_shift, max_rot = anchor
            c0 = b_c.mean(0)
            moved = np.hypot(*((s2 * R2 @ c0 + t2) - (a_s * a_R @ c0 + a_t)))
            dth = abs(math.degrees(math.atan2(R2[1, 0], R2[0, 0]) - math.atan2(a_R[1, 0], a_R[0, 0])))
            if moved > max_shift or min(dth, 360 - dth) > max_rot or abs(s2 / a_s - 1) > 0.04:
                break
        done = np.allclose(s2, s, atol=1e-5) and np.allclose(t2, t, atol=1e-3)
        s, R, t = s2, R2, t2
        if done:
            break
    return s, R, t


def metrics(b_c, i_c, s, R, t, tree):
    d, _ = tree.query((s * b_c) @ R.T + t)
    pen = 0.0
    if len(i_c):
        di, _ = tree.query((s * i_c) @ R.T + t)
        pen = float((di < 1.0).mean())
    return float((d < 1.0).mean()), pen


def refine_blocks(blocks, c, s, R, t, tree, tpts):
    """切れ端の置き方から、街区ごとに少しだけ動かして合わせ直す（12m・6度・縮尺4%まで）"""
    res = []
    for bl in blocks:
        if bl["b"] is None:
            res.append(None)
            continue
        b_c, i_c = bl["b"] - c, bl["inner"] - c
        s2, R2, t2 = icp(b_c, tree, tpts, s, R, t, iters=20, lim0=3.0, anchor=(s, R, t, 12.0, 6.0))
        f1, pen = metrics(b_c, i_c, s2, R2, t2, tree)
        res.append({"s": float(s2), "theta": math.degrees(math.atan2(R2[1, 0], R2[0, 0])), "t": t2.tolist(), "f1": f1, "pen": pen, "n": len(b_c)})
    return res


def block_score(br) -> float:
    xs = [(r["n"], r["f1"] - 2 * r["pen"]) for r in br if r]
    return sum(n * v for n, v in xs) / sum(n for n, _ in xs) if xs else 0.0


def place_fragment(job):
    """1つの切れ端の置き方の候補（良い順）。プロセスで並べて動かす"""
    key, b, inner, window, poses, blocks = job
    c = b.mean(0)
    b_c, i_c = b - c, inner - c
    rad = float(np.max(np.hypot(*b_c.T)))
    pad = rad * 1.1 + 10
    tpts = near(window.bounds, pad + 10)
    if len(tpts) < 50:
        return key, c.tolist(), []
    tree = cKDTree(tpts)
    ras = Raster(tpts, window.bounds, COARSE_R, pad)
    gx, gy = np.meshgrid(ras.xs, ras.ys)
    valid = contains_xy(window, gx, gy)
    # 切れ端の中心を置かない所：公共座標の筆のある所と、もう置いた切れ端の所
    pub = [WORK["pub"][i] for i in WORK["pub_tree"].query(shapely.box(*window.bounds).buffer(pad))] if WORK.get("pub") else []
    for avoid in (unary_union(pub) if pub else None, WORK.get("avoid")):
        if avoid is not None:
            valid &= ~contains_xy(avoid, gx, gy)
    res = []
    for _, th, s, ti, tj in coarse_search(b_c, i_c, ras, valid, poses):
        t = np.array([ras.x0 + tj * ras.r, ras.y1 - ti * ras.r])
        s2, R2, t2 = icp(b_c, tree, tpts, s, rot(th), t)
        f1, pen = metrics(b_c, i_c, s2, R2, t2, tree)
        br = refine_blocks(blocks, c, s2, R2, t2, tree, tpts)
        res.append({"s": float(s2), "theta": math.degrees(math.atan2(R2[1, 0], R2[0, 0])), "t": t2.tolist(), "f1": f1, "pen": pen, "score": block_score(br), "blocks": br})
    res.sort(key=lambda r: -r["score"])
    uniq = []
    for r in res:
        if all(np.hypot(*(np.array(r["t"]) - np.array(u["t"]))) > 8 or abs((r["theta"] - u["theta"] + 180) % 360 - 180) > 5 for u in uniq):
            uniq.append(r)
    return key, c.tolist(), uniq[:5]


def transform_geom(g, c, s, theta_deg, t):
    g = affinity.translate(g, -c[0], -c[1])
    g = affinity.scale(g, s, s, origin=(0, 0))
    g = affinity.rotate(g, theta_deg, origin=(0, 0))
    return affinity.translate(g, t[0], t[1])


FULL_POSES = [(th, s) for th in np.radians(np.arange(0, 360, 3.0)) for s in (0.94, 0.98, 1.02, 1.06, 1.10)]


def judge(res, rnd: int) -> tuple[bool, float]:
    """採るか（街区ごとの合い方・2番目との差・道路縁が土地を横切っていないか）と、2番目との差"""
    if not res:
        return False, 0.0
    best, second = res[0], (res[1] if len(res) > 1 else None)
    margin = best["score"] - (second["score"] if second else 0)
    ok = best["score"] >= (0.45 if rnd == 1 else 0.42) and best["pen"] <= 0.08 and margin >= (0.08 if rnd == 1 else 0.06)
    return ok, margin


def footprint(whole, c, best):
    """置いた切れ端の形（平面直角座標の m）"""
    return transform_geom(whole, c, best["s"], best["theta"], best["t"]).buffer(0)


def drop_overlaps(items: list[tuple[str, object]], public: list | None = None) -> set[str]:
    """確かな順に並べた（名前, 形）のうち、先に残したものと大きく重なるもの（小さい方の 10% 超）と、
    公共座標の筆のある所に 10% 超かかるものの名前"""
    geoms = [g for _, g in items]
    tree = STRtree(geoms)
    pub_tree = STRtree(public) if public else None
    kept = np.zeros(len(items), bool)
    dropped = set()
    for i, (k, g) in enumerate(items):
        bad = False
        if pub_tree is not None:
            bad = sum(g.intersection(public[j]).area for j in pub_tree.query(g, predicate="intersects")) > 0.1 * g.area
        if not bad:
            bad = any(kept[j] and g.intersection(geoms[j]).area > 0.1 * min(g.area, geoms[j].area) for j in tree.query(g, predicate="intersects"))
        if bad:
            dropped.add(k)
        else:
            kept[i] = True
    return dropped


def conflict_order(q: int, score: float, size: int):
    """確かな順（q が小さい・採点が高い・大きい切れ端ほど先）"""
    return (q, -score, -size)


def resolve_conflicts(accepted: dict, info: dict, public: list | None = None) -> set[str]:
    """置いた切れ端どうしが大きく重なっていれば、確かなほうだけ残す。公共座標の筆の上に置いたものも外す。外したものの名前"""
    order = sorted(accepted, key=lambda k: conflict_order(accepted[k][2], accepted[k][1]["score"], len(info[k]["b"])))
    dropped = drop_overlaps([(k, footprint(info[k]["whole"], accepted[k][0], accepted[k][1])) for k in order], public)
    for k in dropped:
        del accepted[k]
    return dropped


def out_of_time(deadline: float | None, margin: float = 0) -> bool:
    return deadline is not None and time.time() > deadline - margin


def place_city(code: str, label: str, sheets: dict[str, list[dict]], towns: dict, jobs: int, work: str, public: list, deadline: float | None = None, min_parcels: int = 6):
    """市区町村（の図面の組）の任意座標系の図面の筆を置く。置けた筆（平面直角座標）、置いた切れ端の形、数。
    deadline（time.time() の値）を過ぎたら、そこまでに置けたものだけで終える"""
    info = {}
    frs = {}
    city_name = ""
    for sheet, parcels in sheets.items():
        for n, fr in enumerate(fragments(parcels)):
            if len(fr) < min_parcels:
                continue
            key = f"{sheet}#{n}"
            frs[key] = fr
            city_name = city_name or fr[0]["kuiki"].split("_")[0]
    log(f"{label} {city_name}: 図面 {len(sheets)}・切れ端 {len(frs)}（{min_parcels}筆以上）・筆 {sum(len(v) for v in frs.values())}・公共座標の筆 {len(public)}")
    for key, fr in frs.items():
        cnt = {}
        for p in fr:
            if not p["road"]:
                cnt[p["town"]] = cnt.get(p["town"], 0) + 1
        top = [t for t, v in sorted(cnt.items(), key=lambda kv: -kv[1]) if v >= max(2, 0.1 * len(fr))]
        polys = [towns[t] for t in top if t in towns]
        if not polys:
            polys = [a for a in (geocode_area(city_name, t) for t in top[:2]) if a is not None]
        if not polys:
            continue
        b, inner, whole = frag_points(fr)
        info[key] = {"b": b, "inner": inner, "whole": whole, "window": unary_union(polys).buffer(150), "blocks": frag_blocks(fr)}
    n_parcels = sum(len(v) for v in frs.values())
    stats = {"fragments": len(frs), "searched": len(info), "placed": 0, "parcels": n_parcels, "placed_parcels": 0, "high": 0, "public": len(public), "fgd_new": 0}
    if not info:
        return [], [], stats
    # 道路縁：全ての切れ端の調べる範囲の分だけ読む
    area = unary_union([v["window"] for v in info.values()]).buffer(200)
    tiles = tiles_for(area)
    t0 = time.time()
    lines, new = fetch_fgd(tiles, os.path.join(work, "fgd18"))
    stats["fgd_new"] = new
    if new:
        # 使ったタイルの一覧（ワークフローが組ごとにまとめて R2 に置き、次からは国土地理院に読みに行かない）
        with open(os.path.join(work, f"fgd18-{label}.txt"), "w") as f:
            f.write("".join(f"{x}_{y}.json\n" for x, y in tiles))
    pts = densify(lines, STEP)
    order = np.argsort(pts[:, 0])
    cover = public_cover(public)
    WORK.update(pts=pts[order], xs=pts[order, 0], pub=cover, pub_tree=STRtree(cover) if cover else None, avoid=None)
    log(f"  道路縁：タイル {len(tiles)}（新しく読んだ {new}）・点 {len(pts)}（{time.time() - t0:.0f}s）")

    def run(keys, posesof, avoid=None):
        """切れ端を並べて置く（大きい順）。時間が来たら、まだ始めていないものはやめる"""
        WORK["avoid"] = avoid  # プロセスを作る前に置く（fork で子に渡る）
        keys = sorted(keys, key=lambda k: -len(info[k]["b"]))
        out = {}
        with cf.ProcessPoolExecutor(jobs, mp_context=multiprocessing.get_context("fork")) as ex:
            futs = [ex.submit(place_fragment, (k, info[k]["b"], info[k]["inner"], info[k]["window"], posesof(k), info[k]["blocks"])) for k in keys]
            for fu in cf.as_completed(futs):
                if out_of_time(deadline):
                    ex.shutdown(wait=True, cancel_futures=True)
                    break
            for fu in futs:
                if fu.done() and not fu.cancelled():
                    k, c, res = fu.result()
                    out[k] = (c, res)
        if len(out) < len(keys):
            stats["cut"] = True
            log(f"::warning::{label}: 時間切れで {len(keys) - len(out)} の切れ端を調べられませんでした")
        return out

    t0 = time.time()
    accepted = {}
    r1 = run(list(info), lambda k: FULL_POSES)
    for k, (c, res) in r1.items():
        ok, margin = judge(res, 1)
        if ok:
            accepted[k] = (c, res[0], 1 if margin >= 0.15 and res[0]["score"] >= 0.5 else 2)
    dropped = resolve_conflicts(accepted, info, cover)
    log(f"  1回目：{len(accepted)}/{len(info)}（重なりで外した {len(dropped)}）（{time.time() - t0:.0f}s）")
    # 2回目以降は、1回目にそこそこ合う候補があった切れ端だけ（候補の差が小さくて採れなかったもの）
    hopeful = {k for k, (c, res) in r1.items() if res and res[0]["score"] >= 0.35}
    for rnd in range(2, 4):
        clusters: dict[str, list] = {}
        for k, (c, best, _) in accepted.items():
            clusters.setdefault(k.split("#")[0], []).append((best["theta"], best["s"]))
        rest = [k for k in info if k not in accepted and k in hopeful]
        if not rest or not clusters:
            break
        if out_of_time(deadline, 120):
            stats["cut"] = True
            log(f"::warning::{label}: 時間切れで {rnd}回目から先は調べませんでした")
            break

        def near_poses(k):
            cs = clusters.get(k.split("#")[0]) or [v for vs in clusters.values() for v in vs]
            # 向きは 2 度、縮尺は 0.02 刻みにそろえて、同じような姿勢を何度も調べない
            ps = set()
            for a, s_ in cs:
                for da in range(-8, 9, 2):
                    for ds in (-0.03, 0.0, 0.03):
                        ps.add((round((a + da) / 2) * 2, round((s_ + ds) / 0.02) * 0.02))
            return sorted((math.radians(a), round(s_, 2)) for a, s_ in ps)

        placed_area = unary_union([footprint(info[k]["whole"], c, b) for k, (c, b, _) in accepted.items()]).buffer(-3)
        r2 = run(rest, near_poses, avoid=placed_area)
        new = 0
        for k, (c, res) in r2.items():
            if judge(res, rnd)[0]:
                accepted[k] = (c, res[0], 2)
                new += 1
        dropped = resolve_conflicts(accepted, info, cover)
        log(f"  {rnd}回目：+{new}（重なりで外した {len(dropped)}）（{time.time() - t0:.0f}s）")
        if not new:
            break
    # 置いた筆：土地の筆は街区ごとの置き方（合わせ直しが良くなったときだけ）、道路・水路の筆は切れ端の置き方
    out, shapes = [], []
    for k, (c, best, q) in accepted.items():
        fr = frs[k]
        pose = {i: (best["s"], best["theta"], best["t"]) for i in range(len(fr))}
        for bl, br in zip(info[k]["blocks"], best["blocks"]):
            if br and br["f1"] - 2 * br["pen"] > 0.3:
                for i in bl["members"]:
                    pose[i] = (br["s"], br["theta"], br["t"])
        for i, p in enumerate(fr):
            out.append((p, transform_geom(p["geom"], c, *pose[i]), q, k, round(best["score"], 2)))
        shapes.append((k, q, round(best["score"], 3), len(info[k]["b"]), footprint(info[k]["whole"], c, best)))
    stats.update(placed=len(accepted), placed_parcels=len(out), high=sum(1 for o in out if o[2] == 1))
    return out, shapes, stats


def to_ll(g):
    m = mapping(g)

    def conv(q):
        if isinstance(q[0], (float, int)):
            x, y = TO_LL.transform(q[0], q[1])
            return [round(x, 7), round(y, 7)]
        return [conv(qq) for qq in q]

    return {"type": m["type"], "coordinates": conv(m["coordinates"])}


def plan(prefs: list[str], year: str | None, chunk_mb: float) -> dict:
    """都県の地図XMLの zip（市区町村ごと）を、大きさで束ねてジョブに分ける（GitHub Actions の matrix）。年を省けば一番新しい年。
    chunk_mb より大きい市区町村は、図面をいくつかの組に分けて別のジョブにする（「12219:2/3」）"""
    zips = []
    for pref in prefs:
        data = json.loads(get(f"{CKAN}?fq=organization:{ORGS[pref]}&rows=1000"))
        for pkg in data["result"]["results"]:
            for res in pkg["resources"]:
                m = re.match(r"^(\d{5})-\d+-(\d{4})\.zip$", res.get("name") or "")
                if m:
                    zips.append((m.group(1), m.group(2), int(res.get("size") or 0)))
    year = year or max(y for _, y, _ in zips)
    sizes: dict[str, int] = {}
    for code, y, size in zips:
        if y == year:
            sizes[code] = sizes.get(code, 0) + size
    items: list[tuple[str, float]] = []
    for code, size in sizes.items():
        mb = size / 1e6
        n = max(1, math.ceil(mb / chunk_mb))
        items += [(code if n == 1 else f"{code}:{i}/{n}", mb / n) for i in range(1, n + 1)]
    # 大きい順に、束の合計が chunk_mb を超えないように詰める
    chunks: list[list[str]] = []
    room: list[float] = []
    for item, mb in sorted(items, key=lambda kv: (-kv[1], kv[0])):
        for i, r in enumerate(room):
            if mb <= r:
                chunks[i].append(item)
                room[i] -= mb
                break
        else:
            chunks.append([item])
            room.append(chunk_mb - mb)
    return {"year": year, "chunks": [",".join(sorted(c)) for c in chunks], "municipalities": len(sizes), "mb": round(sum(sizes.values()) / 1e6)}


def read_lines(path: str):
    with (gzip.open(path, "rt", encoding="utf-8") if path.endswith(".gz") else open(path, encoding="utf-8")) as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def resolve(src: str, out: str, stats_out: str | None) -> None:
    """ジョブごとの結果（src の kozu-*.geojsonl・frags-*.jsonl・stats-*.json。.gz でもよい）をまとめる。
    ジョブ（図面の組・市区町村）をまたいで大きく重なった切れ端は、確かなほうだけ残し、タイルにする筆（地番区域・地番・q）を書き出す"""
    frags = [d for p in sorted(glob.glob(os.path.join(src, "frags-*.jsonl*"))) for d in read_lines(p)]
    frags.sort(key=lambda d: conflict_order(d["q"], d["sc"], d["n"]))
    dropped = drop_overlaps([(d["f"], shapely.from_wkt(d["g"])) for d in frags])
    log(f"切れ端 {len(frags)}・ジョブをまたいで重なり外した {len(dropped)}")
    per_code: dict[str, dict] = {}
    n = 0
    with open(out, "w", encoding="utf-8") as fo:
        for p in sorted(glob.glob(os.path.join(src, "kozu-*.geojsonl*"))):
            for d in read_lines(p):
                pr = d["properties"]
                if pr["f"] in dropped:
                    continue
                code = pr["f"].split(":")[0]
                per_code.setdefault(code, {"placed_parcels": 0})["placed_parcels"] += 1
                d["properties"] = {"地番区域": pr["地番区域"], "地番": pr["地番"], "q": pr["q"]}
                fo.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n")
                n += 1
    # 市区町村ごとの数（図面の組を足す）と、時間切れ・失敗したもの
    jobs = {}
    for p in sorted(glob.glob(os.path.join(src, "stats-*.json"))):
        jobs.update(json.load(open(p, encoding="utf-8")))
    totals: dict[str, dict] = {}
    for lab, st in jobs.items():
        t = totals.setdefault(lab.split("-")[0], {})
        for k in ("fragments", "searched", "parcels"):
            t[k] = t.get(k, 0) + st.get(k, 0)
        # 公共座標の筆は、どの組も市区町村の全部を数えている
        t["public"] = max(t.get("public", 0), st.get("public", 0))
    for code, t in totals.items():
        t["placed_parcels"] = per_code.get(code, {}).get("placed_parcels", 0)
    summary = {
        "codes": sorted(c for c, t in totals.items() if t["placed_parcels"]),
        "parcels": sum(t["parcels"] for t in totals.values()),
        "placed_parcels": n,
        "cut": sorted(lab for lab, st in jobs.items() if st.get("cut")),
        "errors": {lab: st["error"] for lab, st in jobs.items() if st.get("error")},
        "by_code": totals,
    }
    log(f"筆 {summary['parcels']} のうち {n} を置いた（{n / max(1, summary['parcels']):.0%}）・市区町村 {len(summary['codes'])}/{len(totals)}")
    if summary["cut"]:
        log(f"::warning::時間切れ: {', '.join(summary['cut'])}")
    for lab, e in summary["errors"].items():
        log(f"::warning::失敗 {lab}: {e}")
    if stats_out:
        json.dump(summary, open(stats_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", help="都県コード（カンマ区切り）。ジョブの分け方を JSON で書き出すだけ")
    ap.add_argument("--chunk-mb", type=float, default=100, help="1つのジョブで扱う地図XMLの zip の大きさの目安（MB）")
    ap.add_argument("--codes", help="市区町村コード（カンマ区切り。政令市は区。「12219:2/3」は図面を3組に分けた2組目）")
    ap.add_argument("--year", help="地図XMLの年（省略時は一番新しい年）")
    ap.add_argument("--out", help="置けた筆の GeoJSON の行（追記しない）")
    ap.add_argument("--frags", help="置いた切れ端の形（--resolve で使う）")
    ap.add_argument("--stats", help="数を書く JSON")
    ap.add_argument("--minutes", type=float, help="この分数が過ぎたら、そこまでに置けたもので終える（GitHub Actions のジョブの時間の上限より短く）")
    ap.add_argument("--resolve", help="ジョブごとの結果の置き場。まとめて --out に書き出す")
    ap.add_argument("--work", default="work")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--sheets", help="この地図名だけ（試すとき。カンマ区切り）")
    a = ap.parse_args()
    if a.plan:
        print(json.dumps(plan(a.plan.split(","), a.year, a.chunk_mb), ensure_ascii=False))
        return
    if a.resolve:
        if not a.out:
            ap.error("--out が要ります")
        resolve(a.resolve, a.out, a.stats)
        return
    if not a.codes or not a.out:
        ap.error("--codes と --out が要ります")
    deadline = time.time() + a.minutes * 60 if a.minutes else None
    items = [parse_item(s) for s in a.codes.split(",")]
    a.year = a.year or plan([items[0][0][:2]], None, 1e9)["year"]
    os.makedirs(a.work, exist_ok=True)
    all_stats = {}
    with open(a.out, "w", encoding="utf-8") as fo, open(a.frags or os.devnull, "w", encoding="utf-8") as ff:
        for idx, (code, i, n) in enumerate(items):
            label = item_label(code, i, n)
            if out_of_time(deadline, 600):
                log(f"::warning::{label}: 時間切れで調べませんでした")
                all_stats[label] = {"cut": True}
                continue
            t0 = time.time()
            zp = None
            try:
                zp = moj_zip(code, a.year, a.work)
                sheets, public = read_zip(zp)
                sheets = split_sheets(sheets, i, n)
                if a.sheets:
                    sheets = {k: v for k, v in sheets.items() if k in a.sheets.split(",")}
                if not sheets:
                    log(f"{label}: 任意座標系の図面はありません")
                    all_stats[label] = {"fragments": 0, "placed": 0, "public": len(public)}
                    continue
                towns = estat_towns(code, a.work)
                placed, shapes, stats = place_city(code, label, sheets, towns, a.jobs, a.work, public, deadline)
            except Exception as e:  # 1つの市区町村の失敗で、ジョブ全体を止めない（まとめるときに数える）
                traceback.print_exc()
                log(f"::warning::{label}: {type(e).__name__}: {e}")
                all_stats[label] = {"error": f"{type(e).__name__}: {e}"}
                continue
            finally:
                if zp and not os.environ.get("KOZU_KEEP_ZIP") and all(c != code for c, _, _ in items[idx + 1 :]):
                    os.remove(zp)
            for p, g, q, k, sc in placed:
                props = {"地番区域": p["kuiki"], "地番": p["chiban"], "q": q, "sc": sc, "f": f"{code}:{k}"}
                fo.write(json.dumps({"type": "Feature", "properties": props, "geometry": to_ll(g)}, ensure_ascii=False, separators=(",", ":")) + "\n")
            for k, q, sc, size, g in shapes:
                g = g.simplify(0.5)
                ff.write(json.dumps({"f": f"{code}:{k}", "q": q, "sc": sc, "n": size, "g": shapely.to_wkt(g, rounding_precision=1)}, ensure_ascii=False) + "\n")
            stats["seconds"] = round(time.time() - t0)
            all_stats[label] = stats
            log(f"{label}: {json.dumps(stats, ensure_ascii=False)}")
    if a.stats:
        json.dump(all_stats, open(a.stats, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
