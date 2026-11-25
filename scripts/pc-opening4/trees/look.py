"""確かめの絵を描く（bpy）。使い方：
    python look.py sheet close forest backlit lod      （引数なし＝全部）
     forestcrops＝前から光の森＋映画の解像度（3840 幅）の等倍切り出し 3 枚（樹冠のふち・内側・幹の根元）
出力：../review/trees/*.jpg（横 1280px まで）。Cycles・CPU 2 スレッド・AgX・ノイズ除去（色・法線つき）。
空は Blender の空（多重散乱）、標高 1800m。太陽の向き：sun_rotation=0 で +Y 方向、増やすと反時計まわり。
"""
import sys, os, time, math, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import bpy
from PIL import Image
from mathutils import Vector
from trees import library, materials, twigs
from trees.treegen import make_rng

OUT = os.path.join(os.path.dirname(HERE), "review", "trees")
TMP = os.environ.get("OP4_TMP", "/tmp/op4_trees")
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
TIMES = {}
EXPOSURE = -3.0
EXPOSURE_BACK = -2.2
FLAT_BG = (0.9, 1.0, 1.15)


def sun_vec(rot):
    return np.array([-math.sin(rot), math.cos(rot)])


def fresh(w, h, samples, sun_elev, sun_rot, sky_strength=1.0, exposure=None, transparent=False, flat_bg=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"     # 色・法線も見てノイズ除去（針をにじませない）
    # 葉は何枚も重なって光が通るので、反射・透過・透明の回数は多めに（足りないと真っ黒になる）
    sc.cycles.max_bounces = 12
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 3
    sc.cycles.transmission_bounces = 6
    sc.cycles.volume_bounces = 0
    sc.cycles.transparent_max_bounces = 32
    sc.cycles.sample_clamp_indirect = 8.0
    sc.render.threads_mode = "FIXED"
    sc.render.threads = 2
    sc.render.film_transparent = transparent
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = EXPOSURE if exposure is None else exposure
    wd = bpy.data.worlds.new("sky")
    wd.use_nodes = True
    nt = wd.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.radians(sun_elev)
    sky.sun_rotation = sun_rot
    sky.altitude = 1800.0
    sky.sun_disc = True
    sky.sun_size = math.radians(1.2)
    sky.aerosol_density = 2.5          # 太陽のまわりのぼんやりした光
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[1].default_value = sky_strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    if flat_bg is None:
        nt.links.new(sky.outputs[0], bg.inputs[0])
        nt.links.new(bg.outputs[0], out.inputs[0])
    else:
        # 確かめの絵：照明は空、カメラに見える背景は一色（葉や幹の色だけを見るため）
        lp = nt.nodes.new("ShaderNodeLightPath")
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.inputs[7].default_value = (*flat_bg, 1.0)
        nt.links.new(lp.outputs["Is Camera Ray"], mx.inputs[0])
        nt.links.new(sky.outputs[0], mx.inputs[6])
        nt.links.new(mx.outputs[2], bg.inputs[0])
        nt.links.new(bg.outputs[0], out.inputs[0])
    sc.world = wd
    return sc


def ground(sc, slope_deg=0.0, ascend=(0.0, 1.0), size=900.0, color=(0.055, 0.035, 0.022)):
    me = bpy.data.meshes.new("ground")
    s = size
    V = [(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)]
    t = math.tan(math.radians(slope_deg))
    V = [(x, y, (x * ascend[0] + y * ascend[1]) * t) for x, y, _ in V]
    me.from_pydata(V, [], [(0, 1, 2, 3)])
    m = bpy.data.materials.new("gr")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 0.35
    n.inputs["Detail"].default_value = 6
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (color[0] * 0.55, color[1] * 0.55, color[2] * 0.5, 1)
    mix.inputs[7].default_value = (color[0] * 1.5, color[1] * 1.4, color[2] * 1.2, 1)
    nt.links.new(n.outputs["Fac"], mix.inputs[0])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    me.materials.append(m)
    ob = bpy.data.objects.new("ground", me)
    sc.collection.objects.link(ob)
    return ob


def camera(sc, loc, target, lens, sensor=36.0):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cd.sensor_width = sensor
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    cam.location = loc
    d = np.array(target, float) - np.array(loc, float)
    yaw = math.atan2(d[0], d[1])
    pitch = math.atan2(d[2], math.hypot(d[0], d[1]))
    cam.rotation_euler = (math.pi / 2 + pitch, 0, -yaw)
    sc.camera = cam
    return cam


def marker(sc, loc):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=1.7, location=(loc[0], loc[1], loc[2] + 0.85))
    ob = bpy.context.active_object
    m = bpy.data.materials.new("mk")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8, 0.02, 0.02, 1)
    ob.data.materials.append(m)


def render_to(sc, name):
    p = os.path.join(TMP, name + ".png")
    sc.render.filepath = p
    t = time.time()
    bpy.ops.render.render(write_still=True)
    TIMES[name] = round(time.time() - t, 1)
    return p


def save_jpeg(im, name, maxw=1280, maxkb=350):
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    dest = os.path.join(OUT, name + ".jpg")
    for q in (90, 86, 82, 78, 74, 70, 64, 58):
        im.convert("RGB").save(dest, quality=q, optimize=True)
        if os.path.getsize(dest) <= maxkb * 1024:
            break
    return dest


def ensure_atlas():
    if not os.path.exists(materials.ATLAS):
        twigs.bake_atlas(materials.ATLAS)


def place(ob, sc, loc, yaw=0.0, scale=1.0, mirror=False):
    ob.location = loc
    ob.rotation_euler = (0, 0, yaw)
    ob.scale = (-scale if mirror else scale, scale, scale)
    sc.collection.objects.link(ob)


# ---------------------------------------------------------------- 場面の部品
def _mat(name, color, rough=0.9, extra=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def terrain_z(x, y, slope_deg=10.0):
    """斜面（のぼり +Y）＋ ±0.6m のうねり。"""
    t = math.tan(math.radians(slope_deg))
    und = 0.35 * np.sin(x * 0.071 + 1.0) * np.cos(y * 0.052) + 0.2 * np.sin(x * 0.19 + y * 0.13) + 0.15 * np.sin(y * 0.31 - x * 0.07)
    return y * t + und


def terrain(sc):
    """斜面の地面。落ち葉（橙褐色）・緑の苔・暗い土。反射率 0.10〜0.20。"""
    xs = np.arange(-600, 601, 4.0)
    ys = np.arange(-600, 401, 4.0)
    X, Y = np.meshgrid(xs, ys)
    Z = terrain_z(X, Y)
    V = np.stack([X, Y, Z], -1).reshape(-1, 3)
    nx = len(xs)
    i = np.arange(len(ys) - 1)[:, None]
    j = np.arange(nx - 1)[None, :]
    a = (i * nx + j).ravel()
    F = np.stack([a, a + 1, a + nx + 1, a + nx], 1)
    me = bpy.data.meshes.new("terrain")
    me.from_pydata(V.astype(np.float32), [], F.tolist())
    me.polygons.foreach_set("use_smooth", np.ones(len(F), bool))
    m = bpy.data.materials.new("ground")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    co = nt.nodes.new("ShaderNodeTexCoord")
    n1 = nt.nodes.new("ShaderNodeTexNoise")
    n1.inputs["Scale"].default_value = 0.6
    n1.inputs["Detail"].default_value = 8
    n2 = nt.nodes.new("ShaderNodeTexNoise")
    n2.inputs["Scale"].default_value = 0.07
    nt.links.new(co.outputs["Object"], n1.inputs["Vector"])
    nt.links.new(co.outputs["Object"], n2.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (0.045, 0.028, 0.016, 1)      # 暗い土・古い落ち葉
    mix.inputs[7].default_value = (0.140, 0.080, 0.035, 1)      # 新しい落ち葉（橙褐色）
    nt.links.new(n1.outputs["Fac"], mix.inputs[0])
    mix2 = nt.nodes.new("ShaderNodeMix")
    mix2.data_type = "RGBA"
    mix2.inputs[7].default_value = (0.045, 0.075, 0.020, 1)     # 苔・笹の下の緑
    nt.links.new(mix.outputs[2], mix2.inputs[6])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.47
    ramp.inputs["From Max"].default_value = 0.57
    nt.links.new(n2.outputs["Fac"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs[0], mix2.inputs[0])
    nt.links.new(mix2.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    bu = nt.nodes.new("ShaderNodeBump")
    bu.inputs["Strength"].default_value = 0.5
    bu.inputs["Distance"].default_value = 0.05
    n3 = nt.nodes.new("ShaderNodeTexNoise")
    n3.inputs["Scale"].default_value = 14.0
    n3.inputs["Detail"].default_value = 6
    nt.links.new(co.outputs["Object"], n3.inputs["Vector"])
    nt.links.new(n3.outputs["Fac"], bu.inputs["Height"])
    nt.links.new(bu.outputs["Normal"], b.inputs["Normal"])
    me.materials.append(m)
    ob = bpy.data.objects.new("terrain", me)
    sc.collection.objects.link(ob)
    return ob


def sasa(sc, rg, box, n=9000):
    """笹（高さ 0.5〜1.5m の葉の束）。緑と枯れ草色。1 つのメッシュにまとめる。box=(x0,x1,y0,y1)"""
    cx = rg.uniform(box[0], box[1], n)
    cy = rg.uniform(box[2], box[3], n)
    cz = terrain_z(cx, cy) - 0.03
    nb = 9
    H = rg.uniform(0.5, 1.5, n)
    az = rg.uniform(0, 6.28, (n, nb))
    lean = rg.uniform(0.12, 0.45, (n, nb)) * H[:, None]
    hh = H[:, None] * rg.uniform(0.6, 1.0, (n, nb))
    w = 0.018 * rg.uniform(0.8, 1.3, (n, nb))
    base = np.stack([cx, cy, cz], 1)[:, None, :] + np.stack([np.cos(az), np.sin(az), 0 * az], -1) * rg.uniform(0, 0.12, (n, nb, 1))
    dirh = np.stack([np.cos(az), np.sin(az), 0 * az], -1)
    perp = np.stack([-np.sin(az), np.cos(az), 0 * az], -1)
    up = np.array([0, 0, 1.0])
    mid = base + dirh * (lean[..., None] * 0.35) + up * (hh[..., None] * 0.5)
    tip = base + dirh * lean[..., None] + up * (hh[..., None] * 0.92) - up * (hh[..., None] * 0.1 * rg.random((n, nb, 1)))
    P = np.stack([base - perp * w[..., None], base + perp * w[..., None], mid + perp * w[..., None] * 0.9, mid - perp * w[..., None] * 0.9, tip], 2)
    V = P.reshape(-1, 3)
    b = (np.arange(n * nb) * 5)[:, None]
    F = np.concatenate([b + np.array([0, 1, 2]), b + np.array([0, 2, 3]), b + np.array([3, 2, 4])]).reshape(3, -1, 3).transpose(1, 0, 2).reshape(-1, 3)
    dry = (rg.random(n) < 0.3).astype(np.float32)
    tint = np.repeat(np.repeat(dry, nb), 5)
    me = bpy.data.meshes.new("sasa")
    me.from_pydata(V.astype(np.float32), [], F.tolist())
    at = me.attributes.new("dry", "FLOAT", "POINT")
    at.data.foreach_set("value", tint.astype(np.float32))
    m = bpy.data.materials.new("sasa")
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    bs.inputs["Roughness"].default_value = 0.6
    att = nt.nodes.new("ShaderNodeAttribute")
    att.attribute_type = "GEOMETRY"
    att.attribute_name = "dry"
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.inputs[6].default_value = (0.040, 0.085, 0.018, 1)
    mx.inputs[7].default_value = (0.22, 0.14, 0.04, 1)
    nt.links.new(att.outputs["Fac"], mx.inputs[0])
    nt.links.new(mx.outputs[2], bs.inputs["Base Color"])
    tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
    nt.links.new(mx.outputs[2], tr.inputs["Color"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.4
    nt.links.new(bs.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes["Material Output"].inputs[0])
    me.materials.append(m)
    ob = bpy.data.objects.new("sasa", me)
    sc.collection.objects.link(ob)
    return len(F)


def evergreen_mesh(rg, H):
    """濃い緑の針葉樹（モミ・トウヒ）。段になった円すい。"""
    nt_, seg = 34, 18
    V, F = [], []
    for k in range(nt_):
        t = k / nt_
        z = H * (0.1 + 0.88 * t)
        r = 0.15 * H * (1 - t) ** 0.8 * rg.uniform(0.75, 1.2) + 0.15
        a = np.linspace(0, 2 * np.pi, seg, endpoint=False) + rg.uniform(0, 1)
        rr = r * rg.uniform(0.45, 1.3, seg)
        o = len(V)
        V.append((0, 0, z + 0.05 * H))
        for i in range(seg):
            V.append((rr[i] * np.cos(a[i]), rr[i] * np.sin(a[i]), z - 0.05 * H * rg.uniform(0.3, 1.6)))
        for i in range(seg):
            F.append((o, o + 1 + i, o + 1 + (i + 1) % seg))
    me = bpy.data.meshes.new("evergreen")
    me.from_pydata(np.array(V, np.float32), [], F)
    me.polygons.foreach_set("use_smooth", np.zeros(len(F), bool))
    me.materials.append(_mat("evergreen", (0.008, 0.020, 0.013), 0.95))
    return me


def birch_object(rg, H, bark):
    """シラカバ：白い幹（黒い斑）＋黄緑のカードの丸い樹冠。"""
    from types import SimpleNamespace
    from trees.treegen import tube
    pts = np.stack([np.zeros(12) + 0.1 * np.sin(np.linspace(0, 3, 12)), np.zeros(12), np.linspace(0, H, 12)], 1)
    rad = 0.10 * (1 - np.linspace(0, 1, 12) ** 1.2) + 0.02
    v, f, uv, rr = tube(pts, rad, 8, 0.5, cap="apex")
    wood = dict(verts=v, faces=f, uv=uv, radius=rr, dead=np.zeros(len(v)))
    n = 500
    pos = np.stack([rg.normal(0, 1.5, n), rg.normal(0, 1.5, n), H * rg.uniform(0.5, 1.0, n)], 1)
    d = rg.normal(size=(n, 3))
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    A = dict(pos=pos, dir=d, up=np.tile([0, 0, 1.0], (n, 1)), scale=rg.uniform(0.8, 1.2, n), shell=rg.uniform(0.5, 1.0, n))
    sk = SimpleNamespace(anchors=A, info=dict(height=H), branches=[])
    P = dict(bare=0.2, tone=0.15)
    cards = library.foliage_cards(sk, P, library.LOD_FOLIAGE[1], np.zeros(n, bool), rg, 6000)
    return library.mesh_from_arrays("birch", wood, None, cards, [bark, materials.needle_material(), materials.card_material()], tone=0.15)


def birch_bark():
    m = _mat("birch", (0.30, 0.28, 0.25), 0.7)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    co = nt.nodes.new("ShaderNodeTexCoord")
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 18.0
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 0.15, 1.0)
    nt.links.new(co.outputs["UV"], mp.inputs[0])
    nt.links.new(mp.outputs[0], n.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.55
    mr.inputs["From Max"].default_value = 0.62
    mr.inputs["To Min"].default_value = 0.35
    mr.inputs["To Max"].default_value = 0.02
    nt.links.new(n.outputs["Fac"], mr.inputs["Value"])
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.inputs[6].default_value = (0.02, 0.02, 0.02, 1)
    mx.inputs[7].default_value = (0.30, 0.28, 0.25, 1)
    nt.links.new(mr.outputs[0], mx.inputs[0])
    nt.links.new(mx.outputs[2], b.inputs["Base Color"])
    return m


def rocks_and_logs(sc, rg, box, nr=30, nl=18):
    for i in range(nr):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0)
        ob = bpy.context.active_object
        me = ob.data
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        co *= (1 + rg.normal(0, 0.18, (len(co), 1)))
        me.vertices.foreach_set("co", co.ravel())
        x, y = rg.uniform(box[0], box[1]), rg.uniform(box[2], box[3])
        s = rg.uniform(0.3, 1.1)
        ob.location = (x, y, terrain_z(x, y) + s * 0.15)
        ob.scale = (s * rg.uniform(1, 1.6), s, s * rg.uniform(0.5, 0.8))
        ob.rotation_euler = (0, 0, rg.uniform(0, 6.28))
        me.materials.append(_mat("rock", (0.11, 0.10, 0.09), 0.85))
    for i in range(nl):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=rg.uniform(0.03, 0.12), depth=rg.uniform(1.5, 5.0))
        ob = bpy.context.active_object
        x, y = rg.uniform(box[0], box[1]), rg.uniform(box[2], box[3])
        ob.location = (x, y, terrain_z(x, y) + 0.08)
        ob.rotation_euler = (math.pi / 2 + rg.normal(0, 0.1), rg.normal(0, 0.1), rg.uniform(0, 6.28))
        ob.data.materials.append(_mat("log", (0.07, 0.05, 0.04), 0.95))


def haze(sc, y0, y1):
    """朝もや：奥の木ほど淡く（100m で約 30% のコントラスト低下）。"""
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    ob = bpy.context.active_object
    ob.location = (0, (y0 + y1) / 2, 40)
    ob.scale = (900, (y1 - y0), 220)
    m = bpy.data.materials.new("haze")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    sc_ = nt.nodes.new("ShaderNodeVolumeScatter")
    sc_.inputs["Density"].default_value = 0.0035
    sc_.inputs["Anisotropy"].default_value = 0.5
    sc_.inputs["Color"].default_value = (0.95, 0.93, 0.88, 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(sc_.outputs[0], out.inputs["Volume"])
    ob.data.materials.append(m)
    ob.visible_shadow = False


def camera(sc, loc, target, lens, sensor=36.0, ortho=None):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cd.sensor_width = sensor
    if ortho:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    cam.location = loc
    d = np.array(target, float) - np.array(loc, float)
    yaw = math.atan2(d[0], d[1])
    pitch = math.atan2(d[2], math.hypot(d[0], d[1]))
    cam.rotation_euler = (math.pi / 2 + pitch, 0, -yaw)
    sc.camera = cam
    return cam


def stats(path, sky_row=0.02):
    """葉の色の測定（JPEG/PNG）。葉＝色相 20〜70 度・彩度 0.3 以上。幹＝暗くて低彩度。"""
    im = Image.open(path).convert("RGB")
    a = np.asarray(im, np.float32) / 255
    hsv = np.asarray(im.convert("HSV"), np.float32) / 255
    h, s, v = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
    luma = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    fol = (h > 20) & (h < 70) & (s > 0.3) & (v > 0.12)
    out = dict(sky_luma=round(float(np.median(luma[: max(2, int(sky_row * a.shape[0]))])), 3))
    if fol.sum() > 100:
        out.update(fol_share=round(float(fol.mean()), 3), fol_hue=round(float(np.median(h[fol])), 1), fol_sat=round(float(np.median(s[fol])), 2),
                   fol_val=round(float(np.median(v[fol])), 2), fol_luma=round(float(np.median(luma[fol])), 3), fol_max_v=round(float(np.percentile(v[fol], 99.5)), 2))
    return out


# ---------------------------------------------------------------- 森の場面
def build_forest(back=False, nvar=40, n_lod0=8, seed=4242):
    """斜面（10 度）に奥行き 155m（逆光は 320m）の林。カラマツ（若木も）＋濃い緑の針葉樹＋シラカバ。下草・岩・倒木・朝もや。"""
    rg = np.random.default_rng((seed, 1 if back else 0))
    elev = 7 if back else 18
    sun_rot = math.pi if back else math.radians(150)
    sc = fresh(1280, 720, 48, elev, sun_rot, exposure=EXPOSURE_BACK if back else EXPOSURE)
    terrain(sc)
    y_lo, y_hi = (-120.0, 200.0) if back else (45.0, 200.0)
    if back:
        cam_loc = np.array([0.0, 250.0, 0.0])
    else:
        cam_loc = np.array([0.0, -30.0, 0.0])
    cam_loc[2] = terrain_z(cam_loc[0], cam_loc[1]) + 10.0
    # 木の位置：ゆらしたマス目＋塊とすき間（クランプ）。最小の間隔 2.8m
    gx, gy = np.meshgrid(np.arange(-70, 70.1, 4.0), np.arange(y_lo, y_hi + 0.1, 4.0))
    P = np.stack([gx.ravel(), gy.ravel()], 1) + rg.uniform(-1.7, 1.7, (gx.size, 2))
    dens = 0.62 + 0.3 * np.sin(P[:, 0] * 0.045 + 1) * np.cos(P[:, 1] * 0.035) + 0.2 * np.sin(P[:, 0] * 0.13 - P[:, 1] * 0.09)
    P = P[rg.random(len(P)) < dens]
    from scipy.spatial import cKDTree
    kt = cKDTree(P)
    drop = set()
    for i, j in sorted(kt.query_pairs(2.8)):
        if i not in drop and j not in drop:
            drop.add(j)
    P = P[[i for i in range(len(P)) if i not in drop]]
    n = len(P)
    kind = rg.choice(4, n, p=[0.74, 0.06, 0.06, 0.14])      # 0=カラマツ 1=針葉樹 2=シラカバ 3=若木のカラマツ
    dist = np.hypot(P[:, 0] - cam_loc[0], P[:, 1] - cam_loc[1])
    kind = np.where((kind == 1) & (dist < 120), 0, kind)      # 手前には濃い緑の木を置かない
    t = time.time()
    # カラマツの型：0〜2＝若木、3〜39＝壮年・老木（12 以上は別の木）。15m 以内に同じ型を置かない
    pool = list(range(nvar))
    lod1 = {v: library.build_tree("larch", v, 1, link=False) for v in pool}
    TIMES["forest-build-lod1-x%d" % nvar] = round(time.time() - t, 1)
    kt2 = cKDTree(P)
    var = np.full(n, -1)
    for i in np.argsort(dist):
        if kind[i] not in (0, 3):
            continue
        near = [var[j] for j in kt2.query_ball_point(P[i], 15.0) if var[j] >= 0]
        cand = [v for v in (range(0, 3) if kind[i] == 3 else range(3, nvar)) if v not in near]
        edge = [v for v in cand if v >= 12 and v % 7 == 0]
        if kind[i] == 0 and dist[i] < 120 and edge and rg.random() < 0.3:      # 手前のふち：樹冠の低い木
            cand = edge
        var[i] = int(rg.choice(cand if cand else list(range(nvar))))
    # 近い木は LOD0
    order = [i for i in np.argsort(dist) if var[i] >= 0 and dist[i] < 100][:n_lod0]
    t = time.time()
    lod0 = {}
    for i in order:
        if var[i] not in lod0:
            lod0[var[i]] = library.build_tree("larch", int(var[i]), 0, link=False)
    TIMES["forest-build-lod0-x%d" % len(lod0)] = round(time.time() - t, 1)
    lod0_set = set(order)
    eg = [bpy.data.objects.new(f"eg{k}", evergreen_mesh(np.random.default_rng((77, k)), 22 + 3 * k)) for k in range(4)]
    bark = birch_bark()
    bi = [birch_object(np.random.default_rng((88, k)), 11 + 2 * k, bark) for k in range(3)]
    info = []
    for i in range(n):
        x, y = P[i]
        z = terrain_z(x, y) - 0.1
        yaw = float(rg.uniform(0, 6.28))
        size = float(rg.uniform(0.92, 1.1))
        if kind[i] == 1:
            src, H = eg[int(rg.integers(0, 4))], 25.0
            ob = bpy.data.objects.new("e", src.data)
        elif kind[i] == 2:
            src = bi[int(rg.integers(0, 3))]
            ob = bpy.data.objects.new("b", src.data)
            H = 13.0
        else:
            v = int(var[i])
            src = lod0[v] if i in lod0_set else lod1[v]
            ob = bpy.data.objects.new(src.name + ".i", src.data)
            H = float(src["height"])
        place(ob, sc, (x, y, z), yaw=yaw, scale=size, mirror=bool(rg.random() < 0.5))
        info.append((ob, H * size, int(var[i]) if kind[i] in (0, 3) else -1, i in lod0_set, dist[i]))
    sasa_tris = sasa(sc, rg, (-45, 45, 30 if not back else 100, 130 if not back else 205), 26000)
    rocks_and_logs(sc, rg, (-50, 50, y_lo, y_hi), 30, 18)
    haze(sc, min(cam_loc[1], y_lo) - 30, max(cam_loc[1], y_hi) + 30)
    # カメラ：手前の木の梢の線（稜線）が画面の高さの 70〜90% に来るように上下の向きを決める（空を 10% 以上入れる）
    lens = 40.0
    vfov = 2 * math.atan(10.125 / lens)
    el = [math.atan2(q[0].location.z + q[1] - cam_loc[2], q[4]) for q in info if abs(q[0].location.x) < 35 and q[4] < 130]
    a_near = max(el)
    pitch = a_near - (0.2 if back else 0.4) * vfov
    d = np.array([0.0, -1.0 if back else 1.0, 0.0])
    tgt = cam_loc + np.array([0, d[1] * 100.0, math.tan(pitch) * 100.0])
    cam = camera(sc, cam_loc, tgt, lens)
    TIMES["forest-trees"] = n
    TIMES["forest-lod0"] = len(order)
    TIMES["sasa-tris"] = sasa_tris
    return sc, cam, info


def do_forest(back=False, crops=False):
    sc, cam, info = build_forest(back)
    name = "forest-larch-backlit" if back else "forest-larch"
    p = render_to(sc, name + "-raw")
    save_jpeg(Image.open(p), name, maxkb=500)
    TIMES[name + "-stats"] = stats(os.path.join(OUT, name + ".jpg"))
    if crops:
        from bpy_extras.object_utils import world_to_camera_view
        sc.render.resolution_x, sc.render.resolution_y = 3840, 2160
        sc.cycles.samples = 128
        sc.render.use_border = True
        sc.render.use_crop_to_border = True
        sc.render.image_settings.quality = 100
        tr_ = sorted([q for q in info if q[3]], key=lambda q: q[4])
        far_tree = sorted([q for q in info if not q[3] and q[2] >= 0 and 120 < q[4] < 160 and abs(q[0].location.x) < 40], key=lambda q: q[4])[0]
        targets = [("edge", None, far_tree),
                   ("interior", None, tr_[0]), ("trunk", None, tr_[min(2, len(tr_) - 1)])]
        ims = []
        for nm, _, q in targets:
            ob, H = q[0], q[1]
            loc = np.array(ob.location)
            pt = {"edge": loc + np.array([0, 0, H * 0.88]), "interior": loc + np.array([0, 0, H * 0.62]), "trunk": loc + np.array([0, 0, 1.6])}[nm]
            c = world_to_camera_view(sc, cam, Vector(pt))
            w, h = 640 / 3840, 400 / 2160
            x0 = float(np.clip(c.x - w / 2, 0, 1 - w))
            y0 = float(np.clip(c.y - h / 2, 0, 1 - h))
            sc.render.border_min_x, sc.render.border_max_x = x0, x0 + w
            sc.render.border_min_y, sc.render.border_max_y = y0, y0 + h
            pp = render_to(sc, f"crop-{nm}")
            im = Image.open(pp).convert("RGB")
            im.save(os.path.join(OUT, f"crop-larch-{nm}.jpg"), quality=95)
            ims.append(im)
        sheet = Image.new("RGB", (640 * 3, 400))
        for k, im in enumerate(ims):
            sheet.paste(im.crop((0, 0, 640, 400)), (640 * k, 0))
        sheet.save(os.path.join(OUT, "crops-larch.jpg"), quality=92)


# ---------------------------------------------------------------- 一覧（正射影・6 × 2）
def do_sheet():
    from PIL import ImageDraw
    panels = []
    labels = []
    TIMES["sheet-tris"] = {}
    t = time.time()
    for row in range(2):
        sc = fresh(1280, 640, 48, 15, math.radians(150), flat_bg=FLAT_BG)
        terrain_flat = _mat("fl", (0.12, 0.07, 0.035), 0.95)
        bpy.ops.mesh.primitive_plane_add(size=400)
        pl = bpy.context.active_object
        pl.data.materials.append(terrain_flat)
        span = 13.0
        for c in range(6):
            i = row * 6 + c
            ob = library.build_tree("larch", i, 0, link=False)
            sc.collection.objects.link(ob)
            ob.location = ((c - 2.5) * span, 0, 0)
            TIMES["sheet-tris"][ob.name] = ob["tris"]
        # 1.7m の人形と 10m の目盛り
        bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=1.7, location=(-3.0 * span + 1.0, -2, 0.85))
        bpy.context.active_object.data.materials.append(_mat("mk", (0.8, 0.03, 0.03), 0.6))
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-3.0 * span + 6.0 + 5.0, -2, 0.1))
        sb = bpy.context.active_object
        sb.scale = (10.0, 0.1, 0.2)
        sb.data.materials.append(_mat("sb", (0.9, 0.9, 0.9), 0.6))
        ortho = 80.0
        camera(sc, (0, -100, 17.0), (0, 0, 17.0), 50, ortho=ortho)
        im = Image.open(render_to(sc, f"sheet{row}")).convert("RGB")
        d = ImageDraw.Draw(im)
        for c in range(6):
            px = 640 + (c - 2.5) * span / ortho * 1280
            d.text((px - 6, 618), f"{row * 6 + c}", fill=(255, 255, 255))
        d.text((6, 618), "scale bar 10 m / figure 1.7 m", fill=(255, 255, 255))
        panels.append(im)
    TIMES["sheet-build"] = round(time.time() - t, 1)
    sheet = Image.new("RGB", (1280, 1280))
    sheet.paste(panels[0], (0, 0))
    sheet.paste(panels[1], (0, 640))
    save_jpeg(sheet, "sheet-larch", maxkb=450)


# ---------------------------------------------------------------- 近づいた絵
def _needle_target(ob, H, zfrac=(0.45, 0.6)):
    me = ob.data
    nv = len(me.vertices)
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    npoly = len(me.polygons)
    mi = np.empty(npoly, np.int32)
    me.polygons.foreach_get("material_index", mi)
    lo = np.empty(npoly * 3, np.int32)
    me.loops.foreach_get("vertex_index", lo)
    f = lo.reshape(-1, 3)[mi == 1]
    cen = co[f].mean(1)
    rho = np.hypot(cen[:, 0], cen[:, 1])
    ok = (cen[:, 2] > H * zfrac[0]) & (cen[:, 2] < H * zfrac[1])
    cand = np.where(ok)[0]
    best = cand[np.argsort(-rho[cand])[40]]
    near = cen[np.linalg.norm(cen - cen[best], axis=1) < 0.12]
    return near.mean(0), cen[best]


def do_close():
    sc = fresh(640, 720, 128, 15, math.radians(150), flat_bg=FLAT_BG)
    terrain_flat = _mat("fl", (0.12, 0.07, 0.035), 0.95)
    bpy.ops.mesh.primitive_plane_add(size=400)
    bpy.context.active_object.data.materials.append(terrain_flat)
    ob = library.build_tree("larch", 8, 0, link=False)
    sc.collection.objects.link(ob)
    camera(sc, (-1.2, -1.6, 1.7), np.array([0, 0, 1.6]), 40)
    a = render_to(sc, "close-a")
    H = ob["height"]
    tgt, p = _needle_target(ob, H)
    out = np.array([tgt[0], tgt[1], 0.0])
    out = out / (np.linalg.norm(out) + 1e-9)
    sc.camera.location = (tgt[0] + out[0] * 0.9 + 0.3, tgt[1] + out[1] * 0.9 - 0.3, tgt[2] + 0.35)
    d = np.array(tgt) - np.array(sc.camera.location)
    yaw = math.atan2(d[0], d[1])
    pitch = math.atan2(d[2], math.hypot(d[0], d[1]))
    sc.camera.rotation_euler = (math.pi / 2 + pitch, 0, -yaw)
    sc.camera.data.lens = 50
    pb = render_to(sc, "close-b")
    im = Image.new("RGB", (1280, 720))
    im.paste(Image.open(a).convert("RGB"), (0, 0))
    im.paste(Image.open(pb).convert("RGB"), (640, 0))
    save_jpeg(im, "close-larch", maxkb=450)
    TIMES["close-tris"] = ob["tris"]


# ---------------------------------------------------------------- 段の見た目合わせ
def do_lod(variant=4):
    """同じ木・同じカメラ（正射影）・同じ光で、3 つの大きさ（4K で 1200・500・150px の高さ＝ここでは 1/3 の 400・167・50px）×
    LOD0・1・2 を並べ、差の絵と数字（輪郭の重なり・α の面積・樹冠の明るさと色相の差）を出す。"""
    from PIL import ImageDraw
    sc = fresh(400, 500, 64, 15, math.radians(150), transparent=True)
    objs = []
    for lod in (0, 1, 2):
        ob = library.build_tree("larch", variant, lod, link=True)
        objs.append(ob)
        TIMES[f"lod{lod}-tris"] = ob["tris"]
    H = objs[0]["height"]
    cam = camera(sc, (0, -100, 0), (0, 0, 0), 50, ortho=1.0)
    rows = []
    metrics = {}
    for size in (400, 167, 50):
        ortho = H * 500 / size
        cam.data.ortho_scale = ortho
        cam.data.sensor_fit = "VERTICAL"
        cam.location.y = -100.0
        # 木の下端が画面下から 20px に来るように
        cam.location.z = ortho * 0.5 - ortho * 20 / 500
        ims = []
        for lod, ob in enumerate(objs):
            for o in objs:
                o.hide_render = o is not ob
            ims.append(np.asarray(Image.open(render_to(sc, f"lod{lod}-{size}")).convert("RGBA"), np.float32) / 255)
        rows.append(ims)
        a0, a1, a2 = [i[..., 3] for i in ims]
        m = {}
        for nm, a in (("lod1", a1), ("lod2", a2)):
            s0, s1 = a0 > 0.5, a > 0.5
            m[nm + "_iou"] = round(float((s0 & s1).sum() / max(1, (s0 | s1).sum())), 3)
            m[nm + "_alpha_ratio"] = round(float(a.sum() / max(1.0, a0.sum())), 3)
        luma = lambda im_: (im_[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32))
        def crown(im_):
            s_ = im_[..., 3] > 0.5
            hsv = np.asarray(Image.fromarray((im_[..., :3] * 255).astype(np.uint8)).convert("HSV"), np.float32)
            fol = s_ & (hsv[..., 1] > 80)
            return float(luma(im_)[s_].mean()) if s_.any() else 0.0, float(np.median(hsv[..., 0][fol]) * 360 / 255) if fol.any() else 0.0
        c0 = crown(ims[0])
        for lod in (1, 2):
            c = crown(ims[lod])
            m[f"lod{lod}_luma_diff_pct"] = round(100 * (c[0] - c0[0]) / max(c0[0], 1e-6), 1)
            m[f"lod{lod}_hue_diff_deg"] = round(c[1] - c0[1], 1)
        metrics[f"{size}px"] = m
    TIMES["lod-metrics"] = metrics
    sheet = Image.new("RGB", (400 * 4, 500 * 3), (120, 150, 190))
    for r, ims in enumerate(rows):
        for k, im in enumerate(ims):
            bg = Image.new("RGB", (400, 500), (150, 175, 205))
            bg.paste(Image.fromarray((im * 255).astype(np.uint8), "RGBA"), mask=Image.fromarray((im[..., 3] * 255).astype(np.uint8)))
            sheet.paste(bg, (400 * k, 500 * r))
        d = np.abs(ims[0][..., :4] - ims[1][..., :4]).max(-1)
        dd = Image.fromarray((np.clip(d * 2, 0, 1) * 255).astype(np.uint8)).convert("RGB")
        sheet.paste(dd, (1200, 500 * r))
    dr = ImageDraw.Draw(sheet)
    for k, t_ in enumerate(("LOD0", "LOD1", "LOD2", "|LOD0 - LOD1| x2")):
        dr.text((400 * k + 6, 6), t_, fill=(255, 255, 255))
    save_jpeg(sheet, "lod-larch", maxkb=450)
    TIMES["lod-fol-stats-400px"] = stats(os.path.join(OUT, "lod-larch.jpg"))


if __name__ == "__main__":
    ensure_atlas()
    which = sys.argv[1:] or ["sheet", "close", "forest", "backlit", "lod"]
    for w in which:
        t = time.time()
        {"sheet": do_sheet, "close": do_close, "forest": lambda: do_forest(False), "forestcrops": lambda: do_forest(False, True),
         "backlit": lambda: do_forest(True), "lod": do_lod}[w]()
        TIMES["total-" + w] = round(time.time() - t, 1)
        print(w, TIMES, flush=True)
        json.dump(TIMES, open(os.path.join(TMP, "times.json"), "w"), default=str)
