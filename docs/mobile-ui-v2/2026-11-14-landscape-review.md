# 横向き調査画面のレビュー（2026-11-14）

対象: `a0fa8ce4c6655e502035ee235d8167cd3fdd6940` / [Draft PR #44](https://github.com/ryo02suzu/real-estate-agent-Yuuri/pull/44)
Preview: https://michilu-l2wydnq5m-sourirettes-projects.vercel.app （READY。実画面QAは認証先への移動を自動承認審査が拒否したため未完）

## 再現と修正
基点7c0fb8eで844×390・568×320のChromium/WebKitを操作し、道路本文の隠れない連続高さ0pxと、回転ヒントが住所バーに重なる問題を再現した。
操作欄を左右へ分け、横向きのタブ選択で本文へ移動し、compact時の回転ヒントを非表示にした。変更はmobile-app.tsx、globals.css、features.mdの3ファイル。
最終修正後のファイルをアップロード候補と文字単位で照合し、その候補をa0fa8ceへ保存した。

## 検証済み範囲
- lint/typecheck/test/build成功。テスト2047 passed / 32 skipped。同SHAの[CI 43578390801](https://github.com/ryo02suzu/real-estate-agent-Yuuri/actions/runs/43578390801)も成功。
- Ubuntu 26.04、Playwright1.62.0、Chromium151.0.7922.34 / WebKit26.5のローカル静的ビルドで標準18＋追加12＝30ケース成功。
- 公開施設（東京都庁）の検索→6タブ→戻る、44pxの中央と軸方向のタップ判定、入力の初期化待ち、縦横切替、通常/低減モーションを確認。
- 844×390の道路本文は203px / 202px、568×320は130px / 129px、844×390既存DOM文字200%は149px / 149px。compact時のヒントと住所バーの重なりなし。
- Chromium844道路、WebKit568道路、WebKit844既存DOM文字200%道路の画像を目視し、同じ重なりが消えたことを確認。
- 今回のQA更新は同SHAを指定して上記30ケースと既存の地図/飛行QAをActionsで再実行し、画像とJSONをartifactへ保存する。新runの成功を先取りしない。

## スキル適用記録
これは今回のCodexによる修正/レビューへの適用記録であり、Claudeが使用した証拠ではない。
| スキル | 適用した具体的ルール | 反映と証拠 |
| --- | --- | --- |
| michilu-ui | 調査結果を見栄えのために隠さない。低い画面・タップ領域・折返しを検証 | globals.cssの横向き左右配置、mobile-app.tsxのタブ移動。本文高さと44px操作を計測 |
| michilu-regression | lint/typecheck/test/build、モバイルとPCを実際に確認し未確認範囲を区別 | 同SHA CIと30ケース。PCはホームのみ、全機能回帰は未完と記載 |
| michilu-privacy | 公開GitHubに顧客住所や秘密を出さない。出典を消さない | 東京都庁のみで試験。回転ヒントのみ非表示で出典は対象外。認証保護の設定・共有範囲は変更なし |
| michilu-issue-delivery | 最小変更、features.md更新、mainへ直接pushせずPR | 3ファイルの差分、Draft PR #44。モデル呼出しとmain更新は行わない |
| verification-before-completion | 証拠を確認してから報告し、成功と未確認を区別 | 最終CSS追記後に再テスト、修正前4ケースで再現、修正後30ケースを確認。Preview未完のため完成扱いにしない |
| michilu-map | 画面を見ずに地図確認済みと言わない。低減モーションと描画を確認 | 既存flight QAのcanvas高さと中断/失敗条件を維持し、同SHAへ更新。全地図動作は新runで判定 |

systematic-debuggingは前回の原因特定（上下固定要素による本文0px、compact時のヒント重なり）で適用。今回新たにClaudeへ実行を依頼していない。Chrome DevTools依存スキルは未使用。全39スキルの機械的読込や「インストール済＝使用済」の扱いはしない。

## 未完の条件
- 実Vercel Previewの認証後操作、実機iPhone、実キーボード、iOS Dynamic Type。
- 200%は既存DOMの計算済フォントの一回の拡大。後からマウントされたパネル全体の200%は未検証。
- PC1024/1440はホームのスモークのみ。全機能/画素比較、F01〜F12、検索競合、地図→詳細→戻るの全異常系は未完。
- mainは別経路でPR40〜43が反映され74f18b8へ進んだ。a0fa8ceは7c0fb8e基点なので、最新main統合後の回帰も必要。
- PR27はmain反映済み。最後の実Claude run41187312208/job124496745785のmodelUsageはOpus5.5と禁止Haiku5.5を含み、モデル要件は失敗。PR28未反映につき新規呼出し保留。設定のeffort=maxだけでは各担当の実動を証明できず、Ultracode Workflow/サブエージェント実行証跡は未確認。
- PR23/44はDraftを維持。15分監視は追加しない。mainマージ/自動マージ/本番デプロイは行わない。

## 22:54 JST の追記
- Actions [43601401533](https://github.com/ryo02suzu/real-estate-agent-Yuuri/actions/runs/43601401533) の標準18＋追加12＝30ケースが成功。artifact 14116925938 のJSONでも対象a0fa8ceと30成功を確認した。
- PR44の最新main統合候補（GitHub一時merge commit f6bbb8d / main74f18b8）は [CI 43601129938](https://github.com/ryo02suzu/real-estate-agent-Yuuri/actions/runs/43601129938) 成功、2057 passed / 32 skipped。ブラウザQAはa0fa8ce単体であり、統合候補の全機能QAではない。
- Issue22本文と過去の承認記録を再照合した。承認された導線は日本地図→検索地点→調査概要→詳細。現在main側の地球演出への方針変更は確認できない。PR44は横向き可読性の補助修正であり、PR23の仕様v2を置き換えず、仕様v2の完成証拠として扱わない。
- PR23 head d331a25e728b03e75b18664555a9fcfd1db609b1 は変更なし。対応Preview https://michilu-dbqcxx8b5-sourirettes-projects.vercel.app はREADY。承認仕様を対象にした独立QAで地図の高さ0、画面幅、検索→都市計画詳細→戻るを再確認する。地図レイアウトを書き換える診断用CSSは除去し、本来の画面で判定する。
- PR27は反映済み、Actionsログのインストール行でCLI2.1.316を確認。Workflowと2担当の起動はClaudeの報告にはあるが、残存Actionsログには実ツール呼出しを検証できるセッション証跡がない。最終modelUsageの禁止Haiku混入は別途確認できるため、要件成功とは扱わない。
