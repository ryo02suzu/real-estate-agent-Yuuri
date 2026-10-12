"""市区町村のハザードマップのページの一覧（関東1都6県）を作る。

ハザードマップポータルサイト（国土交通省・国土地理院）の「わがまちハザードマップ」のリンク先の一覧（CSV、オープンデータ）を
種類ごと（洪水・内水・高潮・津波・土砂災害）に読み、市区町村コード → 種類 → ページの URL の JSON にする。
重要事項説明（水害）には、国の重ねるハザードマップではなく、市区町村のハザードマップを使うので、その入口として画面に出す。

    python3 scripts/hazard-maps/build.py [出力先]   # 既定は lib/roadmap/data/hazard-maps.json

.github/workflows/hazard-maps.yml が毎月作り直す。
"""

import csv
import io
import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = "https://disaportal.gsi.go.jp/hazardmapportal/hazardmap/uty/hminfo/{}.csv"
# CSV の番号と種類（オープンデータのページの並び：1 洪水、2 内水、3 高潮、4 津波、5 土砂災害。6 火山・7 ため池は使わない）
KINDS = {1: "flood", 2: "naisui", 3: "takashio", 4: "tsunami", 5: "dosha"}
# 関東1都6県（茨城・栃木・群馬・埼玉・千葉・東京・神奈川）
PREFS = ("08", "09", "10", "11", "12", "13", "14")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "michilu-hazard-maps"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read().decode("cp932")


def build() -> dict:
    maps: dict[str, dict[str, str]] = {}
    for n, kind in KINDS.items():
        rows = list(csv.reader(io.StringIO(fetch(BASE.format(n)))))
        if not rows or rows[0][:4] != ["市町村コード", "都道府県", "市町村", "掲載するURL"]:
            raise SystemExit(f"{n}.csv の形が変わっています: {rows[:1]}")
        count = 0
        for code, _pref, _city, url, *_ in rows[1:]:
            code, url = code.strip(), url.strip()
            if len(code) != 5 or not code.startswith(PREFS) or not url.startswith(("https://", "http://")):
                continue
            maps.setdefault(code, {})[kind] = url
            count += 1
        print(f"{kind}: {count} 市区町村", file=sys.stderr)
    today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")
    return {"updated": today, "maps": dict(sorted(maps.items()))}


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "lib/roadmap/data/hazard-maps.json"
    data = build()
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{out}: {len(data['maps'])} 市区町村", file=sys.stderr)


if __name__ == "__main__":
    main()
