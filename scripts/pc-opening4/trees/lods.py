"""遠景の段 lod 2・3（カラマツ・モミ共通）。同じ骨組み（grow_tree）から作るので、輪郭・樹冠の密さ・色が lod 0/1 と同じ木になる。

  lod 2（150〜800m）：幹（6 辺）＋ 枝ごとの「葉のかたまり」（5 辺×4 輪のでこぼこした細長い塊・約 40 三角形）。合計 4000 三角形まで。
                     かたまりは枝の曲がり（たれ・先の反り）にそって置くので、段になった輪郭がそのまま出る。
  lod 3（800m 以上）：幹（5 辺）＋ 樹冠を 6 段重ねの「すそ」にした立体（7 方位・約 200 三角形）。平らな板ではない。
                     各段・各方位の外のび（葉の位置の 90 パーセンタイル）から作るので、方位ごとの出入り・梢の折れ・風でなびいた形が残る。
大きさの補正（s2・s3）と色・明るさの補正（g2・g3）は lodcal.json（lodmatch.py で測って書く）。
「境目」の合わせ方：lod 2 は lod 1 の（正射影・距離 150m 相当の）影の面積に、lod 3 は lod 2 の（800m 相当の）影の面積にそろえ、
そのうえで明るさと色を同じにする。測り方と結果は notes/trees.md。
"""
import os
import json
import numpy as np

from .treegen import wood_mesh, make_rng, LOD_WOOD, _unit, _cum, _at

HERE = os.path.dirname(os.path.abspath(__file__))
CAL_PATH = os.path.join(HERE, "lodcal.json")
_cal = None
OVERRIDE = {}          # 測定中だけ使う：{(species, variant): dict(s2=…, g2=…, s3=…, g3=…)}
DEFAULT_CAL = dict(s2=1.0, g2=[1.0, 1.0, 1.0], s3=1.0, g3=[1.0, 1.0, 1.0])
PAD = dict(fir=dict(f0=0.10, wf=0.24, hf=0.42), larch=dict(f0=0.28, wf=0.24, hf=0.55))
PAD_TRIS = 40


def get_cal(species, variant):
    global _cal
    if (species, variant) in OVERRIDE:
        return {**DEFAULT_CAL, **OVERRIDE[(species, variant)]}
    if _cal is None:
        try:
            _cal = json.load(open(CAL_PATH))
        except Exception:
            _cal = {}
    c = _cal.get(f"{species}-{variant}") or _cal.get(f"{species}-default") or {}
    return {**DEFAULT_CAL, **c}


def lod1_tune(species):
    """lod1 のカードを lod0 に合わせる補正（種類ごと）：size＝カードの大きさ倍率、gain＝色の倍率。lodmatch.py fit1 で測る。"""
    get_cal(species, -1)
    if (species, 'tune') in OVERRIDE:
        return OVERRIDE[(species, 'tune')]
    return (_cal or {}).get(f"{species}-lod1") or dict(size=1.0, gain=1.0)


def reset_cal_cache():
    global _cal
    _cal = None


def _frame(T):
    z = np.array([0.0, 0.0, 1.0])
    side = np.cross(T, z)
    if np.linalg.norm(side) < 0.2:
        side = np.cross(T, np.array([1.0, 0.0, 0.0]))
    side = side / np.linalg.norm(side)
    up = np.cross(side, T)
    return side, up / np.linalg.norm(up)


def _pad(rg, pts, cum, s0, s1, wmax, hmax, prof, sides=5):
    """軸 pts の s0〜s1 にそった、でこぼこの細長い塊。prof は 4 つの輪の太さ（0〜1）。三角形 = 3*sides*2 + sides*2 = 40。"""
    ts = np.array([0.0, 0.28, 0.55, 0.8, 1.0])
    ss = s0 + ts * (s1 - s0)
    C = np.stack([_at(pts, cum, s) for s in ss])
    V = []
    ph = rg.uniform(0, 6.28)
    for r in range(4):
        T = _unit(_at(pts, cum, min(ss[r] + 0.05, cum[-1])) - _at(pts, cum, max(ss[r] - 0.05, 0)))
        side, up = _frame(T)
        for k in range(sides):
            a = ph + 2 * np.pi * k / sides
            lump = rg.uniform(0.78, 1.18)
            V.append(C[r] + lump * prof[r] * (wmax * np.cos(a) * side + hmax * np.sin(a) * up))
    V.append(C[4] + _unit(_at(pts, cum, cum[-1]) - _at(pts, cum, max(cum[-1] - 0.1, 0))) * 0.05)    # 先の頂点
    V.append(C[0])                                                                                   # 根元のふた
    V = np.array(V)
    F = []
    for r in range(3):
        for k in range(sides):
            a0, a1 = r * sides + k, r * sides + (k + 1) % sides
            b0, b1 = a0 + sides, a1 + sides
            F += [[a0, a1, b0], [a1, b1, b0]]
    for k in range(sides):
        F.append([3 * sides + k, 3 * sides + (k + 1) % sides, 4 * sides])
        F.append([(k + 1) % sides, k, 4 * sides + 1])
    return V, np.array(F)


def foliage_pads(sk, P, species, s, rg, budget):
    live = [b for b in sk.branches if b["order"] == 1 and not b["dead"]]
    cfg = PAD[species]
    H = sk.info["height"]
    Vs, Fs = [], []
    off = 0
    if live:
        zm = np.array([b["pts"][:, 2].mean() for b in live])
        order = np.argsort(zm)
        n_max = max(1, budget // PAD_TRIS)
        pick = order if len(live) <= n_max else order[np.linspace(0, len(live) - 1, n_max).astype(int)]
        ratio = len(live) / len(pick)
        thick = ratio ** 0.6
        for i in pick:
            b = live[i]
            pts = b["pts"]
            cum = _cum(pts)
            L = cum[-1]
            if L < 0.3:
                continue
            wmax = cfg["wf"] * L * s * (1.0 + 0.5 * (thick - 1))
            hmax = cfg["hf"] * wmax * (thick ** 0.6)
            V, F = _pad(rg, pts, cum, cfg["f0"] * L, L, wmax, max(hmax, 0.05), [0.55, 0.9, 1.0, 0.7])
            Vs.append(V); Fs.append(F + off); off += len(V)
    # 梢（まっすぐ立つ木の先端）
    if not P.get("broken") and len(sk.anchors["pos"]):
        A = sk.anchors["pos"]
        top = A[:, 2] > 0.85 * H
        if top.any():
            w = max(0.25, float(np.percentile(np.hypot(A[top, 0], A[top, 1]), 90)) * 0.9) * s
            tp = sk.branches[0]["pts"]
            tc = _cum(tp)
            V, F = _pad(rg, tp, tc, tc[-1] * 0.84, tc[-1], w, w, [1.0, 0.8, 0.55, 0.3])
            Vs.append(V); Fs.append(F + off); off += len(V)
    if not Vs:
        return None
    V = np.vstack(Vs)
    return dict(verts=V, faces=np.vstack(Fs), uv=np.zeros((len(V), 2)))


def crown_hull(sk, P, species, s, rg, nt=6, ns=7):
    """lod 3：6 段のすその立体。返り値 dict(verts, faces, uv) と下端の高さ。"""
    A = sk.anchors["pos"]
    H = sk.info["height"]
    trunk = sk.branches[0]["pts"]
    tc = _cum(trunk)
    zmin = float(np.percentile(A[:, 2], 1))
    zt = float(A[:, 2].max()) + 0.3
    dz = (zt - zmin) / nt
    ctr = lambda z: np.array([np.interp(z, trunk[:, 2], trunk[:, 0]), np.interp(z, trunk[:, 2], trunk[:, 1])])
    az = np.arctan2(A[:, 1] - np.array([ctr(z)[1] for z in A[:, 2]]), A[:, 0] - np.array([ctr(z)[0] for z in A[:, 2]]))
    rho = np.hypot(A[:, 0] - np.array([ctr(z)[0] for z in A[:, 2]]), A[:, 1] - np.array([ctr(z)[1] for z in A[:, 2]]))
    ph = float(rg.uniform(0, 2 * np.pi))
    sec = ((az - ph) % (2 * np.pi)) / (2 * np.pi) * ns
    sec = sec.astype(int) % ns
    R = np.zeros((nt, ns))
    for i in range(nt):
        zi = zmin + i * dz
        m = (A[:, 2] >= zi - 0.15 * dz) & (A[:, 2] < zi + dz)
        for j in range(ns):
            mm = m & (sec == j)
            R[i, j] = np.percentile(rho[mm], 90) if mm.sum() >= 3 else (np.percentile(rho[m], 60) * 0.7 if m.sum() else 0.3)
    R = np.maximum(R, 0.25)
    R = 0.7 * R + 0.3 * (np.roll(R, 1, 1) + np.roll(R, -1, 1)) / 2     # 隣の方位となじませる
    inner = 0.5 if species == "fir" else 0.72
    V = []
    rings = []
    for i in range(nt):
        zi = zmin + i * dz
        for (z, rr) in ((zi, R[i] * s), (zi + 0.78 * dz, R[i] * s * inner)):
            c = ctr(z)
            base = len(V)
            for j in range(ns):
                a = ph + 2 * np.pi * (j + 0.5) / ns
                V.append([c[0] + rr[j] * np.cos(a), c[1] + rr[j] * np.sin(a), z])
            rings.append(base)
    ctop = ctr(zt)
    V.append([ctop[0], ctop[1], zt + 0.6 * dz])
    apex = len(V) - 1
    cb = ctr(zmin + 0.35 * dz)
    V.append([cb[0], cb[1], zmin + 0.35 * dz])
    bot = len(V) - 1
    F = []
    for r in range(len(rings) - 1):
        for j in range(ns):
            a0, a1 = rings[r] + j, rings[r] + (j + 1) % ns
            b0, b1 = rings[r + 1] + j, rings[r + 1] + (j + 1) % ns
            F += [[a0, a1, b0], [a1, b1, b0]]
    for j in range(ns):
        F.append([rings[-1] + j, rings[-1] + (j + 1) % ns, apex])
        F.append([rings[0] + (j + 1) % ns, rings[0] + j, bot])
    V = np.array(V)
    return dict(verts=V, faces=np.array(F), uv=np.zeros((len(V), 2))), zmin


def _foliage_part(geo, tone, gain, rg):
    n = len(geo["verts"])
    out = dict(geo)
    out["tone"] = np.full(n, tone)
    out["tint"] = np.clip(0.5 + rg.normal(0, 0.08, n), 0, 1)
    out["gain"] = np.tile(np.array([*gain, 1.0]), (n, 1))
    return out


def build_lod_parts(sk, P, species, variant, lod, cal):
    """(wood, foliage) を返す。foliage は None のこともある（立ち枯れ）。"""
    rg = make_rng(species, variant, 20 + lod)
    dead = bool(P.get("standing_dead"))
    if lod == 2:
        cfg = LOD_WOOD["2dead"] if dead else LOD_WOOD[2]
        wood = wood_mesh(sk, 2, species, variant, cfg=cfg)
        if dead:
            stride = 1
            while len(wood["faces"]) > 3900:      # 枝のこぶを間引いて 4000 三角形以内に
                stride += 1
                wood = wood_mesh(sk, 2, species, variant, cfg=dict(cfg, stride=stride))
            return wood, None
        budget = 4000 - len(wood["faces"]) - 60
        geo = foliage_pads(sk, P, species, cal["s2"], rg, budget)
        return wood, (_foliage_part(geo, P["tone"], cal["g2"], rg) if geo else None)
    # lod 3
    if dead:
        cfg = dict(sides={0: 6}, gap={0: 1.0}, orders=(0,), min_r2=0.0)
        return wood_mesh(sk, 3, species, variant, cfg=cfg), None
    geo, zmin = crown_hull(sk, P, species, cal["s3"], rg)
    wood = wood_mesh(sk, 3, species, variant)
    # 幹は樹冠の底より少し上まで（その上はすその中）
    v, f = wood["verts"], wood["faces"]
    keep = (v[f][:, :, 2].min(1) < zmin + 0.5)
    used = np.unique(f[keep])
    remap = -np.ones(len(v), int)
    remap[used] = np.arange(len(used))
    wood = dict(verts=v[used], faces=remap[f[keep]].astype(np.int32), uv=wood["uv"][used], radius=wood["radius"][used], dead=wood["dead"][used])
    return wood, _foliage_part(geo, P["tone"], cal["g3"], rg)


def build_lod_object(sk, P, species, variant, lod):
    from . import materials as _mat
    from .library import mesh_from_arrays
    cal = get_cal(species, variant)
    wood, fol = build_lod_parts(sk, P, species, variant, lod, cal)
    mats = [_mat.bark_material(), _mat.lod_foliage_material(species)]
    return mesh_from_arrays(f"{species}-{variant}-lod{lod}", wood, fol, None, mats, tone=P["tone"])
