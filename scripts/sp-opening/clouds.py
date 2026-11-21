#!/usr/bin/env python3
"""体積の雲（雲海・レンズの前を流れる雲の切れ端）と空気（かすみ・山頂の向こうからの光の筋）を描く（numba）。

  python clouds.py --frame 126 [--scale 0.5] [--sub 1] [--threads 2]

python は numba を入れたもの（pip install numba）。film.py（Blender）が描いた面の絵の奥行き（work/film/<コマ>.exr）を
読み、カメラからその面まで（空は遠くまで）光の道をたどって、雲と空気から来る光と、雲と空気を通り抜ける割合を数える。
出力は work/clouds/<コマ>.npz（L：来る光 RGB、T：通り抜ける割合 RGB。どちらも 16bit）。post.py が面の絵と合わせる。

雲のつくり（Horizon Zero Dawn や Frostbite の雲と同じ考え方を、ここの道具で）：
  - 形：雲海の上面の高さの地図（cloudfield.py）を、3次元のゆらぎで崩す（もくもくした頭・張り出し）。
        ふちは細かいゆらぎで削って、ちぎれた縁と細い切れ端に。上の 100m ほどは薄く、下は濃い
  - 光：太陽の方へ短く光の道をたどって、雲自身の影を数える。富士の影は「この高さより上は日が当たる」地図
        （post.py と同じ作り）。雲の中で何度も散る光は、弱めた影・ゆるめた前への散り方を重ねて近似（Wrenninge 2013）。
        朝日の方の縁は、前へ強く散る光で銀色に光る。日の当たらない側は空の青を受ける
  - 空気：空気の分子と、雲の上にたまるかすみ、春の細かいちり。富士の影の所は光らない（光の筋になる）
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from numba import njit, prange, set_num_threads

import cloudfield as CF
import common as C

R_E = 6371008.8

# 雲の濃さ（1/m）・形の大きさ
CLOUD = dict(
    core=0.036,  # 雲の芯（見通し 約 100m）
    thin=0.0012,  # 上の方の薄い所（カメラが昇る所のまわりだけ）
    thin_depth=(110.0, 300.0),  # 上面からこの深さの間で、薄い → 濃い
    pert=(85.0, 32.0),  # 上面を崩す 3次元のゆらぎの高さ（約 170m・60m の模様）
    erode=0.62,  # ふちを削る強さ
)
AIR = dict(
    rayleigh=(5.8e-6, 13.5e-6, 33.1e-6),  # 空気の分子（海面、1/m）
    top=1.0 / 7000.0,  # 雲の上にたまるかすみ（雲の上面で）
    top_h=180.0,
    dust=1.0 / 80000.0,  # 春の細かいちり（前へ強く散る。太陽のまわりの明るさ）
    dust_h=2600.0,
)


# ---------------------------------------------------------------- 3次元のゆらぎ（くり返す 96^3 の表）


def make_noise(n: int = 96, base: int = 12, seed: int = 7) -> np.ndarray:
    """くり返しのある、なめらかな 3次元のゆらぎ（0〜1）。粗い乱数を 3次の曲線でつないで細かくする"""
    from scipy import ndimage

    g = np.random.default_rng(seed).random((base, base, base)).astype(np.float64)
    z = ndimage.zoom(g, n / base, order=3, mode="grid-wrap", grid_mode=True)
    z = (z - z.min()) / (z.max() - z.min())
    return z.astype(np.float32)


def rotations(k: int, seed: int = 3) -> np.ndarray:
    q, _ = np.linalg.qr(np.random.default_rng(seed).normal(size=(3, 3)))
    out = []
    for i in range(k):
        a = 0.83 * i + 0.4
        rz = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
        out.append(q @ rz)
    return np.array(out, np.float64)


@njit(inline="always", fastmath=True)
def tex3(tex, x, y, z):
    n = tex.shape[0]
    x = x - math.floor(x / n) * n
    y = y - math.floor(y / n) * n
    z = z - math.floor(z / n) * n
    ix = int(x)
    iy = int(y)
    iz = int(z)
    fx = x - ix
    fy = y - iy
    fz = z - iz
    ix1 = (ix + 1) % n
    iy1 = (iy + 1) % n
    iz1 = (iz + 1) % n
    c00 = tex[iz, iy, ix] * (1 - fx) + tex[iz, iy, ix1] * fx
    c01 = tex[iz, iy1, ix] * (1 - fx) + tex[iz, iy1, ix1] * fx
    c10 = tex[iz1, iy, ix] * (1 - fx) + tex[iz1, iy, ix1] * fx
    c11 = tex[iz1, iy1, ix] * (1 - fx) + tex[iz1, iy1, ix1] * fx
    return (c00 * (1 - fy) + c01 * fy) * (1 - fz) + (c10 * (1 - fy) + c11 * fy) * fz


@njit(inline="always", fastmath=True)
def noise(tex, rots, k, px, py, pz, scale):
    """k 番目の向きに回した、大きさ scale（m）のゆらぎ（0〜1）"""
    s = tex.shape[0] / (scale * 8.0)  # 表 1 周 = 大きさの 8 倍（くり返しが目立たない）
    r = rots[k]
    u = (r[0, 0] * px + r[0, 1] * py + r[0, 2] * pz) * s
    v = (r[1, 0] * px + r[1, 1] * py + r[1, 2] * pz) * s
    w = (r[2, 0] * px + r[2, 1] * py + r[2, 2] * pz) * s
    return tex3(tex, u, v, w)


@njit(inline="always", fastmath=True)
def smooth(a, b, x):
    t = (x - a) / (b - a)
    if t < 0.0:
        return 0.0
    if t > 1.0:
        return 1.0
    return t * t * (3.0 - 2.0 * t)


@njit(inline="always", fastmath=True)
def grid2(h, x0, y0, g, x, y):
    n = h.shape[0]
    fx = (x - x0) / g
    fy = (y - y0) / g
    if fx < 0.0:
        fx = 0.0
    if fy < 0.0:
        fy = 0.0
    if fx > n - 1.001:
        fx = n - 1.001
    if fy > n - 1.001:
        fy = n - 1.001
    ix = int(fx)
    iy = int(fy)
    tx = fx - ix
    ty = fy - iy
    a = h[iy, ix] * (1 - tx) + h[iy, ix + 1] * tx
    b = h[iy + 1, ix] * (1 - tx) + h[iy + 1, ix + 1] * tx
    return a * (1 - ty) + b * ty


@njit(inline="always", fastmath=True)
def edge_w(x0, y0, g, n, x, y, border):
    span = (n - 1) * g
    dx = min(x - x0, x0 + span - x)
    dy = min(y - y0, y0 + span - y)
    m = min(dx, dy) / border
    if m < 0.0:
        return 0.0
    if m > 1.0:
        return 1.0
    return m


@njit(inline="always", fastmath=True)
def cloud_top(hf, mf, hm, mm, hr, mr, x, y):
    """上面の高さ：細かい格子の内側ならそれだけを読む（速い）。ふちの帯だけ粗い格子と混ぜる"""
    wf = edge_w(mf[0], mf[1], mf[2], hf.shape[0], x, y, 400.0)
    if wf >= 1.0:
        return grid2(hf, mf[0], mf[1], mf[2], x, y)
    wm = edge_w(mm[0], mm[1], mm[2], hm.shape[0], x, y, 4000.0)
    if wm >= 1.0:
        h = grid2(hm, mm[0], mm[1], mm[2], x, y)
    else:
        h = grid2(hr, mr[0], mr[1], mr[2], x, y)
        if wm > 0.0:
            h = h * (1 - wm) + grid2(hm, mm[0], mm[1], mm[2], x, y) * wm
    if wf > 0.0:
        h = h * (1 - wf) + grid2(hf, mf[0], mf[1], mf[2], x, y) * wf
    return h


@njit(inline="always", fastmath=True)
def lod(foot, scale):
    """模様の大きさ scale（m）が、1 画素の大きさ foot（m）に比べて十分大きいときだけ 1（細かすぎる模様はちらつく）"""
    return smooth(scale * 0.5, scale * 0.25, foot)


@njit(fastmath=True)
def density(tex, rots, top, px, py, alt, foot, near, cp, climb):
    """雲の濃さ（1/m）と、雲の面までのおおよその深さ（m。負なら雲の外で、その分は何も無い）。top は上面の高さの地図の値。
    near はカメラのすぐ近く（レンズの前の切れ端）の強さ"""
    base = cp[0]
    d0 = top - alt
    if d0 < -120.0:
        return 0.0, d0 + 120.0
    n1 = noise(tex, rots, 0, px, py, alt, 170.0)
    n2 = noise(tex, rots, 1, px, py, alt, 60.0)
    # カメラが抜ける頭のまわりでは、上面の崩しを弱める（抜ける瞬間を 2.75 秒に合わせる）。代わりに細かいもくもくを強く
    hx = px - climb[4]
    hy = py - climb[5]
    wh = smooth(260.0, 60.0, math.sqrt(hx * hx + hy * hy))
    d = d0 + (1.0 - 0.8 * wh) * (cp[3] * (n1 - 0.5) * 2.0 + cp[4] * (n2 - 0.5) * 2.0 * lod(foot, 60.0))
    if d < -8.0:
        return 0.0, d + 8.0
    e1 = 0.5
    e2 = 0.5
    if d < 80.0:
        e1 = noise(tex, rots, 2, px, py, alt, 18.0)
        e2 = 0.5 + (noise(tex, rots, 3, px, py, alt, 6.0) - 0.5) * lod(foot, 6.0)
        # もくもく：細かいゆらぎで面そのものを盛り上げる（カリフラワーのような頭）
        d = d + (16.0 + 10.0 * wh) * (e1 - 0.5) * 2.0 + 6.0 * (e2 - 0.5) * 2.0
    # 雲の面の鋭さは、1 画素の大きさに合わせる（近くはくっきり、遠くはなめらかに＝ちらつかない）
    sw = foot * 2.5
    if sw < 2.5:
        sw = 2.5
    if sw > 8.0:
        sw = 8.0
    skin = smooth(-sw, 1.6 * sw, d)
    if d < 80.0:
        # ふちを削る（ちぎれた縁）。近くの雲は削りを弱く（もやもやに見えないように）
        e = (0.6 * e1 + 0.4 * e2) * cp[5] * (1.0 + 0.4 * wh) * (1.0 - smooth(0.0, 80.0, d)) * (0.45 + 0.55 * smooth(0.04, 0.4, foot))
        skin = (skin - e) / (1.0 - e + 1e-4)
        if skin <= 0.0:
            return 0.0, 0.0
    # 上の薄い所（カメラが昇る所のまわりだけ。雲が薄くなって富士が透ける）と、下の濃い所。境はゆらぎで崩す
    wthin = smooth(560.0, 140.0, seg_dist(px, py, climb) + 150.0 * (2.0 * n1 - 1.0))  # 境は雲のむらに沿ってぎざぎざ
    dd = d + 90.0 * (n1 - 0.5) + 45.0 * (n2 - 0.5)
    rho = cp[2] + (cp[1] - cp[2]) * smooth(cp[6] * wthin, cp[7] * wthin + 35.0 * (1.0 - wthin), dd)
    # 山頂への見通しのまわり（細い円すい）：かたまりと切れ端を置かない（富士の影が読めるように）
    vx = px - climb[6]
    vy = py - climb[7]
    vz = alt - climb[8]
    vn = math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-6
    # 山頂の方ほど、かたまりが少しまばら（広く・なめらかに。むらに沿わせて、ふちのある窓にはしない）
    cang = (vx * climb[9] + vy * climb[10] + vz * climb[11]) / vn
    win = 0.55 * smooth(0.9613, 0.99966, cang) * min(1.0, max(0.0, 0.4 + 1.2 * n2))  # 約 16° → 1.5°
    if wthin > 0.0:  # 薄い所の中の雲のかたまり（百 m ほど）とすき間。すき間から差し込む光が、かたまりの影で筋になる
        g3 = 0.65 * noise(tex, rots, 5, px, py, alt * 0.7, 100.0) + 0.35 * noise(tex, rots, 1, px, py, alt, 35.0)
        if climb[12] > 0.5:  # 雲の中にいる間：細かいむら（十数 m）も足す（差し込む光が細い筋に分かれる）
            g3 = 0.75 * g3 + 0.25 * noise(tex, rots, 2, px, py, alt * 0.5, 14.0)
        rho = rho * ((1.0 - 0.75 * wthin) + wthin * 5.0 * smooth(0.52, 0.70, g3) * (1.0 - win))
    if near > 0.0:  # レンズのすぐ前の雲の切れ端：まばらな濃い切れ端（幅 1〜3m・縦長）が、動きのぶれで筋になる
        f = noise(tex, rots, 4, px, py, alt * 0.4, 3.5)
        rho = rho + near * 2.5 * smooth(0.64, 0.76, f) * smooth(-30.0, 10.0, d) * (1.0 - 0.7 * win)
        if rho < 0.0:
            rho = 0.0
    return rho * skin * smooth(base, base + 90.0, alt), d


@njit(inline="always", fastmath=True)
def density_cheap(tex, rots, top, px, py, alt, cp, climb):
    """光の道（太陽へ）で使う、細かい削りを省いた濃さ"""
    d0 = top - alt
    if d0 < -110.0:
        return 0.0
    n1 = noise(tex, rots, 0, px, py, alt, 170.0)
    d = d0 + cp[3] * (n1 - 0.5) * 2.0
    if d < -8.0:
        return 0.0
    wthin = smooth(560.0, 140.0, seg_dist(px, py, climb) + 150.0 * (2.0 * n1 - 1.0))
    rho = cp[2] + (cp[1] - cp[2]) * smooth(cp[6] * wthin, cp[7] * wthin + 35.0 * (1.0 - wthin), d + 90.0 * (n1 - 0.5))
    if wthin > 0.0:  # かたまりの影は遠くまで数える（光の筋）
        g3 = noise(tex, rots, 5, px, py, alt * 0.7, 100.0)
        rho = rho * ((1.0 - 0.75 * wthin) + wthin * 6.0 * smooth(0.52, 0.70, 0.65 * g3 + 0.175))
    return rho * smooth(-6.0, 10.0, d) * smooth(cp[0], cp[0] + 90.0, alt)


@njit(inline="always", fastmath=True)
def seg_dist(x, y, a):
    """点 (x, y) から、カメラが雲の中を昇る線分 a=(x1, y1, x2, y2) までの水平の距離（m）"""
    vx = a[2] - a[0]
    vy = a[3] - a[1]
    l2 = vx * vx + vy * vy
    t = ((x - a[0]) * vx + (y - a[1]) * vy) / max(l2, 1e-6)
    if t < 0.0:
        t = 0.0
    if t > 1.0:
        t = 1.0
    ex = x - (a[0] + t * vx)
    ey = y - (a[1] + t * vy)
    return math.sqrt(ex * ex + ey * ey)


@njit(inline="always", fastmath=True)
def hg(c, g):
    return (1.0 - g * g) / (4.0 * math.pi * (1.0 + g * g - 2.0 * g * c) ** 1.5)


@njit(inline="always", fastmath=True)
def phase(c, k):
    """雲の散り方：前へ強く（銀の縁）、少しだけ後ろへ。k は多重散乱で前への強さをゆるめる割合"""
    return 0.78 * hg(c, 0.80 * k) + 0.22 * hg(c, -0.25 * k)


@njit(parallel=True, fastmath=True, cache=True)
def render(w, h, jx, jy, pos, rgt, upv, fwd, fpx, tmax_map, sky_map, sun, esun, amb_up, amb_dn,
           hf, mf, hm, mm, hr, mr, sh, shm, tex, rots, cp, ap, near_dist, aur, eaur, sha, climb, t_start, t_end, near_pass, outL, outT):
    sx_, sy_, sz_ = sun[0], sun[1], sun[2]
    for j in prange(h):
        for i in range(w):
            # 光の道の向き（画素の中の位置を少しずらす：縮めたとき、ふちがなめらかに）
            u = (i + 0.5 + jx[j, i] - w * 0.5) / fpx
            v = (h * 0.5 - (j + 0.5 + jy[j, i])) / fpx
            dx = fwd[0] + rgt[0] * u + upv[0] * v
            dy = fwd[1] + rgt[1] * u + upv[1] * v
            dz = fwd[2] + rgt[2] * u + upv[2] * v
            nn = math.sqrt(dx * dx + dy * dy + dz * dz)
            dx /= nn
            dy /= nn
            dz /= nn
            tmax = min(tmax_map[j, i], t_end)
            is_sky = sky_map[j, i]
            cos_s = dx * sx_ + dy * sy_ + dz * sz_
            cos_a = dx * aur[0] + dy * aur[1] + dz * aur[2]
            ph_air = 3.0 / (16.0 * math.pi) * (1.0 + cos_s * cos_s)
            ph_haze = hg(cos_s, 0.72)
            ph_dust = hg(cos_s, 0.92)
            T0 = 1.0
            T1 = 1.0
            T2 = 1.0
            L0 = 0.0
            L1 = 0.0
            L2 = 0.0
            t = t_start + 0.3 + 0.35 * (jx[j, i] + 0.5)  # 最初の一歩を画素ごとにずらす（縞を防ぐ）
            foot_k = 1.0 / fpx
            steps = 0
            while t < tmax and steps < 900:
                steps += 1
                px = pos[0] + dx * t
                py = pos[1] + dy * t
                pz = pos[2] + dz * t
                alt = pz + (px * px + py * py) / (2.0 * R_E)
                top = cloud_top(hf, mf, hm, mm, hr, mr, px, py)
                above = alt - (top + 110.0)
                foot = t * foot_k
                # 次の一歩の長さ：雲の上（雲から十分はなれた所）は大またに、雲の中・近くは細かく
                if above > 0.0 and alt > cp[0]:
                    slope = -dz
                    if slope < 0.03:
                        slope = 0.03
                    dt = 0.6 * above / slope
                    lim = 0.06 * t + 20.0
                    if dt > lim:
                        dt = lim
                    if dt < 2.0:
                        dt = 2.0
                    rho = 0.0
                else:
                    near = 0.0
                    if t < near_dist:
                        near = 1.0 - t / near_dist
                    rho, dsig = density(tex, rots, top, px, py, alt, foot, near, cp, climb)
                    # 一歩の長さ：雲の濃さに合わせる（一歩で光が 1 割ほど弱まるくらい）。レンズの近くは細かく
                    lo_ = 0.0035 * t + 0.3
                    hi_ = 0.02 * t + 2.0
                    if t < near_dist:
                        hi_ = 0.4 + 0.03 * t
                    if hi_ > 60.0:
                        hi_ = 60.0
                    if rho > 1e-6:
                        dt = 0.12 / rho
                    else:
                        dt = hi_
                        if dsig < 0.0:  # 雲の上面より上：上面までの距離の半分は、何も無い
                            skip = -0.5 * dsig
                            if skip > dt:
                                dt = skip
                            if dt > 0.05 * t + 30.0:
                                dt = 0.05 * t + 30.0
                    if dt < lo_:
                        dt = lo_
                    if dt > hi_:
                        dt = hi_
                if t + dt > tmax:
                    dt = tmax - t
                # 空気（雲の外も中も）
                ab = alt - CF_TOP_REF
                if ab < 0.0:
                    ab = 0.0
                a_top = ap[3] * math.exp(-ab / ap[4])
                a_dust = ap[5] * math.exp(-ab / ap[6])
                mol = 0.0 if is_sky else math.exp(-alt / 8000.0)
                br0 = ap[0] * mol
                br1 = ap[1] * mol
                br2 = ap[2] * mol
                # 富士の影（この高さより上は日が当たる）
                shh = grid2(sh, shm[0], shm[1], shm[2], px, py)
                lit_air = smooth(-15.0, 15.0, pz - shh)
                # 太陽の光は、雲の上のかすみを斜めに抜けてくる分だけ弱まる
                tau_haze_sun = a_top * ap[4] / max(sz_, 0.02)
                fs = lit_air * math.exp(-tau_haze_sun)
                ex0 = br0 + a_top * 0.9 + a_dust
                ex1 = br1 + a_top + a_dust
                ex2 = br2 + a_top * 1.1 + a_dust
                s0 = (br0 * ph_air + a_top * 0.9 * ph_haze + a_dust * ph_dust) * esun[0] * fs + ex0 * amb_up[0] * 0.55
                s1 = (br1 * ph_air + a_top * ph_haze + a_dust * ph_dust) * esun[1] * fs + ex1 * amb_up[1] * 0.55
                s2 = (br2 * ph_air + a_top * 1.1 * ph_haze + a_dust * ph_dust) * esun[2] * fs + ex2 * amb_up[2] * 0.55
                if rho > 0.0:
                    # 雲：太陽への光の道（雲自身の影）
                    tau_s = 0.0
                    ds = 8.0
                    acc = 0.0
                    nls = 5 if t < 3000.0 else 3
                    fine = climb[12] > 0.5 and t < 400.0 and not near_pass
                    grow = 3.0
                    if fine:  # 雲の中の近く：細かく 7 歩（6m から）。差し込む光の細い筋を、かたまりの影で切り分ける
                        ds = 6.0
                        nls = 7
                        grow = 2.0
                    # 近くの雲（約 1〜2.5km より手前）ほど、もくもくの細かい形で影を数える（頭のふちが光り、くびれが暗い）。
                    # 切り替えは距離でなめらかに（境に線が出ないように）
                    wdet = smooth(2500.0, 1000.0, t)
                    for k in range(nls):
                        qx = px + sx_ * (acc + 0.5 * ds)
                        qy = py + sy_ * (acc + 0.5 * ds)
                        qa = alt + sz_ * (acc + 0.5 * ds)
                        tq = cloud_top(hf, mf, hm, mm, hr, mr, qx, qy)
                        rq = 0.0
                        rc = 0.0
                        kd = 4 if t < 400.0 else 2  # カメラの近く：かたまりの影まで細かく（雲の中の光の筋。約 320m まで）
                        if fine:
                            kd = 5
                        if near_pass:
                            kd = 1  # レンズの前の切れ端：細かい影はいらない（速い）
                        if k < kd and wdet > 0.0:
                            rq, _dq = density(tex, rots, tq, qx, qy, qa, foot, 0.0, cp, climb)
                        if k >= kd or wdet < 1.0:
                            rc = density_cheap(tex, rots, tq, qx, qy, qa, cp, climb)
                        if k < kd:
                            tau_s += (wdet * rq + (1.0 - wdet) * rc) * ds
                        else:
                            tau_s += rc * ds
                        acc += ds
                        ds *= grow
                    # 富士の影：多重散乱の項ほど、影のふちをゆるく（光が影の中へにじむ）
                    dzs = pz - shh
                    lsun = 0.0
                    a_ = 1.0
                    b_ = 1.0
                    c_ = 1.0
                    for o in range(4):
                        soft = 30.0 * (3.0 ** o)  # 30, 90, 270, 810 m
                        vis = smooth(-soft, soft, dzs + 0.5 * soft)
                        lsun += b_ * phase(cos_s, c_) * math.exp(-a_ * tau_s) * vis
                        a_ *= 0.42
                        b_ *= 0.58
                        c_ *= 0.5
                    # 空の光：上の面に近いほど明るい（深い所は藍色に沈む）
                    dep = top - alt
                    if dep < 0.0:
                        dep = 0.0
                    tau_up = 0.010 * dep
                    if wdet > 0.0 and not near_pass:  # 近くの雲：真上へ短く見て、空の光のさえぎり（くびれは暗い）。遠くは平均で
                        tl = 0.0
                        for k in range(2):
                            uz = alt + 10.0 + 30.0 * k
                            ru, _du = density(tex, rots, top, px, py, uz, foot, 0.0, cp, climb)
                            tl += ru * (16.0 + 24.0 * k)
                        tau_up += wdet * tl + (1.0 - wdet) * 0.12
                    else:
                        tau_up += 0.12
                    ka = 0.9 * math.exp(-0.8 * tau_up) + 0.03
                    # 太陽のまわりの明るい空（山頂の上は富士にさえぎられない）からの光：雲の薄い縁を前へ抜けて光る
                    sah = grid2(sha, shm[0], shm[1], shm[2], px, py)
                    visa = smooth(-40.0, 40.0, pz - sah)
                    laur = (0.85 * hg(cos_a, 0.88) + 0.15 * hg(cos_a, 0.3)) * math.exp(-0.85 * tau_s) * visa + 0.12 * phase(cos_a, 0.5) * math.exp(-0.3 * tau_s) * visa
                    s0 += rho * (esun[0] * lsun + eaur[0] * laur + amb_up[0] * ka + amb_dn[0] * 0.15)
                    s1 += rho * (esun[1] * lsun + eaur[1] * laur + amb_up[1] * ka + amb_dn[1] * 0.15)
                    s2 += rho * (esun[2] * lsun + eaur[2] * laur + amb_up[2] * ka + amb_dn[2] * 0.15)
                    ex0 += rho
                    ex1 += rho
                    ex2 += rho
                # 一歩の積分（光の量を保つ形：Hillaire 2015）
                e0 = math.exp(-ex0 * dt)
                e1 = math.exp(-ex1 * dt)
                e2 = math.exp(-ex2 * dt)
                L0 += T0 * (s0 - s0 * e0) / max(ex0, 1e-9)
                L1 += T1 * (s1 - s1 * e1) / max(ex1, 1e-9)
                L2 += T2 * (s2 - s2 * e2) / max(ex2, 1e-9)
                T0 *= e0
                T1 *= e1
                T2 *= e2
                if T0 < 0.004 and T1 < 0.004 and T2 < 0.004:
                    # ほとんど見通せない：奥の明るい空がわずかに透けて点々にならないよう、残りは 0 に
                    T0 = 0.0
                    T1 = 0.0
                    T2 = 0.0
                    break
                t += dt
            outL[j, i, 0] = L0
            outL[j, i, 1] = L1
            outL[j, i, 2] = L2
            outT[j, i, 0] = T0
            outT[j, i, 1] = T1
            outT[j, i, 2] = T2


CF_TOP_REF = CF.MEAN_TOP
NEAR = 40.0  # レンズの前の切れ端を描く距離（m）


# ---------------------------------------------------------------- 富士の影（この高さより上は日が当たる）


def shadow_map(sun: np.ndarray, g: float = 25.0, half: float = 26000.0, cx: float = -6000.0, cache_name: str = "shadow.npz") -> dict:
    """富士の影の高さの地図（原点＝山頂の 東・北・上。地球の丸みを入れ、太陽の光はまっすぐ）。PC の atmos.py と同じ作り"""
    from scipy import ndimage

    import terrain as TR

    cache = os.path.join(C.WORK, cache_name)
    key = np.round(np.asarray(sun, float), 7)
    if os.path.exists(cache):
        z = np.load(cache)
        if np.allclose(z["sun"], key):
            return dict(h=z["S"], meta=z["meta"])
    n = int(2 * half / g) + 1
    x0, y0 = cx - half, -half
    xs = x0 + np.arange(n) * g
    ys = y0 + np.arange(n) * g
    X, Y = np.meshgrid(xs, ys)
    lat, lon = TR.offset_latlon(C.SUMMIT[0], C.SUMMIT[1], X, Y)
    Hg = TR.ground(lat.ravel(), lon.ravel()).reshape(X.shape) - (X**2 + Y**2) / (2 * R_E)
    sx, sy, sz = (float(v) for v in sun)
    hl = math.hypot(sx, sy)
    ux, uy, tan_el = sx / hl, sy / hl, sz / hl
    diag = int(math.hypot(n, n)) + 4
    us = np.arange(diag) - diag / 2
    V, U = np.meshgrid(us, us, indexing="ij")
    c = (n - 1) / 2
    Hr = ndimage.map_coordinates(Hg.astype(np.float32), [c + (U * uy + V * ux), c + U * ux - V * uy], order=1, mode="constant", cval=-5000.0)
    Sr = Hr.copy()
    drop = g * tan_el
    for jj in range(diag - 2, -1, -1):
        np.maximum(Sr[:, jj], Sr[:, jj + 1] - drop, out=Sr[:, jj])
    Yg, Xg = np.mgrid[0:n, 0:n].astype(np.float32)
    ddx, ddy = Xg - c, Yg - c
    S = ndimage.map_coordinates(Sr, [-ddx * uy + ddy * ux + diag / 2, ddx * ux + ddy * uy + diag / 2], order=1, mode="nearest").astype(np.float32)
    meta = np.array([x0, y0, g], np.float64)
    np.savez(cache, S=S, meta=meta, sun=key)
    return dict(h=S, meta=meta)


# ---------------------------------------------------------------- 1コマ


def frame_inputs(f: int, scale: float, film_dir: str = ""):
    """film.py の面の絵の奥行き（無ければ、空として遠くまで）"""
    import path as P

    w, h = int(round(C.W * C.SS * scale)), int(round(C.H * C.SS * scale))
    cam = P.camera(f)
    exr = os.path.join(film_dir or os.path.join(C.WORK, "film"), f"{f:04d}.exr")
    if os.path.exists(exr):
        d = C.read_exr(exr)
        Z = d["Depth.Z"].astype(np.float32)
        if Z.shape != (h, w):
            from PIL import Image

            Z = np.asarray(Image.fromarray(Z).resize((w, h), Image.NEAREST))
    else:
        Z = np.full((h, w), 1e10, np.float32)
    return cam, Z, w, h


def run(f: int, scale: float = 1.0, sub: int = 1, threads: int = 2, out: str | None = None, film_dir: str = "", farscale: float = 1.0) -> str:
    import path as P

    set_num_threads(threads)
    p = P.plan()
    sun = np.asarray(p["sun_vec"], np.float64)
    el = math.degrees(math.asin(sun[2]))
    esun = np.array(C.sun_color(el), np.float64) * 14.0  # film.py の太陽と同じ強さ
    amb_up = np.array([0.30, 0.42, 0.62], np.float64)  # 上の空からの光（青い）
    amb_dn = np.array([0.20, 0.21, 0.24], np.float64)  # 下の雲・地面から
    g = CF.load()
    hf, mf = g["fine"]["h"], np.array([g["fine"]["x0"], g["fine"]["y0"], g["fine"]["g"]])
    hm, mm = g["mid"]["h"], np.array([g["mid"]["x0"], g["mid"]["y0"], g["mid"]["g"]])
    hr, mr = g["far"]["h"], np.array([g["far"]["x0"], g["far"]["y0"], g["far"]["g"]])
    sh = shadow_map(sun)
    # 太陽のまわりの明るい空を、太陽の 3.5° 上の光で近似（強さは太陽の約 1 割、少し白い金）
    a_el = el + 3.5
    saz = math.atan2(sun[0], sun[1])
    aur = np.array([math.cos(math.radians(a_el)) * math.sin(saz), math.cos(math.radians(a_el)) * math.cos(saz), math.sin(math.radians(a_el))])
    eaur = esun * 0.24 * np.array([1.0, 0.97, 0.92])
    sha = shadow_map(aur, cache_name="shadow_aur.npz")
    tex = make_noise()
    rots = rotations(6)
    cp = np.array([CF.BASE, CLOUD["core"], CLOUD["thin"], CLOUD["pert"][0], CLOUD["pert"][1], CLOUD["erode"],
                   CLOUD["thin_depth"][0], CLOUD["thin_depth"][1]], np.float64)
    ap = np.array([*AIR["rayleigh"], AIR["top"], AIR["top_h"], AIR["dust"], AIR["dust_h"]], np.float64)
    cam, Z, w, h = frame_inputs(f, scale, film_dir)
    # カメラが雲の中を昇る線分（0.6〜2.8 秒の水平の位置）
    c1, c2 = P.camera(int(0.6 * C.FPS))["pos"], P.camera(int(2.8 * C.FPS))["pos"]
    # 富士の方へ 1.2km のばす（山頂の方の見通しだけが薄くなり、富士が透ける。まわりは濃いまま）
    fx_, fy_ = -c2[0], -c2[1]
    fl_ = math.hypot(fx_, fy_)
    ch = P.camera(int(round(CF.HEAD_T * C.FPS)))["pos"]  # 抜ける頭のてっぺん
    cpos = cam["pos"]
    calt = float(cpos[2] + (cpos[0] ** 2 + cpos[1] ** 2) / (2 * R_E))
    to_s = np.array([-cpos[0], -cpos[1], 3774.0 - calt])  # 山頂への向き（高さは海抜で）
    to_s /= np.linalg.norm(to_s)
    in_cloud = 1.0 if f / C.FPS < CF.HEAD_T else 0.0  # 雲の頭を抜ける前（雲の中）
    climb = np.array([c1[0], c1[1], c2[0] + fx_ / fl_ * 1200.0, c2[1] + fy_ / fl_ * 1200.0, ch[0], ch[1],
                      cpos[0], cpos[1], calt, to_s[0], to_s[1], to_s[2], in_cloud], np.float64)
    fpx = cam["focal"] / cam["sensor"] * w
    # 奥行き（カメラの前の向きの距離）→ 光の道の長さ。空は 80km まで
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    norm = np.sqrt(((xs + 0.5 - w / 2) / fpx) ** 2 + ((h / 2 - ys - 0.5) / fpx) ** 2 + 1.0)
    sky = Z > 1e8
    tmax = np.where(sky, 80000.0, Z * norm).astype(np.float64)
    t0 = time.time()
    # 動きのぶれ：シャッターの間（1/60 秒）のカメラの位置を sub 回に分けて平均する
    c_prev = P.camera(max(f - 1, 0))
    c_next = P.camera(min(f + 1, C.N_FRAMES - 1))
    vel = (c_next["pos"] - c_prev["pos"]) / max(1, (min(f + 1, C.N_FRAMES - 1) - max(f - 1, 0))) * C.FPS
    speed = float(np.linalg.norm(vel))
    def one(pos_k, t_a, t_b, seed, fs=1.0):
        """fs < 1：小さく描いて広げる（雲の中の奥の、やわらかいもやだけ）"""
        ww, hh = max(8, int(round(w * fs))), max(8, int(round(h * fs)))
        r = np.random.default_rng(seed)
        jx = (r.random((hh, ww)) - 0.5).astype(np.float64)
        jy = (r.random((hh, ww)) - 0.5).astype(np.float64)
        oL = np.zeros((hh, ww, 3), np.float64)
        oT = np.zeros((hh, ww, 3), np.float64)
        if fs != 1.0:
            from PIL import Image as _I

            tm = np.asarray(_I.fromarray(tmax.astype(np.float32)).resize((ww, hh), _I.NEAREST)).astype(np.float64)
            sk = np.asarray(_I.fromarray(sky.astype(np.uint8) * 255).resize((ww, hh), _I.NEAREST)) > 127
        else:
            tm, sk = tmax, sky
        render(ww, hh, jx, jy, pos_k, cam["right"], cam["up"], cam["fwd"], fpx * fs, tm, sk, sun, esun, amb_up, amb_dn,
               hf, mf, hm, mm, hr, mr, sh["h"], sh["meta"], tex, rots, cp, ap, NEAR, aur, eaur, sha["h"], climb, t_a, t_b, t_b <= NEAR, oL, oT)
        if fs != 1.0:
            from PIL import Image as _I

            up = lambda a: np.stack([np.asarray(_I.fromarray(a[..., c].astype(np.float32)).resize((w, h), _I.BILINEAR)) for c in range(3)], -1)
            oL, oT = up(oL).astype(np.float64), up(oT).astype(np.float64)
        return oL, oT

    # 手前（レンズから NEAR m まで）：シャッターの間を細かく分けて、流れ去る切れ端を筋に。奥：sub 回
    shutter = 1.0 / 36.0 if speed > 150.0 else 1.0 / 60.0  # 速く昇る間はシャッターを長く（切れ端の筋で速さが分かる）
    nsub = max(sub, 1) * (2 if speed > 60.0 else 1)
    Ln = np.zeros((h, w, 3))
    Tn = np.zeros((h, w, 3))
    for k in range(nsub):
        dtk = ((k + 0.5) / nsub - 0.5) * shutter if nsub > 1 else 0.0
        oL, oT = one(cam["pos"] + vel * dtk, 0.0, NEAR, 1000 * f + k)
        Ln += oL / nsub
        Tn += oT / nsub
    t_near = time.time() - t0
    Lf = np.zeros((h, w, 3))
    Tf = np.zeros((h, w, 3))
    for k in range(sub):
        dtk = ((k + 0.5) / sub - 0.5) * shutter if sub > 1 else 0.0
        oL, oT = one(cam["pos"] + vel * dtk, NEAR, 1e9, 7000 * f + k, farscale)
        Lf += oL / sub
        Tf += oT / sub
    L = Ln + Tn * Lf  # 手前から奥へ重ねる
    Tt = Tn * Tf
    dt = time.time() - t0
    out = out or os.path.join(C.WORK, "clouds", f"{f:04d}.npz")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    np.savez_compressed(out, L=L.astype(np.float16), T=Tt.astype(np.float16))
    print(f"雲 コマ {f}（{f / C.FPS:.2f} 秒）{w}×{h}、{sub} 回、{dt:.1f} 秒（手前 {t_near:.1f}・奥 {dt - t_near:.1f}）", flush=True)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", type=int, required=True)
    ap.add_argument("--scale", type=float, default=1.0, help="2倍の大きさ（2160×4680）に対する割合")
    ap.add_argument("--sub", type=int, default=1, help="動きのぶれのための時間の分け数")
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--out", default="")
    ap.add_argument("--film", default="", help="film.py の出力のフォルダ（既定 work/film）")
    ap.add_argument("--farscale", type=float, default=1.0, help="奥（レンズの前 40m より先）を描く大きさの割合（雲の中は 0.5 で十分）")
    a = ap.parse_args()
    run(a.frame, a.scale, a.sub, a.threads, a.out or None, a.film, a.farscale)


if __name__ == "__main__":
    main()
