#!/usr/bin/env python3
"""
市町村がオープンデータで公開している地番参考図（固定資産税の地番図。筆の形と地番）を、地番検索・筆界表示用のベクトルタイル
（PMTiles。レイヤ sanko・z14〜16）にする。登記所備付地図データ（法務省）が公図（任意座標）しか無い所でも、市町村の図で
緯度経度の付いた筆を出せるようにする。

  python3 scripts/sanko/build.py --jobs 3 --work work/sanko --out work/sanko.pmtiles --manifest lib/roadmap/data/sanko-source.json
  python3 scripts/sanko/build.py --only 13215 12227 --out work/test.pmtiles --work work/sanko   # 一部の市町村だけで試す
  python3 scripts/sanko/build.py --check      # 市町村の公開ファイルが新しくなったか（changed=true/false。--source と比べる）
  python3 scripts/sanko/build.py --fetch-only --work work/import   # 埼玉県・千葉県のサイトのファイルだけ取る（下の「R2 の写し」）

R2 の写し：埼玉県・千葉県のオープンデータサイトは、GitHub Actions（Microsoft のサーバー）からだと、どのページも 403 で読めない
（2026年10月）。そこで、そのファイルは別の所（手元など）で --fetch-only で取り、ブランチの sanko-src/ に zip と import.json を置いて、
ワークフロー（.github/workflows/sanko-tiles.yml）の import_ref で R2 の写し（sanko/src/）に足す。ワークフローは毎回その写しを
<work>/src に置いてから作る。公開サイトに届かない市町村は、import.json か前に作ったときの情報（--source）にあるファイルを使う。

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
# G空間情報センターの法務省の組織（都道府県ごと）
MOJ_ORGS = {
    "01": "moj-01hokkaido", "02": "moj-02aomori", "03": "moj-03iwate", "04": "moj-04miyagi", "05": "moj-05akita", "06": "moj-06yamagata",
    "07": "moj-07fukushima", "08": "moj-08ibaraki", "09": "moj-09tochigi", "10": "moj-10gunma", "11": "moj-11saitama", "12": "moj-12chiba",
    "13": "moj-13tokyo", "14": "moj-14kanagawa", "15": "moj-15niigata", "16": "moj-16toyama", "17": "moj-17ishikawa", "18": "moj-18fukui",
    "19": "moj-19yamanashi", "20": "moj-20nagano", "21": "moj-21gifu", "22": "moj-22shizuoka", "23": "moj-23aichi", "24": "moj-24mie",
    "25": "moj-25shiga", "26": "moj-26kyoto", "27": "moj-27osaka", "28": "moj-28hyogo", "29": "moj-29nara", "30": "moj-30wakayama",
    "31": "moj-31tottori", "32": "moj-32shimane", "33": "moj-33okayama", "34": "moj-34hiroshima", "35": "moj-35yamaguchi", "36": "moj-36tokushima",
    "37": "moj-37kagawa", "38": "moj-38ehime", "39": "moj-39kochi", "40": "moj-40fukuoka", "41": "moj-41saga", "42": "moj-42nagasaki",
    "43": "moj-43kumamoto", "44": "moj-44oita", "45": "moj-45miyazaki", "46": "moj-46kagoshima", "47": "moj-47okinawa",
}
PDL = "公共データ利用規約第1.0版（PDL1.0）"
CCBY = "CC BY 4.0"

# 市町村ごとの公開ファイルと読み方。
#   fetch：dataeye（埼玉県・千葉県のオープンデータサイト。dataset はデータセットの番号）か ckan（api・dataset）。
#          resource はリソース名・ファイル名に合う正規表現（合うものが複数あれば一番新しいもの）。
#          parts：shapefile の部品（.shp・.dbf・.shx など）が zip でなく別々のリソースの所。合う部品を全部取って1つの zip にまとめる
#   shp：zip の中の筆のポリゴンの shapefile（パスの正規表現）。epsg：座標系（.prj が無いものも平面直角座標系 IX 系）
#   chiban：地番の列（複数なら「本番-枝番-小枝番」とつなぐ）。key：大字の列（コードか名前。列の一覧なら「_」でつなぐ：京都市の区＋町名）。
#   oname：大字名の列。koaza：小字名の列
#   only：この列がこの値の筆だけ使う（長岡京市の「長狭物区分」＝地番）。drop_lots：地番の頭の数字がこれに合えば地番ではない（道・水路の番号）
#   mirror：GitHub Actions から取れないので R2 の写し（sanko/src/）から読む（手元で --fetch-only → ワークフローの import_ref で足す）
#   names：大字名を別の表から引く（shp か csv。key・name の列。pad はコードの桁をそろえる）
#   gdb：shapefile でなくファイルジオデータベース（.gdb のフォルダ）の所。layer は筆の面のレイヤ（fiona で読む）
#   oaza_poly：筆に大字の列が無い所。大字の境の面の shapefile（shp。key・name の列）のうち、筆の中の点を含む面の大字にする
#   split：1つの列に「大字コード-地番」があるもの
#   subkey：小字のコードの列（小字ごとに地番が付き、小字の名前が無い市。小字のまとまりごとに法務省の地番区域を決める）
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
    # ---- 関東の外（2026-11-15 に足した。国の地価の地点で、法務省の地図データでは筆まで出ない所が多い市） ----
    {
        # 町字名は大字と小字をつないだ名前（「福受町下ノ切」）。大字界の大字名で、大字と小字に分ける
        "code": "23211", "name": "豊田市", "credit": "豊田市「地番参考図」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "232114_chibanzu", "resource": r"^地番参考図\.zip$"},
        "date": "2026-01-01", "epsg": 6675, "enc": "cp932",
        "shp": r"(?i)/Tochi\.shp$", "chiban": ["地番"], "key": "町字名", "oname": "町字名",
        "split_name": {"shp": r"大字界\.shp$", "field": "AZANAME"},
        # 法務省の地番区域が大字だけ（「深見町」）の町で、市の図の小字（「木戸」）を地番区域に残す。国土地理院の町名は「深見町木戸」
        "keep_koaza": True,
    },
    {
        "code": "27203", "name": "豊中市", "credit": "豊中市「地番参考図（地図情報とよなか）」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja ＋ 豊中市オープンデータ利用規約（CC BY 4.0 に準拠）",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "272035_chibansanko", "resource": r"地番参考図$"},
        "date": "2025-01-01", "epsg": 6674, "enc": "cp932",
        "shp": r"(?i)chiban\.shp$", "chiban": ["TIBAN", "EDABAN", "KOBAN"], "key": "CYOU_NO",
    },
    {
        "code": "34207", "name": "福山市", "credit": "福山市「福山市地番図データ」", "license": "CC BY（版の記載なし）",
        "terms": "https://data.city.fukuyama.hiroshima.jp/terms（福山市オープンデータカタログサイト利用規約。出典と、加工したこと・加工した者を書く）",
        "fetch": {"kind": "ckan", "api": "https://data.city.fukuyama.hiroshima.jp/api/3/action", "dataset": "digital_numbers_map", "resource": r"地番図データ"},
        "date": "2026-01-01", "epsg": 6671, "enc": "cp932",
        "shp": r"筆界_面\.shp$", "chiban": ["TXTCD"], "key": "AZACD", "koaza": "KOAZA_小字",
    },
    {
        # 市のページに直接置かれたファイル（オープンデータのサイトのデータセットは、このページへのリンクだけ）
        "code": "26209", "name": "長岡京市", "credit": "長岡京市「地番参考図」", "license": CCBY,
        "terms": "https://www.city.nagaokakyo.lg.jp/cmsfiles/contents/0000012/12991/riyoukiyaku.pdf（長岡京市オープンデータ利用規約。CC BY 4.0）",
        "fetch": {"kind": "page", "page": "https://www.city.nagaokakyo.lg.jp/0000012991.html", "resource": r"(?i)^R\d+_?(?:tiban|chiban).*shape.*\.zip$"},
        "date": "2026-01-01", "epsg": 2448, "enc": "cp932",
        "shp": r"筆面\.shp$", "split": {"field": "所在", "re": r"^(\d+)-\d+:(.+)$"},
        # 地番は小字ごとに付く（同じ大字の別々の小字に同じ地番がある）。小字の名前は無いので、小字コードで法務省の地番区域を決める
        "subkey": "小字コード",
        # 道路・水路などの面にも 96666・93333 のような番号が付いているので、地番の面だけ
        "only": {"field": "長狭物区分", "values": ["地番"]},
    },
    {
        "code": "24216", "name": "伊賀市", "credit": "伊賀市「地番図データ」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "_chibanzu", "resource": r"地番図データ"},
        "date": "2026-01-01", "epsg": 6674, "enc": "cp932",
        "shp": r"(?i)chibanzu\.shp$", "chiban": ["地番"], "key": "大字名", "oname": "大字名", "koaza": "小字名",
    },
    {
        # 年ごとにリソースが増える（同じ日に前の年のものも更新された）ので、時点の名前で選ぶ
        "code": "40202", "name": "大牟田市", "credit": "大牟田市「地番参考図」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "402028_26", "resource": r"令和8年1月1日時点"},
        "date": "2026-01-01", "epsg": 6670, "enc": "cp932",
        "shp": r"1_筆界）\.shp$", "split": {"field": "KEYCODE", "re": r"^(\d+)-(.+)$"},
        "names": {"shp": r"5_大字名称）\.shp$", "key": "OOAZACODE", "name": "OOAZANAME"},
    },
    {
        "code": "25212", "name": "高島市", "credit": "高島市「地番図」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "252123_chibanzu", "resource": r"高島市地番図"},
        "date": "2026-01-01", "epsg": 2448, "enc": "cp932",
        "shp": r"(?i)exp-tochi\.shp$", "split": {"field": "MOTOCHIBAN", "re": r"^(\d+)-(.+)$"},
        # 8888・9999 は同じ大字に数十の面（細長い形が多い：道・水路など）に付く番号で、地番ではない
        "drop_lots": r"8888|9999",
    },
    {
        # 区のある市。区ごとの法務省の地図XMLを合わせて読み、同じ名前の町がほかの区にもあれば、筆の区（ku）の町にする。
        # 地番区域は「熊本市南区_…」、筆の市区町村コード（m）は市のコード（出典を引くため）
        "code": "43100", "name": "熊本市", "credit": "熊本市「熊本市_地番参考図」", "license": PDL,
        "terms": "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0 ＋ 熊本市地番参考図利用規約（データセットのページ。編集・加工したことを書き、熊本市が作ったように見せない）",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "040001_chibansankouzu", "resource": r"^sjis_.*chibansankouzu"},
        "date": "2025-01-01", "epsg": 2444, "enc": "cp932",
        "shp": r"(?i)chibansankouzu_kumamotocity\.shp$", "chiban": ["chiban"], "key": "oaza", "oname": "oaza_name",
        "wards": ["43101", "43102", "43103", "43104", "43105"], "ward_field": "ku",
    },
    {
        # G空間情報センターの 7z。KU は区の番号（1 青葉区〜5 泉区）、ANAME は「坪沼字原前」（大字名＋字＋小字名）
        "code": "04100", "mirror": True, "name": "仙台市", "credit": "仙台市「仙台市地番図（参考図）データ」", "license": "CC BY（版の記載なし）",
        "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja（G空間情報センターの表示は「クリエイティブ・コモンズ 表示」で版の記載なし）",
        "fetch": {"kind": "ckan", "api": GSPATIAL, "dataset": "chibanzu", "resource": r"^土地$"},
        "date": "2026-01-01", "epsg": 6678, "enc": "cp932",
        "shp": r"(?i)/tochi\.shp$", "chiban": ["DNO"], "key": "AZA", "oname": "ANAME", "split_aza": True,
        "wards": ["04101", "04102", "04103", "04104", "04105"], "ward_field": "KU",
        "ward_names": {"1": "青葉区", "2": "宮城野区", "3": "若林区", "4": "太白区", "5": "泉区"},
    },
    {
        # 法務省の地図XMLは、2024年の区の再編のあとも前の区のコード（22131〜22137。天竜区は 22137）と新しい区（22138 中央区・22139 浜名区）に
        # 分かれているので、全部を合わせて読む。図の区の番号は前の区なので使わない（同じ名前の町は区の別で決めない）
        "code": "22130", "name": "浜松市", "credit": "浜松市「浜松市地番図」", "license": "CC BY（版の記載なし）",
        "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja（G空間情報センターの表示は「クリエイティブ・コモンズ 表示」で版の記載なし）",
        "fetch": {"kind": "ckan", "api": GSPATIAL, "dataset": "hamamatsu_chibanzu", "resource": r"^地番$"},
        "date": "2026-01-01", "epsg": 2450, "enc": "cp932",
        "shp": r"(?i)/POL\.shp$", "chiban": ["Chiban"], "key": "Shozai", "oname": "Ooaza",
        "wards": ["22131", "22132", "22133", "22134", "22135", "22136", "22137", "22138", "22139"],
    },
    {
        "code": "40204", "name": "直方市", "credit": "直方市「直方市地番対応図」", "license": CCBY, "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "402044_land_lot_correspondence_map", "resource": r"R8\.1\.1時点"},
        "date": "2026-01-01", "epsg": 2444, "enc": "utf-8",
        "shp": r"直方市地番対応図\d*\.shp$", "chiban": ["地番"], "key": "大字", "oname": "大字",
        # 99999-◯ は道などの面に付く番号で、地番ではない
        "drop_lots": r"99999",
    },
    {
        "code": "28210", "name": "加古川市", "mirror": True, "credit": "加古川市「加古川市地番参考図（土地家屋図）データ」", "license": CCBY,
        "terms": "加古川市地番参考図（土地家屋図）データ及び地価マップデータ利用規約（データセットのページの PDF。営利目的を含む二次利用・改変を許可し、"
        "規約に定めの無いことは CC BY 4.0。加工した情報を市が作ったように見せることは禁止）",
        "fetch": {"kind": "ckan", "api": "https://opendata-api-kakogawa.jp/ckan/api/3/action", "dataset": "landhouse", "resource": r"地番参考図（土地家屋図）データ$"},
        "date": "令和8年度（2026年度）", "epsg": 2447, "enc": "cp932",
        "shp": r"(?i)/TOCHI\.shp$", "chiban": ["TXTCODE1"], "key": "ATR1",
        "names": {"shp": r"(?i)/OOAZA\.shp$", "key": "ATR1", "name": "NAME"},
    },
    {
        # 京都市のサイトのファイルはダウンロードのボタン（フォームの送信）でしか取れないので、国土交通省が同じデータを共通の仕様に
        # 変換して公開している試作データを使う（国交省のサイトのコンテンツは PDL1.0。この試作データは別のルールの一覧に無い）。
        # 時点：国交省のページ（tochi_fudousan_kensetsugyo_tk17_000001_00065）が原典に挙げるのは「令和６年１月１日時点」のデータ（試作データは 2026-01-13 公開）
        "code": "26100", "name": "京都市", "mirror": True,
        "credit": "京都市「京都市固定資産税（土地）地番図データ」（国土交通省「土地境界データ(地番現況図) 試作データ」で共通の仕様に変換されたもの）",
        "license": "CC BY 4.0（京都市）・公共データ利用規約第1.0版（国土交通省の変換）",
        "terms": "京都市固定資産税（土地）地番図データ利用規約（CC BY 4.0）＋ 国土交通省ウェブサイトの利用ルール https://www.mlit.go.jp/link.html（PDL1.0）",
        "fetch": {"kind": "page", "page": "https://www.mlit.go.jp/tochi_fudousan_kensetsugyo/tochi_fudousan_kensetsugyo_tk17_000001_00063.html", "resource": r"^26100_Shapefile\.zip$"},
        "date": "2024-01-01", "epsg": 6674, "enc": "cp932",
        "shp": r"26100_京都市_土地境界データ_\d+\.shp$", "chiban": ["地番"],
        # 同じ町名がいくつもの区にある（亀屋町など）ので、区の名前と町名で分ける
        "key": ["市区町村名", "大字名"], "oname": "大字名", "koaza": "小字名",
        "wards": ["26101", "26102", "26103", "26104", "26105", "26106", "26107", "26108", "26109", "26110", "26111"],
        "ward_field": "市区町村名",
        "ward_names": {f"京都市{w}": w for w in ("北区", "上京区", "左京区", "中京区", "東山区", "下京区", "南区", "右京区", "伏見区", "山科区", "西京区")},
    },
    {
        # 筆のポリゴン（Tochi_Poly）の .shp・.dbf・.shx が別々のリソース（zip でない）。.prj は無い（平面直角座標系 II 系）。
        # データセットのライセンスは CC BY 2.1 JP。市のオープンデータ利用規約（CC BY 4.0）は「リソースに個別のライセンスが定められているものはそれによります」
        "code": "40215", "name": "中間市", "credit": "中間市「中間市地番図（令和８年１月１日時点）」", "license": "CC BY 2.1 JP",
        "terms": "https://creativecommons.org/licenses/by/2.1/jp/legalcode ＋ 中間市オープンデータ利用規約 https://odcs.bodik.jp/402150/tos/",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "402150_tibanzu", "resource": r"(?i)^tochi_poly\.(shp|shx|dbf|prj|cpg)$", "parts": True},
        "date": "2026-01-01", "epsg": 6670, "enc": "cp932",
        "shp": r"(?i)tochi_poly\.shp$", "chiban": ["地番"], "key": "大字名", "oname": "大字名",
    },
    {
        # 公開型GIS（ひおきマップ）の地番図。.shp・.dbf・.shx・.prj が別々のリソース。大字のコードは旧町ごと（1xx 東市来町・2xx 伊集院町・
        # 3xx 日吉町・4xx 吹上町）で、同じ名前の大字が別の旧町にある（神之川・寺脇）のでコードで分ける。本番が「無地番」「道路・公道」「水路」の面は入れない
        "code": "46216", "name": "日置市", "credit": "日置市「地番図データ」", "license": CCBY,
        "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja ＋ 日置市オープンデータ利用規約 https://odcs.bodik.jp/462161/tos/",
        "fetch": {"kind": "ckan", "api": BODIK, "dataset": "462161_chibanzudata", "resource": r"(?i)^chibanzu\.(shp|shx|dbf|prj|cpg)$", "parts": True},
        "date": "2026-11-09 公開（時点の記載なし）", "epsg": 2444, "enc": "cp932",
        "shp": r"(?i)chibanzu\.shp$", "chiban": ["本番", "枝番"], "key": "大字コード", "oname": "大字名称", "koaza": "小字名称",
    },
    {
        # G空間情報センターの伊丹市のページ。伊丹市オープンデータ利用規約（同じページの PDF。令和2年9月1日から）は、データのライセンスを
        # 「CC BY 4.0」か「CC 0」のどちらかとしている。最新の令和８年版（2026-04-30）だけライセンスの表示が「GNU Free Documentation License」で
        # 規約と合わないので使わず（市に確かめるまで）、CC BY の令和７年版を使う。
        # 筆の面（筆界線。名前は線だが面）に大字の列が無いので、大字界の面で大字を決める（oaza_poly）
        "code": "28207", "name": "伊丹市", "credit": "伊丹市「令和７年度（２０２５年度）伊丹市地番参考図（令和７年１月時点）」", "license": CCBY,
        "terms": "伊丹市オープンデータ利用規約（G空間情報センターの伊丹市のページの PDF。CC BY 4.0。改変した情報を市が作ったように見せることは禁止）",
        "fetch": {"kind": "ckan", "api": GSPATIAL, "dataset": "chiban_2025", "resource": r"伊丹市地番参考図"},
        "date": "2025-01-01", "epsg": 2447, "enc": "cp932",
        "shp": r"/筆界線\.shp$", "chiban": ["所在地地番"],
        "oaza_poly": {"shp": r"/大字界\.shp$", "key": "大字cd", "name": "大字名"},
        # 法務省の町に対応しない大字（「口酒井字明見」のように大字名に小字が付き、法務省の地図の地番に W1 などの切れ端の印が付いていて
        # 地番で照らし合わせられないもの。約0.5%）の筆は、地番区域が法務省と合わないので入れない
        "drop_unmapped": True,
    },
    {
        # G空間情報センターの室蘭市のページ（ファイルジオデータベース）。データセットのライセンスは「CC-BY」（版の記載なし。作成者は室蘭市）。
        # 筆の面は hude レイヤ（町字のコード・町字名・地番・枝番。枝番の「0」は枝番なし）。座標系は平面直角座標系 XII 系（JGD2000）
        "code": "01205", "name": "室蘭市", "credit": "室蘭市「室蘭市地番図2024年」", "license": "CC BY（版の記載なし）",
        "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja（G空間情報センターの表示は「CC-BY」で版の記載なし）",
        "fetch": {"kind": "ckan", "api": GSPATIAL, "dataset": "muroranchiban2024", "resource": r"(?i)gdb\.zip$"},
        "date": "2024-01-01", "epsg": 2454, "enc": "utf-8",
        "gdb": {"layer": "hude"}, "chiban": ["地番", "枝番"], "key": "町字", "oname": "町字名",
    },
    # ---- 2026-11-21 に足した（市のページ・オープンデータのサイトでライセンスと利用規約を確かめた） ----
    {
        # 字ごとに地番が付く（大字のコードは小字まで。「三和町下三坂字南作」は大字「三和町下三坂」と小字「南作」に分ける）。.prj は無い（平面直角座標系 IX 系）
        "code": "07204", "name": "いわき市", "credit": "いわき市「地番参考図」", "license": "CC BY 2.1 JP",
        "terms": "https://creativecommons.org/licenses/by/2.1/jp/legalcode（いわき市の地番参考図のページ。「本ページに掲載しているデータは、自由に利用・改変できます」）",
        "fetch": {"kind": "page", "page": "https://www.city.iwaki.lg.jp/www/contents/1755050006519/index.html", "resource": r"^chibansankouzu\.zip$"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"(?i)/tochi_poly\.shp$", "chiban": ["TXTCD"], "key": "AZACD",
        "names": {"shp": r"(?i)/ooaza\.shp$", "key": "AZAC", "name": "AZACNAM"}, "split_aza": True,
    },
    {
        # 水戸市オープンデータのページ。zip の中に筆の面（大字コード・表示文字列）と大字コードの表（csv）
        "code": "08201", "name": "水戸市", "credit": "水戸市「地形地番集成編纂図データファイル」", "license": "CC BY（版の記載なし）",
        "terms": "https://creativecommons.org/licenses/by/4.0/legalcode.ja（データのページの表示は「CC-BY」で版の記載なし。コピーライトは水戸市役所）",
        "fetch": {"kind": "page", "page": "https://www.city.mito.lg.jp/site/open-data/97836.html", "resource": r"^data\.zip$"},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"/地番集成編纂図データファイル\.shp$", "chiban": ["表示文字列"], "key": "大字コード",
        "names": {"csv": r"/大字コード\.csv$", "key": "大字コード", "name": "大字名称", "pad": 3},
    },
    {
        # 筆の面（筆界線01〜07）が7つの zip に、大字の名前（大字界）が字界の zip に分かれて置かれている（bundle で全部取り、shp_all で全部読む）
        "code": "09201", "name": "宇都宮市", "credit": "宇都宮市「地籍図データ」", "license": "CC BY（版の記載なし）",
        "terms": "https://data.city.utsunomiya.tochigi.jp/terms/（宇都宮市オープンデータポータルサイト利用規約。データセットのライセンスは「クリエイティブ・コモンズ 表示」で版の記載なし。"
        "編集・加工したことと、した者を書き、市が作ったように見せない）",
        "fetch": {"kind": "ckan", "api": "https://catalog.city.utsunomiya.tochigi.jp/api/3/action", "dataset": "chibannzu-070101", "resource": r"^\d\d_(?:字界|地番図\d+)\.zip$", "bundle": True},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"/筆界線\d+\.shp$", "shp_all": True, "chiban": ["SYO_HON", "SYO_EDA", "SYO_KOEDA"], "key": "SYO_CHO_CD",
        "names": {"shp": r"大字界\.shp$", "key": "CYO_CD", "name": "CYO_MEI"},
    },
    {
        # 年ごとにリソースが増える（前の年のものがあとから更新された）ので、時点の名前で選ぶ（大牟田市と同じ）
        "code": "16201", "name": "富山市", "credit": "富山市「地番参考図」", "license": CCBY,
        "terms": "https://opdt.city.toyama.lg.jp/pages/terms（富山市オープンデータ利用規約。CC BY 4.0。編集・加工した情報を市が作ったように見せない）",
        "fetch": {"kind": "ckan", "api": "https://opdt.city.toyama.lg.jp/api/3/action", "dataset": "chiban", "resource": r"令和[8８]年[1１]月[1１]日"},
        "date": "2026-01-01", "epsg": 2449, "enc": "cp932",
        "shp": r"(?i)/tochi_poly\.shp$", "chiban": ["TXTCD"], "key": "大字コード", "oname": "大字名", "koaza": "小字名",
    },
    {
        # 筆界線（筆の面。大字と地番の列がある）の .dbf・.shp・.shx と .prj が3つの zip に分かれている（bundle で取り、flatten で集める）。
        # 地番の文字の点（地番1・2）と引出線は表示用で、使わない。市のサイトは「408 Request Timeout」を返すことが多い（2026-11-21 に手元で、
        # 何度か読み直してやっと取れた）ので、一度取れたファイルは R2 の写しから読む（mirror）
        "code": "29201", "mirror": True, "name": "奈良市", "credit": "奈良市「地番図」", "license": "CC BY 2.1 JP",
        "terms": "https://creativecommons.org/licenses/by/2.1/jp/legalcode ＋ 奈良市オープンデータカタログ利用規約（第1.2版）https://www.city.nara.lg.jp/uploaded/attachment/169004.pdf"
        "（地番図オープンデータのページ。データの利用をもって規約を承諾したものとみなす。改変して利用したことを書く）",
        "fetch": {"kind": "page", "page": "https://www.city.nara.lg.jp/soshiki/14/104605.html", "resource": r"^筆界線\d\s*\[", "by_text": True, "bundle": True},
        "date": "2025-01-01", "epsg": 2448, "enc": "cp932", "flatten": True,
        "shp": r"/筆界線\.shp$", "chiban": ["地番本番", "地番枝番", "地番小枝"], "key": "大字cd", "oname": "大字名",
    },
    {
        # 筆の面（筆ポリゴン）は図形の番号だけで、地番は文字の点（地番注記）にある。文字は引出線（注記の番号で結び付く）か、
        # 文字の点そのもので筆に当てる（labels）。大字の名前の表は仕様書（PDF）にしか無いので、町は法務省の筆との重なりと地番の集まりで決める
        "code": "10202", "name": "高崎市", "credit": "高崎市「地番図」", "license": CCBY,
        "terms": "https://www.city.takasaki.gunma.jp/uploaded/attachment/6063.pdf（高崎市オープンデータ利用規約。政府標準利用規約第2.0版に準拠し、CC BY 4.0 と互換。加工して利用したことを書く）",
        "fetch": {"kind": "page", "page": "https://www.city.takasaki.gunma.jp/page/3130.html", "resource": r"^(?:地番_地番図|地番引出線_地番図|筆ポリゴン_地番図)\s", "by_text": True, "bundle": True},
        "date": "2026-01-01", "epsg": 6677, "enc": "cp932",
        "shp": r"筆ポリゴン_地番図\.shp$", "chiban": ["label"], "key": "oazacd",
        "labels": {"shp": r"地番_地番図\.shp$", "id": "chibanid", "leaders": r"地番引出線_地番図\.shp$"},
    },
]
# 確かめて外したもの（--check で「入れていない市町村」として知らせない）。
EXCLUDED = {
    "戸田市": "CC BY-ND（改変禁止）で、同梱の注意事項が複製・転用・編集を禁止している",
    "習志野市": "地番現況図が PDF しかない（CC BY 2.1 JP）",
    # さがみはら地図情報（https://sagamihara.geocloud.jp/webgis/TermsOfUse/101/termsOfUse.html。2026年10月に確認）
    "相模原市": "さがみはら地図情報の地番参考図は、利用規約が図形の変形・変更・加筆・削除等の編集を禁じている（オープンデータのライセンスではない）",
    # 2026-11-15 に確かめたもの
    "名古屋市": "オープンデータのサイト（BODIK）のデータセットは CC BY 4.0 だが、市の地番参考図のページ（https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011937/1033712.html。2026-06-12 更新）が「地番参考図の変形・変更・加筆・削除等の編集を行うことはできません」「営利目的で利用することはできません」と書いていて、食い違う（市に確かめるまで入れない）",
    "岡山市": "地番参考図のページは CC BY 4.0 としつつ、「変形、変更、加筆、削除などの編集はできません」と書いていて、食い違う（市に確かめるまで入れない）",
    "和歌山市": "地番参考図の利用規約が、内容の変形・変更・加筆・削除などの編集（二次的著作物の作成）を禁じている（ライセンスは「その他」）",
    "堺市": "地番参考図は閲覧システムだけで、掲載内容の無断の複製・転用を禁じている",
    "岸和田市": "地番参考図のファイルは、市のページで利用条件に同意してから進む所にある（MICHILU は同意の先を開かない）。ライセンスの表示も無い",
    "福岡市": "字図（地番現況図）は、オープンデータのサイトにファイルが無い（福岡市Webまっぷで見るだけ）",
    "城陽市": "データセットは CC BY 4.0 だが、すべてに同意してから使うようにと書かれた「城陽市オープンデータ利用規約」の本文が見つからない（読めたら入れる）",
    # 2026-11-16 に確かめたもの
    "築上町": "地番参考図（CC BY 4.0）の筆の9割は法務省の公共座標の筆と重なり、残りの多くは道・水路の面に付いた 5000〜6000番台の番号で、"
    "法務省のデータに無い（地番区域と地番が法務省にあるのは 6.3%）。地番でない番号を出すおそれがあるので入れない",
    "ニセコ町": "地番図データ（北海道オープンデータポータル）のページが、自動アクセスの対策（Incapsula）で開けない（回り込まない）",
    "水巻町": "登記地番の点と筆界の線に分かれた形で、点が引出線で筆の外に置かれる所がある。点と筆の対応を誤るおそれがあるので、今は入れない",
    "長与町": "地番の点と筆界の線に分かれた形（地番.zip・筆界.zip）。点と筆の対応を誤るおそれがあるので、今は入れない",
    # 2026-11-16（2回目）に確かめたもの
    "東員町": "地番参考図（CC BY 4.0）は地番の文字の点と筆の面が別々で、文字の約4分の1は引出線で筆の外に置かれている。点と筆の対応を誤るおそれがあるので、今は入れない",
    "川西市": "G空間情報センターの地番参考図は2018年1月1日時点のもので、案内先の市のページが無くなり、市のオープンデータの一覧にも無い（古く、今の公開が確かめられないので入れない）",
    "静岡市": "G空間情報センターの地番図は2015〜2017年のもの。新しいものは市の地図サイト（しずマップ）で利用条件に同意してから取る所にある（MICHILU は同意の先を開かない）",
    "日野町": "地籍図は明治の地引絵図などを写した PDF（筆のデータではない）",
    # 2026-11-21 に確かめたもの
    "福島市": "地番参考図（CC BY 2.1 JP）のファイルは、市のオープンデータのページで「本規約に同意する」を押してから進む一覧の先にある"
    "（押すことで規約を承諾したとみなす決まり。MICHILU は同意の先を開かない）",
    "旭川市": "地番参考図データ（CC BY 2.1 JP）は、法務省の公共座標の筆と同じ所で地番が同じ筆が 82.6% だけで、同じ地番の筆の位置のずれは"
    "中央値 1.19m・4分の1は 2.2m より大きい（向きはそろっていないので、平行移動では直らない。同じ確かめで高崎市は 96.1%・0.39m、"
    "入れている市町村のずれの中央値は 0〜0.9m）。図が粗いので、今は入れない",
}

KANJI_NUM = {"〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
# 「６丁目」「十二丁目」だけの名前（大字の名前の後ろに残ったとき、小字ではなく丁目として町の名前に残す）
CHOME_ONLY = re.compile(r"(?:[0-9]+|[〇一二三四五六七八九十]+)丁目")
# 同じ地番区域・地番の筆がこれより離れた2か所以上にあれば、違う土地に同じ地番を付けたおそれがあるので入れない（m）
SPLIT_GAP_M = 100.0
# 同じ名前の町の筆を、離れた区画のまとまりに分けるときの間（m）。京都市の同じ区の同じ名前の町は、ふつう数百 m 以上離れている
PAREN_GAP_M = 30.0
CHIBAN_RE = re.compile(r"^\d+(-\d+)*$")
# 法務省の地図の地番の後ろの印（W・V・X。lib/roadmap/parcel.ts の PIECE_MARK と同じ）
PIECE_RE = re.compile(r"(?:W\d+|V\d+|X\(\d+/\d+\))$")
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
            # 403（埼玉県・千葉県のサイトは GitHub Actions から読めない）と 404 は、読み直しても同じ
            if e.code in (403, 404) or i == tries - 1:
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
            if path.lower().endswith(".7z") and not is_archive(tmp):
                raise OSError("7z として読めません")
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


def page_resources(page: str, pattern: str, by_text: bool = False) -> tuple[dict, list[dict]]:
    """市町村のページに直接置かれたファイル（オープンデータのサイトに無い所。長岡京市）。ページのリンクのうち pattern に合うものを、
    ページに載っている順に（新しい年が上）。更新日はファイルの Last-Modified。
    by_text：ファイル名が番号だけの所（高崎市の「42709.zip」）は、リンクの文字（「地番_地番図 [その他のファイル／12.87MB]」）で選ぶ"""
    t = get(page).decode("utf-8", "replace")
    if by_text:
        links = [(h, html.unescape(re.sub(r"<[^>]+>", "", x)).strip()) for h, x in re.findall(r'<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>', t, flags=re.S)]
    else:
        links = [(h, "") for h in re.findall(r'href="([^"]+)"', t)]
    out = []
    seen = set()
    for href, text in links:
        url = urllib.parse.urljoin(page, html.unescape(href))
        if url in seen or not re.search(pattern, text if by_text else urllib.parse.unquote(url.rsplit("/", 1)[-1])):
            continue
        seen.add(url)
        modified, size = "", 0
        try:
            req = urllib.request.Request(url, headers=UA, method="HEAD")
            with urllib.request.urlopen(req, timeout=60) as r:
                lm = r.headers.get("Last-Modified")
                size = int(r.headers.get("Content-Length") or 0)
            if lm:
                from email.utils import parsedate_to_datetime

                modified = parsedate_to_datetime(lm).strftime("%Y-%m-%d")
        except Exception:
            pass
        name = url.rsplit("/", 1)[-1]
        out.append({"id": re.sub(r"\.zip$", "", name, flags=re.I), "name": text or name, "file": name, "modified": modified, "size": size, "license": "", "url": url, "order": len(out)})
    return {"title": "", "org": ""}, out


def resolve(src: dict, known: dict | None = None) -> dict:
    """いま公開されているファイル（合うリソースのうち一番新しいもの）。公開サイトに届かないときは、known（前に取ったファイル。
    known_files）にその市町村があれば、それを使う（埼玉県・千葉県のサイトは GitHub Actions から 403。ファイルは R2 の写しを使う）"""
    f = src["fetch"]
    if f["kind"] == "page":
        try:
            info, res = page_resources(f["page"], f["resource"], f.get("by_text", False))
        except Exception as e:
            k = (known or {}).get(src["code"])
            if not k:
                raise
            log(f"::warning::{src['code']} {src['name']}: 公開ページに届かないので（{type(e).__name__}: {e}）、前に取ったファイル {k['file']} を使います")
            return k
        if not res:
            raise RuntimeError(f"{src['name']}: ページにファイルが見つかりません（{f['page']}）")
        if f.get("bundle"):
            return {**bundle_parts(src, res), "title": info.get("title", ""), "org": info.get("org", ""), "page": f["page"]}
        best = min(res, key=lambda r: r["order"])
        best = {k: v for k, v in best.items() if k != "order"}
        return {**best, "title": info.get("title", ""), "org": info.get("org", ""), "page": f["page"]}
    try:
        info, res = dataeye_resources(f["base"], f["dataset"]) if f["kind"] == "dataeye" else ckan_resources(f["api"], f["dataset"])
    except Exception as e:
        k = (known or {}).get(src["code"])
        if not k:
            raise
        log(f"::warning::{src['code']} {src['name']}: 公開サイトに届かないので（{type(e).__name__}: {e}）、前に取ったファイル {k['file']}（{k['modified']}）を使います")
        return k
    pat = re.compile(f["resource"])
    cand = [r for r in res if pat.search(r["name"]) or pat.search(urllib.parse.unquote(r["file"]))]
    if not cand:
        raise RuntimeError(f"{src['name']}: リソースが見つかりません（{[r['name'] for r in res]}）")
    page = f"{f['base']}/datasets/{f['dataset']}" if f["kind"] == "dataeye" else f"{f['api'].replace('/api/3/action', '')}/dataset/{f['dataset']}"
    if f.get("parts"):
        return {**shapefile_parts(src, cand), "title": info.get("title", ""), "org": info.get("org", ""), "page": page}
    if f.get("bundle"):
        return {**bundle_parts(src, cand), "title": info.get("title", ""), "org": info.get("org", ""), "page": page}
    best = max(cand, key=lambda r: (r["modified"], r["id"]))
    return {**best, "title": info.get("title", ""), "org": info.get("org", ""), "page": page}


def part_name(r: dict) -> str:
    """リソースのファイル名（URL の最後。展開先の外を指さないよう、ディレクトリを外す）"""
    return os.path.basename(urllib.parse.unquote(r["file"]).replace("\\", "/"))


def shapefile_parts(src: dict, cand: list[dict]) -> dict:
    """shapefile の部品（.shp・.dbf・.shx・.prj など）が zip でなく別々のリソースで置かれている所（日置市・中間市）。
    拡張子ごとに一番新しいものを取り、id・URL は .shp のもの、更新日は部品の一番新しい日、大きさは合計にする（parts に部品の一覧）"""
    by_ext: dict[str, dict] = {}
    for r in cand:
        ext = os.path.splitext(part_name(r))[1].lower()
        if ext and (ext not in by_ext or (r["modified"], r["id"]) > (by_ext[ext]["modified"], by_ext[ext]["id"])):
            by_ext[ext] = r
    missing = {".shp", ".shx", ".dbf"} - set(by_ext)
    if missing:
        raise RuntimeError(f"{src['name']}: shapefile の部品が足りません（{sorted(missing)}。ある部品：{sorted(part_name(r) for r in cand)}）")
    parts = sorted(by_ext.values(), key=part_name)
    shp = by_ext[".shp"]
    return {
        **shp,
        "file": " ".join(part_name(r) for r in parts),
        "modified": max(r["modified"] for r in parts),
        "size": sum(r["size"] for r in parts),
        "parts": [{"file": part_name(r), "url": r["url"], "size": r["size"]} for r in parts],
    }


def bundle_parts(src: dict, cand: list[dict]) -> dict:
    """1つのデータが、いくつものファイル（zip）に分けて置かれている所（宇都宮市の地番図01〜07と字界）。合うファイルを名前ごとに
    一番新しいものだけ全部取る。id・URL は名前の順で最初のもの、更新日は一番新しい日、大きさは合計にする（parts に一覧。
    fetch_archive が1つの zip にまとめ、extract が中の zip を展開する）"""
    by_name: dict[str, dict] = {}
    for r in cand:
        n = part_name(r)
        if n and (n not in by_name or (r["modified"], r["id"]) > (by_name[n]["modified"], by_name[n]["id"])):
            by_name[n] = r
    if len(by_name) < 2:
        raise RuntimeError(f"{src['name']}: 分けて置かれたファイルが足りません（{sorted(by_name)}）")
    parts = [by_name[n] for n in sorted(by_name)]
    first = {k: v for k, v in parts[0].items() if k != "order"}
    return {
        **first,
        "file": " ".join(part_name(r) for r in parts),
        "modified": max(r["modified"] for r in parts),
        "size": sum(r["size"] for r in parts),
        "parts": [{"file": part_name(r), "url": r["url"], "size": r["size"]} for r in parts],
    }


def fetch_archive(meta: dict, path: str) -> None:
    """公開ファイルを path（zip か 7z）に取る。部品が別々のリソースの所（parts）は、部品を取って1つの zip にまとめる"""
    if not meta.get("parts"):
        download(meta["url"], path)
        return
    tmp = path + ".parts"
    os.makedirs(tmp, exist_ok=True)
    for p in meta["parts"]:
        name = os.path.basename(p["file"])
        if not name or name in (".", ".."):
            raise RuntimeError(f"部品の名前が読めません: {p['file']!r}")
        download(p["url"], os.path.join(tmp, name))
    with zipfile.ZipFile(path + ".zip-tmp", "w", zipfile.ZIP_DEFLATED) as z:
        for p in meta["parts"]:
            z.write(os.path.join(tmp, os.path.basename(p["file"])), os.path.basename(p["file"]))
    os.replace(path + ".zip-tmp", path)
    shutil.rmtree(tmp)


def known_files(source_path: str | None, work: str) -> dict:
    """前に取ったファイルの情報（resolve と同じ形。市区町村コード → 情報）。前に作ったときの情報（--source）と、別の所で取って
    足したファイルの <work>/src/import.json（--fetch-only で書く。こちらが優先）から"""
    known = {}
    if source_path and os.path.exists(source_path):
        for code, e in json.load(open(source_path, encoding="utf-8")).get("sources", {}).items():
            m = re.search(r"/resource_download/(\d+)$", e.get("url", ""))
            rid = e.get("id") or (m.group(1) if m else "")
            if rid:
                known[code] = {
                    "id": rid, "name": "", "file": e["file"], "modified": e["modified"], "size": e["size"],
                    "license": e.get("portal_license", ""), "terms": e.get("terms", ""), "url": e["url"], "page": e["page"],
                    **({"parts": e["parts"]} if e.get("parts") else {}),
                }
    imp = os.path.join(work, "src", "import.json")
    if os.path.exists(imp):
        known.update(json.load(open(imp, encoding="utf-8")))
    return known


def fetch_only(srcs: list[dict], work: str) -> None:
    """市町村のファイルを <work>/src に取り、resolve の情報を <work>/src/import.json に書く。GitHub Actions から読めないサイトの
    ファイルを別の所（手元など）で取り、ブランチの sanko-src/ に置いて、ワークフローの import_ref で R2 の写しに足すときに使う"""
    d = os.path.join(work, "src")
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, "import.json")
    metas = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    for s in srcs:
        meta = resolve(s)
        dl = archive_path(work, s["code"], meta)
        if not is_archive(dl):
            fetch_archive(meta, dl)
        metas[s["code"]] = meta
        log(f"{s['code']} {s['name']}: {os.path.basename(dl)}（{meta['file']} {meta['modified']}・{os.path.getsize(dl)} バイト）")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(metas, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log(f"{path}: {len(metas)} 市町村")


def mirrored(src: dict) -> bool:
    """GitHub Actions から取れないので、R2 の写し（sanko/src/）から読む市町村（埼玉県・千葉県のサイトと、mirror の付いたもの）"""
    return src["fetch"]["kind"] == "dataeye" or bool(src.get("mirror"))


def archive_path(work: str, code: str, meta: dict) -> str:
    """取ったファイルの置き場所（7z で配られているもの（仙台市）は .7z、ほかは .zip）"""
    ext = ".7z" if str(meta.get("file", "")).lower().endswith(".7z") else ".zip"
    return os.path.join(work, "src", f"{code}-{meta['id']}{ext}")


def is_archive(path: str) -> bool:
    """読めるファイルか（zip か 7z。7z は頭の6バイトで見る）"""
    if not os.path.exists(path):
        return False
    if path.lower().endswith(".7z"):
        with open(path, "rb") as f:
            return f.read(6) == b"7z\xbc\xaf\x27\x1c"
    return zipfile.is_zipfile(path)


def extract_7z(path: str, out: str) -> None:
    """7z を展開する（py7zr があれば使い、無ければ 7z のコマンド。GitHub Actions の Ubuntu には 7z がある）。
    展開先の外を指す名前（「..」・絶対パス）があれば展開しない"""
    try:
        import py7zr
    except ImportError:
        py7zr = None
    if py7zr is not None:
        with py7zr.SevenZipFile(path, "r") as z:
            names = z.getnames()
            if any(".." in n.replace("\\", "/").split("/") or n.startswith("/") for n in names):
                raise RuntimeError(f"{path}: 展開先の外を指す名前があります")
            z.extractall(path=out)
        return
    exe = shutil.which("7z") or shutil.which("7za")
    if not exe:
        raise RuntimeError("7z を展開できません（py7zr も 7z のコマンドもありません）")
    listing = subprocess.run([exe, "l", "-slt", path], check=True, capture_output=True, text=True).stdout
    names = [l[7:] for l in listing.splitlines() if l.startswith("Path = ")][1:]
    if any(".." in n.replace("\\", "/").split("/") or n.startswith("/") for n in names):
        raise RuntimeError(f"{path}: 展開先の外を指す名前があります")
    os.makedirs(out, exist_ok=True)
    subprocess.run([exe, "x", "-y", f"-o{out}", path], check=True, capture_output=True)


def extract(zip_path: str, out: str) -> None:
    """zip を展開する（中の zip も。Shift_JIS・「#U5730」の名前も読む）。7z（仙台市）も展開する"""
    if zip_path.lower().endswith(".7z"):
        extract_7z(zip_path, out)
        return

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


def flatten(root: str) -> None:
    """展開したファイルを全部 root の直下に集める。shapefile の部品（.shp・.dbf・.shx）が別々の zip に分けて置かれている所
    （奈良市の筆界線は .dbf・.shp・.shx と .prj が3つの zip に分かれている）。同じ名前のファイルが2つあれば止める"""
    for d, _, fs in os.walk(root):
        if d == root:
            continue
        for f in fs:
            dst = os.path.join(root, f)
            if os.path.exists(dst):
                raise RuntimeError(f"同じ名前のファイルが2つあります: {f}")
            os.replace(os.path.join(d, f), dst)


def find_all(root: str, pattern: str) -> list[str]:
    """pattern に合うファイル（パスの順）"""
    pat = re.compile(pattern)
    hits = sorted(os.path.join(d, f) for d, _, fs in os.walk(root) for f in fs if pat.search(os.path.join(d, f).replace(os.sep, "/")))
    if not hits:
        raise RuntimeError(f"{pattern} が {root} にありません")
    return hits


def find(root: str, pattern: str) -> str:
    return find_all(root, pattern)[0]


def check_prj(path: str, epsg: int) -> None:
    """shapefile の .prj の測地系が SOURCES の座標系と違えば知らせる（.prj の無いものは見ない）"""
    prj = [f for f in os.listdir(os.path.dirname(path)) if f.lower() == os.path.basename(path)[:-4].lower() + ".prj"]
    if prj:
        t = open(os.path.join(os.path.dirname(path), prj[0]), "rb").read().decode("latin1")
        datum = "JGD2011" if "2011" in t else "JGD2000" if "2000" in t else "Tokyo" if "Tokyo" in t or "Bessel" in t else "?"
        if datum != datum_of(epsg):
            log(f"  ::warning:: {os.path.basename(path)} の .prj は {datum}、SOURCES は {datum_of(epsg)}")


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


def bare_chiban(chiban: str) -> str:
    """法務省の地図の地番の後ろの印（二重地番「10-1W1」・めがね地番「25V2」・分属管理地番「7X(1/2)」。1つの土地が地図の上で
    分かれて描かれたもの。登記の地番には付かない）を外した地番。印を外すと地番の形になるものだけ外す
    （アプリの lib/roadmap/parcel.ts の registryChiban と同じ印）"""
    bare = PIECE_RE.sub("", chiban)
    return bare if bare != chiban and CHIBAN_RE.match(bare) else chiban


def read_moj(paths: list[str]) -> dict:
    """地番区域・地番（全ての筆。切れ端の印は外す）と、公共座標の筆の形（緯度経度）。pub_piece は公共座標の筆が切れ端か"""
    from mojxml.parse import ParseOptions, parse_raw
    from mojxml.reader import iter_content_xmls

    recs = []  # (地番区域の5つ, 地番, 公共座標か)
    pub_geom = []
    pub_idx = []
    pub_piece = []
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
            raw = str(p.get("地番") or "")
            chiban = bare_chiban(raw)
            public = p.get("座標系") != "任意座標系"
            recs.append((parts, chiban, public))
            if public and CHIBAN_RE.match(chiban):
                pub_geom.append(shape(f["geometry"]))
                pub_idx.append(len(recs) - 1)
                pub_piece.append(chiban != raw)
    return {"recs": recs, "pub_geom": pub_geom, "pub_idx": pub_idx, "pub_piece": pub_piece}


# ---- 市町村のデータ ----


def norm_chiban(parts: list[str]) -> str:
    """「４４２－７」「0008」「0193」「0000」→「442-7」「8-193」。数字でなければ空。
    小数の列（奈良市の地番本番「70.0」）は、整数の値なら整数にする"""
    out = []
    for i, s in enumerate(parts):
        if isinstance(s, float) and s.is_integer():
            s = int(s)
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
    nums = [int(x) for x in s.split("-")]
    # 頭の数字が 0（豊中市の道・水路の面の TIBAN「0」）は地番ではない
    if nums[0] == 0:
        return ""
    return "-".join(str(x) for x in nums)


# 地名の旧字体 → 新字体（名前を比べるときだけ。豊田市の図「澤ノ堂」「佛田」と法務省の「沢ノ堂」「仏田」など）
OLD_KANJI = str.maketrans({
    "澤": "沢", "濱": "浜", "邊": "辺", "邉": "辺", "嶋": "島", "冨": "富", "廣": "広", "德": "徳", "國": "国", "櫻": "桜", "瀧": "滝",
    "藏": "蔵", "萬": "万", "澁": "渋", "條": "条", "佛": "仏", "圓": "円", "當": "当", "豐": "豊", "實": "実", "壽": "寿", "惠": "恵",
    "髙": "高", "﨑": "崎", "嵜": "崎", "舊": "旧", "淺": "浅", "鹽": "塩", "龜": "亀", "黑": "黒", "驛": "駅", "峯": "峰",
    # 京都市の図の「西ノ京北壷井町」と法務省の小字「北壺井町」など
    "壺": "壷", "曾": "曽", "檜": "桧", "藪": "薮", "槇": "槙", "莊": "荘", "稻": "稲", "戶": "戸",
    # 形が同じひらがなとカタカナ（法務省の「べボノ木」と豊田市の図の「ベボノ木」）
    "へ": "ヘ", "べ": "ベ", "ぺ": "ペ",
})


def norm_town(s: str) -> str:
    """名前の比べ方（「大字」「字」・空白・丁目の数字の書き方・ケ／ヶの違い・地名の旧字体を無視）"""
    s = unicodedata.normalize("NFKC", s or "").replace(" ", "").replace("　", "").translate(OLD_KANJI)
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


def datum_of(epsg: int) -> str:
    """座標系の測地系（「JGD2011」「JGD2000」「Tokyo」）"""
    if epsg == 30169:
        return "Tokyo"
    from pyproj import CRS

    name = CRS.from_epsg(epsg).datum.name
    return "JGD2011" if "2011" in name else "JGD2000" if "2000" in name else "Tokyo" if "Tokyo" in name else name


def to_m(epsg: int):
    """元の座標系 → 平面直角座標系 IX 系（JGD2011）の m（関東の外の市町村も、計算はこの系の m で行う。位置は変わらない）"""
    if epsg == 6677:
        return None
    if epsg == 30169:
        return Transformer.from_pipeline(TOKYO_PIPELINE)
    return Transformer.from_crs(f"EPSG:{epsg}", "EPSG:6677", always_xy=True)


def reader(path: str, enc: str) -> shapefile.Reader:
    base = path[:-4]
    sib = {os.path.splitext(f)[1].lower(): os.path.join(os.path.dirname(path), f) for f in os.listdir(os.path.dirname(path)) if os.path.splitext(f)[0] == os.path.basename(base)}
    return shapefile.Reader(shp=open(sib[".shp"], "rb"), shx=open(sib[".shx"], "rb") if ".shx" in sib else None, dbf=open(sib[".dbf"], "rb"), encoding=enc, encodingErrors="replace")


class GdbShape:
    """ファイルジオデータベースの図形を、pyshp の図形と同じように扱う（points が空でなく、__geo_interface__ がある）"""

    def __init__(self, geo: dict):
        self.__geo_interface__ = geo
        self.points = [geo["coordinates"]]


def gdb_rows(root: str, spec: dict, epsg: int) -> tuple[list[str], list]:
    """ファイルジオデータベース（.gdb のフォルダ。室蘭市）のレイヤの図形と属性（fiona で読む）。座標系が SOURCES の epsg と違えば知らせる"""
    import fiona
    from pyproj import CRS

    gdb = os.path.dirname(find(root, r"\.gdb/[^/]+\.gdbtable$"))
    with fiona.open(gdb, layer=spec["layer"]) as c:
        if c.crs_wkt and CRS.from_wkt(c.crs_wkt).to_epsg() != epsg:
            log(f"  ::warning:: {spec['layer']} の座標系は EPSG:{CRS.from_wkt(c.crs_wkt).to_epsg()}、SOURCES は {epsg}")
        names = list(c.schema["properties"])
        rows = []
        for f in c:
            g = f.geometry
            shp = GdbShape({"type": g.type, "coordinates": g.coordinates}) if g is not None else None
            rows.append((shp, [f.properties.get(n) for n in names]))
    return names, rows


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


def read_labels_mode(src: dict, root: str) -> tuple[list, list[str], list[str], list[str], list[str]]:
    """筆の面（shp）に地番が無く、地番の文字の点（labels）が別にある所（高崎市）。文字から筆の外へ引出線が引かれているもの（引出線の
    列 id で文字と結び付く）は、引出線の端のうち文字から遠い方の点、引出線の無い文字は文字の点そのものを含む面に、その文字の地番と
    大字を付ける。引出線のある文字の点は、ほとんど（高崎市は 138,630 のうち 138,465）が引出線の先の筆とは別の所（隣の筆・道など）にあるので、
    引出線の先で当てる。
    地番（数字）の文字が2つ以上入る面は、どの地番の筆か決められないので入れない。2つ以上の面に入る点の文字は使わない"""
    sp = src["labels"]
    r = reader(find(root, src["shp"]), src["enc"])
    polys = []
    for shp, _rec in shape_records(r):
        g = None
        if shp is not None and shp.points:
            try:
                g = shape(shp.__geo_interface__)
                g = g if g.is_valid else shapely.make_valid(g)
            except Exception:
                g = None
        polys.append(g if g is not None else shapely.Polygon())
    leads: dict[str, list] = collections.defaultdict(list)
    if sp.get("leaders"):
        er = reader(find(root, sp["leaders"]), src["enc"])
        ie = [f[0] for f in er.fields[1:]].index(sp["id"])
        for shp, rec in shape_records(er):
            if shp is not None and len(shp.points) >= 2:
                leads[str(rec[ie]).strip()].append(shp.points)
    lr = reader(find(root, sp["shp"]), src["enc"])
    names = [f[0] for f in lr.fields[1:]]
    ic = [names.index(c) for c in src["chiban"]]
    ik = names.index(src["key"])
    iid = names.index(sp["id"]) if sp.get("leaders") else None
    targets, labels = [], []
    led = 0
    for shp, rec in shape_records(lr):
        if shp is None or not shp.points:
            continue
        ch = norm_chiban([rec[i] for i in ic])
        if not ch:
            continue  # 道・水路・無番地などの文字
        x, y = shp.points[0][:2]
        ends = [p for line in leads.get(str(rec[iid]).strip(), []) for p in (line[0], line[-1])] if iid is not None else []
        if ends:
            x, y = max(ends, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)[:2]
            led += 1
        targets.append(shapely.Point(x, y))
        labels.append((str(rec[ik]).strip(), ch))
    tree = STRtree(polys)
    ti, pi = tree.query(np.array(targets, dtype=object), predicate="within")
    by_label: dict[int, list[int]] = collections.defaultdict(list)
    for t_, p_ in zip(ti, pi):
        by_label[int(t_)].append(int(p_))
    by_poly: dict[int, list[int]] = collections.defaultdict(list)
    outside = multi_poly = 0
    for t_ in range(len(targets)):
        ps = by_label.get(t_, [])
        if len(ps) == 1:
            by_poly[ps[0]].append(t_)
        elif ps:
            multi_poly += 1
        else:
            outside += 1
    geoms, chibans, keys, onames, koazas = [], [], [], [], []
    table = name_table(root, src.get("names"), src["enc"])
    multi = 0
    for p_, ts in by_poly.items():
        if len(ts) > 1:
            multi += 1
            continue
        key, ch = labels[ts[0]]
        geoms.append(polys[p_])
        chibans.append(ch)
        keys.append(key)
        onames.append(table.get(key, ""))
        koazas.append("")
    log(
        f"  面 {len(polys)}・地番の文字 {len(targets)}（引出線の先で当てた {led}）→ 地番の付いた面 {len(geoms)}"
        f"（地番の文字が2つ以上の面 {multi}・地番の文字の無い面（道・水路など） {len(polys) - len(by_poly)}・面に入らない文字 {outside}・2つ以上の面に入る文字 {multi_poly} は入れない）"
    )
    return geoms, chibans, keys, onames, koazas


def oaza_by_polygon(src: dict, root: str, geoms: list, chibans: list[str], keys: list[str], onames: list[str]) -> None:
    """筆に大字の列が無い所（伊丹市）：大字の境の面（oaza_poly の shapefile。同じ座標系）のうち、筆の中の点を含む面がちょうど1つなら、
    その大字のコードを鍵、名前を大字名にする（keys・onames を書き換える）。含む面が無い・2つ以上の筆は大字が分からないので、地番を消して入れない"""
    sp = src["oaza_poly"]
    r = reader(find(root, sp["shp"]), src["enc"])
    names = [f[0] for f in r.fields[1:]]
    ik, iname = names.index(sp["key"]), names.index(sp["name"])
    polys, codes, name_of = [], [], {}
    for shp, rec in shape_records(r):
        if shp is None or not shp.points:
            continue
        try:
            g = shape(shp.__geo_interface__)
        except Exception:
            continue
        polys.append(g if g.is_valid else shapely.make_valid(g))
        c = str(rec[ik]).strip()
        codes.append(c)
        name_of[c] = str(rec[iname]).strip()
    idx = [i for i, (g, c) in enumerate(zip(geoms, chibans)) if c and g is not None and not g.is_empty]
    pts = [(geoms[i] if geoms[i].is_valid else shapely.make_valid(geoms[i])).representative_point() for i in idx]
    hits: dict[int, set] = collections.defaultdict(set)
    if polys and pts:
        qi, ti = STRtree(polys).query(np.array(pts, dtype=object), predicate="within")
        for a, b in zip(qi, ti):
            hits[int(a)].add(codes[int(b)])
    lost = 0
    for j, i in enumerate(idx):
        h = hits.get(j, set())
        if len(h) == 1:
            c = next(iter(h))
            keys[i], onames[i] = c, name_of[c]
        else:
            chibans[i] = ""
            lost += 1
    log(f"  大字の面 {len(polys)}（{len(name_of)} 大字）で筆の大字を決めた：{len(idx) - lost} 筆（大字の面に入らない・2つ以上に入る筆 {lost} は入れない）")


def shape_records(r):
    """図形と属性を1つずつ。図形が空・壊れたもの（京都市の試作データに、点の無いポリゴンがある。pyshp はそこで止まる）は None"""
    for i in range(len(r)):
        try:
            shp = r.shape(i)
        except Exception:
            shp = None
        yield shp, r.record(i)


def read_muni(src: dict, root: str) -> dict:
    """市町村の筆（元の座標系の形・地番・大字のキー・大字名・小字名）"""
    wardl: list[str] = []  # 区のある市の、筆の区の名前（「南区」。ward_field）
    subs: list[str] = []  # 小字のコード（subkey。小字ごとに地番が付く市の、小字の名前の代わり）
    if "lines" in src or "labels" in src:
        geoms, chibans, keys, onames, koazas = read_lines_mode(src, root) if "lines" in src else read_labels_mode(src, root)
        raw_n = len(geoms)
        wardl = [""] * len(geoms)
        subs = [""] * len(geoms)
    else:
        if src.get("gdb"):
            names, rows = gdb_rows(root, src["gdb"], src["epsg"])
        else:
            # shp_all：同じ形の shapefile がいくつものファイルに分かれている所（宇都宮市の地番図01〜07）は、合うものを全部読む
            paths = find_all(root, src["shp"]) if src.get("shp_all") else [find(root, src["shp"])]
            for path in paths:
                check_prj(path, src["epsg"])
            readers = [reader(p, src["enc"]) for p in paths]
            names = [f[0] for f in readers[0].fields[1:]]
            for p, r in zip(paths[1:], readers[1:]):
                if [f[0] for f in r.fields[1:]] != names:
                    raise RuntimeError(f"{p} の列が {paths[0]} と違います")
            if len(paths) > 1:
                log(f"  shapefile {len(paths)} 個（{', '.join(os.path.relpath(p, root) for p in paths)}）")
            rows = (row for r in readers for row in shape_records(r))
        table = name_table(root, src.get("names"), src["enc"])
        pad = (src.get("names") or {}).get("pad", 0)
        # 大字名に小字名がつながった名前（豊田市の町字名「福受町下ノ切」）を、大字の名前の一覧（大字界の shapefile）の一番長く合う頭で、
        # 大字（鍵・大字名）と小字に分ける
        prefixes: list[str] = []
        if src.get("split_name"):
            sp = src["split_name"]
            rn = reader(find(root, sp["shp"]), src["enc"])
            i_name = [f[0] for f in rn.fields[1:]].index(sp["field"])
            prefixes = sorted({str(rec[i_name]).strip() for rec in rn.iterRecords() if str(rec[i_name]).strip()}, key=len, reverse=True)
        geoms, chibans, keys, onames, koazas = [], [], [], [], []
        raw_n = 0
        for shp, raw in rows:
            raw_n += 1
            rec = dict(zip(names, raw))
            if "split" in src:
                m = re.match(src["split"]["re"], str(rec[src["split"]["field"]]))
                if not m:
                    continue
                key, ch = m.group(1), norm_chiban([m.group(2)])
            else:
                if src.get("oaza_poly"):
                    key = ""  # 大字の面（oaza_poly）で、あとで決める
                else:
                    key = "_".join(str(rec[c]).strip() for c in src["key"]) if isinstance(src["key"], list) else str(rec[src["key"]]).strip()
                ch = norm_chiban([rec[c] for c in src["chiban"]])
            # 地番の面だけ（長岡京市の「長狭物区分」：道路・水路などの面にも 96666 のような番号が付いている）
            if src.get("only") and str(rec[src["only"]["field"]]).strip() not in src["only"]["values"]:
                ch = ""
            # 地番ではない決まった番号（高島市の 8888・9999、直方市の 99999-◯：道・水路などの面に付く）
            if ch and src.get("drop_lots") and re.fullmatch(src["drop_lots"], ch.split("-")[0]):
                ch = ""
            # 区の名前（番号で書かれた所は ward_names で名前にする。仙台市の KU「1」→「青葉区」）
            w = str(rec[src["ward_field"]]).strip() if src.get("ward_field") else ""
            wardl.append(src.get("ward_names", {}).get(w, w))
            subs.append(str(rec[src["subkey"]]).strip() if src.get("subkey") else "")
            if not ch or shp is None or not shp.points:
                chibans.append("")
                geoms.append(None)
                keys.append(key)
                onames.append("")
                koazas.append("")
                continue
            try:
                g = shape(shp.__geo_interface__)
            except Exception:
                g = None
            geoms.append(g)
            chibans.append(ch)
            nm = str(rec[src["oname"]]).strip() if src.get("oname") else table.get(key.zfill(pad), "")
            koaza = str(rec[src["koaza"]]).strip() if src.get("koaza") else ""
            if prefixes:
                head = next((p for p in prefixes if key.startswith(p)), "")
                rest = key[len(head):] if head else ""
                # 残りが「６丁目」だけなら小字ではなく丁目なので、町の名前（鍵・大字名）に残す。大字だけにすると、
                # 丁目ごとに付く地番（新生町１丁目の 1-1 と６丁目の 1-1）がまとまり、ほかの丁目の地番区域が付く
                if head and not CHOME_ONLY.fullmatch(unicodedata.normalize("NFKC", rest).strip()):
                    key, nm, koaza = head, head, rest
            # 「坪沼字原前」（大字名＋「字」＋小字名。仙台市）を大字と小字に分ける
            if src.get("split_aza") and "字" in nm[1:]:
                j = nm.index("字", 1)
                nm, koaza = nm[:j], nm[j + 1 :]
            keys.append(key)
            onames.append(nm)
            koazas.append(koaza)
        if src.get("oaza_poly"):
            oaza_by_polygon(src, root, geoms, chibans, keys, onames)
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
        "ward": [wardl[i] for i in keep],
        "sub": [subs[i] for i in keep],
    }


def poly_parts(g) -> list:
    """図形の面（Polygon）を全部取り出す。make_valid が返す GeometryCollection の中の MultiPolygon などの入れ子も開き、
    線・点・空の面は除く（書き出すときに残るのは面だけなので、線で離れた面がつながって見えないように）"""
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [p for x in getattr(g, "geoms", []) for p in poly_parts(x)]


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


def near_groups(gs: list, gap: float) -> list[list[int]]:
    """図形を、gap（m）より離れていないもののつながりに分ける（番号の一覧の一覧。大きい順）"""
    parent = list(range(len(gs)))

    def root_of(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    if len(gs) > 1:
        qa, qb = STRtree(gs).query(gs, predicate="dwithin", distance=gap)
        for a, b in zip(qa, qb):
            parent[root_of(int(a))] = root_of(int(b))
    out: dict[int, list[int]] = collections.defaultdict(list)
    for a in range(len(gs)):
        out[root_of(a)].append(a)
    return sorted(out.values(), key=len, reverse=True)


def build_one(src: dict, work: str, year: str | None, align: bool, keep_public: bool, drop_unmapped: bool, known: dict, fo) -> dict:
    code = src["code"]
    t0 = time.time()
    meta = resolve(src, known)
    dl = archive_path(work, code, meta)
    os.makedirs(os.path.dirname(dl), exist_ok=True)
    if not is_archive(dl):
        fetch_archive(meta, dl)
    root = os.path.join(work, "src", f"{code}-{meta['id']}")
    if not os.path.isdir(root):
        extract(dl, root + ".tmp")
        if src.get("flatten"):
            flatten(root + ".tmp")
        os.replace(root + ".tmp", root)
    muni = read_muni(src, root)
    n = len(muni["geom"])
    log(f"{code} {src['name']}: 筆 {muni['raw']} → 地番が数字の筆 {n}（{meta['file']} {meta['modified']}）")

    # 区のある市（熊本市）は、区ごとの法務省の地図XMLを合わせて読む（wards：区の市区町村コード）
    paths, moj_year = [], None
    for c in src.get("wards") or [code]:
        try:
            p, moj_year = moj_zips(c, year, work)
        except RuntimeError as e:
            # 地図XMLの無い区（浜松市天竜区）は飛ばす（区のある市で、ほかの区があれば作る）
            if not src.get("wards"):
                raise
            log(f"  ::warning:: {e}（この区は飛ばします）")
            continue
        paths += p
    if not paths:
        raise RuntimeError(f"{code} の地図XMLが見つかりません")
    moj = read_moj(paths)
    recs = moj["recs"]
    if src.get("wards"):
        cities = {r[0][0] for r in recs}
        city = src["name"]
    else:
        city = collections.Counter(r[0][0] for r in recs).most_common(1)[0][0]
        cities = {city}
    # 法務省の町（市区町村名・大字名・丁目名）ごとの地番 → 地番区域
    town_ch: dict[tuple, dict[str, collections.Counter]] = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    town_kuiki: dict[tuple, collections.Counter] = collections.defaultdict(collections.Counter)
    inv: dict[str, set] = collections.defaultdict(set)
    for parts, ch, _pub in recs:
        if not CHIBAN_RE.match(ch) or parts[0] not in cities:
            continue
        t = (parts[0], parts[1], parts[2])
        town_ch[t][ch][parts] += 1
        town_kuiki[t][parts] += 1
        inv[ch].add(t)
    # 法務省の地番区域（小字まで）ごとの地番
    kuiki_ch: dict[tuple, set] = collections.defaultdict(set)
    for parts, ch, _pub in recs:
        if CHIBAN_RE.match(ch) and parts[0] in cities:
            kuiki_ch[parts].add(ch)
    town_by_name: dict[str, list] = collections.defaultdict(list)
    # 括弧を除いた名前 → 町（京都市の同じ区の同じ名前の町は、法務省では通り名を括弧で付けて分ける）
    town_by_base: dict[str, list] = collections.defaultdict(list)
    for t in town_ch:
        town_by_name[norm_town(t[1] + t[2])].append(t)
        town_by_base[re.sub(r"\(.*?\)", "", norm_town(t[1] + t[2]))].append(t)
    log(f"  {code} 法務省 {moj_year}: 筆 {len(recs)}（公共座標 {len(moj['pub_geom'])}）・町 {len(town_ch)}")

    # 1. 公共座標の筆と重ねる（内側の点がその筆に入り、地番が同じ）
    pts_m = shapely.point_on_surface(np.array(muni["geom"], dtype=object))
    pub_m = [shapely.transform(g, lambda xy: np.column_stack(TO_M.transform(xy[:, 0], xy[:, 1]))) for g in moj["pub_geom"]]
    tree = STRtree(pub_m) if pub_m else None
    votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    kvotes: dict[tuple, collections.Counter] = collections.defaultdict(collections.Counter)  # 小字のコードごと：地番区域（小字まで）
    pairs = []
    if tree is not None:
        mi, pj = tree.query(pts_m, predicate="within")
        for i, j in zip(mi, pj):
            parts, ch, _ = recs[moj["pub_idx"][j]]
            if ch == muni["chiban"][i]:
                votes[muni["key"][i]][(parts[0], parts[1], parts[2])] += 1
                if muni["sub"][i]:
                    kvotes[(muni["key"][i], muni["sub"][i])][parts] += 1
                # 切れ端（筆の一部）は重心が筆と違うので、平行移動の量を測る組には入れない
                if not moj["pub_piece"][j]:
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
    # 同じ区に、法務省では括弧の付いた同じ名前の町が2つ以上ある大字（京都市の「鍛冶屋町（西洞院通正面）」と「鍛冶屋町（堺町通万寿寺）」。
    # 市町村の図は括弧なしの「鍛冶屋町」）：離れた区画のまとまりごとに、地番の集まりで町を決める（paren_pick：筆の番号 → 町）
    paren_multi: dict[str, list] = {}
    paren_pick: dict[int, tuple] = {}
    methods = collections.Counter()
    for k, idx in by_key.items():
        A = {muni["chiban"][i] for i in idx}
        # 区のある市は、市町村の図に書かれた区の町だけから選ぶ（同じ名前の町がほかの区にある。前は、名前が1つだけ合う別の区の町に当てていた）
        ward = collections.Counter(muni["ward"][i] for i in idx).most_common(1)[0][0] if muni.get("ward") else ""
        in_ward = (lambda t: t[0].endswith(ward)) if ward else (lambda t: True)
        cnt = collections.Counter()
        for c in A:
            for t in inv.get(c, ()):
                if in_ward(t):
                    cnt[t] += 1
        score = {t: v / len(A) for t, v in cnt.items()}
        # 同じ割合の町は町の名前の順に並べる（A は集合で、Python の集合の順は作るたびに変わる。同じデータから毎回同じ参考図を作る）
        ranked = sorted(score, key=lambda t: (-score[t], t))
        # 地番の集まりの重なり（Jaccard）。小さな町の地番（1〜数百）は大きな町にもあるので、含まれる割合だけでは決まらないことがある
        jac = {t: v / (len(A) + len(town_ch[t]) - v) for t, v in cnt.items()}
        jr = sorted(jac, key=lambda t: (-jac[t], t))
        nm = collections.Counter(muni["name"][i] for i in idx).most_common(1)[0][0]
        named = [t for t in town_by_name.get(norm_town(nm), []) if in_ward(t)] if nm else []
        # 括弧を除くと同じ名前になる、同じ区の町（京都市の「下丸屋町（小川通竹屋町）」「下丸屋町（河原町通二条）」、括弧なしの「上之町」と「上之町（大宮通木津屋橋）」）
        pn = [t for t in town_by_base.get(norm_town(nm), []) if in_ward(t)] if nm else []
        if not named and len(pn) == 1:
            named = pn
        if len(pn) > 1:
            # 市町村の図では同じ名前の町の筆が1つの名前にまとまっている。離れた区画のまとまり（PAREN_GAP_M より離れていない筆のつながり）ごとに、
            # 地番が法務省のどの町の地番の集まりに入っているかで町を決める（京都市は同じ名前の町どうしで地番がほとんど重ならない）。
            # 決めきれないまとまり（一番合う町が 6 割未満か、二番目が一番の半分より多い）の筆は入れない
            paren_multi[k] = pn
            for grp in near_groups([muni["geom"][i] for i in idx], PAREN_GAP_M):
                lots = [muni["chiban"][idx[a]] for a in grp]
                sc = sorted(((sum(1 for c in lots if c in town_ch[t2]) / len(lots), t2) for t2 in pn), key=lambda x: -x[0])
                if sc[0][0] >= 0.6 and sc[1][0] <= sc[0][0] / 2:
                    for a in grp:
                        paren_pick[idx[a]] = sc[0][1]
                    methods["paren"] += len(grp)
                else:
                    methods["paren_undecided"] += len(grp)
            continue
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
            # 地番がこの町に無い筆も、ほかの町には付け替えない（下の「筆ごとの地番区域」）
            decide[k] = choice

    # 小字ごとに地番が付く所（長岡京市：同じ大字の別々の小字に同じ地番がある）は、市町村の小字のコード（subkey）ごとに、
    # 法務省の地番区域（小字まで）を決める：公共座標の筆と同じ地番で重なればその地番区域、無ければ地番の集まりが一番重なる
    # 地番区域（小字の地番の半分以上が入り、2番目の2倍以上）。決まらない小字の筆は、下の「同じ地番が別々の小字にある」で外れる
    sub_pick: dict[tuple, tuple] = {}
    sub_methods = collections.Counter()
    by_sub: dict[tuple, list[int]] = collections.defaultdict(list)
    for i, (k, s) in enumerate(zip(muni["key"], muni["sub"])):
        if s:
            by_sub[(k, s)].append(i)
    for (k, s), idx in by_sub.items():
        t = decide.get(k)
        if not t:
            continue
        v = kvotes.get((k, s))
        if v and sum(v.values()) >= 3 and v.most_common(1)[0][1] / sum(v.values()) >= 0.6:
            sub_pick[(k, s)] = v.most_common(1)[0][0]
            sub_methods["spatial"] += len(idx)
            continue
        A = {muni["chiban"][i] for i in idx}
        sc = sorted(((len(A & kuiki_ch[K]), K) for K in town_kuiki[t]), key=lambda x: -x[0])
        if sc and sc[0][0] > 0 and sc[0][0] >= 0.5 * len(A) and sc[0][0] >= 2 * (sc[1][0] if len(sc) > 1 else 0):
            sub_pick[(k, s)] = sc[0][1]
            sub_methods["chiban"] += len(idx)
        else:
            sub_methods["none"] += len(idx)
    if by_sub:
        log(f"  {code} 小字のコード {len(by_sub)} のうち地番区域が決まった {len(sub_pick)}（筆：{dict(sub_methods)}）")

    # 町名が、法務省の「大字＋小字」をつないだ形の市（京都市の試作データ「東野中井ノ上町」、法務省は大字「東野」＋小字「中井ノ上町」）は、
    # つないだ名前で法務省の地番区域（小字まで）を引く（区のある市は同じ区のもの。地番の重なりが3割以上か、地番が3つ未満）
    full_kuiki: dict[str, list] = collections.defaultdict(list)
    for K in kuiki_ch:
        if K[3]:
            full_kuiki[norm_town(K[1] + K[2] + K[3])].append(K)
    key_pick: dict[str, tuple] = {}
    for k, idx in by_key.items():
        if any(muni["koaza"][i] for i in idx) or any(muni["sub"][i] for i in idx):
            continue
        nm = collections.Counter(muni["name"][i] for i in idx).most_common(1)[0][0]
        cands = full_kuiki.get(norm_town(nm), []) if nm else []
        ward = collections.Counter(muni["ward"][i] for i in idx).most_common(1)[0][0]
        if ward:
            cands = [K for K in cands if K[0].endswith(ward)]
        if len(cands) != 1:
            continue
        A = {muni["chiban"][i] for i in idx}
        if len(A) < 3 or len(A & kuiki_ch[cands[0]]) >= 0.3 * len(A):
            key_pick[k] = cands[0]
    if key_pick:
        log(f"  {code} 大字＋小字の名前で地番区域が決まった町 {len(key_pick)}（筆 {sum(len(by_key[k]) for k in key_pick)}）")
    if paren_multi:
        log(
            f"  {code} 同じ区に同じ名前の町がある名前 {len(paren_multi)}：離れた区画のまとまりごとに町を決めた筆 {methods['paren']}"
            f"・決められず入れない筆 {methods['paren_undecided']}"
        )

    # 小字ごとに地番が付く町（法務省のデータで、同じ地番が別々の小字にある地番が 2% 以上）。小字の分からない筆に、町までの地番区域を付けない
    per_koaza = {t for t, chs in town_ch.items() if sum(1 for cn in chs.values() if len(cn) > 1) >= 0.02 * len(chs)}

    # 筆ごとの地番区域
    covered = np.zeros(n, dtype=bool)
    if tree is not None and not keep_public:
        mi, _ = tree.query(pts_m, predicate="within")
        covered[np.unique(mi)] = True
    groups: dict[tuple, list] = collections.defaultdict(list)
    stats = collections.Counter()
    amb_town: collections.Counter = collections.Counter()  # 小字が決まらない筆の多い町（確かめ用の記録）
    appended: dict[str, str] = {}  # 市町村の図の小字を足した地番区域 → 足す前（法務省の地番区域）
    amb_ex: dict[str, list] = collections.defaultdict(list)
    for i in range(n):
        if covered[i]:
            stats["public"] += 1
            continue
        k, ch = muni["key"][i], muni["chiban"][i]
        t = decide.get(k)
        if k in paren_multi:
            t = paren_pick.get(i)
            if t is None:
                # どの町の筆か決められないまとまり（上の paren_multi）なので入れない
                stats["ambiguous"] += 1
                continue
        kuiki = None
        K = key_pick.get(k) or sub_pick.get((k, muni["sub"][i]))
        if K is not None:
            t = t or (K[0], K[1], K[2])
        if t:
            if K is not None:
                kuiki = "_".join(K)
                stats["exists"] += ch in kuiki_ch[K]
            else:
                # 地番が法務省のこの町に無い筆も、この町のまま（前は、地番の集まりがよく合うほかの町（上位3つ）のうち、その地番が
                # 1つの町にだけあればその町に付け替えていた。国土地理院の逆ジオコーダで筆の場所の町を調べると、付け替えた筆は
                # 伊丹市 22・豊中市 124・直方市 192・豊田市 85・京都市 105、高島市・加古川市・福山市の抜き出し各 150（合わせて 978）のうち、
                # 付け替えた先の町にあったのは2つだけで、ほとんどが元の町にあった。法務省の地図データに無い地番は、その町の地番の抜けで、ほかの町の筆ではない）
                koaza = norm_town(muni["koaza"][i]) if muni["koaza"][i] else ""
                # 市町村の図の小字が法務省のこの町にある（その小字に、この地番が無くても）
                kz_town = [p for p in town_kuiki[t] if koaza and norm_town(p[3]) == koaza]
                if ch in town_ch[t]:
                    cands = town_ch[t][ch]
                    pick = [p for p in cands if koaza and norm_town(p[3]) == koaza]
                    if pick:
                        kuiki = "_".join(pick[0])
                    elif kz_town:
                        # 小字は合うが、法務省ではその小字にこの地番が無い（別の小字にある）：市町村の図の小字を信じる
                        kuiki = "_".join(kz_town[0])
                    elif len(cands) == 1:
                        kuiki = "_".join(next(iter(cands)))
                    else:
                        # 法務省のこの町では、別々の小字（地番区域）に同じ地番がある（小字ごとに地番が付く所）。
                        # 市町村の図に小字が無く、どの小字の筆か決められないので入れない（前は一番多い小字を付けていて、違う土地に同じ地番区域が付いた）
                        stats["ambiguous"] += 1
                        amb_town[t[1] + t[2]] += 1
                        if len(amb_ex[t[1] + t[2]]) < 2:
                            amb_ex[t[1] + t[2]].append(f"{muni['koaza'][i] or '（小字なし）'} {ch} → {'・'.join(sorted({p[3] or '（なし）' for p in cands}))}")
                        continue
                    stats["exists"] += bool(pick) or (not kz_town and len(cands) == 1)
                else:
                    cands = town_kuiki[t]
                    if kz_town:
                        kuiki = "_".join(kz_town[0])
                    elif len({p[3:] for p in cands}) <= 1:
                        kuiki = "_".join(cands.most_common(1)[0][0])
                    elif t in per_koaza:
                        # 小字ごとに地番が付く町で、法務省に無い地番・小字が分からない：どの小字の筆か決められないので入れない
                        stats["ambiguous"] += 1
                        amb_town[t[1] + t[2]] += 1
                        if len(amb_ex[t[1] + t[2]]) < 2:
                            amb_ex[t[1] + t[2]].append(f"{muni['koaza'][i] or '（小字なし）'} {ch} → 法務省のこの町に無い地番")
                        continue
                    else:
                        # 法務省のこの町に無い地番で、小字が分からない（地番は町ごとに付く）：小字を書かずに、町（大字・丁目）までの地番区域にする
                        kuiki = f"{t[0]}_{t[1]}_{t[2]}__"
                # 法務省の地番区域に小字が無く（「豊田市_深見町___」）、市町村の図の小字（「深見町木戸」の木戸）が法務省のこの町の小字に無い：
                # 小字を地番区域に残す（keep_koaza の市だけ。法務省のこの町にある小字なら、上で法務省の地番区域に当てている）。国土地理院の町名は
                # 小字まで付く（「深見町木戸」）ことがあり、大字だけの地番区域では住所の町と照らし合わせられない（小字を残すと、大字でも小字まででも当たる）。
                # 小字の欄に町の名前ごと入る市（福山市の「加茂町字北山」「坪生町六丁目」）があるので、数字だけ・大字の名前を含む・丁目を含む小字は残さない
                kp = kuiki.split("_")
                kz = re.sub(r"\s", "", unicodedata.normalize("NFKC", muni["koaza"][i])).removeprefix("字") if koaza else ""
                if (
                    src.get("keep_koaza")
                    and kz
                    and not kz_town
                    and len(kp) == 5
                    and not kp[2]
                    and not kp[3]
                    and not re.fullmatch(r"[0-9\-ー・.]+", kz)
                    and kp[1] not in kz
                    and "丁目" not in kz
                ):
                    kp[3] = kz
                    kuiki = "_".join(kp)
                    appended[kuiki] = "_".join(kp[:3] + ["", kp[4]])
                    stats["koaza_kept"] += 1
            stats["mapped"] += 1
        else:
            if drop_unmapped or src.get("drop_unmapped"):
                stats["dropped_unmapped"] += 1
                continue
            nm = unicodedata.normalize("NFKC", muni["name"][i]).replace(" ", "") if muni["name"][i] else ""
            if not nm:
                # 町の名前が分からない筆（地番区域が市の名前だけになり、住所の町と照らし合わせられない）は入れない
                stats["dropped_noname"] += 1
                continue
            nm = re.sub(r"(\d+)丁目", lambda m: chr(0xFF10 + int(m.group(1))) + "丁目" if len(m.group(1)) == 1 else m.group(0), nm)
            m = re.match(r"^(.*?)([０-９\d]+丁目)$", nm)
            # 区のある市は、筆の区の名前を付ける（「熊本市南区」。区が分からなければ入れない）
            cty = f"{city}{muni['ward'][i]}" if src.get("wards") else city
            if src.get("wards") and not muni["ward"][i]:
                stats["dropped_unmapped"] += 1
                continue
            # 小字の名前があれば地番区域に入れる（小字ごとに地番が付く所で、別の小字の同じ地番とまとめない）
            kz = re.sub(r"\s", "", unicodedata.normalize("NFKC", muni["koaza"][i])) if muni["koaza"][i] else ""
            kuiki = f"{cty}_{m.group(1)}_{m.group(2)}_{kz}_" if m else f"{cty}_{nm}__{kz}_"
        # 法務省の町に対応しない筆は、市町村の大字ごとに分けておく（別の大字の同じ地番をまとめない）
        groups[(kuiki, ch, "" if t else k)].append(i)
        stats["kept"] += 1

    if amb_town:
        log(f"  {code} 小字が決まらない筆の多い町：" + "、".join(f"{tn} {c}（{' / '.join(amb_ex[tn])}）" for tn, c in amb_town.most_common(6)))
    # 同じ地番区域・地番の筆が、SPLIT_GAP_M より離れた2か所以上にあるもの（評価分割の切れ端ではなく、違う土地に同じ地番を
    # 付けたおそれ。小字ごとに地番が付く所で小字が分からない・市町村の図の地番の誤りなど）は、どれが正しいか決められないので入れない。
    # 1つの筆の図形が離れた2か所以上の面でできているもの（伊丹市の昆陽南３丁目 20-1 の 11m² と 約270m 先の 3m² など）も同じに扱う
    split_dropped, split_examples = 0, []
    # 小字を足した地番区域は、足す前の地番区域（法務省の地番区域。地番はその中で1つ）でまとめて確かめる
    by_base: dict[tuple, list] = collections.defaultdict(list)
    for gk in groups:
        by_base[(appended.get(gk[0], gk[0]),) + gk[1:]].append(gk)
    for gks in by_base.values():
        idx_all = [i for gk in gks for i in groups[gk]]
        gs = [p for i in idx_all for p in poly_parts(muni["geom"][i])]
        if len(gs) < 2:
            continue
        parent = list(range(len(gs)))

        def root_of(a: int) -> int:
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        qa, qb = STRtree(gs).query(gs, predicate="dwithin", distance=SPLIT_GAP_M)
        for a, b in zip(qa, qb):
            parent[root_of(int(a))] = root_of(int(b))
        if len({root_of(a) for a in range(len(gs))}) > 1:
            split_dropped += len(idx_all)
            if len(split_examples) < 5:
                split_examples.append(f"{gks[0][0]} {gks[0][1]}（{len(idx_all)}筆）")
            for gk in gks:
                del groups[gk]
    if split_dropped:
        log(f"  {code} 同じ地番区域・地番が {SPLIT_GAP_M:.0f}m より離れた2か所以上にある筆 {split_dropped} を入れない（例：{'、'.join(split_examples)}）")

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
    moj_kuiki = {"_".join(parts) for parts, _ch, _pub in recs if parts[0] in cities}
    out_kuiki = {g[0] for g in groups}
    res = {
        "name": src["name"],
        "credit": src["credit"],
        "license": src["license"],
        "terms": src.get("terms") or meta.get("terms") or "",
        "portal_license": meta.get("license", ""),
        "page": meta["page"],
        "id": meta["id"],
        "url": meta["url"],
        "file": meta["file"],
        "modified": meta["modified"],
        "size": meta["size"],
        **({"parts": meta["parts"]} if meta.get("parts") else {}),
        "date": src["date"],
        "moj_year": moj_year,
        "parcels_raw": muni["raw"],
        "parcels_numbered": n,
        "public_overlap_dropped": stats["public"],
        # 入れなかった筆：同じ町の別々の小字に同じ地番があり小字が決まらない・町の名前が無い・同じ地番が離れた2か所以上
        "ambiguous_dropped": stats["ambiguous"],
        "noname_dropped": stats["dropped_noname"],
        "split_dropped": split_dropped,
        "kept": kept,
        "features": written,
        "mapped": round(stats["mapped"] / kept, 4) if kept else 0,
        "exists": round(stats["exists"] / kept, 4) if kept else 0,
        "kuiki_distinct": len(out_kuiki),
        "kuiki_in_moj": round(len(out_kuiki & moj_kuiki) / len(out_kuiki), 4) if out_kuiki else 0,
        "methods": dict(methods),
        **({"sub_methods": dict(sub_methods)} if by_sub else {}),
        "pairs": len(pairs),
        "shift_m": [round(shift[0], 2), round(shift[1], 2)],
        "residual_m": [None if resid_before is None else round(resid_before, 2), None if resid_after is None else round(resid_after, 2)],
        "seconds": round(time.time() - t0),
    }
    log(
        f"  {code} → 筆 {kept}（公共座標の所 {stats['public']} を除く）・地番区域が法務省の町に対応 {res['mapped']:.1%}・"
        f"地番区域 {len(out_kuiki)} 種のうち法務省にある {res['kuiki_in_moj']:.1%}・"
        f"地番区域と地番が法務省にある {res['exists']:.1%}・平行移動 {res['shift_m']}m（同じ地番の筆 {len(pairs)}、ずれの中央値 {res['residual_m']}m）・"
        f"入れない筆：小字が決まらない {stats['ambiguous']}・町名なし {stats['dropped_noname']}・離れた同じ地番 {split_dropped}"
        + (f"・市の図の小字を地番区域に残した筆 {stats['koaza_kept']}" if stats["koaza_kept"] else "")
    )
    return res


# ---- 更新の確かめ ----


def check(source_path: str) -> bool:
    current = json.load(open(source_path, encoding="utf-8")).get("sources", {}) if os.path.exists(source_path) else {}
    changed = False
    latest: dict[str, str] = {}  # 市町村名 → いま使っているファイルの更新日
    blocked = False
    for src in SOURCES:
        try:
            meta = resolve(src)
        except Exception as e:
            blocked |= isinstance(e, urllib.error.HTTPError) and e.code == 403
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
    if blocked:
        log(
            "::notice::読めない（403）サイトがありました。埼玉県・千葉県のオープンデータサイトは GitHub Actions から読めないので、"
            "新しいファイルが出たかは別の所で確かめ、build.py --fetch-only で取ってワークフローの import_ref で足します"
        )
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")
    log("更新あり" if changed else "更新なし")
    return changed


def run_one(src: dict, part: str, *opts) -> dict:
    try:
        with open(part, "w", encoding="utf-8") as fo:
            return build_one(src, *opts, fo)
    except Exception as e:
        # urllib の HTTPError などはプロセスの間で受け渡せない（pickle できない）ので、ここでログに出して文字だけ返す
        log(traceback.format_exc())
        raise RuntimeError(f"{type(e).__name__}: {e}") from None


def license_families(lics: list[str]) -> str:
    """地図の出典に書くライセンスの種類（「PDL1.0／CC BY 4.0／CC BY 2.1 JP」。版の書かれていない CC BY は「CC BY」）"""
    fam = []
    if any("公共データ利用規約" in s or "PDL" in s for s in lics):
        fam.append("PDL1.0")
    if any("4.0" in s for s in lics):
        fam.append("CC BY 4.0")
    if any("2.1" in s for s in lics):
        fam.append("CC BY 2.1 JP")
    if any(s.startswith("CC BY") and not re.search(r"\d\.\d", s.split("（")[0]) for s in lics):
        fam.append("CC BY")
    return "／".join(fam)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="公開ファイルが新しくなったかだけ調べる（GITHUB_OUTPUT があれば changed= を書く）")
    ap.add_argument(
        "--source", default="lib/roadmap/data/sanko-source.json",
        help="前に作ったときの情報（--manifest で書いたもの）。--check で比べ、公開サイトに届かない市町村はここにあるファイルを使う",
    )
    ap.add_argument(
        "--fetch-only", action="store_true",
        help="市町村のファイルを --work に取り、情報を <work>/src/import.json に書くだけ（--only が無ければ、GitHub Actions から読めない埼玉県・千葉県のサイトのもの）",
    )
    ap.add_argument("--mirror-list", help="使った埼玉県・千葉県のサイトのファイル（<work>/src の zip の名前）を書き出す（ワークフローが R2 に写しを置く）")
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
    if a.fetch_only:
        if not a.work:
            sys.exit("--work を指定してください")
        fetch_only([s for s in SOURCES if (s["code"] in a.only if a.only else mirrored(s))], a.work)
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
    opts = (work, a.moj_year, not a.no_align, a.keep_public, a.drop_unmapped, known_files(a.source, work))
    done: dict[str, dict] = {}
    with cf.ProcessPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        futs = {ex.submit(run_one, s, os.path.join(parts_dir, f"{s['code']}.geojsonl"), *opts): s for s in srcs}
        for fut in cf.as_completed(futs):
            s = futs[fut]
            try:
                done[s["code"]] = fut.result()
            except Exception as e:  # 1つの市町村が読めなくても、ほかは作る（くわしいことは run_one がログに出している）
                log(f"::warning::{s['code']} {s['name']}: {e}")
    results = {s["code"]: done[s["code"]] for s in srcs if s["code"] in done}
    if a.mirror_list:
        portal = {s["code"] for s in SOURCES if mirrored(s)}
        with open(a.mirror_list, "w", encoding="utf-8") as f:
            f.writelines(f"{os.path.basename(archive_path(work, c, r))}\n" for c, r in results.items() if c in portal)
    with open(seq, "w", encoding="utf-8") as fo:
        for c in results:
            with open(os.path.join(parts_dir, f"{c}.geojsonl"), encoding="utf-8") as fi:
                shutil.copyfileobj(fi, fo, 1 << 20)
    if not results:
        sys.exit("1つも作れませんでした")
    credits = "、".join(results[c]["credit"] for c in results)
    attribution = f"出典：{credits}（いずれも市町村のオープンデータ。{license_families([results[c]['license'] for c in results])}）を MICHILU が加工して作成。課税用の参考図で、登記の地番・筆の形と違うことがある"
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
