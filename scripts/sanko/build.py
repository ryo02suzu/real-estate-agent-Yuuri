#!/usr/bin/env python3
"""
市町村がオープンデータで公開している地番参考図（固定資産税の地番図。筆の形と地番）を、地番検索・筆界表示用のベクトルタイル
（PMTiles。レイヤ sanko・z14〜16）にする。登記所備付地図データ（法務省）が公図（任意座標）しか無い所でも、市町村の図で
緯度経度の付いた筆を出せるようにする。

  python3 scripts/sanko/build.py --jobs 3 --work work/sanko --out work/sanko.pmtiles --manifest lib/roadmap/data/sanko-source.json
  python3 scripts/sanko/build.py --only 13215 12227 --out work/test.pmtiles --work work/sanko   # 一部の市町村だけで試す
  python3 scripts/sanko/build.py --check      # 市町村の公開ファイルが新しくなったか（changed=true/false。--source と比べる）

17 市町村で約 198 万筆・タイル約 180MB（2026年10月）。ダウンロードは市町村の zip 約 0.5GB と法務省の地図XML 約 0.8GB（--work に残し、
次に作るときも使う）。ダウンロード済みなら --jobs 3 で約 15 分。入間市は筆界の線しか無いので、線から面を作って地番の文字の中点で地番を付ける。

属性は地番の筆のタイル（レイヤ fude）と同じ「地番区域」「地番」に、市区町村コード「m」を足したもの。
  地番区域：法務省のデータの書き方（市区町村名_大字名_丁目名_小字名_予備名。「国立市_大字青柳___」）にそろえる。
            市町村の大字（コードか名前）ごとに、次の順で法務省の町（大字名＋丁目名）を決める。
              1. 公共座標の筆と重なり、地番も同じ筆の多数決（spatial）
              2. 名前が同じ（name。「大字」「字」の有無・丁目の数字の書き方の違いは無視）
              3. 大字の地番の集まりが、法務省の町の地番の集まりにどれだけ含まれるか（chiban）
            筆ごとに、その町の中で同じ地番の筆の地番区域（小字・予備名まで）を使う。法務省のデータに無い地番は、町で一番多い地番区域。
            法務省の町が決まらない大字は、市町村の名前で「市区町村名_大字名___」とする（地番検索では見つからないことがある）。
  地番：法務省のデータと同じ半角の「391-3」。道路・水路・無番地などの筆（地番が数字でないもの）は入れない。

法務省のデータに公共座標の筆がある所（筆の内側の点がその筆に入る）は入れない（地番の筆のタイルと重ねないため）。--keep-public で入れる。
位置は、公共座標の筆と同じ地番の筆の重心のずれの中央値で平行移動して合わせる（測地系の違い・市町村の図のずれ。--no-align で止める）。
西東京市の図は日本測地系（Tokyo）。TKY2JGD の格子は pyproj に無いので、3パラメータの変換（Tokyo to JGD2000 (1)）で
世界測地系にし、残りのずれを上の平行移動で除く。

出典の表示：市町村ごとの credit（「市川市「地籍図（地番図）」」）を並べ、MICHILU が加工した旨を添える（ライセンスはどれも
公共データ利用規約第1.0版（PDL1.0）か CC BY 4.0（CC BY）。どちらも商用利用・加工ができ、出典と加工した旨の記載が要る）。
地番参考図は課税用の参考図で、登記の地番・筆の形と違うことがある。

必要なもの: scripts/sanko/requirements.txt（mojxml・pyshp・shapely・pyproj・numpy）、tippecanoe（2.79 以上）
"""
import argparse
import collections
import concurrent.futures as cf
import datetime
import html
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import numpy as np
import shapefile  # pyshp
import shapely
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.strtree import STRtree

UA = {"User-Agent": "michilu-sanko (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
SAITAMA = "https://opendata.pref.saitama.lg.jp"
CHIBA = "https://opendata.pref.chiba.lg.jp"
TOKYO = "https://catalog.data.metro.tokyo.lg.jp/api/3/action"
BODIK = "https://data.bodik.jp/api/3/action"
GSPATIAL = "https://www.geospatial.jp/ckan/api/3/action"
MOJ_ORGS = {"08": "moj-08ibaraki", "09": "moj-09tochigi", "10": "moj-10gunma", "11": "moj-11saitama", "12": "moj-12chiba", "13": "moj-13tokyo", "14": "moj-14kanagawa"}
PDL = "公共データ利用規約第1.0版（PDL1.0）"
CCBY = "CC BY 4.0"

# 市町村ごとの公開ファイルと読み方。
#   fetch：dataeye（埼玉県・千葉県のオープンデータサイト。dataset はデータセットの番号）か ckan（api・dataset）。
#          resource はリソース名・ファイル名に合う正規表現（合うものが複数あれば一番新しいもの）
#   shp：zip の中の筆のポリゴンの shapefile（パスの正規表現）。epsg：座標系（.prj が無いものも平面直角座標系 IX 系）
#   chiban：地番の列（複数なら「本番-枝番-小枝番」とつなぐ）。key：大字の列（コードか名前）。oname：大字名の列。koaza：小字名の列
#   names：大字名を別の表から引く（shp か csv。key・name の列。pad はコードの桁をそろえる）
#   split：1つの列に「大字コード-地番」があるもの
#   date：データの時点（ファイルに書かれたもの。分からなければ公開日）
SOURCES = [
    {
        "code": "12203", "name": "市川市", "credit": "市川市「地籍図（地番図）」", "license": CCBY, "terms": "https://www.city.ichikawa.lg.jp/uploaded/attachment/11819.pdf（市川市オープンデータ利用規約。CC BY 4.0）",
        "fetch": {"kind": "dataeye", "base": CHIBA, "dataset": 3321, "resource": r"地籍図|\.zip$"},
        "date": "2026-04-01（更新日）", "epsg": 2451, "enc": "cp932",
        "shp": r"筆図形\.shp$", "chiban": ["TIBAN"], "key": "AZACD",
        "names": {"csv": r"名称字\.csv$", "key": "字CD", "name": "字名", "pad": 10},
    },
    {
        "code": "11222", "name": "越谷市", "credit": "越谷市「地番図データ」", "license": PDL, "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 3520, "resource": r"地番図"},
        "date": "2026-01-01", "epsg": 2451, "enc": "cp932",
        "shp": r"_fudekaisen\.shp$", "chiban": ["本番", "枝番"], "key": "大字",
        "names": {"shp": r"_oazamei\.shp$", "key": "大字", "name": "表示文字列"},
    },
    {
        "code": "11201", "name": "川越市", "credit": "川越市「地番図データ」", "license": PDL, "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 3472, "resource": r"地番図"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"(?i)tochi_poly\.shp$", "chiban": ["TXTCD"], "key": "AZACD",
        "names": {"shp": r"(?i)ooaza_poly\.shp$", "key": "AZACD", "name": "TXTCD"},
    },
    {
        "code": "10201", "name": "前橋市", "credit": "前橋市「地籍図(地番現況図)」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "102016_tisekizu", "resource": r"tisekizu.*\.zip$"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"固定資産筆\.shp$", "split": {"field": "地番キー", "re": r"^(\d+)-(.+)$"},
    },
    {
        "code": "11232", "name": "久喜市", "credit": "久喜市「地番現況図（地番図データ）」", "license": "CC BY（版の記載なし）", "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja（ポータルの表示は「クリエイティブ・コモンズ表示」で版の記載なし）",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 3493, "resource": r"地番"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"(?i)tochi_poly\.shp$", "chiban": ["TXTCD"], "key": "AZACD",
        "names": {"shp": r"(?i)ooaza_poly\.shp$", "key": "AZACD", "name": "TXTCD"},
    },
    {
        "code": "11218", "name": "深谷市", "credit": "深谷市「地番参考図」", "license": PDL, "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 1923, "resource": r"地番参考図"},
        "date": "令和7年度版（2025-10-31 公開）", "epsg": 2451, "enc": "cp932",
        "shp": r"地番/地番\.shp$", "chiban": ["本番", "枝番", "小枝番"], "key": "大字コード", "oname": "大字名称", "koaza": "小字名称",
    },
    {
        "code": "11207", "name": "秩父市", "credit": "秩父市「地番参考図」", "license": PDL, "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 3529, "resource": r"土地筆界"},
        "date": "2026-01-01", "epsg": 2451, "enc": "cp932",
        "shp": r"(?i)tochi_poly\.shp$", "chiban": ["TXTCD"], "key": "AZACD",
    },
    {
        "code": "11365", "name": "小鹿野町", "credit": "小鹿野町「地番参考図データ」", "license": PDL, "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 3374, "resource": r"地番参考図"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"(?i)tochi_poly\.shp$", "chiban": ["TXTCD"], "key": "AZACD",
    },
    {
        "code": "11361", "name": "横瀬町", "credit": "横瀬町「地番参考図データ」", "license": PDL, "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 3442, "resource": r"地番参考図"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"(?i)tochi_poly\.shp$", "chiban": ["TXTCD"], "key": "AZACD",
    },
    {
        "code": "11343", "name": "小川町", "credit": "小川町「地番参考図データ」", "license": PDL, "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0 ＋ 小川町の条件（データセットのページ）",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 3460, "resource": r"地番参考図"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"(?i)tochi_poly\.shp$", "chiban": ["TXTCD"], "key": "AZACD",
        "names": {"shp": r"(?i)ooaza_poly\.shp$", "key": "AZACD", "name": "TXTCD"},
    },
    {
        "code": "11385", "name": "上里町", "credit": "上里町「地番参考図（地番図データ）」", "license": PDL, "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 3588, "resource": r"地番"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"_fudepolygon\.shp$", "chiban": ["地番"], "key": "shozai_1",
    },
    {
        # 筆界の線と地番の文字の線しか無い。線から面を作り、地番の文字の線の中点を含む面に地番を付ける
        "code": "11225", "name": "入間市", "credit": "入間市「地番図情報」", "license": PDL, "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
        "fetch": {"kind": "dataeye", "base": SAITAMA, "dataset": 3366, "resource": r"地番図"},
        "date": "2026-06-05（公開日）", "epsg": 6677, "enc": "cp932",
        "lines": {"edges": r"筆界等\.shp$", "labels": r"/地番\.shp$"}, "chiban": ["地番"], "key": "大字", "oname": "大字",
    },
    {
        "code": "12222", "name": "我孫子市", "credit": "我孫子市「地番参考図」", "license": CCBY, "terms": "https://www.city.abiko.chiba.jp/shisei/opendata/opendata.files/122220_opendata_terms_of_use.pdf.pdf（我孫子市オープンデータ利用規約。CC BY 4.0）",
        "fetch": {"kind": "ckan", "api": GSPATIAL, "dataset": "chibansannkouzu", "resource": r"chibanzu\.zip$"},
        "date": "令和7年度版（2026-04-22 公開）", "epsg": 6677, "enc": "cp932",
        "shp": r"(?i)ABIKO_POL\.shp$", "chiban": ["CHIBAN"], "key": "OAZA_CD", "oname": "OAZA_NAME", "koaza": "KOAZA_NAME",
    },
    {
        "code": "12227", "name": "浦安市", "credit": "浦安市「浦安市地図データ（筆－形状）」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja",
        "fetch": {"kind": "dataeye", "base": CHIBA, "dataset": 3824, "resource": r"筆.形状"},
        "date": "2026-04-01", "epsg": 6677, "enc": "cp932",
        "shp": r"筆.形状\.shp$", "chiban": ["SAFIELD003", "SAFIELD004", "SAFIELD005"], "key": "SAFIELD000", "oname": "SAFIELD001",
    },
    {
        "code": "13229", "name": "西東京市", "credit": "西東京市「地番図」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja ＋ 東京都オープンデータ利用規約 https://portal.data.metro.tokyo.lg.jp/terms/",
        "fetch": {"kind": "ckan", "api": TOKYO, "dataset": "t132292d3000000015", "resource": r"Chiban_Shape\.zip$"},
        "date": "2025-01-01", "epsg": 30169, "enc": "cp932",
        "shp": r"土地課税エリア\.shp$", "chiban": ["Chiban"], "key": "Shozai", "oname": "ooaza",
    },
    {
        "code": "13215", "name": "国立市", "credit": "国立市「地番図」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja ＋ 東京都オープンデータ利用規約 https://portal.data.metro.tokyo.lg.jp/terms/",
        "fetch": {"kind": "ckan", "api": TOKYO, "dataset": "t132152d0000000012", "resource": r"Chiban_Shape\.zip$|地番図"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"固定資産筆_評価分割解除\.shp$", "chiban": ["表示文字列"], "key": "大字コード", "oname": "大字コード",
    },
    {
        "code": "13213", "name": "東村山市", "credit": "東村山市「地形図（筆界）」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja ＋ 東京都オープンデータ利用規約 https://portal.data.metro.tokyo.lg.jp/terms/",
        "fetch": {"kind": "ckan", "api": TOKYO, "dataset": "t132136d0000000005", "resource": r"Tochi_poly\.zip$|筆界"},
        "date": "2024-01（ファイルの日付）", "epsg": 6677, "enc": "cp932",
        "shp": r"(?i)tochi_poly\.shp$", "chiban": ["TXTCD"], "key": "AZACD",
    },
]
# 確かめて外したもの（--check で「入れていない市町村」として知らせない）。
# 相模原市は市の地図サイト（sagamihara.geocloud.jp）のダウンロードで、利用条件を確かめるまで入れない
EXCLUDED = {
    "戸田市": "CC BY-ND（改変禁止）で、同梱の注意事項が複製・転用・編集を禁止している",
    "習志野市": "地番現況図が PDF しかない（CC BY 2.1 JP）",
}

KANJI_NUM = {"〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
CHIBAN_RE = re.compile(r"^\d+(-\d+)*$")
# 西東京市（日本測地系・平面直角座標系 IX 系）→ 世界測地系（JGD2011 の IX 系として扱う）。Tokyo to JGD2000 (1)（EPSG:15483）の3パラメータ
TOKYO_PIPELINE = (
    "+proj=pipeline +step +inv +proj=tmerc +lat_0=36 +lon_0=139.833333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel "
    "+step +proj=push +v_3 +step +proj=cart +ellps=bessel +step +proj=helmert +x=-146.414 +y=507.337 +z=680.507 "
    "+step +inv +proj=cart +ellps=GRS80 +step +proj=pop +v_3 "
    "+step +proj=tmerc +lat_0=36 +lon_0=139.833333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80"
)
TO_M = Transformer.from_crs("EPSG:4326", "EPSG:6677", always_xy=True)
TO_LL = Transformer.from_crs("EPSG:6677", "EPSG:4326", always_xy=True)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---- 取得 ----


def get(url: str, timeout: int = 180, tries: int = 4) -> bytes:
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or i == tries - 1:
                raise
        except Exception:
            if i == tries - 1:
                raise
        time.sleep(3 * 2**i)
    raise RuntimeError(url)


def download(url: str, path: str) -> None:
    """途中で切れたもの（Content-Length より短い・zip として読めない）は読み直す"""
    tmp = path + ".part"
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=900) as r, open(tmp, "wb") as f:
                want = int(r.headers.get("Content-Length") or 0)
                shutil.copyfileobj(r, f, 1 << 20)
            got = os.path.getsize(tmp)
            if want and got != want:
                raise OSError(f"途中で切れました（{got}/{want} バイト）")
            if path.lower().endswith(".zip") and not zipfile.is_zipfile(tmp):
                raise OSError("zip として読めません")
            os.replace(tmp, path)
            return
        except Exception as e:
            if i == 3:
                raise
            log(f"  download retry {i + 1}: {e}")
            time.sleep(10 * 2**i)


def page_text(t: str) -> list[str]:
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    return [s.strip() for s in html.unescape(re.sub(r"<[^>]+>", "\n", t)).split("\n") if s.strip()]


def jdate(s: str) -> str:
    m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", s or "")
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else (s or "")


def dataeye_resources(base: str, dataset: int) -> tuple[dict, list[dict]]:
    """埼玉県・千葉県のオープンデータサイト（dataeye）のデータセットの情報とリソース（名前・ファイル名・更新日・大きさ・ライセンス）"""
    t = get(f"{base}/datasets/{dataset}").decode("utf-8", "replace")
    lines = page_text(t)
    info = {"title": lines[lines.index("データセット名") + 1] if "データセット名" in lines else ""}
    for label in ("自治体", "組織"):
        if label in lines:
            info["org"] = lines[lines.index(label) + 1]
            break
    out = []
    for rid in sorted(set(re.findall(r"/resources/(\d+)\"", t)), key=int):
        rl = page_text(get(f"{base}/resources/{rid}").decode("utf-8", "replace"))

        def val(*labels):
            for lb in labels:
                if lb in rl:
                    return rl[rl.index(lb) + 1]
            return ""

        out.append(
            {
                "id": rid,
                "name": val("リソース名"),
                "file": val("ファイル名"),
                "modified": jdate(val("最終更新", "最終更新日") or val("作成日")),
                "size": int(re.sub(r"\D", "", val("ファイルサイズ")) or 0),
                "license": val("ライセンス"),
                "terms": val("利用規約URL"),
                "url": f"{base}/resource_download/{rid}",
            }
        )
    return info, out


def ckan_resources(api: str, dataset: str) -> tuple[dict, list[dict]]:
    p = json.loads(get(f"{api}/package_show?id={urllib.parse.quote(dataset)}"))["result"]
    org = p.get("organization") or {}
    info = {"title": p.get("title", ""), "org": org.get("title", "") if isinstance(org, dict) else str(org), "license": p.get("license_title") or ""}
    out = []
    for r in p.get("resources", []):
        out.append(
            {
                "id": r.get("id", ""),
                "name": r.get("name") or "",
                "file": (r.get("url") or "").rsplit("/", 1)[-1],
                "modified": (r.get("last_modified") or r.get("created") or "")[:10],
                "size": int(r.get("size") or 0),
                "license": info["license"],
                "url": r.get("url") or "",
            }
        )
    return info, out


def resolve(src: dict) -> dict:
    """いま公開されているファイル（合うリソースのうち一番新しいもの）"""
    f = src["fetch"]
    info, res = dataeye_resources(f["base"], f["dataset"]) if f["kind"] == "dataeye" else ckan_resources(f["api"], f["dataset"])
    pat = re.compile(f["resource"])
    cand = [r for r in res if pat.search(r["name"]) or pat.search(urllib.parse.unquote(r["file"]))]
    if not cand:
        raise RuntimeError(f"{src['name']}: リソースが見つかりません（{[r['name'] for r in res]}）")
    best = max(cand, key=lambda r: (r["modified"], r["id"]))
    page = f"{f['base']}/datasets/{f['dataset']}" if f["kind"] == "dataeye" else f"{f['api'].replace('/api/3/action', '')}/dataset/{f['dataset']}"
    return {**best, "title": info.get("title", ""), "org": info.get("org", ""), "page": page}


def extract(zip_path: str, out: str) -> None:
    """zip を展開する（中の zip も。Shift_JIS・「#U5730」の名前も読む）"""

    def name_of(i: zipfile.ZipInfo) -> str:
        n = i.filename
        if not i.flag_bits & 0x800:
            try:
                n = n.encode("cp437").decode("cp932")
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
        return re.sub(r"#U([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), n).replace("\\", "/")

    with zipfile.ZipFile(zip_path) as z:
        for i in z.infolist():
            n = name_of(i)
            if n.endswith("/") or ".." in n.split("/"):
                continue
            p = os.path.join(out, n)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with z.open(i) as r, open(p, "wb") as w:
                shutil.copyfileobj(r, w)
            if p.lower().endswith(".zip"):
                extract(p, p[:-4])


def find(root: str, pattern: str) -> str:
    pat = re.compile(pattern)
    hits = sorted(os.path.join(d, f) for d, _, fs in os.walk(root) for f in fs if pat.search(os.path.join(d, f).replace(os.sep, "/")))
    if not hits:
        raise RuntimeError(f"{pattern} が {root} にありません")
    return hits[0]


# ---- 法務省のデータ ----


def moj_zips(code: str, year: str | None, work: str) -> tuple[list[str], str]:
    data = json.loads(get(f"{GSPATIAL}/package_search?fq=organization:{MOJ_ORGS[code[:2]]}&rows=1000"))
    found: dict[str, dict[str, str]] = {}
    for pkg in data["result"]["results"]:
        for res in pkg["resources"]:
            m = re.fullmatch(rf"{code}-\d+-(\d{{4}})\.zip", res.get("name") or "")
            if m:
                found.setdefault(m.group(1), {})[res["name"]] = res["url"]
    if not found:
        raise RuntimeError(f"{code} の地図XMLが見つかりません")
    year = year or max(found)
    paths = []
    for name, url in sorted(found.get(year, {}).items()):
        p = os.path.join(work, "moj", name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        if not zipfile.is_zipfile(p):  # 無いか、前に途中で切れたもの
            download(url, p)
        paths.append(p)
    return paths, year


def read_moj(paths: list[str]) -> dict:
    """地番区域・地番（全ての筆）と、公共座標の筆の形（緯度経度）"""
    from mojxml.parse import ParseOptions, parse_raw
    from mojxml.reader import iter_content_xmls

    recs = []  # (地番区域の5つ, 地番, 公共座標か)
    pub_geom = []
    pub_idx = []
    for content in iter_content_xmls(paths):
        arbitrary = "任意座標系".encode() in content[:4000]
        try:
            feats = parse_raw(content, ParseOptions(include_arbitrary_crs=True) if arbitrary else ParseOptions())
        except Exception as e:
            log(f"  読めない図面: {e}")
            continue
        for f in feats:
            p = f["properties"]
            parts = tuple(str(p.get(k) or "") for k in ("市区町村名", "大字名", "丁目名", "小字名", "予備名"))
            chiban = str(p.get("地番") or "")
            public = p.get("座標系") != "任意座標系"
            recs.append((parts, chiban, public))
            if public and CHIBAN_RE.match(chiban):
                pub_geom.append(shape(f["geometry"]))
                pub_idx.append(len(recs) - 1)
    return {"recs": recs, "pub_geom": pub_geom, "pub_idx": pub_idx}


# ---- 市町村のデータ ----


def norm_chiban(parts: list[str]) -> str:
    """「４４２－７」「0008」「0193」「0000」→「442-7」「8-193」。数字でなければ空"""
    out = []
    for i, s in enumerate(parts):
        s = unicodedata.normalize("NFKC", str(s or "")).strip()
        s = re.sub(r"[‐－ーｰ−—–]", "-", s).replace("番地", "-").replace("番", "-").strip("-")
        if not s:
            continue
        if i > 0 and re.fullmatch(r"0+", s):
            continue
        out.append(s)
    s = "-".join(out)
    if not CHIBAN_RE.match(s):
        return ""
    return "-".join(str(int(x)) for x in s.split("-"))


def norm_town(s: str) -> str:
    """名前の比べ方（「大字」「字」・空白・丁目の数字の書き方・ケ／ヶの違いを無視）"""
    s = unicodedata.normalize("NFKC", s or "").replace(" ", "").replace("　", "")
    s = re.sub(r"^(大字|字)", "", s)

    def kan(m):
        t = m.group(1)
        if t.isdigit():
            return str(int(t)) + "丁目"
        n = 0
        if "十" in t:
            a, _, b = t.partition("十")
            n = (KANJI_NUM.get(a, 1) if a else 1) * 10 + (KANJI_NUM.get(b, 0) if b else 0)
        else:
            for ch in t:
                n = n * 10 + KANJI_NUM.get(ch, 0)
        return f"{n}丁目"

    s = re.sub(r"([0-9]+|[〇一二三四五六七八九十]+)丁目", kan, s)
    return s.replace("ヶ", "ケ").replace("ヵ", "ケ").replace("が", "ケ")


def to_m(epsg: int):
    """元の座標系 → 平面直角座標系 IX 系（JGD2011）の m"""
    if epsg == 6677:
        return None
    if epsg == 30169:
        return Transformer.from_pipeline(TOKYO_PIPELINE)
    return Transformer.from_crs(f"EPSG:{epsg}", "EPSG:6677", always_xy=True)


def reader(path: str, enc: str) -> shapefile.Reader:
    base = path[:-4]
    sib = {os.path.splitext(f)[1].lower(): os.path.join(os.path.dirname(path), f) for f in os.listdir(os.path.dirname(path)) if os.path.splitext(f)[0] == os.path.basename(base)}
    return shapefile.Reader(shp=open(sib[".shp"], "rb"), shx=open(sib[".shx"], "rb") if ".shx" in sib else None, dbf=open(sib[".dbf"], "rb"), encoding=enc, encodingErrors="replace")


def name_table(root: str, spec: dict, enc: str) -> dict[str, str]:
    if not spec:
        return {}
    cnt: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    pad = spec.get("pad", 0)
    if "csv" in spec:
        import csv

        with open(find(root, spec["csv"]), encoding=enc, errors="replace", newline="") as f:
            for row in csv.DictReader(f):
                cnt[str(row[spec["key"]]).strip().zfill(pad)][str(row[spec["name"]]).strip()] += 1
    else:
        r = reader(find(root, spec["shp"]), enc)
        names = [f[0] for f in r.fields[1:]]
        ik, iname = names.index(spec["key"]), names.index(spec["name"])
        for rec in r.iterRecords():
            cnt[str(rec[ik]).strip().zfill(pad)][str(rec[iname]).strip()] += 1
    return {k: c.most_common(1)[0][0] for k, c in cnt.items()}


def read_lines_mode(src: dict, root: str) -> tuple[list, list[str], list[str], list[str], list[str]]:
    """筆界の線から面を作り、地番の文字の線（中点）を含む面に地番を付ける（入間市）"""
    sp = src["lines"]
    r = reader(find(root, sp["edges"]), src["enc"])
    lines = [shapely.LineString(s.points) for s in r.iterShapes() if len(s.points) >= 2]
    log(f"  線 {len(lines)} 本 → 面")
    noded = shapely.node(shapely.MultiLineString(lines))
    polys = list(shapely.get_parts(shapely.polygonize(shapely.get_parts(noded))))
    log(f"  面 {len(polys)}")
    lr = reader(find(root, sp["labels"]), src["enc"])
    names = [f[0] for f in lr.fields[1:]]
    ic = [names.index(c) for c in src["chiban"]]
    ik = names.index(src["key"])
    pts, labels = [], []
    for sr in lr.iterShapeRecords():
        if len(sr.shape.points) < 1:
            continue
        ln = shapely.LineString(sr.shape.points) if len(sr.shape.points) >= 2 else shapely.Point(sr.shape.points[0])
        pts.append(ln.interpolate(0.5, normalized=True) if ln.geom_type == "LineString" else ln)
        labels.append((str(sr.record[ik]), [sr.record[i] for i in ic]))
    tree = STRtree(polys)
    pi, li = tree.query(np.array(pts, dtype=object), predicate="within")[::-1]
    by_poly: dict[int, list[int]] = collections.defaultdict(list)
    for p, l in zip(pi, li):
        by_poly[int(p)].append(int(l))
    geoms, chibans, keys, onames, koazas = [], [], [], [], []
    multi = 0
    for p, ls in by_poly.items():
        if len(ls) > 1:
            multi += 1
            continue  # 文字が2つ以上入る面は分け方が分からないので入れない
        key, parts = labels[ls[0]]
        geoms.append(polys[p])
        chibans.append(norm_chiban(parts) if len(parts) > 1 else norm_chiban([parts[0]]))
        keys.append(key)
        onames.append(key)
        koazas.append("")
    log(f"  地番の付いた面 {len(geoms)}（文字が2つ以上の面 {multi} を除く。文字のない面 {len(polys) - len(by_poly)}）")
    return geoms, chibans, keys, onames, koazas


def read_muni(src: dict, root: str) -> dict:
    """市町村の筆（元の座標系の形・地番・大字のキー・大字名・小字名）"""
    if "lines" in src:
        geoms, chibans, keys, onames, koazas = read_lines_mode(src, root)
        raw_n = len(geoms)
    else:
        path = find(root, src["shp"])
        prj = [f for f in os.listdir(os.path.dirname(path)) if f.lower() == os.path.basename(path)[:-4].lower() + ".prj"]
        if prj:
            t = open(os.path.join(os.path.dirname(path), prj[0]), "rb").read().decode("latin1")
            datum = "JGD2011" if "2011" in t else "JGD2000" if "2000" in t else "Tokyo" if "Tokyo" in t or "Bessel" in t else "?"
            want = {6677: "JGD2011", 2451: "JGD2000", 30169: "Tokyo"}[src["epsg"]]
            if datum != want:
                log(f"  ::warning:: .prj は {datum}、SOURCES は {want}")
        r = reader(path, src["enc"])
        names = [f[0] for f in r.fields[1:]]
        table = name_table(root, src.get("names"), src["enc"])
        pad = (src.get("names") or {}).get("pad", 0)
        geoms, chibans, keys, onames, koazas = [], [], [], [], []
        raw_n = 0
        for sr in r.iterShapeRecords():
            raw_n += 1
            rec = dict(zip(names, sr.record))
            if "split" in src:
                m = re.match(src["split"]["re"], str(rec[src["split"]["field"]]))
                if not m:
                    continue
                key, ch = m.group(1), norm_chiban([m.group(2)])
            else:
                key = str(rec[src["key"]]).strip()
                ch = norm_chiban([rec[c] for c in src["chiban"]])
            if not ch or not sr.shape.points:
                chibans.append("")
                geoms.append(None)
                keys.append(key)
                onames.append("")
                koazas.append("")
                continue
            try:
                g = shape(sr.shape.__geo_interface__)
            except Exception:
                g = None
            geoms.append(g)
            chibans.append(ch)
            keys.append(key)
            nm = str(rec[src["oname"]]).strip() if src.get("oname") else table.get(key.zfill(pad), "")
            onames.append(nm)
            koazas.append(str(rec[src["koaza"]]).strip() if src.get("koaza") else "")
    keep = [i for i, (g, c) in enumerate(zip(geoms, chibans)) if c and g is not None and not g.is_empty]
    geoms = [geoms[i] for i in keep]
    geoms = [g if g.is_valid else shapely.make_valid(g) for g in geoms]
    tr = to_m(src["epsg"])
    if tr is not None:
        geoms = [shapely.transform(g, lambda xy: np.column_stack(tr.transform(xy[:, 0], xy[:, 1]))) for g in geoms]
    return {
        "raw": raw_n,
        "geom": geoms,  # 平面直角座標系 IX 系の m（まだ平行移動していない）
        "chiban": [chibans[i] for i in keep],
        "key": [keys[i] for i in keep],
        "name": [onames[i] for i in keep],
        "koaza": [koazas[i] for i in keep],
    }


def merge(geoms: list):
    """同じ筆の形をまとめる。形が壊れていてまとめられなければ、1mm の格子にそろえて直してからまとめ、それでもだめなら並べるだけにする"""
    try:
        return shapely.union_all(geoms)
    except shapely.errors.GEOSException:
        pass
    try:
        return shapely.union_all([shapely.make_valid(shapely.set_precision(g, 0.001)) for g in geoms])
    except shapely.errors.GEOSException:
        parts = [p for g in geoms for p in shapely.get_parts(g) if p.geom_type == "Polygon"]
        return shapely.MultiPolygon(parts)


# ---- 対応づけ ----


def build_one(src: dict, work: str, year: str | None, align: bool, keep_public: bool, drop_unmapped: bool, fo) -> dict:
    code = src["code"]
    t0 = time.time()
    meta = resolve(src)
    dl = os.path.join(work, "src", f"{code}-{meta['id']}.zip")
    os.makedirs(os.path.dirname(dl), exist_ok=True)
    if not zipfile.is_zipfile(dl):
        download(meta["url"], dl)
    root = os.path.join(work, "src", f"{code}-{meta['id']}")
    if not os.path.isdir(root):
        extract(dl, root + ".tmp")
        os.replace(root + ".tmp", root)
    muni = read_muni(src, root)
    n = len(muni["geom"])
    log(f"{code} {src['name']}: 筆 {muni['raw']} → 地番が数字の筆 {n}（{meta['file']} {meta['modified']}）")

    paths, moj_year = moj_zips(code, year, work)
    moj = read_moj(paths)
    recs = moj["recs"]
    city = collections.Counter(r[0][0] for r in recs).most_common(1)[0][0]
    # 法務省の町（大字名・丁目名）ごとの地番 → 地番区域
    town_ch: dict[tuple, dict[str, collections.Counter]] = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    town_kuiki: dict[tuple, collections.Counter] = collections.defaultdict(collections.Counter)
    inv: dict[str, set] = collections.defaultdict(set)
    for parts, ch, _pub in recs:
        if not CHIBAN_RE.match(ch) or parts[0] != city:
            continue
        t = (parts[1], parts[2])
        town_ch[t][ch][parts] += 1
        town_kuiki[t][parts] += 1
        inv[ch].add(t)
    town_by_name: dict[str, list] = collections.defaultdict(list)
    for t in town_ch:
        town_by_name[norm_town(t[0] + t[1])].append(t)
    log(f"  {code} 法務省 {moj_year}: 筆 {len(recs)}（公共座標 {len(moj['pub_geom'])}）・町 {len(town_ch)}")

    # 1. 公共座標の筆と重ねる（内側の点がその筆に入り、地番が同じ）
    pts_m = shapely.point_on_surface(np.array(muni["geom"], dtype=object))
    pub_m = [shapely.transform(g, lambda xy: np.column_stack(TO_M.transform(xy[:, 0], xy[:, 1]))) for g in moj["pub_geom"]]
    tree = STRtree(pub_m) if pub_m else None
    votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    pairs = []
    if tree is not None:
        mi, pj = tree.query(pts_m, predicate="within")
        for i, j in zip(mi, pj):
            parts, ch, _ = recs[moj["pub_idx"][j]]
            if ch == muni["chiban"][i]:
                votes[muni["key"][i]][(parts[1], parts[2])] += 1
                pairs.append((i, j))
    # 平行移動（同じ地番の筆の重心のずれの中央値）
    shift = (0.0, 0.0)
    resid_before = resid_after = None
    if pairs:
        mc = shapely.centroid(np.array([muni["geom"][i] for i, _ in pairs], dtype=object))
        pc = shapely.centroid(np.array([pub_m[j] for _, j in pairs], dtype=object))
        d = shapely.get_coordinates(pc) - shapely.get_coordinates(mc)
        resid_before = float(np.median(np.hypot(d[:, 0], d[:, 1])))
        med = np.median(d, axis=0)
        if align and len(pairs) >= 30 and float(np.hypot(*med)) >= 0.15:
            shift = (float(med[0]), float(med[1]))
        dd = d - np.array(shift)
        resid_after = float(np.median(np.hypot(dd[:, 0], dd[:, 1])))
    if shift != (0.0, 0.0):
        muni["geom"] = [shapely.transform(g, lambda xy: xy + np.array(shift)) for g in muni["geom"]]
        pts_m = shapely.point_on_surface(np.array(muni["geom"], dtype=object))

    # 大字ごとに法務省の町を決める
    by_key: dict[str, list[int]] = collections.defaultdict(list)
    for i, k in enumerate(muni["key"]):
        by_key[k].append(i)
    decide: dict[str, tuple] = {}
    second: dict[str, list] = {}
    methods = collections.Counter()
    for k, idx in by_key.items():
        A = {muni["chiban"][i] for i in idx}
        cnt = collections.Counter()
        for c in A:
            for t in inv.get(c, ()):
                cnt[t] += 1
        score = {t: v / len(A) for t, v in cnt.items()}
        ranked = sorted(score, key=lambda t: -score[t])
        # 地番の集まりの重なり（Jaccard）。小さな町の地番（1〜数百）は大きな町にもあるので、含まれる割合だけでは決まらないことがある
        jac = {t: v / (len(A) + len(town_ch[t]) - v) for t, v in cnt.items()}
        jr = sorted(jac, key=lambda t: -jac[t])
        nm = collections.Counter(muni["name"][i] for i in idx).most_common(1)[0][0]
        named = town_by_name.get(norm_town(nm), []) if nm else []
        t_name = named[0] if len(named) == 1 else None
        v = votes.get(k)
        choice = None
        if v and sum(v.values()) >= 3 and v.most_common(1)[0][1] / sum(v.values()) >= 0.6:
            choice, how = v.most_common(1)[0][0], "spatial"
        elif t_name and (score.get(t_name, 0) >= 0.3 or len(A) < 3):
            choice, how = t_name, "name"
        elif ranked and score[ranked[0]] >= 0.5 and len(A) >= 3 and score[ranked[0]] - (score[ranked[1]] if len(ranked) > 1 else 0) >= 0.15:
            choice, how = ranked[0], "chiban"
        elif jr and len(A) >= 3 and score[jr[0]] >= 0.5 and jac[jr[0]] >= 0.3 and jac[jr[0]] >= 1.5 * (jac[jr[1]] if len(jr) > 1 else 0):
            choice, how = jr[0], "chiban"
        elif t_name:
            choice, how = t_name, "name-only"
        else:
            how = "none"
        methods[how] += len(idx)
        if choice:
            decide[k] = choice
            second[k] = [t for t in ranked if t != choice and score[t] >= 0.2][:3]

    # 筆ごとの地番区域
    covered = np.zeros(n, dtype=bool)
    if tree is not None and not keep_public:
        mi, _ = tree.query(pts_m, predicate="within")
        covered[np.unique(mi)] = True
    groups: dict[tuple, list] = collections.defaultdict(list)
    stats = collections.Counter()
    for i in range(n):
        if covered[i]:
            stats["public"] += 1
            continue
        k, ch = muni["key"][i], muni["chiban"][i]
        t = decide.get(k)
        kuiki = None
        if t:
            if ch not in town_ch[t]:
                alt = [s for s in second.get(k, []) if ch in town_ch[s]]
                if len(alt) == 1:
                    t = alt[0]
            koaza = norm_town(muni["koaza"][i]) if muni["koaza"][i] else ""
            if ch in town_ch[t]:
                cands = town_ch[t][ch]
                pick = [p for p in cands if koaza and norm_town(p[3]) == koaza]
                kuiki = "_".join(pick[0] if pick else cands.most_common(1)[0][0])
                stats["exists"] += 1
            else:
                cands = town_kuiki[t]
                pick = [p for p in cands if koaza and norm_town(p[3]) == koaza]
                kuiki = "_".join(pick[0] if pick else cands.most_common(1)[0][0])
            stats["mapped"] += 1
        else:
            if drop_unmapped:
                stats["dropped_unmapped"] += 1
                continue
            nm = unicodedata.normalize("NFKC", muni["name"][i]).replace(" ", "") if muni["name"][i] else ""
            nm = re.sub(r"(\d+)丁目", lambda m: chr(0xFF10 + int(m.group(1))) + "丁目" if len(m.group(1)) == 1 else m.group(0), nm)
            m = re.match(r"^(.*?)([０-９\d]+丁目)$", nm)
            kuiki = f"{city}_{m.group(1)}_{m.group(2)}__" if m else f"{city}_{nm}___"
        # 法務省の町に対応しない筆は、市町村の大字ごとに分けておく（別の大字の同じ地番をまとめない）
        groups[(kuiki, ch, "" if t else k)].append(i)
        stats["kept"] += 1

    # 書き出す（同じ地番区域・地番の筆はまとめる：評価分割など）
    written = 0
    for (kuiki, ch, _k), idx in groups.items():
        g = muni["geom"][idx[0]] if len(idx) == 1 else merge([muni["geom"][i] for i in idx])
        g = shapely.transform(g, lambda xy: np.round(np.column_stack(TO_LL.transform(xy[:, 0], xy[:, 1])), 7))
        polys = [p for p in shapely.get_parts(g) if p.geom_type in ("Polygon", "MultiPolygon") and not p.is_empty]
        if not polys:
            continue
        g = polys[0] if len(polys) == 1 else shapely.MultiPolygon([q for p in polys for q in shapely.get_parts(p)])
        fo.write(json.dumps({"type": "Feature", "properties": {"地番区域": kuiki, "地番": ch, "m": code}, "geometry": mapping(g)}, ensure_ascii=False, separators=(",", ":")) + "\n")
        written += 1
    kept = stats["kept"]
    # 書き出した地番区域（種類）のうち、法務省のデータにある地番区域の割合
    moj_kuiki = {"_".join(parts) for parts, _ch, _pub in recs if parts[0] == city}
    out_kuiki = {g[0] for g in groups}
    res = {
        "name": src["name"],
        "credit": src["credit"],
        "license": src["license"],
        "terms": src.get("terms") or meta.get("terms") or "",
        "portal_license": meta.get("license", ""),
        "page": meta["page"],
        "url": meta["url"],
        "file": meta["file"],
        "modified": meta["modified"],
        "size": meta["size"],
        "date": src["date"],
        "moj_year": moj_year,
        "parcels_raw": muni["raw"],
        "parcels_numbered": n,
        "public_overlap_dropped": stats["public"],
        "kept": kept,
        "features": written,
        "mapped": round(stats["mapped"] / kept, 4) if kept else 0,
        "exists": round(stats["exists"] / kept, 4) if kept else 0,
        "kuiki_distinct": len(out_kuiki),
        "kuiki_in_moj": round(len(out_kuiki & moj_kuiki) / len(out_kuiki), 4) if out_kuiki else 0,
        "methods": dict(methods),
        "pairs": len(pairs),
        "shift_m": [round(shift[0], 2), round(shift[1], 2)],
        "residual_m": [None if resid_before is None else round(resid_before, 2), None if resid_after is None else round(resid_after, 2)],
        "seconds": round(time.time() - t0),
    }
    log(
        f"  {code} → 筆 {kept}（公共座標の所 {stats['public']} を除く）・地番区域が法務省の町に対応 {res['mapped']:.1%}・"
        f"地番区域 {len(out_kuiki)} 種のうち法務省にある {res['kuiki_in_moj']:.1%}・"
        f"地番区域と地番が法務省にある {res['exists']:.1%}・平行移動 {res['shift_m']}m（同じ地番の筆 {len(pairs)}、ずれの中央値 {res['residual_m']}m）"
    )
    return res


# ---- 更新の確かめ ----


def check(source_path: str) -> bool:
    current = json.load(open(source_path, encoding="utf-8")).get("sources", {}) if os.path.exists(source_path) else {}
    changed = False
    latest: dict[str, str] = {}  # 市町村名 → いま使っているファイルの更新日
    for src in SOURCES:
        try:
            meta = resolve(src)
        except Exception as e:
            log(f"{src['code']} {src['name']}: 読めません: {e}")
            continue
        latest[src["name"]] = meta["modified"]
        cur = current.get(src["code"], {})
        diff = [k for k in ("url", "modified", "size") if str(cur.get(k)) != str(meta.get(k))]
        if diff:
            changed = True
        log(f"{src['code']} {src['name']}: {meta['file']} {meta['modified']} {meta['size']}B ライセンス「{meta.get('license')}」 → {'更新あり ' + ','.join(diff) if diff else '更新なし'}")
    # 埼玉県・千葉県のサイトで、知らない地番図のデータセット（次の年度が別のデータセットになることがある）
    known = {(s["fetch"]["base"], s["fetch"]["dataset"]) for s in SOURCES if s["fetch"]["kind"] == "dataeye"}
    names = {s["name"] for s in SOURCES}
    for base in (SAITAMA, CHIBA):
        try:
            t = get(f"{base}/datasets?keyword={urllib.parse.quote('地番')}").decode("utf-8", "replace")
        except Exception as e:
            log(f"{base}: 検索できません: {e}")
            continue
        for ds in sorted(set(int(x) for x in re.findall(rf"{re.escape(base)}/datasets/(\d+)\"", t))):
            if (base, ds) in known:
                continue
            try:
                info, res = dataeye_resources(base, ds)
            except Exception:
                continue
            if "地番" not in info.get("title", "") and "地籍" not in info.get("title", ""):
                continue
            org = info.get("org", "")
            newest = max((r["modified"] for r in res), default="")
            if org in names and newest > latest.get(org, ""):
                changed = True
                what = "新しいデータセット（入れている市町村。SOURCES の dataset を書き換える）"
            elif org in names:
                what = "同じ市町村の古い・同じ時点のデータセット"
            elif org in EXCLUDED:
                what = f"外している市町村（{EXCLUDED[org]}）"
            else:
                what = "入れていない市町村（ライセンスを確かめて SOURCES に足す）"
            log(f"  {what}: {org} {info.get('title')} {newest} {base}/datasets/{ds}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")
    log("更新あり" if changed else "更新なし")
    return changed


def run_one(src: dict, part: str, *opts) -> dict:
    with open(part, "w", encoding="utf-8") as fo:
        return build_one(src, *opts, fo)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="公開ファイルが新しくなったかだけ調べる（GITHUB_OUTPUT があれば changed= を書く）")
    ap.add_argument("--source", default="lib/roadmap/data/sanko-source.json", help="--check で比べる、前に作ったときの情報（--manifest で書いたもの）")
    ap.add_argument("--out", help="出力する .pmtiles")
    ap.add_argument("--geojsonl", help="タイルにする前の GeoJSON の行（省略時は作業用のディレクトリに作って消す）")
    ap.add_argument("--manifest", help="市町村ごとの出典・ファイル・筆の数・対応の割合の JSON（省略時は --out の .json）")
    ap.add_argument("--work", default=None, help="作業用のディレクトリ（ダウンロードしたファイルを置き、次に作るときも使う）")
    ap.add_argument("--only", nargs="*", help="この市区町村コードだけ")
    ap.add_argument("--moj-year", help="法務省の地図XMLの年（省略時は一番新しい年）")
    ap.add_argument("--no-align", action="store_true", help="公共座標の筆に合わせる平行移動をしない")
    ap.add_argument("--keep-public", action="store_true", help="公共座標の筆がある所の筆も入れる")
    ap.add_argument("--drop-unmapped", action="store_true", help="法務省の町に対応しない大字の筆を入れない")
    ap.add_argument("--tippecanoe", default=os.environ.get("TIPPECANOE") or shutil.which("tippecanoe") or "tippecanoe")
    # 地番の筆のタイル（scripts/parcel-tiles/build_pref.py）と同じ z14〜16。アプリは z16 のタイルを読む（lib/roadmap/parcel.ts の PARCEL_ZOOM）
    ap.add_argument("--jobs", type=int, default=1, help="同時に作る市町村の数（市町村ごとに別のプロセス）")
    ap.add_argument("--minzoom", type=int, default=14)
    ap.add_argument("--maxzoom", type=int, default=16)
    a = ap.parse_args()

    if a.check:
        check(a.source)
        return
    if not a.out:
        sys.exit("--out を指定してください")
    work = a.work or tempfile.mkdtemp(prefix="sanko-")
    os.makedirs(work, exist_ok=True)
    srcs = [s for s in SOURCES if not a.only or s["code"] in a.only]
    seq = a.geojsonl or os.path.join(work, "sanko.geojsonl")
    # 市町村ごとに別のプロセスで作り（--jobs）、GeoJSON の行を SOURCES の順につなぐ
    parts_dir = os.path.join(work, "parts")
    os.makedirs(parts_dir, exist_ok=True)
    opts = (work, a.moj_year, not a.no_align, a.keep_public, a.drop_unmapped)
    done: dict[str, dict] = {}
    with cf.ProcessPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        futs = {ex.submit(run_one, s, os.path.join(parts_dir, f"{s['code']}.geojsonl"), *opts): s for s in srcs}
        for fut in cf.as_completed(futs):
            s = futs[fut]
            try:
                done[s["code"]] = fut.result()
            except Exception as e:  # 1つの市町村が読めなくても、ほかは作る
                log(f"::warning::{s['code']} {s['name']}: {type(e).__name__}: {e}")
                log("".join(traceback.format_exception(e)))
    results = {s["code"]: done[s["code"]] for s in srcs if s["code"] in done}
    with open(seq, "w", encoding="utf-8") as fo:
        for c in results:
            with open(os.path.join(parts_dir, f"{c}.geojsonl"), encoding="utf-8") as fi:
                shutil.copyfileobj(fi, fo, 1 << 20)
    if not results:
        sys.exit("1つも作れませんでした")
    credits = "、".join(results[c]["credit"] for c in results)
    attribution = f"出典：{credits}（いずれも市町村のオープンデータ。PDL1.0／CC BY 4.0）を MICHILU が加工して作成。課税用の参考図で、登記の地番・筆の形と違うことがある"
    stamp = datetime.date.today().strftime("%Y%m%d")
    cmd = [
        a.tippecanoe, "-o", a.out, "--force", "-l", "sanko", f"-Z{a.minzoom}", f"-z{a.maxzoom}", "-P",
        "--drop-densest-as-needed", "--maximum-tile-bytes=2500000",
        "--no-line-simplification", "--no-tiny-polygon-reduction-at-maximum-zoom", "-q",
        "-n", f"MICHILU sanko (municipal parcel reference maps) {stamp}", "-A", attribution, seq,
    ]
    log(" ".join(cmd[:-3]) + " -A '…' " + seq)
    subprocess.run(cmd, check=True)
    if not a.geojsonl:
        os.remove(seq)
    size = os.path.getsize(a.out)
    manifest = {"built": str(datetime.date.today()), "file": os.path.basename(a.out), "bytes": size, "layer": "sanko", "attribution": attribution, "sources": results}
    mpath = a.manifest or os.path.splitext(a.out)[0] + ".json"
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log(f"完成: {a.out}（{size / 1e6:.1f} MB）・{mpath}")
    # 市町村ごとの一覧（標準出力）
    print("code\t市町村\t筆\t地物\t公共座標で除いた筆\t町に対応\t地番区域・地番が法務省にある\t地番区域（種類）が法務省にある\t平行移動m\tずれm（前→後）\tライセンス")
    for c, r in results.items():
        print(
            f"{c}\t{r['name']}\t{r['kept']}\t{r['features']}\t{r['public_overlap_dropped']}\t{r['mapped']:.1%}\t{r['exists']:.1%}\t"
            f"{r['kuiki_in_moj']:.1%}（{r['kuiki_distinct']}）\t{r['shift_m']}\t{r['residual_m']}\t{r['license']}"
        )


if __name__ == "__main__":
    main()
