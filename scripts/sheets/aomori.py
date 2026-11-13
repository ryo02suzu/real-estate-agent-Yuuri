#!/usr/bin/env python3
"""
青森県の「建築基準法上の道路種別図」（県土整備事務所ごとの ZIP に、図面1枚＝PDF1つ）の図面の索引を作る。
図面番号は国土基本図の図郭（平面直角座標 第X系・1/5000 の区画＝南北3km×東西4km）で、物件の座標から決まる。
  dx = 300000 − X、dy = Y + 160000（X は北向き、Y は東向き。m）
  1/50000 の区画：行 = floor(dx / 30000)（A〜T、北から）、列 = floor(dy / 40000)（A〜H、西から）
  1/5000 の区画：行番号 = floor((dx − 行×30000) / 3000)（0〜9）、列番号 = floor((dy − 列×40000) / 4000)（0〜9）
  図面番号 = "10" + 行の文字 + 列の文字 + 行番号 + 列番号（例：平内町役場 → 10GE52）
ZIP の中身は、ZIP の末尾の目録だけを範囲指定で読んで調べる（ZIP は 16〜70MB あるので全部は落とさない）。
出力：lib/roadmap/data/sheets/aomori-<事務所>.json（`cells` は [図面番号, 県の入口のページ, 中心経度, -中心緯度, 幅(度), 高さ(度)]）

  python3 scripts/sheets/aomori.py            # 6つの ZIP を読んで作り直す
確かめ方は docs/pdf-sheets.md（平内町役場の 10GE52 を地理院地図と照合）。
"""
import json, os, re, struct, subprocess, sys

from pyproj import Transformer

PAGE = "https://www.pref.aomori.lg.jp/soshiki/kendo/kenju/kijyunho.html#建築基準法上の道路種別について"
BASE = "https://www.pref.aomori.lg.jp/soshiki/kendo/kenju/files/"
OFFICES = {  # 事務所 → ZIP のファイル名（県のページのリンク。年が変わると名前も変わる）
    "tousei": ("東青", "2025_tousei.zip"),
    "tyunan": ("中南", "2025_tyunan.zip"),
    "sanpati": ("三八", "2025_sanpati.zip"),
    "seihoku": ("西北", "2025_seihoku.zip"),
    "kamikita": ("上北", "2025_kamikita.zip"),
    "shimokita": ("下北", "2025_shimokita.zip"),
}
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "lib", "roadmap", "data", "sheets")
ROWS, COLS = "ABCDEFGHIJKLMNOPQRST", "ABCDEFGH"
TO_LATLNG = Transformer.from_crs("EPSG:6678", "EPSG:6668", always_xy=False)  # JGD2011 平面直角座標 第X系 → 緯度経度


def curl(*args):
    return subprocess.run(["curl", "-sS", "--fail", "--max-time", "120", "-A", "Mozilla/5.0 (compatible; michilu-sheets)", *args], capture_output=True, check=True).stdout


def zip_names(url):
    """ZIP の末尾の目録（中央ディレクトリ）だけを読んで、中のファイル名を返す"""
    head = curl("-I", url).decode()
    size = int(re.search(r"(?im)^content-length:\s*(\d+)", head).group(1))
    tail = curl("-r", f"{max(0, size - 65536)}-{size - 1}", url)
    i = tail.rfind(b"PK\x05\x06")
    cd_size, cd_off = struct.unpack("<II", tail[i + 12 : i + 20])
    cd = curl("-r", f"{cd_off}-{cd_off + cd_size - 1}", url)
    names, p = [], 0
    while cd[p : p + 4] == b"PK\x01\x02":
        flags = struct.unpack("<H", cd[p + 8 : p + 10])[0]
        nlen, elen, clen = struct.unpack("<HHH", cd[p + 28 : p + 34])
        raw = cd[p + 46 : p + 46 + nlen]
        names.append(raw.decode("utf-8") if flags & 0x800 else raw.decode("cp932"))
        p += 46 + nlen + elen + clen
    return size, names


def sheet_box(code):
    """図面番号 → 図郭の範囲（X 南端・北端、Y 西端・東端。m）"""
    m = re.fullmatch(r"10([A-T])([A-H])(\d)(\d)", code)
    if not m:
        raise ValueError(code)
    r, c, rd, cd = ROWS.index(m[1]), COLS.index(m[2]), int(m[3]), int(m[4])
    dx0, dy0 = r * 30000 + rd * 3000, c * 40000 + cd * 4000
    return 300000 - dx0 - 3000, 300000 - dx0, dy0 - 160000, dy0 - 160000 + 4000


def sheet_code(lat, lng):
    """緯度経度 → 図面番号（テストと同じ計算。確かめ用）"""
    x, y = Transformer.from_crs("EPSG:6668", "EPSG:6678", always_xy=False).transform(lat, lng)
    dx, dy = 300000 - x, y + 160000
    r, c = int(dx // 30000), int(dy // 40000)
    return f"10{ROWS[r]}{COLS[c]}{int((dx - r * 30000) // 3000)}{int((dy - c * 40000) // 4000)}"


def cell(code):
    xs, xn, yw, ye = sheet_box(code)
    corners = [TO_LATLNG.transform(x, y) for x in (xs, xn) for y in (yw, ye)]
    clat, clng = TO_LATLNG.transform((xs + xn) / 2, (yw + ye) / 2)
    lats, lngs = [p[0] for p in corners], [p[1] for p in corners]
    return [code, PAGE, round(clng, 6), round(-clat, 6), round(max(lngs) - min(lngs), 6), round(max(lats) - min(lats), 6)]


def main():
    # 計算の確かめ：平内町役場（国土地理院の住所検索の座標）→ 10GE52
    assert sheet_code(40.926051, 140.955937) == "10GE52"
    for key, (office, name) in OFFICES.items():
        size, names = zip_names(BASE + name)
        codes = sorted({m[1] for n in names if (m := re.search(r"印刷用_(10[A-T][A-H]\d\d)\.pdf$", n))})
        mb = round(size / 1e6)
        ix = {
            "M": [[0, 1], [-1, 0], [0, 0]],
            "w": 0,
            "h": 0,
            "howto": f"県のページの「{office}県土整備事務所管内分」の ZIP（約{mb}MB）を落とし、中の「印刷用_{{label}}.pdf」を開く（図面番号は物件の位置から求めた）。",
            "zip": True,
            "cells": [cell(c) for c in codes],
        }
        with open(os.path.join(OUT, f"aomori-{key}.json"), "w", encoding="utf-8") as f:
            json.dump(ix, f, ensure_ascii=False, separators=(",", ":"))
        print(f"{office}: {len(codes)}枚（ZIP {mb}MB）", file=sys.stderr)


if __name__ == "__main__":
    main()
