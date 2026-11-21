"""PC のオープニング第3版の場面（上高地・梓川の谷と穂高）を Blender に組んで描く。

  python scene3.py --look 1 [--res 1920x1080] [--spp 64] [--out 見本.png]   # 見た目の確認の静止画（カメラは LOOKS）

python は bpy（Blender 5.3）を入れたもの。材料は data.py（地形・写真）・landcover.py（土地の種類と木の位置）・
assets.py（Poly Haven の CC0 の木・岩・質感・空）。地形は本当の高さ（強調しない）。

- 地形：near（5m の標高）・valley（10m）・far（約 76m。地球の丸みで下げる）。近い所ほど細かい。valley は near の下に少し沈める
- 地面：土地の種類（水・川原の石・草地・森の地面・岩・雪）を landcover.py の絵で混ぜる。質感は Poly Haven の写真から
- 森：写真から作られたモミの木（3本 × 細かさ 3 段）を、森の所に一本ずつ植える（金色のカラマツは同じ木の針葉の色を変えたもの）。
  カメラに近い木ほど細かい形
- 空と光：朝の空（Poly Haven の HDRI）と、低い朝日（太陽の光源）
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
sys.path.insert(0, os.path.join(HERE, "..", "pc-opening"))

import geo3  # noqa: E402

WORK = os.environ.get("PC_OPENING3_WORK", os.path.join(HERE, "work"))
ASSETS = os.path.join(WORK, "assets")

# 朝日（方位は北 0°・東 90°）。日の出から少したった、低い光
SUN = dict(az=110.0, el=23.0, energy=6.5, color=(1.0, 0.84, 0.66))
# 空：HDRI と、その回し方（HDRI の太陽を、SUN の方位に合わせる）・明るさ
SKY = dict(name="kloppenheim_06_puresky", sun_az_in_hdri=None, strength=1.2)

# 木を一本ずつ植える距離（m）。その先の森は、地面の色と凹凸で（ground_material の canopy）
TREE_RADIUS = 2800.0

# 見た目の確認のカメラ：位置（経度・緯度・川面からの高さ m）・向き（方位・見下ろす角）・レンズ（mm）
LOOKS = {
    1: dict(lon=137.6202, lat=36.2334, agl=7.0, az=5.0, pitch=-2.0, lens=24.0),
}


# ---------------------------------------------------------------- 地形

def load_dem(name: str) -> tuple[np.ndarray, dict]:
    h = np.load(os.path.join(WORK, "terrain", f"{name}.npy"))
    with open(os.path.join(WORK, "terrain", f"{name}.json")) as f:
        return h, json.load(f)


def grid_mesh(name: str, X, Y, Z, mat, uv=None, mask=None, skirt: float = 0.0) -> bpy.types.Object:
    """格子（行は北→南）から地面のメッシュ（面は上向き）"""
    H, W = Z.shape
    XX = np.broadcast_to(X[None, :], (H, W))
    YY = np.broadcast_to(Y[:, None], (H, W))
    co = np.stack([XX, YY, Z], -1).reshape(-1, 3).astype(np.float32)
    ii, jj = np.meshgrid(np.arange(H - 1), np.arange(W - 1), indexing="ij")
    v0 = ii * W + jj
    quads = np.stack([v0, v0 + W, v0 + W + 1, v0 + 1], -1)
    if mask is not None:
        quads = quads[mask[:-1, :-1]]
    quads = quads.reshape(-1, 4)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co))
    me.vertices.foreach_set("co", co.ravel())
    nf = len(quads)
    me.loops.add(nf * 4)
    me.loops.foreach_set("vertex_index", quads.astype(np.int32).ravel())
    me.polygons.add(nf)
    me.polygons.foreach_set("loop_start", (np.arange(nf) * 4).astype(np.int32))
    me.update(calc_edges=True)
    me.polygons.foreach_set("use_smooth", np.ones(nf, dtype=bool))
    if uv is not None:
        U, V = uv
        UU = np.broadcast_to(U[None, :], (H, W)).ravel()
        VV = np.broadcast_to(V[:, None], (H, W)).ravel()
        uvs = np.stack([UU, VV], -1).astype(np.float32)
        layer = me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", uvs[quads.ravel()].ravel())
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_terrain(mats: dict) -> dict:
    near, nm = load_dem("near_carved" if os.path.exists(os.path.join(WORK, "terrain", "near_carved.npy")) else "near")
    valley, vm = load_dem("valley")
    far, fm = load_dem("far")
    # near：全体は 2 つおき（約 7.7m）。川のまわりだけ、そのまま（約 3.85m）の細かさ（描く前の形の索引づくりで、メモリが
    # 一時に大きくなるので、細かい所を絞る）。細かい所は粗い所の穴にはめ、境目のすき間は下へ垂らした帯でふさぐ
    x, y = geo3.grid_xy(nm, near.shape)
    nb = (x.min(), x.max(), y.min(), y.max())
    Z = near - geo3.curvature_drop(x[None, :], y[:, None])
    U = (np.arange(near.shape[1]) + 0.5) / near.shape[1]
    V = 1.0 - (np.arange(near.shape[0]) + 0.5) / near.shape[0]
    hi = river_mask(x, y)  # 細かくする所（粗い格子の升ごと）
    s2 = 2
    Zl = Z[::s2, ::s2]
    hole = hi[: Zl.shape[0] - 1, : Zl.shape[1] - 1]
    grid_mesh("near", x[::s2], y[::s2], Zl.astype(np.float32), mats["near"], uv=(U[::s2], V[::s2]), mask=np.pad(~hole, ((0, 1), (0, 1))))
    near_skirt(x[::s2], y[::s2], Zl, mats["near"])
    # 細かい所：粗い升 1 つ = 細かい升 2×2
    fine = np.kron(hole, np.ones((s2, s2), bool))
    fine = np.pad(fine, ((0, Z.shape[0] - 1 - fine.shape[0]), (0, Z.shape[1] - 1 - fine.shape[1])))
    ob = grid_mesh("near_hi", x, y, Z.astype(np.float32), mats["near"], uv=(U, V), mask=np.pad(fine, ((0, 1), (0, 1))))
    hi_skirt(ob, fine, x, y, Z, mats["near"])
    # valley：3 つおき（約 23m）。near のある所は切り抜く（10m と 5m の標高は数 m ずれるので、重ねると粗い方が上に出る）。
    # 切り口のすき間は、near の縁から下へ垂らした帯（near_skirt）でふさぐ
    s = 3
    vh = valley[::s, ::s]
    x, y = geo3.grid_xy(vm, valley.shape, s)
    XX, YY = np.meshgrid(x, y)
    inside = np.minimum.reduce([XX - nb[0], nb[1] - XX, YY - nb[2], nb[3] - YY])
    Z = vh - geo3.curvature_drop(XX, YY)
    U = (np.arange(0, valley.shape[1], s) + 0.5) / valley.shape[1]
    V = 1.0 - (np.arange(0, valley.shape[0], s) + 0.5) / valley.shape[0]
    keep = ~(inside[:-1, :-1] > 10.0)
    keep = np.pad(keep, ((0, 1), (0, 1)))
    grid_mesh("valley", x, y, Z.astype(np.float32), mats["valley"], uv=(U, V), mask=keep)
    # far：valley の外だけ（4 つおき。約 300m）
    f = 4
    far = far[::f, ::f]
    x, y = geo3.grid_xy(fm, (far.shape[0] * f, far.shape[1] * f), f)
    vx, vy = geo3.grid_xy(vm, valley.shape)
    XX, YY = np.meshgrid(x, y)
    keep = ~((XX > vx.min() + 600) & (XX < vx.max() - 600) & (YY > vy.min() + 600) & (YY < vy.max() - 600))
    Z = far - geo3.curvature_drop(XX, YY) - 6.0
    grid_mesh("far", x, y, Z.astype(np.float32), mats["far"], mask=keep)
    return dict(near=(near, nm), valley=(valley, vm), near_box=nb)


def water_material() -> bpy.types.Material:
    """水面：澄んだ水（透ける・空と森を映す）。さざ波は流れの向き（点の属性 fx・fy）に沿って下流へ流れ、浅い瀬（属性 wdepth）
    ほど強く、白い波（泡）が立つ"""
    mat = bpy.data.materials.new("water")
    nt = mat.node_tree
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial", (1400, 0))
    b = node(nt, "ShaderNodeBsdfPrincipled", (900, 200))
    b.inputs["Base Color"].default_value = (0.92, 0.98, 0.97, 1.0)
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.015
    b.inputs["IOR"].default_value = 1.333
    foam_b = node(nt, "ShaderNodeBsdfPrincipled", (900, -300))
    foam_b.inputs["Base Color"].default_value = (0.82, 0.86, 0.86, 1.0)
    foam_b.inputs["Roughness"].default_value = 0.55
    mixs = node(nt, "ShaderNodeMixShader", (1200, 0))
    link(nt, b.outputs["BSDF"], mixs.inputs[1])
    link(nt, foam_b.outputs["BSDF"], mixs.inputs[2])
    link(nt, mixs.outputs["Shader"], out.inputs["Surface"])
    geo = node(nt, "ShaderNodeNewGeometry", (-1400, 0))
    sep = node(nt, "ShaderNodeSeparateXYZ", (-1200, 0))
    link(nt, geo.outputs["Position"], sep.inputs["Vector"])

    def att(name, y):
        n = node(nt, "ShaderNodeAttribute", (-1200, y))
        n.attribute_type = "GEOMETRY"
        n.attribute_name = name
        return n.outputs["Fac"]

    fx, fy, dep = att("fx", -300), att("fy", -450), att("wdepth", -600)

    def m(op, a_, b_=None, v=None, y=0):
        n = node(nt, "ShaderNodeMath", (-900, y), operation=op)
        link(nt, a_, n.inputs[0])
        if b_ is not None:
            link(nt, b_, n.inputs[1])
        elif v is not None:
            n.inputs[1].default_value = v
        return n.outputs[0]

    # 流れに沿った座標：u（下流へ）・v（横）
    u = m("ADD", m("MULTIPLY", sep.outputs["X"], fx, y=100), m("MULTIPLY", sep.outputs["Y"], fy, y=0), y=50)
    v = m("SUBTRACT", m("MULTIPLY", sep.outputs["Y"], fx, y=-100), m("MULTIPLY", sep.outputs["X"], fy, y=-200), y=-150)
    # 時間とともに下流へ（1 秒に約 1.4m）：u から引く
    tval = node(nt, "ShaderNodeValue", (-1200, 300))
    tval.name = "time"
    tval.outputs[0].default_value = 0.0
    tval.outputs[0].keyframe_insert("default_value", frame=0)
    tval.outputs[0].default_value = 30.0
    tval.outputs[0].keyframe_insert("default_value", frame=30 * 24)
    u_t = m("SUBTRACT", u, m("MULTIPLY", tval.outputs[0], v=1.4, y=300), y=200)
    co1 = node(nt, "ShaderNodeCombineXYZ", (-600, 100))
    link(nt, m("MULTIPLY", u_t, v=0.55, y=150), co1.inputs["X"])
    link(nt, m("MULTIPLY", v, v=1.8, y=0), co1.inputs["Y"])
    co2 = node(nt, "ShaderNodeCombineXYZ", (-600, -200))
    link(nt, m("MULTIPLY", u_t, v=2.2, y=-250), co2.inputs["X"])
    link(nt, m("MULTIPLY", v, v=0.9, y=-350), co2.inputs["Y"])
    n1 = node(nt, "ShaderNodeTexNoise", (-400, 100), Scale=0.8, Detail=8.0, Roughness=0.6)
    n2 = node(nt, "ShaderNodeTexNoise", (-400, -200), Scale=1.6, Detail=5.0, Roughness=0.55)
    link(nt, co1.outputs["Vector"], n1.inputs["Vector"])
    link(nt, co2.outputs["Vector"], n2.inputs["Vector"])
    h = m("MULTIPLY_ADD", n2.outputs["Fac"], v=None, y=-50)
    h.node.inputs[1].default_value = 0.45
    link(nt, n1.outputs["Fac"], h.node.inputs[2])
    # 浅い瀬：水深 0.25m で 0、0m で 1
    shallow = node(nt, "ShaderNodeMapRange", (-600, -600), **{"From Min": 0.28, "From Max": 0.04})
    link(nt, dep, shallow.inputs["Value"])
    strength = m("MULTIPLY_ADD", shallow.outputs["Result"], v=None, y=-700)
    strength.node.inputs[1].default_value = 0.9
    strength.node.inputs[2].default_value = 0.28
    bump = node(nt, "ShaderNodeBump", (600, -100), Distance=0.05)
    link(nt, strength, bump.inputs["Strength"])
    link(nt, h, bump.inputs["Height"])
    link(nt, bump.outputs["Normal"], b.inputs["Normal"])
    link(nt, bump.outputs["Normal"], foam_b.inputs["Normal"])
    # 白い波：浅い所の、流れに沿った筋（細かい模様のしきい値）
    fn = node(nt, "ShaderNodeTexNoise", (-400, -900), Scale=2.6, Detail=6.0, Roughness=0.65)
    co3 = node(nt, "ShaderNodeCombineXYZ", (-600, -900))
    link(nt, m("MULTIPLY", u_t, v=0.7, y=-850), co3.inputs["X"])
    link(nt, m("MULTIPLY", v, v=2.6, y=-950), co3.inputs["Y"])
    link(nt, co3.outputs["Vector"], fn.inputs["Vector"])
    fr = node(nt, "ShaderNodeMapRange", (-200, -900), **{"From Min": 0.56, "From Max": 0.70})
    link(nt, fn.outputs["Fac"], fr.inputs["Value"])
    foam = m("MULTIPLY", fr.outputs["Result"], shallow.outputs["Result"], y=-800)
    foam = m("MULTIPLY", foam, v=0.85, y=-750)
    link(nt, foam, mixs.inputs["Fac"])
    if nt.animation_data and nt.animation_data.action:
        for fc in getattr(nt.animation_data.action, "fcurves", []):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    return mat


def build_water(nm: dict) -> None:
    f = os.path.join(WORK, "terrain", "water_level.npy")
    if not os.path.exists(f):
        return
    lv = np.load(f)
    ok = ~np.isnan(lv)
    rows = np.where(ok.any(1))[0]
    cols = np.where(ok.any(0))[0]
    r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
    sub = lv[r0:r1, c0:c1]
    okk = ~np.isnan(sub)
    face = okk[:-1, :-1] & okk[1:, :-1] & okk[:-1, 1:] & okk[1:, 1:]
    x, y = geo3.grid_xy(nm, lv.shape)
    x, y = x[c0:c1], y[r0:r1]
    Z = np.nan_to_num(sub, nan=0.0) - geo3.curvature_drop(x[None, :], y[:, None])
    ob = grid_mesh("water_surface", x, y, Z.astype(np.float32), water_material(), mask=np.pad(face, ((0, 1), (0, 1))))
    # 点ごとの水深と流れの向き（瀬の白い波・流れに沿ったさざ波）
    fd = os.path.join(WORK, "terrain", "water_depth.npy")
    ff = os.path.join(WORK, "terrain", "water_flow.npy")
    if os.path.exists(fd) and os.path.exists(ff):
        dep = np.load(fd)[r0:r1, c0:c1].astype(np.float32).ravel()
        flow = np.load(ff)[r0:r1, c0:c1].astype(np.float32).reshape(-1, 2)
        me = ob.data
        for name, val in (("wdepth", dep), ("fx", flow[:, 0]), ("fy", flow[:, 1])):
            a = me.attributes.new(name, "FLOAT", "POINT")
            a.data.foreach_set("value", np.ascontiguousarray(val))


RIVER_HI = 420.0  # 川の真ん中の線から、細かい地形にする幅（m）


def river_mask(x, y) -> np.ndarray:
    """粗い格子（2 つおき）の升ごとに、川の真ん中の線から RIVER_HI m の中か"""
    import river

    line = np.array([geo3.local(*c) for c in river.CENTER], np.float64)
    xs, ys = x[::2], y[::2]
    XX, YY = np.meshgrid((xs[:-1] + xs[1:]) / 2, (ys[:-1] + ys[1:]) / 2)
    d = np.full(XX.shape, np.inf)
    seg = np.diff(line, axis=0)
    for a, ab in zip(line[:-1], seg):
        L2 = float(ab @ ab)
        t = np.clip(((XX - a[0]) * ab[0] + (YY - a[1]) * ab[1]) / L2, 0, 1)
        d = np.minimum(d, np.hypot(XX - a[0] - t * ab[0], YY - a[1] - t * ab[1]))
    return d < RIVER_HI


def hi_skirt(ob, fine: np.ndarray, x, y, Z, mat, depth: float = 3.0) -> None:
    """細かい地形の縁（細かい升の並びの外周）から下へ垂らす帯（粗い地形との境目のすき間をふさぐ）"""
    H, W = fine.shape
    pad = np.pad(fine, 1)
    edges = []
    # 升 (i, j) の 4 辺のうち、となりが細かい升でない辺
    for di, dj, a, b in ((-1, 0, (0, 0), (0, 1)), (1, 0, (1, 1), (1, 0)), (0, -1, (1, 0), (0, 0)), (0, 1, (0, 1), (1, 1))):
        nb = pad[1 + di : 1 + di + H, 1 + dj : 1 + dj + W]
        ii, jj = np.where(fine & ~nb)
        for i, j in zip(ii, jj):
            edges.append(((i + a[0], j + a[1]), (i + b[0], j + b[1])))
    if not edges:
        return
    co = []
    faces = []
    for (i0, j0), (i1, j1) in edges:
        k = len(co)
        co += [(x[j0], y[i0], Z[i0, j0]), (x[j1], y[i1], Z[i1, j1]), (x[j1], y[i1], Z[i1, j1] - depth), (x[j0], y[i0], Z[i0, j0] - depth)]
        faces.append((k, k + 1, k + 2, k + 3))
    me = bpy.data.meshes.new("near_hi_skirt")
    me.from_pydata(co, [], faces)
    me.materials.append(mat)
    o = bpy.data.objects.new("near_hi_skirt", me)
    bpy.context.scene.collection.objects.link(o)


def near_skirt(x, y, Z, mat, depth: float = 80.0) -> None:
    """near の縁から下へ垂らした帯（valley の切り口とのすき間をふさぐ）"""
    H, W = Z.shape
    ring = [(0, j) for j in range(W)] + [(i, W - 1) for i in range(1, H)] + [(H - 1, j) for j in range(W - 2, -1, -1)] + [(i, 0) for i in range(H - 2, 0, -1)]
    top = np.array([(x[j], y[i], Z[i, j]) for i, j in ring], np.float32)
    bot = top.copy()
    bot[:, 2] -= depth
    co = np.concatenate([top, bot])
    n = len(top)
    k = np.arange(n)
    quads = np.stack([k, (k + 1) % n, n + (k + 1) % n, n + k], -1)
    me = bpy.data.meshes.new("near_skirt")
    me.from_pydata(co.tolist(), [], quads.tolist())
    me.materials.append(mat)
    ob = bpy.data.objects.new("near_skirt", me)
    bpy.context.scene.collection.objects.link(ob)


def ground_height(x, y, near, nm, valley, vm):
    """場面の座標の地面の高さ（near の中は near、外は valley）"""
    hn = geo3.sample(near, nm, x, y)
    hv = geo3.sample(valley, vm, x, y)
    nx, ny = geo3.grid_xy(nm, near.shape)
    inside = (x > nx.min()) & (x < nx.max()) & (y > ny.min()) & (y < ny.max())
    return np.where(inside, hn, hv) - geo3.curvature_drop(x, y)


# ---------------------------------------------------------------- 材料

def node(nt, kind, loc=(0, 0), **inputs):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def link(nt, a, b):
    nt.links.new(a, b)


def image(path: str, data: bool = False) -> bpy.types.Image:
    im = bpy.data.images.load(path, check_existing=True)
    if data:
        im.colorspace_settings.name = "Non-Color"
    return im


def tex_set(name: str) -> dict:
    """Poly Haven の質感の絵（色・法線・粗さ・高さ）"""
    d = os.path.join(ASSETS, "textures", name)
    out = {}
    for f in os.listdir(d):
        low = f.lower()
        if "_diff_" in low or "diffuse" in low:
            out["diff"] = os.path.join(d, f)
        elif "_nor_gl_" in low:
            out["nor"] = os.path.join(d, f)
        elif "_rough_" in low:
            out["rough"] = os.path.join(d, f)
        elif "_disp_" in low:
            out["disp"] = os.path.join(d, f)
    return out


def surface(nt, name: str, vec, scale_m: float, x: float, y: float, tint=None):
    """質感1つ（色・粗さ・法線）を、位置（m）から読む。返すのは（色, 粗さ, 法線, 高さ）の出口"""
    t = tex_set(name)
    mp = node(nt, "ShaderNodeMapping", (x - 400, y), )
    mp.inputs["Scale"].default_value = (1.0 / scale_m, 1.0 / scale_m, 1.0 / scale_m)
    link(nt, vec, mp.inputs["Vector"])
    col = node(nt, "ShaderNodeTexImage", (x - 200, y))
    col.image = image(t["diff"])
    link(nt, mp.outputs["Vector"], col.inputs["Vector"])
    out_col = col.outputs["Color"]
    if tint is not None:
        hsv = node(nt, "ShaderNodeHueSaturation", (x, y), Hue=tint[0], Saturation=tint[1], Value=tint[2])
        link(nt, out_col, hsv.inputs["Color"])
        out_col = hsv.outputs["Color"]
    rough = None
    if "rough" in t:
        r = node(nt, "ShaderNodeTexImage", (x - 200, y - 260))
        r.image = image(t["rough"], True)
        link(nt, mp.outputs["Vector"], r.inputs["Vector"])
        rough = r.outputs["Color"]
    nor = None
    if "nor" in t:
        n = node(nt, "ShaderNodeTexImage", (x - 200, y - 520))
        n.image = image(t["nor"], True)
        link(nt, mp.outputs["Vector"], n.inputs["Vector"])
        nor = n.outputs["Color"]
    disp = None
    if "disp" in t:
        d = node(nt, "ShaderNodeTexImage", (x - 200, y - 780))
        d.image = image(t["disp"], True)
        link(nt, mp.outputs["Vector"], d.inputs["Vector"])
        disp = d.outputs["Color"]
    return out_col, rough, nor, disp


def mix(nt, fac, a, b, loc=(0, 0), kind="RGBA"):
    m = node(nt, "ShaderNodeMix", loc)
    m.data_type = kind
    link(nt, fac, m.inputs["Factor"])
    if kind == "RGBA":
        link(nt, a, m.inputs[6])
        link(nt, b, m.inputs[7])
        return m.outputs[2]
    if kind == "VECTOR":
        link(nt, a, m.inputs[4])
        link(nt, b, m.inputs[5])
        return m.outputs[1]
    link(nt, a, m.inputs[2])
    link(nt, b, m.inputs[3])
    return m.outputs[0]


def ground_material(name: str, cover: str | None) -> bpy.types.Material:
    """地面：土地の種類の絵（cover：R=水・G=川原の石・B=草地・A=森）で質感を混ぜる。cover が無い所（遠く）は写真の色"""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial", (1600, 0))
    b = node(nt, "ShaderNodeBsdfPrincipled", (1200, 0))
    link(nt, b.outputs["BSDF"], out.inputs["Surface"])
    geo = node(nt, "ShaderNodeNewGeometry", (-1400, 0))
    sep = node(nt, "ShaderNodeSeparateXYZ", (-1200, 300))
    link(nt, geo.outputs["Position"], sep.inputs["Vector"])
    pos = geo.outputs["Position"]
    uv = node(nt, "ShaderNodeUVMap", (-1400, -300), uv_map="UVMap")
    # 斜面（法線の上向きの成分）
    nsep = node(nt, "ShaderNodeSeparateXYZ", (-1200, 0))
    link(nt, geo.outputs["Normal"], nsep.inputs["Vector"])
    steep = node(nt, "ShaderNodeMapRange", (-1000, 0), **{"From Min": 0.86, "From Max": 0.70})
    link(nt, nsep.outputs["Z"], steep.inputs["Value"])

    peb_c, peb_r, peb_n, _ = surface(nt, "ganges_river_pebbles", pos, 3.2, -600, 2600)
    fin_c, fin_r, fin_n, _ = surface(nt, "river_small_rocks", pos, 1.6, -600, 1600)
    pm = node(nt, "ShaderNodeTexNoise", (-900, 2000), Scale=0.035, Detail=4.0, Roughness=0.6)
    link(nt, pos, pm.inputs["Vector"])
    pmr = node(nt, "ShaderNodeMapRange", (-700, 2000), **{"From Min": 0.40, "From Max": 0.62})
    link(nt, pm.outputs["Fac"], pmr.inputs["Value"])
    gravel_c = mix(nt, pmr.outputs["Result"], peb_c, fin_c, (-300, 2000))
    # 石の色むら（数 m の広さで明るさ 0.8〜1.2）
    cv = node(nt, "ShaderNodeTexNoise", (-900, 2300), Scale=0.18, Detail=3.0)
    link(nt, pos, cv.inputs["Vector"])
    cvr = node(nt, "ShaderNodeMapRange", (-700, 2300), **{"To Min": 0.78, "To Max": 1.22})
    link(nt, cv.outputs["Fac"], cvr.inputs["Value"])
    cvc = node(nt, "ShaderNodeCombineColor", (-500, 2300))
    for i in range(3):
        link(nt, cvr.outputs["Result"], cvc.inputs[i])
    gv = node(nt, "ShaderNodeMix", (-300, 2300))
    gv.data_type = "RGBA"
    gv.blend_type = "MULTIPLY"
    gv.inputs["Factor"].default_value = 1.0
    link(nt, gravel_c, gv.inputs[6])
    link(nt, cvc.outputs["Color"], gv.inputs[7])
    # 砂のまだら（流れが運んだ細かい砂。明るい灰褐色で、なめらか）
    sd = node(nt, "ShaderNodeTexNoise", (-900, 2500), Scale=0.05, Detail=5.0, Roughness=0.65)
    link(nt, pos, sd.inputs["Vector"])
    sdr = node(nt, "ShaderNodeMapRange", (-700, 2500), **{"From Min": 0.56, "From Max": 0.66})
    link(nt, sd.outputs["Fac"], sdr.inputs["Value"])
    sand = node(nt, "ShaderNodeRGB", (-500, 2600))
    sand.outputs[0].default_value = (0.30, 0.27, 0.22, 1.0)
    gravel_c = mix(nt, sdr.outputs["Result"], gv.outputs[2], sand.outputs[0], (-100, 2300))
    gravel_r = mix(nt, pmr.outputs["Result"], peb_r, fin_r, (-300, 1800), kind="FLOAT")
    gravel_n = mix(nt, pmr.outputs["Result"], peb_n, fin_n, (-300, 1600))
    forest_c, forest_r, forest_n, _ = surface(nt, "forest_leaves_02", pos, 3.0, -600, 800, tint=(0.47, 1.1, 0.8))
    grass_c, grass_r, grass_n, _ = surface(nt, "aerial_grass_rock", pos, 14.0, -600, 0, tint=(0.46, 0.75, 1.05))
    rock_c, rock_r, rock_n, _ = surface(nt, "rock_face_03", pos, 9.0, -600, -800, tint=(0.5, 0.35, 0.62))  # 花崗岩の灰色（白く光りすぎない）

    if cover:
        ct = node(nt, "ShaderNodeTexImage", (-1000, 600))
        ct.image = image(cover, True)
        ct.image.alpha_mode = "CHANNEL_PACKED"  # 透明度は森の割合（色に掛けない）
        ct.interpolation = "Cubic"
        ct.extension = "EXTEND"
        link(nt, uv.outputs["UV"], ct.inputs["Vector"])
        cs = node(nt, "ShaderNodeSeparateColor", (-800, 600))
        link(nt, ct.outputs["Color"], cs.inputs["Color"])
        water, gravel, rockc = cs.outputs[0], cs.outputs[1], cs.outputs[2]
        forest = ct.outputs["Alpha"]
    # 遠くの森（木を植えない所）：森の上から見た色（モミの暗い緑とカラマツの金）。木の冠の丸みの凹凸
    camd = node(nt, "ShaderNodeCameraData", (-1400, 1600))
    far_f = node(nt, "ShaderNodeMapRange", (-1200, 1600), **{"From Min": TREE_RADIUS - 500.0, "From Max": TREE_RADIUS})
    link(nt, camd.outputs["View Distance"], far_f.inputs["Value"])
    crown = node(nt, "ShaderNodeTexVoronoi", (-1000, 1900), Scale=0.22)
    link(nt, pos, crown.inputs["Vector"])
    patch = node(nt, "ShaderNodeTexNoise", (-1000, 2200), Scale=0.012, Detail=3.0)
    link(nt, pos, patch.inputs["Vector"])
    larch_amt = node(nt, "ShaderNodeMapRange", (-800, 2200), **{"From Min": 0.45, "From Max": 0.62})
    link(nt, patch.outputs["Fac"], larch_amt.inputs["Value"])
    hi = node(nt, "ShaderNodeMapRange", (-800, 2500), **{"From Min": 1650.0, "From Max": 2050.0, "To Min": 1.0, "To Max": 0.15})
    link(nt, sep.outputs["Z"], hi.inputs["Value"])
    lm = node(nt, "ShaderNodeMath", (-600, 2300), operation="MULTIPLY")
    link(nt, larch_amt.outputs["Result"], lm.inputs[0])
    link(nt, hi.outputs["Result"], lm.inputs[1])
    fir_col = node(nt, "ShaderNodeRGB", (-800, 1800))
    fir_col.outputs[0].default_value = (0.020, 0.034, 0.022, 1.0)
    lar_col = node(nt, "ShaderNodeRGB", (-800, 1700))
    lar_col.outputs[0].default_value = (0.20, 0.105, 0.025, 1.0)
    can = mix(nt, lm.outputs[0], fir_col.outputs[0], lar_col.outputs[0], (-400, 1900))
    # 中腹の紅葉（ナナカマドの赤・ダケカンバの黄）：標高 1900〜2400m に、まだらに
    band = node(nt, "ShaderNodeMapRange", (-800, 2700), **{"From Min": 1850.0, "From Max": 2050.0})
    link(nt, sep.outputs["Z"], band.inputs["Value"])
    band2 = node(nt, "ShaderNodeMapRange", (-800, 2850), **{"From Min": 2450.0, "From Max": 2300.0})
    link(nt, sep.outputs["Z"], band2.inputs["Value"])
    bm_ = node(nt, "ShaderNodeMath", (-600, 2750), operation="MULTIPLY")
    link(nt, band.outputs["Result"], bm_.inputs[0])
    link(nt, band2.outputs["Result"], bm_.inputs[1])
    rn = node(nt, "ShaderNodeTexNoise", (-800, 3000), Scale=0.02, Detail=4.0)
    link(nt, pos, rn.inputs["Vector"])
    rr_ = node(nt, "ShaderNodeMapRange", (-600, 3000), **{"From Min": 0.48, "From Max": 0.66, "To Max": 0.75})
    link(nt, rn.outputs["Fac"], rr_.inputs["Value"])
    red_amt = node(nt, "ShaderNodeMath", (-400, 2800), operation="MULTIPLY")
    link(nt, bm_.outputs[0], red_amt.inputs[0])
    link(nt, rr_.outputs["Result"], red_amt.inputs[1])
    red_col = node(nt, "ShaderNodeRGB", (-600, 2600))
    red_col.outputs[0].default_value = (0.15, 0.050, 0.018, 1.0)  # 遠くから見た紅葉（赤い葉と針葉樹の混じり。くすんだ橙）
    can = mix(nt, red_amt.outputs[0], can, red_col.outputs[0], (-300, 2400))
    shade = node(nt, "ShaderNodeMapRange", (-600, 1950), **{"From Min": 0.0, "From Max": 1.0, "To Min": 1.25, "To Max": 0.55})
    link(nt, crown.outputs["Distance"], shade.inputs["Value"])
    can2 = node(nt, "ShaderNodeMix", (-200, 1900))
    can2.data_type = "RGBA"
    can2.blend_type = "MULTIPLY"
    can2.inputs["Factor"].default_value = 1.0
    link(nt, can, can2.inputs[6])
    cg = node(nt, "ShaderNodeCombineColor", (-400, 2050))
    for i in range(3):
        link(nt, shade.outputs["Result"], cg.inputs[i])
    link(nt, cg.outputs["Color"], can2.inputs[7])
    canopy_c = can2.outputs[2]
    # 森かどうか：near は土地の種類の森、valley・far は高さ（森林限界より下）と斜面
    if cover:
        forest_mask = forest
    else:
        under = node(nt, "ShaderNodeMapRange", (-1200, 1300), **{"From Min": 2500.0, "From Max": 2400.0})
        link(nt, sep.outputs["Z"], under.inputs["Value"])
        flat = node(nt, "ShaderNodeMapRange", (-1200, 1100), **{"From Min": 0.60, "From Max": 0.70})
        link(nt, nsep.outputs["Z"], flat.inputs["Value"])
        fm = node(nt, "ShaderNodeMath", (-1000, 1200), operation="MULTIPLY")
        link(nt, under.outputs["Result"], fm.inputs[0])
        link(nt, flat.outputs["Result"], fm.inputs[1])
        forest_mask = fm.outputs[0]
    cf = node(nt, "ShaderNodeMath", (-800, 1400), operation="MULTIPLY")
    link(nt, forest_mask, cf.inputs[0])
    link(nt, far_f.outputs["Result"], cf.inputs[1])
    canopy_f = cf.outputs[0]

    # 色：森の地面 → 川原 → 岩（急な所・土地の種類の岩）
    rockf = steep.outputs["Result"]
    if cover:
        mx = node(nt, "ShaderNodeMath", (-800, 200), operation="MAXIMUM")
        link(nt, steep.outputs["Result"], mx.inputs[0])
        link(nt, rockc, mx.inputs[1])
        rockf = mx.outputs[0]
        c = mix(nt, gravel, forest_c, gravel_c, (400, 600))
    else:
        c = grass_c
    c = mix(nt, rockf, c, rock_c, (600, 600))
    c = mix(nt, canopy_f, c, canopy_c, (700, 700))
    # 頂の初雪（標高 2700m より上の、なだらかな所に。まだら）
    sn_h = node(nt, "ShaderNodeMapRange", (300, 1300), **{"From Min": 2760.0, "From Max": 2950.0})
    link(nt, sep.outputs["Z"], sn_h.inputs["Value"])
    sn_f = node(nt, "ShaderNodeMapRange", (300, 1150), **{"From Min": 0.62, "From Max": 0.82})
    link(nt, nsep.outputs["Z"], sn_f.inputs["Value"])
    sn_n = node(nt, "ShaderNodeTexNoise", (300, 1000), Scale=0.05, Detail=6.0)
    link(nt, pos, sn_n.inputs["Vector"])
    sn_nr = node(nt, "ShaderNodeMapRange", (500, 1000), **{"From Min": 0.38, "From Max": 0.58})
    link(nt, sn_n.outputs["Fac"], sn_nr.inputs["Value"])
    sn1 = node(nt, "ShaderNodeMath", (500, 1250), operation="MULTIPLY")
    link(nt, sn_h.outputs["Result"], sn1.inputs[0])
    link(nt, sn_f.outputs["Result"], sn1.inputs[1])
    sn2 = node(nt, "ShaderNodeMath", (650, 1150), operation="MULTIPLY")
    link(nt, sn1.outputs[0], sn2.inputs[0])
    link(nt, sn_nr.outputs["Result"], sn2.inputs[1])
    snow_col = node(nt, "ShaderNodeRGB", (650, 1350))
    snow_col.outputs[0].default_value = (0.80, 0.83, 0.88, 1.0)
    c = mix(nt, sn2.outputs[0], c, snow_col.outputs[0], (850, 800))
    r = mix(nt, rockf, gravel_r or grass_r, rock_r, (600, 300), kind="FLOAT") if rock_r else None
    nm = node(nt, "ShaderNodeNormalMap", (900, -400), Strength=0.8)
    nrm_mix = mix(nt, rockf, gravel_n, rock_n, (600, -400))
    link(nt, nrm_mix, nm.inputs["Color"])
    nrm = nm.outputs["Normal"]
    if cover:
        # 水の所は川底：同じ石を、水を通した青緑に（梓川の澄んだ水）。水面は別の面（water_surface）
        tint = node(nt, "ShaderNodeMix", (800, 900))
        tint.data_type = "RGBA"
        tint.blend_type = "MULTIPLY"
        tint.inputs["Factor"].default_value = 1.0
        link(nt, gravel_c, tint.inputs[6])
        tint.inputs[7].default_value = (0.22, 0.55, 0.50, 1.0)
        c = mix(nt, water, c, tint.outputs[2], (1000, 600))
        # 水際の濡れ：暗く、なめらかに
        wt = node(nt, "ShaderNodeTexImage", (-1000, 1000))
        wt.image = image(os.path.join(os.path.dirname(cover), "near_wet.png"), True)
        wt.interpolation = "Cubic"
        wt.extension = "EXTEND"
        link(nt, uv.outputs["UV"], wt.inputs["Vector"])
        dark = node(nt, "ShaderNodeMath", (-800, 1000), operation="MULTIPLY_ADD")
        link(nt, wt.outputs["Color"], dark.inputs[0])
        dark.inputs[1].default_value = -0.45
        dark.inputs[2].default_value = 1.0
        wetc = node(nt, "ShaderNodeMix", (1200, 600))
        wetc.data_type = "RGBA"
        wetc.blend_type = "MULTIPLY"
        wetc.inputs["Factor"].default_value = 1.0
        link(nt, c, wetc.inputs[6])
        cm = node(nt, "ShaderNodeCombineColor", (1000, 1000))
        for i in range(3):
            link(nt, dark.outputs[0], cm.inputs[i])
        link(nt, cm.outputs["Color"], wetc.inputs[7])
        c = wetc.outputs[2]
        if r is not None:
            dr = node(nt, "ShaderNodeMath", (1000, 300), operation="MULTIPLY_ADD")
            link(nt, wt.outputs["Color"], dr.inputs[0])
            dr.inputs[1].default_value = -0.55
            dr.inputs[2].default_value = 1.0
            rr = node(nt, "ShaderNodeMath", (1100, 300), operation="MULTIPLY")
            link(nt, r, rr.inputs[0])
            link(nt, dr.outputs[0], rr.inputs[1])
            r = rr.outputs[0]
    nrm = nm.outputs["Normal"]
    link(nt, nrm, b.inputs["Normal"])
    link(nt, c, b.inputs["Base Color"])
    if r is not None:
        link(nt, r, b.inputs["Roughness"])
    else:
        b.inputs["Roughness"].default_value = 0.85
    return mat


# ---------------------------------------------------------------- 空と光

def sky_and_sun() -> None:
    sc = bpy.context.scene
    w = bpy.data.worlds.new("sky")
    sc.world = w
    nt = w.node_tree
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputWorld", (600, 0))
    bg = node(nt, "ShaderNodeBackground", (400, 0), Strength=SKY["strength"])
    env = node(nt, "ShaderNodeTexEnvironment", (100, 0))
    d = os.path.join(ASSETS, "hdris", SKY["name"])
    env.image = image(os.path.join(d, [f for f in os.listdir(d) if f.endswith(".exr")][0]))
    tc = node(nt, "ShaderNodeTexCoord", (-400, 0))
    mp = node(nt, "ShaderNodeMapping", (-200, 0))
    # HDRI の太陽（明るい所）の方位を、SUN の方位に合わせる
    hdri_sun_az = hdri_sun_azimuth(env.image)
    rot = math.radians(-(SUN["az"] - hdri_sun_az))
    mp.inputs["Rotation"].default_value = (0.0, 0.0, rot)
    link(nt, tc.outputs["Generated"], mp.inputs["Vector"])
    link(nt, mp.outputs["Vector"], env.inputs["Vector"])
    link(nt, env.outputs["Color"], bg.inputs["Color"])
    link(nt, bg.outputs["Background"], out.inputs["Surface"])
    lamp = bpy.data.lights.new("sun", "SUN")
    lamp.energy = SUN["energy"]
    lamp.angle = math.radians(0.53)
    lamp.color = SUN["color"]
    ob = bpy.data.objects.new("sun", lamp)
    sc.collection.objects.link(ob)
    az, el = math.radians(SUN["az"]), math.radians(SUN["el"])
    from mathutils import Vector

    d3 = Vector((math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)))
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(d3)


def hdri_sun_azimuth(img: bpy.types.Image) -> float:
    """HDRI の一番明るい所の方位（北 0°・東 90°。Blender の Environment の向き：真ん中が -Y を向く…ではなく、u=0.5 が +X…
    ここでは u から方位を出し、回す量を決めるのに使う）"""
    W, H = img.size
    a = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(H, W, 4)[..., :3].sum(-1)
    r, c = np.unravel_index(np.argmax(a), a.shape)
    u = (c + 0.5) / W
    # Blender の Environment（Equirectangular）：方向 (x, y) の経度 = atan2(y, x)、u = -経度/(2π) + 0.5
    lon = (0.5 - u) * 2 * math.pi  # atan2(y, x)（x=東, y=北 のとき、東から反時計回り）
    az = (90.0 - math.degrees(lon)) % 360.0  # 北から時計回り
    return az


# ---------------------------------------------------------------- 森

def append_trees() -> dict:
    """Poly Haven のモミ（3本 × 細かさ 3 段）を読み込む。金色のカラマツは同じ形で、針葉の色だけを木ごとに替える（形を複製すると
    メモリが倍になるので、木の点の属性 larch（1＝カラマツ）を材料で読んで色を選ぶ）"""
    names = []
    for asset in ("fir_tree_01", "fir_sapling_medium"):
        p = os.path.join(ASSETS, "models", asset, f"{asset}.blend")
        want = [f"{asset}_{v}_LOD{l}" for v in "abc" for l in (0, 1, 2)]
        with bpy.data.libraries.load(p, link=False) as (src, dst):
            dst.objects = list(want)  # 読み込むと、この一覧の中身が物に置き換わる（want は名前のまま残す）
        names += want
    lib = bpy.data.collections.new("tree_lib")
    bpy.context.scene.collection.children.link(lib)
    lib.hide_render = True
    lib.hide_viewport = True
    objs = {}
    for ob in [o for o in bpy.data.objects if o.name in names]:
        lib.objects.link(ob)
        ob.location = (0, 0, 0)
        objs[ob.name] = ob
    larch_twig(bpy.data.materials["fir_tree_01_twig"])
    # 中くらいの形（LOD1）の内側に、暗い芯（円すい）を足す（枝のすき間から空が点々と透けない）。
    # 遠く（LOD2 の所）は、針葉の板を使わない針葉樹の形の塊（far_cone）に替える（朝日で板が 1 画素ずつ光ってざらつくので）
    core = core_material()
    for v in "abc":
        for asset in ("fir_tree_01", "fir_sapling_medium"):
            add_core(objs[f"{asset}_{v}_LOD1"], core)
            cone = far_cone(objs[f"{asset}_{v}_LOD2"], core)
            lib.objects.link(cone)
            objs[f"{asset}_{v}_LOD2"] = cone
    try:
        larch_twig(bpy.data.materials["fir_sapling_medium_twigs"])  # 川岸の若木も一部は黄葉に
    except (KeyError, StopIteration):
        print("若木の針葉の材料は、色を替えずに使う", flush=True)
    return objs


def core_material() -> bpy.types.Material:
    """木の芯：針葉の奥の暗い色（カラマツは暗い金）"""
    m = bpy.data.materials.new("tree_core")
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.85
    att = nt.nodes.new("ShaderNodeAttribute")
    att.attribute_type = "INSTANCER"
    att.attribute_name = "larch"
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    nt.links.new(att.outputs["Fac"], mx.inputs["Factor"])
    mx.inputs[6].default_value = (0.010, 0.019, 0.012, 1.0)
    mx.inputs[7].default_value = (0.070, 0.038, 0.010, 1.0)
    nt.links.new(mx.outputs[2], b.inputs["Base Color"])
    return m


def add_core(ob: bpy.types.Object, mat: bpy.types.Material) -> None:
    """木（ob）の葉の付いている高さに、細めの円すいを足す（木の形の大きさから）"""
    import bmesh

    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    z0, z1 = float(co[:, 2].min()), float(co[:, 2].max())
    h = z1 - z0
    r = 0.5 * float(np.percentile(np.hypot(co[:, 0], co[:, 1]), 80)) * 0.55
    bm = bmesh.new()
    bm.from_mesh(me)
    before = len(bm.faces)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=r, radius2=0.0, depth=h * 0.72,
                          matrix=__import__("mathutils").Matrix.Translation((0, 0, z0 + h * 0.22 + h * 0.36)))
    if mat.name not in [m.name for m in me.materials if m]:
        me.materials.append(mat)
    idx = [m.name for m in me.materials].index(mat.name)
    bm.faces.ensure_lookup_table()
    for f in bm.faces[before:]:
        f.material_index = idx
    bm.to_mesh(me)
    bm.free()


def far_cone(src: bpy.types.Object, core: bpy.types.Material) -> bpy.types.Object:
    """遠くの木：src の大きさに合わせた、縁の不揃いな円すい（針葉樹の冠）と細い幹。材料は芯と同じ暗い色に、凹凸と明暗のむら"""
    import bmesh
    from mathutils import Matrix

    co = np.empty(len(src.data.vertices) * 3, np.float32)
    src.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    z0, z1 = float(co[:, 2].min()), float(co[:, 2].max())
    h = z1 - z0
    r = 0.5 * float(np.percentile(np.hypot(co[:, 0], co[:, 1]), 85)) * 0.8
    bm = bmesh.new()
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r, radius2=0.0, depth=h * 0.82, matrix=Matrix.Translation((0, 0, z0 + h * 0.18 + h * 0.41)))
    rng = np.random.default_rng(len(co))
    for v in res["verts"]:
        if v.co.z < z0 + h * 0.2:
            k = 1.0 + rng.uniform(-0.25, 0.2)
            v.co.x *= k
            v.co.y *= k
    bmesh.ops.create_cone(bm, cap_ends=False, segments=5, radius1=0.18, radius2=0.08, depth=h * 0.25, matrix=Matrix.Translation((0, 0, z0 + h * 0.125)))
    me = bpy.data.meshes.new(src.name + "_cone")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(far_material(core))
    ob = bpy.data.objects.new(src.name.replace("LOD2", "CONE"), me)
    return ob


def far_material(core: bpy.types.Material) -> bpy.types.Material:
    """遠くの木の冠：暗い緑（カラマツは金）に、細かいむらと凹凸（日の当たる側が少し明るい）"""
    if "tree_far" in bpy.data.materials:
        return bpy.data.materials["tree_far"]
    m = core.copy()
    m.name = "tree_far"
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    mx = next(n for n in nt.nodes if n.type == "MIX")
    mx.inputs[6].default_value = (0.018, 0.042, 0.022, 1.0)
    mx.inputs[7].default_value = (0.22, 0.12, 0.026, 1.0)
    ns = nt.nodes.new("ShaderNodeTexNoise")
    ns.inputs["Scale"].default_value = 3.0
    ns.inputs["Detail"].default_value = 6.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    nt.links.new(ns.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def opaque(mat: bpy.types.Material) -> bpy.types.Material:
    """針葉の材料の、透けない版（透明度を 1 に。透明への切り替えも無し）"""
    name = mat.name + "_opaque"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = mat.copy()
    m.name = name
    nt = m.node_tree
    for n in nt.nodes:
        if n.type == "BSDF_PRINCIPLED":
            for l in list(n.inputs["Alpha"].links):
                nt.links.remove(l)
            n.inputs["Alpha"].default_value = 1.0
        if n.type == "MIX_SHADER":
            ins = [l.from_node.type for l in n.inputs[1].links] + [l.from_node.type for l in n.inputs[2].links]
            if "BSDF_TRANSPARENT" in ins:
                for l in list(n.inputs[0].links):
                    nt.links.remove(l)
                # 透明でない側だけを使う
                n.inputs[0].default_value = 1.0 if (n.inputs[1].links and n.inputs[1].links[0].from_node.type == "BSDF_TRANSPARENT") else 0.0
    return m


def larch_twig(mat: bpy.types.Material) -> None:
    """針葉の材料に、カラマツの金の色の道を足し、木の属性 larch で選ぶ。元の材料は、オリーブ色の針葉の絵（HSV）に、ゆらぐ割合で
    緑を掛けて（Mix の掛け算）モミの緑にしている。カラマツは、絵を少し橙へ・鮮やかに・明るくし、掛ける色を金にする"""
    nt = mat.node_tree
    img = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and "twig_diff" in n.image.filepath)
    hsv = next(n for n in nt.nodes if n.type == "HUE_SAT" and n.inputs["Color"].links and n.inputs["Color"].links[0].from_node == img)
    mul = next(n for n in nt.nodes if n.type == "MIX" and n.blend_type == "MULTIPLY")
    fac_src = mul.inputs["Factor"].links[0].from_socket  # ゆらぐ割合（0〜0.5）
    hsv_l = nt.nodes.new("ShaderNodeHueSaturation")
    hsv_l.inputs["Hue"].default_value = 0.44
    hsv_l.inputs["Saturation"].default_value = 2.3
    hsv_l.inputs["Value"].default_value = 1.4
    nt.links.new(img.outputs["Color"], hsv_l.inputs["Color"])
    k = nt.nodes.new("ShaderNodeMath")
    k.operation = "MULTIPLY"
    k.inputs[1].default_value = 1.7
    nt.links.new(fac_src, k.inputs[0])
    mul_l = nt.nodes.new("ShaderNodeMix")
    mul_l.data_type = "RGBA"
    mul_l.blend_type = "MULTIPLY"
    nt.links.new(k.outputs[0], mul_l.inputs["Factor"])
    nt.links.new(hsv_l.outputs["Color"], mul_l.inputs[6])
    mul_l.inputs[7].default_value = (1.0, 0.42, 0.04, 1.0)
    att = nt.nodes.new("ShaderNodeAttribute")
    att.attribute_type = "INSTANCER"
    att.attribute_name = "larch"
    pick = nt.nodes.new("ShaderNodeMix")
    pick.data_type = "RGBA"
    nt.links.new(att.outputs["Fac"], pick.inputs["Factor"])
    out = mul.outputs[2]
    targets = [l.to_socket for l in list(out.links)]
    nt.links.new(out, pick.inputs[6])
    nt.links.new(mul_l.outputs[2], pick.inputs[7])
    for t in targets:
        nt.links.new(pick.outputs[2], t)


def plant_forest(objs: dict, near, nm, valley, vm, cam_xy: np.ndarray, view: tuple[float, float] | None = None) -> None:
    """木を植える：landcover.py の木の位置（work/landcover/trees.npz：x, y, 種, 大きさ）。カメラに近いほど細かい形。
    view（カメラの方位°, 見える角の半分°）があれば、その向きの木と、カメラのまわり 250m の木（影・映り込み）だけ"""
    d = np.load(os.path.join(WORK, "landcover", "trees.npz"))
    x, y, kind, size = d["x"], d["y"], d["kind"], d["size"]
    if view is not None:
        azs = np.atleast_1d(view[0])
        sel = np.zeros(len(x), bool)
        step = max(1, len(azs) // 24)  # コマが多いときは間引いて（近いコマの見える所はほとんど同じ）
        for k in range(0, len(azs), step):
            cx, cy = cam_xy[min(k, len(cam_xy) - 1)]
            dx, dy = x - cx, y - cy
            r = np.hypot(dx, dy)
            box = r < TREE_RADIUS
            ang = (np.degrees(np.arctan2(dx[box], dy[box])) - azs[k] + 180.0) % 360.0 - 180.0
            hit = np.zeros(len(x), bool)
            hit[box] = (np.abs(ang) < view[1] + 15.0) | (r[box] < 250)
            sel |= hit
        x, y, kind, size = x[sel], y[sel], kind[sel], size[sel]
    z = ground_height(x, y, near, nm, valley, vm)
    # カメラ（の道筋）からの距離で細かさを選ぶ
    dist = np.full(len(x), np.inf)
    for cx, cy in cam_xy:
        dist = np.minimum(dist, np.hypot(x - cx, y - cy))
    lod = np.select([dist < 70, dist < 600], [0, 1], 2)
    rng = np.random.default_rng(7)
    var = rng.integers(0, 3, len(x))
    rot = rng.uniform(0, 2 * math.pi, len(x))
    # 道具の木の一覧（インスタンスの番号）：モミ 3本 × 3段、若木 3本 × 3段（カラマツは同じ形で、属性 larch で色だけ替える）
    order = [f"{a}_{v}_LOD{l}" for a in ("fir_tree_01", "fir_sapling_medium") for v in "abc" for l in (0, 1, 2)]
    var = np.where((lod == 0) & (kind != 2) & (var == 0), 1, var)  # fir a の細かい形（210 万面）は重いので、近くでは b に
    idx = (np.where(kind == 2, 9, 0) + var * 3 + lod).astype(np.int32)
    col = bpy.data.collections.new("tree_order")
    bpy.context.scene.collection.children.link(col)
    col.hide_render = True
    col.hide_viewport = True
    for i, nme in enumerate(order):
        objs[nme].name = f"{i:02d}_{nme}"  # 名前の順 = 番号の順（Collection Info の並び）
        col.objects.link(objs[nme])
    me = bpy.data.meshes.new("tree_points")
    co = np.stack([x, y, z], -1).astype(np.float32)
    me.vertices.add(len(co))
    me.vertices.foreach_set("co", co.ravel())
    a = me.attributes.new("inst", "INT", "POINT")
    a.data.foreach_set("value", idx)
    a = me.attributes.new("scl", "FLOAT", "POINT")
    a.data.foreach_set("value", size.astype(np.float32))
    a = me.attributes.new("rot", "FLOAT", "POINT")
    a.data.foreach_set("value", rot.astype(np.float32))
    a = me.attributes.new("larch", "FLOAT", "POINT")  # 点の属性は木（インスタンス）に引き継がれ、材料が読む
    yellow = (kind == 1) | ((kind == 2) & (rng.uniform(0, 1, len(x)) < 0.3))
    a.data.foreach_set("value", yellow.astype(np.float32))
    ob = bpy.data.objects.new("forest", me)
    bpy.context.scene.collection.objects.link(ob)
    ng = bpy.data.node_groups.new("forest", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gi = ng.nodes.new("NodeGroupInput")
    go = ng.nodes.new("NodeGroupOutput")
    ci = ng.nodes.new("GeometryNodeCollectionInfo")
    ci.inputs["Collection"].default_value = col
    ci.inputs["Separate Children"].default_value = True
    ci.inputs["Reset Children"].default_value = True
    ci.transform_space = "ORIGINAL"
    iop = ng.nodes.new("GeometryNodeInstanceOnPoints")
    iop.inputs["Pick Instance"].default_value = True
    ra_i = ng.nodes.new("GeometryNodeInputNamedAttribute")
    ra_i.data_type = "INT"
    ra_i.inputs["Name"].default_value = "inst"
    ra_s = ng.nodes.new("GeometryNodeInputNamedAttribute")
    ra_s.data_type = "FLOAT"
    ra_s.inputs["Name"].default_value = "scl"
    ra_r = ng.nodes.new("GeometryNodeInputNamedAttribute")
    ra_r.data_type = "FLOAT"
    ra_r.inputs["Name"].default_value = "rot"
    cmb = ng.nodes.new("ShaderNodeCombineXYZ")
    ng.links.new(ra_r.outputs["Attribute"], cmb.inputs["Z"])
    ng.links.new(gi.outputs[0], iop.inputs["Points"])
    ng.links.new(ci.outputs["Instances"], iop.inputs["Instance"])
    ng.links.new(ra_i.outputs["Attribute"], iop.inputs["Instance Index"])
    ng.links.new(cmb.outputs["Vector"], iop.inputs["Rotation"])
    ng.links.new(ra_s.outputs["Attribute"], iop.inputs["Scale"])
    ng.links.new(iop.outputs["Instances"], go.inputs[0])
    mod = ob.modifiers.new("forest", "NODES")
    mod.node_group = ng
    print(f"木 {len(x)} 本（細かい形 {int((lod == 0).sum())}・中 {int((lod == 1).sum())}・粗い {int((lod == 2).sum())}）", flush=True)


def plant_rocks(near, nm, valley, vm, cam_xy: np.ndarray, radius: float = 700.0) -> None:
    """川原の石と流木（landcover.py の rocks.npz）。カメラから radius m の所だけ。少し埋める"""
    f = os.path.join(WORK, "landcover", "rocks.npz")
    if not os.path.exists(f):
        return
    d = np.load(f)
    x, y, kind, size = d["x"], d["y"], d["kind"], d["size"]
    dist = np.full(len(x), np.inf)
    for cx, cy in cam_xy:
        dist = np.minimum(dist, np.hypot(x - cx, y - cy))
    sel = dist < radius
    x, y, kind, size = x[sel], y[sel], kind[sel], size[sel]
    names = []
    for asset, want in (("rock_moss_set_01", [f"rock_moss_set_01_rock{i:02d}" for i in range(1, 7)]),
                        ("rock_moss_set_02", [f"rock_moss_set_02_rock{i:02d}" for i in range(7, 14)]),
                        ("boulder_01", ["boulder_01_LOD1"]),
                        ("dead_tree_trunk", ["dead_tree_trunk"]),
                        ("dead_tree_trunk_02", ["dead_tree_trunk_02_LOD1"])):
        p = os.path.join(ASSETS, "models", asset, f"{asset}.blend")
        with bpy.data.libraries.load(p, link=False) as (src, dst):
            dst.objects = list(want)
        names += want
    col = bpy.data.collections.new("rock_order")
    bpy.context.scene.collection.children.link(col)
    col.hide_render = True
    col.hide_viewport = True
    for i, nme in enumerate(names):
        ob = bpy.data.objects[nme]
        ob.location = (0, 0, 0)
        ob.name = f"{i:02d}_{nme}"
        col.objects.link(ob)
    z = ground_height(x, y, near, nm, valley, vm) - 0.18 * size
    rng = np.random.default_rng(11)
    me = bpy.data.meshes.new("rock_points")
    me.vertices.add(len(x))
    me.vertices.foreach_set("co", np.stack([x, y, z], -1).astype(np.float32).ravel())
    for nme, typ, val in (("inst", "INT", kind.astype(np.int32)), ("scl", "FLOAT", size.astype(np.float32)), ("rot", "FLOAT", rng.uniform(0, 2 * math.pi, len(x)).astype(np.float32))):
        a = me.attributes.new(nme, typ, "POINT")
        a.data.foreach_set("value", val)
    ob = bpy.data.objects.new("rocks", me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new("rocks", "NODES")
    mod.node_group = bpy.data.node_groups["forest"].copy()
    for n in mod.node_group.nodes:
        if n.type == "COLLECTION_INFO":
            n.inputs["Collection"].default_value = col
    print(f"川原の石・流木 {len(x)} 個", flush=True)


# ---------------------------------------------------------------- カメラと描く

def camera(look: dict, near, nm, valley, vm) -> tuple[float, float]:
    x, y = (float(v) for v in geo3.local(look["lon"], look["lat"]))
    g = float(ground_height(np.array([x]), np.array([y]), near, nm, valley, vm)[0])
    cam = bpy.data.cameras.new("cam")
    cam.lens = look["lens"]
    cam.sensor_width = 36.0
    cam.clip_start, cam.clip_end = 0.5, 80000.0
    ob = bpy.data.objects.new("cam", cam)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    ob.location = (x, y, g + look["agl"])
    ob.rotation_mode = "XYZ"
    # Blender のカメラは -Z を向く。X 回りに 90° + 見下ろす角、Z 回りに方位
    ob.rotation_euler = (math.radians(90.0 + look["pitch"]), 0.0, math.radians(-look["az"]))
    return x, y


def setup_render(res: tuple[int, int], spp: int) -> None:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = spp
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.transparent_max_bounces = 10
    sc.cycles.ao_bounces_render = 2  # 2 回より先の間接光は近似（森の中の光の行き来を速く）
    sc.cycles.sample_clamp_indirect = 4.0  # 間接光の飛び抜けた明るい点を抑える
    if hasattr(sc.cycles, "debug_use_compact_bvh"):
        sc.cycles.debug_use_compact_bvh = True  # 形の索引を小さく（メモリ）
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = 0.4


# 空気のかすみ：遠いほど空の色（青灰）に寄る。HAZE_KM で約 63% 寄る。色は露出・色の曲線の前の光の量
HAZE = dict(color=(0.30, 0.36, 0.46), km=9.0, max=0.85)


def haze() -> None:
    sc = bpy.context.scene
    vl = sc.view_layers[0]
    vl.use_pass_mist = True
    sc.world.mist_settings.start = 0.0
    sc.world.mist_settings.depth = 60000.0
    sc.world.mist_settings.falloff = "LINEAR"
    ng = bpy.data.node_groups.new("finish", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    sc.compositing_node_group = ng
    sc.render.use_compositing = True
    sc.render.compositor_device = "CPU"
    rl = ng.nodes.new("CompositorNodeRLayers")
    # 距離 d = mist × 60km。かすみの割合 = max × (1 - exp(-d / km))。空（mist = 1）は 0
    def math(op, a, b=None, v=None):
        n = ng.nodes.new("ShaderNodeMath")
        n.operation = op
        ng.links.new(a, n.inputs[0])
        if b is not None:
            ng.links.new(b, n.inputs[1])
        elif v is not None:
            n.inputs[1].default_value = v
        return n.outputs[0]
    mist = rl.outputs["Mist"]
    d = math("MULTIPLY", mist, v=60000.0 / (HAZE["km"] * 1000.0))
    e = math("EXPONENT", math("MULTIPLY", d, v=-1.0))
    one = ng.nodes.new("ShaderNodeValue")
    one.outputs[0].default_value = 1.0
    f = math("MULTIPLY", math("SUBTRACT", one.outputs[0], e), v=HAZE["max"])
    sky = math("LESS_THAN", mist, v=0.999)
    f = math("MULTIPLY", f, sky)
    mix = ng.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    ng.links.new(f, mix.inputs["Factor"])
    ng.links.new(rl.outputs["Image"], mix.inputs[6])
    mix.inputs[7].default_value = (*HAZE["color"], 1.0)
    out = ng.nodes.new("NodeGroupOutput")
    ng.links.new(mix.outputs[2], out.inputs[0])


def parse_frames(spec: str, n: int) -> list[int]:
    """コマの指定：「0-120」（両端を含む）か「0,120,240」、組み合わせ「0-23,100」"""
    out = []
    for part in spec.split(","):
        if "-" in part:
            a_, b_ = (int(v) for v in part.split("-"))
            out += list(range(a_, min(b_, n - 1) + 1))
        elif part.strip():
            out.append(int(part))
    return sorted(set(f for f in out if 0 <= f < n))


def anim_trees(frames: list[dict], todo: list[int]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """描くコマで見える木だけ（コマごとの見える向きの和）と、木の細かさを決めるカメラの位置"""
    cams = np.array([frames[f]["pos"][:2] for f in todo])
    fw = np.array([frames[f]["fwd"][:2] for f in todo])
    az = np.degrees(np.arctan2(fw[:, 0], fw[:, 1]))
    return cams, az, np.array([frames[f]["lens"] for f in todo])


def camera_anim(frames: list[dict], f0: int, f1: int) -> None:
    """カメラ：path3.json のコマごとの位置と向き（前後 1 コマも入れる。動きのぶれのため）"""
    from mathutils import Matrix, Vector

    sc = bpy.context.scene
    cam = bpy.data.cameras.new("cam")
    cam.lens = frames[f0]["lens"]
    cam.sensor_width = 36.0
    cam.clip_start, cam.clip_end = 0.5, 80000.0
    ob = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(ob)
    sc.camera = ob
    ob.rotation_mode = "QUATERNION"
    for f in range(max(0, f0 - 1), min(len(frames), f1 + 2)):
        fr = frames[f]
        R = Matrix((fr["right"], fr["up"], [-v for v in fr["fwd"]])).transposed()
        ob.location = Vector(fr["pos"])
        ob.rotation_quaternion = R.to_quaternion()
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_quaternion", frame=f)
    if ob.animation_data and ob.animation_data.action:
        for fc in getattr(ob.animation_data.action, "fcurves", []):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


def run_anim(a) -> None:
    """動画のコマを描く（--frames a-b）。木はそのコマたちで見える所だけ植え、細かさはカメラの道筋からの距離で"""
    with open(os.path.join(WORK, "path3.json")) as f:
        P = json.load(f)
    frames = P["frames"]
    want = parse_frames(a.frames, len(frames))
    out_dir = a.out or os.path.join(WORK, "frames")
    os.makedirs(out_dir, exist_ok=True)
    todo = [f for f in want if not os.path.exists(os.path.join(out_dir, f"{f:04d}.exr"))]
    if not todo:
        print("描くコマは残っていない", flush=True)
        return
    f0, f1 = todo[0], todo[-1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cover = os.path.join(WORK, "landcover", "near_cover.png")
    mats = {"near": ground_material("ground_near", cover), "valley": ground_material("ground_valley", None), "far": ground_material("ground_far", None)}
    t = build_terrain(mats)
    near, nm = t["near"]
    valley, vm = t["valley"]
    build_water(nm)
    sky_and_sun()
    camera_anim(frames, f0, f1)
    cams, az, lens = anim_trees(frames, todo)
    objs = append_trees()
    half = float(math.degrees(math.atan(18.0 / lens.min())))
    plant_forest(objs, near, nm, valley, vm, cams, view=(az, half))
    plant_rocks(near, nm, valley, vm, cams)
    W, H = (int(v) for v in a.res.split("x"))
    setup_render((W, H), a.spp)
    sc = bpy.context.scene
    sc.render.fps = P["fps"]
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 0.5  # 24 コマ/秒で 1/48 秒（映画の 180° シャッター）
    sc.view_layers[0].use_pass_z = True
    sc.render.use_compositing = False
    st = sc.render.image_settings
    st.media_type = "MULTI_LAYER_IMAGE"
    st.file_format = "OPEN_EXR_MULTILAYER"
    st.color_depth = "16"
    st.exr_codec = "ZIP"
    with open(os.path.join(WORK, "terrain", "near_carved.json")) as fh:
        riv = json.load(fh).get("river", {})
    az_s, el_s = math.radians(SUN["az"]), math.radians(SUN["el"])
    sun = [math.cos(el_s) * math.sin(az_s), math.cos(el_s) * math.cos(az_s), math.sin(el_s)]
    for f in todo:
        fr = frames[f]
        sc.frame_set(f)
        path = os.path.join(out_dir, f"{f:04d}.exr")
        json.dump(dict(location=fr["pos"], right=fr["right"], up=fr["up"], back=[-v for v in fr["fwd"]], lens=fr["lens"], sensor=36.0,
                       res=[W, H], sun=sun, river=riv, t=fr["t"], frame=f), open(os.path.splitext(path)[0] + ".json", "w"))
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f"コマ {f} → {path}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--look", type=int, default=1)
    ap.add_argument("--res", default="1920x1080")
    ap.add_argument("--spp", type=int, default=64)
    ap.add_argument("--out", default="")
    ap.add_argument("--no-trees", action="store_true")
    ap.add_argument("--exr", action="store_true", help="光の量そのまま（色・奥行き）を EXR に書く（仕上げは post3.py）")
    ap.add_argument("--frames", default="", help="動画のコマ（例 0-120。path3.json の飛び方）。--out はコマを置く場所")
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else None)
    if a.frames:
        run_anim(a)
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cover = os.path.join(WORK, "landcover", "near_cover.png")
    mats = {
        "near": ground_material("ground_near", cover if os.path.exists(cover) else None),
        "valley": ground_material("ground_valley", None),
        "far": ground_material("ground_far", None),
    }
    t = build_terrain(mats)
    near, nm = t["near"]
    valley, vm = t["valley"]
    build_water(nm)
    sky_and_sun()
    look = LOOKS[a.look]
    cx, cy = camera(look, near, nm, valley, vm)
    if not a.no_trees and os.path.exists(os.path.join(WORK, "landcover", "trees.npz")):
        objs = append_trees()
        half = math.degrees(math.atan(18.0 / look["lens"]))  # 横の見える角の半分（36mm 幅のセンサー）
        plant_forest(objs, near, nm, valley, vm, np.array([[cx, cy]]), view=(look["az"], half))
        plant_rocks(near, nm, valley, vm, np.array([[cx, cy]]))
    W, H = (int(v) for v in a.res.split("x"))
    setup_render((W, H), a.spp)
    out = a.out or os.path.join(WORK, "look", f"look{a.look}" + (".exr" if a.exr else ".png"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sc = bpy.context.scene
    if a.exr:
        sc.view_layers[0].use_pass_z = True
        sc.render.use_compositing = False
        st = sc.render.image_settings
        st.media_type = "MULTI_LAYER_IMAGE"  # Blender 5：何層もの EXR は media_type で選ぶ
        st.file_format = "OPEN_EXR_MULTILAYER"
        st.color_depth = "32"
        st.exr_codec = "ZIP"
        write_camera_json(os.path.splitext(out)[0] + ".json", look)
    else:
        haze()
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(out, flush=True)


def write_camera_json(path: str, look: dict) -> None:
    """仕上げ（post3.py）のための、カメラ（位置・向き・レンズ）と太陽の向きと、川の水面の高さ"""
    sc = bpy.context.scene
    bpy.context.view_layer.update()  # 位置・向きを入れたあと、matrix_world を計算し直す
    cam = sc.camera
    m = cam.matrix_world
    az, el = math.radians(SUN["az"]), math.radians(SUN["el"])
    with open(os.path.join(WORK, "landcover", "..", "terrain", "near_carved.json")) as f:
        riv = json.load(f).get("river", {})
    json.dump(dict(
        location=list(m.translation), right=list(m.col[0][:3]), up=list(m.col[1][:3]), back=list(m.col[2][:3]),
        lens=cam.data.lens, sensor=cam.data.sensor_width, res=[sc.render.resolution_x, sc.render.resolution_y],
        sun=[math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)], river=riv, look=look,
    ), open(path, "w"), indent=1)


if __name__ == "__main__":
    main()
