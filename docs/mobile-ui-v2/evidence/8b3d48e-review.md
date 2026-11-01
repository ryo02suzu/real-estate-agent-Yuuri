# MICHILU UI 開発レビュー — 2026-11-01

対象アプリ: `8b3d48e1e78bb36520e7888efcff8f19e82b5169` / PR #29（Draft、統合先 PR #23）。
Preview: https://michilu-52rfpix1g-sourirettes-projects.vercel.app
Vercel deployment: `dpl_cYKh8tFGLyaLbckdfuktCLgDuik4`（READY、Git SHA一致を確認）。

## 修正と結果

- 前回の `0a347ce`: 飛行を native dialog にし、背景操作を止める。44px以上のスキップ、Esc/Enter/Space、Tab保持、結果へのフォーカス復帰、途中の低減モーションへの切替を実装。
- 今回の `8b3d48e`: 低い画面では検索欄上の余白を縮め、検索/クリアを44 CSS px以上に調整。200%文字時の見出し行間・ナビの高さ/折返しを修正。ホームの透過面を濃くし、例や履歴の文字を折返す。PC用コンポーネントは変更なし。
- `docs/features.md` に動作を反映。

修正前の実Preview `0a347ce` でも測定した。390px幅のクリアは33.73×43.66px、検索は41.67×41.67px。844×390で検索欄がスクロール領域に収まらず、文字2倍で31pxフォントに行高25px、ナビラベルもはみ出した。
修正後の実Preview `8b3d48e` では390px幅で両ボタン44×44px、横向きで検索欄が収まり、31pxフォントの行高49.6px、ナビラベルのはみ出しなし。単なる期待値の変更ではなく、修正前の再現と修正後の測定を保存している。

## 検証環境を区別する

| 対象 | 結果 | 証拠 |
| --- | --- | --- |
| アプリCI、正確なhead | lint/typecheck/test/build成功、791 passed /31 skipped | [CI 41269672846](https://github.com/ryo02suzu/real-estate-agent-Yuuri/actions/runs/41269672846) |
| GH runner静的ビルド | 27ケース、25合格+文字2倍/キーボード相当の画面再現2件、失敗0、JS例外0 | [QA 41269540310](https://github.com/ryo02suzu/real-estate-agent-Yuuri/actions/runs/41269540310)、artifact 13069320201 |
| 上記Vercel Preview実画面 | Playwright 1.62、Chromium 151.0.7922.34 / WebKit 26.5、Linux Vercel Sandbox。27ケース、25合格+画面再現2件、失敗0、JS例外0、exit 0 | [全JSON・再現スクリプト・比較測定ZIP](./8b3d48e-preview-evidence.zip)、[画面一覧](./8b3d48e-preview-contact.webp) |
| 実機iPhone / iOS Safari / 実キーボード / OS文字サイズ | 未実施 | ブラウザのサイズ・font-size再現で代替したとは扱わない |

Chromium: 375/390/402/430px、844×390、1024×768、1440×900。WebKit: 375/390px、844×390。
飛行: 通常/タップ/ESC/Enter/Space/初期低減/途中低減/設定OFF/タイル失敗。両エンジンでEsc・Enter・Space・途中低減を確認。地図canvasの高さ0を不合格にする検証を維持。検索に使ったのは東京都庁の公開住所。

ZIP SHA-256: `0135f04a35e352f5d729096797447ec11eef61437fd2ef7402226ca15908fe86`（210932 bytes、転送後に照合）。
ZIP内: `report.json`、`baseline-report.json`、`preview-layout-review.py`、`preview-contact.webp`。
画面一覧は実PreviewのPNGから縮小・WebP圧縮したもの。見た目の加工・画面の差替えはしていない。文字2倍画像はフォントサイズの人工的再現で、iOS Dynamic Typeではない。保護Previewに出るVercelの補助UIはアプリの要素と区別する。認証URL/Cookieは含まない。検証後Sandboxを停止。

## まだ完成ではない

操作アサーション25件の合格は、全UI品質やF01〜F12の完了を意味しない。

- 初期の地球→日本を判別できる連続描画は今回の採取フレームでは未確認。星空のみのフレームもある。canvas寸法の合格だけで地図の視覚品質を合格にしない。連続フレーム/動画でタイル読込・開始時表示・日本経由を追加確認する。
- 文字2倍で行間/ナビの切れは改善したが、読みやすさ・透過面のコントラストとモーション終了後の安定した画面を再評価する。横向きは検索が使えることを確認した段階で、結果パネル全体の再設計・詳細往復は未完。
- PC 1024/1440の初期ホームを採取。全PC機能の回帰、地図の読込完了後のタイル全面描画、F01〜F12/検索競合/各詳細/戻るは未完。
- PR #29 と #23 は競合あり。80コミット/246ファイルの比較を小さな単位で統合し、#23側の仕様・39スキル・データ機能・mainのモデル制限を保つ。
- `components/app/motion.ts` の保存拒否時フォールバックは引き続き確認・修正が必要。
- 実機iPhoneとユーザーの最新Preview承認は未取得。PR #23/#29はDraft。mainは `9bb030fd73a48a9036dc74512d4457879dd0f9f6` のまま、このレビューでは変更なし。

## スキル適用の記録（今回のレビュー担当による適用）

Claudeが今回使用した証跡とは区別する。最新のClaude Actionsを新たに起動していない。

| 参照 | 具体的ルール | 反映先・検証 |
| --- | --- | --- |
| michilu-ui（#23側 d331a25） | 小画面・横向き・キーボード・操作対象・低減モーション、PC維持 | home/frame/globe-flight/mobile-app。44px測定、低い画面、font-size2倍、両ブラウザのスキップ |
| michilu-regression | 最新SHAで機能・PC回帰を区別し検証 | CI 41269672846 + QA 41269540310 + 実Preview。F01〜F12未実施部分は未完 |
| verification-before-completion | 新しい実行結果がある範囲だけ合格とする | exit 0・JSON・SHA・画像。25合格と2再現を区別し完成通知なし |
| vercel React best practices | 派生値を不要なeffect/stateにしない。動的読込を保つ | compactを既存screen値から導出。Reactコンポーネント修正後にlint/typecheck/test/build |
| AGENTS / インストール済みNext 16.3.8 guide | 変更前に対象バージョンのclient guideを読む | QA artifact内のnode_modules由来 use-client guideを参照。browser APIはclient component内 |
| protected Vercel deployment / Sandbox | 保護を無効化せず認証して実環境を確認、証跡に秘密を残さない | 一時認証は環境変数/メモリ内Cookieのみ、公開施設で検証、Sandbox停止 |

Chrome DevTools専用スキルは対応ツール環境がなく未使用。Playwrightによる実Preview検証を別途行った。無関係な全39スキルの機械的読込はしていない。

## Claudeモデルのブロッカー

PR #27はmainへ反映済み。直近の実Claude [run 41187312208](https://github.com/ryo02suzu/real-estate-agent-Yuuri/actions/runs/41187312208) は CLI 2.1.316 / Opus 5.5 / effort max とUltracode関連設定がある一方、終了時modelUsageに許可外 `claude-haiku-5-5` が含まれる。Actions成功でもモデル要件は失敗と判定する。
[対策PR #28](https://github.com/ryo02suzu/real-estate-agent-Yuuri/pull/28)は未反映。別モデルへの変更や新規Claude起動は行っていない。Ultracodeの実Workflow/サブエージェント起動は独立証跡が不足し未確認。UI修正とモデルを呼ばないQAを継続する。
