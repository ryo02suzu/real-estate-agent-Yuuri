#!/usr/bin/env python3
"""
全国地価マップ（資産評価システム研究センター、https://www.chikamap.jp/）の地図の番号のうち、相続税路線価・固定資産税路線価・
地価公示（地価調査）の最新の年分・年度のものを、lib/roadmap/data/chikamap.json に書く。アプリ（lib/roadmap/rosenka.ts）は
この番号で、物件の場所の路線価の地図を開く。

地図は年度・年分ごとに別の番号（固定資産税 2xx・相続税 3xx・地価公示 1xx）で、新しい年度・年分が出ると番号が増える
（相続税は毎年7月1日、固定資産税は評価替えの年の春など）。トップページ（Portal）に埋め込まれた地図の一覧から、種類ごとに
番号の一番大きいものを選ぶ。

  python3 scripts/chikamap/update.py          # 最新の番号を確かめ、変わっていれば chikamap.json を書き換える（changed=true/false）
  python3 scripts/chikamap/update.py --dry    # 書き換えずに出すだけ

サイトの TLS の鍵交換の設定が古く、OpenSSL 3 の既定のセキュリティレベルでは繋がらないため、レベルを1に下げて読む
（読むのは公開のトップページだけ）。
"""
import argparse
import datetime
import json
import os
import re
import ssl
import sys
import urllib.request

PORTAL = "https://www.chikamap.jp/chikamap/Portal?mid=216"
UA = {"User-Agent": "Mozilla/5.0 (compatible; michilu-chikamap; +https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
# 種類 → 地図の名前の始まり
KINDS = {"souzoku": "相続税路線価等", "kotei": "固定資産税路線価等", "koji": "地価公示・地価調査"}


def fetch(url: str) -> str:
    ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE"))
    ctx.set_ciphers("DEFAULT@SECLEVEL=1")
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60, context=ctx) as r:
        return r.read().decode("utf-8", "replace")


def latest(html: str) -> dict[str, dict]:
    maps = [(int(m), n) for m, n in re.findall(r'"MapId":(\d+),"MapName":"([^"]+)"', html)]
    out = {}
    for kind, prefix in KINDS.items():
        found = [(mid, name) for mid, name in maps if name.startswith(prefix)]
        if not found:
            sys.exit(f"::error::{prefix} の地図が一覧にありません（サイトの作りが変わった？）")
        mid, name = max(found)
        out[kind] = {"mid": mid, "name": name}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="lib/roadmap/data/chikamap.json")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    maps = latest(fetch(PORTAL))
    current = json.load(open(a.out, encoding="utf-8")) if os.path.exists(a.out) else {}
    changed = maps != current.get("maps")
    for kind, m in maps.items():
        print(f"{kind}: {m['mid']} {m['name']}（アプリ: {current.get('maps', {}).get(kind, {}).get('mid')}）")
    if changed and not a.dry:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump({"checked": str(datetime.date.today()), "maps": maps}, f, ensure_ascii=False, indent=1)
            f.write("\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")
    print("更新あり" if changed else "更新なし")


if __name__ == "__main__":
    main()
