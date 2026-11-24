"""PC のオープニング第4版：近くで見ても本物に見える白鳥 1 羽（羽を 1 枚ずつ）。引きの群れにも同じものを使う。

  python swan_hero.py --look [--res 1920x1080] [--spp 128] [--phase 0.25] [--out work/swan_look.png]   # 近くから 1 羽

python は bpy（Blender 5.3）を入れたもの。持ち主（2026-11-24）：「鳥一羽を細かく描いてそれを引きで見る」。
- 骨と羽ばたきは第2版（swans.py の wing_pose。本物の約 0.7 倍のゆっくり）をそのまま使い、羽を 1 枚ずつその上に付ける：
  初列風切 10 枚（手。外ほど長く、先が少し分かれる）・次列風切 20 枚（腕）・三列風切 5 枚（体の近く）・大雨覆・中雨覆・小雨覆
  （前へ行くほど小さく、うろこのように重なる）。下の面にも雨覆。
- 羽 1 枚：羽軸（白いつやのある軸）と、羽軸の両側の羽弁（前は細く、後ろは広い）。羽弁は先へ斜めにのびる細い羽枝の筋が
  ならび、ところどころで羽枝が分かれてすき間ができ（光が透ける）、ふちはほつれる。白い羽は朝日の側から見ると透けて光る。
- 体・首・頭：第2版の形に、重なった羽のうろこの凹凸と、ふちの細かい綿毛（毛の束）を足す。くちばしは黒と黄色。
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import film as F  # noqa: E402
import swans as S  # noqa: E402

RNG_SEED = 20261124


# ---------------------------------------------------------------- 羽 1 枚の形


def feather_points(L: float, w_lead: float, w_trail: float, nu: int = 14, nv: int = 6, tip: float = 0.18,
                   calamus: float = 0.07, sweep: float = 0.35, blunt: float = 2.0) -> tuple[np.ndarray, np.ndarray, list]:
    """羽 1 枚（羽の座標：x＝根元から先へ、y＝羽の幅（前 +）、z＝上）。点・UV（u：根元 0〜先 1、v：前のふち −1〜後ろのふち +1）・面。
    根元（calamus）は羽弁が無く細い。先は丸く（tip の割合で細る）。少し下へ反り、後ろの羽弁はわずかに下がる"""
    us = np.linspace(0.0, 1.0, nu + 1)
    vs = np.linspace(-1.0, 1.0, 2 * nv + 1)
    pts, uv = [], []
    for u in us:
        # 羽弁の幅の割合：根元は 0、すぐ広がり、先で丸くすぼむ
        grow = np.clip((u - calamus) / 0.16, 0.0, 1.0)
        grow = grow * grow * (3 - 2 * grow)
        # 先の丸み：超楕円（blunt が大きいほど先が角ばらずに丸く広い。風切羽は先まで幅があり、最後に丸くすぼむ）
        end = np.clip(1.0 - ((u - (1 - tip)) / tip) ** blunt, 0.0, 1.0) ** (1.0 / blunt) if u > 1 - tip else 1.0
        shape = grow * end
        for v in vs:
            w = (w_lead if v < 0 else w_trail) * shape
            y = -v * w  # 前（v<0）が +y
            x = u * L - abs(v) * w * sweep  # 羽弁のふちは少し根元側へ（羽枝が先へ斜めにのびる）
            z = -0.06 * L * u * u - 0.012 * L * max(v, 0.0) * u  # 下への反り・後ろの羽弁の垂れ
            pts.append((x, y, z))
            uv.append((u, (v + 1.0) / 2.0))
    faces = []
    nvv = 2 * nv + 1
    for i in range(nu):
        for j in range(2 * nv):
            a = i * nvv + j
            faces.append((a, a + nvv, a + nvv + 1, a + 1))
    return np.array(pts, float), np.array(uv, float), faces


def place_feather(pts: np.ndarray, root, ang: float, roll: float = 0.0, lift: float = 0.0) -> np.ndarray:
    """羽の座標の点を、翼の座標（x：根元から先、y：前、z：上）へ。ang：羽の向き（後ろ −y から、先の方 +x へ回す角度）"""
    # 羽の x（根元から先）を、翼の平面で「後ろ」へ向ける。ang だけ外（+x）へ開く
    d = np.array([math.sin(ang), -math.cos(ang), 0.0])  # 羽の先の向き
    side = np.array([math.cos(ang), math.sin(ang), 0.0])  # 羽の前（+y）の向き：前のふちは翼の先の方へ
    up = np.array([0.0, 0.0, 1.0])
    cr, sr = math.cos(roll), math.sin(roll)
    side_r = side * cr + up * sr
    up_r = -side * sr + up * cr
    out = root + pts[:, :1] * d + pts[:, 1:2] * side_r + (pts[:, 2:3] + lift) * up_r
    return out


def wing_feathers(rng: np.random.Generator) -> dict:
    """右の翼の羽（翼の座標。広げた姿勢）。点・UV・面・点ごとの骨の上の位置（station）・羽ごとの乱数（点ごと）"""
    P, UV, FACES, ST, RAND, KIND = [], [], [], [], [], []

    def add(pts, uv, faces, station_of, kind):
        base = sum(len(p) for p in P)
        P.append(pts)
        UV.append(uv)
        FACES.extend([tuple(base + k for k in f) for f in faces])
        ST.append(station_of)
        r = rng.random()
        RAND.append(np.full(len(pts), r))
        KIND.append(np.full(len(pts), kind))

    def trailing(x):
        """骨の上の位置 x での、翼の後ろのふち（羽の付け根の並ぶ線）の y と、前のふちの y"""
        q = min(x / 0.74, 1.0)
        y_le = 0.17 - 0.06 * q * q
        return y_le - 0.20 + 0.03 * q, y_le

    # 次列風切 20 枚（腕：x 0.06〜0.58）。先は丸く、ほぼ真後ろへ、少しずつ外へ開く。重なりは下の羽が上（外の羽が下）
    for k in range(20):
        x = 0.06 + 0.52 * k / 19
        y0, _ = trailing(x)
        L = 0.24 + 0.02 * math.sin(math.pi * k / 19) + rng.normal(0, 0.004)
        pts, uv, faces = feather_points(L, 0.03, 0.06, tip=0.22, sweep=0.04, blunt=3.5)
        ang = math.radians(4 + 8 * k / 19 + rng.normal(0, 0.6))
        wp = place_feather(pts, np.array([x, y0 + 0.05, 0.004 - 0.0006 * k]), ang, roll=math.radians(-3), lift=0.0)
        add(wp, uv, faces, np.full(len(pts), x), 1)
    # 三列風切 5 枚（体の近く。少し内へ向く）
    for k in range(5):
        x = 0.0 + 0.05 * k
        y0, _ = trailing(x)
        L = 0.22 - 0.01 * k
        pts, uv, faces = feather_points(L, 0.03, 0.05, tip=0.3)
        ang = math.radians(-8 + 3 * k)
        wp = place_feather(pts, np.array([x + 0.01, y0 + 0.06, 0.012 - 0.001 * k]), ang)
        add(wp, uv, faces, np.full(len(pts), max(x, 0.0)), 2)
    # 初列風切 10 枚（手：x 0.60〜0.74 の付け根から、外へ大きく開く。外ほど長い。外の 4 枚は先が細く分かれる）
    for k in range(10):
        q = k / 9  # 0：内側、1：いちばん外
        x = 0.60 + 0.14 * q
        y0, _ = trailing(x)
        L = 0.30 + 0.12 * q + rng.normal(0, 0.004)
        emarg = q > 0.6
        pts, uv, faces = feather_points(L, 0.018 if emarg else 0.026, 0.05 if emarg else 0.058, tip=0.35 if emarg else 0.25, sweep=0.05, blunt=2.2 if emarg else 3.0)
        ang = math.radians(12 + 34 * q ** 1.25 + rng.normal(0, 0.6))
        wp = place_feather(pts, np.array([x, y0 + 0.07 + 0.03 * q, 0.006 - 0.0015 * k]), ang, roll=math.radians(-4 - 4 * q))
        # 点ごとの骨の上の位置：手（手首より先）として動く
        add(wp, uv, faces, np.clip(wp[:, 0], 0.60, 1.15), 3)
    # 雨覆（上の面）：大・中・小の 3 列。前へ行くほど小さく、うろこのように重なる。列ごとに付け根の線を前へずらす
    for row, (frac, Lr, wl, wt, n, z) in enumerate(((0.62, 0.13, 0.02, 0.035, 26, 0.022), (0.42, 0.08, 0.015, 0.026, 34, 0.028),
                                                    (0.22, 0.05, 0.012, 0.018, 44, 0.032))):
        for k in range(n):
            x = 0.02 + 0.72 * (k + rng.uniform(0.1, 0.9)) / n
            y0, yle = trailing(x)
            yr = y0 + (yle - y0) * (frac + rng.normal(0, 0.035))
            pts, uv, faces = feather_points(Lr * rng.uniform(0.82, 1.18), wl * rng.uniform(0.9, 1.1), wt * rng.uniform(0.9, 1.15), nu=8, nv=4, tip=0.5, sweep=0.12)
            ang = math.radians(6 + 22 * min(x / 0.74, 1.0) ** 2 + rng.normal(0, 3.0))
            wp = place_feather(pts, np.array([x, yr, z + rng.normal(0, 0.0015)]), ang, roll=math.radians(rng.normal(0, 4)))
            add(wp, uv, faces, np.full(len(pts), x), 4 + row)
    # 前のふちの小さな羽（小雨覆のさらに前。前のふちを包むように、上下に 2 列）
    for k in range(70):
        x = 0.02 + 0.72 * (k + rng.uniform(0.1, 0.9)) / 70
        _, yle = trailing(x)
        for zsign in (1, -1):
            pts, uv, faces = feather_points(0.03 * rng.uniform(0.85, 1.15), 0.009, 0.012, nu=6, nv=3, tip=0.5)
            if zsign < 0:
                pts[:, 2] *= -1.0
                faces = [tuple(reversed(f)) for f in faces]
            ang = math.radians(10 + 20 * min(x / 0.74, 1.0) ** 2 + rng.normal(0, 3))
            wp = place_feather(pts, np.array([x, yle - 0.004, 0.006 * zsign]), ang, roll=math.radians(zsign * 25))
            add(wp, uv, faces, np.full(len(pts), x), 8)
    # 下の面の雨覆：上の面と同じく大・中・小の 3 列（下から見ると、風切羽の付け根をうろこのように覆う）。上下を裏返す
    for row, (frac, Lr, wl, wt, n, z) in enumerate(((0.6, 0.12, 0.02, 0.032, 30, -0.012), (0.4, 0.075, 0.015, 0.024, 38, -0.016),
                                                    (0.2, 0.045, 0.012, 0.017, 48, -0.019))):
        for k in range(n):
            x = 0.02 + 0.72 * (k + rng.uniform(0.1, 0.9)) / n
            y0, yle = trailing(x)
            yr = y0 + (yle - y0) * frac
            pts, uv, faces = feather_points(Lr * rng.uniform(0.9, 1.1), wl, wt, nu=8, nv=4, tip=0.45)
            pts[:, 2] *= -1.0
            ang = math.radians(8 + 20 * min(x / 0.74, 1.0) ** 2 + rng.normal(0, 2.0))
            wp = place_feather(pts, np.array([x, yr, z]), ang, roll=math.radians(rng.normal(0, 3)))
            add(wp, uv, [tuple(reversed(f)) for f in faces], np.full(len(pts), x), 9 + row)
    return dict(p=np.concatenate(P), uv=np.concatenate(UV), faces=FACES, st=np.concatenate(ST),
                rand=np.concatenate(RAND), kind=np.concatenate(KIND))


# ---------------------------------------------------------------- 羽の材質


def feather_material(name: str = "hero_feather", split_base: float = 0.74) -> bpy.types.Material:
    """白い羽：羽枝の細い筋・羽枝の分かれたすき間（透ける）・ほつれたふち・羽軸。朝日の側から見ると透けて光る。
    split_base を上げるほど、羽枝の分かれ（すき間）が少ない（体の羽）"""
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
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "feather_rand"

    def math_(op, a, b=None, clamp=False):
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

    # v：0〜1 → 羽軸からの距離 |2v−1|
    dv = math_("ABSOLUTE", math_("SUBTRACT", math_("MULTIPLY", vv, 2.0), 1.0))
    # 羽枝の筋：先へ斜め（u を進むと v も外へ）。細かい縞
    barb = math_("ADD", math_("MULTIPLY", u, 260.0), math_("MULTIPLY", dv, -95.0))
    barb = math_("ADD", barb, math_("MULTIPLY", attr.outputs["Fac"], 37.0))
    stripe = math_("MULTIPLY", math_("ADD", math_("SINE", math_("MULTIPLY", barb, 2 * math.pi)), 1.0), 0.5)
    # 羽枝の分かれ（すき間）：筋に沿って長い穴。ふちに近いほど多い
    noi = nt.nodes.new("ShaderNodeTexNoise")
    noi.inputs["Scale"].default_value = 3.0
    noi.inputs["Detail"].default_value = 4.0
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(math_("MULTIPLY", barb, 0.12), comb.inputs[0])
    nt.links.new(math_("MULTIPLY", dv, 1.5), comb.inputs[1])
    nt.links.new(math_("MULTIPLY", attr.outputs["Fac"], 50.0), comb.inputs[2])
    nt.links.new(comb.outputs[0], noi.inputs["Vector"])
    split = math_("MULTIPLY", math_("SUBTRACT", noi.outputs["Fac"], math_("SUBTRACT", split_base, math_("MULTIPLY", dv, 0.16))), 18.0, clamp=True)
    # ふちのほつれ：|v| が 1 に近い所を、細かい模様で欠けさせる
    noi2 = nt.nodes.new("ShaderNodeTexNoise")
    noi2.inputs["Scale"].default_value = 40.0
    nt.links.new(comb.outputs[0], noi2.inputs["Vector"])
    edge = math_("MULTIPLY", math_("SUBTRACT", math_("ADD", dv, math_("MULTIPLY", noi2.outputs["Fac"], 0.12)), 0.93), 30.0, clamp=True)
    hole = math_("MAXIMUM", split, edge)
    alpha = math_("SUBTRACT", 1.0, math_("MULTIPLY", hole, 0.92), clamp=True)
    # 羽軸：真ん中の細い白いつや
    shaft = math_("SUBTRACT", 1.0, math_("MULTIPLY", dv, 22.0), clamp=True)
    # 色：白に、羽枝の筋の陰をわずかに。羽ごとに少し違う白
    col = nt.nodes.new("ShaderNodeMix")
    col.data_type = "RGBA"
    sock = lambda socks, name, typ: next(x for x in socks if x.name == name and x.type == typ)  # noqa: E731
    sock(col.inputs, "A", "RGBA").default_value = (0.70, 0.70, 0.69, 1.0)
    sock(col.inputs, "B", "RGBA").default_value = (0.90, 0.90, 0.885, 1.0)
    nt.links.new(math_("ADD", math_("MULTIPLY", stripe, 0.45), 0.55), sock(col.inputs, "Factor", "VALUE"))
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(sock(col.outputs, "Result", "RGBA"), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Sheen Weight"].default_value = 0.5
    b.inputs["Sheen Roughness"].default_value = 0.3
    nt.links.new(math_("SUBTRACT", 0.55, math_("MULTIPLY", shaft, 0.3)), b.inputs["Roughness"])
    tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
    tr.inputs["Color"].default_value = (0.92, 0.86, 0.74, 1.0)
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(math_("SUBTRACT", 0.32, math_("MULTIPLY", shaft, 0.25)), mix.inputs[0])
    nt.links.new(b.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    tp = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix2 = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(alpha, mix2.inputs[0])
    nt.links.new(tp.outputs[0], mix2.inputs[1])
    nt.links.new(mix.outputs[0], mix2.inputs[2])
    nt.links.new(mix2.outputs[0], out.inputs["Surface"])
    return m


def body_material() -> bpy.types.Material:
    """体：重なった羽のうろこの凹凸（体の流れに沿う）と、やわらかいつや"""
    m = bpy.data.materials.new("hero_body")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.86, 0.86, 0.85, 1.0)
    b.inputs["Roughness"].default_value = 0.6
    b.inputs["Sheen Weight"].default_value = 0.7
    b.inputs["Sheen Roughness"].default_value = 0.35
    b.inputs["Subsurface Weight"].default_value = 0.15
    b.inputs["Subsurface Scale"].default_value = 0.01
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (140.0, 70.0, 140.0)  # 体の前後（y）に長いうろこ
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "F1"
    vor.inputs["Randomness"].default_value = 0.8
    nt.links.new(mp.outputs["Vector"], vor.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(vor.outputs["Distance"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def fuzz(ob: bpy.types.Object, count: int, length: float) -> None:
    """体のふちの細かい綿毛（毛の束）。輪郭がやわらかくなる"""
    ps = ob.modifiers.new("fuzz", "PARTICLE_SYSTEM").particle_system
    st = ps.settings
    st.type = "HAIR"
    st.count = count
    st.hair_length = length
    # 毛の長さは hair_length だけで決める（advanced にすると速さの設定で毛が何 m にものびた：2026-11-24 の試し描き）
    st.use_advanced_hair = False
    st.render_type = "PATH"
    st.root_radius = 0.6
    st.tip_radius = 0.0
    st.radius_scale = 0.0008
    hm = bpy.data.materials.new("hero_fuzz")
    hm.use_nodes = True
    nt = hm.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    hb = nt.nodes.new("ShaderNodeBsdfHairPrincipled")
    hb.parametrization = "MELANIN"
    hb.inputs["Melanin"].default_value = 0.0
    hb.inputs["Roughness"].default_value = 0.5
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(hb.outputs[0], out.inputs["Surface"])
    ob.data.materials.append(hm)
    st.material = len(ob.data.materials)


# ---------------------------------------------------------------- 1 羽を組む


def hero_wing_mesh(name: str, wf: dict, side: int, mat) -> bpy.types.Object:
    p = wf["p"].copy()
    rest = S.wing_pose(p, wf["st"], 0.0, side)
    faces = wf["faces"] if side > 0 else [tuple(reversed(f)) for f in wf["faces"]]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(q) for q in rest], [], faces)
    me.update()
    uvl = me.uv_layers.new(name="UVMap")
    loop_v = np.zeros(len(me.loops), int)
    me.loops.foreach_get("vertex_index", loop_v)
    uvl.data.foreach_set("uv", wf["uv"][loop_v].astype(np.float32).ravel())
    at = me.attributes.new("feather_rand", "FLOAT", "POINT")
    at.data.foreach_set("value", wf["rand"].astype(np.float32))
    me.materials.append(mat)
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    ob.shape_key_add(name="Basis")
    for k in range(S.POSES):
        key = ob.shape_key_add(name=f"p{k}")
        co = S.wing_pose(p, wf["st"], 2 * math.pi * k / S.POSES, side)
        key.data.foreach_set("co", co.astype(np.float32).ravel())
    return ob


def tail_mesh(name: str, rng: np.random.Generator, mat) -> bpy.types.Object:
    """尾：短いくさび形の尾羽 16 枚（体の後ろ y≈−0.40 から後ろへ）と、その上を覆う短い羽 18 枚"""
    P, UV, FACES, RAND = [], [], [], []
    def add(pts, uv, faces):
        base = sum(len(q) for q in P)
        P.append(pts); UV.append(uv); RAND.append(np.full(len(pts), rng.random()))
        FACES.extend([tuple(base + k for k in f) for f in faces])
    for k in range(16):
        q = (k / 15) * 2 - 1  # −1（左）〜 1（右）
        L = 0.17 - 0.035 * abs(q)
        pts, uv, faces = feather_points(L, 0.022, 0.03, nu=10, nv=4, tip=0.45)
        ang = math.radians(180 + 28 * q)  # 後ろ（−y）へ。左右へ少し開く
        d = np.array([math.sin(ang - math.pi), -math.cos(ang - math.pi), 0.0])
        d = np.array([math.sin(math.radians(28 * q)), -math.cos(math.radians(28 * q)), 0.0])
        side = np.array([-d[1], d[0], 0.0])
        root = np.array([0.03 * q, -0.40, 0.035 - 0.004 * abs(q) + 0.001 * k])
        add(root + pts[:, :1] * d + pts[:, 1:2] * side + pts[:, 2:3] * np.array([0, 0, 1.0]), uv, faces)
    for k in range(18):
        q = rng.uniform(-1, 1)
        pts, uv, faces = feather_points(0.09, 0.02, 0.026, nu=8, nv=4, tip=0.45)
        d = np.array([math.sin(math.radians(22 * q)), -math.cos(math.radians(22 * q)), 0.0])
        side = np.array([-d[1], d[0], 0.0])
        root = np.array([0.045 * q, -0.33 + rng.uniform(-0.02, 0.02), 0.05])
        add(root + pts[:, :1] * d + pts[:, 1:2] * side + pts[:, 2:3] * np.array([0, 0, 1.0]), uv, faces)
    p = np.concatenate(P)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in p], [], FACES)
    me.update()
    uvl = me.uv_layers.new(name="UVMap")
    loop_v = np.zeros(len(me.loops), int)
    me.loops.foreach_get("vertex_index", loop_v)
    uvl.data.foreach_set("uv", np.concatenate(UV)[loop_v].astype(np.float32).ravel())
    at = me.attributes.new("feather_rand", "FLOAT", "POINT")
    at.data.foreach_set("value", np.concatenate(RAND).astype(np.float32))
    me.materials.append(mat)
    me.shade_smooth()
    return bpy.data.objects.new(name, me)


def body_feathers(name: str, body: bpy.types.Object, rng: np.random.Generator, mat) -> bpy.types.Object:
    """体・首を覆う小さな羽（体の面に面積に比例して置く）。羽の先は後ろ（−y）へ向け、面に沿って寝かせ、うろこのように重ねる。
    首（y > 0.36）と頭の近くは小さく、胴は大きい。頭（y > 0.98）とくちばしの近くは置かない"""
    me = body.data
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    me.calc_loop_triangles()
    tri = np.zeros(len(me.loop_triangles) * 3, int)
    me.loop_triangles.foreach_get("vertices", tri)
    tri = tri.reshape(-1, 3)
    a, b_, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    nrm = np.cross(b_ - a, c - a)
    area = np.linalg.norm(nrm, axis=1) * 0.5
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
    cen = (a + b_ + c) / 3
    tree = BVHTree.FromPolygons([Vector(v) for v in co], [tuple(int(k) for k in t3) for t3 in tri])
    # 羽 1 枚が覆う面積：胴 約 0.0012m²、首 約 0.00035m²。重なり 2.2 倍
    neck = cen[:, 1] > 0.36
    per = np.where(neck, 0.00017, 0.0012) / 2.2
    want = area / per
    keep = cen[:, 1] < 0.98
    cnt = rng.poisson(want * keep)
    P, UV, FACES, RAND = [], [], [], []
    base = 0
    for fi in np.nonzero(cnt)[0]:
        for _ in range(int(cnt[fi])):
            r1, r2 = rng.random(), rng.random()
            if r1 + r2 > 1:
                r1, r2 = 1 - r1, 1 - r2
            pt = a[fi] + (b_[fi] - a[fi]) * r1 + (c[fi] - a[fi]) * r2
            n = nrm[fi]
            t = np.array([0.0, -1.0, 0.0]) - n * (-n[1])
            if np.linalg.norm(t) < 1e-3:
                continue
            t /= np.linalg.norm(t)
            side = np.cross(n, t)
            small = pt[1] > 0.36
            L = (0.022 if small else 0.085) * rng.uniform(0.8, 1.2)
            W = L * 0.45
            pts, uv, faces = feather_points(L, W * 0.5, W * 0.5, nu=6, nv=3, tip=0.5, calamus=0.02)
            # 羽の座標 → 体：x を後ろ（t）、y を横（side）、z を外（n）。付け根は少し前に置き、先が面から浮かないよう下へ曲げる
            x, y = pts[:, 0:1], pts[:, 1:2]
            wp = (pt - t * L * 0.35) + x * t + y * side
            # 体の面に沿わせる（いちばん近い面の点へ寄せ、外へ少しだけ浮かす。先ほど高く：前の羽の上に重なる）
            u = uv[:, 0]
            for i in range(len(wp)):
                hit = tree.find_nearest(Vector(wp[i]))
                if hit[0] is not None:
                    wp[i] = np.array(hit[0]) + np.array(hit[1]) * (0.0006 + 0.0022 * u[i])
            P.append(wp); UV.append(uv); RAND.append(np.full(len(wp), rng.random()))
            FACES.extend([tuple(base + k for k in f) for f in faces])
            base += len(wp)
    p = np.concatenate(P)
    me2 = bpy.data.meshes.new(name)
    me2.from_pydata([tuple(v) for v in p], [], FACES)
    me2.update()
    uvl = me2.uv_layers.new(name="UVMap")
    loop_v = np.zeros(len(me2.loops), int)
    me2.loops.foreach_get("vertex_index", loop_v)
    uvl.data.foreach_set("uv", np.concatenate(UV)[loop_v].astype(np.float32).ravel())
    at = me2.attributes.new("feather_rand", "FLOAT", "POINT")
    at.data.foreach_set("value", np.concatenate(RAND).astype(np.float32))
    me2.materials.append(mat)
    me2.shade_smooth()
    print(f"体の羽：{len(P)} 枚・点 {len(p)}", flush=True)
    return bpy.data.objects.new(name, me2)


def wing_base_mesh(name: str, side: int, mat) -> bpy.types.Object:
    """翼の下地：第2版の翼の内側（手首まで。初列風切の指は除く）を少し薄くして、雨覆の下に敷く"""
    verts, station, faces0 = S.wing_geometry()
    keep = [f for f in faces0 if all(verts[i, 0] <= 0.74 for i in f)]
    v = verts.copy()
    v[:, 2] = v[:, 2] * 0.12 + 0.004  # 上と下の羽の層のあいだに薄く（どちらからも見えない）
    faces = keep if side > 0 else [tuple(reversed(f)) for f in keep]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in S.wing_pose(v, station, 0.0, side)], [], [tuple(int(k) for k in f) for f in faces])
    me.update()
    me.materials.append(mat)
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    ob.shape_key_add(name="Basis")
    for k in range(S.POSES):
        key = ob.shape_key_add(name=f"p{k}")
        key.data.foreach_set("co", S.wing_pose(v, station, 2 * math.pi * k / S.POSES, side).astype(np.float32).ravel())
    return ob


def make_hero(name: str, phase0: float = 0.0, with_fuzz: bool = True) -> dict:
    """羽を 1 枚ずつ付けた白鳥 1 羽（swans.py の make_swan と同じ形の dict：root・wings・phase0・body）"""
    rng = np.random.default_rng(RNG_SEED)
    fm = bpy.data.materials.get("hero_feather") or feather_material()
    bm = bpy.data.materials.get("hero_body") or body_material()
    black = S.plain_material("hero_bill_black", (0.012, 0.012, 0.012), 0.3)
    yellow = S.plain_material("hero_bill_yellow", (0.78, 0.58, 0.05), 0.35)
    eye = S.plain_material("hero_eye", (0.005, 0.004, 0.003), 0.1)
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    parts = []
    body = bpy.data.objects.new(name + "_body", S.body_mesh(bm))
    parts.append(body)
    parts.append(bpy.data.objects.new(name + "_bill", S.cone_mesh("hero_bill", (0.0, 1.11, -0.012), (0.0, 1.21, -0.03), 0.026, 0.011, black)))
    parts.append(bpy.data.objects.new(name + "_knob", S.cone_mesh("hero_knob", (0.0, 1.085, -0.006), (0.0, 1.135, -0.016), 0.03, 0.022, yellow)))
    for sx in (1, -1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0085, location=(0.034 * sx, 1.05, 0.012))
        e = bpy.context.active_object
        e.data.materials.append(eye)
        e.data.shade_smooth()
        parts.append(e)
    tail = tail_mesh(f"{name}_tail", rng, fm)
    parts.append(tail)
    cm = bpy.data.materials.get("hero_contour") or feather_material("hero_contour", split_base=0.86)
    parts.append(body_feathers(f"{name}_contour", body, rng, cm))
    wf = wing_feathers(rng)
    wings = []
    for side in (1, -1):
        ob = hero_wing_mesh(f"{name}_wing{side}", wf, side, fm)
        parts.append(ob)
        wings.append(ob)
        base = wing_base_mesh(f"{name}_wingbase{side}", side, bm)
        parts.append(base)
        wings.append(base)
    for ob in parts:
        if ob.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(ob)
        ob.parent = root
    if with_fuzz:
        fuzz(body, 60000, 0.012)
    return dict(root=root, wings=wings, phase0=phase0, body=body)


# ---------------------------------------------------------------- 近くから 1 羽を見る


def look(a) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sw = make_hero("hero", with_fuzz=a.fuzz)
    # 羽ばたきの姿勢
    k = int(round(a.phase * S.POSES)) % S.POSES
    for w in sw["wings"]:
        for i, key in enumerate(w.data.shape_keys.key_blocks[1:]):
            key.value = 1.0 if i == k else 0.0
    sw["root"].rotation_euler = (math.radians(4), 0.0, math.radians(a.yaw))
    # 空：朝の空（Blender の空の計算）と、低い朝日（白鳥の後ろ斜め上から：羽のふちが透けて光る）
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING" if "MULTIPLE_SCATTERING" in [i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items] else "NISHITA"
    sky.sun_elevation = math.radians(a.sun_el)
    sky.sun_rotation = math.radians(a.sun_az)
    sky.sun_disc = True
    nt.links.new(sky.outputs[0], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = 0.35
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.lens = a.lens
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = a.dist
    cam.data.dof.aperture_fstop = a.fstop
    az = math.radians(a.cam_az)
    tgt = np.array([0.0, 0.25, 0.05])
    pos = tgt + a.dist * np.array([math.sin(az) * math.cos(math.radians(a.cam_el)), -math.cos(az) * math.cos(math.radians(a.cam_el)), math.sin(math.radians(a.cam_el))])
    cam.location = tuple(pos)
    d = tgt - pos
    cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0.0, math.atan2(d[1], d[0]) - math.pi / 2)
    sc.camera = cam
    res = tuple(int(v) for v in a.res.split("x"))
    sc.render.engine = "CYCLES"
    sc.cycles.samples = a.spp
    sc.cycles.use_denoising = True
    sc.cycles.transparent_max_bounces = 64
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.exposure = a.ev
    sc.render.threads_mode = "FIXED" if a.threads else "AUTO"
    if a.threads:
        sc.render.threads = a.threads
    sc.render.filepath = a.out
    bpy.ops.render.render(write_still=True)
    print("描いた：", a.out, flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--look", action="store_true")
    ap.add_argument("--fuzz", action="store_true", help="体のふちの綿毛を付ける")
    ap.add_argument("--fstop", type=float, default=8.0)
    ap.add_argument("--res", default="1920x1080")
    ap.add_argument("--spp", type=int, default=128)
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--phase", type=float, default=0.3, help="羽ばたきの位相（0〜1。0 が一番上）")
    ap.add_argument("--yaw", type=float, default=0.0)
    ap.add_argument("--cam_az", type=float, default=35.0, help="カメラの向き（白鳥の後ろ 0・右 90）")
    ap.add_argument("--cam_el", type=float, default=12.0)
    ap.add_argument("--dist", type=float, default=3.2)
    ap.add_argument("--lens", type=float, default=50.0)
    ap.add_argument("--sun_el", type=float, default=6.0)
    ap.add_argument("--sun_az", type=float, default=200.0)
    ap.add_argument("--ev", type=float, default=0.0)
    ap.add_argument("--out", default=os.path.join(F.WORK, "swan_look.png"))
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    a = ap.parse_args(argv)
    if a.look:
        look(a)


if __name__ == "__main__":
    main()
