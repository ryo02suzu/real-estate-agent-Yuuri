#!/usr/bin/env python3
"""
国土数値情報の地価公示（L01・毎年1月1日時点）と都道府県地価調査（L02・毎年7月1日時点）から、関東1都6県の標準地・基準地を
1つのベクトルタイル（PMTiles）にする。アプリ（lib/roadmap/land-price.ts）は物件のまわりのタイルだけを読み、近い地点の価格・
前年比・用途・最寄り駅などを出す（動く地図にも点で重ねる）。

レイヤは2つ。lp（z13 だけ。属性を全部持つ。物件のまわりを調べるのと、地図の拡大時の点）と、pt（z8〜12。地図を引いたときの点。
価格と用途だけ）。林地（円/10a の地点）は入れない。

  python3 scripts/land-price/build.py --check     # 国土数値情報に新しい年のデータが出たか（changed=true/false）
  python3 scripts/land-price/build.py --install   # 最新の年で作り、public/data/ に置いて land-price-source.json を書き換える
  python3 scripts/land-price/build.py --l01 2026 --l02 2026 --out work/land-price.pmtiles   # 年を決めて作るだけ

データは CC BY 4.0（国土数値情報利用約款のオープンデータ）。必要なもの: tippecanoe（2.79 以上）
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
import unicodedata
import urllib.error
import urllib.request
import zipfile

PREFS = ("08", "09", "10", "11", "12", "13", "14")
URL = "https://nlftp.mlit.go.jp/ksj/gml/data/{k}/{k}-{yy}/{k}-{yy}_{pref}_GML.zip"
UA = {"User-Agent": "michilu-land-price (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
ATTRIBUTION = (
    '<a href="https://nlftp.mlit.go.jp/ksj/">「国土数値情報（地価公示データ・都道府県地価調査データ）」（国土交通省）</a>を加工して作成'
)
# 標準地番号・基準地番号の用途の数字（住宅地は付けない）。林地は入れない
USAGE = {"000": "", "003": "3", "005": "5", "009": "9"}
# 価格の推移として持つ年数
HISTORY = 6


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


def latest(kind: str) -> int:
    """国土数値情報に出ている一番新しい年（東京都のファイルで調べる）"""
    this = datetime.date.today().year
    for y in range(this + 1, this - 4, -1):
        if exists(URL.format(k=kind, yy=f"{y % 100:02d}", pref="13")):
            return y
    raise SystemExit(f"{kind} のデータが見つかりません")


def nfkc(v) -> str | None:
    if not isinstance(v, str):
        return None
    v = unicodedata.normalize("NFKC", v).strip()
    return v if v and v != "_" else None


def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x


# 地価公示（L01）と地価調査（L02）で、同じ中身の属性の番号
FIELDS = {
    "L01": dict(
        usage="L01_002", seq="L01_003", year="L01_007", price="L01_008", change="L01_009", status="L01_010", city="L01_001", name="L01_024",
        addr="L01_025", jukyo="L01_026", area="L01_027", use_big="L01_028", use="L01_029", struct="L01_031", above="L01_038", below="L01_039",
        road="L01_040", road_dir="L01_041", road_w="L01_042", env="L01_047", station="L01_048", station_m="L01_050", zone="L01_051",
        fire="L01_052", plan="L01_053", bcr="L01_057", far="L01_058", hist0=62, hist_base=1921,
    ),
    "L02": dict(
        usage="L02_001", seq="L02_002", year="L02_005", price="L02_006", change="L02_007", status="L02_008", city="L02_020", name="L02_021",
        addr="L02_022", jukyo="L02_023", area="L02_024", use_big="L02_025", use="L02_026", struct="L02_028", above="L02_035", below="L02_036",
        road="L02_037", road_dir="L02_038", road_w="L02_039", env="L02_044", station="L02_045", station_m="L02_046", zone="L02_047",
        fire="L02_048", plan="L02_049", bcr="L02_051", far="L02_052", hist0=56, hist_base=1927,
    ),
}


def points(kind: str, pref: str, data: dict):
    F = FIELDS[kind]
    for f in data["features"]:
        p = f["properties"]
        usage = str(p.get(F["usage"]) or "")
        if usage not in USAGE:
            continue
        price = num(p.get(F["price"]))
        if not price:
            continue
        year = int(p[F["year"]])
        seq = int(str(p.get(F["seq"]) or "0") or 0)
        name = nfkc(p.get(F["name"])) or ""
        # 地価調査の基準地番号は「千代田(都)5-1」「横浜中(県)-1」
        no = f"{name}{'' if kind == 'L01' else '(都)' if pref == '13' else '(県)'}{USAGE[usage]}-{seq}"
        hist = []
        for y in range(year - HISTORY + 1, year + 1):
            v = num(p.get(f"{kind}_{y - F['hist_base']:03d}"))
            hist.append(int(v) if v else 0)
        # 新しく選ばれた地点（選定状況 4）や前年の価格が無い地点は、前年比を出さない
        change = num(p.get(F["change"]))
        if str(p.get(F["status"])) == "4" or not hist[-2]:
            change = None
        out = {
            "k": 0 if kind == "L01" else 1,
            "no": no,
            "p": int(price),
            "c": change,
            "u": USAGE[usage] or "0",
            "y": year,
            "a": nfkc(p.get(F["addr"])),
            "j": nfkc(p.get(F["jukyo"])),
            "s": int(num(p.get(F["area"])) or 0) or None,
            "now": nfkc(p.get(F["use"])) or nfkc(p.get(F["use_big"])),
            "st": nfkc(p.get(F["struct"])),
            "fa": int(num(p.get(F["above"])) or 0) or None,
            "fb": int(num(p.get(F["below"])) or 0) or None,
            "rt": nfkc(p.get(F["road"])),
            "rd": nfkc(p.get(F["road_dir"])),
            "rw": num(p.get(F["road_w"])) or None,
            "env": nfkc(p.get(F["env"])),
            "sta": nfkc(p.get(F["station"])),
            "sd": int(num(p.get(F["station_m"])) or 0),
            "zn": nfkc(p.get(F["zone"])),
            "fi": nfkc(p.get(F["fire"])),
            "pl": nfkc(p.get(F["plan"])),
            "bc": int(num(p.get(F["bcr"])) or 0) or None,
            "fr": int(num(p.get(F["far"])) or 0) or None,
            "hy": year - HISTORY + 1,
            "h": ",".join(str(v) for v in hist),
        }
        if not out["sta"]:
            out.pop("sd")
        yield f["geometry"]["coordinates"], {k: v for k, v in out.items() if v is not None}


def read_zip(blob: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = next(n for n in z.namelist() if n.endswith(".geojson"))
        return json.loads(z.read(name).decode("utf-8"))


def build(l01: int, l02: int, out: str, work: str) -> dict:
    seq = os.path.join(work, "land-price.geojsonl")
    counts = {}
    with open(seq, "w", encoding="utf-8") as f:
        for kind, year in (("L01", l01), ("L02", l02)):
            for pref in PREFS:
                url = URL.format(k=kind, yy=f"{year % 100:02d}", pref=pref)
                n = 0
                for (lng, lat), props in points(kind, pref, read_zip(get(url))):
                    geom = {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]}
                    # 拡大した地図と物件のまわりを調べるのに使う（属性を全部）
                    f.write(json.dumps({"type": "Feature", "tippecanoe": {"layer": "lp", "minzoom": 13, "maxzoom": 13}, "geometry": geom, "properties": props}, ensure_ascii=False) + "\n")
                    # 引いた地図の点（価格と用途だけ）
                    small = {k: props[k] for k in ("k", "no", "p", "c", "u") if k in props}
                    f.write(json.dumps({"type": "Feature", "tippecanoe": {"layer": "pt", "minzoom": 8, "maxzoom": 12}, "geometry": geom, "properties": small}, ensure_ascii=False) + "\n")
                    n += 1
                counts[f"{kind}-{pref}"] = n
                log(f"{kind} {year} {pref}: {n} 地点")
    tippecanoe = shutil.which("tippecanoe") or "tippecanoe"
    subprocess.run(
        [
            tippecanoe, "-q", "--force", "-o", out, "-Z8", "-z13", "-r1", "--no-feature-limit", "--no-tile-size-limit",
            "-n", "MICHILU land prices", "-A", ATTRIBUTION, seq,
        ],
        check=True,
    )
    os.remove(seq)
    log(f"{out}: {os.path.getsize(out) / 1e6:.1f}MB")
    return counts


def edition(l01: int, l02: int) -> str:
    era = lambda y: f"令和{y - 2018}年" if y >= 2019 else f"{y}年"  # noqa: E731
    return f"地価公示 {era(l01)}（{l01}年1月1日時点）・地価調査 {era(l02)}（{l02}年7月1日時点）"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="新しい年のデータが出たかだけ調べる（GITHUB_OUTPUT があれば changed= を書く）")
    ap.add_argument("--install", action="store_true", help="最新の年で作り、public/data/ に置いて land-price-source.json を書き換える")
    ap.add_argument("--l01", type=int, help="地価公示の年（省略時は最新）")
    ap.add_argument("--l02", type=int, help="地価調査の年（省略時は最新）")
    ap.add_argument("--out", help="出力する .pmtiles（--install のときは public/data/land-price-<年>-<年>.pmtiles）")
    ap.add_argument("--source", default="lib/roadmap/data/land-price-source.json")
    ap.add_argument("--public", default="public")
    ap.add_argument("--work", default=None)
    a = ap.parse_args()

    l01 = a.l01 or latest("L01")
    l02 = a.l02 or latest("L02")
    current = json.load(open(a.source, encoding="utf-8")) if os.path.exists(a.source) else {}
    changed = (l01, l02) != (current.get("l01"), current.get("l02"))
    log(f"国土数値情報: 地価公示 {l01}・地価調査 {l02} / アプリ: {current.get('l01')}・{current.get('l02')} → {'更新あり' if changed else '更新なし'}")
    if a.check:
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write(f"changed={'true' if changed else 'false'}\n")
        return

    work = a.work or tempfile.mkdtemp(prefix="land-price-")
    os.makedirs(work, exist_ok=True)
    if not a.install:
        if not a.out:
            sys.exit("--out を指定してください")
        build(l01, l02, a.out, work)
        return
    # 年ごとにファイル名を変える（ブラウザやCDNに古いタイルが残っても混ざらない）
    rel = f"data/land-price-{l01}-{l02}.pmtiles"
    out_path = os.path.join(a.public, rel)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    counts = build(l01, l02, out_path, work)
    for old in os.listdir(os.path.dirname(out_path)):
        if old.startswith("land-price-") and old.endswith(".pmtiles") and old != os.path.basename(out_path):
            os.remove(os.path.join(os.path.dirname(out_path), old))
            log("removed", old)
    with open(a.source, "w", encoding="utf-8") as f:
        json.dump({"url": f"/{rel}", "edition": edition(l01, l02), "l01": l01, "l02": l02, "points": counts}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log(f"source: {a.source} → /{rel}（{edition(l01, l02)}）")


if __name__ == "__main__":
    main()
