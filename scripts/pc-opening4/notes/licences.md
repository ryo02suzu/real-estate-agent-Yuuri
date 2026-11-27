# 第4版オープニング：素材ライセンス確認（2026-11-27 時点）

使い方：描いた CG 映像（データを地形に貼り・調色・照明したもの。配るのは映像だけ）を、会社が運営する公開 Web アプリに埋め込む（営利の場面）。
方法：各原本ページを取得し、決め手の文を原文のまま引用。取得できなかったものは「不明」とし、記憶では埋めていない。
注意：ページの取得は要約を挟む道具で行ったため、引用は原文どおりに見えるが、出荷前に人の目で原本を一度見直すのが安全。

## 1. 国土地理院（GSI）

### 1-1 標高タイル（dem_png / dem5a_png / dem1a_png）  判定：出典を書けば使える（申請は不要と読める）。ただし念のため問い合わせ推奨
- 一覧 https://maps.gsi.go.jp/development/ichiran.html の備考：データは「"基盤地図情報数値標高モデル"を線形的に平滑化することによって得られた値」。提供範囲は DEM1A 1～17、DEM5A 1～15、DEM10B 1～14 のズーム。
- 同一覧「地理院タイルは、国土地理院コンテンツ利用規約に従って利用できます。」
- 利用規約 https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html（令和7年11月20日改正）：「本サイトのコンテンツには特段の記載が無い限り公共データ利用規約（第1.0 版）（PDL1.0）が適用されています。」「コンテンツを利用する際は、出典を記載してください。」「コンテンツを編集・加工等して利用する場合は、上記出典とは別に、編集・加工等を行ったことを記載してください。」「編集・加工した情報を、あたかも国土地理院が作成したかのような態様で公表・利用してはいけません。」
- 利用手続 https://www.gsi.go.jp/LAW/2930-index.html：「申請は不要で出典の明示だけで利用できる場合」「デザイン、内部利用、テレビ番組、書籍の挿入図などは申請不要！」「※申請不要の場合は、出典を記載してご利用ください。」／同ページ：基本測量成果の標準地図・淡色地図などの地理院タイルはこの手続の対象。
- Q&A https://www.gsi.go.jp/LAW/2930-qa.html Q1-12：「地理院タイルは出典の明示のみで申請不要でご利用いただけます。」Q1-8：「ニュース番組、ドラマ、動画、オンライン配信（授業）等での内容補足のため、地図等を画面に表示して利用する場合」は「テレビ番組で利用」にあたる。Q1-16：「複製を行わない場合には国土地理院の承認を必要としません。」Q1-19：「ただし、タイルによっては「国土地理院」または「地理院タイル」等の出所明示に加えて、個別の明示が必要な場合があります。」
- 未確定の点：標高は「基盤地図情報」由来の測量成果。上記は「リアルタイム表示のウェブ・アプリ」と「テレビ番組・動画で画面に表示」について書かれたもので、「標高を地形に変換して CG に描いた映像を配る」ことを名指しした記述は見つからなかった（動画・CG の語は利用手続ページになし）。
- 付ける文言（案）：
  「出典：国土地理院（標高：地理院タイル。基盤地図情報数値標高モデルを加工して作成）」
  ＋編集・加工の注記「地理院タイルを加工して CG 映像を作成（国土地理院が作成したものではありません）」

### 1-2 全国最新写真（seamlessphoto）  判定：出典を書けば使える（測量成果ではない扱い。申請不要）。低ズームは追加の出典が要る
- 一覧：写真は「■2. 基本測量成果以外で出典の記載のみで利用可能なもの」に属する。「出典は「国土地理院」または「地理院タイル」等と記載してください。」
- 「地理院タイルをウェブサイトやソフトウェア、アプリケーション上でリアルタイムに読み込んで利用する場合、地理院タイルは出典の明示のみで申請不要でご利用いただけます。」
- ズーム14～18：「この地理院タイルは「電子国土基本図（オルソ画像）」、「東日本大震災後正射画像」、「森林（国有林・民有林）の空中写真（林野庁）」、「地方公共団体等の空中写真」、「簡易空中写真」、「国土画像情報」から作成しております。」GRUS 画像を含む場合は追加で「GRUS画像（© Axelspace）」。
- ズーム9～13（ランドサットモザイク）：「データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO）」
- ズーム2～8（世界衛星モザイク）：「Images on 世界衛星モザイク画像 obtained from site https://lpdaac.usgs.gov/data_access maintained by the NASA Land Processes Distributed Active Archive Center (LP DAAC), USGS/Earth Resources Observation and Science (EROS) Center, Sioux Falls, South Dakota (Year). Source of image data product.」（Year は取得年を入れる）
- 付ける文言（案）：「出典：国土地理院（地理院タイル 全国最新写真（シームレス））。写真を加工して CG 映像を作成。／データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO）」。使うズームに応じて上の LP DAAC 文言と GRUS を足す。
- 未確定の点：動画・CG の頒布を名指しした記述は見つからず。利用規約の PDL1.0 は営利を妨げない公共データ規約として知られるが、今回の取得では営利の記述そのものは確認できていない（PDL1.0 の原文は未取得）。
- 実務：「出典の明示で足りる」と読めるが、確実にしたいなら GSI の問い合わせ窓口へ「描いた映像のみを配る」旨を事前確認する（任意）。

## 2. 地球儀の場面

### 2-1 NASA Blue Marble Next Generation（昼）  判定：ok-with-credit（出典表示。ただし個別の使用条件の原文は未確認）
- https://science.nasa.gov/earth/earth-observatory/collections/blue-marble ：「NASA's Blue Marble Next Generation–12 months of high-resolution global true color satellite imagery.」ページに個別の利用条件・クレジット行は無かった。
- 取得できず：Visible Earth の個別画像ページ（credit 行）、Earthdata データ情報方針（403）。個別の明示が無いため NASA 共通指針に従う（2-3）。
- 付ける文言（案）：「Blue Marble Next Generation: NASA Earth Observatory（NASA Goddard Space Flight Center）」。正確なクレジット行は、使う画像の Visible Earth の個別ページで確認してから確定する。→ unclear（個別ページ未確認）

### 2-2 NASA Black Marble（夜の灯り）  判定：unclear
- Earth Observatory のページに Black Marble の利用条件・クレジットの記載は無かった（取得した範囲）。個別の Black Marble 製品ページ（blackmarble.gsfc.nasa.gov 等）は今回未取得。
- 不足：製品ページのクレジット行（例：NASA Earth Observatory / NASA Black Marble の表記）の原文。確認後に確定。

### 2-3 NASA メディア利用指針 https://www.nasa.gov/nasa-brand-center/images-and-media/  判定：ok-with-credit（商品の推奨と見せない条件つき）
- 「NASA imagery can be generally used editorially within published works that are not promotional in nature.」
- 「NASA content used in a factual manner that does not imply endorsement may be used without needing explicit permission.」
- 「it must not explicitly or implicitly convey NASA's endorsement of commercial goods or services.」
- 「NASA should be acknowledged as the source of the material.」
- 「The NASA Insignia, Logotype, identifiers, and imagery are not in the public domain.」（NASA のロゴ・エンブレムは使わない）
- 注意：MICHILU は営利のアプリで、映像は宣伝的な面もある。「NASA が推奨している」と見えないようにし（ロゴを使わない）、「NASA のデータを使用」と事実として書くにとどめる。心配なら NASA の問い合わせ先（同ページ記載）に確認。
- 付ける文言（案）：「地球の画像：NASA（Blue Marble / Black Marble）のデータを加工して作成。NASA が本アプリを推奨するものではありません。」

### 2-4 Natural Earth  判定：ok（クレジット不要）。任意で表記
- https://www.naturalearthdata.com/about/terms-of-use/ ：「All versions of Natural Earth raster + vector map data found on this website are in the public domain.」「…invites you to use them for personal, educational, and commercial purposes.」「Crediting the authors is unnecessary.」（任意の例：「Made with Natural Earth.」）

### 2-5 GEBCO（海底地形）  判定：ok-with-credit（出典表示。細かい条件は未確認）
- https://www.gebco.net/data-products/gridded-bathymetry-data ：「The GEBCO Grid is placed in the public domain and may be used free of charge.」「Use of the GEBCO Grid indicates that the user accepts the conditions of use and disclaimer information」
- 出典：「GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid」＋ DOI https://doi.org/10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa （使う版の年に合わせて書き換える。2025 版を使うなら 2025 版の表記を原本で確認）。
- 不足：別ページの利用条件・免責の本文（取得先が 404 で未取得）。営利利用の記述は今回確認できていない。

## 3. Poly Haven  判定：ok（クレジット不要）
- https://polyhaven.com/license ：「Our assets are all licensed as CC0」（HDRI・テクスチャ・3D モデルの全種類を対象と記載）。「You can use our assets for any purpose」。「You do not need to give credit」（あれば喜ばれる）。
- 例外：「All content on this website, excluding the CC0 assets themselves」は保護対象（ロゴ・ユーザーのアイコン・見本レンダー・文章など）。素材そのもの以外は使わない。
- 任意の表記：「HDRI・テクスチャ：Poly Haven（CC0）」。

## 次にやること（人か次の担当）
1. GSI：標高の「CG に加工した映像」について、問い合わせ窓口に事前確認する（任意だが推奨）。
2. NASA Blue Marble / Black Marble：使う画像の個別ページでクレジット行を確定。
3. GEBCO：利用条件ページの本文を確認。
4. クレジット表記は、アプリの「出典」画面か映像の説明に入れる（出典を消さない）。
