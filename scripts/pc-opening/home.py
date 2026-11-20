"""真上から見た日本（オープニングの最後・PC のホームの背景）を、PC の地図と同じメルカトル図法・同じ縮尺で描く。

  python home.py [--view 1440x900] [--scale 2] [--spp 24] [--out 出力]

python は bpy（Blender 5.3）を入れたもの。地面の色は home_prep.py の work/home_albedo.png、起伏は work/home_dem.npy。
PC のホームの地図（components/live-map.tsx）は、最初に日本全体（lib/map-style.ts の JAPAN_BOUNDS）を、画面の枠
（components/desktop-shell.tsx の PAD_X・RAIL・GAP・PAD_Y・TOP に 8px を足した余白）の内側に収める（ズームは 5 より
引かない）。ここではその計算を同じようにして、地図とぴったり重なる範囲を、真上から（ゆがみの無いカメラで）描く。
1 単位 = ズーム 5 の地図の 1 画素（世界の幅 512×2^5 = 16384）。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from animatic import grid_object, principled  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
JAPAN_BOUNDS = ((128.6, 30.9), (145.9, 45.6))  # lib/map-style.ts と同じ
MIN_ZOOM = 5.0
EARTH = 40075016.7  # 赤道の長さ（m）


def merc(lon: float, lat: float) -> tuple[float, float]:
    """経度・緯度 → メルカトルの位置（0〜1。左上が 0）"""
    r = math.radians(lat)
    return (lon + 180.0) / 360.0, (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0


def home_view(W: int, H: int) -> tuple[float, float, float]:
    """PC のホームの地図の最初の見え方（ズームと、画面の真ん中のメルカトルの位置）。MapLibre の fitBounds と同じ考え方"""
    pad_l, pad_r = 16 + 76 + 12 + 8, 16 + 8  # 左：PAD_X + RAIL + GAP + 8、右：PAD_X + 8（ホームでは右のカルテは無い）
    pad_t, pad_b = 12 + 56 + 12 + 8, 12 + 8  # 上：PAD_Y + TOP + GAP + 8、下：PAD_Y + 8
    (w, s), (e, n) = JAPAN_BOUNDS
    x0, y1 = merc(w, s)
    x1, y0 = merc(e, n)
    zx = math.log2((W - pad_l - pad_r) / ((x1 - x0) * 512))
    zy = math.log2((H - pad_t - pad_b) / ((y1 - y0) * 512))
    z = max(MIN_ZOOM, min(zx, zy))
    world = 512 * 2**z
    # 範囲の真ん中が、余白の内側の真ん中に来る
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    sx = pad_l + (W - pad_l - pad_r) / 2
    sy = pad_t + (H - pad_t - pad_b) / 2
    return z, cx + (W / 2 - sx) / world, cy + (H / 2 - sy) / world


def build(view_mx: float, view_my: float, zoom: float, exag: float) -> None:
    with open(os.path.join(WORK, "home_dem.json")) as f:
        meta = json.load(f)
    dem = np.load(os.path.join(WORK, "home_dem.npy"))
    S = 4
    h = dem[::S, ::S].astype(np.float64)
    Hf, Wf = dem.shape
    n = 2.0 ** meta["z"]
    cols = np.arange(0, Wf, S) + 0.5 * S
    rows = np.arange(0, Hf, S) + 0.5 * S
    mx = (meta["x0"] + cols / 256.0) / n
    my = (meta["y0"] + rows / 256.0) / n
    MX, MY = np.meshgrid(mx, my)
    world = 512 * 2**zoom
    X = (MX - view_mx) * world
    Y = -(MY - view_my) * world
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * MY))))
    m_per_unit = EARTH * np.cos(np.radians(lat)) / world
    Z = np.where(h > 0, h, 0.0) * exag / m_per_unit
    uv = np.stack([cols[None, :].repeat(len(rows), 0) / Wf, 1.0 - rows[:, None].repeat(len(cols), 1) / Hf], -1)
    mat = principled("ground", (0.1, 0.1, 0.1), 0.9, 0.3)
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(WORK, "home_albedo.png"))
    tex.interpolation = "Cubic"
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    # 海は少しなめらかに光る（透明度＝陸の割合）
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.32
    rough.inputs["To Max"].default_value = 0.92
    nt.links.new(tex.outputs["Alpha"], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], b.inputs["Roughness"])
    grid_object("japan", X, Y, Z, h, None, mat, uv=uv)


def lights() -> None:
    sc = bpy.context.scene
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.36, 0.52, 0.80, 1.0)
    bg.inputs["Strength"].default_value = 0.35
    lamp = bpy.data.lights.new("sun", "SUN")
    lamp.energy = 4.2
    lamp.angle = math.radians(0.53)
    lamp.color = (1.0, 0.88, 0.74)  # 朝の光（少し暖かい）
    ob = bpy.data.objects.new("sun", lamp)
    sc.collection.objects.link(ob)
    az, el = math.radians(115.0), math.radians(26.0)
    d = (math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el))
    from mathutils import Vector

    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(d))


def finish(haze: float) -> None:
    """仕上げ：宇宙から見たときの、空気のうっすらした青いかすみ"""
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new("finish", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    sc.compositing_node_group = ng
    sc.render.use_compositing = True
    sc.render.compositor_device = "CPU"
    rl = ng.nodes.new("CompositorNodeRLayers")
    mix = ng.nodes.new("ShaderNodeMix")  # Blender 5 の合成でも、シェーダーと同じ Mix を使う
    mix.data_type = "RGBA"
    mix.inputs["Factor"].default_value = haze
    mix.inputs[7].default_value = (0.20, 0.32, 0.55, 1.0)
    ng.links.new(rl.outputs["Image"], mix.inputs[6])
    out = ng.nodes.new("NodeGroupOutput")
    ng.links.new(mix.outputs[2], out.inputs[0])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--view", default="1440x900")
    ap.add_argument("--scale", type=float, default=2.0)
    ap.add_argument("--spp", type=int, default=24)
    ap.add_argument("--exag", type=float, default=6.0)
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    W, H = (int(v) for v in a.view.split("x"))
    zoom, vmx, vmy = home_view(W, H)
    print(f"PC のホームの地図（{W}×{H}）：ズーム {zoom:.3f}、真ん中 {vmx * 360 - 180:.3f}°E", flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build(vmx, vmy, zoom, a.exag)
    lights()
    sc = bpy.context.scene
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = float(W)  # 横幅（単位＝ズーム 5 の地図の画素）
    cam.sensor_fit = "HORIZONTAL"
    cam.clip_start, cam.clip_end = 1.0, 20000.0
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    co.location = (0.0, 0.0, 5000.0)
    co.rotation_euler = (0.0, 0.0, 0.0)  # 真下を向く（北が上）
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = a.spp
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 3
    sc.render.resolution_x, sc.render.resolution_y = int(W * a.scale), int(H * a.scale)
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = 0.3
    finish(0.06)
    out = a.out or os.path.join(WORK, "home", f"home_{W}x{H}.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(out, flush=True)


if __name__ == "__main__":
    main()
