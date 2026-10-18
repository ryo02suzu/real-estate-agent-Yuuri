#!/usr/bin/env python3
"""
国土数値情報の宅地造成等工事規制区域・特定盛土等規制区域（A56。盛土規制法の規制区域）から、関東1都6県の区域を1つのベクトルタイル
（PMTiles・z14 だけ）にする。アプリ（lib/roadmap/morido.ts）は物件の地点のタイルだけを読み、地点を含む区域（区分・指定した都県市・
告示番号・施行日）を出す。

データの注意事項（国土数値情報のページ）のとおり、区域の形は変えない（間引かず、z14 のタイルを細かい座標（2^14）で作る）。
概略の位置で法的図書ではないので、アプリは参考として出し、重要事項説明には指定した都県・市の資料で確かめる旨を添える。

  python3 scripts/morido/build.py --check     # 国土数値情報に新しい年度のデータが出たか（changed=true/false）
  python3 scripts/morido/build.py --install   # 最新の年度で作り、public/data/ に置いて morido-source.json を書き換える
  python3 scripts/morido/build.py --year 2025 --out work/morido.pmtiles   # 年度を決めて作るだけ

データは CC BY 4.0（国土数値情報のオープンデータ）。必要なもの: tippecanoe（2.79 以上）
"""
import argparse
import datetime
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile

PREFS = ("08", "09", "10", "11", "12", "13", "14")
URL = "https://nlftp.mlit.go.jp/ksj/gml/data/A56/A56-{yy}/A56-{yy}_{pref}_GML.zip"
PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A56-{year}.html"
UA = {"User-Agent": "michilu-morido (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
ATTRIBUTION = (
    '<a href="https://nlftp.mlit.go.jp/ksj/">「国土数値情報（宅地造成等工事規制区域・特定盛土等規制区域データ）」（国土交通省）</a>を加工して作成'
)
# 規制区域区分（A56_004）。9（記載なし）は入れない
KINDS = {"1": 1, "2": 2}
# 区域を自ら指定する市（指定都市・中核市）のうち、データの時点でまだ区域を指定していない市（区域外の地点の確かめ先に使う）
PENDING_CITIES = {"08201": "水戸市"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url: str, rng: str | None = None) -> bytes:
    h = dict(UA)
    if rng:
        h["Range"] = rng
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=180) as r:
        return r.read()


def exists(url: str) -> bool:
    try:
        get(url, "bytes=0-15")
        return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


def latest() -> int:
    """国土数値情報に出ている一番新しい年度（今年から3年前まで）"""
    this = datetime.date.today().year
    for year in range(this, this - 4, -1):
        if exists(URL.format(yy=f"{year % 100:02d}", pref="13")):
            return year
    raise SystemExit("盛土規制法の規制区域のデータが見つかりません")


def as_of(year: int) -> str | None:
    """データ基準年月日（「2025年7月18日」）。ページから読めなければ None"""
    try:
        text = re.sub(r"<[^>]+>", " ", get(PAGE.format(year=year)).decode("utf-8", "ignore"))
    except urllib.error.URLError:
        return None
    m = re.search(r"データ基準年月日\s*(\d{4})年(?:（[^）]*）)?\s*(\d{1,2})月\s*(\d{1,2})日", text)
    return f"{m.group(1)}年{int(m.group(2))}月{int(m.group(3))}日" if m else None


def text(v) -> str | None:
    s = str(v).strip() if v is not None else ""
    return s or None


def build(year: int, out: str, work: str) -> dict:
    yy = f"{year % 100:02d}"
    seq = os.path.join(work, "morido.geojsonl")
    counts = {"areas": 0, "cities": 0}
    cities = set()
    # 指定都市・中核市の市区町村コード → 市の名前（区域外の地点で、どこの資料で確かめるか）
    authorities = dict(PENDING_CITIES)
    with open(seq, "w", encoding="utf-8") as fo:
        for pref in PREFS:
            with zipfile.ZipFile(io.BytesIO(get(URL.format(yy=yy, pref=pref)))) as z:
                name = next(n for n in z.namelist() if n.endswith(".geojson"))
                feats = json.loads(z.read(name))["features"]
            for f in feats:
                p = f["properties"]
                kind = KINDS.get(text(p.get("A56_004")) or "")
                if not kind or not f.get("geometry"):
                    continue
                props = {
                    "k": kind,
                    "c": text(p.get("A56_002")),
                    "m": text(p.get("A56_003")),
                    "a": text(p.get("A56_005")),
                    "n": text(p.get("A56_006")),
                    "d": text(p.get("A56_007")),
                }
                cities.add(props["c"])
                # 所属未定地（コードの下3桁が 000。埋立地など）は市に当てない
                if props["a"] in ("B", "C") and props["c"] and props["m"] and not props["c"].endswith("000"):
                    m = re.match(r"^(.+?市)", props["m"])
                    authorities[props["c"]] = m.group(1) if m else props["m"]
                fo.write(json.dumps({"type": "Feature", "geometry": f["geometry"], "properties": {k: v for k, v in props.items() if v}}, ensure_ascii=False) + "\n")
                counts["areas"] += 1
    counts["cities"] = len(cities)
    log(f"区域 {counts['areas']}・市区町村 {counts['cities']}")
    tippecanoe = shutil.which("tippecanoe") or "tippecanoe"
    subprocess.run(
        [
            tippecanoe, "-q", "--force", "-o", out, "-l", "md", "-Z14", "-z14", "--full-detail=14",
            "--no-feature-limit", "--no-tile-size-limit", "--no-line-simplification", "--no-tiny-polygon-reduction",
            "-n", "MICHILU morido regulation areas", "-A", ATTRIBUTION, seq,
        ],
        check=True,
    )
    os.remove(seq)
    log(f"{out}: {os.path.getsize(out) / 1e6:.1f}MB")
    counts["authorities"] = dict(sorted(authorities.items()))
    return counts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="新しい年度のデータが出たかだけ調べる（GITHUB_OUTPUT があれば changed= を書く）")
    ap.add_argument("--install", action="store_true", help="最新の年度で作り、public/data/ に置いて morido-source.json を書き換える")
    ap.add_argument("--year", type=int, help="データの年度（省略時は最新）")
    ap.add_argument("--out", help="出力する .pmtiles（--install のときは public/data/morido-<年度>.pmtiles）")
    ap.add_argument("--source", default="lib/roadmap/data/morido-source.json")
    ap.add_argument("--public", default="public")
    ap.add_argument("--work", default=None)
    a = ap.parse_args()

    year = a.year or latest()
    current = json.load(open(a.source, encoding="utf-8")) if os.path.exists(a.source) else {}
    asof = as_of(year)
    changed = year != current.get("year") or (asof is not None and asof != current.get("asOf"))
    log(f"国土数値情報: {year}年度（{asof}時点） / アプリ: {current.get('year')}年度（{current.get('asOf')}時点） → {'更新あり' if changed else '更新なし'}")
    if a.check:
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write(f"changed={'true' if changed else 'false'}\n")
        return
    work = a.work or tempfile.mkdtemp(prefix="morido-")
    os.makedirs(work, exist_ok=True)
    if not a.install:
        if not a.out:
            sys.exit("--out を指定してください")
        build(year, a.out, work)
        return
    rel = f"data/morido-{year}.pmtiles"
    out_path = os.path.join(a.public, rel)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    counts = build(year, out_path, work)
    for old in os.listdir(os.path.dirname(out_path)):
        if old.startswith("morido-") and old.endswith(".pmtiles") and old != os.path.basename(out_path):
            os.remove(os.path.join(os.path.dirname(out_path), old))
            log("removed", old)
    with open(a.source, "w", encoding="utf-8") as f:
        cities = counts.pop("authorities")
        json.dump({"url": f"/{rel}", "year": year, "asOf": asof or f"{year}年度", "counts": counts, "cities": cities}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log(f"source: {a.source} → /{rel}")


if __name__ == "__main__":
    main()
