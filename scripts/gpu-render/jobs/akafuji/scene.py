# 赤富士の試し撮り：夏の夜明け、雲海の上で朝日に赤く染まる富士山を、東（山中湖の上空）から見る。
# 地形は国土地理院の標高タイル（10m）、色は航空写真（全国最新写真（シームレス））。雲海と空気のかすみは Blender の立体（体積）で、
# 空は物理の空のモデル。カメラはゆっくり前へ進む（3 秒）。fetch.py で作った材料（dem.npy・photo.jpg）を読む。
#
#   blender -b --factory-startup --python scene.py -- <材料のフォルダ> <出力のフォルダ> [設定...]
#   設定：frames=1-90（描くコマ）・res=1920x1080・samples=1024・fps=30・preview=0（1 で CPU 向けに軽く。かすみ無し）
#         cone_stride=1（山の部分の 5m の標高の間引き）・base_stride=2（広い範囲の 10m の標高の間引き。山の部分が無いときは stride）
#         exposure=-0.8・look=Medium_High_Contrast（AgX の見え方。Punchy など）・sky=0.5（空と太陽の強さ）
#         disc=1（空のモデルの太陽で照らす）・sun=0（ランプで照らす強さ。使うときは disc=0）・aerosol=1.6・haze=0.000016（かすみ）
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
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 12
scene.cycles.volume_bounces = 2 if PREVIEW else 12
scene.cycles.volume_step_rate = 4.0 if PREVIEW else 1.0
scene.cycles.use_adaptive_sampling = True
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = 100
scene.render.fps = FPS
scene.render.use_motion_blur = not PREVIEW
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
# 雲海の上は空気が澄むので、高さとともに薄く（1.8km ごとに 1/e）。濃さは haze=（カメラの高さでの 1m あたり。既定 0.000016）
HAZE = float(opt.get("haze", "0.000016"))
if HAZE > 0 and not PREVIEW:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 4500.0))
    hz = bpy.context.active_object
    hz.name = "haze"
    hz.scale = (70000.0, 70000.0, 9000.0)
    hm = bpy.data.materials.new("haze")
    hm.use_nodes = True
    hn = hm.node_tree
    for n in list(hn.nodes):
        hn.nodes.remove(n)
    hgeo = hn.nodes.new("ShaderNodeNewGeometry")
    hsep = hn.nodes.new("ShaderNodeSeparateXYZ")
    hn.links.new(hgeo.outputs["Position"], hsep.inputs[0])
    hsub = hn.nodes.new("ShaderNodeMath")
    hsub.operation = "MULTIPLY_ADD"  # (z × (-1/1800)) + 2350/1800
    hsub.inputs[1].default_value = -1.0 / 1800.0
    hsub.inputs[2].default_value = CAM0[2] / 1800.0
    hn.links.new(hsep.outputs["Z"], hsub.inputs[0])
    hexp = hn.nodes.new("ShaderNodeMath")
    hexp.operation = "EXPONENT"
    hn.links.new(hsub.outputs[0], hexp.inputs[0])
    hden = hn.nodes.new("ShaderNodeMath")
    hden.operation = "MULTIPLY"
    hden.inputs[1].default_value = HAZE
    hden.use_clamp = False
    hn.links.new(hexp.outputs[0], hden.inputs[0])
    hvol = hn.nodes.new("ShaderNodeVolumePrincipled")
    hvol.inputs["Anisotropy"].default_value = 0.65
    hvol.inputs["Color"].default_value = (0.75, 0.84, 1.0, 1.0)
    hn.links.new(hden.outputs[0], hvol.inputs["Density"])
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
cx, cy = local(35.40, 138.80)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, (CLOUD_TOP + 250 + CLOUD_BOTTOM) / 2))
cloud = bpy.context.active_object
cloud.name = "cloudsea"
cloud.scale = (36000.0, 30000.0, CLOUD_TOP + 250 - CLOUD_BOTTOM)
cm = bpy.data.materials.new("cloudsea")
cm.use_nodes = True
cn = cm.node_tree
for n in list(cn.nodes):
    cn.nodes.remove(n)
tc = cn.nodes.new("ShaderNodeTexCoord")
sep = cn.nodes.new("ShaderNodeSeparateXYZ")
cn.links.new(tc.outputs["Object"], sep.inputs[0])
# 大きなうねり（約 3km）と細かな粒（約 300m）。世界の座標で揃える（箱の大きさに引っぱられない）
big = cn.nodes.new("ShaderNodeTexNoise")
big.inputs["Scale"].default_value = 1 / 3000.0
big.inputs["Detail"].default_value = 6.0
big.inputs["Roughness"].default_value = 0.55
small = cn.nodes.new("ShaderNodeTexNoise")
small.inputs["Scale"].default_value = 1 / 320.0
small.inputs["Detail"].default_value = 10.0
small.inputs["Roughness"].default_value = 0.6
geo = cn.nodes.new("ShaderNodeNewGeometry")
cn.links.new(geo.outputs["Position"], big.inputs["Vector"])
cn.links.new(geo.outputs["Position"], small.inputs["Vector"])
mix = cn.nodes.new("ShaderNodeMath")
mix.operation = "MULTIPLY_ADD"
mix.inputs[1].default_value = 0.35
cn.links.new(small.outputs["Fac"], mix.inputs[0])
cn.links.new(big.outputs["Fac"], mix.inputs[2])
# 高さ（0 が下、1 が上）。上面の高さを、うねりで上下させる
zn = cn.nodes.new("ShaderNodeMapRange")
zn.inputs["From Min"].default_value = -0.5
zn.inputs["From Max"].default_value = 0.5
cn.links.new(sep.outputs["Z"], zn.inputs["Value"])
top = cn.nodes.new("ShaderNodeMath")
top.operation = "SUBTRACT"
cn.links.new(mix.outputs[0], top.inputs[0])
cn.links.new(zn.outputs["Result"], top.inputs[1])
edge = cn.nodes.new("ShaderNodeMapRange")
edge.inputs["From Min"].default_value = -0.18
edge.inputs["From Max"].default_value = 0.05
cn.links.new(top.outputs[0], edge.inputs["Value"])
dens = cn.nodes.new("ShaderNodeMath")
dens.operation = "MULTIPLY"
dens.inputs[1].default_value = 0.045
cn.links.new(edge.outputs["Result"], dens.inputs[0])
vol = cn.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
vol.inputs["Anisotropy"].default_value = 0.55
cn.links.new(dens.outputs[0], vol.inputs["Density"])
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
