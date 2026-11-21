#!/usr/bin/env python3
"""夜の街の明かり（PC のホームの背景の「夜」）を、人口から作る。明かりは人が住んでいる所にだけ出す（作り物の明かりは足さない）。

  python3 night_lights.py             # → work/night_lights.npy・.png・.json（home_prep.py の格子）と、広い版の night_lights_w.*
  python3 night_lights.py --wide      # 広い版（home_prep.py --wide の格子）だけ
  python3 night_lights.py --no-ghsl   # 国勢調査の範囲だけ（日本のまわりの国は暗いまま。前の版）

人口：政府統計の総合窓口（e-Stat）の「令和2年国勢調査に関する地域メッシュ統計」4次メッシュ（500m）の「人口及び世帯（JGD2011）」
（統計表 T001141、2024-03-14 公開）の「人口（総数）」。e-Stat の統計地理情報システムの「統計データダウンロード」から、
第1次地域区画（緯度 40 分×経度 1 度）ごとの CSV（zip）を取る。1回ずつ WAIT 秒あけ、取ったものは work/estat/ に置いて
2回目からは読み直さない。人口（総数）は秘匿しない項目（定義書）なので、秘匿対象のメッシュにも本当の数が入っている。
出典の書き方（e-Stat の利用規約。加工したことも書く）は ATTRIBUTION。

国勢調査の範囲の外（韓国・中国・ロシアなど、日本のまわりの国）：欧州委員会 共同研究センター（JRC）の GHSL の人口の格子
（GHS-POP R2023A の 2020 年。約 1km。ghsl.py。CC BY 4.0）を、同じ明るさの式で使う。国勢調査の範囲は、人の住む 500m メッシュに
触れる画素を COVER_KM 広げたものと、そのメッシュのある島の陸の全部と、それに囲まれた所。その中は国勢調査だけを使い、GHSL は
使わない（同じ人を2回数えない。2020 年に人の住めなかった所に、GHSL の人口で明かりを出さない）。
出典は ATTRIBUTION と ghsl.ATTRIBUTION の両方を書く。

格子：home_prep.py が作った work/home_dem{,_w}.json・.npy と同じ（メルカトル図法。タイルの番号 x0・y0 とズーム z、256 画素/タイル）。
500m のメッシュ（緯度・経度の四角）は、メルカトルでも横・縦にまっすぐな四角になるので、重なる画素に面積の割合で人数を分ける。

明かりの強さ：画素ごとの人口密度（人/km²）の GAMMA 乗（大きな街ほど明るいが、人の数ほどには増えない）を、REF 人/km² で 1 にする。
人がとても少ない所（LOW 人/km² より少ない）はなめらかに消す。街のまわりに少しにじみ（空気で散る光。Blender の光のにじみの
下地）を足す。海の上のにじみは弱める。

出力（どれも格子と同じ大きさ。行は北→南）
  night_lights{,_w}.npy   明かりの強さ（線形、float32）
  night_lights{,_w}.png   同じもの÷scale を sRGB の 8 bit にしたもの（Blender は sRGB として読むと線形に戻る。home.py --tod が使う）
  night_lights{,_w}.json  格子・scale・人口の合計・出典
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import ghsl  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
CACHE = os.path.join(WORK, "estat")
TILE = 256
EARTH = 40075016.7  # 赤道の長さ（m）

# e-Stat（統計地理情報システム）。一般的な名前だけ（個人の情報・アプリの名前は入れない）
UA = {"User-Agent": "map-build-script/1.0 (static map background; cached; one request at a time)"}
WAIT = 1.5  # 1回ずつ、少なくともこれだけ間をあける（秒）
STATS = "T001141"  # 令和2年国勢調査 4次メッシュ（500m）人口及び世帯（JGD2011）
LIST = "https://www.e-stat.go.jp/gis/statmap-search/search_detail?" + urllib.parse.urlencode(
    {
        "type": 1,
        "toukeiCode": "00200521",  # 国勢調査
        "toukeiYear": 2020,
        "aggregateUnit": "H",  # 4次メッシュ（500m）
        "serveyId": "H002005112020",
        "statsId": STATS,
        "releaseDate": "2024-03-14",
        "datum": "2011",
        "download_disp_flg": 1,
        "stat_def_flg": 1,
    }
)
DATA = "https://www.e-stat.go.jp/gis/statmap-search/data?statsId={stats}&code={code}&downloadType=2"
ATTRIBUTION = (
    "夜の街の明かり：政府統計の総合窓口（e-Stat）（https://www.e-stat.go.jp/）の"
    "「令和2年国勢調査に関する地域メッシュ統計」（総務省）の500mメッシュの人口を加工して作成"
)

# 明かりの強さ（上の説明）
GAMMA = 0.75
REF = 10000.0  # 人/km²
LOW = (8.0, 60.0)  # 人/km²：この間でなめらかに 0 → 1
HALO = ((0.12, 1.2), (0.04, 5.0))  # にじみ（強さ、広がり＝ズーム 7 の画素。約 1km・4km）
HALO_SEA = 0.4  # 海の上のにじみ（陸の上を 1 として）
COVER_KM = 10.0  # 国勢調査の範囲：人の住むメッシュからこれより近い所（その外だけ GHSL の人口を使う。国勢調査の外の近い町（釜山・サハリン・国後島）も 30km より遠い）

_last = 0.0


def get(url: str, timeout: int = 180, tries: int = 5) -> bytes:
    """1回ずつ、WAIT 秒あけて読む（だめなら待って読み直す）"""
    global _last
    for i in range(tries):
        time.sleep(max(0.0, _last + WAIT - time.time()))
        _last = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or i == tries - 1:
                raise
        except Exception:
            if i == tries - 1:
                raise
        time.sleep(5 * 2**i)
    raise RuntimeError(url)


def mesh_codes() -> list[str]:
    """e-Stat に人口の CSV がある第1次地域区画（4 桁）の一覧（work/estat/ に覚える）"""
    path = os.path.join(CACHE, f"{STATS}_codes.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)["codes"]
    codes: list[str] = []
    total, page, pages = None, 1, 1
    while page <= pages:
        d = json.loads(get(f"{LIST}&page={page}"))
        codes += re.findall(rf"statsId={STATS}&(?:amp;)?code=(\d{{4}})&(?:amp;)?downloadType=2", d.get("detail") or "")
        m = re.search(r"(\d+)/(\d+)ページ", re.sub(r"<[^>]+>", "", d.get("paginate") or ""))
        pages = int(m.group(2)) if m else pages
        m = re.search(r"([\d,]+)\s*件", re.sub(r"<[^>]+>", " ", d.get("side_mega") or ""))
        total = int(m.group(1).replace(",", "")) if m else total
        page += 1
    codes = sorted(set(codes))
    if not codes or (total is not None and len(codes) != total):
        raise RuntimeError(f"一覧が読めない（{len(codes)} 件／{total} 件）。e-Stat のページの作りが変わったかもしれない")
    os.makedirs(CACHE, exist_ok=True)
    with open(path, "w") as f:
        json.dump({"stats": STATS, "list": LIST, "codes": codes}, f, ensure_ascii=False, indent=1)
    return codes


def fetch(code: str) -> str:
    path = os.path.join(CACHE, f"tbl{STATS}H{code}.zip")
    if os.path.exists(path) and zipfile.is_zipfile(path):
        return path
    data = get(DATA.format(stats=STATS, code=code))
    if not data.startswith(b"PK"):
        raise RuntimeError(f"{code}: zip ではないものが返った（{data[:80]!r}）")
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    return path


def population() -> tuple[np.ndarray, np.ndarray]:
    """4次メッシュ（9 桁）の番号と人口（総数）。全部を読んで work/estat/ に覚える"""
    path = os.path.join(CACHE, f"{STATS}_pop.npz")
    if os.path.exists(path):
        z = np.load(path)
        return z["code"], z["pop"]
    codes = mesh_codes()
    keys: list[int] = []
    pops: list[int] = []
    for i, c in enumerate(codes):
        zp = fetch(c)
        with zipfile.ZipFile(zp) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".txt"))
            text = io.TextIOWrapper(io.BytesIO(z.read(name)), encoding="cp932")
            head = text.readline().rstrip("\r\n").split(",")
            text.readline()  # 2 行目は項目の名前
            k, p = head.index("KEY_CODE"), head.index(f"{STATS}001")  # 人口（総数）
            for line in text:
                f = line.rstrip("\r\n").split(",")
                if len(f) <= p or not f[k].isdigit() or len(f[k]) != 9:
                    continue
                keys.append(int(f[k]))
                pops.append(int(f[p]) if f[p].isdigit() else 0)  # 人口（総数）は秘匿されないが、念のため
        print(f"\r{i + 1}/{len(codes)} {c}  {len(keys)} メッシュ", end="", flush=True)
    print()
    code, pop = np.array(keys, np.int64), np.array(pops, np.int32)
    np.savez_compressed(path, code=code, pop=pop)
    return code, pop


def mesh_sw(code: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """4次メッシュ（2分の1地域メッシュ）の番号 → 南西の角の緯度・経度（度）。
    1次（緯度 40 分×経度 1 度）pp uu、2次（8 分割）q v、3次（10 分割）r w、4次（2 分割。1 南西・2 南東・3 北西・4 北東）m"""
    c = code.astype(np.int64)
    p, u = c // 10**7, (c // 10**5) % 100
    q, v = (c // 10**4) % 10, (c // 10**3) % 10
    r, w = (c // 100) % 10, (c // 10) % 10
    m = c % 10 - 1
    lat = p / 1.5 + q * 5 / 60 + r * 30 / 3600 + (m // 2) * 15 / 3600
    lon = u + 100 + v * 7.5 / 60 + w * 45 / 3600 + (m % 2) * 22.5 / 3600
    return lat, lon


def merc_y(lat: np.ndarray) -> np.ndarray:
    return (1.0 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2.0


def splat(H: int, W: int, x0, x1, y0, y1, val) -> np.ndarray:
    """横・縦にまっすぐな四角（画素の単位）に一様にある量を、重なる画素に面積の割合で分ける"""
    ix, iy = np.floor(x0).astype(np.int64), np.floor(y0).astype(np.int64)
    kx, ky = int(np.ceil((x1 - x0).max())) + 1, int(np.ceil((y1 - y0).max())) + 1
    idx, wts = [], []
    for a in range(kx):
        cx = ix + a
        ox = np.clip(np.minimum(x1, cx + 1) - np.maximum(x0, cx), 0.0, None) / (x1 - x0)
        for b in range(ky):
            cy = iy + b
            oy = np.clip(np.minimum(y1, cy + 1) - np.maximum(y0, cy), 0.0, None) / (y1 - y0)
            wv = val * ox * oy
            ok = (wv > 0) & (cx >= 0) & (cx < W) & (cy >= 0) & (cy < H)
            idx.append(cy[ok] * W + cx[ok])
            wts.append(wv[ok])
    return np.bincount(np.concatenate(idx), weights=np.concatenate(wts), minlength=H * W).reshape(H, W)


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def merc_lat(y: float) -> float:
    """メルカトルの縦の位置（0〜1。北が 0）→ 緯度（度）"""
    return float(np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * y)))))


# 人口のわりに夜の明かりがとても少ない所（GHSL の人口にかける係数）。北朝鮮は、夜の衛星写真で平壌のほかは街の明かりが
# ほとんど見えない（人口から決めると、韓国と同じくらい光ってしまう）。見え方を本物の夜の衛星写真に近づけるための係数で、
# 測った値ではない。国境はおおよそ（数 km の違いは、この絵の大きさでは見えない。海の上も含めてよい）。経度・緯度の多角形
DIM_ABROAD = [
    (
        "北朝鮮",
        0.05,
        [
            (124.25, 39.75), (124.45, 40.05), (124.9, 40.45), (125.4, 40.65), (126.0, 41.05), (126.6, 41.65), (127.2, 41.5),
            (128.0, 41.6), (128.1, 42.0), (128.9, 42.1), (129.3, 42.4), (129.75, 42.85), (130.25, 42.75), (130.6, 42.45),
            (130.70, 42.29), (131.2, 42.0), (131.2, 38.6), (128.37, 38.62), (128.0, 38.33), (127.5, 38.30), (127.1, 38.18),
            (126.68, 37.96), (126.3, 37.80), (126.0, 37.72), (124.5, 37.6), (124.0, 38.5), (124.0, 39.6),
        ],
    ),
]


def dim_map(H: int, W: int, px, py) -> np.ndarray:
    """DIM_ABROAD の係数の地図（格子の画素ごと。外は 1。境目は少しぼかす）"""
    from PIL import ImageDraw

    out = np.ones((H, W), np.float32)
    for _, factor, poly in DIM_ABROAD:
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon([(float(px(lo)), float(py(la))) for lo, la in poly], fill=255)
        m = ndimage.gaussian_filter(np.asarray(mask, np.float32) / 255.0, 2.0)
        out *= 1.0 - (1.0 - factor) * m
    return out


def build(suffix: str, code: np.ndarray, pop: np.ndarray, use_ghsl: bool = True) -> None:
    with open(os.path.join(WORK, f"home_dem{suffix}.json")) as f:
        meta = json.load(f)
    dem = np.load(os.path.join(WORK, f"home_dem{suffix}.npy"))
    H, W = dem.shape
    z, gx0, gy0 = meta["z"], meta["x0"], meta["y0"]
    n = 2.0**z
    lat, lon = mesh_sw(code)
    dlat, dlon = 15 / 3600, 22.5 / 3600

    def px(lo):  # 経度 → 格子の横の位置（画素）
        return ((lo + 180.0) / 360.0 * n - gx0) * TILE

    def py(la):  # 緯度 → 格子の縦の位置（画素。北が 0）
        return (merc_y(la) * n - gy0) * TILE

    people = splat(H, W, px(lon), px(lon + dlon), py(lat + dlat), py(lat), pop.astype(np.float64))
    inside = int(round(people.sum()))
    outside = 0
    if use_ghsl:
        # 国勢調査の範囲：人の住むメッシュに触れる画素から COVER_KM（画素の幅は北緯 36 度で測る）と、そのメッシュのある島の陸の
        # 全部（人の住まない山や、2020 年に人の住めなかった原発事故の帰還困難区域も。GHSL はそこにも人を置いている）と、
        # それに囲まれた所
        touched = splat(H, W, px(lon), px(lon + dlon), py(lat + dlat), py(lat), np.ones(len(pop))) > 0
        km = EARTH * np.cos(np.radians(36.0)) / (TILE * n) / 1000.0
        cover = ndimage.distance_transform_edt(~touched) <= COVER_KM / km
        isl, _ = ndimage.label(dem > 0)
        ids = np.unique(isl[touched])
        cover |= np.isin(isl, ids[ids > 0])
        cover = ndimage.binary_fill_holes(cover)
        del touched, isl
        # その外だけ、GHSL の人口（同じ格子に面積の割合で分けたもの）を足す
        bbox = (gx0 / n * 360 - 180, merc_lat((gy0 + H / TILE) / n), (gx0 + W / TILE) / n * 360 - 180, merc_lat(gy0 / n))
        abroad, _ = ghsl.people_on_grid(H, W, px, py, bbox)
        abroad[cover] = 0.0
        abroad *= dim_map(H, W, px, py)
        outside = int(round(abroad.sum()))
        people += abroad
        del abroad, cover
    # 画素の面積（km²）は緯度で変わる（行ごと）
    rows = np.arange(H) + 0.5
    rlat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (gy0 + rows / TILE) / n))))
    area = (EARTH * np.cos(np.radians(rlat)) / (TILE * n) / 1000.0) ** 2
    dens = people / area[:, None]
    core = (dens / REF) ** GAMMA * smoothstep(LOW[0], LOW[1], dens)
    # にじみ（広がりは地面の上の長さで決める。ズーム 7 の画素が基準）
    k = 2.0 ** (z - 7)
    halo = sum(s * ndimage.gaussian_filter(core, r * k, mode="constant") for s, r in HALO)
    land = np.clip((dem + 4.0) / 8.0, 0.0, 1.0)  # home_prep.py の陸の割合と同じ
    light = (core + halo * (HALO_SEA + (1 - HALO_SEA) * land)).astype(np.float32)
    scale = float(light.max())
    np.save(os.path.join(WORK, f"night_lights{suffix}.npy"), light)
    png = (to_srgb(light / scale) * 255.0 + 0.5).astype(np.uint8)
    Image.fromarray(png, mode="L").save(os.path.join(WORK, f"night_lights{suffix}.png"), optimize=True)
    info = {
        "z": z,
        "x0": gx0,
        "y0": gy0,
        "size": [W, H],
        "scale": scale,
        "gamma": GAMMA,
        "ref_per_km2": REF,
        "population": int(pop.sum()),
        "population_in_grid": inside,
        "max_density_per_km2": float(dens.max()),
        "stats": STATS,
        "source": DATA.format(stats=STATS, code="{第1次地域区画}"),
        "attribution": ATTRIBUTION,
    }
    if use_ghsl:
        info["outside_census"] = {
            "cover_km": COVER_KM,
            "population_in_grid": outside,
            "dataset": ghsl.NAME,
            "source": ghsl.TILE_URL,
            "license": ghsl.LICENSE_URL,
            "doi": ghsl.DOI,
            "citation": ghsl.CITATION,
            "attribution": ghsl.ATTRIBUTION,
        }
    with open(os.path.join(WORK, f"night_lights{suffix}.json"), "w") as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    lit = core > 0.002
    print(
        f"night_lights{suffix}: {W}×{H}（ズーム {z}）国勢調査の人口 {inside:,} 人を格子に（全体 {int(pop.sum()):,} 人）"
        f"{f'、国勢調査の範囲の外（GHSL）{outside:,} 人' if use_ghsl else ''}。"
        f"いちばん混む画素 {dens.max():,.0f} 人/km²、明かりのある画素 {lit.mean() * 100:.1f}%（陸の {lit[land > 0.5].mean() * 100:.0f}%）、scale {scale:.3f}"
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wide", action="store_true", help="広い版（home_prep.py --wide の格子）だけ")
    ap.add_argument("--no-ghsl", action="store_true", help="国勢調査の範囲だけ（GHSL の人口を足さない）")
    a = ap.parse_args()
    code, pop = population()
    print(f"4次メッシュ {len(code):,}、人口の合計 {int(pop.sum()):,} 人")
    for suffix in ["_w"] if a.wide else ["", "_w"]:
        if os.path.exists(os.path.join(WORK, f"home_dem{suffix}.npy")):
            build(suffix, code, pop, use_ghsl=not a.no_ghsl)
        else:
            print(f"work/home_dem{suffix}.npy が無い（先に home_prep.py{' --wide' if suffix else ''}）", file=sys.stderr)


if __name__ == "__main__":
    main()
