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

まとまりの確かさ（国の地価の地点で測った結果。scripts/kozu-tiles/check_accuracy.mjs の --json）は、sets の各まとまりの accuracy に置く
（アプリは、推定の筆の注意書きをこの数で書く。lib/roadmap/kozu-data.ts の kozuMisplaced）。
    {"file": 測ったタイル, "date": "2026-11-21", "method": 測り方, "high": {"points": 地点, "exact": 一致, "within30": 30m 以内, "elsewhere": 別の場所}, "low": {…}}
書き直すときは、ほかのまとまりの accuracy はそのまま残す。この回のまとまりは、--accuracy で渡した結果、無ければ前の回の accuracy
（前のタイルで測ったもの。測ったファイルは accuracy の file）、それも無ければ公開していないまとまりの確かさ（--unpublished。既定は
このスクリプトの隣の accuracy-unpublished.json）のその名前のものを使う。公開していないまとまりの確かさは、アプリが読まないファイルに置く
（kozu-source.json に書くと、そのまとまりを公開したことになる）。測った結果を入れるには:

    python3 scripts/kozu-tiles/sets.py --record work/kinki2.json --source lib/roadmap/data/kozu-source.json
        # 公開しているまとまりなら kozu-source.json の accuracy に（測ったファイルは、そのまとまりのファイルか1つにまとめたファイル）、
        # まだなら accuracy-unpublished.json に入れる
"""
import argparse
import json
import os
import re
import sys

# 公開していないまとまりの確かさ（アプリは読まない）
UNPUBLISHED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "accuracy-unpublished.json")
LEVELS = ("high", "low")
COUNTS = ("points", "exact", "within30", "elsewhere")


def load_sets(source: dict) -> dict[str, dict]:
    """今のまとまり。sets の無い古い形は、url のファイルを kanto として読む"""
    sets = source.get("sets")
    if isinstance(sets, dict) and sets:
        return {k: dict(v) for k, v in sets.items()}
    url = source.get("url") or ""
    if not url:
        return {}
    return {"kanto": {"file": os.path.basename(url), "codes": list(source.get("codes") or []), "edition": source.get("edition") or ""}}


def check_name(name: str) -> None:
    if not re.fullmatch(r"[a-z][a-z0-9]{1,15}", name) or name == "kozu":
        raise ValueError(f"まとまりの名前が使えません: {name}")


def check_accuracy(acc: dict) -> dict:
    """まとまりの確かさの形を確かめる（測ったファイル・日・測り方と、確かさごとの地点の数。一致 ≦ 30m 以内 ≦ 地点、30m 以内＋別の場所 ≦ 地点）"""
    if not isinstance(acc, dict) or set(acc) - {"file", "date", "method", *LEVELS}:
        raise ValueError(f"確かさの形が違います: {acc}")
    if not re.fullmatch(r"[a-z0-9-]+\.pmtiles", str(acc.get("file"))) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(acc.get("date"))):
        raise ValueError(f"確かさの測ったファイル・日が使えません: {acc.get('file')} {acc.get('date')}")
    if not isinstance(acc.get("method"), str) or not acc["method"].strip():
        raise ValueError("確かさの測り方がありません")
    for level in LEVELS:
        if level not in acc:
            continue
        n = acc[level]
        if not isinstance(n, dict) or set(n) != set(COUNTS) or not all(isinstance(n[k], int) and not isinstance(n[k], bool) and n[k] >= 0 for k in COUNTS):
            raise ValueError(f"確かさ（{level}）の数が使えません: {n}")
        if not (n["exact"] <= n["within30"] <= n["points"] and n["within30"] + n["elsewhere"] <= n["points"] and n["points"] > 0):
            raise ValueError(f"確かさ（{level}）の数が合いません: {n}")
    return acc


def accuracy_of(report: dict) -> dict:
    """check_accuracy.mjs の結果（--json）から、まとまりに置く確かさ（推定の筆の中に地点のあった確かさだけ）"""
    acc = {"file": report.get("file"), "date": report.get("date"), "method": report.get("method")}
    for level in LEVELS:
        n = report.get(level)
        if isinstance(n, dict) and n.get("points"):
            acc[level] = {k: n.get(k) for k in COUNTS}
    return check_accuracy(acc)


def update(source: dict, name: str, file: str, codes: list[str], edition: str, high_only: bool = False, accuracy: dict | None = None, unpublished: dict | None = None) -> dict:
    """この回のまとまりを入れ替えた一覧（edition は一番新しい版、codes は全部のまとまりの市区町村）。
    high_only：このまとまりは確度の高い推定だけ（kozu.py --resolve --high-only で作った）。一覧に印を残す。
    accuracy：この回のまとまりの確かさ（accuracy_of の形）。無ければ前の回のもの、それも無ければ unpublished（公開していない
    まとまりの確かさ。名前 → {"accuracy": …}）のもの。ほかのまとまりの確かさは、そのまま残す"""
    check_name(name)
    if not re.fullmatch(r"[a-z0-9-]+\.pmtiles", file):
        raise ValueError(f"タイルのファイル名が使えません: {file}")
    mine = set(codes)
    sets = {}
    old = load_sets(source)
    for k, v in old.items():
        if k == name:
            continue
        # この回に作った市区町村は、ほかのまとまりからは外す（一覧の上だけ。タイルの中身は、そのまとまりを作り直すまで残る）
        rest = [c for c in v.get("codes", []) if c not in mine]
        sets[k] = {**v, "codes": rest}
    acc = accuracy or old.get(name, {}).get("accuracy") or (unpublished or {}).get(name, {}).get("accuracy")
    if acc:
        check_accuracy(acc)
    sets[name] = {"file": file, "codes": sorted(mine), "edition": edition, **({"high_only": True} if high_only else {}), **({"accuracy": acc} if acc else {})}
    sets = dict(sorted(sets.items()))
    editions = sorted({v.get("edition") or "" for v in sets.values()} - {""}, key=edition_key)
    return {
        "edition": editions[-1] if editions else edition,
        "codes": sorted({c for v in sets.values() for c in v["codes"]}),
        "sets": sets,
    }


def record(source: dict, report: dict, unpublished: dict) -> tuple[dict, dict, bool]:
    """測った確かさ（check_accuracy.mjs の --json）を入れる。公開しているまとまり（source の sets にある）なら source の、
    まだなら unpublished の、その名前の accuracy を入れ替える。返り値は (source, unpublished, 公開しているまとまりか)。
    公開しているまとまりは、そのまとまりのファイルか、1つにまとめたファイル（url）で測ったものだけ入れる"""
    name = str(report.get("name") or "")
    check_name(name)
    acc = accuracy_of(report)
    sets = load_sets(source)
    if name in sets:
        if acc["file"] not in (sets[name].get("file"), os.path.basename(source.get("url") or "")):
            raise ValueError(f"{name} のタイル（{sets[name].get('file')}）か1つにまとめたタイルで測ってください: {acc['file']}")
        return {**source, "sets": {**sets, name: {**sets[name], "accuracy": acc}}}, unpublished, True
    codes = [str(c) for c in report.get("codes") or []]
    if not codes or not all(re.fullmatch(r"\d{2}(?:\d{3})?", c) for c in codes):
        raise ValueError(f"測った都府県・市区町村のコードがありません: {codes}")
    return source, {**unpublished, name: {"codes": codes, "accuracy": acc}}, False


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
    accuracy_test(text)
    print("ok")


def accuracy_test(text: str) -> None:
    """まとまりの確かさ（accuracy）：測った結果から作る・書き直しても残る・公開していないまとまりは別のファイルに"""
    report = {
        "name": "kanto", "file": "kozu-20261120-0900.pmtiles", "layer": "kozu", "codes": ["11", "13"], "date": "2026-11-21", "method": "地価の地点で比べた",
        "points": 900, "inside": 30,
        "high": {"points": 20, "exact": 17, "within30": 19, "elsewhere": 1, "other": 0, "categories": {"一致": 17}},
        "low": {"points": 10, "exact": 6, "within30": 8, "elsewhere": 1, "other": 1, "categories": {}},
        "prefs": {"13": {"name": "東京都"}},
    }  # fmt: skip
    acc = accuracy_of(report)
    assert acc == {
        "file": "kozu-20261120-0900.pmtiles", "date": "2026-11-21", "method": "地価の地点で比べた",
        "high": {"points": 20, "exact": 17, "within30": 19, "elsewhere": 1}, "low": {"points": 10, "exact": 6, "within30": 8, "elsewhere": 1},
    }, acc  # fmt: skip
    # 推定の筆の中に地点の無かった確かさは置かない（確度の高い推定だけのまとまり）
    assert "low" not in accuracy_of({**report, "low": {"points": 0, "exact": 0, "within30": 0, "elsewhere": 0}})
    for bad in ({"exact": 21}, {"within30": 20, "elsewhere": 1}, {"points": -1}, {"points": 1.5}, {"elsewhere": True}):
        try:
            accuracy_of({**report, "high": {**report["high"], **bad}})
        except ValueError:
            continue
        raise AssertionError(bad)
    for bad in ({"file": "../a.pmtiles"}, {"date": "2026/11/21"}, {"method": ""}):
        try:
            accuracy_of({**report, **bad})
        except ValueError:
            continue
        raise AssertionError(bad)
    # 公開しているまとまりに入れる（1つにまとめたファイルで測ったもの）。ほかのまとまりと、ほかの項目はそのまま
    src = json.loads(text)
    got, un, published = record(src, report, {})
    assert published and un == {} and got["sets"]["kanto"] == {**src["sets"]["kanto"], "accuracy": acc} and got["sets"]["tohoku"] == src["sets"]["tohoku"]
    assert got["url"] == src["url"] and got["codes"] == src["codes"]
    try:
        record(src, {**report, "file": "kanto-20250101-0000.pmtiles"}, {})
    except ValueError:
        pass
    else:
        raise AssertionError("ほかのタイルで測った確かさを入れた")
    # 公開していないまとまりは、別のファイル（アプリが読まない）に。kozu-source.json は変えない
    got2, un2, published2 = record(src, {**report, "name": "kinki2", "file": "kinki2-20261114-2254.pmtiles", "codes": ["25", "28"]}, {})
    assert not published2 and got2 == src and un2 == {"kinki2": {"codes": ["25", "28"], "accuracy": {**acc, "file": "kinki2-20261114-2254.pmtiles"}}}
    # 書き直すとき：ほかのまとまりの確かさは残る。この回のまとまりは、渡した結果 → 前の回 → 公開していないまとまりの確かさの順
    listing = {"edition": got["edition"], "codes": got["codes"], "sets": got["sets"]}
    with_acc = json.loads(source_text(listing, got["url"]))
    t = update(with_acc, "tohoku", "tohoku-20270510-0900.pmtiles", ["04101"], "2027年4月公開版")
    assert t["sets"]["kanto"]["accuracy"] == acc and "accuracy" not in t["sets"]["tohoku"]
    k = update(with_acc, "kanto", "kanto-20270510-0900.pmtiles", ["11101", "13101"], "2027年4月公開版")
    assert k["sets"]["kanto"]["accuracy"] == acc  # 前の回のタイルで測ったもの（file でわかる）
    new_acc = {**acc, "file": "kanto-20270510-0900.pmtiles", "date": "2027-05-20"}
    assert update(with_acc, "kanto", "kanto-20270510-0900.pmtiles", ["11101"], "2027年4月公開版", accuracy=new_acc)["sets"]["kanto"]["accuracy"] == new_acc
    n = update(with_acc, "kinki2", "kinki2-20261201-0900.pmtiles", ["25201"], "2026年4月公開版", high_only=True, unpublished=un2)
    assert n["sets"]["kinki2"]["accuracy"] == un2["kinki2"]["accuracy"] and n["sets"]["kinki2"]["high_only"] is True
    assert "accuracy" not in update(with_acc, "kinki2", "kinki2-20261201-0900.pmtiles", ["25201"], "2026年4月公開版")["sets"]["kinki2"]
    # 書き出した置き場所のファイルにも残る（1つのまとまりは1行の sets の中）
    again = json.loads(source_text({"edition": n["edition"], "codes": n["codes"], "sets": n["sets"]}, got["url"]))
    assert again["sets"]["kanto"]["accuracy"] == acc and again["sets"]["kinki2"]["accuracy"]["file"] == "kinki2-20261114-2254.pmtiles"


def unpublished_text(un: dict) -> str:
    """公開していないまとまりの確かさのファイルの中身（名前の順・まとまりごとに1行）"""
    one = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    return "{\n" + ",\n".join(f" {json.dumps(k)}: {one(un[k])}" for k in sorted(un)) + "\n}\n" if un else "{}\n"


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
    ap.add_argument("--accuracy", help="この回のまとまりの確かさ（check_accuracy.mjs の --json）。無ければ前の回のもの")
    ap.add_argument("--unpublished", default=UNPUBLISHED, help="公開していないまとまりの確かさ（既定はこのスクリプトの隣の accuracy-unpublished.json）")
    ap.add_argument("--record", help="測った確かさ（check_accuracy.mjs の --json）を、--source（公開しているまとまり）か --unpublished に入れる")
    ap.add_argument("--out")
    a = ap.parse_args()
    unpublished = json.load(open(a.unpublished, encoding="utf-8")) if os.path.exists(a.unpublished) else {}
    if a.record:
        if not a.source:
            ap.error("--record には --source が要ります")
        source = json.load(open(a.source, encoding="utf-8"))
        source, unpublished, published = record(source, json.load(open(a.record, encoding="utf-8")), unpublished)
        if published:
            with open(a.out or a.source, "w", encoding="utf-8") as f:
                f.write(source_text(source, source["url"]))
        else:
            with open(a.unpublished, "w", encoding="utf-8") as f:
                f.write(unpublished_text(unpublished))
        print(f"確かさを{'置き場所のファイル' if published else '公開していないまとまりの確かさ'}に入れた", file=sys.stderr)
        return
    if not a.out:
        ap.error("--out が要ります")
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
    accuracy = None
    if a.accuracy:
        report = json.load(open(a.accuracy, encoding="utf-8"))
        if report.get("name") != a.name:
            ap.error(f"--accuracy はまとまり {a.name} を測ったものにしてください: {report.get('name')}")
        accuracy = accuracy_of(report)
    listing = update(source, a.name, a.file, stats["codes"], a.edition, bool(stats.get("high_only")), accuracy, unpublished)
    acc = listing["sets"][a.name].get("accuracy")
    if not acc:
        print(f"::warning::{a.name} の確かさ（国の地価の地点で測った結果）がありません。check_accuracy.mjs で測り、sets.py --record で入れる", file=sys.stderr)
    elif acc["file"] != a.file:
        print(f"::warning::{a.name} の確かさは前に測ったもの（{acc['file']}・{acc['date']}）。新しいタイル {a.file} を check_accuracy.mjs で測り、sets.py --record で入れ直す", file=sys.stderr)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(listing, f, ensure_ascii=False, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
