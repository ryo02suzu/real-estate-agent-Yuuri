#!/usr/bin/env bash
# パソコンが無くても（iPad の Safari だけで）Claude の長期トークンを作り、このリポジトリの Secrets に登録する。
# GitHub の Codespaces（ブラウザーの中で動くパソコン）のターミナルで動かす：  bash scripts/claude-token.sh
#  1. Claude Code を入れて `claude setup-token` を動かす。ログイン画面は、戻り先を「コードを表示するページ」にして開く
#     （そのままだと戻り先がこの機械の localhost になり、iPad からは開けない）。出たコードはターミナルに貼って改行する
#  2. 出てきたトークンを（画面には出さずに）読み取り、Claude Code で一度使って確かめる
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
for c in python3 gh curl; do
  command -v "$c" > /dev/null || { echo "$c が見つかりません。Codespace を標準の設定で作り直してください。"; exit 1; }
done

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [ ! -x "$CLAUDE" ]; then
  echo "Claude Code を入れています（1 分ほど）…"
  curl -fsSL https://claude.ai/install.sh | bash > /dev/null
fi

# ログイン画面を開く係（Claude Code が BROWSER として呼ぶ）。戻り先を localhost から「コードを表示するページ」に替えて、
# Codespaces のブラウザー（iPad の Safari）で開く
cat > "$WORK/open" <<'PY'
#!/usr/bin/env python3
import os, re, subprocess, sys, time

url = re.sub(r"redirect_uri=http%3A%2F%2Flocalhost%3A\d+%2Fcallback",
             "redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback", sys.argv[1])
if "localhost" in url:
    # 形式が変わっていたら、Claude Code が出す「手で開く用」のリンク（端末のリンクの記号の中）を待って開く
    if os.fork():
        sys.exit(0)
    url = None
    for _ in range(60):
        time.sleep(0.5)
        with open(os.environ["TOKEN_LOG"], encoding="utf-8", errors="replace") as f:
            links = [u for u in re.findall(r"\x1b\]8;[^;]*;(https://[^\x07\x1b]*oauth/authorize[^\x07\x1b]*)", f.read())
                     if "localhost" not in u]
        if links:
            url = links[-1]
            break
    if url is None:
        sys.exit(1)
subprocess.run([os.environ["REAL_BROWSER"], url], check=False)
PY
chmod +x "$WORK/open"

# claude setup-token を見えない画面（横 500 字）で動かす係。トークンが折り返されずに 1 続きの文字で出るので、
# そのまま読み取って作業用のファイルに書く（画面には出さない）。ターミナルには進み具合だけ日本語で出し、
# ターミナルに貼って改行したコードを Claude Code に渡す
cat > "$WORK/drive" <<'PY'
#!/usr/bin/env python3
import errno, fcntl, os, re, select, signal, struct, sys, termios, time

log_path, token_file = sys.argv[1], sys.argv[2]
cmd = sys.argv[3:]
CODE = re.compile(r"[A-Za-z0-9._~-]+#[A-Za-z0-9._~-]+")


def say(text):
    os.write(1, (text + "\n").encode())


master, slave = os.openpty()
fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 60, 500, 0, 0))
pid = os.fork()
if pid == 0:
    os.setsid()
    fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
    for f in (0, 1, 2):
        os.dup2(slave, f)
    os.close(master)
    os.close(slave)
    os.execvp(cmd[0], cmd)
os.close(slave)

say("Claude Code を動かしています。Claude のページでコードをコピーしたら、ここに貼り付けて改行してください。")
log = open(log_path, "ab", buffering=0)
raw = b""
pending = None  # 入力欄が出る前に貼られたコードは、出てから渡す
token = None
token_seen = None
exited = False
started = time.time()


def stop(message):
    say(message)
    if not exited:
        os.kill(pid, signal.SIGTERM)
    sys.exit(1)


while True:
    if time.time() - started > 20 * 60:
        stop("20 分たったので止めました。")
    # 終わったかは、画面が閉じるのを待たずに確かめる（裏の処理が画面をつかんだままのことがある）
    if not exited and os.waitpid(pid, os.WNOHANG)[0]:
        exited = True
    found = re.findall(rb"sk-ant-oat\d\d-[A-Za-z0-9_-]{40,}", raw)
    if found:
        token = max(found, key=len)
        token_seen = token_seen or time.time()
    # トークンが出たら、Claude Code が終わるのを少しだけ待って先へ進む
    if token and (exited or time.time() - token_seen > 3):
        break
    if exited:
        stop("Claude Code が途中で終わりました。")
    if pending and b"Paste" in raw:
        os.write(master, pending.encode() + b"\r")
        pending = None
    r, _, _ = select.select([master, 0], [], [], 0.5)
    if 0 in r:
        line = os.read(0, 4096).decode(errors="replace").strip()
        if line and CODE.fullmatch(line):
            pending = line
            say("コードを受け取りました。確かめています…")
        elif line:  # 空の改行は何もしない
            say("コードの形が違います。「Copy Code」でコピーしたものを、そのまま貼ってください。")
    if master in r:
        try:
            data = os.read(master, 65536)
        except OSError as e:
            if e.errno != errno.EIO:
                raise
            data = b""
            time.sleep(0.2)
        log.write(data)
        raw += data
        if b"OAuth error" in raw or b"wasn't accepted" in raw:
            stop("Claude がコードを受け付けませんでした（古いコード・コピーの途中切れなど）。")
if not exited:
    os.kill(pid, signal.SIGTERM)
fd = os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, token)
os.close(fd)
PY
chmod +x "$WORK/drive"

cat <<'MSG'

① Claude のログイン
  このあと画面に「Open」（開く）や「再試行」が出たら押してください。Claude のページが新しいタブで開きます。
  「Authorize」（承認）を押すとコードが出るので、「Copy Code」でコピーします。
  このタブに戻り、ターミナルに貼り付けて改行してください。
  ※ Claude Code の画面は出さず、進み具合だけここに出ます。トークンも画面には出ません。

MSG
read -r -p "準備ができたら改行キーを押してください " _

: > "$WORK/log"
if ! REAL_BROWSER="$BROWSER" BROWSER="$WORK/open" TOKEN_LOG="$WORK/log" \
  python3 "$WORK/drive" "$WORK/log" "$WORK/token" "$CLAUDE" setup-token; then
  echo "トークンを作れませんでした。もう一度 bash scripts/claude-token.sh を動かしてください。"
  exit 1
fi
TOKEN=$(cat "$WORK/token")

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
