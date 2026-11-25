# 道すじ（route）進み具合：完了（受け入れの検査は通った）

## できたもの（scripts/pc-opening4/）
- config.py：時間割・座標・光（25.0 秒・600 コマ・コマ 131 から山の場面・つなぎ目コマ 230 と 372）
- geo4.py：東・北（m）⇄ 緯度・経度、地球の丸みの下がり、標高 Dem（谷 10m 格子 → 外は広い格子・傾きも）
- route.py：山の場面のカメラ（コマ 131〜599）。numpy だけ。`WORK/route.json`、`camera_at(frame)`、`all_positions()`
- animatic.py：速い下書き（Blender・Cycles 640x360・8 回）と、動画・一覧
- review/route/：route-map.jpg・route-profile.jpg・animatic.mp4・sheet.jpg

## 動かし方
    PY=<scratchpad>/bl/bin/python
    python3 scripts/pc-opening4/route.py            # 表（0.5 秒ごと）＋決まり破りの一覧（0 件が合格）＋ WORK/route.json
    python3 scripts/pc-opening4/route.py --plot     # 平面図と断面図
    $PY scripts/pc-opening4/animatic.py render      # 118 コマ（約 10 分・2 スレッド）。途中から再開できる
    python3 scripts/pc-opening4/animatic.py assemble
WORK は環境変数 PC_OPENING4_WORK（既定は scripts/pc-opening4/work）。標高データは pc-opening3/work/terrain/ を読むだけ。

## 計画（PLAN.md）からの変え方（任された指示の 25 秒版に合わせた）
1. 山の場面を縮めた：計画は 5.45〜22.4 秒の 17 秒、この版は 5.458〜18.4 秒の約 13 秒。速さは計画より速い。
   そのため道すじは「流れる速さ flow ≤ 4.5（見せ場の外は 3）」を軸に、時刻と位置を詰め直した。
   尾根越え（L9）は 16.9 秒、吊尾根（L2）は 8.3 秒、梢→川は 11.1〜14.1 秒。
2. つなぎ目（もやの白い 8 コマ）は計画どおり 2 か所使う。コマは 230（9.58 秒）と 372（15.5 秒）。
   前後 4 コマは位置が飛んでよく、向き・傾き・レンズはもやの中でなめらかにつなぐ。道すじは seg0/1/2 の 3 本。
   つなぎ目の前後で速さ ±20%・降りる角度 ±2°・傾き ±2° をそろえてある（route.py が検査）。
3. 点の位置を詰めた：L3 は L2 の先 128 m、L4・L7・L8 は「もやの出入り口」なので計画の座標より近く（梢・川の上）、
   見せ場の長さと速さの上限に合わせた。川筋（水）は計画の L6〜L7 のまま。
4. 木の高さは 25 m（標高 2,400 m 未満で傾き 35° 未満。L6〜L7 の川筋から 60 m 以内は水面）。
5. L9 の先の地平線：「コマの高さの 55%」を上から測って置いた（空が 55%・ロゴの場所が広い）。上向き 2°。24.0 秒から 12° ゆっくり上へ。
6. 18.4 秒より後の漂いは 10〜15 m/秒（上へ 9〜10・前へ 6〜8）。**2,450 m には届かない**：高さ 2,234 m（梢の上）から
   この速さの上限で上がれるのは最後で約 2,318 m。2,450 m にしたいなら、速さの上限を外すか、尾根越えを高く（梢の上 40 m 以上）にする。
7. 計画にある「ごく弱い揺れ（0.05〜0.1°・2〜6Hz）」は入れていない（描く側が足す）。

## route.json の決まり
- 1 コマ 1 件：f, t, e, n, z, lat, lon, heading_deg, pitch_deg, roll_deg, lens_mm, ground, clearance, speed, flow, seg, seam
- e,n,z は東・北・本当の標高（m）。地球の丸みは引いていない（場面側で geo4.curvature_drop を引く。animatic.py が例）
- 向き：方位は北から時計回り、上下は上が正、傾きは右が正（右が下がる）。レンズは 36mm 幅のセンサー
- clearance は足元の面（地面・梢・水面）からの高さ。ground は標高の地面。seam=true はもやのコマ（検査の対象外）

## 次にやること（他の担当へ）
- 場面を組む側：camera_at(f) と geo4.Dem、config.SEAM_FRAMES を使う。seam のコマはもやだけにしてよい。
- 空と雲の担当：太陽は方位 115°・高さ 5°。雲海は標高 1,700 m（東経 137.695 より東）。
- 森と川の担当：川筋は L6（36.2533, 137.6509）〜L7（36.2530, 137.6522）。道すじは川の上を L5 の先から L7 の先まで（東へ約 110°）。
- Blender の太陽の空（多重散乱）は、回転の値＝太陽の方位（北から時計回り）。試して確かめた。
