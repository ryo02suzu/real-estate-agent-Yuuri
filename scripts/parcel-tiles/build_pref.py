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
import os
import shutil
import subprocess
import sys
import time
import urllib.request

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
    """都県の地図XMLの zip（名前・URL・大きさ）。名前は「11105-0300-2026.zip」（市区町村コード-法務局-年）"""
    req = urllib.request.Request(f"{CKAN}?fq=organization:{ORGS[pref]}&rows=1000", headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    out = {}
    for pkg in data["result"]["results"]:
        for res in pkg["resources"]:
            name = res.get("name") or ""
            if name.endswith(f"-{year}.zip"):
                out[name] = (name, res["url"], int(res.get("size") or 0))
    return sorted(out.values())


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


def append_features(fgb: str, out) -> int:
    """mojxml2ogr の出力から、地番区域と地番だけの GeoJSON の行を書き足す"""
    n = 0
    with fiona.open(fgb) as src:
        for f in src:
            p = f["properties"]
            kuiki = "_".join(p.get(k) or "" for k in ("市区町村名", "大字名", "丁目名", "小字名", "予備名"))
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
    a = ap.parse_args()

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
            n = append_features(fgb, out)
            total += n
            os.remove(zp)
            os.remove(fgb)
            log(f"[{i}/{len(zips)}] {name} {size / 1e6:.0f}MB → {n} 筆 ({time.time() - t:.0f}s)")
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
