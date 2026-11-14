#!/usr/bin/env python3
"""
公図から推定した筆のタイルの「まとまり」（関東・東北などの、都府県の組ごとに作ったタイル）の一覧を作り直す。
ワークフロー（.github/workflows/kozu-tiles.yml）が、まとまりを1つ作るたびに呼ぶ。

    python3 scripts/kozu-tiles/sets.py --source lib/roadmap/data/kozu-source.json --name tohoku \
        --file tohoku-20261120-0900.pmtiles --stats work/kozu-stats.json --edition 2026年4月公開版 --out work/sets.json

今の置き場所のファイル（kozu-source.json）の sets に、この回のまとまり（名前 → タイルのファイル名・データのある市区町村・版）を
入れ替えて（無ければ足して）、次の形で書き出す。

    {"edition": "2026年4月公開版", "codes": ["02201", …全部のまとまりの市区町村], "sets": {"kanto": {"file": …, "codes": […], "edition": …}, …}}

ワークフローは、sets のファイルを tile-join で1つにまとめて R2 に置いたあと、その公開 URL を付けて置き場所のファイルを書く。

    python3 scripts/kozu-tiles/sets.py --finish work/sets.json --url https://…/kozu/kozu-20261120-0900.pmtiles --out lib/roadmap/data/kozu-source.json
    python3 scripts/kozu-tiles/sets.py --self-test        # 一覧の作り直しのテスト（ファイルは読み書きしない）

sets がまだ無い古い形（url・edition・codes だけ）は、その url のファイルを「kanto」のまとまりとして読む。
ほかのまとまりに同じ市区町村があれば、この回のものを使う（都府県の組を変えて作り直したとき）。
"""
import argparse
import json
import os
import re
import sys


def load_sets(source: dict) -> dict[str, dict]:
    """今のまとまり。sets の無い古い形は、url のファイルを kanto として読む"""
    sets = source.get("sets")
    if isinstance(sets, dict) and sets:
        return {k: dict(v) for k, v in sets.items()}
    url = source.get("url") or ""
    if not url:
        return {}
    return {"kanto": {"file": os.path.basename(url), "codes": list(source.get("codes") or []), "edition": source.get("edition") or ""}}


def update(source: dict, name: str, file: str, codes: list[str], edition: str, high_only: bool = False) -> dict:
    """この回のまとまりを入れ替えた一覧（edition は一番新しい版、codes は全部のまとまりの市区町村）。
    high_only：このまとまりは確度の高い推定だけ（kozu.py --resolve --high-only で作った）。一覧に印を残す"""
    if not re.fullmatch(r"[a-z][a-z0-9]{1,15}", name) or name == "kozu":
        raise ValueError(f"まとまりの名前が使えません: {name}")
    if not re.fullmatch(r"[a-z0-9-]+\.pmtiles", file):
        raise ValueError(f"タイルのファイル名が使えません: {file}")
    mine = set(codes)
    sets = {}
    for k, v in load_sets(source).items():
        if k == name:
            continue
        # この回に作った市区町村は、ほかのまとまりからは外す（一覧の上だけ。タイルの中身は、そのまとまりを作り直すまで残る）
        rest = [c for c in v.get("codes", []) if c not in mine]
        sets[k] = {**v, "codes": rest}
    sets[name] = {"file": file, "codes": sorted(mine), "edition": edition, **({"high_only": True} if high_only else {})}
    sets = dict(sorted(sets.items()))
    editions = sorted({v.get("edition") or "" for v in sets.values()} - {""}, key=edition_key)
    return {
        "edition": editions[-1] if editions else edition,
        "codes": sorted({c for v in sets.values() for c in v["codes"]}),
        "sets": sets,
    }


def edition_key(edition: str) -> tuple[int, int]:
    """「2026年4月公開版」→ (2026, 4)。読めなければ (0, 0)"""
    m = re.match(r"(\d{4})年(\d{1,2})月", edition)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def source_text(listing: dict, url: str) -> str:
    """置き場所のファイル（kozu-source.json）の中身。差分が読みやすいよう、項目ごとに1行（市区町村の一覧は1行に詰める）"""
    if not re.fullmatch(r"https://\S+\.pmtiles", url):
        raise ValueError(f"置き場所の URL が使えません: {url}")
    one = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    rows = [("url", url), ("edition", listing["edition"]), ("codes", listing["codes"]), ("sets", listing["sets"])]
    return "{\n" + ",\n".join(f" {json.dumps(k)}: {one(v)}" for k, v in rows) + "\n}\n"


def self_test() -> None:
    old = {"url": "https://example.r2.dev/kozu/kanto-20261018-0922.pmtiles", "edition": "2026年4月公開版", "codes": ["11101", "13101"]}
    # sets の無い古い形は、url のファイルが kanto。新しいまとまりを足す
    a = update(old, "tohoku", "tohoku-20261120-0900.pmtiles", ["04101", "02201"], "2026年4月公開版")
    assert a["sets"] == {
        "kanto": {"file": "kanto-20261018-0922.pmtiles", "codes": ["11101", "13101"], "edition": "2026年4月公開版"},
        "tohoku": {"file": "tohoku-20261120-0900.pmtiles", "codes": ["02201", "04101"], "edition": "2026年4月公開版"},
    }, a
    assert a["codes"] == ["02201", "04101", "11101", "13101"] and a["edition"] == "2026年4月公開版"
    text = source_text(a, "https://example.r2.dev/kozu/kozu-20261120-0900.pmtiles")
    assert json.loads(text) == {"url": "https://example.r2.dev/kozu/kozu-20261120-0900.pmtiles", **a}
    assert text.count("\n") == 6 and text.startswith('{\n "url": "https://example.r2.dev/kozu/kozu-20261120-0900.pmtiles",\n "edition"'), text
    # 同じ名前で作り直すと、その分だけ入れ替わる。版は一番新しいもの
    b = update(json.loads(text), "tohoku", "tohoku-20270510-0900.pmtiles", ["04101"], "2027年4月公開版")
    assert b["sets"]["tohoku"] == {"file": "tohoku-20270510-0900.pmtiles", "codes": ["04101"], "edition": "2027年4月公開版"}
    assert b["sets"]["kanto"] == a["sets"]["kanto"] and b["edition"] == "2027年4月公開版" and b["codes"] == ["04101", "11101", "13101"]
    # ほかのまとまりにあった市区町村を作ったら、一覧の上ではこの回のまとまりに移す
    c = update(json.loads(text), "kitakanto", "kitakanto-20261201-0900.pmtiles", ["08201", "11101"], "2026年4月公開版")
    assert c["sets"]["kanto"]["codes"] == ["13101"] and c["sets"]["kitakanto"]["codes"] == ["08201", "11101"]
    # 確度の高い推定だけのまとまりは、印を残す（作り直して全部を出すようにしたら、印は消える）
    e = update(json.loads(text), "kinki", "kinki-20261114-2200.pmtiles", ["27102"], "2026年4月公開版", high_only=True)
    assert e["sets"]["kinki"] == {"file": "kinki-20261114-2200.pmtiles", "codes": ["27102"], "edition": "2026年4月公開版", "high_only": True}
    assert "high_only" not in e["sets"]["kanto"] and "high_only" not in e["sets"]["tohoku"]
    assert "high_only" not in update(e, "kinki", "kinki-20261201-0900.pmtiles", ["27102"], "2026年4月公開版")["sets"]["kinki"]
    # まだ何も無いとき（url が空）は、この回のまとまりだけ
    d = update({"url": "", "edition": "", "codes": []}, "kanto", "kanto-20261018-0922.pmtiles", ["13101"], "2026年4月公開版")
    assert list(d["sets"]) == ["kanto"] and d["codes"] == ["13101"]
    for bad_name, bad_file in (("kozu", "a.pmtiles"), ("Tohoku", "a.pmtiles"), ("t", "a.pmtiles"), ("tohoku", "../a.pmtiles"), ("tohoku", "a.json")):
        try:
            update(old, bad_name, bad_file, [], "2026年4月公開版")
        except ValueError:
            continue
        raise AssertionError((bad_name, bad_file))
    try:
        source_text(a, "http://example.com/a.pmtiles")
    except ValueError:
        pass
    else:
        raise AssertionError("http の URL を通した")
    print("ok")


def main() -> None:
    if "--self-test" in sys.argv[1:]:
        return self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", help="今の置き場所のファイル（kozu-source.json）")
    ap.add_argument("--name", help="この回のまとまりの名前")
    ap.add_argument("--file", help="この回のタイルのファイル名（R2 の kozu/ の下）")
    ap.add_argument("--stats", help="この回のまとめ（kozu.py --resolve の --stats。codes を読む）")
    ap.add_argument("--edition", help="この回の版（「2026年4月公開版」）")
    ap.add_argument("--finish", help="作り直した一覧（--out で書いたもの）。--url を付けて、置き場所のファイルを書く")
    ap.add_argument("--url", help="1つにまとめたタイルの公開 URL（--finish のとき）")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.finish:
        if not a.url:
            ap.error("--finish には --url が要ります")
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(source_text(json.load(open(a.finish, encoding="utf-8")), a.url))
        return
    if not (a.source and a.name and a.file and a.stats and a.edition):
        ap.error("--source・--name・--file・--stats・--edition が要ります")
    source = json.load(open(a.source, encoding="utf-8")) if os.path.exists(a.source) else {}
    stats = json.load(open(a.stats, encoding="utf-8"))
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(update(source, a.name, a.file, stats["codes"], a.edition, bool(stats.get("high_only"))), f, ensure_ascii=False, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
