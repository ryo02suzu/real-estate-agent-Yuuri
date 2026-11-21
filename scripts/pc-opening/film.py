"""PC のオープニング CG の本番の絵を、Blender（Cycles）で描く。

  python film.py local  [--frames 147-479] [--res 1920x1080] [--spp 12] [--every 1] [--out 出力のフォルダ]
  python film.py global [--frames 0-153] ...
  python film.py sky local|global      # かすみの色に使う、空だけの全天の絵（小さい）

python は bpy（Blender 5.3）を入れたもの。カメラと時間割は path.py。ここで描くのは「面」だけ：
  - 上高地の場面：地面（近くは晩秋の色にした航空写真＝autumn.py、遠くは標高と傾きで塗る）、雲海の上の面、空、朝日
  - 列島の場面：地面（ランドサット・世界衛星モザイク）、海、朝日（時間とともに上がる）
かすみ・朝もや・光の筋・大気の縁・雲の中を抜けるところは、atmos.py が奥行きを使って後から足す（Cycles の体積の
計算はこの作業場所では遅すぎるため。1コマ約 30 秒にする）。
出力はコマごとの EXR（光の量そのまま（線形）の色と、奥行き＝カメラの前の向きの距離）。カメラの動きのぶれも入れる。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import path as P  # noqa: E402
from geo import enu, pixel_lonlat  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
R_M = 6371008.8
R_KM = R_M / 1000.0


# ---------------------------------------------------------------- 道具


def load(name: str) -> tuple[np.ndarray, dict]:
    with open(os.path.join(WORK, f"{name}.json")) as f:
        meta = json.load(f)
    return np.load(os.path.join(WORK, f"{name}.npy")), meta


def node(nt, kind: str, **inputs):
    """シェーダーのノードを足して、入力の値を入れる（入力に無い名前は、ノードの設定として入れる）"""
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def link(nt, a, b) -> None:
    nt.links.new(a, b)


def math_node(nt, op: str, a=None, b=None):
    """数の計算（a・b はソケットか数）"""
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def mix_rgb(nt, fac, a, b):
    """色を混ぜる（fac は 0〜1 のソケットか数。a・b は色のソケットか (r, g, b)）"""
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    for sock, v in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
        if isinstance(v, (int, float)):
            sock.default_value = v
        elif isinstance(v, tuple):
            sock.default_value = (*v, 1.0)
        else:
            nt.links.new(v, sock)
    return m.outputs[2]


def map_range(nt, value, a: float, b: float, smooth: bool = True):
    n = node(nt, "ShaderNodeMapRange", **{"From Min": a, "From Max": b})
    if smooth:
        n.interpolation_type = "SMOOTHSTEP"
    nt.links.new(value, n.inputs["Value"])
    return n.outputs["Result"]


def principled(name: str, color, rough: float, spec: float = 0.5) -> bpy.types.Material:
    """ふつうの材質（色・粗さ・つや）"""
    m, _, b = material(name)
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    return m


def material(name: str) -> tuple[bpy.types.Material, object, object]:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes["Principled BSDF"]


def grid_object(name: str, X, Y, Z, elev, face_mask, mat, uv=None) -> bpy.types.Object:
    """格子の点（行は北→南、列は西→東）から、面が上を向いた地面のメッシュを作る。face_mask で使う面を選ぶ"""
    H, W = X.shape
    co = np.stack([X, Y, Z], -1).reshape(-1, 3)
    ii, jj = np.meshgrid(np.arange(H - 1), np.arange(W - 1), indexing="ij")
    v0 = ii * W + jj
    quads = np.stack([v0, v0 + W, v0 + W + 1, v0 + 1], -1)
    if face_mask is not None:
        quads = quads[face_mask]
    quads = quads.reshape(-1, 4)
    used = np.unique(quads)
    remap = np.full(H * W, -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    quads = remap[quads]
    co = co[used].astype(np.float32)
    return mesh_object(name, co, quads, mat, {"elev": np.asarray(elev, np.float32).reshape(-1)[used]}, None if uv is None else np.asarray(uv, np.float32).reshape(-1, 2)[used])


def mesh_object(name: str, co: np.ndarray, quads: np.ndarray, mat, attrs: dict | None = None, uv: np.ndarray | None = None):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co))
    me.vertices.foreach_set("co", np.ascontiguousarray(co, np.float32).ravel())
    nf = len(quads)
    me.loops.add(nf * 4)
    me.loops.foreach_set("vertex_index", np.ascontiguousarray(quads, np.int32).ravel())
    me.polygons.add(nf)
    me.polygons.foreach_set("loop_start", (np.arange(nf) * 4).astype(np.int32))
    me.update(calc_edges=True)
    me.polygons.foreach_set("use_smooth", np.ones(nf, dtype=bool))
    for k, v in (attrs or {}).items():
        a = me.attributes.new(k, "FLOAT", "POINT")
        a.data.foreach_set("value", np.ascontiguousarray(v, np.float32))
    if uv is not None:
        layer = me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", np.ascontiguousarray(uv[quads.ravel()], np.float32).ravel())
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def photo_uv(meta: dict, LAT: np.ndarray, LON: np.ndarray) -> np.ndarray:
    """経度・緯度 → 航空写真（つなぎ合わせた1枚）の上の位置（0〜1。下が 0）"""
    n = 2.0 ** meta["z"]
    x = (LON + 180.0) / 360.0 * n
    r = np.radians(LAT)
    y = (1.0 - np.log(np.tan(r) + 1.0 / np.cos(r)) / np.pi) / 2.0 * n
    return np.stack([(x - meta["x0"]) / meta["nx"], 1.0 - (y - meta["y0"]) / meta["ny"]], -1)


def value_noise(x: np.ndarray, y: np.ndarray, seed: int) -> np.ndarray:
    """なめらかなゆらぎ（0〜1）。x・y は格子の目の数"""
    g = np.random.default_rng(seed).random((256, 256)).astype(np.float32)
    xi = np.floor(x).astype(np.int64)
    yi = np.floor(y).astype(np.int64)
    fx, fy = (x - xi).astype(np.float32), (y - yi).astype(np.float32)
    ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    a, b = g[yi & 255, xi & 255], g[yi & 255, (xi + 1) & 255]
    c, d = g[(yi + 1) & 255, xi & 255], g[(yi + 1) & 255, (xi + 1) & 255]
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy


# ---------------------------------------------------------------- 上高地の場面


def near_material() -> bpy.types.Material:
    """近くの地面：晩秋の色にした航空写真。森は木の一本ずつの丸み（凹凸）と色のばらつきを足す"""
    m, nt, b = material("near")
    uv = node(nt, "ShaderNodeUVMap", uv_map="UVMap")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(WORK, "near_photo_autumn.jpg"))
    tex.interpolation = "Cubic"
    tex.extension = "EXTEND"
    link(nt, uv.outputs["UV"], tex.inputs["Vector"])
    fm = nt.nodes.new("ShaderNodeTexImage")
    fm.image = bpy.data.images.load(os.path.join(WORK, "near_forest.png"))
    fm.image.colorspace_settings.name = "Non-Color"
    fm.extension = "EXTEND"
    link(nt, uv.outputs["UV"], fm.inputs["Vector"])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    # 木の一本ずつ（約 6m）：丸い頭と、木ごとの明るさ・色のばらつき
    vor = node(nt, "ShaderNodeTexVoronoi", Scale=1.0 / 6.0, Randomness=0.9)
    vor.feature = "F1"
    link(nt, geo.outputs["Position"], vor.inputs["Vector"])
    crown = math_node(nt, "SUBTRACT", 1.0, map_range(nt, vor.outputs["Distance"], 0.0, 0.62))
    forest = fm.outputs["Color"]
    bump_h = math_node(nt, "MULTIPLY", crown, forest)
    jitter = math_node(nt, "ADD", 0.82, math_node(nt, "MULTIPLY", vor.outputs["Color"], 0.36))  # 0.82〜1.18
    shade = math_node(nt, "ADD", 0.72, math_node(nt, "MULTIPLY", crown, 0.42))  # 木の頭は明るく、すき間は暗く
    k = math_node(nt, "ADD", 1.0, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", math_node(nt, "MULTIPLY", jitter, shade), 1.0), forest))
    kk = node(nt, "ShaderNodeCombineColor")
    for i in range(3):
        link(nt, k, kk.inputs[i])
    col = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    col.inputs[0].default_value = 1.0
    link(nt, tex.outputs["Color"], col.inputs[6])
    link(nt, kk.outputs[0], col.inputs[7])
    link(nt, col.outputs[2], b.inputs["Base Color"])
    # 細かい凹凸：木の頭（森だけ）＋岩や地面のざらつき
    nz = node(nt, "ShaderNodeTexNoise", Scale=1.0 / 14.0, Detail=6.0, Roughness=0.6)
    link(nt, geo.outputs["Position"], nz.inputs["Vector"])
    h = math_node(nt, "ADD", math_node(nt, "MULTIPLY", bump_h, 1.0), math_node(nt, "MULTIPLY", nz.outputs["Fac"], 0.6))
    bump = node(nt, "ShaderNodeBump", Strength=0.55, Distance=3.0)
    link(nt, h, bump.inputs["Height"])
    link(nt, bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.92
    b.inputs["Specular IOR Level"].default_value = 0.25
    return m


def far_material() -> bpy.types.Material:
    """遠くの地面：標高と傾きで、晩秋の色に塗る（谷の森＝針葉樹と金・茶の混ざり、高い所＝ハイマツと岩、上は初雪）"""
    m, nt, b = material("far")
    at = node(nt, "ShaderNodeAttribute", attribute_name="elev")
    el = at.outputs["Fac"]
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    link(nt, geo.outputs["Normal"], sep.inputs["Vector"])
    up = sep.outputs["Z"]
    nz = node(nt, "ShaderNodeTexNoise", Scale=1.0 / 900.0, Detail=6.0, Roughness=0.62)
    link(nt, geo.outputs["Position"], nz.inputs["Vector"])
    nzf = node(nt, "ShaderNodeTexNoise", Scale=1.0 / 120.0, Detail=4.0)
    link(nt, geo.outputs["Position"], nzf.inputs["Vector"])
    n1 = nz.outputs["Fac"]
    # 谷の森：針葉樹（暗い緑）と、金・葉を落とした茶の混ざり
    forest = mix_rgb(nt, map_range(nt, n1, 0.35, 0.65), (0.040, 0.054, 0.040), (0.17, 0.115, 0.055))
    forest = mix_rgb(nt, map_range(nt, nzf.outputs["Fac"], 0.3, 0.7), forest, (0.085, 0.073, 0.066))
    high = mix_rgb(nt, map_range(nt, n1, 0.4, 0.6), (0.034, 0.046, 0.035), (0.13, 0.12, 0.11))  # ハイマツと岩
    c = mix_rgb(nt, map_range(nt, el, 2150.0, 2550.0), forest, high)
    rock = map_range(nt, up, 0.78, 0.6)  # 急な所は岩
    c = mix_rgb(nt, rock, c, (0.16, 0.15, 0.145))
    # 初雪（急な所には積もらない）。富士山・八ヶ岳・南アルプスの上の方も
    line = map_range(nt, math_node(nt, "ADD", el, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", nzf.outputs["Fac"], 0.5), 300.0)), 2600.0, 2850.0)
    hold = map_range(nt, up, 0.7, 0.86)
    c = mix_rgb(nt, math_node(nt, "MULTIPLY", line, hold), c, (0.78, 0.79, 0.82))
    link(nt, c, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.92
    b.inputs["Specular IOR Level"].default_value = 0.25
    return m


def cloud_material() -> bpy.types.Material:
    """雲海の上の面：光が中で散って広がる白（ふちが柔らかく光る）。遠くから見る雲海の頭"""
    m, nt, b = material("cloudtop")
    b.inputs["Base Color"].default_value = (0.93, 0.93, 0.94, 1.0)
    b.inputs["Subsurface Weight"].default_value = 1.0
    b.inputs["Subsurface Radius"].default_value = (1.0, 1.0, 1.0)
    b.inputs["Subsurface Scale"].default_value = 45.0
    b.inputs["Subsurface Anisotropy"].default_value = 0.7
    b.inputs["Roughness"].default_value = 1.0
    b.inputs["Specular IOR Level"].default_value = 0.0
    b.inputs["IOR"].default_value = 1.01
    b.subsurface_method = "RANDOM_WALK"
    return m


def cloud_top(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """雲海の上の面の高さ（海抜 m）。大きなうねりと、もくもくした頭（丸い頭と、間の筋）"""
    h = 1600.0 + 170.0 * (value_noise(x / 7000.0, y / 7000.0, 1) - 0.5) * 2
    for scale, amp, seed in ((1400.0, 120.0, 2), (420.0, 60.0, 3), (130.0, 26.0, 4), (40.0, 8.0, 5)):
        n = value_noise(x / scale, y / scale, seed)
        h += amp * np.abs(2.0 * n - 1.0) ** 0.85  # もくもく（丸い頭、間は筋）
    # 上高地の谷（西の稜線より西）には雲海を置かない（面を地面の下へ沈める）
    h -= 3500.0 * (1.0 - np.clip((x - 3800.0) / 2600.0, 0.0, 1.0)) ** 2
    return h


def build_cloud_sea(center: tuple[float, float]) -> None:
    """雲海の上の面を、カメラのいる所を中心に、近くは細かく遠くは粗く張る（地球の丸みも入れる）"""
    cx, cy = center
    rings = np.geomspace(150.0, 160000.0, 900)
    na = 1600
    th = np.linspace(0.0, 2 * np.pi, na, endpoint=False)
    R, T = np.meshgrid(rings, th, indexing="ij")
    X = cx + R * np.sin(T)
    Y = cy + R * np.cos(T)
    Z = cloud_top(X, Y) - (X**2 + Y**2) / (2.0 * R_M)
    co = np.stack([X, Y, Z], -1).reshape(-1, 3)
    nr = len(rings)
    i, j = np.meshgrid(np.arange(nr - 1), np.arange(na), indexing="ij")
    v0 = i * na + j
    v1 = i * na + (j + 1) % na
    quads = np.stack([v0, v1, v1 + na, v0 + na], -1).reshape(-1, 4)  # 上から見て反時計回り（上向き）
    mesh_object("cloudsea", co, quads, cloud_material())


def build_local() -> None:
    near, near_meta = load("near")
    with open(os.path.join(WORK, "near_photo.json")) as f:
        photo_meta = json.load(f)
    S = 2
    hh = near[::S, ::S].astype(np.float64)
    lon, lat = pixel_lonlat(near_meta, near.shape, S)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    e, n, u = enu(LAT, LON, hh, *P.P1)
    grid_object("near", e, n, u, hh, None, near_material(), uv=photo_uv(photo_meta, LAT, LON))
    mid, mid_meta = load("mid")
    hh = mid[::S, ::S].astype(np.float64)
    lon, lat = pixel_lonlat(mid_meta, mid.shape, S)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    e, n, u = enu(LAT, LON, hh, *P.P1)
    w, s, ee, nn = near_meta["bbox"]
    cl = (LON[:-1, :-1] + LON[1:, 1:]) / 2.0
    ca = (LAT[:-1, :-1] + LAT[1:, 1:]) / 2.0
    mask = ~((cl > w + 0.006) & (cl < ee - 0.006) & (ca > s + 0.005) & (ca < nn - 0.005))
    grid_object("mid", e, n, u, hh, mask, far_material())
    x, y = P.local_state(P.ROUTE_END)[:2]
    build_cloud_sea((x, y))
    sky_world("local")
    sun = sun_lamp(P.sun_dir("local"), 14.0)
    sun.data.color = sun_color(P.SUN_EL)


def sun_color(el_deg: float) -> tuple[float, float, float]:
    """太陽の光の色（空気を長く通るほど赤い）。高さ el_deg（度）の、空気の通り道の長さで決める"""
    el = max(el_deg, 0.3)
    air = 1.0 / (math.sin(math.radians(el)) + 0.15 * (el + 3.885) ** -1.253)  # Kasten–Young
    tau = np.array([0.0193, 0.0345, 0.0716]) * 1.6  # 赤・緑・青の通りにくさ（朝の、少しちりのある空気）
    t = np.exp(-tau * air)
    t /= t.max()
    return tuple(float(v) for v in t)


# ---------------------------------------------------------------- 列島の場面


def land_material() -> bpy.types.Material:
    """陸：衛星画像の色。朝日の当たり始め（夜明けの線の近く）は、空気を長く通った赤い光になるように色を寄せる"""
    m, nt, b = material("land")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(WORK, "home_albedo.png"))
    tex.interpolation = "Cubic"
    tex.extension = "EXTEND"
    uv = node(nt, "ShaderNodeUVMap", uv_map="UVMap")
    link(nt, uv.outputs["UV"], tex.inputs["Vector"])
    # 衛星画像は明るめなので、少し落とす（夜明けの暗い陸）
    hsv = node(nt, "ShaderNodeHueSaturation", Saturation=0.9, Value=1.0)
    link(nt, tex.outputs["Color"], hsv.inputs["Color"])
    c = sunrise_tint(nt, hsv.outputs["Color"])
    link(nt, c, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    b.inputs["Specular IOR Level"].default_value = 0.2
    return m


def sunrise_tint(nt, color):
    """その地点の太陽の高さ（地球の丸みから。地面の上向き＝中心からの向き）で、光の色を赤く寄せる"""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    # 地球の中心は (0, 0, -R_KM)
    cen = node(nt, "ShaderNodeVectorMath", operation="ADD")
    link(nt, geo.outputs["Position"], cen.inputs[0])
    cen.inputs[1].default_value = (0.0, 0.0, R_KM)
    nrm = node(nt, "ShaderNodeVectorMath", operation="NORMALIZE")
    link(nt, cen.outputs[0], nrm.inputs[0])
    sv = nt.nodes.new("ShaderNodeCombineXYZ")  # 太陽の向き（コマごとに入れる。animate_global_sun）
    sv.name = "sunvec"
    dot = node(nt, "ShaderNodeVectorMath", operation="DOT_PRODUCT")
    link(nt, nrm.outputs[0], dot.inputs[0])
    link(nt, sv.outputs[0], dot.inputs[1])
    s = dot.outputs["Value"]  # 太陽の高さの sin
    # 高さ 0〜8° で、赤（空気を長く通る）→ 金 → ふつうの色
    warm = map_range(nt, s, 0.0, 0.14)
    tint = mix_rgb(nt, warm, (1.0, 0.55, 0.38), (1.0, 1.0, 1.0))
    mul = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    mul.inputs[0].default_value = 1.0
    link(nt, color, mul.inputs[6])
    link(nt, tint, mul.inputs[7])
    return mul.outputs[2]


def ocean_material() -> bpy.types.Material:
    """海：暗い紺。朝日が映る（さざ波で広がった光の道）。映る光の色も、太陽の高さで赤く寄せる"""
    m, nt, b = material("ocean")
    b.inputs["Base Color"].default_value = (0.006, 0.016, 0.03, 1.0)
    b.inputs["Roughness"].default_value = 0.11
    b.inputs["IOR"].default_value = 1.333
    b.inputs["Specular IOR Level"].default_value = 0.5
    white = nt.nodes.new("ShaderNodeRGB")
    white.outputs[0].default_value = (1.0, 1.0, 1.0, 1.0)
    tint = sunrise_tint(nt, white.outputs[0])
    link(nt, tint, b.inputs["Specular Tint"])
    return m


def point_sphere(name: str, radius: float, center, mat) -> bpy.types.Object:
    """本当の球（点群の1点。地球の海面に使う。多角形の球だと、遠くの水平線が角ばって見える）"""
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    out = ng.nodes.new("NodeGroupOutput")
    pts = ng.nodes.new("GeometryNodePoints")
    pts.inputs["Count"].default_value = 1
    pts.inputs["Position"].default_value = center
    pts.inputs["Radius"].default_value = radius
    sm = ng.nodes.new("GeometryNodeSetMaterial")
    sm.inputs["Material"].default_value = mat
    ng.links.new(pts.outputs[0], sm.inputs["Geometry"])
    ng.links.new(sm.outputs["Geometry"], out.inputs[0])
    ob.modifiers.new("gn", "NODES").node_group = ng
    return ob


def build_global() -> None:
    h = np.load(os.path.join(WORK, "home_dem.npy"))
    with open(os.path.join(WORK, "home_dem.json")) as f:
        meta = json.load(f)
    mid, mid_meta = load("mid")
    mw, ms, me_, mn = mid_meta["bbox"]
    mat = land_material()
    # 日本全体（約 1.5km ごと）。北アルプス〜富士山は、細かいデータ（約 120m ごと）に置き換える
    S = 3
    hh = np.maximum(h[::S, ::S].astype(np.float64), -50.0)  # 海の底は海面の少し下まで（海は球で描く）
    lon, lat = pixel_lonlat(meta, h.shape, S)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    e, n, u = enu(LAT, LON, hh * P.EXAG, *P.P0)
    uv = photo_uv(meta, LAT, LON)
    land = hh > -40.0
    fm = land[:-1, :-1] | land[1:, 1:] | land[:-1, 1:] | land[1:, :-1]
    cl = (LON[:-1, :-1] + LON[1:, 1:]) / 2.0
    ca = (LAT[:-1, :-1] + LAT[1:, 1:]) / 2.0
    fm &= ~((cl > mw + 0.03) & (cl < me_ - 0.03) & (ca > ms + 0.03) & (ca < mn - 0.03))
    grid_object("land", e / 1000.0, n / 1000.0, u / 1000.0, hh, fm, mat, uv=uv)
    S = 2
    hm = mid[::S, ::S].astype(np.float64)
    lon, lat = pixel_lonlat(mid_meta, mid.shape, S)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    e, n, u = enu(LAT, LON, hm * P.EXAG, *P.P0)
    grid_object("alps", e / 1000.0, n / 1000.0, u / 1000.0, hm, None, mat, uv=photo_uv(meta, LAT, LON))
    point_sphere("ocean", R_KM, (0.0, 0.0, -R_KM), ocean_material())
    w = bpy.data.worlds.new("dawn")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    # カメラから見える空は黒（大気は atmos.py で描く）。地面を照らすのは、夜明け前の空の弱い青い光
    lp = nt.nodes.new("ShaderNodeLightPath")
    c = mix_rgb(nt, lp.outputs["Is Camera Ray"], (0.010, 0.016, 0.038), (0.0, 0.0, 0.0))
    link(nt, c, bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    sun = sun_lamp(P.sun_dir("global", 0.0), 26.0)
    sun.data.color = sun_color(1.5)  # 地平線近くの朝日（空気を長く通った赤みのある金）


# ---------------------------------------------------------------- 空・太陽・カメラ


def sky_world(scene: str, disc: bool = True) -> None:
    """空：太陽の高さから計算する空（Blender の Sky Texture）。太陽の円は画面に映るときだけ（照らすのは太陽の光源）。
    disc=False は太陽の円を描かない（かすみの色に使う全天の絵）"""
    sc = bpy.context.scene
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    skies = []
    for with_disc in (disc, False):
        s = nt.nodes.new("ShaderNodeTexSky")
        s.sky_type = "MULTIPLE_SCATTERING"
        s.sun_disc = with_disc
        s.sun_elevation = math.radians(P.SUN_EL)
        s.sun_rotation = math.radians(P.SUN_AZ)  # 北 0°・東 90°（確かめ済み）
        s.altitude = 3000.0
        s.aerosol_density = 1.2
        skies.append(s)
    lp = nt.nodes.new("ShaderNodeLightPath")
    c = mix_rgb(nt, lp.outputs["Is Camera Ray"], skies[1].outputs["Color"], skies[0].outputs["Color"])
    bg = nt.nodes["Background"]
    link(nt, c, bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.38


def sun_lamp(direction: np.ndarray, energy: float) -> bpy.types.Object:
    lamp = bpy.data.lights.new("sun", "SUN")
    lamp.energy = energy
    lamp.angle = math.radians(0.53)
    ob = bpy.data.objects.new("sun", lamp)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(direction.tolist()))
    return ob


def setup_render(res, spp: int, shutter: float = 0.35) -> None:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = spp
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.03
    sc.cycles.use_denoising = True
    sc.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    sc.cycles.denoising_prefilter = "ACCURATE"
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 1
    sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 0
    sc.cycles.volume_bounces = 0
    sc.cycles.transparent_max_bounces = 2
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.sample_clamp_indirect = 4.0
    sc.render.use_persistent_data = True
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = shutter
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.view_layers[0].use_pass_z = True
    st = sc.render.image_settings
    st.media_type = "MULTI_LAYER_IMAGE"
    st.file_format = "OPEN_EXR_MULTILAYER"
    st.color_depth = "16"
    st.exr_codec = "ZIP"
    sc.view_settings.view_transform = "Standard"


def camera_object(scene: str, frames: list[int]) -> bpy.types.Object:
    """カメラを作り、描くコマ（と前後 1 コマ）に位置と向きを入れる（動きのぶれのため）"""
    sc = bpy.context.scene
    cam = bpy.data.cameras.new("cam")
    cam.sensor_fit = "HORIZONTAL"
    cam.sensor_width = 36.0
    cam.clip_start, cam.clip_end = (0.05, 30000.0) if scene == "global" else (1.0, 600000.0)
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    co.rotation_mode = "QUATERNION"
    keys = sorted({k for f in frames for k in (f - 1, f, f + 1) if k >= 0})
    prev = None
    for f in keys:
        c = P.camera(scene, f)
        rot = Matrix([c["right"].tolist(), c["up"].tolist(), (-c["fwd"]).tolist()]).transposed()
        q = rot.to_quaternion()
        if prev is not None and prev.dot(q) < 0:
            q = Quaternion((-q.w, -q.x, -q.y, -q.z))
        prev = q
        co.location = Vector(c["pos"].tolist())
        co.rotation_quaternion = q
        cam.lens = c["focal"]
        co.keyframe_insert("location", frame=f)
        co.keyframe_insert("rotation_quaternion", frame=f)
        cam.keyframe_insert("lens", frame=f)
    return co


def animate_global_sun(frames: list[int]) -> None:
    """列島の場面：太陽の向きをコマごとに入れる（地平線の下から上がる）。色を寄せる計算（sunvec）にも同じ向きを入れる"""
    ob = bpy.data.objects["sun"]
    nodes = [m.node_tree.nodes["sunvec"] for m in bpy.data.materials if m.node_tree and "sunvec" in m.node_tree.nodes]
    keys = sorted({k for f in frames for k in (f - 1, f, f + 1) if k >= 0})
    for f in keys:
        d = P.sun_dir("global", f / P.FPS)
        ob.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(d.tolist()))
        ob.keyframe_insert("rotation_quaternion", frame=f)
        for n in nodes:
            for i in range(3):
                n.inputs[i].default_value = float(d[i])
                n.inputs[i].keyframe_insert("default_value", frame=f)


def render_sky(scene: str, out: str) -> None:
    """空だけの全天の絵（正距円筒。かすみの色に使う）"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sky_world(scene, disc=False)
    setup_render((1024, 512), 32)
    sc = bpy.context.scene
    sc.render.use_motion_blur = False
    cam = bpy.data.cameras.new("pano")
    cam.type = "PANO"
    cam.panorama_type = "EQUIRECTANGULAR"
    co = bpy.data.objects.new("pano", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    co.rotation_euler = (math.pi / 2, 0.0, -math.pi / 2)  # 画像の真ん中＝北・水平
    co.location = (0.0, 0.0, 3000.0)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("scene", choices=["local", "global", "sky"])
    ap.add_argument("which", nargs="?", default="")
    ap.add_argument("--frames", default="")
    ap.add_argument("--res", default="1920x1080")
    ap.add_argument("--spp", type=int, default=12)
    ap.add_argument("--every", type=int, default=1)
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    if a.scene == "sky":
        render_sky(a.which or "local", a.out or os.path.join(WORK, f"sky_{a.which or 'local'}.exr"))
        return
    res = tuple(int(v) for v in a.res.split("x"))
    frames = P.frames(a.scene)
    if a.frames:
        sel = set()
        for part in a.frames.split(","):
            # 「126-200」「366-446:4」（4 コマごと）「310」
            rng, _, step = part.partition(":")
            lo, _, hi = rng.partition("-")
            sel |= set(range(int(lo), int(hi or lo) + 1, int(step or 1)))
        frames = [f for f in frames if f in sel]
    frames = frames[:: a.every]
    out = a.out or os.path.join(WORK, "film", a.scene)
    os.makedirs(out, exist_ok=True)
    todo = [f for f in frames if not os.path.exists(os.path.join(out, f"{f:04d}.exr"))]
    if not todo:
        print("描くコマはありません")
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    t0 = time.time()
    if a.scene == "local":
        build_local()
    else:
        build_global()
    # 動きのぶれ：列島の場面は、高い空から一気に降りるので短く（ぶれで絵が流れすぎないように）
    setup_render(res, a.spp, 0.15 if a.scene == "global" else 0.35)
    camera_object(a.scene, todo)
    if a.scene == "global":
        animate_global_sun(todo)
    print(f"場面を組んだ（{time.time() - t0:.1f} 秒）", flush=True)
    sc = bpy.context.scene
    for f in todo:
        sc.frame_set(f)
        # 雲の中を抜けるところ（atmos.py が雲で覆う）は、覆われる分だけ光の数を減らす（見えないので、早く描く）
        sc.cycles.samples = max(3, int(round(a.spp * (1.0 - 0.8 * P.cloudiness(f / P.FPS)))))
        sc.render.filepath = os.path.join(out, f"{f:04d}.exr")
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"コマ {f}（{f / P.FPS:.2f} 秒）{time.time() - t1:.1f} 秒", flush=True)


if __name__ == "__main__":
    main()
