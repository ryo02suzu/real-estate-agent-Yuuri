#!/usr/bin/env python3
"""動画を作る AI（Google の Gemini Omni Flash。gemini-omni-1.2-flash）で、オープニングの場面を作る（GitHub Actions の
.github/workflows/omni-video.yml から使う。鍵は環境変数 GEMINI_API_KEY。中身は出さない）。

  python3 omni.py plan <仕事.json>                       # 作る場面と、かかる額の見込みだけ出す（AI は呼ばない）
  python3 omni.py run <仕事.json> --out <フォルダ> --max-usd 3

仕事のファイル（scripts/omni/jobs/*.json）：
  {"defaults": {"resolution": "720p", "aspect_ratio": "16:9", "duration": 8},
   "takes": [
     {"name": "s1-a", "prompt": "...", "first": "scripts/omni/frames/a.jpg", "last": "scripts/omni/frames/b.jpg"},
     {"name": "s1-a-dive", "after": "s1-a", "prompt": "...", "duration": 6},     # 同じ回の場面の続き（あとに足す）
     {"name": "x", "extend": "<前の回の番号>/<場面の名前>", "prompt": "..."}       # 前の回の場面の続き
   ]}
- first だけ：その絵から始まる。first と last：その 2 枚のあいだを作る（3〜10 秒）。どちらも無い：文だけで作る。
- after・extend：前の場面の終わりに足す（1 回 3〜10 秒。全部で 30 秒まで）。Google がその場面を覚えているのは 55 日。

決まりは公式の説明（2026-11-24 に確かめた。https://aistudio.google.com/docs/omni ・/docs/video ・/docs/pricing ・/docs/terms）：
- POST https://generativelanguage.googleapis.com/v1beta/interactions（Interactions API）。答えは steps の model_output の中の
  type "video"（data に base64、delivery "uri" のときは uri）。uri は files/<ID>:download?alt=media で取る
- 長さ 3〜15 秒（2 枚のあいだ・続きは 3〜10 秒）。大きさ 360p・720p・1080p（引き伸ばし）・4k（引き伸ばし）。16:9 か 9:16
- 値段（有料のみ。無料の枠は無い）：1 秒 360p 0.023・720p 約 0.07・1080p 0.104・4k 0.209 ドル
- 音は消せない（作った動画から、ここで音を外す。オープニングは音なし）。見えない透かし（SynthID）が入る
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://generativelanguage.googleapis.com/v1beta"
MODEL = "gemini-omni-1.2-flash"
RATE = {"360p": 0.023, "720p": 0.07, "1080p": 0.104, "4k": 0.209}  # ドル/秒（公式の値段の表）
UA = "Mozilla/5.0 (compatible; omni-client/1.0)"
_print_lock = threading.Lock()


def log(*a) -> None:
    with _print_lock:
        print(*a, flush=True)


def key() -> str:
    k = os.environ.get("GEMINI_API_KEY", "")
    if not k:
        sys.exit("::error::GEMINI_API_KEY がありません（GitHub の Secrets に入れる）")
    return k


def request(method: str, url: str, body: dict | None = None, timeout: int = 1800) -> tuple[int, bytes]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"x-goog-api-key": key(), "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def load_job(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        job = json.load(f)
    d = job.get("defaults", {})
    names = set()
    for t in job["takes"]:
        for k, v in d.items():
            t.setdefault(k, v)
        t.setdefault("resolution", "720p")
        t.setdefault("aspect_ratio", "16:9")
        t.setdefault("duration", 8)
        if t["name"] in names or not t["name"].replace("-", "").replace("_", "").isalnum():
            sys.exit(f"場面の名前が重なっているか、使えない文字がある：{t['name']}")
        names.add(t["name"])
        if t["resolution"] not in RATE:
            sys.exit(f"大きさは {list(RATE)} のどれか：{t['name']}")
        two = bool(t.get("first") and t.get("last"))
        more = bool(t.get("after") or t.get("extend"))
        hi = 10 if (two or more) else 15
        if not 3 <= int(t["duration"]) <= hi:
            sys.exit(f"長さは 3〜{hi} 秒：{t['name']}")
        if t.get("after") and t["after"] not in names:
            sys.exit(f"after の場面は、その前に書く：{t['name']} ← {t['after']}")
    return job


def plan_cost(job: dict) -> float:
    return sum(int(t["duration"]) * RATE[t["resolution"]] for t in job["takes"])


def image_part(path: str) -> dict:
    mime = "image/png" if path.lower().endswith(".png") else "image/jpeg"
    with open(path, "rb") as f:
        return {"type": "image", "data": base64.b64encode(f.read()).decode(), "mime_type": mime}


def find_video(resp: dict) -> dict | None:
    for step in resp.get("steps", []) or []:
        if step.get("type") != "model_output":
            continue
        for c in step.get("content", []) or []:
            if isinstance(c, dict) and c.get("type") == "video":
                return c
    return None


def fetch_video(c: dict) -> bytes:
    if c.get("data"):
        return base64.b64decode(c["data"])
    uri = c.get("uri", "")
    if "/files/" not in uri:
        raise RuntimeError(f"動画の置き場が分からない：{str(c)[:200]}")
    fid = uri.split("/files/", 1)[1].split(":", 1)[0].split("?", 1)[0]
    for _ in range(120):
        code, raw = request("GET", f"{API}/files/{fid}", timeout=60)
        state = json.loads(raw or b"{}").get("state", "") if code == 200 else ""
        if state == "ACTIVE":
            break
        if state == "FAILED":
            raise RuntimeError("動画のファイルが FAILED")
        time.sleep(5)
    code, raw = request("GET", f"{API}/files/{fid}:download?alt=media", timeout=600)
    if code != 200:
        raise RuntimeError(f"動画を取れない（HTTP {code}）: {raw[:200]!r}")
    return raw


def prior_ids(spec: str) -> str:
    """前の回の場面の、Google 側の番号（R2 の公開の置き場の omni/<回>/ids.json）"""
    run, _, name = spec.partition("/")
    base = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    req = urllib.request.Request(f"{base}/omni/{run}/ids.json", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        ids = json.load(r)
    if name not in ids:
        raise RuntimeError(f"前の回に {name} が無い")
    return ids[name]


def make(t: dict, out: str, ids: dict, done: dict) -> dict:
    name = t["name"]
    rec = {"name": name, "resolution": t["resolution"], "duration": int(t["duration"]), "ok": False}
    try:
        parts: list[dict] = []
        for k in ("first", "last"):
            if t.get(k):
                parts.append(image_part(t[k]))
        body: dict = {
            "model": MODEL,
            "input": parts + [{"type": "text", "text": t["prompt"]}] if parts else t["prompt"],
            "response_format": {"type": "video", "duration": f"{int(t['duration'])}s", "resolution": t["resolution"],
                                "aspect_ratio": t["aspect_ratio"], "delivery": "uri"},
        }
        if t.get("after"):
            done[t["after"]].wait()
            if t["after"] not in ids:
                raise RuntimeError(f"前の場面 {t['after']} ができなかった")
            body["previous_interaction_id"] = ids[t["after"]]
        elif t.get("extend"):
            body["previous_interaction_id"] = prior_ids(t["extend"])
        t0 = time.time()
        for attempt in range(4):
            code, raw = request("POST", f"{API}/interactions", body)
            if code == 200:
                break
            log(f"{name}：HTTP {code}（{attempt + 1} 回目）{raw[:300]!r}")
            if code not in (429, 500, 502, 503, 504):
                raise RuntimeError(f"HTTP {code}: {raw[:300]!r}")
            time.sleep(20 * 2**attempt)
        else:
            raise RuntimeError("混んでいて作れなかった")
        resp = json.loads(raw)
        rec["interaction"] = resp.get("id", "")
        rec["status"] = resp.get("status", "")
        c = find_video(resp)
        if c is None:
            raise RuntimeError(f"答えに動画が無い：{json.dumps(resp, ensure_ascii=False)[:400]}")
        video = fetch_video(c)
        raw_path = os.path.join(out, f"{name}.audio.mp4")
        with open(raw_path, "wb") as f:
            f.write(video)
        # 音を外す（オープニングは音なし。画は作り直さない）
        final = os.path.join(out, f"{name}.mp4")
        if shutil.which("ffmpeg"):
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", raw_path, "-an", "-c:v", "copy", final], check=True)
            os.remove(raw_path)
        else:
            os.replace(raw_path, final)
        rec["ok"] = True
        rec["seconds"] = round(time.time() - t0, 1)
        rec["usd"] = round(int(t["duration"]) * RATE[t["resolution"]], 3)
        if rec["interaction"]:
            ids[name] = rec["interaction"]
        log(f"{name}：できた（{rec['seconds']} 秒・約 {rec['usd']} ドル）")
    except Exception as e:  # noqa: BLE001 — 1 つの場面の失敗で、ほかを止めない
        rec["error"] = str(e)[:500]
        log(f"::warning::{name}：{rec['error']}")
    finally:
        done[name].set()
    return rec


def run(a) -> None:
    job = load_job(a.job)
    cost = plan_cost(job)
    log(f"場面 {len(job['takes'])}・見込み 約 {cost:.2f} ドル（上限 {a.max_usd} ドル）")
    if cost > a.max_usd:
        sys.exit(f"::error::見込み {cost:.2f} ドルが上限 {a.max_usd} ドルを超える。作らない")
    key()
    os.makedirs(a.out, exist_ok=True)
    ids: dict[str, str] = {}
    done = {t["name"]: threading.Event() for t in job["takes"]}
    with ThreadPoolExecutor(max_workers=4) as ex:
        recs = list(ex.map(lambda t: make(t, a.out, ids, done), job["takes"]))
    with open(os.path.join(a.out, "ids.json"), "w") as f:
        json.dump(ids, f, indent=1)
    used = sum(r.get("usd", 0) for r in recs)
    rep = {"model": MODEL, "job": a.job, "takes": recs, "usd": round(used, 3)}
    with open(os.path.join(a.out, "report.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    log(f"できた {sum(r['ok'] for r in recs)}/{len(recs)}・使った額 約 {used:.2f} ドル")
    if not any(r["ok"] for r in recs):
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("job")
    r = sub.add_parser("run")
    r.add_argument("job")
    r.add_argument("--out", required=True)
    r.add_argument("--max-usd", type=float, default=3.0)
    a = ap.parse_args()
    if a.cmd == "plan":
        job = load_job(a.job)
        for t in job["takes"]:
            src = "2 枚のあいだ" if t.get("first") and t.get("last") else "絵から" if t.get("first") else "続き" if (t.get("after") or t.get("extend")) else "文だけ"
            print(f"{t['name']}：{t['duration']} 秒・{t['resolution']}・{src}・約 {int(t['duration']) * RATE[t['resolution']]:.2f} ドル")
        print(f"合わせて 約 {plan_cost(job):.2f} ドル")
    else:
        run(a)


if __name__ == "__main__":
    main()
