#!/usr/bin/env python3
"""PC のホームの「空気の層」の雲の形（つなぎ目の無いくり返しの模様）を作り、Blender（Cycles）で描いた絵をアプリの WebP にする。

  python3 air_clouds.py fields          # 雲の形 → work/air/fields.npz（air_render.py が読む。約 1 分）
  python air_render.py --tod all        # Blender で描く → work/air/render/（air_render.py の説明）
  python3 air_clouds.py webp            # 描いた絵 → public/home/air/*.webp と lib/app/desk-air.json

- 形はどれも、上下・左右につなぎ目なくくり返せる（タイル）。雲は、周期のある面に小さな「ふくらみ」（ぼかした点）を
  たくさん置いて作り、ぼかしはフーリエ（周期のある波の足し合わせ）で計算するので、端と端が必ずつながる。
- 1 画素 = ズーム 5 の地図の 1 画素（PC のホームの地図とほぼ同じ縮尺。アプリは地図に合わせて拡大・縮小し、ゆっくり流す）。
- 積雲：1 つの雲は、真ん中の大きなふくらみ・まわりのもくもく（雲の頭）・ふちの小さなふくらみでできる。雲の大きさは
  小さいものほど多く（べき乗）、群れのある所ほど雲が多く大きい。返すのは、雲の濃さ（0〜1）と雲の頭の高さ（画素）。
  雲の頭には、細かいもくもくの凹凸を足す。光は当てない（Blender が体積として描く）。
- 巻雲：風の向き（西から東。少し北東へ）に長く細いふくらみを帯のように置いた、薄いベール。
- 厚い雲（deck-a・deck-b）：オープニングの白い雲から「雲が晴れて日本が見えてくる」ところに使う、同じ積雲に雲を足した
  厚い雲。deck-b の雲の真ん中は、ふだんの積雲と同じ所にある。
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


def gauss_conv(img: np.ndarray, s_along: float, s_across: float, angle: float = 0.0) -> np.ndarray:
    """周期でつないだ、細長くできるぼかし（angle の向きに s_along、直角に s_across）。1 つの点は高さ 1 のふくらみになる"""
    n = img.shape[0]
    fy, fx = _freq(n)
    a = math.radians(angle)
    fu = fx * math.cos(a) + fy * math.sin(a)
    fv = -fx * math.sin(a) + fy * math.cos(a)
    g = np.exp(-2.0 * math.pi**2 * ((s_along * fu) ** 2 + (s_across * fv) ** 2))
    out = np.fft.irfft2(np.fft.rfft2(img) * g, s=(n, n)) * (2.0 * math.pi * s_along * s_across)
    return out.astype(F32)


def sample(f: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """模様の (x, y) の値（周期でつなぐ。直線で補う）"""
    return ndimage.map_coordinates(f, [y, x], order=1, mode="grid-wrap")


def splat(n: int, x: np.ndarray, y: np.ndarray, w: np.ndarray) -> np.ndarray:
    """点（重み w）を、周期でつないだ面に置く（となりの 4 画素に分ける）"""
    img = np.zeros((n, n), np.float64)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx, fy = x - x0, y - y0
    for dx, dy, k in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        np.add.at(img, ((y0 + dy) % n, (x0 + dx) % n), w * k)
    return img


def scatter(n: int, rng: np.random.Generator, count: int, accept: np.ndarray, min_p: float = 0.0) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """accept（0〜1 の面）に比例した濃さで、点を count 個ほど置く。返す：x・y・その所の accept"""
    xs = rng.random(count * 12) * n
    ys = rng.random(count * 12) * n
    p = sample(accept, xs, ys)
    keep = rng.random(len(xs)) < np.maximum(p, min_p)
    xs, ys, p = xs[keep][:count], ys[keep][:count], p[keep][:count]
    return xs, ys, p


def warp(f: np.ndarray, dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
    """模様を (dx, dy) 画素だけずらして読む（周期でつなぐ）"""
    n = f.shape[0]
    y, x = np.mgrid[0:n, 0:n].astype(F32)
    return ndimage.map_coordinates(f, [y + dy, x + dx], order=1, mode="grid-wrap").astype(F32)


def blur(f: np.ndarray, s: float) -> np.ndarray:
    return ndimage.gaussian_filter(f, s, mode="wrap") if s > 0 else f


def smoothstep(a: float, b: float, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------- 積雲

# ふくらみの太さの段（ぼかしの幅 σ・画素）。ふくらみは近い段にまとめてぼかす
SIGMAS = np.array([0.8, 1.15, 1.65, 2.4, 3.4, 4.8, 6.8, 9.6, 13.5])


def cumulus_field(n: int, seed: int, more: float = 1.0) -> dict[str, np.ndarray]:
    """積雲を置く。1 つの雲は、真ん中の大きなふくらみ・まわりのもくもく（雲の頭）・ふちの小さなふくらみでできる。
    雲の大きさは小さいものほど多い（べき乗）。群れのある所ほど雲が多く大きい。
    more：雲の数の倍率（オープニングの厚い雲は多くする。同じ種なので、ふだんの雲はそのまま同じ所にある）。
    返す：D（ふくらみの重なり。濃さのもと）、H（高さ・画素）、region（群れの強さ）"""
    rng = np.random.default_rng(seed + 100)
    # 群れのある所：大小の広がり（大きい群れ・小さい群れ・ぽつんと離れた雲）。流れの向きに少し伸ばす
    region = spectral(n, 2.7, seed + 1, kmin=2, kmax=34, stretch=1.8, angle=WIND)
    acc = smoothstep(0.35, 1.75, region)
    base_count, most = 2000, 4
    xs, ys, p = scatter(n, rng, base_count * most, acc)
    # 雲の大きさ（半径・画素）：べき乗（小さい雲ほど多い）。群れの強い所ほど大きい
    u = rng.random(len(xs))
    R = np.minimum(1.6 * (1 - u) ** (-1 / 1.5), 15.0) * (0.6 + 0.7 * p)
    # ふだんの雲は最初の base_count 個。厚い雲（more > 1）は続きの雲を足す（雲ごとに別の種を使うので、ふだんの雲は同じ形のまま）
    k = min(len(xs), int(base_count * more))
    xs, ys, p, R = xs[:k], ys[:k], p[:k], R[:k]
    a = math.radians(WIND)
    ca, sa = math.cos(a), math.sin(a)
    px, py, ps, pw, ph = [], [], [], [], []

    def add(x, y, s, w, h):
        px.append(x)
        py.append(y)
        ps.append(s)
        pw.append(w)
        ph.append(h)

    for i, (x0, y0, r) in enumerate(zip(xs, ys, R)):
        rng = np.random.default_rng((seed, 7, i))
        # 小さい雲ほど薄い（背が低く、光が透ける）
        th = min(1.0, 0.3 + r / 9.0)
        # 真ん中の大きなふくらみ
        add(np.array([x0]), np.array([y0]), np.array([0.5 * r]), np.array([th]), np.array([0.7 * r]))
        # まわりのもくもく（雲の頭）：風の向きに少し長い楕円の中
        m = int(4 + 0.9 * r)
        du = rng.normal(0, 0.42 * r, m) * 1.25
        dv = rng.normal(0, 0.42 * r, m)
        s = r * rng.uniform(0.16, 0.34, m)
        add(x0 + du * ca - dv * sa, y0 + du * sa + dv * ca, s, th * rng.uniform(0.7, 1.15, m), s * rng.uniform(0.7, 1.2, m))
        # ふちの小さなふくらみ（カリフラワーのふち）
        m2 = int(3 + 1.6 * r)
        ang = rng.random(m2) * 2 * math.pi
        rad = r * rng.uniform(0.55, 1.05, m2)
        s2 = np.maximum(r * rng.uniform(0.07, 0.15, m2), 0.8)
        add(x0 + np.cos(ang) * rad * 1.2, y0 + np.sin(ang) * rad, s2, th * rng.uniform(0.45, 0.85, m2), s2 * 0.9)
    px, py, ps, pw, ph = (np.concatenate(v) for v in (px, py, ps, pw, ph))
    # 太さの段ごとに置いてぼかす
    D = np.zeros((n, n), F32)
    H = np.zeros((n, n), F32)
    lvl = np.abs(np.log(ps[:, None]) - np.log(SIGMAS[None, :])).argmin(1)
    for i, s in enumerate(SIGMAS):
        sel = lvl == i
        if not sel.any():
            continue
        img = splat(n, px[sel] % n, py[sel] % n, pw[sel])
        # 高さ：ふくらみの頂の高さ（重みで割り戻す）
        imh = splat(n, px[sel] % n, py[sel] % n, pw[sel] * ph[sel])
        D += gauss_conv(img, s * 1.08, s, WIND)
        H += gauss_conv(imh, s * 1.08, s, WIND)
    # 丸いふくらみのままだと綿の玉に見えるので、中くらいの細かさのゆがみで形を崩す（ふちが不ぞろいになる）
    wx = spectral(n, 2.6, seed + 41, kmin=8, kmax=110) * 2.6 + spectral(n, 3.4, seed + 43, kmin=2, kmax=30) * 9
    wy = spectral(n, 2.6, seed + 42, kmin=8, kmax=110) * 2.6 + spectral(n, 3.4, seed + 44, kmin=2, kmax=30) * 7
    D = warp(D, wx, wy)
    H = warp(H, wx, wy)
    return {"D": D, "H": H, "region": region}


def cumulus_density(fld: dict[str, np.ndarray], coverage: float, seed: int) -> np.ndarray:
    """雲の濃さ（0〜1）。coverage：雲のある所の割合（濃さ 0.1 より上）。ふちは細かい模様で少しほつれさせる"""
    D = fld["D"]
    n = D.shape[0]
    fray = 0.5 + 0.5 * np.tanh(spectral(n, 1.4, seed + 31, kmin=90, kmax=700) * 0.9)

    def dens(k: float, sub=(slice(None), slice(None))) -> np.ndarray:
        d = 1.0 - np.exp(-k * D[sub])
        d = np.clip(d * (1.0 - 0.45 * (1.0 - d) * fray[sub]), 0, 1)
        return d

    lo, hi = 0.01, 50.0
    sub = (slice(None, None, 4), slice(None, None, 4))
    for _ in range(40):
        mid = math.sqrt(lo * hi)
        if (dens(mid, sub) > 0.1).mean() > coverage:
            hi = mid
        else:
            lo = mid
    return dens(math.sqrt(lo * hi)).astype(F32)


def surface(fld: dict[str, np.ndarray], cap: float = 13.0) -> np.ndarray:
    """雲の頭の高さ（画素）：真ん中の丸い頭に、まわりのもくもく（雲の頭）が積み重なる（足し合わせ）。重なりすぎる所は、
    なめらかに頭打ちにする（cap）"""
    H = fld["H"]
    return (cap * (1.0 - np.exp(-H / cap))).astype(F32)


# ---------------------------------------------------------------- 巻雲


def cirrus_density(n: int, seed: int) -> np.ndarray:
    """巻雲：風の向きに長く細いふくらみ（筋）を帯のように置いた、薄いベール"""
    band = spectral(n, 3.6, seed + 21, kmin=1, kmax=11, stretch=4.0, angle=WIND)
    # 帯をところどころで切る（長いベールが画面を横切り続けないように）
    cut = spectral(n, 3.0, seed + 25, kmin=2, kmax=20, stretch=2.0, angle=WIND)
    acc = smoothstep(1.0, 2.3, band) * smoothstep(-0.3, 0.9, cut)
    D = np.zeros((n, n), F32)
    # (長さ σ, 幅 σ, 数, 重み)：ベールの体・筋・細い毛
    for i, (sa, sc, count, wt) in enumerate(((80.0, 12.0, 320, 0.4), (50.0, 3.6, 1000, 0.22), (26.0, 1.8, 1800, 0.1))):
        rng = np.random.default_rng(seed + 200 + i)
        xs, ys, p = scatter(n, rng, count, acc)
        w = wt * p * rng.exponential(1.0, len(xs))
        # 筋の向きは、帯の中で少しずつ違う
        P = gauss_conv(splat(n, xs, ys, w), sa, sc, WIND)
        D += P
    # ゆるい曲がり
    wx = spectral(n, 3.6, seed + 22, kmin=1, kmax=10) * 20
    wy = spectral(n, 3.6, seed + 23, kmin=1, kmax=10) * 26
    D = warp(D, wx, wy)
    return (1.0 - np.exp(-1.0 * D)).astype(F32)


# ---------------------------------------------------------------- Blender に渡す形


WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
AIR_WORK = os.path.join(WORK, "air")
FIELDS = os.path.join(AIR_WORK, "fields.npz")
COVERAGE = 0.065  # ふだんの積雲が覆う割合（濃さ 0.1 より上）。日本が主役なので少なめ
DECKS = {"deck-a": (4.0, 0.86), "deck-b": (2.2, 0.36)}  # 厚い雲：雲の数の倍率・覆う割合


def billows(n: int, seed: int) -> np.ndarray:
    """雲の頭の細かいもくもく（0〜1。小さいセルを逆さにしたもの。周期でつながる）"""
    return (0.62 * (1 - worley(n, 256, seed + 51)) + 0.38 * (1 - worley(n, 512, seed + 52))).astype(F32)


def worley(n: int, cells: int, seed: int) -> np.ndarray:
    """周期のある格子のセル模様（いちばん近い点までの距離。セルの幅で割る）。cells は n を割り切る数"""
    rng = np.random.default_rng(seed)
    jit = rng.random((cells, cells, 2)).astype(F32)
    cs = n / cells
    y, x = np.mgrid[0:n, 0:n].astype(F32) + 0.5
    cx = (x // cs).astype(np.int32)
    cy = (y // cs).astype(np.int32)
    d = np.full((n, n), np.inf, F32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            nx = (cx + ox) % cells
            ny = (cy + oy) % cells
            px = (cx + ox + jit[ny, nx, 0]) * cs
            py = (cy + oy + jit[ny, nx, 1]) * cs
            d = np.minimum(d, np.hypot(px - x, py - y))
    return d / cs


def cloud_maps(fld: dict[str, np.ndarray], coverage: float, seed: int, bumps: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """雲の濃さ（0〜1）と、雲の頭の高さ（画素。細かいもくもくの凹凸を、厚い所ほど足す）"""
    d = cumulus_density(fld, coverage, seed)
    h = surface(fld) + 1.1 * bumps * smoothstep(0.12, 0.7, d)
    return d, (h * (d > 0.002)).astype(F32)


def fields(n: int = 2048, seed: int = SEED) -> dict[str, np.ndarray]:
    """Blender に渡す形（どれも n×n、行 0 が北）。cu_d・cu_h：積雲の濃さと頭の高さ、ci_d：巻雲の濃さ、
    deck-a・deck-b の濃さと高さ。作った形は work/air/fields.npz に置き、2回目からは読む"""
    if os.path.exists(FIELDS):
        z = np.load(FIELDS)
        if int(z["n"]) == n and int(z["seed"]) == seed:
            return {k: z[k] for k in z.files}
    bumps = billows(n, seed)
    out: dict[str, np.ndarray] = {"n": np.array(n), "seed": np.array(seed)}
    out["cu_d"], out["cu_h"] = cloud_maps(cumulus_field(n, seed), COVERAGE, seed, bumps)
    out["ci_d"] = cirrus_density(n, seed)
    for name, (more, cov) in DECKS.items():
        k = name.replace("-", "_")
        out[f"{k}_d"], out[f"{k}_h"] = cloud_maps(cumulus_field(n, seed, more), cov, seed, bumps)
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
