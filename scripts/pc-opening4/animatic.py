"""山の場面（コマ 131〜719。30.0 秒版）の速い下書き。飛び方を見るためのもので、見た目の仕上げではない。

使い方（Blender の Python と、ふつうの python3 で分ける）
    PY=<scratchpad>/bl/bin/python
    $PY animatic.py render      # 640x360・8 回・ノイズ取り・2 スレッド。4 コマごと（131〜719 の 148 コマ）。続きから再開できる
    python3 animatic.py assemble  # review/route/animatic.mp4（6 コマ/秒・H.264）と review/route/sheet.jpg（36 コマ・6x6）
    $PY animatic.py render 131 247   # コマを指定して描く（確かめ用）

絵は WORK/animatic/ に置く。つなぎ目（もやの 8 コマ）は白い絵にする（描かない）。
地形は 10m 標高を約 30m に間引いたもの（谷の全域）＋ far（約 185m 間隔）＋ mid（国土地理院 z11 を約 370m 間隔。東経 136.9〜139.1・北緯 35.25〜37.0。
八ヶ岳・富士山まで届く）。地球の丸みを引く。遠いほど青白く霞ませる（色に焼きこみ）。
色は標高と傾きだけの簡単な分け方（雪・岩・森・金色のカラマツ・谷底）。雲海は標高 1,700m の平らな面（東経 137.695 より東。富士山の方まで広げた）。
太陽の円盤（方位 115°・高さ 5°。見た目は実物の約 4 倍）は、カメラにだけ見える発光の球を、コマごとにカメラから 250km の先に置いて描く。
"""
from __future__ import annotations

import math
import subprocess
import sys

import numpy as np

import config
import geo4
import route

OUT = config.WORK / "animatic"
REVIEW = config.HERE / "review" / "route"
FRAMES = list(range(config.FIRST_MOUNTAIN_FRAME, config.FRAMES, 4))
RES = (640, 360)
SUN_DIR = np.array([math.sin(math.radians(config.SUN_AZ)) * math.cos(math.radians(config.SUN_EL)),
                    math.cos(math.radians(config.SUN_AZ)) * math.cos(math.radians(config.SUN_EL)),
                    math.sin(math.radians(config.SUN_EL))])  # 太陽のある向き
CLOUD_Z = 1700.0
CLOUD_LON = 137.695
SUN_DIST = 250000.0
SUN_RADIUS_DEG = 1.0     # 見やすいように実物（0.27°）の約 4 倍
HAZE_RGB = np.array([0.58, 0.64, 0.78], np.float32)


def haze(col, E, N, scale=45000.0):
    """遠いほど青白く（距離は原点から）"""
    f = (1.0 - np.exp(-np.hypot(E, N) / scale)).astype(np.float32)[..., None]
    return col * (1 - 0.85 * f) + HAZE_RGB * 0.85 * f


# ---------------------------------------------------------------------------
# 地形の色（標高と傾きだけ）
# ---------------------------------------------------------------------------
def colors(h, slope, rng_seed):
    rng = np.random.default_rng((config.SEED, rng_seed))
    low = rng.random((48, 48))
    # 金色のカラマツのまだら（粗い乱数を引き伸ばしてなめらかに）
    iy = np.linspace(0, 47, h.shape[0])
    ix = np.linspace(0, 47, h.shape[1])
    y0, x0 = np.floor(iy).astype(int).clip(0, 46), np.floor(ix).astype(int).clip(0, 46)
    fy, fx = (iy - y0)[:, None], (ix - x0)[None, :]
    nz = (low[y0][:, x0] * (1 - fy) * (1 - fx) + low[y0 + 1][:, x0] * fy * (1 - fx)
          + low[y0][:, x0 + 1] * (1 - fy) * fx + low[y0 + 1][:, x0 + 1] * fy * fx)
    col = np.empty(h.shape + (3,), np.float32)
    col[:] = (0.05, 0.10, 0.04)                                         # 森
    gold = (nz > 0.55) & (h > 1500) & (h < 2350)
    col[gold] = (0.42, 0.30, 0.07)                                      # 金色のカラマツ
    rock = ((h > 2400) | (slope > 45)) & ~(slope < 0)
    col[rock] = (0.30, 0.28, 0.26)                                      # 岩
    snow = (h > 2600) & (slope < 40)
    col[snow] = (0.92, 0.93, 0.95)                                      # 新雪
    floor = (h < 1560) & (slope < 10)
    col[floor] = (0.55, 0.47, 0.27)                                     # 谷底
    col[h < 5.0] = (0.10, 0.18, 0.28)                                   # 海
    return col


def slope_of(arr, dx):
    gy, gx = np.gradient(arr.astype(np.float64), dx)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def make_object(bpy, name, E, N, Z, col, mask=None):
    """格子（行ごとの N、列ごとの E）から面をつくる。mask は面ごとに作るか（None なら全部）"""
    ny, nx = Z.shape
    EE, NN = np.meshgrid(E, N)
    zz = Z - geo4.curvature_drop(EE, NN)
    verts = np.stack([EE, NN, zz], -1).reshape(-1, 3).astype(np.float32)
    idx = np.arange(ny * nx).reshape(ny, nx)
    quads = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], -1).reshape(-1, 4)
    if mask is not None:
        quads = quads[mask.reshape(-1)]
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(len(verts))
    mesh.vertices.foreach_set("co", verts.reshape(-1))
    mesh.loops.add(len(quads) * 4)
    mesh.loops.foreach_set("vertex_index", quads.reshape(-1).astype(np.int32))
    mesh.polygons.add(len(quads))
    mesh.polygons.foreach_set("loop_start", (np.arange(len(quads)) * 4).astype(np.int32))
    mesh.update()
    mesh.validate()
    if col is not None:
        att = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        rgba = np.concatenate([col.reshape(-1, 3), np.ones((ny * nx, 1), np.float32)], 1)
        att.data.foreach_set("color", rgba.reshape(-1))
    for p in mesh.polygons:
        break
    mesh.polygons.foreach_set("use_smooth", np.ones(len(quads), dtype=bool))
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_scene(bpy):
    from mathutils import Vector

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    d = route.dem()
    # ---- 近い地形（谷の格子を 4 画素おき ≒ 31m）
    v = d.valley
    st = 4
    Zn = v.arr[::st, ::st]
    sl = slope_of(v.arr, 7.7)[::st, ::st]
    En, Nn = v.xs[::st], v.ys[::st]
    near = make_object(bpy, "near", En, Nn, Zn, colors(Zn, sl, 1))
    # ---- 遠い地形（広い格子を 3 画素おき ≒ 185m）。近い地形の範囲は空ける
    f = d.far
    st2 = 3
    Zf = f.arr[::st2, ::st2]
    slf = slope_of(f.arr, 61.7)[::st2, ::st2]
    Ef, Nf = f.xs[::st2], f.ys[::st2]
    ce = 0.5 * (Ef[:-1] + Ef[1:])[None, :]
    cn = 0.5 * (Nf[:-1] + Nf[1:])[:, None]
    inside = (ce > En.min() + 60) & (ce < En.max() - 60) & (cn > Nn.min() + 60) & (cn < Nn.max() - 60)
    EEf, NNf = np.meshgrid(Ef, Nf)
    far = make_object(bpy, "far", Ef, Nf, Zf - 6.0, haze(colors(Zf, slf, 2), EEf, NNf), mask=~inside)
    # ---- もっと遠い地形（mid。far の外。約 370m 間隔）。八ヶ岳・富士山
    m = d.mid
    st3 = 6
    Zm = m.arr[::st3, ::st3]
    slm = slope_of(m.arr, 61.7)[::st3, ::st3]
    Em, Nm = m.xs[::st3], m.ys[::st3]
    cem = 0.5 * (Em[:-1] + Em[1:])[None, :]
    cnm = 0.5 * (Nm[:-1] + Nm[1:])[:, None]
    fe0, fe1, fn0, fn1 = f.xs.min() + 400, f.xs.max() - 400, f.ys.min() + 400, f.ys.max() - 400
    inside_m = (cem > fe0) & (cem < fe1) & (cnm > fn0) & (cnm < fn1)
    EEm, NNm = np.meshgrid(Em, Nm)
    midm = make_object(bpy, "mid", Em, Nm, Zm - 25.0, haze(colors(Zm, slm, 3), EEm, NNm), mask=~inside_m)
    # ---- 雲海（標高 1,700m の平らな面。東経 137.695 より東）
    e0 = float(geo4.to_local(CLOUD_LON, config.ORIGIN_LAT)[0])
    ee = e0 + 120.0 * np.expm1(np.linspace(0, math.log1p((260000.0 - e0) / 120.0), 150))
    nn = -700.0 + 300.0 * np.sinh(np.linspace(-math.asinh(260000 / 300.0), math.asinh(150000 / 300.0), 180))
    cloud = make_object(bpy, "cloud", ee, nn[::-1], np.full((len(nn), len(ee)), CLOUD_Z, np.float32), None)
    # ---- 材質
    def mat_vertex():
        m = bpy.data.materials.new("terrain")
        m.use_nodes = True
        nt = m.node_tree
        a = nt.nodes.new("ShaderNodeAttribute")
        a.attribute_name = "Col"
        b = nt.nodes["Principled BSDF"]
        b.inputs["Roughness"].default_value = 0.95
        nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
        return m

    mt = mat_vertex()
    near.data.materials.append(mt)
    far.data.materials.append(mt)
    midm.data.materials.append(mt)
    mc = bpy.data.materials.new("cloud")
    mc.use_nodes = True
    mc.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.93, 0.94, 0.96, 1)
    mc.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    cloud.data.materials.append(mc)
    # ---- 空と太陽
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = False
    sky.sun_elevation = math.radians(config.SUN_EL)
    sky.altitude = 1700.0
    sky.sun_rotation = math.radians(config.SUN_AZ)      # 試して確かめた: 回転＝太陽の方位（北から時計回り）
    bg = nt.nodes["Background"]
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.55
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 9.0
    sun.color = (1.0, 0.78, 0.55)
    sun.angle = math.radians(0.53)
    so = bpy.data.objects.new("sun", sun)
    sc.collection.objects.link(so)
    q = Vector((-SUN_DIR[0], -SUN_DIR[1], -SUN_DIR[2])).to_track_quat("-Z", "Y")
    so.rotation_euler = q.to_euler()
    # ---- 太陽の円盤（カメラにだけ見える発光の球。照らす光は上の SUN ライト）
    R = SUN_DIST * math.tan(math.radians(SUN_RADIUS_DEG))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=R, segments=24, ring_count=12, location=(0, 0, 0))
    disc = bpy.context.active_object
    disc.name = "sun_disc"
    for k in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(disc, k, False)
    md = bpy.data.materials.new("sun_disc")
    md.use_nodes = True
    nd = md.node_tree
    for n_ in list(nd.nodes):
        nd.nodes.remove(n_)
    em = nd.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 0.86, 0.62, 1)
    em.inputs["Strength"].default_value = 60.0
    outn = nd.nodes.new("ShaderNodeOutputMaterial")
    nd.links.new(em.outputs["Emission"], outn.inputs["Surface"])
    disc.data.materials.append(md)
    # ---- カメラ・描画
    cam = bpy.data.cameras.new("cam")
    cam.sensor_width = 36.0
    cam.sensor_fit = "HORIZONTAL"
    cam.clip_start = 0.5
    cam.clip_end = 300000.0
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 8
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.max_bounces = 3
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.threads_mode = "FIXED"
    sc.render.threads = 2
    sc.render.use_persistent_data = True
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "None"
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH" and o.name != "sun_disc") * 2
    print(f"三角形 {tris}", flush=True)
    return co


def place(co, r):
    """コマの記録からカメラを置く（Blender は Z が上・東が X・北が Y）"""
    import bpy
    from mathutils import Matrix, Vector

    h, p, ro = (math.radians(r[k]) for k in ("heading_deg", "pitch_deg", "roll_deg"))
    f = np.array([math.sin(h) * math.cos(p), math.cos(h) * math.cos(p), math.sin(p)])
    right = np.array([math.cos(h), -math.sin(h), 0.0])
    up = np.cross(right, f)
    c, s = math.cos(ro), math.sin(ro)         # 前の向きの軸まわりに、右が正（右が下がる）で回す
    right, up = right * c - up * s, up * c + right * s
    m = Matrix([[right[0], up[0], -f[0], 0], [right[1], up[1], -f[1], 0], [right[2], up[2], -f[2], 0], [0, 0, 0, 1]])
    z = r["z"] - float(geo4.curvature_drop(r["e"], r["n"]))
    m.translation = Vector((r["e"], r["n"], z))
    co.matrix_world = m
    co.data.lens = r["lens_mm"]
    d_ = bpy.data.objects.get("sun_disc")
    if d_ is not None:
        d_.location = m.translation + Vector(tuple(SUN_DIR * SUN_DIST))


def render(frames):
    import bpy

    OUT.mkdir(parents=True, exist_ok=True)
    todo = [f for f in frames if not (OUT / f"f{f:04d}.png").exists()]
    print(f"描く {len(todo)} コマ")
    if not todo:
        return
    co = build_scene(bpy)
    import time

    for f in todo:
        r = route.camera_at(f)
        if r["seam"]:
            continue
        t0 = time.time()
        place(co, r)
        bpy.context.scene.render.filepath = str(OUT / f"f{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"コマ {f} {time.time() - t0:.1f} 秒", flush=True)


# ---------------------------------------------------------------------------
# 動画と一覧（Pillow・ffmpeg）
# ---------------------------------------------------------------------------
def _font(size):
    from PIL import ImageFont

    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def frame_image(f):
    from PIL import Image

    p = OUT / f"f{f:04d}.png"
    if p.exists():
        return Image.open(p).convert("RGB")
    return Image.new("RGB", RES, (236, 234, 228))     # つなぎ目のもや（描かない）


def assemble():
    from PIL import Image, ImageDraw

    REVIEW.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "video"
    tmp.mkdir(parents=True, exist_ok=True)
    fnt = _font(18)
    for i, f in enumerate(FRAMES):
        im = frame_image(f)
        dr = ImageDraw.Draw(im)
        dr.text((8, 6), f"{f / 24:.1f}s", fill=(255, 255, 255), font=fnt, stroke_width=2, stroke_fill=(0, 0, 0))
        im.save(tmp / f"v{i:04d}.png")
    mp4 = REVIEW / "animatic.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "6", "-i", str(tmp / "v%04d.png"), "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", "-crf", "30", "-preset", "slow", "-movflags", "+faststart", str(mp4)], check=True)
    print("動画", mp4, mp4.stat().st_size // 1024, "KB")
    # 一覧: 36 コマを 6x6
    pick = [FRAMES[int(round(k * (len(FRAMES) - 1) / 35))] for k in range(36)]
    tw, th = 266, 150
    sheet = Image.new("RGB", (tw * 6, th * 6), (0, 0, 0))
    fnt2 = _font(16)
    for k, f in enumerate(pick):
        im = frame_image(f).resize((tw, th), Image.LANCZOS)
        dr = ImageDraw.Draw(im)
        dr.text((5, 3), f"{f / 24:.2f}s", fill=(255, 255, 255), font=fnt2, stroke_width=2, stroke_fill=(0, 0, 0))
        sheet.paste(im, ((k % 6) * tw, (k // 6) * th))
    for q in (80, 70, 60, 50):
        sheet.save(REVIEW / "sheet.jpg", quality=q)
        if (REVIEW / "sheet.jpg").stat().st_size < 400 * 1024:
            break
    print("一覧", REVIEW / "sheet.jpg", (REVIEW / "sheet.jpg").stat().st_size // 1024, "KB", pick)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "render"
    if cmd == "render":
        fr = [int(a) for a in sys.argv[2:]] or FRAMES
        render(fr)
    elif cmd == "assemble":
        assemble()
