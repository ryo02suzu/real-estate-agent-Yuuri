#!/usr/bin/env python3
"""データセットを 1 つ作って tar にする（op4-farm の data ジョブ）。環境変数 DS_JSON = plan.py が作った 1 件。
scripts/pc-opening4 を作業場所にして cmds を順に動かし、path（相対）を <workspace>/<tar> にまとめる。"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ds = json.loads(os.environ["DS_JSON"])
root = Path(__file__).resolve().parents[1]
ws = root.parents[1]
t0 = time.time()
for c in ds["cmds"]:
    print(f"$ {c}", flush=True)
    r = subprocess.run(c, shell=True, cwd=root)  # noqa: S602 (cmds は datasets.json＝リポジトリの中身)
    if r.returncode:
        sys.exit(f"失敗（終了 {r.returncode}）: {c}")
if not (root / ds["path"]).exists():
    sys.exit(f"作ったはずの {ds['path']} がありません")
tar = ws / ds["tar"]
tar.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(["tar", "-cf", str(tar), "-C", str(root), ds["path"]], check=True)
print(f"作成 {time.time() - t0:.0f} 秒・tar {tar.stat().st_size / 1e6:.1f} MB", flush=True)
