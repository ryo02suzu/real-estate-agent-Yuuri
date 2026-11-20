"""PC のオープニング CG：雲海の上を、朝日へ向かって飛ぶ白鳥（7羽）を描く（背景は透明。atmos.py で重ねる）。

  python swans.py [--frames 309-369] [--res 1920x1080] [--spp 32] [--out work/film/swans]
  python swans.py --look     # 形を確かめる（白鳥 1 羽を近くから。羽ばたきの 4 つの姿勢）

python は bpy（Blender 5.3）を入れたもの。本物に合わせる：安曇野で冬を越すコハクチョウ・オオハクチョウの大きさ
（翼を広げて約 2.2m、くちばしから尾まで約 1.3m）、まっすぐ前へのばした首、黒と黄色のくちばし、羽ばたきは 1 秒に約 2.4 回。
朝日の側から見るので、羽のふちが透けて光る。カメラ（path.py）とほぼ一緒に進みながら、右から入って、朝日の中へ遠ざかる。
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
FLAP_HZ = 2.4
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
    """体・首・頭・尾（前が +Y、上が +Z）"""
    balls = [
        ((0.0, 0.0, 0.0), (0.2, 0.4, 0.155), 1.0),  # 胴（白鳥はがっしりしている）
        ((0.0, 0.24, 0.015), (0.16, 0.2, 0.14), 1.0),  # 胸
        ((0.0, -0.38, 0.03), (0.1, 0.2, 0.07), 1.0),  # 尾のつけ根
    ]
    # 首：胸から前へ、少し下がりながら細くなる（丸を細かく重ねて、なめらかに）
    for i in range(30):
        u = i / 29.0
        y = 0.38 + 0.6 * u
        z = 0.05 - 0.05 * u * u
        r = 0.072 - 0.03 * u
        balls.append(((0.0, y, z), (r, r * 1.6, r), 1.0))
    balls.append(((0.0, 1.05, -0.005), (0.048, 0.085, 0.05), 1.0))  # 頭
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


def wing_rest(side: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """翼の形（広げた姿勢）：翼の根元から先への位置 s（0〜1）と、前後の位置 v（0〜1）の格子。
    戻り値は (s, v, 平たい形の点 N×3) と面"""
    ns, nv = 28, 7
    s = np.linspace(0.0, 1.0, ns)
    v = np.linspace(0.0, 1.0, nv)
    S, V = np.meshgrid(s, v, indexing="ij")
    chord = (0.40 - 0.17 * S) * np.sqrt(np.maximum(1.0 - S**6, 0.0)) + 0.012
    y_le = 0.17 - 0.07 * S**2  # 前のふち（先の方は少し後ろへ）
    y = y_le - chord * V
    # 後ろのふち：羽（初列風切）が少し分かれて見える、ゆるいぎざぎざ
    y -= 0.025 * V**3 * np.abs(np.sin(S * math.pi * 6.0)) * (S > 0.6)
    z = 0.03 * chord / 0.4 * np.sin(math.pi * V)  # 少し丸い（上へふくらむ）
    pts = np.stack([S, y, z], -1).reshape(-1, 3)
    i, j = np.meshgrid(np.arange(ns - 1), np.arange(nv - 1), indexing="ij")
    v0 = i * nv + j
    faces = np.stack([v0, v0 + 1, v0 + nv + 1, v0 + nv], -1).reshape(-1, 4)
    if side < 0:
        faces = faces[:, ::-1]
    return S.ravel(), V.ravel(), pts, faces


def wing_pose(s: np.ndarray, pts: np.ndarray, phi: float, side: int) -> np.ndarray:
    """羽ばたきの位相 phi（0 で一番上）の、翼の点の位置（体の座標。side は右 +1・左 −1）。
    翼は根元から先へ曲がる 1 本の骨のように：肩・ひじ・手首の角度を、先ほど遅れて動かす（むちのように）"""
    sh = math.radians(6.0 + 26.0 * math.cos(phi))
    el = math.radians(10.0 * math.cos(phi - 0.75))
    wr = math.radians(15.0 * math.cos(phi - 1.35))
    sweep = math.radians(7.0 * math.sin(phi))  # 打ち上げのとき、少し後ろへたたむ
    # 根元からの長さ L（m）ごとの、上がる角度
    n = 200
    L = np.linspace(0.0, HALF_SPAN - 0.12, n)
    x = L / (HALF_SPAN - 0.12)
    ang = sh + el * smooth(0.28, 0.45, x) + wr * smooth(0.62, 0.78, x)
    dx = np.cos(ang) * (L[1] - L[0])
    dz = np.sin(ang) * (L[1] - L[0])
    X = np.concatenate([[0.0], np.cumsum(dx)[:-1]])
    Zc = np.concatenate([[0.0], np.cumsum(dz)[:-1]])
    li = s * (n - 1)
    xs = np.interp(li, np.arange(n), X)
    zs = np.interp(li, np.arange(n), Zc)
    a_s = np.interp(li, np.arange(n), ang)
    # 翼の厚み方向（z）は、その所の角度で回す
    y = pts[:, 1] + xs * math.sin(-sweep) * 0.6
    out = np.stack([0.12 + xs - pts[:, 2] * np.sin(a_s), y, 0.05 + zs + pts[:, 2] * np.cos(a_s)], -1)
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
    for side in (1, -1):
        s, v, pts, faces = wing_rest(side)
        me = bpy.data.meshes.new(f"{name}_wing{side}")
        rest = wing_pose(s, pts, 0.0, side)
        me.from_pydata([tuple(p) for p in rest], [], [tuple(int(k) for k in fc) for fc in faces])
        me.update()
        me.materials.append(mats["feather"])
        me.shade_smooth()
        ob = bpy.data.objects.new(f"{name}_wing{side}", me)
        ob.shape_key_add(name="Basis")
        for k in range(POSES):
            key = ob.shape_key_add(name=f"p{k}")
            co = wing_pose(s, pts, 2 * math.pi * k / POSES, side)
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
    return [make_swan(f"swan{i}", mats, float(rng.uniform(0, 2 * math.pi))) for i in range(n)]


# ---------------------------------------------------------------- 動き


def flock_offsets(n: int) -> np.ndarray:
    """群れの並び（先頭の白鳥からのずれ：前・右・上 m）。右後ろへ斜めの列（朝日の側が先頭）"""
    rng = np.random.default_rng(9)
    out = []
    for i in range(n):
        out.append((-4.2 * i + rng.uniform(-0.6, 0.6), 2.9 * i + rng.uniform(-0.5, 0.5), rng.uniform(-0.9, 0.9) - 0.15 * i))
    return np.array(out)


def ease(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def lead_relative(t: float) -> np.ndarray:
    """先頭の白鳥の、カメラから見た位置（右・上・前 m）。右の外から入り、横顔を見せながら左へ渡り、朝日の中へ遠ざかる"""
    t0, t1 = P.SWANS
    u = min(1.0, max(0.0, (t - t0) / (t1 - t0)))
    c = P.camera("local", int(round(P.LOGO_START * P.FPS)))
    sun = P.sun_dir("local")
    sv = np.array([sun @ c["right"], sun @ c["up"], sun @ c["fwd"]])
    start = np.array([36.0, 1.0, 62.0])
    end = sv * 215.0
    k = 1.0 - (1.0 - u) ** 1.35  # はじめは少し速く、朝日に近づくとゆっくり
    mid = (start + end) / 2 + np.array([0.0, 5.0, 0.0])  # 少し上へ弧を描く
    return (1 - k) ** 2 * start + 2 * (1 - k) * k * mid + k * k * end


def place(swans: list[dict], frames: list[int]) -> None:
    """コマごとに、白鳥の位置・向き・羽ばたき（形のキー）を入れる（前後のコマにも。動きのぶれのため）"""
    offs = flock_offsets(len(swans))
    keys = sorted({k for f in frames for k in (f - 1, f, f + 1)})
    for f in keys:
        t = f / P.FPS
        c = P.camera("local", f)
        axes = np.array([c["right"], c["up"], c["fwd"]])  # 行：カメラの右・上・前（場面の座標）
        rel = lead_relative(t)
        rel2 = lead_relative(t + 0.05)
        vel = (rel2 - rel) / 0.05
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
            phi = 2 * math.pi * FLAP_HZ * t + sw["phase0"]
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
    F.setup_render(res, spp, 0.35)
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
    if a.frames:
        lo, _, hi = a.frames.partition("-")
        frames = [f for f in frames if int(lo) <= f <= int(hi or lo)]
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
