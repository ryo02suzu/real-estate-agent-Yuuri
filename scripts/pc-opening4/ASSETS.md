
## 道すじ（route）の標高データ（2026-11-25 追記）
- 国土地理院 標高タイル（dem_png）。谷 z14（valley.npy）・広い z11（far.npy・mid.npy）。mid.npy は東経 136.9〜139.1・北緯 35.25〜37.0（八ヶ岳・富士山まで）。
  - 出所: https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png（mid.json に記録）
  - 規約: 国土地理院コンテンツ利用規約 https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html （2026-11-25 に原本を確認。公共データ利用規約 第1.0版が基本。
    加工したら出典とは別に加工したと書く。出典例「出典：国土地理院ウェブサイト」）。商用の可否は公共データ利用規約 1.0 の本文で確かめること（このページには具体的な記載なし）。
- 使っていない: pc-opening/work/dem8.npy・dem8w.npy（Terrarium タイル）。規約の原本を確かめていないので、この版の下書きにも使っていない。

## 地形（terrain.py・ground.py。2026-11-25）
- 国土地理院 標高タイル DEM1A（約 1m。ズーム 17）・DEM5A（約 5m。ズーム 15）。吊尾根の交差点（北緯 36.2868・東経 137.6525）の前後約 1.3km／4.4km。
  - 出所: https://cyberjapandata.gsi.go.jp/xyz/dem1a_png/{z}/{x}/{y}.png ・ https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png（取ったタイルは work/terrain4/tiles）
  - 規約（原本 https://maps.gsi.go.jp/development/ichiran.html を 2026-11-25 に確認）：「地理院タイルは、国土地理院コンテンツ利用規約に従って利用できます」。標高タイル（基盤地図情報数値標高モデル）は
    基本測量成果。「ウェブサイトやソフトウェア、アプリケーション上でリアルタイムに読み込んで利用する場合、地理院タイルは出典の明示のみで申請不要」。出典は「国土地理院」または「地理院タイル」等＋一覧ページへのリンク。
    ※ 映像に焼き込む使い方は「リアルタイムに読み込む」場合そのものではない。基本測量成果を映像にして配る前に、「国土地理院の地図の利用手続」で申請の要否を確かめる（未確認）。出典例「出典：国土地理院ウェブサイト。地理院タイルを加工して作成」。
  - 取り方：1 秒に 4 枚まで・一般的な User-Agent・つなぎっぱなし・タイルは保存して取り直さない。
- 国土地理院 全国最新写真（シームレス）ズーム 17（約 1m）：色むらと緑の濃さ（木のある所）だけに使う（低い周波数。影・雪渓・小屋は割って消す）。同じ規約（上）。出典 https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg
  この地理院タイルは「電子国土基本図（オルソ画像）」「森林の空中写真（林野庁）」「地方公共団体等の空中写真」などから作成されたもの（一覧ページの備考）。
- Poly Haven（CC0 1.0。https://polyhaven.com/license ・原本を 2026-11-25 に確認済みの規約：CC0・出典の表示は不要・商用可）：
  - 面の材質（2k）：rock_face_04・quarry_wall・dark_rock_02・gray_rocks（https://polyhaven.com/a/<名前>）
  - 置く岩（1k・立体）：boulder_01・rock_07・rock_09・moon_rock_01/03/05/07・namaqualand_cliff_02・namaqualand_boulder_03/04/06・rock_face_01/02・mountainside・stone_01
  - 取り方：https://api.polyhaven.com/files/<名前> → 作者・ライセンスは work/ground4/{tex,models}/<名前>/info.json に残す。
