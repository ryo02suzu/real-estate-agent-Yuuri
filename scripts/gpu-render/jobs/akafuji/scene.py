# 赤富士の試し撮り：夏の夜明け、雲海の上で朝日に赤く染まる富士山を、東（山中湖の上空）から見る。
# 地形は国土地理院の標高タイル（10m）、色は航空写真（全国最新写真（シームレス））。雲海と空気のかすみは Blender の立体（体積）で、
# 空は物理の空のモデル。カメラはゆっくり前へ進む（3 秒）。fetch.py で作った材料（dem.npy・photo.jpg）を読む。
#
#   blender -b --factory-startup --python scene.py -- <材料のフォルダ> <出力のフォルダ> [設定...]
#   設定：frames=1-90（描くコマ）・res=1920x1080・samples=1024・stride=1（標高の間引き。1 で 10m）・fps=30・preview=0（1 で CPU 向けに軽く）
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
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass
scene.view_settings.exposure = float(opt.get("exposure", "-0.8"))

# ---------------------------------------------------------------- 地形（標高 → 網の目、航空写真の色）
t0 = time.time()
dem = np.load(os.path.join(DATA, "dem.npy"))
dm = json.load(open(os.path.join(DATA, "dem.json")))
pm = json.load(open(os.path.join(DATA, "photo.json")))
h = dem[::STRIDE, ::STRIDE]
ny, nx = h.shape
# 画素の中心の経度・緯度（ズーム z のタイルの画素の座標）
px = (dm["x0"] * 256 + (np.arange(nx) * STRIDE + 0.5 * STRIDE))
py = (dm["y0"] * 256 + (np.arange(ny) * STRIDE + 0.5 * STRIDE))
lon, _ = tile_lonlat(px, np.zeros_like(px), dm["z"] + 8)
_, lat = tile_lonlat(np.zeros_like(py), py, dm["z"] + 8)
X = (lon[None, :] - LON0) * MX
Y = (lat[:, None] - LAT0) * MY
verts = np.zeros((ny, nx, 3), dtype=np.float32)
verts[..., 0] = X
verts[..., 1] = Y
verts[..., 2] = h
# 航空写真の UV（写真のズームの画素の座標 → 0..1）
s = 2.0 ** (pm["z"] - dm["z"])
u = ((px * s) - pm["x0"] * 256) / (pm["nx"] * 256)
v = 1.0 - ((py * s) - pm["y0"] * 256) / (pm["ny"] * 256)
uv = np.zeros((ny, nx, 2), dtype=np.float32)
uv[..., 0] = u[None, :]
uv[..., 1] = v[:, None]
idx = np.arange(nx * ny).reshape(ny, nx)
quads = np.stack([idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]], axis=-1).reshape(-1, 4)
mesh = bpy.data.meshes.new("terrain")
mesh.vertices.add(nx * ny)
mesh.vertices.foreach_set("co", verts.reshape(-1))
mesh.loops.add(quads.size)
mesh.loops.foreach_set("vertex_index", quads.reshape(-1).astype(np.int32))
mesh.polygons.add(len(quads))
mesh.polygons.foreach_set("loop_start", (np.arange(len(quads)) * 4).astype(np.int32))
mesh.polygons.foreach_set("loop_total", np.full(len(quads), 4, dtype=np.int32))
uvl = mesh.uv_layers.new(name="photo")
uvl.data.foreach_set("uv", uv.reshape(-1, 2)[quads.reshape(-1)].reshape(-1))
mesh.update(calc_edges=True)
mesh.validate()
mesh.shade_smooth() if hasattr(mesh, "shade_smooth") else None
terrain = bpy.data.objects.new("terrain", mesh)
scene.collection.objects.link(terrain)
print(f"地形: {nx}x{ny} 点（{time.time() - t0:.1f} 秒）", flush=True)

mat = bpy.data.materials.new("ground")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
img = nt.nodes.new("ShaderNodeTexImage")
img.image = bpy.data.images.load(os.path.join(DATA, "photo.jpg"))
img.interpolation = "Cubic"
img.extension = "EXTEND"
# 航空写真は朝の光ではない（真上からの昼の光で撮ったもの）。明るさを少し落として地面の反射の色にする
hsv = nt.nodes.new("ShaderNodeHueSaturation")
hsv.inputs["Saturation"].default_value = 1.05
hsv.inputs["Value"].default_value = 0.78
nt.links.new(img.outputs["Color"], hsv.inputs["Color"])
nt.links.new(hsv.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.92
# 写真の明るさの細かい模様を、でこぼこにも使う（岩・沢の陰影）
bump = nt.nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.25
bump.inputs["Distance"].default_value = 2.0
nt.links.new(img.outputs["Color"], bump.inputs["Height"])
nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
terrain.data.materials.append(mat)

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
for attr, val in (("altitude", 2300.0), ("air_density", 1.0), ("aerosol_density", 1.6), ("dust_density", 1.6), ("ozone_density", 1.2), ("ground_albedo", 0.35)):
    if hasattr(sky, attr):
        setattr(sky, attr, val)
bg = wn.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = float(opt.get("sky", "0.5"))
wo = wn.nodes.new("ShaderNodeOutputWorld")
wn.links.new(sky.outputs[0], bg.inputs[0])
wn.links.new(bg.outputs[0], wo.inputs["Surface"])
# 空気のかすみ（遠くほど青白く、朝日の方は明るく。前に強く散らす）
if not PREVIEW:
    haze = wn.nodes.new("ShaderNodeVolumePrincipled")
    haze.inputs["Density"].default_value = 0.000018
    haze.inputs["Anisotropy"].default_value = 0.65
    haze.inputs["Color"].default_value = (0.75, 0.84, 1.0, 1.0)
    wn.links.new(haze.outputs[0], wo.inputs["Volume"])

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
# 高さ 2 度の朝日は、空気を長く通って赤くなる（色はおおよそ。強さは空のモデルに合わせて目で決める）
sun.data.color = (1.0, 0.36, 0.16)
sun.data.energy = float(opt.get("sun", "9.0"))
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
rep = f"装置: {device}\n大きさ: {W}x{H}\n光の計算: {SAMPLES} 回\n地形: {nx}x{ny} 点（間引き {STRIDE}）\nコマ: {first}-{last}\n1 コマの平均: {sum(times) / len(times):.1f} 秒\n"
print(rep, flush=True)
with open(os.path.join(OUT, "report.txt"), "w") as fh:
    fh.write(rep)
