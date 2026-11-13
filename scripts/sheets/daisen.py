#!/usr/bin/env python3
"""
秋田県大仙市の「指定道路図」（地域ごとのページに、国土基本図 1/2500 の図郭ごとの PDF）の図の索引を作る。
市の「道路」のページ（https://www.city.daisen.lg.jp/genre/machizukuri/road）から5つの地域（大曲・神岡・西仙北・中仙・仙北）の
ページを開き、索引図の <area alt="通し番号_図面番号" href="….pdf"> を読む。図面番号は平面直角座標 第X系の図郭：
  dx = 300000 − X、dy = Y + 160000（X は北向き、Y は東向き。m）
  1/50000 の区画：行 = floor(dx / 30000)（A〜T、北から）、列 = floor(dy / 40000)（A〜H、西から）
  1/5000 の区画：行番号 = floor((dx − 行×30000) / 3000)、列番号 = floor((dy − 列×40000) / 4000)
  1/2500 の区画：1/5000 の区画を4つに分けた 1＝北西・2＝北東・3＝南西・4＝南東
  図面番号 = "10" + 行の文字 + 列の文字 + 行番号 + 列番号 + 区画の番号（例：大仙市役所 → 10MD021）
地域の境目の図は2つ以上のページに同じ図面番号で載っている。たいていは同じファイルだが、ページの更新日が違うと中身が少し違う
ことがある（10LD733 は大曲と中仙で大きさが違う）ので、更新日の新しいページの PDF を使う（同じ日なら大曲を先に）。
出力：lib/roadmap/data/sheets/daisen.json（`cells` は [図面番号, PDF の URL, 中心経度, -中心緯度, 幅(度), 高さ(度)]、
`regions` は地域ごとのページと「更新日」）

  python3 scripts/sheets/daisen.py      # 市のページを読んで作り直す
確かめ方は docs/pdf-sheets.md（大仙市役所の 10MD021 を地理院地図と照合）。
"""
import html, json, os, re, subprocess, sys, time

from pyproj import Transformer

SITE = "https://www.city.daisen.lg.jp"
INDEX = SITE + "/genre/machizukuri/road"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "lib", "roadmap", "data", "sheets", "daisen.json")
ROWS, COLS = "ABCDEFGHIJKLMNOPQRST", "ABCDEFGH"
CODE = re.compile(r"10([A-T])([A-H])(\d)(\d)([1-4])")
TO_LATLNG = Transformer.from_crs("EPSG:6678", "EPSG:6668", always_xy=False)  # JGD2011 平面直角座標 第X系 → 緯度経度
TO_XY = Transformer.from_crs("EPSG:6668", "EPSG:6678", always_xy=False)


def get(url):
    time.sleep(1.0)  # 市のサーバーにやさしく
    out = subprocess.run(["curl", "-sS", "--fail", "--max-time", "60", "-A", "Mozilla/5.0 (compatible; michilu-sheets)", url], capture_output=True, check=True).stdout
    return out.decode("utf-8", "replace")


def text(page):
    page = re.sub(r"<script.*?</script>|<style.*?</style>", " ", page, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page)))


def sheet_box(code):
    """図面番号 → 図郭の範囲（X 南端・北端、Y 西端・東端。m）"""
    m = CODE.fullmatch(code)
    if not m:
        raise ValueError(code)
    r, c, rd, cd, q = ROWS.index(m[1]), COLS.index(m[2]), int(m[3]), int(m[4]), int(m[5])
    dx0 = r * 30000 + rd * 3000 + (1500 if q in (3, 4) else 0)
    dy0 = c * 40000 + cd * 4000 + (2000 if q in (2, 4) else 0)
    return 300000 - dx0 - 1500, 300000 - dx0, dy0 - 160000, dy0 - 160000 + 2000


def sheet_code(lat, lng):
    """緯度経度 → 図面番号（テストと同じ計算。確かめ用）"""
    x, y = TO_XY.transform(lat, lng)
    dx, dy = 300000 - x, y + 160000
    r, c = int(dx // 30000), int(dy // 40000)
    rx, cy = dx - r * 30000, dy - c * 40000
    rd, cd = int(rx // 3000), int(cy // 4000)
    q = (3 if rx - rd * 3000 >= 1500 else 1) + (1 if cy - cd * 4000 >= 2000 else 0)
    return f"10{ROWS[r]}{COLS[c]}{rd}{cd}{q}"


def cell(code, url):
    xs, xn, yw, ye = sheet_box(code)
    corners = [TO_LATLNG.transform(x, y) for x in (xs, xn) for y in (yw, ye)]
    clat, clng = TO_LATLNG.transform((xs + xn) / 2, (yw + ye) / 2)
    lats, lngs = [p[0] for p in corners], [p[1] for p in corners]
    return [code, url, round(clng, 6), round(-clat, 6), round(max(lngs) - min(lngs), 6), round(max(lats) - min(lats), 6)]


def main():
    # 計算の確かめ：大仙市役所（国土地理院の住所検索の座標）→ 10MD021（図を地理院地図と並べて一致を確かめた）
    assert sheet_code(39.452633, 140.476227) == "10MD021", sheet_code(39.452633, 140.476227)
    pages = []
    for m in re.finditer(r'<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>', get(INDEX), flags=re.S):
        name = re.sub(r"\s+", "", html.unescape(re.sub(r"<[^>]+>", "", m[2])))
        r = re.fullmatch(r"指定道路図（(.+地域)）", name)
        if r:
            url = m[1] if m[1].startswith("http") else SITE + m[1]
            if url not in [p[1] for p in pages]:
                pages.append((r[1], url))
    if len(pages) != 5:
        raise SystemExit(f"地域のページが5つではありません: {pages}")
    read = []
    for region, url in pages:
        page = get(url)
        d = re.search(r"更新日：\s*(\d{4})年(\d{2})月(\d{2})日", text(page))
        if not d:
            raise SystemExit(f"{region}（{url}）の更新日が読めません")
        links = []
        for a in re.finditer(r'<area\s[^>]*alt="\d+_(10[A-T][A-H]\d{3})"[^>]*href="([^"]+\.pdf)"', page):
            code, href = a[1], html.unescape(a[2])
            if not CODE.fullmatch(code):
                print(f"  {region}: 図面番号の形でない「{code}」", file=sys.stderr)
                continue
            links.append((code, href if href.startswith("http") else SITE + href))
        if not links:
            raise SystemExit(f"{region}（{url}）に図のリンクが見つかりません")
        read.append((d[1] + d[2] + d[3], region, url, f"{d[1]}年{int(d[2])}月{int(d[3])}日", links))
    # 更新日の新しいページを先に（同じ日なら大曲を先に）。境目の図は先に読んだページの PDF を使う
    read.sort(key=lambda r: (-int(r[0]), r[1] != "大曲地域", r[1]))
    sheets, regions = {}, []
    for _, region, url, date, links in read:
        for code, href in links:
            sheets.setdefault(code, href)
        regions.append({"name": region, "page": url, "date": date, "count": len(links)})
        print(f"{region}: {len(links)}枚（{date}更新）", file=sys.stderr)
    out = {
        "name": "大仙市",
        "page": INDEX,
        "regions": regions,
        "M": [[0, 1], [-1, 0], [0, 0]],
        "w": 0,
        "h": 0,
        "cells": [cell(c, u) for c, u in sorted(sheets.items())],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{len(sheets)}枚 → {os.path.relpath(OUT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
