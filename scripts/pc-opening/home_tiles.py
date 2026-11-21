#!/usr/bin/env python3
"""PC のホームの背景を、アプリで使うタイル（拡大の段階ごとの小さな絵）にする。

  python3 home_tiles.py                     # 朝・昼・夕・夜 → public/home/tiles/{tod}/{z}/{x}/{y}.webp と lib/app/desk-japan.json
  python3 home_tiles.py --only day --out 見本/tiles   # 1つだけ、別の場所へ（試し）

材料：広い版（home.py --extent --tod。work/home/home_wide_{tod}.png。ズーム 7 の細かさ）と、細かい版（home_hd.py。陸のある
区画だけ、4倍＝ズーム 9 の細かさ。work/home_hd/{tod}/{列}_{行}.png）。
いちばん細かい段（タイルのズーム 8）：細かい版の区画を、隣の区画・広い版と、重ねた幅（64 画素）でなめらかに混ぜる。区画の無い所
（海だけの所）は、広い版を4倍に引き伸ばす（海はなめらかなので変わらない）。それより粗い段は、1つ細かい段の4枚を、光の量で
平均して半分にする（明るさが変わらない）。

タイル：1枚 512 画素の絵を、地図には 256 画素のタイルとして出す（MapLibre の tileSize 256。細かい画面（Mac・iPad など）でも
くっきり見える）。タイルのズーム z は 4〜8（8 がいちばん細かい。地図のズーム 8 で絵の 1 画素が画面の 1 画素）。範囲の外は透明。
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import shutil
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from home_hd_prep import OVERLAP, PART, origin  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
HD = os.path.join(WORK, "home_hd")
APP_JSON = os.path.join(ROOT, "lib", "app", "desk-japan.json")
TODS = ["morning", "day", "dusk", "night"]
TOP = 8  # いちばん細かい段のタイルのズーム（512 画素の絵＝ズーム 9 の細かさ）
BOTTOM = 4
T = 512
QUALITY = {8: 80, 7: 82, 6: 84, 5: 86, 4: 86}  # WebP の画質（細かい段ほど1枚の中の模様が細かく、少し下げても目立たない）
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


def lin(a: np.ndarray) -> np.ndarray:
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def srgb(a: np.ndarray) -> np.ndarray:
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055) * 255.0


def top_level(tod: str, tmp: str) -> tuple[int, int, int, int]:
    """いちばん細かい段のタイルを、透明度なしの PNG で tmp/8/{x}/{y}.png に書く。返すのはタイルの範囲（x0, y0, x1, y1。含まない）"""
    base = Image.open(os.path.join(WORK, "home", f"home_wide_{tod}.png")).convert("RGB")
    W1, H1 = base.size
    m = 4  # 引き伸ばすときに、まわりに付ける画素（範囲の端は端の色を繰り返す）
    base = Image.fromarray(np.pad(np.asarray(base), ((m, m), (m, m), (0, 0)), mode="edge"))
    ox, oy = origin()
    K = 4
    with open(os.path.join(HD, "parts.json")) as f:
        parts = {tuple(p) for p in json.load(f)["parts"]}
    x0, y0 = ox // T, oy // T
    nx, ny = W1 * K // T, H1 * K // T
    assert ox % T == 0 and oy % T == 0 and (W1 * K) % T == 0 and (H1 * K) % T == 0, "範囲がタイルの境目にそろっていない"
    D = PART + 2 * OVERLAP
    # 区画の重み（描く所の中の位置ごと。縦横の掛け算。隣の区画と足すと 1）
    edge = np.clip(np.minimum(np.arange(D) + 0.5, D - np.arange(D) - 0.5) / (2 * OVERLAP), 0.0, 1.0)
    wpart = (edge[:, None] * edge[None, :]).astype(np.float32)
    cache: dict[tuple[int, int], np.ndarray] = {}

    def part_img(ij):
        if ij not in cache:
            if len(cache) > 48:
                cache.pop(next(iter(cache)))
            p = os.path.join(HD, tod, f"{ij[0]}_{ij[1]}.png")
            cache[ij] = lin(np.asarray(Image.open(p).convert("RGB"), np.float32)).astype(np.float32)
        return cache[ij]

    missing = sorted(p for p in parts if not os.path.exists(os.path.join(HD, tod, f"{p[0]}_{p[1]}.png")))
    if missing:
        sys.exit(f"{tod}：描いていない区画がある（{len(missing)} か所。例 {missing[:5]}）")
    for ty in range(ny):
        for tx in range(nx):
            # タイルの範囲（ズーム 9 の画素）
            X0, Y0 = (x0 + tx) * T, (y0 + ty) * T
            # 広い版を4倍に引き伸ばす（まわり 4 画素を付けて切り出し、なめらかに）
            bx, by = (X0 - ox) // K + m, (Y0 - oy) // K + m  # 付けた画素の分ずらす
            crop = base.crop((bx - m, by - m, bx + T // K + m, by + T // K + m))
            up = crop.resize(((T // K + 2 * m) * K, (T // K + 2 * m) * K), Image.LANCZOS)
            acc = lin(np.asarray(up, np.float32)[m * K : m * K + T, m * K : m * K + T]).astype(np.float32)
            wsum = np.zeros((T, T), np.float32)
            num = np.zeros((T, T, 3), np.float32)
            # このタイルに重なる区画
            i0 = (X0 - ox - OVERLAP) // PART
            i1 = (X0 + T - 1 - ox + OVERLAP) // PART
            j0 = (Y0 - oy - OVERLAP) // PART
            j1 = (Y0 + T - 1 - oy + OVERLAP) // PART
            for j in range(j0, j1 + 1):
                for i in range(i0, i1 + 1):
                    if (i, j) not in parts:
                        continue
                    dx0, dy0 = ox + i * PART - OVERLAP, oy + j * PART - OVERLAP  # 描く所の左上
                    sx0, sy0 = max(X0, dx0), max(Y0, dy0)
                    sx1, sy1 = min(X0 + T, dx0 + D), min(Y0 + T, dy0 + D)
                    if sx0 >= sx1 or sy0 >= sy1:
                        continue
                    img = part_img((i, j))
                    w = wpart[sy0 - dy0 : sy1 - dy0, sx0 - dx0 : sx1 - dx0]
                    num[sy0 - Y0 : sy1 - Y0, sx0 - X0 : sx1 - X0] += img[sy0 - dy0 : sy1 - dy0, sx0 - dx0 : sx1 - dx0] * w[..., None]
                    wsum[sy0 - Y0 : sy1 - Y0, sx0 - X0 : sx1 - X0] += w
            wsum = np.minimum(wsum, 1.0)
            out = num + acc * (1.0 - wsum)[..., None]
            d = os.path.join(tmp, str(TOP), str(x0 + tx))
            os.makedirs(d, exist_ok=True)
            Image.fromarray(srgb(out).round().astype(np.uint8)).save(os.path.join(d, f"{y0 + ty}.png"), compress_level=1)
        print(f"  {tod} ズーム {TOP}：{ty + 1}/{ny} 行", flush=True)
    return x0, y0, x0 + nx, y0 + ny


def coarser(tmp: str, z: int, box: tuple[float, float, float, float]) -> None:
    """1つ細かい段（z+1）の4枚を、光の量で平均して半分にする（透明度つき。範囲の外は透明）"""
    fx0, fy0, fx1, fy1 = box  # 範囲（ズーム z+1 のタイルの単位。小数あり）
    zx0, zy0 = int(fx0 // 2), int(fy0 // 2)
    zx1, zy1 = int(-(-fx1 // 2)), int(-(-fy1 // 2))
    for y in range(zy0, zy1):
        for x in range(zx0, zx1):
            big = np.zeros((2 * T, 2 * T, 4), np.float32)
            for dy in range(2):
                for dx in range(2):
                    p = os.path.join(tmp, str(z + 1), str(2 * x + dx), f"{2 * y + dy}.png")
                    if not os.path.exists(p):
                        continue
                    im = np.asarray(Image.open(p).convert("RGBA"), np.float32)
                    a = im[..., 3:] / 255.0
                    big[dy * T : (dy + 1) * T, dx * T : (dx + 1) * T, :3] = lin(im[..., :3]) * a
                    big[dy * T : (dy + 1) * T, dx * T : (dx + 1) * T, 3:] = a
            sm = big.reshape(T, 2, T, 2, 4).mean((1, 3))
            a = sm[..., 3:]
            if a.max() <= 0:
                continue
            rgb = np.where(a > 0, sm[..., :3] / np.maximum(a, 1e-6), 0.0)
            out = np.dstack([srgb(rgb), np.round(a * 255.0)]).round().astype(np.uint8)
            d = os.path.join(tmp, str(z), str(x))
            os.makedirs(d, exist_ok=True)
            Image.fromarray(out, "RGBA").save(os.path.join(d, f"{y}.png"), compress_level=1)


def encode(tmp: str, out: str) -> tuple[int, int]:
    """PNG → WebP（全部が見える絵は透明度なし）。枚数と合計の大きさ"""
    n = size = 0
    for z in sorted(os.listdir(tmp)):
        for x in os.listdir(os.path.join(tmp, z)):
            for f in os.listdir(os.path.join(tmp, z, x)):
                im = Image.open(os.path.join(tmp, z, x, f))
                if im.mode == "RGBA" and im.getchannel("A").getextrema()[0] == 255:
                    im = im.convert("RGB")
                d = os.path.join(out, z, x)
                os.makedirs(d, exist_ok=True)
                p = os.path.join(d, f[:-4] + ".webp")
                im.save(p, quality=QUALITY[int(z)], method=6)
                n += 1
                size += os.path.getsize(p)
    return n, size


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="時間帯（カンマで区切って）")
    ap.add_argument("--out", default=os.path.join(ROOT, "public", "home", "tiles"))
    a = ap.parse_args()
    tods = [t for t in a.only.split(",") if t] or TODS
    for tod in tods:
        tmp = os.path.join(HD, "tiles_png", tod)
        shutil.rmtree(tmp, ignore_errors=True)
        x0, y0, x1, y1 = top_level(tod, tmp)
        box = (float(x0), float(y0), float(x1), float(y1))
        for z in range(TOP - 1, BOTTOM - 1, -1):
            coarser(tmp, z, box)
            box = (box[0] / 2, box[1] / 2, box[2] / 2, box[3] / 2)
            print(f"  {tod} ズーム {z}", flush=True)
        dst = os.path.join(a.out, tod)
        shutil.rmtree(dst, ignore_errors=True)
        n, size = encode(tmp, dst)
        print(f"{tod}：{n} 枚、{size / 1e6:.1f}MB → {dst}", flush=True)
    if os.path.abspath(a.out) == os.path.abspath(os.path.join(ROOT, "public", "home", "tiles")):
        write_app_json()


def write_app_json() -> None:
    """lib/app/desk-japan.json：四隅（広い版と同じ。home.py --extent が絵と同じ名前の .json に書いたもの）・タイルの場所・段・
    時間帯ごとの「夜の街の明かりが入っている絵か」（home.py の TOD の lights が 0 より大きい：夕・夜）"""
    with open(os.path.join(WORK, "home", "home_wide_day.json")) as f:
        corners = json.load(f)["coordinates"]
    lights = tod_lights()
    app = {
        "coordinates": [[round(v, 6) for v in c] for c in corners],
        # 作り直したら場所の後ろの印（?v=作った日時）が変わる。タイルは長く覚えてよい決まり（vercel.json）なので、古いものを出さない
        "tiles": "/home/tiles/{tod}/{z}/{x}/{y}.webp?v=" + time.strftime("%Y%m%d%H%M", time.gmtime()),
        "minzoom": BOTTOM,
        "maxzoom": TOP,
        "images": {t: {"lights": lights[t]} for t in TODS},
    }
    with open(APP_JSON, "w", encoding="utf-8") as f:
        json.dump(app, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"→ {APP_JSON}", flush=True)


if __name__ == "__main__":
    main()
