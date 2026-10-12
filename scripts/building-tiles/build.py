"""PLATEAU（国土交通省の3D都市モデル）の建物を、建物ごとの代表点と属性だけのタイル（PMTiles）にする。

建物の 3D Tiles（LOD1）の b3dm から、頭（28バイト）と地物表・バッチ表（属性）だけを HTTP の範囲指定で読み、
形（glTF）は読まない。バッチ表には建物ごとの代表点（_x, _y）と範囲（_xmin…_ymax）、用途・階数・高さ・構造などがある。
これを点の地物にして tippecanoe で z17 のタイルにする（MICHILU は地点の建物を調べ、地図に用途と階数を出す）。

    python3 scripts/building-tiles/build.py --pref 13 --out work/bldg-13.pmtiles
    python3 scripts/building-tiles/build.py --codes 13116,11103 --out work/pilot.pmtiles   # 試すとき
    python3 scripts/building-tiles/build.py --list-codes 08,09,10,11,12,13,14               # データのある市区町村コード（JSON）

使う都県・市区町村の一覧は、PLATEAU のデータカタログ API（最新版の建築物モデル）から取る。
.github/workflows/building-tiles.yml が都県ごとに並べて作り、まとめて Cloudflare R2 に置く。
"""

import argparse
import concurrent.futures as cf
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import time
import urllib.request

CATALOG = "https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets"
UA = {"User-Agent": "michilu-building-tiles"}
ATTRIBUTION = '<a href="https://www.mlit.go.jp/plateau/">「3D都市モデル（Project PLATEAU）」（国土交通省）</a>を加工して作成'
# 1度あたりのメートル（緯度35.7度あたり。範囲のずれを m にするだけなので、関東では十分）
M_PER_DEG_LAT = 110_950


def get(url: str, rng: tuple[int, int] | None = None, tries: int = 5) -> bytes:
    for i in range(tries):
        try:
            h = dict(UA)
            if rng:
                h["Range"] = f"bytes={rng[0]}-{rng[1]}"
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=180) as r:
                return r.read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2**i)
    raise RuntimeError(url)


def tilesets(pref: str | list[str] | None, codes: list[str] | None) -> list[dict]:
    """最新版の建築物モデル（LOD1）の 3D Tiles。区のある政令市は区ごと"""
    data = json.loads(get(CATALOG))
    out = []
    for d in data["latest_datasets"]:
        if d.get("type_en") != "bldg" or str(d.get("lod")) != "1":
            continue
        code = d.get("ward_code") or d.get("city_code")
        if codes and code not in codes and d.get("city_code") not in codes:
            continue
        if pref and d.get("pref_code") not in ([pref] if isinstance(pref, str) else pref):
            continue
        out.append({"code": code, "name": f"{d.get('city') or ''}{d.get('ward') or ''}", "url": d["url"]})
    # 同じ市区町村に複数あれば1つ（テクスチャの有無の違いだけ）
    seen, uniq = set(), []
    for t in out:
        if t["code"] not in seen:
            seen.add(t["code"])
            uniq.append(t)
    return uniq


def leaves(url: str) -> list[str]:
    """tileset.json をたどって、中身のある末端（b3dm）の URL を集める（入れ子の tileset.json もたどる）"""
    t = json.loads(get(url))
    base = url.rsplit("/", 1)[0] + "/"
    out: list[str] = []

    def walk(n: dict) -> None:
        c = n.get("content") or {}
        u = c.get("uri") or c.get("url")
        if u:
            full = u if u.startswith("http") else base + u
            if full.split("?")[0].endswith(".json"):
                out.extend(leaves(full))
            elif full.split("?")[0].endswith(".b3dm"):
                out.append(full)
        for ch in n.get("children") or []:
            walk(ch)

    walk(t["root"])
    return out


FMT = {"DOUBLE": "d", "FLOAT": "f", "UNSIGNED_INT": "I", "INT": "i", "UNSIGNED_SHORT": "H", "SHORT": "h", "UNSIGNED_BYTE": "B", "BYTE": "b"}


def column(bt: dict, binb: bytes, n: int, key: str) -> list:
    v = bt.get(key)
    if isinstance(v, dict):
        fmt = FMT[v["componentType"]]
        return list(struct.unpack_from("<" + fmt * n, binb, v.get("byteOffset", 0)))
    return v if isinstance(v, list) else [None] * n


def num(v, digits: int = 0):
    """数値の属性（9999 などの「不明」は外す）"""
    if v is None or isinstance(v, bool):
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if x <= 0 or x >= 9999:
        return None
    return round(x, digits) if digits else int(round(x))


def text(v) -> str | None:
    if not isinstance(v, str):
        return None
    v = v.strip()
    return v if v and v not in ("不明", "その他", "-") else None


def structure(attrs: dict, fire: str | None) -> str | None:
    """構造（防火上の構造の区分）。市区町村によって入れ方が違うので、細かいほうから順に見る"""
    for d in attrs.get("uro:BuildingDetailAttribute") or []:
        for k in ("uro:buildingStructureType", "uro:buildingStructureOrgType"):
            if text(d.get(k)):
                return text(d.get(k))
    for kv in attrs.get("uro:KeyValuePairAttribute") or []:
        if kv.get("uro:key") == "建物構造コード" and text(kv.get("uro:codeValue")):
            return text(kv.get("uro:codeValue"))
    return fire


def detail(attrs: dict, key: str):
    for d in attrs.get("uro:BuildingDetailAttribute") or []:
        if d.get(key) is not None:
            return d.get(key)
    return None


def features(url: str) -> list[dict]:
    head = get(url, (0, 27))
    magic, _ver, _length, ftj, ftb, btj, btb = struct.unpack("<4sIIIIII", head)
    if magic != b"b3dm" or not btj:
        return []
    body = get(url, (28, 28 + ftj + ftb + btj + btb - 1))
    ft = json.loads(body[:ftj])
    o = ftj + ftb
    bt = json.loads(body[o : o + btj])
    binb = body[o + btj : o + btj + btb]
    n = ft["BATCH_LENGTH"]
    col = lambda k: column(bt, binb, n, k)  # noqa: E731
    xs, ys = col("_x"), col("_y")
    x0, x1, y0, y1 = col("_xmin"), col("_xmax"), col("_ymin"), col("_ymax")
    names, usage = col("gml:name"), col("bldg:usage")
    above, below, height = col("bldg:storeysAboveGround"), col("bldg:storeysBelowGround"), col("bldg:measuredHeight")
    fire = col("uro:BuildingDetailAttribute_uro:fireproofStructureType")
    attrs = bt.get("attributes") or [{}] * n
    ids = col("gml_id")
    out = []
    for i in range(n):
        if xs[i] is None or ys[i] is None:
            continue
        a = attrs[i] if isinstance(attrs[i], dict) else {}
        kx = M_PER_DEG_LAT * math.cos(math.radians(ys[i]))
        f = text(fire[i])
        p = {
            "nm": text(names[i]),
            "u": text(usage[i]),
            "f": num(above[i]),
            "b": num(below[i]),
            "h": num(height[i], 1),
            "k": structure(a, f),
            "d": text(detail(a, "uro:detailedUsage")),
            "a": num(detail(a, "uro:buildingFootprintArea") or detail(a, "uro:buildingRoofEdgeArea")),
            "t": num(detail(a, "uro:totalFloorArea")),
            "y": num(a.get("bldg:yearOfConstruction")),
            "sv": num(detail(a, "uro:surveyYear")),
        }
        # 建物の範囲（代表点からのずれ。m の整数で外側へ丸める）
        if None not in (x0[i], x1[i], y0[i], y1[i]):
            p["x0"] = math.floor((x0[i] - xs[i]) * kx)
            p["x1"] = math.ceil((x1[i] - xs[i]) * kx)
            p["y0"] = math.floor((y0[i] - ys[i]) * M_PER_DEG_LAT)
            p["y1"] = math.ceil((y1[i] - ys[i]) * M_PER_DEG_LAT)
        out.append(
            {
                "type": "Feature",
                "id_": ids[i] or f"{xs[i]:.7f},{ys[i]:.7f}",
                "geometry": {"type": "Point", "coordinates": [round(xs[i], 7), round(ys[i], 7)]},
                "properties": {k: v for k, v in p.items() if v is not None},
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pref", help="都道府県コード（2桁）")
    ap.add_argument("--codes", help="市区町村コード（カンマ区切り。試すとき）")
    ap.add_argument("--out")
    ap.add_argument("--work", default="work")
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--list-codes", help="都道府県コード（カンマ区切り）。データのある市区町村コードを JSON で書き出すだけ")
    args = ap.parse_args()
    if args.list_codes:
        print(json.dumps(sorted(t["code"] for t in tilesets(args.list_codes.split(","), None))))
        return
    if not args.out:
        ap.error("--out が要ります")
    os.makedirs(args.work, exist_ok=True)
    sets = tilesets(args.pref, args.codes.split(",") if args.codes else None)
    print(f"{len(sets)} 市区町村", file=sys.stderr)
    seq = os.path.join(args.work, os.path.basename(args.out) + ".geojsonl")
    total = 0
    t0 = time.time()
    with open(seq, "w", encoding="utf-8") as f, cf.ThreadPoolExecutor(args.jobs) as ex:
        for s in sets:
            try:
                ls = leaves(s["url"])
            except Exception as e:  # 1つの市区町村が読めなくても、ほかは作る
                print(f"::warning::{s['code']} {s['name']}: {e}", file=sys.stderr)
                continue
            n = 0
            # 3D Tiles では、タイルの境目にかかる建物が複数のタイルに入っている。同じ建物（gml:id）は1つだけ
            seen: set[str] = set()
            for feats in ex.map(features, ls):
                for feat in feats:
                    key = feat.pop("id_")
                    if key in seen:
                        continue
                    seen.add(key)
                    f.write(json.dumps(feat, ensure_ascii=False, separators=(",", ":")) + "\n")
                    n += 1
            total += n
            print(f"{s['code']} {s['name']}: {len(ls)} タイル {n} 棟（{time.time() - t0:.0f}s）", file=sys.stderr)
    if total == 0:
        # PLATEAU の建物が1つも無い都県（タイルは作らない。ワークフローは置かずに進む）
        print(f"::warning::建物がありません（{args.pref or args.codes}）", file=sys.stderr)
        os.remove(seq)
        return
    tippecanoe = shutil.which("tippecanoe") or "tippecanoe"
    subprocess.run(
        [
            tippecanoe, "-q", "--force", "-o", args.out, "-l", "b", "-Z17", "-z17", "-r1",
            "--no-feature-limit", "--no-tile-size-limit", "-P",
            "-n", "MICHILU buildings (PLATEAU)", "-A", ATTRIBUTION, seq,
        ],
        check=True,
    )
    os.remove(seq)
    print(f"{args.out}: {total} 棟 {os.path.getsize(args.out) / 1e6:.1f}MB", file=sys.stderr)


if __name__ == "__main__":
    main()
