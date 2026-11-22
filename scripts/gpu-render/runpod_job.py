#!/usr/bin/env python3
"""
Runpod（GPU の機械を借りる所）で、Blender の描く仕事を動かす（GitHub Actions の .github/workflows/gpu-render.yml から使う）。
Runpod の REST API v2（https://api.runpod.io/v2。鍵は環境変数 RUNPOD_API_KEY を Authorization: Bearer で送る）だけを使い、
SSH は使わない（機械の中のコマンドは /v2/pods/{id}/exec で動かす。1 回の呼び出しは 25 秒まで待つ）。

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


def catalog(_a) -> None:
    code, res = call("GET", "/catalog/gpus")
    if code != 200:
        sys.exit(f"::error::GPU の一覧を読めません（HTTP {code}）: {res}")
    rows = []
    for g in res.get("gpus", []):
        price = g.get("price") or {}
        sec = price.get("secure") if isinstance(price, dict) else None
        com = price.get("community") if isinstance(price, dict) else None
        rows.append((g.get("memory") or 0, g.get("id"), sec, com, g.get("availability")))
    for mem, gid, sec, com, avail in sorted(rows, key=lambda r: (-(r[0] or 0), str(r[1]))):
        print(f"{gid}\t{mem}GB\tsecure={sec}\tcommunity={com}\t{avail}")


def create(a) -> None:
    # OptiX（GPU の光の計算）には、機械の GPU の部品を全部見せる（all）。CUDA の版の確かめは、ふつうの Ubuntu の像では不要
    env = {"NVIDIA_DRIVER_CAPABILITIES": "all", "NVIDIA_DISABLE_REQUIRE": "1"}
    last = None
    for gpu in [g.strip() for g in a.gpu.split(",") if g.strip()]:
        body = {
            "name": a.name,
            "image": a.image,
            "cmd": ["sleep", "infinity"],
            "disk": a.disk,
            "env": env,
            "cloud": a.cloud,
            "gpu": {"id": gpu, "count": 1},
        }
        code, res = call("POST", "/pods", body)
        if code in (200, 201) and isinstance(res, dict) and res.get("id"):
            print(f"借りた機械: {res['id']}（{gpu}・{a.cloud}・{res.get('cost', '?')} ドル/時）")
            out("id", res["id"])
            out("gpu", gpu)
            return
        last = (gpu, code, res)
        print(f"::warning::{gpu} は借りられませんでした（HTTP {code}）: {str(res)[:300]}")
    sys.exit(f"::error::どの GPU も借りられませんでした: {str(last)[:500]}")


def wait(a) -> None:
    deadline = time.time() + a.minutes * 60
    while time.time() < deadline:
        code, res = call("GET", f"/pods/{a.id}")
        status = res.get("status") if isinstance(res, dict) else None
        print(f"機械の状態: {status}（HTTP {code}）")
        if status == "RUNNING":
            # 動き始めても、コマンドを受け付けるまで少しかかる
            for _ in range(20):
                c, r = call("POST", f"/pods/{a.id}/exec", {"command": ["true"], "timeoutSeconds": 10})
                if c == 200 and isinstance(r, dict) and r.get("exitCode") == 0:
                    print("コマンドを受け付けた")
                    return
                time.sleep(10)
            sys.exit("::error::動いているのに、コマンドを受け付けません")
        if status in ("ERROR", "TERMINATED", "EXITED"):
            sys.exit(f"::error::機械が止まりました: {status}")
        time.sleep(15)
    sys.exit("::error::時間内に動き始めませんでした")


def run(pod: str, command: list[str], timeout: int = 25, quiet: bool = False) -> dict:
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
    res = run(a.id, a.command, a.timeout)
    if res.get("timedOut"):
        print("（25 秒で待つのをやめた。コマンドは機械の中で続いている）")
        return
    sys.exit(res.get("exitCode") or 0)


def push(a) -> None:
    """小さなファイル（仕事の台本など）を、base64 にして分けて送り、機械の中で戻す"""
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


def follow(a) -> None:
    deadline = time.time() + a.minutes * 60
    seen = 0
    while time.time() < deadline:
        try:
            res = run(a.id, ["sh", "-c", "cat /root/state 2>/dev/null; echo; wc -l < /root/log.txt 2>/dev/null"], quiet=True)
        except RuntimeError as e:
            print(f"::warning::{e}")
            time.sleep(20)
            continue
        lines = res.get("stdout", "").strip().splitlines()
        state = lines[0].strip() if lines else ""
        total = int(lines[-1]) if lines and lines[-1].strip().isdigit() else 0
        if total > seen:
            r = run(a.id, ["sh", "-c", f"sed -n '{seen + 1},{total}p' /root/log.txt | tail -n 40"], quiet=True)
            sys.stdout.write(r.get("stdout", ""))
            sys.stdout.flush()
            seen = total
        if state.startswith("done"):
            code = state.split()[-1] if len(state.split()) > 1 else "0"
            print(f"仕事が終わった（終了コード {code}）")
            sys.exit(0 if code == "0" else 1)
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
    sub.add_parser("catalog")
    c = sub.add_parser("create")
    c.add_argument("--name", required=True)
    c.add_argument("--gpu", required=True, help="GPU の種類（カンマ区切り。前から順に試す）")
    c.add_argument("--cloud", default="SECURE", choices=["SECURE", "COMMUNITY"])
    c.add_argument("--image", default="ubuntu:24.04")
    c.add_argument("--disk", type=int, default=40)
    w = sub.add_parser("wait")
    w.add_argument("--id", required=True)
    w.add_argument("--minutes", type=float, default=15)
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
    t = sub.add_parser("terminate")
    t.add_argument("--id", default="")
    k = sub.add_parser("cleanup")
    k.add_argument("--prefix", default="michilu-render-")
    k.add_argument("--hours", type=float, default=6)
    a = ap.parse_args()
    if a.cmd == "exec" and a.command and a.command[0] == "--":
        a.command = a.command[1:]
    {"catalog": catalog, "create": create, "wait": wait, "push": push, "exec": exec_cmd, "follow": follow, "terminate": terminate, "cleanup": cleanup}[a.cmd](a)


if __name__ == "__main__":
    main()
