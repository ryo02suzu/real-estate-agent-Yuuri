#!/usr/bin/env python3
"""
国土交通省「不動産情報ライブラリ」の不動産価格（取引価格・成約価格）情報取得API（XIT001）から、関東1都6県の直近の取引事例を
市区町村ごとの JSON（deals/<市区町村コード>.json）にする。アプリ（lib/roadmap/deals.ts）は物件の市区町村のファイルだけを読み、
同じ町の事例を「取引事例」のタブに出す。

API キーは環境変数 REINFOLIB_API_KEY（GitHub の Secrets に登録する。会話やコードには書かない）。無ければ何もしないで終わる。
API の利用約款のとおり、画面には「このサービスは、国土交通省不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、
正確性、完全性等が保証されたものではありません」と出す（lib/roadmap/deals.ts の DEALS_NOTE）。

  REINFOLIB_API_KEY=... python3 scripts/deals/build.py --out work/deals             # 直近8四半期
  python3 scripts/deals/build.py --self-test                                        # 変換のテスト（API は呼ばない）
"""
import argparse
import datetime
import gzip
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

PREFS = ("08", "09", "10", "11", "12", "13", "14")
API = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001"
UA = "michilu-deals (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"


def quarters_back(today: datetime.date, n: int):
    """今日の四半期の1つ前から、新しい順に n 個の (年, 四半期)。データが出ていない四半期は API が 404 を返す"""
    y, q = today.year, (today.month - 1) // 3 + 1
    out = []
    for _ in range(n + 1):
        q -= 1
        if q == 0:
            y, q = y - 1, 4
        out.append((y, q))
    return out


def fetch(params: dict, key: str, tries: int = 4):
    """API を呼んで JSON を返す。データが無い（404）ときは None。gzip で返ってくるので戻す"""
    url = API + "?" + "&".join(f"{k}={v}" for k, v in params.items())
    for i in range(tries):
        req = urllib.request.Request(url, headers={"Ocp-Apim-Subscription-Key": key, "Accept-Encoding": "gzip", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                body = res.read()
                if body[:2] == b"\x1f\x8b":
                    body = gzip.decompress(body)
                return json.loads(body.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (401, 403):
                sys.exit(f"API キーが使えません（HTTP {e.code}）。GitHub の Secrets の REINFOLIB_API_KEY を確かめてください")
            if i == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if i == tries - 1:
                raise
        time.sleep(10 * (i + 1))
    return None


def num(v):
    """「80」「1,200」→ 数。「2000㎡以上」「戦前」などの数でないものは None"""
    if v is None:
        return None
    s = unicodedata.normalize("NFKC", str(v)).replace(",", "").strip()
    if re.fullmatch(r"-?\d+(\.\d+)?", s):
        f = float(s)
        return int(f) if f.is_integer() else f
    return None


def period_rank(p: str) -> int:
    """「2024年第3四半期」→ 20243（並べ替え用）"""
    m = re.search(r"(\d{4})年第(\d)四半期", unicodedata.normalize("NFKC", p or ""))
    return int(m.group(1)) * 10 + int(m.group(2)) if m else 0


def normalize(row: dict):
    """API の1件 → アプリの短い形（空の項目は入れない）。価格の無い行は捨てる"""
    price = num(row.get("TradePrice"))
    if not price:
        return None
    kind = "成約" if "成約" in (row.get("PriceCategory") or "") else "取引"
    rec = {
        "k": kind,
        "t": row.get("Type"),
        "r": row.get("Region"),
        "c": row.get("MunicipalityCode"),
        "m": row.get("Municipality"),
        "d": row.get("DistrictName"),
        "dc": row.get("DistrictCode"),
        "p": price,
        "a": num(row.get("Area")),
        "u": num(row.get("UnitPrice")),
        "fp": row.get("FloorPlan"),
        "fa": num(row.get("TotalFloorArea")),
        "by": row.get("BuildingYear"),
        "s": row.get("Structure"),
        "us": row.get("Use"),
        "pu": row.get("Purpose"),
        "dir": row.get("Direction"),
        "rc": row.get("Classification"),
        "br": num(row.get("Breadth")),
        "cp": row.get("CityPlanning"),
        "cr": num(row.get("CoverageRatio")),
        "fr": num(row.get("FloorAreaRatio")),
        "pe": row.get("Period"),
        "rn": row.get("Renovation"),
        "rm": row.get("Remarks"),
        "sh": row.get("LandShape"),
        "fg": row.get("Frontage"),
    }
    # 「2000㎡以上」のような面積は文字のまま
    if rec["a"] is None and row.get("Area"):
        rec["as"] = row.get("Area")
    return {k: v for k, v in rec.items() if v not in (None, "")}


def rows_of(obj):
    """API の応答の行（{"status":"OK","data":[...]} か、行の配列）"""
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict):
        return obj.get("data") or []
    return []


def build(key: str, out: str, n: int, prefs=PREFS):
    os.makedirs(out, exist_ok=True)
    by_city: dict[str, list] = {}
    names: dict[str, str] = {}
    got = []
    for y, q in quarters_back(datetime.date.today(), n):
        for pref in prefs:
            obj = fetch({"year": y, "quarter": q, "area": pref}, key)
            rows = rows_of(obj) if obj is not None else []
            print(f"{y}年第{q}四半期 {pref}: {len(rows)}件", flush=True)
            for row in rows:
                rec = normalize(row)
                if not rec or not rec.get("c"):
                    continue
                by_city.setdefault(rec["c"], []).append(rec)
                if rec.get("m"):
                    names[rec["c"]] = f"{row.get('Prefecture') or ''}{rec['m']}"
            if rows:
                got.append((y, q))
            time.sleep(1)
    if not by_city:
        sys.exit("取引事例が1件も取れませんでした")
    stamp = datetime.date.today().strftime("%Y%m%d")
    for code, recs in by_city.items():
        recs.sort(key=lambda r: -period_rank(r.get("pe", "")))
        with open(os.path.join(out, f"{code}.json"), "w", encoding="utf-8") as f:
            json.dump({"asOf": stamp, "records": recs}, f, ensure_ascii=False, separators=(",", ":"))
    span = sorted(set(got))
    periods = f"{span[0][0]}年第{span[0][1]}四半期〜{span[-1][0]}年第{span[-1][1]}四半期" if span else ""
    meta = {"stamp": stamp, "periods": periods, "cities": dict(sorted(names.items())), "count": sum(len(v) for v in by_city.values())}
    with open(os.path.join(out, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"{len(by_city)}市区町村・{meta['count']}件（{periods}）")


def self_test():
    row = {
        "PriceCategory": "不動産取引価格情報",
        "Type": "宅地(土地)",
        "Region": "住宅地",
        "MunicipalityCode": "13113",
        "Prefecture": "東京都",
        "Municipality": "渋谷区",
        "DistrictName": "神南",
        "TradePrice": "85000000",
        "Area": "80",
        "UnitPrice": "1060000",
        "Breadth": "6.0",
        "CoverageRatio": "80",
        "FloorAreaRatio": "500",
        "Period": "2024年第3四半期",
        "FloorPlan": "",
    }
    r = normalize(row)
    assert r == {"k": "取引", "t": "宅地(土地)", "r": "住宅地", "c": "13113", "m": "渋谷区", "d": "神南", "p": 85000000, "a": 80, "u": 1060000, "br": 6, "cr": 80, "fr": 500, "pe": "2024年第3四半期"}, r
    assert normalize({**row, "Area": "2000㎡以上"})["as"] == "2000㎡以上"
    assert normalize({**row, "PriceCategory": "成約価格情報"})["k"] == "成約"
    assert normalize({**row, "TradePrice": ""}) is None
    assert rows_of({"status": "OK", "data": [row]}) == [row] and rows_of([row]) == [row]
    assert period_rank("2024年第3四半期") == 20243
    assert quarters_back(datetime.date(2026, 10, 21), 2) == [(2026, 3), (2026, 2), (2026, 1)]
    assert quarters_back(datetime.date(2026, 2, 1), 1) == [(2025, 4), (2025, 3)]
    print("ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="work/deals")
    ap.add_argument("--quarters", type=int, default=8)
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    key = os.environ.get("REINFOLIB_API_KEY", "").strip()
    if not key:
        print("REINFOLIB_API_KEY が無いので何もしません（不動産情報ライブラリの API キーを GitHub の Secrets に登録してください）")
        return
    build(key, a.out, a.quarters)


if __name__ == "__main__":
    main()
