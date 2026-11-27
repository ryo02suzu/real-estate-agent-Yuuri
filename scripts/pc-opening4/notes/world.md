# world パッケージ（第4版・実写の世界）
2026-11-27 時点：ステップ 1 完了（レビュー画像 4 枚は review/world/）。

## 作り（akafuji 方式：本物の航空写真を本物の標高に貼る）
- world_fetch.py（numpy と Pillow のみ）：cameras.json の視野に入るタイルだけを、距離の段ごとに取る。標高 dem12(≤150km)・dem13(≤60km)・dem14(≤24km)・dem5a z15(≤3.5km)・dem1a z17(≤1.2km)、
  写真 p12(≤150km)・p13(≤55km)・p14(≤20km)・p15(≤8km)・p16(≤3km)・p17(≤1km)＋富士山の箱 pfuji(z13)。1 秒 4 枚まで・タイルは取り直さない。
  `python3 world_fetch.py work/world/reveal --shot reveal --cache work/world/tiles`（c2 も同じ要領。all は約 3,900 枚）。--dry-run で枚数だけ。
- world.py：地形はカメラ中心の入れ子の格子（4→8→16→32→64→128m。視野の向き±(画角/2+20°)だけ）。外の輪との境は奇数の頂点を平均にして割れ目を消す。丸み(geo4.curvature_drop)は頂点・カメラ・雲ぜんぶで引く。
  色は写真を距離の段で重ね（位置から UV を出す：ウェブメルカトルは ENU と一次の関係）、材質の中で仕立てる（森は赤茶・黄金・暗い緑へ、彩度を落とす、標高 2,500m 以上に雪：傾き・向き・ノイズで縁を不規則に）。
  この写真の森は青緑（色相 0.45）に写っているので、そのままだと青く見える（これが最初の失敗）。
- 雲：雲の上面の高さ（numpy・固定シード）を焼いた画像（R=上面−丸み−CLOUD_TOP の 32 ビット、G=岸の重み）。上面 1,650m＋うねり（風向き 115° に伸びる）＋もくもく（150〜780m）。なめらかな所とこぶの多い所を calm で分ける。
  山の斜面に近いほど面が下がり薄くなる（岸）。上高地（東経 137.42〜137.705・北緯 36.175〜36.345）は雲なし。
  clouds=surface：同じ高さの場を白い面（拡散＋半透明）に。clouds=volume：近く(〜14.5km)は 10m の画像＋1.28km タイルの入れ物、中間(〜vol_range)は 40m の画像＋2.56km タイル、その先は surface の面（6m 下げて重ねる）。
- 空は Nishita（高度＝カメラの標高・太陽の円盤あり）。かすみは有限の箱（haze=1）。グレアは Blender 5.3 のコンポジター（compositor_device=CPU が要る。GPU の文脈が無い機械で落ちるため）。
  5.x のグレアは設定が入力の口。しきい値 6.0・強さ 0.3 で太陽のまわりだけやわらかくにじむ。

## 実行
  blender -b --factory-startup --python world.py -- data=work/world/reveal out=OUT frame=600 res=1280x720 samples=64 clouds=surface marks=1
  この機械では：<bpy の python> world.py -- 同じ引数。出力は OUT/frame_0600.png・_stats.json・（marks=1 で）_marks.json と _geo.png。
  引数の一覧は world.py の先頭。確かめ用に emit=1（照明なしで色だけ）。

## cameras.json の作り方
`work/route.json`（python3 route.py）から、コマ 131〜719 の位置・向き・焦点距離を書き出したもの（pos_world は丸みで下げた位置）。matrix は animatic.py の place と同じ式（列が右・上・後ろ）。

## 測った数（この機械・CPU 2 本）
| 画像 | 大きさ・光の回数 | 組み立て | 描く | 最大メモリ |
|---|---|---|---|---|
| reveal-surface（コマ 600・surface） | 1280x720・64 | 7.5 秒（地形 217 万頂点・雲の面 129 万頂点） | 3.1 分 | 3.3 GB |
| reveal-volume（volume・vol_range 14km・かすみあり） | 640x360・24 | 20 秒（立体のタイル 85） | 14.9 分（他の描画と同時） | 6.4 GB |
| c2-photo（コマ 240・surface） | 1280x720・64 | 9.2 秒（地形 261 万頂点・雲の面 156 万頂点） | 4.8 分 | 3.4 GB |
- 材料の取得：reveal 2,099 枚・157 MB、c2 1,942 枚・129 MB（共有して実際の取得は計 3,673 枚・約 286 MB のうち 368 枚は reveal と共有）。

## 地理の確かめ（reveal-geo.jpg）
太陽の印はレンダーした円盤の位置と一致（Nishita の方位は北から時計回りそのままでよい）。赤岳は太陽の真下あたり、富士山は甲斐駒ヶ岳の左に白い小さな山頂、北岳の雪も印の下に出ている。山頂は印より 5〜10 画素ほど低く見える（128m 格子で尖りがなまる）。

## 次にやること・弱点
- 逆光（太陽が正面）なので手前の尾根が暗く、雲の面は青白くのっぺり。雲の立体は surface より本物らしい（reveal-volume）が、CPU では重い。
- volume と far deck の境（14km）で質感が変わる。vol_range を広げると GPU で解消できるはず。
- 手前の植生は高山帯（2,500m 付近）で緑が残る（暖色化は明るさ・色相の条件のみ）。c2 の細かい岩は p17(1m) どまり（近い 100m 以内は別の作業）。
- 地形の尖りがなまる：far 輪の格子を 128m→64m にする（頂点が約 4 倍）か、粗い輪で最大値を取る。
- seamlessphoto z12・13 は一覧に載っていない（ASSETS.md 参照）。
- 空は白っぽい（朝の地平線の暖かさはあるが、天頂の青が浅い）。exposure=-1.4 sky=0.5 の既定。

## ステップ 2：GPU で 1 枚（2026-11-27）
- `scripts/gpu-render/jobs/world/run.sh`：公開リポジトリを SHA のコミットで浅く clone（scripts/pc-opening4 だけ）→ world_fetch.py（機械の中で約 2,100 枚）→ world.py を device=gpu で、先に 960x540・32 回の確かめ、続けて本番（RES・SAMPLES）。既定は clouds=volume haze=1 glare=1 exr=1。結果は OUT/small・OUT/full（png・exr・stats）と OUT/report.txt（GPU 名・使った装置・秒・最大メモリ）。
- この機械での確かめ：bash -n・clone（sparse＋SHA の fetch）・world_fetch.py（キャッシュ使用）・world.py を device=gpu 指定で 320x180（GPU が無いので CPU に落ちることも確認）。
- 直したバグ：world.py の exr=1 が Blender 5.3 に無い形式名 OPEN_EXR_MULTILAYER で落ちていた → OPEN_EXR（32 ビット）に。
