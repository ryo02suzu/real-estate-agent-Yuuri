"""PC のオープニング CG：雲海の上を、朝日へ向かって飛ぶ白鳥（7羽）を描く（背景は透明。atmos.py で重ねる）。

  python swans.py [--frames 363-499:3] [--res 1920x1080] [--spp 32] [--out work/film/swans]
  python swans.py --look     # 形を確かめる（白鳥 1 羽を近くから。羽ばたきの 4 つの姿勢）

python は bpy（Blender 5.3）を入れたもの。本物に合わせる：安曇野で冬を越すコハクチョウ・オオハクチョウの大きさ
（翼を広げて約 2.2m、くちばしから尾まで約 1.3m）、まっすぐ前へのばした首、黒と黄色のくちばし。
優雅に見せるため、本物（約 16 m/秒・羽ばたき 1 秒に約 2.5 回）の約 0.7 倍のゆっくりにする（スローモーションのように）。
V 字の群れが、カメラがほとんど止まってから右の近く（約 33m）から入り、朝日の中へ遠ざかる（約 88m）。
朝日の側から見るので、羽のふちが透けて光る。
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import film as F  # noqa: E402
import path as P  # noqa: E402

WORK = F.WORK
FLAP_HZ = 1.75  # 本物の約 0.7 倍（ゆっくり、大きく）
SPEED_JITTER = 0.04  # 1 羽ごとに羽ばたきの速さを少し変える（そろいすぎない）
HALF_SPAN = 1.12  # 体の真ん中から翼の先まで（m）
POSES = 24  # 羽ばたき 1 回を、いくつの姿勢で表すか


# ---------------------------------------------------------------- 形


def feather_material() -> bpy.types.Material:
    """白い羽：やわらかいつや、薄い所は朝日が透ける"""
    m, nt, b = F.material("feather")
    b.inputs["Base Color"].default_value = (0.80, 0.80, 0.78, 1.0)
    b.inputs["Roughness"].default_value = 0.62
    b.inputs["Sheen Weight"].default_value = 0.6
    b.inputs["Sheen Roughness"].default_value = 0.35
    b.inputs["Subsurface Weight"].default_value = 0.2
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.9, 0.8)
    b.inputs["Subsurface Scale"].default_value = 0.02
    out = nt.nodes["Material Output"]
    tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
    tr.inputs["Color"].default_value = (0.9, 0.82, 0.68, 1.0)
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.22
    F.link(nt, b.outputs[0], mix.inputs[1])
    F.link(nt, tr.outputs[0], mix.inputs[2])
    F.link(nt, mix.outputs[0], out.inputs["Surface"])
    return m


def plain_material(name: str, color, rough: float = 0.4) -> bpy.types.Material:
    m, nt, b = F.material(name)
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def metaball_mesh(name: str, balls: list[tuple], mat) -> bpy.types.Mesh:
    """丸の集まり（メタボール）から、なめらかな体の形を作って、メッシュにする"""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = 0.02
    mb.render_resolution = 0.02
    for (x, y, z), (sx, sy, sz), r in balls:
        e = mb.elements.new(type="ELLIPSOID")
        e.co = (x, y, z)
        e.radius = r
        e.size_x, e.size_y, e.size_z = sx, sy, sz
        e.stiffness = 2.0
    ob = bpy.data.objects.new(name + "_mb", mb)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    me.materials.append(mat)
    me.shade_smooth()
    return me


def body_mesh(feather) -> bpy.types.Mesh:
    """体・首・頭・尾（前が +Y、上が +Z）。胴は長い卵形、首は付け根が太く、頭は額から嘴へなだらか、尾は短いくさび形"""
    balls = [
        ((0.0, 0.0, 0.0), (0.19, 0.42, 0.15), 1.0),  # 胴（白鳥はがっしりしている）
        ((0.0, 0.25, 0.01), (0.155, 0.2, 0.135), 1.0),  # 胸
        ((0.0, -0.34, 0.025), (0.13, 0.18, 0.06), 1.0),  # 尾のつけ根（平たい。胴とつながる）
        ((0.0, -0.45, 0.03), (0.085, 0.11, 0.032), 1.0),  # 尾（短いくさび）
    ]
    # 首：胸から前へまっすぐのばす（付け根は太く、少し上がってから水平に）。丸を細かく重ねて、なめらかに
    for i in range(34):
        u = i / 33.0
        y = 0.36 + 0.62 * u
        z = 0.055 + 0.03 * math.sin(math.pi * u * 0.8) - 0.035 * u * u
        r = 0.085 - 0.043 * u**0.8
        balls.append(((0.0, y, z), (r, r * 1.5, r * 1.05), 1.0))
    balls.append(((0.0, 1.035, 0.0), (0.05, 0.078, 0.05), 1.0))  # 頭
    balls.append(((0.0, 1.085, -0.012), (0.034, 0.05, 0.03), 1.0))  # 額から嘴へ
    return metaball_mesh("swan_body", balls, feather)


def cone_mesh(name: str, base: tuple, tip: tuple, r0: float, r1: float, mat, n: int = 12) -> bpy.types.Mesh:
    """くちばしなど：base から tip へ細くなる円すい（少し平たい）"""
    b, t = np.array(base, float), np.array(tip, float)
    ax = t - b
    ax /= np.linalg.norm(ax)
    side = np.cross(ax, [0, 0, 1.0])
    side /= np.linalg.norm(side)
    up = np.cross(side, ax)
    co = []
    for k, (c, r) in enumerate(((b, r0), (t, r1))):
        for i in range(n):
            a = 2 * math.pi * i / n
            co.append(c + side * r * math.cos(a) + up * r * 0.55 * math.sin(a))
    co.append(b)
    co.append(t)
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces += [(2 * n, (i + 1) % n, i) for i in range(n)]
    faces += [(2 * n + 1, n + i, n + (i + 1) % n) for i in range(n)]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in co], [], faces)
    me.update()
    me.materials.append(mat)
    return me


WRIST = 0.6  # 翼の根元から手首まで（m）。ここから先が手（初列風切）
WING_LEN = 1.0  # 翼の根元（体のふち x=0.12）から先まで


def wing_geometry() -> tuple[np.ndarray, np.ndarray, list]:
    """翼の形（広げた姿勢・右の翼）。点（x：根元から先へ、y：前へ、z：上へ。m）、点ごとの骨の上の位置（x）、面。
    内側（腕〜手首の先）は前のふちが厚く丸い 1 枚、手の先は初列風切 6 枚を指のように分ける"""
    verts, station, faces = [], [], []

    def add(p, st):
        verts.append(p)
        station.append(st)
        return len(verts) - 1

    # 内側の翼：上の面と下の面（前のふちで閉じる）。後ろのふちは次列風切の先が小さく波打つ
    ns, nv, x_in = 30, 9, 0.74
    xs = np.linspace(0.0, x_in, ns)
    vs = np.linspace(0.0, 1.0, nv) ** 1.3  # 前のふちの近くを細かく
    top, bot = np.zeros((ns, nv), int), np.zeros((ns, nv), int)
    for i, x in enumerate(xs):
        q = x / x_in
        y_le = 0.17 - 0.06 * q * q
        chord = 0.42 - 0.13 * q
        th = 0.046 * (1.0 - 0.55 * q)
        for j, v in enumerate(vs):
            y = y_le - chord * v
            if v > 0.85:
                y -= 0.014 * abs(math.sin(x * math.pi * 15.0)) * (v - 0.85) / 0.15 * (q < 0.9)
            camber = 0.028 * math.sin(math.pi * v) * chord / 0.42
            t = th * (1.0 - v) ** 1.5
            top[i, j] = add((x, y, camber + t), x)
            bot[i, j] = add((x, y - 0.004 * (1 - v), camber - 0.35 * t), x)
    for i in range(ns - 1):
        for j in range(nv - 1):
            faces.append((top[i, j], top[i + 1, j], top[i + 1, j + 1], top[i, j + 1]))
            faces.append((bot[i, j], bot[i, j + 1], bot[i + 1, j + 1], bot[i + 1, j]))
        faces.append((bot[i, 0], bot[i + 1, 0], top[i + 1, 0], top[i, 0]))  # 前のふち
    # 手の先：初列風切 6 枚（外ほど長く、ほぼ横向き。内ほど少し後ろへ開く）。白鳥は羽が詰まっていて、
    # 先の方だけ少し分かれて見える。根元は内側の翼の下に隠れる
    for k in range(6):
        bx, by = 0.70 - 0.022 * k, 0.11 - 0.034 * k
        ang = math.radians(2.0 + 4.2 * k)
        length = 0.34 - 0.016 * k
        ux, uy = math.cos(ang), -math.sin(ang)
        px_, py_ = -uy, ux  # 羽の幅の向き（前へ）
        nseg = 8
        row = []
        for m in range(nseg + 1):
            u = m / nseg
            w = (0.078 - 0.04 * u) * (1.0 - u**6) ** 0.5 + 0.004  # 先は丸く細る（根元は重なり、先で分かれる）
            cx, cy = bx + ux * length * u, by + uy * length * u
            z = 0.012 * math.sin(math.pi * u) - 0.004 * k  # 少し上へ反る。内の羽ほど下
            st = cx
            a_ = add((cx + px_ * w * 0.35, cy + py_ * w * 0.35, z + 0.002), st)  # 前の羽弁（細い）
            b_ = add((cx, cy, z + 0.004), st)  # 羽軸
            c_ = add((cx - px_ * w * 0.65, cy - py_ * w * 0.65, z), st)  # 後ろの羽弁（広い）
            row.append((a_, b_, c_))
        for m in range(nseg):
            a0, b0, c0 = row[m]
            a1, b1, c1 = row[m + 1]
            faces.append((a0, a1, b1, b0))
            faces.append((b0, b1, c1, c0))
    return np.array(verts, float), np.array(station, float), faces


def wing_pose(verts: np.ndarray, station: np.ndarray, phi: float, side: int) -> np.ndarray:
    """羽ばたきの位相 phi（0 で一番上、π で一番下）の、翼の点の位置（体の座標。side は右 +1・左 −1）。
    - 上下：肩・ひじ・手首の角度を、先ほど遅れて動かす（むちのように）。ゆっくり大きく打つ（上 32°〜下 −24°）
    - 打ち上げ（π〜2π）では手首から先を後ろへたたみ、打ち下ろしでいっぱいに広げる。羽の指は打ち下ろしで少し開く"""
    sh = math.radians(4.0 + 28.0 * math.cos(phi))
    el = math.radians(10.0 * math.cos(phi - 0.7))
    wr = math.radians(14.0 * math.cos(phi - 1.3))
    fold = math.radians(20.0) * max(0.0, -math.sin(phi)) ** 1.2
    p = verts.copy()
    # 手首から先を、手首のまわりに後ろへ回す（翼の面の中で）
    hand = smooth(WRIST - 0.08, WRIST + 0.06, station)
    wx, wy = WRIST, 0.17 - 0.06 * (WRIST / 0.74) ** 2
    ca, sa = math.cos(fold), math.sin(fold)
    dx, dy = p[:, 0] - wx, p[:, 1] - wy
    rx, ry = wx + dx * ca + dy * sa, wy - dx * sa + dy * ca
    p[:, 0] = p[:, 0] * (1 - hand) + rx * hand
    p[:, 1] = p[:, 1] * (1 - hand) + ry * hand
    # 骨の上の位置ごとの、上がる角度（根元から先へ曲がる 1 本の骨）
    n = 240
    L = np.linspace(0.0, 1.15, n)
    x = L / WING_LEN
    ang = sh + el * smooth(0.28, 0.45, x) + wr * smooth(0.62, 0.78, x)
    step = L[1] - L[0]
    X = np.concatenate([[0.0], np.cumsum(np.cos(ang) * step)[:-1]])
    Zc = np.concatenate([[0.0], np.cumsum(np.sin(ang) * step)[:-1]])
    li = np.clip(p[:, 0], 0.0, 1.15) / step
    xs = np.interp(li, np.arange(n), X)
    zs = np.interp(li, np.arange(n), Zc)
    a_s = np.interp(li, np.arange(n), ang)
    out = np.stack([0.12 + xs - p[:, 2] * np.sin(a_s), p[:, 1], 0.05 + zs + p[:, 2] * np.cos(a_s)], -1)
    out[:, 0] *= side
    return out


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def make_swan(name: str, mats: dict, phase0: float) -> dict:
    """白鳥 1 羽（親の空のオブジェクトと、翼 2 枚の形のキー）"""
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    parts = []
    body = bpy.data.objects.new(name + "_body", mats["body_mesh"])
    parts.append(body)
    bill = bpy.data.objects.new(name + "_bill", mats["bill_mesh"])
    parts.append(bill)
    knob = bpy.data.objects.new(name + "_knob", mats["knob_mesh"])
    parts.append(knob)
    wings = []
    verts, station, faces0 = wing_geometry()
    for side in (1, -1):
        faces = faces0 if side > 0 else [tuple(reversed(fc)) for fc in faces0]
        me = bpy.data.meshes.new(f"{name}_wing{side}")
        rest = wing_pose(verts, station, 0.0, side)
        me.from_pydata([tuple(p) for p in rest], [], [tuple(int(k) for k in fc) for fc in faces])
        me.update()
        me.materials.append(mats["feather"])
        me.shade_smooth()
        ob = bpy.data.objects.new(f"{name}_wing{side}", me)
        ob.shape_key_add(name="Basis")
        for k in range(POSES):
            key = ob.shape_key_add(name=f"p{k}")
            co = wing_pose(verts, station, 2 * math.pi * k / POSES, side)
            key.data.foreach_set("co", co.astype(np.float32).ravel())
        parts.append(ob)
        wings.append(ob)
    for ob in parts:
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = root
    return dict(root=root, wings=wings, phase0=phase0, body=body)


def build_swans(n: int = 7) -> list[dict]:
    feather = feather_material()
    black = plain_material("bill_black", (0.012, 0.012, 0.012), 0.3)
    yellow = plain_material("bill_yellow", (0.75, 0.55, 0.04), 0.35)
    mats = dict(feather=feather)
    mats["body_mesh"] = body_mesh(feather)
    # くちばし：黒（先）と、つけ根の黄色
    mats["bill_mesh"] = cone_mesh("bill", (0.0, 1.11, -0.012), (0.0, 1.21, -0.03), 0.026, 0.011, black)
    mats["knob_mesh"] = cone_mesh("knob", (0.0, 1.085, -0.006), (0.0, 1.135, -0.016), 0.03, 0.022, yellow)
    rng = np.random.default_rng(5)
    out = []
    for i in range(n):
        sw = make_swan(f"swan{i}", mats, float(rng.uniform(0, 2 * math.pi)))
        sw["hz"] = 1.0 + SPEED_JITTER * float(rng.uniform(-1.0, 1.0))
        out.append(sw)
    return out


# ---------------------------------------------------------------- 動き


def flock_offsets(n: int) -> np.ndarray:
    """群れの並び（先頭の白鳥からのずれ：前・右・上 m）。V 字（先頭のうしろに左右へ 3 羽ずつ。少し不ぞろい）"""
    rng = np.random.default_rng(9)
    out = [(0.0, 0.0, 0.0)]
    for i in range(1, n):
        k = (i + 1) // 2
        side = 1.0 if i % 2 else -1.0
        out.append((-2.7 * k + rng.uniform(-0.35, 0.35), side * (2.25 * k + rng.uniform(-0.25, 0.25)), rng.uniform(-0.3, 0.3) - 0.12 * k))
    return np.array(out)


def ease(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def lead_relative(t: float) -> np.ndarray:
    """先頭の白鳥の、カメラから見た位置（右・上・前 m）。画面の右のふち（約 33m）から入り、朝日の中（約 88m）へ。
    画面の上を一定の速さ（約 300px/秒）で渡り、遠ざかるほど小さくなる（近い所で横切ると画面の上で速く見えるので、
    見える向きの角度を時間に比例させ、距離は等比でのばす）"""
    t0, t1 = P.SWANS
    u = min(1.0, max(0.0, (t - t0) / (t1 - t0)))
    c = P.camera("local", int(round((t0 + t1) / 2 * P.FPS)))
    sun = P.sun_dir("local")
    sv = np.array([sun @ c["right"], sun @ c["up"], sun @ c["fwd"]])
    ax0, ay0 = math.radians(30.0), math.radians(4.0)  # 地平線と遠くの山より上（空を背に）
    ax1 = math.atan2(sv[0], sv[2]) - math.radians(0.5)  # 先頭は朝日の真ん中を少し越える（群れが朝日に重なって消える）
    ay1 = math.atan2(sv[1], sv[2])
    ax = ax0 + (ax1 - ax0) * u
    ay = ay0 + (ay1 - ay0) * u
    r = 33.0 * (88.0 / 33.0) ** u
    d = np.array([math.tan(ax), math.tan(ay), 1.0])
    return d / np.linalg.norm(d) * r


def place(swans: list[dict], frames: list[int]) -> None:
    """コマごとに、白鳥の位置・向き・羽ばたき（形のキー）を入れる（前後のコマにも。動きのぶれのため）"""
    offs = flock_offsets(len(swans))
    keys = sorted({k for f in frames for k in (f - 1, f, f + 1)})
    for f in keys:
        t = f / P.FPS
        c = P.camera("local", f)
        axes = np.array([c["right"], c["up"], c["fwd"]])  # 行：カメラの右・上・前（場面の座標）
        rel = lead_relative(t)
        # 進む向き：道筋の終わり（朝日に着いた所）では止まるので、終わりの少し手前の向きを使う（0 で割らない）
        ta = min(t, P.SWANS[1] - 0.06)
        vel = (lead_relative(ta + 0.05) - lead_relative(ta)) / 0.05
        fwd_c = vel / max(np.linalg.norm(vel), 1e-6)  # 進む向き（カメラの座標）
        fwd_w = fwd_c @ axes
        fwd_w /= np.linalg.norm(fwd_w)
        up_w = np.array([0.0, 0.0, 1.0])
        right_w = np.cross(fwd_w, up_w)
        right_w /= np.linalg.norm(right_w)
        up_w = np.cross(right_w, fwd_w)
        rot = Matrix([right_w.tolist(), fwd_w.tolist(), up_w.tolist()]).transposed()  # 体の +Y を進む向きへ
        for i, sw in enumerate(swans):
            o = offs[i]
            phi = 2 * math.pi * FLAP_HZ * sw["hz"] * t + sw["phase0"]
            bob = -0.07 * math.cos(phi + 0.4)
            pos = c["pos"] + rel @ axes + fwd_w * o[0] + right_w * o[1] + up_w * (o[2] + bob)
            sw["root"].matrix_world = Matrix.Translation(Vector(pos.tolist())) @ rot.to_4x4()
            sw["root"].keyframe_insert("location", frame=f)
            sw["root"].keyframe_insert("rotation_euler", frame=f)
            # 羽ばたき：となりの 2 つの姿勢を混ぜる
            x = (phi % (2 * math.pi)) / (2 * math.pi) * POSES
            k0 = int(x) % POSES
            k1 = (k0 + 1) % POSES
            w1 = x - int(x)
            for wing in sw["wings"]:
                kb = wing.data.shape_keys.key_blocks
                for k in range(POSES):
                    kb[f"p{k}"].value = (1 - w1) if k == k0 else (w1 if k == k1 else 0.0)
                    kb[f"p{k}"].keyframe_insert("value", frame=f)


# ---------------------------------------------------------------- 描く


def setup(res, spp: int) -> None:
    F.setup_render(res, spp, 0.3)
    sc = bpy.context.scene
    sc.render.film_transparent = True
    sc.cycles.use_adaptive_sampling = True
    F.sky_world("local", disc=False)
    sun = F.sun_lamp(P.sun_dir("local"), 14.0)
    sun.data.color = F.sun_color(P.SUN_EL)
    # 下の雲海の照り返し（カメラには映らない白い板）
    me = bpy.data.meshes.new("cloud_bounce")
    x, y = P.local_state(P.ROUTE_END)[:2]
    r = 40000.0
    me.from_pydata([(x - r, y - r, 1650.0), (x + r, y - r, 1650.0), (x + r, y + r, 1650.0), (x - r, y + r, 1650.0)], [], [(0, 1, 2, 3)])
    me.materials.append(plain_material("bounce", (0.85, 0.86, 0.88), 1.0))
    ob = bpy.data.objects.new("cloud_bounce", me)
    sc.collection.objects.link(ob)
    ob.visible_camera = False


def look(out: str) -> None:
    """形を確かめる：白鳥 1 羽を、横・斜め後ろから、羽ばたきの 4 つの姿勢で"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sw = build_swans(1)[0]
    F.setup_render((960, 540), 32, 0.0)
    sc = bpy.context.scene
    sc.render.use_motion_blur = False
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.25, 0.32, 0.45, 1.0)
    sun = F.sun_lamp(np.array([-0.6, 0.7, 0.4]), 4.0)
    sun.data.color = (1.0, 0.8, 0.6)
    cam = bpy.data.cameras.new("c")
    cam.lens = 50
    co = bpy.data.objects.new("c", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.film_transparent = False
    os.makedirs(out, exist_ok=True)
    for k, (view, phase) in enumerate(((0, 0.0), (0, math.pi / 2), (1, math.pi), (1, 3 * math.pi / 2))):
        for wing in sw["wings"]:
            kb = wing.data.shape_keys.key_blocks
            x = phase / (2 * math.pi) * POSES
            for j in range(POSES):
                kb[f"p{j}"].value = 1.0 if j == int(x) % POSES else 0.0
        if view == 0:
            eye, target = Vector((4.2, 0.6, 0.9)), Vector((0.0, 0.3, 0.1))
        else:
            eye, target = Vector((2.6, -3.0, 1.6)), Vector((0.0, 0.3, 0.1))
        co.location = eye
        co.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(out, f"look{k}.png")
        sc.render.image_settings.media_type = "IMAGE"
        sc.render.image_settings.file_format = "PNG"
        sc.view_settings.view_transform = "AgX"
        bpy.ops.render.render(write_still=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default="")
    ap.add_argument("--res", default="1920x1080")
    ap.add_argument("--spp", type=int, default=32)
    ap.add_argument("--out", default=os.path.join(WORK, "film", "swans"))
    ap.add_argument("--look", action="store_true")
    a = ap.parse_args()
    if a.look:
        look(a.out)
        return
    t0, t1 = P.SWANS
    frames = list(range(int(math.floor(t0 * P.FPS)), int(math.ceil(t1 * P.FPS)) + 1))
    if a.frames:  # 「363-498」「363-498:3」（3 コマおき。流れを先に見る）
        rng, _, step = a.frames.partition(":")
        lo, _, hi = rng.partition("-")
        frames = [f for f in frames if int(lo) <= f <= int(hi or lo)][:: int(step or 1)]
    os.makedirs(a.out, exist_ok=True)
    todo = [f for f in frames if not os.path.exists(os.path.join(a.out, f"{f:04d}.exr"))]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    swans = build_swans(7)
    setup(tuple(int(v) for v in a.res.split("x")), a.spp)
    F.camera_object("local", todo)
    place(swans, todo)
    sc = bpy.context.scene
    for f in todo:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(a.out, f"{f:04d}.exr")
        bpy.ops.render.render(write_still=True)
        print(f"白鳥 コマ {f}", flush=True)


if __name__ == "__main__":
    main()
