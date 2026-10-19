#!/usr/bin/env python3
"""
国土数値情報の土地利用基本計画の区域のうち、重説の「その他の法令」に関わる自然公園地域（A10）と農業地域（A12）の関東1都6県分を、
1つのベクトルタイル（PMTiles・z14 だけ）にする。アプリ（lib/roadmap/tochi.ts）は物件の地点のタイルだけを読み、地点を含む区域を出す。

  自然公園地域（A10。自然公園法）：自然公園地域・特別地域・特別保護地区
  農業地域（A12。農業振興地域の整備に関する法律）：農業地域（農業振興地域）・農用地区域

どちらも都県の土地利用基本計画図（縮尺約5万分の1）から作った概略の区域で、最新は2015年度版。アプリは参考として出し、
都県・市町村の資料で確かめる旨を添える。形は変えずに（間引かずに）タイルにする。

  python3 scripts/tochi/build.py --check     # 国土数値情報に新しい年度のデータが出たか（changed=true/false）
  python3 scripts/tochi/build.py --install   # 最新の年度で作り、public/data/ に置いて tochi-source.json を書き換える
  python3 scripts/tochi/build.py --out work/tochi.pmtiles   # 作るだけ

データは CC BY 4.0（国土数値情報のオープンデータ。岡山県のみ非商用で、関東は対象外）。
必要なもの: tippecanoe（2.79 以上）、pyshp（pip install pyshp。シェープファイルを読む）
"""
import argparse
import datetime
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

PREFS = ("08", "09", "10", "11", "12", "13", "14")
BASE = "https://nlftp.mlit.go.jp/ksj/gml/data/{code}/{code}-{yy}/{code}-{yy}_{pref}_GML.zip"
UA = {"User-Agent": "michilu-tochi (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
ATTRIBUTION = '<a href="https://nlftp.mlit.go.jp/ksj/">「国土数値情報（自然公園地域データ・農業地域データ）」（国土交通省）</a>を加工して作成'

# データ → レイヤ番号（LAYER_NO）ごとの種類（t）。first は探し始める年度
DATASETS = {
    "A10": {"first": 2015, "layers": {11: 1, 12: 2, 13: 3}},
    "A12": {"first": 2015, "layers": {5: 4, 6: 5}},
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url: str, rng: str | None = None) -> bytes:
    """読む。サーバーの一時的な失敗（5xx・通信）は少し待って4回まで読み直す（404 はそのまま）"""
    h = dict(UA)
    if rng:
        h["Range"] = rng
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=180) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code < 500 or i == 3:
                raise
        except urllib.error.URLError:
            if i == 3:
                raise
        time.sleep(2 * 2**i)
    raise RuntimeError("unreachable")


def exists(url: str) -> bool:
    try:
        get(url, "bytes=0-15")
        return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


def latest() -> dict[str, dict[str, int]]:
    """データごと・都県ごとの一番新しい年度（無い都県は入れない）"""
    this = datetime.date.today().year
    out: dict[str, dict[str, int]] = {}
    for code, ds in DATASETS.items():
        years: dict[str, int] = {}
        for pref in PREFS:
            for year in range(this, ds["first"] - 1, -1):
                if exists(BASE.format(code=code, yy=f"{year % 100:02d}", pref=pref)):
                    years[pref] = year
                    break
        out[code] = years
    return out


def features(code: str, z: zipfile.ZipFile, work: str):
    """zip の中のシェープファイルの面と、種類（t）・計画の年度（y）"""
    import shapefile  # pyshp

    layers = DATASETS[code]["layers"]
    names = z.namelist()
    for shp in [n for n in names if n.lower().endswith(".shp")]:
        stem = shp[:-4]
        d = tempfile.mkdtemp(dir=work)
        for ext in (".shp", ".shx", ".dbf"):
            src = next((n for n in names if n.lower() == (stem + ext).lower()), None)
            if src:
                with open(os.path.join(d, os.path.basename(stem) + ext), "wb") as f:
                    f.write(z.read(src))
        r = shapefile.Reader(os.path.join(d, os.path.basename(stem)), encoding="cp932")
        for sr in r.iterShapeRecords():
            t = layers.get(int(sr.record["LAYER_NO"]))
            g = sr.shape.__geo_interface__
            if not t or g["type"] not in ("Polygon", "MultiPolygon"):
                continue
            props = {"t": t}
            year = str(sr.record["FIS_YEAR"] or "").strip()
            if year.isdigit():
                props["y"] = int(year)
            yield g, props
        r.close()
        shutil.rmtree(d, ignore_errors=True)


def build(years: dict[str, dict[str, int]], out: str, work: str) -> dict:
    seq = os.path.join(work, "tochi.geojsonl")
    counts: dict[str, int] = {}
    with open(seq, "w", encoding="utf-8") as fo:
        for code, by_pref in years.items():
            n = 0
            for pref, year in sorted(by_pref.items()):
                url = BASE.format(code=code, yy=f"{year % 100:02d}", pref=pref)
                with zipfile.ZipFile(io.BytesIO(get(url))) as z:
                    for g, props in features(code, z, work):
                        props["p"] = pref
                        fo.write(json.dumps({"type": "Feature", "geometry": g, "properties": props}, ensure_ascii=False) + "\n")
                        n += 1
            counts[code] = n
            log(f"{code}: {n} 区域（{', '.join(f'{p}:{y}' for p, y in sorted(by_pref.items()))}）")
    tippecanoe = shutil.which("tippecanoe") or "tippecanoe"
    subprocess.run(
        [
            tippecanoe, "-q", "--force", "-o", out, "-l", "tc", "-Z14", "-z14", "--full-detail=12",
            "--no-feature-limit", "--no-tile-size-limit", "--no-line-simplification", "--no-tiny-polygon-reduction",
            "-n", "MICHILU land use plan areas (natural parks, agricultural areas)", "-A", ATTRIBUTION, seq,
        ],
        check=True,
    )
    os.remove(seq)
    log(f"{out}: {os.path.getsize(out) / 1e6:.1f}MB")
    return counts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="新しい年度のデータが出たかだけ調べる（GITHUB_OUTPUT があれば changed= を書く）")
    ap.add_argument("--install", action="store_true", help="最新の年度で作り、public/data/ に置いて tochi-source.json を書き換える")
    ap.add_argument("--out", help="出力する .pmtiles（--install のときは public/data/tochi-<年度>-<日付>.pmtiles）")
    ap.add_argument("--source", default="lib/roadmap/data/tochi-source.json")
    ap.add_argument("--public", default="public")
    ap.add_argument("--work", default=None)
    a = ap.parse_args()

    years = latest()
    current = json.load(open(a.source, encoding="utf-8")) if os.path.exists(a.source) else {}
    changed = years != current.get("years")
    log(f"国土数値情報: {years} / アプリ: {current.get('years')} → {'更新あり' if changed else '更新なし'}")
    if a.check:
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write(f"changed={'true' if changed else 'false'}\n")
        return
    work = a.work or tempfile.mkdtemp(prefix="tochi-")
    os.makedirs(work, exist_ok=True)
    if not a.install:
        if not a.out:
            sys.exit("--out を指定してください")
        build(years, a.out, work)
        return
    stamp = max(y for by_pref in years.values() for y in by_pref.values())
    rel = f"data/tochi-{stamp}-{datetime.date.today():%Y%m%d}.pmtiles"
    out_path = os.path.join(a.public, rel)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    counts = build(years, out_path, work)
    for old in os.listdir(os.path.dirname(out_path)):
        if old.startswith("tochi-") and old.endswith(".pmtiles") and old != os.path.basename(out_path):
            os.remove(os.path.join(os.path.dirname(out_path), old))
            log("removed", old)
    with open(a.source, "w", encoding="utf-8") as f:
        json.dump({"url": f"/{rel}", "years": years, "counts": counts}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log(f"source: {a.source} → /{rel}")


if __name__ == "__main__":
    main()
