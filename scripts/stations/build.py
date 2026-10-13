#!/usr/bin/env python3
"""
国土数値情報の鉄道データ（N02）の駅から、関東1都6県のまわりの駅を、アプリが読む小さな JSON にする。
アプリ（lib/roadmap/walk.ts）は物件の近くの駅を選び、国土地理院のベクトルタイルの道路中心線で歩く道のりを求めて、
徒歩の目安（道路距離 80m＝1分）を出す。

駅は同じ名前で乗り換えられる駅（N02 の駅コードのまとまり）ごとに1つにし、路線・事業者と、ホームの線の点を持つ。
新幹線の路線は通勤・通学の案内に使わないので、路線の一覧から外す（新幹線だけの駅は入れない）。

  python3 scripts/stations/build.py --check     # 国土数値情報に新しい年のデータが出たか（changed=true/false）
  python3 scripts/stations/build.py --install   # 最新の年で作り、public/data/ に置いて station-source.json を書き換える

データは CC BY 4.0（国土数値情報利用約款のオープンデータ）
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
# 関東1都6県と、そのまわり（県境の近くの物件から、となりの県の駅にも歩ける）
BBOX = (138.3, 34.8, 141.0, 37.25)
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


def build(yy: int) -> dict:
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
    return {"year": 2000 + yy, "stations": stations}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="新しい年のデータが出たか（GITHUB_OUTPUT に changed=）")
    ap.add_argument("--install", action="store_true", help="最新の年で作り、public/data/ に置く")
    ap.add_argument("--year", type=int, help="2桁の年（省略時は一番新しい年）")
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
    d = build(yy)
    log(f"{d['year']}年：駅 {len(d['stations'])}")
    if a.install:
        path = f"/data/stations-{d['year']}.json"
        old = current.get("url")
        with open(os.path.join(ROOT, "public", path.lstrip("/")), "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        if old and old != path and os.path.exists(os.path.join(ROOT, "public", old.lstrip("/"))):
            os.remove(os.path.join(ROOT, "public", old.lstrip("/")))
        json.dump({"url": path, "year": d["year"], "count": len(d["stations"])}, open(SOURCE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        open(SOURCE, "a").write("\n")


if __name__ == "__main__":
    main()
