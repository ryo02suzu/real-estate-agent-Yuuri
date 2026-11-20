# PC のオープニング CG（作る道具）

PC 版（横幅 1024px 以上）で、アプリを開いたときに流すオープニング映像を、Blender で作る道具。スマホの画面には使わない。
いまは **粗い下書き（カメラの動きと長さだけを見る動画）** と、**本番の色と質感の試し**（雲海と朝日の 1 コマ、
真上から見た日本＝PC のホームの背景の見本）の段階で、アプリにはまだ組み込んでいない。

## 流れ（約13.5秒・30コマ/秒）

| 秒 | 映すもの | 場面 |
|---|---|---|
| 0〜0.6 | 夜明けの海を、九州の南西の高い空から北東へ見る | global |
| 0.6〜3.6 | 列島が海から現れる（実際の標高・海底のデータを沈めておき、持ち上げる。高い山から順に島として出る） | global |
| 3.6〜5.1 | 列島を見渡して、北アルプスへ降りる | global |
| 5.1〜5.95 | 雲を抜ける（画面が白いうちに、上高地の場面へ切り替える） | |
| 5.95〜10.3 | 鷹の視点：奥穂高と前穂高の間の稜線（吊尾根）をかすめ、岳沢を降り、上高地の谷底で左へ大きく弧を描き、明神から東の稜線より高く上がる | local |
| 10.3〜12.35 | 東に雲海と朝日。ロゴを重ねる（ロゴはアプリが動画の上に描く予定。動画には入れない） | local |
| 12.35〜13.5 | 雲海を見下ろして上がり、雲の白さの中で、真上から見た日本列島へ（PC のホームの地図へつなぐ） | top |

時間割・通る所・向きは `path.py` に1か所でまとめている。上高地の場面は、通過点を決めると、地面からの高さの目安を保つように
高さを自動で決める（山の手前で先に上がる。左右 100m の地面も見る）。

## 作り方

必要なもの：Python 3.13・numpy・Pillow・FFmpeg、Blender 5.3 を Python から使う版（`pip install bpy==5.3.0`。GPU は要らない）

```bash
python3 fetch.py                 # 標高のタイルを取ってきて、work/ につなぎ合わせる（2回目からはタイルを読み直さない）
python3 path.py                  # カメラの速さ・向きの変わる速さ・地面からの高さを 0.1 秒ごとに出す（確かめる用）
python animatic.py global        # 列島の場面のコマを描く（python は bpy を入れたもの）。local・top も同じ
python3 assemble.py animatic --labels --logo ロゴの画像.webp   # 1本の動画に（work/animatic.mp4）

# 本番の色と質感の試し
python3 fetch.py near_photo && python3 photo.py near_photo
python final.py local --frames 345 --res 1920x1080 --spp 96   # 雲海と朝日の 1 コマ（この作業場所で約 26 分）
python3 fetch.py lndst modis dem8 && python3 home_prep.py
python home.py --view 1440x900                                 # 真上から見た日本（約 1.5 分）
python3 fetch.py dem8w modisw && python3 home_prep.py --wide
python home.py --extent                                        # PC のホームの背景（広い版。四隅は home_wide.json。約 6 分）
```

`animatic.py` は `--res 640x360 --spp 8`（大きさ・1画素あたりの光の数）、`--frames 0-168`、`--every 30`（間引いて試す）を選べる。
描いたコマがある所は描き直さない（途中で止まっても、続きから描ける）。

| ファイル | 中身 |
|---|---|
| `geo.py` | タイルの番号、標高の読み方、地球の丸みを入れた座標（東・北・上） |
| `fetch.py` | 標高のタイルを取ってきて、1枚につなぎ合わせる |
| `path.py` | 時間割とカメラの動き（Blender を使わずに確かめられる） |
| `animatic.py` | Blender で場面を組み、コマを描く |
| `assemble.py` | コマを1本の動画にする（雲の中の白さ・仮のロゴ・秒と場面の名前） |
| `photo.py` | 航空写真の色の偏り（撮った年・季節の違うつぎはぎ）を、約 1.2km より大きな範囲で均す |
| `final.py` | 本番の色と質感（航空写真の地面・立体の雲海・朝焼けの空・空気のかすみ・太陽のまわりのにじみ）。いまは上高地の場面 |
| `home_prep.py` | 真上から見た日本の地面の色の地図（陸は衛星画像、海は深さで色を決める。標高の飛び抜けた値を直す） |
| `home.py` | 真上から見た日本を、PC のホームの地図と同じメルカトル図法・同じ縮尺で描く（地図の最初の見え方を同じ計算で出す） |
| `work/` | 取ってきたタイル・描いたコマ・動画（Git には入れない） |

## 使っているデータと出典

| データ | 使う所 | 出典の書き方・条件（公式のページで確かめたこと） |
|---|---|---|
| 国土地理院 標高タイル（基盤地図情報数値標高モデル。`dem_png`＝DEM10B、ズーム 14・11） | 上高地のまわり（約 7.7m ごと）、北アルプス〜富士山（約 60m ごと） | タイル一覧の「■2. 基本測量成果以外で出典の記載のみで利用可能なもの」にあり、出典を書けば申請なしで使える。「国土地理院」または「地理院タイル」と書き、[地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)へのリンクを付ける。加工したことも書く（例：「地理院タイル（標高タイル（基盤地図情報数値標高モデル））を加工して作成」）。国土地理院が作ったように見せない（[利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)）。この欄の備考に、ほかの出典の指定は無い（2026-11-20 に原文で確認） |
| AWS Terrain Tiles（terrarium、ズーム 6） | 日本列島と、まわりの海・海底 | 出典は元のデータごと（[attribution.md](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)）。海は ETOPO1（NOAA。「Not to be used for navigation.」）、陸は SRTM・GMTED2010（USGS）。日本の陸の元のデータが何かは、このページに書かれていない（本番の前に確かめる。陸は国土地理院の標高に置き換える案もある） |

| 国土地理院 全国最新写真（シームレス。`seamlessphoto`、ズーム 15） | 上高地のまわりの地面の色 | 標高タイルと同じ「■2」の欄で、出典を書けば使える（下の備考も） |
| 国土地理院 全国ランドサットモザイク画像（`lndst`、ズーム 8） | 真上から見た日本の、日本の陸の色 | 「■2」の欄。備考の原文：「本タイル画像を利用する場合は、「国土地理院コンテンツ利用規約」で定める方法での出所明示に加え、以下の出所も合わせて明示してください。」「データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO）」。画像の無い所は白で塗られている |
| 国土地理院 世界衛星モザイク画像（`modis`、ズーム 7） | 真上から見た日本の、まわりの国の陸の色 | 「■2」の欄。国土地理院の出所に加え、備考の英文の出所（Images on 世界衛星モザイク画像 obtained from site https://lpdaac.usgs.gov/data_access maintained by the NASA Land Processes Distributed Active Archive Center (LP DAAC), USGS/Earth Resources Observation and Science (EROS) Center, Sioux Falls, South Dakota, (Year). Source of image data product.）を書く |
| AWS Terrain Tiles（terrarium、ズーム 8。`dem8`） | 真上から見た日本の、陸と海の境目・海の深さの色・山の起伏 | 上の AWS Terrain Tiles と同じ。まわりから飛び抜けた値（例：富山の平野で 18111m）がわずかにあるので、home_prep.py で直す |

確かめた条件（2026-11-20 に原文で確認）：

- 国土地理院 全国最新写真（シームレス）：
  備考の原文：「一部において、米国航空宇宙局（NASA）/米国地質調査所（USGS）の地球観測衛星Landsat-8の画像、Axelspace CorporationのGRUS画像を使用しております。」
  GRUS 画像（© Axelspace の表示が要る）は「北緯20度24分28秒～北緯20度27分21秒、東経136度3分58秒～東経136度8分25秒」（沖ノ鳥島のあたり）だけで、上高地には無い
- まだ使っていない：Poly Haven・ambientCG の素材（CC0。出典は要らない）

使わないもの：NASA の衛星画像を直接（会社の宣伝に使うときの条件が確かめきれていない）、Google の地図や 3D の画像。

出典は、オープニングの隅に小さく出す（アプリに組み込むときに作る）。
