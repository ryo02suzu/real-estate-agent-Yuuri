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

ORGS = {
    "08": "moj-08ibaraki",
    "09": "moj-09tochigi",
    "10": "moj-10gunma",
    "11": "moj-11saitama",
    "12": "moj-12chiba",
    "13": "moj-13tokyo",
    "14": "moj-14kanagawa",
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


def append_features(
    fgb: str,
    out,
    boundaries: "Boundaries | None" = None,
    dropped: dict | None = None,
    skip_sheets: dict[str, list[dict]] | None = None,
    skipped: dict | None = None,
) -> int:
    """mojxml2ogr の出力から、地番区域と地番だけの GeoJSON の行を書き足す
    （位置がずれた地図の筆と、別の市区町村の中に置かれた筆は外す）"""
    n = 0
    with fiona.open(fgb) as src:
        for f in src:
            p = f["properties"]
            city = p.get("市区町村名") or ""
            kuiki = "_".join(p.get(k) or "" for k in ("市区町村名", "大字名", "丁目名", "小字名", "予備名"))
            rule = skip_rule(skip_sheets, p) if skip_sheets else None
            if rule is not None:
                if skipped is not None:
                    skipped[rule["i"]] = skipped.get(rule["i"], 0) + 1
                continue
            if boundaries is not None:
                from shapely.geometry import shape

                try:
                    if boundaries.outside(city, shape(f.geometry)):
                        if dropped is not None:
                            d = dropped.setdefault(city, {"n": 0, "ex": []})
                            d["n"] += 1
                            if len(d["ex"]) < 3:
                                d["ex"].append(f"{kuiki}|{p.get('地番') or ''}")
                        continue
                except Exception:
                    pass
            feat = {"type": "Feature", "properties": {"地番区域": kuiki, "地番": p.get("地番") or ""}, "geometry": f.geometry.__geo_interface__}
            out.write(json.dumps(feat, ensure_ascii=False, separators=(",", ":")) + "\n")
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
    a = ap.parse_args()
    boundaries = Boundaries(a.boundary) if a.boundary else None
    dropped: dict = {}
    skip_sheets = load_skip_sheets()
    skipped: dict = {}

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
            n = append_features(fgb, out, boundaries, dropped, skip_sheets, skipped)
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
    if dropped:
        log(f"別の市区町村の中に置かれていた筆を外した: {sum(d['n'] for d in dropped.values())} 件")
        for city, d in sorted(dropped.items(), key=lambda kv: -kv[1]["n"]):
            log(f"  {city}: {d['n']} 件（例 {' / '.join(d['ex'])}）")
    log(f"筆 {total} 件 → tippecanoe")

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
