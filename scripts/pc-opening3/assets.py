#!/usr/bin/env python3
"""PC のオープニング第3版の素材（Poly Haven。どれも CC0：だれでも自由に使える・出典の表示も要らない）を取ってくる。

  python3 assets.py              # 下の一覧をすべて → work/assets/{種類}/{名前}/（取ったものは取り直さない）
  python3 assets.py fir_tree_01  # 一部だけ

Poly Haven の公開 API（https://api.polyhaven.com）で、ファイルの場所を聞いてから取る。ライセンスは
https://polyhaven.com/license （CC0 1.0）。2026-11-21 に確かめた。
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("PC_OPENING3_WORK", os.path.join(HERE, "work"))
UA = "Mozilla/5.0 (compatible; asset-fetch/1.0)"

# 3D のモデル（Blender のファイルと、その絵）。木は写真から作られた本物の針葉樹
MODELS = [
    "fir_tree_01",  # モミ（3本。樹皮・針葉の小枝は写真から）
    "fir_sapling_medium",  # モミの若木
    "pine_sapling_medium",
    "dead_tree_trunk",  # 倒木・流木
    "dead_tree_trunk_02",
    "boulder_01",
    "rock_moss_set_01",
    "rock_moss_set_02",
    "stone_01",
    "grass_medium_01",
    "grass_medium_02",
    "fern_02",
    "tree_stump_01",
]
# 地面の質感（色・凹凸・粗さ）
TEXTURES = [
    "river_small_rocks",
    "dry_riverbed_rock",
    "ganges_river_pebbles",
    "forest_ground_04",
    "forest_leaves_02",
    "rocky_terrain_02",
    "rock_face_03",
    "mossy_rock",
    "aerial_rocks_02",
    "aerial_grass_rock",
]
# 空（朝の空。光にも使う）
HDRIS = ["kloppenheim_06_puresky", "qwantani_sunrise_puresky", "misty_dawn", "pink_sunrise", "lakeside_sunrise"]
RES = {"models": "2k", "textures": "2k", "hdris": "4k"}


def api(path: str) -> dict:
    req = urllib.request.Request("https://api.polyhaven.com/" + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def get(url: str, path: str) -> None:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            os.replace(path + ".part", path)
            return
        except Exception as e:  # 通信の途切れ
            print(f"  もう一度（{e}）", flush=True)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"取れなかった: {url}")


def fetch(kind: str, name: str) -> None:
    files = api(f"files/{name}")
    res = RES[kind]
    out = os.path.join(WORK, "assets", kind, name)
    if kind == "models":
        b = files["blend"][res]["blend"]
        get(b["url"], os.path.join(out, f"{name}.blend"))
        for rel, inc in b.get("include", {}).items():
            get(inc["url"], os.path.join(out, rel))
    elif kind == "textures":
        # 色・法線（OpenGL）・粗さ・高さ（と AO）を JPG で
        for m in ["Diffuse", "nor_gl", "Rough", "Displacement", "AO"]:
            if m in files and res in files[m]:
                f = files[m][res].get("jpg") or files[m][res].get("png")
                get(f["url"], os.path.join(out, os.path.basename(f["url"])))
    else:
        f = files["hdri"][res]["exr"]
        get(f["url"], os.path.join(out, os.path.basename(f["url"])))
    info = api(f"info/{name}")
    with open(os.path.join(out, "info.json"), "w") as fh:
        json.dump({"name": info.get("name"), "authors": info.get("authors"), "license": "CC0 1.0（https://polyhaven.com/license）", "source": f"https://polyhaven.com/a/{name}"}, fh, ensure_ascii=False, indent=1)
    print(f"{kind} {name}", flush=True)


def main() -> None:
    want = set(sys.argv[1:])
    for kind, names in (("models", MODELS), ("textures", TEXTURES), ("hdris", HDRIS)):
        for n in names:
            if not want or n in want:
                fetch(kind, n)


if __name__ == "__main__":
    main()
