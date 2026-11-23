#!/usr/bin/env python3
"""
Runpod（GPU の機械を借りる所）で、Blender の描く仕事を動かす（GitHub Actions の .github/workflows/gpu-render.yml から使う）。
Runpod の REST API v2（https://api.runpod.io/v2。鍵は環境変数 RUNPOD_API_KEY を Authorization: Bearer で送る）で機械を借りて消す。
機械の中のコマンドは /v2/pods/{id}/exec で動かす（1 回の呼び出しは 25 秒まで待つ）。鍵に exec の権限が無いときは、
この回だけの使い捨ての鍵の SSH で動かす（wait が決めて work/conn.json に書く）。

  python3 runpod_job.py catalog                               # 借りられる GPU と値段（1 時間・1 枚）
  python3 runpod_job.py create --name michilu-render-123 --gpu "NVIDIA GeForce RTX 4090,NVIDIA L40S"
  python3 runpod_job.py wait --id <pod>                       # 動き始めるまで待つ
  python3 runpod_job.py push --id <pod> --tar job.tgz         # 仕事のファイルを機械に送る（小さなファイルだけ。base64 を分けて送る）
  python3 runpod_job.py exec --id <pod> -- sh -c "..."        # 機械の中でコマンドを動かす
  python3 runpod_job.py follow --id <pod> --minutes 60        # /root/state が done になるまで、/root/log.txt の終わりを出しながら待つ
  python3 runpod_job.py terminate --id <pod>                  # 機械を消す（お金が止まる）
  python3 runpod_job.py cleanup --prefix michilu-render- --hours 6   # 止め忘れの安全網：古い機械を消す

鍵の中身は出さない。機械の名前は michilu-render- で始める（cleanup が消してよいのはこの名前のものだけ）。
"""
import argparse
import base64
import datetime
import json
import os
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.runpod.io/v2"


def call(method: str, path: str, body: dict | None = None, timeout: int = 60) -> tuple[int, dict | str]:
    key = os.environ.get("RUNPOD_API_KEY", "")
    if not key:
        sys.exit("::error::RUNPOD_API_KEY がありません（GitHub の Secrets に入れる）")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "michilu-gpu-render"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode("utf-8", "replace")
                return r.status, (json.loads(raw) if raw.strip() else {})
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            # 混んでいる・一時的な不調はやり直す（429・5xx）
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(3 * (attempt + 1))
                continue
            try:
                return e.code, json.loads(raw)
            except ValueError:
                return e.code, raw
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 4:
                time.sleep(3 * (attempt + 1))
                continue
            return 0, str(e)
    return 0, "retries exhausted"


def out(name: str, value: str) -> None:
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"{name}={value}\n")


def stock(cloud: str) -> dict[str, str]:
    """今の在庫（GPU の種類 → NONE・LOW・MEDIUM・HIGH）。Runpod の API の説明書（GET /v2/catalog/gpus）：
    include=AVAILABILITY と product=POD を付けたときだけ availability が入る。読めなければ空"""
    code, res = call("GET", f"/catalog/gpus?include=AVAILABILITY&product=POD&cloud={cloud}")
    if code != 200 or not isinstance(res, dict):
        return {}
    return {g.get("id"): g.get("availability") or "?" for g in res.get("gpus", [])}


def balance(_a) -> None:
    """前払いの残高（ドル）。Runpod の API の説明書（GET /v2/billing/balance）：残高が尽きると新しい機械は借りられない"""
    code, res = call("GET", "/billing/balance")
    if code == 200 and isinstance(res, dict) and res.get("balanceAmount") is not None:
        print(f"Runpod の残高：{float(res['balanceAmount']):.2f} ドル")
    else:
        print(f"::warning::残高を読めませんでした（HTTP {code}）")


def catalog(a) -> None:
    code, res = call("GET", "/catalog/gpus")
    if code != 200:
        sys.exit(f"::error::GPU の一覧を読めません（HTTP {code}）: {res}")
    have = stock(a.cloud)
    rows = []
    for g in res.get("gpus", []):
        price = g.get("price") or {}
        sec = price.get("secure") if isinstance(price, dict) else None
        com = price.get("community") if isinstance(price, dict) else None
        rows.append((g.get("memory") or 0, g.get("id"), sec, com, have.get(g.get("id"), "?")))
    for mem, gid, sec, com, avail in sorted(rows, key=lambda r: (-(r[0] or 0), str(r[1]))):
        print(f"{gid}\t{mem}GB\tsecure={sec}\tcommunity={com}\t在庫（{a.cloud}）={avail}")


CONN = "work/conn.json"  # 機械へのつなぎ方（wait が書く。exec か ssh）


def create(a) -> None:
    # OptiX（GPU の光の計算）には、機械の GPU の部品を全部見せる（all）。CUDA の版の確かめはしない（Blender は自分で持っている）
    env = {"NVIDIA_DRIVER_CAPABILITIES": "all", "NVIDIA_DISABLE_REQUIRE": "1"}
    ports = []
    if a.pubkey:
        # SSH の鍵（この回だけの使い捨て）。Runpod の公式の像は PUBLIC_KEY から SSH を始める（exec が使えない機械の代わりの道）
        env["PUBLIC_KEY"] = open(a.pubkey).read().strip()
        ports = ["22/tcp"]
    want = [g.strip() for g in a.gpu.split(",") if g.strip()]
    last = None
    deadline = time.time() + a.retry_minutes * 60
    rnd = 0
    while True:
        rnd += 1
        # 在庫のあるものを先に（並びは頼んだ順のまま。在庫が読めないときは頼んだ順）
        have = stock(a.cloud)
        order = [g for g in want if have.get(g, "?") not in ("NONE",)] + [g for g in want if have.get(g, "?") == "NONE"]
        print(f"{rnd} 回目：在庫 " + "・".join(f"{g.replace('NVIDIA ', '')}={have.get(g, '?')}" for g in want), flush=True)
        for gpu in order:
            body = {"name": a.name, "image": a.image, "disk": a.disk, "env": env, "cloud": a.cloud, "gpu": {"id": gpu, "count": 1}}
            # 22 番（SSH）は毎回開ける。今の鍵には exec の権限が無く（HTTP 403「This API key cannot run commands on pods」）、
            # 22 番の無い機械では仕事を動かせないまま待つことになる（外から入れる IP のある機械に限られるが、それでよい）
            if ports:
                body["ports"] = ports
            code, res = call("POST", "/pods", body)
            if code in (200, 201) and isinstance(res, dict) and res.get("id"):
                print(f"借りた機械: {res['id']}（{gpu}・{a.cloud}・{res.get('cost', '?')} ドル/時）")
                out("id", res["id"])
                out("gpu", gpu)
                return
            last = (gpu, code, res)
            print(f"::warning::{gpu} は借りられませんでした（HTTP {code}）: {str(res)[:300]}")
            if code in (401, 402, 403):
                break  # 鍵・残高・権限の問題は、待っても種類を変えても変わらない
            # それ以外（在庫切れ：「instances available」「does not have the resources ... try a different machine」など）は、
            # 次の種類を試し、全部だめなら待って試し直す
        else:
            if time.time() + 60 < deadline:
                print("どの GPU も今は借りられない（在庫切れ）。1 分待って試し直す", flush=True)
                time.sleep(60)
                continue
        break
    sys.exit(f"::error::どの GPU も借りられませんでした: {str(last)[:500]}")


def ssh_args(conn: dict) -> list[str]:
    return ["ssh", "-i", conn["key"], "-p", str(conn["port"]), "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15", f"root@{conn['host']}"]


def ssh_endpoint(res: dict) -> tuple[str, int] | None:
    """22 番（SSH）の外から入る IP と番号（動いているときだけ）"""
    for p in ((res.get("runtime") or {}).get("ports") or []):
        if p.get("private") == 22 and p.get("public") and p.get("ip"):
            return p["ip"], int(p["public"])
    direct = (res.get("ssh") or {}).get("direct") if isinstance(res.get("ssh"), dict) else None
    if direct and direct.get("host") and direct.get("port"):
        return direct["host"], int(direct["port"])
    return None


def wait(a) -> None:
    deadline = time.time() + a.minutes * 60
    tries = 0
    while time.time() < deadline:
        code, res = call("GET", f"/pods/{a.id}")
        status = res.get("status") if isinstance(res, dict) else None
        if status in ("ERROR", "TERMINATED", "EXITED"):
            sys.exit(f"::error::機械が止まりました: {status}")
        if status == "RUNNING":
            # 1) Runpod の API の exec（SSH 無しで機械の中のコマンドを動かす）
            c, r = call("POST", f"/pods/{a.id}/exec", {"command": ["true"], "timeoutSeconds": 10})
            if c == 200 and isinstance(r, dict) and r.get("exitCode") == 0:
                print("exec でコマンドを受け付けた")
                json.dump({"mode": "exec", "pod": a.id}, open(CONN, "w"))
                return
            tries += 1
            print(f"exec はまだ（{tries} 回目・HTTP {c}）: {str(r)[:240]}")
            # 2) SSH（使い捨ての鍵。exec が使えない機械の代わり）
            ep = ssh_endpoint(res) if isinstance(res, dict) else None
            if ep and a.key and os.path.exists(a.key):
                conn = {"mode": "ssh", "pod": a.id, "host": ep[0], "port": ep[1], "key": a.key}
                t = subprocess.run(ssh_args(conn) + ["true"], capture_output=True, text=True, timeout=60)
                if t.returncode == 0:
                    print(f"SSH でつながった（{ep[0]}:{ep[1]}）。exec の代わりに SSH で動かす")
                    json.dump(conn, open(CONN, "w"))
                    return
                print(f"SSH はまだ（{ep[0]}:{ep[1]}）: {t.stderr.strip()[:200]}")
            elif tries == 1:
                print(f"SSH の入口はまだ無い（ports: {((res.get('runtime') or {}).get('ports') if isinstance(res, dict) else None)}）")
            time.sleep(15)
            continue
        print(f"機械の状態: {status}（HTTP {code}）")
        time.sleep(15)
    sys.exit("::error::時間内に動き始めませんでした（exec も SSH もつながらない）")


def run(pod: str, command: list[str], timeout: int = 25, quiet: bool = False) -> dict:
    conn = json.load(open(CONN)) if os.path.exists(CONN) else {"mode": "exec"}
    if conn.get("mode") == "ssh":
        try:
            t = subprocess.run(ssh_args(conn) + [shlex.join(command)], capture_output=True, text=True, timeout=timeout + 60)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"SSH が {timeout + 60} 秒答えない（{conn['host']}:{conn['port']}）")
        # 255 は ssh 自身の失敗（つながらない・切れた）。前はこれを「答えが空」として扱い、機械の様子が分からないまま
        # 決めた時間まで待ち続けた（2026-11-23：1〜30 コマ目の回が 11:43 から 3 時間、何も出ないまま待って時間切れ）
        if t.returncode == 255:
            raise RuntimeError(f"SSH でつながらない（{conn['host']}:{conn['port']}）: {t.stderr.strip()[:200]}")
        res = {"stdout": t.stdout, "stderr": t.stderr, "exitCode": t.returncode, "timedOut": False}
    else:
        code, res = call("POST", f"/pods/{pod}/exec", {"command": command, "timeoutSeconds": timeout})
        if code != 200 or not isinstance(res, dict):
            raise RuntimeError(f"exec に失敗（HTTP {code}）: {str(res)[:300]}")
    if not quiet:
        if res.get("stdout"):
            sys.stdout.write(res["stdout"])
        if res.get("stderr"):
            sys.stdout.write(res["stderr"])
    return res


def exec_cmd(a) -> None:
    try:
        res = run(a.id, a.command, a.timeout)
    except RuntimeError as e:
        sys.exit(f"::error::{e}")
    if res.get("timedOut"):
        print("（25 秒で待つのをやめた。コマンドは機械の中で続いている）")
        return
    sys.exit(res.get("exitCode") or 0)


def push(a) -> None:
    """小さなファイル（仕事の台本など）を、base64 にして分けて送り、機械の中で戻す"""
    conn = json.load(open(CONN)) if os.path.exists(CONN) else {"mode": "exec"}
    if conn.get("mode") == "ssh":
        scp = ["scp", "-i", conn["key"], "-P", str(conn["port"]), "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR",
               a.tar, f"root@{conn['host']}:/root/job.tgz"]
        if subprocess.run(scp).returncode != 0:
            sys.exit("::error::SSH で送れませんでした")
        try:
            res = run(a.id, ["sh", "-c", "mkdir -p /root/job && tar -xzf /root/job.tgz -C /root/job && ls -la /root/job"])
        except RuntimeError as e:
            sys.exit(f"::error::{e}")
        if res.get("exitCode") != 0:
            sys.exit("::error::機械の中で戻せませんでした")
        print("SSH で送った")
        return
    data = base64.b64encode(open(a.tar, "rb").read()).decode()
    run(a.id, ["sh", "-c", "rm -f /root/job.b64 && mkdir -p /root/job"], quiet=True)
    step = 3800
    for i in range(0, len(data), step):
        res = run(a.id, ["sh", "-c", 'printf %s "$1" >> /root/job.b64', "sh", data[i : i + step]], quiet=True)
        if res.get("exitCode") != 0:
            sys.exit(f"::error::送れませんでした: {res.get('stderr', '')[:200]}")
    res = run(a.id, ["sh", "-c", "base64 -d /root/job.b64 > /root/job.tgz && tar -xzf /root/job.tgz -C /root/job && ls -la /root/job"])
    if res.get("exitCode") != 0:
        sys.exit("::error::機械の中で戻せませんでした")
    print(f"送った: {len(data)} 文字（{(len(data) + step - 1) // step} 回）")


def uploaded() -> bool:
    """できたもの（out.tar）が R2 に届いたか。機械の中の仕事は、最後に out.tar を送ってから終わりの印を書くので、
    届いていれば仕事は終わっている（exec が答えなくなったときの代わりの確かめ。公開の URL に HEAD を送るだけ）"""
    base, key = os.environ.get("R2_PUBLIC_URL", ""), os.environ.get("KEY", "")
    if not base or not key:
        return False
    try:
        # r2.dev は Python の既定の User-Agent を断る（403）ので、一般的な名前を付ける
        req = urllib.request.Request(base.rstrip("/") + "/" + key, method="HEAD", headers={"User-Agent": "Mozilla/5.0 (compatible; render-check/1.0)"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200
    except Exception:
        return False


def pod_info(pod: str) -> dict:
    """Runpod の API で見た機械の様子（status・runtime。runtime は 1 台を ID で読んだときだけ入る）。読めなければ空"""
    code, res = call("GET", f"/pods/{pod}", timeout=30)
    return res if code == 200 and isinstance(res, dict) else {}


def gpu_busy(info: dict) -> bool | None:
    """API の runtime.gpus[].util（%）で見て、GPU が動いているか。分からなければ None"""
    gpus = (info.get("runtime") or {}).get("gpus") or []
    utils = [g.get("util") for g in gpus if isinstance(g, dict) and isinstance(g.get("util"), (int, float))]
    return (max(utils) >= 5) if utils else None


def _num(s: str) -> int:
    s = (s or "").strip()
    return int(s) if s.isdigit() else 0


# 機械の中の様子を 1 回で読む：仕事の印・記録の行数・描けたコマの数・GPU の使われ方（%）
PROBE = ("printf 'state=%s\\nlog=%s\\nframes=%s\\ngpu=%s\\n' \"$(cat /root/state 2>/dev/null)\" \"$(wc -l < /root/log.txt 2>/dev/null)\" "
         "\"$(ls /root/out/frames 2>/dev/null | wc -l)\" \"$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -n 1)\"")


def follow(a) -> None:
    """仕事が終わるまで、記録を出しながら待つ。止まった機械に払い続けないよう、次のときは早めに見切る（あとの手順が機械を消す）：
    - 機械に答えてもらえず（SSH・exec）、Runpod の API で見ても機械が止まった・起動し直した（中の仕事は消える）
    - 機械に答えてもらえないまま --lost 分たち、API で見た GPU も 15 分以上止まっている
    - 答えはあるが、仕事の印（/root/state）が消えた（起動し直した）
    - 答えはあるが、記録もコマも --stall 分増えず、GPU も 15 分以上止まっている（描いている間は GPU が動くので、1 コマが長くても止めない）"""
    start = time.time()
    deadline = start + a.minutes * 60
    seen = frames = 0
    fails = no_state = 0
    fail_since = up_since = 0.0
    moved_at = busy_at = start
    had_state = False
    while time.time() < deadline:
        now = time.time()
        try:
            res = run(a.id, ["sh", "-c", PROBE], quiet=True)
            kv = dict(line.split("=", 1) for line in res.get("stdout", "").splitlines() if "=" in line)
            state, total, nframes, gpu = kv.get("state", "").strip(), _num(kv.get("log", "")), _num(kv.get("frames", "")), kv.get("gpu", "").strip()
            if total > seen:
                r = run(a.id, ["sh", "-c", f"sed -n '{seen + 1},{total}p' /root/log.txt | tail -n 40"], quiet=True)
                sys.stdout.write(r.get("stdout", ""))
                sys.stdout.flush()
        except RuntimeError as e:
            fails += 1
            fail_since = fail_since or now
            if fails == 1 or fails % 10 == 0:
                print(f"::warning::{e}（{fails} 回目）", flush=True)
            # 終わってから答えなくなることもある（2026-11-23：out.tar が届いたあと exec が答えず、10 分以上むだに動いた）
            if fails >= 3 and uploaded():
                print("機械に答えてもらえないが、できたものは R2 に届いている。仕事は終わったとみなす")
                sys.exit(0)
            info = pod_info(a.id)
            st = info.get("status")
            if st and st != "RUNNING":
                sys.exit(f"::error::機械が止まった（{st}）")
            up = (info.get("runtime") or {}).get("uptime")
            if isinstance(up, (int, float)) and up < (now - start) - 180:
                sys.exit(f"::error::機械が途中で起動し直した（動き始めて {int(up)} 秒）。中の仕事は消えたとみて終える")
            if gpu_busy(info) is not False:
                busy_at = now  # 動いている（または分からない）
            if now - fail_since > a.lost * 60 and now - busy_at > 15 * 60:
                sys.exit(f"::error::{a.lost} 分のあいだ機械に答えてもらえず、GPU も止まっている（機械の様子：{st or '読めない'}）。終える")
            time.sleep(20)
            continue
        if fails:
            print(f"機械にまたつながった（{fails} 回失敗したあと）", flush=True)
        fails, fail_since = 0, 0.0
        if total > seen or nframes > frames:
            moved_at = now
        if nframes > frames and total <= seen:
            print(f"描けたコマ：{nframes}", flush=True)
        seen, frames = max(seen, total), max(frames, nframes)
        if not gpu.isdigit() or int(gpu) >= 5:
            busy_at = now  # 動いている（または分からない）
        if state.startswith("done"):
            code = state.split()[-1] if len(state.split()) > 1 else "0"
            print(f"仕事が終わった（終了コード {code}）")
            sys.exit(0 if code == "0" else 1)
        if state:
            had_state, no_state = True, 0
        elif had_state:
            no_state += 1
            if no_state >= 3:
                sys.exit("::error::機械の中の仕事の印（/root/state）が消えた。機械が起動し直して、仕事が消えたとみて終える")
        if a.stall > 0 and now - moved_at > a.stall * 60 and now - busy_at > 15 * 60:
            sys.exit(f"::error::{a.stall} 分のあいだ記録もコマも増えず、GPU も 15 分以上止まっている。止まったとみて終える")
        # 終わりの印が書かれないまま、できたものが R2 に届いて 90 秒たったら、終わったとみなす
        if uploaded():
            up_since = up_since or time.time()
            if time.time() - up_since > 90:
                print("できたものは R2 に届いている（終わりの印はまだ）。仕事は終わったとみなす")
                sys.exit(0)
        time.sleep(a.every)
    sys.exit("::error::決めた時間内に終わりませんでした")


def terminate(a) -> None:
    if not a.id:
        print("消す機械がありません")
        return
    code, res = call("DELETE", f"/pods/{a.id}")
    if code in (200, 204, 404):
        print(f"機械を消した: {a.id}（HTTP {code}）")
    else:
        sys.exit(f"::error::機械を消せませんでした（HTTP {code}）: {str(res)[:300]}。Runpod の画面で消してください")


def cleanup(a) -> None:
    code, res = call("GET", "/pods")
    if code != 200:
        sys.exit(f"::error::機械の一覧を読めません（HTTP {code}）")
    now = datetime.datetime.now(datetime.timezone.utc)
    for p in res.get("pods", []):
        name = p.get("name") or ""
        if not name.startswith(a.prefix):
            continue
        created = p.get("createdAt") or ""
        try:
            t = datetime.datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            t = now
        age = (now - t).total_seconds() / 3600
        print(f"{p.get('id')} {name} {p.get('status')} {age:.1f} 時間")
        if age >= a.hours:
            c, _ = call("DELETE", f"/pods/{p['id']}")
            print(f"  → 古いので消した（HTTP {c}）")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("balance")
    g = sub.add_parser("catalog")
    g.add_argument("--cloud", default="SECURE", choices=["SECURE", "COMMUNITY"])
    c = sub.add_parser("create")
    c.add_argument("--name", required=True)
    c.add_argument("--gpu", required=True, help="GPU の種類（カンマ区切り。前から順に試す）")
    c.add_argument("--cloud", default="SECURE", choices=["SECURE", "COMMUNITY"])
    c.add_argument("--image", default="runpod/base:1.0.2-ubuntu2204")
    c.add_argument("--pubkey", default="", help="SSH の公開鍵のファイル（この回だけの使い捨て）")
    c.add_argument("--disk", type=int, default=40)
    c.add_argument("--retry-minutes", type=float, default=30, help="どれも在庫切れのとき、試し直す時間（分）")
    w = sub.add_parser("wait")
    w.add_argument("--id", required=True)
    w.add_argument("--minutes", type=float, default=15)
    w.add_argument("--key", default="", help="SSH の秘密鍵のファイル（exec が使えないときに使う）")
    p = sub.add_parser("push")
    p.add_argument("--id", required=True)
    p.add_argument("--tar", required=True)
    e = sub.add_parser("exec")
    e.add_argument("--id", required=True)
    e.add_argument("--timeout", type=int, default=25)
    e.add_argument("command", nargs=argparse.REMAINDER)
    f = sub.add_parser("follow")
    f.add_argument("--id", required=True)
    f.add_argument("--minutes", type=float, default=60)
    f.add_argument("--every", type=float, default=30)
    f.add_argument("--stall", type=float, default=45, help="記録もコマも増えず GPU も止まっているとき、見切るまでの分（0 で見切らない）")
    f.add_argument("--lost", type=float, default=20, help="機械に答えてもらえず GPU も止まっているとき、見切るまでの分")
    t = sub.add_parser("terminate")
    t.add_argument("--id", default="")
    k = sub.add_parser("cleanup")
    k.add_argument("--prefix", default="michilu-render-")
    k.add_argument("--hours", type=float, default=6)
    a = ap.parse_args()
    if a.cmd == "exec" and a.command and a.command[0] == "--":
        a.command = a.command[1:]
    {"balance": balance, "catalog": catalog, "create": create, "wait": wait, "push": push, "exec": exec_cmd, "follow": follow, "terminate": terminate, "cleanup": cleanup}[a.cmd](a)


if __name__ == "__main__":
    main()
