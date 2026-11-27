#!/usr/bin/env python3
"""仕事を 1 つ動かす（op4-farm の render ジョブ）。環境変数 JOB_NAME・JOB_RUN・JOB_TIMEOUT・OUT_ROOT。
scripts/pc-opening4 を作業場所にして `python <run>`（{out} は空の出力フォルダに置き換え）を timeout --signal=INT で動かす。
ログは 1 行 400 字で切って OUT_ROOT/log_full.txt に流し、終わったら OUT_ROOT/time.json を書く。終了コードは常に 0（結果は time.json）。"""
import json
import os
import shlex
import subprocess
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
base = Path(os.environ["OUT_ROOT"])
out = base / "out"
out.mkdir(parents=True, exist_ok=True)
run = os.environ["JOB_RUN"].replace("{out}", str(out))
tmo = int(os.environ["JOB_TIMEOUT"])
cmd = ["timeout", "--signal=INT", "--kill-after=120", f"{tmo}m", "python", "-u"] + shlex.split(run)
print("$", " ".join(cmd)[:300], flush=True)
t0 = time.time()
with open(base / "log_full.txt", "w", encoding="utf-8", errors="replace") as log:
    p = subprocess.Popen(cmd, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    for line in p.stdout:
        line = line.rstrip("\n")
        if len(line) > 400:
            line = line[:400] + " …"
        log.write(line + "\n")
        log.flush()
        print(line, flush=True)
    code = p.wait()
secs = time.time() - t0


def mem_gb():
    try:
        for ln in open("/proc/meminfo"):
            if ln.startswith("MemTotal"):
                return round(int(ln.split()[1]) / 1048576, 1)
    except OSError:
        pass
    return None


info = {"seconds": round(secs, 1), "exit_code": code, "nproc": len(os.sched_getaffinity(0)), "mem_gb": mem_gb()}
(base / "time.json").write_text(json.dumps(info))
print("time.json", info, flush=True)
