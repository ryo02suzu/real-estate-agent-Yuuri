"""真上から見た日本（オープニングの最後・PC のホームの背景）を、PC の地図と同じメルカトル図法・同じ縮尺で描く。

  python home.py [--view 1440x900] [--scale 2] [--spp 24] [--out 出力]
  python home.py --tod night [...]    # 時刻の版（morning 朝・day 昼・dusk 夕・night 夜）。構図は同じで、光だけ変える

python は bpy（Blender 5.3）を入れたもの。地面の色は home_prep.py の work/home_albedo.png、起伏は work/home_dem.npy。
--tod を付けないときは、今までと同じ絵（朝の光。アプリの絵）。夜と夕の街の明かりは night_lights.py の work/night_lights.png
（国勢調査の人口。人が住んでいる所だけ光る）。
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

from film import grid_object, principled, sun_color  # noqa: E402

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
JAPAN_BOUNDS = ((128.6, 30.9), (145.9, 45.6))  # lib/map-style.ts と同じ
MIN_ZOOM = 5.0
SUFFIX = ""  # 広い版（--extent）は "_w"（home_prep.py --wide の出力）
EARTH = 40075016.7  # 赤道の長さ（m）

# 時刻の版（--tod）。カメラ・構図・地面は同じで、光（太陽か月の向き・高さ・色、空の光、かすみ、街の明かり）だけを変える。
# 方位は北 0°・東 90°。太陽の色は高さから（film.py の sun_color：空気を長く通るほど赤い）。色は藍・金・白の中で。
#   energy  太陽（月）の強さ       sky   空の光（色、強さ）      sat  地面の色の鮮やかさ（夜は色が見えにくい）
#   stops   今の絵（--tod なし）と比べた明るさ（段。地面に届く光の量の違いは、露出で自動で打ち消してから、これだけ変える）
#   haze    かすみの色（空気が散らす光。地面に届く光の量に比例させる。今の絵は (0.20, 0.32, 0.55)）
#   lights  街の明かり（人口密度 1 万人/km² の所の光の強さ。0 は明かりなし）。夜と夕で同じ明かりなら同じ値
#   glow    明かりのにじみ（仕上げ。夜だけ）
TOD = {
    # 朝：東から低い朝日。光は金、影の側は空の青
    "morning": dict(az=104.0, el=13.0, energy=4.4, sky=((0.40, 0.50, 0.74), 0.30), sat=1.0, stops=-0.15, haze=(0.24, 0.30, 0.50), lights=0.0, glow=0.0),
    # 昼：南の高い太陽。白い光、空の青いかすみ
    "day": dict(az=168.0, el=56.0, energy=4.6, sky=((0.36, 0.52, 0.80), 0.38), sat=1.0, stops=0.15, haze=(0.20, 0.32, 0.55), lights=0.0, glow=0.0),
    # 夕：西から低い夕日。光は茜がかった金、影は藍。街の明かりがともり始める
    "dusk": dict(az=256.0, el=8.0, energy=3.6, sky=((0.30, 0.30, 0.52), 0.24), sat=0.95, stops=-0.6, haze=(0.30, 0.26, 0.48), lights=0.08, glow=0.0),
    # 夜：南東の高い月の青い光で、陸と海の境目がうっすら分かる。人が住んでいる所に街の明かり
    "night": dict(az=150.0, el=42.0, energy=0.10, moon=(0.56, 0.68, 1.0), sky=((0.05, 0.08, 0.18), 0.10), sat=0.35, stops=-3.0, haze=(0.06, 0.10, 0.25), lights=0.25, glow=0.25),
}
DEFAULT_LIGHT = dict(el=26.0, energy=4.2, color=(1.0, 0.88, 0.74), sky=((0.36, 0.52, 0.80), 0.35))  # lights() と同じ（今の絵）


def lum(c) -> float:
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ground_light(el: float, energy: float, color, sky) -> float:
    """平らな地面に届く光の量（太陽＋空。空はどの向きも同じ明るさなので π 倍）"""
    (col, s) = sky
    return energy * math.sin(math.radians(el)) * lum(color) + math.pi * s * lum(col)


def tod_color(p: dict):
    return p["moon"] if "moon" in p else sun_color(p["el"])


def tod_gain(p: dict) -> float:
    """時刻の版の地面に届く光の量 ÷ 今の絵の量"""
    d = DEFAULT_LIGHT
    return ground_light(p["el"], p["energy"], tod_color(p), p["sky"]) / ground_light(d["el"], d["energy"], d["color"], d["sky"])


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


def build(view_mx: float, view_my: float, zoom: float, exag: float, tod: dict | None = None) -> None:
    with open(os.path.join(WORK, f"home_dem{SUFFIX}.json")) as f:
        meta = json.load(f)
    dem = np.load(os.path.join(WORK, f"home_dem{SUFFIX}.npy"))
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
    tex.image = bpy.data.images.load(os.path.join(WORK, f"home_albedo{SUFFIX}.png"))
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
    if tod is not None:
        tod_material(nt, b, tex, uvn, tod)
    grid_object("japan", X, Y, Z, h, None, mat, uv=uv)


def tod_material(nt, b, tex, uvn, p: dict) -> None:
    """時刻の版だけ：地面の色の鮮やかさ（夜は落とす）と、街の明かり（night_lights.py。人口密度から。人が住んでいる所だけ）"""
    if p["sat"] != 1.0:
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = p["sat"]
        nt.links.new(tex.outputs["Color"], hsv.inputs["Color"])
        nt.links.new(hsv.outputs["Color"], b.inputs["Base Color"])
    if p["lights"] <= 0:
        return
    with open(os.path.join(WORK, f"night_lights{SUFFIX}.json")) as f:
        scale = json.load(f)["scale"]
    lt = nt.nodes.new("ShaderNodeTexImage")
    lt.image = bpy.data.images.load(os.path.join(WORK, f"night_lights{SUFFIX}.png"))  # sRGB として読む → 線形の 0〜1
    lt.interpolation = "Cubic"
    nt.links.new(uvn.outputs["UV"], lt.inputs["Vector"])

    def op(kind: str, a, v: float):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = kind
        nt.links.new(a, n.inputs[0])
        n.inputs[1].default_value = v
        return n.outputs[0]

    light = op("MULTIPLY", lt.outputs["Color"], scale)  # 明かりの強さ（人口密度 1 万人/km² で 1）
    nt.links.new(op("MULTIPLY", light, p["lights"]), b.inputs["Emission Strength"])
    # 色：まばらな明かりは琥珀、街の中心ほど白に近い金
    t = nt.nodes.new("ShaderNodeMapRange")
    t.inputs["From Min"].default_value, t.inputs["From Max"].default_value = 0.0, 1.6
    nt.links.new(light, t.inputs["Value"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (1.0, 0.46, 0.16, 1.0)
    els[1].position, els[1].color = 1.0, (1.0, 0.90, 0.74, 1.0)
    mid = els.new(0.35)
    mid.color = (1.0, 0.68, 0.36, 1.0)
    nt.links.new(t.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Emission Color"])


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


def tod_lights(p: dict) -> None:
    """時刻の版の光：太陽（夜は月）1つと、空の光"""
    from mathutils import Vector

    sc = bpy.context.scene
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    (r, g, bl), s = p["sky"]
    bg.inputs["Color"].default_value = (r, g, bl, 1.0)
    bg.inputs["Strength"].default_value = s
    lamp = bpy.data.lights.new("sun", "SUN")
    lamp.energy = p["energy"]
    lamp.angle = math.radians(0.53)  # 太陽も月も、見かけの大きさは約 0.5°
    lamp.color = tod_color(p)
    ob = bpy.data.objects.new("sun", lamp)
    sc.collection.objects.link(ob)
    az, el = math.radians(p["az"]), math.radians(p["el"])
    d = (math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el))
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(d))


def finish(haze: float, color=(0.20, 0.32, 0.55), glow: float = 0.0) -> None:
    """仕上げ：宇宙から見たときの、空気のうっすらした青いかすみ（時刻の版は、かすみの色と、夜の街の明かりのにじみ）"""
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new("finish", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    sc.compositing_node_group = ng
    sc.render.use_compositing = True
    sc.render.compositor_device = "CPU"
    rl = ng.nodes.new("CompositorNodeRLayers")
    img = rl.outputs["Image"]
    if glow > 0:
        # 明るい所（街）だけが、空気で少しにじむ
        gl = ng.nodes.new("CompositorNodeGlare")
        gl.inputs["Type"].default_value = "Fog Glow"
        gl.inputs["Quality"].default_value = "High"
        gl.inputs["Threshold"].default_value = 0.35
        gl.inputs["Strength"].default_value = glow
        gl.inputs["Size"].default_value = 0.5
        ng.links.new(img, gl.inputs["Image"])
        img = gl.outputs["Image"]
    mix = ng.nodes.new("ShaderNodeMix")  # Blender 5 の合成でも、シェーダーと同じ Mix を使う
    mix.data_type = "RGBA"
    mix.inputs["Factor"].default_value = haze
    mix.inputs[7].default_value = (*color, 1.0)
    ng.links.new(img, mix.inputs[6])
    out = ng.nodes.new("NodeGroupOutput")
    ng.links.new(mix.outputs[2], out.inputs[0])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--view", default="1440x900")
    ap.add_argument("--scale", type=float, default=2.0)
    ap.add_argument("--spp", type=int, default=24)
    ap.add_argument("--exag", type=float, default=6.0)
    ap.add_argument("--out", default="")
    # 広い版：データの範囲全部を、ズーム 5 の地図と同じ縮尺で描く（アプリは画像の四隅の経度・緯度で地図に重ねるので、
    # 画面の大きさによらず重なる）。四隅は出力と同じ名前の .json に書く
    ap.add_argument("--extent", action="store_true")
    # 時刻の版（構図は同じで光だけ変える）。付けないときは今までの絵。出力の名前の後ろに _morning などを付ける
    ap.add_argument("--tod", choices=list(TOD))
    a = ap.parse_args()
    tod = TOD[a.tod] if a.tod else None
    global SUFFIX
    if a.extent:
        SUFFIX = "_w"
        with open(os.path.join(WORK, "home_dem_w.json")) as f:
            meta = json.load(f)
        dh, dw = np.load(os.path.join(WORK, "home_dem_w.npy"), mmap_mode="r").shape
        n = 2.0 ** meta["z"]
        mx0, mx1 = meta["x0"] / n, (meta["x0"] + dw / 256.0) / n
        my0, my1 = meta["y0"] / n, (meta["y0"] + dh / 256.0) / n
        zoom = MIN_ZOOM
        world = 512 * 2**zoom
        W, H = int(round((mx1 - mx0) * world)), int(round((my1 - my0) * world))
        vmx, vmy = (mx0 + mx1) / 2, (my0 + my1) / 2
        lon = lambda x: x * 360 - 180
        lat = lambda y: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y))))
        corners = [[lon(mx0), lat(my0)], [lon(mx1), lat(my0)], [lon(mx1), lat(my1)], [lon(mx0), lat(my1)]]
        print(f"広い版：{W}×{H}（ズーム 5 の画素）、四隅 {corners}", flush=True)
    else:
        W, H = (int(v) for v in a.view.split("x"))
        zoom, vmx, vmy = home_view(W, H)
        print(f"PC のホームの地図（{W}×{H}）：ズーム {zoom:.3f}、真ん中 {vmx * 360 - 180:.3f}°E", flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build(vmx, vmy, zoom, a.exag, tod)
    if tod is None:
        lights()
    else:
        tod_lights(tod)
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
    if tod is None:
        finish(0.06)
    else:
        sc.view_settings.exposure = tod["exposure"]
        finish(tod["haze"][1], tod["haze"][0], tod["glow"])
    tail = f"_{a.tod}" if a.tod else ""
    out = a.out or os.path.join(WORK, "home", f"home_wide{tail}.png" if a.extent else f"home_{W}x{H}{tail}.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    if a.extent:
        with open(os.path.splitext(out)[0] + ".json", "w") as f:
            json.dump({"coordinates": corners, "zoom": zoom, "size": [W, H]}, f, ensure_ascii=False, indent=1)
    print(out, flush=True)


if __name__ == "__main__":
    main()
