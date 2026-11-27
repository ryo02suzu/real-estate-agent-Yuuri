#!/usr/bin/env python3
"""op4-farm の計画役。依頼ファイル（requests/<name>.json）を確かめ、GitHub Actions に渡す表を作る。
標準ライブラリだけ。環境変数 REQUEST（依頼ファイルの場所）を読み、GITHUB_OUTPUT に書く（ローカルなら標準出力）。
"""
import ast
import hashlib
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # scripts/pc-opening4
REPO = ROOT.parents[1]
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
RUN_RE = re.compile(r"^[A-Za-z0-9_./-]+\.py( [A-Za-z0-9_=.,:+/@{} -]*)?$")
REQ_RE = re.compile(r"^scripts/pc-opening4/farm/requests/[A-Za-z0-9_.-]+\.json$")
DS_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")


def die(msg):
    print(f"::error::{msg}")
    sys.exit(1)


def shots():
    tree = ast.parse((ROOT / "world_fetch.py").read_text(encoding="utf-8"))
    for n in ast.walk(tree):
        if isinstance(n, ast.Assign) and any(getattr(t, "id", "") == "SHOTS" for t in n.targets):
            return sorted(ast.literal_eval(n.value).keys())
    die("world_fetch.py に SHOTS が見つかりません")


def file_hash(patterns):
    h = hashlib.sha256()
    files = sorted({p for pat in patterns for p in ROOT.glob(pat) if p.is_file() and "__pycache__" not in p.parts})
    if not files:
        die(f"keyfiles に当たるファイルがありません: {patterns}")
    for p in files:
        h.update(str(p.relative_to(ROOT)).encode() + b"\0" + p.read_bytes() + b"\0")
    return h.hexdigest()[:16]


def resolve_dataset(name, table):
    if name in table and not name.startswith("_"):
        spec, arg = table[name], ""
    else:
        spec = arg = None
        for k, v in table.items():
            if k.endswith("-*") and name.startswith(k[:-1]):
                spec, arg = v, name[len(k) - 1:]
                if k == "world-*" and arg not in shots():
                    die(f"データセット {name}: ショット {arg} は world_fetch.py にありません（あるのは {', '.join(shots())}）")
                break
        if spec is None:
            names = [k for k in table if not k.startswith("_")]
            die(f"知らないデータセット名 {name}（あるのは {', '.join(names)}）。足すときは farm/datasets.json に数行足す")
    if not DS_RE.match(name):
        die(f"データセット名が不正: {name}")
    sub = lambda s: s.replace("{arg}", arg)  # noqa: E731
    out = {
        "name": name,
        "key": f"op4-data-{name}-{file_hash(spec['keyfiles'])}",
        "tar": f"data/{name}.tar",
        "path": sub(spec["path"]),
        "cmds": [sub(c) for c in spec["cmds"]],
        "pip": spec.get("pip", ""),
        "apt": bool(spec.get("apt", False)),
        "timeout_min": int(spec.get("timeout_min", 120)),
        "tiles_path": spec.get("tiles", {}).get("path", ""),
        "tiles_prefix": spec.get("tiles", {}).get("prefix", ""),
    }
    return out, spec.get("lane", "parallel")


def main():
    req_path = os.environ.get("REQUEST", "")
    if not REQ_RE.match(req_path) or ".." in req_path:
        die(f"request は scripts/pc-opening4/farm/requests/<名前>.json の形で: {req_path!r}")
    p = REPO / req_path
    if not p.is_file():
        die(f"依頼ファイルがありません（この commit に入っていますか）: {req_path}")
    try:
        req = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        die(f"依頼ファイルが JSON ではありません: {e}")
    jobs = req.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        die("jobs が空です")
    if len(jobs) > 256:
        die(f"jobs が {len(jobs)} 件（上限 256）")
    mp = req.get("max_parallel", 20)
    if not isinstance(mp, int) or mp < 1:
        die("max_parallel は 1 以上の整数")
    mp = min(mp, 20)
    seen, out_jobs = set(), []
    for i, j in enumerate(jobs):
        if not isinstance(j, dict):
            die(f"jobs[{i}] がオブジェクトではありません")
        name, run = j.get("name"), j.get("run")
        if not isinstance(name, str) or not NAME_RE.match(name):
            die(f"jobs[{i}].name は ^[a-z0-9][a-z0-9-]{{0,40}}$ に合う英小文字・数字・ハイフン: {name!r}")
        if name.startswith("farmdata-"):
            die(f"名前 {name} は farmdata- で始められません（データ用に予約）")
        if name in seen:
            die(f"名前 {name} が重なっています")
        seen.add(name)
        if not isinstance(run, str) or not RUN_RE.match(run) or ".." in run:
            die(f"jobs[{i}] ({name}).run の書き方が決まりに合いません: {run!r}")
        script = run.split(" ", 1)[0]
        sp = (ROOT / script).resolve()
        if ROOT.resolve() not in sp.parents or not sp.is_file():
            die(f"jobs[{i}] ({name}): スクリプト {script} が scripts/pc-opening4 の下にありません")
        t = j.get("timeout_min", 120)
        if not isinstance(t, int) or not 1 <= t <= 330:
            die(f"jobs[{i}] ({name}).timeout_min は 1〜330 の整数")
        out_jobs.append({"name": name, "run": run, "timeout_min": t})
    want = req.get("data", [])
    if not isinstance(want, list) or not all(isinstance(x, str) for x in want):
        die("data は文字列の配列")
    table = json.loads((ROOT / "farm" / "datasets.json").read_text(encoding="utf-8"))
    serial, parallel, done = [], [], set()
    for name in want:
        if name in done:
            continue
        done.add(name)
        ds, lane = resolve_dataset(name, table)
        (serial if lane == "serial" else parallel).append(ds)
    sha = os.popen(f"git -C {REPO} rev-parse HEAD").read().strip()
    res = {
        "sha": sha,
        "jobs": json.dumps(out_jobs, ensure_ascii=False, separators=(",", ":")),
        "max_parallel": str(mp),
        "serial": json.dumps(serial, separators=(",", ":")),
        "parallel": json.dumps(parallel, separators=(",", ":")),
        "has_data": "true" if want else "false",
    }
    dest = os.environ.get("GITHUB_OUTPUT")
    lines = "".join(f"{k}={v}\n" for k, v in res.items())
    if dest:
        with open(dest, "a", encoding="utf-8") as f:
            f.write(lines)
    else:
        print(lines)
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    text = [f"### 依頼 {req_path}", f"- commit {sha[:10]} ・ 仕事 {len(out_jobs)} 件・同時 {mp} 台まで",
            f"- データ: {', '.join(want) or 'なし'}"]
    if summ:
        with open(summ, "a", encoding="utf-8") as f:
            f.write("\n".join(text) + "\n")
    print("\n".join(text))


if __name__ == "__main__":
    main()
