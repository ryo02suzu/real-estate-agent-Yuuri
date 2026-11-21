"""PC のホームの背景の細かい版：home_hd_prep.py の区画ごとの入力を、Blender（Cycles）で描く。

  python home_hd.py --tod day [--only 10,8] [--spp 24]       # → work/home_hd/{tod}/{列}_{行}.png（描いた区画は飛ばす）
  python home_hd.py --tod night --glow work/home/home_wide_night_glow.exr

python は bpy（Blender 5.3）を入れたもの。光（太陽か月の向き・高さ・色、空の光）・露出・かすみ・地面の鮮やかさ・街の明かりは、
home.py の時刻の版（TOD）と同じ（同じ値・同じ式を使う）。違うのは細かさだけ：広い版（ズーム 7）の4倍＝ズーム 9。
単位は home.py と同じ「ズーム 5 の地図の 1 画素」（ズーム 9 の 8 画素）。起伏の大きな形（広い版の地面の点の間隔ほど）の強調
（exag）は home.py と同じで、それより細かい起伏は弱めに強調する（fine。同じ強さだと谷の影が濃くなりすぎ、縮めたときに広い版より暗い）。
夜の明かりのにじみ（home.py の finish の Fog Glow）は、区画より大きく広がるので区画ごとには作れない。広い版で Blender が作った
にじみ（home.py --glow-exr。かすみ・露出の前の光の量）を4倍に引き伸ばし、かすみの前に足す（広い版と同じ順番）。
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

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import home  # noqa: E402
from film import grid_object, principled  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
HD = os.path.join(WORK, "home_hd")
UNIT = 8.0  # ズーム 9 の画素 → 単位（ズーム 5 の地図の画素）
WORLD = 512 * 2**5  # 単位で測った世界の幅（home.py の world と同じ）
S = 2  # 地面の点の間隔（ズーム 9 の画素）


def float_image(name: str, a: np.ndarray) -> bpy.types.Image:
    """線形の値の配列（行は北→南）を、Blender の浮動小数の画像にする（下が 0 なので上下を返す）"""
    H, W = a.shape[:2]
    img = bpy.data.images.new(name, W, H, alpha=True, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    rgba = np.ones((H, W, 4), np.float32)
    rgba[..., :3] = a[..., None] if a.ndim == 2 else a[..., :3]
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    img.pack()
    return img


def build(pj: dict, inp: str, p: dict, exag: float, fine: float) -> None:
    g, d = pj["geo"], pj["draw"]
    dem = np.load(os.path.join(inp, "dem.npy")).astype(np.float64)
    lo = np.load(os.path.join(inp, "dem_lo.npy")).astype(np.float64)
    Hg, Wg = dem.shape
    rows = np.arange(0, Hg, S)
    cols = np.arange(0, Wg, S)
    h = dem[np.ix_(rows, cols)]
    hl = lo[np.ix_(rows, cols)]
    gx = g[0] + cols + 0.5  # 点の位置（ズーム 9 の画素の真ん中）
    gy = g[1] + rows + 0.5
    cx, cy = (d[0] + d[2]) / 2.0, (d[1] + d[3]) / 2.0
    X = np.broadcast_to(((gx - cx) / UNIT)[None, :], h.shape)
    Y = np.broadcast_to((-(gy - cy) / UNIT)[:, None], h.shape)
    n = 256.0 * 2**9
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * gy / n))))
    m_per_unit = home.EARTH * np.cos(np.radians(lat)) / WORLD
    # 起伏の大きな形は広い版と同じ強さ（exag）、それより細かい起伏は fine の強さ（海は平ら）
    Z = np.where(h > 0, np.maximum(0.0, hl * exag + (np.maximum(h, 0.0) - hl) * fine), 0.0) / m_per_unit[:, None]
    u = (gx - d[0]) / (d[2] - d[0])
    v = 1.0 - (gy - d[1]) / (d[3] - d[1])
    uv = np.stack(np.broadcast_arrays(u[None, :], v[:, None]), -1)
    mat = principled("ground", (0.1, 0.1, 0.1), 0.9, 0.3)
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(inp, "albedo.png"))
    tex.interpolation = "Cubic"
    tex.extension = "EXTEND"  # 描く所の外（影を落とすだけの地面）は、端の色のまま
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    rough = nt.nodes.new("ShaderNodeMapRange")  # home.py と同じ：海は少しなめらかに光る（透明度＝陸の割合）
    rough.inputs["To Min"].default_value = 0.32
    rough.inputs["To Max"].default_value = 0.92
    nt.links.new(tex.outputs["Alpha"], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], b.inputs["Roughness"])
    materials(mat, b, tex, uvn, p, inp)
    grid_object("japan", np.ascontiguousarray(X), np.ascontiguousarray(Y), Z, h, None, mat, uv=uv)


def materials(mat, b, tex, uvn, p: dict, inp: str) -> None:
    """home.py の tod_material と同じ（地面の鮮やかさ・街の明かり）。明かりは浮動小数の画像（引き伸ばした線形の値）から読む"""
    nt = mat.node_tree
    if p["sat"] != 1.0:
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = p["sat"]
        nt.links.new(tex.outputs["Color"], hsv.inputs["Color"])
        nt.links.new(hsv.outputs["Color"], b.inputs["Base Color"])
    if p["lights"] <= 0:
        return
    mat.cycles.emission_sampling = "NONE"
    lt = nt.nodes.new("ShaderNodeTexImage")
    lt.image = float_image("lights", np.load(os.path.join(inp, "lights.npy")).astype(np.float32))
    lt.interpolation = "Cubic"
    lt.extension = "EXTEND"
    nt.links.new(uvn.outputs["UV"], lt.inputs["Vector"])

    def op(kind: str, a, v: float):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = kind
        nt.links.new(a, n.inputs[0])
        n.inputs[1].default_value = v
        return n.outputs[0]

    light = op("MULTIPLY", lt.outputs["Color"], 1.0)  # 明かりの強さ（人口密度 1 万人/km² で 1）
    # 明かりを街並みに沿わせる：人口の明かり（約 1km の細かさを引き伸ばしたもの）は、寄るとぼんやりした四角いにじみに見えた。
    # 地面の色（ランドサット）の明るさで細かく分ける：建物や道路の多い所（明るい灰色。東京の明るい明かりの所で真ん中 0.088）は
    # 強く、田畑・森・公園・川（暗い。明かりの少ない所で真ん中 0.021）は弱く。明かりを足すのではなく、人口の明かりの分け方だけ
    sp = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex.outputs["Color"], sp.inputs["Color"])
    lum = op("MULTIPLY", sp.outputs["Red"], 0.2126)
    for ch, w in (("Green", 0.7152), ("Blue", 0.0722)):
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "MULTIPLY_ADD"
        nt.links.new(sp.outputs[ch], add.inputs[0])
        add.inputs[1].default_value = w
        nt.links.new(lum, add.inputs[2])
        lum = add.outputs[0]
    urb = nt.nodes.new("ShaderNodeMapRange")
    urb.interpolation_type = "SMOOTHSTEP"
    urb.inputs["From Min"].default_value, urb.inputs["From Max"].default_value = 0.03, 0.12
    urb.inputs["To Min"].default_value, urb.inputs["To Max"].default_value = 0.3, 1.7
    nt.links.new(lum, urb.inputs["Value"])
    mod = nt.nodes.new("ShaderNodeMath")
    mod.operation = "MULTIPLY"
    nt.links.new(light, mod.inputs[0])
    nt.links.new(urb.outputs["Result"], mod.inputs[1])
    light = mod.outputs[0]
    nt.links.new(op("MULTIPLY", light, p["lights"]), b.inputs["Emission Strength"])
    t = nt.nodes.new("ShaderNodeMapRange")
    t.inputs["From Min"].default_value, t.inputs["From Max"].default_value = 0.0, 1.6
    nt.links.new(light, t.inputs["Value"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (1.0, 0.64, 0.30, 1.0)
    els[1].position, els[1].color = 1.0, (1.0, 0.90, 0.76, 1.0)
    mid = els.new(0.35)
    mid.color = (1.0, 0.77, 0.47, 1.0)
    nt.links.new(t.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Emission Color"])


def finish(haze: float, color, glow: np.ndarray | None) -> None:
    """home.py の finish と同じかすみ。夜は、広い版のにじみ（引き伸ばしたもの）を、かすみの前に足す"""
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new("finish", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    sc.compositing_node_group = ng
    sc.render.use_compositing = True
    sc.render.compositor_device = "CPU"
    rl = ng.nodes.new("CompositorNodeRLayers")
    img = rl.outputs["Image"]
    if glow is not None:
        gi = ng.nodes.new("CompositorNodeImage")
        gi.image = float_image("glow", glow)
        add = ng.nodes.new("ShaderNodeMix")
        add.data_type = "RGBA"
        add.blend_type = "ADD"
        add.inputs["Factor"].default_value = 1.0
        ng.links.new(img, add.inputs[6])
        ng.links.new(gi.outputs["Image"], add.inputs[7])
        img = add.outputs[2]
    mix = ng.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["Factor"].default_value = haze
    mix.inputs[7].default_value = (*color, 1.0)
    ng.links.new(img, mix.inputs[6])
    out = ng.nodes.new("NodeGroupOutput")
    ng.links.new(mix.outputs[2], out.inputs[0])


def glow_crop(path: str, pj: dict) -> np.ndarray:
    """広い版のにじみ（EXR、5120×3968、線形）から、描く所を4倍に引き伸ばして切り出す（なめらかに：双線形）"""
    img = bpy.data.images.load(path)
    W, H = img.size
    a = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(H, W, 4)[::-1, :, :3]  # 上を北に
    bpy.data.images.remove(img)
    d = pj["draw"]
    ox, oy = pj["origin"]
    k = 4.0
    xs = (np.arange(d[0], d[2]) + 0.5 - ox) / k - 0.5
    ys = (np.arange(d[1], d[3]) + 0.5 - oy) / k - 0.5
    x0 = np.clip(np.floor(xs).astype(int), 0, W - 2)
    y0 = np.clip(np.floor(ys).astype(int), 0, H - 2)
    fx = np.clip(xs - x0, 0, 1)[None, :, None]
    fy = np.clip(ys - y0, 0, 1)[:, None, None]
    A = a[np.ix_(y0, x0)]
    B = a[np.ix_(y0, x0 + 1)]
    C = a[np.ix_(y0 + 1, x0)]
    D = a[np.ix_(y0 + 1, x0 + 1)]
    return ((A * (1 - fx) + B * fx) * (1 - fy) + (C * (1 - fx) + D * fx) * fy).astype(np.float32)


def render(ij: tuple[int, int], tod: str, spp: int, exag: float, fine: float, glow: str, out: str) -> None:
    inp = os.path.join(HD, "in", f"{ij[0]}_{ij[1]}")
    with open(os.path.join(inp, "part.json")) as f:
        pj = json.load(f)
    p = home.TOD[tod]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build(pj, inp, p, exag, fine)
    home.tod_lights(p)
    sc = bpy.context.scene
    d = pj["draw"]
    W, H = d[2] - d[0], d[3] - d[1]
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = W / UNIT
    cam.sensor_fit = "HORIZONTAL"
    cam.clip_start, cam.clip_end = 1.0, 20000.0
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    co.location = (0.0, 0.0, 5000.0)
    co.rotation_euler = (0.0, 0.0, 0.0)
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = spp
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 3
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    g = home.tod_gain(p)
    sc.view_settings.exposure = 0.3 - math.log2(g) + p["stops"]
    gl = glow_crop(glow, pj) if p["glow"] > 0 else None
    finish(0.06, tuple(c * g for c in p["haze"]), gl)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sc.render.filepath = out
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"{tod} {ij[0]},{ij[1]}：{time.time() - t0:.0f} 秒 → {out}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tod", choices=list(home.TOD), required=True)
    ap.add_argument("--only", default="", help="区画（列,行）をセミコロンで区切って")
    ap.add_argument("--spp", type=int, default=24)
    ap.add_argument("--exag", type=float, default=6.0, help="起伏の大きな形の強調（home.py と同じ）")
    ap.add_argument("--fine", type=float, default=2.5, help="細かい起伏の強調")
    ap.add_argument("--glow", default=os.path.join(WORK, "home", "home_wide_night_glow.exr"))
    ap.add_argument("--out", default="", help="出力の場所（試しに別の名前で描くとき）。{i}・{j} は区画")
    ap.add_argument("--redo", action="store_true", help="描いてある区画も描き直す")
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else None)
    if a.only:
        parts = [tuple(int(v) for v in s.split(",")) for s in a.only.split(";") if s]
    else:
        with open(os.path.join(HD, "parts.json")) as f:
            parts = [tuple(v) for v in json.load(f)["parts"]]
    if home.TOD[a.tod]["glow"] > 0 and not os.path.exists(a.glow):
        sys.exit(f"夜のにじみ {a.glow} が無い（先に home.py --extent --tod {a.tod} --glow-exr）")
    for i, j in parts:
        out = (a.out or os.path.join(HD, a.tod, "{i}_{j}.png")).format(i=i, j=j)
        if os.path.exists(out) and not a.redo:
            continue
        if not os.path.exists(os.path.join(HD, "in", f"{i}_{j}", "part.json")):
            print(f"{i},{j}：入力が無い（home_hd_prep.py --build）", flush=True)
            continue
        render((i, j), a.tod, a.spp, a.exag, a.fine, a.glow, out)


if __name__ == "__main__":
    main()
