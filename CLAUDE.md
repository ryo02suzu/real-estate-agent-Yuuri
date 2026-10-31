@AGENTS.md

# MICHILU（ミチル）で作業する Claude へ

不動産会社の営業が、物件の住所から道路・都市計画・法令・ハザードを調べる Web アプリ。GitHub の Issue から来た依頼（`.github/workflows/claude.yml`、ChatGPT から送られることもある）も、このルールで進める。

- 返事・コメント・コミットは日本語で。専門用語は避け、何をしたか・何で確かめたか・残っていることを短く書く。
- PC（横幅 1024px 以上）の見た目は本番と画素単位で同じに保つ。スマホのメイン画面は `app/page.tsx` のモバイル分岐にあり、関連UIは `components/header.tsx`・`components/search-card.tsx`・`components/result-view.tsx`・`components/history-list.tsx`・`components/full-map.tsx`・`components/location-picker.tsx` などに分かれる。PC画面は `components/desktop-shell.tsx`。
- 調べた情報と確認先を出すだけにする。建てられるか・接道を満たすかなどの法的な判断はしない。
- 住所や座標を自前のサーバーに送らない（静的サイト。データはブラウザから公的な API へ直接読む）。
- 鍵・パスワード・トークンをコード・Issue・コメント・ログに書かない。GitHub の Secrets か Vercel の環境変数に入れる。
- このリポジトリは公開されている。Issue やコメントに、顧客の住所・氏名など個人の情報を書かない。
- 地図・画像・データは利用規約とライセンスを守る。Google の地図や 3D の画像を保存して配らない。出典を消したり隠したりしない。
- 未実装の機能や将来のUI構想（例：「地球 → 日本 → 物件」の連続ズーム）は既存仕様ではない。独立したIssueなどで明示的な実装依頼がない限り、通常の修正に便乗して追加しない。
- main に直接 push しない。ブランチで作業し、PR で出す。
- 変えたら `npm run lint`・`npm run typecheck`・`npm test` を通す。見た目を変えたら、何がどう変わったかを返事に書く。
- 機能を足したり変えたりしたら `docs/features.md` を更新する。
