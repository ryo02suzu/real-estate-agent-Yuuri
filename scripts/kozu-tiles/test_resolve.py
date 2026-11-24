#!/usr/bin/env python3
"""kozu.py の resolve（ジョブごとの結果をまとめる）の確かめ。作り物の小さな結果で、調べ直したときに筆が消えないかを見る。

    python3 scripts/kozu-tiles/test_resolve.py      # requirements.txt を入れた Python で

2026-11-24：市区町村の全部を 1 つのジョブで調べ（時間切れ）、あとの回で図面を組に分けて調べ直すと、前の回のものも
あとの回のものも外れ、その市区町村の筆が 1 つも残らなかった（中部のやり直しの 15209・19364 など）。
"""
import gzip
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kozu  # noqa: E402


def square(x: float) -> str:
    return f"POLYGON (({x} 0, {x + 10} 0, {x + 10} 10, {x} 10, {x} 0))"


def feat(name: str, chiban: str) -> dict:
    ring = [[135.6, 34.5], [135.6001, 34.5], [135.6001, 34.5001], [135.6, 34.5]]
    return {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"地番区域": "T", "地番": chiban, "q": 1, "sc": 0.9, "f": name}}


def frag(name: str, x: float) -> dict:
    return {"f": name, "q": 1, "sc": 0.9, "n": 10, "g": square(x)}


def case(old_stats: dict, new_jobs: list[tuple[dict, list[str]]]) -> tuple[list[str], list]:
    """前の回：切れ端 a を置いて時間切れ。あとの回：new_jobs（ジョブの stats と、そのジョブが置く切れ端 a・b）"""
    with tempfile.TemporaryDirectory() as d:
        def job(run, idx, stats, names):
            json.dump(stats, open(os.path.join(d, f"stats-{run}-{idx}.json"), "w"))
            xs = {"27382:a": 0, "27382:b": 100}
            chiban = {"27382:a": "1", "27382:b": "2"}
            with gzip.open(os.path.join(d, f"frags-{run}-{idx}.jsonl.gz"), "wt") as f:
                f.write("".join(json.dumps(frag(n, xs[n])) + "\n" for n in names))
            with gzip.open(os.path.join(d, f"kozu-{run}-{idx}.geojsonl.gz"), "wt") as f:
                f.write("".join(json.dumps(feat(n, chiban[n])) + "\n" for n in names))
        job(9999, 9, old_stats, ["27382:a"])
        for idx, (st, names) in enumerate(new_jobs):
            job(10000, idx, st, names)
        out, so = os.path.join(d, "out.geojsonl"), os.path.join(d, "out.json")
        kozu.resolve(d, out, so)
        return sorted(json.loads(x)["properties"]["地番"] for x in open(out)), json.load(open(so))["cut"]


def main() -> None:
    cut = {"fragments": 2, "searched": 1, "parcels": 20, "cut": True}
    done = {"fragments": 1, "searched": 1, "parcels": 10}
    # 全部 → 全部
    got, c = case({"27382": cut}, [({"27382": {"fragments": 2, "searched": 2, "parcels": 20}}, ["27382:a", "27382:b"])])
    assert got == ["1", "2"] and c == [], (got, c)
    # 全部（時間切れ）→ 組 1/2・2/2（前は筆が 1 つも残らなかった）
    got, c = case({"27382": cut}, [({"27382-1of2": done}, ["27382:a"]), ({"27382-2of2": done}, ["27382:b"])])
    assert got == ["1", "2"] and c == [], (got, c)
    # 組 1/2（時間切れ）→ 細かい組 1/4・2/4（前の 1/2 を時間切れとして数え続けない）
    got, c = case({"27382-1of2": cut}, [({"27382-1of4": done}, ["27382:a"]), ({"27382-2of4": done}, ["27382:b"])])
    assert got == ["1", "2"] and c == [], (got, c)
    # 組 1/2（時間切れ）→ 細かい組 1/4 だけ（2/4 はまだ）：前の 1/2 は覆われていないので、時間切れのまま数える
    got, c = case({"27382-1of2": cut}, [({"27382-1of4": done}, ["27382:a"])])
    assert got == ["1"] and c == ["27382-1of2"], (got, c)
    print("resolve の確かめ：4 つとも通った")


if __name__ == "__main__":
    main()
