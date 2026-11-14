#!/usr/bin/env python3
"""
国土数値情報の小学校区（A27）・中学校区（A32）と学校（P29）から、関東1都6県の通学区域を1つのベクトルタイル（PMTiles）にする。
アプリ（lib/roadmap/school.ts）は物件の地点のタイル（z14）だけを読み、地点を含む小学校区・中学校区の学校名・所在地・位置を出す。

学校区のデータは市区町村ごとに利用条件が違う（国土数値情報の「公開に関する利用条件」の Excel）。オープンデータ（CC BY 4.0）として
公開している市区町村と、条件が「参考情報として使う」旨だけの市区町村を入れ、商用利用・再配布ができない市区町村、公開していない市区町村、
使う前に市の確認が要る市区町村、地図での表示に懸念を示している市区町村は入れない。

  python3 scripts/school-districts/build.py --check     # 国土数値情報に新しい年のデータが出たか（changed=true/false）
  python3 scripts/school-districts/build.py --install   # 最新の年で作り、public/data/ に置いて school-source.json を書き換える
  python3 scripts/school-districts/build.py --year 2023 --out work/school.pmtiles   # 年を決めて作るだけ

必要なもの: tippecanoe（2.79 以上）、openpyxl（pip install openpyxl）
"""
import argparse
import datetime
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

try:
    import openpyxl
except ImportError:  # --self-test（区域の広さの計算のテスト）だけなら要らない
    openpyxl = None

import os as _os, sys as _sys

_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), ".."))
import ksj  # noqa: E402
from regions import prefs  # noqa: E402

# 対応している都道府県（lib/roadmap/data/regions.json。関東1都6県＋中部9県）
PREFS = prefs()
URL = "https://nlftp.mlit.go.jp/ksj/gml/data/{k}/{k}-{yy}/{k}-{yy}_{pref}_GML.zip"
PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A27-{year}.html"
UA = {"User-Agent": "michilu-school-districts (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
ATTRIBUTION = (
    '<a href="https://nlftp.mlit.go.jp/ksj/">「国土数値情報（小学校区データ・中学校区データ・学校データ）」（国土交通省）</a>を加工して作成'
)
# 条件付きで公開している市区町村のうち、条件が「参考情報として使い、最新は教育委員会に確かめる」旨のもの（画面にその旨を出すので入れる）。
# ほかの条件付き（使う前に市の確認が要る・地図に区域を出すことに懸念がある）は入れない
CONDITIONAL_OK = {"09206", "10201", "11212"}
# 市区町村ごとの一言（画面に添える）
NOTES = {"09206": "旧今市市・旧藤原町の学区の詳細は、日光市教育委員会に確かめてください"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url: str, rng: str | None = None) -> bytes:
    """読む（通信の失敗・429・5xx は読み直す。scripts/ksj.py）"""
    return ksj.get(url, UA, rng)


def exists(url: str) -> bool:
    """ファイルがあるか（404 なら無い・ZIP ならある。確認用のページなどは待って読み直す。scripts/ksj.py）"""
    return ksj.exists(url, UA)


def latest() -> int:
    """小学校区・中学校区・学校がそろって出ている一番新しい年"""
    this = datetime.date.today().year
    for y in range(this + 1, 2020, -1):
        yy = f"{y % 100:02d}"
        if all(exists(URL.format(k=k, yy=yy, pref="13")) for k in ("A27", "A32", "P29")):
            return y
    raise SystemExit("学校区のデータが見つかりません")


def allowed(year: int) -> dict[str, dict]:
    """商用で使える市区町村（行政コード → 小学校区・中学校区それぞれ使えるか）。データセットのページから利用条件の Excel を探して読む"""
    if openpyxl is None:
        raise SystemExit("openpyxl が要ります（pip install openpyxl）")
    page = get(PAGE.format(year=year)).decode("utf-8", "replace")
    m = re.search(r'href="([^"]*Terms_of_use_municipality_data[^"]*\.xlsx)"', page)
    if not m:
        raise SystemExit("利用条件の一覧（Excel）が見つかりません")
    url = m.group(1) if m.group(1).startswith("http") else "https://nlftp.mlit.go.jp" + m.group(1)
    wb = openpyxl.load_workbook(io.BytesIO(get(url)), read_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    out = {}

    def ok(code: str, open_: str, use: str, special: str) -> bool:
        if not str(open_ or "").startswith("01"):
            return False
        use = str(use or "")
        if "不可" in use:
            return False
        if use.startswith("オープンデータ"):
            return True
        return use.startswith("条件公開") and code in CONDITIONAL_OK

    for r in rows[1:]:
        if not r[0] or str(r[0])[:2] not in PREFS:
            continue
        code = str(r[1]).zfill(5)
        out[code] = {
            "es": ok(code, r[3], r[4], r[5]),
            "jh": ok(code, r[7], r[8], r[9]),
            # 国のデータで公開しているか（「02公開不可」「03作成不可」は国のデータに無い）
            "es_pub": str(r[3] or "").startswith("01"),
            "jh_pub": str(r[7] or "").startswith("01"),
            "name": r[2],
        }
    return out


def read_zip(blob: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = next(n for n in z.namelist() if n.endswith(".geojson"))
        return json.loads(z.read(name).decode("utf-8"))


def text(v) -> str | None:
    if not isinstance(v, str):
        return None
    v = v.strip()
    return v if v and v != "_" else None


def area_m2(geom: dict | None) -> float:
    """区域の広さ（m²。緯度で東西を縮めた平面での計算。区域どうしの大小を比べるためのもので、測量の面積ではない）"""
    if not geom:
        return 0.0
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]] if geom["type"] == "Polygon" else []
    total = 0.0
    for poly in polys:
        for i, ring in enumerate(poly):
            if len(ring) < 3:
                continue
            k = 111320 * math.cos(math.radians(sum(q[1] for q in ring) / len(ring))) * 110940
            a = abs(sum(ring[j][0] * ring[(j + 1) % len(ring)][1] - ring[(j + 1) % len(ring)][0] * ring[j][1] for j in range(len(ring)))) / 2 * k
            total += a if i == 0 else -a
    return total


def self_test() -> None:
    """区域の広さの計算のテスト（通信・tippecanoe は要らない）"""
    # 緯度 35度で、東西 0.01度（約 912m）× 南北 0.01度（約 1,109m）の四角 ＝ 約 101ha
    sq = [[139.0, 35.0], [139.01, 35.0], [139.01, 35.01], [139.0, 35.01], [139.0, 35.0]]
    a = area_m2({"type": "Polygon", "coordinates": [sq]})
    assert 1.00e6 < a < 1.02e6, a
    # 穴は引く・複数の区域は足す
    hole = [[139.002, 35.002], [139.004, 35.002], [139.004, 35.004], [139.002, 35.004], [139.002, 35.002]]
    b = area_m2({"type": "Polygon", "coordinates": [sq, hole]})
    assert abs((a - b) / a - 0.04) < 0.001, (a, b)
    assert abs(area_m2({"type": "MultiPolygon", "coordinates": [[sq], [hole]]}) - (a + (a - b))) < 1, "multi"
    assert area_m2(None) == 0.0 and area_m2({"type": "Point", "coordinates": [139, 35]}) == 0.0
    print("ok")


def build(year: int, out: str, work: str) -> dict:
    yy = f"{year % 100:02d}"
    ok = allowed(year)
    skipped = sorted({f"{c} {v['name']}" for c, v in ok.items() if not (v["es"] and v["jh"])})
    log(f"入れない市区町村（小・中のどちらか）: {len(skipped)}: {', '.join(skipped)}")
    # 小学校区・中学校区それぞれ、国のデータでは公開しているが利用条件で入れない市区町村（アプリは「利用条件で出せない」と書き、
    # 公開していない・作っていない市区町村は「国のデータに無い」と書く）
    skipped_by = {key: sorted(f"{c} {v['name']}" for c, v in ok.items() if v[f"{key}_pub"] and not v[key]) for key in ("es", "jh")}
    # 小学校区・中学校区それぞれ、実際にタイルに入れた市区町村（アプリはここに無い市区町村を「データなし」と書く）
    covered: dict[str, set[str]] = {"es": set(), "jh": set()}
    # 学校の位置（学校コード → 経度・緯度）
    where: dict[str, list[float]] = {}
    for pref in PREFS:
        for f in read_zip(ksj.get_zip(URL.format(k="P29", yy=yy, pref=pref), UA))["features"]:
            code = text(f["properties"].get("P29_002"))
            if code and f["geometry"] and f["geometry"]["type"] == "Point":
                where[code] = [round(c, 6) for c in f["geometry"]["coordinates"]]
    log(f"学校の位置: {len(where)}")
    seq = os.path.join(work, "school.geojsonl")
    counts = {"es": 0, "jh": 0, "located": 0}
    with open(seq, "w", encoding="utf-8") as fo:
        for kind, key in (("A27", "es"), ("A32", "jh")):
            for pref in PREFS:
                feats = read_zip(ksj.get_zip(URL.format(k=kind, yy=yy, pref=pref), UA))["features"]
                # 学校ごとの区域の広さ（区域がいくつかに分かれていれば合計）。国のデータには、市内のどこからでも通える学校などの区域が
                # 市の全域に重ねてある所があり、アプリは重なった所でいちばん狭い区域の学校（近所の学校）を出す。タイルは区域を切って
                # 入れるので、タイルの中の形からは広さが分からない（どちらもタイルを覆っていると同じに見える）。それで広さを入れておく
                school = lambda p: (str(p.get(f"{kind}_001") or "").zfill(5), text(p.get(f"{kind}_003")) or text(p.get(f"{kind}_004")))  # noqa: E731
                size: dict[tuple, float] = {}
                for f in feats:
                    size[school(f["properties"])] = size.get(school(f["properties"]), 0.0) + area_m2(f["geometry"])
                for f in feats:
                    p = f["properties"]
                    city = str(p.get(f"{kind}_001") or "").zfill(5)
                    if not ok.get(city, {}).get(key):
                        continue
                    code = text(p.get(f"{kind}_003"))
                    props = {
                        "k": 0 if key == "es" else 1,
                        "n": text(p.get(f"{kind}_004")),
                        "o": text(p.get(f"{kind}_002")),
                        "a": text(p.get(f"{kind}_005")),
                        "c": city,
                        "nt": NOTES.get(city),
                        # 区域の広さ（ha。1ha に満たなければ 1）
                        "ar": max(1, round(size[school(p)] / 10000)),
                    }
                    if code in where:
                        props["x"], props["y"] = where[code]
                        counts["located"] += 1
                    fo.write(json.dumps({"type": "Feature", "geometry": f["geometry"], "properties": {k: v for k, v in props.items() if v is not None}}, ensure_ascii=False) + "\n")
                    counts[key] += 1
                    covered[key].add(city)
    log(f"小学校区 {counts['es']}・中学校区 {counts['jh']}（学校の位置あり {counts['located']}）")
    tippecanoe = shutil.which("tippecanoe") or "tippecanoe"
    subprocess.run(
        [
            tippecanoe, "-q", "--force", "-o", out, "-l", "sd", "-Z14", "-z14", "--no-feature-limit", "--no-tile-size-limit",
            "--detect-shared-borders", "-n", "MICHILU school districts", "-A", ATTRIBUTION, seq,
        ],
        check=True,
    )
    os.remove(seq)
    log(f"{out}: {os.path.getsize(out) / 1e6:.1f}MB")
    counts["skipped"] = skipped
    counts["skipped_by"] = skipped_by
    counts["covered"] = {k: " ".join(sorted(v)) for k, v in covered.items()}
    return counts


def main() -> None:
    if "--self-test" in sys.argv[1:]:
        return self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="新しい年のデータが出たかだけ調べる（GITHUB_OUTPUT があれば changed= を書く）")
    ap.add_argument("--install", action="store_true", help="最新の年で作り、public/data/ に置いて school-source.json を書き換える")
    ap.add_argument("--year", type=int, help="データの年（省略時は最新）")
    ap.add_argument("--out", help="出力する .pmtiles（--install のときは public/data/school-<年>.pmtiles）")
    ap.add_argument("--source", default="lib/roadmap/data/school-source.json")
    ap.add_argument("--public", default="public")
    ap.add_argument("--work", default=None)
    a = ap.parse_args()

    year = a.year or latest()
    current = json.load(open(a.source, encoding="utf-8")) if os.path.exists(a.source) else {}
    changed = year != current.get("year")
    log(f"国土数値情報: {year}年度 / アプリ: {current.get('year')}年度 → {'更新あり' if changed else '更新なし'}")
    if a.check:
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write(f"changed={'true' if changed else 'false'}\n")
        return
    work = a.work or tempfile.mkdtemp(prefix="school-")
    os.makedirs(work, exist_ok=True)
    if not a.install:
        if not a.out:
            sys.exit("--out を指定してください")
        build(year, a.out, work)
        return
    rel = f"data/school-{year}.pmtiles"
    out_path = os.path.join(a.public, rel)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    counts = build(year, out_path, work)
    for old in os.listdir(os.path.dirname(out_path)):
        if old.startswith("school-") and old.endswith(".pmtiles") and old != os.path.basename(out_path):
            os.remove(os.path.join(os.path.dirname(out_path), old))
            log("removed", old)
    era = f"令和{year - 2018}年度" if year >= 2019 else f"{year}年度"
    with open(a.source, "w", encoding="utf-8") as f:
        json.dump(
            {
                "url": f"/{rel}",
                "edition": f"{era}（{year}年度）",
                "year": year,
                "counts": {k: v for k, v in counts.items() if k not in ("skipped", "skipped_by", "covered")},
                "excluded": counts["skipped"],
                "excludedBy": counts["skipped_by"],
                # 行政コードを空白でつないだもの（政令市は市のコード）
                "covered": counts["covered"],
            },
            f,
            ensure_ascii=False,
            indent=1,
        )
        f.write("\n")
    log(f"source: {a.source} → /{rel}")


if __name__ == "__main__":
    main()
