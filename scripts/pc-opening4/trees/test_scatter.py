"""scatter.py・library.py の試験（python -m trees.test_scatter ）。軽い。"""
import os
import sys
import numpy as np
import bpy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trees import scatter, library  # noqa: E402


def sig(ob):
    co = np.empty(len(ob.data.vertices) * 3, np.float32)
    ob.data.vertices.foreach_get("co", co)
    return len(co), round(float(co.sum()), 2)


def main():
    # 1. 点の作り方：同じ種なら同じ結果・となりの変種がちがう・種類と立ち枯れ
    reg = (0.0, 0.0, 600.0, 600.0)
    zf = lambda e, n: 1700.0 + 0.5 * n                      # noqa: E731
    a = scatter.make_points(reg, 250, 7, zfun=zf, z_larch=1900, z_fir=2000)
    b = scatter.make_points(reg, 250, 7, zfun=zf, z_larch=1900, z_fir=2000)
    assert all(np.array_equal(a[k], b[k]) for k in a), "同じ種で結果がちがう"
    n = len(a["e"])
    assert n > 3000, n
    from scipy.spatial import cKDTree
    pr = cKDTree(np.stack([a["e"], a["n"]], 1)).query_pairs(9.0, output_type="ndarray")
    same = ((a["species"][pr[:, 0]] == a["species"][pr[:, 1]]) & (a["variant"][pr[:, 0]] == a["variant"][pr[:, 1]])).mean()
    assert same < 0.002, same
    assert a["species"].min() == 0 and a["species"].max() == 1
    assert 0.9 <= a["scale"].min() - 0.0 + 0.1 and a["scale"].min() >= 0.85 and a["scale"].max() <= 1.15
    # 2. lod：全カメラ位置の最小距離
    cams = np.array([[150.0, 150.0, 1775.0], [450.0, 450.0, 1925.0]])
    lod, d = scatter.choose_lod(a, cams)
    assert lod.min() == 0 and lod.max() >= 1
    P = np.stack([a["e"], a["n"], a["z"]], 1)
    dd = np.minimum(np.linalg.norm(P - cams[0], axis=1), np.linalg.norm(P - cams[1], axis=1))
    assert np.allclose(d, dd, atol=1e-3)
    assert (lod[dd < 20 * 0.92] == 0).all() and (lod[dd > 800 * 1.08] == 3).all()
    # 3. 置く：小さな場面で本数と lod ごとの数が合う
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sub = {k: v[:400] for k, v in a.items()}
    r = scatter.instance_trees(sub, cams, "t")
    assert sum(r["per_lod"].values()) == 400
    dg = bpy.context.evaluated_depsgraph_get()
    names = [i.object.original.name for i in dg.object_instances if i.is_instance and i.parent and i.parent.original.name == "t"]
    assert len(names) == 400, len(names)
    # 名前の lod が、選んだ lod と合っている（Collection Info の並び順の取りちがえを防ぐ）
    got = np.array([int(nm.rsplit("lod", 1)[1]) for nm in names])
    assert sorted(got.tolist()) == sorted(r["lod"].tolist())
    # 4. 保存した素材集：読み込んだ物が作り直した物と同じ（固定の乱数）
    if os.path.exists(library.LIB_PATH):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        got = library.load_library(only={"fir-3-lod3", "larch-5-lod2"})
        assert set(got) == {"fir-3-lod3", "larch-5-lod2"}
        for nm, ob in got.items():
            s, v, l = nm.split("-")
            rb = library.build_tree(s, int(v), int(l[3:]), link=False)
            rb.name = "rebuilt-" + nm
            assert sig(rb) == sig(ob), (nm, sig(rb), sig(ob))
    print("test_scatter OK", n, "points")


if __name__ == "__main__":
    main()
