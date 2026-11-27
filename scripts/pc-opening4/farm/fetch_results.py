#!/usr/bin/env python3
"""農場の結果（R2 の tar）を取って広げる。
  python3 farm/fetch_results.py <run_id> <request.json> <dest> [--base URL]
<dest>/<仕事名>/ に tar の中身（out/ ・ log.txt ・ time.json）が入る。表（仕事・秒・終了コード・ファイル）を出す。
無い tar は表に「無し」と出す（失敗にしない）。標準ライブラリだけ。"""
import argparse
import json
import os
import sys
import tarfile
import time
import urllib.error
import urllib.request

BASE = "https://pub-2be6c197b42d4c0f9c3c7f1915ec5cff.r2.dev"
UA = "Mozilla/5.0 (compatible; render-fetch)"


def download(url, path, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            return None
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code == 404:
                return last
        except Exception as e:  # noqa: BLE001
            last = str(e)[:100]
        time.sleep(2 * (i + 1))
    return last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_id")
    ap.add_argument("request")
    ap.add_argument("dest")
    ap.add_argument("--base", default=BASE)
    a = ap.parse_args()
    names = [j["name"] for j in json.load(open(a.request, encoding="utf-8"))["jobs"]]
    os.makedirs(a.dest, exist_ok=True)
    rows, missing = [], []
    for n in names:
        d = os.path.join(a.dest, n)
        tar = os.path.join(a.dest, n + ".tar")
        err = download(f"{a.base.rstrip('/')}/farm/{a.run_id}/{n}.tar", tar)
        if err:
            missing.append((n, err))
            if os.path.exists(tar):
                os.remove(tar)
            continue
        os.makedirs(d, exist_ok=True)
        with tarfile.open(tar) as t:
            try:
                t.extractall(d, filter="data")
            except TypeError:
                t.extractall(d)
        os.remove(tar)
        info = {}
        try:
            info = json.load(open(os.path.join(d, "time.json")))
        except Exception:  # noqa: BLE001
            pass
        files = sorted(f for f in os.listdir(os.path.join(d, "out"))) if os.path.isdir(os.path.join(d, "out")) else []
        rows.append((n, info.get("seconds"), info.get("exit_code"), ", ".join(files[:6]) + (" …" if len(files) > 6 else "")))
    w = max([len(r[0]) for r in rows] + [4])
    print(f"{'job'.ljust(w)}  seconds  exit  files")
    for n, s, c, f in rows:
        print(f"{n.ljust(w)}  {str(s).rjust(7)}  {str(c).rjust(4)}  {f}")
    for n, e in missing:
        print(f"{n.ljust(w)}  MISSING ({e}) — 失敗か、まだ終わっていないか、300 MB 超（その場合は GitHub の artifact から）")
    print(f"取れた {len(rows)} / {len(names)} → {a.dest}")


if __name__ == "__main__":
    sys.exit(main())
