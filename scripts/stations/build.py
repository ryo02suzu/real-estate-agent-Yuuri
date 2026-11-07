#!/usr/bin/env python3
"""
国土数値情報の鉄道データ（N02）の駅から、関東1都6県のまわりの駅を、アプリが読む小さな JSON にする。
アプリ（lib/roadmap/walk.ts）は物件の近くの駅を選び、国土地理院のベクトルタイルの道路中心線で歩く道のりを求めて、
徒歩の目安（道路距離 80m＝1分）を出す。

駅は同じ名前で乗り換えられる駅（N02 の駅コードのまとまり）ごとに1つにし、路線・事業者と、ホームの線の点を持つ。
新幹線の路線は通勤・通学の案内に使わないので、路線の一覧から外す（新幹線だけの駅は入れない）。

徒歩の分数は、不動産の広告の決まりどおり駅の出入口までの道路距離で出したいので、OpenStreetMap（関東の切り出し）から
駅の入口の点（e）を足す（--osm）。入口の点が無い駅は、駅舎の建物の輪郭の点、それも無ければ駅の点（同じ名前）。どれも無い駅は
ホームの線の点（p）で測る（アプリはそのとき「ホームまで」と書く）。k は入口の点の種類（1 出入口・2 駅舎・3 駅の点）。
入口の点は、いちばん近いホームの駅のものとする（250m まで）。

  python3 scripts/stations/build.py --check     # 国土数値情報に新しい年のデータが出たか（changed=true/false）
  python3 scripts/stations/build.py --install --osm kanto-latest.osm.pbf   # 最新の年で作り、public/data/ に置いて station-source.json を書き換える

データ：国土数値情報（鉄道データ）は CC BY 4.0（国土数値情報利用約款のオープンデータ）。入口の点は © OpenStreetMap contributors（ODbL）。
入口の点を入れた JSON は ODbL のデータベースとして、同じ ODbL で公開する（アプリと同じサイトに置く）
"""
import argparse
import datetime
import io
import json
import os
import sys
import urllib.error
import urllib.request
import zipfile

URL = "https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-{yy}/N02-{yy}_GML.zip"
UA = {"User-Agent": "michilu-stations (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SOURCE = os.path.join(ROOT, "lib", "roadmap", "data", "station-source.json")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from regions import REGIONS  # noqa: E402

# 対応している地方（lib/roadmap/data/regions.json）と、そのまわり（県境の近くの物件から、となりの県の駅にも歩ける）
BBOX = (
    min(r["bounds"][0][0] for r in REGIONS.values()) - 0.1,
    min(r["bounds"][0][1] for r in REGIONS.values()) - 0.1,
    max(r["bounds"][1][0] for r in REGIONS.values()) + 0.1,
    max(r["bounds"][1][1] for r in REGIONS.values()) + 0.1,
)
# 事業者の呼び方（広告や案内で使う短い名前）
OPERATORS = {
    "東日本旅客鉄道": "JR東日本",
    "東海旅客鉄道": "JR東海",
    "東京地下鉄": "東京メトロ",
    "東京都": "都営",
    "横浜市": "横浜市営",
    "東武鉄道": "東武",
    "西武鉄道": "西武",
    "京王電鉄": "京王",
    "小田急電鉄": "小田急",
    "東急電鉄": "東急",
    "京浜急行電鉄": "京急",
    "京成電鉄": "京成",
    "相模鉄道": "相鉄",
    "首都圏新都市鉄道": "つくばエクスプレス",
    "東京臨海高速鉄道": "りんかい線",
    "埼玉新都市交通": "ニューシャトル",
    "横浜高速鉄道": "横浜高速鉄道",
    "埼玉高速鉄道": "埼玉高速鉄道",
    "東葉高速鉄道": "東葉高速鉄道",
    "北総鉄道": "北総鉄道",
    "新京成電鉄": "新京成",
    "ゆりかもめ": "ゆりかもめ",
    "東京モノレール": "東京モノレール",
    "多摩都市モノレール": "多摩モノレール",
    "湘南モノレール": "湘南モノレール",
    "江ノ島電鉄": "江ノ電",
    "伊豆箱根鉄道": "伊豆箱根鉄道",
    "箱根登山鉄道": "箱根登山鉄道",
    "富士急行": "富士急",
    "関東鉄道": "関東鉄道",
    "秩父鉄道": "秩父鉄道",
    "上信電鉄": "上信電鉄",
    "上毛電気鉄道": "上毛電鉄",
    "わたらせ渓谷鐵道": "わたらせ渓谷鐵道",
    "真岡鐵道": "真岡鐵道",
    "野岩鉄道": "野岩鉄道",
    "ひたちなか海浜鉄道": "ひたちなか海浜鉄道",
    "鹿島臨海鉄道": "鹿島臨海鉄道",
    "流鉄": "流鉄",
    "銚子電気鉄道": "銚子電鉄",
    "小湊鐵道": "小湊鐵道",
    "いすみ鉄道": "いすみ鉄道",
    "芝山鉄道": "芝山鉄道",
    "山万": "山万",
    "千葉都市モノレール": "千葉モノレール",
    "舞浜リゾートライン": "ディズニーリゾートライン",
    "横浜シーサイドライン": "シーサイドライン",
    "東京都交通局": "都営",
}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url: str, rng: str | None = None) -> bytes:
    h = dict(UA)
    if rng:
        h["Range"] = rng
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=300) as r:
        return r.read()


def exists(url: str) -> bool:
    try:
        get(url, "bytes=0-15")
        return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


def latest_year() -> int:
    """国土数値情報に出ている一番新しい年（2桁の年。今年から5年前まで）"""
    this = datetime.date.today().year % 100
    for yy in range(this, this - 6, -1):
        if exists(URL.format(yy=f"{yy:02d}")):
            return yy
    raise SystemExit("鉄道データが見つかりません")


# 号線の番号だけの路線の呼び方（事業者, 路線）
LINE_ALIASES = {("横浜市営", "1号線"): "ブルーライン", ("横浜市営", "3号線"): "ブルーライン", ("横浜市営", "4号線"): "グリーンライン", ("つくばエクスプレス", "常磐新線"): "つくばエクスプレス"}


def line_name(name: str, op: str) -> str:
    """「4号線丸ノ内線」→「丸ノ内線」（地下鉄の号線の番号を外す）。番号だけの路線は呼び方に"""
    import re

    return LINE_ALIASES.get((op, name), re.sub(r"^\d+号線(?=.)", "", name))


# 入口の点を、いちばん近いホームの駅のものとする距離（m）。駅の点（同じ名前）は少し遠くまで
DOOR_RADIUS = 250
NODE_RADIUS = 500
M_LAT = 110_950


def osm_doors(pbf: str) -> dict:
    """OpenStreetMap の駅の出入口（railway=subway_entrance・train_station_entrance）、駅舎（building=train_station の中心）、
    駅の点（railway=station・halt。名前つき）"""
    import osmium

    out = {"entrance": [], "building": [], "node": []}

    class H(osmium.SimpleHandler):
        def node(self, n):
            t = n.tags
            rw = t.get("railway")
            if rw in ("subway_entrance", "train_station_entrance"):
                out["entrance"].append((n.location.lon, n.location.lat, ""))
            elif rw in ("station", "halt") and t.get("name"):
                out["node"].append((n.location.lon, n.location.lat, t.get("name")))

        def way(self, w):
            if w.tags.get("building") != "train_station":
                return
            # 駅舎の輪郭の点（中心ではなく）。線路をまたぐ駅舎（橋上駅）の中心は線路の上で、反対側の道から測ってしまうので、
            # 輪郭の点のうち物件側の点まで測れるようにする
            seen = set()
            for nd in w.nodes:
                if nd.location.valid() and (nd.lon, nd.lat) not in seen:
                    seen.add((nd.lon, nd.lat))
                    out["building"].append((nd.lon, nd.lat, w.tags.get("name") or ""))

    H().apply_file(pbf, locations=True, idx="flex_mem")
    log(f"OpenStreetMap：出入口 {len(out['entrance'])}・駅舎 {len(out['building'])}・駅の点 {len(out['node'])}")
    return out


def osm_doors_all(pbfs: list[str]) -> dict:
    """複数の切り出し（関東・中部など）の出入口などを合わせる"""
    out: dict = {"entrance": [], "building": [], "node": []}
    for p in pbfs:
        d = osm_doors(p)
        for k in out:
            out[k].extend(d[k])
    return out


def osm_date(pbf: str) -> str:
    """切り出しの時点（.osm.pbf の見出しの osmosis_replication_timestamp。無ければファイルの更新日）"""
    import osmium

    try:
        r = osmium.io.Reader(pbf, osmium.osm.osm_entity_bits.NOTHING)
        ts = r.header().get("osmosis_replication_timestamp")
        r.close()
        if ts:
            return ts[:10]
    except Exception as e:  # 見出しが読めなくても作る
        log("見出しの時点を読めません:", e)
    return datetime.date.fromtimestamp(os.path.getmtime(pbf)).isoformat()


def name_key(s: str) -> str:
    """名前の比べ方（全角・半角、空白、「駅」、「ヶ・ケ・ガ」の書き分けをそろえる）"""
    import unicodedata

    s = unicodedata.normalize("NFKC", s or "").replace(" ", "").removesuffix("駅")
    return s.replace("ヶ", "ケ").replace("ヵ", "ケ").replace("が", "ケ").replace("ガ", "ケ")


def attach_doors(stations: list[dict], doors: dict) -> dict:
    """駅ごとの入口の点（e）と種類（k）を足す。数を種類ごとに返す"""
    import math

    # ホームの点の格子（0.005 度。近い駅を早く探す）
    cell = 0.005
    grid: dict[tuple[int, int], list[int]] = {}
    for i, s in enumerate(stations):
        for x, y in s["p"]:
            grid.setdefault((int(x / cell), int(y / cell)), []).append(i)

    def dist(a, b) -> float:
        return math.hypot((a[0] - b[0]) * 111_320 * math.cos(math.radians(b[1])), (a[1] - b[1]) * M_LAT)

    def near(pt, rings: int):
        """まわりの格子（rings 個ぶん）にホームのある駅と、ホームまでの距離"""
        cx, cy = int(pt[0] / cell), int(pt[1] / cell)
        seen = set()
        for gx in range(cx - rings, cx + rings + 1):
            for gy in range(cy - rings, cy + rings + 1):
                for i in grid.get((gx, gy), []):
                    if i not in seen:
                        seen.add(i)
                        yield i, min(dist(pt, q) for q in stations[i]["p"])

    def nearest_station(pt) -> tuple[int, float]:
        return min(near(pt, 1), key=lambda t: t[1], default=(-1, math.inf))

    found: dict[int, dict[str, list]] = {}
    for kind in ("entrance", "building"):
        for x, y, _ in doors[kind]:
            i, d = nearest_station((x, y))
            if i >= 0 and d <= DOOR_RADIUS:
                found.setdefault(i, {}).setdefault(kind, []).append([round(x, 5), round(y, 5)])
    # 駅の点は、同じ名前の駅のうちいちばん近いもの（近くに別の名前の駅のホームがあっても取り違えない。勝田台と東葉勝田台など）
    for x, y, name in doors["node"]:
        k = name_key(name)
        same = [(i, d) for i, d in near((x, y), 2) if d <= NODE_RADIUS and name_key(stations[i]["n"]) == k]
        if same:
            i = min(same, key=lambda t: t[1])[0]
            found.setdefault(i, {}).setdefault("node", []).append([round(x, 5), round(y, 5)])
    counts = {"entrance": 0, "building": 0, "node": 0, "platform": 0}
    for i, s in enumerate(stations):
        f = found.get(i, {})
        for k, kind in ((1, "entrance"), (2, "building"), (3, "node")):
            pts = []
            for q in f.get(kind, []):
                if q not in pts:
                    pts.append(q)
            if pts:
                # 出入口が多い駅（新宿・東京など）は16まで。どの方向から来る物件にも近い出入口が残るよう、互いに離れた点を選ぶ
                # （ホームにいちばん近い点から始め、選んだ点からいちばん遠い点を足していく）
                pts.sort(key=lambda q: min(dist(q, p) for p in s["p"]))
                picked = [pts[0]]
                rest = pts[1:]
                while rest and len(picked) < 16:
                    far = max(rest, key=lambda q: min(dist(q, r) for r in picked))
                    picked.append(far)
                    rest.remove(far)
                s["e"] = picked
                s["k"] = k
                counts[kind] += 1
                break
        else:
            counts["platform"] += 1
    return counts


def build(yy: int, osm: list[str] | None = None) -> dict:
    data = get(URL.format(yy=f"{yy:02d}"))
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        name = next(n for n in z.namelist() if n.endswith("_Station.geojson") and "UTF-8" in n)
        feats = json.loads(z.read(name))["features"]
    groups: dict[str, dict] = {}
    for f in feats:
        p, coords = f["properties"], f["geometry"]["coordinates"]
        if f["geometry"]["type"] != "LineString":
            continue
        if not all(BBOX[0] <= x <= BBOX[2] and BBOX[1] <= y <= BBOX[3] for x, y in coords):
            continue
        op = OPERATORS.get(p["N02_004"], p["N02_004"])
        line = line_name(p["N02_003"], op)
        if "新幹線" in line:
            continue
        g = groups.setdefault(p["N02_005g"], {"n": p["N02_005"], "l": [], "p": []})
        if [line, op] not in g["l"]:
            g["l"].append([line, op])
        for x, y in coords:
            q = [round(x, 5), round(y, 5)]
            if q not in g["p"]:
                g["p"].append(q)
    stations = sorted(groups.values(), key=lambda g: (g["p"][0][1], g["p"][0][0]))
    # 点が多い駅（長いホーム・いくつもの路線）は、道のりを求める点を間引く（端と途中の点で十分）
    for g in stations:
        if len(g["p"]) > 12:
            step = len(g["p"]) / 12
            g["p"] = [g["p"][int(i * step)] for i in range(12)]
    out = {"year": 2000 + yy, "stations": stations}
    if osm:
        counts = attach_doors(stations, osm_doors_all(osm))
        log(f"入口の点：出入口 {counts['entrance']}・駅舎 {counts['building']}・駅の点 {counts['node']}・ホームだけ {counts['platform']}")
        out["doors"] = counts
        out["doorsDate"] = max(osm_date(p) for p in osm)
        # ODbL：OpenStreetMap から作った点を含むデータベースなので、同じ ODbL で公開し、そう書いておく
        out["license"] = (
            "e（駅の入口の点）は © OpenStreetMap contributors、Open Database License（ODbL 1.0。https://opendatacommons.org/licenses/odbl/）。"
            "それ以外は「国土数値情報（鉄道データ）」（国土交通省）を加工して作成（CC BY 4.0）。このファイルは ODbL で公開する"
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="新しい年のデータが出たか（GITHUB_OUTPUT に changed=）")
    ap.add_argument("--install", action="store_true", help="最新の年で作り、public/data/ に置く")
    ap.add_argument("--year", type=int, help="2桁の年（省略時は一番新しい年）")
    ap.add_argument("--osm", nargs="+", help="OpenStreetMap の地域の切り出し（.osm.pbf。関東・中部など複数可）。駅の入口の点を足す")
    a = ap.parse_args()
    current = json.load(open(SOURCE)) if os.path.exists(SOURCE) else {}
    yy = a.year or latest_year()
    if a.check:
        changed = current.get("year") != 2000 + yy
        log(f"国土数値情報の鉄道データ：{2000 + yy}年（アプリは {current.get('year')}）")
        out = os.environ.get("GITHUB_OUTPUT")
        if out:
            with open(out, "a") as f:
                f.write(f"changed={'true' if changed else 'false'}\n")
        return
    d = build(yy, a.osm)
    log(f"{d['year']}年：駅 {len(d['stations'])}")
    if a.install:
        path = f"/data/stations-{d['year']}.json"
        old = current.get("url")
        with open(os.path.join(ROOT, "public", path.lstrip("/")), "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        if old and old != path and os.path.exists(os.path.join(ROOT, "public", old.lstrip("/"))):
            os.remove(os.path.join(ROOT, "public", old.lstrip("/")))
        meta = {"url": path, "year": d["year"], "count": len(d["stations"])}
        if d.get("doors"):
            meta["doors"] = d["doors"]
            meta["doorsDate"] = d["doorsDate"]
        json.dump(meta, open(SOURCE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        open(SOURCE, "a").write("\n")


if __name__ == "__main__":
    main()
