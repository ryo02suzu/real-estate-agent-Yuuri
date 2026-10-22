#!/usr/bin/env python3
"""
物件の地点で使う国のデータを、国土交通省「不動産情報ライブラリ」の API と国土数値情報から作る（.github/workflows/reinfolib.yml が
R2 に置き、lib/roadmap/data/reinfolib-source.json に置き場所を書く）。アプリは物件のまわりの分だけを読む。

作るもの（--out の下。*.json は gzip で書き、R2 には Content-Encoding: gzip で置く）:
  liq/<2次メッシュ>.json     液状化の発生傾向（API XKT025。国土交通省都市局「地形区分に基づく液状化の発生傾向図」）。
                             250m メッシュごとの発生傾向の区分と微地形区分
  pop/<2次メッシュ>.json     将来推計人口（国土数値情報 250m メッシュ別将来推計人口 R6国政局推計。CC BY 4.0）。
                             250m メッシュごとに、まわり 5×5 メッシュ（約1.25km四方）の合計人口の推移と年少・高齢の割合
  zousei.pmtiles             大規模盛土造成地（API XKT020。国土数値情報 A54）。z14
  rireki.pmtiles             災害履歴（API XST001。国土調査の土地履歴調査）。z14
  facilities.pmtiles         医療機関（国土数値情報 P04 2020年度）と幼稚園・認定こども園（国土数値情報 P29 2023年度。CC BY 4.0）。z14
                             保育所（福祉施設 P14）は神奈川県・横浜市が保育関係の商用利用・公開を認めていないので入れない
  ridership.json             駅別乗降客数（API XKT015。国土数値情報 S12）
  appraisal/<x>/<y>.json     地価公示の鑑定評価書（API XCT001）。標準地の地点の z13 タイルごと
  meta.json                  時点・件数など（ワークフローが reinfolib-source.json に写す）

API キーは環境変数 REINFOLIB_API_KEY（GitHub の Secrets に登録する。会話やコードには書かない）。API を使うデータは、キーが無ければ作らない。
API は間を空けて呼ぶ（約款：短い時間に多く呼ぶと止められることがある）。画面には API の約款の文（lib/roadmap/reinfolib.ts）と出典を出す。

  REINFOLIB_API_KEY=... python3 scripts/reinfolib/build.py --out work/reinfolib --work work/tmp   # 全部
  python3 scripts/reinfolib/build.py --out work/reinfolib --only pop,fac                          # キーの要らないものだけ
  python3 scripts/reinfolib/build.py --self-test                                                 # 変換のテスト（通信しない）
  REINFOLIB_API_KEY=... python3 scripts/reinfolib/build.py --probe                               # 各 API の返り方をログに出す
必要なもの: tippecanoe（2.79 以上。zousei・rireki・fac）
"""
import argparse
import datetime
import gzip
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import zipfile

API = "https://www.reinfolib.mlit.go.jp/ex-api/external/"
UA = "michilu-reinfolib (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"
PAUSE = 0.25
PREFS = ("08", "09", "10", "11", "12", "13", "14")
# 関東1都6県と、そのまわり（scripts/stations と同じ。県境の近くの物件も、となりの県の分まで読める）
BBOX = (138.3, 34.8, 141.0, 37.25)
DATASETS = ("liq", "zousei", "rireki", "ridership", "appraisal", "pop", "fac")
NEEDS_KEY = {"liq", "zousei", "rireki", "ridership", "appraisal"}

POP_URL = "https://nlftp.mlit.go.jp/ksj/gml/data/m250r6/m250r6-24/250m_mesh_2024_{pref}_GEOJSON.zip"
P04_URL = "https://nlftp.mlit.go.jp/ksj/gml/data/P04/P04-20/P04-20_{pref}_GML.zip"
P29_URL = "https://nlftp.mlit.go.jp/ksj/gml/data/P29/P29-23/P29-23_{pref}_GML.zip"


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- 通信


def fetch(api: str, params: dict, key: str, tries: int = 5):
    """API を呼んで JSON を返す。データが無い（404）ときは None。gzip で返ってくるので戻す"""
    url = API + api + "?" + "&".join(f"{k}={v}" for k, v in params.items())
    for i in range(tries):
        req = urllib.request.Request(url, headers={"Ocp-Apim-Subscription-Key": key, "Accept-Encoding": "gzip", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                body = res.read()
            if body[:2] == b"\x1f\x8b":
                body = gzip.decompress(body)
            time.sleep(PAUSE)
            return json.loads(body.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                time.sleep(PAUSE)
                return None
            if e.code in (401, 403):
                sys.exit(f"API キーが使えません（HTTP {e.code}）。GitHub の Secrets の REINFOLIB_API_KEY を確かめてください")
            if i == tries - 1:
                raise
            log(f"  HTTP {e.code}、待って読み直す: {api} {params}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if i == tries - 1:
                raise
            log(f"  読めない（{e}）、待って読み直す: {api} {params}")
        time.sleep(15 * (i + 1))
    return None


def download(url: str, tries: int = 4) -> bytes:
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=600) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if i == tries - 1:
                raise
            log(f"  読めない（{e}）、待って読み直す: {url}")
            time.sleep(15 * (i + 1))
    raise RuntimeError(url)


def geojson_in_zip(data: bytes) -> dict:
    """国土数値情報の zip の中の GeoJSON（UTF-8 か Shift_JIS）"""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".geojson"))
        raw = z.read(name)
    for enc in ("utf-8-sig", "cp932"):
        try:
            return json.loads(raw.decode(enc))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"{name} の文字コードが読めません")


# ---------------------------------------------------------------- タイル・メッシュ


def tile_of(lat: float, lng: float, z: int):
    n = 2**z
    r = math.radians(lat)
    return int((lng + 180) / 360 * n), int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)


def tile_bounds(z: int, x: int, y: int):
    """(西, 南, 東, 北)"""
    n = 2**z

    def lat(yy):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))

    return x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)


def tiles_in(z: int, bbox=BBOX):
    w, s, e, n = bbox
    x0, y0 = tile_of(n, w, z)
    x1, y1 = tile_of(s, e, z)
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


# 地域メッシュ（JIS X 0410）の区画の大きさ（秒）。1次・2次・3次・2分の1・4分の1（lib/roadmap/mesh.ts と同じ）
SIZES = ((2400, 3600), (300, 450), (30, 45), (15, 22.5), (7.5, 11.25))


def mesh250(lat: float, lng: float) -> str:
    y, x = lat * 3600, (lng - 100) * 3600
    code = ""
    for i, (h, w) in enumerate(SIZES):
        r, c = math.floor(y / h + 1e-9), math.floor(x / w + 1e-9)
        y -= r * h
        x -= c * w
        code += f"{r}{c}" if i < 3 else str(r * 2 + c + 1)
    return code


def mesh_sw(code: str):
    """250m メッシュの南西の角（緯度・経度の秒。経度は 100 度からの秒）"""
    lat = int(code[0:2]) * 2400 + int(code[4]) * 300 + int(code[6]) * 30
    lng = int(code[2:4]) * 3600 + int(code[5]) * 450 + int(code[7]) * 45
    for i, (h, w) in ((8, SIZES[3]), (9, SIZES[4])):
        d = int(code[i]) - 1
        lat += (d // 2) * h
        lng += (d % 2) * w
    return lat, lng


def grid_of(code: str):
    """250m メッシュの通し番号（南から・西から）"""
    lat, lng = mesh_sw(code)
    return round(lat / 7.5), round(lng / 11.25)


def code_of_grid(r: int, c: int) -> str:
    return mesh250((r + 0.5) * 7.5 / 3600, (c + 0.5) * 11.25 / 3600 + 100)


# ---------------------------------------------------------------- 書き出し


def write_json(path: str, obj, gz: bool = True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(path, "wb") as f:
        f.write(gzip.compress(data, 9, mtime=0) if gz else data)


def text(v) -> str:
    """前後の空白を取った文字（全角の空白も）。空や None は空文字"""
    if v is None:
        return ""
    return unicodedata.normalize("NFKC", str(v)).strip()


def num(v):
    """「80」「1,200」→ 数。数でないものは None"""
    s = text(v).replace(",", "")
    if re.fullmatch(r"-?\d+(\.\d+)?", s):
        f = float(s)
        return int(f) if f.is_integer() else f
    return None


def round_geom(g):
    """座標を小数6桁（約10cm）に"""

    def r(c):
        if isinstance(c, (int, float)):
            return round(c, 6)
        return [r(x) for x in c]

    return {"type": g["type"], "coordinates": r(g["coordinates"])}


def tippecanoe(seq: str, out: str, layer: str, name: str, attribution: str):
    tool = shutil.which("tippecanoe") or "tippecanoe"
    subprocess.run(
        [
            tool, "-q", "--force", "-o", out, "-l", layer, "-Z14", "-z14", "--full-detail=14",
            "--no-feature-limit", "--no-tile-size-limit", "--no-line-simplification", "--no-tiny-polygon-reduction",
            "-n", name, "-A", attribution, seq,
        ],
        check=True,
    )
    log(f"{out}: {os.path.getsize(out) / 1e6:.1f}MB")


def each_feature(api: str, z: int, key: str):
    """関東1都6県とそのまわりのタイルを順に読み、地物を返す（同じ地物が隣のタイルにも入ることがある）"""
    tiles = tiles_in(z)
    t0 = time.time()
    for i, (x, y) in enumerate(tiles):
        obj = fetch(api, {"response_format": "geojson", "z": z, "x": x, "y": y}, key)
        for f in (obj or {}).get("features") or []:
            yield f
        if (i + 1) % 25 == 0 or i + 1 == len(tiles):
            log(f"  {api} z{z}: {i + 1}/{len(tiles)} タイル（{time.time() - t0:.0f}秒）")


# ---------------------------------------------------------------- 液状化の発生傾向


def build_liq(key: str, out: str) -> dict:
    by2: dict[str, dict] = {}
    levels: dict[int, str] = {}
    forms: dict[int, str] = {}
    for f in each_feature("XKT025", 11, key):
        p = f.get("properties") or {}
        code = text(p.get("mesh_code"))
        lv, tc = num(p.get("liquefaction_tendency_level")), num(p.get("topographic_classification_code"))
        if len(code) != 10 or not code.isdigit() or lv is None or tc is None:
            continue
        levels[lv] = text(p.get("note"))
        forms[tc] = text(p.get("topographic_classification_name_ja"))
        by2.setdefault(code[:6], {})[code[6:]] = [lv, tc]
    for m2, cells in by2.items():
        write_json(os.path.join(out, "liq", f"{m2}.json"), {"m": dict(sorted(cells.items()))})
    n = sum(len(c) for c in by2.values())
    log(f"液状化: 250m メッシュ {n:,}、2次メッシュ {len(by2)}")
    if not n:
        raise SystemExit("液状化の発生傾向が1件も読めませんでした")
    return {
        "meshes": sorted(by2),
        "count": n,
        "levels": {str(k): v for k, v in sorted(levels.items())},
        "landforms": {str(k): v for k, v in sorted(forms.items())},
    }


# ---------------------------------------------------------------- 大規模盛土造成地


def build_zousei(key: str, out: str, work: str) -> dict:
    seq = os.path.join(work, "zousei.geojsonl")
    seen: set = set()
    kinds: dict[str, int] = {}
    with open(seq, "w", encoding="utf-8") as w:
        for f in each_feature("XKT020", 11, key):
            p = f.get("properties") or {}
            g = f.get("geometry") or {}
            if g.get("type") not in ("Polygon", "MultiPolygon"):
                continue
            fid = p.get("_id") or json.dumps(g)[:300]
            if fid in seen:
                continue
            seen.add(fid)
            k = text(p.get("embankment_classification")) or "区分なし"
            kinds[k] = kinds.get(k, 0) + 1
            props = {"k": k, "c": text(p.get("city_code")), "m": text(p.get("city_name")), "n": text(p.get("embankment_number"))}
            w.write(json.dumps({"type": "Feature", "geometry": round_geom(g), "properties": {a: b for a, b in props.items() if b}}, ensure_ascii=False) + "\n")
    log(f"大規模盛土造成地: {len(seen):,} {kinds}")
    if not seen:
        raise SystemExit("大規模盛土造成地が1件も読めませんでした")
    tippecanoe(seq, os.path.join(out, "zousei.pmtiles"), "zs", "MICHILU large fill areas", ZOUSEI_ATTRIBUTION)
    os.remove(seq)
    return {"count": len(seen), "kinds": kinds}


ZOUSEI_ATTRIBUTION = "国土交通省 不動産情報ライブラリ（国土数値情報 大規模盛土造成地データ）を加工して作成"


# ---------------------------------------------------------------- 災害履歴


def build_rireki(key: str, out: str, work: str) -> dict:
    seq = os.path.join(work, "rireki.geojsonl")
    seen: set = set()
    kinds: dict[str, int] = {}
    with open(seq, "w", encoding="utf-8") as w:
        for f in each_feature("XST001", 9, key):
            p = f.get("properties") or {}
            g = f.get("geometry") or {}
            if g.get("type") not in ("Polygon", "MultiPolygon", "Point", "MultiPoint", "LineString", "MultiLineString"):
                continue
            fid = p.get("_id") or json.dumps([p, g])[:300]
            if fid in seen:
                continue
            seen.add(fid)
            t = text(p.get("disastertype_code"))
            kinds[t] = kinds.get(t, 0) + 1
            props = {"t": t, "n": text(p.get("disaster_name_ja")), "d": text(p.get("disaster_date")), "s": text(p.get("disaster_source"))}
            w.write(json.dumps({"type": "Feature", "geometry": round_geom(g), "properties": {a: b for a, b in props.items() if b}}, ensure_ascii=False) + "\n")
    log(f"災害履歴: {len(seen):,} {dict(sorted(kinds.items()))}")
    if not seen:
        raise SystemExit("災害履歴が1件も読めませんでした")
    tippecanoe(seq, os.path.join(out, "rireki.pmtiles"), "dh", "MICHILU disaster history", RIREKI_ATTRIBUTION)
    os.remove(seq)
    return {"count": len(seen), "kinds": dict(sorted(kinds.items()))}


RIREKI_ATTRIBUTION = "国土交通省 不動産情報ライブラリ（国土調査 土地履歴調査の災害履歴）を加工して作成"


# ---------------------------------------------------------------- 駅別乗降客数

# 事業者の呼び方（scripts/stations/build.py と同じ。アプリの駅のデータに合わせる）
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "stations"))
from build import OPERATORS, line_name  # noqa: E402

sys.path.pop(0)
del sys.modules["build"]

RIDERSHIP_YEARS = range(2011, 2024)


def ridership_record(p: dict):
    """1つの駅・路線の行 → 年ごとの乗降客数（その行に数が付いている年だけ。重複コード 2 は別の行に付いている）"""
    series = {}
    for i, year in enumerate(RIDERSHIP_YEARS):
        base = 6 + i * 4
        dup, avail, count = text(p.get(f"S12_{base:03d}")), text(p.get(f"S12_{base + 1:03d}")), num(p.get(f"S12_{base + 3:03d}"))
        if dup == "1" and avail == "1" and count:
            series[year] = count
    last = 6 + (len(RIDERSHIP_YEARS) - 1) * 4
    return series, text(p.get(f"S12_{last + 2:03d}"))


def midpoint(g: dict):
    pts = list(coords_of(g))
    if not pts:
        return None
    p = pts[len(pts) // 2]
    return [round(p[0], 5), round(p[1], 5)]


def build_ridership(key: str, out: str) -> dict:
    rows: dict = {}
    for f in each_feature("XKT015", 11, key):
        p = f.get("properties") or {}
        name = text(p.get("S12_001_ja"))
        at = midpoint(f.get("geometry") or {})
        if not name or not at:
            continue
        fid = p.get("_id") or (text(p.get("S12_001c")), text(p.get("S12_003_ja")))
        rows[fid] = (p, at)
    stations: dict[tuple, dict] = {}
    for p, at in rows.values():
        name, group = text(p.get("S12_001_ja")), text(p.get("S12_001g")) or text(p.get("S12_001c"))
        op_full = text(p.get("S12_002_ja"))
        op = OPERATORS.get(op_full, op_full)
        line = line_name(text(p.get("S12_003_ja")), op)
        st = stations.setdefault((name, group), {"n": name, "p": [], "o": {}})
        st["p"].append(at)
        series, note = ridership_record(p)
        if not series:
            continue
        o = st["o"].setdefault(op, {"op": op, "l": [], "c": {}})
        if line not in o["l"]:
            o["l"].append(line)
        for y, c in series.items():
            o["c"][str(y)] = o["c"].get(str(y), 0) + c
        if note:
            o["r"] = note
    out_list = []
    for st in stations.values():
        if not st["o"]:
            continue
        xs, ys = [q[0] for q in st["p"]], [q[1] for q in st["p"]]
        out_list.append({"n": st["n"], "at": [round(sum(xs) / len(xs), 5), round(sum(ys) / len(ys), 5)], "o": sorted(st["o"].values(), key=lambda o: -max(map(int, o["c"].values())))})
    out_list.sort(key=lambda s: (s["at"][1], s["at"][0]))
    write_json(os.path.join(out, "ridership.json"), {"years": [RIDERSHIP_YEARS[0], RIDERSHIP_YEARS[-1]], "stations": out_list})
    log(f"駅別乗降客数: 駅 {len(out_list):,}（行 {len(rows):,}）")
    if not out_list:
        raise SystemExit("駅別乗降客数が1件も読めませんでした")
    return {"year": RIDERSHIP_YEARS[-1], "count": len(out_list)}


# ---------------------------------------------------------------- 地価公示の鑑定評価書

# 用途区分（API の division）→ 標準地番号の用途の数字（住宅地は付けない。scripts/land-price と同じ「千代田5-1」の形）
DIVISIONS = {"00": "", "03": "3", "05": "5", "07": "7", "09": "9", "10": "10", "13": "13"}
APPRAISAL_ZOOM = 13


def _n(r: dict, k: str):
    """数の項目（0 は「無し・適用なし」として入れない）"""
    v = num(r.get(k))
    return v if v else None


def _t(r: dict, k: str):
    s = re.sub(r"\s+", " ", text(r.get(k)))
    # 「地区計画等                （地区計画等）」のような、同じ語のかっこ書きを外す（text() で全角のかっこは半角になっている）
    m = re.fullmatch(r"(.+?) ?\(\1\)", s)
    s = m.group(1) if m else s
    return s or None


def _drop_empty(d: dict) -> dict:
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}


def appraisal_point(r: dict, div: str):
    """鑑定評価書の1件（API の行）→ 標準地（場所・土地・道路・法令）と、鑑定評価の手法ごとの価格"""
    lat, lng = num(r.get("位置座標 緯度")), num(r.get("位置座標 経度"))
    seq, area = text(r.get("標準地番号 連番")), text(r.get("標準地番号 地域名"))
    if lat is None or lng is None or not seq or not area:
        return None
    no = f"{area}{DIVISIONS.get(div, '')}-{seq}"
    point = _drop_empty(
        {
            "no": no,
            "at": [round(lng, 6), round(lat, 6)],
            "y": num(r.get("価格時点")),
            "p": num(r.get("1㎡当たりの価格")) or num(r.get("公示価格")),
            "ch": num(r.get("変動率")),
            "use": _t(r, "標準地番号 用途区分"),
            "city": text(r.get("標準地番号 市区町村コード 県コード")) + text(r.get("標準地番号 市区町村コード 市区町村コード")).zfill(3),
            "rosen": _drop_empty(
                {
                    "y": _n(r, "路線価 年"),
                    "p": _n(r, "路線価 相続税路線価"),
                    "rate": _n(r, "路線価 倍率"),
                    "rateKind": _t(r, "路線価 倍率種別"),
                }
            ),
            "addr": _t(r, "標準地 所在地 所在地番"),
            "jukyo": _t(r, "標準地 所在地 住居表示"),
            "kari": _t(r, "標準地 所在地 仮換地番号"),
            "area": _n(r, "標準地 地積 地積"),
            "privateRoad": _n(r, "標準地 地積 内私道分"),
            "shape": _t(r, "標準地 形状 形状"),
            "frontage": _n(r, "標準地 形状 形状比 間口"),
            "depth": _n(r, "標準地 形状 形状比 奥行"),
            "slope": _n(r, "標準地 形状 傾斜度"),
            "current": _t(r, "標準地 土地利用の現況 現況"),
            "floors": _n(r, "標準地 土地利用の現況 地上階数"),
            "basements": _n(r, "標準地 土地利用の現況 地下階数"),
            "env": _t(r, "標準地 周辺の利用状況"),
            "road": _drop_empty(
                {
                    "dir": _t(r, "標準地 接面道路の状況 前面道路 方位"),
                    "width": _n(r, "標準地 接面道路の状況 前面道路 道路幅員"),
                    "kind": _t(r, "標準地 接面道路の状況 前面道路 道路種別"),
                    "paved": _t(r, "標準地 接面道路の状況 前面道路 舗装状況"),
                    "level": _t(r, "標準地 接面道路の状況 前面道路 高低位置"),
                    "station": _t(r, "標準地 接面道路の状況 前面道路 駅前区分"),
                    "sideDir": _t(r, "標準地 接面道路の状況 側道方位"),
                    "sides": _t(r, "標準地 接面道路の状況 側道等接面状況"),
                }
            ),
            "access": _drop_empty(
                {
                    "name": _t(r, "標準地 交通施設の状況 交通施設"),
                    "m": num(r.get("標準地 交通施設の状況 距離")),
                    "near": _t(r, "標準地 交通施設の状況 近接区分"),
                }
            ),
            "law": _drop_empty(
                {
                    "plan": _t(r, "標準地 法令上の規制等 区域区分"),
                    "zone": _t(r, "標準地 法令上の規制等 用途地域"),
                    "bcr": _n(r, "標準地 法令上の規制等 指定建ぺい率"),
                    "far": _n(r, "標準地 法令上の規制等 指定容積率"),
                    "bcrStd": _n(r, "標準地 法令上の規制等 その他 基準建ぺい率"),
                    "farStd": _n(r, "標準地 法令上の規制等 その他 基準容積率"),
                    "fire": _t(r, "標準地 法令上の規制等 防火地域"),
                    "forest": _t(r, "標準地 法令上の規制等 森林法"),
                    "park": _t(r, "標準地 法令上の規制等 自然公園法"),
                    "other": [v for v in (_t(r, f"標準地 法令上の規制等 その他 その他地域地区等{i}") for i in (1, 2, 3)) if v and v != "その他"],
                    "height": [
                        _drop_empty(
                            {
                                "kind": _t(r, f"標準地 法令上の規制等 その他 高度地区{i} 種"),
                                "class": _t(r, f"標準地 法令上の規制等 その他 高度地区{i} 高度区分"),
                                "m": _n(r, f"標準地 法令上の規制等 その他 高度地区{i} 高度"),
                            }
                        )
                        for i in (1, 2)
                        if _n(r, f"標準地 法令上の規制等 その他 高度地区{i} 種") or _n(r, f"標準地 法令上の規制等 その他 高度地区{i} 高度")
                    ],
                    "nature": _t(r, "標準地 法令上の規制等 自然環境等文言"),
                }
            ),
        }
    )
    report = _drop_empty(
        {
            "compare": _n(r, "鑑定評価手法の適用 取引事例比較法比準価格"),
            "deduct": _n(r, "鑑定評価手法の適用 控除法 控除後価格"),
            "income": _n(r, "鑑定評価手法の適用 収益還元法 収益価格"),
            "cost": _n(r, "鑑定評価手法の適用 原価法 積算価格"),
            "develop": _n(r, "鑑定評価手法の適用 開発法 開発法による価格"),
            "cases": [
                _drop_empty(
                    {
                        "trade": _n(r, f"比準価格算定内訳事例{c} 取引価格"),
                        "est": _n(r, f"比準価格算定内訳事例{c} 推定価格"),
                        "std": _n(r, f"比準価格算定内訳事例{c} 標準価格"),
                        "val": _n(r, f"比準価格算定内訳事例{c} 査定価格"),
                    }
                )
                for c in "abcde"
                if _n(r, f"比準価格算定内訳事例{c} 取引価格") or _n(r, f"比準価格算定内訳事例{c} 査定価格")
            ],
            "costDetail": _drop_empty(
                {
                    "land": _n(r, "積算価格算定内訳素地の取得価格"),
                    "work": _n(r, "積算価格算定内訳造成工事費"),
                    "total": _n(r, "積算価格算定内訳再調達原価"),
                }
            ),
            "incomeDetail": _drop_empty(
                {
                    "gross": _n(r, "収益価格算定内訳総収益"),
                    "expense": _n(r, "収益価格算定内訳総費用"),
                    "net": _n(r, "収益価格算定内訳純収益"),
                    "building": _n(r, "収益価格算定内訳建物に帰属する純収益"),
                    "land": _n(r, "収益価格算定内訳土地に帰属する純収益"),
                    "adjusted": _n(r, "収益価格算定内訳未収入期間修正後の純収益"),
                    "rate": _n(r, "収益価格算定内訳還元利回り"),
                }
            ),
            "devDetail": _drop_empty(
                {
                    "revenue": _n(r, "開発法価格算定内訳 収入の現価の総和"),
                    "expense": _n(r, "開発法価格算定内訳 支出の現価の総和"),
                    "roi": _n(r, "開発法価格算定内訳 投下資本収益率"),
                    "unitPrice": _n(r, "開発法価格算定内訳 販売単価(住宅)"),
                    "saleable": _n(r, "開発法価格算定内訳 分譲可能床面積"),
                    "construction": _n(r, "開発法価格算定内訳 建築工事費"),
                    "floor": _n(r, "開発法価格算定内訳 延床面積"),
                }
            ),
        }
    )
    return point, report


def rows_of(obj):
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict):
        return obj.get("data") or []
    return []


def appraisal_points(key: str, year: int) -> dict:
    """その年の関東1都6県の標準地（市区町村コードと標準地番号ごと。鑑定評価書は1地点に2人分ある）"""
    points: dict[str, dict] = {}
    for pref in PREFS:
        for div in DIVISIONS:
            rows = rows_of(fetch("XCT001", {"year": year, "area": pref, "division": div}, key))
            for r in rows:
                got = appraisal_point(r, div)
                if not got:
                    continue
                point, report = got
                p = points.setdefault(f"{point['city']}|{point['no']}", {**point, "reports": []})
                if report:
                    p["reports"].append(report)
            log(f"  鑑定評価書 {year}年 {pref} {div}: {len(rows)}件")
    return points


def build_appraisal(key: str, out: str) -> dict:
    # 地価公示（1月1日時点）は3月に出るので、それまでは前の年
    this = datetime.date.today().year
    for year in (this, this - 1):
        points = appraisal_points(key, year)
        if points:
            break
    by_tile: dict[tuple, list] = {}
    for p in points.values():
        x, y = tile_of(p["at"][1], p["at"][0], APPRAISAL_ZOOM)
        by_tile.setdefault((x, y), []).append(p)
    for (x, y), ps in by_tile.items():
        write_json(os.path.join(out, "appraisal", str(x), f"{y}.json"), {"points": sorted(ps, key=lambda p: p["no"])})
    log(f"鑑定評価書: {year}年 標準地 {len(points):,}、タイル {len(by_tile):,}")
    if not points:
        raise SystemExit("鑑定評価書が1件も読めませんでした")
    return {"year": year, "count": len(points), "zoom": APPRAISAL_ZOOM}


# ---------------------------------------------------------------- 将来推計人口

POP_YEARS = (2020, 2025, 2030, 2035, 2040, 2045, 2050)
# まわりの範囲（250m メッシュの 5×5。約1.25km四方）
POP_REACH = 2


def pop_cells(fc: dict) -> dict:
    """GeoJSON → 250m メッシュのコード → [総人口（秘匿なし）の推移…, 0〜14歳 2025・2050, 65歳以上 2025・2050, 総数（秘匿後）2025・2050]"""
    out = {}
    for f in fc.get("features") or []:
        p = f.get("properties") or {}
        code = text(p.get("MESH_ID"))
        if len(code) != 10:
            continue
        total = [float(p.get(f"PTN_{y}") or 0) for y in POP_YEARS]
        ages = [float(p.get(k) or 0) for k in ("PTA_2025", "PTA_2050", "PTC_2025", "PTC_2050", "PT00_2025", "PT00_2050")]
        out[code] = total + ages
    return out


def per_mille(part: float, whole: float):
    """割合（千分率）"""
    return round(part / whole * 1000) if whole > 0 else None


def pop_around(cells: dict) -> dict:
    """250m メッシュごとに、まわり 5×5 メッシュの合計（人の住んでいないメッシュにも、まわりの人口を入れる）"""
    sums: dict[tuple, list] = {}
    for code, v in cells.items():
        r, c = grid_of(code)
        for dr in range(-POP_REACH, POP_REACH + 1):
            for dc in range(-POP_REACH, POP_REACH + 1):
                s = sums.get((r + dr, c + dc))
                if s is None:
                    sums[(r + dr, c + dc)] = list(v)
                else:
                    for i, x in enumerate(v):
                        s[i] += x
    out = {}
    for (r, c), s in sums.items():
        n = len(POP_YEARS)
        if s[0] < 0.5 and s[1] < 0.5:
            continue
        a25, a50, o25, o50, t25, t50 = s[n:]
        out[code_of_grid(r, c)] = [round(x) for x in s[:n]] + [per_mille(a25, t25), per_mille(o25, t25), per_mille(a50, t50), per_mille(o50, t50)]
    return out


def build_pop(out: str) -> dict:
    cells: dict = {}
    for pref in PREFS:
        fc = geojson_in_zip(download(POP_URL.format(pref=pref)))
        got = pop_cells(fc)
        cells.update(got)
        log(f"  将来推計人口 {pref}: 250m メッシュ {len(got):,}")
        del fc
    around = pop_around(cells)
    by2: dict[str, dict] = {}
    for code, v in around.items():
        by2.setdefault(code[:6], {})[code[6:]] = v
    for m2, cs in by2.items():
        write_json(os.path.join(out, "pop", f"{m2}.json"), {"m": dict(sorted(cs.items()))})
    log(f"将来推計人口: 人の住むメッシュ {len(cells):,}、まわりを足したメッシュ {len(around):,}、2次メッシュ {len(by2)}")
    if not cells:
        raise SystemExit("将来推計人口が1件も読めませんでした")
    return {"meshes": sorted(by2), "years": list(POP_YEARS), "reach": POP_REACH, "count": len(cells)}


# ---------------------------------------------------------------- 医療機関・幼稚園

# 施設の種類（タイルの k）
FAC_KINDS = {1: "病院", 2: "診療所", 3: "歯科診療所", 4: "幼稚園", 5: "認定こども園"}
# 診療科目の略号（国土数値情報の医療機関データは、市区町村によって「内」「小」のような略号で入っている）→ 正式な名前
DEPARTMENTS = {
    "内": "内科", "外": "外科", "小": "小児科", "小児": "小児科", "歯": "歯科", "小歯": "小児歯科", "矯": "矯正歯科", "矯歯": "矯正歯科",
    "矯正": "矯正歯科", "歯外": "歯科口腔外科", "口外": "歯科口腔外科", "皮": "皮膚科", "整": "整形外科", "整形": "整形外科", "眼": "眼科",
    "耳": "耳鼻いんこう科", "耳鼻": "耳鼻いんこう科", "耳鼻咽喉科": "耳鼻いんこう科", "精": "精神科", "神": "神経科", "神内": "神経内科",
    "心内": "心療内科", "循": "循環器科", "循内": "循環器内科", "消": "消化器科", "消内": "消化器内科", "呼": "呼吸器科", "呼内": "呼吸器内科",
    "胃": "胃腸科", "ア": "アレルギー科", "アレ": "アレルギー科", "リウ": "リウマチ科", "リハ": "リハビリテーション科",
    "リハビリ科": "リハビリテーション科", "泌": "泌尿器科", "婦": "婦人科", "産": "産科", "産婦": "産婦人科", "放": "放射線科", "麻": "麻酔科",
    "形": "形成外科", "形外": "形成外科", "脳外": "脳神経外科", "心外": "心臓血管外科", "肛": "肛門科", "肛外": "肛門外科", "美外": "美容外科",
    "美皮": "美容皮膚科", "糖内": "糖尿病内科", "腎内": "腎臓内科", "気食": "気管食道科", "病理": "病理診断科", "救": "救急科",
}


def departments(*parts) -> list:
    out = []
    for part in parts:
        for t in re.split(r"[\s　、,]+", text(part)):
            t = DEPARTMENTS.get(t, t)
            if t and t not in out:
                out.append(t)
    return out


def fac_medical(fc: dict):
    for f in fc.get("features") or []:
        p = f.get("properties") or {}
        g = f.get("geometry") or {}
        k = num(p.get("P04_001"))
        name = text(p.get("P04_002"))
        if g.get("type") != "Point" or k not in (1, 2, 3) or not name:
            continue
        props = {"k": k, "n": name, "a": text(p.get("P04_003"))}
        deps = departments(p.get("P04_004"), p.get("P04_005"), p.get("P04_006"))
        if deps:
            props["d"] = "・".join(deps)
        if k == 1:
            if num(p.get("P04_008")):
                props["b"] = num(p.get("P04_008"))
            if num(p.get("P04_009")) == 1:
                props["e"] = 1
            if num(p.get("P04_010")) in (1, 2):
                props["s"] = num(p.get("P04_010"))
        yield g, props


def fac_kinder(fc: dict):
    for f in fc.get("features") or []:
        p = f.get("properties") or {}
        g = f.get("geometry") or {}
        cls = text(p.get("P29_003"))
        name = text(p.get("P29_004"))
        # 16011 幼稚園・16013 幼保連携型認定こども園。休校中（休校コード 2）は入れない
        if g.get("type") != "Point" or cls not in ("16011", "16013") or not name or text(p.get("P29_007")) == "2":
            continue
        props = {"k": 4 if cls == "16011" else 5, "n": name, "a": text(p.get("P29_005"))}
        admin = text(p.get("P29_006"))
        owner = {"1": "国立", "2": "公立", "3": "公立", "4": "私立"}.get(admin)
        if owner:
            props["o"] = owner
        yield g, props


FAC_ATTRIBUTION = "国土数値情報（医療機関データ・学校データ）（国土交通省）を加工して作成"


def build_fac(out: str, work: str) -> dict:
    seq = os.path.join(work, "facilities.geojsonl")
    counts = {str(k): 0 for k in FAC_KINDS}
    with open(seq, "w", encoding="utf-8") as w:
        for pref in PREFS:
            for template, read in ((P04_URL, fac_medical), (P29_URL, fac_kinder)):
                url = template.format(pref=pref)
                fc = geojson_in_zip(download(url))
                n = 0
                for g, props in read(fc):
                    counts[str(props["k"])] += 1
                    n += 1
                    w.write(json.dumps({"type": "Feature", "geometry": round_geom(g), "properties": props}, ensure_ascii=False) + "\n")
                log(f"  施設 {pref} {url.rsplit('/', 1)[-1]}: {n:,}")
    log(f"医療機関・幼稚園: {counts}")
    if not sum(counts.values()):
        raise SystemExit("医療機関・幼稚園が1件も読めませんでした")
    tippecanoe(seq, os.path.join(out, "facilities.pmtiles"), "fac", "MICHILU medical and kindergartens", FAC_ATTRIBUTION)
    os.remove(seq)
    return {"counts": counts, "medicalYear": 2020, "kinderYear": 2023}


# ---------------------------------------------------------------- 調べる・確かめる


def coords_of(g):
    if not g:
        return
    t, c = g.get("type"), g.get("coordinates")
    if t == "Point":
        yield c
    elif t in ("LineString", "MultiPoint"):
        yield from c
    elif t in ("Polygon", "MultiLineString"):
        for r in c:
            yield from r
    elif t == "MultiPolygon":
        for p in c:
            for r in p:
                yield from r


def probe(key: str):
    """各 API のタイルを1枚ずつ読み、項目の名前と件数をログに出す（作り方を変えるときの確認用）"""
    at = (35.6618, 139.7041)
    for api, z in (("XKT025", 13), ("XKT020", 13), ("XST001", 12), ("XKT015", 13), ("XKT007", 13), ("XKT010", 13)):
        x, y = tile_of(*at, z)
        feats = (fetch(api, {"response_format": "geojson", "z": z, "x": x, "y": y}, key) or {}).get("features") or []
        keys = sorted({k for f in feats for k in (f.get("properties") or {})})
        log(f"[{api} z{z}/{x}/{y}] {len(feats)}件 keys={keys[:40]}")


def self_test():
    # メッシュ：東京駅
    assert mesh250(35.681236, 139.767125) == "5339461132", mesh250(35.681236, 139.767125)
    r, c = grid_of("5339461132")
    assert code_of_grid(r, c) == "5339461132"
    assert code_of_grid(r + 1, c) != "5339461132" and code_of_grid(r, c + 1) != "5339461132"
    # まわり 5×5 の合計
    around = pop_around({"5339461132": [100, 90, 80, 70, 60, 50, 40, 10, 5, 20, 30, 90, 70]})
    assert around["5339461132"][:7] == [100, 90, 80, 70, 60, 50, 40], around["5339461132"]
    assert around["5339461132"][7:] == [111, 222, 71, 429], around["5339461132"]
    assert len(around) == 25
    # 液状化・駅のタイルの範囲
    assert len(tiles_in(11)) > 100
    # 駅別乗降客数：重複コード 2 の行は数を持たない
    p = {"S12_054": "1", "S12_055": "1", "S12_057": 628118, "S12_056": "", "S12_050": "2", "S12_051": "1", "S12_053": 0}
    series, note = ridership_record(p)
    assert series == {2023: 628118}, series
    # 鑑定評価書
    row = {
        "価格時点": "2026", "標準地番号 市区町村コード 県コード": "13", "標準地番号 市区町村コード 市区町村コード": "101",
        "標準地番号 地域名": "千代田", "標準地番号 用途区分": "商業地", "標準地番号 連番": "1", "1㎡当たりの価格": "14900000",
        "路線価 年": "2025", "路線価 相続税路線価": "10500000", "路線価 倍率": "0",
        "標準地 法令上の規制等 その他 その他地域地区等1": "地区計画等                （地区計画等）",
        "標準地 法令上の規制等 その他 その他地域地区等2": "その他",
        "鑑定評価手法の適用 取引事例比較法比準価格": "15900000", "鑑定評価手法の適用 収益還元法 収益価格": "14100000",
        "比準価格算定内訳事例a 取引価格": "31530804", "比準価格算定内訳事例a 査定価格": "16200000", "収益価格算定内訳還元利回り": "2.5",
        "変動率": "2.1", "位置座標 緯度": "35.69080833", "位置座標 経度": "139.75981389",
    }
    point, report = appraisal_point(row, "05")
    assert point["no"] == "千代田5-1" and point["city"] == "13101" and point["p"] == 14900000, point
    assert point["rosen"] == {"y": 2025, "p": 10500000}, point["rosen"]
    assert point["law"]["other"] == ["地区計画等"], point["law"]
    assert report["compare"] == 15900000 and report["cases"] == [{"trade": 31530804, "val": 16200000}] and report["incomeDetail"] == {"rate": 2.5}, report
    assert appraisal_point(row, "00")[0]["no"] == "千代田-1"
    # 診療科目の略号
    assert departments("内　小", "皮膚科　内") == ["内科", "小児科", "皮膚科"]
    print("self-test ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="作ったものを置くディレクトリ")
    ap.add_argument("--work", help="途中のファイルを置くディレクトリ（省略時は --out の隣の tmp）")
    ap.add_argument("--only", help=f"作るものをカンマ区切りで（{','.join(DATASETS)}）")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--probe", action="store_true", help="各 API の返り方をログに出す")
    a = ap.parse_args()
    if a.self_test:
        self_test()
        return
    key = os.environ.get("REINFOLIB_API_KEY", "").strip()
    if a.probe:
        if key:
            probe(key)
        return
    if not a.out:
        ap.error("--out が要ります")
    want = [d for d in (a.only.split(",") if a.only else DATASETS) if d]
    unknown = [d for d in want if d not in DATASETS]
    if unknown:
        ap.error(f"知らないデータ: {unknown}")
    if not key:
        skipped = [d for d in want if d in NEEDS_KEY]
        if skipped:
            log(f"REINFOLIB_API_KEY が無いので作らない: {skipped}")
        want = [d for d in want if d not in NEEDS_KEY]
    os.makedirs(a.out, exist_ok=True)
    work = a.work or os.path.join(os.path.dirname(os.path.abspath(a.out)), "tmp")
    os.makedirs(work, exist_ok=True)
    meta = {"stamp": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y%m%d")}
    builders = {
        "liq": lambda: build_liq(key, a.out),
        "zousei": lambda: build_zousei(key, a.out, work),
        "rireki": lambda: build_rireki(key, a.out, work),
        "ridership": lambda: build_ridership(key, a.out),
        "appraisal": lambda: build_appraisal(key, a.out),
        "pop": lambda: build_pop(a.out),
        "fac": lambda: build_fac(a.out, work),
    }
    failed = []
    for d in want:
        t0 = time.time()
        log(f"==== {d}")
        # 1つが失敗しても、ほかのデータは作って置く（失敗したものは前のデータのまま。最後にワークフローを失敗にする）
        try:
            meta[d] = builders[d]()
        except (Exception, SystemExit) as e:
            import traceback

            traceback.print_exc()
            log(f"::error::{d} を作れませんでした: {e}")
            failed.append(d)
        log(f"==== {d}: {time.time() - t0:.0f}秒")
    write_json(os.path.join(a.out, "meta.json"), meta, gz=False)
    if failed:
        with open(os.path.join(a.out, "failed.txt"), "w") as f:
            f.write(",".join(failed) + "\n")
    log(json.dumps({k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk != "meshes"}) for k, v in meta.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
