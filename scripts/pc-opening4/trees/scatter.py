"""木を大量に置く（組み立て段が呼ぶ入口）。bpy と numpy（と、距離計算に scipy があれば使う）だけ。

  instance_trees(points, cam_positions, name)  …… 点の配列 → 1 つの物（ジオメトリノードの「点にインスタンス」）。
      木 1 本ごとの Blender の物は作らない。30 万本でも、点の頂点 30 万個＋属性（instance 番号・向き・大きさ）の 1 つの物。
      lod は「全カメラ位置のうち最小の距離」で決める（20 / 150 / 800 m）。境目に線が出ないよう、
      木ごとに境目の距離を ±8% ずらす（位置の hash で固定。同じ点なら同じ結果）。
  make_points(region, density, seed, ...)     …… 試験用。まとまり・すき間・林縁のある配置、種類・変種・向き・大きさつき。
points の中身（numpy 配列、長さ N）：e, n, z（geo4.py の ENU・m）, species（0=larch・1=fir）, variant（0〜47）, yaw（ラジアン）, scale。
"""
import hashlib
import numpy as np
import bpy

from . import library as _lib

SPECIES_CODE = {"larch": 0, "fir": 1}
CODE_SPECIES = {v: k for k, v in SPECIES_CODE.items()}
LOD_EDGES = (20.0, 150.0, 800.0)        # この距離より近い＝lod 0 / 1 / 2、それより遠い＝lod 3
LOD_JITTER = 0.08


def _hash01(e, n, salt=0):
    """位置から 0〜1 の固定の乱数（機械によらず同じ）。"""
    x = np.sin(e * 12.9898 + n * 78.233 + salt * 37.719) * 43758.5453
    return x - np.floor(x)


def choose_lod(points, cam_positions, edges=LOD_EDGES, jitter=LOD_JITTER):
    """各点の lod（0〜3）。全カメラ位置までの最小距離で決める。"""
    P = np.stack([points["e"], points["n"], points["z"]], 1).astype(np.float64)
    C = np.asarray(cam_positions, np.float64).reshape(-1, 3)
    try:
        from scipy.spatial import cKDTree
        d = cKDTree(C).query(P)[0]
    except Exception:
        d = np.empty(len(P))
        for i in range(0, len(P), 20000):
            d[i:i + 20000] = np.sqrt(((P[i:i + 20000, None, :] - C[None]) ** 2).sum(2)).min(1)
    j = 1.0 + jitter * (2.0 * _hash01(points["e"], points["n"], 3) - 1.0)
    lod = np.zeros(len(P), np.int32)
    for k, ed in enumerate(edges):
        lod += (d > ed * j).astype(np.int32)
    return lod, d


def _fallback_variant(species, variant, lod, cache={}):
    """保存してある変種に読みかえる（lod 0 は 0〜11 だけ）。立ち枯れは立ち枯れの変種に読みかえる。"""
    if lod != 0 or variant < _lib.N_LOD0:
        return variant
    sp = CODE_SPECIES[species]
    dead = _lib.is_dead(sp, variant)
    key = (sp, dead)
    if key not in cache:
        cache[key] = [v for v in _lib.lod0_variants(sp) if _lib.is_dead(sp, v) == dead] or _lib.lod0_variants(sp)
    pool = cache[key]
    return pool[variant % len(pool)]


def _node_group(name, coll):
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nd = ng.nodes
    gi = nd.new("NodeGroupInput")
    go = nd.new("NodeGroupOutput")
    ci = nd.new("GeometryNodeCollectionInfo")
    ci.transform_space = "RELATIVE"
    ci.inputs["Collection"].default_value = coll
    ci.inputs["Separate Children"].default_value = True
    ci.inputs["Reset Children"].default_value = True
    iop = nd.new("GeometryNodeInstanceOnPoints")
    iop.inputs["Pick Instance"].default_value = True

    def attr(nm, dt):
        a = nd.new("GeometryNodeInputNamedAttribute")
        a.data_type = dt
        a.inputs["Name"].default_value = nm
        return a
    a_idx, a_yaw, a_scl = attr("inst", "INT"), attr("yaw", "FLOAT"), attr("scl", "FLOAT")
    eul = nd.new("FunctionNodeEulerToRotation")
    cz = nd.new("ShaderNodeCombineXYZ")
    cs = nd.new("ShaderNodeCombineXYZ")
    L = ng.links.new
    L(a_yaw.outputs["Attribute"], cz.inputs["Z"])
    L(cz.outputs["Vector"], eul.inputs["Euler"])
    for ax in ("X", "Y", "Z"):
        L(a_scl.outputs["Attribute"], cs.inputs[ax])
    L(gi.outputs[0], iop.inputs["Points"])
    L(ci.outputs["Instances"], iop.inputs["Instance"])
    L(a_idx.outputs["Attribute"], iop.inputs["Instance Index"])
    L(eul.outputs["Rotation"], iop.inputs["Rotation"])
    L(cs.outputs["Vector"], iop.inputs["Scale"])
    L(iop.outputs["Instances"], go.inputs[0])
    return ng


def _child_order(coll, sc):
    """Collection Info が子を並べる順番（Blender は名前順に並べかえる）を、小さな試しで実際に読みとる。"""
    n = len(coll.objects)
    me = bpy.data.meshes.new("_ord")
    me.vertices.add(n)
    me.vertices.foreach_set("co", np.stack([np.arange(n, dtype=np.float32) * 10.0, np.zeros(n, np.float32), np.zeros(n, np.float32)], 1).ravel())
    at = me.attributes.new("inst", "INT", "POINT")
    at.data.foreach_set("value", np.arange(n, dtype=np.int32))
    for an in ("yaw", "scl"):
        a2 = me.attributes.new(an, "FLOAT", "POINT")
        a2.data.foreach_set("value", np.full(n, 1.0 if an == "scl" else 0.0, np.float32))
    ob = bpy.data.objects.new("_ord", me)
    sc.collection.objects.link(ob)
    ng = _node_group("_ord_gn", coll)
    ob.modifiers.new("s", "NODES").node_group = ng
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    got = {}
    for inst in dg.object_instances:
        if inst.is_instance and inst.parent is not None and inst.parent.original == ob:
            got[int(round(inst.matrix_world.translation.x / 10.0))] = inst.object.original.name
    sc.collection.objects.unlink(ob)
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    bpy.data.node_groups.remove(ng)
    return [got[i] for i in range(n)]


def instance_trees(points, cam_positions, name="trees", library_path=None, scene=None, lod=None):
    """木を点から置く。戻り値：dict(object, n, per_lod（lod ごとの本数）, n_meshes, lod)。
    lod を配列で渡すと自動選択を使わない（試験用）。"""
    sc = scene or bpy.context.scene
    n = len(points["e"])
    sp = np.asarray(points["species"], np.int32)
    var = np.asarray(points["variant"], np.int32)
    if lod is None:
        lod, _ = choose_lod(points, cam_positions)
    lod = np.asarray(lod, np.int32)
    # 使う（種類・変種・lod）の組を数える。lod 0 の変種は保存してある変種に読みかえる
    var_use = var.copy()
    m0 = lod == 0
    if m0.any():
        keys = np.unique(np.stack([sp[m0], var[m0]], 1), axis=0)
        mp = {(int(s), int(v)): _fallback_variant(int(s), int(v), 0) for s, v in keys}
        var_use[m0] = [mp[(int(s), int(v))] for s, v in zip(sp[m0], var[m0])]
    code = sp.astype(np.int64) * 100000 + var_use.astype(np.int64) * 10 + lod
    ucode, inv = np.unique(code, return_inverse=True)
    names = [_lib.obj_name(CODE_SPECIES[int(c // 100000)], int((c // 10) % 10000), int(c % 10)) for c in ucode]
    have = {o.name for o in bpy.data.objects}
    miss = [nm for nm in names if nm not in have]
    path = library_path or _lib.LIB_PATH
    if miss:
        import os
        if os.path.exists(path):
            _lib.load_library(path, only=set(miss))
        have = {o.name for o in bpy.data.objects}
        for nm in [m for m in miss if m not in have]:      # 保存してなければ作る（同じ結果になる）
            s, v, l = nm.split("-")
            _lib.build_tree(s, int(v), int(l[3:]), link=False)
    coll = bpy.data.collections.new(f"{name}_lib")
    for nm in names:
        coll.objects.link(bpy.data.objects[nm])
    pos = {nm: i for i, nm in enumerate(_child_order(coll, sc))}
    inv = np.array([pos[nm] for nm in names], np.int32)[inv]
    # 点の物（頂点だけのメッシュ）
    me = bpy.data.meshes.new(f"{name}_pts")
    P = np.stack([points["e"], points["n"], points["z"]], 1).astype(np.float32)
    me.vertices.add(n)
    me.vertices.foreach_set("co", P.ravel())
    for an, dt, arr in (("inst", "INT", inv.astype(np.int32)), ("yaw", "FLOAT", np.asarray(points["yaw"], np.float32)),
                        ("scl", "FLOAT", np.asarray(points["scale"], np.float32))):
        at = me.attributes.new(an, dt, "POINT")
        at.data.foreach_set("value", arr)
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    md = ob.modifiers.new("scatter", "NODES")
    md.node_group = _node_group(f"{name}_gn", coll)
    per = {int(k): int((lod == k).sum()) for k in range(4)}
    return dict(object=ob, n=n, per_lod=per, n_meshes=len(names), lod=lod)


# ---------------------------------------------------------------------------
# 試験用の配置
# ---------------------------------------------------------------------------
def _value_noise(e, n, scale, seed):
    """なめらかな 0〜1 の雑音（格子の乱数を滑らかに補間）。"""
    rg = np.random.default_rng((seed, int(scale)))
    G = rg.random((256, 256))
    x = (e / scale) % 256.0
    y = (n / scale) % 256.0
    i, j = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - i, y - j
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    i1, j1 = (i + 1) % 256, (j + 1) % 256       # 256 格子ごとにくり返す（継ぎ目なし）
    return (G[i, j] * (1 - fx) * (1 - fy) + G[i1, j] * fx * (1 - fy) + G[i, j1] * (1 - fx) * fy + G[i1, j1] * fx * fy)


def make_points(region, density, seed, zfun=None, z_larch=1500.0, z_fir=2100.0, dead_frac=0.03, spacing_min=2.5,
                n_variants=_lib.N_VARIANTS, neighbour_r=9.0, scale_range=(0.85, 1.15)):
    """region＝(e0, n0, e1, n1)（m）。density＝1 ha あたりの木の本数の目安（例 250＝間隔 約 6m）。
    zfun(e, n)→標高（なければ 0。種類は標高で決める：z_larch より低い＝larch・z_fir より高い＝fir・間＝混ざる）。
    まとまり（雑音で濃淡）・すき間・林縁（雑音のしきい値）あり。立ち枯れはかたまりでところどころ（dead_frac）。
    変種は位置の hash で選び、neighbour_r m 以内に同じ種類・同じ変種が並ばないように引きなおす。"""
    from scipy.spatial import cKDTree
    e0, n0, e1, n1 = region
    rg = np.random.default_rng((8801, seed))
    cell = max(spacing_min, 100.0 / np.sqrt(density) * 0.7)       # 格子の 1 目（最大密度のとき 1 目 1 本）
    ge = np.arange(e0, e1, cell)
    gn = np.arange(n0, n1, cell)
    E, N = np.meshgrid(ge, gn, indexing="ij")
    E = E.ravel() + rg.uniform(-0.5, 0.5, E.size) * cell
    N = N.ravel() + rg.uniform(-0.5, 0.5, N.size) * cell
    ok = (E >= e0) & (E < e1) & (N >= n0) & (N < n1)
    E, N = E[ok], N[ok]
    # 密度の場：大きなまとまり（200m）＋小さなまとまり（40m）＋すき間（15m）
    f = 0.55 * _value_noise(E, N, 220.0, seed) + 0.30 * _value_noise(E, N, 45.0, seed + 1) + 0.15 * _value_noise(E, N, 14.0, seed + 2)
    want = (density / 100.0 ** 2) * cell * cell                    # 1 目あたりの本数の目安（最大密度に対する比）
    p = np.clip((f - 0.30) / 0.30, 0.0, 1.0) ** 0.8 * min(1.0, want * 1.6)
    keep = rg.random(E.size) < p
    E, N = E[keep], N[keep]
    z = zfun(E, N) if zfun is not None else np.zeros_like(E)
    z = np.asarray(z, np.float64)
    # 種類：高い所は fir・低い所は larch・間は混ざる（雑音でまだら）
    mixv = np.clip((z - z_larch) / max(z_fir - z_larch, 1.0), 0, 1) + (_value_noise(E, N, 60.0, seed + 3) - 0.5) * 0.5
    species = (mixv > 0.5).astype(np.int32)
    # 立ち枯れのかたまり
    dz = _value_noise(E, N, 35.0, seed + 4)
    dead = (dz > 1.0 - dead_frac * 2.2) & (rg.random(E.size) < 0.6)
    # 変種：位置の hash。立ち枯れの変種は立ち枯れの木にだけ使う
    live = {s: np.array([v for v in range(n_variants) if not _lib.is_dead(CODE_SPECIES[s], v)]) for s in (0, 1)}
    deadv = {s: np.array([v for v in range(n_variants) if _lib.is_dead(CODE_SPECIES[s], v)]) for s in (0, 1)}
    species[dead & (deadv[0].size == 0)] = 1
    var = np.zeros(E.size, np.int32)
    for s in (0, 1):
        for isd, pool in ((False, live[s]), (True, deadv[s])):
            m = (species == s) & (dead == isd)
            if m.any() and len(pool):
                h = (_hash01(E[m], N[m]) * len(pool)).astype(int) % len(pool)
                var[m] = pool[h]
    # となり同士で同じ変種が並ばないように
    tree = cKDTree(np.stack([E, N], 1))
    pairs = tree.query_pairs(neighbour_r, output_type="ndarray")
    for it in range(12):
        if not len(pairs):
            break
        a, b = pairs[:, 0], pairs[:, 1]
        clash = (species[a] == species[b]) & (var[a] == var[b])
        if not clash.any():
            break
        bad = np.unique(b[clash])
        for i in bad:
            s = species[i]
            pool = deadv[s] if dead[i] else live[s]
            if len(pool) > 1:
                var[i] = pool[int(_hash01(E[i], N[i], 7 + it) * len(pool)) % len(pool)]
        pairs = pairs[(species[pairs[:, 0]] == species[pairs[:, 1]])]
    yaw = rg.uniform(0, 2 * np.pi, E.size)
    scale = rg.uniform(scale_range[0], scale_range[1], E.size)
    return dict(e=E, n=N, z=z, species=species, variant=var, yaw=yaw, scale=scale, dead=dead)
