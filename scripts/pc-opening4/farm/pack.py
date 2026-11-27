#!/usr/bin/env python3
"""結果の tar を作る（out/ ・ log.txt ・ time.json）。環境変数 OUT_ROOT・JOB_NAME・RESULT_DIR。
tar が 300 MB 以下なら upload=1 を GITHUB_OUTPUT に書く。"""
import collections
import json
import os
import tarfile
from pathlib import Path

base = Path(os.environ["OUT_ROOT"])
name = os.environ["JOB_NAME"]
res = Path(os.environ["RESULT_DIR"])
res.mkdir(parents=True, exist_ok=True)
(base / "out").mkdir(exist_ok=True)
full = base / "log_full.txt"
tail = collections.deque(maxlen=2000)
if full.exists():
    with open(full, encoding="utf-8", errors="replace") as f:
        for ln in f:
            tail.append(ln[:400].rstrip("\n") + "\n")
(base / "log.txt").write_text("".join(tail), encoding="utf-8")
if not (base / "time.json").exists():  # 手前で止められた（取り消し・上限）
    (base / "time.json").write_text(json.dumps({"seconds": None, "exit_code": -1, "nproc": len(os.sched_getaffinity(0)), "mem_gb": None}))
tar = res / f"{name}.tar"
with tarfile.open(tar, "w") as t:
    t.add(base / "out", arcname="out")
    t.add(base / "log.txt", arcname="log.txt")
    t.add(base / "time.json", arcname="time.json")
mb = tar.stat().st_size / 1e6
ok = mb <= 300
info = json.loads((base / "time.json").read_text())
line = f"| {name} | {info['seconds']} | {info['exit_code']} | {mb:.1f} MB | {'R2 に置く' if ok else '300 MB 超なので R2 には置かない（Actions の artifact から）'} |"
print(line)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
        f.write(line + "\n")
if os.environ.get("GITHUB_OUTPUT"):
    with open(os.environ["GITHUB_OUTPUT"], "a") as f:
        f.write(f"upload={'1' if ok else '0'}\nexit_code={info['exit_code']}\n")
