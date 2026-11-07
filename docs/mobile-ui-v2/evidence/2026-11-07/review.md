# 2026-11-07 実Previewレビュー

対象アプリ SHA `f71c3ff441b9db84f7f803d40d0dfd94c8bea736`。Preview https://michilu-hreufqzgk-sourirettes-projects.vercel.app。
CI https://github.com/ryo02suzu/real-estate-agent-Yuuri/actions/runs/42325142726
lint/typecheck/test/build 成功。999件合格、32件skip。

## 修正

`components/app/home.tsx` の「現在地で調べる」の高さ38pxを、共通HITに上下の余裕を加えた値へ変更。
元の `a27b815` は375px幅で36.25px、390px幅で37.70px、430px幅で41.56px。
一度44pxへ変更した `a6b46ce` では390px Chromiumの下端が親DIVに当たったため、追加の2pxを確保した。
最終版は375pxで45.91px、390pxで45.98px。中央から上下21.9pxの実ヒット判定が両ブラウザの5モバイルサイズで成功した。

## 今回の検証範囲

Ubuntu 26.04のVercel Sandbox / Playwright 1.62.0 / ChromiumとWebKit。
- 両エンジンで375×667、390×844、402×874、430×932、844×390、1024×768、1440×900のホーム。横はみ出し0。モバイルの現在地ボタンを測定。
- 390pxで端末保存の書込み拒否を再現し、メニューで演出をOFF。OFFを保持して東京都庁の公開住所を検索し、演出が出ずに結果へ進むことを両エンジンで確認。
- 新しいブラウザcontextで通常検索も両エンジンで確認。飛行中canvas390×844、結果へ到達。
- 合計16ケース、エラー0。`results.json` に各結果、`preview-check.py` に再現スクリプト。
- 起動時のlaunch-veilが消えるまで待って測定する。初回の早すぎるelementFromPoint測定で覆っていたのは起動画面だった。ボタン寸法の不足と起動中の覆いを区別した。
- [初期画面・飛行・結果描画直後](./f71c3ff-initial-frames.webp) と [結果到達18秒後](./f71c3ff-stable-result.webp) を目視。画像はPNGから縮小/WebP圧縮した実画面。
- 通常検索の画像で日本の地形を確認。結果の背景は描画直後には空いており、18秒後には建物の模型が表示された。全フレームの連続品質、写真品質の要望との整合、出典・文字の読みやすさは引き続きレビュー対象。

今回は現在地を実取得する操作はしていない。実機iPhone、実キーボード、OS文字拡大、全F01〜F12/全PC機能/詳細往復は未完。
PR29とPR23の統合競合、結果画面の見た目とデータ確度/出典、検索競合などが残るためDraftを継続。

## 適用したルール

今回のレビュー担当が適用したもので、Claudeの新規実行を示すものではない。

- michilu-ui（現headのSKILL.mdを確認） 小画面の実タップ領域・PC保持 → home.tsxの1箇所の高さ変更とサイズ別実測。
- michilu-regression 最新SHAでCIと実画面の区別 → 上記CIの実ログと同じSHAの保護Previewを確認。
- systematic-debugging 修正前の再現・原因確認 → 38px指定とCSS縮小を確認。44px修正後も下端のヒット先を確認して再修正。
- verification-before-completion 画像/計測/CIの証拠がある範囲のみ報告 → 16ケース合格と未検証の全機能を区別。
- AGENTS.md 対象バージョンのNextガイド → next@16.4.3を環境へ取得しuse-clientのガイドを参照。
- Chrome DevTools専用スキルは未使用。代替のPlaywrightで実Previewを操作。
- 顧客情報は使わず、認証URLとCookieは環境変数/メモリだけに置き、証跡には含めていない。

## モデルと反映

PR27は反映済み。mainのClaude設定はOpus5.5/Fable5.1の許可指定、effort max、ultracode/enableWorkflows true、small、Workflow許可を保持。
直近の実行済みClaude Actions 41187312208のmodelUsageはOpus5.5と禁止のHaiku5.5を含むため失敗扱い。以後のissue_comment実行一覧も確認した。対策PR28は未マージ。新たなClaude呼び出しは行っていない。Ultracodeの各担当の開始終了・全model/effortの独立確認は引き続き未完。
今回の変更先は開発ブランチとQAブランチ。確認時mainは `21ad68d`、PR23は `d331a25`。本番反映はユーザーの最新Preview承認待ち。
