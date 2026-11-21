# PC のオープニング CG（作る道具）

PC 版（横幅 1024px 以上）で、アプリを開いたときに流すオープニング映像を、Blender で作る道具。スマホの画面には使わない。
できた動画は `public/opening/`（`opening-av1.webm`・`opening.mp4`）、ロゴの部品は `public/opening/logo/`。
アプリでの流し方は `components/desk/opening.tsx` と `lib/app/opening.ts`（ロゴの出し方は映像の秒の関数）。

## 構成「ひとつの夜明け」（16 秒・30 コマ/秒・音なし）

光は朝日だけ。色は藍・金・白。カットは割らず、場面のつなぎは雲の中で行う。

| 秒 | 映すもの | 場面 |
|---|---|---|
| 0〜0.5 | 夜明け前の日本を、九州の南東の高い空（約 340km）から北東へ見る。地球の縁の大気だけが光る | global |
| 0.5〜2.4 | 朝日が太平洋の側から上がり、光が列島をなでて、日本が浮かび上がる（地球の丸い影が西へ動く） | global |
| 2.2〜4.3 | 北アルプス（穂高）を画面の真ん中に保ったまま降りる | global |
| 3.75〜4.8 | 薄い雲の中を抜ける（いちばん濃い 4.3 秒で、上高地の場面へ切り替える） | |
| 4.6〜8.3 | 晩秋の上高地を鷹の目で：涸沢の上で朝焼けの穂高 → 吊尾根をかすめ → 岳沢を降り → 朝もやの谷を左へ大きく弧を描く | local |
| 8.3〜11.5 | 明神の下流から、徳本峠のあたりで東の稜線より高く上がる。雲海と朝日。速さを落とす | local |
| 9.7〜11.7 | 白鳥 7 羽が右から入り、横顔を見せながら朝日の中へ遠ざかる | local（swans） |
| 11.6〜15.2 | ロゴ（アプリが映像の上に描く。出し方「朝日の光から生まれる」）。カメラはほとんど止まる | local |
| 15.2〜16.0 | 静かに上がりながら少し上を向き、光の中の薄い雲へ（最後のコマは雲の白。アプリはここからホームへ溶ける） | local |

時間割・通る所・向き・太陽の高さは `path.py` に1か所でまとめている。上高地の場面は、通過点を決めると、地面からの高さの
目安を保つように高さを自動で決める（山の手前で先に上がる。左右 100m の地面も見る）。季節は 11 月上旬に合わせる
（朝日の方位 113°、カラマツの金、2600m あたりより上の初雪、安曇野で冬を越すコハクチョウ・オオハクチョウ）。

## 作り方

必要なもの：Python 3.13・numpy・scipy・Pillow・OpenEXR（`pip install scipy OpenEXR`）・FFmpeg（libsvtav1・libx264）、
Blender 5.3 を Python から使う版（`pip install bpy==5.3.0`。GPU は要らない）。下の `python` は bpy を入れたもの、`python3` はふつうの Python。

```bash
# 1. データ（2回目からはタイルを読み直さない）
python3 fetch.py near mid near_photo lndst modis dem8 && python3 photo.py near_photo && python3 home_prep.py
python3 autumn.py                      # 航空写真 → 晩秋の地面の色（work/near_photo_autumn.jpg・near_forest.png）
python3 logo_assets.py                 # ロゴ → 部品（public/opening/logo/、lib/app/opening-logo.json）

# 2. 面を描く（Cycles。1920×1080・10 サンプル。この作業場所で 1 コマ約 40 秒。描いたコマは描き直さない）
python film.py sky local               # かすみの色に使う全天の空
python film.py global                  # 列島の場面（0〜132 コマ）
python film.py local                   # 上高地の場面（126〜479 コマ）
python swans.py                        # 白鳥（291〜351 コマ。背景は透明）

# 3. 空気と仕上げ → 動画
python3 atmos.py global --jobs 4 && python3 atmos.py local --jobs 4   # 空気（大気・かすみ・光の筋・朝もや）・白鳥・色の仕上げ → work/post/
python3 atmos.py final --jobs 4                      # 2つの場面をつなぎ、雲の中を抜けるところ・粒 → work/frames/
python3 encode.py                                    # → public/opening/opening-av1.webm・opening.mp4
```

`film.py` は `--frames 126-200`・`--every 8`（間引いて先に流れを見る）・`--res`・`--spp` を選べる。`encode.py --preview` は、
間引いて描いたコマから仮の動画を作る（足りないコマは前のコマをくり返す）。`swans.py --look` は白鳥の形を近くから確かめる。

| ファイル | 中身 |
|---|---|
| `path.py` | 時間割とカメラの動き・太陽の高さ（Blender を使わずに確かめられる。`python3 path.py` で速さ・向きの変わる速さ・地面からの高さ） |
| `geo.py` | タイルの番号、標高の読み方、地球の丸みを入れた座標（東・北・上） |
| `fetch.py` | 標高・写真のタイルを取ってきて、1枚につなぎ合わせる |
| `photo.py` | 航空写真の色の偏り（撮った年・季節の違うつぎはぎ）を、約 1.2km より大きな範囲で均す |
| `autumn.py` | 航空写真を「何がある所か」と細かい模様だけに使い、晩秋の色（カラマツの金・針葉樹・枯れ草・川原・岩・初雪）で塗り直す。写真の影は標高と傾きで補う |
| `film.py` | Blender（Cycles）で「面」を描く：地形・雲海の上の面（光が中で散る白）・空・朝日・海（列島の場面）。動きのぶれも入れ、色（光の量そのまま）と奥行きを EXR に書く |
| `swans.py` | 白鳥（体・首・頭はなめらかな丸の集まり、翼は肩・ひじ・手首が遅れて動く羽ばたき）。カメラとほぼ一緒に進みながら朝日へ |
| `atmos.py` | 奥行きを使って空気を足す。列島の場面：地球の大気（空気の分子とちりの散乱・地球の丸い影）。上高地の場面：低い所ほど濃いかすみ、山の影で分かれる光の筋、谷底の朝もや。仕上げ：光のにじみ・AgX の色・金色の光と藍の影・雲の中・粒 |
| `encode.py` | 最後のコマ → AV1（WebM）と H.264（MP4） |
| `logo_assets.py` | ロゴを、出し方のための部品（光の点・円弧・山・文字 1 字ずつ・波・金の所）に分ける（形は変えない） |
| `home_prep.py`・`home.py` | 真上から見た日本（PC のホームの背景） |
| `assets/michilu-logo.webp` | 金と白のロゴ（元の画像） |
| `work/` | 取ってきたタイル・描いたコマ・動画（Git には入れない） |

## 使っているデータと出典

出典は、オープニングの右下に出す（`lib/app/opening.ts` の `OPENING_CREDIT`。地理院タイル一覧へのリンク付き）。

| データ | 使う所 | 出典の書き方・条件（公式のページで確かめたこと） |
|---|---|---|
| 国土地理院 標高タイル（基盤地図情報数値標高モデル。`dem_png`、ズーム 14・11） | 上高地のまわり（約 7.7m ごと）、北アルプス〜富士山（約 60m ごと。列島の場面で降りるところにも） | 地理院タイル一覧の「■2. 基本測量成果以外で出典の記載のみで利用可能なもの」。「国土地理院」または「地理院タイル」と書き、[地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)へのリンクを付ける。加工したことも書く。国土地理院が作ったように見せない（[利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)） |
| 国土地理院 全国最新写真（シームレス。`seamlessphoto`、ズーム 15） | 上高地のまわりの地面（何がある所かと細かい模様。色は晩秋の色で塗り直す） | 同じ「■2」。備考：一部に Landsat-8・GRUS の画像（GRUS は沖ノ鳥島のあたりだけで、上高地には無い） |
| 国土地理院 全国ランドサットモザイク画像（`lndst`、ズーム 8） | 列島の場面の、日本の陸の色 | 「■2」。備考の原文：「データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO）」も合わせて書く |
| 国土地理院 世界衛星モザイク画像（`modis`、ズーム 7） | 列島の場面の、まわりの国の陸の色 | 「■2」。備考の英文の出所（LP DAAC・USGS/EROS）も合わせて書く |
| AWS Terrain Tiles（terrarium、ズーム 8） | 列島の場面の、陸と海の境目・山の起伏 | 出典は元のデータごと（[attribution.md](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)）。海は ETOPO1（NOAA。「Not to be used for navigation.」）、陸は SRTM・GMTED2010（USGS）など |

空（Blender の空の計算）・雲・かすみ・白鳥は、データを使わずに計算で描いたもの。使わないもの：NASA の衛星画像を直接、Google の地図や 3D の画像。
