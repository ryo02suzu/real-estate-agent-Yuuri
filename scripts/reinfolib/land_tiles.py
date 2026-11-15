"""陸地のあるタイル（ズーム 11）の一覧を、都道府県ごとに作る（scripts/reinfolib/land-tiles-z11.json）。

国の地点データ（不動産情報ライブラリの API）は、タイルごとに読む。対応している地方をまとめた四角の中を全部読むと、
全国では海の上のタイルが大半になる（沖縄・北海道まで入れると約2万タイル。陸地のあるタイルは約3千）。
国土数値情報「行政区域データ」（N03。市区町村の境界）から、陸地にかかるタイルだけの一覧を作っておき、build.py はそれを読む。

使い方（N03 の都道府県ごとの zip を置いたフォルダーを渡す。年に1回、境界が変わったときに作り直せば足りる）:
  for p in $(seq -w 1 47); do curl -fsSLO "https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2026/N03-20260101_${p}_GML.zip"; done
  python3 scripts/reinfolib/land_tiles.py --n03 <フォルダー> --year 2026

必要なもの: fiona・shapely（pip install fiona shapely）
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re

Z = 11
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "land-tiles-z11.json")


def tile_of(lat: float, lng: float, z: int = Z) -> tuple[int, int]:
    n = 2**z
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tile_bounds(x: int, y: int, z: int = Z) -> tuple[float, float, float, float]:
    """(西, 南, 東, 北)"""
    n = 2**z

    def lat(yy: int) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))

    return x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)


def tiles_of_geometry(geom) -> set[tuple[int, int]]:
    """図形にかかるタイル。1枚のタイルに収まる小さい図形（島・飛び地）は、そのタイルだけ"""
    from shapely.geometry import box
    from shapely.prepared import prep

    out: set[tuple[int, int]] = set()
    parts = list(geom.geoms) if geom.geom_type.startswith("Multi") else [geom]
    for g in parts:
        if g.is_empty:
            continue
        w, s, e, n = g.bounds
        x0, y0 = tile_of(n, w)
        x1, y1 = tile_of(s, e)
        if x0 == x1 and y0 == y1:
            out.add((x0, y0))
            continue
        p = prep(g)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                if (x, y) not in out and p.intersects(box(*tile_bounds(x, y))):
                    out.add((x, y))
    return out


def main() -> None:
    import fiona
    from shapely.geometry import shape

    ap = argparse.ArgumentParser()
    ap.add_argument("--n03", required=True, help="N03 の都道府県ごとの zip（名前の中に _01_ 〜 _47_ か N03_01.zip）を置いたフォルダー")
    ap.add_argument("--year", required=True, help="N03 の年（出典に書く）")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()

    prefs: dict[str, list[list[int]]] = {}
    for path in sorted(glob.glob(os.path.join(a.n03, "*.zip"))):
        m = re.search(r"_(\d{2})(?:_GML)?\.zip$", os.path.basename(path))
        if not m:
            continue
        pref = m.group(1)
        layer = next(n for n in fiona.listlayers(f"zip://{path}") if n.startswith("N03"))
        tiles: set[tuple[int, int]] = set()
        with fiona.open(f"zip://{path}", layer=layer) as src:
            for f in src:
                if f.geometry is None:
                    continue
                tiles |= tiles_of_geometry(shape(f.geometry))
        prefs[pref] = [list(t) for t in sorted(tiles)]
        print(pref, len(tiles), flush=True)
    if len(prefs) != 47:
        raise SystemExit(f"47都道府県そろっていません: {sorted(prefs)}")
    total = len({tuple(t) for v in prefs.values() for t in v})
    with open(a.out, "w", encoding="utf-8") as f:
        f.write('{\n "z": %d,\n "source": "国土数値情報 行政区域データ（N03-%s）（国土交通省）から、市区町村の区域にかかるタイルを数えたもの",\n "count": %d,\n "prefs": {\n' % (Z, a.year, total))
        rows = [f'  "{p}": {json.dumps(v, separators=(",", ":"))}' for p, v in sorted(prefs.items())]
        f.write(",\n".join(rows) + "\n }\n}\n")
    print("完成:", a.out, "タイル", total)


if __name__ == "__main__":
    main()
