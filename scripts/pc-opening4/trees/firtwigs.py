"""モミ・ツガ類（シラビソ・オオシラビソ・コメツガ）の葉の小枝を、本物の形（メッシュ）で作る。numpy だけ（bake_atlas だけ bpy）。

実物の作り（植物の確認）：
  ・針（葉）は 1 本ずつ らせん状に枝につくが、ねじれて枝の左右に平らにならぶ（平たい葉の小枝）。上側の針は前上向きに立ち、
    下側の針は左右へ開く。長さ 1.0〜2.5cm・幅 1.5mm ほど。シラビソは裏が白い（気孔帯 2 本）。表は濃い青緑。
  ・小枝は 1 年ぶんずつの節（芽の跡）をもち、左右に交互に出る。枝先の側枝は先に向かって短くなる。
座標（小枝の局所）：+X が枝の伸びる向き、+Z が上、根元が原点。長さ 0.2〜0.3m。
針は三角形 1 枚。表（前面）が上を向く向きに作る（材質は裏面＝淡い色にする）。
出力：dict(wood=…, needles=…)。それぞれ verts, faces, uv, と属性（wood: radius/dead、needles: tint）。
"""
import numpy as np
from .treegen import tube, _unit
from .twigs import transform, _rot_z, _rot_x, _rot_y, dilate_color, CELL_W, CELL_H, ATLAS_COLS, ATLAS_ROWS, CLUSTER_W, CLUSTER_H

GOLDEN = np.deg2rad(137.5)
UP = np.array([0.0, 0.0, 1.0])


def _needles(rg, pts, T, tint0, spacing, lmul=1.0, skip=0.0, upbias=0.25):
    """1 本の軸（点列 pts・接線 T）に、らせん状に針をつける。返り値 (V, uv, tint)。"""
    cum = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    L = cum[-1]
    n = max(1, int(L / spacing))
    sv = (np.arange(n) + rg.uniform(0.0, 1.0, n)) * (L / n)
    sv = np.clip(sv, 0.001, L)
    p = np.stack([np.interp(sv, cum, pts[:, k]) for k in range(3)], 1)
    t = _unit(np.stack([np.interp(sv, cum, T[:, k]) for k in range(3)], 1))
    e1 = _unit(np.cross(t, UP))                       # 水平な横
    e2 = np.cross(e1, t)                                # ほぼ上
    ang = rg.uniform(0, 6.28) + np.arange(n) * GOLDEN + rg.normal(0, 0.2, n)
    out = np.cos(ang)[:, None] * e1 + np.sin(ang)[:, None] * e2
    out = out - np.sum(out * t, 1, keepdims=True) * t
    # 平たい葉の小枝：下向きの針は横へねじる（z を 25% に）。上側は前上向きに立つ
    oz = out[:, 2:3]
    out[:, 2:3] = np.where(oz < 0, oz * 0.25, oz)
    out = _unit(out)
    fw = 0.62 + 0.25 * np.clip(out[:, 2:3], 0, 1)         # 上側ほど前向き
    d = _unit(fw * t + (1.0 - 0.45 * fw) * out)
    d[:, 2] += upbias * 0.35
    d = _unit(d)
    keep = rg.random(n) >= skip
    L_n = rg.uniform(0.015, 0.025, n) * lmul
    w = rg.uniform(0.0016, 0.0022, n)
    s = _unit(np.cross(d, UP + rg.normal(0, 0.15, (n, 3))))   # 水平な幅方向
    s = np.where(np.sum(s * s, 1, keepdims=True) < 1e-9, e1, s)
    base = p + rg.normal(0, 0.0003, (n, 3))
    tip = base + d * L_n[:, None]
    tip[:, 2] += L_n * rg.uniform(0.05, 0.22, n)             # 針先がすこし反る
    v0, v1 = base - s * w[:, None] * 0.5, base + s * w[:, None] * 0.5
    V = np.stack([v0, v1, tip], 1)[keep].reshape(-1, 3)
    k = int(keep.sum())
    uv = np.tile(np.array([[0, 0], [1, 0], [0.5, 1.0]]), (k, 1))
    tint = np.clip(tint0 + rg.normal(0, 0.12, n), 0, 1)[keep]
    return V, uv, np.repeat(tint, 3)


def _axis(rg, L, droop, curve, n=10):
    s = np.linspace(0, L, n)
    y = curve * np.sin(s / L * rg.uniform(1.5, 3.5) + rg.uniform(0, 6)) * L * 0.08
    z = -droop * s ** 2 + 1.6 * np.clip(s / L - 0.7, 0, 1) ** 2 * L * 0.25      # 先は上へ反る
    return np.stack([s, y, z], 1)


def build_fir_twig(seed, kind="full", scale=1.0, tint0=0.5):
    """平たい葉の小枝 1 本。kind: full（ふさふさ）・sparse（まばら）・tip（梢の芽）・old（長めにたれる）。"""
    rg = np.random.default_rng(tuple(int(x) for x in seed))
    cfg = dict(full=dict(L=0.20, pairs=11, side=(0.5, 0.26), skip=0.04, sp=0.0017),
               sparse=dict(L=0.20, pairs=8, side=(0.45, 0.24), skip=0.22, sp=0.0024),
               tip=dict(L=0.17, pairs=6, side=(0.42, 0.28), skip=0.03, sp=0.0018),
               old=dict(L=0.20, pairs=9, side=(0.55, 0.28), skip=0.10, sp=0.0021))[kind]
    Ls = cfg["L"] * rg.uniform(0.9, 1.15) * scale
    W, F, U, R, D = [], [], [], [], []
    NV, NU, NT, NF = [], [], [], []
    off = noff = 0

    def add_axis(pts, rad, sp, lm, skip, tint):
        nonlocal off, noff
        T = _unit(np.gradient(pts, axis=0))
        v, f, uv, rr = tube(pts, rad, 5, 0.5, cap="apex")
        W.append(v); F.append(f + off); U.append(uv); R.append(rr); D.append(np.zeros(len(v))); off += len(v)
        V, uvn, t = _needles(rg, pts, T, tint, sp, lm, skip)
        if len(V):
            NV.append(V); NU.append(uvn); NT.append(t)
            NF.append(np.arange(len(V)).reshape(-1, 3) + noff); noff += len(V)

    main = _axis(rg, Ls, rg.uniform(0.4, 1.2), 1.0)
    add_axis(main, np.linspace(0.0016, 0.0008, len(main)), cfg["sp"], 1.0, cfg["skip"], tint0)
    cum = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(main, axis=0), axis=1))])
    flip = 1 if rg.random() < 0.5 else -1
    npair = cfg["pairs"]
    for i in range(npair):
        for sd in (flip, -flip):
            if rg.random() < (0.12 if kind != "sparse" else 0.3):
                continue
            f0 = 0.14 + 0.78 * (i + rg.uniform(-0.2, 0.2) + (0.5 if sd == -flip else 0.0)) / npair
            sv = float(np.clip(f0, 0.08, 0.95)) * Ls
            c = np.array([np.interp(sv, cum, main[:, k]) for k in range(3)])
            ll = Ls * (cfg["side"][0] * (1 - 0.85 * f0) + cfg["side"][1] * 0.2) * rg.uniform(0.8, 1.2)
            yaw = np.deg2rad(rg.uniform(30, 52)) * sd
            d0 = np.array([np.cos(yaw), np.sin(yaw), rg.uniform(-0.1, 0.12)])
            ax = _axis(rg, ll, rg.uniform(0.5, 1.5), 1.0, 8)
            xx = _unit(d0)
            zz = _unit(UP - np.dot(UP, xx) * xx)
            R3 = np.stack([xx, np.cross(zz, xx), zz], 1)
            pts = ax @ R3.T + c
            add_axis(pts, np.linspace(0.0010, 0.0005, len(pts)), cfg["sp"] * 1.05, 0.95, cfg["skip"], tint0)
    if kind == "tip":      # 梢の芽：まっすぐ上へ向く短い針の束
        for _ in range(int(rg.integers(10, 18))):
            c = main[-1] + rg.normal(0, 0.002, 3)
            dd = _unit(np.array([1.0, 0, 0.6]) + rg.normal(0, 0.45, 3))
            pts = np.stack([c, c + dd * 0.012, c + dd * 0.022])
            add_axis(pts, np.array([0.0008, 0.0007, 0.0005]), 0.0035, 1.0, 0.0, tint0)
    out = dict(
        wood=dict(verts=np.vstack(W), faces=np.vstack(F), uv=np.vstack(U), radius=np.concatenate(R), dead=np.concatenate(D)),
        needles=dict(verts=np.vstack(NV), faces=np.vstack(NF), uv=np.vstack(NU), tint=np.concatenate(NT)))
    return out


FIR_KINDS = ["full", "sparse", "tip", "old"]
CARD_KIND_P = np.array([0.5, 0.22, 0.08, 0.20])


def twig_variants(n=10, tint0=0.5, sparse=0.2, species_seed=0):
    ks = ["full", "full", "full", "sparse", "old", "full", "sparse", "old", "tip", "full"]
    return [build_fir_twig((7101, species_seed, i), ks[i % len(ks)], scale=1.0, tint0=tint0) for i in range(n)]


def build_fir_cluster(kind, seed=0):
    """カード用の見本（枠 0.30×0.225m に収まる大きさ）。"""
    tw = build_fir_twig((9101, seed, sum(map(ord, kind))), kind, scale=1.0, tint0=0.5)
    return tw["wood"], tw["needles"]


def bake_atlas(out_path, threads=2, samples=64):
    """4 種 × 3 通りの小枝を真上から正射影で透明背景に描き、4×3 の 1 枚へ（larch-cards.png と同じ配置）。"""
    import bpy, os
    from PIL import Image
    from . import materials
    from .library import mesh_from_arrays
    atlas = Image.new("RGBA", (CELL_W * ATLAS_COLS, CELL_H * ATLAS_ROWS), (0, 0, 0, 0))
    for row in range(ATLAS_ROWS):
        for ci, kind in enumerate(FIR_KINDS):
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
            wood, needles = build_fir_cluster(kind, seed=row * 10 + ci)
            ob = mesh_from_arrays("cluster", wood, needles, None,
                                  [materials.bark_material(), materials.fir_needle_material(bake=True), materials.fir_needle_material(bake=True)])
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
            atlas.paste(cell, (ci * CELL_W, row * CELL_H))
            os.remove(sc.render.filepath)
    atlas.save(out_path, optimize=True)
    return out_path
