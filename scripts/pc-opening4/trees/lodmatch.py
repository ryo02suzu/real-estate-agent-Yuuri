"""lod の境目を測って合わせる（bpy）。実行：
    python -m trees.lodmatch calibrate fir 0 1 2 ...     # lodcal.json に書く（変種ごと）
    python -m trees.lodmatch measure fir 0 4             # 境目の数字だけ出す（lod0/1 @20m・lod1/2 @150m・lod2/3 @800m）
測り方：正射影カメラ（距離の代わりに 1m あたりの画素数 ppm）。映画のカメラ（縦の画角 32 度・2160 画素）での 1m あたりの画素数は
ppm = 3766 / 距離(m)。150m で 25.1、800m で 4.7。空は透明（明るい空の上の「影」＝アルファの面積を測る）。
光は映画と同じ太陽（方位 115 度・高さ 5 度）。見る向きは 2 つ：太陽に向かう（逆光）・太陽と直角（横から）。両方の平均を使う。
測る量：面積（m²、アルファの合計）・平均色（アルファで重みづけした線形 RGB）・明るさ（輝度）・輪郭の重なり（IoU）。
"""
import os
import sys
import math
import json
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import bpy  # noqa: E402
from trees import library, lods  # noqa: E402
from trees import species as _sp  # noqa: E402
from trees.treegen import grow_tree  # noqa: E402

TMP = os.environ.get("OP4_TMP", "/tmp/op4_trees")
os.makedirs(TMP, exist_ok=True)
SUN_AZ = 115.0
HEADINGS = (115.0, 25.0)        # 逆光（太陽に向かう）・横から
K_PPM = 3766.0                 # ppm = K_PPM / 距離
LUMA = np.array([0.2126, 0.7152, 0.0722])


def ppm_at(dist):
    return K_PPM / dist


def window(species, variant):
    P = _sp.get_params(species, variant)
    sk = grow_tree(P, species, variant)
    A = sk.anchors["pos"]
    r = float(np.hypot(A[:, 0], A[:, 1]).max()) if len(A) else 1.0
    return dict(H=float(sk.info["height"]), R=max(r, 0.6) + 1.2)


def _scene(w, h, samples):
    from trees import look
    sc = look.fresh(w, h, samples, 5.0, math.radians(-SUN_AZ), sky_strength=1.0, exposure=0.0, transparent=True)
    sc.cycles.use_denoising = False
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "32"
    return sc


def _cam(sc, win, ppm, heading, zlo=None, crop=None):
    """正射影カメラ。heading は見る向き（北から時計回り）。crop=(z0,z1,x0,x1) なら窓を絞る（近距離用）。"""
    from trees import look
    H, R = win["H"], win["R"]
    z0, z1, x0, x1 = (-0.5, H + 1.5, -R, R) if crop is None else crop
    W = int(math.ceil((x1 - x0) * ppm))
    Hh = int(math.ceil((z1 - z0) * ppm))
    sc.render.resolution_x, sc.render.resolution_y = W, Hh
    hx, hy = math.sin(math.radians(heading)), math.cos(math.radians(heading))
    rx, ry = hy, -hx                    # 画面の右向き（見る向きの右）
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    loc = (rx * cx - hx * 300, ry * cx - hy * 300, cz)
    tgt = (rx * cx, ry * cx, cz)
    cam = look.camera(sc, loc, tgt, 50, ortho=max(W, Hh) / ppm)
    return W, Hh


def _read(path):
    img = bpy.data.images.load(path)
    n = img.size[0] * img.size[1] * 4
    a = np.empty(n, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(img.size[1], img.size[0], 4)[::-1]       # 上が先頭
    bpy.data.images.remove(img)
    return a


def render_views(species, variant, lod, ppm, win, headings=HEADINGS, samples=24, crop=None, cal=None):
    """→ [(RGBA 配列（プレマルチ・線形））, …]（headings の順）"""
    if cal is not None:
        lods.OVERRIDE[(species, variant)] = cal
    sc = _scene(64, 64, samples)
    ob = library.build_tree(species, variant, lod, link=False)
    sc.collection.objects.link(ob)
    out = []
    for hd in headings:
        for o in [o for o in sc.objects if o.type == "CAMERA"]:
            bpy.data.objects.remove(o)
        _cam(sc, win, ppm, hd, crop=crop)
        p = os.path.join(TMP, f"lm_{os.getpid()}.exr")
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        out.append(_read(p))
        os.remove(p)
    lods.OVERRIDE.pop((species, variant), None)
    return out


def stats(imgs, ppm):
    """面積(m²)・平均色（線形 RGB）・輝度を、見る向きの平均で。"""
    cov, col = [], []
    for a in imgs:
        al = a[..., 3]
        cov.append(al.sum() / ppm ** 2)
        col.append(a[..., :3].sum((0, 1)) / max(al.sum(), 1e-9))
    cov, col = float(np.mean(cov)), np.mean(col, 0)
    return dict(cov=cov, col=col, luma=float(col @ LUMA))


def iou(a_imgs, b_imgs):
    r = []
    for a, b in zip(a_imgs, b_imgs):
        ma, mb = a[..., 3] > 0.5, b[..., 3] > 0.5
        r.append((ma & mb).sum() / max((ma | mb).sum(), 1))
    return float(np.mean(r))


def calibrate(species, variant, iters=4, prev=None, log=print):
    win = window(species, variant)
    p150, p800 = ppm_at(150.0) * 2, ppm_at(800.0) * 2     # 測りは画素密度の 2 倍（面積はそろう）
    ref1 = stats(render_views(species, variant, 1, p150, win), p150)
    cal = dict(s2=(prev or {}).get("s2", 1.0), g2=list((prev or {}).get("g2", [1, 1, 1])), s3=(prev or {}).get("s3", 1.0), g3=[1.0, 1.0, 1.0])
    P = _sp.get_params(species, variant)
    if P.get("standing_dead"):
        return cal, dict(note="standing_dead: 幹だけ", ref_cov=ref1["cov"])
    for it in range(iters):
        st = stats(render_views(species, variant, 2, p150, win, cal=cal), p150)
        cal["s2"] = float(np.clip(cal["s2"] * (ref1["cov"] / st["cov"]) ** (1 / 0.75), 0.3, 4.0))
        cal["g2"] = [float(np.clip(g * r, 0.2, 5.0)) for g, r in zip(cal["g2"], ref1["col"] / np.maximum(st["col"], 1e-9))]
        log(f"  lod2 it{it} 面積比 {st['cov'] / ref1['cov']:.3f} 輝度比 {st['luma'] / ref1['luma']:.3f} → s2={cal['s2']:.2f}")
    ref2 = stats(render_views(species, variant, 2, p800, win, cal=cal), p800)
    for it in range(iters):
        st = stats(render_views(species, variant, 3, p800, win, cal=cal), p800)
        cal["s3"] = float(np.clip(cal["s3"] * (ref2["cov"] / st["cov"]) ** (1 / 0.9), 0.3, 4.0))
        cal["g3"] = [float(np.clip(g * r, 0.2, 5.0)) for g, r in zip(cal["g3"], ref2["col"] / np.maximum(st["col"], 1e-9))]
        log(f"  lod3 it{it} 面積比 {st['cov'] / ref2['cov']:.3f} 輝度比 {st['luma'] / ref2['luma']:.3f} → s3={cal['s3']:.2f}")
    return cal, dict(ref1_cov=ref1["cov"], ref2_cov=ref2["cov"])


def fit1(species, variants, iters=3, log=print):
    """lod1 のカードの大きさ・色の倍率を、lod0 に面積・明るさがそろうように決める（150m 相当の画素密度・全体）。"""
    ppm = ppm_at(150.0) * 2
    refs = {}
    for v in variants:
        refs[v] = stats(render_views(species, v, 0, ppm, window(species, v)), ppm)
    tune = dict(load_cal().get(f"{species}-lod1") or dict(size=1.0, gain=1.0))
    for it in range(iters):
        lods.OVERRIDE[(species, "tune")] = dict(tune)
        cr, lr = [], []
        for v in variants:
            st = stats(render_views(species, v, 1, ppm, window(species, v)), ppm)
            cr.append(st["cov"] / refs[v]["cov"])
            lr.append(st["luma"] / refs[v]["luma"])
        c, l = float(np.mean(cr)), float(np.mean(lr))
        log(f"  fit1 {species} it{it} 面積比 {c:.3f} 輝度比 {l:.3f} (size={tune['size']:.2f} gain={tune['gain']:.2f})")
        tune["size"] = float(np.clip(tune["size"] * (1 / c) ** (1 / 0.8), 0.5, 2.5))
        tune["gain"] = float(np.clip(tune["gain"] / l, 0.3, 2.0))
    d = load_cal()
    d[f"{species}-lod1"] = tune
    save_cal(d)
    lods.OVERRIDE.pop((species, "tune"), None)
    lods.reset_cal_cache()
    return tune


def load_cal():
    try:
        return json.load(open(lods.CAL_PATH))
    except Exception:
        return {}


def save_cal(d):
    json.dump(d, open(lods.CAL_PATH, "w"), indent=1, sort_keys=True)


def measure_pair(species, variant, la, lb, dist, crop_fn=None, samples=32):
    """段 la と lb を、距離 dist のカメラ（同じ窓）で並べて測る。→ dict（面積比・輝度比・色の比・輪郭の重なり）"""
    win = window(species, variant)
    ppm = ppm_at(dist)
    mp = ppm * 2 if dist > 100 else ppm
    crop = crop_fn(win) if crop_fn else None
    ia = render_views(species, variant, la, mp, win, samples=samples, crop=crop)
    ib = render_views(species, variant, lb, mp, win, samples=samples, crop=crop)
    sa, sb = stats(ia, mp), stats(ib, mp)
    return dict(pair=f"lod{la}-lod{lb}", dist=dist, cov_a=round(sa["cov"], 2), cov_b=round(sb["cov"], 2), cov_ratio=round(sb["cov"] / sa["cov"], 3),
                luma_ratio=round(sb["luma"] / sa["luma"], 3), color_ratio=[round(float(x), 3) for x in sb["col"] / np.maximum(sa["col"], 1e-9)],
                iou=round(iou(ia, ib), 3), luma_a=round(sa["luma"], 4))


def near_crop(win):
    """20m 先：樹冠のまんなか（高さの 45〜70%・幅 ±3.5m）だけを切り出す（全体だと 4000 画素を超える）。"""
    H = win["H"]
    return (0.45 * H, 0.45 * H + 4.0, -3.5, 3.5)


if __name__ == "__main__":
    cmd, sp = sys.argv[1], sys.argv[2]
    vs = [int(x) for x in sys.argv[3:]]
    if cmd == "calibrate":
        import time
        d = load_cal()
        prev = None
        for v in vs:
            t = time.time()
            print(f"{sp}-{v} 較正", flush=True)
            cal, info = calibrate(sp, v, prev=prev, log=lambda s: print(s, flush=True))
            if not _sp.get_params(sp, v).get("standing_dead"):
                prev = cal
            d[f"{sp}-{v}"] = cal
            save_cal(d)
            lods.reset_cal_cache()
            print(f"  done {time.time() - t:.0f}s", flush=True)
    elif cmd == "fit1":
        print(fit1(sp, vs), flush=True)
    elif cmd == "finalize":      # 較正していない変種用の既定値（中央値）
        d = load_cal()
        for sp_ in ("fir", "larch"):
            rows = [v for k, v in d.items() if k.startswith(sp_ + "-") and not k.endswith("default") and not k.endswith("lod1") and v.get("s2", 1.0) != 1.0]
            if rows:
                d[sp_ + "-default"] = dict(s2=float(np.median([r["s2"] for r in rows])), s3=float(np.median([r["s3"] for r in rows])),
                                          g2=[float(np.median([r["g2"][i] for r in rows])) for i in range(3)],
                                          g3=[float(np.median([r["g3"][i] for r in rows])) for i in range(3)])
        save_cal(d)
    elif cmd == "measure":
        for v in vs:
            for la, lb, dist, cf in ((0, 1, 20.0, near_crop), (1, 2, 150.0, None), (2, 3, 800.0, None)):
                print(sp, v, measure_pair(sp, v, la, lb, dist, cf), flush=True)
