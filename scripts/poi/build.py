#!/usr/bin/env python3
"""
OpenStreetMap（© OpenStreetMap contributors、ODbL）の関東の施設のうち、販売図面の「生活環境」に書くもの（スーパー・コンビニ・
ドラッグストア・病院・診療所・公園・郵便局・銀行・幼稚園と保育園・役所・図書館・商業施設）と飲食店を、点のベクトルタイル（PMTiles・z14 だけ）にする。
アプリ（lib/roadmap/poi.ts）は物件のまわりのタイルだけを読み、種類ごとに近い施設を選んで、国土地理院の道路中心線で徒歩の目安を出す。

  python3 scripts/poi/build.py --pbf kanto-latest.osm.pbf --install   # public/data/poi-<日付>.pmtiles を置き、poi-source.json を書き換える
  python3 scripts/poi/build.py --pbf kanto-latest.osm.pbf --out work/poi.pmtiles   # 作るだけ

元のデータは OpenStreetMap フランスの地域の切り出し（https://download.openstreetmap.fr/extracts/asia/japan/kanto-latest.osm.pbf。
毎日更新）。名前の無い施設は入れない（販売図面に書けない）。面の施設（公園・病院など）は、面の点の平均の位置にする。
タグの付け方のばらつきは名前で直す（薬局のタグのドラッグストアを入れる、医院・クリニックは診療所に、動物病院・整骨院などは外す）。
タイルは ODbL のデータベース（OpenStreetMap から作ったもの）で、同じ ODbL で公開する（アプリと同じサイトに置く）。

必要なもの: osmium（pip install -r scripts/poi/requirements.txt。pyosmium）、tippecanoe（2.79 以上）
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import osmium

# 種類の番号（c）→ (名前, 当てはまるタグ)。番号はアプリの lib/roadmap/poi.ts の POI_KINDS と同じ
KINDS = {
    1: ("スーパー", [("shop", "supermarket")]),
    2: ("コンビニ", [("shop", "convenience")]),
    3: ("ドラッグストア", [("shop", "chemist")]),
    4: ("病院", [("amenity", "hospital")]),
    5: ("診療所", [("amenity", "clinic"), ("amenity", "doctors")]),
    6: ("公園", [("leisure", "park")]),
    7: ("郵便局", [("amenity", "post_office")]),
    8: ("銀行", [("amenity", "bank")]),
    9: ("幼稚園・保育園", [("amenity", "kindergarten"), ("amenity", "childcare")]),
    10: ("役所", [("amenity", "townhall")]),
    11: ("図書館", [("amenity", "library")]),
    12: ("商業施設", [("shop", "mall"), ("shop", "department_store")]),
    # 飲食店（周辺環境の「飲食店」と、まわりの飲食店の多さの目安に使う。販売図面の生活環境の一覧には出さない）
    13: ("飲食店", [("amenity", "restaurant"), ("amenity", "cafe"), ("amenity", "fast_food"), ("amenity", "food_court")]),
}
TAG_KIND = {kv: k for k, (_, kvs) in KINDS.items() for kv in kvs}
# 薬局（amenity=pharmacy）のうちドラッグストアのチェーン（日本の OpenStreetMap ではドラッグストアの多くが pharmacy。調剤だけの薬局は入れない）
DRUG_CHAINS = re.compile(
    r"ドラッグ|マツモトキヨシ|マツキヨ|ウエルシア|ウェルシア|クリエイト|サンドラッグ|セイムス|スギ薬局|ココカラ|トモズ|カワチ|福太郎|ツルハ|アオキ|"
    r"ウェルパーク|ヤックス|セイジョー|ぱぱす|ハック|フィットケア|コスモス|マルエ|キリン堂|ダイコク|サツドラ|ゲンキー|コクミン|ヒグチ|オーエス"
)
# hospital のうち名前に「病院」などが無いもの（医院・クリニック）は診療所にする（病院は病床20以上の施設）
HOSPITAL = re.compile(r"病院|医療センター|メディカルセンター|大学.*医院|順天堂医院")
# 種類ごとに外す名前（タグの付け違い：動物病院・整骨院・歯科・美容外科、政策金融公庫や ATM、学童保育、役所でない国の機関）
EXCLUDE = {
    4: re.compile(r"動物|ペット|獣医|整骨|接骨|鍼灸|整体|美容"),
    5: re.compile(r"動物|ペット|獣医|整骨|接骨|鍼灸|整体|マッサージ|カイロ|歯科|デンタル|美容"),
    8: re.compile(r"公庫|政策金融|ATM|ＡＴＭ"),
    9: re.compile(r"学童|放課後|児童クラブ"),
    10: re.compile(r"法務局|税務署|年金事務所|警察|交番|消防|裁判所|ハローワーク|職業安定所|検察|刑務所|拘置所|入国|運輸支局|自衛隊|郵便|社会保険|労働基準"),
}
ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>（ODbL）'


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def kind_of(tags, name: str) -> int | None:
    kind = None
    for key in ("shop", "amenity", "leisure"):
        v = tags.get(key)
        if v and (key, v) in TAG_KIND:
            kind = TAG_KIND[(key, v)]
            break
    if kind is None and tags.get("amenity") == "pharmacy" and DRUG_CHAINS.search(name):
        kind = 3
    if kind == 4 and not HOSPITAL.search(name):
        kind = 5
    if kind in EXCLUDE and EXCLUDE[kind].search(name):
        return None
    return kind


def name_of(tags) -> str:
    """日本語の名前（無ければ name）。支店名があれば足す（「〇〇スーパー 本町店」）"""
    name = (tags.get("name:ja") or tags.get("name") or "").strip()
    branch = (tags.get("branch:ja") or tags.get("branch") or "").strip()
    if name and branch and branch not in name:
        name = f"{name} {branch}"
    return name


class Handler(osmium.SimpleHandler):
    def __init__(self, out):
        super().__init__()
        self.out = out
        self.counts: dict[int, int] = {}

    def emit(self, kind: int, name: str, lng: float, lat: float):
        self.out.write(json.dumps({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]}, "properties": {"c": kind, "n": name}}, ensure_ascii=False) + "\n")
        self.counts[kind] = self.counts.get(kind, 0) + 1

    def node(self, n):
        name = name_of(n.tags)
        kind = kind_of(n.tags, name) if name else None
        if kind is not None and n.location.valid():
            self.emit(kind, name, n.location.lon, n.location.lat)

    def way(self, w):
        name = name_of(w.tags)
        kind = kind_of(w.tags, name) if name else None
        if kind is None:
            return
        pts = [(nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
        if pts:
            self.emit(kind, name, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def data_date(pbf: str) -> str:
    """切り出しの時点（.osm.pbf の見出しの osmosis_replication_timestamp。無ければファイルの更新日）"""
    try:
        r = osmium.io.Reader(pbf, osmium.osm.osm_entity_bits.NOTHING)
        ts = r.header().get("osmosis_replication_timestamp")
        r.close()
        if ts:
            return ts[:10]
    except Exception as e:  # 見出しが読めなくても作る
        log("見出しの時点を読めません:", e)
    return datetime.date.fromtimestamp(os.path.getmtime(pbf)).isoformat()


def build(pbf: str, out: str, work: str) -> dict[int, int]:
    seq = os.path.join(work, "poi.geojsonl")
    with open(seq, "w", encoding="utf-8") as f:
        h = Handler(f)
        # 面の施設（way）は点の位置が要るので、位置を覚えながら読む
        h.apply_file(pbf, locations=True)
    for k, (label, _) in KINDS.items():
        log(f"{k:>2} {label}: {h.counts.get(k, 0)}")
    tippecanoe = shutil.which("tippecanoe") or "tippecanoe"
    subprocess.run(
        [
            tippecanoe, "-q", "--force", "-o", out, "-l", "poi", "-Z14", "-z14",
            "--no-feature-limit", "--no-tile-size-limit", "-r1",
            "-n", "MICHILU nearby facilities (OpenStreetMap)", "-A", ATTRIBUTION, seq,
        ],
        check=True,
    )
    os.remove(seq)
    log(f"{out}: {os.path.getsize(out) / 1e6:.1f}MB")
    return h.counts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbf", required=True, help="OpenStreetMap の地域の切り出し（.osm.pbf）")
    ap.add_argument("--out", help="出力する .pmtiles")
    ap.add_argument("--install", action="store_true", help="public/data/ に置いて lib/roadmap/data/poi-source.json を書き換える")
    ap.add_argument("--source", default="lib/roadmap/data/poi-source.json")
    ap.add_argument("--public", default="public")
    ap.add_argument("--date", help="データの日付（省略時は .osm.pbf の見出しの時点）")
    a = ap.parse_args()
    work = tempfile.mkdtemp(prefix="poi-")
    date = a.date or data_date(a.pbf)
    if not a.install:
        if not a.out:
            sys.exit("--out を指定してください")
        build(a.pbf, a.out, work)
        return
    rel = f"data/poi-{date.replace('-', '')}.pmtiles"
    out_path = os.path.join(a.public, rel)
    counts = build(a.pbf, out_path, work)
    # 前の回より大きく減っていたら（読み込みの失敗など）置き換えない
    old = json.load(open(a.source, encoding="utf-8")) if os.path.exists(a.source) else {}
    before = sum(old.get("counts", {}).values()) if old else 0
    if before and sum(counts.values()) < 0.8 * before:
        os.remove(out_path)
        sys.exit(f"::error::施設が前の回（{before}）の8割より少ないので置き換えません")
    for f in os.listdir(os.path.dirname(out_path)):
        if f.startswith("poi-") and f.endswith(".pmtiles") and f != os.path.basename(out_path):
            os.remove(os.path.join(os.path.dirname(out_path), f))
            log("removed", f)
    with open(a.source, "w", encoding="utf-8") as f:
        json.dump({"url": f"/{rel}", "date": date, "counts": {str(k): counts.get(k, 0) for k in KINDS}}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log(f"source: {a.source} → /{rel}")


if __name__ == "__main__":
    main()
