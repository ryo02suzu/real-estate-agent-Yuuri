"""スマホのオープニング「富士の目覚め」の「面」（地形・空・太陽）を Blender（Cycles）で描く。

  python film.py --frames 45,84,126 [--scale 1.0] [--spp 32] [--threads 2] [--preview]

python は bpy（Blender 5.3）を入れたもの。描くのは面だけ（雲と空気は clouds.py が体積で描き、post.py が合わせる）：
  - 富士山：国土地理院の標高（山頂のまわりと西の面は 5m（dem5a）、山全体は 10m、まわりは 約15m）
  - 雪（4月下旬の残雪。沢に残り、尾根は地肌。縁は風で削られて鋭い。夜に凍り直した薄い氷のつや。光が中で散る）、
    火山の砂礫（黒〜赤茶。凍った所だけ薄く光る）、森（針葉樹と芽吹き前のカラマツ）。溶岩の筋・沢・砂礫のざらつきは
    細かい起伏（山頂から放射状にのびる模様）で
  - 雲海の上面（カメラには映さない。富士の低い所へ照り返す光と、雲の影のため）
  - 空（Blender の空の計算）と太陽（本当の大きさ 0.53°）
出力は work/film/<コマ>.exr（光の量そのまま（線形）の色・奥行き・物の番号）。2 倍の大きさ（2160×4680）で描く。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common as C  # noqa: E402

import numpy as np  # noqa: E402

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import cloudfield as CF  # noqa: E402
import path as P  # noqa: E402
import terrain as TR  # noqa: E402
from geo import enu, pixel_lonlat  # noqa: E402

CLOUD_CUT = 1050.0  # これより低い所は雲海の下（作らない）
BAND = 0.0003  # 細かいデータと粗いデータの重なり（度、約 30m）


# ---------------------------------------------------------------- 道具（PC の film.py と同じ作り）


def node(nt, kind: str, **inputs):
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


def material(name: str):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes["Principled BSDF"]


def mesh_object(name: str, co: np.ndarray, quads: np.ndarray, mat, attrs: dict | None = None):
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
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def box_blur(a: np.ndarray, r: int) -> np.ndarray:
    """箱形のぼかし（半径 r 画素。Blender の python には scipy が無いので累積和で）"""
    p = np.pad(a, r, mode="edge").astype(np.float64)
    c = np.pad(np.cumsum(np.cumsum(p, 0), 1), ((1, 0), (1, 0)))
    k = 2 * r + 1
    return ((c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)).astype(np.float32)


# ---------------------------------------------------------------- 地形


def dem_grid(name: str, stride: int, keep_fn, dip=None):
    """標高のつなぎ合わせから、格子のメッシュの点と面を作る。keep_fn(緯度, 経度, 面の最も高い所) で使う面を選ぶ。
    dip=(箱, 幅, 深さ)：箱の外の点を幅（度）の間で深さ m だけ沈める（重なる粗いデータの面が上に出て、つなぎ目が見えない）"""
    h, meta = TR.dem(name)
    hh = h[::stride, ::stride].astype(np.float64)
    lon, lat = pixel_lonlat(meta, h.shape, stride)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    cell = 40075016.7 * math.cos(math.radians(35.36)) / (2 ** meta["z"] * 256) * stride
    # 沢（へこみ）と尾根（出っ張り）：まわりの平均との差（m）。沢は正、尾根は負
    v1 = box_blur(hh, max(1, int(round(25.0 / cell)))) - hh
    v2 = box_blur(hh, max(1, int(round(90.0 / cell)))) - hh
    valley = 0.55 * v1 + 0.45 * v2
    if dip is not None:
        (w0, s0, e0, n0), band, depth = dip
        out = np.maximum.reduce([w0 - LON, LON - e0, s0 - LAT, LAT - n0, np.zeros_like(LAT)])
        hh = hh - depth * np.clip(out / band, 0.0, 1.0)
    X, Y, Z = enu(LAT, LON, hh, *C.SUMMIT)
    Hh, Ww = hh.shape
    fl = (LAT[:-1, :-1] + LAT[1:, 1:]) / 2
    fo = (LON[:-1, :-1] + LON[1:, 1:]) / 2
    fmax = np.maximum(np.maximum(hh[:-1, :-1], hh[1:, 1:]), np.maximum(hh[:-1, 1:], hh[1:, :-1]))
    mask = keep_fn(fl, fo, fmax)
    ii, jj = np.meshgrid(np.arange(Hh - 1), np.arange(Ww - 1), indexing="ij")
    v0 = ii * Ww + jj
    quads = np.stack([v0, v0 + Ww, v0 + Ww + 1, v0 + 1], -1)[mask].reshape(-1, 4)
    used = np.unique(quads)
    remap = np.full(Hh * Ww, -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    quads = remap[quads]
    co = np.stack([X, Y, Z], -1).reshape(-1, 3)[used].astype(np.float32)
    elev = h[::stride, ::stride].reshape(-1)[used]
    print(f"  {name}（{stride} 画素ごと）: 点 {len(used):,}、面 {len(quads):,}", flush=True)
    return co, quads, {"elev": elev, "valley": valley.reshape(-1)[used]}


def build_terrain(mat) -> None:
    _, m5 = TR.dem("dem5a")
    _, m14 = TR.dem("dem14")
    w5, s5, e5, n5 = m5["bbox"]
    box5 = (w5 + 0.002, s5 + 0.002, e5 - 0.002, n5 - 0.002)
    core = (C.SUMMIT[1] - 0.024, C.SUMMIT[0] - 0.019, C.SUMMIT[1] + 0.024, C.SUMMIT[0] + 0.019)  # 山頂のまわり 約 ±2.1km
    w14, s14, e14, n14 = m14["bbox"]
    box14 = (w14 + 0.002, s14 + 0.002, e14 - 0.002, n14 - 0.002)

    def inb(b, fl, fo, m=0.0):
        return (fo > b[0] + m) & (fo < b[2] - m) & (fl > b[1] + m) & (fl < b[3] - m)

    # 山頂のまわり：5m を 1 画素ごと（約 3.9m）
    co, q, at = dem_grid("dem5a", 1, lambda fl, fo, fm: inb(core, fl, fo, -BAND), dip=(core, BAND, 2.5))
    mesh_object("fuji_core", co, q, mat, at).pass_index = 1
    # 西の面と左右の肩：5m を 2 画素ごと（約 7.8m）。山頂のまわりは上の面にまかせる
    co, q, at = dem_grid("dem5a", 2, lambda fl, fo, fm: inb(box5, fl, fo, -BAND) & ~inb(core, fl, fo) & (fm > CLOUD_CUT), dip=(box5, BAND, 2.5))
    mesh_object("fuji_5m", co, q, mat, at).pass_index = 1
    # 山全体：10m を 2 画素ごと（5m の箱の外。カメラから見えない東側が多く、影と輪郭のため）
    co, q, at = dem_grid("dem14", 2, lambda fl, fo, fm: inb(box14, fl, fo, -BAND) & ~inb(box5, fl, fo) & (fm > CLOUD_CUT), dip=(box14, 2 * BAND, 2.5))
    mesh_object("fuji_10m", co, q, mat, at).pass_index = 1
    # まわり：約 15m を 2 画素ごと（10m の箱の外。雲海の上に出る山だけ）
    co, q, at = dem_grid("dem13", 2, lambda fl, fo, fm: ~inb(box14, fl, fo) & (fm > CLOUD_CUT))
    if len(q):
        mesh_object("around", co, q, mat, at).pass_index = 1


def fuji_material(preview: bool):
    """4月下旬の富士：残雪（沢に沿って低くまで、尾根と急な岩は地肌。縁は鋭く、少しぎざぎざ）、夜に凍り直した雪面の
    薄い氷のつや（光る所と光らない所のむら）、火山の砂礫（黒〜赤茶、凍った所だけ薄く光る）、森（針葉樹・芽吹き前の
    カラマツ・低い所の芽吹き）。溶岩の筋と沢は、山頂から放射状にのびる細かい起伏で"""
    m, nt, b = material("fuji")
    el = node(nt, "ShaderNodeAttribute", attribute_name="elev").outputs["Fac"]
    va = node(nt, "ShaderNodeAttribute", attribute_name="valley").outputs["Fac"]
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    link(nt, geo.outputs["Normal"], sep.inputs["Vector"])
    up = sep.outputs["Z"]
    south = math_node(nt, "MAXIMUM", math_node(nt, "MULTIPLY", sep.outputs["Y"], -1.0), 0.0)
    # 山頂から放射状の座標（溶岩の筋・沢の向き）：r（山頂からの距離）と、まわりの長さ（角度 × r）
    ps = nt.nodes.new("ShaderNodeSeparateXYZ")
    link(nt, pos, ps.inputs["Vector"])
    r = math_node(nt, "SQRT", math_node(nt, "ADD", math_node(nt, "MULTIPLY", ps.outputs["X"], ps.outputs["X"]),
                                        math_node(nt, "MULTIPLY", ps.outputs["Y"], ps.outputs["Y"])))
    ang = math_node(nt, "ARCTAN2", ps.outputs["Y"], ps.outputs["X"])
    arc = math_node(nt, "MULTIPLY", ang, r)
    rad = nt.nodes.new("ShaderNodeCombineXYZ")
    link(nt, math_node(nt, "DIVIDE", r, 9.0), rad.inputs["X"])  # 下り方向に長く
    link(nt, math_node(nt, "DIVIDE", arc, 1.0), rad.inputs["Y"])  # 横に細かく
    link(nt, math_node(nt, "DIVIDE", ps.outputs["Z"], 3.0), rad.inputs["Z"])
    ribs = node(nt, "ShaderNodeTexNoise", Scale=1.0 / 9.0, Detail=5.0, Roughness=0.62)
    link(nt, rad.outputs["Vector"], ribs.inputs["Vector"])
    big = node(nt, "ShaderNodeTexNoise", Scale=1.0 / 700.0, Detail=5.0, Roughness=0.6)
    link(nt, pos, big.inputs["Vector"])
    mid = node(nt, "ShaderNodeTexNoise", Scale=1.0 / 80.0, Detail=5.0, Roughness=0.6)
    link(nt, pos, mid.inputs["Vector"])
    fine = node(nt, "ShaderNodeTexNoise", Scale=1.0 / 7.0, Detail=4.0, Roughness=0.7)
    link(nt, pos, fine.inputs["Vector"])
    n1, n2, nr, nf = big.outputs["Fac"], mid.outputs["Fac"], ribs.outputs["Fac"], fine.outputs["Fac"]
    # 森（針葉樹は暗い緑、芽吹き前のカラマツは灰茶、低い所に芽吹きの淡い緑）
    forest = mix_rgb(nt, map_range(nt, n1, 0.38, 0.62), (0.020, 0.033, 0.024), (0.085, 0.074, 0.060))
    spring = mix_rgb(nt, map_range(nt, n2, 0.35, 0.65), (0.048, 0.072, 0.030), (0.068, 0.088, 0.042))
    forest = mix_rgb(nt, math_node(nt, "MULTIPLY", map_range(nt, el, 1700.0, 1400.0), 0.6), forest, spring)
    # 火山の砂礫と岩（黒〜赤茶。溶岩の筋で明暗）
    scoria = mix_rgb(nt, map_range(nt, nr, 0.3, 0.72), (0.040, 0.030, 0.027), (0.105, 0.064, 0.048))
    scoria = mix_rgb(nt, map_range(nt, n2, 0.55, 0.8), scoria, (0.075, 0.072, 0.07))
    tl = math_node(nt, "ADD", el, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", n1, 0.5), 280.0))
    c = mix_rgb(nt, map_range(nt, tl, 2350.0, 2520.0), forest, scoria)
    # 残雪：雪の線 約 2,500m（ぎざぎざ）。沢では下まで、尾根・南向きでは上まで。急な所（約 45° 以上）は地肌
    line = math_node(nt, "ADD", el, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", n1, 0.5), 300.0))
    line = math_node(nt, "ADD", line, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", nr, 0.5), 160.0))
    line = math_node(nt, "ADD", line, math_node(nt, "MULTIPLY", va, 11.0))
    line = math_node(nt, "SUBTRACT", line, math_node(nt, "MULTIPLY", south, 240.0))
    cover = map_range(nt, line, 2470.0, 2530.0)  # 縁は鋭く（風で削られた縁）
    hold = map_range(nt, up, 0.72, 0.80)
    snow = math_node(nt, "MULTIPLY", cover, hold)
    # 雪線より下の沢に残る細い雪（2,100m くらいまで）
    gl = math_node(nt, "ADD", el, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", n2, 0.5), 220.0))
    gully = math_node(nt, "MULTIPLY", map_range(nt, gl, 2080.0, 2200.0), map_range(nt, va, 4.0, 7.0))
    snow = math_node(nt, "MAXIMUM", snow, math_node(nt, "MULTIPLY", gully, map_range(nt, up, 0.64, 0.74)))
    # 縁の細かいぎざぎざ（雪と地肌の境）
    snow = map_range(nt, math_node(nt, "ADD", snow, math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", nf, 0.5), 0.5)), 0.35, 0.65)
    snow_c = mix_rgb(nt, map_range(nt, n2, 0.3, 0.7), (0.80, 0.82, 0.86), (0.86, 0.875, 0.905))
    c = mix_rgb(nt, snow, c, snow_c)
    link(nt, c, b.inputs["Base Color"])
    # 粗さ：雪 0.5、地肌 0.92
    link(nt, math_node(nt, "SUBTRACT", 0.92, math_node(nt, "MULTIPLY", snow, 0.42)), b.inputs["Roughness"])
    b.inputs["Specular IOR Level"].default_value = 0.35
    # 雪は光が中で散る（影の所は空の青を吸った色に）
    link(nt, math_node(nt, "MULTIPLY", snow, 0.65), b.inputs["Subsurface Weight"])
    b.inputs["Subsurface Radius"].default_value = (0.55, 0.78, 1.0)
    b.inputs["Subsurface Scale"].default_value = 0.08
    b.subsurface_method = "BURLEY"
    # 夜に凍り直した雪面の薄い氷（つやのむら）と、凍った砂礫
    glaze = math_node(nt, "MULTIPLY", map_range(nt, n2, 0.42, 0.62), 0.55)
    ice = math_node(nt, "ADD", math_node(nt, "MULTIPLY", snow, glaze),
                    math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", 1.0, snow), map_range(nt, nf, 0.6, 0.75)),
                              math_node(nt, "MULTIPLY", map_range(nt, el, 2300.0, 2600.0), 0.25)))
    link(nt, ice, b.inputs["Coat Weight"])
    b.inputs["Coat Roughness"].default_value = 0.09
    b.inputs["Coat IOR"].default_value = 1.31
    if not preview:
        # 細かい起伏：溶岩の筋・沢（放射状）＋砂礫のざらつき。氷の面は風紋で細かく波打つ（きらめきのむら）
        hgt = math_node(nt, "ADD", math_node(nt, "MULTIPLY", nr, 1.0), math_node(nt, "MULTIPLY", nf, 0.45))
        bump = node(nt, "ShaderNodeBump", Strength=0.6, Distance=3.0)
        link(nt, hgt, bump.inputs["Height"])
        link(nt, bump.outputs["Normal"], b.inputs["Normal"])
        rip = node(nt, "ShaderNodeTexNoise", Scale=1.0 / 2.5, Detail=3.0, Roughness=0.6)
        link(nt, pos, rip.inputs["Vector"])
        cb = node(nt, "ShaderNodeBump", Strength=0.35, Distance=1.0)
        link(nt, rip.outputs["Fac"], cb.inputs["Height"])
        link(nt, cb.outputs["Normal"], b.inputs["Coat Normal"])
    return m


# ---------------------------------------------------------------- 雲海の上面（カメラには映さない）・空・太陽


def build_cloud_surface() -> None:
    """雲海の上面を、カメラの通り道を中心に張る（カメラには映さない。富士の低い所への照り返しと、雲の影のため）"""
    c = P.camera(int(round(4.2 * C.FPS)))["pos"]
    r = np.geomspace(60.0, 120000.0, 520)
    th = np.linspace(0.0, 2 * np.pi, 720, endpoint=False)
    R, TH = np.meshgrid(r, th, indexing="ij")
    X = c[0] + R * np.sin(TH)
    Y = c[1] + R * np.cos(TH)
    Z = CF.top(X, Y) - (X**2 + Y**2) / (2.0 * 6371008.8)
    co = np.stack([X, Y, Z], -1).reshape(-1, 3)
    nr, na = len(r), len(th)
    i, j = np.meshgrid(np.arange(nr - 1), np.arange(na), indexing="ij")
    v0 = i * na + j
    v1 = i * na + (j + 1) % na
    quads = np.stack([v0, v1, v1 + na, v0 + na], -1).reshape(-1, 4)
    m, nt, b = material("cloudtop")
    b.inputs["Base Color"].default_value = (0.92, 0.92, 0.93, 1.0)
    b.inputs["Roughness"].default_value = 1.0
    b.inputs["Specular IOR Level"].default_value = 0.0
    ob = mesh_object("cloudsea", co, quads, m)
    ob.pass_index = 2
    ob.visible_camera = False  # 雲は clouds.py が体積で描く


def sky_world(az: float, el: float) -> None:
    sc = bpy.context.scene
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    skies = []
    for disc in (True, False):
        s = nt.nodes.new("ShaderNodeTexSky")
        s.sky_type = "MULTIPLE_SCATTERING"
        s.sun_disc = disc
        s.sun_size = math.radians(0.533)  # 本当の大きさ
        s.sun_elevation = math.radians(el)
        s.sun_rotation = math.radians(az)  # 北 0°・東 90°（PC の film.py で確かめ済み）
        s.altitude = 1500.0
        s.aerosol_density = 1.5  # 春のかすみ（広いもやは控えめに。太陽のまわりの光は clouds.py のちりで）
        skies.append(s)
    lp = nt.nodes.new("ShaderNodeLightPath")
    c = mix_rgb(nt, lp.outputs["Is Camera Ray"], skies[1].outputs["Color"], skies[0].outputs["Color"])
    bg = nt.nodes["Background"]
    link(nt, c, bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.38


def sun_lamp(direction: np.ndarray, el: float) -> None:
    lamp = bpy.data.lights.new("sun", "SUN")
    lamp.energy = 14.0
    lamp.angle = math.radians(0.533)
    lamp.color = C.sun_color(el)
    ob = bpy.data.objects.new("sun", lamp)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(direction.tolist()))


def setup_render(w: int, h: int, spp: int, threads: int, preview: bool, denoise: bool = False) -> None:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = spp
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    # ノイズ除去：かけた絵と、かける前の絵の両方を書き出し、post.py で 7:3 に混ぜる（かけすぎてのっぺりしないように）
    sc.cycles.use_denoising = preview or denoise
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.denoising_prefilter = "ACCURATE"
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 0
    sc.cycles.volume_bounces = 0
    sc.cycles.sample_clamp_indirect = 6.0
    sc.render.use_persistent_data = True
    sc.render.use_motion_blur = False
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.threads_mode = "FIXED"
    sc.render.threads = threads
    vl = sc.view_layers[0]
    vl.use_pass_z = True
    vl.use_pass_object_index = True
    vl.cycles.denoising_store_passes = denoise
    st = sc.render.image_settings
    st.media_type = "MULTI_LAYER_IMAGE"
    st.file_format = "OPEN_EXR_MULTILAYER"
    st.color_depth = "32"
    st.exr_codec = "ZIP"
    sc.view_settings.view_transform = "Standard"


def place_camera(c: dict) -> None:
    sc = bpy.context.scene
    if sc.camera is None:
        cam = bpy.data.cameras.new("cam")
        cam.sensor_fit = "HORIZONTAL"
        cam.sensor_width = 36.0
        cam.clip_start, cam.clip_end = 0.5, 400000.0
        co = bpy.data.objects.new("cam", cam)
        sc.collection.objects.link(co)
        sc.camera = co
        co.rotation_mode = "QUATERNION"
    co = sc.camera
    rot = Matrix([c["right"].tolist(), c["up"].tolist(), (-c["fwd"]).tolist()]).transposed()
    co.rotation_quaternion = rot.to_quaternion()
    co.location = Vector(c["pos"].tolist())
    co.data.lens = c["focal"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default="126")
    ap.add_argument("--scale", type=float, default=1.0, help="2 倍の大きさ（2160×4680）に対する割合")
    ap.add_argument("--spp", type=int, default=32)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--denoise", action="store_true", help="ノイズ除去をかけ、かける前の絵も残す（本番の 1 倍の大きさ用）")
    ap.add_argument("--out", default="")
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:])
    p = P.plan()
    sv = np.asarray(p["sun_vec"], float)
    az = math.degrees(math.atan2(sv[0], sv[1])) % 360.0
    el = math.degrees(math.asin(sv[2]))
    w, h = int(round(C.W * C.SS * a.scale)), int(round(C.H * C.SS * a.scale))
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_terrain(fuji_material(a.preview))
    build_cloud_surface()
    sky_world(az, el)
    sun_lamp(sv, el)
    setup_render(w, h, a.spp, a.threads, a.preview, a.denoise)
    print(f"場面を組んだ（{time.time() - t0:.1f} 秒）。太陽 方位 {az:.2f}° 高さ {el:.2f}°（原点の座標で）", flush=True)
    out = a.out or os.path.join(C.WORK, "film")
    os.makedirs(out, exist_ok=True)
    log = {}
    for f in [int(v) for v in a.frames.split(",")]:
        place_camera(P.camera(f, p))
        bpy.context.scene.render.filepath = os.path.join(out, f"{f:04d}.exr")
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        log[f] = time.time() - t1
        print(f"コマ {f}（{f / C.FPS:.2f} 秒）{w}×{h}・{a.spp} サンプル：{log[f]:.1f} 秒", flush=True)
    with open(os.path.join(out, "times.json"), "a") as fh:
        fh.write(json.dumps(dict(w=w, h=h, spp=a.spp, threads=a.threads, times=log)) + "\n")


if __name__ == "__main__":
    main()
