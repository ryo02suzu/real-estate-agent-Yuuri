#!/usr/bin/env python3
"""PC のホームの背景（home.py --extent --tod の朝・昼・夕・夜の4枚）を、アプリで使う WebP にする。

  python3 home_webp.py                                        # work/home/home_wide_{tod}.png → public/home/desk-japan-{tod}.webp
  python3 home_webp.py --src '見本/wide_{tod}.png' --only morning,dusk,night   # 仮（小さい見本から）

- 4枚の四隅が、アプリの lib/app/desk-japan.json の四隅と同じか確かめる（違えば何も書かずに止める）。四隅は home.py が絵と同じ
  名前の .json に書いたもの。.json が無い絵は、work/home_dem_w.json から home.py と同じ計算で出した四隅と比べる。絵の縦横の比も
  四隅と合うか確かめる（大きさは問わない。小さい見本でもよい）。
- lib/app/desk-japan.json の、その時間帯の絵の場所と「夜の街の明かりが入っている絵か」（home.py の TOD の lights が 0 より大きい：
  夕・夜。アプリはその絵を出している間だけ、明かりの出典（e-Stat・GHSL）を出す）を書き直す。作らなかった時間帯は今のまま
  （はじめは、昼は今までの public/home/desk-japan.webp）。
"""

from __future__ import annotations

import argparse
import ast
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
APP_JSON = os.path.join(ROOT, "lib", "app", "desk-japan.json")
PUBLIC = os.path.join(ROOT, "public", "home")
TODS = ["morning", "day", "dusk", "night"]
QUALITY = 80  # WebP の画質（5120×3968 で 1 枚 約 0.5〜0.8MB）
Image.MAX_IMAGE_PIXELS = None


def tod_lights() -> dict[str, bool]:
    """home.py の TOD の lights（街の明かりの強さ）が 0 より大きい時間帯（home.py は bpy が要るので、読むだけにする）"""
    with open(os.path.join(HERE, "home.py"), encoding="utf-8") as f:
        tree = ast.parse(f.read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "TOD" for t in node.targets):
            out = {}
            for k, v in zip(node.value.keys, node.value.values):
                kw = {a.arg: a.value for a in v.keywords}
                out[ast.literal_eval(k)] = float(ast.literal_eval(kw["lights"])) > 0
            return out
    raise RuntimeError("home.py の TOD が読めない")


def extent() -> tuple[list[list[float]], tuple[int, int]]:
    """home.py --extent と同じ計算の四隅（経度・緯度。左上から時計回り）と、ズーム 5 の画素での大きさ"""
    with open(os.path.join(WORK, "home_dem_w.json")) as f:
        meta = json.load(f)
    dh, dw = np.load(os.path.join(WORK, "home_dem_w.npy"), mmap_mode="r").shape
    n = 2.0 ** meta["z"]
    mx0, mx1 = meta["x0"] / n, (meta["x0"] + dw / 256.0) / n
    my0, my1 = meta["y0"] / n, (meta["y0"] + dh / 256.0) / n
    world = 512 * 2**5

    def lon(x: float) -> float:
        return x * 360 - 180

    def lat(y: float) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y))))

    corners = [[lon(mx0), lat(my0)], [lon(mx1), lat(my0)], [lon(mx1), lat(my1)], [lon(mx0), lat(my1)]]
    return corners, (int(round((mx1 - mx0) * world)), int(round((my1 - my0) * world)))


def same(a, b, tol: float = 1e-5) -> bool:
    return all(abs(p - q) <= tol for pa, pb in zip(a, b) for p, q in zip(pa, pb))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(WORK, "home", "home_wide_{tod}.png"), help="絵の場所（{tod} に morning などが入る）")
    ap.add_argument("--only", default=",".join(TODS), help="作る時間帯（カンマで区切る）")
    ap.add_argument("--quality", type=int, default=QUALITY)
    a = ap.parse_args()
    only = [t.strip() for t in a.only.split(",") if t.strip()]
    bad = [t for t in only if t not in TODS]
    if bad:
        sys.exit(f"知らない時間帯：{bad}（{TODS}）")
    with open(APP_JSON, encoding="utf-8") as f:
        app = json.load(f)
    lights = tod_lights()
    calc, size = extent()
    if not same(app["coordinates"], calc):
        sys.exit(f"アプリの四隅 {app['coordinates']} が、work/home_dem_w.json から出した四隅 {calc} と違う")

    # 先に全部確かめる（1枚でも合わなければ、何も書かない）
    jobs = []
    for tod in only:
        src = a.src.format(tod=tod)
        if not os.path.exists(src):
            print(f"{tod}：{src} が無いので、今の絵（{app['images'][tod]['url']}）のまま")
            continue
        side = os.path.splitext(src)[0] + ".json"
        if os.path.exists(side):
            with open(side) as f:
                corners = json.load(f)["coordinates"]
            where = os.path.basename(side)
        else:
            corners, where = calc, "work/home_dem_w.json から計算"
        if not same(app["coordinates"], corners):
            sys.exit(f"{tod}：四隅 {corners}（{where}）がアプリの四隅と違う。home.py --extent で描いた絵か確かめる")
        im = Image.open(src)
        ratio = (im.width / im.height) / (size[0] / size[1])
        if abs(ratio - 1) > 0.005:
            sys.exit(f"{tod}：絵の縦横の比 {im.width}×{im.height} が、四隅の範囲（{size[0]}×{size[1]}）と合わない")
        jobs.append((tod, src, im, where))

    for tod, src, im, where in jobs:
        name = f"desk-japan-{tod}.webp"
        out = os.path.join(PUBLIC, name)
        im.convert("RGB").save(out, "WEBP", quality=a.quality, method=6)
        app["images"][tod] = {"url": f"/home/{name}", "lights": lights[tod]}
        print(f"{tod}：{src}（{im.width}×{im.height}、四隅は {where}）→ public/home/{name}（{os.path.getsize(out) / 1e6:.2f}MB）")

    with open(APP_JSON, "w", encoding="utf-8") as f:
        json.dump(app, f, ensure_ascii=False, indent=1)
        f.write("\n")
    if all(v["url"] != "/home/desk-japan.webp" for v in app["images"].values()) and os.path.exists(os.path.join(PUBLIC, "desk-japan.webp")):
        print("public/home/desk-japan.webp はもう使っていない（消してよい）")


if __name__ == "__main__":
    main()
