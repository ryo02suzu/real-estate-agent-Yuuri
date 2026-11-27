"""尾根の遠景の試験（review/trees/ridge-skyline*.jpg）。
  python -m trees.ridge preview     （1280x720・24 サンプル）
  python -m trees.ridge full        （3840x2160・64 サンプル・2 スレッド）→ ridge-skyline.jpg と ridge-skyline-crops.jpg
カメラは手前の尾根の稜線と同じ高さ・太陽の 4 度横（方位 111 度）を見る。尾根 4 本（1.5・3・5・8 km）に木を 15 万本以上。
"""
import os
import sys
import math
import time
import numpy as np
import bpy
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trees import scatter, look, library  # noqa: E402

TMP = look.TMP
OUT = look.OUT
CAM_AZ = 111.0            # 北から時計回り（度）。太陽（115 度）の 4 度横
SUN_AZ, SUN_EL = 115.0, 5.0
RIDGES = [  # 距離 m・稜線の高さ（カメラ基準）m・高さのゆれ m・手前の斜面の傾き・奥の傾き・木を置く奥行き m・密度（本/ha）
    dict(d=1500.0, h=15.0, amp=45.0, sf=0.42, sb=0.30, depth=900.0, dens=260),
    dict(d=3000.0, h=95.0, amp=110.0, sf=0.45, sb=0.35, depth=800.0, dens=230),
    dict(d=5000.0, h=260.0, amp=150.0, sf=0.45, sb=0.35, depth=700.0, dens=200),
    dict(d=8000.0, h=340.0, amp=150.0, sf=0.45, sb=0.35, depth=600.0, dens=170),
]
TREELINE = 650.0
vn = scatter._value_noise


def terrain(u, d):
    """局所座標 u（右）・d（前）→ 標高（カメラ基準 m）。尾根 4 本＋ふもと。"""
    z = np.full(np.shape(u), -450.0)
    for k, r in enumerate(RIDGES):
        crest = r["h"] + r["amp"] * (vn(u, 0 * u, 900.0, 50 + k) * 1.2 - 0.6) * 2 + 0.5 * r["amp"] * (vn(u, 0 * u, 260.0, 60 + k) - 0.5)
        s = np.where(d < r["d"], r["sf"] * (r["d"] - d), r["sb"] * (d - r["d"]))
        z = np.maximum(z, crest - s)
    z = z + 30.0 * (vn(u, d, 140.0, 71) - 0.5) * 2 + 10.0 * (vn(u, d, 45.0, 72) - 0.5) * 2
    return z


def rot(u, d):
    a = math.radians(CAM_AZ)       # 前＝方位 a 。e,n へ
    return u * math.cos(a) + d * math.sin(a), -u * math.sin(a) + d * math.cos(a)


def build_points():
    allp = []
    for k, r in enumerate(RIDGES):
        half = r["d"] * 0.62 + 200.0
        reg = (-half, r["d"] - r["depth"], half, r["d"] + 80.0)
        p = scatter.make_points(reg, r["dens"], 900 + k, zfun=terrain, z_larch=-380.0, z_fir=140.0, dead_frac=0.035)
        zz = p["z"]
        du = 20.0
        slope = np.hypot((terrain(p["e"] + du, p["n"]) - terrain(p["e"] - du, p["n"])), (terrain(p["e"], p["n"] + du) - terrain(p["e"], p["n"] - du))) / (2 * du)
        ok = (np.degrees(np.arctan(slope)) < 55.0) & (zz < TREELINE)
        allp.append({kk: v[ok] for kk, v in p.items()})
    P = {kk: np.concatenate([a[kk] for a in allp]) for kk in allp[0]}
    e, n = rot(P["e"], P["n"])
    P["e"], P["n"] = e, n
    return P


def build_terrain(sc):
    mat = look._mat("rock", (0.018, 0.016, 0.012), 0.95)
    for k, r in enumerate(RIDGES):
        half = r["d"] * 0.75 + 600.0
        cs = 40.0
        us = np.arange(-half, half + cs, cs)
        ds = np.arange(r["d"] - r["depth"] - 600, r["d"] + 400, cs)
        U, D = np.meshgrid(us, ds, indexing="ij")
        Z = terrain(U, D)
        e, n = rot(U, D)
        V = np.stack([e.ravel(), n.ravel(), Z.ravel()], 1).astype(np.float32)
        ix = np.arange(U.size).reshape(U.shape)
        F = np.stack([ix[:-1, :-1].ravel(), ix[1:, :-1].ravel(), ix[1:, 1:].ravel(), ix[:-1, 1:].ravel()], 1)
        me = bpy.data.meshes.new(f"terrain{k}")
        me.from_pydata(V, [], F.tolist())
        me.materials.append(mat)
        sc.collection.objects.link(bpy.data.objects.new(f"terrain{k}", me))


def setup_world(sc, density=1.1e-4):
    """距離のもや：カメラをつつむ大きな箱（体積の散乱）。空の無限の遠くまで体積にすると真っ黒になるので、箱で区切る。
    箱の上面より低い空（水平線ぞい）にだけもやの帯が出る。"""
    U, D, Z = 26000.0, 24000.0, (-900.0, 650.0)
    cu = [(-U, -300.0), (U, -300.0), (U, D), (-U, D)]
    V, F = [], []
    for zi, zz in enumerate(Z):
        for (u, d) in cu:
            e, n = rot(u, d)
            V.append((e, n, zz))
    F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me = bpy.data.meshes.new("haze")
    me.from_pydata(V, [], F)
    m = bpy.data.materials.new("haze")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    vs = nt.nodes.new("ShaderNodeVolumeScatter")
    vs.inputs["Color"].default_value = (1.0, 0.88, 0.72, 1.0)
    vs.inputs["Density"].default_value = density
    vs.inputs["Anisotropy"].default_value = 0.55
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(vs.outputs[0], o.inputs["Volume"])
    me.materials.append(m)
    ob = bpy.data.objects.new("haze", me)
    sc.collection.objects.link(ob)


def run(mode):
    t00 = time.time()
    full = mode == "full"
    w, h, spp = (3840, 2160, 64) if full else (int(os.environ.get("PW", 1280)), int(os.environ.get("PH", 720)), 24)
    sc = look.fresh(w, h, spp, SUN_EL, math.radians(SUN_AZ), sky_strength=1.0, exposure=float(os.environ.get('EXPO', '-1.2')))
    sc.cycles.volume_bounces = 0
    sc.cycles.volume_step_rate = 4.0
    if os.environ.get("HAZE", "0.3") != "0":
        setup_world(sc, float(os.environ.get("HAZE", "0.3")) * 1.1e-4)
    P = build_points()
    cam_pos = np.array([[0.0, 0.0, 0.0]])
    tb = time.time()
    build_terrain(sc)
    r = scatter.instance_trees(P, cam_pos, "ridges")
    print("trees", r["n"], r["per_lod"], "meshes", r["n_meshes"], "setup s", round(time.time() - tb, 1), flush=True)
    a = math.radians(CAM_AZ)
    cd = bpy.data.cameras.new("cam")
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = 24.0
    cd.clip_start, cd.clip_end = 1.0, 60000.0
    cd.lens = 24.0 / (2 * math.tan(math.radians(16.0)))
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    cam.location = (0, 0, 0)
    cam.rotation_euler = (math.pi / 2, 0, -(math.radians(CAM_AZ)) + 0.0)
    cam.rotation_euler = (math.pi / 2, 0, math.radians(-CAM_AZ))
    sc.camera = cam
    t = time.time()
    p = look.render_to(sc, f"ridge_{mode}")
    print("render s", round(time.time() - t, 1), "total s", round(time.time() - t00, 1), flush=True)
    return p, r, P


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "preview"
    p, r, P = run(mode)
    im = Image.open(p).convert("RGB")
    if mode == "full":
        look.save_jpeg(im, "ridge-skyline", maxw=1600, maxkb=500)
        # 1:1 の切り出し：いちばん手前の稜線・まん中の尾根・いちばん遠い尾根（稜線の位置から探す）
        np.save(os.path.join(TMP, "ridge_full.npy"), np.asarray(im.resize((960, 540))))
    else:
        im.save(os.path.join(TMP, "ridge_preview.jpg"), quality=85)
