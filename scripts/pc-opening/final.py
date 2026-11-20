"""PC のオープニング CG の本番の絵（色と質感）を、Blender で描く。

  python final.py local --frames 345 [--res 1920x1080] [--spp 128] [--out 出力のフォルダ]

python は bpy（Blender 5.3）を入れたもの。下書き（animatic.py）と同じカメラ（path.py）・同じ地形で、
次を重ねる：
  - 地面：近くは国土地理院の航空写真（photo.py で色の偏りを均したもの）、遠くは標高と傾きで塗り分け
  - 雲海：立体の雲（東の盆地を埋める。上の面が波打ち、朝日の側が明るく光る）
  - 空：太陽の高さから計算する朝焼けの空と、朝日の光
  - 空気：遠くほど青白くかすむ層（低い所ほど濃い）。朝日の向きは明るくにじむ
いまは上高地の場面（local）だけ。列島の場面は、このあと足す。
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
from animatic import grid_object, load, principled, sun_lamp, world_sky  # noqa: E402
from geo import TILE, enu, pixel_lonlat  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
R_M = 6371008.8


def node(nt, kind: str, **inputs):
    """シェーダーのノードを足して、入力の値を入れる"""
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def math_node(nt, op: str, a=None, b=None, value=None):
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


def photo_uv(meta: dict, LAT: np.ndarray, LON: np.ndarray) -> np.ndarray:
    """経度・緯度 → 航空写真（つなぎ合わせた1枚）の上の位置（0〜1。下が 0）"""
    n = 2.0 ** meta["z"]
    x = (LON + 180.0) / 360.0 * n
    r = np.radians(LAT)
    y = (1.0 - np.log(np.tan(r) + 1.0 / np.cos(r)) / np.pi) / 2.0 * n
    u = (x - meta["x0"]) / meta["nx"]
    v = 1.0 - (y - meta["y0"]) / meta["ny"]
    return np.stack([u, v], -1)


def terrain_photo_material() -> bpy.types.Material:
    """近くの地面：航空写真の色。細かい凹凸（岩・木の粒）を少し足す"""
    m = principled("terrain_photo", (0.1, 0.12, 0.08), 0.9, 0.25)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(WORK, "near_photo_fix.jpg"))
    tex.interpolation = "Cubic"
    tex.extension = "EXTEND"
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    # 写真は少し明るく鮮やかなので、少し落ち着かせる
    hsv = node(nt, "ShaderNodeHueSaturation", Saturation=0.85, Value=0.92)
    nt.links.new(tex.outputs["Color"], hsv.inputs["Color"])
    nt.links.new(hsv.outputs["Color"], b.inputs["Base Color"])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nz = node(nt, "ShaderNodeTexNoise", Scale=0.08, Detail=8.0, Roughness=0.6)
    nt.links.new(geo.outputs["Position"], nz.inputs["Vector"])
    bump = node(nt, "ShaderNodeBump", Strength=0.25, Distance=2.0)
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def terrain_far_material() -> bpy.types.Material:
    """遠くの地面：標高と傾きで、森・岩肌に塗り分ける（遠くはかすむので、写真は使わない）"""
    m = principled("terrain_far", (0.05, 0.07, 0.04), 0.92, 0.25)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_name = "elev"
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
    # 岩肌の割合：標高 2400〜2800m で増え、急な斜面（法線の上向きが 0.8 より小さい）も岩
    hi = node(nt, "ShaderNodeMapRange", **{"From Min": 2350.0, "From Max": 2800.0})
    nt.links.new(at.outputs["Fac"], hi.inputs["Value"])
    steep = node(nt, "ShaderNodeMapRange", **{"From Min": 0.86, "From Max": 0.62})
    nt.links.new(sep.outputs["Z"], steep.inputs["Value"])
    rock = math_node(nt, "MAXIMUM", hi.outputs["Result"], steep.outputs["Result"])
    nz = node(nt, "ShaderNodeTexNoise", Scale=0.0009, Detail=6.0)
    nt.links.new(geo.outputs["Position"], nz.inputs["Vector"])
    forest = node(nt, "ShaderNodeMix", data_type="RGBA")
    forest.inputs[6].default_value = (0.028, 0.045, 0.022, 1.0)
    forest.inputs[7].default_value = (0.05, 0.065, 0.03, 1.0)
    nt.links.new(nz.outputs["Fac"], forest.inputs["Factor"])
    mix = node(nt, "ShaderNodeMix", data_type="RGBA")
    nt.links.new(rock, mix.inputs["Factor"])
    nt.links.new(forest.outputs[2], mix.inputs[6])
    mix.inputs[7].default_value = (0.13, 0.12, 0.11, 1.0)
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    return m


def shell_object(name: str, x0: float, x1: float, y0: float, y1: float, h_bot: float, h_top: float, mat, n: int = 120):
    """地球の丸みに沿った、厚みのある板（閉じた形。雲や空気の入れ物）"""
    xs = np.linspace(x0, x1, n)
    ys = np.linspace(y1, y0, n)
    Y, X = np.meshgrid(ys, xs, indexing="ij")
    drop = (X**2 + Y**2) / (2.0 * R_M)
    top = np.stack([X, Y, h_top - drop], -1).reshape(-1, 3)
    bot = np.stack([X, Y, h_bot - drop], -1).reshape(-1, 3)
    co = np.vstack([top, bot]).astype(np.float32)
    N = n * n
    faces = []
    for i in range(n - 1):
        for j in range(n - 1):
            v0 = i * n + j
            faces.append((v0, v0 + n, v0 + n + 1, v0 + 1))  # 上の面（上向き）
            faces.append((N + v0, N + v0 + 1, N + v0 + n + 1, N + v0 + n))  # 下の面（下向き）
    ring = [(0, j) for j in range(n)] + [(i, n - 1) for i in range(1, n)] + [(n - 1, j) for j in range(n - 2, -1, -1)] + [(i, 0) for i in range(n - 2, 0, -1)]
    for k in range(len(ring)):
        a = ring[k][0] * n + ring[k][1]
        b = ring[(k + 1) % len(ring)][0] * n + ring[(k + 1) % len(ring)][1]
        faces.append((a, N + a, N + b, b))
    me = bpy.data.meshes.new(name)
    me.from_pydata(co.tolist(), [], faces)
    me.update(calc_edges=True)
    me.validate()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def cloud_material() -> bpy.types.Material:
    """雲海：地球の丸みに沿った海抜 h の、波打つ上の面より下を濃い雲にする（朝日の側は前へ強く散って明るく光る）"""
    m = bpy.data.materials.new("cloudsea")
    m.use_nodes = True
    nt = m.node_tree
    for nn in list(nt.nodes):
        if nn.type == "BSDF_PRINCIPLED":
            nt.nodes.remove(nn)
    out = nt.nodes["Material Output"]
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    x, y, z = sep.outputs["X"], sep.outputs["Y"], sep.outputs["Z"]
    r2 = math_node(nt, "ADD", math_node(nt, "MULTIPLY", x, x), math_node(nt, "MULTIPLY", y, y))
    h = math_node(nt, "ADD", z, math_node(nt, "DIVIDE", r2, 2.0 * R_M))
    # 上の面：大きなうねり（約 6km）・中くらい（約 1km）・細かい盛り上がり（約 150m）
    top = None
    for scale, amp in ((1.0 / 6000.0, 260.0), (1.0 / 1100.0, 110.0), (1.0 / 180.0, 34.0)):
        nz = node(nt, "ShaderNodeTexNoise", Scale=scale, Detail=4.0, Roughness=0.55)
        nt.links.new(geo.outputs["Position"], nz.inputs["Vector"])
        term = math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", nz.outputs["Fac"], 0.5), amp)
        top = term if top is None else math_node(nt, "ADD", top, term)
    top = math_node(nt, "ADD", top, 1640.0)
    d = math_node(nt, "SUBTRACT", top, h)  # 上の面からの深さ（m）
    soft = node(nt, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", **{"From Min": -25.0, "From Max": 90.0})
    nt.links.new(d, soft.inputs["Value"])
    dens = math_node(nt, "MULTIPLY", soft.outputs["Result"], 0.035)
    vol = node(nt, "ShaderNodeVolumePrincipled", Anisotropy=0.55)
    vol.inputs["Color"].default_value = (0.97, 0.97, 0.98, 1.0)
    nt.links.new(dens, vol.inputs["Density"])
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    return m


def haze_material(name: str, density: float, color, aniso: float) -> bpy.types.Material:
    """空気のかすみ（一様。遠くほど青白くかすみ、朝日の向きは明るくにじむ）"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for nn in list(nt.nodes):
        if nn.type == "BSDF_PRINCIPLED":
            nt.nodes.remove(nn)
    vol = node(nt, "ShaderNodeVolumePrincipled", Density=density, Anisotropy=aniso)
    vol.inputs["Color"].default_value = (*color, 1.0)
    nt.links.new(vol.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
    return m


def box_object(name: str, lo, hi, mat):
    me = bpy.data.meshes.new(name)
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    co = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me.from_pydata(co, [], faces)
    me.update()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_local() -> None:
    near, near_meta = load("near")
    with open(os.path.join(WORK, "near_photo.json")) as f:
        photo_meta = json.load(f)
    S = 2
    hh = near[::S, ::S].astype(np.float64)
    lon, lat = pixel_lonlat(near_meta, near.shape, S)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    e, n, u = enu(LAT, LON, hh, *P.P1)
    grid_object("near", e, n, u, hh, None, terrain_photo_material(), uv=photo_uv(photo_meta, LAT, LON))
    mid, mid_meta = load("mid")
    S = 2
    hh = mid[::S, ::S].astype(np.float64)
    lon, lat = pixel_lonlat(mid_meta, mid.shape, S)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    e, n, u = enu(LAT, LON, hh, *P.P1)
    w, s, ee, nn = near_meta["bbox"]
    cl = (LON[:-1, :-1] + LON[1:, 1:]) / 2.0
    ca = (LAT[:-1, :-1] + LAT[1:, 1:]) / 2.0
    mask = ~((cl > w + 0.006) & (cl < ee - 0.006) & (ca > s + 0.005) & (ca < nn - 0.005))
    grid_object("mid", e, n, u, hh, mask, terrain_far_material())
    # 雲海（東の盆地。稜線より東）
    shell_object("cloudsea", 4200.0, 150000.0, -95000.0, 95000.0, 1050.0, 2080.0, cloud_material(), n=90)
    # 空気のかすみ（低い所ほど濃い 3 段。空の色は Sky Texture に大気が入っているので、高い所は薄くして二重にかすませない）
    for name, z0, z1, dens in (("haze_0", -4000.0, 1800.0, 1.1e-5), ("haze_1", 1800.0, 3000.0, 4.0e-6), ("haze_2", 3000.0, 6000.0, 6.0e-7)):
        box_object(name, (-150000.0, -150000.0, z0), (180000.0, 150000.0, z1), haze_material(name, dens, (0.86, 0.9, 1.0), 0.65))
    world_sky(0.55)
    # 空はカメラの高さ（約 3400m）から見た色にし、朝の空気の細かいちり（かすみ）を少し多めに
    for s in bpy.context.scene.world.node_tree.nodes:
        if s.type == "TEX_SKY":
            s.altitude = 3400.0
            s.aerosol_density = 2.2
    sun_lamp(P.sun_dir("local"), 12.0)
    # 朝日の光は、高さ 5° の太陽の色（赤みが強い）
    bpy.data.lights["sun"].color = (1.0, 0.62, 0.36)


def setup(res, spp: int) -> None:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = spp
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 0
    sc.cycles.volume_bounces = 2
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.render.use_persistent_data = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    sc.view_settings.exposure = -1.6
    finish()


def finish() -> None:
    """仕上げ：明るい所（朝日・光る雲の縁）のまわりに、レンズと空気による光のにじみを足す"""
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new("finish", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    sc.compositing_node_group = ng
    sc.render.use_compositing = True
    sc.render.compositor_device = "CPU"  # この作業場所には GPU が無い
    rl = ng.nodes.new("CompositorNodeRLayers")
    gl = ng.nodes.new("CompositorNodeGlare")
    for kind in ("Bloom", "BLOOM", "Fog Glow", "FOG_GLOW"):
        try:
            gl.inputs["Type"].default_value = kind
            break
        except (TypeError, ValueError):
            continue
    try:
        gl.inputs["Quality"].default_value = "High"
    except (TypeError, ValueError):
        pass
    # にじみは太陽の円のまわりだけ、ほんのりと（強いレンズフレアは使わない）
    gl.inputs["Threshold"].default_value = 3.0
    gl.inputs["Strength"].default_value = 0.18
    out = ng.nodes.new("NodeGroupOutput")
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ng.links.new(gl.outputs["Image"], out.inputs[0])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("scene", choices=["local"])
    ap.add_argument("--frames", required=True)
    ap.add_argument("--res", default="1920x1080")
    ap.add_argument("--spp", type=int, default=128)
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    res = tuple(int(v) for v in a.res.split("x"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    t0 = time.time()
    build_local()
    setup(res, a.spp)
    sc = bpy.context.scene
    cam = bpy.data.cameras.new("cam")
    cam.sensor_fit = "HORIZONTAL"
    cam.sensor_width = 36.0
    cam.clip_start, cam.clip_end = 1.0, 600000.0
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    print(f"場面を組んだ（{time.time() - t0:.1f} 秒）", flush=True)
    frames = [int(v) for v in a.frames.split(",")]
    out = a.out or os.path.join(WORK, "final", a.scene)
    os.makedirs(out, exist_ok=True)
    for f in frames:
        c = P.camera(a.scene, f)
        rot = Matrix([c["right"].tolist(), c["up"].tolist(), (-c["fwd"]).tolist()]).transposed()
        co.matrix_world = Matrix.Translation(Vector(c["pos"].tolist())) @ rot.to_4x4()
        cam.lens = c["focal"]
        sc.render.filepath = os.path.join(out, f"{f:04d}.png")
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"コマ {f}（{c['t']:.2f} 秒）{time.time() - t1:.1f} 秒", flush=True)


if __name__ == "__main__":
    main()
