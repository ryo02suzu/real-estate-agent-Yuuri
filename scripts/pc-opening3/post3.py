#!/usr/bin/env python3
"""PC のオープニング第3版の仕上げ：Blender（scene3.py --exr）が書いた光の量（色・奥行き）に、空気のかすみ・川の朝もや・
光のにじみ・映画の色（AgX・金色の光と藍の影）・周辺の暗さ・粒を重ねる。

  python3 post3.py 入力.exr [出力.png]     # 入力と同じ名前の .json（カメラ・太陽・川の高さ）を読む

かすみ：遠いほど空の色（この絵の地平線近くの空の色）に寄る。高い所ほど空気が薄い。
朝もや：川の水面の高さから上へ指数で薄くなる霧（谷底に溜まる）。場所によって濃い・薄いがある（ゆっくり変わるむら）。
光線ごとに、カメラから当たった所までの霧の量（光学的厚さ）を式で積分する（指数の高さの霧）。
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "pc-opening"))

from atmos import agx, bloom, grain_vignette, read_exr, smoothstep  # noqa: E402

LOOK = dict(
    air_km=13.0,  # 空気のかすみが約 63% になる距離（谷の高さで）
    air_max=0.85,
    mist_density=0.0045,  # 川の水面の高さの霧の濃さ（1/m）
    mist_height=5.5,  # 霧が 1/e になる高さ（m）
    mist_color=(0.80, 0.86, 0.94),  # 霧の色（谷の日陰の明るさ。空の色に掛ける）
    mist_shade=0.42,
    exposure=0.15,
    shadow=(0.90, 0.97, 1.10),  # 影の色（藍）
    light=(1.08, 1.0, 0.88),  # 光の色（金）
    sat=1.08,
    haze_color=(0.753, 1.132, 1.673),  # 地平線近くの空の色（見た目の確認の絵から。コマごとに測るとちらつくので決めておく）
    wind=(1.2, 2.0),  # 朝もやが流れる速さ（m/秒。東・北）
    end_white=(19.6, 21.1),  # 最後に雲の中へ（END の白へ溶かす）秒
    end_color=(0xF3 / 255, 0xF1 / 255, 0xEC / 255),
)


def value_noise(x: np.ndarray, y: np.ndarray, scale: float, seed: int = 0) -> np.ndarray:
    """なめらかなむら（0〜1）。格子の点の乱数を、なめらかにつなぐ"""
    rng = np.random.default_rng(seed)
    g = rng.uniform(0, 1, (257, 257)).astype(np.float32)
    u = x / scale
    v = y / scale
    i0 = np.floor(u).astype(np.int64)
    j0 = np.floor(v).astype(np.int64)
    fu = u - i0
    fv = v - j0
    fu = fu * fu * (3 - 2 * fu)
    fv = fv * fv * (3 - 2 * fv)
    i0 %= 256
    j0 %= 256
    a = g[j0, i0] * (1 - fu) + g[j0, i0 + 1] * fu
    b = g[j0 + 1, i0] * (1 - fu) + g[j0 + 1, i0 + 1] * fu
    return a * (1 - fv) + b * fv


def fbm(x, y, scale, seed=0, octaves=4):
    out = np.zeros_like(x, dtype=np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        out += amp * value_noise(x, y, scale / (2 ** o), seed + o)
        tot += amp
        amp *= 0.5
    return out / tot


def main() -> None:
    if sys.argv[1] == "--frames":
        src_dir, out_dir = sys.argv[2], sys.argv[3]
        os.makedirs(out_dir, exist_ok=True)
        for f in sorted(os.listdir(src_dir)):
            if f.endswith(".exr"):
                o = os.path.join(out_dir, f[:-4] + ".png")
                if not os.path.exists(o):
                    finish(os.path.join(src_dir, f), o)
        return
    src = sys.argv[1]
    finish(src, sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(src)[0] + "_post.png")


def finish(src: str, out: str) -> None:
    cam = json.load(open(os.path.splitext(src)[0] + ".json"))
    tsec = float(cam.get("t", 0.0))
    ch = read_exr(src)
    W, H = cam["res"]
    def plane(names):
        for n in names:
            if n in ch:
                return ch[n].reshape(H, W)
        raise KeyError(f"{names} が無い（{list(ch)[:12]}）")
    rgb = ch["Combined"][..., :3].astype(np.float32) if ch["Combined"].ndim == 3 else np.stack([plane(["Combined.R"]), plane(["Combined.G"]), plane(["Combined.B"])], -1)
    Z = plane(["Depth.Z", "Z", "Depth.V"])
    # 光線の向き（世界）：カメラの右・上・後ろ（-前）から
    right, up, back = (np.array(cam[k], np.float32) for k in ("right", "up", "back"))
    fwd = -back
    sx = (np.arange(W) + 0.5) / W - 0.5
    sy = 0.5 - (np.arange(H) + 0.5) / H
    k = cam["sensor"] / cam["lens"]
    X, Y = np.meshgrid(sx * k, sy * k * H / W)
    d = fwd[None, None, :] + X[..., None] * right[None, None, :] + Y[..., None] * up[None, None, :]
    cosang = 1.0 / np.linalg.norm(d, axis=-1)
    d = d * cosang[..., None]
    sky = Z > 1e8
    dist = np.where(sky, 30000.0, Z / cosang)
    c = np.array(cam["location"], np.float32)
    pz = c[2] + dist * d[..., 2]
    px = c[0] + dist * d[..., 0]
    py = c[1] + dist * d[..., 1]

    haze_col = np.array(LOOK["haze_color"], np.float32)
    # 空気のかすみ（高い所ほど薄い：高さ 8km で 1/e）
    zr = float(cam["river"].get("z_low", 1490.0))
    alt = np.clip((c[2] + pz) / 2 - zr, 0, None)
    air = LOOK["air_max"] * (1.0 - np.exp(-dist / (LOOK["air_km"] * 1000.0) * np.exp(-alt / 8000.0)))
    air = np.where(sky, 0.0, air)
    out_rgb = rgb * (1 - air[..., None]) + haze_col[None, None, :] * air[..., None]

    # 朝もや（指数の高さの霧）：τ = ρ0·H·(e^{-(z0-zr)/H} − e^{-(z1-zr)/H}) / (z1 − z0) × 距離
    H_m = LOOK["mist_height"]
    z0 = c[2] - zr
    z1 = np.clip(pz - zr, -5.0, None)
    dz = z1 - z0
    e0 = np.exp(-z0 / H_m)
    e1 = np.exp(-z1 / H_m)
    with np.errstate(divide="ignore", invalid="ignore"):
        per = np.where(np.abs(dz) > 1e-3, H_m * (e0 - e1) / dz, e0)
    dmax = np.minimum(dist, 6000.0)
    wx, wy = LOOK["wind"]
    patch = 0.15 + 1.5 * fbm(c[0] + 0.5 * dmax * d[..., 0] - wx * tsec, c[1] + 0.5 * dmax * d[..., 1] - wy * tsec, 180.0, 5)
    tau = LOOK["mist_density"] * per * dmax * patch
    mist = 1.0 - np.exp(-np.clip(tau, 0, 20))
    sun = np.array(cam["sun"], np.float32)
    toward = np.clip((d @ sun), 0, 1) ** 4
    mcol = np.array(LOOK["mist_color"], np.float32) * float(haze_col.mean()) * LOOK["mist_shade"]
    mcol = mcol[None, None, :] * (1 + 0.6 * toward[..., None] * np.array([1.0, 0.85, 0.6], np.float32))
    out_rgb = out_rgb * (1 - mist[..., None]) + mcol * mist[..., None]

    # 仕上げ：光のにじみ・金色の光と藍の影・AgX・周辺の暗さと粒
    x = bloom(out_rgb * (2.0 ** LOOK["exposure"]), 0.8)
    lum = x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    kk = smoothstep(0.02, 0.6, lum)[..., None]
    x = x * (np.array(LOOK["shadow"], np.float32) * (1 - kk) + np.array(LOOK["light"], np.float32) * kk)
    v = agx(x, (1.0, 1.0, 1.0), (1.0, 1.0, 1.0), LOOK["sat"])
    # AgX の出力（ガンマ約 2.2）→ 少しコントラスト（S 字）
    v = np.clip(v, 0, 1)
    v = v + 0.06 * np.sin((v - 0.5) * np.pi) * 0.5
    # 最後は雲の中へ：END の白へ溶かす
    a0, a1 = LOOK["end_white"]
    w = float(smoothstep(a0, a1, tsec))
    if w > 0:
        v = v * (1 - w) + np.array(LOOK["end_color"], np.float32) * w
    img = grain_vignette(v, int(cam.get("frame", 0)), 0.18 * (1 - w), 0.004 * (1 - w))
    Image.fromarray(img).save(out)
    print(out, "かすみの色", np.round(haze_col, 3), "霧（真ん中の列の下）", round(float(mist[H - 2, W // 2]), 3))


if __name__ == "__main__":
    main()
