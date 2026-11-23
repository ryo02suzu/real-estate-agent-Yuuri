#!/usr/bin/env python3
"""PC のホームの「空気の層」の雲の形（つなぎ目の無いくり返しの模様）を作り、Blender（Cycles）で描いた絵をアプリの WebP にする。

  python3 air_clouds.py fields          # 雲の形 → work/air/fields.npz（air_render.py が読む。約 1 分）
  python air_render.py --tod all        # Blender で描く → work/air/render/（air_render.py の説明）
  python3 air_clouds.py webp            # 描いた絵 → public/home/air/*.webp と lib/app/desk-air.json

- 形はどれも、上下・左右につなぎ目なくくり返せる（タイル）。模様は周期のある波の足し合わせ（フーリエ）で作るので、
  端と端が必ずつながる。1 画素 = ズーム 5 の地図の 1 画素（約 2km。アプリは地図に合わせて拡大・縮小し、ゆっくり流す）。
- 積雲（2 版。2026-11-23）：宇宙から見た雲の作りをまねて、細かさの違う模様を足してしきい値で切る。大きな群れの中にだけ
  雲があり（大部分は晴れ）、群れの中は小さな積雲のつぶが並び、真ん中ほどつながって大きな雲になる。ふちはつぶがまばらに
  なってほつれ、まわりに薄いもやが少し残る。ところどころに風の向きの筋（雲の列）と、中の抜けた輪（開いたセル）が出る。
  1 版（丸いふくらみを置いて作った、綿のかたまりのような雲）は作り物っぽかったのでやめた。
  返すのは、雲の濃さ（0〜1）と雲の頭の高さ（単位）。光は当てない（Blender が体積として描く）。
- 巻雲（2 版）：上空の風の向きに長い、薄いベールと、その上にまばらに並ぶくっきりした筋。
- 厚い雲（deck-a・deck-b）：オープニングの白い雲から「雲が晴れて日本が見えてくる」ところに使う。同じ模様のしきい値を
  下げただけなので、ふだんの雲を必ず含み、晴れていくと同じ雲がやせていく。
"""

from __future__ import annotations

import argparse
import ast
import json
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PUBLIC = os.path.join(ROOT, "public", "home", "air")
APP_JSON = os.path.join(ROOT, "lib", "app", "desk-air.json")
TODS = ["morning", "day", "dusk", "night"]
SEED = 20261121
F32 = np.float32
WIND = -10.0  # 風の向き（度。0 が東、マイナスは北寄り。巻雲の筋と、積雲の少しの伸び）


# ---------------------------------------------------------------- 光の向き（home.py の TOD と同じ）


def tod_params() -> dict[str, dict]:
    """home.py の TOD（太陽・月の向き・高さ・色など）。home.py は bpy が要るので、読むだけにする（アプリの影の向きの確かめに使う）"""
    with open(os.path.join(HERE, "home.py"), encoding="utf-8") as f:
        tree = ast.parse(f.read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "TOD" for t in node.targets):
            out = {}
            for k, v in zip(node.value.keys, node.value.values):
                out[ast.literal_eval(k)] = {a.arg: ast.literal_eval(a.value) for a in v.keywords}
            return out
    raise RuntimeError("home.py の TOD が読めない")


# ---------------------------------------------------------------- つなぎ目の無い模様


def _freq(n: int):
    return np.fft.fftfreq(n)[:, None], np.fft.rfftfreq(n)[None, :]


def spectral(n: int, beta: float, seed: int, kmin: float = 1.0, kmax: float | None = None, stretch: float = 1.0, angle: float = 0.0) -> np.ndarray:
    """周期 n の模様（平均 0・ばらつき 1）。波の強さは波数の -beta/2 乗（beta が大きいほど、大きくなめらか）。
    stretch > 1 は angle（度。0 が東）の向きに長く伸びた模様。kmin・kmax は使う波数（1 枚の中の波の数）の範囲"""
    rng = np.random.default_rng(seed)
    fy, fx = _freq(n)
    ky, kx = fy * n, fx * n
    a = math.radians(angle)
    ku = kx * math.cos(a) + ky * math.sin(a)
    kv = -kx * math.sin(a) + ky * math.cos(a)
    k = np.sqrt((ku * stretch) ** 2 + kv**2)
    amp = np.zeros_like(k)
    m = k >= kmin
    amp[m] = k[m] ** (-beta / 2.0)
    if kmax:
        amp *= np.exp(-((k / kmax) ** 2))
    spec = amp * (rng.standard_normal(k.shape) + 1j * rng.standard_normal(k.shape))
    f = np.fft.irfft2(spec, s=(n, n))
    return ((f - f.mean()) / f.std()).astype(F32)










def warp(f: np.ndarray, dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
    """模様を (dx, dy) 画素だけずらして読む（周期でつなぐ）"""
    n = f.shape[0]
    y, x = np.mgrid[0:n, 0:n].astype(F32)
    return ndimage.map_coordinates(f, [y + dy, x + dx], order=1, mode="grid-wrap").astype(F32)




def smoothstep(a: float, b: float, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------- 積雲（2 版：宇宙から見た本物の雲の作り）
#
# 1 版は、1 つの雲を丸いふくらみの集まりで作ったので、同じくらいの大きさの綿のかたまりが並び、ふちもぼやけて作り物っぽかった
# （2026-11-21）。2 版は、宇宙から見た雲の作りをまねる（ふくらみを置かず、細かさの違う模様を足してしきい値で切る）：
#  - 群れ：大きな広がり（数百 km）の中にだけ雲があり、大部分は晴れ
#  - 群れの中：小さな積雲のつぶ（数 km）が並び、群れの真ん中ほどつぶがつながって大きな雲になる。ふちに行くほどつぶがまばらに
#    なり、ふちはほつれる（細かい模様の山だけがしきい値を超えるので、ふちがフラクタルになる）
#  - ところどころに、風の向きにならぶ筋（雲の列）と、中の抜けた輪（開いたセル）が出る
#  - 厚い雲（オープニングから晴れていくところ）は、同じ模様のしきい値を下げただけのもの（ふだんの雲を必ず含み、晴れていくと
#    同じ雲がやせていく）

SHAPE_VERSION = 4  # 雲の形の作り方の版（work/air/fields.npz の作り直しの目印）


def worley2(n: int, cells: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """周期のある格子のセル模様：いちばん近い点・2 番目に近い点までの距離（セルの幅で割る）。cells は n を割り切る数"""
    rng = np.random.default_rng(seed)
    jit = rng.random((cells, cells, 2)).astype(F32)
    cs = n / cells
    y, x = np.mgrid[0:n, 0:n].astype(F32) + 0.5
    cx = (x // cs).astype(np.int32)
    cy = (y // cs).astype(np.int32)
    f1 = np.full((n, n), np.inf, F32)
    f2 = np.full((n, n), np.inf, F32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            nx = (cx + ox) % cells
            ny = (cy + oy) % cells
            d = np.hypot((cx + ox + jit[ny, nx, 0]) * cs - x, (cy + oy + jit[ny, nx, 1]) * cs - y)
            f2 = np.where(d < f1, f1, np.minimum(f2, d))
            f1 = np.minimum(f1, d)
    return f1 / cs, f2 / cs


def cumulus_q(n: int, seed: int) -> dict[str, np.ndarray]:
    """雲のでき方の強さ q（大きいほど雲になる）と、群れの強さ region。しきい値で切って雲にする（cloud_maps）"""
    region = spectral(n, 3.2, seed + 1, kmin=2, kmax=26, stretch=1.5, angle=WIND)
    mid = spectral(n, 2.2, seed + 5, kmin=20, kmax=220)
    fine = spectral(n, 1.5, seed + 4, kmin=110, kmax=800)
    # 風の向きにならぶ筋（雲の列）と、中の抜けた輪（開いたセル。セルの境目に雲）。どちらが出るかは場所で変わる
    streets = spectral(n, 2.0, seed + 2, kmin=50, kmax=300, stretch=5.0, angle=WIND)
    f1, f2 = worley2(n, 64, seed + 3)
    rings = 1.0 - smoothstep(0.0, 0.22, f2 - f1)
    org = spectral(n, 3.0, seed + 6, kmin=2, kmax=20)
    q = region + 0.30 * mid + 0.42 * fine + 0.35 * smoothstep(0.2, 1.2, org) * streets + 0.55 * smoothstep(0.2, 1.2, -org) * (rings - 0.5)
    # ほつれ：中くらいの細かさのゆがみで、筋や輪の線もまっすぐにしない
    wx = spectral(n, 2.4, seed + 41, kmin=6, kmax=120) * 3.0
    wy = spectral(n, 2.4, seed + 42, kmin=6, kmax=120) * 3.0
    return {"q": warp(q.astype(F32), wx, wy), "region": region}


def _density(x: np.ndarray) -> np.ndarray:
    """しきい値を超えた分 x から雲の濃さ（0〜1）。超えたばかりのふちは薄く（光が透ける）、奥ほど濃い。しきい値の少し下にも、
    うすいもや（画素より小さな雲のつぶの集まり。宇宙から見ると群れのまわりが白っぽくかすむ）を少しだけ残す"""
    core = 1.0 - np.exp(-np.maximum(x, 0) / 0.6)
    haze = 0.10 * smoothstep(-0.5, 0.0, x)
    return np.where(x > 0, np.maximum(core, haze), haze).astype(F32)


def threshold_for(q: np.ndarray, coverage: float) -> float:
    """雲のある所（濃さ 0.1 より上）が coverage になるしきい値"""
    sub = q[::4, ::4]
    lo, hi = float(sub.min()), float(sub.max())
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        if (_density(sub - mid) > 0.1).mean() > coverage:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


# ---------------------------------------------------------------- 巻雲（2 版）


def cirrus_density(n: int, seed: int) -> np.ndarray:
    """巻雲：上空の風（積雲の風より少し北寄り）に長く伸びた、毛の束のような薄いベール。帯のところどころに出る"""
    ang = WIND - 12.0
    band = spectral(n, 3.4, seed + 21, kmin=1, kmax=12, stretch=3.0, angle=ang)
    cut = spectral(n, 3.0, seed + 25, kmin=2, kmax=24, stretch=1.5, angle=ang)
    acc = smoothstep(0.9, 2.2, band) * smoothstep(-0.4, 0.8, cut)
    # 薄いベールの上に、くっきりした筋（数 km 幅・数十〜数百 km の長さ）がまばらに並ぶ。筋は模様の山だけを使うので、
    # 一様なはけ目にならない。筋はベールより少し外まで伸びる
    wide = smoothstep(0.6, 1.8, band) * smoothstep(-0.8, 0.6, cut)
    strands = smoothstep(0.7, 2.0, spectral(n, 2.6, seed + 26, kmin=8, kmax=200, stretch=10.0, angle=ang))
    fibers = spectral(n, 1.6, seed + 27, kmin=60, kmax=900, stretch=16.0, angle=ang)
    d = 0.22 * acc + 0.8 * wide * strands * np.clip(0.75 + 0.3 * fibers, 0.0, 1.0)
    # ゆるい曲がり（上空の風のゆらぎ）
    wx = spectral(n, 3.6, seed + 22, kmin=1, kmax=10) * 18
    wy = spectral(n, 3.6, seed + 23, kmin=1, kmax=10) * 24
    return (np.clip(0.85 * warp(d.astype(F32), wx, wy), 0.0, 1.0) ** 1.15).astype(F32)


# ---------------------------------------------------------------- Blender に渡す形


WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
AIR_WORK = os.path.join(WORK, "air")
FIELDS = os.path.join(AIR_WORK, "fields.npz")
COVERAGE = 0.065  # ふだんの積雲が覆う割合（濃さ 0.1 より上）。日本が主役なので少なめ
DECKS = {"deck-a": 0.86, "deck-b": 0.36}  # 厚い雲（オープニングから晴れていくところ）が覆う割合


def billows(n: int, seed: int) -> np.ndarray:
    """雲の頭の細かいもくもく（0〜1。小さいセルを逆さにしたもの。周期でつながる）"""
    a, _ = worley2(n, 512, seed + 51)
    b, _ = worley2(n, 1024, seed + 52)
    return (0.62 * (1 - a) + 0.38 * (1 - b)).astype(F32)


def cloud_maps(c: dict[str, np.ndarray], t: float, bumps: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """しきい値 t で切った雲の濃さ（0〜1）と、雲の頭の高さ（単位＝ズーム 5 の地図の 1 画素。air_render.py が底からの高さにする）。
    しきい値を大きく超える所（つぶがつながった群れの真ん中）ほど背が高く、細かいもくもくの凹凸は厚い所ほど足す"""
    x = c["q"] - t
    d = _density(x)
    h = 5.0 * (1.0 - np.exp(-np.maximum(x, 0) / 0.9)) * (0.55 + 0.45 * smoothstep(0.5, 2.0, c["region"]))
    h = h + 0.4 * bumps * smoothstep(0.1, 0.6, d)
    return d, (h * (x > 0)).astype(F32)


def fields(n: int = 2048, seed: int = SEED) -> dict[str, np.ndarray]:
    """Blender に渡す形（どれも n×n、行 0 が北）。cu_d・cu_h：積雲の濃さと頭の高さ、ci_d：巻雲の濃さ、
    deck_a・deck_b の濃さと高さ（同じ模様のしきい値を下げたもの）。作った形は work/air/fields.npz に置き、2回目からは読む"""
    if os.path.exists(FIELDS):
        z = np.load(FIELDS)
        if int(z["n"]) == n and int(z["seed"]) == seed and "ver" in z.files and int(z["ver"]) == SHAPE_VERSION:
            return {k: z[k] for k in z.files}
    bumps = billows(n, seed)
    c = cumulus_q(n, seed)
    out: dict[str, np.ndarray] = {"n": np.array(n), "seed": np.array(seed), "ver": np.array(SHAPE_VERSION)}
    out["cu_d"], out["cu_h"] = cloud_maps(c, threshold_for(c["q"], COVERAGE), bumps)
    out["ci_d"] = cirrus_density(n, seed)
    for name, cov in DECKS.items():
        k = name.replace("-", "_")
        out[f"{k}_d"], out[f"{k}_h"] = cloud_maps(c, threshold_for(c["q"], cov), bumps)
    os.makedirs(AIR_WORK, exist_ok=True)
    np.savez_compressed(FIELDS, **out)
    return out


# ---------------------------------------------------------------- アプリの絵にする


def save_webp(im: Image.Image, path: str, quality: int = 86, alpha_quality: int = 82) -> int:
    im.save(path, "WEBP", quality=quality, alpha_quality=alpha_quality, method=6)
    return os.path.getsize(path)


# 雲の色の鮮やかさの仕上げ（時刻ごと）。AgX は明るい所の色を薄くするので、朝の金・夕の茜を少しだけ戻す
SAT = {"morning": 1.12, "day": 1.0, "dusk": 1.1, "night": 1.0}


def saturate(im: Image.Image, k: float) -> Image.Image:
    a = np.asarray(im, np.float32) / 255
    rgb = a[..., :3]
    y = (rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    a[..., :3] = np.clip(y + (rgb - y) * k, 0, 1)
    return Image.fromarray((a * 255 + 0.5).astype(np.uint8), "RGBA")


def tile_of(path: str, margin_frac: float) -> Image.Image:
    """Blender の絵（まわりに余りを付けて描いたもの）から、1 周期ぶんを切り出す"""
    im = Image.open(path).convert("RGBA")
    m = int(round(im.width * margin_frac))
    return im.crop((m, m, im.width - m, im.height - m))


def webp(render: str, n: int) -> None:
    """work/air/render の絵 → public/home/air/*.webp と lib/app/desk-air.json"""
    with open(os.path.join(render, "render.json"), encoding="utf-8") as f:
        meta = json.load(f)
    frac = meta["margin"] / (meta["tile"] + 2 * meta["margin"])
    os.makedirs(PUBLIC, exist_ok=True)
    images: dict[str, dict[str, str]] = {}
    sizes: dict[str, int] = {}
    size_of: dict[str, int] = {}
    for t in TODS:
        images[t] = {}
        for kind in ("cumulus", "cirrus", "shadow", "deck-a", "deck-b"):
            src = os.path.join(render, f"{kind}-{t}.png")
            if not os.path.exists(src):
                raise SystemExit(f"描いた絵が無い：{src}")
            im = tile_of(src, frac)
            if kind in ("cumulus", "cirrus") and SAT[t] != 1.0:
                im = saturate(im, SAT[t])
            # 影と厚い雲はぼけているので、半分の大きさで足りる（アプリは 1 周期の大きさにのばす）
            if kind in ("shadow", "deck-a", "deck-b") and im.width > n // 2:
                im = im.resize((n // 2, n // 2), Image.LANCZOS)
            name = f"{kind}-{t}"
            sizes[name] = save_webp(im, os.path.join(PUBLIC, f"{name}.webp"))
            size_of[name] = im.width
            images[t][kind.replace("-a", "A").replace("-b", "B")] = f"/home/air/{name}.webp"
    app = {
        "tile": n,
        "images": images,
        "wind": WIND,
        "render": {"spp": meta.get("spp"), "scale": meta.get("scale")},
    }
    with open(APP_JSON, "w", encoding="utf-8") as f:
        json.dump(app, f, ensure_ascii=False, indent=1)
        f.write("\n")
    for k, v in sizes.items():
        print(f"{k}: {size_of[k]}px {v / 1024:.0f}KB")
    print(APP_JSON)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["fields", "webp"])
    ap.add_argument("--size", type=int, default=2048)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--render", default=os.path.join(AIR_WORK, "render"), help="Blender の絵の場所（webp）")
    a = ap.parse_args()
    if a.step == "fields":
        f = fields(a.size, a.seed)
        print("積雲の割合", float((f["cu_d"] > 0.1).mean()), "高さの最大", float(f["cu_h"].max()), "巻雲", float((f["ci_d"] > 0.1).mean()))
        print(FIELDS)
    else:
        webp(a.render, a.size)


if __name__ == "__main__":
    main()
