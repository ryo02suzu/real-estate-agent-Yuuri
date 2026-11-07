"""対応している地方と都道府県（lib/roadmap/data/regions.json と同じもの）。

    from regions import prefs, pref_names, REGIONS
    prefs()            # 全部の都道府県コード（("08", …, "23")）
    prefs("chubu")     # 地方を指定
    prefs("kanto,chubu")

スクリプトは `--region`（省略時は全部）で絞る。環境変数 MICHILU_REGION でも指定できる。
"""
from __future__ import annotations

import json
import os

_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib", "roadmap", "data", "regions.json")
with open(_PATH, encoding="utf-8") as f:
    REGIONS: dict[str, dict] = json.load(f)


def prefs(region: str | None = None) -> tuple[str, ...]:
    """地方（"kanto"・"chubu"・"kanto,chubu"・"all"・None）→ 都道府県コードの並び（コード順）"""
    region = region or os.environ.get("MICHILU_REGION") or "all"
    keys = list(REGIONS) if region in ("all", "") else [k.strip() for k in region.split(",") if k.strip()]
    out: list[str] = []
    for k in keys:
        if k not in REGIONS:
            raise SystemExit(f"地方が分かりません: {k}（{', '.join(REGIONS)} のどれか）")
        out.extend(REGIONS[k]["prefs"])
    return tuple(sorted(out))


def pref_names(region: str | None = None) -> dict[str, str]:
    """都道府県コード → 名前"""
    want = set(prefs(region))
    return {code: name for r in REGIONS.values() for code, name in r["prefs"].items() if code in want}


def region_of(pref: str) -> str | None:
    """都道府県コード（2桁）か市区町村コード → 地方の鍵"""
    for k, r in REGIONS.items():
        if pref[:2] in r["prefs"]:
            return k
    return None
