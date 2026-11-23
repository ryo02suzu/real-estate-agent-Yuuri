# 赤富士の試し撮り：夏の夜明け、雲海の上で朝日に赤く染まる富士山を、東（山中湖の上空）から見る。
# 地形は国土地理院の標高タイル（10m）、色は航空写真（全国最新写真（シームレス））。雲海と空気のかすみは Blender の立体（体積）で、
# 空は物理の空のモデル。カメラはゆっくり前へ進む（3 秒）。fetch.py で作った材料（dem.npy・photo.jpg）を読む。
#
#   blender -b --factory-startup --python scene.py -- <材料のフォルダ> <出力のフォルダ> [設定...]
#   設定：frames=1-90（描くコマ）・res=1920x1080・samples=1024・fps=30・preview=0（1 で CPU 向けに軽く。かすみ無し）
#         cone_stride=1（山の部分の 5m の標高の間引き）・base_stride=2（広い範囲の 10m の標高の間引き。山の部分が無いときは stride）
#         exposure=-0.8・look=Medium_High_Contrast（AgX の見え方。Punchy など）・sky=0.5（空と太陽の強さ）
#         disc=1（空のモデルの太陽で照らす）・sun=0（ランプで照らす強さ。使うときは disc=0）・aerosol=1.6・haze=0.000005（かすみ）
#         clouds=4（雲海の作り方の版）・cloud_density=0.12・cloud_lift=40（雲の上面を上げる m）・cloud_texel=8・vol_bounces=8
#         cloud_edge=8・cloud_wisp=40・cloud_wisp_scale=40・cloud_wisp_detail=5（雲の表面の細かな凹凸）・denoise=1・border=（一部だけ描く）
#         lens=70・aim=2900（見る高さ）・cam_lat / cam_lon / cam_h（カメラの場所）
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
DATA = argv[0] if argv else "work"
OUT = argv[1] if len(argv) > 1 else "out"
opt = dict(a.split("=", 1) for a in argv[2:] if "=" in a)
FR = [int(x) for x in opt.get("frames", "1-90").split("-")]
W, H = (int(x) for x in opt.get("res", "1920x1080").split("x"))
SAMPLES = int(opt.get("samples", "1024"))
STRIDE = int(opt.get("stride", "1"))
FPS = int(opt.get("fps", "30"))
PREVIEW = opt.get("preview", "0") == "1"
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- 場所・太陽・カメラ
SUMMIT = (35.36060, 138.72741)  # 剣ヶ峰（緯度, 経度）
LAT0, LON0 = SUMMIT
MX = math.cos(math.radians(LAT0)) * 111320.0  # 経度 1 度の m
MY = 110574.0  # 緯度 1 度の m
# 太陽：8 月はじめの日の出すぐ（富士山の北東の空、高さ約 2 度）。空のモデルの向きは北から右回りの方位（確かめ済み）
SUN_AZ, SUN_EL = math.radians(66.0), math.radians(2.0)
SUN_DIR = Vector((math.sin(SUN_AZ) * math.cos(SUN_EL), math.cos(SUN_AZ) * math.cos(SUN_EL), math.sin(SUN_EL)))
# カメラ：富士吉田の上空（山頂の北 15km）、高さ 2,350m から、山頂の少し下を見て、3 秒で 180m 前へ。
# 朝日（北東）が左から当たり、東の面が赤く、西の面が影になる（正面から当てると山肌の起伏が平らに見える）
CAM0 = (float(opt.get("cam_lat", "35.4950")), float(opt.get("cam_lon", "138.7600")), float(opt.get("cam_h", "2350")))
CAM_PUSH = 180.0
CLOUD_TOP = 2050.0  # 雲海の上面（だいたい）
CLOUD_BOTTOM = 1250.0


def local(lat, lon):
    return (lon - LON0) * MX, (lat - LAT0) * MY


def tile_lonlat(px, py, z):
    n = 2.0**z
    lon = px / n * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * py / n))))
    return lon, lat


# ---------------------------------------------------------------- Blender の準備
scene = bpy.context.scene
for o in list(scene.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
device = "CPU"
if not PREVIEW:
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.refresh_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == kind
                device = kind
                break
        except TypeError:
            continue
scene.cycles.device = "GPU" if device != "CPU" else "CPU"
print("使う装置:", device, flush=True)
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = opt.get("denoise", "1") == "1"
scene.cycles.max_bounces = 12
# 雲の中で光が何回まで散るか。薄い層（3 版）なら 8 回で上から見た明るさはほぼ出る（vol_bounces=）
scene.cycles.volume_bounces = 2 if PREVIEW else int(opt.get("vol_bounces", "8"))
scene.cycles.volume_step_rate = 4.0 if PREVIEW else 1.0
scene.cycles.use_adaptive_sampling = True
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = 100
if "border" in opt:  # 確かめ用：画面の一部だけ描く（border=左,下,右,上。0〜1）
    bx0, by0, bx1, by1 = (float(v) for v in opt["border"].split(":"))
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    scene.render.border_min_x, scene.render.border_min_y, scene.render.border_max_x, scene.render.border_max_y = bx0, by0, bx1, by1
scene.render.fps = FPS
scene.render.use_motion_blur = not PREVIEW
scene.render.use_persistent_data = True  # 2 コマ目からは、地形（約 900 万点）や画像を作り直さない
scene.render.motion_blur_shutter = 0.5
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "16"
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - " + opt.get("look", "Medium_High_Contrast").replace("_", " ")  # 空白は _ で（Punchy・High_Contrast など）
except TypeError:
    pass
scene.view_settings.exposure = float(opt.get("exposure", "-0.8"))

# ---------------------------------------------------------------- 地形（標高 → 網の目、航空写真の色）
# 広い範囲（dem・photo）と、雲海より上に出る山の部分の細かい材料（dem5：5m・photo16：2m・photo17：1m。あれば使う）。
# 細かい網の目がある所では、広い範囲の網の目を 30m 沈めて下に隠す（境目は 200m かけてなだらかに）
def load(name):
    pj = os.path.join(DATA, f"{name}.json")
    if not os.path.exists(pj):
        return None, None
    meta = json.load(open(pj))
    if os.path.exists(os.path.join(DATA, f"{name}.npy")):
        return np.load(os.path.join(DATA, f"{name}.npy")), meta
    return os.path.join(DATA, f"{name}.jpg"), meta


def merc_px(lon, lat, zz):
    """経度・緯度 → 世界の画素の座標（連続）。zz はタイルのズーム + 8（画素の単位のズーム。tile_lonlat と同じ）"""
    n = 2.0**zz
    x = (np.asarray(lon) + 180.0) / 360.0 * n
    y = (1 - np.arcsinh(np.tan(np.radians(np.asarray(lat)))) / np.pi) / 2 * n
    return x, y


def bilinear(a, fx, fy):
    """2 次元の配列 a を、画素の中心が i+0.5 の座標 (fx, fy) で線形に読む（外は端の値）"""
    fx = np.clip(fx - 0.5, 0, a.shape[1] - 1.001)
    fy = np.clip(fy - 0.5, 0, a.shape[0] - 1.001)
    x0, y0 = fx.astype(np.int64), fy.astype(np.int64)
    tx, ty = fx - x0, fy - y0
    return (a[y0, x0] * (1 - tx) * (1 - ty) + a[y0, x0 + 1] * tx * (1 - ty)
            + a[y0 + 1, x0] * (1 - tx) * ty + a[y0 + 1, x0 + 1] * tx * ty)


def grid(meta, stride, bbox=None):
    """モザイクの画素（stride ごと）の中心の経度・緯度。bbox があれば、その中だけ。返すのは (行の番号, 列の番号, 経度, 緯度)"""
    zz = meta["z"] + 8
    nx, ny = meta["nx"] * 256, meta["ny"] * 256
    ix = np.arange(0, nx, stride)
    iy = np.arange(0, ny, stride)
    px = meta["x0"] * 256 + ix + 0.5
    py = meta["y0"] * 256 + iy + 0.5
    lon, _ = tile_lonlat(px, np.zeros_like(px, dtype=float), zz)
    _, lat = tile_lonlat(np.zeros_like(py, dtype=float), py, zz)
    if bbox is not None:
        w, s_, e, n_ = bbox
        kx = (lon >= w) & (lon <= e)
        ky = (lat >= s_) & (lat <= n_)
        ix, lon = ix[kx], lon[kx]
        iy, lat = iy[ky], lat[ky]
    return iy, ix, lon, lat


def make_mesh(name, lon, lat, h, uvs):
    """経度（列）・緯度（行）・標高（行×列）から四角の網の目を作り、写真ごとの UV（uvs：名前 → (写真の meta)）を付ける"""
    ny, nx = h.shape
    verts = np.zeros((ny, nx, 3), dtype=np.float32)
    verts[..., 0] = ((lon - LON0) * MX)[None, :]
    verts[..., 1] = ((lat - LAT0) * MY)[:, None]
    verts[..., 2] = h
    idx = np.arange(nx * ny).reshape(ny, nx)
    quads = np.stack([idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]], axis=-1).reshape(-1, 4)
    me = bpy.data.meshes.new(name)
    me.vertices.add(nx * ny)
    me.vertices.foreach_set("co", verts.reshape(-1))
    me.loops.add(quads.size)
    me.loops.foreach_set("vertex_index", quads.reshape(-1).astype(np.int32))
    me.polygons.add(len(quads))
    me.polygons.foreach_set("loop_start", (np.arange(len(quads)) * 4).astype(np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(quads), 4, dtype=np.int32))
    for uvname, pm in uvs.items():
        zz = pm["z"] + 8
        px, _ = merc_px(lon, np.zeros_like(lon), zz)
        _, py = merc_px(np.zeros_like(lat), lat, zz)
        u = (px - pm["x0"] * 256) / (pm["nx"] * 256)
        v = 1.0 - (py - pm["y0"] * 256) / (pm["ny"] * 256)
        uv = np.zeros((ny, nx, 2), dtype=np.float32)
        uv[..., 0] = u[None, :]
        uv[..., 1] = v[:, None]
        layer = me.uv_layers.new(name=uvname)
        layer.data.foreach_set("uv", uv.reshape(-1, 2)[quads.reshape(-1)].reshape(-1))
    me.update(calc_edges=True)
    me.validate()
    if hasattr(me, "shade_smooth"):
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def ground_material(name, layers):
    """航空写真の地面。layers：[(UV の名前, 写真のファイル)]。後ろのものほど細かく、その写真の範囲の中では上に重ねる"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    col = None
    for uvname, path in layers:
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = uvname
        im = nt.nodes.new("ShaderNodeTexImage")
        im.image = bpy.data.images.load(path)
        im.interpolation = "Cubic"
        im.extension = "EXTEND"
        nt.links.new(uvn.outputs["UV"], im.inputs["Vector"])
        if col is None:
            col = im.outputs["Color"]
            continue
        # この写真の範囲（UV が 0〜1）の中だけ重ねる
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(uvn.outputs["UV"], sep.inputs[0])
        inside = None
        for comp, op, val in (("X", "GREATER_THAN", 0.001), ("X", "LESS_THAN", 0.999), ("Y", "GREATER_THAN", 0.001), ("Y", "LESS_THAN", 0.999)):
            c = nt.nodes.new("ShaderNodeMath")
            c.operation = op
            c.inputs[1].default_value = val
            nt.links.new(sep.outputs[comp], c.inputs[0])
            if inside is None:
                inside = c.outputs[0]
            else:
                mul = nt.nodes.new("ShaderNodeMath")
                mul.operation = "MULTIPLY"
                nt.links.new(inside, mul.inputs[0])
                nt.links.new(c.outputs[0], mul.inputs[1])
                inside = mul.outputs[0]
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        sock = {s.identifier: s for s in mix.inputs}
        nt.links.new(inside, sock["Factor_Float"])
        nt.links.new(col, sock["A_Color"])
        nt.links.new(im.outputs["Color"], sock["B_Color"])
        col = [o for o in mix.outputs if o.identifier == "Result_Color"][0]
    # 航空写真は朝の光ではない（真上からの昼の光で撮ったもの）。明るさを少し落として地面の反射の色にする
    hsv = nt.nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Saturation"].default_value = 1.05
    hsv.inputs["Value"].default_value = 0.78
    nt.links.new(col, hsv.inputs["Color"])
    nt.links.new(hsv.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.92
    # 写真の明るさの細かい模様を、でこぼこにも使う（岩・沢の陰影）
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 2.0
    nt.links.new(col, bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


t0 = time.time()
dem, dm = load("dem")
_, pm = load("photo")
dem5, d5m = load("dem5")
_, p16m = load("photo16")
_, p17m = load("photo17")
CONE_STRIDE = int(opt.get("cone_stride", "1"))
BASE_STRIDE = int(opt.get("base_stride", "2" if dem5 is not None else str(STRIDE)))
info = []
cone_box = None
if dem5 is not None and p16m is not None:
    # 細かい山の部分（5m）。標高が無い画素は、広い範囲の標高で埋める
    iy, ix, clon, clat = grid(d5m, CONE_STRIDE, tuple(d5m["bbox"]))
    hc = dem5[np.ix_(iy, ix)].astype(np.float64)
    nan = np.isnan(hc)
    if nan.any():
        bx, _ = merc_px(clon, np.zeros_like(clon), dm["z"] + 8)
        _, by = merc_px(np.zeros_like(clat), clat, dm["z"] + 8)
        fx = np.broadcast_to((bx - dm["x0"] * 256)[None, :], hc.shape)
        fy = np.broadcast_to((by - dm["y0"] * 256)[:, None], hc.shape)
        hc[nan] = bilinear(dem, fx[nan], fy[nan])
    uvs = {"photo16": p16m}
    layers = [("photo16", os.path.join(DATA, "photo16.jpg"))]
    if p17m is not None:
        uvs["photo17"] = p17m
        layers.append(("photo17", os.path.join(DATA, "photo17.jpg")))
    cone = make_mesh("cone", clon, clat, hc.astype(np.float32), uvs)
    cone.data.materials.append(ground_material("cone", layers))
    cone_box = (clon.min(), clat.min(), clon.max(), clat.max())
    info.append(f"山の部分: {len(clon)}x{len(clat)} 点（5m の標高・間引き {CONE_STRIDE}・埋めた画素 {int(nan.sum())}）")
# 広い範囲（10m）
iy, ix, blon, blat = grid(dm, BASE_STRIDE)
hb = dem[np.ix_(iy, ix)].astype(np.float64)
if cone_box is not None:
    w, s_, e, n_ = cone_box
    inside = np.minimum.reduce([
        ((blon - w) * MX)[None, :].repeat(len(blat), 0), ((e - blon) * MX)[None, :].repeat(len(blat), 0),
        ((blat - s_) * MY)[:, None].repeat(len(blon), 1), ((n_ - blat) * MY)[:, None].repeat(len(blon), 1),
    ])
    hb -= 30.0 * np.clip(inside / 200.0, 0.0, 1.0)
base = make_mesh("terrain", blon, blat, hb.astype(np.float32), {"photo": pm})
base.data.materials.append(ground_material("ground", [("photo", os.path.join(DATA, "photo.jpg"))]))
info.append(f"広い範囲: {len(blon)}x{len(blat)} 点（10m の標高・間引き {BASE_STRIDE}）")
print("地形:", "・".join(info), f"（{time.time() - t0:.1f} 秒）", flush=True)

# ---------------------------------------------------------------- 空と太陽
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes):
    wn.nodes.remove(n)
sky = wn.nodes.new("ShaderNodeTexSky")
for t in ("MULTIPLE_SCATTERING", "NISHITA"):
    try:
        sky.sky_type = t
        break
    except TypeError:
        continue
sky.sun_elevation = SUN_EL
sky.sun_rotation = SUN_AZ
# 空のモデルの設定（版によって名前が違うので、あるものだけ）。夏の朝の少しかすんだ空
AEROSOL = float(opt.get("aerosol", "1.6"))
for attr, val in (("altitude", 2300.0), ("air_density", 1.0), ("aerosol_density", AEROSOL), ("dust_density", AEROSOL), ("ozone_density", 1.2), ("ground_albedo", 0.35)):
    if hasattr(sky, attr):
        setattr(sky, attr, val)
bg = wn.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = float(opt.get("sky", "0.5"))
wo = wn.nodes.new("ShaderNodeOutputWorld")
wn.links.new(sky.outputs[0], bg.inputs[0])
wn.links.new(bg.outputs[0], wo.inputs["Surface"])
# 朝日は空のモデルの太陽（円盤）で当てる（空と同じ大気の計算で、色と強さが空と合う）。手元で測った値（高さ 2 度・高度 2,300m）：
# 太陽に向いた面の照度は 赤 59・緑 25・青 3.0（色 1 : 0.42 : 0.05 の濃い橙）、同じ面への空の光は約 5（太陽の約 1/6）。
# ランプ（sun=）を使うときは、二重にならないよう円盤を消す（disc=0）
USE_DISC = opt.get("disc", "1") == "1"
if hasattr(sky, "sun_disc"):
    sky.sun_disc = USE_DISC
# 空気のかすみ（遠くほど青白く、朝日の方は明るく。前に強く散らす）。世界全体に体積を置くと、無限に遠い空と太陽の光が
# すべて吸われて真っ黒になる（GPU の 1 回目で確かめた）ので、景色を包む箱（東西南北 70km・高さ 0〜9km）に入れる。
# 濃さは haze=（1m あたり。既定 0.000005：15km 先で約 7% かすむ）
HAZE = float(opt.get("haze", "0.000005"))
if HAZE > 0 and not PREVIEW:
    # 濃さが一様な体積は、光の通り方を式で一度に計算できる（細かく調べながら進まない）ので、ほとんど重くならない。
    # 雲海の上の澄んだ空気の層（1.8〜6km）だけに置く（雲海の中・下は見えない）
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 3900.0))
    hz = bpy.context.active_object
    hz.name = "haze"
    hz.scale = (70000.0, 70000.0, 4200.0)
    hm = bpy.data.materials.new("haze")
    hm.use_nodes = True
    hn = hm.node_tree
    for n in list(hn.nodes):
        hn.nodes.remove(n)
    hvol = hn.nodes.new("ShaderNodeVolumePrincipled")
    hvol.inputs["Anisotropy"].default_value = 0.65
    hvol.inputs["Color"].default_value = (0.75, 0.84, 1.0, 1.0)
    hvol.inputs["Density"].default_value = HAZE
    hout = hn.nodes.new("ShaderNodeOutputMaterial")
    hn.links.new(hvol.outputs[0], hout.inputs["Volume"])
    hz.data.materials.append(hm)

SUN_LAMP = float(opt.get("sun", "0"))
if SUN_LAMP > 0:
    # ランプで当てるとき：色は空のモデルの太陽を測った値（1 : 0.42 : 0.05）
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.color = (1.0, 0.42, 0.05)
    sun.data.energy = SUN_LAMP
    sun.data.angle = math.radians(0.53)
    sun.rotation_euler = (-SUN_DIR).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)

# ---------------------------------------------------------------- 雲海（立体の雲）
# 雲海（層積雲）の上面は、ゆるいうねりの上に、もくもくとした丸い頭（数百 m と百 m 前後）が並び、縁ははっきりしている。
# 上面の高さ＝うねり（約 4km・±180m）＋ 大きな頭（約 450m・最大 150m）＋ 小さな頭（約 130m・最大 50m）＋ 細かな乱れ。
# 頭の形はボロノイ（点のまわりの距離）で作り、ノイズで位置をゆがめて不ぞろいにする。上面から 40m で雲の中の濃さになる。
# clouds=1 で前の版（ノイズだけ・縁がやわらかい）・clouds=2 で立体のボロノイの版（重い）・clouds=3 でその場で形を計算する版
CLOUDS = opt.get("clouds", "4")
cm = bpy.data.materials.new("cloudsea")
cm.use_nodes = True
cn = cm.node_tree
for n in list(cn.nodes):
    cn.nodes.remove(n)
geo = cn.nodes.new("ShaderNodeNewGeometry")


def node(kind, **inputs):
    nd = cn.nodes.new(kind)
    for k, v in inputs.items():
        if k.startswith("_"):
            setattr(nd, k[1:], v)
        elif isinstance(v, bpy.types.NodeSocket):
            cn.links.new(v, nd.inputs[k] if not isinstance(k, int) else nd.inputs[k])
        else:
            nd.inputs[k].default_value = v
    return nd


def math_(op, a, b=None, c=None):
    nd = cn.nodes.new("ShaderNodeMath")
    nd.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, bpy.types.NodeSocket):
            cn.links.new(v, nd.inputs[i])
        else:
            nd.inputs[i].default_value = v
    return nd.outputs[0]


if CLOUDS == "1":
    box_bottom, box_top = CLOUD_BOTTOM, CLOUD_TOP + 250
    cx, cy = local(35.40, 138.80)
    box = (36000.0, 30000.0)
    tc = cn.nodes.new("ShaderNodeTexCoord")
    sep = cn.nodes.new("ShaderNodeSeparateXYZ")
    cn.links.new(tc.outputs["Object"], sep.inputs[0])
    big = node("ShaderNodeTexNoise", Scale=1 / 3000.0, Detail=6.0, Roughness=0.55, Vector=geo.outputs["Position"])
    small = node("ShaderNodeTexNoise", Scale=1 / 320.0, Detail=10.0, Roughness=0.6, Vector=geo.outputs["Position"])
    mixv = math_("MULTIPLY_ADD", small.outputs["Fac"], 0.35, big.outputs["Fac"])
    zn = node("ShaderNodeMapRange", Value=sep.outputs["Z"], **{"From Min": -0.5, "From Max": 0.5})
    top = math_("SUBTRACT", mixv, zn.outputs["Result"])
    edge = node("ShaderNodeMapRange", Value=top, **{"From Min": -0.18, "From Max": 0.05})
    density = math_("MULTIPLY", edge.outputs["Result"], 0.045)
elif CLOUDS == "2":
    box_bottom, box_top = CLOUD_BOTTOM, CLOUD_TOP + 250  # 箱の上はカメラ（2,350m）より下に
    cx, cy = local(35.40, 138.76)
    box = (60000.0, 50000.0)
    P = geo.outputs["Position"]
    sepw = node("ShaderNodeSeparateXYZ", Vector=P)
    # 位置のゆがみ（約 600m のノイズで ±160m）
    warp = node("ShaderNodeTexNoise", Scale=1 / 600.0, Detail=3.0, Roughness=0.5, Vector=P)
    wv = node("ShaderNodeVectorMath", _operation="MULTIPLY_ADD")
    cn.links.new(warp.outputs["Color"], wv.inputs[0])
    wv.inputs[1].default_value = (320.0, 320.0, 160.0)
    wv.inputs[2].default_value = (-160.0, -160.0, -80.0)
    Pw = node("ShaderNodeVectorMath", _operation="ADD")
    cn.links.new(P, Pw.inputs[0])
    cn.links.new(wv.outputs[0], Pw.inputs[1])
    Pw = Pw.outputs[0]
    # 頭は少し平たく（高さ方向を 1.5 倍に引きのばして距離を測る）
    flat = node("ShaderNodeVectorMath", _operation="MULTIPLY")
    cn.links.new(Pw, flat.inputs[0])
    flat.inputs[1].default_value = (1.0, 1.0, 1.5)
    flat = flat.outputs[0]
    und = node("ShaderNodeTexNoise", Scale=1 / 4000.0, Detail=4.0, Roughness=0.5, Vector=P)
    v1 = node("ShaderNodeTexVoronoi", _voronoi_dimensions="3D", _feature="SMOOTH_F1", Scale=1 / 450.0, Randomness=1.0, Smoothness=0.25, Vector=flat)
    v2 = node("ShaderNodeTexVoronoi", _voronoi_dimensions="3D", _feature="SMOOTH_F1", Scale=1 / 130.0, Randomness=1.0, Smoothness=0.25, Vector=flat)
    fine = node("ShaderNodeTexNoise", Scale=1 / 45.0, Detail=4.0, Roughness=0.55, Vector=Pw)
    # うねり ±180m。平均の上面がだいたい 2,000m（CLOUD_TOP − 50m）、いちばん高い頭で 2,250m くらい
    h = math_("MULTIPLY_ADD", und.outputs["Fac"], 360.0, CLOUD_TOP - 280.0)
    d1 = math_("SUBTRACT", 1.0, v1.outputs["Distance"])  # 点の近くで 1
    h = math_("MULTIPLY_ADD", math_("POWER", math_("MAXIMUM", d1, 0.0), 1.6), 150.0, h)
    d2 = math_("SUBTRACT", 1.0, v2.outputs["Distance"])
    h = math_("MULTIPLY_ADD", math_("POWER", math_("MAXIMUM", d2, 0.0), 1.6), 50.0, h)
    h = math_("MULTIPLY_ADD", fine.outputs["Fac"], 26.0, math_("SUBTRACT", h, 13.0))
    below = math_("SUBTRACT", h, sepw.outputs["Z"])  # 上面からの深さ（m）
    edge = node("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP", Value=below, **{"From Min": 0.0, "From Max": 40.0})
    # 下の端（箱の底）は 150m かけて消す
    bot = node("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP", Value=sepw.outputs["Z"], **{"From Min": box_bottom, "From Max": box_bottom + 150.0})
    # 中の濃さのむら（0.7〜1.0）
    var = node("ShaderNodeTexNoise", Scale=1 / 250.0, Detail=2.0, Vector=P)
    varm = math_("MULTIPLY_ADD", var.outputs["Fac"], 0.6, 0.7)
    density = math_("MULTIPLY", math_("MULTIPLY", edge.outputs["Result"], bot.outputs["Result"]), math_("MULTIPLY", varm, float(opt.get("cloud_density", "0.05"))))
elif CLOUDS in ("0", "3"):
    # 3 版：上面の高さを平面（x, y）だけの関数にして計算を軽くし、雲は上面から 260m の薄い層だけにする
    # （中まで深く入った光は上から見てもほとんど届かない。斜めの朝日の影の計算が、厚い雲の中を長く通らずにすむ）。
    # カメラから見える範囲（北は手前 1km、南は富士山の向こう、東西は画面の外まで）だけに置く
    LAYER = 260.0
    xmin, ymin = local(35.25, 138.60)
    xmax, ymax = local(35.505, 138.93)
    cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
    box = (xmax - xmin, ymax - ymin)
    box_bottom, box_top = CLOUD_TOP - 280.0 - LAYER, CLOUD_TOP + 250.0
    P = geo.outputs["Position"]
    sepw = node("ShaderNodeSeparateXYZ", Vector=P)
    # 平面の座標（z を 0 に）
    P2 = node("ShaderNodeCombineXYZ", X=sepw.outputs["X"], Y=sepw.outputs["Y"])
    P2 = P2.outputs[0]
    # 位置のゆがみ（約 700m のノイズで ±180m）。頭の並びを不ぞろいにする
    warp = node("ShaderNodeTexNoise", _noise_dimensions="2D", Scale=1 / 700.0, Detail=2.0, Roughness=0.5, Vector=P2)
    wv = node("ShaderNodeVectorMath", _operation="MULTIPLY_ADD")
    cn.links.new(warp.outputs["Color"], wv.inputs[0])
    wv.inputs[1].default_value = (360.0, 360.0, 0.0)
    wv.inputs[2].default_value = (-180.0, -180.0, 0.0)
    Pw = node("ShaderNodeVectorMath", _operation="ADD")
    cn.links.new(P2, Pw.inputs[0])
    cn.links.new(wv.outputs[0], Pw.inputs[1])
    Pw = Pw.outputs[0]
    und = node("ShaderNodeTexNoise", _noise_dimensions="2D", Scale=1 / 4000.0, Detail=3.0, Roughness=0.5, Vector=P2)
    # 頭の大きさの場所ごとのむら（頭の目立つ所と、なだらかな所）
    amp = node("ShaderNodeTexNoise", _noise_dimensions="2D", Scale=1 / 2500.0, Detail=1.0, Vector=P2)
    ampm = node("ShaderNodeMapRange", Value=amp.outputs["Fac"], **{"From Min": 0.35, "From Max": 0.65, "To Min": 0.45, "To Max": 1.25})
    v1 = node("ShaderNodeTexVoronoi", _voronoi_dimensions="2D", _feature="SMOOTH_F1", Scale=1 / 480.0, Randomness=1.0, Smoothness=0.35, Vector=Pw)
    v2 = node("ShaderNodeTexVoronoi", _voronoi_dimensions="2D", _feature="SMOOTH_F1", Scale=1 / 140.0, Randomness=1.0, Smoothness=0.35, Vector=Pw)
    fine = node("ShaderNodeTexNoise", _noise_dimensions="2D", Scale=1 / 38.0, Detail=5.0, Roughness=0.55, Vector=Pw)
    h = math_("MULTIPLY_ADD", und.outputs["Fac"], 360.0, CLOUD_TOP - 280.0)  # うねり ±180m
    d1 = math_("POWER", math_("MAXIMUM", math_("SUBTRACT", 1.0, v1.outputs["Distance"]), 0.0), 1.5)
    d2 = math_("POWER", math_("MAXIMUM", math_("SUBTRACT", 1.0, v2.outputs["Distance"]), 0.0), 1.5)
    bumps = math_("MULTIPLY_ADD", d2, 55.0, math_("MULTIPLY", d1, 160.0))
    h = math_("MULTIPLY_ADD", bumps, ampm.outputs["Result"], h)
    h = math_("MULTIPLY_ADD", fine.outputs["Fac"], 30.0, math_("SUBTRACT", h, 15.0))
    below = math_("SUBTRACT", h, sepw.outputs["Z"])  # 上面からの深さ（m）
    # 上の縁：外は 0、上面から 30m で中の濃さ。下は LAYER の深さで消す（雲の底は見えない）
    edge = node("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP", Value=below, **{"From Min": -4.0, "From Max": 30.0})
    deep = node("ShaderNodeMapRange", Value=below, **{"From Min": LAYER - 60.0, "From Max": LAYER, "To Min": 1.0, "To Max": 0.0})
    # 縁の近くだけ、細かな立体のノイズで綿のようにほつれさせる（約 25m）
    wisp = node("ShaderNodeTexNoise", Scale=1 / 25.0, Detail=3.0, Roughness=0.6, Vector=P)
    wm = node("ShaderNodeMapRange", Value=wisp.outputs["Fac"], **{"From Min": 0.38, "From Max": 0.62})
    near_top = node("ShaderNodeMapRange", Value=below, **{"From Min": 0.0, "From Max": 45.0, "To Min": 1.0, "To Max": 0.0})
    shred = math_("SUBTRACT", 1.0, math_("MULTIPLY", near_top.outputs["Result"], math_("SUBTRACT", 1.0, wm.outputs["Result"])))
    density = math_("MULTIPLY", math_("MULTIPLY", edge.outputs["Result"], deep.outputs["Result"]), math_("MULTIPLY", shred, float(opt.get("cloud_density", "0.05"))))
else:
    # 4 版（既定）：上面の高さ（3 版と同じ考え方）を numpy で前もって 1 枚の高さの画像に焼き、雲の材質はそれを読むだけにする。
    # 雲を入れる入れ物も、箱ではなく雲の上面に沿った形（64m ごとの格子。上は上面の最大＋30m、下は上面の最小−260m）にして、
    # 雲の上の空っぽの所を光が細かく調べながら長く通らないようにする（3 版の重さの大半はこれと、その場での形の計算）
    t1 = time.time()
    LAYER = 260.0
    xmin, ymin = local(35.25, 138.60)
    xmax, ymax = local(35.505, 138.93)
    TEX = float(opt.get("cloud_texel", "8"))  # 高さの画像の 1 画素（m）
    NX, NY = int((xmax - xmin) / TEX), int((ymax - ymin) / TEX)
    gx = (xmin + (np.arange(NX, dtype=np.float32) + 0.5) * TEX)[None, :]
    gy = (ymin + (np.arange(NY, dtype=np.float32) + 0.5) * TEX)[:, None]

    def hash01(ix, iy, seed):
        hh = (ix.astype(np.uint64) * np.uint64(374761393) + iy.astype(np.uint64) * np.uint64(668265263) + np.uint64(seed * 2654435761 % 2**32)) & np.uint64(0xFFFFFFFF)
        hh = ((hh ^ (hh >> np.uint64(13))) * np.uint64(1274126177)) & np.uint64(0xFFFFFFFF)
        hh = hh ^ (hh >> np.uint64(16))
        return (hh & np.uint64(0xFFFFFF)).astype(np.float32) / np.float32(0x1000000)

    def perlin(x, y, seed):
        x0, y0 = np.floor(x), np.floor(y)
        fx, fy = (x - x0).astype(np.float32), (y - y0).astype(np.float32)
        ix, iy = x0.astype(np.int64) + 1_000_000, y0.astype(np.int64) + 1_000_000
        def g(i, j, dx, dy):
            a = hash01(i, j, seed) * np.float32(2 * math.pi)
            return np.cos(a) * dx + np.sin(a) * dy
        u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
        v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
        n0 = g(ix, iy, fx, fy) * (1 - u) + g(ix + 1, iy, fx - 1, fy) * u
        n1 = g(ix, iy + 1, fx, fy - 1) * (1 - u) + g(ix + 1, iy + 1, fx - 1, fy - 1) * u
        return n0 * (1 - v) + n1 * v  # だいたい −0.7〜0.7

    def fbm(x, y, scale, octaves, seed, rough=0.5):
        tot, amp, norm = 0.0, 1.0, 0.0
        for o in range(octaves):
            f = 2.0**o / scale
            tot = tot + amp * perlin(x * f, y * f, seed + o * 17)
            norm += amp
            amp *= rough
        return 0.5 + 0.75 * tot / norm  # だいたい 0〜1（中心 0.5）

    def domes(x, y, cell, seed, smooth=0.35):
        """点のまわりの丸い頭（0〜1）。ボロノイの距離のなめらかな最小（隣り合う頭がなだらかにつながる）"""
        cx_, cy_ = x / cell, y / cell
        ix, iy = np.floor(cx_).astype(np.int64) + 1_000_000, np.floor(cy_).astype(np.int64) + 1_000_000
        acc = np.zeros(np.broadcast(cx_, cy_).shape, dtype=np.float32)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                jx, jy = ix + di, iy + dj
                px = (jx - 1_000_000).astype(np.float32) + hash01(jx, jy, seed)
                py = (jy - 1_000_000).astype(np.float32) + hash01(jx, jy, seed + 7)
                d = np.sqrt((px - cx_) ** 2 + (py - cy_) ** 2)
                acc += np.exp(-d / smooth * 4.0)
        f1 = -np.log(np.maximum(acc, 1e-12)) * smooth / 4.0
        return np.clip(1.0 - f1, 0.0, 1.0) ** 1.5

    X = np.broadcast_to(gx, (NY, NX))
    Y = np.broadcast_to(gy, (NY, NX))
    # 位置のゆがみ（約 700m で ±180m）
    wx = X + (fbm(X, Y, 700.0, 2, 11) - 0.5) * 360.0
    wy = Y + (fbm(X, Y, 700.0, 2, 23) - 0.5) * 360.0
    und = fbm(X, Y, 4000.0, 3, 31)
    ampm = np.clip((fbm(X, Y, 2500.0, 2, 41) - 0.35) / 0.3, 0.0, 1.0) * 0.7 + 0.45
    bumps = domes(wx, wy, 480.0, 53) * 140.0 + domes(wx, wy, 140.0, 67) * 50.0
    fine = fbm(wx, wy, 38.0, 5, 79, 0.55)
    top = (CLOUD_TOP - 280.0 + float(opt.get("cloud_lift", "40"))) + und * 300.0 + bumps * ampm + (fine - 0.5) * 30.0
    CAP = CLOUD_TOP + 130.0  # 2,180m より上は半分の高さに（いちばん高い頭でもカメラより 60m 以上下）
    top = np.where(top > CAP, CAP + (top - CAP) * 0.5, top).astype(np.float32)
    if opt.get("cloud_preview") == "1":  # 確かめ用：上から見た雲の高さ（明るいほど高い。北が上）
        from PIL import Image as _PIL
        q = top[::-4, ::4]
        q = ((q - q.min()) / max(1e-6, float(q.max() - q.min())) * 255).astype(np.uint8)
        _PIL.fromarray(q).save(os.path.join(OUT, "cloudtop.png"))
    img = bpy.data.images.new("cloudtop", NX, NY, alpha=False, float_buffer=True, is_data=True)
    # 16 ビットの浮動小数（Blender の既定）だと、2,000m 前後の高さが 1〜2m 刻みの段になり、低い角度から見ると横縞になる
    # （GPU の 4 回目で見えた）。32 ビットで持ち、値も基準（CLOUD_TOP）からの差にする
    if hasattr(img, "use_half_precision"):
        img.use_half_precision = False
    rgba = np.zeros((NY, NX, 4), dtype=np.float32)
    rgba[..., :3] = (top - CLOUD_TOP)[..., None]  # 色→数の変換（重みの和が 1）で値がそのまま出るよう、R・G・B に同じ値
    rgba[..., 3] = 1.0
    img.pixels.foreach_set(rgba.reshape(-1))
    del rgba
    # 入れ物（雲の上面に沿った、閉じた形）。64m ごとの格子で、上は上面の最大＋30m、下は最小−LAYER
    B = max(1, int(round(64.0 / TEX)))
    by, bx = NY // B, NX // B
    tb = top[: by * B, : bx * B].reshape(by, B, bx, B)
    tmax, tmin = tb.max(axis=(1, 3)), tb.min(axis=(1, 3))
    # 頂点は、まわりの 4 つの格子の最大・最小（端は 1 つ外へ広げる）
    pad_max = np.pad(tmax, 1, mode="edge")
    pad_min = np.pad(tmin, 1, mode="edge")
    vmax = np.maximum.reduce([pad_max[:-1, :-1], pad_max[1:, :-1], pad_max[:-1, 1:], pad_max[1:, 1:]]) + 8.0 + float(opt.get("cloud_wisp", "40")) / 2
    vmin = np.minimum.reduce([pad_min[:-1, :-1], pad_min[1:, :-1], pad_min[:-1, 1:], pad_min[1:, 1:]]) - LAYER
    vy_, vx_ = vmax.shape
    vxs = xmin + np.arange(vx_) * (B * TEX)
    vys = ymin + np.arange(vy_) * (B * TEX)
    nv = vx_ * vy_
    co = np.zeros((2, vy_, vx_, 3), dtype=np.float32)
    co[:, :, :, 0] = vxs[None, None, :]
    co[:, :, :, 1] = vys[None, :, None]
    co[0, :, :, 2] = vmax
    co[1, :, :, 2] = vmin
    idx = np.arange(2 * nv).reshape(2, vy_, vx_)
    T, Bo = idx[0], idx[1]
    faces = []
    # 上（外向き＝上）・下（外向き＝下）
    faces.append(np.stack([T[:-1, :-1], T[:-1, 1:], T[1:, 1:], T[1:, :-1]], -1).reshape(-1, 4))
    faces.append(np.stack([Bo[:-1, :-1], Bo[1:, :-1], Bo[1:, 1:], Bo[:-1, 1:]], -1).reshape(-1, 4))
    # 横の 4 面（外向き）
    faces.append(np.stack([T[0, :-1], Bo[0, :-1], Bo[0, 1:], T[0, 1:]], -1))          # 南（y 最小）
    faces.append(np.stack([T[-1, 1:], Bo[-1, 1:], Bo[-1, :-1], T[-1, :-1]], -1))      # 北
    faces.append(np.stack([T[1:, 0], Bo[1:, 0], Bo[:-1, 0], T[:-1, 0]], -1))          # 西（x 最小）
    faces.append(np.stack([T[:-1, -1], Bo[:-1, -1], Bo[1:, -1], T[1:, -1]], -1))      # 東
    faces = np.concatenate(faces).astype(np.int32)
    me = bpy.data.meshes.new("cloudsea")
    me.vertices.add(2 * nv)
    me.vertices.foreach_set("co", co.reshape(-1))
    me.loops.add(faces.size)
    me.loops.foreach_set("vertex_index", faces.reshape(-1))
    me.polygons.add(len(faces))
    me.polygons.foreach_set("loop_start", (np.arange(len(faces)) * 4).astype(np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(faces), 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate()
    cloud = bpy.data.objects.new("cloudsea", me)
    scene.collection.objects.link(cloud)
    # 材質：高さの画像を読み、上面からの深さで濃さを決める
    P = geo.outputs["Position"]
    sepw = node("ShaderNodeSeparateXYZ", Vector=P)
    uvx = math_("MULTIPLY_ADD", sepw.outputs["X"], 1.0 / (NX * TEX), -xmin / (NX * TEX))
    uvy = math_("MULTIPLY_ADD", sepw.outputs["Y"], 1.0 / (NY * TEX), -ymin / (NY * TEX))
    uvv = node("ShaderNodeCombineXYZ", X=uvx, Y=uvy)
    timg = node("ShaderNodeTexImage", _image=img, _interpolation="Linear", _extension="EXTEND", Vector=uvv.outputs[0])
    # 手前の雲はカメラから約 3km（1 画素 0.75m）。焼いた高さ（8m ごと）より細かい凹凸を、立体のノイズで表面に足す
    # （約 25m から 1.5m まで、±12m）。同じノイズで、上の縁を綿のようにほつれさせる
    # 手元で 1080p の手前の雲を描き比べて決めた（濃さ 0.05・縁 16m・凹凸 24m では表面が 20〜40m ぼけて霧のよう）
    WISP = float(opt.get("cloud_wisp", "40"))  # 細かな凹凸の幅（m）
    EDGE = float(opt.get("cloud_edge", "8"))  # 上面から中の濃さになるまで（m）
    # 凹凸の細かさ：約 40m から、5 段で 1.25m まで（4K では cloud_wisp_detail=6 で 0.6m まで）
    wisp = node("ShaderNodeTexNoise", Scale=1 / float(opt.get("cloud_wisp_scale", "40")), Detail=float(opt.get("cloud_wisp_detail", "5")), Roughness=0.6, Vector=P)
    hz_ = math_("ADD", timg.outputs["Color"], CLOUD_TOP)
    hz_ = math_("MULTIPLY_ADD", wisp.outputs["Fac"], WISP, math_("SUBTRACT", hz_, WISP / 2))
    below = math_("SUBTRACT", hz_, sepw.outputs["Z"])  # 上面からの深さ（m）
    edge = node("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP", Value=below, **{"From Min": -2.0, "From Max": EDGE})
    deep = node("ShaderNodeMapRange", Value=below, **{"From Min": LAYER - 60.0, "From Max": LAYER, "To Min": 1.0, "To Max": 0.0})
    wm = node("ShaderNodeMapRange", Value=wisp.outputs["Fac"], **{"From Min": 0.38, "From Max": 0.62})
    near_top = node("ShaderNodeMapRange", Value=below, **{"From Min": 0.0, "From Max": 30.0, "To Min": 1.0, "To Max": 0.0})
    shred = math_("SUBTRACT", 1.0, math_("MULTIPLY", near_top.outputs["Result"], math_("SUBTRACT", 1.0, wm.outputs["Result"])))
    # 濃さ 0.12/m（雲の中で光がまっすぐ進めるのは平均 8m。層積雲の上の方の濃さ）
    density = math_("MULTIPLY", math_("MULTIPLY", edge.outputs["Result"], deep.outputs["Result"]), math_("MULTIPLY", shred, float(opt.get("cloud_density", "0.12"))))
    print(f"雲海（4 版）：高さの画像 {NX}x{NY}（{TEX:.0f}m）・入れ物 {vx_}x{vy_}・上面 {top.min():.0f}〜{top.max():.0f}m（平均 {top.mean():.0f}m）（{time.time() - t1:.1f} 秒）", flush=True)
    del X, Y, wx, wy, und, ampm, bumps, fine
if CLOUDS in ("0", "1", "2", "3"):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, (box_top + box_bottom) / 2))
    cloud = bpy.context.active_object
    cloud.scale = (box[0], box[1], box_top - box_bottom)
    if CLOUDS == "0":  # 雲なし（重さを測るとき）
        cloud.hide_render = True
cloud.name = "cloudsea"
vol = cn.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
vol.inputs["Anisotropy"].default_value = 0.55
cn.links.new(density, vol.inputs["Density"])
mo = cn.nodes.new("ShaderNodeOutputMaterial")
cn.links.new(vol.outputs[0], mo.inputs["Volume"])
cloud.data.materials.append(cm)

# ---------------------------------------------------------------- カメラ（山頂の少し下を見て、まっすぐ前へ）
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = float(opt.get("lens", "70"))
cam.data.sensor_width = 36
cam.data.clip_start = 5.0
cam.data.clip_end = 120000.0
scene.collection.objects.link(cam)
scene.camera = cam
p0 = Vector((*local(CAM0[0], CAM0[1]), CAM0[2]))
target = Vector((0.0, 0.0, float(opt.get("aim", "2900"))))
fwd = (target - p0).normalized()
flat = Vector((fwd.x, fwd.y, 0.0)).normalized()
f_end = FR[1] if len(FR) > 1 else FR[0]
scene.frame_start, scene.frame_end = 1, max(90, f_end)
for f, p in ((1, p0), (90, p0 + flat * CAM_PUSH)):
    cam.location = p
    cam.rotation_euler = (target - p).to_track_quat("-Z", "Y").to_euler()
    cam.keyframe_insert("location", frame=f)
    cam.keyframe_insert("rotation_euler", frame=f)
for fc in (cam.animation_data.action.fcurves if hasattr(cam.animation_data.action, "fcurves") else []):
    for k in fc.keyframe_points:
        k.interpolation = "LINEAR"

# ---------------------------------------------------------------- 描く
first, last = FR[0], (FR[1] if len(FR) > 1 else FR[0])
times = []
for f in range(first, last + 1):
    scene.frame_set(f)
    scene.render.filepath = os.path.join(OUT, "frames", f"{f:04d}.png")
    t = time.time()
    bpy.ops.render.render(write_still=True)
    times.append(time.time() - t)
    print(f"コマ {f}: {times[-1]:.1f} 秒", flush=True)
rep = f"装置: {device}\n大きさ: {W}x{H}\n光の計算: {SAMPLES} 回\n地形: {'・'.join(info)}\nコマ: {first}-{last}\n1 コマの平均: {sum(times) / len(times):.1f} 秒\n"
print(rep, flush=True)
with open(os.path.join(OUT, "report.txt"), "w") as fh:
    fh.write(rep)
