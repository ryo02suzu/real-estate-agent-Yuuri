# ChatGPT で相談した内容を、GitHub 経由で Claude に送る

流れ：ChatGPT で相談する →「Claude に送って」と頼む → ChatGPT が依頼の文面を見せて確認する → GitHub に Issue ができる →
GitHub 上の Claude が作業し、同じ Issue に返事を書き、変更はブランチと PR にする →「返事を見て」と頼むと ChatGPT が要約する。

GitHub 上の Claude は、この会話（Claude Code のセッション）の記憶を持たない。守るルールは `CLAUDE.md` に書いてある。

## 1. GitHub 側（Claude が動くようにする）

1. **Claude GitHub App** をこのリポジトリに入れる：https://github.com/apps/claude （入っていればそのまま）。
2. **認証の秘密**を、リポジトリの Settings → Secrets and variables → Actions に登録する。会話やコードには貼らない。
   - `CLAUDE_CODE_OAUTH_TOKEN`（今の設定）：Claude のサブスクリプション（Pro・Max など）の枠で動く。パソコンに Claude Code を入れて、
     ターミナルで `claude setup-token` を実行すると出る。
     - **パソコンが無いとき（iPad の Safari など）**：GitHub の Codespaces（ブラウザーの中のパソコン）を
       このブランチで作り（https://codespaces.new/ryo02suzu/real-estate-agent-Yuuri/tree/claude/system-feedback-eggn72 ）、
       ターミナルで `bash scripts/claude-token.sh` を動かす。トークンを作って確かめ、Secrets に登録するところまで進む。
       Claude のログイン画面は、戻り先を「コードを表示するページ」にして開く（そのままだと戻り先が Codespace の中になり、iPad からは開けない）。
       出たコードはターミナルに貼って改行する。iPad では、ターミナルを長押ししても貼り付けが出ないことがあるので、キーボードの貼り付けのボタンか、コマンド パレットの「貼り付け」を使う。トークンは画面に出さずに読み取る。
       Codespaces の標準の権限では Secrets を書けないので、途中で GitHub に一度ログインし、登録したらすぐログアウトする。
       終わったら https://github.com/codespaces で Codespace を消す。
   - `ANTHROPIC_API_KEY`：Claude Console（https://platform.claude.com）の API キー。使った分だけ料金がかかる。使うときは
     `.github/workflows/claude.yml` の `claude_code_oauth_token` の行を `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}` に替える。
3. `.github/workflows/claude.yml` を **main に入れる**。Issue やコメントで動く仕組みは、main にあるファイルだけが使われる。
4. 試す：Issue を作り、本文に「`@claude README の 1 行目を読んで、日本語で返事して`」と書く。数分で Claude が返事を書く。

動かせるのは、このリポジトリに書き込める人だけ（ほかの人・ボットのコメントでは動かない）。公開リポジトリなので、GitHub Actions の時間は無料。

## 2. ChatGPT 側（GitHub に送れる GPT を作る）

GPT を作るには ChatGPT の有料プランが要る。

1. **GitHub のトークン**を作る：GitHub の Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token。
   - Repository access：Only select repositories → `real-estate-agent-Yuuri` だけ
   - Permissions：Issues を Read and write（ほかは付けない）
   - 期限：90 日など（切れたら作り直して GPT に入れ直す）
2. ChatGPT で **GPT を作る**（GPT を探す → 作成 → 構成）。
   - 名前：MICHILU 相談（何でもよい）
   - 指示：下の「GPT の指示」を貼る
   - アクション → 新しいアクションを作成：
     - スキーマ：`docs/chatgpt-github-action.yaml` の中身を全部貼る
     - 認証：API キー → 認証の種類「Bearer」→ 1 で作ったトークンを貼る（この GPT の設定の中だけに入る）
   - 公開範囲：**自分だけ**（ほかの人がこの GPT から Claude を動かせないように）
3. 試す：GPT に「テストで Claude に README の 1 行目を聞いて」と頼む。送る前に確認が出るので許可する。

### GPT の指示（貼る文）

```
あなたは MICHILU（不動産会社の営業向けの調査アプリ）の開発の相談相手です。
ユーザーと話して決まった開発の依頼を、GitHub の Issue として Claude（開発を担当する AI）に送ります。

送るとき
1. 依頼の文面を下の形で作り、ユーザーに見せて「この内容で送ってよいか」を確認する。
2. 了承されたら createIssue で送る。題名は短く。本文の先頭の行は必ず「@claude」。
3. 送ったら Issue の番号と URL を伝える。

本文の形
@claude
## やってほしいこと
## 理由・背景
## 守ること・やらないこと
## 終わったと判断する条件
## 参考（画面の説明・URL など）

追加の指示は addIssueComment で、先頭の行に「@claude」を付けて送る。
「進み具合は？」「返事を見て」と言われたら listIssueComments で Claude の返事を読み、要点を日本語で短く伝える。
番号が分からないときは listIssues で探す。

送ってはいけないもの
- API キー・パスワード・トークン（鍵はユーザーが GitHub や Vercel の設定画面に自分で登録する）
- お客様の住所・氏名・電話番号など個人の情報（このリポジトリは誰でも見られる）
- 社外秘の情報
- 利用規約やライセンスに反する依頼
```

## 3. 気をつけること

- **公開される**：このリポジトリは公開されているので、Issue・コメント・Claude の返事は誰でも読める。個人の情報・鍵・社外秘は書かない。
- **料金**：Claude はサブスクリプションの枠（または API の従量）を使う。1 回の依頼は 60 分まで（`timeout-minutes`）。
- **変更の取り込み**：Claude はブランチと PR を作るだけで、main には直接入れない。内容を見てから取り込む。
- **トークンの管理**：GitHub のトークンは GPT の設定の中だけに置く。漏れたら GitHub の設定ですぐ消して作り直す。
