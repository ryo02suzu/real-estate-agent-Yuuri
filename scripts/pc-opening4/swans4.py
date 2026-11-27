"""第4版オープニング：オオハクチョウ 7 羽（羽を 1 枚ずつ）。計画は PLAN.md の行 F、作り方と数字は notes/swans.md。

world.py から  extras=swans4  で呼ばれる（add(world)）。単体では試し描きの道具：

  python swans4.py -- rig=side|top34|backlit|cycle|all  out=review/swans   # 1 羽の確かめ（物理的な空・雲の面の代わりの白い板）
  python swans4.py -- rig=flight out=review/swans/flightframes frames=557-719:1   # 動きの確かめ（簡単な空）
  python swans4.py -- rig=project   # コマごとの位置・画面の位置・ロゴの場所との重なりを表にする（描かない）

自前で全部持つ（swan_hero.py・swans.py は読まない）。種の数字と出典は notes/swans.md。
座標：1 羽の原点は体の真ん中、+Y が前、+X が右、+Z が上、単位 m。
羽ばたきは骨（上腕・前腕・手）の角度から毎コマ計算する（形のキー補間ではない）。
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

FLAP_HZ = 2.6            # オオハクチョウの水平巡航の羽ばたき（notes/swans.md に根拠と不確かさ）
FLAP_SPREAD = 0.04       # 1 羽ごとの周波数のばらつき（±4%）
SPAN = 2.40              # 翼を広げた幅 m（205〜275cm の中ほど。オスの大きめ）
FILM_FPS = 24.0

# 骨の長さ（m）。肩→肘→手首→手の付け根。先の羽（初列風切）は手から出る
L_HUM, L_ULN, L_MAN = 0.235, 0.295, 0.190
SHOULDER = np.array([0.095, 0.085, 0.065])


def rad(x):
    return math.radians(x)


# ================================================================ 羽 1 枚の形（まとめて作る）

def feather_batch(nu, nv, L, wl, wt, tip, calamus, sweep, blunt, droop=0.06):
    """羽 n 枚の点。羽の座標：x＝根元から先、y＝幅（前 +）、z＝上。返り値 (n, nu+1, 2nv+1, 3)。UV・面は feather_topology"""
    L, wl, wt, tip, calamus, sweep, blunt = (np.asarray(a, float)[:, None, None] for a in (L, wl, wt, tip, calamus, sweep, blunt))
    us = np.linspace(0, 1, nu + 1)[None, :, None]
    vs = np.linspace(-1, 1, 2 * nv + 1)[None, None, :]
    grow = np.clip((us - calamus) / 0.16, 0, 1)
    grow = grow * grow * (3 - 2 * grow)
    t = np.clip((us - (1 - tip)) / tip, 0, 1)
    end = np.where(us > 1 - tip, np.clip(1 - t ** blunt, 0, 1) ** (1.0 / blunt), 1.0)
    shape = grow * end
    w = np.where(vs < 0, wl, wt) * shape
    y = -vs * w
    x = us * L - np.abs(vs) * w * sweep
    z = -droop * L * us * us - 0.012 * L * np.maximum(vs, 0) * us
    x, y, z = np.broadcast_arrays(x, y, z)
    return np.stack([x, y, z], axis=-1)


def feather_topology(nu, nv):
    us = np.linspace(0, 1, nu + 1)
    vs = np.linspace(-1, 1, 2 * nv + 1)
    uu, vv = np.meshgrid(us, vs, indexing="ij")
    uv = np.stack([uu.ravel(), (vv.ravel() + 1) / 2], axis=1)
    nvv = 2 * nv + 1
    faces = []
    for i in range(nu):
        for j in range(2 * nv):
            a = i * nvv + j
            faces.append((a, a + nvv, a + nvv + 1, a + 1))
    return uv, np.array(faces, int)


class Soup:
    """羽の点の入れもの（種類ごとに点・UV・面をためて、最後に 1 つのメッシュにする）"""

    def __init__(self):
        self.parts = []

    def add(self, pts_f, nu, nv, **per_feather):
        """pts_f (n, np, 3) 羽の座標の点。per_feather：羽ごとの配列（n）または (n,3)。向きが逆の面は flip=bool 配列"""
        n = pts_f.shape[0]
        uv, faces = feather_topology(nu, nv)
        self.parts.append(dict(n=n, pts=pts_f.reshape(n * pts_f.shape[1], 3), uv=np.tile(uv, (n, 1)), faces=faces,
                               npt=pts_f.shape[1], per={k: np.asarray(v) for k, v in per_feather.items()}))

    def build(self):
        """全部をつなぐ：点ごとの配列（pts・uv・各 per_feather を点へ広げたもの）と面"""
        pts, uvs, F = [], [], []
        per = {}
        base = 0
        for p in self.parts:
            n, npt = p["n"], p["npt"]
            pts.append(p["pts"])
            uvs.append(p["uv"])
            flip = p["per"].get("flip", np.zeros(n, bool))
            idx = (np.arange(n) * npt)[:, None, None] + p["faces"][None]
            idx = idx.reshape(-1, 4) + base
            fl = np.repeat(flip, len(p["faces"]))
            idx[fl] = idx[fl][:, ::-1]
            F.append(idx)
            for k, v in p["per"].items():
                per.setdefault(k, []).append(np.repeat(v, npt, axis=0))
            base += n * npt
        out = {k: np.concatenate(v) for k, v in per.items()}
        out.update(pts=np.concatenate(pts), uv=np.concatenate(uvs), faces=np.concatenate(F))
        return out


# ================================================================ 翼の羽の並び（骨の座標）

def build_wing_feathers(rng, lod):
    """右の翼の羽。骨 0＝上腕・1＝前腕・2＝手。骨の座標：x＝骨の向き、y＝前、z＝上（背側）。
    返り値：Soup.build() の辞書。per：bone, root(3), fan0, ks, bendk, L"""
    soup = Soup()
    res_big = (14, 6) if lod == 0 else (9, 4) if lod == 1 else (6, 3)
    res_small = (8, 4) if lod == 0 else (6, 3)

    def add_group(res, n, bone, root, fan0, ks, bendk, L, wl, wt, tip, sweep, blunt, calamus=0.07, ventral=False, roll=0.0, droop=0.06):
        pts = feather_batch(res[0], res[1], L, wl, wt, tip, np.full(n, calamus), sweep, blunt, droop)
        if np.any(np.asarray(roll) != 0):
            r = np.broadcast_to(np.asarray(roll, float), (n,))[:, None]
            c, s = np.cos(r), np.sin(r)
            y = pts[..., 1].reshape(n, -1)
            z = pts[..., 2].reshape(n, -1)
            y2, z2 = c * y - s * z, s * y + c * z
            pts = np.stack([pts[..., 0].reshape(n, -1), y2, z2], axis=-1)
        else:
            pts = pts.reshape(n, -1, 3)
        if ventral:
            pts = pts * np.array([1, 1, -1.0])
        soup.add(pts, res[0], res[1], bone=np.full(n, bone), root=np.asarray(root), fan0=fan0, ks=ks, bendk=bendk, L=np.asarray(L, float),
                 flip=np.full(n, ventral), rand=rng.random(n), kind=np.full(n, 0))

    # 次列風切（前腕に 21 枚）。長さは手首側へ少し短く。骨の少し後ろ（y −0.03）から真うしろへ出る
    n = 21
    s = (np.arange(n) + 0.5) / n
    root = np.stack([s * L_ULN, np.full(n, -0.030), 0.004 - 0.0006 * np.arange(n)], axis=1)
    L = 0.292 - 0.016 * s + 0.008 * np.sin(np.pi * s) + rng.normal(0, 0.003, n)
    fan0 = np.radians(-6 + 14 * s + rng.normal(0, 0.5, n))
    add_group(res_big, n, 1, root, fan0, np.radians(0.0 + 0 * s), 0.045 + 0 * s, L, np.full(n, 0.027), np.full(n, 0.036), np.full(n, 0.36), np.full(n, 0.03), np.full(n, 2.0), roll=np.radians(-3))
    # 三列風切（上腕に 5 枚）。体のほうへ向く
    n = 5
    s = (np.arange(n) + 0.5) / n
    root = np.stack([s * L_HUM, np.full(n, -0.030), 0.012 - 0.001 * np.arange(n)], axis=1)
    L = 0.270 - 0.022 * s + rng.normal(0, 0.003, n)
    add_group(res_big, n, 0, root, np.radians(-16 - 8 * s), np.zeros(n), 0.03 + 0 * s, L, np.full(n, 0.028), np.full(n, 0.036), np.full(n, 0.34), np.full(n, 0.03), np.full(n, 2.0))
    # 初列風切 10 枚（手）。P1（内）〜P10（外）。外の 5 枚は先がせまく切れこむ。開き（ks）は外ほど大きい。P8・P9 が最長
    n = 10
    q = np.arange(n) / 9.0
    root = np.stack([L_MAN * (0.18 + 0.72 * q), np.full(n, -0.028), 0.006 - 0.0013 * np.arange(n)], axis=1)
    Lp = np.array([0.300, 0.330, 0.358, 0.384, 0.404, 0.424, 0.438, 0.446, 0.440, 0.360]) + rng.normal(0, 0.003, n)
    emarg = q > 0.45
    wl = np.where(emarg, 0.016, 0.022)
    wt = np.where(emarg, 0.026, 0.034)
    fan0 = np.radians(26 + 43 * q ** 1.1 + rng.normal(0, 0.5, n))
    ks = np.radians(2 + 8 * q)
    add_group(res_big, n, 2, root, fan0, ks, 0.10 + 0 * q, Lp, wl, wt, np.where(emarg, 0.33, 0.30), np.full(n, 0.05), np.where(emarg, 2.0, 2.2), roll=np.radians(-4 - 4 * q))
    # 背側の雨覆（大・中・小）と前縁。前腕・手の上に、うろこのように重ねる。付け根は風切羽の付け根の少し前
    def coverts(bone, Lbone, rows, ventral):
        for (ny, yfrac, Lr, wl_, wt_, nn, z, bk, ksc) in rows:
            m = int(nn * (1.0 if lod == 0 else 0.6))
            if m < 3:
                continue
            ss = (np.arange(m) + rng.uniform(0.15, 0.85, m)) / m
            yy = -0.030 + (ny + 0.0 * ss) + rng.normal(0, 0.003, m)
            root = np.stack([ss * Lbone, yy, np.full(m, z) * (-1 if ventral else 1) + rng.normal(0, 0.0012, m)], axis=1)
            L = Lr * rng.uniform(0.85, 1.15, m)
            fan0 = np.radians(rng.normal(2 + 18 * ss, 3.0))
            if bone == 0:
                fan0 = np.radians(rng.normal(-10 + 5 * ss, 3.0))
            add_group(res_small, m, bone, root, fan0, np.radians(ksc * ss), np.full(m, bk), L, wl_ * rng.uniform(0.9, 1.1, m), wt_ * rng.uniform(0.9, 1.15, m),
                      np.full(m, 0.7), np.full(m, 0.10), np.full(m, 1.8), calamus=0.05, ventral=ventral, roll=np.radians(rng.normal(0, 4, m)))
    for ventral in (False, True):
        zs = -1.0 if ventral else 1.0
        sc = 0.8 if ventral else 1.0
        # (前へのずらし, 割合, 長さ, 幅前, 幅後, 枚数, 高さ, 反り, 開き)
        coverts(1, L_ULN, [(0.050, 0, 0.125 * sc, 0.020, 0.034, 21, 0.022, 0.05, 0), (0.090, 0, 0.082 * sc, 0.015, 0.026, 28, 0.028, 0.04, 0),
                           (0.125, 0, 0.052 * sc, 0.011, 0.018, 34, 0.034, 0.03, 0), (0.150, 0, 0.030 * sc, 0.008, 0.012, 40, 0.038, 0.02, 0)], ventral)
        coverts(2, L_MAN, [(0.040, 0, 0.105 * sc, 0.016, 0.026, 10, 0.020, 0.09, 8), (0.075, 0, 0.065 * sc, 0.012, 0.020, 14, 0.026, 0.06, 6),
                           (0.105, 0, 0.040 * sc, 0.009, 0.015, 16, 0.030, 0.04, 4)], ventral)
        coverts(0, L_HUM, [(0.060, 0, 0.130 * sc, 0.024, 0.036, 14, 0.026, 0.03, 0), (0.115, 0, 0.075 * sc, 0.016, 0.025, 18, 0.032, 0.02, 0),
                           (0.165, 0, 0.048 * sc, 0.011, 0.017, 22, 0.038, 0.02, 0)], ventral)
    out = soup.build()
    return out


# ================================================================ 翼の骨（羽ばたき）

def warp(phi):
    """位相 0（上端）→ 打ち下ろし（全体の 45%）→ 下端 → 打ち上げ（55%）。位相を角度（周期 2π）へ"""
    phi = phi % 1.0
    g = np.where(phi < 0.45, phi * 0.5 / 0.45, 0.5 + (phi - 0.45) * 0.5 / 0.55)
    return 2 * np.pi * g


def wing_params(phi, bank_asym=0.0):
    """位相から骨の角度。返り値は辞書"""
    th = float(warp(phi))
    s, c = math.sin(th), math.cos(th)
    up = max(0.0, -s)
    flexE = 0.62 * up ** 0.9
    # 手首の曲がりは肘より少し先に立ち上がる（打ち上げの前半に手首がたたまれ、後半に開き直る）
    thw = th + 0.35
    upw = max(0.0, -math.sin(thw))
    flexW = 0.95 * upw ** 0.9
    A0, A = 12.0 + bank_asym, 43.0
    ah = A0 + A * c
    par = dict(
        th=th, s=s, c=c,
        a_h=rad(ah), psi_h=rad(14 + 5 * up),
        a_u=rad(ah + 2 * s + 10 * flexE), psi_u=rad(-8 + 70 * flexE),
        a_m=rad(ah + 7 * s + 6 * flexW), psi_m=rad(14 + 62 * flexW),
        tau_h=rad(0), tau_u=rad(-6 * s), tau_m=rad(-12 * s + 6 * up),
        spread=0.30 + 0.70 * flexW ** 0.7,
        bend=s,      # 打ち下ろしで先が上へ、打ち上げで下へ
        heave=-0.022 * c,
        pitch=rad(2.4) * s,
    )
    return par


def bone_frames(par):
    """3 本の骨の座標（原点 O、軸 X・Y・Z）。右の翼"""
    def frame(a, psi, tau):
        d = np.array([math.cos(a) * math.cos(psi), -math.cos(a) * math.sin(psi), math.sin(a)])
        y0 = np.array([0.0, 1.0, 0.0])
        y0 = y0 - d * (y0 @ d)
        y0 /= np.linalg.norm(y0)
        z0 = np.cross(d, y0)
        y = math.cos(tau) * y0 + math.sin(tau) * z0
        z = -math.sin(tau) * y0 + math.cos(tau) * z0
        return d, y, z
    O, X, Y, Z = [], [], [], []
    o = SHOULDER.copy()
    for a, psi, tau, Lb in ((par["a_h"], par["psi_h"], par["tau_h"], L_HUM), (par["a_u"], par["psi_u"], par["tau_u"], L_ULN),
                            (par["a_m"], par["psi_m"], par["tau_m"], L_MAN)):
        d, y, z = frame(a, psi, tau)
        O.append(o.copy()); X.append(d); Y.append(y); Z.append(z)
        o = o + d * Lb
    return np.array(O), np.array(X), np.array(Y), np.array(Z)


def deform_wing(wf, phi, side=1, bank_asym=0.0):
    """右の翼（side=1）または左（−1：x を鏡に映す）の羽の点を、位相 phi の姿勢へ"""
    par = wing_params(phi, bank_asym)
    O, X, Y, Z = bone_frames(par)
    b = wf["bone"].astype(int)
    uv = wf["uv"]
    pf = wf["pts"]
    fan = wf["fan0"] + wf["ks"] * par["spread"]
    sn, cs = np.sin(fan), np.cos(fan)
    d_x, d_y = sn, -cs
    s_x, s_y = cs, sn
    xf, yf, zf = pf[:, 0], pf[:, 1], pf[:, 2]
    u = uv[:, 0]
    bend = par["bend"] * wf["bendk"] * wf["L"] * u * u * np.where(wf["flip"], -1.0, 1.0)
    # 先が体の向きにそってしなる：打ち下ろしで先が上へ、打ち上げで先が下へ（腹側の羽は同じ向きに）
    bend = par["bend"] * wf["bendk"] * wf["L"] * u * u
    px = wf["root"][:, 0] + xf * d_x + yf * s_x
    py = wf["root"][:, 1] + xf * d_y + yf * s_y
    pz = wf["root"][:, 2] + zf + bend
    W = O[b] + px[:, None] * X[b] + py[:, None] * Y[b] + pz[:, None] * Z[b]
    if side < 0:
        W = W * np.array([-1.0, 1.0, 1.0])
    return W, par


# ================================================================ 体・首・頭・くちばし・尾・足

def loft(rings, nseg=20, closed_ends=True):
    """輪の列（中心 c(3)・半径 rx・rz・向きは +Y の軸に直交する面内）から面を作る。rings: list of (cy, cz, rx, rz, y, extra)"""
    P = []
    for (y, cz, rx, rz, cx) in rings:
        for k in range(nseg):
            a = 2 * math.pi * k / nseg
            P.append((cx + rx * math.cos(a), y, cz + rz * math.sin(a)))
    P = np.array(P)
    F = []
    nr = len(rings)
    for i in range(nr - 1):
        for k in range(nseg):
            a = i * nseg + k
            b = i * nseg + (k + 1) % nseg
            F.append((a, b, b + nseg, a + nseg))
    # ふた（先端と後端）
    F2 = []
    if closed_ends:
        for end, rev in ((0, True), (nr - 1, False)):
            c = len(P)
            P = np.vstack([P, [rings[end][4], rings[end][0], rings[end][1]]])
            for k in range(nseg):
                a = end * nseg + k
                b = end * nseg + (k + 1) % nseg
                F2.append((c, b, a) if rev else (c, a, b))
    return P, F + F2


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def body_profile(y):
    """体の断面（中心の高さ cz・横の半径 rx・縦の半径 rz）。y＝前後（m）。尾の付け根（−0.36）から頭（0.95）まで"""
    y = np.asarray(y, float)
    # 胴：−0.36（尾）〜 0.30、首：0.30 〜 0.84、頭：0.84〜 0.96
    t_body = np.clip((y + 0.36) / 0.66, 0, 1)
    body = np.sqrt(np.clip(1 - (2 * t_body - 1.0 + 0.18) ** 2, 0, 1))        # 前寄りが太い
    body = np.where(t_body < 1, body, 0)
    rx_b = 0.135 * body ** 0.8
    rz_b = 0.125 * body ** 0.8
    cz_b = 0.060 + 0.0 * y
    # 首：太さ 0.045 → 0.026
    tn = np.clip((y - 0.20) / 0.64, 0, 1)
    neck_r = 0.052 - 0.026 * smoothstep(0, 1, tn) ** 0.8
    # 首は胴から先へ、いったん細くなる
    neck_cz = 0.075 + 0.020 * np.sin(np.pi * np.clip(tn, 0, 1)) - 0.012 * tn
    w = smoothstep(0.18, 0.36, y)
    rx = (1 - w) * rx_b + w * neck_r
    rz = (1 - w) * rz_b + w * neck_r
    cz = (1 - w) * cz_b + w * neck_cz
    # 頭：0.84 から頬が少しふくらみ、0.95 のくちばしの付け根へ向けて細くなる（前が平らな額から、くちばしへなだらかに続く）
    th = np.clip((y - 0.835) / 0.12, 0, 1)
    cheek = 0.009 * np.sin(np.pi * np.clip(th * 1.1, 0, 1)) ** 0.8 * (y > 0.83)
    taper = 1 - 0.40 * smoothstep(0.865, 0.945, y) ** 0.9
    rx = (rx + cheek) * taper
    rz = (rz + 0.8 * cheek) * (1 - 0.48 * smoothstep(0.865, 0.945, y) ** 0.9)
    return cz, rx, rz


def lofted_body(y0, y1, n, nseg, scale=1.0):
    ys = np.linspace(y0, y1, n)
    cz, rx, rz = body_profile(ys)
    rings = [(float(y), float(c), max(float(a), 1e-4), max(float(b), 1e-4), 0.0) for y, c, a, b in zip(ys, cz, rx, rz)]
    return loft(rings, nseg)


# ================================================================ Blender の材質

def build_materials():
    import bpy

    def sock(socks, name, typ=None):
        for x in socks:
            if x.name == name and (typ is None or x.type == typ):
                return x
        raise KeyError(name)

    def feather_mat(name, split_base, trans, white):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = "UVMap"
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(uvn.outputs["UV"], sep.inputs[0])
        u, vv = sep.outputs["X"], sep.outputs["Y"]
        a_rand = nt.nodes.new("ShaderNodeAttribute")
        a_rand.attribute_name = "feather_rand"
        a_len = nt.nodes.new("ShaderNodeAttribute")
        a_len.attribute_name = "feather_len"

        def mth(op, a, b=None, clamp=False):
            n = nt.nodes.new("ShaderNodeMath")
            n.operation = op
            n.use_clamp = clamp
            for i, x in enumerate((a, b)):
                if x is None:
                    continue
                if isinstance(x, (int, float)):
                    n.inputs[i].default_value = float(x)
                else:
                    nt.links.new(x, n.inputs[i])
            return n.outputs[0]

        rnd = a_rand.outputs["Fac"]
        ln = a_len.outputs["Fac"]
        dv = mth("ABSOLUTE", mth("SUBTRACT", mth("MULTIPLY", vv, 2.0), 1.0))
        # 羽枝の細い筋（斜め）。筋の数は羽の長さに比例（約 2.5mm ごと）
        nb = mth("MULTIPLY", ln, 420.0)
        barb = mth("ADD", mth("MULTIPLY", u, nb), mth("MULTIPLY", dv, mth("MULTIPLY", nb, -0.35)))
        barb = mth("ADD", barb, mth("MULTIPLY", rnd, 37.0))
        stripe = mth("MULTIPLY", mth("ADD", mth("SINE", mth("MULTIPLY", barb, 2 * math.pi)), 1.0), 0.5)
        noi = nt.nodes.new("ShaderNodeTexNoise")
        noi.inputs["Scale"].default_value = 1.0
        noi.inputs["Detail"].default_value = 3.0
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(mth("MULTIPLY", mth("MULTIPLY", u, ln), 22.0), comb.inputs[0])      # 約 4.5cm ごとに 1 区画（羽軸の向き）
        nt.links.new(mth("MULTIPLY", dv, 2.2), comb.inputs[1])
        nt.links.new(mth("MULTIPLY", rnd, 50.0), comb.inputs[2])
        nt.links.new(comb.outputs[0], noi.inputs["Vector"])
        # 羽枝の分かれ（すき間）：先とふちの近くだけ、細く
        near_tip = mth("MULTIPLY", mth("SUBTRACT", u, 0.6, clamp=False), 0.25)
        split = mth("MULTIPLY", mth("SUBTRACT", noi.outputs["Fac"], mth("SUBTRACT", split_base, mth("ADD", mth("MULTIPLY", dv, 0.10), mth("MAXIMUM", near_tip, 0.0)))), 14.0, clamp=True)
        noi2 = nt.nodes.new("ShaderNodeTexNoise")
        noi2.inputs["Scale"].default_value = 40.0
        nt.links.new(comb.outputs[0], noi2.inputs["Vector"])
        edge = mth("MULTIPLY", mth("SUBTRACT", mth("ADD", dv, mth("MULTIPLY", noi2.outputs["Fac"], 0.12)), 0.93), 30.0, clamp=True)
        hole = mth("MAXIMUM", split, edge)
        alpha = mth("SUBTRACT", 1.0, mth("MULTIPLY", hole, 0.92), clamp=True)
        shaft = mth("SUBTRACT", 1.0, mth("MULTIPLY", dv, 26.0), clamp=True)
        # 色：白（羽ごと・筋ごとに少し違う）。根元（u 小）は他の羽の下で少し暗い
        col = nt.nodes.new("ShaderNodeMix")
        col.data_type = "RGBA"
        sock(col.inputs, "A", "RGBA").default_value = (white * 0.80, white * 0.80, white * 0.79, 1.0)
        sock(col.inputs, "B", "RGBA").default_value = (white, white, white * 0.985, 1.0)
        fac = mth("ADD", mth("MULTIPLY", stripe, 0.4), mth("ADD", 0.45, mth("MULTIPLY", rnd, 0.15)))
        nt.links.new(fac, sock(col.inputs, "Factor", "VALUE"))
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(sock(col.outputs, "Result", "RGBA"), b.inputs["Base Color"])
        b.inputs["Sheen Weight"].default_value = 0.4
        b.inputs["Sheen Roughness"].default_value = 0.3
        b.inputs["Specular IOR Level"].default_value = 0.3
        nt.links.new(mth("SUBTRACT", 0.55, mth("MULTIPLY", shaft, 0.25)), b.inputs["Roughness"])
        tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
        tcol = nt.nodes.new("ShaderNodeMix")
        tcol.data_type = "RGBA"
        sock(tcol.inputs, "A", "RGBA").default_value = (0.97, 0.93, 0.86, 1.0)       # 羽の透け色：やや暖かい白
        sock(tcol.inputs, "B", "RGBA").default_value = (0.62, 0.50, 0.36, 1.0)      # 羽軸のまわりは濃い
        nt.links.new(mth("MULTIPLY", shaft, 0.9, clamp=True), sock(tcol.inputs, "Factor", "VALUE"))
        nt.links.new(sock(tcol.outputs, "Result", "RGBA"), tr.inputs["Color"])
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(mth("SUBTRACT", trans, mth("MULTIPLY", shaft, trans * 0.8)), mix.inputs[0])
        nt.links.new(b.outputs[0], mix.inputs[1])
        nt.links.new(tr.outputs[0], mix.inputs[2])
        tp = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix2 = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(alpha, mix2.inputs[0])
        nt.links.new(tp.outputs[0], mix2.inputs[1])
        nt.links.new(mix.outputs[0], mix2.inputs[2])
        nt.links.new(mix2.outputs[0], out.inputs["Surface"])
        return m

    def body_mat():
        m = bpy.data.materials.new("swan4_body")
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (0.80, 0.80, 0.79, 1.0)
        b.inputs["Roughness"].default_value = 0.62
        b.inputs["Sheen Weight"].default_value = 0.6
        b.inputs["Sheen Roughness"].default_value = 0.35
        b.inputs["Subsurface Weight"].default_value = 0.12
        b.inputs["Subsurface Radius"].default_value = (0.9, 0.6, 0.4)
        b.inputs["Subsurface Scale"].default_value = 0.008
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (260.0, 160.0, 260.0)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.feature = "F1"
        nt.links.new(mp.outputs["Vector"], vor.inputs["Vector"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.5
        bump.inputs["Distance"].default_value = 0.002
        nt.links.new(vor.outputs["Distance"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
        return m

    def plain(name, color, rough):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*color, 1.0)
        b.inputs["Roughness"].default_value = rough
        return m

    def bill_mat():
        """くちばし：点ごとの bill_yellow（黄の割合）で黄と黒を混ぜる。オオハクチョウは黄色のくさびが鼻孔より先まで、先は黒"""
        m = bpy.data.materials.new("swan4_bill")
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes.get("Principled BSDF")
        at = nt.nodes.new("ShaderNodeAttribute")
        at.attribute_name = "bill_yellow"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        sock(mix.inputs, "A", "RGBA").default_value = (0.012, 0.011, 0.010, 1.0)
        sock(mix.inputs, "B", "RGBA").default_value = (0.75, 0.50, 0.035, 1.0)
        nt.links.new(at.outputs["Fac"], sock(mix.inputs, "Factor", "VALUE"))
        nt.links.new(sock(mix.outputs, "Result", "RGBA"), b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.35
        return m

    mats = dict(
        feather=feather_mat("swan4_feather", 0.74, 0.50, 0.80),
        contour=feather_mat("swan4_contour", 0.88, 0.40, 0.82),
        body=body_mat(),
        black=plain("swan4_black", (0.012, 0.012, 0.012), 0.45),
        bill=bill_mat(),
        eye=plain("swan4_eye", (0.004, 0.003, 0.002), 0.1),
    )
    return mats


# ================================================================ Blender の物体にする

def mesh_from(name, P, F, mat=None, uv=None, attrs=None, smooth=False):
    import bpy
    me = bpy.data.meshes.new(name)
    P = np.asarray(P, np.float32)
    me.vertices.add(len(P))
    me.vertices.foreach_set("co", P.ravel())
    F = [tuple(int(i) for i in f) for f in F]
    nl = sum(len(f) for f in F)
    me.loops.add(nl)
    me.polygons.add(len(F))
    loop_vert = np.fromiter((i for f in F for i in f), np.int32, nl)
    me.loops.foreach_set("vertex_index", loop_vert)
    starts = np.cumsum([0] + [len(f) for f in F[:-1]]).astype(np.int32)
    me.polygons.foreach_set("loop_start", starts)
    me.polygons.foreach_set("loop_total", np.array([len(f) for f in F], np.int32))
    me.update(calc_edges=True)
    if uv is not None:
        uvl = me.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", np.asarray(uv, np.float32)[loop_vert].ravel())
    for k, v in (attrs or {}).items():
        at = me.attributes.new(k, "FLOAT", "POINT")
        at.data.foreach_set("value", np.asarray(v, np.float32))
    if mat is not None:
        me.materials.append(mat)
    if smooth:
        me.shade_smooth()
    return me


def surface_feathers(rng, n, y_range, scale, lod_keep=1.0, neck=False):
    """体（輪の列で作った面）の上へ、小さな羽を置く（式で面の位置と向きを出す）。返り値：点（羽の座標のまま）と体の座標への変換に使う根・向き"""
    pass


def contour_feathers(rng, lod):
    """体と首の上の小さな羽：体の面の式から位置・向き・面の傾きを出して、うろこのように置く。羽の先は後ろ、先ほど面から浮く"""
    n_body = {0: 2600, 1: 900, 2: 0}[lod]
    n_neck = {0: 1100, 1: 380, 2: 0}[lod]
    soups = []
    allp, allf = [], []
    base = 0
    uv0 = None

    def place(count, ya, yb, Lmean, wmean, resol):
        ys = rng.uniform(ya, yb, count)
        # 面積に比例（周の長さ）
        cz, rx, rz = body_profile(ys)
        keep = rng.random(count) < (rx + rz) / (np.max(rx + rz) + 1e-9)
        ys, cz, rx, rz = ys[keep], cz[keep], rx[keep], rz[keep]
        m = len(ys)
        ps = rng.uniform(0, 2 * np.pi, m)
        # 下面（腹）は白く平らなので、全周に置く
        nx, nz = np.cos(ps), np.sin(ps)
        root = np.stack([rx * nx, ys, cz + rz * nz], axis=1)
        # 面の法線（輪の傾きを含める）
        eps = 0.004
        cz2, rx2, rz2 = body_profile(ys + eps)
        drx, drz, dcz = (rx2 - rx) / eps, (rz2 - rz) / eps, (cz2 - cz) / eps
        t = np.stack([drx * nx, np.ones(m), dcz + drz * nz], axis=1)              # y が進む向きの接線
        n_out = np.stack([nx / np.maximum(rx, 1e-4), np.zeros(m), nz / np.maximum(rz, 1e-4)], axis=1)
        n_out /= np.linalg.norm(n_out, axis=1, keepdims=True)
        t -= n_out * np.sum(t * n_out, axis=1, keepdims=True)
        d = -t / np.linalg.norm(t, axis=1, keepdims=True)           # 羽の向き＝後ろ（面にそう）
        side = np.cross(n_out, d)
        L = Lmean * rng.uniform(0.8, 1.25, m)
        W = wmean * L * rng.uniform(0.85, 1.15, m)
        pts = feather_batch(resol[0], resol[1], L, W * 0.5, W * 0.5, np.full(m, 0.5), np.full(m, 0.02), np.full(m, 0.1), np.full(m, 2.2), droop=0.0)
        # 羽の座標 (x 先へ, y 幅, z 上) → 体。付け根は少し前。先ほど面から浮く
        x, y_, z_ = pts[..., 0], pts[..., 1], pts[..., 2]
        u = np.broadcast_to(np.linspace(0, 1, resol[0] + 1)[None, :, None], x.shape)
        lift = 0.0006 + 0.10 * L[:, None, None] * u ** 1.6
        P = (root[:, None, None, :] - d[:, None, None, :] * (L[:, None, None, None] * 0.35) + x[..., None] * d[:, None, None, :]
             + y_[..., None] * side[:, None, None, :] + (z_ + lift)[..., None] * n_out[:, None, None, :])
        return P.reshape(m, -1, 3), L

    for (cnt, ya, yb, Lm, wm, resol) in ((n_body, -0.34, 0.30, 0.058, 0.50, (6, 3)), (n_neck, 0.26, 0.82, 0.020, 0.50, (5, 3))):
        if cnt <= 0:
            continue
        P, L = place(cnt, ya, yb, Lm, wm, resol)
        soups.append((P, resol, L))
    return soups


def tail_feathers(rng, lod):
    """尾：短い丸いくさび。尾羽 18 枚と、その上を覆う短い羽"""
    k = np.arange(18)
    q = k / 17 * 2 - 1
    L = 0.185 - 0.03 * np.abs(q) + rng.normal(0, 0.002, 18)
    res = (10, 4) if lod == 0 else (6, 3)
    pts = feather_batch(res[0], res[1], L, np.full(18, 0.030), np.full(18, 0.040), np.full(18, 0.40), np.full(18, 0.04), np.full(18, 0.03), np.full(18, 2.6), droop=0.02)
    ang = np.radians(30 * q)
    d = np.stack([np.sin(ang), -np.cos(ang), np.zeros(18)], axis=1)
    side = np.stack([np.cos(ang), np.sin(ang), np.zeros(18)], axis=1)
    root = np.stack([0.025 * q, np.full(18, -0.33), 0.046 - 0.004 * np.abs(q) + 0.0008 * k], axis=1)
    x, y, z = pts[..., 0], pts[..., 1], pts[..., 2]
    P = root[:, None, None] + x[..., None] * d[:, None, None] + y[..., None] * side[:, None, None] + z[..., None] * np.array([0, 0, 1.0])
    return P.reshape(18, -1, 3), res, L


# ================================================================ 1 羽

class Bird:
    """1 羽：根（空の物体）・体・首（頭を安定させる支点つき）・左右の翼（毎コマ骨から計算した羽）・尾・足"""

    def __init__(self, name, seed, mats, lod=0, hz=FLAP_HZ):
        import bpy
        self.name, self.lod, self.mats = name, lod, mats
        self.rng = np.random.default_rng(seed)
        self.hz = hz
        sc = bpy.context.scene
        self.root = bpy.data.objects.new(name, None)
        sc.collection.objects.link(self.root)
        self.stats = {}
        # --- 翼
        t0 = time.time()
        self.wf = build_wing_feathers(self.rng, lod)
        self.wf["feather_len"] = self.wf["L"]
        self.wings = []
        W0, _ = deform_wing(self.wf, 0.5)
        for side in (1, -1):
            faces = self.wf["faces"] if side > 0 else self.wf["faces"][:, ::-1]
            me = mesh_from(f"{name}_wing{side}", W0 if side > 0 else W0 * np.array([-1, 1, 1.0]), faces, mats["feather"], self.wf["uv"],
                           {"feather_rand": self.wf["rand"], "feather_len": self.wf["L"]}, smooth=False)
            ob = bpy.data.objects.new(f"{name}_wing{side}", me)
            sc.collection.objects.link(ob)
            ob.parent = self.root
            self.wings.append((side, ob))
        # --- 体
        P, F = lofted_body(-0.36, 0.30, 36, 24)
        # 首と頭は別の物体（頭を安定させる）：y 0.24〜0.96
        self.body = bpy.data.objects.new(f"{name}_body", mesh_from(f"{name}_body", P, F, mats["body"], smooth=True))
        sc.collection.objects.link(self.body)
        self.body.parent = self.root
        Pn, Fn = lofted_body(0.22, 0.958, 64 if lod < 2 else 28, 16)
        self.neckpivot = bpy.data.objects.new(f"{name}_neckpivot", None)
        self.neckpivot.location = (0, 0.24, 0.08)
        sc.collection.objects.link(self.neckpivot)
        self.neckpivot.parent = self.root
        self.neck = bpy.data.objects.new(f"{name}_neck", mesh_from(f"{name}_neck", Pn - np.array([0, 0.24, 0.08]), Fn, mats["body"], smooth=True))
        sc.collection.objects.link(self.neck)
        self.neck.parent = self.neckpivot
        # くちばし（黄のくさびと黒の先）・目・こぶ
        self.bill = self._bill(mats)
        for ob in self.bill:
            ob.parent = self.neckpivot
        # --- 体と首の羽
        self.contour = []
        for i, (Pc, res, L) in enumerate(contour_feathers(self.rng, lod)):
            uv, faces = feather_topology(*res)
            m = Pc.shape[0]
            npt = Pc.shape[1]
            idx = ((np.arange(m) * npt)[:, None, None] + faces[None]).reshape(-1, 4)
            flat = Pc.reshape(-1, 3)
            neckpart = (i == 1)
            if neckpart:
                flat = flat - np.array([0, 0.24, 0.08])
            me = mesh_from(f"{name}_contour{i}", flat, idx, mats["contour"], np.tile(uv, (m, 1)),
                           {"feather_rand": np.repeat(self.rng.random(m), npt), "feather_len": np.repeat(L, npt)}, smooth=False)
            ob = bpy.data.objects.new(f"{name}_contour{i}", me)
            sc.collection.objects.link(ob)
            ob.parent = self.neckpivot if neckpart else self.root
            self.contour.append(ob)
        # --- 尾
        Pt, res, Lt = tail_feathers(self.rng, lod)
        uv, faces = feather_topology(*res)
        npt = Pt.shape[1]
        idx = ((np.arange(18) * npt)[:, None, None] + faces[None]).reshape(-1, 4)
        me = mesh_from(f"{name}_tail", Pt.reshape(-1, 3), idx, mats["feather"], np.tile(uv, (18, 1)),
                       {"feather_rand": np.repeat(self.rng.random(18), npt), "feather_len": np.repeat(Lt, npt)})
        ob = bpy.data.objects.new(f"{name}_tail", me)
        sc.collection.objects.link(ob)
        ob.parent = self.root
        self.tail = ob
        # --- 足：黒い脚と水かき。尾の下で後ろへたたむ（尾の先をわずかに越える）
        self.feet = self._feet(mats)
        for ob in self.feet:
            ob.parent = self.root
        self.stats["build_s"] = round(time.time() - t0, 2)

    def _bill(self, mats):
        import bpy
        sc = bpy.context.scene
        obs = []
        # 先端へ向かって細くなる、やや平らな断面。基部 y=0.945（頭）〜 先 1.058。黄は鼻孔（y≈0.99）より先（≈1.03）まで、上のふち寄りは黒
        n, nseg = 28, 14
        ys = np.linspace(0.930, 1.062, n)
        t = (ys - ys[0]) / (ys[-1] - ys[0])
        rx = 0.0185 * (1 - 0.30 * t) * (1 - 0.30 * t ** 3) + 0.003
        rz = 0.0150 * (1 - 0.60 * t) + 0.0035
        cz = float(body_profile(0.95)[0]) + 0.001 * np.sin(np.pi * t) + 0.0
        P, F = [], []
        yel, ang_all = [], []
        for i in range(n):
            for k in range(nseg):
                a = 2 * math.pi * k / nseg
                P.append((rx[i] * math.cos(a), ys[i], cz[i] + rz[i] * math.sin(a)))
                h = math.sin(a)                      # 上 +1、下 −1
                side = abs(math.cos(a))
                # 黄のくさび：側面の真ん中で最も前（t≈0.80）、上端・下端へ向かって後退（0.45）。ごく上の背筋は黒の細い線
                front = 0.26 + 0.44 * (1 - abs(h) ** 1.3)
                y_ = float(smoothstep(front + 0.02, front - 0.05, t[i]))
                if h > 0.93:
                    y_ *= 0.35
                yel.append(y_ * (0.4 + 0.6 * side))
                ang_all.append(a)
        for i in range(n - 1):
            for k in range(nseg):
                a = i * nseg + k
                b = i * nseg + (k + 1) % nseg
                F.append((a, b, b + nseg, a + nseg))
        P = np.array(P) - np.array([0, 0.24, 0.08])
        c = len(P)
        P = np.vstack([P, [0, ys[-1] - 0.24, cz[-1] - 0.08]])
        for k in range(nseg):
            a = (n - 1) * nseg + k
            b = (n - 1) * nseg + (k + 1) % nseg
            F.append((c, a, b))
        yel.append(0.0)
        ob = bpy.data.objects.new(f"{self.name}_bill", mesh_from(f"{self.name}_bill", P, F, mats["bill"], attrs={"bill_yellow": yel}, smooth=True))
        sc.collection.objects.link(ob)
        obs.append(ob)
        for sx in (1, -1):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0075, segments=12, ring_count=8, location=(0.0245 * sx, 0.905 - 0.24, float(body_profile(0.905)[0]) - 0.08 + 0.007))
            e = bpy.context.active_object
            e.data.materials.append(mats["eye"])
            e.data.shade_smooth()
            for c_ in list(e.users_collection):
                c_.objects.unlink(e)
            sc.collection.objects.link(e)
            obs.append(e)
        return obs

    def _feet(self, mats):
        import bpy
        sc = bpy.context.scene
        obs = []
        for sx in (1, -1):
            # 脚：腹の下から後ろへ、足首で折れて水かきが尾の下に平らに
            pts = [(0.035 * sx, -0.14, -0.045), (0.040 * sx, -0.26, -0.085), (0.036 * sx, -0.40, -0.060)]
            P, F = [], []
            nseg = 8
            rr = [0.011, 0.0075, 0.0065]
            ring_pts = []
            seg_pts = []
            for a, b, r0, r1 in ((pts[0], pts[1], rr[0], rr[1]), (pts[1], pts[2], rr[1], rr[2])):
                seg_pts.append((a, b, r0, r1))
            base = 0
            for (a, b, r0, r1) in seg_pts:
                a, b = np.array(a), np.array(b)
                ax = b - a
                ax /= np.linalg.norm(ax)
                u = np.cross(ax, [0, 0, 1.0])
                u /= np.linalg.norm(u)
                v = np.cross(ax, u)
                for rr_, p in ((r0, a), (r1, b)):
                    for k in range(nseg):
                        th = 2 * math.pi * k / nseg
                        P.append(p + rr_ * (math.cos(th) * u + math.sin(th) * v))
                for k in range(nseg):
                    A = base + k
                    B = base + (k + 1) % nseg
                    F.append((A, B, B + nseg, A + nseg))
                base += 2 * nseg
            ob = bpy.data.objects.new(f"{self.name}_leg{sx}", mesh_from(f"{self.name}_leg{sx}", P, F, mats["black"], smooth=True))
            sc.collection.objects.link(ob)
            obs.append(ob)
            # 水かき：3 本の指の間の膜（三角）。尾の先をわずかに越えて後ろへ
            ft = np.array([[0.036 * sx, -0.40, -0.060], [0.036 * sx + 0.045 * sx, -0.555, -0.062], [0.036 * sx, -0.585, -0.066], [0.036 * sx - 0.040 * sx, -0.55, -0.062]])
            Fq = [(0, 1, 2), (0, 2, 3)]
            Fq = Fq if sx > 0 else [f[::-1] for f in Fq]
            ob = bpy.data.objects.new(f"{self.name}_foot{sx}", mesh_from(f"{self.name}_foot{sx}", ft, Fq, mats["black"]))
            sc.collection.objects.link(ob)
            obs.append(ob)
        return obs

    # ---------------------------------------------------------- 姿勢
    def _set_wing_shapes(self, ob, side, poses, frames, bank_asym):
        """poses：[(コマ, 位相)]。1 つなら静止。3 つなら中央が基準で、前後のキーは 0→1 と 1→0 の線形で動かす"""
        me = ob.data
        pts = []
        for (_, ph) in poses:
            W, _ = deform_wing(self.wf, ph, side, bank_asym)
            pts.append(W)
        mid = pts[len(pts) // 2] if len(poses) == 3 else pts[0]
        me.vertices.foreach_set("co", mid.astype(np.float32).ravel())
        me.update()
        if len(poses) == 3:
            ob.shape_key_add(name="Basis")
            for nm, W in (("prev", pts[0]), ("next", pts[2])):
                k = ob.shape_key_add(name=nm)
                k.data.foreach_set("co", W.astype(np.float32).ravel())
            f0, f1, f2 = frames
            kb = ob.data.shape_keys.key_blocks
            for nm, vals in (("prev", (1, 0, 0)), ("next", (0, 0, 1))):
                for f, v in zip(frames, vals):
                    kb[nm].value = v
                    kb[nm].keyframe_insert("value", frame=f)
            for fc in ob.data.shape_keys.animation_data.action.fcurves if hasattr(ob.data.shape_keys.animation_data.action, "fcurves") else []:
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"

    def pose(self, states):
        """states：[(コマ, dict(pos, yaw, pitch, roll, phase))] 1 つ（静止）か 3 つ（前・今・後。モーションブラー用）。
        dict：pos（世界の位置）、yaw・pitch・roll（度。yaw は北から時計回りの向き）、phase（羽ばたきの位相 0〜1）、bank_asym"""
        import bpy
        frames = [s[0] for s in states]
        for side, ob in self.wings:
            self._set_wing_shapes(ob, side, [(f, st["phase"]) for f, st in states], frames, 0.0)
        for f, st in states:
            par = wing_params(st["phase"])
            self.root.location = tuple(st["pos"] + np.array([0, 0, par["heave"]]))
            # 向き：+Y が前。yaw は北から時計回り → Z 軸まわりの回転は −yaw
            self.root.rotation_mode = "ZXY"
            self.root.rotation_euler = (rad(st["pitch"]) + par["pitch"], rad(st["roll"]), -rad(st["yaw"]))
            # 頭と首：体の上下・縦揺れの 80% を打ち消す
            self.neckpivot.location = (0, 0.24, 0.08 - 0.8 * par["heave"])
            self.neckpivot.rotation_euler = (-0.8 * par["pitch"], 0, 0)
            for ob in (self.root, self.neckpivot):
                ob.keyframe_insert("location", frame=f)
                ob.keyframe_insert("rotation_euler", frame=f)
        if len(states) == 1:
            for ob in (self.root, self.neckpivot):
                if ob.animation_data:
                    ob.animation_data_clear()
        else:
            for ob in (self.root, self.neckpivot):
                act = ob.animation_data.action
                for fc in getattr(act, "fcurves", []):
                    for kp in fc.keyframe_points:
                        kp.interpolation = "LINEAR"

    def triangles(self):
        n = 0
        for ob in [self.body, self.neck, self.tail, *[w for _, w in self.wings], *self.contour, *self.bill, *self.feet]:
            if ob.type == "MESH":
                n += sum(len(p.vertices) - 2 for p in ob.data.polygons)
        return n


# ================================================================ 群れの動き（コマの純関数）

LOGO_FRAME = 595
N_BIRDS = 7


def flock_layout(n):
    """V 字：先頭（0）と左右の対。群れの座標（前 u・右 v・上 w）m。縦の間は翼幅の約 1.6 倍・横は約 1.15 倍（V 字・斜め列の観察値。notes/swans.md）。
    先頭の右に 3 羽・左に 3 羽。ずれ・高さの差は固定の乱数（コマによらない）"""
    sl, sw = 1.6 * SPAN * 0.85 * flock_param["ls"], 1.15 * SPAN * 0.85 * flock_param["vs"]
    rng = np.random.default_rng(77)
    pos = [(0.0, 0.0, 0.0)]
    for k in range(1, 4):
        for sgn in (1, -1):
            if len(pos) >= n:
                break
            pos.append((-k * sl + rng.normal(0, 0.45), sgn * k * sw + rng.normal(0, 0.35), rng.normal(0, 0.45) + 0.55 * k - 0.4))
    return np.array(pos[:n])


def smoothstep1(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def cam_frame(frames_json, f):
    c = frames_json[str(int(f))]
    hd = math.radians(c["heading_deg"])
    fwd = np.array([math.sin(hd), math.cos(hd), 0.0])
    right = np.array([math.cos(hd), -math.sin(hd), 0.0])
    return np.array(c["pos_world"]), fwd, right


T0 = 557 / FILM_FPS


def flock_state(frames_json, f, n=N_BIRDS, seed=1):
    """コマ f（小数も可）での 7 羽の状態。カメラの向き（コマ f のカメラ）を基準にした相対位置を世界へ。
    f がコマの整数でないときは、カメラは f の整数部（render するコマ）のものを使う（world から呼ぶ）。
    返り値：リスト dict(pos_rel(前・右・上)、yaw_rel（度。カメラの向きからの）、roll、pitch、phase)"""
    t = f / FILM_FPS
    lay = flock_layout(n)
    out = []
    # 先頭の前方距離：相対速度は 6.0 → 9.0 → 7.5 m/秒（カメラの減速・加速を含めた見かけの速さ）。積分は式で
    def lead_forward(tt):
        # 区間 t0..：v(t) = 6.0 + 3.0*smooth((t-t0)/1.6) − 1.5*smooth((t-t0-2.6)/3.5)
        # 積分は数値（細かい刻み）
        ts = np.linspace(T0, max(tt, T0), 400)
        v = flock_param["v0"] + (flock_param["v1"] - flock_param["v0"]) * np.array([smoothstep1(0, 2.2, x - T0) for x in ts]) - flock_param["vend"] * np.array([smoothstep1(0, 3.5, x - T0 - 2.6) for x in ts])
        return float(np.trapezoid(v, ts)) if len(ts) > 1 else 0.0
    F0 = flock_param["F0"]
    for i in range(n):
        rng = np.random.default_rng(1000 * seed + i)
        ph0 = rng.random()
        hz = FLAP_HZ * (1 + rng.uniform(-FLAP_SPREAD, FLAP_SPREAD))
        u, v, w = lay[i]
        # 群れの横の位置：ゆるやかに左（太陽の側）へ流れる。ゆれは鳥ごとにゆっくり
        lat = flock_param["V0"] - flock_param["dV"] * (t - T0) + 0.25 * math.sin(0.5 * t + i)
        fwd = F0 + lead_forward(t) + u
        up = flock_param["W0"] + w + 0.35 * math.sin(0.4 * t + 1.7 * i)
        right = lat + v
        # 向き：太陽（方位 115°）へ。カメラの向き（約 119°）との差を出す（コマごとのカメラの向きは world 側で足す）
        yaw = -3.5 + 0.8 * math.sin(0.3 * t + i)
        roll = 4.0 * math.sin(0.35 * t + 2 * i) - 1.2 * (v / 3.0)          # 外側の鳥ほどわずかに外へ傾く
        pitch = 1.5 + 1.0 * math.sin(0.5 * t + i)
        out.append(dict(rel=np.array([fwd, right, up]), yaw_rel=yaw, roll=roll, pitch=pitch, phase=(ph0 + hz * (t - T0)) % 1.0, hz=hz))
    return out


flock_param = dict(ls=0.9, vs=0.9, F0=33.0, V0=11.0, dV=1.0, W0=0.5, v0=8.5, v1=7.5, vend=0.0)


def world_state(frames_json, f_render, f, n=N_BIRDS, seed=1):
    """コマ f の鳥を、コマ f_render のカメラの座標へ置いたときの世界の位置・向き"""
    pos0, fwd, right = cam_frame(frames_json, f_render)
    hd = frames_json[str(int(f_render))]["heading_deg"]
    res = []
    for b in flock_state(frames_json, f, n, seed):
        rel = b["rel"]
        res.append(dict(pos=pos0 + fwd * rel[0] + right * rel[1] + np.array([0, 0, rel[2]]), yaw=hd + b["yaw_rel"], pitch=b["pitch"], roll=b["roll"],
                        phase=b["phase"], hz=b["hz"], rel=rel))
    return res


def project(frames_json, f, W, H, p):
    c = frames_json[str(int(f))]
    M = np.array(c["matrix"])
    cp = np.array(c["pos_world"])
    q = np.asarray(p) - cp
    cx, cy, cz = q @ M[:, 0], q @ M[:, 1], -(q @ M[:, 2])
    focal = c["lens_mm"] / 36.0 * W
    return W / 2 + cx / cz * focal, H / 2 - cy / cz * focal, cz


def lod_for(dist, lens, W):
    px = SPAN * (lens / 36.0 * W) / max(dist, 1.0)
    return 0 if px > 110 else 1 if px > 45 else 2


# ================================================================ world.py から呼ばれる

def add(world):
    import bpy
    t0 = time.time()
    opt = world.opt
    frames_json = json.load(open(os.path.join(HERE, "cameras.json")))["frames"]
    F = world.FRAME
    n = int(opt.get("swans_n", str(N_BIRDS)))
    seed = int(opt.get("swans_seed", "1"))
    debug = opt.get("swans_debug", "0") == "1"
    global FLAP_HZ
    FLAP_HZ = float(opt.get("swans_hz", str(FLAP_HZ)))
    if F < 557 or F > 719:
        world.log(f"swans4：コマ {F} は白鳥の出る範囲（557〜719）の外。何も置かない")
        return
    mblur = opt.get("mblur", "0") == "1"
    mats = build_materials()
    sc = world.scene
    sc.frame_set(F)
    states_now = world_state(frames_json, F, F, n, seed)
    tris = 0
    per = []
    for i, st in enumerate(states_now):
        dist = float(np.linalg.norm(st["rel"]))
        lod = int(opt.get("swans_lod", lod_for(dist, world.LENS, 3840)))
        bird = Bird(f"swan{i}", 7000 + 31 * i + seed, mats, lod=lod, hz=st["hz"])
        if mblur:
            sts = [(f, world_state(frames_json, F, f, n, seed)[i]) for f in (F - 1, F, F + 1)]
            bird.pose(sts)
        else:
            bird.pose([(F, st)])
        tt = bird.triangles()
        tris += tt
        per.append(dict(i=i, dist_m=round(dist, 1), lod=lod, tris=tt, build_s=bird.stats["build_s"]))
    if mblur:
        sc.render.use_motion_blur = True
        sc.render.motion_blur_shutter = float(opt.get("shutter", "0.5"))
        try:
            sc.cycles.motion_blur_position = "CENTER"
        except Exception:
            pass
    world.STATS["swans"] = dict(birds=per, triangles=tris, seconds=round(time.time() - t0, 1))
    world.log(f"swans4：{n} 羽・三角形 {tris}・{time.time() - t0:.1f} 秒")
    if debug:
        for p in per:
            world.log("  ", p)


# ================================================================ 試し描き（単体）

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return dict(a.split("=", 1) for a in argv if "=" in a)


def rig_scene(a, res, spp, sun_el=5.0, sun_az=0.0, ev=-1.4, deck=True, strength=1.0):
    """試し台：物理的な空（Nishita）・太陽（高さ 5°）・590m 下の明るい板・world.py と同じ見え方の変換と露出"""
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.radians(sun_el)
    sky.sun_rotation = math.radians(sun_az)
    sky.sun_disc = True
    nt.links.new(sky.outputs[0], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = strength
    if deck:
        bpy.ops.mesh.primitive_plane_add(size=40000, location=(0, 0, -590))
        pl = bpy.context.active_object
        m = bpy.data.materials.new("deck")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.80, 0.82, 0.86, 1.0)
        b.inputs["Roughness"].default_value = 1.0
        pl.data.materials.append(m)
    sc.render.engine = "CYCLES"
    sc.cycles.samples = spp
    sc.cycles.use_denoising = True
    sc.cycles.transparent_max_bounces = 32
    sc.cycles.max_bounces = 8
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    sc.view_settings.exposure = ev
    sc.render.threads_mode = "FIXED"
    sc.render.threads = int(a.get("threads", "2"))
    sc.render.image_settings.file_format = "PNG"
    return sc


def look_at(cam, pos, tgt):
    from mathutils import Vector
    d = Vector(tgt) - Vector(pos)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.location = tuple(pos)


def rig_main(a):
    import bpy
    rig = a.get("rig", "all")
    out = a.get("out", os.path.join(HERE, "review", "swans"))
    os.makedirs(out, exist_ok=True)
    res = tuple(int(v) for v in a.get("res", "1280x720").split("x"))
    spp = int(a.get("samples", "48"))
    views = {
        # 名前：(位相, カメラ位置の鳥から見た向き：方位（鳥の後ろ 0・右 90）・高さ角・距離 m, 鳥の向き（方位。太陽は 0 度の向き）, 太陽の向き)
        "side": dict(phase=0.22, cam_az=90, cam_el=8, dist=5.2, lens=60),
        "top34": dict(phase=0.72, cam_az=145, cam_el=38, dist=5.0, lens=60),
        "backlit": dict(phase=0.30, cam_az=200, cam_el=-14, dist=6.0, lens=60),
    }
    if rig == "custom":
        views["custom"] = dict(phase=float(a.get("phase", "0.22")), cam_az=float(a.get("az", "90")), cam_el=float(a.get("el", "8")), dist=float(a.get("dist", "5.2")), lens=float(a.get("lens", "60")))
    todo = list(views) if rig in ("all", "hero") else [rig] if rig in views else []
    for name in todo:
        v = views[name]
        sc = rig_scene(a, res, spp, sun_az=0.0)          # 太陽は +Y（北）の向き、高さ 5°。鳥は北（太陽の側）へ飛ぶ
        mats = build_materials()
        bird = Bird("hero", 5, mats, lod=0)
        bird.pose([(1, dict(pos=np.array([0, 0, 0.0]), yaw=0.0, pitch=0.0, roll=0.0, phase=v["phase"]))])
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        sc.collection.objects.link(cam)
        cam.data.lens = v["lens"]
        cam.data.clip_start = 0.1
        cam.data.clip_end = 50000
        az, el, d = math.radians(v["cam_az"]), math.radians(v["cam_el"]), v["dist"]
        # 鳥の後ろ（−Y）が方位 0：方位 az の向きにカメラを置く
        pos = np.array([d * math.sin(az) * math.cos(el), -d * math.cos(az) * math.cos(el), d * math.sin(el)])
        look_at(cam, pos + np.array([0, float(a.get('ty', '0.1')) - 0.1, 0]) * 0, (0, float(a.get('ty', '0.1')), 0.1))
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = d
        cam.data.dof.aperture_fstop = 11
        sc.camera = cam
        sc.render.filepath = os.path.join(out, f"_hero-{name}.png")
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"hero-{name}：{time.time() - t0:.0f} 秒・三角形 {bird.triangles()}", flush=True)
    if rig in ("cycle", "all"):
        for view in ("side", "front"):
            for k in range(8):
                sc = rig_scene(a, (640, 360), int(a.get("cspp", "24")), sun_az=0.0)
                mats = build_materials()
                bird = Bird("hero", 5, mats, lod=1)
                ph = k / 8
                bird.pose([(1, dict(pos=np.array([0, 0, 0.0]), yaw=0.0, pitch=0.0, roll=0.0, phase=ph))])
                cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
                sc.collection.objects.link(cam)
                cam.data.lens = 45
                cam.data.clip_end = 50000
                if view == "side":
                    look_at(cam, (5.2, 0.1, 0.3), (0, 0.1, 0.1))
                else:
                    look_at(cam, (0.0, 5.4, 0.6), (0, 0.0, 0.1))
                sc.camera = cam
                sc.render.filepath = os.path.join(out, f"_cycle-{view}-{k}.png")
                bpy.ops.render.render(write_still=True)
                print("cycle", view, k, flush=True)


def project_main(a):
    """描かずに、コマごとに 7 羽の距離・画面の位置・幅（px）・ロゴの場所（595 コマから、横の中央 3 分の 1 × 上の 3 分の 1）・太陽の円盤との重なりを調べる"""
    sys.path.insert(0, HERE)
    import config
    fj = json.load(open(os.path.join(HERE, "cameras.json")))["frames"]
    W, H = 3840, 2160
    az, el = math.radians(config.SUN_AZ), math.radians(config.SUN_EL)
    sun = np.array([math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)])
    for k in flock_param:
        if k in a:
            flock_param[k] = float(a[k])
    n = int(a.get("n", "7"))
    step = int(a.get("step", "6"))
    bad = []
    mind, maxd = 1e9, 0
    for f in range(557, 720):
        st = world_state(fj, f, f, n, 1)
        pos0 = np.array(fj[str(f)]["pos_world"])
        sx, sy, _ = project(fj, f, W, H, pos0 + sun * 1e5)
        focal = fj[str(f)]["lens_mm"] / 36.0 * W
        row = []
        for i, b in enumerate(st):
            d = float(np.linalg.norm(b["rel"]))
            yaw = math.radians(b["yaw"])
            rt = np.array([math.cos(yaw), -math.sin(yaw), 0.0])
            x, y, dep = project(fj, f, W, H, b["pos"])
            xa, ya, _ = project(fj, f, W, H, b["pos"] + rt * 1.2)
            xb, yb, _ = project(fj, f, W, H, b["pos"] - rt * 1.2)
            wpx = abs(xa - xb)
            half = max(wpx / 2, 0.3 * focal / dep)
            inlogo = (f >= LOGO_FRAME) and (W / 3 - half < x < 2 * W / 3 + half) and (y - 0.3 * focal / dep < H / 3)
            insun = math.hypot(x - sx, y - sy) < half * 0.6 + 0.0047 * focal
            inframe = (-half < x < W + half) and (-half < y < H + half)
            row.append((i, round(d, 1), int(x), int(y), int(wpx), inlogo, insun, inframe))
            if inlogo:
                bad.append((f, i, "logo", int(x), int(y)))
            if insun:
                bad.append((f, i, "sun", int(x), int(y)))
            if not inframe:
                bad.append((f, i, "out", int(x), int(y)))
            mind, maxd = min(mind, d), max(maxd, d)
        if (f - 557) % step == 0:
            print(f, "sun", int(sx), int(sy), "lens", round(fj[str(f)]["lens_mm"], 1), " ".join(f"[{r[0]} {r[1]}m {r[2]},{r[3]} {r[4]}px]" for r in row))
    print("distance range m", round(mind, 1), round(maxd, 1))
    from collections import Counter
    print(Counter((b[1]) for b in bad), "frames with logo/sun/out:", sorted(set((b[0], b[2]) for b in bad))[:60])


class _Shim:
    """動きの確かめ用：world.py の代わりに add() へ渡す入れもの"""
    def __init__(self, scene, opt, frame, lens, w):
        self.scene, self.opt, self.FRAME, self.LENS, self.W = scene, opt, frame, lens, w
        self.STATS = {}
    def log(self, *a):
        print(*a, flush=True)


def flight_main(a):
    """コマ f0〜f1 を、簡単な空と雲の面の上に描く（光の回数を少なく）。ロゴの場所を 595 コマから薄い四角で描く"""
    import bpy
    from mathutils import Matrix
    sys.path.insert(0, HERE)
    import config
    from PIL import Image, ImageDraw
    fj = json.load(open(os.path.join(HERE, "cameras.json")))["frames"]
    f0, f1 = (int(v) for v in a.get("frames", "557-719").split("-"))
    step = int(a.get("step", "1"))
    out = a.get("out", os.path.join(HERE, "review", "swans", "flightframes"))
    os.makedirs(out, exist_ok=True)
    res = tuple(int(v) for v in a.get("res", "640x360").split("x"))
    for f in range(f0, f1 + 1, step):
        png = os.path.join(out, f"{f:04d}.png")
        if os.path.exists(png) and a.get("redo", "0") != "1":
            continue
        t0 = time.time()
        c = fj[str(f)]
        sc = rig_scene(a, res, int(a.get("samples", "8")), sun_el=config.SUN_EL, sun_az=config.SUN_AZ, ev=-1.4, deck=False)
        # 雲の面：高さ 1650m（丸みで少し下げる）の大きな板。世界の座標
        bpy.ops.mesh.primitive_plane_add(size=60000, location=(c["pos_world"][0], c["pos_world"][1], 1650.0))
        pl = bpy.context.active_object
        m = bpy.data.materials.new("deck")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.80, 0.82, 0.86, 1.0)
        b.inputs["Roughness"].default_value = 1.0
        pl.data.materials.append(m)
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        sc.collection.objects.link(cam)
        cam.data.lens = c["lens_mm"]
        cam.data.sensor_width = 36.0
        cam.data.sensor_fit = "HORIZONTAL"
        cam.data.clip_start = 1.0
        cam.data.clip_end = 600000.0
        M = np.array(c["matrix"])
        cam.matrix_world = Matrix([[M[0, 0], M[0, 1], M[0, 2], c["pos_world"][0]], [M[1, 0], M[1, 1], M[1, 2], c["pos_world"][1]],
                                   [M[2, 0], M[2, 1], M[2, 2], c["pos_world"][2]], [0, 0, 0, 1]])
        sc.camera = cam
        opt = dict(mblur=a.get("mblur", "1"), swans_n=a.get("n", "7"), swans_seed=a.get("seed", "1"))
        add(_Shim(sc, opt, f, c["lens_mm"], res[0]))
        sc.render.filepath = png
        bpy.ops.render.render(write_still=True)
        if f >= LOGO_FRAME:
            im = Image.open(png).convert("RGB")
            ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(ov)
            sx = res[0] / 3840.0
            d.rectangle([1280 * sx, 0, 2560 * sx, 720 * sx], outline=(255, 90, 60, 150), width=1, fill=(255, 90, 60, 28))
            im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
            im.save(png)
        print(f"コマ {f}：{time.time() - t0:.1f} 秒", flush=True)


if __name__ == "__main__":
    a = parse_args()
    if a.get("rig"):
        if a["rig"] == "project":
            project_main(a)
        elif a["rig"] == "flight":
            flight_main(a)
        else:
            rig_main(a)
