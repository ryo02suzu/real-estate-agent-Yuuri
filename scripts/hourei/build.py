#!/usr/bin/env python3
"""
国土数値情報の、土砂災害などに関わる法令の区域から、関東1都6県の区域を1つのベクトルタイル（PMTiles・z14 だけ）にする。
アプリ（lib/roadmap/hourei.ts）は物件の地点のタイルだけを読み、地点を含む区域（種類・名前・告示番号・告示日）を出す。

  砂防指定地（A52。砂防法）・地すべり防止区域（A46。地すべり等防止法）・急傾斜地崩壊危険区域（A47。急傾斜地法）・
  災害危険区域（A48。建築基準法39条）

都県ごとに一番新しい年度のデータを使う（A46・A47 は過年度分と合わせて使うよう案内があるが、関東の都県はどれも新しい年度の
データに前の年度の区域が全部入っている。新しい年度で廃止された区域を戻さないよう、混ぜずに新しい年度だけを使う）。
どれも縮尺 1/25,000 程度の概略の位置で、重要事項説明の根拠には使えないので、アプリは参考として出し、指定した都県・市の資料で
確かめる旨と、都県が求める特記事項を添える。

  python3 scripts/hourei/build.py --check     # 国土数値情報に新しい年度のデータが出たか（changed=true/false）
  python3 scripts/hourei/build.py --install   # 最新の年度で作り、public/data/ に置いて hourei-source.json を書き換える
  python3 scripts/hourei/build.py --out work/hourei.pmtiles   # 作るだけ

データは CC BY 4.0（国土数値情報のオープンデータ。都県ごとの利用条件は特記事項の明記）。必要なもの: tippecanoe（2.79 以上）
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
BASE = "https://nlftp.mlit.go.jp/ksj/gml/data/{code}/{code}-{yy}/{code}-{yy}_{pref}_GML.zip"
UA = {"User-Agent": "michilu-hourei (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
ATTRIBUTION = (
    '<a href="https://nlftp.mlit.go.jp/ksj/">「国土数値情報（砂防指定地・地すべり防止区域・急傾斜地崩壊危険区域・災害危険区域データ）」（国土交通省）</a>を加工して作成'
)

# データの種類（t）。first は探し始める年度（これより古い年度は見ない）
DATASETS = {
    "A52": {"t": 1, "first": 2023},
    "A46": {"t": 2, "first": 2020},
    "A47": {"t": 3, "first": 2020},
    "A48": {"t": 4, "first": 2020},
}
# 地すべり防止区域の所管（ファイル名の a・b・c）
A46_OFFICE = {"a": "国土交通省", "b": "農林水産省（農村振興局）", "c": "林野庁"}


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


def text(v) -> str | None:
    s = str(v).strip().replace("　", " ") if v is not None else ""
    return s or None


def date(v) -> str | None:
    """告示日。「9999/1/1」（不明）は入れない。「2005/4/6」→「2005-04-06」、和暦はそのまま"""
    s = text(v)
    if not s or s.startswith("9999"):
        return None
    m = re.match(r"^(\d{4})/(\d{1,2})/(\d{1,2})$", s)
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else s


def features(code: str, z: zipfile.ZipFile):
    """zip の中の面の地物と、その属性（短い名前）"""
    for name in z.namelist():
        if not name.lower().endswith(".geojson") or (code == "A52" and "Polygon" not in name):
            continue
        office = None
        if code == "A46":
            m = re.search(r"A46-([abc])-\d+_\d+\.geojson$", name)
            office = A46_OFFICE.get(m.group(1)) if m else None
        for f in json.loads(z.read(name))["features"]:
            g = f.get("geometry")
            if not g or g["type"] not in ("Polygon", "MultiPolygon"):
                continue
            p = f["properties"]
            if code == "A52":
                n = text(p.get("A52_004"))
                sub = text(p.get("A52_005"))
                props = {"c": text(p.get("A52_002")), "m": text(p.get("A52_003")), "n": f"{n} {sub}" if n and sub else n or sub, "d": date(p.get("A52_006")), "g": text(p.get("A52_007"))}
            elif code == "A48":
                reason = text(p.get("A48_008"))
                rule = text(p.get("A48_011"))
                props = {"c": text(p.get("A48_003")), "m": text(p.get("A48_002")), "n": text(p.get("A48_005")), "d": date(p.get("A48_009")), "g": text(p.get("A48_010")), "r": reason, "o": rule, "a": int(p["A48_004"]) if p.get("A48_004") else None}
            else:
                k = next((k for k in p if re.match(rf"^{code}(-[abc])?_002$", k)), None)
                pre = k[: -len("002")] if k else f"{code}_"
                props = {"c": text(p.get(pre + "002")), "m": text(p.get(pre + "003")), "n": text(p.get(pre + "004")), "d": date(p.get(pre + "006")), "g": text(p.get(pre + "007")), "o": office}
            props = {"t": DATASETS[code]["t"], **{k: v for k, v in props.items() if v not in (None, "")}}
            yield g, props


def build(years: dict[str, dict[str, int]], out: str, work: str) -> dict:
    seq = os.path.join(work, "hourei.geojsonl")
    counts: dict[str, int] = {}
    with open(seq, "w", encoding="utf-8") as fo:
        for code, by_pref in years.items():
            n = 0
            for pref, year in sorted(by_pref.items()):
                url = BASE.format(code=code, yy=f"{year % 100:02d}", pref=pref)
                with zipfile.ZipFile(io.BytesIO(get(url))) as z:
                    for g, props in features(code, z):
                        props["p"] = pref
                        fo.write(json.dumps({"type": "Feature", "geometry": g, "properties": props}, ensure_ascii=False) + "\n")
                        n += 1
            counts[code] = n
            log(f"{code}: {n} 区域（{', '.join(f'{p}:{y}' for p, y in sorted(by_pref.items()))}）")
    tippecanoe = shutil.which("tippecanoe") or "tippecanoe"
    subprocess.run(
        [
            tippecanoe, "-q", "--force", "-o", out, "-l", "hr", "-Z14", "-z14", "--full-detail=14",
            "--no-feature-limit", "--no-tile-size-limit", "--no-line-simplification", "--no-tiny-polygon-reduction",
            "-n", "MICHILU regulation areas (sabo, landslide, steep slope, disaster risk)", "-A", ATTRIBUTION, seq,
        ],
        check=True,
    )
    os.remove(seq)
    log(f"{out}: {os.path.getsize(out) / 1e6:.1f}MB")
    return counts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="新しい年度のデータが出たかだけ調べる（GITHUB_OUTPUT があれば changed= を書く）")
    ap.add_argument("--install", action="store_true", help="最新の年度で作り、public/data/ に置いて hourei-source.json を書き換える")
    ap.add_argument("--out", help="出力する .pmtiles（--install のときは public/data/hourei-<日付>.pmtiles）")
    ap.add_argument("--source", default="lib/roadmap/data/hourei-source.json")
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
    work = a.work or tempfile.mkdtemp(prefix="hourei-")
    os.makedirs(work, exist_ok=True)
    if not a.install:
        if not a.out:
            sys.exit("--out を指定してください")
        build(years, a.out, work)
        return
    stamp = max(y for by_pref in years.values() for y in by_pref.values())
    rel = f"data/hourei-{stamp}-{datetime.date.today():%Y%m%d}.pmtiles"
    out_path = os.path.join(a.public, rel)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    counts = build(years, out_path, work)
    for old in os.listdir(os.path.dirname(out_path)):
        if old.startswith("hourei-") and old.endswith(".pmtiles") and old != os.path.basename(out_path):
            os.remove(os.path.join(os.path.dirname(out_path), old))
            log("removed", old)
    with open(a.source, "w", encoding="utf-8") as f:
        json.dump({"url": f"/{rel}", "years": years, "counts": counts}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log(f"source: {a.source} → /{rel}")


if __name__ == "__main__":
    main()
