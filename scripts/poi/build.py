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
import unicodedata

try:
    import osmium
except ImportError:  # --self-test（名前の絞り込みのテスト）だけなら要らない
    osmium = None

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
# 種類ごとに外す名前（タグの付け違い：動物病院・整骨院・歯科・美容外科、政策金融公庫や ATM、学童保育、役所でない国の機関）。
# 2026-11-14 の点検で足したもの：郵便局のタグの宅配の営業所（ヤマト運輸・佐川急便）・交番、銀行のタグの証券会社・保険・ローンの窓口・郵便局、
# 図書館のタグの「図書館」とだけ書かれたもの（どの図書館か分からない）・大学や学校の図書館（ふつうは外の人が使えない）
EXCLUDE = {
    4: re.compile(r"動物|ペット|獣医|整骨|接骨|鍼灸|整体|美容"),
    5: re.compile(r"動物|ペット|獣医|整骨|接骨|鍼灸|整体|マッサージ|カイロ|歯科|デンタル|美容"),
    7: re.compile(r"ヤマト|クロネコ|宅急便|佐川|配送|運輸|交番|駐在所|警察|ポスト$"),
    8: re.compile(r"公庫|政策金融|ATM|証券|證券|生命|保険|ローン|保証協会|郵便局|会館|ホール|ビル|クイックロビー|コンサルティング"),
    9: re.compile(r"学童|放課後|児童クラブ"),
    10: re.compile(r"法務局|税務署|年金事務所|警察|交番|消防|裁判所|ハローワーク|職業安定所|検察|刑務所|拘置所|入国|運輸支局|自衛隊|郵便|社会保険|労働基準"),
    11: re.compile(r"^(図書館|図書室)$|大学|高校|高等学校|中学校|小学校|学園|学院|医学"),
}
# 種類ごとに、名前がこれに当てはまるものだけ入れる（タグの付け違いが多く、外す名前を並べきれない種類）。
# 郵便局：「〇〇郵便局」「〇〇簡易局」「〇〇局」。銀行：銀行・信用金庫・信用組合・労働金庫・農協・漁協と、その呼び名（「ちばぎん」「けんしん」
# 「埼玉りそな」）、「〇〇支店」「〇〇出張所」で終わるもの（証券会社などは上の EXCLUDE で先に外れる）。
# 役所：役所・役場・庁舎と、支所・出張所・行政センターなど窓口のある所（公民館・集会所・保健センター・国や県の出先は入れない）。
# 名前が市・区の名前だけのもの（「船橋市」「杉並区」）は市役所・区役所（2026-11-14 に 21件を国土地理院の地図の位置と突き合わせ、全部 100m 以内。
# 町・村の名前だけのものは確かめられた例が無いので入れない）。
# 当てはまらない本物（名前が町名だけの郵便局・支所の呼び名が独特な市）は落ちるが、別の施設を郵便局・役所として出すよりよい
INCLUDE = {
    7: re.compile(r"郵便|ゆうびん|簡易局|局$|[Pp]ost [Oo]ffice"),
    8: re.compile(
        r"銀|ぎん|[Gg]in$|信用|信金|しんきん|しん$|信組|しんくみ|金庫|ろうきん|協同組合|共同組合|農協|^[Jj][Aa]|JA|漁協|JF|[Bb][Aa][Nn][Kk]|バンク|商工|ゆうちょ"
        r"|みずほ|MIZUHO|SMBC|三井住友|りそな|三菱UFJ|MUFG|共立|農林中金|信漁連|信連|支店$|出張所$|本店$|営業部$"
    ),
    10: re.compile(
        r"役所|役場|庁|支所|出張所|行政センター|行政サービス|行政局|市民局|地域局|振興局|連絡所|区民事務所|市民事務所|市政センター|総合事務所|窓口|サービスコーナー|サービスセンター"
        r"|^.{1,5}市$|^.{1,4}(?<![地学校工街政治良産])区$"
    ),
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
    # 名前の絞り込みは、全角の英数字（ＪＡ・ＡＴＭ）を半角にそろえてから
    plain = unicodedata.normalize("NFKC", name)
    if kind in EXCLUDE and EXCLUDE[kind].search(plain):
        return None
    if kind in INCLUDE and not INCLUDE[kind].search(plain):
        return None
    return kind


def name_of(tags) -> str:
    """日本語の名前（無ければ name）。支店名があれば足す（「〇〇スーパー 本町店」）"""
    name = (tags.get("name:ja") or tags.get("name") or "").strip()
    branch = (tags.get("branch:ja") or tags.get("branch") or "").strip()
    if name and branch and branch not in name:
        name = f"{name} {branch}"
    return name


def self_test() -> None:
    """名前の絞り込み（kind_of）のテスト。osmium は要らない"""
    k = lambda key, value, name: kind_of({key: value}, name)  # noqa: E731
    # 郵便局：宅配の営業所・交番・「ポスト」は入れない
    for name in ("秋田土崎郵便局", "小町屋簡易局", "下目黒局", "さよう ゆうびんきょく", "Tokyo Central Post Office"):
        assert k("amenity", "post_office", name) == 7, name
    for name in ("ヤマト運輸 秋田飯島営業所", "クロネコヤマト", "宅急便センター", "佐川急便 伊那営業所", "白金三光町交番", "ポスト", "中野6丁目配送センター", "早稲田大学前"):
        assert k("amenity", "post_office", name) is None, name
    # 銀行：証券会社・保険・ローンの窓口・ATM・郵便局は入れない。信用金庫・農協と、その呼び名は入れる
    for name in ("三井住友銀行 梅田支店", "京銀 瀬田支店", "ちばぎん", "けんしん", "ひがしん", "ＪＡ北大阪東支店", "大阪北部農業協同組合 箕面支店", "中央労働金庫 八王子支店", "商工組合中央金庫神田支店", "ゆうちょ銀行 仙台支店", "Tochigin"):
        assert k("amenity", "bank", name) == 8, name
    # 「銀行」と書かれていない本物（呼び名・「〇〇支店」）
    for name in ("埼玉りそな", "みずほ", "SMBC", "大垣共立黒野支店", "鶴岡信用 美原町支店", "農林中金 秋田支店", "秋田しんせい 矢島支店", "ja市原市八幡支店", "けんしんBANK", "岩手県信漁連釜石湾支店・釜石東部支店", "指扇支店"):
        assert k("amenity", "bank", name) == 8, name
    for name in ("野村證券", "大和証券 梅田支店", "ジブラルタ生命", "アコム株式会社", "SMBC川西ローンプラザ", "栃木銀行 ローンセンター", "三井住友銀行ＡＴＭ", "日本政策金融公庫", "土方郵便局", "和歌山野村ビル", "秋田県信用保証協会 横手・湯沢支所"):
        assert k("amenity", "bank", name) is None, name
    for name in ("ローソン 神戸大町二丁目店", "島田質店", "農業共済組合", "りそなクイックロビー", "SMBC大崎コンサルティングオフィス", "きらぼしラウンジ", "愛知県岡崎市森越町森下６‐１"):
        assert k("amenity", "bank", name) is None, name
    # 図書館：「図書館」とだけ書かれたもの・大学や学校の図書館は入れない。市の図書室は入れる
    for name in ("仙台市民図書館", "京丹後市立図書館丹後図書室", "豊中市立いぶき図書室"):
        assert k("amenity", "library", name) == 11, name
    for name in ("図書館", "図書室", "東京大学総合図書館", "宇都宮女子高等学校図書室", "北里記念医学図書館"):
        assert k("amenity", "library", name) is None, name
    # 役所：役所・役場・支所など。公民館・集会所・保健センター・国の出先は入れない
    for name in ("秋田市役所", "香美町役場", "世田谷区役所 砧総合支所", "横浜市 中区役所", "養父市関宮地域局", "海南市下津行政局", "東京都庁", "川崎市 行政サービスコーナー"):
        assert k("amenity", "townhall", name) == 10, name
    for name in ("揖保川公民館", "清和台集会所", "海南市下津保健福祉センター", "近畿地方整備局福知山河川国道事務所", "安城市環境クリーンセンター", "那賀町商工会", "横浜地方法務局"):
        assert k("amenity", "townhall", name) is None, name
    # 名前が市・区の名前だけのものは市役所・区役所。町・村の名前だけのもの・「〇〇地区」「〇〇土地改良区」は入れない
    for name in ("船橋市", "西東京市", "杉並区", "中央区"):
        assert k("amenity", "townhall", name) == 10, name
    for name in ("上富田町", "下田土地改良区", "東部地区", "第一工区"):
        assert k("amenity", "townhall", name) is None, name
    # 前からの決まり：動物病院は外す・医院は診療所に・ドラッグストアのチェーン
    assert k("amenity", "hospital", "仙台市立病院") == 4 and k("amenity", "hospital", "山田医院") == 5 and k("amenity", "hospital", "さくら動物病院") is None
    assert k("amenity", "pharmacy", "ウエルシア 仙台店") == 3 and k("amenity", "pharmacy", "さくら調剤薬局") is None
    assert k("shop", "supermarket", "ヨークベニマル") == 1
    print("ok")


class Handler(osmium.SimpleHandler if osmium else object):
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


def build(pbfs: list[str], out: str, work: str) -> dict[int, int]:
    seq = os.path.join(work, "poi.geojsonl")
    with open(seq, "w", encoding="utf-8") as f:
        h = Handler(f)
        # 面の施設（way）は点の位置が要るので、位置を覚えながら読む（関東・中部など、切り出しごとに）
        for pbf in pbfs:
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
    if "--self-test" in sys.argv[1:]:
        return self_test()
    if osmium is None:
        sys.exit("osmium が要ります（pip install -r scripts/poi/requirements.txt）")
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbf", required=True, nargs="+", help="OpenStreetMap の地域の切り出し（.osm.pbf。関東・中部など複数可）")
    ap.add_argument("--out", help="出力する .pmtiles")
    ap.add_argument("--install", action="store_true", help="public/data/ に置いて lib/roadmap/data/poi-source.json を書き換える")
    ap.add_argument("--source", default="lib/roadmap/data/poi-source.json")
    ap.add_argument("--public", default="public")
    ap.add_argument("--date", help="データの日付（省略時は .osm.pbf の見出しの時点）")
    a = ap.parse_args()
    work = tempfile.mkdtemp(prefix="poi-")
    date = a.date or max(data_date(p) for p in a.pbf)
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
