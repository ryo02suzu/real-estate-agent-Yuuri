#!/usr/bin/env python3
"""
福島県の「指定道路図」（建築基準法施行規則第10条の2。5号＝位置指定道路と2項道路の調査済みの道路）の図の索引を作る。
県のページ（https://www.pref.fukushima.lg.jp/sec/41065b/shiteidourozu.html）から市町村ごとのページを開き、
図の名前（例：FE881）と PDF の URL を読む。図の名前は国土基本図の地図情報レベル2500の図郭（平面直角座標 第IX系）：
  dx = 300000 − X、dy = Y + 160000（X は北向き、Y は東向き。m）
  1/50000 の区画：行 = floor(dx / 30000)（A〜T、北から）、列 = floor(dy / 40000)（A〜H、西から）
  1/5000 の区画：行番号 = floor((dx − 行×30000) / 3000)（0〜9）、列番号 = floor((dy − 列×40000) / 4000)（0〜9）
  1/2500 の区画：1/5000 の区画（南北3km×東西4km）を4つに分けた 1＝北西・2＝北東・3＝南西・4＝南東（南北1.5km×東西2km）
  図の名前 = 行の文字 + 列の文字 + 行番号 + 列番号 + 区画の番号（例：白河合同庁舎 → FE881）
出力：lib/roadmap/data/sheets/fukushima.json（市町村のページの名前 → 図の索引。`date` はページの「掲載日：…更新」、
`cells` は [図の名前, PDF の URL, 中心経度, -中心緯度, 幅(度), 高さ(度)]）

  python3 scripts/sheets/fukushima.py      # 県のページを読んで作り直す
確かめ方は docs/pdf-sheets.md（白河合同庁舎の FE881・南相馬合同庁舎の DG951 を地理院地図と照合）。
"""
import html, json, os, re, subprocess, sys, time

from pyproj import Transformer

BASE = "https://www.pref.fukushima.lg.jp/sec/41065b/"
TOP = BASE + "shiteidourozu.html"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "lib", "roadmap", "data", "sheets", "fukushima.json")
ROWS, COLS = "ABCDEFGHIJKLMNOPQRST", "ABCDEFGH"
CODE = re.compile(r"([A-T])([A-H])(\d)(\d)([1-4])")
TO_LATLNG = Transformer.from_crs("EPSG:6677", "EPSG:6668", always_xy=False)  # JGD2011 平面直角座標 第IX系 → 緯度経度
TO_XY = Transformer.from_crs("EPSG:6668", "EPSG:6677", always_xy=False)
# ページのリンクの名前の誤り（PDF の図の右上の題で確かめた本当の名前）。
# 小野町のページは「FF384」が2つあり、1つ目（669205.pdf）の図の題は「小野町[FF381]」。図は FF381 の範囲の地理院地図
# （磐越東線・磐越自動車道・夏井川と太子堂の集落）と一致した（2026-11-09）。
# 玉川村のページの「F424」（669325.pdf）は、図の題が「玉川村[FF424]」（2026-11-09）
FIXES = {
    "https://www.pref.fukushima.lg.jp/uploaded/attachment/669205.pdf": "FF381",
    "https://www.pref.fukushima.lg.jp/uploaded/attachment/669325.pdf": "FF424",
}
# 名前の無いリンク（相馬市・棚倉町・矢吹町のページ）は、古い版の「「指定道路図」ご利用上の注意」（図ではない。2026-11-09 に中身を確かめた）
IGNORE = {
    "https://www.pref.fukushima.lg.jp/uploaded/attachment/668531.pdf",
    "https://www.pref.fukushima.lg.jp/uploaded/attachment/668580.pdf",
    "https://www.pref.fukushima.lg.jp/uploaded/attachment/668614.pdf",
}


def get(url):
    time.sleep(1.0)  # 県のサーバーにやさしく
    out = subprocess.run(["curl", "-sS", "--fail", "--max-time", "60", "-A", "Mozilla/5.0 (compatible; michilu-sheets)", url], capture_output=True, check=True).stdout
    return out.decode("utf-8", "replace")


def links(page):
    """ページの <a> の（文字, 絶対 URL）"""
    for m in re.finditer(r'<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>', page, flags=re.S | re.I):
        text = re.sub(r"\s+", "", html.unescape(re.sub(r"<[^>]+>", "", m[2])))
        href = html.unescape(m[1])
        if href.startswith("/"):
            href = "https://www.pref.fukushima.lg.jp" + href
        elif not href.startswith("http"):
            href = BASE + href
        yield text, href


def sheet_box(code):
    """図の名前 → 図郭の範囲（X 南端・北端、Y 西端・東端。m）"""
    m = CODE.fullmatch(code)
    if not m:
        raise ValueError(code)
    r, c, rd, cd, q = ROWS.index(m[1]), COLS.index(m[2]), int(m[3]), int(m[4]), int(m[5])
    dx0 = r * 30000 + rd * 3000 + (1500 if q in (3, 4) else 0)
    dy0 = c * 40000 + cd * 4000 + (2000 if q in (2, 4) else 0)
    return 300000 - dx0 - 1500, 300000 - dx0, dy0 - 160000, dy0 - 160000 + 2000


def sheet_code(lat, lng):
    """緯度経度 → 図の名前（テストと同じ計算。確かめ用）"""
    x, y = TO_XY.transform(lat, lng)
    dx, dy = 300000 - x, y + 160000
    r, c = int(dx // 30000), int(dy // 40000)
    rx, cy = dx - r * 30000, dy - c * 40000
    rd, cd = int(rx // 3000), int(cy // 4000)
    q = (3 if rx - rd * 3000 >= 1500 else 1) + (1 if cy - cd * 4000 >= 2000 else 0)
    return f"{ROWS[r]}{COLS[c]}{rd}{cd}{q}"


def cell(code, url):
    xs, xn, yw, ye = sheet_box(code)
    corners = [TO_LATLNG.transform(x, y) for x in (xs, xn) for y in (yw, ye)]
    clat, clng = TO_LATLNG.transform((xs + xn) / 2, (yw + ye) / 2)
    lats, lngs = [p[0] for p in corners], [p[1] for p in corners]
    return [code, url, round(clng, 6), round(-clat, 6), round(max(lngs) - min(lngs), 6), round(max(lats) - min(lats), 6)]


def main():
    # 計算の確かめ：県の合同庁舎（国土地理院の住所検索の座標）→ 図の名前（図を地理院地図と並べて一致を確かめた2枚）
    assert sheet_code(37.131145, 140.199081) == "FE881", sheet_code(37.131145, 140.199081)
    assert sheet_code(37.639957, 140.973007) == "DG951", sheet_code(37.639957, 140.973007)
    pages = {}
    for text, href in links(get(TOP)):
        m = re.fullmatch(re.escape(BASE) + r"shiteidourozu-([a-z]+)\.html", href)
        if m and text:
            pages[m[1]] = (text, href)
    out = {}
    for slug, (name, url) in sorted(pages.items()):
        page = get(url)
        sheets = {}
        for text, href in links(page):
            if not href.endswith(".pdf") or href in IGNORE:
                continue
            text = FIXES.get(href, text)
            if not CODE.fullmatch(text):
                if "注意" not in text:  # 「ご利用上の注意」のほかは、図の名前の書き間違いかもしれないので知らせる
                    print(f"  {name}: 図の名前の形でないリンク「{text}」→ {href}", file=sys.stderr)
                continue
            if text in sheets and sheets[text] != href:
                print(f"  {name}: {text} のリンクが2つある（{sheets[text]} と {href}）。先のものを使う", file=sys.stderr)
                continue
            sheets[text] = href
        if not sheets:
            raise SystemExit(f"{name}（{url}）に図のリンクが見つかりません")
        # ページの更新日（アプリの地図の名前に「○年○月○日更新」と出す）
        d = re.search(r"掲載日：\s*(\d{4})年(\d{1,2})月(\d{1,2})日更新", re.sub(r"<[^>]+>", "", page))
        if not d:
            raise SystemExit(f"{name}（{url}）の掲載日が読めません")
        date = f"{d[1]}年{int(d[2])}月{int(d[3])}日"
        out[slug] = {"name": name, "page": url, "date": date, "M": [[0, 1], [-1, 0], [0, 0]], "w": 0, "h": 0, "cells": [cell(c, u) for c, u in sorted(sheets.items())]}
        print(f"{name}: {len(sheets)}枚（{date}更新）", file=sys.stderr)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{len(out)}市町村・{sum(len(v['cells']) for v in out.values())}枚 → {os.path.relpath(OUT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
