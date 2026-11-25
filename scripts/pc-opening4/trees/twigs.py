"""カラマツの葉の小枝を、本物の形（メッシュ）で作る。numpy だけ（bake_atlas だけ bpy を使う）。

実物の作り（Larix kaempferi）：
  ・長枝（その年に伸びた枝）：針が 1 本ずつ らせん状につく。
  ・短枝（2 年目以降の枝についた短い突起＝スパー）：先に針が 20〜40 本、ほうき状に束になる。
  ・針は長さ 2〜3.5cm・幅 1mm ほど。11 月は金黄色。いくつかの束は落ちて針が少ない・ない。
  ・小さな直立した茶色の球果（2〜3cm）が少しつく。

座標（小枝の局所）：+X が枝の伸びる向き、+Z が上、根元が原点。長さ 0.2〜0.3m。
出力：dict(wood=…, needles=…)。それぞれ verts, faces, uv, と属性（wood: radius/dead、needles: tint）。
"""
import numpy as np
from .treegen import tube, _unit, make_rng

GOLDEN = np.deg2rad(137.5)


def _rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def _rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def _rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def _tuft(rg, p, axis, fwd, n, tint0, lmul=1.0):
    """針の束。p=根元、axis=スパーの向き、fwd=枝の先の向き。n 本。三角形 1 枚ずつ。"""
    if n <= 0:
        return None
    a = _unit(axis * 0.5 + fwd * 0.5)
    e1 = _unit(np.cross(a, np.array([0.3, 0.8, 0.5])))
    e2 = np.cross(a, e1)
    phi = rg.uniform(0.12, 1.45, n) ** 0.95      # 中心から最大 約 80 度＝束全体で 160 度のドーム
    az = rg.uniform(0, 2 * np.pi, n)
    d = np.cos(phi)[:, None] * a + np.sin(phi)[:, None] * (np.cos(az)[:, None] * e1 + np.sin(az)[:, None] * e2)
    d = _unit(d)
    L = rg.uniform(0.020, 0.035, n) * lmul
    w = rg.uniform(0.0009, 0.0013, n)
    rnd = rg.normal(size=(n, 3))
    s = _unit(np.cross(d, rnd))
    base = p + rg.normal(0, 0.0004, (n, 3))
    tip = base + d * L[:, None]
    tip[:, 2] -= L * rg.uniform(0.0, 0.18, n)         # 先がすこし垂れる
    v0 = base - s * w[:, None] * 0.5
    v1 = base + s * w[:, None] * 0.5
    V = np.stack([v0, v1, tip], 1).reshape(-1, 3)
    uv = np.tile(np.array([[0, 0], [1, 0], [0.5, 1.0]]), (n, 1))
    tint = np.clip(tint0 + rg.normal(0, 0.12, n), 0, 1)
    return V, uv, np.repeat(tint, 3)


def build_twig(seed, thin=0.15, tint0=0.3, cones=0.0, scale=1.0):
    """1 本の小枝。seed は整数のタプル。thin=針の束が落ちている割合、tint0=色のずれ（0=金 … 1=さび）。"""
    rg = np.random.default_rng(tuple(int(x) for x in seed))
    Ls = rg.uniform(0.2, 0.3) * scale
    Lo = Ls * rg.uniform(0.62, 0.8)
    n = 14
    s = np.linspace(0, Ls, n)
    sag = rg.uniform(0.5, 1.4)
    y = 0.012 * np.sin(s / Ls * rg.uniform(2, 5) + rg.uniform(0, 6)) * (Ls / 0.25)
    z = -sag * s ** 2 * 0.9 + 3.0 * np.clip(s / Ls - 0.75, 0, 1) ** 2 * Ls * 0.35
    spine = np.stack([s, y, z], 1)
    T = np.gradient(spine, axis=0)
    T = _unit(T)
    rad = np.where(s < Lo, 0.0015 - 0.0004 * s / Lo, 0.0009 - 0.0004 * (s - Lo) / (Ls - Lo))   # 直径 3mm → 1.8mm → 1mm
    W, F, U, R, D = [], [], [], [], []
    off = 0

    def add_wood(v, f, uv, rr, dead=0.0):
        nonlocal off
        W.append(v); F.append(f + off); U.append(uv); R.append(rr); D.append(np.full(len(v), dead))
        off += len(v)

    v, f, uv, rr = tube(spine, rad, 6, 0.5, cap="apex")
    add_wood(v, f, uv, rr)

    NV, NU, NT, NF = [], [], [], []
    noff = 0

    def add_needles(res):
        nonlocal noff
        if res is None:
            return
        V, uv, t = res
        NV.append(V); NU.append(uv); NT.append(t)
        k = len(V) // 3
        NF.append((np.arange(k)[:, None] * 3 + np.arange(3)[None, :]) + noff)
        noff += len(V)

    def point_at(sv):
        return np.array([np.interp(sv, s, spine[:, k]) for k in range(3)])

    def tan_at(sv):
        return _unit(np.array([np.interp(sv, s, T[:, k]) for k in range(3)]))

    # 短枝（スパー）：古い部分に らせん状に。先に針の束
    sp = 0.013          # 短枝の間隔 8〜18mm
    k = 0
    ang = rg.uniform(0, 6.28)
    sv = 0.004
    while sv < Lo:
        c = point_at(sv)
        t = tan_at(sv)
        e1 = _unit(np.cross(t, np.array([0, 0, 1.0])))
        e2 = np.cross(t, e1)
        out = np.cos(ang) * e1 + np.sin(ang) * e2
        tilt = np.deg2rad(rg.uniform(50, 80))
        d = _unit(np.cos(tilt) * t + np.sin(tilt) * out)
        ln = rg.uniform(0.003, 0.006)
        tip = c + d * ln
        sv_pts = np.stack([c, (c + tip) / 2, tip])
        v, f, uv, rr = tube(sv_pts, np.array([0.0013, 0.0020, 0.0014]), 5, 0.5, cap=None)
        add_wood(v, f, uv, rr)
        if rg.random() < thin:
            nn = int(rg.integers(8, 26))        # 落ち始めた木は 15〜30 本
        else:
            nn = int(rg.integers(30, 51))        # 平均 40 本
        add_needles(_tuft(rg, tip, d, t, nn, tint0 + (0.25 if rg.random() < 0.08 else 0.0)))
        ang += GOLDEN + rg.normal(0, 0.25)
        sv += sp * rg.uniform(0.62, 1.4)
        k += 1
    # 長枝：針が 1 本ずつ らせん状
    sv = Lo + 0.003
    while sv < Ls - 0.004:
        c = point_at(sv)
        t = tan_at(sv)
        e1 = _unit(np.cross(t, np.array([0, 0, 1.0])))
        e2 = np.cross(t, e1)
        out = np.cos(ang) * e1 + np.sin(ang) * e2
        if rg.random() > thin * 0.7:
            d = _unit(0.65 * t + 0.75 * out)
            add_needles(_tuft(rg, c, d, t, 1, tint0, lmul=1.15))
        ang += GOLDEN
        sv += 0.0045
    # 先の芽の束
    if rg.random() > thin:
        add_needles(_tuft(rg, spine[-1], T[-1], T[-1], int(rg.integers(12, 22)), tint0))
    # 脇の短い枝（1〜2 本）
    for _ in range(int(rg.integers(1, 3))):
        s0 = rg.uniform(0.35, 0.8) * Lo
        c = point_at(s0)
        t = tan_at(s0)
        e1 = _unit(np.cross(t, np.array([0, 0, 1.0])))
        ang2 = rg.uniform(0, 6.28)
        side = np.cos(ang2) * e1 + np.sin(ang2) * np.cross(t, e1)
        d = _unit(0.7 * t + 0.7 * side)
        ln = rg.uniform(0.04, 0.08)
        pts = np.array([c + d * ln * q + np.array([0, 0, -0.01 * q * q]) for q in np.linspace(0, 1, 5)])
        v, f, uv, rr = tube(pts, np.linspace(0.0010, 0.0005, 5), 5, 0.5, cap="apex")
        add_wood(v, f, uv, rr)
        for q in np.linspace(0.25, 1.0, 4):
            pq = pts[int(q * 4)]
            if rg.random() > thin:
                add_needles(_tuft(rg, pq, d, d, int(rg.integers(25, 45)), tint0))
    # 球果（直立・褐色・2〜3cm）
    if rg.random() < cones:
        s0 = rg.uniform(0.25, 0.9) * Lo
        c = point_at(s0)
        base_dir = _unit(np.array([0.2, rg.normal(0, 0.3), 1.0]))
        cl = rg.uniform(0.024, 0.034)
        m = 15
        cp = np.array([c + base_dir * cl * q for q in np.linspace(0, 1, m)])
        qq = np.linspace(0, 1, m)
        cr = (0.011 * np.sin(np.pi * np.clip(qq * 0.9 + 0.08, 0, 1)) ** 0.7 + 0.002) * (1 + 0.16 * np.cos(qq * np.pi * 14))   # うろこの段
        v, f, uv, rr = tube(cp, cr, 8, 0.5, cap="apex")
        add_wood(v, f, uv, rr * 0 + 0.006, dead=0.0)
    out = dict(
        wood=dict(verts=np.vstack(W), faces=np.vstack(F), uv=np.vstack(U), radius=np.concatenate(R), dead=np.concatenate(D)),
        needles=dict(verts=np.vstack(NV) if NV else np.zeros((0, 3)), faces=np.vstack(NF) if NF else np.zeros((0, 3), int),
                     uv=np.vstack(NU) if NU else np.zeros((0, 2)), tint=np.concatenate(NT) if NT else np.zeros(0)),
    )
    return out


def transform(part, R, p, sc):
    """部品（wood か needles）を回転 R・位置 p・倍率 sc で動かした verts を返す。"""
    return (part["verts"] * sc) @ R.T + p


def twig_variants(n=8, thin=0.15, tint0=0.3, cones=0.25, species_seed=0):
    return [build_twig((7001, species_seed, i), thin=thin * (0.6 + 0.8 * ((i * 37) % 11) / 10), tint0=tint0,
                       cones=cones) for i in range(n)]


# ---------------------------------------------------------------- 束（カード用の見本）
CLUSTER_KINDS = {
    "gold": dict(thin=0.05, tint0=0.45, cones=0.03, ntw=20),
    "thin": dict(thin=0.40, tint0=0.5, cones=0.05, ntw=16),
    "rust": dict(thin=0.22, tint0=0.72, cones=0.03, ntw=18),
    "cone": dict(thin=0.45, tint0=0.5, cones=0.5, ntw=16),
}


def build_cluster(kind, seed=0):
    """小枝を 7〜9 本ならべた枝先（約 0.6×0.4m）。XY 平面に広げる（上から撮る）。"""
    c = CLUSTER_KINDS[kind]
    rg = np.random.default_rng((8801, seed, sum(map(ord, kind))))
    parts_w, parts_n = [], []
    # 主軸
    L = 0.38
    ax = np.stack([np.linspace(0, L, 10), 0.02 * np.sin(np.linspace(0, 3, 10)), -0.01 * np.linspace(0, 1, 10) ** 2], 1)
    v, f, uv, rr = tube(ax, np.linspace(0.0035, 0.0015, 10), 6, 0.5, cap="apex")
    wood = [(v, f, uv, rr, 0.0)]
    needles = []
    for i in range(c["ntw"]):
        sv = (0.08 + 0.85 * (i + rg.uniform(-0.3, 0.3)) / c["ntw"]) * L
        sv = float(np.clip(sv, 0.03, L))
        side = 1 if i % 2 == 0 else -1
        yaw = side * np.deg2rad(rg.uniform(28, 62))
        tw = build_twig((9901, seed, i * 7 + sum(map(ord, kind))), thin=c["thin"], tint0=c["tint0"], cones=c["cones"],
                        scale=rg.uniform(0.55, 0.8))
        R = _rot_z(yaw) @ _rot_x(rg.uniform(-0.5, 0.5)) @ _rot_y(rg.uniform(-0.1, 0.25))
        p = np.array([np.interp(sv, np.linspace(0, L, 10), ax[:, k]) for k in range(3)])
        wood.append((transform(tw["wood"], R, p, 1.0), tw["wood"]["faces"], tw["wood"]["uv"], tw["wood"]["radius"], tw["wood"]["dead"]))
        needles.append((transform(tw["needles"], R, p, 1.0), tw["needles"]["faces"], tw["needles"]["uv"], tw["needles"]["tint"]))
    # 先の小枝（主軸の延長）
    tw = build_twig((9902, seed, sum(map(ord, kind))), thin=c["thin"], tint0=c["tint0"], cones=c["cones"], scale=1.0)
    R = _rot_z(rg.uniform(-0.15, 0.15))
    wood.append((transform(tw["wood"], R, ax[-1], 1.0), tw["wood"]["faces"], tw["wood"]["uv"], tw["wood"]["radius"], tw["wood"]["dead"]))
    needles.append((transform(tw["needles"], R, ax[-1], 1.0), tw["needles"]["faces"], tw["needles"]["uv"], tw["needles"]["tint"]))
    return wood, needles


def cluster_to_arrays(wood, needles):
    def cat(items, has_dead):
        V, F, U, R, D, off = [], [], [], [], [], 0
        for it in items:
            v, f, uv, rr = it[:4]
            V.append(v); F.append(f + off); U.append(uv); R.append(rr)
            D.append(np.full(len(v), it[4]) if has_dead and np.isscalar(it[4]) else (it[4] if has_dead else np.zeros(len(v))))
            off += len(v)
        return np.vstack(V), np.vstack(F), np.vstack(U), np.concatenate(R), np.concatenate(D)
    wv, wf, wu, wr, wd = cat(wood, True)
    V, F, U, T, off = [], [], [], [], 0
    for v, f, uv, t in needles:
        V.append(v); F.append(f + off); U.append(uv); T.append(t); off += len(v)
    return (dict(verts=wv, faces=wf, uv=wu, radius=wr, dead=wd),
            dict(verts=np.vstack(V), faces=np.vstack(F), uv=np.vstack(U), tint=np.concatenate(T)))


# ---------------------------------------------------------------- カード（焼き込み）
CELL_W, CELL_H = 768, 480
ATLAS_COLS, ATLAS_ROWS = 4, 3          # 4 種 × 3 通りの見本 = 12 種
CLUSTER_W, CLUSTER_H = 0.70, 0.44      # 1 マスが写す大きさ(m)


def dilate_color(arr, alpha_min=3):
    """透明な所の色を、いちばん近い不透明な画素の色で埋める（縁の黒・青のにじみを防ぐ）。arr は (H,W,4) uint8、ストレート α。"""
    from scipy.ndimage import distance_transform_edt
    a = arr.astype(np.float32)
    valid = a[..., 3] > alpha_min
    if not valid.any():
        return arr
    _, (iy, ix) = distance_transform_edt(~valid, return_indices=True)
    near = a[iy, ix, :3]
    a[..., :3] = np.where(valid[..., None], a[..., :3], near)
    return np.clip(a, 0, 255).astype(np.uint8)


def bake_atlas(out_path, threads=2, samples=64):
    """4 種の束を真上から正射影で透明背景に描き、2×2 の 1 枚（2048×1280）にして out_path へ。"""
    import bpy
    from PIL import Image
    from . import materials
    from .library import mesh_from_arrays
    kinds = list(CLUSTER_KINDS)
    atlas = Image.new("RGBA", (CELL_W * ATLAS_COLS, CELL_H * ATLAS_ROWS), (0, 0, 0, 0))
    for idx2, (row, kind) in enumerate([(r, k) for r in range(ATLAS_ROWS) for k in kinds]):
        idx = row * 10 + kinds.index(kind)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        sc.render.engine = "CYCLES"
        sc.cycles.device = "CPU"
        sc.cycles.samples = samples
        sc.cycles.use_denoising = False
        sc.render.threads_mode = "FIXED"
        sc.render.threads = threads
        sc.render.film_transparent = True
        sc.render.resolution_x, sc.render.resolution_y = CELL_W, CELL_H
        sc.render.image_settings.file_format = "PNG"
        sc.render.image_settings.color_mode = "RGBA"
        sc.view_settings.view_transform = "Standard"
        w = bpy.data.worlds.new("w")
        w.use_nodes = True
        bg = w.node_tree.nodes["Background"]
        bg.inputs[0].default_value = (1, 1, 1, 1)
        bg.inputs[1].default_value = 1.0
        sc.world = w
        wood, needles = build_cluster(kind, seed=idx)
        wd, nd = cluster_to_arrays(wood, needles)
        ob = mesh_from_arrays("cluster", wd, nd, None, [materials.bark_material(), materials.needle_material(bake_tone=materials.BAKE_TONE), materials.needle_material(bake_tone=materials.BAKE_TONE)])
        sc.collection.objects.link(ob)
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = CLUSTER_W
        cam.location = (CLUSTER_W / 2 - 0.03, 0.0, 1.0)
        cam.rotation_euler = (0, 0, 0)
        sc.collection.objects.link(cam)
        sc.camera = cam
        sc.render.filepath = out_path + f".{kind}{row}.png"
        bpy.ops.render.render(write_still=True)
        cell = Image.fromarray(dilate_color(np.asarray(Image.open(sc.render.filepath).convert("RGBA"))), "RGBA")
        atlas.paste(cell, (kinds.index(kind) * CELL_W, row * CELL_H))
    atlas.save(out_path, optimize=True)
    import os
    for kind in kinds:
        for row in range(ATLAS_ROWS):
            try:
                os.remove(out_path + f".{kind}{row}.png")
            except OSError:
                pass
    return out_path
