#!/usr/bin/env bash
# パソコンが無くても（iPad の Safari だけで）Claude の長期トークンを作り、このリポジトリの Secrets に登録する。
# GitHub の Codespaces（ブラウザーの中で動くパソコン）のターミナルで動かす：  bash scripts/claude-token.sh
#  1. Claude Code を入れて `claude setup-token` を動かす。ログイン画面は、戻り先を「コードを表示するページ」にして開く
#     （そのままだと戻り先がこの機械の localhost になり、iPad からは開けない）
#  2. 画面に出たトークンを記録から読み取り、Claude Code で一度使って確かめる
#  3. Secrets の CLAUDE_CODE_OAUTH_TOKEN に登録する。Codespaces の標準の権限では書けないので、
#     そのときは GitHub に一度ログインして登録し、すぐログアウトする
# トークンを含む作業用のファイルは最後に消す。終わったら Codespace ごと消す。手順は docs/chatgpt-to-claude.md
set -euo pipefail

REPO=ryo02suzu/real-estate-agent-Yuuri
SECRET=CLAUDE_CODE_OAUTH_TOKEN
CLAUDE="$HOME/.local/bin/claude"

if [ "${CODESPACES:-}" != true ] || [ -z "${BROWSER:-}" ]; then
  echo "これは GitHub の Codespaces で動かすためのものです。パソコンでは claude setup-token を使ってください（docs/chatgpt-to-claude.md）。"
  exit 1
fi
for c in python3 script gh curl; do
  command -v "$c" > /dev/null || { echo "$c が見つかりません。Codespace を標準の設定で作り直してください。"; exit 1; }
done

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [ ! -x "$CLAUDE" ]; then
  echo "Claude Code を入れています（1 分ほど）…"
  curl -fsSL https://claude.ai/install.sh | bash > /dev/null
fi

# ログイン画面を開く係（Claude Code が BROWSER として呼ぶ）。Codespaces のブラウザー（iPad の Safari）で開く
cat > "$WORK/open" <<'PY'
#!/usr/bin/env python3
import os, re, subprocess, sys, time

CODE_PAGE = "redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback"
url = re.sub(r"redirect_uri=http%3A%2F%2Flocalhost%3A\d+%2Fcallback", CODE_PAGE, sys.argv[1])
if "localhost" in url:
    # 形式が変わっていたら、画面に出る「手で開く用」のリンク（端末のリンクの記号の中）を待って開く
    if os.fork():
        sys.exit(0)
    url = None
    for _ in range(60):
        time.sleep(0.5)
        with open(os.environ["TOKEN_LOG"], encoding="utf-8", errors="replace") as f:
            links = re.findall(r"\x1b\]8;[^;]*;(https://[^\x07\x1b]*oauth/authorize[^\x07\x1b]*)", f.read())
        links = [u for u in links if "localhost" not in u]
        if links:
            url = links[-1]
            break
    if url is None:
        sys.exit(1)
subprocess.run([os.environ["REAL_BROWSER"], url], check=False)
PY
chmod +x "$WORK/open"

cat <<'MSG'

① Claude のログイン
  このあと画面に「Open」（開く）が出たら押してください。Claude のページが新しいタブで開きます。
  「Authorize」（承認）を押すとコードが出るので、「Copy Code」でコピーします。
  このタブに戻り、「Paste code here if prompted >」の所をタップして貼り付け、改行キーを押してください。

MSG
read -r -p "準備ができたら改行キーを押してください " _

if ! REAL_BROWSER="$BROWSER" TOKEN_LOG="$WORK/log" BROWSER="$WORK/open" \
  script -q -f -e -c "'$CLAUDE' setup-token" "$WORK/log"; then
  echo "トークンを作れませんでした。もう一度 bash scripts/claude-token.sh を動かしてください。"
  exit 1
fi

# 画面の記録からトークンを読む。画面の幅で折り返されて何行かに分かれているので、続きの行をつなぐ
TOKEN=$(python3 - "$WORK/log" <<'PY'
import re, sys

# newline="" で、行の区切り（\r\r\n）を勝手に改行に替えない
raw = open(sys.argv[1], encoding="utf-8", errors="replace", newline="").read()
i = raw.rfind("sk-ant-oat")
if i < 0:
    sys.exit(1)
plain = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[()][0-9A-Za-z]|\x1b[=>78]|[\x00-\x09\x0b-\x1f\x7f]", "", raw[i:])
token = ""
for row in plain.split("\n"):
    row = row.strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", row):
        break
    token += row
if not re.fullmatch(r"sk-ant-oat\d\d-[A-Za-z0-9_-]{40,}", token):
    sys.exit(1)
print(token)
PY
) || { echo "画面からトークンを読み取れませんでした。もう一度動かしてください。"; exit 1; }

# 画面とさかのぼりの表示からトークンを消す
printf '\033[3J\033[H\033[2J'
echo "✓ トークンを作りました。使えるか確かめています…"
if ! (cd "$WORK" && CLAUDE_CODE_OAUTH_TOKEN="$TOKEN" "$CLAUDE" -p "OK とだけ返してください" --model haiku > /dev/null 2>&1); then
  echo "作ったトークンで Claude を動かせませんでした。もう一度動かしてください。"
  exit 1
fi

echo "② GitHub の Secrets（$SECRET）に登録します…"
if ! printf '%s' "$TOKEN" | gh secret set "$SECRET" --repo "$REPO" > /dev/null 2>&1; then
  cat <<'MSG'
  Codespaces の権限では登録できないので、GitHub に一度ログインします（登録したらすぐログアウトします）。
  下に出る 8 文字のコード（例 ABCD-1234）を覚えてから改行キーを押し、「Open」を押して開いたページにコードを入れて、
  「Authorize github」（許可）を押してください。終わったらこのタブに戻ってきてください。

MSG
  unset GITHUB_TOKEN GH_TOKEN
  gh auth login --hostname github.com --git-protocol ssh --skip-ssh-key --web \
    || { echo "GitHub にログインできませんでした。もう一度動かしてください。"; exit 1; }
  if ! printf '%s' "$TOKEN" | gh secret set "$SECRET" --repo "$REPO"; then
    gh auth logout --hostname github.com > /dev/null 2>&1 || true
    echo "Secrets に登録できませんでした。もう一度動かしてください。"
    exit 1
  fi
  gh auth logout --hostname github.com > /dev/null 2>&1 || true
fi

echo
echo "✓ 登録できました。GitHub の Settings → Secrets and variables → Actions に $SECRET があります。"
echo "  最後に https://github.com/codespaces を開き、この Codespace を「…」→「Delete」で消してください。"
