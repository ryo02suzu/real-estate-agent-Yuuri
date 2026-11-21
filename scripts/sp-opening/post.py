#!/usr/bin/env python3
"""スマホのオープニング「富士の目覚め」の仕上げ：面の絵（film.py）と体積の雲・空気（clouds.py）を合わせ、
光のにじみ・映画用レンズの横の光の筋（ダイヤモンドの瞬間だけ）・色（AgX。藍・金・白）・細かい粒を足して、
2 倍の大きさから 1080×2340 に縮める。

  python3 post.py --frames 45,84,126 [--out 出力のフォルダ]

出力は work/frames/<コマ>.png（8bit）。色の仕上げは PC の atmos.py と同じ考え方（AgX・金色の光と藍の影）。
"""

from __future__ import annotations

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from PIL import Image
from scipy import ndimage

import common as C
import path as P

LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)

# 時間で変わる仕上げの値（秒, 値）。雲の中は暗い藍（静寂）、抜けると光が満ちる
LOOK = {
    # 雲の中は暗い藍（静寂）。抜けると光が満ちる。太陽のまわりだけが明るく見えるよう、全体は低めに
    "exposure": [(0.0, -1.1), (0.6, -1.3), (1.6, -1.95), (2.2, -2.5), (2.9, -3.6), (4.2, -3.75), (7.5, -3.65)],
    "streak": [(3.7, 0.0), (4.2, 1.0), (4.9, 0.0)],  # 横の光の筋（ダイヤモンドの瞬間に一筋だけ）
    "star": [(3.0, 0.0), (3.6, 0.5), (4.2, 1.0), (5.0, 0.75), (7.5, 0.6)],  # 絞りの形の光芒（太陽が出ている間）
    "glare": [(0.0, 0.5), (2.6, 0.6), (4.2, 0.7), (7.5, 0.6)],
    "sat": [(0.0, 1.12), (2.6, 1.15), (4.2, 1.2)],
    "grad": [(0.0, 0.35), (2.6, 0.6), (4.2, 0.75)],  # 上を暗く冷たく（グラデーションのフィルター）
    "vignette": 0.2,
    "grain": 0.0045,
    "shadow": (0.84, 0.93, 1.2),  # 影は藍へ
    "light": (1.14, 1.0, 0.78),  # 光は金へ
}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def look_at(key: str, t: float):
    v = LOOK[key]
    if not isinstance(v, list):
        return v
    ts = [k[0] for k in v]
    vs = [k[1] for k in v]
    if t <= ts[0]:
        return vs[0]
    if t >= ts[-1]:
        return vs[-1]
    i = int(np.searchsorted(ts, t)) - 1
    u = float(smoothstep(0.0, 1.0, (t - ts[i]) / (ts[i + 1] - ts[i])))
    return vs[i] * (1 - u) + vs[i + 1] * u


# ---------------------------------------------------------------- AgX（PC の atmos.agx と同じ）
AGX = np.array([[0.842479062253094, 0.0784335999999992, 0.0792237451477643], [0.0423282422610123, 0.878468636469772, 0.0791661274605434],
                [0.0423756549057051, 0.0784336, 0.879142973793104]], np.float32)
AGX_INV = np.array([[1.19687900512017, -0.0980208811401368, -0.0990297440797205], [-0.0528968517574562, 1.15190312990417, -0.0989611768448433],
                    [-0.0529716355144438, -0.0980434501171241, 1.15107367264116]], np.float32)


def agx(rgb: np.ndarray, sat: float = 1.0) -> np.ndarray:
    lo, hi = -12.47393, 4.026069
    v = np.maximum(rgb, 1e-10) @ AGX.T
    v = (np.clip(np.log2(np.maximum(v, 1e-10)), lo, hi) - lo) / (hi - lo)
    x2 = v * v
    x4 = x2 * x2
    v = 15.5 * x4 * x2 - 40.14 * x4 * v + 31.96 * x4 - 6.868 * x2 * v + 0.4298 * x2 + 0.1191 * v - 0.00232
    v = np.clip(v, 0, 1) ** np.float32(1.06)
    lum = v @ LUMA
    v = lum[..., None] + sat * (v - lum[..., None])
    return np.clip(v @ AGX_INV.T, 0.0, 1.0)


def blur(a: np.ndarray, sig: float) -> np.ndarray:
    """大きくぼかすときは縮めてからぼかす（速い）"""
    f = max(1, int(sig / 4))
    if f > 1:
        h, w = a.shape[:2]
        small = a[::f, ::f]
        b = np.stack([ndimage.gaussian_filter(small[..., c], sig / f, mode="nearest") for c in range(a.shape[2])], -1)
        return np.stack([np.asarray(Image.fromarray(b[..., c].astype(np.float32)).resize((w, h), Image.BILINEAR)) for c in range(a.shape[2])], -1)
    return np.stack([ndimage.gaussian_filter(a[..., c], sig, mode="nearest") for c in range(a.shape[2])], -1)


def glare(x: np.ndarray, amount: float) -> np.ndarray:
    """明るい所のまわりのにじみ（控えめ）。太陽の円盤は強すぎるので頭打ちにしてからぼかす"""
    lum = x @ LUMA
    src = x * np.clip((lum - 1.4) / np.maximum(lum, 1e-6), 0.0, 1.0)[..., None]
    m = src.max(-1, keepdims=True)
    src = src * (np.minimum(m, 60.0) / np.maximum(m, 1e-6))
    w = x.shape[1]
    out = np.zeros_like(x)
    for sig, a in ((0.003, 0.08), (0.012, 0.045), (0.04, 0.025), (0.11, 0.015)):
        out += a * blur(src, sig * w)
    return x + amount * out


def streak(x: np.ndarray, sun_xy, amount: float) -> np.ndarray:
    """映画用レンズの横に伸びる淡い光（太陽のところから一筋だけ）"""
    if amount <= 0.002 or sun_xy is None:
        return x
    h, w = x.shape[:2]
    sx, sy = sun_xy
    lum = x @ LUMA
    src = np.where(lum > 30.0, 1.0, 0.0).astype(np.float32)
    ys, xs = np.mgrid[0:h, 0:w]
    src *= (np.abs(ys - sy) < 0.02 * h) & (np.abs(xs - sx) < 0.05 * w)
    if src.sum() < 1:
        return x
    line = ndimage.gaussian_filter1d(ndimage.gaussian_filter1d(src, 0.0012 * h, axis=0), 0.22 * w, axis=1, mode="constant")
    line /= max(line.max(), 1e-9)
    col = np.array([0.75, 0.82, 1.0], np.float32)  # 映画用レンズの筋は少し青い
    return x + amount * 0.9 * line[..., None] * col


def sun_star(x: np.ndarray, amount: float) -> np.ndarray:
    """太陽の円盤（見えている所だけ）の光を、レンズの性質で広げる：鋭い芯・まわりのにじみ・絞りの形による 6 本の細い光芒
    （絞りの羽根が 6 枚のレンズ）。強さは、山頂の縁から出ている円盤の光の量に比例する（出るほど大きく）"""
    if amount <= 0.002:
        return x
    lum = x @ LUMA
    disc = lum > 400.0
    if disc.sum() < 1:
        return x
    e = (x * disc[..., None]).sum((0, 1))  # 円盤の光の量
    ys, xs = np.nonzero(disc)
    wgt = lum[disc]
    cy, cx = float((ys * wgt).sum() / wgt.sum()), float((xs * wgt).sum() / wgt.sum())
    h, w = lum.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = (xx - cx) / w, (yy - cy) / w
    r = np.sqrt(dx * dx + dy * dy) + 1e-6
    halo = 1.0 / (1.0 + (r / 0.006) ** 2) ** 1.5  # にじみ（レンズの中の散り）
    halo /= halo.sum()
    spikes = np.zeros_like(r)
    for k in range(6):  # 6 枚羽根 → 6 本
        a = math.radians(15.0 + 60.0 * k)
        along = np.maximum(dx * math.cos(a) + dy * math.sin(a), 0.0)
        perp = np.abs(-dx * math.sin(a) + dy * math.cos(a))
        spikes += (along > 0) * np.exp(-((perp / (0.0005 + 0.004 * along)) ** 2)) * (1.0 + along / 0.0018) ** -2.9
    spikes /= spikes.sum()
    col = np.array([1.0, 0.92, 0.8], np.float32)
    return x + amount * (0.022 * halo[..., None] * e + 0.0011 * spikes[..., None] * e * col)


def grad_filter(x: np.ndarray, sun_xy, amount: float) -> np.ndarray:
    """画面の上を暗く・冷たく（撮影で使うグラデーションのフィルターと同じ）。太陽のまわりはかけない"""
    if amount <= 0:
        return x
    h, w = x.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    g = smoothstep(0.42, 0.0, yy / h)
    if sun_xy is not None:
        rs = np.hypot(xx - sun_xy[0], yy - sun_xy[1]) / w
        g = g * smoothstep(0.08, 0.42, rs)
    return x * (1.0 - amount * g[..., None] * np.array([0.78, 0.66, 0.30], np.float32))


def warm_sun(x: np.ndarray, sun_xy, amount: float = 1.0) -> np.ndarray:
    """太陽のまわりの明るい空を、金〜橙へ（白っぽいクリームにならないように。明るい所ほど色が抜けやすいので先に寄せる）"""
    if sun_xy is None:
        return x
    h, w = x.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    k = amount * np.exp(-((np.hypot(xx - sun_xy[0], yy - sun_xy[1]) / w) / 0.35) ** 2)
    return x * (1.0 + k[..., None] * (np.array([1.05, 0.95, 0.74], np.float32) - 1.0))


def grade(lin: np.ndarray, t: float, sun_xy) -> np.ndarray:
    x = lin * 2.0 ** look_at("exposure", t)
    x = warm_sun(x, sun_xy, float(smoothstep(1.0, 3.0, t)) * 0.9 + 0.3)
    x = sun_star(x, look_at("star", t))
    x = glare(x, look_at("glare", t))
    x = streak(x, sun_xy, look_at("streak", t))
    x = grad_filter(x, sun_xy, look_at("grad", t))
    lum = x @ LUMA
    k = smoothstep(0.02, 0.7, lum)[..., None]
    x = x * (np.array(LOOK["shadow"], np.float32) * (1 - k) + np.array(LOOK["light"], np.float32) * k)
    return agx(x, look_at("sat", t))


def finish(v: np.ndarray, f: int) -> np.ndarray:
    """2 倍 → 1080×2340 に縮め、周辺を少し暗く、ごく細かい粒"""
    if v.shape[:2] != (C.H, C.W):
        v = np.stack([np.asarray(Image.fromarray(v[..., c].astype(np.float32)).resize((C.W, C.H), Image.LANCZOS)) for c in range(3)], -1)
    h, w = v.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r2 = ((xx - w / 2) / (w / 2)) ** 2 * 0.55 + ((yy - h / 2) / (h / 2)) ** 2 * 0.55
    v = v * (1.0 - LOOK["vignette"] * smoothstep(0.25, 1.5, r2))[..., None]
    v = v + np.random.default_rng(500 + f).standard_normal((h, w, 1)).astype(np.float32) * LOOK["grain"]
    return (np.clip(v, 0, 1) * 255.0 + 0.5).astype(np.uint8)


FILM = os.path.join(C.WORK, "film")
CLOUDS = os.path.join(C.WORK, "clouds")


def view_dirs(cam: dict, w: int, h: int) -> np.ndarray:
    fpx = cam["focal"] / cam["sensor"] * w
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    d = ((xs + 0.5 - w / 2) / fpx)[..., None] * cam["right"].astype(np.float32) + ((h / 2 - ys - 0.5) / fpx)[..., None] * cam["up"].astype(np.float32) + cam["fwd"].astype(np.float32)
    return d / np.linalg.norm(d, axis=-1, keepdims=True)


GROUND = np.array([0.012, 0.014, 0.018], np.float32)  # 雲海の下の地面（暗い）


def compose(f: int) -> np.ndarray:
    d = C.read_exr(os.path.join(FILM, f"{f:04d}.exr"))
    rgb = d["Combined"][..., :3].astype(np.float32)
    if "Noisy Image" in d:  # ノイズ除去は 7 割だけ（細かいざらつきを少し残す）
        rgb = 0.7 * rgb + 0.3 * d["Noisy Image"][..., :3].astype(np.float32)
    # 面の絵で何にも当たらず、地平線より下を向く所は、空の計算の「地面」（太陽の方は明るいかすみ）が出ている。
    # 本当は雲海の下の暗い地面なので、暗い色に置き換える（雲のすき間から明るい色がのぞいて、線にならないように）
    h, w = rgb.shape[:2]
    dz = view_dirs(P.camera(f), w, h)[..., 2]
    below = (d["Depth.Z"] > 1e8) & (dz < 0.0)
    rgb[below] = GROUND
    cl = os.path.join(CLOUDS, f"{f:04d}.npz")
    if os.path.exists(cl):
        z = np.load(cl)
        L, T = z["L"].astype(np.float32), z["T"].astype(np.float32)
        L = 0.6 * L + 0.4 * np.stack([ndimage.gaussian_filter(L[..., c], 0.7) for c in range(3)], -1)  # 雲の光の細かいざらつきを少しだけならす
        if L.shape[:2] != rgb.shape[:2]:
            h, w = rgb.shape[:2]
            up = lambda a: np.stack([np.asarray(Image.fromarray(a[..., c]).resize((w, h), Image.BILINEAR)) for c in range(3)], -1)
            L, T = up(L), up(T)
        rgb = rgb * T + L
    return rgb


def letterbox(img: np.ndarray, t: float) -> np.ndarray:
    """アプリが描く映画の帯（2.39:1）を重ねた確認用の絵（0〜2.4 秒は帯の中だけ、2.4〜3.2 秒で開く）"""
    h, w = img.shape[:2]
    band = w / C.LETTERBOX
    k = float(smoothstep(2.4, 3.2, t))
    vis = band + (h - band) * k
    top = int(round((h - vis) / 2))
    out = img.copy()
    if top > 0:
        out[:top] = 0
        out[h - top :] = 0
    return out


def cloud_relief(lin: np.ndarray, f: int, k: float = 0.35) -> np.ndarray:
    """影の中の雲海（光が空からだけでやわらかい）の、もくもくの明暗を少しだけ強める（雲の所だけ、明るさだけ）"""
    cl = os.path.join(CLOUDS, f"{f:04d}.npz")
    if not os.path.exists(cl):
        return lin
    T = np.load(cl)["T"].astype(np.float32)[..., 1]
    h, w = lin.shape[:2]
    if T.shape != (h, w):
        T = np.asarray(Image.fromarray(T).resize((w, h), Image.BILINEAR))
    m = smoothstep(0.5, 0.1, T)  # 雲が濃い所
    lum = np.maximum(lin @ LUMA, 1e-5)
    lg = np.log(lum)
    sig = 0.01 * w
    base = ndimage.gaussian_filter(lg * m, sig) / np.maximum(ndimage.gaussian_filter(m, sig), 1e-4)
    gain = np.exp(np.clip(lg - base, -0.8, 0.8) * k * m)
    return lin * gain[..., None]


def deepen_sky(lin: np.ndarray, cam: dict, sky: np.ndarray, amount: float) -> np.ndarray:
    """上の空を、太陽から離れるほど深い藍に（偏光フィルターのように。下は金、上は藍）"""
    h, w = sky.shape
    d = view_dirs(cam, w, h)
    deep = smoothstep(0.05, 0.36, d[..., 2]) * smoothstep(0.9995, 0.94, d @ P.sun_dir().astype(np.float32)) * sky
    return lin * (1.0 - amount * deep[..., None] * np.array([1.0, 0.86, 0.38], np.float32))


# 間引いて描いてよい所（カメラがほとんど止まる 5.6 秒〜）：lo から step コマおきに描き、描いていないコマは前後のコマを
# 混ぜて作る（色の仕上げの前、光の量のままで混ぜる）
INTERP = [(168, 224, 3)]


def rendered(f: int) -> bool:
    return os.path.exists(os.path.join(FILM, f"{f:04d}.exr")) and os.path.exists(os.path.join(CLOUDS, f"{f:04d}.npz"))


def prepared(f: int) -> np.ndarray:
    """そのコマの、仕上げの前の光の量（上の空を藍に・雲海の明暗まで）"""
    lin = compose(f)
    h, w = lin.shape[:2]
    z = C.read_exr(os.path.join(FILM, f"{f:04d}.exr"))["Depth.Z"]
    lin = deepen_sky(lin, P.camera(f), z > 1e8, 0.6)
    return cloud_relief(lin, f)


def run(f: int, out: str) -> str:
    t = f / C.FPS
    if rendered(f):
        lin = prepared(f)
    else:
        a = b = None
        for lo, hi, step in INTERP:
            if lo <= f <= hi:
                a = next((k for k in range(f - 1, f - step - 1, -1) if rendered(k)), None)
                b = next((k for k in range(f + 1, f + step + 1) if rendered(k)), None)
        if a is None or b is None:
            raise FileNotFoundError(f"コマ {f} の面か雲がまだ描かれていない")
        u = (f - a) / (b - a)
        lin = prepared(a) * (1 - u) + prepared(b) * u
    h, w = lin.shape[:2]
    cam = P.camera(f)
    sx, sy = P.project(cam, P.sun_dir(), w, h)
    v = grade(lin, t, (sx, sy))
    img = finish(v, f)
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, f"{f:04d}.png")
    Image.fromarray(img).save(path)
    if t < 3.2:
        Image.fromarray(letterbox(img, t)).save(os.path.join(out, f"{f:04d}_bars.png"))
    return path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default="126")
    ap.add_argument("--out", default=os.path.join(C.WORK, "frames"))
    ap.add_argument("--film", default="")
    ap.add_argument("--clouds", default="")
    a = ap.parse_args()
    global FILM, CLOUDS
    FILM = a.film or FILM
    CLOUDS = a.clouds or CLOUDS
    for f in [int(v) for v in a.frames.split(",")]:
        print(run(f, a.out), flush=True)


if __name__ == "__main__":
    main()
