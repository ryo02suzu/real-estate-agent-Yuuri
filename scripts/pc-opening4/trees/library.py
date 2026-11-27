"""木の素材集（bpy）。build_tree(species, variant, lod) が 1 本ぶんの 1 つのメッシュ物を返す。

  原点＝根元・+Z が上・単位 m・本当の大きさ。材質は 3 つ（0=樹皮と小枝、1=針、2=カード）。
  lod 0：幹・枝・小枝（本物の形）＋外側の殻に本物の葉の小枝（針 1 本ずつ）＋その間をカードでうめる（三角形 40 万まで）
  lod 1：幹・枝（細め）＋カード（4 万まで）
  lod 2：同じ作りで、もっと粗いカード（8 千まで）。 lod 3（その木自身の絵を貼った板）は場面を組む側が
         lod 1 の見た目を焼いて作る（この関数は NotImplementedError。フック _bake_billboard を用意）。
属性（頂点）：radius・dead（樹皮の材質が使う）、tint（針 1 本ずつの色ずれ）、tone（木ごとの色）。
"""
import time
import numpy as np
import bpy

from . import species as _sp
from .treegen import grow_tree, wood_mesh, make_rng, _unit
from . import twigs as _tw
from . import materials as _mat
from . import firtwigs as _ft

LOD_FOLIAGE = {
    # card_size：カード 1 枚の大きさ（絵 0.70m 幅に対する倍率）。LOD1 は最大 0.4m のふさ
    # planes：1 枚のカードを何枚の板の十字にするか。card_size：絵 0.30m 幅に対する倍率（LOD0 で幅 約 0.2m のふさ）
    0: dict(twig_tris=190_000, card_cell=0.10, card_size=0.85, max_tris=395_000, keep=1.0, extra_step=0.08, planes=2),
    1: dict(twig_tris=0, card_cell=0.12, card_size=1.05, max_tris=39_000, keep=0.95, extra_step=0.08, planes=1),
    2: dict(twig_tris=0, card_cell=0.4, card_size=2.4, max_tris=8_000, keep=0.75, extra_step=0.2, planes=1),
}
LOD_FOLIAGE_FIR = {
    # 細いモミの樹冠は密。lod0 は「近くの 25m 以遠でも立つ」ことが目標なので、本物の小枝は 7 万に抑え、カードで密にする
    0: dict(twig_tris=70_000, card_cell=0.065, card_size=1.1, max_tris=330_000, keep=1.0, extra_step=0.06, planes=2),
    1: dict(twig_tris=0, card_cell=0.10, card_size=1.25, max_tris=39_000, keep=1.0, extra_step=0.07, planes=1),
}
CARD_KIND_P = np.array([0.42, 0.30, 0.18, 0.10])   # gold, thin, rust, cone
_twig_cache = {}


def mesh_from_arrays(name, wood, needles, cards, mats, tone=None):
    """wood / needles / cards（どれも None 可）を 1 つのメッシュ物にする。材質番号 0/1/2。"""
    parts = []
    for mi, part in ((0, wood), (1, needles), (2, cards)):
        if part is not None and len(part["faces"]):
            parts.append((mi, part))
    V, F, UV, MI, rad, dead, tint, tn, gn = [], [], [], [], [], [], [], [], []
    off = 0
    for mi, p in parts:
        n = len(p["verts"])
        V.append(p["verts"]); F.append(p["faces"] + off); UV.append(p["uv"])
        MI.append(np.full(len(p["faces"]), mi))
        rad.append(p.get("radius", np.full(n, 0.0)))
        dead.append(p.get("dead", np.zeros(n)))
        tint.append(p.get("tint", np.full(n, 0.5)))
        tn.append(p["tone"] if "tone" in p else np.full(n, 0.0 if tone is None else tone))
        gn.append(p.get("gain", np.ones((n, 4))))
        off += n
    V = np.vstack(V).astype(np.float32)
    F = np.vstack(F).astype(np.int32)
    UV = np.vstack(UV).astype(np.float32)
    me = bpy.data.meshes.new(name)
    me.from_pydata(V, [], F)
    uvl = me.uv_layers.new(name="UVMap")
    uvl.data.foreach_set("uv", UV[F.ravel()].ravel())
    me.polygons.foreach_set("material_index", np.concatenate(MI).astype(np.int32))
    me.polygons.foreach_set("use_smooth", np.ones(len(F), bool))
    for an, arr in (("radius", rad), ("dead", dead), ("tint", tint), ("tone", tn)):
        at = me.attributes.new(an, "FLOAT", "POINT")
        at.data.foreach_set("value", np.concatenate(arr).astype(np.float32))
    ga = me.attributes.new("gain", "FLOAT_COLOR", "POINT")
    ga.data.foreach_set("color", np.vstack(gn).astype(np.float32).ravel())
    for m in mats:
        me.materials.append(m)
    me.update()
    return bpy.data.objects.new(name, me)


def _twigs_for(species, thin, tint0):
    key = (species, round(thin, 2), round(tint0, 2))
    if key not in _twig_cache:
        if species == "fir":
            _twig_cache[key] = _ft.twig_variants(10, tint0=0.5)
        else:
            _twig_cache[key] = _tw.twig_variants(10, thin=thin, tint0=tint0, cones=0.25)
    return _twig_cache[key]


def _basis(d, up):
    x = _unit(d)
    z = _unit(up - np.sum(up * x, 1, keepdims=True) * x)
    y = np.cross(z, x)
    return np.stack([x, y, z], 2)      # (N,3,3) 列が x, y, z


def real_twigs(sk, P, species, variant, budget_tris, rg):
    """外側の殻から本物の葉の小枝を選び、配置して、wood と needles を返す。"""
    A = sk.anchors
    n = len(A["pos"])
    if n == 0 or budget_tris <= 0:
        return None, None, np.zeros(n, bool)
    vars_ = _twigs_for(species, 0.1 + 0.6 * P["bare"], 0.15 + 0.5 * P["tone"])
    avg = np.mean([len(v["needles"]["faces"]) + len(v["wood"]["faces"]) for v in vars_])
    k = int(budget_tris / avg)
    w = (np.clip(A["shell"], 0, 1.2) ** 3) * (0.35 + A["kind"] * 0 + (1 - A["kind"]) * 0.4 + rg.random(n))
    w[A["age"] > 0.9] *= 0.5
    chosen = np.argsort(-w)[:k]
    sel = np.zeros(n, bool)
    sel[chosen] = True
    R = _basis(A["dir"], A["up"])
    Wl, Nl = [], []
    woff = noff = 0
    W = dict(verts=[], faces=[], uv=[], radius=[], dead=[])
    N = dict(verts=[], faces=[], uv=[], tint=[])
    for i in chosen:
        tv = vars_[int(rg.integers(0, len(vars_)))]
        sc = A["scale"][i] * (1.0 if A["kind"][i] else 0.9)
        wv = _tw.transform(tv["wood"], R[i], A["pos"][i], sc)
        W["verts"].append(wv); W["faces"].append(tv["wood"]["faces"] + woff); W["uv"].append(tv["wood"]["uv"])
        W["radius"].append(tv["wood"]["radius"] * sc); W["dead"].append(tv["wood"]["dead"]); woff += len(wv)
        nv = _tw.transform(tv["needles"], R[i], A["pos"][i], sc)
        N["verts"].append(nv); N["faces"].append(tv["needles"]["faces"] + noff); N["uv"].append(tv["needles"]["uv"])
        N["tint"].append(np.clip(tv["needles"]["tint"] + rg.normal(0, 0.07), 0, 1)); noff += len(nv)
    out = []
    for D in (W, N):
        out.append({k2: (np.vstack(v) if k2 in ("verts", "faces", "uv") else np.concatenate(v)) for k2, v in D.items()})
    return out[0], out[1], sel


def _merge_extra(sk, rg, step):
    """枝（1 次・2 次）の上に、細かい間隔で葉のふさの取り付け位置を足す（樹冠をふさふさにするため）。"""
    A = sk.anchors
    pos, dr, up, scl = [A["pos"]], [A["dir"]], [A["up"]], [A["scale"]]
    for b in sk.branches:
        if b["order"] < 1 or b["dead"]:
            continue
        pts = b["pts"]
        cum = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
        L = cum[-1]
        st = step * (1.0 if b["order"] == 1 else 0.8)
        s0 = L * (0.3 if b["order"] == 1 else 0.15)
        if L - s0 < st:
            continue
        sv = np.arange(s0, L, st) + rg.uniform(0, st, 1)
        sv = sv[sv < L]
        p = np.stack([np.interp(sv, cum, pts[:, k]) for k in range(3)], 1)
        e = 0.05 * max(L, 0.2)
        t = np.stack([np.interp(np.minimum(sv + e, L), cum, pts[:, k]) - np.interp(np.maximum(sv - e, 0), cum, pts[:, k]) for k in range(3)], 1)
        t = _unit(t)
        d = _unit(t + rg.normal(0, 0.55, t.shape))
        u = _unit(np.array([0, 0, 1.0]) + rg.normal(0, 0.5, t.shape))
        pos.append(p + rg.normal(0, 0.05, p.shape)); dr.append(d); up.append(u); scl.append(rg.uniform(0.75, 1.2, len(sv)))
    pos, dr, up, scl = np.vstack(pos), np.vstack(dr), np.vstack(up), np.concatenate(scl)
    rho = np.hypot(pos[:, 0], pos[:, 1])
    zb = np.clip((pos[:, 2] / 1.5).astype(int), 0, None)
    mx = np.zeros(zb.max() + 1)
    np.maximum.at(mx, zb, rho)
    mx = np.convolve(np.pad(mx, 1, mode="edge"), np.ones(3) / 3, mode="valid")
    shell = rho / np.maximum(mx[zb], 0.3)
    return dict(pos=pos, dir=dr, up=up, scale=scl, shell=shell)


def foliage_cards(sk, P, cfg, skip, rg, tris_left, species="larch"):
    """アンカーから、細かい格子ごとに 1 枚（外側ほど優先）、2 枚を十字に組んだカードを作る。"""
    A = _merge_extra(sk, rg, cfg["extra_step"])
    n = len(A["pos"])
    if n == 0:
        return None
    skip = np.concatenate([skip, np.zeros(n - len(skip), bool)])
    cell = cfg["card_cell"]
    key = np.floor(A["pos"] / cell).astype(np.int64)
    kh = (key[:, 0] * 73856093) ^ (key[:, 1] * 19349663) ^ (key[:, 2] * 83492791)
    order = np.lexsort((-A["shell"], kh))
    first = np.ones(n, bool)
    first[1:] = kh[order][1:] != kh[order][:-1]
    pick = order[first]
    pick = pick[~skip[pick]]
    H = sk.info["height"]
    shell = np.clip(A["shell"][pick], 0, 1.1)
    rho = np.hypot(A["pos"][pick, 0], A["pos"][pick, 1])
    # 落ちて葉がない所・内側の葉（幹が透けて見えるように、幹のまわりと内側をうすく）
    pk = cfg["keep"] * (1 - P["bare"] * 0.8) * np.clip(0.35 + 0.9 * shell, 0.2, 1.0) * np.clip(0.3 + rho / P.get("rho_k", 1.2), 0.3, 1.0)
    keep = rg.random(len(pick)) < pk
    pick = pick[keep]
    shell = shell[keep]
    npl = cfg.get("planes", 2)
    maxc = max(0, int(tris_left // (2 * npl)))
    if len(pick) > maxc:
        sel = np.argsort(-A["shell"][pick])[:maxc]
        pick, shell = pick[sel], shell[sel]
    m = len(pick)
    if m == 0:
        return None
    R = _basis(A["dir"][pick], A["up"][pick])
    sc = A["scale"][pick] * cfg["card_size"] * rg.uniform(0.7, 1.2, m)
    kind = rg.choice(4, m, p=_ft.CARD_KIND_P if species == "fir" else CARD_KIND_P)
    if species != "fir":      # 色が高い（さび色）木は、さび色の束が多い
        kind = np.where((rg.random(m) < P["tone"] * 0.35) & (kind == 0), 2, kind)
    variant_row = rg.integers(0, _tw.ATLAS_ROWS, m)
    cw, ch = _tw.CLUSTER_W, _tw.CLUSTER_H
    x0, x1 = -0.03, cw - 0.03
    y0, y1 = -ch / 2, ch / 2
    corners = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    V = []
    roll0 = np.deg2rad(rg.uniform(-60, 60, m) if npl == 2 else rg.uniform(-90, 90, m))           # カードの向きを枝のまわりでばらす（どれも正面を向かない）
    for q in range(npl):
        roll = roll0 if q == 0 else roll0 + np.deg2rad(rg.uniform(50, 85, m)) * np.where(rg.random(m) < 0.5, 1, -1)
        cr, sr = np.cos(roll), np.sin(roll)
        for c in corners:
            lx = c[0] * sc
            ly = c[1] * sc
            loc = np.stack([lx, ly * cr, ly * sr], 1)
            V.append(np.einsum("nij,nj->ni", R, loc) + A["pos"][pick])
    V = np.stack(V, 1)            # (m, 8, 3)
    # UV：4 列 × 3 行のマス
    cx, cy = kind, variant_row
    ncol, nrow = _tw.ATLAS_COLS, _tw.ATLAS_ROWS
    u0 = cx / ncol
    v0 = 1.0 - (cy + 1) / nrow
    cu = np.array([0, 1, 1, 0]) / ncol
    cv = np.array([0, 0, 1, 1]) / nrow
    uv = np.stack([np.stack([u0 + cu[i], v0 + cv[i]], 1) for i in range(4)] * npl, 1)
    eps = 0.0015
    uv[:, :, 0] = np.clip(uv[:, :, 0], (u0 + eps)[:, None], (u0 + 1.0 / ncol - eps)[:, None])
    uv[:, :, 1] = np.clip(uv[:, :, 1], (v0 + eps)[:, None], (v0 + 1.0 / nrow - eps)[:, None])
    b = np.arange(m) * (4 * npl)
    fl = [b + 0, b + 1, b + 2, b + 0, b + 2, b + 3]
    if npl == 2:
        fl += [b + 4, b + 5, b + 6, b + 4, b + 6, b + 7]
    faces = np.stack(fl, 1).reshape(-1, 3)
    # 木の中の色ずれ：外側・上は橙寄り（+5 度）、内側・下は緑寄り（-8〜-15 度）。1 枚ごとに ±4 度
    zrel = A["pos"][pick, 2] / max(H, 1.0)
    off = np.interp(shell, [0.2, 0.75, 1.0], [-0.4, 0.0, 0.17]) + 0.2 * (zrel - 0.5) + rg.normal(0, 0.12, m)
    tone = np.clip(P["tone"] + off, 0, 1)
    return dict(verts=V.reshape(-1, 3), faces=faces, uv=uv.reshape(-1, 2), tone=np.repeat(tone, 4 * npl))


def build_tree(species="larch", variant=0, lod=0, link=True, timing=None):
    t0 = time.time()
    P = _sp.get_params(species, variant)
    sk = grow_tree(P, species, variant)
    fir = species == "fir"
    if lod >= 2:
        ob = _lods.build_lod_object(sk, P, species, variant, lod)
    else:
        cfg = (LOD_FOLIAGE_FIR if fir else LOD_FOLIAGE)[lod]
        tune = _lods.lod1_tune(species) if lod == 1 else dict(size=1.0, gain=1.0)
        cfg = dict(cfg, card_size=cfg["card_size"] * tune["size"])
        wood = wood_mesh(sk, lod, species, variant)
        rg = make_rng(species, variant, 5 + lod)
        tris = len(wood["faces"])
        tw_w = tw_n = None
        skip = np.zeros(len(sk.anchors["pos"]), bool)
        if cfg["twig_tris"] > 0 and not P.get("standing_dead"):
            tb = min(cfg["twig_tris"], cfg["max_tris"] - tris - 40_000)
            tw_w, tw_n, skip = real_twigs(sk, P, species, variant, tb, rg)
            if tw_w is not None:
                off = len(wood["verts"])
                wood = dict(verts=np.vstack([wood["verts"], tw_w["verts"]]), faces=np.vstack([wood["faces"], tw_w["faces"] + off]),
                            uv=np.vstack([wood["uv"], tw_w["uv"]]), radius=np.concatenate([wood["radius"], tw_w["radius"]]),
                            dead=np.concatenate([wood["dead"], tw_w["dead"]]))
                tris = len(wood["faces"]) + len(tw_n["faces"])
        cards = None if P.get("standing_dead") else foliage_cards(sk, P, cfg, skip, rg, cfg["max_tris"] - tris, species)
        if cards is not None:
            cards["gain"] = np.tile(np.array([tune["gain"]] * 3 + [1.0]), (len(cards["verts"]), 1))
        if fir:
            mats = [_mat.bark_material(), _mat.fir_needle_material(), _mat.fir_card_material()]
        else:
            mats = [_mat.bark_material(), _mat.needle_material(), _mat.card_material()]
        ob = mesh_from_arrays(f"{species}-{variant}-lod{lod}", wood, tw_n, cards, mats, tone=P["tone"])
    ob["species"], ob["variant"], ob["lod"] = species, int(variant), int(lod)
    ob["height"] = float(sk.info["height"])
    ob["tone"] = float(P["tone"])
    ob["tris"] = int(len(ob.data.polygons))
    if link:
        coll = bpy.data.collections.get("MICHILU_trees") or bpy.data.collections.new("MICHILU_trees")
        if coll.name not in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.link(coll)
        coll.objects.link(ob)
    if timing is not None:
        timing[ob.name] = time.time() - t0
    return ob


def build_library(species=None, variants=None, lods=(0, 1), link=True):
    """名前 "<種類>-<番号>-lod<段>" → 物。species=None なら全種類、variants=None なら手で決めた型すべて。"""
    out = {}
    for sp in ([species] if species else list(_sp.SPECIES)):
        vs = variants if variants is not None else range(_sp.SPECIES[sp]["n_hand_variants"])
        for v in vs:
            for l in lods:
                ob = build_tree(sp, v, l, link=link)
                out[ob.name] = ob
    return out


from . import lods as _lods  # noqa: E402（lods は mesh_from_arrays を使うので最後に読む）


# ---------------------------------------------------------------------------
# 保存した木の素材集（.blend）。描画する機械は作り直さず、これを読む。
# 中身は固定の乱数だけで決まるので、作り直しても同じ結果になる（test_trees.py で確かめる）。
# ---------------------------------------------------------------------------
import os  # noqa: E402

WORK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "work")
LIB_PATH = os.path.join(WORK, "trees", "library.blend")
N_VARIANTS = 48          # 種類ごとの変種の数（0〜47）。手で決めた型は larch 12・fir 24、残りは連続的にばらつく木
N_LOD0 = 12              # lod 0 を保存する変種の数（0〜11）。lod 0 は 1 本 20〜30 万三角形で重いので 12 本まで
LIB_COLLECTION = "MICHILU_treelib"


def obj_name(species, variant, lod):
    return f"{species}-{int(variant)}-lod{int(lod)}"


def is_dead(species, variant):
    return bool(_sp.get_params(species, variant).get("standing_dead"))


def lod0_variants(species):
    return list(range(N_LOD0))


def save_library(path=LIB_PATH, species=("larch", "fir"), n_variants=N_VARIANTS, n_lod0=N_LOD0, log=None):
    """全変種の lod 1〜3 と、先頭 n_lod0 変種の lod 0 を 1 つの .blend に保存する。シーンには出さない（読むときに選ぶ）。
    戻り値：dict(seconds, bytes, n_objects, tris={lod: 合計三角形})"""
    t0 = time.time()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    coll = bpy.data.collections.new(LIB_COLLECTION)
    coll.use_fake_user = True
    tris = {0: 0, 1: 0, 2: 0, 3: 0}
    n = 0
    for sp in species:
        for v in range(n_variants):
            for lod in (0, 1, 2, 3):
                if lod == 0 and v >= n_lod0:
                    continue
                ob = build_tree(sp, v, lod, link=False)
                coll.objects.link(ob)
                tris[lod] += ob["tris"]
                n += 1
            if log:
                log(f"{sp} {v} done {time.time() - t0:.0f}s")
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    return dict(seconds=time.time() - t0, bytes=os.path.getsize(path), n_objects=n, tris=tris)


def load_library(path=LIB_PATH, only=None):
    """保存した .blend から木の物を読む（シーンには出さない）。only＝名前の集合（None なら全部）。
    すでに読み込んである物は読み直さない。戻り値：dict 名前 → 物。"""
    have = {o.name for o in bpy.data.objects}
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        want = [nm for nm in src.objects if (only is None or nm in only) and nm not in have]
        dst.objects = want
    out = {}
    for nm in (only if only is not None else [o.name for o in bpy.data.objects]):
        ob = bpy.data.objects.get(nm)
        if ob is not None and "species" in ob.keys():
            out[nm] = ob
    return out


if __name__ == "__main__":
    import sys
    r = save_library(sys.argv[1] if len(sys.argv) > 1 else LIB_PATH, log=lambda s: print(s, flush=True))
    print("RESULT", r)
