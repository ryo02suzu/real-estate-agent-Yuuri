"""bpy なしの確かめ。実行：python3 -m pytest -q scripts/pc-opening4/trees/test_trees.py  か  python3 test_trees.py
・同じ引数なら同じ配列（ハッシュ）・変種どうしは違う・根元は原点・NaN なし・三角形の予算
bpy が入っていれば、library.build_tree の三角形数（lod0 ≤ 40 万、lod1 ≤ 4 万）と材質 3 つ以下も確かめる。"""
import os, sys, hashlib
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trees.species import get_params, SPECIES
from trees.treegen import grow_tree, wood_mesh
from trees import twigs


def _h(*arrs):
    h = hashlib.sha256()
    for a in arrs:
        h.update(np.ascontiguousarray(a).tobytes())
    return h.hexdigest()


def _tree(v):
    sk = grow_tree(get_params("larch", v), "larch", v)
    return sk, wood_mesh(sk, 0, "larch", v)


def test_same_args_same_arrays():
    for v in (0, 5, 8, 13):
        a, wa = _tree(v)
        b, wb = _tree(v)
        assert _h(wa["verts"], wa["faces"], wa["uv"]) == _h(wb["verts"], wb["faces"], wb["uv"])
        assert _h(a.anchors["pos"], a.anchors["dir"]) == _h(b.anchors["pos"], b.anchors["dir"])


def test_twig_deterministic():
    a, b = twigs.build_twig((1, 2, 3)), twigs.build_twig((1, 2, 3))
    assert _h(a["needles"]["verts"], a["wood"]["verts"]) == _h(b["needles"]["verts"], b["wood"]["verts"])
    assert len(a["needles"]["faces"]) > 300


def _silhouette(sk):
    """高さごとの幅の組（シルエット）。"""
    pts = np.vstack([b["pts"] for b in sk.branches])
    H = pts[:, 2].max()
    bins = np.linspace(0, H, 24)
    idx = np.clip(np.digitize(pts[:, 2], bins) - 1, 0, 22)
    w = np.zeros(23)
    for i in range(23):
        m = idx == i
        if m.any():
            w[i] = np.hypot(pts[m, 0], pts[m, 1]).max()
    return H, w / max(w.max(), 1e-6)


def test_variants_differ_and_silhouettes_differ():
    hs = set()
    sils = []
    for v in range(12):
        sk, w = _tree(v)
        hs.add(_h(w["verts"]))
        sils.append(_silhouette(sk))
    assert len(hs) == 12
    for i in range(12):
        for j in range(i + 1, 12):
            hi, wi = sils[i]
            hj, wj = sils[j]
            d = abs(hi - hj) / max(hi, hj) + np.abs(wi - wj).mean()
            assert d > 0.06, (i, j, d)


def test_base_at_origin_no_nan():
    for v in range(14):
        sk, w = _tree(v)
        trunk = sk.branches[0]["pts"]
        assert np.allclose(trunk[0], 0, atol=1e-9)
        for k in ("verts", "uv", "radius"):
            assert np.isfinite(w[k]).all()
        assert np.isfinite(sk.anchors["pos"]).all()
        assert w["verts"][:, 2].min() > -0.6 and w["verts"][:, 2].min() <= 0.0


def test_wood_budgets():
    for v in range(12):
        sk = grow_tree(get_params("larch", v), "larch", v)
        assert len(wood_mesh(sk, 0, "larch", v)["faces"]) < 300_000
        assert len(wood_mesh(sk, 1, "larch", v)["faces"]) < 30_000
        assert len(sk.anchors["pos"]) > 400


def test_library_budgets_if_bpy():
    try:
        import bpy  # noqa
    except Exception:
        return
    from trees import library
    for v in (0, 8, 11):
        o0 = library.build_tree("larch", v, 0, link=False)
        o1 = library.build_tree("larch", v, 1, link=False)
        assert o0["tris"] <= 400_000 and o1["tris"] <= 40_000
        assert len(o0.data.materials) <= 3


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f()
            print("ok", n)
