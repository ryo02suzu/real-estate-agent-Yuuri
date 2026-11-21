# PC のオープニング CG（作る道具）

PC 版（横幅 1024px 以上）で、アプリを開いたときに流すオープニング映像を、Blender で作る道具。スマホの画面には使わない。
できた動画は `public/opening/`（`opening-av1.webm`・`opening.mp4`）、ロゴの部品は `public/opening/logo/`。
アプリでの流し方は `components/desk/opening.tsx` と `lib/app/opening.ts`（ロゴの出し方は映像の秒の関数）。

## 構成「ひとつの夜明け」（21.1 秒・30 コマ/秒・音なし）

光は朝日だけ。色は藍・金・白。カットは割らず、場面のつなぎは雲の中で行う。

| 秒 | 映すもの | 場面 |
|---|---|---|
| 0〜0.5 | 夜明け前の日本を、九州の南東の高い空（約 340km）から北東へ見る。地球の縁の大気だけが光る | global |
| 0.5〜2.4 | 朝日が太平洋の側から上がり、光が列島をなでて、日本が浮かび上がる（地球の丸い影が西へ動く） | global |
| 2.2〜4.3 | 北アルプス（穂高）を画面の真ん中に保ったまま降りる | global |
| 3.75〜4.8 | 薄い雲の中を抜ける（いちばん濃い 4.3 秒で、上高地の場面へ切り替える） | |
| 4.0〜8.0 | 晩秋の上高地を鷹の目で：涸沢の上で朝焼けの穂高へ近づき → 吊尾根をかすめ → 岳沢の上へ出て朝もやの梓川を見下ろし → 高いまま谷を東へ渡る | local |
| 8.0〜11.6 | 徳本峠の上で東の稜線より高く出ると、雲海と朝日。速さを落とし、ほとんど止まる（そのあとはゆっくり漂う） | local |
| 12.1〜16.6 | 白鳥 7 羽（V 字）が右の近くから入り、ゆっくり羽ばたきながら朝日の中へ遠ざかって消える | local（swans） |
| 16.4〜20.1 | ロゴ（アプリが映像の上に描く。出し方「朝日の光から生まれる」。出そろうのは約 19.5 秒） | local |
| 20.1〜21.1 | 静かに上がりながら少し上を向き、光の中の薄い雲へ（最後のコマは雲の白。アプリはここからホームへ溶ける） | local |

時間割・通る所・向き・太陽の高さは `path.py` に1か所でまとめている。上高地の場面は、通過点を決めると、地面からの高さの
目安を保つように高さを自動で決める（山の手前で先に上がる。左右 100m の地面も見る）。上品に見えるように、景色の流れる速さ
（速さ÷地面からの高さ）を平均 1.2/秒ほどに抑え（地面の近くは遅く、谷を渡るときは高く）、曲がる速さは 33°/秒まで。
白鳥はカメラに対して置くので、カメラが十分遅くなってから（60 m/秒より遅く）出し、画面の上を約 300px/秒で渡らせる。季節は 11 月上旬に合わせる
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
python film.py local --frames 126-383,384-600:4,601-632   # 上高地の場面（止まる所は 4 コマおき。間は atmos.py が EXR を混ぜて作る）
python swans.py                        # 白鳥（363〜499 コマ。背景は透明）

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
| `atmos.py` | 奥行きを使って空気を足す。列島の場面：地球の大気（空気の分子とちりの散乱・地球の丸い影）。上高地の場面：低い所ほど濃いかすみ、山の影で分かれる光の筋、谷底の朝もや、日の当たる斜面に穴のように見えた丸い影の消し込み（`RETOUCH`。同じ斜面の日なたの模様を写す）。仕上げ：光のにじみ・AgX の色・金色の光と藍の影・雲の中・粒 |
| `encode.py` | 最後のコマ → AV1（WebM）と H.264（MP4） |
| `logo_assets.py` | ロゴを、出し方のための部品（光の点・円弧・山・文字 1 字ずつ・波・金の所）に分ける（形は変えない） |
| `home_prep.py`・`home.py` | 真上から見た日本（PC のホームの背景）。`home.py --tod` は時刻の版 |
| `night_lights.py` | 夜の街の明かり（国勢調査の 500m メッシュの人口 → home_prep.py と同じ格子の明るさ。国勢調査の範囲の外は `ghsl.py` の人口） |
| `ghsl.py` | 日本のまわりの国の人口（JRC の GHSL の GHS-POP。タイルを取り、GeoTIFF（BigTIFF・LZW）を読んで格子に分ける） |
| `home_hd_prep.py`・`home_hd.py` | 背景の細かい版：陸のある区画（1024 画素四方）だけ、広い版の4倍（ズーム 9）の細かさで描き直す（拡大しても細部まで見える） |
| `home_tiles.py` | 広い版と細かい版 → アプリのタイル（`public/home/tiles/{時間帯}/{z}/{x}/{y}.webp`、ズーム 4〜8）と `lib/app/desk-japan.json` |
| `air_clouds.py` | PC のホームの空気の層：雲の形（つなぎ目の無いくり返しの模様。`fields`）と、Blender の絵 → アプリの WebP（`webp`） |
| `air_render.py` | PC のホームの空気の層：雲（積雲・巻雲）・地面に落ちる影・オープニングから晴れていく厚い雲を、Cycles の体積で描く（`home.py` と同じ光） |
| `assets/michilu-logo.webp` | 金と白のロゴ（元の画像） |
| `work/` | 取ってきたタイル・描いたコマ・動画（Git には入れない） |

### PC のホームの背景：時刻の版（朝・昼・夕・夜）

今の背景（`home.py --extent`、朝の光）と同じ構図・同じ四隅のまま、光だけを変えた4枚。アプリ（PC だけ）は、上の帯の時間帯
（朝・昼・夕・夜。時計に合わせるときは今の太陽）の1枚を出し、変わったら約 1.2 秒で溶かして替える（`lib/app/desk-home.ts`・
`lib/app/desk-cinema.ts`。開いたときは今の時間帯の絵だけを読み、ほかはその時間帯になったときに読む。動きを減らす設定ではすぐ替える）。
夕と夜の絵を出している間は、地図の出典の欄に明かりの出典（e-Stat・GHSL）も出す。

```bash
python3 night_lights.py                     # 人口 → 夜の街の明かり（work/night_lights{,_w}.npy・.png・.json。e-Stat から約 150 回、GHSL から約 30 回、間をあけて取る）
python home.py --extent --tod night         # → work/home/home_wide_night.png（--tod は morning・day・dusk・night）
python home.py --view 1440x900 --scale 0.6667 --spp 8 --tod dusk --out 見本.png   # 小さく試す（960×600）
```

**本番の大きさで描いて、アプリに入れる**（広い版は 1 枚 約 10 分。細かい版は 1 区画 約 20 秒 × 169 区画 × 4 つの時間帯。描くのは CPU だけ）：

```bash
for t in morning day dusk night; do python home.py --extent --scale 2 --spp 24 --tod $t; done   # 広い版 → work/home/home_wide_{tod}.png（5120×3968）
python home.py --extent --scale 2 --spp 24 --tod night --glow-exr work/home/home_wide_night_glow.exr  # 夜の明かりのにじみだけ（細かい版が使う）
python3 home_prep.py --wide                 # 細かい版の下地（混ぜる前の陸の色・海の色）も書く
python3 home_hd_prep.py --parts             # 描く区画（陸のある所）→ work/home_hd/parts.json
python3 home_hd_prep.py --fetch             # ズーム 9 の標高（AWS）・ランドサット、ズーム 8 の世界衛星モザイク（国土地理院は1枚ずつ）
python3 home_hd_prep.py --build             # 区画ごとの入力（地面の色・標高・明かり）→ work/home_hd/in/
for t in morning day dusk night; do python home_hd.py --tod $t; done   # 細かい版 → work/home_hd/{tod}/{列}_{行}.png（描いた区画は飛ばす）
python3 home_tiles.py                       # → public/home/tiles/{tod}/ と lib/app/desk-japan.json
```

#### 細かい版（拡大しても細部まで）

広い版は、ズーム 7（256 画素のタイルで）の細かさ＝地図のズーム 6 で絵の 1 画素が画面の 1 画素なので、細かい画面（Mac・iPad。画面の
1 画素が CSS の半分）では、開いたときのズーム 5 がもう限界で、寄るとすぐぼやけていた（持ち主の iPad の画面写真、2026-11-21）。
そこで陸のある所を、4倍（ズーム 9）の細かさで Blender で描き直し、拡大の段階ごとのタイルにした。

- 区画：広い版の範囲を、ズーム 9 で 1024 画素四方に分けた 320 区画のうち、陸のある 169 区画（日本のまわりの国の陸も。区画の境目で
  細かさや起伏の濃さが変わらないように）。海だけの区画は、広い版を引き伸ばして使う（海はなめらかなので変わらない）。
- 地面の色：広い版の色（`home_prep.py` の大きな範囲の色合わせが済んだ、混ぜる前の陸の色・海の色）に、ズーム 9 のランドサット（無い
  陸は世界衛星モザイク）の細かい模様（まわりの平均との比）を掛ける。広い版の 1 画素の中の平均の色は変わらない。陸と海の境目は
  ズーム 9 の標高で決め直す。
- 起伏：ズーム 9 の標高（AWS Terrain Tiles）。起伏の大きな形（標高をぼかしたもの）は広い版と同じ 6 倍、それより細かい起伏は 2.5 倍に
  強調する（細かい起伏まで 6 倍だと谷の影が濃すぎる）。区画の外の山の影も落ちるよう、地面は区画のまわり 672 画素まで作る（カメラには
  入れない）。それでも細かい起伏の影の分、縮めて見ると広い版より山が少し暗く、くっきりする（明るさの平均で約 8%）。
- 光・露出・かすみ・地面の鮮やかさ・街の明かりは `home.py` の時刻の版と同じ値・同じ式。夜の明かりのにじみ（Fog Glow）は区画より
  大きく広がるので、広い版で Blender が作ったにじみ（`--glow-exr`）を4倍に引き伸ばし、かすみの前に足す（広い版と同じ順番）。
- タイル（`home_tiles.py`）：いちばん細かい段（ズーム 8。512 画素の絵を 256 画素のタイルとして出す）は、区画を隣の区画・広い版と
  重ねた幅（64 画素）でなめらかに混ぜる。それより粗い段は、1つ細かい段の4枚を光の量で平均して半分にする。範囲の外は透明。
- アプリ（`lib/app/desk-home.ts`・`desk-cinema.ts`）：絵がくっきり見える一番寄った高さ（ふつうの画面はズーム 8、細かい画面は 7）
  から薄くし、その 0.8 先で今の地図に替わる。

- `--tod` を付けないときは、今までと同じ絵（アプリの絵）を描く。
- 朝：東から低い金の光（影は空の青）。昼：南の高い白い光。夕：西から低い茜の光、影は藍、街の明かりがともり始める。
  夜：南東の月の青い光で陸と海の境目がうっすら分かり、人が住んでいる所に街の明かり（琥珀〜白に近い金）。
  地面に届く光の量の違いは露出で打ち消し、`TOD` の `stops` だけ明るさを変える（夜は今の絵より約 2.6 段暗い）。
- 街の明かりは、人が住んでいる所だけに出す（作り物の明かりは足さない）。明るさは 500m メッシュの人口を画素に面積の割合で
  分けた人口密度の 0.75 乗（1 万人/km² で 1）。約 8〜60 人/km² より少ない所はなめらかに消し、街のまわりに少しにじみを足す。
  人口は常住人口（住んでいる人）なので、人の住まない都心のビル街・工場・港・道路は、本物の夜景より暗い。取ってきた CSV は
  `work/estat/`（約 21MB）に置き、2回目からは読まない。
- 国勢調査の範囲の外（韓国・中国・台湾・ロシアなどと、国勢調査をしていない北方領土）は、JRC の GHSL の人口の格子（GHS-POP R2023A の 2020 年、
  30 秒角＝約 1km。`ghsl.py`）を、同じ明るさの式で光らせる。国勢調査の範囲（人の住む 500m メッシュから 10km と、そのメッシュの
  ある島の陸の全部と、それに囲まれた所）の中は国勢調査だけ（同じ人を2回数えない。2020 年に人の住めなかった原発事故の
  帰還困難区域に、GHSL の人口で明かりを出さない）。どちらも人口から決めるので、北朝鮮だけは本物の夜の衛星写真
  （平壌のほかはほとんど暗い）に近づけるため、人口からの明るさに 0.05 をかける（`DIM_ABROAD`。見え方を合わせる係数で、測った値ではない）。タイル（10 度×10 度、31 枚・約 90MB）は `work/ghsl/` に置き、2回目からは読まない。

### PC のホームの空気の層（雲と影）

**作り直し中（2026-11-21）**：今の雲の形は丸い綿のかたまりのように見えて作り物っぽいので、宇宙から見た本物の雲（細かく割れた雲の網目・
筋・ぼろぼろのふち・薄い巻雲）に作り直してから、アプリに出す（`lib/app/desk-air.ts` の `AIR_READY` が false の間は、アプリは雲の絵を読まない）。

PC のホームの日本の上空の、まばらな積雲と薄い巻雲、地面に落ちる雲の影（アプリは `lib/app/desk-air.ts`・`lib/app/desk-air-layer.ts`）。
雲はデータを使わずに計算で作り、Blender（Cycles の体積）で、背景の日本の絵（`home.py --tod`）と同じ光で描く。

```bash
python3 air_clouds.py fields                     # 雲の形 → work/air/fields.npz（約 30 秒。ふつうの Python）
python air_render.py --tod all                   # Blender で描く → work/air/render/（時刻 4 つ × 5 枚）
python3 air_clouds.py webp                       # → public/home/air/*.webp と lib/app/desk-air.json
# 小さく試す（1 周期を半分の細かさで・少ないサンプル・CPU 2 つ）。一部だけを 1 画素＝1 単位で見るときは --window 列,行,幅
python air_render.py --tod all --scale 0.5 --spp 16 --threads 2 --out work/air/render-preview
python3 air_clouds.py webp --render work/air/render-preview
```

- **形（`air_clouds.py fields`）**：上下・左右につなぎ目なくくり返せる 2048×2048（1 画素 = ズーム 5 の地図の 1 画素。PC のホームの
  地図とほぼ同じ縮尺で、画面の幅より 1 周期が広い）。ぼかしをフーリエ（周期のある波の足し合わせ）で計算するので、端と端が必ず
  つながる。積雲は、1 つの雲を「真ん中の丸い頭・まわりのもくもく（雲の頭）・ふちの小さなふくらみ」の集まりで作り、大きさは
  小さい雲ほど多く（べき乗）、群れのある所ほど雲が多く大きい（ところどころに大小の群れ。大部分は晴れ。覆う割合は約 6.5%）。
  返すのは雲の濃さと雲の頭の高さ（もくもくは真ん中の頭に積み重なり、細かいセルの凹凸も足す）。巻雲は、風の向き（西から東、
  少し北東へ）に長く細いふくらみを帯のように置いた、薄いベール。厚い雲（`deck-a`・`deck-b`）は、同じ種で雲を足したもの
  （ふだんの雲は同じ所にある）。
- **描き方（`air_render.py`）**：形の地図を、Blender の体積の濃さにする（積雲：底はほぼ平ら、頭は高さの地図のとおり。小さい雲ほど
  薄く低い。巻雲：高い所の薄い層）。真上から、ゆがみの無いカメラで、1 周期のまわりに余り（32 単位）を付けて描く（雲の外の周期の雲も
  置くので、影や光が端をまたいでつながり、ノイズ除去もつながる。`air_clouds.py webp` が余りを切る）。光は `home.py` の `tod_lights`
  （TOD の太陽か月と、空の光）そのもので、露出と色の曲線（AgX - Medium High Contrast）も `home.py` と同じ。光は雲の中で何度も
  散る（体積の散乱）ので、日の当たる側が明るく、反対は空の青い光だけの影になり、薄いふちは光が透ける。影は、地面を「影を受ける
  だけで写らない」面（shadow catcher）にして、雲をカメラに写さずに描く（柔らかい影が、太陽と反対の向きにずれて落ちる：朝は西へ長く、
  昼は北へ短く、夕は東へ長い）。雲は流れるので、影は平らな地面に落とす（地形には沿わせない。動く雲の影が、止まっている山に合わない
  ため）。
- 体積は ray marching（`--step 0.02`。Cycles の既定の null scattering と、ほぼ同じ見え方で約 3 倍速い。0.1 より粗いと雲が平たく
  なり影も薄くなる）。朝夕の雲は地面より明るく、地面に合わせた露出のままだと AgX が色を抜いて白っぽくなるので、露出を少し下げ
  （`CLOUD_EV`：朝 -0.35 段・夕 -0.9 段）、夕の雲には地面より赤い最後の光を当てる（`CLOUD_TINT`。茜）。WebP にするときに朝・夕の
  雲の鮮やかさを少しだけ戻す（`air_clouds.py` の `SAT`）。
- 出力：時刻（朝・昼・夕・夜）ごとに `cumulus-*`・`cirrus-*`（2048×2048、透明つき）、`shadow-*`・`deck-a-*`・`deck-b-*`（ぼけているので
  1024×1024。アプリが 2 倍にのばす）。アプリは今の時間帯の積雲・巻雲・影だけを読み（夜は影を読まない）、厚い雲はオープニングを
  流すときだけ読む。
- **本番の大きさ**（1 周期を 1 画素＝1 単位で、48 サンプル。`python air_render.py --tod all`）は、CPU 4 つで約 1 時間の見込み
  （試しの絵＝半分の細かさ・16 サンプルは、CPU 2 つで約 12 分だった。本番は画素が 4 倍・サンプルが 3 倍）。今入っている絵は、その
  仮の絵（`render-preview`）で、少しぼけて見える。急ぐときは `--spp 32` でもよい（ノイズ除去をかけるので、ふちが少しざらつく程度）。

## 使っているデータと出典

出典は、オープニングの右下に出す（`lib/app/opening.ts` の `OPENING_CREDIT`。地理院タイル一覧へのリンク付き）。

| データ | 使う所 | 出典の書き方・条件（公式のページで確かめたこと） |
|---|---|---|
| 国土地理院 標高タイル（基盤地図情報数値標高モデル。`dem_png`、ズーム 14・11） | 上高地のまわり（約 7.7m ごと）、北アルプス〜富士山（約 60m ごと。列島の場面で降りるところにも） | 地理院タイル一覧の「■2. 基本測量成果以外で出典の記載のみで利用可能なもの」。「国土地理院」または「地理院タイル」と書き、[地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)へのリンクを付ける。加工したことも書く。国土地理院が作ったように見せない（[利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)） |
| 国土地理院 全国最新写真（シームレス。`seamlessphoto`、ズーム 15） | 上高地のまわりの地面（何がある所かと細かい模様。色は晩秋の色で塗り直す） | 同じ「■2」。備考：一部に Landsat-8・GRUS の画像（GRUS は沖ノ鳥島のあたりだけで、上高地には無い） |
| 国土地理院 全国ランドサットモザイク画像（`lndst`、ズーム 8） | 列島の場面の、日本の陸の色 | 「■2」。備考の原文：「データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO）」も合わせて書く |
| 国土地理院 世界衛星モザイク画像（`modis`、ズーム 7） | 列島の場面の、まわりの国の陸の色 | 「■2」。備考の英文の出所（LP DAAC・USGS/EROS）も合わせて書く |
| AWS Terrain Tiles（terrarium、ズーム 8） | 列島の場面の、陸と海の境目・山の起伏 | 出典は元のデータごと（[attribution.md](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)）。海は ETOPO1（NOAA。「Not to be used for navigation.」）、陸は SRTM・GMTED2010（USGS）など |
| e-Stat「令和2年国勢調査に関する地域メッシュ統計」（総務省）4次メッシュ（500m）「人口及び世帯（JGD2011）」（統計表 T001141。人口（総数）だけ使う） | ホームの背景の時刻の版の、夜と夕の街の明かり | [e-Stat 利用規約](https://www.e-stat.go.jp/terms-of-use)（政府標準利用規約（第2.0版）に準拠、CC BY 4.0 と互換。統計地理情報システムのデータも[同じ規約に準じる](https://www.e-stat.go.jp/gis-terms)）。出典を書き、編集・加工したことも書く。加工したものを国が作ったように見せない。出典の書き方：「夜の街の明かり：政府統計の総合窓口（e-Stat）（https://www.e-stat.go.jp/）の「令和2年国勢調査に関する地域メッシュ統計」（総務省）の500mメッシュの人口を加工して作成」（`night_lights.py` の `ATTRIBUTION`）。人口（総数）は秘匿しない項目（e-Stat の定義書） |
| JRC「GHS-POP R2023A - GHS population grid multitemporal (1975-2030)」の 2020 年（`GHS_POP_E2020_GLOBE_R2023A_4326_30ss` のタイル。[JRC のデータカタログ](https://data.jrc.ec.europa.eu/dataset/2ff68a52-5b5b-4a22-8f40-c41da8332cfe)） | ホームの背景の時刻の版の、夜と夕の、国勢調査の範囲の外の明かり | 配布元の [copyright.txt](https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/copyright.txt)：「(c) European Union, 1995-2026 … Any copyright and/or sui generis right on the dataset is licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence. Reuse is allowed provided appropriate credit is given and any changes are indicated.」（データのフォルダの copyright.txt も同じ文。JRC のデータカタログも「reuse is authorised, provided the source is acknowledged」。2026-11-21 に確かめた）。作った所・著作権の表示・ライセンスへのリンク・加工したことを書く。出典の書き方：e-Stat の出典に続けて「国勢調査の範囲の外（日本のまわりの国など）は欧州委員会 共同研究センター（JRC）の「GHS-POP R2023A」（© European Union, 1995-2026、CC BY 4.0）の2020年の人口を加工して作成」（アプリは `lib/app/desk-cinema.ts` の `NIGHT_LIGHTS_ATTRIBUTION`。DOI とライセンスへのリンク付き。夕・夜の絵を出している間だけ地図の出典の欄に出す。`ghsl.py` の `ATTRIBUTION`・`CITATION`） |

空（Blender の空の計算）・雲・かすみ・白鳥は、データを使わずに計算で描いたもの。使わないもの：NASA の衛星画像を直接、Google の地図や 3D の画像。
