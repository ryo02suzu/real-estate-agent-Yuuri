# GPU の動作確認の絵：低い朝日（空の物理モデル）と、光が中で何度も跳ね返る立体の雲。1 枚描いて、使った装置と時間を report.txt に書く
import sys
import time

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
out = argv[0] if argv else "/tmp/out"
samples = int(argv[1]) if len(argv) > 1 else 1024
w, h = (int(x) for x in (argv[2] if len(argv) > 2 else "1920x1080").split("x"))

# GPU を選ぶ（OptiX → CUDA → CPU の順）
prefs = bpy.context.preferences.addons["cycles"].preferences
device = "CPU"
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.refresh_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            device = kind
            break
    except TypeError:
        continue
names = [f"{d.name}({d.type})" for d in prefs.devices if d.use]
print("使う装置:", device, names, flush=True)

scene = bpy.context.scene
for o in list(scene.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene.render.engine = "CYCLES"
scene.cycles.device = "GPU" if device != "CPU" else "CPU"
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.cycles.volume_bounces = 8
scene.cycles.max_bounces = 16
scene.render.resolution_x, scene.render.resolution_y = w, h
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "16"
try:
    scene.view_settings.view_transform = "AgX"
except TypeError:
    pass

# 空（物理モデル。日の出直後の低い太陽）
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
nt = world.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
sky = nt.nodes.new("ShaderNodeTexSky")
for t in ("MULTIPLE_SCATTERING", "NISHITA", "SINGLE_SCATTERING", "HOSEK_WILKIE"):
    try:
        sky.sky_type = t
        break
    except TypeError:
        continue
for attr, val in (("sun_elevation", 0.06), ("sun_rotation", 1.2), ("altitude", 3000.0), ("air_density", 1.0), ("dust_density", 2.0)):
    if hasattr(sky, attr):
        setattr(sky, attr, val)
bg = nt.nodes.new("ShaderNodeBackground")
wo = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(sky.outputs[0], bg.inputs[0])
nt.links.new(bg.outputs[0], wo.inputs[0])

# 太陽（空と同じ向き）
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0
sun.data.angle = 0.0093
sun.rotation_euler = (1.5708 - 0.06, 0.0, 1.2 + 3.1416)
scene.collection.objects.link(sun)

# 立体の雲：箱の中に、ノイズで形を作った密度
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1200))
cloud = bpy.context.active_object
cloud.scale = (6000, 6000, 900)
mat = bpy.data.materials.new("cloud")
mat.use_nodes = True
mn = mat.node_tree
for n in list(mn.nodes):
    mn.nodes.remove(n)
tc = mn.nodes.new("ShaderNodeTexCoord")
noise = mn.nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 2.2
noise.inputs["Detail"].default_value = 12.0
noise.inputs["Roughness"].default_value = 0.62
ramp = mn.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.52
ramp.color_ramp.elements[1].position = 0.70
grad = mn.nodes.new("ShaderNodeTexGradient")
grad.gradient_type = "SPHERICAL"
mul = mn.nodes.new("ShaderNodeMath")
mul.operation = "MULTIPLY"
dens = mn.nodes.new("ShaderNodeMath")
dens.operation = "MULTIPLY"
dens.inputs[1].default_value = 0.004
vol = mn.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Anisotropy"].default_value = 0.6
mo = mn.nodes.new("ShaderNodeOutputMaterial")
mn.links.new(tc.outputs["Object"], noise.inputs["Vector"])
mn.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
mn.links.new(tc.outputs["Object"], grad.inputs["Vector"])
mn.links.new(ramp.outputs["Color"], mul.inputs[0])
mn.links.new(grad.outputs["Fac"], mul.inputs[1])
mn.links.new(mul.outputs[0], dens.inputs[0])
mn.links.new(dens.outputs[0], vol.inputs["Density"])
mn.links.new(vol.outputs[0], mo.inputs["Volume"])
cloud.data.materials.append(mat)

# カメラ：雲の少し上から、朝日の方を見る
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 28
cam.location = (-2600, -2600, 1900)
cam.rotation_euler = (1.48, 0.0, -0.95)
scene.collection.objects.link(cam)
scene.camera = cam

t0 = time.time()
scene.render.filepath = f"{out}/smoke.png"
bpy.ops.render.render(write_still=True)
dt = time.time() - t0
msg = f"装置: {device} {names}\n大きさ: {w}x{h}\n光の計算: {samples} 回\nかかった時間: {dt:.1f} 秒\nBlender: {bpy.app.version_string}\n"
print(msg, flush=True)
with open(f"{out}/report.txt", "w") as f:
    f.write(msg)
