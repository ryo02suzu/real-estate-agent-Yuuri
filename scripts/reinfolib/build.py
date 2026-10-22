#!/usr/bin/env python3
"""
国土交通省「不動産情報ライブラリ」の API（地図のタイルで読む国土数値情報など）から、物件の地点で使うデータを作る。

いまは --probe だけ：各 API の返り方（項目の名前・ズームごとの件数・図形が切られているか）を確かめて、ログに出す。
API キーは環境変数 REINFOLIB_API_KEY（GitHub の Secrets に登録する。会話やコードには書かない）。無ければ何もしないで終わる。

  REINFOLIB_API_KEY=... python3 scripts/reinfolib/build.py --probe
"""
import argparse
import gzip
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://www.reinfolib.mlit.go.jp/ex-api/external/"
UA = "michilu-reinfolib (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"
# 間を空けて呼ぶ（約款：短い時間に多く呼ぶと止められることがある）
PAUSE = 0.25


def fetch(api: str, params: dict, key: str, tries: int = 4):
    """API を呼んで JSON を返す。データが無い（404）ときは None。gzip で返ってくるので戻す"""
    url = API + api + "?" + "&".join(f"{k}={v}" for k, v in params.items())
    for i in range(tries):
        req = urllib.request.Request(url, headers={"Ocp-Apim-Subscription-Key": key, "Accept-Encoding": "gzip", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=180) as res:
                body = res.read()
                if body[:2] == b"\x1f\x8b":
                    body = gzip.decompress(body)
                time.sleep(PAUSE)
                return json.loads(body.decode("utf-8")), len(body)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None, 0
            if e.code in (401, 403):
                sys.exit(f"API キーが使えません（HTTP {e.code}）。GitHub の Secrets の REINFOLIB_API_KEY を確かめてください")
            if i == tries - 1:
                print(f"  HTTP {e.code}: {e.read()[:300]!r}", flush=True)
                raise
        except (urllib.error.URLError, TimeoutError) as e:
            if i == tries - 1:
                raise
            print(f"  再試行（{e}）", flush=True)
        time.sleep(10 * (i + 1))
    return None, 0


def tile_of(lat: float, lng: float, z: int):
    n = 2**z
    r = math.radians(lat)
    return int((lng + 180) / 360 * n), int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)


def tile_bounds(z: int, x: int, y: int):
    """(西, 南, 東, 北)"""
    n = 2**z

    def lat(yy):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))

    return x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)


def coords_of(g):
    if not g:
        return
    t, c = g.get("type"), g.get("coordinates")
    if t == "Point":
        yield c
    elif t in ("LineString", "MultiPoint"):
        yield from c
    elif t in ("Polygon", "MultiLineString"):
        for r in c:
            yield from r
    elif t == "MultiPolygon":
        for p in c:
            for r in p:
                yield from r
    elif t == "GeometryCollection":
        for gg in g.get("geometries") or []:
            yield from coords_of(gg)


def features_of(obj):
    if isinstance(obj, dict):
        return obj.get("features") or []
    return []


def describe(api: str, z: int, x: int, y: int, key: str, ident=None):
    """1枚のタイルの返り方をログに出し、地物の識別子の集合を返す"""
    t0 = time.time()
    obj, size = fetch(api, {"response_format": "geojson", "z": z, "x": x, "y": y}, key)
    feats = features_of(obj)
    w, s, e, n = tile_bounds(z, x, y)
    outside = 0
    xs, ys = [], []
    for f in feats:
        for c in coords_of(f.get("geometry")):
            xs.append(c[0])
            ys.append(c[1])
            if c[0] < w - 1e-7 or c[0] > e + 1e-7 or c[1] < s - 1e-7 or c[1] > n + 1e-7:
                outside += 1
    types: dict[str, int] = {}
    keys: set[str] = set()
    for f in feats:
        gt = (f.get("geometry") or {}).get("type")
        types[gt] = types.get(gt, 0) + 1
        keys.update((f.get("properties") or {}).keys())
    top = sorted(obj.keys()) if isinstance(obj, dict) else type(obj).__name__
    print(f"[{api} z{z}/{x}/{y}] {size:,} bytes, {time.time() - t0:.1f}s, top={top}, features={len(feats)}, types={types}", flush=True)
    if xs:
        print(f"  extent lng {min(xs):.6f}..{max(xs):.6f} lat {min(ys):.6f}..{max(ys):.6f} / tile lng {w:.6f}..{e:.6f} lat {s:.6f}..{n:.6f} / points outside tile: {outside} of {len(xs)}", flush=True)
        sample = xs[0], ys[0]
        print(f"  sample coordinate: {sample}", flush=True)
    if keys:
        print(f"  keys({len(keys)}): {sorted(keys)[:80]}{' ...' if len(keys) > 80 else ''}", flush=True)
    for f in feats[:2]:
        p = f.get("properties") or {}
        short = {k: p[k] for k in list(p)[:40]}
        print(f"  sample: {json.dumps(short, ensure_ascii=False)[:1500]}", flush=True)
    ids = set()
    if ident:
        for f in feats:
            v = ident(f.get("properties") or {})
            if v is not None:
                ids.add(v)
    return ids, feats


def distinct(feats, *names, limit=40):
    """項目の値の組み合わせと件数"""
    out: dict[tuple, int] = {}
    for f in feats:
        p = f.get("properties") or {}
        k = tuple(p.get(n) for n in names)
        out[k] = out.get(k, 0) + 1
    items = sorted(out.items(), key=lambda kv: -kv[1])[:limit]
    print(f"  distinct {names}: {items}", flush=True)


def probe(key: str):
    shibuya = (35.6618, 139.7041)
    shinkiba = (35.6457, 139.8270)  # 埋立地（液状化）
    kohoku = (35.5205, 139.6220)  # 横浜市港北区（大規模盛土）
    katsushika = (35.7436, 139.8475)  # 葛飾区（浸水の履歴）

    def both(api, at, zs, ident):
        """低いズームのタイルと、その中の高いズームのタイルで、同じ地物が入っているか"""
        sets = {}
        for z in zs:
            x, y = tile_of(*at, z)
            ids, feats = describe(api, z, x, y, key, ident)
            sets[z] = (ids, feats)
        hi = max(zs)
        lo = min(zs)
        ids_hi = sets[hi][0]
        ids_lo = sets[lo][0]
        if ids_hi:
            missing = ids_hi - ids_lo
            print(f"  => z{hi} の {len(ids_hi)} 件のうち z{lo} に無いもの: {len(missing)} {sorted(missing)[:10]}", flush=True)
        return sets

    print("==== XKT025 液状化の発生傾向", flush=True)
    s = both("XKT025", shinkiba, [11, 13, 15], lambda p: p.get("mesh_code"))
    distinct(s[11][1], "liquefaction_tendency_level", "note")
    distinct(s[11][1], "topographic_classification_code", "topographic_classification_name_ja", "liquefaction_tendency_level")
    s = both("XKT025", shibuya, [11, 15], lambda p: p.get("mesh_code"))
    distinct(s[11][1], "liquefaction_tendency_level", "note")

    print("==== XKT013 将来推計人口 250m", flush=True)
    s = both("XKT013", shibuya, [11, 13, 15], lambda p: p.get("MESH_ID"))
    for f in s[15][1][:1]:
        print(f"  full properties: {json.dumps(f.get('properties'), ensure_ascii=False)[:6000]}", flush=True)
    hit = [f for f in s[11][1] if any(str(v).strip() for k, v in (f.get("properties") or {}).items() if k.startswith("HITOKU"))]
    print(f"  秘匿のあるメッシュ: {len(hit)} 件", flush=True)
    for f in hit[:2]:
        p = f.get("properties") or {}
        print(f"  秘匿の例: {json.dumps({k: v for k, v in p.items() if k.startswith(('MESH', 'HITOKU', 'GASSAN', 'PTN', 'PT00'))}, ensure_ascii=False)[:1500]}", flush=True)

    print("==== XKT020 大規模盛土造成地", flush=True)
    s = both("XKT020", kohoku, [11, 12, 14], lambda p: p.get("embankment_number"))
    distinct(s[11][1], "embankment_classification")

    print("==== XST001 災害履歴", flush=True)
    s = both("XST001", katsushika, [9, 12, 15], lambda p: (p.get("disastertype_code"), p.get("disaster_date"), p.get("disaster_source")))
    distinct(s[12][1], "disastertype_code", "disaster_name_ja", "disaster_date", "disaster_source")
    s = both("XST001", shinkiba, [9, 12], lambda p: (p.get("disastertype_code"), p.get("disaster_date"), p.get("disaster_source")))
    distinct(s[12][1], "disastertype_code", "disaster_name_ja", "disaster_date")

    print("==== XKT015 駅別乗降客数", flush=True)
    s = both("XKT015", shibuya, [11, 15], lambda p: (p.get("S12_001_ja"), p.get("S12_003_ja")))
    shib = [f for f in s[11][1] if (f.get("properties") or {}).get("S12_001_ja") == "渋谷"]
    for f in shib:
        p = f.get("properties") or {}
        print(f"  渋谷: {json.dumps({k: p.get(k) for k in ('S12_001_ja', 'S12_001c', 'S12_001g', 'S12_002_ja', 'S12_003_ja', 'S12_004', 'S12_005', 'S12_054', 'S12_055', 'S12_056', 'S12_057')}, ensure_ascii=False)}", flush=True)
    distinct(s[11][1], "S12_054", "S12_055")

    print("==== XKT007 保育園・幼稚園等", flush=True)
    s = both("XKT007", shibuya, [13, 15], lambda p: (p.get("preSchoolName_ja"), p.get("location_ja")))
    distinct(s[13][1], "schoolClassCode", "schoolClassCode_name_ja", "welfareFacilityMinorClassCode")

    print("==== XKT010 医療機関", flush=True)
    s = both("XKT010", shibuya, [13, 15], lambda p: (p.get("P04_002_ja"), p.get("P04_003_ja")))
    distinct(s[13][1], "P04_001", "P04_001_name_ja")
    distinct(s[13][1], "P04_009", "P04_010")

    print("==== XCT001 鑑定評価書", flush=True)
    for year, div in ((2026, "05"), (2026, "00")):
        t0 = time.time()
        obj, size = fetch("XCT001", {"year": year, "area": "13", "division": div}, key)
        rows = obj if isinstance(obj, list) else (obj or {}).get("data") if isinstance(obj, dict) else None
        top = sorted(obj.keys()) if isinstance(obj, dict) else type(obj).__name__
        print(f"[XCT001 {year} 13 {div}] {size:,} bytes, {time.time() - t0:.1f}s, top={top}, rows={len(rows) if rows else 0}", flush=True)
        if rows:
            print(f"  keys({len(rows[0])}): {list(rows[0].keys())}", flush=True)
            print(f"  first: {json.dumps(rows[0], ensure_ascii=False)[:8000]}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="各 API の返り方をログに出す")
    a = ap.parse_args()
    key = os.environ.get("REINFOLIB_API_KEY", "").strip()
    if not key:
        print("REINFOLIB_API_KEY が無いので何もしません")
        return
    if a.probe:
        probe(key)


if __name__ == "__main__":
    main()
