#!/usr/bin/env python3
"""PC のオープニング第3版のカメラの飛び方（コマごとの位置と向き）。

  python3 path3.py            # → work/path3.json（コマごとの位置・前・上・レンズ）と、上から見た確かめ用の work/path3.png

構成（24 コマ/秒、約 21 秒。ロゴの時刻・最後の白は lib/app/opening.ts と合わせる）
  0〜9.6 秒   大正池のすぐ上流から、梓川の上 7〜10m を上流へ駆け抜ける（速さ 32 → 70m/秒）。曲がりでは機体のように傾く
  9.6〜14 秒  川の曲がりを抜けたら、穂高へ向きを変えながら森の上へ上がる（川から約 260m まで）
  14〜19.6 秒 朝日の当たる穂高へゆっくり近づきながら上がり、カメラを上げて穂高の上の空へ。右上の空にロゴ（16.4 秒〜。アプリが描く）
  19.6〜21.1 秒 雲の中へ（仕上げで白く溶かす。最後のコマは END の白）
動き：速さ・高さ・向きは、ゆっくり始まりゆっくり変わる（smoothstep）。手持ちのような細かい揺れを少し（低い所ほど）。
"""

from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import geo3  # noqa: E402
import river  # noqa: E402

WORK = os.environ.get("PC_OPENING3_WORK", os.path.join(HERE, "work"))
FPS = 24
DURATION = 21.1
HOTAKA = (137.6481, 36.2893)  # 奥穂高岳
LENS = 24.0


def smooth(u):
    u = np.clip(u, 0.0, 1.0)
    return u * u * u * (u * (u * 6 - 15) + 10)


def river_line(step: float = 2.0):
    p = np.array([geo3.local(*c) for c in river.CENTER], np.float64)
    seg = np.hypot(*np.diff(p, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    ss = np.arange(0.0, s[-1], step)
    x = np.interp(ss, s, p[:, 0])
    y = np.interp(ss, s, p[:, 1])
    # 川の真ん中の線を、なめらかに（飛ぶ線は曲がりの内側を少し近道する）
    x = ndimage.gaussian_filter1d(x, 14, mode="nearest")
    y = ndimage.gaussian_filter1d(y, 14, mode="nearest")
    return ss, x, y


def main() -> None:
    near = np.load(os.path.join(WORK, "terrain", "near_carved.npy"))
    with open(os.path.join(WORK, "terrain", "near_carved.json")) as f:
        nm = json.load(f)
    zr0 = nm["river"]["z_low"]
    zr1 = nm["river"]["z_high"]
    rlen = nm["river"]["length"]
    ss, rx, ry = river_line()
    n = int(round(DURATION * FPS)) + 1
    t = np.arange(n) / FPS

    # ---- 速さ（m/秒）と、川に沿って進んだ距離
    v = 32.0 + 38.0 * smooth(t / 3.2)  # 0〜3.2 秒で 32 → 70
    v = np.where(t > 9.6, 70.0 - 22.0 * smooth((t - 9.6) / 4.0), v)  # 上がるにつれ少しゆっくり
    v = np.where(t > 14.0, 48.0 - 26.0 * smooth((t - 14.0) / 5.0), v)
    dist = np.concatenate([[0.0], np.cumsum((v[1:] + v[:-1]) / 2 / FPS)])
    s0 = 95.0  # 大正池の上流の端から少し入った所
    s_now = s0 + dist

    # ---- 位置：9.6 秒までは川の上。そのあとは、その時の向きから穂高の方へ曲がりながら進む
    pos = np.zeros((n, 3))
    hx, hy = (float(v_) for v_ in geo3.local(*HOTAKA))
    cut = int(10.4 * FPS)
    for i in range(n):
        if i <= cut:
            pos[i, 0] = np.interp(s_now[i], ss, rx)
            pos[i, 1] = np.interp(s_now[i], ss, ry)
        else:
            prev = pos[i - 1, :2]
            dprev = pos[i - 1, :2] - pos[i - 2, :2]
            head = math.atan2(dprev[0], dprev[1])
            want = math.atan2(hx - prev[0], hy - prev[1])
            k = float(smooth((t[i] - 10.4) / 3.0))
            dh = (want - head + math.pi) % (2 * math.pi) - math.pi
            head += dh * (0.10 * k + 0.01)
            step = v[i] / FPS
            pos[i, 0] = prev[0] + step * math.sin(head)
            pos[i, 1] = prev[1] + step * math.cos(head)
    # 水面の高さ（川床の高さの線から）と、カメラの高さ
    s_frac = np.clip(s_now / rlen, 0, 1)
    water = zr0 + (zr1 - zr0) * s_frac
    ground = geo3.sample(near, nm, pos[:, 0], pos[:, 1]) - geo3.curvature_drop(pos[:, 0], pos[:, 1])
    agl = 8.5 + 1.5 * np.sin(t * 0.9) - 2.0 * smooth((t - 4.0) / 1.5) * (1 - smooth((t - 6.0) / 1.5))  # 4〜6 秒は少し下がる
    climb = 255.0 * smooth((t - 8.8) / 5.0) + 120.0 * smooth((t - 14.0) / 6.0)
    pos[:, 2] = water + agl + climb
    # 森の上では、木の上 30m より下に行かない（木の高さは 25m ほど）
    off_river = t > 10.4
    pos[:, 2] = np.where(off_river, np.maximum(pos[:, 2], ground + 55.0), pos[:, 2])
    pos[:, 2] = ndimage.gaussian_filter1d(pos[:, 2], 6.0, mode="nearest")

    # ---- 向き：進む向き（先の方を見る）。上がるときは穂高へ。曲がりでは傾く
    fwd = np.zeros((n, 3))
    look_ahead = int(0.7 * FPS)
    for i in range(n):
        j = min(n - 1, i + look_ahead)
        d = pos[j] - pos[i] if j > i else pos[i] - pos[i - 1]
        d = d / (np.linalg.norm(d) + 1e-9)
        tgt = np.array([hx, hy, 0.0]) - pos[i]
        tgt[2] = 0.0
        tgt = tgt / np.linalg.norm(tgt)
        w = float(smooth((t[i] - 10.0) / 4.0))
        f = d * (1 - w) + tgt * w
        f[2] = 0.0
        f = f / np.linalg.norm(f)
        # 見下ろす角：低い所は少し（-3°）。上がるにつれ谷と森を見下ろし（-11°）、最後は上げて穂高の上の空へ（+3°）。
        # ロゴ（16.4 秒〜。アプリが右上に描く）は、カメラが上を向くにつれ穂高の上の空に浮かぶ（-4° までだと、ロゴが山肌に重なった）
        pitch = -3.0 - 8.0 * float(smooth((t[i] - 9.0) / 3.5)) + 14.0 * float(smooth((t[i] - 15.0) / 4.5))
        f[2] = math.tan(math.radians(pitch))
        fwd[i] = f / np.linalg.norm(f)
    fwd = np.stack([ndimage.gaussian_filter1d(fwd[:, k], 3.0, mode="nearest") for k in range(3)], -1)
    fwd /= np.linalg.norm(fwd, axis=1, keepdims=True)
    # 傾き：向きの変わる速さ × 速さ（曲がりの外へ遠心力）
    yaw = np.unwrap(np.arctan2(fwd[:, 0], fwd[:, 1]))
    yaw_rate = np.gradient(yaw) * FPS
    bank = np.clip(-yaw_rate * v / 9.81 * 0.35, -0.42, 0.42)
    bank = ndimage.gaussian_filter1d(bank, 4.0, mode="nearest")
    # 細かい揺れ（低い所ほど。1/f のゆらぎ）
    rng = np.random.default_rng(4)
    shake = np.stack([ndimage.gaussian_filter1d(rng.normal(0, 1, n), s_) for s_ in (2.0, 3.0)], -1)
    amp = 0.0025 * (1 - smooth((t - 10.0) / 4.0)) + 0.0008
    frames = []
    for i in range(n):
        f = fwd[i].copy()
        right = np.cross(f, [0, 0, 1.0])
        right /= np.linalg.norm(right)
        upv = np.cross(right, f)
        # 揺れ（向きを少しずらす）
        f = f + right * shake[i, 0] * amp[i] + upv * shake[i, 1] * amp[i]
        f /= np.linalg.norm(f)
        right = np.cross(f, [0, 0, 1.0])
        right /= np.linalg.norm(right)
        upv = np.cross(right, f)
        c, s_ = math.cos(bank[i]), math.sin(bank[i])
        r2 = right * c + upv * s_
        u2 = -right * s_ + upv * c
        frames.append(dict(t=round(float(t[i]), 4), pos=[float(x) for x in pos[i]], fwd=[float(x) for x in f], up=[float(x) for x in u2], right=[float(x) for x in r2], lens=LENS, speed=float(v[i])))
    out = os.path.join(WORK, "path3.json")
    with open(out, "w") as fh:
        json.dump(dict(fps=FPS, duration=DURATION, frames=frames, hotaka=[hx, hy]), fh)
    print(f"{n} コマ。川の上の終わり s={s_now[cut]:.0f}m、最後の高さ（川から）{pos[-1, 2] - water[-1]:.0f}m、最大の傾き {math.degrees(np.abs(bank).max()):.0f}°", flush=True)
    # 上から見た確かめ用
    try:
        from PIL import Image, ImageDraw

        W = 900
        xs = np.concatenate([pos[:, 0], rx])
        ys = np.concatenate([pos[:, 1], ry])
        x0, x1, y0, y1 = xs.min() - 200, xs.max() + 200, ys.min() - 200, ys.max() + 200
        sc = W / max(x1 - x0, y1 - y0)
        im = Image.new("RGB", (W, W), (20, 30, 22))
        dr = ImageDraw.Draw(im)
        P = lambda x, y: ((x - x0) * sc, (y1 - y) * sc)  # noqa: E731
        dr.line([P(a, b) for a, b in zip(rx, ry)], fill=(60, 140, 220), width=3)
        dr.line([P(a, b) for a, b in pos[:, :2]], fill=(255, 210, 80), width=2)
        for i in range(0, n, FPS):
            dr.text(P(*pos[i, :2]), f"{t[i]:.0f}", fill=(255, 255, 255))
        im.save(os.path.join(WORK, "path3.png"))
    except Exception as e:  # 確かめ用の絵が作れなくても続ける
        print("確かめ用の絵：", e)


if __name__ == "__main__":
    main()
