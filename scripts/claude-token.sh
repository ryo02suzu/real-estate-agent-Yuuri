#!/usr/bin/env bash
# パソコンが無くても（iPad の Safari だけで）Claude の長期トークンを作り、このリポジトリの Secrets に登録する。
# GitHub の Codespaces（ブラウザーの中で動くパソコン）のターミナルで動かす：  bash scripts/claude-token.sh
#  1. Claude Code を入れて `claude setup-token` を動かす。ログイン画面は、戻り先を「コードを表示するページ」にして開く
#     （そのままだと戻り先がこの機械の localhost になり、iPad からは開けない）。出たコードは、ターミナルではなく
#     Safari で開く小さなページの入力欄に貼る（iPad の Safari ではターミナルに貼り付けられない）
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
for c in python3 gh curl; do
  command -v "$c" > /dev/null || { echo "$c が見つかりません。Codespace を標準の設定で作り直してください。"; exit 1; }
done

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [ ! -x "$CLAUDE" ]; then
  echo "Claude Code を入れています（1 分ほど）…"
  curl -fsSL https://claude.ai/install.sh | bash > /dev/null
fi

# ログイン画面を開く係（Claude Code が BROWSER として呼ぶ）。Claude のページの代わりに、下の「コードを渡すページ」を開く。
# Claude のページは、戻り先を localhost から「コードを表示するページ」に替えて、そのページのボタンから開く
cat > "$WORK/open" <<'PY'
#!/usr/bin/env python3
import os, re, subprocess, sys

url = re.sub(r"redirect_uri=http%3A%2F%2Flocalhost%3A\d+%2Fcallback",
             "redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback", sys.argv[1])
if "localhost" not in url:
    with open(os.environ["LOGIN_URL_FILE"], "w") as f:
        f.write(url)
# Codespaces は localhost のページを Safari から開けるように中継する
subprocess.run([os.environ["REAL_BROWSER"], f"http://localhost:{os.environ['CODE_PAGE_PORT']}/"], check=False)
PY
chmod +x "$WORK/open"

# claude setup-token を動かしながら、「コードを渡すページ」を出す係。iPad の Safari ではターミナルに貼り付けられないので、
# ページの普通の入力欄（長押しでペーストできる）に貼ったコードを、ターミナルに打ったのと同じように Claude Code に渡す
cat > "$WORK/drive" <<'PY'
#!/usr/bin/env python3
import errno, fcntl, html, http.server, os, re, secrets, select, signal, sys, termios, threading, tty, urllib.parse

log_path, url_file = sys.argv[1], sys.argv[2]
cmd = sys.argv[3:]
form_key = secrets.token_urlsafe(16)  # ほかのページから勝手に送られないように、ページに埋めた合言葉を確かめる
master, slave = os.openpty()


def login_url():
    try:
        return open(url_file).read().strip()
    except OSError:
        pass
    # 戻り先の形式が変わっていたら、画面に出る「手で開く用」のリンク（端末のリンクの記号の中）を使う
    raw = open(log_path, encoding="utf-8", errors="replace").read()
    links = [u for u in re.findall(r"\x1b\]8;[^;]*;(https://[^\x07\x1b]*oauth/authorize[^\x07\x1b]*)", raw) if "localhost" not in u]
    return links[-1] if links else None


STYLE = ("body{font:18px -apple-system,sans-serif;margin:24px auto;max-width:640px;padding:0 16px;line-height:1.6}"
         "input{font-size:18px;width:100%;padding:12px;box-sizing:border-box;margin:8px 0}"
         ".b{display:inline-block;font-size:18px;padding:12px 20px;margin:8px 0;border-radius:8px;"
         "background:#c96442;color:#fff;border:0;text-decoration:none}")


class Page(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body):
        data = f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" \
               f"<title>Claude のコードを渡す</title><style>{STYLE}</style>{body}".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = login_url()
        if url is None:
            return self.send("<p>準備中です。数秒たってから、このページを読み込み直してください。</p>")
        self.send(f"<h1>Claude のコードを渡す</h1>"
                  f"<p>1. <a class=b href='{html.escape(url)}' target=_blank>Claude のページを開く</a><br>"
                  f"「Authorize」（承認）を押し、「Copy Code」でコピーして、このタブに戻ります。</p>"
                  f"<form method=post><p>2. 下の欄を長押しして「ペースト」し、「送る」を押します。</p>"
                  f"<input name=code autocomplete=off autocapitalize=off autocorrect=off spellcheck=false>"
                  f"<input type=hidden name=k value='{form_key}'><button class=b>送る</button></form>")

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        form = urllib.parse.parse_qs(self.rfile.read(min(n, 10000)).decode())
        code = "".join(form.get("code", [""])).strip()
        if form.get("k") != [form_key] or not re.fullmatch(r"[A-Za-z0-9._~-]+#[A-Za-z0-9._~-]+", code):
            return self.send("<p>コードの形が違います。「Copy Code」でコピーし直して、"
                             "<a href='/'>前のページ</a>からもう一度貼ってください。</p>")
        os.write(master, code.encode() + b"\r")
        self.send("<h1>送りました</h1><p>元のタブ（「[プレビュー] README.md …」）に戻って、続きの案内を見てください。</p>")


server = None
for port in range(8765, 8785):
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Page)
        break
    except OSError:
        pass
if server is None:
    sys.exit("コードを渡すページを開けませんでした")
threading.Thread(target=server.serve_forever, daemon=True).start()


def resize(*_):
    try:
        fcntl.ioctl(master, termios.TIOCSWINSZ, fcntl.ioctl(0, termios.TIOCGWINSZ, b"\0" * 8))
    except OSError:
        pass


resize()
pid = os.fork()
if pid == 0:
    os.setsid()
    fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
    for f in (0, 1, 2):
        os.dup2(slave, f)
    os.close(master)
    os.close(slave)
    os.environ["CODE_PAGE_PORT"] = str(port)
    os.execvp(cmd[0], cmd)
os.close(slave)
signal.signal(signal.SIGWINCH, resize)

saved = termios.tcgetattr(0) if os.isatty(0) else None
log = open(log_path, "ab", buffering=0)
try:
    if saved:
        tty.setraw(0)
    while True:
        try:
            r, _, _ = select.select([0, master], [], [])
        except InterruptedError:
            continue
        if master in r:
            try:
                data = os.read(master, 65536)
            except OSError as e:
                if e.errno == errno.EIO:
                    break
                raise
            if not data:
                break
            os.write(1, data)
            log.write(data)
        if 0 in r:
            data = os.read(0, 65536)
            if data:
                os.write(master, data)
finally:
    if saved:
        termios.tcsetattr(0, termios.TCSAFLUSH, saved)
    server.shutdown()
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
PY
chmod +x "$WORK/drive"

cat <<'MSG'

① Claude のログイン
  このあと画面に「Open」（開く）が出たら押してください。「Claude のコードを渡す」ページが新しいタブで開きます。
  そのページの「Claude のページを開く」→「Authorize」（承認）→「Copy Code」でコピー →
  「Claude のコードを渡す」のタブに戻り、入力欄を長押しして「ペースト」→「送る」を押してください。
  ※ ターミナルには貼らなくて大丈夫です。
  ※ ページが開かないときは、下の「ポート」タブを開き、8765 の行の地球のマークを押してください。

MSG
read -r -p "準備ができたら改行キーを押してください " _

: > "$WORK/log"
if ! REAL_BROWSER="$BROWSER" BROWSER="$WORK/open" LOGIN_URL_FILE="$WORK/login-url" \
  python3 "$WORK/drive" "$WORK/log" "$WORK/login-url" "$CLAUDE" setup-token; then
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
