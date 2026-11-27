"""第4版オープニング：実写の世界（山の場面の遠景〜中景）。計画は PLAN.md。notes/world.md に作り方と進み具合。

  blender -b --factory-startup --python world.py -- data=<材料のフォルダ> out=<出力のフォルダ> frame=600 res=1280x720 samples=64 ...
  （この機械の bpy の python でも同じ引数： python world.py -- key=value ...）

材料は world_fetch.py が作る（標高 .npy・写真 .jpg と .json）。カメラは cameras.json（route.py は読まない）。
使うのは bpy・mathutils・numpy と標準ライブラリだけ（config.py・geo4.py は読む）。

引数（key=value）：
  data= out= frame=600 res=1280x720 samples=64 device=cpu|gpu threads=2
  clouds=none|surface|volume   surface は雲の上面を白い面にしたもの（CPU の下書き・遠くの雲・奥行きの代わり）。
                               volume は近くを立体の雲、遠くを surface の面にする（vol_range= 立体にする距離 m）
  haze=0|1（空気のかすみ。有限の箱の体積。世界の体積は使わない）  glare=0|1（太陽と雲の縁のやわらかい光）  exr=0|1
  border=x0,y0,x1,y1（画面の一部だけ描く。0〜1・y は下から。画面の大きさは変えない）  marks=1（山の位置を計算して marks.json と _geo.png）
  exposure=-1.4  sky=0.5  emit=1（照明なしで色だけ。確かめ用）  veg_dark=0.55  snow=1.0  far=150000  tex=1（0 で写真を使わず灰色。確かめ用）
  cloud_top=1650  cloud_density=0.12  seed=1
  extras=world_trees+swans4（追加の部品。そのファイルの add(world) を、描く直前に順に呼ぶ）
実行の最後に <out>/<コマ>_stats.json（頂点数・作る秒数・描く秒数・最大メモリ）を書く。
"""
from __future__ import annotations

import importlib
import json
import math
import os
import resource
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import config  # noqa: E402
import geo4  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
opt = dict(a.split("=", 1) for a in argv if "=" in a)
DATA = opt.get("data", os.path.join(str(config.WORK), "world", "reveal"))
OUT = opt.get("out", "out")
FRAME = int(opt.get("frame", "600"))
W, H = (int(v) for v in opt.get("res", "1280x720").split("x"))
SAMPLES = int(opt.get("samples", "64"))
THREADS = int(opt.get("threads", "2"))
CLOUDS = opt.get("clouds", "surface")
HAZE = opt.get("haze", "0") == "1"
EXR = opt.get("exr", "0") == "1"
GLARE = opt.get("glare", "0") == "1" and not EXR      # exr=1 は太陽をそのまま（グレアは後の合成で）
FAR = float(opt.get("far", "150000"))
CLOUD_TOP = float(opt.get("cloud_top", "1650"))
CLOUD_DENSITY = float(opt.get("cloud_density", "0.12"))
VOL_RANGE = float(opt.get("vol_range", "30000"))
SEED = int(opt.get("seed", "1"))
EARTH, K0 = geo4.EARTH, geo4.K0
os.makedirs(OUT, exist_ok=True)
T_START = time.time()
STATS = {"frame": FRAME, "res": f"{W}x{H}", "samples": SAMPLES, "clouds": CLOUDS}


def log(*a):
    print(*a, flush=True)


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------- カメラ・太陽
CAM = json.load(open(os.path.join(HERE, "cameras.json")))["frames"][str(FRAME)]
CE, CN = CAM["pos"][0], CAM["pos"][1]
CAM_Z_TRUE = CAM["pos"][2]
HEADING = CAM["heading_deg"]
LENS = float(opt.get("lens", CAM["lens_mm"]))   # lens= で焦点距離を変えられる（比べる用）
HFOV = 2 * math.degrees(math.atan(18.0 / LENS))
HALF_ANG = HFOV / 2 + 20.0                      # 地形・雲を置く向きの範囲（視野の半分＋余白。上下に振れる分も含む）
FAR_ANG = HFOV / 2 + float(opt.get("cone_margin", "8"))   # 遠い輪（16km より外）の範囲。細かい輪のぶん余白を小さく
SUN_AZ, SUN_EL = math.radians(config.SUN_AZ), math.radians(float(opt.get("sun_el", config.SUN_EL)))
SUN_DIR = np.array([math.sin(SUN_AZ) * math.cos(SUN_EL), math.cos(SUN_AZ) * math.cos(SUN_EL), math.sin(SUN_EL)])


# ---------------------------------------------------------------- 標高（距離で重ねる）
class DemLayer:
    def __init__(self, name):
        self.name = name
        self.meta = json.load(open(os.path.join(DATA, f"{name}.json")))
        self.arr = np.load(os.path.join(DATA, f"{name}.npy"))
        self.rmax = float(self.meta["rmax"])
        self.z = self.meta["z"]
        self.kx = 2.0 ** self.z * 256.0 / (EARTH * K0)

    def sample(self, e, n):
        """(値, 使える重み 0〜1)。外・無い画素は重み 0"""
        px = (geo4.MX0 + e / (EARTH * K0)) * 2.0 ** self.z * 256.0 - self.meta["x0"] * 256.0 - 0.5
        py = (geo4.MY0 - n / (EARTH * K0)) * 2.0 ** self.z * 256.0 - self.meta["y0"] * 256.0 - 0.5
        a = self.arr
        hh, ww = a.shape
        edge = np.minimum(np.minimum(px, ww - 1 - px), np.minimum(py, hh - 1 - py))
        ok = np.clip(edge / 6.0, 0.0, 1.0)
        fx = np.clip(px, 0, ww - 1.001)
        fy = np.clip(py, 0, hh - 1.001)
        x0 = fx.astype(np.int64)
        y0 = fy.astype(np.int64)
        tx = (fx - x0).astype(np.float32)
        ty = (fy - y0).astype(np.float32)
        v = (a[y0, x0] * (1 - tx) * (1 - ty) + a[y0, x0 + 1] * tx * (1 - ty) + a[y0 + 1, x0] * (1 - tx) * ty + a[y0 + 1, x0 + 1] * tx * ty)
        bad = np.isnan(v)
        return np.where(bad, 0.0, v), np.where(bad, 0.0, ok)


DEM_ORDER = ["dem12", "dem13", "dem14", "dem5a", "dem1a"]       # 粗い → 細かい
DEMS = [DemLayer(n) for n in DEM_ORDER if os.path.exists(os.path.join(DATA, f"{n}.npy"))]


def ground(e, n):
    """本当の標高（m）。カメラからの距離で、細かい段ほど近くだけに使う"""
    e = np.asarray(e, dtype=np.float64)
    n = np.asarray(n, dtype=np.float64)
    r = np.hypot(e - CE, n - CN)
    h = None
    for i, L in enumerate(DEMS):
        v, ok = L.sample(e, n)
        if i == 0:
            h = v.astype(np.float64)
            continue
        w = ok * (1.0 - smooth(r, 0.75 * L.rmax, L.rmax))
        h = h + (v - h) * w
    return h


# ---------------------------------------------------------------- 入れ子の格子（カメラ中心。細かい → 粗い）
def build_rings(name, sizes, half_cells, far, hfun, rmin=0.0, snow=False, material=None, drop_extra=0.0):
    """sizes：格子の幅（m）の列。内側の輪ほど細かい（隣は 2 倍）。half_cells：輪の半分の幅（格子の数）。
    視野（向き ± HALF_ANG）の中の升目だけを作る。外側の輪との境目は、外の輪の粗い頂点に合わせて（奇数の頂点を両隣の平均に）割れ目を消す。
    hfun(E, N) → 本当の高さ（m）。戻り値は (オブジェクトの列, 頂点数, 面の数)"""
    objs = []
    tot_v = tot_f = 0
    for k, s in enumerate(sizes):
        last = k == len(sizes) - 1
        Nh = int(math.ceil(far / s)) if last else half_cells
        hole = 0.0 if k == 0 else half_cells * sizes[k - 1]
        idx = np.arange(-Nh, Nh + 1)
        vx = CE + idx * s
        vy = CN + idx * s
        dx = ((vx[:-1] + vx[1:]) / 2 - CE).astype(np.float32)[None, :]
        dy = ((vy[:-1] + vy[1:]) / 2 - CN).astype(np.float32)[:, None]
        dist = np.hypot(dx, dy)
        diff = np.abs((np.degrees(np.arctan2(dx, dy)) - HEADING + 180.0) % 360.0 - 180.0)
        tol = np.degrees(np.arctan2(s * 0.71, dist + 1.0))
        ha = HALF_ANG if hole <= 9000.0 else FAR_ANG        # 16km より外の輪は視野の向きを絞る
        keep = ((diff <= ha + tol) | (dist < max(3 * s, 200.0))) & (dist <= far) & (dist >= rmin)
        keep &= ~((np.abs(dx) < hole) & (np.abs(dy) < hole))
        del dist, diff, tol
        if not keep.any():
            continue
        used = np.zeros((2 * Nh + 1, 2 * Nh + 1), dtype=bool)
        used[:-1, :-1] |= keep
        used[:-1, 1:] |= keep
        used[1:, :-1] |= keep
        used[1:, 1:] |= keep
        rr, cc = np.nonzero(used)
        nv = len(rr)
        ids = np.full(used.shape, -1, dtype=np.int64)
        ids[rr, cc] = np.arange(nv)
        E = vx[cc]
        Nn = vy[rr]
        hv = hfun(E, Nn).astype(np.float32)
        Hg = np.full(used.shape, np.nan, dtype=np.float32)
        Hg[rr, cc] = hv
        if not last and sizes[k + 1] > s:
            # 外の輪（2 倍の粗さ）の辺に合わせる。外周の奇数の頂点は両隣の平均
            for sl_fix in ((0, slice(None)), (2 * Nh, slice(None)), (slice(None), 0), (slice(None), 2 * Nh)):
                line = Hg[sl_fix]
                odd = np.arange(1, len(line) - 1, 2)
                avg = (line[odd - 1] + line[odd + 1]) * 0.5
                good = ~np.isnan(avg) & ~np.isnan(line[odd])
                line[odd[good]] = avg[good]
                Hg[sl_fix] = line
            hv = Hg[rr, cc]
        zw = hv - geo4.curvature_drop(E - 0.0, Nn).astype(np.float32) - drop_extra
        co = np.stack([E.astype(np.float32), Nn.astype(np.float32), zw.astype(np.float32)], axis=1)
        kr, kc = np.nonzero(keep)
        quads = np.stack([ids[kr, kc], ids[kr, kc + 1], ids[kr + 1, kc + 1], ids[kr + 1, kc]], axis=1).astype(np.int32)
        me = bpy.data.meshes.new(f"{name}{k}")
        me.vertices.add(nv)
        me.vertices.foreach_set("co", co.reshape(-1))
        me.loops.add(quads.size)
        me.loops.foreach_set("vertex_index", quads.reshape(-1))
        me.polygons.add(len(quads))
        me.polygons.foreach_set("loop_start", (np.arange(len(quads)) * 4).astype(np.int32))
        me.polygons.foreach_set("loop_total", np.full(len(quads), 4, dtype=np.int32))
        me.update(calc_edges=False)
        if snow:
            sv = snow_base(Hg, s, rr, cc, hv)
            at = me.attributes.new("snow", "FLOAT", "POINT")
            at.data.foreach_set("value", sv.astype(np.float32))
        me.polygons.foreach_set("use_smooth", np.ones(len(quads), dtype=bool))
        ob = bpy.data.objects.new(f"{name}{k}", me)
        bpy.context.scene.collection.objects.link(ob)
        if material is not None:
            me.materials.append(material)
        objs.append(ob)
        tot_v += nv
        tot_f += len(quads)
        log(f"  {name} 輪{k}: 格子 {s:g}m・頂点 {nv:,}・面 {len(quads):,}")
    return objs, tot_v, tot_f


def snow_base(Hg, s, rr, cc, hv):
    """雪の下ごしらえ（頂点ごとの 0〜1）。標高（2,500m から薄く・2,800m 以上で厚く）・傾き（急な岩は無し）・向き（北向きに多め）"""
    k = max(1, int(round(50.0 / s)))
    ny, nx = Hg.shape

    def diff(axis):
        c = np.full(Hg.shape, np.nan, dtype=np.float32)
        f = c.copy()
        b = c.copy()
        if axis == 1:
            c[:, k:-k] = (Hg[:, 2 * k:] - Hg[:, :-2 * k]) / (2 * k * s)
            f[:, :-k] = (Hg[:, k:] - Hg[:, :-k]) / (k * s)
            b[:, k:] = (Hg[:, k:] - Hg[:, :-k]) / (k * s)
        else:
            c[k:-k, :] = (Hg[2 * k:, :] - Hg[:-2 * k, :]) / (2 * k * s)
            f[:-k, :] = (Hg[k:, :] - Hg[:-k, :]) / (k * s)
            b[k:, :] = (Hg[k:, :] - Hg[:-k, :]) / (k * s)
        g = np.where(np.isnan(c), np.where(np.isnan(f), b, f), c)
        return np.nan_to_num(g[rr, cc])

    gx = diff(1)
    gy = diff(0)                                   # 北（行が増える向き）へ上がる割合
    mag = np.hypot(gx, gy)
    slope = np.degrees(np.arctan(mag))
    north = np.clip(-gy / np.maximum(mag, 1e-3), -1, 1) * np.clip(mag / 0.3, 0, 1)   # 北向き（北へ下る）が +
    base = 0.5 * smooth(hv, 2500.0, 2800.0) + 0.5 * smooth(hv, 2750.0, 3150.0)
    return base * (1.0 - smooth(slope, 32.0, 52.0)) * (0.8 + 0.3 * north) * float(opt.get("snow", "1"))


# ---------------------------------------------------------------- Blender の準備
scene = bpy.context.scene
for o in list(scene.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
if opt.get("device", "cpu") == "gpu":
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP", "METAL"):
        try:
            prefs.compute_device_type = kind
            prefs.refresh_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = "GPU"
                break
        except (TypeError, ValueError):
            continue
STATS["device"] = scene.cycles.device
scene.render.threads_mode = "FIXED"
scene.render.threads = THREADS
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = opt.get("denoise", "1") == "1"
scene.cycles.max_bounces = int(opt.get("bounces", "6"))
scene.cycles.transparent_max_bounces = int(opt.get("transparent_bounces", "256" if CLOUDS == "volume" else "16"))
scene.cycles.volume_bounces = int(opt.get("vol_bounces", "8"))
scene.cycles.seed = int(opt.get("render_seed", "7"))            # 固定（コマごとに変えない。ちらつき確かめ用）
scene.cycles.use_animated_seed = False
scene.cycles.volume_step_rate = float(opt.get("vol_step", "1.0"))
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = 100
scene.render.use_motion_blur = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "8"
scene.render.image_settings.color_mode = "RGB"
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - " + opt.get("look", "Medium_High_Contrast").replace("_", " ")
except TypeError:
    pass
scene.view_settings.exposure = float(opt.get("exposure", "-3.6"))
if "border" in opt:
    bx0, by0, bx1, by1 = (float(v) for v in opt["border"].split(","))
    scene.render.use_border = True
    scene.render.use_crop_to_border = False
    scene.render.border_min_x, scene.render.border_min_y, scene.render.border_max_x, scene.render.border_max_y = bx0, by0, bx1, by1

# カメラ（cameras.json の行列。位置は地球の丸みで下げた値）
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = LENS
cam_data.sensor_width = 36.0
cam_data.sensor_fit = "HORIZONTAL"
cam_data.clip_start = 5.0
cam_data.clip_end = 600000.0
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
M = np.array(CAM["matrix"])
mw = Matrix([[M[0, 0], M[0, 1], M[0, 2], CAM["pos_world"][0]], [M[1, 0], M[1, 1], M[1, 2], CAM["pos_world"][1]],
             [M[2, 0], M[2, 1], M[2, 2], CAM["pos_world"][2]], [0, 0, 0, 1]])
cam.matrix_world = mw
scene.camera = cam
CAM_W = np.array(CAM["pos_world"])
# 時間：シーンのコマ番号を映画のコマ（FRAME）にする（追加の部品が動きをつけられるように）。mblur=1 は前後 1 コマのカメラを置いて半コマ分ぼかす
ALLF = json.load(open(os.path.join(HERE, "cameras.json")))["frames"]
_fk = sorted(int(k) for k in ALLF)
scene.frame_start, scene.frame_end = max(FRAME - 1, _fk[0]), min(FRAME + 1, _fk[-1])
if opt.get("mblur", "0") == "1":
    cam.rotation_mode = "QUATERNION"
    _prev = None
    for f_ in sorted({min(max(FRAME + d, _fk[0]), _fk[-1]) for d in (-1, 0, 1)}):
        c_ = ALLF[str(f_)]
        M_ = np.array(c_["matrix"])
        cam.matrix_world = Matrix([[M_[0, 0], M_[0, 1], M_[0, 2], c_["pos_world"][0]], [M_[1, 0], M_[1, 1], M_[1, 2], c_["pos_world"][1]],
                                   [M_[2, 0], M_[2, 1], M_[2, 2], c_["pos_world"][2]], [0, 0, 0, 1]])
        if _prev is not None and cam.rotation_quaternion.dot(_prev) < 0:
            cam.rotation_quaternion = -cam.rotation_quaternion
        _prev = cam.rotation_quaternion.copy()
        cam.keyframe_insert("location", frame=f_)
        cam.keyframe_insert("rotation_quaternion", frame=f_)
    for fc in (cam.animation_data.action.fcurves if hasattr(cam.animation_data.action, "fcurves") else []):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    scene.cycles.motion_blur_position = "CENTER"
scene.frame_set(FRAME)


# ---------------------------------------------------------------- 節の部品（材質を作る道具）
class Nodes:
    def __init__(self, nt):
        self.nt = nt

    def new(self, kind, **kw):
        nd = self.nt.nodes.new(kind)
        for k, v in kw.items():
            if k.startswith("_"):
                setattr(nd, k[1:], v)
            elif isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, nd.inputs[k])
            else:
                nd.inputs[k].default_value = v
        return nd

    def math(self, op, a, b=None, c=None, clamp=False):
        nd = self.nt.nodes.new("ShaderNodeMath")
        nd.operation = op
        nd.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, nd.inputs[i])
            else:
                nd.inputs[i].default_value = v
        return nd.outputs[0]

    def vmath(self, op, a, b=None):
        nd = self.nt.nodes.new("ShaderNodeVectorMath")
        nd.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, nd.inputs[i])
            else:
                nd.inputs[i].default_value = v
        return nd

    def rng(self, v, a, b, c=0.0, d=1.0, smooth_=False):
        nd = self.new("ShaderNodeMapRange", Value=v, **{"From Min": a, "From Max": b, "To Min": c, "To Max": d})
        if smooth_:
            nd.interpolation_type = "SMOOTHSTEP"
        return nd.outputs["Result"]

    def mix(self, fac, a, b):
        nd = self.nt.nodes.new("ShaderNodeMix")
        nd.data_type = "RGBA"
        sock = {s.identifier: s for s in nd.inputs}
        for key, v in (("Factor_Float", fac), ("A_Color", a), ("B_Color", b)):
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, sock[key])
            else:
                sock[key].default_value = v
        return [o for o in nd.outputs if o.identifier == "Result_Color"][0]


def mapping_for(z, meta):
    """ENU の位置 → モザイク画像の UV（ウェブメルカトルは ENU と一次の関係）"""
    nx, ny = meta["nx"], meta["ny"]
    k = 2.0 ** z / (EARTH * K0)
    scale = (k / nx, k / ny, 0.0)
    loc = ((geo4.MX0 * 2.0 ** z - meta["x0"]) / nx, 1.0 - (geo4.MY0 * 2.0 ** z - meta["y0"]) / ny, 0.0)
    return scale, loc


def terrain_material():
    m = bpy.data.materials.new("terrain")
    m.use_nodes = True
    nt = m.node_tree
    nd = Nodes(nt)
    bsdf = nt.nodes["Principled BSDF"]
    geo = nd.new("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    sepp = nd.new("ShaderNodeSeparateXYZ", Vector=pos)
    flat = nd.new("ShaderNodeCombineXYZ", X=sepp.outputs["X"], Y=sepp.outputs["Y"])
    rr = nd.vmath("DISTANCE", flat.outputs[0], (CE, CN, 0.0)).outputs["Value"]
    layers = [n for n in ("p12", "p13", "p14", "p15", "p16", "p17", "pfuji") if os.path.exists(os.path.join(DATA, f"{n}.json"))]
    col = None
    if opt.get("tex", "1") == "0" or not layers:
        col = (0.3, 0.3, 0.3, 1.0)
    for name in layers:
        meta = json.load(open(os.path.join(DATA, f"{name}.json")))
        scale, loc = mapping_for(meta["z"], meta)
        mp = nd.new("ShaderNodeMapping", Vector=pos, Location=loc, Scale=scale)
        mp.vector_type = "POINT"
        im = nd.new("ShaderNodeTexImage", Vector=mp.outputs[0])
        im.image = bpy.data.images.load(os.path.join(DATA, f"{name}.jpg"), check_existing=True)
        im.image.colorspace_settings.name = "sRGB"
        im.interpolation = "Cubic" if meta["z"] >= 15 else "Linear"
        im.extension = "EXTEND"
        c = im.outputs["Color"]
        if col is None:
            col = c
            continue
        uv = nd.new("ShaderNodeSeparateXYZ", Vector=mp.outputs[0])
        u, v = uv.outputs["X"], uv.outputs["Y"]
        mn = nd.math("MINIMUM", nd.math("MINIMUM", u, nd.math("SUBTRACT", 1.0, u)), nd.math("MINIMUM", v, nd.math("SUBTRACT", 1.0, v)))
        w = nd.rng(mn, 0.0, 0.004)                         # 範囲の外は 0
        if "box" not in meta:                              # 距離の段：rmax の 75% から rmax にかけて、細かい写真から粗い写真へ
            w = nd.math("MULTIPLY", w, nd.rng(rr, 0.75 * meta["rmax"], meta["rmax"], 1.0, 0.0, True))
        col = nd.mix(w, col, c)
    # ---- 光を抜く：写真は夏の昼の太陽（南・高さ 57°）の陰影を含む。同じ向きで地形の陰影を作り、±1 段の範囲で割る。
    #      暗い所（影・色むら）は色を 60% 中立へ（青かぶり・紺のしみの元）
    if not isinstance(col, tuple) and opt.get("delight", "1") == "1":
        sph = (0.0, -math.cos(math.radians(57.0)), math.sin(math.radians(57.0)))
        dp = nd.vmath("DOT_PRODUCT", geo.outputs["Normal"], sph).outputs["Value"]
        fsh = nd.math("MAXIMUM", nd.math("MULTIPLY_ADD", nd.math("MAXIMUM", dp, 0.0), 0.7 / sph[2], 0.3), 0.5)
        dl = nd.vmath("SCALE", col, None)
        nt.links.new(nd.math("DIVIDE", 1.0, fsh), dl.inputs["Scale"])
        lum = nd.new("ShaderNodeRGBToBW", Color=dl.outputs["Vector"]).outputs[0]
        grey = nd.new("ShaderNodeCombineColor", Red=lum, Green=lum, Blue=lum).outputs[0]
        col = nd.mix(nd.math("MULTIPLY", nd.rng(lum, 0.02, 0.05, 1.0, 0.0, True), 0.6), dl.outputs["Vector"], grey)
    # ---- 色の仕立て（航空写真は夏の昼。11 月はじめの日の出の半時間後の山に）
    if isinstance(col, tuple):
        disp = col
        gam = None
    else:
        gam = nd.new("ShaderNodeGamma", Color=col, Gamma=1.0 / 2.2)
        disp = gam.outputs["Color"]
    if gam is not None:
        hs = nd.new("ShaderNodeSeparateColor", Color=disp)
        hs.mode = "HSV"
        h_, s_, v_ = hs.outputs[0], hs.outputs[1], hs.outputs[2]
        # この写真の森は青緑（色相 0.45 前後・彩度 0.2 前後）に写っている。明るい所（広葉樹・草）は赤茶・黄土・黄金へ、
        # 暗い所（針葉樹）は暗い緑へ寄せ、全体の彩度を少し落とす（色相・彩度・明るさ。見た目の色の空間で）
        g_w = nd.math("MULTIPLY", nd.math("MULTIPLY", nd.rng(h_, 0.17, 0.24, 0.0, 1.0, True), nd.rng(h_, 0.55, 0.62, 1.0, 0.0, True)), nd.rng(s_, 0.08, 0.16, 0.0, 1.0, True))
        dec = nd.rng(v_, 0.40, 0.64, 0.0, 1.0, True)                    # 明るい＝落葉の木・草
        warm = nd.math("MULTIPLY", nd.math("MULTIPLY", g_w, dec), 0.9)
        conif = nd.math("MULTIPLY", g_w, nd.math("SUBTRACT", 1.0, dec))
        nz = nd.new("ShaderNodeTexNoise", Vector=pos, Scale=1.0 / 1500.0, Detail=2.0)
        hue_t = nd.math("MULTIPLY_ADD", nz.outputs["Fac"], 0.10, 0.03)           # 赤茶（0.03）〜 黄金（0.13）
        h2 = nd.math("ADD", nd.math("ADD", h_, nd.math("MULTIPLY", nd.math("SUBTRACT", hue_t, h_), warm)),
                     nd.math("MULTIPLY", nd.math("SUBTRACT", 0.36, h_), nd.math("MULTIPLY", conif, 0.85)))
        s0 = nd.math("MULTIPLY", s_, 0.88)
        s2 = nd.math("ADD", nd.math("ADD", s0, nd.math("MULTIPLY", nd.math("SUBTRACT", 0.42, s0), nd.math("MULTIPLY", warm, 0.75))), nd.math("MULTIPLY", s0, nd.math("MULTIPLY", conif, 0.5)))
        vd = float(opt.get("veg_dark", "0.55"))
        v2 = nd.math("MULTIPLY", nd.math("MULTIPLY", v_, nd.math("SUBTRACT", 1.0, nd.math("MULTIPLY", warm, 1.0 - (0.45 + vd * 0.65)))),
                     nd.math("SUBTRACT", 1.0, nd.math("MULTIPLY", conif, 1.0 - (0.1 + vd * 0.9))))
        cb = nd.new("ShaderNodeCombineColor", Red=h2, Green=s2, Blue=v2)
        cb.mode = "HSV"
        lin = nd.new("ShaderNodeGamma", Color=cb.outputs[0], Gamma=2.2)
        graded = nd.vmath("SCALE", lin.outputs["Color"], None)
        graded.inputs["Scale"].default_value = 0.8
        gcol = graded.outputs["Vector"]
        # 反射率の合わせ：森 0.03〜0.06・乾いた草 0.12〜0.20・岩とガレ 0.15〜0.30（輝度の曲線）
        gl = nd.new("ShaderNodeRGBToBW", Color=gcol).outputs[0]
        fc = nd.new("ShaderNodeFloatCurve", Value=gl)
        cm_ = fc.mapping
        cm_.clip_max_y = 1.0
        pts = [(0.0, 0.0), (0.03, 0.022), (0.08, 0.05), (0.16, 0.10), (0.3, 0.19), (0.6, 0.4), (1.0, 0.7)]
        while len(cm_.curves[0].points) < len(pts):
            cm_.curves[0].points.new(0.5, 0.5)
        for p_, (x_, y_) in zip(cm_.curves[0].points, pts):
            p_.location = (x_, y_)
        cm_.update()
        ratio = nd.math("DIVIDE", fc.outputs[0], nd.math("MAXIMUM", gl, 1e-4))
        cal = nd.vmath("SCALE", gcol, None)
        nt.links.new(nd.math("MULTIPLY", ratio, float(opt.get("albedo", "0.7"))), cal.inputs["Scale"])
        gcol = cal.outputs["Vector"]
    else:
        gcol = (0.3, 0.3, 0.3)
    # 急な面（45° より急）は写真をやめて岩（3 次元のノイズ＝三面に貼ったのと同じ）へ
    nz_ = nd.math("ARCCOSINE", nd.math("MINIMUM", nd.math("MAXIMUM", nd.new("ShaderNodeSeparateXYZ", Vector=geo.outputs["Normal"]).outputs["Z"], -1.0), 1.0))
    rk1 = nd.new("ShaderNodeTexNoise", Vector=pos, Scale=1.0 / 22.0, Detail=6.0, Roughness=0.6).outputs["Fac"]
    rk2 = nd.new("ShaderNodeTexNoise", Vector=pos, Scale=1.0 / 3.5, Detail=4.0, Roughness=0.6).outputs["Fac"]
    rkf = nd.math("ADD", nd.math("MULTIPLY", rk1, 0.65), nd.math("MULTIPLY", rk2, 0.35))
    rock = nd.mix(nd.rng(rkf, 0.3, 0.7, 0.0, 1.0, True), (0.065, 0.055, 0.047, 1.0), (0.20, 0.175, 0.15, 1.0))
    steep = nd.rng(nz_, math.radians(40.0), math.radians(55.0), 0.0, 1.0, True)
    if not isinstance(gcol, tuple):
        gcol = nd.mix(nd.math("MULTIPLY", steep, float(opt.get("rock", "1.0"))), gcol, rock)
    # 雪
    at = nd.new("ShaderNodeAttribute")
    at.attribute_type = "GEOMETRY"
    at.attribute_name = "snow"
    n1 = nd.math("MULTIPLY_ADD", nd.new("ShaderNodeTexNoise", Vector=pos, Scale=1.0 / 90.0, Detail=5.0, Roughness=0.6).outputs["Fac"],
                 nd.rng(rr, 8000.0, 25000.0, 1.0, 0.0, True), nd.math("MULTIPLY", nd.rng(rr, 8000.0, 25000.0, 0.0, 1.0, True), 0.5))   # 遠くは細かい雪のつぶを消して、やわらかい色に
    n2 = nd.new("ShaderNodeTexNoise", Vector=pos, Scale=1.0 / 700.0, Detail=3.0).outputs["Fac"]
    nn = nd.math("ADD", nd.math("MULTIPLY", n1, 0.6), nd.math("MULTIPLY", n2, 0.4))
    cvr = nd.math("ADD", at.outputs["Fac"], nd.math("MULTIPLY", nd.math("SUBTRACT", nn, 0.5), 0.7))
    snow = nd.rng(cvr, 0.38, 0.56, 0.0, 1.0, True)
    final = nd.mix(snow, gcol if not isinstance(gcol, tuple) else (0.3, 0.3, 0.3, 1.0), (0.80, 0.84, 0.90, 1.0))
    ro = nt.nodes.new("NodeReroute")                       # 追加の部品（木の色合わせなど）が色を差し込む所
    ro.name = "base_out"
    ro.label = "base_out"
    nt.links.new(final, ro.inputs[0])
    nt.links.new(ro.outputs[0], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.92
    bump = nd.new("ShaderNodeBump", Distance=2.0)
    nt.links.new(nd.math("MULTIPLY", nd.rng(rr, 2500.0, 8000.0, 1.0, 0.0, True), 0.25), bump.inputs["Strength"])
    nt.links.new(final, bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if opt.get("emit", "0") == "1":                        # 確かめ用：照明なしで、仕立てた色だけを見る
        em = nd.new("ShaderNodeEmission")
        nt.links.new(final, em.inputs["Color"])
        mo = [n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial"][0]
        nt.links.new(em.outputs[0], mo.inputs["Surface"])
    return m


# ---------------------------------------------------------------- 地形
t0 = time.time()
log("地形を作る…")
mat_ground = terrain_material()
_fc = float(opt.get("far_cell", "64"))
TERRAIN_SIZES = [4.0, 8.0, 16.0, 32.0, 64.0, _fc]
terrain_objs, TV, TF = build_rings("terrain", TERRAIN_SIZES, 512, FAR, ground, snow=True, material=mat_ground) if opt.get("terrain", "1") == "1" else ([], 0, 0)
STATS.update(terrain_vertices=TV, terrain_faces=TF, terrain_seconds=round(time.time() - t0, 1))
log(f"地形 頂点 {TV:,}・{time.time() - t0:.1f} 秒")


# ---------------------------------------------------------------- 雲の上面（高さの場）
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
    return n0 * (1 - v) + n1 * v


def fbm(x, y, scale, octaves, seed, rough=0.5):
    tot, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        f = 2.0**o / scale
        tot = tot + amp * perlin(x * f, y * f, seed + o * 17)
        norm += amp
        amp *= rough
    return 0.5 + 0.75 * tot / norm            # だいたい 0〜1


def domes(x, y, cell, seed, smooth_=0.35):
    """丸い頭（0〜1）。ボロノイの距離のなめらかな最小。隣り合う頭がなだらかにつながる"""
    cx_, cy_ = x / cell, y / cell
    ix, iy = np.floor(cx_).astype(np.int64) + 1_000_000, np.floor(cy_).astype(np.int64) + 1_000_000
    acc = np.zeros(np.broadcast(cx_, cy_).shape, dtype=np.float32)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            jx, jy = ix + di, iy + dj
            px = (jx - 1_000_000).astype(np.float32) + hash01(jx, jy, seed)
            py = (jy - 1_000_000).astype(np.float32) + hash01(jy, jx, seed + 7)
            d = np.sqrt((px - cx_) ** 2 + (py - cy_) ** 2)
            acc += np.exp(-d / smooth_ * 4.0)
    f1 = -np.log(np.maximum(acc, 1e-12)) * smooth_ / 4.0
    return np.clip(1.0 - f1, 0.0, 1.0) ** 1.5


# ---- 雲海の形：長いうねり（2〜5km・筋が視線を横切る）＋0.6〜1.2km の帯＋平たい大きなこぶ（150〜250m）＋うすい細かな乱れ。
# 上面の高さ（本当の標高 m）は「位置と映画の時刻」だけで決まる（ゆっくりの流れ DRIFT のみ時刻に依る。距離で細かい模様の量を絞るのは見えない所の手間の節約）
CLOUD_STRETCH = float(opt.get("cloud_stretch", "2.5"))          # 筋の長さ：幅の何倍か
DRIFT_V = float(opt.get("drift", "2.0"))                        # 雲の流れる速さ m/s（3 以下）
_da = math.radians((HEADING + 180.0) % 360.0)                   # 筋に直角（カメラから遠ざかる向きの逆）へ
DRIFT = (math.sin(_da) * DRIFT_V * FRAME / 24.0, math.cos(_da) * DRIFT_V * FRAME / 24.0)
_STD = {}


def nf(x, y, scale, octaves, seed, rough=0.5):
    """fbm を平均 0・標準偏差 1 にしたもの（標準偏差は最初に一度だけ測る）"""
    key = (octaves, rough)
    if key not in _STD:
        rs = np.random.RandomState(5)
        v = fbm(rs.uniform(0, 400, 60000).astype(np.float32), rs.uniform(0, 400, 60000).astype(np.float32), 1.0, octaves, 777, rough)
        _STD[key] = (float(v.mean()), float(v.std()))
    m, sd = _STD[key]
    return (fbm(x, y, scale, octaves, seed, rough) - m) / sd


_rs = np.random.RandomState(9)
DOME_MEAN = float(domes(_rs.uniform(0, 3000, 40000).astype(np.float32), _rs.uniform(0, 3000, 40000).astype(np.float32), 180.0, 5).mean())
CREST_A = math.radians((HEADING + 90.0) % 360.0)                # 筋の伸びる向き（視線に直角）


def cloud_top_raw(X, Y):
    """雲の上面（本当の高さ m）"""
    X0 = np.asarray(X, dtype=np.float64)
    Y0 = np.asarray(Y, dtype=np.float64)
    r = np.hypot(X0 - CE, Y0 - CN)
    x = (X0 - DRIFT[0]).astype(np.float32)
    y = (Y0 - DRIFT[1]).astype(np.float32)
    s0 = SEED * 101
    al = x * np.float32(math.sin(CREST_A)) + y * np.float32(math.cos(CREST_A))      # 筋に沿う向き
    ac = x * np.float32(math.cos(CREST_A)) - y * np.float32(math.sin(CREST_A))      # 筋を横切る向き（遠近の向き）
    u = al / np.float32(CLOUD_STRETCH)
    v = ac
    wu = u + np.float32(150.0) * nf(u, v, 1800.0, 2, s0 + 11)
    wv = v + np.float32(150.0) * nf(u, v, 1800.0, 2, s0 + 23)
    swell = np.float32(float(opt.get("swell", "38"))) * nf(wu, wv, 3400.0, 3, s0 + 31, 0.45)           # 2〜5km
    ph = wv / np.float32(2900.0) + np.float32(0.5) * nf(u, v, 7000.0, 2, s0 + 47)
    env = np.float32(0.4) + np.float32(0.6) * np.clip(0.5 + 0.5 * nf(u, v, 9000.0, 2, s0 + 53), 0.0, 1.0)
    wave = np.float32(float(opt.get("wave", "30"))) * np.sin(np.float32(2 * math.pi) * ph) * env          # 平行な筋
    band = np.float32(float(opt.get("band", "13"))) * nf(wu, wv, 900.0, 3, s0 + 61, 0.5)                # 0.6〜1.2km
    big = np.float32(14.0) * nf(u, v, 16000.0, 2, s0 + 37)
    lump = np.clip((fbm(x, y, 8000.0, 2, s0 + 41) - 0.38) / 0.28, 0.0, 1.0)
    lump = np.float32(0.3) + np.float32(0.7) * lump
    wc = (1.0 - smooth(r, 5000.0, 13000.0)).astype(np.float32)               # 細かい模様は近くだけ
    cells = np.float32(float(opt.get("cells", "16"))) * (domes(al / 1.5, ac, 190.0, s0 + 53) - np.float32(DOME_MEAN))   # 150〜250m の平たいこぶ
    wisp = np.float32(3.0) * nf(al / 2.0, ac, 45.0, 3, s0 + 79, 0.55)                                        # 30〜60m のうすい乱れ
    return (CLOUD_TOP + swell + wave + band + big + wc * lump * (cells + wisp)).astype(np.float32)


def kamikochi_mask(E, N):
    """上高地まわり（尾根 東経 137.69 の西・北緯 36.19〜36.33）は雲海が無い。1 = 雲なし"""
    lon, lat = geo4.to_lonlat(E, N)
    mx = (1.0 - smooth(lon, 137.685, 137.705)) * smooth(lon, 137.42, 137.46)
    my = smooth(lat, 36.175, 36.205) * (1.0 - smooth(lat, 36.315, 36.345))
    return (mx * my).astype(np.float32)


def cloud_surface(e, n, gr):
    """(上面の高さ（本当の標高）, 濃さの重み, 霧の舌) 山の斜面でやわらかく・不ぞろいに薄くなる（岸）。斜面ぎわに霧の舌。上高地は雲なし"""
    t = cloud_top_raw(e, n)
    thick = t - gr
    km = kamikochi_mask(e, n)
    x = (np.asarray(e) - DRIFT[0]).astype(np.float32)
    y = (np.asarray(n) - DRIFT[1]).astype(np.float32)
    nz = fbm(x, y, 170.0, 3, SEED * 101 + 97)                          # 0〜1
    reach = np.float32(230.0) * (np.float32(0.55) + np.float32(0.9) * nz)
    low = 70.0 * (1.0 - smooth(thick, 0.0, reach))
    tn = np.clip((nf(x, y, 120.0, 3, SEED * 101 + 101) + 0.1) * 1.5, 0.0, 1.0)
    zone = smooth(thick, 12.0, 70.0) * (1.0 - smooth(thick, 110.0, 260.0))
    tongue = (tn * zone * (1.0 - km)).astype(np.float32)
    top = t - low + float(opt.get("tongue", "60")) * tongue - 450.0 * km
    wgt = smooth(thick, 8.0, 150.0) * (1.0 - km)
    return top.astype(np.float32), wgt.astype(np.float32), tongue


def cloud_field(E, N, chunk=600_000):
    shape = np.shape(E)
    e = np.ravel(E)
    n = np.ravel(N)
    top = np.empty(len(e), dtype=np.float32)
    wgt = np.empty(len(e), dtype=np.float32)
    for i in range(0, len(e), chunk):
        sl = slice(i, i + chunk)
        top[sl], wgt[sl], _ = cloud_surface(e[sl], n[sl], ground(e[sl], n[sl]))
    return top.reshape(shape), wgt.reshape(shape)


# ---------------------------------------------------------------- 雲の光の応え方（どの輪も同じ材質の値）
D0 = float(opt.get("cloud_density", "0.06"))        # 雲の中の濃さ（1/m）
CLOUD_COLOR = (0.985, 0.985, 0.99, 1.0)
PHASE = opt.get("phase", "hg2")


def cloud_scatter(nt, density, color=CLOUD_COLOR):
    """雲の散乱（吸収なし）。hg2＝前向きの強い山（g 0.86）と等方に近い山（g 0.1）の 2 つ。mie＝Blender の水滴の位相関数"""
    def dens(k):
        if isinstance(density, bpy.types.NodeSocket):
            nd_ = nt.nodes.new("ShaderNodeMath")
            nd_.operation = "MULTIPLY"
            nt.links.new(density, nd_.inputs[0])
            nd_.inputs[1].default_value = k
            return nd_.outputs[0]
        return density * k

    def node(g, k, phase="HENYEY_GREENSTEIN"):
        n_ = nt.nodes.new("ShaderNodeVolumeScatter")
        n_.phase = phase
        n_.inputs["Color"].default_value = color
        n_.inputs["Anisotropy"].default_value = g
        d_ = dens(k)
        if isinstance(d_, bpy.types.NodeSocket):
            nt.links.new(d_, n_.inputs["Density"])
        else:
            n_.inputs["Density"].default_value = d_
        return n_

    if PHASE == "mie":
        n_ = node(0.0, 1.0, "MIE")
        n_.inputs["Diameter"].default_value = float(opt.get("droplet", "15"))
        return n_.outputs[0]
    gf, gb = float(opt.get("g_fwd", "0.86")), float(opt.get("g_body", "0.1"))
    wf = float(opt.get("w_fwd", "0.6"))
    a = node(gf, wf)
    b = node(gb, 1.0 - wf)
    ad = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(a.outputs[0], ad.inputs[0])
    nt.links.new(b.outputs[0], ad.inputs[1])
    return ad.outputs[0]


# ---------------------------------------------------------------- 閉じた板（均一な雲・かすみ）
def closed_slab(name, vx, vy, ztop, zbot, keep, material):
    """vx, vy：格子の線（東・北）、ztop・zbot：格子の頂点の高さ（行 = 北、列 = 東）、keep：升目（行 = 北、列 = 東。1 つ小さい）が真の所だけ。
    上面・下面・まわりの壁で閉じた形。体積の材質用"""
    ny, nx = ztop.shape
    used = np.zeros((ny, nx), dtype=bool)
    used[:-1, :-1] |= keep
    used[:-1, 1:] |= keep
    used[1:, :-1] |= keep
    used[1:, 1:] |= keep
    rr, cc = np.nonzero(used)
    nv = len(rr)
    if nv == 0:
        return None
    ids = np.full((ny, nx), -1, dtype=np.int64)
    ids[rr, cc] = np.arange(nv)
    co = np.zeros((2 * nv, 3), dtype=np.float32)
    co[:nv, 0] = vx[cc]
    co[:nv, 1] = vy[rr]
    co[:nv, 2] = ztop[rr, cc]
    co[nv:, 0] = co[:nv, 0]
    co[nv:, 1] = co[:nv, 1]
    co[nv:, 2] = zbot[rr, cc]
    kr, kc = np.nonzero(keep)
    a, b, c, d = ids[kr, kc], ids[kr, kc + 1], ids[kr + 1, kc + 1], ids[kr + 1, kc]
    faces = [np.stack([a, b, c, d], 1), np.stack([d + nv, c + nv, b + nv, a + nv], 1)]
    kp = np.pad(keep, 1, constant_values=False)
    for dr, dc, order in ((-1, 0, "S"), (1, 0, "N"), (0, -1, "W"), (0, 1, "E")):
        open_ = ~kp[1 + kr + dr, 1 + kc + dc]
        r_, c_ = kr[open_], kc[open_]
        if len(r_) == 0:
            continue
        a, b, c, d = ids[r_, c_], ids[r_, c_ + 1], ids[r_ + 1, c_ + 1], ids[r_ + 1, c_]      # 南西・南東・北東・北西
        if order == "S":
            q = np.stack([a, a + nv, b + nv, b], 1)
        elif order == "N":
            q = np.stack([c, c + nv, d + nv, d], 1)
        elif order == "W":
            q = np.stack([d, d + nv, a + nv, a], 1)
        else:
            q = np.stack([b, b + nv, c + nv, c], 1)
        faces.append(q)
    faces = np.concatenate(faces).astype(np.int32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(2 * nv)
    me.vertices.foreach_set("co", co.reshape(-1))
    me.loops.add(faces.size)
    me.loops.foreach_set("vertex_index", faces.reshape(-1))
    me.polygons.add(len(faces))
    me.polygons.foreach_set("loop_start", (np.arange(len(faces)) * 4).astype(np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(faces), 4, dtype=np.int32))
    me.update(calc_edges=False)
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob, 2 * nv, len(faces)


SQ_CENTER = (round(CE / 320.0) * 320.0, round(CN / 320.0) * 320.0)     # 輪の四角の真ん中（どの格子にもそろう 320m の倍数）


def cone_keep(vx, vy, rmin, rmax, ang):
    """格子の升目（中心が、真ん中 SQ_CENTER から見て四角の半幅 rmin〜rmax の間・視野の向きの中）の真偽。
    隣り合う輪は同じ四角の線で接する（重ならない・すき間も無い）"""
    ddx = ((vx[:-1] + vx[1:]) / 2 - SQ_CENTER[0]).astype(np.float32)[None, :]
    ddy = ((vy[:-1] + vy[1:]) / 2 - SQ_CENTER[1]).astype(np.float32)[:, None]
    cheb = np.maximum(np.abs(ddx), np.abs(ddy))
    dx = ((vx[:-1] + vx[1:]) / 2 - CE).astype(np.float32)[None, :]
    dy = ((vy[:-1] + vy[1:]) / 2 - CN).astype(np.float32)[:, None]
    dist = np.hypot(dx, dy)
    s = float(vx[1] - vx[0])
    diff = np.abs((np.degrees(np.arctan2(dx, dy)) - HEADING + 180.0) % 360.0 - 180.0)
    tol = np.degrees(np.arctan2(s * 0.71, dist + 1.0))
    return ((diff <= ang + tol) | (dist < 3 * s)) & (cheb >= rmin) & (cheb < rmax)


def build_cloud_slab(name, s, rmin, rmax, ang, material, thick=260.0, top_off=0.0):
    """均一な雲の板。上面は雲の高さの場（丸みで下げる）＋top_off、下面は thick m 下"""
    Nh = int(math.ceil((rmax + 400.0) / s)) + 2
    c0x, c0y = round(SQ_CENTER[0] / s), round(SQ_CENTER[1] / s)
    vx = (c0x + np.arange(-Nh, Nh + 1)) * s
    vy = (c0y + np.arange(-Nh, Nh + 1)) * s
    keep = cone_keep(vx, vy, rmin, rmax, ang)
    used = np.zeros((2 * Nh + 1, 2 * Nh + 1), dtype=bool)
    used[:-1, :-1] |= keep
    used[:-1, 1:] |= keep
    used[1:, :-1] |= keep
    used[1:, 1:] |= keep
    rr, cc = np.nonzero(used)
    E = vx[cc].astype(np.float64)
    Nn = vy[rr].astype(np.float64)
    top, wgt = cloud_field(E, Nn)
    zt = np.full(used.shape, np.nan, dtype=np.float32)
    wg = np.zeros(used.shape, dtype=np.float32)
    zt[rr, cc] = top - geo4.curvature_drop(E, Nn).astype(np.float32) + top_off
    wg[rr, cc] = wgt
    wq = np.maximum.reduce([wg[:-1, :-1], wg[:-1, 1:], wg[1:, :-1], wg[1:, 1:]])
    keep &= wq > 0.03
    zt = np.nan_to_num(zt, nan=0.0)
    return closed_slab(name, vx, vy, zt, zt - thick, keep, material)


def curved_slab(name, z0, z1, rmax, cell, material):
    """地球の丸みに沿う板（かすみの層）。原点（河童橋）から rmax の四角。カメラの中を含む。z0〜z1 は真の標高"""
    n = int(math.ceil(rmax / cell))
    vx = np.arange(-n, n + 1) * cell
    vy = np.arange(-n, n + 1) * cell
    X, Y = np.meshgrid(vx, vy)
    drop = geo4.curvature_drop(X, Y).astype(np.float32)
    keep = np.ones((2 * n, 2 * n), dtype=bool)
    return closed_slab(name, vx, vy, (z1 - drop).astype(np.float32), (z0 - drop).astype(np.float32), keep, material)


def haze_material(name, density, color, g):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n_ in list(nt.nodes):
        nt.nodes.remove(n_)
    v = nt.nodes.new("ShaderNodeVolumeScatter")
    v.inputs["Color"].default_value = color
    v.inputs["Density"].default_value = density
    v.inputs["Anisotropy"].default_value = g
    mo = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(v.outputs[0], mo.inputs["Volume"])
    return m


# ---------------------------------------------------------------- 雲の面（clouds=surface。下書き用の白い面）
def make_cloud_surface_material():
    m = bpy.data.materials.new("cloudsurf")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    nd = Nodes(nt)
    dif = nd.new("ShaderNodeBsdfDiffuse", Color=(0.93, 0.94, 0.96, 1.0), Roughness=1.0)
    tr = nd.new("ShaderNodeBsdfTranslucent", Color=(0.9, 0.92, 0.96, 1.0))
    mx = nd.new("ShaderNodeMixShader", Fac=0.3)
    nt.links.new(dif.outputs[0], mx.inputs[1])
    nt.links.new(tr.outputs[0], mx.inputs[2])
    out = nd.new("ShaderNodeOutputMaterial")
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def cloud_hfun(E, N):
    t, _ = cloud_field(E, N)
    return t


cloud_objs = []
if CLOUDS == "surface":
    t0 = time.time()
    log("雲の面（下書き）を作る…")
    objs, cv, cf = build_rings("cloudsurf", [16.0, 32.0, 64.0, 128.0], 256, FAR, cloud_hfun, material=make_cloud_surface_material())
    cloud_objs += objs
    STATS.update(cloud_surface_vertices=cv, cloud_surface_seconds=round(time.time() - t0, 1))
    log(f"雲の面 頂点 {cv:,}・{time.time() - t0:.1f} 秒")


# ---------------------------------------------------------------- 立体の雲（近く：不均一）
R_A = float(opt.get("ring_a", "1800"))      # ここから近くの細かい雲が均一な板へ移り始める
R_B = float(opt.get("ring_b", "3500"))      # ここで完全に板になる（移りの幅 3km 強）


def cloud_volume_material(name, img, ox, oy, span, wisp_scale, wisp_detail, edge_m, wisp_m):
    cm = bpy.data.materials.new(name)
    cm.use_nodes = True
    cn = cm.node_tree
    for n in list(cn.nodes):
        cn.nodes.remove(n)
    nd = Nodes(cn)
    geo = nd.new("ShaderNodeNewGeometry")
    P = geo.outputs["Position"]
    sepw = nd.new("ShaderNodeSeparateXYZ", Vector=P)
    flat = nd.new("ShaderNodeCombineXYZ", X=sepw.outputs["X"], Y=sepw.outputs["Y"])
    rr = nd.vmath("DISTANCE", flat.outputs[0], (CE, CN, 0.0)).outputs["Value"]
    PD = nd.vmath("SUBTRACT", P, (DRIFT[0], DRIFT[1], 0.0)).outputs["Vector"]      # 流れに乗った位置（雲の模様用）
    uvx = nd.math("MULTIPLY_ADD", sepw.outputs["X"], 1.0 / span, -ox / span)
    uvy = nd.math("MULTIPLY_ADD", sepw.outputs["Y"], 1.0 / span, -oy / span)
    uvv = nd.new("ShaderNodeCombineXYZ", X=uvx, Y=uvy)
    timg = nd.new("ShaderNodeTexImage", Vector=uvv.outputs[0])
    timg.image = img
    timg.interpolation = "Linear"
    timg.extension = "EXTEND"
    rg = nd.new("ShaderNodeSeparateColor", Color=timg.outputs["Color"])
    wisp = nd.new("ShaderNodeTexNoise", Vector=PD, Scale=1.0 / wisp_scale, Detail=wisp_detail, Roughness=0.6)
    hz_ = nd.math("ADD", rg.outputs[0], CLOUD_TOP)
    hz_ = nd.math("MULTIPLY_ADD", wisp.outputs["Fac"], wisp_m, nd.math("SUBTRACT", hz_, wisp_m / 2))
    below = nd.math("SUBTRACT", hz_, sepw.outputs["Z"])
    edge = nd.rng(below, -2.0, edge_m, 0.0, 1.0, True)                  # 上面から edge_m かけて濃くなる（やわらかい頂）
    LAYER = 260.0
    deep = nd.rng(below, LAYER - 60.0, LAYER, 1.0, 0.0)
    wm = nd.rng(wisp.outputs["Fac"], 0.38, 0.62)
    near_top = nd.rng(below, 0.0, 30.0, 1.0, 0.0)
    shred = nd.math("SUBTRACT", 1.0, nd.math("MULTIPLY", near_top, nd.math("SUBTRACT", 1.0, wm)))
    gn = nd.new("ShaderNodeTexNoise", Vector=PD, Scale=1.0 / 90.0, Detail=3.0).outputs["Fac"]
    shore = nd.rng(nd.math("MULTIPLY", rg.outputs[1], nd.math("MULTIPLY_ADD", gn, 0.8, 0.6)), 0.15, 0.7, 0.0, 1.0, True)
    tongue = nd.math("SUBTRACT", 1.0, nd.math("MULTIPLY", rg.outputs[2], 0.65))      # 霧の舌は薄い（濃さの 35%）
    s0 = nd.math("MULTIPLY", nd.math("MULTIPLY", nd.math("MULTIPLY", edge, deep), nd.math("MULTIPLY", shred, shore)), tongue)
    f = nd.rng(rr, R_A, R_B, 0.0, 1.0, True)                            # 近くの細かい雲 → 均一な板へ
    dens = nd.math("MULTIPLY", nd.math("MULTIPLY", s0, nd.math("SUBTRACT", 1.0, f)), D0)
    sh = cloud_scatter(cn, dens)
    mo = nd.new("ShaderNodeOutputMaterial")
    cn.links.new(sh, mo.inputs["Volume"])
    return cm


def cloud_slab_material(name, ramp, scale=1.0):
    """均一な板の材質。ramp=True は近くの細かい雲から移る所（距離で濃くなる）。False は定数（Cycles が解析的に扱える）"""
    cm = bpy.data.materials.new(name)
    cm.use_nodes = True
    cn = cm.node_tree
    for n in list(cn.nodes):
        cn.nodes.remove(n)
    nd = Nodes(cn)
    if ramp:
        geo = nd.new("ShaderNodeNewGeometry")
        sepw = nd.new("ShaderNodeSeparateXYZ", Vector=geo.outputs["Position"])
        flat = nd.new("ShaderNodeCombineXYZ", X=sepw.outputs["X"], Y=sepw.outputs["Y"])
        rr = nd.vmath("DISTANCE", flat.outputs[0], (CE, CN, 0.0)).outputs["Value"]
        dens = nd.math("MULTIPLY", nd.rng(rr, R_A, R_B, 0.0, 1.0, True), D0 * scale)
    else:
        dens = D0 * scale
    sh = cloud_scatter(cn, dens)
    mo = nd.new("ShaderNodeOutputMaterial")
    cn.links.new(sh, mo.inputs["Volume"])
    return cm


def bake_cloud_image(name, ox, oy, nx, ny, texel):
    """上面の高さの画像：R = 上面 − 丸みの分 − CLOUD_TOP（32 ビット浮動小数。16 ビットだと 1〜2m の段が縞になる）、G = 濃さの重み、B = 霧の舌"""
    t1 = time.time()
    g = 4
    gxs = ox + (np.arange((nx - 1) // g + 2)) * texel * g
    gys = oy + (np.arange((ny - 1) // g + 2)) * texel * g
    GX, GY = np.meshgrid(gxs, gys)
    gg = ground(GX, GY).astype(np.float32)

    def up(a):
        ys = np.arange(ny) / g
        xs = np.arange(nx) / g
        y0 = np.minimum(ys.astype(int), a.shape[0] - 2)
        x0 = np.minimum(xs.astype(int), a.shape[1] - 2)
        fy = (ys - y0)[:, None].astype(np.float32)
        fx = (xs - x0)[None, :].astype(np.float32)
        r0 = a[y0][:, x0] * (1 - fx) + a[y0][:, x0 + 1] * fx
        r1 = a[y0 + 1][:, x0] * (1 - fx) + a[y0 + 1][:, x0 + 1] * fx
        return r0 * (1 - fy) + r1 * fy

    gfull = up(gg)
    X = (ox + (np.arange(nx) + 0.5) * texel)[None, :].astype(np.float64)
    Y = (oy + (np.arange(ny) + 0.5) * texel)[:, None].astype(np.float64)
    XB = np.broadcast_to(X, (ny, nx))
    YB = np.broadcast_to(Y, (ny, nx))
    top = np.empty((ny, nx), dtype=np.float32)
    wgt = np.empty((ny, nx), dtype=np.float32)
    tng = np.empty((ny, nx), dtype=np.float32)
    rows = max(1, 400_000 // nx)
    for r0 in range(0, ny, rows):
        sl = slice(r0, r0 + rows)
        e, n = XB[sl], YB[sl]
        t_, w_, g_ = cloud_surface(e, n, gfull[sl])
        top[sl] = t_ - geo4.curvature_drop(e, n).astype(np.float32) - CLOUD_TOP
        wgt[sl] = w_
        tng[sl] = g_
    img = bpy.data.images.new(name, nx, ny, alpha=False, float_buffer=True, is_data=True)
    if hasattr(img, "use_half_precision"):
        img.use_half_precision = False
    rgba = np.empty((ny, nx, 4), dtype=np.float32)
    rgba[..., 0] = top
    rgba[..., 1] = wgt
    rgba[..., 2] = tng
    rgba[..., 3] = 1.0
    img.pixels.foreach_set(rgba.reshape(-1))
    log(f"  雲の高さの画像 {name}: {nx}x{ny}（{texel:g}m）{time.time() - t1:.1f} 秒")
    return img, top, wgt


def make_volume_tiles(prefix, top, wgt, ox, oy, texel, B, tile_m, material, accept):
    """上面に沿った閉じた入れ物（akafuji の 4 版と同じ作り）を、tile_m 四方のタイルにして置く。accept(中心の東, 北) が真のタイルだけ"""
    ny, nx = top.shape
    by, bx = ny // B, nx // B
    cell = B * texel
    tb = top[: by * B, : bx * B].reshape(by, B, bx, B)
    tmax, tmin = tb.max(axis=(1, 3)), tb.min(axis=(1, 3))
    wmax = wgt[: by * B, : bx * B].reshape(by, B, bx, B).max(axis=(1, 3))
    pad_max = np.pad(tmax, 1, mode="edge")
    pad_min = np.pad(tmin, 1, mode="edge")
    LAYER = 260.0
    vmax = np.maximum.reduce([pad_max[:-1, :-1], pad_max[1:, :-1], pad_max[:-1, 1:], pad_max[1:, 1:]]) + CLOUD_TOP + 8.0 + 20.0
    vmin = np.minimum.reduce([pad_min[:-1, :-1], pad_min[1:, :-1], pad_min[:-1, 1:], pad_min[1:, 1:]]) + CLOUD_TOP - LAYER
    vy_, vx_ = vmax.shape
    vxs = ox + np.arange(vx_) * cell
    vys = oy + np.arange(vy_) * cell
    TC = max(1, int(round(tile_m / cell)))
    OVER = 0.25
    objs = []
    for r0 in range(0, vy_ - 1, TC):
        r1 = min(r0 + TC, vy_ - 1)
        for c0 in range(0, vx_ - 1, TC):
            c1 = min(c0 + TC, vx_ - 1)
            if wmax[r0:r1, c0:c1].max() < 0.03:
                continue
            ce, cn = (vxs[c0] + vxs[c1]) / 2, (vys[r0] + vys[r1]) / 2
            if not accept(ce, cn):
                continue
            ty_, tx_ = r1 - r0 + 1, c1 - c0 + 1
            xs = vxs[c0:c1 + 1].astype(np.float64).copy()
            ys = vys[r0:r1 + 1].astype(np.float64).copy()
            xs[0] -= OVER
            xs[-1] += OVER
            ys[0] -= OVER
            ys[-1] += OVER
            ntv = ty_ * tx_
            co = np.zeros((2, ty_, tx_, 3), dtype=np.float32)
            co[:, :, :, 0] = xs[None, None, :]
            co[:, :, :, 1] = ys[None, :, None]
            co[0, :, :, 2] = vmax[r0:r1 + 1, c0:c1 + 1]
            co[1, :, :, 2] = vmin[r0:r1 + 1, c0:c1 + 1]
            idx = np.arange(2 * ntv).reshape(2, ty_, tx_)
            T, Bo = idx[0], idx[1]
            faces = np.concatenate([
                np.stack([T[:-1, :-1], T[:-1, 1:], T[1:, 1:], T[1:, :-1]], -1).reshape(-1, 4),
                np.stack([Bo[:-1, :-1], Bo[1:, :-1], Bo[1:, 1:], Bo[:-1, 1:]], -1).reshape(-1, 4),
                np.stack([T[0, :-1], Bo[0, :-1], Bo[0, 1:], T[0, 1:]], -1),
                np.stack([T[-1, 1:], Bo[-1, 1:], Bo[-1, :-1], T[-1, :-1]], -1),
                np.stack([T[1:, 0], Bo[1:, 0], Bo[:-1, 0], T[:-1, 0]], -1),
                np.stack([T[:-1, -1], Bo[:-1, -1], Bo[1:, -1], T[1:, -1]], -1),
            ]).astype(np.int32)
            me = bpy.data.meshes.new(f"{prefix}_{r0}_{c0}")
            me.vertices.add(2 * ntv)
            me.vertices.foreach_set("co", co.reshape(-1))
            me.loops.add(faces.size)
            me.loops.foreach_set("vertex_index", faces.reshape(-1))
            me.polygons.add(len(faces))
            me.polygons.foreach_set("loop_start", (np.arange(len(faces)) * 4).astype(np.int32))
            me.polygons.foreach_set("loop_total", np.full(len(faces), 4, dtype=np.int32))
            me.update(calc_edges=True)
            me.validate()
            me.materials.append(material)
            ob = bpy.data.objects.new(f"{prefix}_{r0}_{c0}", me)
            scene.collection.objects.link(ob)
            objs.append(ob)
    return objs


VOL_TILES = 0
NEAR_HET = opt.get("cloud_near", "0") == "1"     # 近くを不均一な体積にする（重い。既定は無し＝どこも均一な板で、細かさは形で出す）
if not NEAR_HET:
    R_A, R_B = -1.0, 0.0
if CLOUDS == "volume":
    t0 = time.time()
    log("立体の雲を作る…")
    TILE_NEAR = 1280.0
    ox = round((CE - 10240.0) / TILE_NEAR) * TILE_NEAR
    oy = round((CN - 10240.0) / TILE_NEAR) * TILE_NEAR
    if NEAR_HET:
        img_n, top_n, wgt_n = bake_cloud_image("cloudtop_near", ox, oy, 2048, 2048, 10.0)
        mat_n = cloud_volume_material("cloud_near", img_n, ox, oy, 2048 * 10.0, float(opt.get("cloud_wisp_scale", "40")), 5.0, 45.0, 8.0)

        def in_cone(ce, cn, margin=0.0):
            d = math.hypot(ce - CE, cn - CN)
            if d < 1500.0:
                return True
            a = math.degrees(math.atan2(ce - CE, cn - CN))
            return abs((a - HEADING + 180.0) % 360.0 - 180.0) <= HALF_ANG + math.degrees(math.atan2(900.0, d)) + margin

        def acc_near(ce, cn):
            return math.hypot(ce - CE, cn - CN) <= R_B + 700.0 and in_cone(ce, cn)

        objs = make_volume_tiles("cn", top_n, wgt_n, ox, oy, 10.0, 8, TILE_NEAR, mat_n, acc_near)
        cloud_objs += objs
        VOL_TILES += len(objs)
        del top_n, wgt_n
    STATS.update(volume_tiles=VOL_TILES, volume_seconds=round(time.time() - t0, 1))
    log(f"近くの雲（不均一）タイル {VOL_TILES}・{time.time() - t0:.1f} 秒")
    # 均一な板（移り→中間→遠く。地平線まで同じ雲）。上面は同じ高さの場
    t0 = time.time()
    k = float(opt.get("slab_coarse", "1.0"))
    VEIL = float(opt.get("veil", "30"))               # 上面の薄い層（やわらかい頂）。体積の中の濃さ 30%
    VD = float(opt.get("veil_density", "0.3"))
    mat_ramp = cloud_slab_material("cloud_ramp", True)
    mat_flat = cloud_slab_material("cloud_slab", False)
    mat_vramp = cloud_slab_material("cloud_vramp", True, VD)
    mat_vflat = cloud_slab_material("cloud_veil", False, VD)
    CLOUD_RANGE = float(opt.get("cloud_range", "115000"))
    # 名前, 格子, 距離の範囲, 向き, 材質, ベール（上面の薄い層）の材質（None＝無し）
    # 四角の半幅（320m の倍数）で輪を分ける：4160・12480・28800・61440
    parts = ([("cs_ramp", 16.0 * k, 0.0, 4160.0, HALF_ANG, mat_ramp, mat_vramp)] if NEAR_HET else
             [("cs_n", 8.0 * k, 0.0, 4160.0, HALF_ANG, mat_flat, mat_vflat)]) + [("cs_a", 16.0 * k, 4160.0, 12480.0, HALF_ANG, mat_flat, mat_vflat)] + [
             ("cs_b", 32.0 * k, 12480.0, 28800.0, FAR_ANG, mat_flat, mat_vflat),
             ("cs_c", 64.0 * k, 28800.0, 61440.0, FAR_ANG, mat_flat, None),
             ("cs_d", 160.0 * k, 61440.0, CLOUD_RANGE, FAR_ANG, mat_flat, None)]
    SV = SF = 0
    for nm, s_, r0_, r1_, ang_, mt_, vt_ in parts:
        if opt.get("cloud_slab", "1") != "1":
            break
        if vt_ is not None and VEIL > 0:
            res = build_cloud_slab(nm, s_, r0_, r1_, ang_, mt_, 260.0 - VEIL, -VEIL)
            res2 = build_cloud_slab(nm + "v", s_, r0_, r1_, ang_, vt_, VEIL, 0.0)
        else:
            res = build_cloud_slab(nm, s_, r0_, r1_, ang_, mt_)
            res2 = None
        for rs in (res, res2):
            if rs:
                cloud_objs.append(rs[0])
                SV += rs[1]
                SF += rs[2]
        if res:
            log(f"  {nm}: 格子 {s_:g}m・頂点 {res[1]:,}・面 {res[2]:,}")
    STATS.update(slab_vertices=SV, slab_faces=SF, slab_seconds=round(time.time() - t0, 1))
    log(f"雲の板 頂点 {SV:,}・{time.time() - t0:.1f} 秒")

# ---------------------------------------------------------------- 空・太陽
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
AEROSOL = float(opt.get("aerosol", "0.2"))
for attr, val in (("altitude", min(max(CAM_Z_TRUE, 0.0), 59000.0)), ("air_density", float(opt.get("air_density", "1.0"))), ("aerosol_density", AEROSOL), ("dust_density", AEROSOL),
                  ("ozone_density", float(opt.get("ozone", "1.0"))), ("ground_albedo", float(opt.get("ground_albedo", "0.5")))):
    if hasattr(sky, attr):
        setattr(sky, attr, val)
if hasattr(sky, "sun_disc"):
    sky.sun_disc = True
bg = wn.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = float(opt.get("sky", "1.0"))
wo = wn.nodes.new("ShaderNodeOutputWorld")
wn.links.new(sky.outputs[0], bg.inputs[0])
wn.links.new(bg.outputs[0], wo.inputs["Surface"])

# ---------------------------------------------------------------- 空気（2 つの均一な層。どちらも地球の丸みに沿う板で、定数の体積なので軽い）
# ① きれいな空気：雲の上〜高さ 6km。青みのある散乱（赤ほど薄い）。② しめった層：雲の上面から 400m。下 200m が濃く、上 200m は半分
HAZE_N = []
if HAZE:
    t0 = time.time()
    hr = float(opt.get("haze_range", "170000"))
    cell_h = float(opt.get("haze_cell", "8000"))
    d1 = float(opt.get("haze_clear", "1.0e-5"))                 # 1/m（= 0.0115 /km）
    d2 = float(opt.get("haze_moist", "2.0e-5"))                  # 下 200m（0.03 /km）
    hc = (0.6, 0.78, 1.0, 1.0)
    mc = (0.97, 0.96, 1.0, 1.0)                                  # しめった層は中立（暖かさは太陽の光から）
    for nm, z0, z1, dd, col, gg in (("haze_clear", -800.0, float(opt.get("clear_top", "3600")), d1, hc, 0.35),
                                    ("haze_moist1", -800.0, CLOUD_TOP + 200.0, d2, mc, 0.75),
                                    ("haze_moist2", CLOUD_TOP + 200.0, CLOUD_TOP + 400.0, d2 * 0.5, mc, 0.75)):
        r_ = curved_slab(nm, z0, z1, hr, cell_h, haze_material(nm, dd, col, gg))
        HAZE_N.append(nm)
    STATS["haze_seconds"] = round(time.time() - t0, 1)

# ---------------------------------------------------------------- グレア（コンポジター）
if GLARE:
    try:
        scene.render.compositor_device = "CPU"          # GPU の文脈が無い機械（背景実行）でも動くように
        scene.render.use_compositing = True
        ng = bpy.data.node_groups.new("comp", "CompositorNodeTree")
        scene.compositing_node_group = ng
        rl = ng.nodes.new("CompositorNodeRLayers")
        gl = ng.nodes.new("CompositorNodeGlare")
        # 5.x では設定が入力の口になった。しきい値を高くして、太陽と雲の明るい縁だけが、やわらかくにじむように
        for key, val in (("Type", "Fog Glow"), ("Quality", "Medium"), ("Threshold", float(opt.get("glare_threshold", "6.0"))),
                         ("Smoothness", 0.6), ("Strength", float(opt.get("glare_strength", "0.3"))), ("Size", 0.7)):
            try:
                gl.inputs[key].default_value = val
            except (KeyError, TypeError, ValueError) as ex:  # noqa: BLE001
                log("グレアの設定が入らない:", key, ex)
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        go = ng.nodes.new("NodeGroupOutput")
        ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
        ng.links.new(gl.outputs["Image"], go.inputs[0])
        log("グレア: 使える")
    except Exception as ex:  # noqa: BLE001
        log("グレア: 使えなかった", ex)
        STATS["glare_error"] = str(ex)[:200]

# ---------------------------------------------------------------- 山の位置（地理の確かめ）
PEAKS = [("Akadake", 35.9708, 138.3700, 2899), ("Tateshina", 36.1036, 138.2950, 2531), ("Utsukushigahara", 36.2258, 138.1075, 2034),
         ("Kaikomagatake", 35.7581, 138.2367, 2967), ("Kitadake", 35.6744, 138.2389, 3193), ("Fuji", 35.3606, 138.7274, 3776)]


def project(p_world):
    d = np.asarray(p_world, dtype=np.float64) - CAM_W
    cx = M[:, 0] @ d
    cy = M[:, 1] @ d
    cz = M[:, 2] @ d
    depth = -cz
    f = LENS / 36.0 * W
    return W / 2 + cx / depth * f, H / 2 - cy / depth * f, depth


def marks():
    res = []
    sd = SUN_DIR * 1e6
    px, py, dep = project(CAM_W + sd)
    res.append({"name": "sun", "x": float(px), "y": float(py), "depth_km": None, "elev_deg": math.degrees(SUN_EL)})
    for nm, lat, lon, el in PEAKS:
        e, n = geo4.to_local(lon, lat)
        e, n = float(e), float(n)
        z = el - float(geo4.curvature_drop(e, n))
        px, py, dep = project([e, n, z])
        dh = math.hypot(e - CAM["pos"][0], n - CAM["pos"][1])
        res.append({"name": nm, "x": float(px), "y": float(py), "depth_km": round(dh / 1000.0, 1),
                    "elev_deg": round(math.degrees(math.atan2(z - CAM_W[2], dh)), 2)})
    return res


# ---------------------------------------------------------------- 追加の部品（木・白鳥など。別のファイルが持つ）
# extras=world_trees+swans4 のように書くと、そのファイルの add(world) を順に呼ぶ。
# world はこのファイルそのもの（ground・CE・CN・CAM・CAM_W・DATA・FRAME・W・H・SUN_DIR・opt・log・STATS・scene・cam などが使える）。
# この呼び出しと、上の名前は変えない（world_trees.py・swans4.py が頼っている）。
for _name in [x for x in opt.get("extras", "").split("+") if x]:
    _t0 = time.time()
    importlib.import_module(_name).add(sys.modules[__name__])
    STATS[f"extra_{_name}_seconds"] = round(time.time() - _t0, 1)
    log(f"追加の部品 {_name}・{time.time() - _t0:.1f} 秒")

# ---------------------------------------------------------------- 描く
STATS["build_seconds"] = round(time.time() - T_START, 1)
STATS["peak_mb_before_render"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0)
log(f"組み立て {STATS['build_seconds']} 秒・メモリ {STATS['peak_mb_before_render']} MB")
t0 = time.time()
bpy.ops.render.render()
STATS["render_seconds"] = round(time.time() - t0, 1)
png = os.path.join(OUT, f"frame_{FRAME:04d}.png")
bpy.data.images["Render Result"].save_render(png)
if EXR:
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    bpy.data.images["Render Result"].save_render(os.path.join(OUT, f"frame_{FRAME:04d}.exr"))
STATS["peak_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0)
if opt.get("marks", "0") == "1":
    mk = marks()
    json.dump(mk, open(os.path.join(OUT, f"frame_{FRAME:04d}_marks.json"), "w"), indent=1)
    try:
        from PIL import Image, ImageDraw
        im = Image.open(png).convert("RGB")
        dr = ImageDraw.Draw(im)
        for m_ in mk:
            x, y = m_["x"], m_["y"]
            if -50 < x < W + 50 and -50 < y < H + 50:
                dr.ellipse([x - 7, y - 7, x + 7, y + 7], outline=(255, 40, 40), width=2)
                dr.line([x - 12, y, x + 12, y], fill=(255, 40, 40))
                dr.line([x, y - 12, x, y + 12], fill=(255, 40, 40))
                dr.text((x + 10, y + 6), m_["name"], fill=(255, 255, 0))
        im.save(os.path.join(OUT, f"frame_{FRAME:04d}_geo.png"))
    except ImportError:
        pass
json.dump(STATS, open(os.path.join(OUT, f"frame_{FRAME:04d}_stats.json"), "w"), indent=1)
log("完了", json.dumps(STATS, ensure_ascii=False))
