# 埼玉県・建築基準法上の道路の調べ方（人口上位12市）

調査日: 2026-09-23。データ本体は `lib/roadmap/municipalities.ts`。

## 前提

- 埼玉は **全40市＋松伏町・杉戸町が自前で道路種別を管理**。残り20町は県がまとめて ArcGIS で公開（[県ページ](https://www.pref.saitama.lg.jp/a1106/kenntikuhudousann/kentikukizyunnhounikannsurukoto/04dai3syoutosikeikakukuikitouniokerukenntikubutunosikitikouzoukenntikusetubioyobiyouto/42zyousiteidourozunoho-mupe-zikoukai.html)）。
- 「公道か（道路台帳・認定路線）」と「建築基準法上の道路か（指定道路図）」は**別の地図**。再建築可否に効くのは後者。

## 一覧

| 市 | ネット公開 | 地図 | 座標で直接開く | 問い合わせ |
|---|---|---|---|---|
| さいたま市 | △ 位置指定道路のみ | Sonicweb 指定道路図 th_45 ／ 認定路線 th_31 | ✅ 確認済み | 北部／南部建設事務所 建築指導課 |
| 川口市 | △ | geocloud 指定道路マップ | ⚠️ URL形式は市公式、実機未確認 | 建築安全課 048-242-6344 / 048-258-1199 |
| 川越市 | ✕（市道のみ） | wagmap 道路台帳・網図 | ⚠️ 越谷等と同じ仕組み、位置は未確認 | 建設管理課 049-224-5987 |
| 所沢市 | ✕（市道のみ） | alandis 地理情報システム | ✕ 入口のみ | 建築指導課 メール a9180@city.tokorozawa.lg.jp（電話不可） |
| 越谷市 | ◎ 全種別 | wagmap 建築基準法上の道路種別 mid=31 | ✅ 確認済み | — |
| 草加市 | ✕（市道のみ） | 道路台帳図 | ✕ 入口のみ | 建築安全課 048-922-1958（電話可） |
| 春日部市 | ✕（市道のみ） | かすかべオラナビ | ✕ 入口のみ | 建築課 048-796-8046（**窓口のみ**） |
| 上尾市 | ◎ 全種別 | wagmap 指定道路図 mid=9 | ✅ 確認済み | — |
| 熊谷市 | △ 位置指定道路のみ | wagmap 位置指定道路 mid=170 ／ 道路台帳 mid=90 | ✅ 確認済み | — |
| 新座市 | △ 位置指定道路のみ | 静的な図面ページ／にいざマップ | ✕ 入口のみ | 建築審査課 |
| 久喜市 | ✕ | — | — | 建築指導課（判定依頼書が必要） |
| 狭山市 | ○ | Web地図（座標URL未調査） | ✕ 入口のみ | 建築住宅課 04-2946-8234 |

## 技術メモ

- **wagmap は座標を旧日本測地系で受け取る**。世界測地系のまま渡すと北西に約450mずれる。`lib/roadmap/datum.ts` で変換済み（熊谷・越谷・上尾は市役所の住所で中心一致を確認）。
- Sonicweb（さいたま市）は世界測地系のまま、変換なしで一致。
- どちらも利用規約の同意画面が出るが、**同意後も座標は保持される**。
- 住所→座標は国土地理院 AddressSearch、座標→市区町村は国土地理院 逆ジオコーダ（どちらも無料・キー不要）。
- 自治体GISの規約（例: 世田谷区）には「不動産取引のための資料として用いることはできません」とあるものがある。**アプリは地図を開くだけ・最終確認は窓口**という位置づけを崩さないこと。

## 出典

- [国交省 指定道路図のインターネット公開状況（R5.4.1）](https://www.mlit.go.jp/jutakukentiku/build/content/001475637.pdf)
- [さいたま市指定道路図について](https://www.city.saitama.lg.jp/005/003/001/p040959.html)
- [川口市 指定道路マップ](https://www.city.kawaguchi.lg.jp/soshiki/01130/060/4/21137.html)
- [所沢市 建築基準法上の道路種別](https://www.city.tokorozawa.saitama.jp/kurashi/jutaku/tatemono/kentikukijyunhodoro/dourosyubetsu.html)
- [草加市 建築基準法上の取扱い](https://www.city.soka.saitama.jp/cont/s1901/030/020/010/PAGE000000000000084176.html)
- [春日部市 建築基準法の道路種別](https://www.city.kasukabe.lg.jp/soshikikarasagasu/kenchikuka/gyomuannai/1/4456.html)
- [久喜市 道路種別判定について](https://www.city.kuki.lg.jp/machizukuri/city_plan/kenchiku/1008507.html)
- [狭山市 道路種別の確認方法](https://www.city.sayama.saitama.jp/jigyo/kaihatsu/douro_shoukai_tel.html)
- [新座市 道路情報](https://www.city.niiza.lg.jp/soshiki/33/niizamap-douro.html)
- [越谷市](https://www2.wagmap.jp/koshigayacity/Portal) / [上尾市](https://www2.wagmap.jp/ageocity/Portal) / [熊谷市](https://www2.wagmap.jp/kumagaya/Portal) / [川越市](https://www2.wagmap.jp/kawagoe/Portal)
