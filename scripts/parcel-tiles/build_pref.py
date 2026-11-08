#!/usr/bin/env python3
"""
登記所備付地図データ（法務省）を、地番検索・筆界表示用のベクトルタイル（PMTiles）にする（都県ごと）。

G空間情報センターの公開 API（CKAN）で都県の地図XML（市区町村ごとの zip。ログイン不要）を探してダウンロードし、
MIERUNE の mojxml（mojxml2ogr）で筆のポリゴンにする。地番区域（市区町村名_大字名_丁目名_小字名_予備名）と地番だけを
持つ GeoJSON の行に直し、tippecanoe でタイルにする。レイヤ fude・z14〜16 で、AMX プロジェクトの全国版タイルと同じ形なので、
アプリ（lib/roadmap/parcel-tiles.ts）は置き場所を変えるだけで読める。公共座標の地図だけを使う（任意座標系は位置が合わない）。

  python3 scripts/parcel-tiles/build_pref.py --pref 11 --year 2026 --out work/pref-11.pmtiles
  python3 scripts/parcel-tiles/build_pref.py --pref 13 --only 13303 --out work/test.pmtiles   # 一部の市区町村だけで試す

必要なもの: mojxml（pip install mojxml）、tippecanoe（2.79 以上）
"""
import argparse
import json
import math
import re
import os
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.request
import zipfile

import fiona

# G空間情報センターの法務省の組織名（都道府県ごと）。API（organization_list / package_search）で実在を確かめたものだけ入れる
ORGS = {
    "02": "moj-02aomori",
    "03": "moj-03iwate",
    "04": "moj-04miyagi",
    "05": "moj-05akita",
    "06": "moj-06yamagata",
    "07": "moj-07fukushima",
    "08": "moj-08ibaraki",
    "09": "moj-09tochigi",
    "10": "moj-10gunma",
    "11": "moj-11saitama",
    "12": "moj-12chiba",
    "13": "moj-13tokyo",
    "14": "moj-14kanagawa",
    "15": "moj-15niigata",
    "16": "moj-16toyama",
    "17": "moj-17ishikawa",
    "18": "moj-18fukui",
    "19": "moj-19yamanashi",
    "20": "moj-20nagano",
    "21": "moj-21gifu",
    "22": "moj-22shizuoka",
    "23": "moj-23aichi",
}
CKAN = "https://www.geospatial.jp/ckan/api/3/action/package_search"
UA = {"User-Agent": "michilu-parcel-tiles (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
ATTRIBUTION = (
    '<a href="https://front.geospatial.jp/moj-chizu-xml-readme/">「登記所備付地図データ」（法務省）</a>を加工して作成'
)


def log(*a):
    print(*a, flush=True)


def list_zips(pref: str, year: str) -> list[tuple[str, str, int]]:
    """都県の地図XMLの zip（名前・URL・大きさ）。名前は「11105-0300-2025.zip」（市区町村コード-法務局-年）。
    year が「latest」なら、zip 名の年が一番新しいもの"""
    req = urllib.request.Request(f"{CKAN}?fq=organization:{ORGS[pref]}&rows=1000", headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    found: dict[str, dict[str, tuple[str, str, int]]] = {}
    for pkg in data["result"]["results"]:
        for res in pkg["resources"]:
            name = res.get("name") or ""
            m = re.fullmatch(r"\d{5}-\d{4}-(\d{4})\.zip", name)
            if m:
                found.setdefault(m.group(1), {})[name] = (name, res["url"], int(res.get("size") or 0))
    if not found:
        return []
    y = max(found) if year == "latest" else year
    return sorted(found.get(y, {}).values())


def download(url: str, path: str) -> None:
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=900) as r, open(path, "wb") as f:
                shutil.copyfileobj(r, f, 1 << 20)
            return
        except Exception as e:  # 一時的な失敗は待って読み直す
            if attempt == 4:
                raise
            log(f"  download retry {attempt + 1}: {e}")
            time.sleep(10 * 2**attempt)


# 法務省のデータに残っている合併前の市町村名 → 今の市（市区町村の境界と照らすときに読み替える。lib/roadmap/parcel.ts の OLD_CITY と同じ）
OLD_CITY = {
    "勢多郡富士見村": "前橋市",
    "南埼玉郡白岡町": "白岡市",
    "北埼玉郡北川辺町": "加須市",
    "北埼玉郡騎西町": "加須市",
    "北埼玉郡大利根町": "加須市",
    "北葛飾郡栗橋町": "久喜市",
    "下都賀郡岩舟町": "栃木市",
    "山武郡大網白里町": "大網白里市",
}


# 位置がずれた地図（市区町村コード・地図名）。全部の筆の点検で見つけ、国土地理院のデータで裏取りしたもの（scripts/parcel-tiles/misplaced-sheets.json）
SHEETS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "misplaced-sheets.json")


def load_skip_sheets(path: str = SHEETS_FILE) -> dict[str, list[dict]]:
    """外す筆の決まり（市区町村コードごと）。sheet（地図名）が「*」ならその市区町村コードのデータ全部。
    oaza（大字名）・chome（丁目名）があればその町の筆だけ、chiban（地番の一覧）があればその地番の筆だけ外す。
    shift（east・north：m）があれば外さず、その量だけ動かす（日本測地系と世界測地系の取り違えで約460mずれた地図）。
    法務省が直して地図名が変われば、何も外さなくなる"""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    rules: dict[str, list[dict]] = {}
    for i, s in enumerate(data["sheets"]):
        rules.setdefault(s["code"], []).append(
            {
                "i": i,
                "sheet": s["sheet"],
                "oaza": s.get("oaza"),
                "chome": s.get("chome"),
                "chiban": set(s["chiban"]) if s.get("chiban") else None,
                "town": s["town"],
                # 測地系の取り違えで約460mずれた地図を、正しい位置に動かす量（東 m・北 m。外さない）
                "shift": s.get("shift"),
            }
        )
    return rules


def skip_rule(rules: dict[str, list[dict]], p: dict) -> dict | None:
    """この筆を外す決まり（無ければ None）"""
    for r in rules.get(p.get("市区町村コード") or "", ()):
        if r["sheet"] != "*" and r["sheet"] != (p.get("地図名") or ""):
            continue
        if r["oaza"] is not None and (p.get("大字名") or "") != r["oaza"]:
            continue
        if r["chome"] is not None and (p.get("丁目名") or "") != r["chome"]:
            continue
        if r["chiban"] is not None and (p.get("地番") or "") not in r["chiban"]:
            continue
        return r
    return None


def city_key(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "").replace(" ", "").replace("ヶ", "ケ").replace("ヵ", "ケ")


class Boundaries:
    """市区町村の境界（国土数値情報 N03 の zip）。別の市区町村の中に置かれた筆（任意座標の図が公共座標として入っているなど。
    2026年版の関東で約1万5千筆）を外すのに使う。市区町村名 → 境界（「西多摩郡瑞穂町」「瑞穂町」「さいたま市見沼区」のどの書き方でも引ける）"""

    def __init__(self, zip_path: str, tolerance_deg: float = 0.02):
        import shapely
        from shapely.geometry import shape
        from shapely.prepared import prep

        self.tol = tolerance_deg
        geoms: dict[str, list] = {}
        # 相対パス（work-n03.zip）だと fiona が「!」の前後を分けられず開けないので、絶対パスにする
        zip_path = os.path.abspath(zip_path)
        with zipfile.ZipFile(zip_path) as z:
            shp = next(n for n in z.namelist() if n.lower().endswith(".shp"))
        with fiona.open(f"zip://{zip_path}!{shp}") as src:
            for f in src:
                p = f["properties"]
                parts = [city_key(p.get(k)) for k in ("N03_003", "N03_004", "N03_005") if p.get(k)]
                g = shape(f.geometry)
                # 「西多摩郡瑞穂町」「さいたま市見沼区」と、郡・市を省いた「瑞穂町」「見沼区」、政令市だけの「さいたま市」
                for name in {"".join(parts), "".join(parts[1:]), parts[0] if len(parts) > 1 else ""}:
                    if name:
                        geoms.setdefault(name, []).append(g)
        self.prepared = {k: prep(shapely.unary_union(v)) for k, v in geoms.items()}
        self.loose = {k: shapely.unary_union(v).buffer(tolerance_deg) for k, v in geoms.items()}
        self.loose_prepared = {k: prep(v) for k, v in self.loose.items()}
        self.cache: dict[str, str | None] = {}

    def key_for(self, kuiki_city: str) -> str | None:
        """地番区域の市区町村名に合う境界の名前（無ければ None：確かめない）"""
        if kuiki_city in self.cache:
            return self.cache[kuiki_city]
        k = city_key(OLD_CITY.get(city_key(kuiki_city), kuiki_city))
        found = k if k in self.prepared else next((n for n in self.prepared if n and (k.endswith(n) or n.endswith(k)) and len(n) >= 3), None)
        self.cache[kuiki_city] = found
        return found

    def outside(self, kuiki_city: str, geom) -> bool:
        """筆が、その市区町村の境界から約2km より外にあるか（境界のすぐ近くの筆は外さない）"""
        name = self.key_for(kuiki_city)
        if not name:
            return False
        c = geom.representative_point()
        if self.prepared[name].contains(c):
            return False
        return not self.loose_prepared[name].contains(c)


def shifted_geometry(geom: dict, shift: dict) -> dict:
    """形の座標を、東へ shift["east"] m・北へ shift["north"] m 動かす（緯度ごとに度に直す。地図1枚の中では誤差 0.1m 未満）"""
    east, north = float(shift["east"]), float(shift["north"])

    def move(coords):
        if coords and isinstance(coords[0], (int, float)):
            lon, lat = coords[0], coords[1]
            return [lon + east / (111320.0 * math.cos(math.radians(lat))), lat + north / 111320.0, *coords[2:]]
        return [move(c) for c in coords]

    return {"type": geom["type"], "coordinates": move(geom["coordinates"])}


def _winding(x: float, y: float, ring: list) -> int:
    """輪の線が点 (x, y) のまわりを回る数（左回りを＋）。点から右へ伸ばした線を、下から上へ横切れば＋1、上から下へなら−1"""
    w = 0
    for a, b in zip(ring, ring[1:]):
        x1, y1, x2, y2 = a[0], a[1], b[0], b[1]
        if y1 <= y < y2 and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0:
            w += 1
        elif y2 <= y < y1 and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0:
            w -= 1
    return w


def valid_geometry(geom: dict, others=None) -> dict:
    """外周の線が自分と交わる正しくない形を、正しい形（穴のある形・いくつかの部分）に直す。
    部分ごとに、外周を左回り・穴を右回りにそろえ、線を交わる所で切って面に分け、面ごとに線がまわりを回る数（巻き数）を数える。
    巻き数が奇数の面は中、0 の面は外（アプリの「偶奇」の判定と同じ）。2重に囲まれた面（巻き数が 0 でない偶数）は、
    ほかの筆で半分より多く埋まっていれば穴、そうでなければこの筆の一部にする（others(面) がその近くのほかの筆の形を返す。
    others が無ければ穴）。部分どうしはつなぐ。
    - 法務省の地図データには、区画のまわりを回る道路の筆を1本の線で外側と内側をつないで描いたものがあり
      （横浜市泉区ゆめが丘 101-35・印西市牧の原 3-137 など）、そのままタイルにすると内側の区画まで塗られて、
      中の筆を押したのに道路の地番が出る（内側は2重に囲まれ、ほかの筆で埋まっている → 穴）。
    - 線が同じ所を2回なぞった細い帯（稲敷市堀之内 457-11 の幅 0.4m ほどの帯）は、ほかの筆が無いのでこの筆の一部。
    - shapely の make_valid は線の回り方によって外側（巻き数 0）の部分まで塗ることがあり
      （土浦市中村南１丁目 1401-63 が隣の 26筆の上まで広がった）使わない。
    直せないとき・面が残らないときは元のまま"""
    from shapely.geometry import LineString, mapping, shape
    from shapely.geometry.polygon import orient
    from shapely.ops import polygonize, unary_union

    try:
        g = shape(geom)
        if g.is_valid:
            return geom
        keep = []
        for part in getattr(g, "geoms", [g]):
            part = orient(part, 1.0)
            rings = [list(part.exterior.coords)] + [list(r.coords) for r in part.interiors]
            rings = [r for r in rings if len(r) >= 4]
            for face in polygonize(unary_union([LineString(r) for r in rings])):
                p = face.representative_point()
                w = sum(_winding(p.x, p.y, r) for r in rings)
                if w % 2:
                    keep.append(face)
                elif w != 0 and others is not None:
                    near = [o for o in others(face) if o.is_valid and o.intersects(face)]
                    if not near or face.intersection(unary_union(near)).area <= 0.5 * face.area:
                        keep.append(face)
        fixed = unary_union(keep) if keep else None
        if fixed is None or fixed.is_empty or fixed.geom_type not in ("Polygon", "MultiPolygon") or not fixed.is_valid:
            return geom
        return mapping(fixed)
    except Exception:
        return geom


class _Neighbors:
    """同じ元データ（市区町村の fgb）のほかの筆の形。正しくない形を直すときに初めて必要になったら全部読み、近くの筆を返す
    （位置がずれた地図として外す筆は入れない）"""

    def __init__(self, fgb: str, skip_sheets: dict[str, list[dict]] | None = None):
        self.fgb, self.skip_sheets, self.geoms, self.tree = fgb, skip_sheets, None, None

    def near(self, index: int, area) -> list:
        from shapely import STRtree
        from shapely.geometry import Polygon, shape

        if self.tree is None:
            self.geoms = []
            with fiona.open(self.fgb) as src:
                for f in src:
                    r = skip_rule(self.skip_sheets, f["properties"]) if self.skip_sheets else None
                    if r is not None and r.get("shift"):
                        self.geoms.append(shape(shifted_geometry(f.geometry.__geo_interface__, r["shift"])))
                    else:
                        self.geoms.append(Polygon() if r is not None else shape(f.geometry))
            self.tree = STRtree(self.geoms)
        return [self.geoms[j] for j in self.tree.query(area) if j != index]


# 地番の索引（アプリの地番検索が、町の代表点から遠い筆も最初に開くタイルで見つけられるように）。
# 市区町村コードごとに、地番区域 → [[z16 のタイル x, y, そのタイルの地番の番号（枝番の前）の最小, 最大], …]。
# 地番の頭の甲乙丙・イロハ・番外は外して番号だけで数える（lib/roadmap/parcel.ts の isLotChiban と同じ形）。道・水などの地番の無い筆は入れない
INDEX_ZOOM = 16
LOT_BASE = re.compile(r"^(?:番外|[甲乙丙丁戊己庚辛壬癸]{1,2}|[ｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙｦイロハニホヘトチリヌルヲ]|仮)?-?(\d+)")


def _tile_xy(lng: float, lat: float, z: int = INDEX_ZOOM) -> tuple[int, int]:
    n = 2**z
    lat = max(-85.0, min(85.0, lat))
    r = math.radians(lat)
    return int((lng + 180) / 360 * n), int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)


def _bbox(coords, b=None):
    """GeoJSON の座標（入れ子）の範囲 [西, 南, 東, 北]"""
    if coords and isinstance(coords[0], (int, float)):
        x, y = coords[0], coords[1]
        if b is None:
            return [x, y, x, y]
        b[0], b[1], b[2], b[3] = min(b[0], x), min(b[1], y), max(b[2], x), max(b[3], y)
        return b
    for c in coords:
        b = _bbox(c, b)
    return b


def add_to_index(index: dict, code: str, kuiki: str, chiban: str, geom: dict) -> None:
    """1つの筆を索引に足す（筆の範囲がかかる z16 のタイルすべて。大きな筆で 64 枚を超えるときは四隅のタイルだけ）"""
    m = LOT_BASE.match(unicodedata.normalize("NFKC", chiban or ""))
    if not m or not geom or not geom.get("coordinates"):
        return
    base = int(m.group(1))
    b = _bbox(geom["coordinates"])
    if b is None:
        return
    x0, y1 = _tile_xy(b[0], b[1])
    x1, y0 = _tile_xy(b[2], b[3])
    tiles = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    if len(tiles) > 64:
        tiles = [(x0, y0), (x0, y1), (x1, y0), (x1, y1)]
    k = index.setdefault(code, {}).setdefault(kuiki, {})
    for t in tiles:
        r = k.get(t)
        if r is None:
            k[t] = [base, base]
        else:
            r[0], r[1] = min(r[0], base), max(r[1], base)


def write_index(index: dict, directory: str) -> int:
    """市区町村コードごとに <directory>/<code>.json を書く。形：{"v":1,"z":16,"k":{地番区域:[[x,y,最小,最大],…]}}"""
    os.makedirs(directory, exist_ok=True)
    for code, by_kuiki in index.items():
        k = {kuiki: sorted([x, y, lo, hi] for (x, y), (lo, hi) in tiles.items()) for kuiki, tiles in sorted(by_kuiki.items())}
        with open(os.path.join(directory, f"{code}.json"), "w", encoding="utf-8") as f:
            json.dump({"v": 1, "z": INDEX_ZOOM, "code": code, "k": k}, f, ensure_ascii=False, separators=(",", ":"))
    return len(index)


def append_features(
    fgb: str,
    out,
    boundaries: "Boundaries | None" = None,
    dropped: dict | None = None,
    skip_sheets: dict[str, list[dict]] | None = None,
    skipped: dict | None = None,
    shifted: dict | None = None,
    index: dict | None = None,
    code: str = "",
) -> int:
    """mojxml2ogr の出力から、地番区域と地番だけの GeoJSON の行を書き足す
    （位置がずれた地図の筆と、別の市区町村の中に置かれた筆は外す。測地系の取り違えの地図は正しい位置に動かす）"""
    n = 0
    nb = _Neighbors(fgb, skip_sheets)
    with fiona.open(fgb) as src:
        for i, f in enumerate(src):
            p = f["properties"]
            city = p.get("市区町村名") or ""
            kuiki = "_".join(p.get(k) or "" for k in ("市区町村名", "大字名", "丁目名", "小字名", "予備名"))
            rule = skip_rule(skip_sheets, p) if skip_sheets else None
            geom = f.geometry.__geo_interface__
            if rule is not None and rule.get("shift"):
                geom = shifted_geometry(geom, rule["shift"])
                if shifted is not None:
                    shifted[rule["i"]] = shifted.get(rule["i"], 0) + 1
            elif rule is not None:
                if skipped is not None:
                    skipped[rule["i"]] = skipped.get(rule["i"], 0) + 1
                continue
            if boundaries is not None:
                from shapely.geometry import shape

                try:
                    if boundaries.outside(city, shape(geom)):
                        if dropped is not None:
                            d = dropped.setdefault(city, {"n": 0, "ex": []})
                            d["n"] += 1
                            if len(d["ex"]) < 3:
                                d["ex"].append(f"{kuiki}|{p.get('地番') or ''}")
                        continue
                except Exception:
                    pass
            feat = {"type": "Feature", "properties": {"地番区域": kuiki, "地番": p.get("地番") or ""}, "geometry": valid_geometry(geom, lambda face, i=i: nb.near(i, face))}
            out.write(json.dumps(feat, ensure_ascii=False, separators=(",", ":")) + "\n")
            if index is not None:
                add_to_index(index, code, kuiki, p.get("地番") or "", feat["geometry"])
            n += 1
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pref", required=True, choices=sorted(ORGS))
    ap.add_argument("--year", default="2026")
    ap.add_argument("--out", required=True, help="出力する .pmtiles")
    ap.add_argument("--work", default="work", help="作業用のディレクトリ（zip などを一時的に置く）")
    ap.add_argument("--only", nargs="*", help="この市区町村コードで始まる zip だけ（試すとき用）")
    ap.add_argument("--boundary", help="市区町村の境界（国土数値情報 N03 の zip）。あれば、別の市区町村の中に置かれた筆を外す")
    ap.add_argument("--index", help="地番の索引を書くディレクトリ（市区町村コードごとの JSON。省略時は <work>/index）")
    a = ap.parse_args()
    index: dict = {}
    boundaries = Boundaries(a.boundary) if a.boundary else None
    dropped: dict = {}
    skip_sheets = load_skip_sheets()
    skipped: dict = {}
    shifted: dict = {}

    os.makedirs(a.work, exist_ok=True)
    zips = list_zips(a.pref, a.year)
    if a.only:
        zips = [z for z in zips if any(z[0].startswith(c) for c in a.only)]
    if not zips:
        sys.exit(f"{a.year} 年版の zip が見つかりません（pref={a.pref}）")
    log(f"{ORGS[a.pref]} {a.year}: zip {len(zips)} 件 / {sum(z[2] for z in zips) / 1e9:.2f} GB")

    seq = os.path.join(a.work, f"pref-{a.pref}.geojsons")
    total = 0
    with open(seq, "w", encoding="utf-8") as out:
        for i, (name, url, size) in enumerate(zips, 1):
            zp = os.path.join(a.work, name)
            fgb = zp[:-4] + ".fgb"
            t = time.time()
            download(url, zp)
            # 任意座標系・地区外は入れない（位置が合わない／筆ではない）
            subprocess.run(["mojxml2ogr", fgb, zp], check=True, stdout=subprocess.DEVNULL)
            n = append_features(fgb, out, boundaries, dropped, skip_sheets, skipped, shifted, index, name[:5])
            total += n
            os.remove(zp)
            os.remove(fgb)
            log(f"[{i}/{len(zips)}] {name} {size / 1e6:.0f}MB → {n} 筆 ({time.time() - t:.0f}s)")
    if skipped:
        by_i = {r["i"]: (code, r) for code, rs in skip_sheets.items() for r in rs}
        log(f"位置がずれた・古い・二重の地図の筆を外した: {sum(skipped.values())} 件（{len(skipped)} 件の決まり）")
        for i, k in sorted(skipped.items()):
            code, r = by_i[i]
            log(f"  {code} {r['town']} 地図 {r['sheet']}: {k} 件")
    if shifted:
        by_i = {r["i"]: (code, r) for code, rs in skip_sheets.items() for r in rs}
        log(f"測地系の取り違えで約460mずれていた地図の筆を、正しい位置に動かした: {sum(shifted.values())} 件（{len(shifted)} 件の決まり）")
        for i, k in sorted(shifted.items()):
            code, r = by_i[i]
            log(f"  {code} {r['town']} 地図 {r['sheet']}: {k} 件（東へ {r['shift']['east']:.1f}m・北へ {r['shift']['north']:.1f}m）")
    if dropped:
        log(f"別の市区町村の中に置かれていた筆を外した: {sum(d['n'] for d in dropped.values())} 件")
        for city, d in sorted(dropped.items(), key=lambda kv: -kv[1]["n"]):
            log(f"  {city}: {d['n']} 件（例 {' / '.join(d['ex'])}）")
    log(f"筆 {total} 件 → tippecanoe")
    idx_dir = a.index or os.path.join(a.work, "index")
    log(f"地番の索引: {write_index(index, idx_dir)} 市区町村 → {idx_dir}")

    # z16 は全ての筆を入れる（地番検索に使う）。z14・15 は表示用で、混んだタイルは間引いてよい
    subprocess.run(
        [
            "tippecanoe",
            "-o", a.out,
            "--force",
            "-l", "fude",
            "-Z14", "-z16",
            "-P",
            "--drop-densest-as-needed",
            "--maximum-tile-bytes=2500000",
            "--no-line-simplification",
            "--no-tiny-polygon-reduction-at-maximum-zoom",
            "-q",
            "-n", f"MICHILU parcels {a.year} pref {a.pref}",
            "-A", ATTRIBUTION,
            seq,
        ],
        check=True,
    )
    os.remove(seq)
    log(f"完成: {a.out} ({os.path.getsize(a.out) / 1e6:.0f} MB)")


if __name__ == "__main__":
    main()
