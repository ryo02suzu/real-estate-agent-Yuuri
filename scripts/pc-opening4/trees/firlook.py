"""モミ（fir）と lod の確かめの絵（bpy）。実行：
    OP4_TMP=/tmp/op4_trees python -m trees.firlook sheet lodmatch stand
  sheet    ：fir-sheet.jpg（12 変種・正射影・10m の目盛りと 1.7m の人形）
  lodmatch ：lod-match.jpg（カラマツ 1 本・モミ 1 本の lod0〜3、境目 3 か所の左右比べ、数字つき）
  stand    ：fir-stand-backlit.jpg（約 400 本のモミ＋カラマツ、30〜200m、斜面、5 度の太陽の逆光）
"""
import os
import sys
import math
import json
import time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import bpy  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from trees import look, library, lods, lodmatch as lm  # noqa: E402

OUT = look.OUT
TMP = look.TMP
os.makedirs(TMP, exist_ok=True)
SUN_ROT = math.radians(-115.0)
H_VEC = np.array([math.sin(math.radians(115)), math.cos(math.radians(115))])      # 太陽の向き（x=東, y=北）
L_VEC = np.array([H_VEC[1], -H_VEC[0]])
NUM = {}


def do_sheet(species="fir", exposure=-2.6):
    panels = []
    t = time.time()
    tris = {}
    span, ortho = 9.8, 63.0
    for row in range(2):
        sc = look.fresh(1600, 800, 48, 15, math.radians(150), flat_bg=look.FLAT_BG, exposure=exposure)
        pl_m = look._mat("fl", (0.10, 0.06, 0.03), 0.95)
        bpy.ops.mesh.primitive_plane_add(size=400)
        bpy.context.active_object.data.materials.append(pl_m)
        for c in range(6):
            i = row * 6 + c
            ob = library.build_tree(species, i, 0, link=False)
            sc.collection.objects.link(ob)
            ob.location = ((c - 2.5) * span + 4.0, 0, 0)
            tris[ob.name] = ob["tris"]
        bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=1.7, location=(-30.5, -2, 0.85))
        bpy.context.active_object.data.materials.append(look._mat("mk", (0.8, 0.03, 0.03), 0.6))
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-25.0, -2, 0.1))
        sb = bpy.context.active_object
        sb.scale = (10.0, 0.1, 0.2)
        sb.data.materials.append(look._mat("sb", (0.9, 0.9, 0.9), 0.6))
        look.camera(sc, (0, -100, 13.5), (0, 0, 13.5), 50, ortho=ortho)
        im = Image.open(look.render_to(sc, f"firsheet{row}")).convert("RGB")
        d = ImageDraw.Draw(im)
        for c in range(6):
            px = 800 + ((c - 2.5) * span + 4.0) / ortho * 1600
            d.text((px - 6, 770), f"{row * 6 + c}", fill=(255, 255, 255))
        d.text((10, 750), "scale bar 10 m / figure 1.7 m", fill=(255, 255, 255))
        panels.append(im)
    sheet = Image.new("RGB", (1600, 1600))
    sheet.paste(panels[0], (0, 0))
    sheet.paste(panels[1], (0, 800))
    look.save_jpeg(sheet, "fir-sheet", maxw=1600, maxkb=400)
    NUM["sheet"] = dict(seconds=round(time.time() - t), tris_lod0=tris)


def _show(a, bg=(0.58, 0.63, 0.72), k=1.4):
    """線形のプレマルチ RGBA を、明るいもやの空の上に重ねて sRGB（どの絵も同じ変換）。"""
    rgb = a[..., :3] + (1 - a[..., 3:4]) * np.array(bg)
    x = 1 - np.exp(-k * rgb)
    x = np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0, 1), 1 / 2.4) - 0.055)
    return Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8))


def _fit(im, h, w=None):
    s = max(1, round(h / im.height)) if im.height < h else 1
    if s > 1:
        im = im.resize((im.width * s, im.height * s), Image.NEAREST)
    if im.height > h:
        im = im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)
    return im


def do_lodmatch(larch_v=4, fir_v=0):
    t = time.time()
    W = 1600
    blocks = []
    for sp, v in (("larch", larch_v), ("fir", fir_v)):
        win = lm.window(sp, v)
        # 段ごとに使う距離
        uses = [(0, 20.0, "lod0 @20 m (crop)", lm.near_crop(win)), (1, 80.0, "lod1 @80 m", None), (2, 400.0, "lod2 @400 m", None), (3, 1500.0, "lod3 @1500 m", None)]
        row = []
        for lod, dist, lab, crop in uses:
            ppm = lm.ppm_at(dist)
            a = lm.render_views(sp, v, lod, ppm, win, headings=(25.0,), samples=48, crop=crop)[0]
            row.append((_show(a), lab))
        pairs = []
        for la, lb, dist, cf in ((0, 1, 20.0, lm.near_crop), (1, 2, 150.0, None), (2, 3, 800.0, None)):
            crop = cf(win) if cf else None
            ppm = lm.ppm_at(dist)
            ia = lm.render_views(sp, v, la, ppm, win, headings=(25.0,), samples=48, crop=crop)[0]
            ib = lm.render_views(sp, v, lb, ppm, win, headings=(25.0,), samples=48, crop=crop)[0]
            m = lm.measure_pair(sp, v, la, lb, dist, cf)
            NUM.setdefault("pairs", {})[f"{sp}-{v} {m['pair']}@{int(dist)}m"] = m
            pairs.append((_show(ia), _show(ib), m, f"{sp} {v}  lod{la} | lod{lb}  @{int(dist)} m"))
        # 組み立て
        cellh = 330
        row = [(_fit(im, cellh), lab) for im, lab in row]
        pairs = [(_fit(a, cellh), _fit(b, cellh), m, lab) for a, b, m, lab in pairs]
        blk = Image.new("RGB", (W, cellh * 2 + 60), (30, 30, 30))
        d = ImageDraw.Draw(blk)
        x = 8
        for im, lab in row:
            blk.paste(im, (x, 16))
            d.text((x, 2), f"{sp} {v}: {lab}", fill=(255, 255, 255))
            x += im.width + 14
        x = 8
        y0 = cellh + 36
        for a, b, m, lab in pairs:
            blk.paste(a, (x, y0 + 14))
            blk.paste(b, (x + a.width + 2, y0 + 14))
            d.text((x, y0), lab, fill=(255, 255, 255))
            d.text((x, blk.height - 14), f"area x{m['cov_ratio']} luma x{m['luma_ratio']} IoU {m['iou']}", fill=(255, 235, 140))
            x += a.width + b.width + 22
        blocks.append(blk)
    H = sum(b.height for b in blocks)
    sheet = Image.new("RGB", (max(b.width for b in blocks), H))
    y = 0
    for b in blocks:
        sheet.paste(b, (0, y))
        y += b.height
    look.save_jpeg(sheet, "lod-match", maxw=1600, maxkb=400)
    NUM["lodmatch_seconds"] = round(time.time() - t)


# ---------------------------------------------------------------- 斜面の林
def terrain_z(x, y):
    s = x * H_VEC[0] + y * H_VEC[1]
    l = x * L_VEC[0] + y * L_VEC[1]
    return math.tan(math.radians(15.0)) * s + 0.55 * math.sin(s / 17.0 + 1.0) * math.cos(l / 23.0) + 0.35 * math.sin(l / 9.0 + s / 31.0)


def do_stand(n_fir=400, n_larch=60, w=1600, h=900, samples=64, seed=2026):
    t = time.time()
    rg = np.random.default_rng((6101, seed))
    sc = look.fresh(w, h, samples, 5.0, SUN_ROT, sky_strength=1.0, exposure=-1.1)
    # 地面
    ns = 110
    ss = np.linspace(-20, 320, ns)
    ll = np.linspace(-180, 180, ns)
    SS, LL = np.meshgrid(ss, ll)
    X = SS * H_VEC[0] + LL * L_VEC[0]
    Y = SS * H_VEC[1] + LL * L_VEC[1]
    Z = np.vectorize(terrain_z)(X, Y)
    V = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
    idx = np.arange(ns * ns).reshape(ns, ns)
    F = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], 1)
    me = bpy.data.meshes.new("ground")
    me.from_pydata(V.tolist(), [], F.tolist())
    me.materials.append(look._mat("gr", (0.018, 0.015, 0.011), 0.95))
    sc.collection.objects.link(bpy.data.objects.new("ground", me))
    cam_xy = np.array([0.0, 0.0])
    cam_z = terrain_z(0, 0) + 2.5
    # 木の位置（ダーツ投げ。最小間隔 3m）
    pts = []
    tries = 0
    while len(pts) < n_fir + n_larch and tries < 60000:
        tries += 1
        s_ = 45.0 + 215.0 * rg.random() ** 0.85
        l_ = (rg.random() * 2 - 1) * (s_ * 0.6 + 10)
        p = s_ * H_VEC + l_ * L_VEC
        if all(np.hypot(*(p - q)) > 3.0 for q, _ in pts[-300:]) and all(np.hypot(*(p - q)) > 3.0 for q, _ in pts[:-300]):
            pts.append((p, s_))
    pts = pts[:n_fir + n_larch]
    kinds = ["larch"] * n_larch + ["fir"] * (len(pts) - n_larch)
    # カラマツは手前〜中ほど・斜面の下側に、モミは全体に
    order = np.argsort([s_ for _, s_ in pts])
    kinds_sorted = [None] * len(pts)
    larch_idx = [i for i in order if rg.random() < 0.5][:n_larch]
    for i in range(len(pts)):
        kinds_sorted[i] = "larch" if i in set(larch_idx) else "fir"
    meshes = {}
    count = {"fir": 0, "larch": 0}
    lodc = {1: 0, 2: 0, 3: 0}
    tb = {}
    for (p, s_), sp in zip(pts, kinds_sorted):
        v = int(rg.integers(0, 12 if sp == "larch" else 48))
        dist = float(np.hypot(*(p - cam_xy)))
        lod = 1 if dist < 150 else (2 if dist < 800 else 3)
        key = (sp, v, lod)
        if key not in meshes:
            tt = time.time()
            ob = library.build_tree(sp, v, lod, link=False)
            tb[key] = round(time.time() - tt, 2)
            meshes[key] = ob.data
        ob = bpy.data.objects.new(f"{sp}{v}", meshes[key])
        sc.collection.objects.link(ob)
        ob.location = (p[0], p[1], terrain_z(*p) - 0.1)
        ob.rotation_euler = (0, 0, float(rg.uniform(0, 6.28)))
        sc_ = float(rg.uniform(0.88, 1.12))
        ob.scale = (sc_, sc_, sc_)
        count[sp] += 1
        lodc[lod] += 1
    NUM["stand"] = dict(count=count, lod_counts=lodc, meshes=len(meshes), mesh_tris=int(sum(len(m.polygons) for m in meshes.values())))
    look.camera(sc, (cam_xy[0], cam_xy[1], cam_z), (H_VEC[0] * 100, H_VEC[1] * 100, terrain_z(*(H_VEC * 150)) + 14.0), 28)
    im = Image.open(look.render_to(sc, "firstand")).convert("RGB")
    look.save_jpeg(im, "fir-stand-backlit", maxw=1600, maxkb=400)
    NUM["stand"]["seconds"] = round(time.time() - t)


if __name__ == "__main__":
    for a in sys.argv[1:]:
        {"sheet": do_sheet, "lodmatch": do_lodmatch, "stand": do_stand}[a]()
    print("NUM", json.dumps(NUM, default=str)[:3000])
    json.dump(NUM, open(os.path.join(TMP, "firlook_" + "_".join(sys.argv[1:]) + ".json"), "w"), default=str, indent=1)
