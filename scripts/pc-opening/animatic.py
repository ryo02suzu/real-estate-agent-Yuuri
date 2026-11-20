"""PC のオープニング CG の粗い下書き（カメラの動きと長さだけを見る動画）のコマを、Blender で描く。

  python animatic.py global [--res 640x360] [--spp 8] [--frames 0-168] [--every 1]
  python animatic.py local ...
  python animatic.py top ...

python は bpy（Blender 5.3 を Python から使う版）を入れたもの。描いたコマは work/animatic/<場面>/<コマ番号>.png。
色は付けない（標高で塗り分けた粗い地面・海・雲海・空だけ）。本番の質感は、この動きが決まってから作る。
場面とカメラの動きは path.py、地形のデータは fetch.py。
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
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import path as P  # noqa: E402
from geo import enu, inside_polygon, pixel_lonlat  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
R_KM = 6371.0088

# 列島が海から現れるとき、一緒に動かす範囲（経度, 緯度）。日本の島々（沖縄・小笠原・北方領土を含む）を囲み、
# 朝鮮半島・台湾・サハリン・沿海州は外す。境目は深い海の中を通す（海の下は見えないので、境目は見えない）
JAPAN = [
    (122.3, 23.6), (122.3, 25.3), (125.0, 26.6), (127.2, 29.6), (128.6, 31.8), (128.2, 33.2), (128.7, 34.2),
    (129.15, 34.78), (129.7, 35.05), (130.5, 35.6), (132.6, 37.6), (135.0, 39.4), (138.6, 41.6), (139.3, 44.0),
    (140.6, 45.75), (141.8, 45.75), (143.8, 44.9), (145.9, 44.6), (147.3, 45.4), (148.9, 45.75), (149.6, 45.4),
    (149.0, 43.6), (146.0, 41.0), (143.8, 37.0), (142.6, 33.5), (143.0, 27.5), (142.6, 23.6),
]


def load(name: str) -> tuple[np.ndarray, dict]:
    with open(os.path.join(WORK, f"{name}.json")) as f:
        meta = json.load(f)
    return np.load(os.path.join(WORK, f"{name}.npy")), meta


def grid_object(name: str, X, Y, Z, elev, face_mask, mat, uv=None) -> bpy.types.Object:
    """格子の点（行は北→南、列は西→東）から、面が上を向いた地面のメッシュを作る。face_mask で使う面を選ぶ。
    uv（行×列×2）を渡すと、画像を貼る座標も付ける"""
    H, W = X.shape
    co = np.stack([X, Y, Z], -1).reshape(-1, 3)
    ii, jj = np.meshgrid(np.arange(H - 1), np.arange(W - 1), indexing="ij")
    v0 = ii * W + jj
    quads = np.stack([v0, v0 + W, v0 + W + 1, v0 + 1], -1)  # 上から見て反時計回り
    if face_mask is not None:
        quads = quads[face_mask]
    quads = quads.reshape(-1, 4)
    used = np.unique(quads)
    remap = np.full(H * W, -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    quads = remap[quads]
    co = co[used].astype(np.float32)
    el = np.asarray(elev, dtype=np.float32).reshape(-1)[used]
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co))
    me.vertices.foreach_set("co", co.ravel())
    nf = len(quads)
    me.loops.add(nf * 4)
    me.loops.foreach_set("vertex_index", quads.ravel().astype(np.int32))
    me.polygons.add(nf)
    me.polygons.foreach_set("loop_start", (np.arange(nf) * 4).astype(np.int32))
    me.update(calc_edges=True)
    try:
        me.shade_smooth()
    except AttributeError:
        me.polygons.foreach_set("use_smooth", np.ones(nf, dtype=bool))
    a = me.attributes.new("elev", "FLOAT", "POINT")
    a.data.foreach_set("value", el)
    if uv is not None:
        uvs = np.asarray(uv, dtype=np.float32).reshape(-1, 2)[used]
        layer = me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", uvs[quads.ravel()].ravel())
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def principled(name: str, color, rough: float, spec: float = 0.5) -> bpy.types.Material:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    return m


def terrain_material() -> bpy.types.Material:
    """地面：標高（m）で塗り分ける（海の下・海辺・森・高い所の岩）"""
    m = principled("terrain", (0.1, 0.12, 0.08), 0.92, 0.3)
    nt = m.node_tree
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_name = "elev"
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = -200.0
    mr.inputs["From Max"].default_value = 3800.0
    cr = nt.nodes.new("ShaderNodeValToRGB")
    stops = [
        (0.0, (0.02, 0.05, 0.08)),
        (0.05, (0.11, 0.12, 0.08)),
        (0.125, (0.07, 0.13, 0.05)),
        (0.425, (0.06, 0.11, 0.045)),
        (0.625, (0.19, 0.18, 0.14)),
        (0.775, (0.32, 0.31, 0.29)),
        (1.0, (0.55, 0.55, 0.56)),
    ]
    els = cr.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1.0)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1.0)
    for pos, col in stops[1:-1]:
        e = els.new(pos)
        e.color = (*col, 1.0)
    nt.links.new(at.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], cr.inputs["Fac"])
    nt.links.new(cr.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
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
    mod = ob.modifiers.new("gn", "NODES")
    mod.node_group = ng
    return ob


def sun_lamp(direction: np.ndarray, energy: float) -> None:
    lamp = bpy.data.lights.new("sun", "SUN")
    lamp.energy = energy
    lamp.angle = math.radians(0.53)
    lamp.color = (1.0, 0.86, 0.72)  # 朝日（少し暖かい色）
    ob = bpy.data.objects.new("sun", lamp)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(direction.tolist()))


def world_sky(strength: float) -> None:
    """空：太陽の高さから計算する空（Blender の Sky Texture）。太陽の円は画面に映るときだけ（照らすのは太陽の光源）"""
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
        s.sun_elevation = math.radians(P.SUN_EL)
        s.sun_rotation = math.radians(P.SUN_AZ)  # 北 0°・東 90°（確かめ済み）
        s.altitude = 2500.0
        skies.append(s)
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Factor"])
    nt.links.new(skies[1].outputs["Color"], mix.inputs[6])
    nt.links.new(skies[0].outputs["Color"], mix.inputs[7])
    bg = nt.nodes["Background"]
    nt.links.new(mix.outputs[2], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength


def world_space() -> None:
    """宇宙に近い高さの空：暗い紺（下書きでは、大気の縁は描かない）"""
    sc = bpy.context.scene
    w = bpy.data.worlds.new("space")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.004, 0.009, 0.025, 1.0)
    bg.inputs["Strength"].default_value = 1.0


def build_global() -> dict:
    h, meta = load("global")
    S = 2
    hh = h[::S, ::S].astype(np.float64)
    lon, lat = pixel_lonlat(meta, h.shape, S)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    e, n, u = enu(LAT, LON, hh * P.EXAG, *P.P0)
    X, Y, Z = e / 1000.0, n / 1000.0, u / 1000.0
    cl = (LON[:-1, :-1] + LON[1:, 1:]) / 2.0
    ca = (LAT[:-1, :-1] + LAT[1:, 1:]) / 2.0
    jp = inside_polygon(cl, ca, JAPAN)
    mat = terrain_material()
    japan = grid_object("japan", X, Y, Z, hh, jp, mat)
    grid_object("world", X, Y, Z, hh, ~jp, mat)
    ocean = principled("ocean", (0.01, 0.035, 0.07), 0.22, 0.5)
    point_sphere("ocean", R_KM, (0.0, 0.0, -R_KM), ocean)
    world_space()
    sun_lamp(P.sun_dir("global"), 6.0)
    return dict(japan=japan, unit_clip=(0.5, 20000.0))


def build_local() -> dict:
    mat = terrain_material()
    near_meta = None
    for name, S in (("near", 3), ("mid", 3)):
        h, meta = load(name)
        hh = h[::S, ::S].astype(np.float64)
        lon, lat = pixel_lonlat(meta, h.shape, S)
        LAT, LON = np.meshgrid(lat, lon, indexing="ij")
        e, n, u = enu(LAT, LON, hh, *P.P1)
        mask = None
        if name == "near":
            near_meta = meta
        else:
            # 細かいデータのある所は抜く（境目は少し重ねる）
            w, s, ee, nn = near_meta["bbox"]
            cl = (LON[:-1, :-1] + LON[1:, 1:]) / 2.0
            ca = (LAT[:-1, :-1] + LAT[1:, 1:]) / 2.0
            mask = ~((cl > w + 0.006) & (cl < ee - 0.006) & (ca > s + 0.005) & (ca < nn - 0.005))
        grid_object(name, e, n, u, hh, mask, mat)
    # 雲海（海抜 1650m あたり、ゆるく波打つ。まわりの低い盆地や谷を埋める）。上高地の谷（飛ぶ所）には置かない
    gx = np.linspace(-60000.0, 160000.0, 360)
    gy = np.linspace(-100000.0, 100000.0, 330)
    GY, GX = np.meshgrid(gy[::-1], gx, indexing="ij")
    rng = np.random.default_rng(3)
    bumps = sum(a * np.sin(GX / l + rng.uniform(0, 6.3)) * np.cos(GY / (l * 1.3) + rng.uniform(0, 6.3)) for a, l in ((45.0, 900.0), (25.0, 380.0), (70.0, 4200.0)))
    GZ = 1650.0 + bumps - (GX**2 + GY**2) / (2.0 * 6371008.8)
    clat = P.P1[0] + np.degrees(GY / 6371008.8)
    clon = P.P1[1] + np.degrees(GX / (6371008.8 * math.cos(math.radians(P.P1[0]))))
    fc_lon = (clon[:-1, :-1] + clon[1:, 1:]) / 2.0
    fc_lat = (clat[:-1, :-1] + clat[1:, 1:]) / 2.0
    valley = [(137.585, 36.215), (137.66, 36.225), (137.72, 36.26), (137.715, 36.32), (137.64, 36.33), (137.585, 36.28)]
    keep = ~inside_polygon(fc_lon, fc_lat, valley)
    cloud = principled("cloudsea", (0.82, 0.84, 0.88), 1.0, 0.2)
    grid_object("cloudsea", GX, GY, GZ, np.zeros_like(GX), keep, cloud)
    world_sky(0.6)
    sun_lamp(P.sun_dir("local"), 4.5)
    return dict(japan=None, unit_clip=(1.0, 400000.0))


def setup_render(res: tuple[int, int], spp: int) -> None:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = spp
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 3
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 0
    sc.cycles.volume_bounces = 0
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.render.use_persistent_data = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.exposure = 0.8


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("scene", choices=["global", "local", "top"])
    ap.add_argument("--res", default="640x360")
    ap.add_argument("--spp", type=int, default=8)
    ap.add_argument("--frames", default="")
    ap.add_argument("--every", type=int, default=1)
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    res = tuple(int(v) for v in a.res.split("x"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    t0 = time.time()
    info = build_global() if a.scene in ("global", "top") else build_local()
    setup_render(res, a.spp)
    sc = bpy.context.scene
    cam = bpy.data.cameras.new("cam")
    cam.sensor_fit = "HORIZONTAL"
    cam.sensor_width = 36.0
    cam.clip_start, cam.clip_end = info["unit_clip"]
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    print(f"場面を組んだ（{time.time() - t0:.1f} 秒）", flush=True)
    frames = P.frames(a.scene)
    if a.frames:
        lo, hi = (int(v) for v in a.frames.split("-"))
        frames = [f for f in frames if lo <= f <= hi]
    frames = frames[:: a.every]
    out = a.out or os.path.join(WORK, "animatic", a.scene)
    os.makedirs(out, exist_ok=True)
    for f in frames:
        path = os.path.join(out, f"{f:04d}.png")
        if os.path.exists(path):
            continue
        c = P.camera(a.scene, f)
        rot = Matrix([c["right"].tolist(), c["up"].tolist(), (-c["fwd"]).tolist()]).transposed()
        co.matrix_world = Matrix.Translation(Vector(c["pos"].tolist())) @ rot.to_4x4()
        cam.lens = c["focal"]
        if info["japan"] is not None:
            info["japan"].location = (0.0, 0.0, P.rise_offset(c["t"]) if a.scene == "global" else 0.0)
        sc.render.filepath = path
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"コマ {f}（{c['t']:.2f} 秒）{time.time() - t1:.1f} 秒", flush=True)


if __name__ == "__main__":
    main()
