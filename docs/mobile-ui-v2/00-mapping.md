# モバイルUI刷新 v2：現状記録・F01〜F12対応表（段階1）

Issue #22 の最初の成果物。**このファイルは現行コードを読んだ記録で、ブラウザでの見た目・動作確認ではない。**
（段階1の時点の記録。現在の実装状況・素材・検証・残りの作業は `01-status.md`。F01〜F12の対応表は、その後の実装に合わせて更新している）
基準 main: `817d037f0a014b22f507ffb40a295a9353877980`（作業ブランチ `claude/issue-22-20261031-0155`）

## 1. 前提の確認
- 依存（package.json）: next 16.3.8 / react 19.2.8 / maplibre-gl 6.10.0。今回これらは更新しない。
- 旧ブランチ `claude/issue-21-20261031-0112`: この環境の `git branch -a` に出るのは `main` だけで、取り込める差分は確認できなかった。旧成果は採用していない。
- 現行モバイルの構造: `app/page.tsx` のモバイル分岐が「ホーム（SearchCard＋履歴チップ＋機能紹介カード＋街並み絵）」と「結果（SearchCard compact＋ResultView）」を切り替える。結果は `components/result-view.tsx` の `Found` が1画面に収める作り。`useFit`（result-view.tsx）と `useDense`（sheet.tsx）が文字・項目・地図を自動で縮める。これが新パネルと競合するため、モバイルでは置き換える（PCの `DesktopShell` は触らない）。
- 検索の競合: `run()`（page.tsx）は応答の世代確認がない。A→Bの順に開始してAが遅れて返ると上書きされる。新設計で最初に直す。
- 「戻る」: `history.pushState` に `depth` を積む方式。詳細・パネル段階はまだ履歴に入っていない。

## 2. F01〜F12 対応表
| ID | 現行の場所 | 新UIの入口 | 押した後 | 確認方法（予定） |
| --- | --- | --- | --- | --- |
| F01 住所・地番・地点 | `SearchCard`、`Choose`、`LocationPicker`、`lib/roadmap` の `lookup`/`lookupPoint`、`Place` | ホーム検索パネル／検索編集／結果の「位置の目安（付近・推定・町の中心）」「場所を直す」「地図に重ねて見る」（`PositionBar`、`lib/position-accuracy.ts`） | 候補選択→確定座標へ移動→結果 | 実ブラウザで通し操作、`?q=`/`?ll=` 直開き |
| F02 道路 | `MapButton`、`NearbyRoadsLine`、`useNearbyRoads`、`SheetPreview`（図の範囲） | 結果の最初の導線（公式道路図）と、「図の範囲」「近くの道路」の行（同じパネルの中の詳細） | 公式図を開く／地図で道路を重ねる／PDF図 | 地点指定・入口のみ・PDFの表示区別を維持 |
| F03 都市計画 | `ZoningLine`、`zoning-card.tsx`、`useZoning` | 「都市計画・法令」行 | 詳細→地図レイヤー／確認先 | 出典・時点が残るか |
| F04 その他の法令 | `zoning-card.tsx` 内 | 「都市計画・法令」詳細の中 | 区域の参考情報と担当先 | 同上 |
| F05 災害 | `HazardLine`、`hazard-card.tsx`、`useHazard` | 「災害リスク」行 | 種類別詳細→地図→自治体ハザードマップ | 「データなし≠安全」の文言 |
| F06 地番・建物 | `ParcelButton`、`parcel-card.tsx`、`building-card.tsx` | 「地番・建物」行 | コピー・筆表示・自治体地番図 | 推定の印が残るか |
| F07 上下水道・ガス | `components/zoning-card.tsx` の「上下水道・ガス」タブ（`SuidoRow`・`utilities` の照会先。`components` 全体の検索で確認済み） | 独立した項目行を新設 | 既存の詳細へ | 台帳51市町・照会先212の数字は最新コードの値で表示 |
| F08 地価 | `LandPriceLine`、`land-price-card.tsx` | 「地価」行 | 近隣地点の一覧・詳細・地図、路線価図 | 査定額に見えない表記 |
| F09 駅・周辺・学区 | `StationLine`、`SchoolButton`、`station-card`/`poi-card`/`school-card` | 「駅・周辺施設・学区」行 | 既存カテゴリの詳細 | 直線距離等の注意 |
| F10 窓口 | `ContactCard`、`lib/inquiry.ts` | 各詳細内＋結果下部 | 窓口情報・問い合わせ事項コピー | 電話不可・窓口のみの表示 |
| F11 共有・書類 | `ShareButton`、`CopyButton`、`PrintSheet`、`DraftSheet`、`GuideMapSheet`、`MenuSheet` | 結果の住所の行（共有・住所コピー）＋結果の「共有・書類」行（調査メモの印刷・PDF保存／案内図／重説・物件概要の下書き）＋メニュー | 共有・メモ・案内図・下書き・印刷 | 印刷CSSが壊れないか |
| F12 履歴 | `lib/history.ts`、`HistoryChips`、`HistoryList` | ホーム最近3件＋全履歴5件 | 再検索・消去 | 履歴ゼロの空状態 |

お気に入り・手動の確認記録: コード上では確認していない（未実装として扱い、追加しない）。

## 3. スキル棚卸し（`.claude/skills/` のディレクトリ数＝39）
- 今回の軸: michilu-ui / map / regression / privacy / property-data / issue-delivery。
- 関連箇所に適用: vercel-react-best-practices、vercel-react-view-transitions（検証できる場合のみ）、web-design-guidelines（固定版スナップショット）、source-driven-development、systematic-debugging、verification-before-completion、requesting-code-review。
- 使わない／不可: stitch-*、design-md、site-md、remotion、shadcn-ui、react-vite-dashboard、google-cloud-*（外部ツール・別基盤前提でMICHILUの範囲外）、taste-design（本仕様と競合する指針があるため機械適用しない）、browser-testing-with-devtools（Chrome DevTools MCP が設定されている場合のみ。この環境では未確認）。
- test-driven-development は明示呼び出し時のみ。

## 4. 動きのトークン案（実装時に `app/globals.css` のモバイル限定スコープへ）
press 80/140ms、行 120–160ms、パネル 280–340ms（共通の減速カーブ）、一覧⇄詳細 220–280ms、タブ 160–200ms、日本→地点 900–1400ms（上限1600）、近隣 250–600ms、同一地点 0–250ms、レイヤー 180–240ms、完了表示 約1.5秒、読込完了 120–180ms。`prefers-reduced-motion` では即時／短いフェード。

## 5. 実装順（段階2以降）
1. 検索の世代管理（古い応答の破棄・戻る/キャンセル時の無効化）＋テスト。
2. モバイル専用の日本地図カメラを持つ共有マップ（`live-map.tsx` の関東初期値は変えない）。
3. ホーム／検索編集／結果パネル（小・中・大）／詳細の画面構成。`useFit`/`useDense` は新UIでは使わない。
4. 項目行・メニュー・ポータルにモバイルテーマを適用（PCは影響させない）。
5. `docs/features.md` 更新、Previewでの実ブラウザ確認。
