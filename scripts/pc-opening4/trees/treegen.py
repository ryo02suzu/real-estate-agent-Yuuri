"""木の骨組みと幹・枝のメッシュを作る（numpy だけ。bpy は使わない）。

考え方（Weber-Penn の流れ）：
  幹（0 次）に枝（1 次）が輪生状に出て、枝に小枝（2 次）が左右に出て、
  小枝に「葉の小枝」（3 次。形は twigs.py）の取り付け位置（アンカー）が並ぶ。
  長さ・角度・たれ・先の反りは高さと樹齢で変わる。下の枯れ枝・樹冠の偏り・風・折れた梢・二股に対応。
  針葉樹（excurrent：まっすぐ 1 本の幹）も、広葉樹（decurrent：幹が途中で何本かに分かれる）も
  同じ道具で作る（パラメータの違いだけ）。

乱数は全部 np.random.default_rng((種類, 番号, 塩)) から（どの機械でも同じ木になる）。
座標：m、+Z が上、根元が原点。
"""
import numpy as np

# ---------------------------------------------------------------- 既定値
DEFAULTS = dict(
    height=22.0, r0=0.25, taper=0.85, tip_r=0.02,
    sweep=0.07, sweep_wl=14.0, lean=0.0, lean_az=0.0,
    crown_base=0.28,                # 生きた枝が始まる高さ（H に対する割合）
    top_frac=1.0,                   # 梢の高さ（折れた木は <1）
    broken=False, n_leaders=1, fork_h=0.7, fork_ang=22.0,
    kind="excurrent",
    whorl_gap=(0.5, 0.9), whorl_n=(3, 5),      # 段と段のすき間 0.4〜0.9m（枝がたれた分）
    lenmax=0.2, peak_a=0.55, peak_b=0.9,   # 枝の長さの山の形 x^a (1-x)^b
    ang_lo=112.0, ang_hi=52.0, ang_jit=7.0,  # 幹との角度：樹冠の下＝水平より 20 度下、まん中＝水平、上＝水平より 35 度上
    droop=0.24, tipup=1.7, tip_from=0.8, wig=0.05,    # 枝先の 20% は上へ反る
    o2_gap=(0.22, 0.42), o2_ratio=0.34, o2_ang=(55.0, 80.0),
    o2_droop=0.55, o2_tipup=0.45, o2_wig=0.12, o2_min=0.14,
    twig_gap=0.07, twig_ratio_min=0.0,
    asym=((0.25, 0.0),), wind_az=0.0, wind=0.0,   # 偏り（振幅, 向き）・風下へ曲がる量
    dead_keep=0.55, dead_len=(0.1, 0.9), dead_low=0.25,
    age=0.5,
)


def seed_of(species, variant, salt=0):
    s = 0
    for i, c in enumerate(species):
        s = (s * 131 + ord(c)) % 1000003
    return (int(s), int(variant), int(salt))


def make_rng(species, variant, salt=0):
    return np.random.default_rng(seed_of(species, variant, salt))


# ---------------------------------------------------------------- 小道具
def _unit(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)


def _perp(t):
    """t に垂直な 2 本（u, v）。"""
    ref = np.array([0.0, 0.0, 1.0]) if abs(t[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = _unit(np.cross(t, ref))
    v = np.cross(t, u)
    return u, v


def _cum(pts):
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])


def _at(pts, cum, s):
    s = min(max(s, 0.0), cum[-1])
    return np.array([np.interp(s, cum, pts[:, k]) for k in range(3)])


def _tan_at(pts, cum, s):
    e = 0.05 * max(cum[-1], 0.2)
    return _unit(_at(pts, cum, s + e) - _at(pts, cum, s - e))


def _smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- 幹・枝の経路
def _stem_path(rg, p0, d0, length, step, sweep, wl, lean, lean_az):
    n = max(4, int(length / step) + 1)
    s = np.linspace(0.0, length, n)
    u, v = _perp(d0)
    ph = rg.uniform(0, 2 * np.pi, 4)
    ramp = 1 - np.exp(-s / 2.5)
    a = sweep * (np.sin(2 * np.pi * s / wl + ph[0]) + 0.45 * np.sin(2 * np.pi * s / (wl * 0.37) + ph[1])) * ramp
    b = sweep * (np.sin(2 * np.pi * s / (wl * 1.3) + ph[2]) + 0.4 * np.sin(2 * np.pi * s / (wl * 0.41) + ph[3])) * ramp
    lz = lean * (s / max(length, 1e-6)) ** 1.7 * length * 0.25
    lx, ly = np.cos(lean_az) * lz, np.sin(lean_az) * lz
    pts = p0 + s[:, None] * d0 + a[:, None] * u + b[:, None] * v
    pts[:, 0] += lx
    pts[:, 1] += ly
    return pts


def _branch_path(rg, p0, d0, length, step, droop, tipup, wig, wind_vec, tip_from=0.55):
    n = max(3, int(round(length / step)) + 1)
    seg = length / (n - 1)
    pts = np.empty((n, 3))
    pts[0] = p0
    d = d0 / np.linalg.norm(d0)
    for i in range(1, n):
        t = i / (n - 1)
        g = -droop * (1 - 0.4 * t)
        up = tipup * (np.clip((t - tip_from) / (1 - tip_from), 0, 1) ** 1.4)
        d = d + (rg.normal(size=3) * wig + wind_vec + np.array([0.0, 0.0, g + up])) * seg
        d /= np.linalg.norm(d)
        pts[i] = pts[i - 1] + d * seg
    return pts


def _radii(n, r0, r_tip, k=1.1):
    t = np.linspace(0, 1, n)
    return r_tip + (r0 - r_tip) * (1 - t) ** k


class Skeleton:
    def __init__(self):
        self.branches = []     # dict(pts, rad, order, dead, broken, lobes)
        self.anchors = None
        self.info = {}


# ---------------------------------------------------------------- 木を育てる
def grow_tree(params, species="larch", variant=0):
    P = dict(DEFAULTS)
    P.update(params)
    rg = make_rng(species, variant, 1)
    H, age = P["height"], P["age"]
    sk = Skeleton()
    anchors = []
    az_c = [(a, z) for a, z in P["asym"]]
    wind_az, wind = P["wind_az"], P["wind"]
    wind_vec = np.array([np.cos(wind_az), np.sin(wind_az), 0.0]) * wind
    hc = P["crown_base"] * H
    Htop = H * P["top_frac"] if P["broken"] else H

    def asym(az):
        f = 1.0
        for a, z in az_c:
            f += a * np.cos(az - z)
        f += wind * 0.9 * np.cos(az - wind_az)
        return max(0.35, f)

    def prof(x):
        a, b = P["peak_a"], P["peak_b"]
        xm = a / (a + b)
        m = xm ** a * (1 - xm) ** b
        return np.clip((np.clip(x, 0, 1) ** a) * ((1 - np.clip(x, 0, 1)) ** b) / m, 0, 1.15)

    # ---- 幹
    base_r = P["r0"]
    trunk_len = Htop
    tp = _stem_path(rg, np.zeros(3), np.array([0, 0, 1.0]), trunk_len, 0.25, P["sweep"], P["sweep_wl"],
                    P["lean"], P["lean_az"])
    cum = _cum(tp)

    def stem_radius(s, L, r0, tip):
        t = np.clip(s / L, 0, 1)
        r = tip + (r0 - tip) * (1 - t) ** P["taper"]
        return r * (1 + 0.5 * np.exp(-s / 0.75))

    stems = []   # (pts, cum, r0, base_height, is_main, top_z)
    fork_s = None
    if P["n_leaders"] > 1:
        fork_s = P["fork_h"] * H
        # 幹は分岐点で終わり、そこから各リーダーが伸びる
        keep = cum <= fork_s
        k = int(np.searchsorted(cum, fork_s)) + 1
        tp_main = tp[:k]
        cum_main = _cum(tp_main)
        stems.append((tp_main, cum_main, base_r, 0.0, True))
        rad_main = stem_radius(cum_main, trunk_len, base_r, P["tip_r"])
        sk.branches.append(dict(pts=tp_main, rad=rad_main, order=0, dead=False, broken=False, trunk=True))
        r_f = rad_main[-1]
        for li in range(P["n_leaders"]):
            az = rg.uniform(0, 2 * np.pi) if li == 0 else (lead_az0 + 2 * np.pi * li / P["n_leaders"] + rg.normal(0, 0.4))
            if li == 0:
                lead_az0 = az
            ang = np.deg2rad(P["fork_ang"] * rg.uniform(0.7, 1.3))
            dirv = np.array([np.sin(ang) * np.cos(az), np.sin(ang) * np.sin(az), np.cos(ang)])
            Ll = (trunk_len - fork_s) * rg.uniform(0.75, 1.02)
            if li > 0:
                Ll *= rg.uniform(0.6, 0.95)
            lp = _stem_path(rg, tp_main[-1].copy(), dirv, Ll, 0.25, P["sweep"] * 0.7, P["sweep_wl"] * 0.7, 0.0, 0.0)
            lc = _cum(lp)
            r0l = r_f * rg.uniform(0.62, 0.8)
            lr = P["tip_r"] + (r0l - P["tip_r"]) * (1 - lc / lc[-1]) ** P["taper"]
            sk.branches.append(dict(pts=lp, rad=lr, order=0, dead=False, broken=False, trunk=True))
            stems.append((lp, lc, r0l, fork_s, False))
    else:
        rad_t = stem_radius(cum, trunk_len, base_r, P["tip_r"])
        if P["broken"]:
            rad_t = np.maximum(rad_t, 0.06 + 0.1 * rad_t[0] * 0.2)
        sk.branches.append(dict(pts=tp, rad=rad_t, order=0, dead=False, broken=bool(P["broken"]), trunk=True))
        stems.append((tp, cum, base_r, 0.0, True))

    # ---- 輪生する枝（1 次）
    branch_list = []   # (pts, rad, dead, az, length)
    for si, (sp, sc, sr0, sbase, is_main) in enumerate(stems):
        L = sc[-1]
        z_lo = 0.9 if is_main else 0.8
        s = z_lo
        sub = 1.0 if is_main else 0.8
        while s < L - 0.3:
            gap = rg.uniform(*P["whorl_gap"]) * (0.8 + 0.4 * (1 - s / max(L, 1)))
            s += gap
            if s > L - 0.3:
                break
            c = _at(sp, sc, s)
            T = _tan_at(sp, sc, s)
            u, v = _perp(T)
            z = c[2]
            x = (z - hc) / max(Htop - hc, 1e-6)
            nb = int(rg.integers(P["whorl_n"][0], P["whorl_n"][1] + 1))
            phase = rg.uniform(0, 2 * np.pi)
            for j in range(nb):
                az = phase + 2 * np.pi * j / nb + rg.normal(0, 0.32)
                live = z >= hc * 0.95
                if live:
                    Lb = P["lenmax"] * H * prof(x) * asym(az) * rg.lognormal(0, 0.18) * sub
                    dead = False
                    if x < 0.3 and rg.random() < P["dead_low"] * (1 - x / 0.3):
                        dead = True
                        Lb *= rg.uniform(0.3, 0.8)
                else:
                    if rg.random() > P["dead_keep"] * (0.35 + 0.65 * z / max(hc, 1e-6)) * (0.5 + age):
                        continue
                    # 枯れ枝：長さ 0.3〜2.3m、根元が太く（直径 8〜30mm）、先は折れて、すこしたれる
                    Lb = float(rg.uniform(0.3, 2.3)) * (0.45 + 0.55 * z / max(hc, 1e-6))
                    dead = True
                if Lb < 0.25 and not dead:
                    continue
                ang = np.deg2rad(np.clip(P["ang_hi"] + (P["ang_lo"] - P["ang_hi"]) * (1 - np.clip(x, 0, 1)) ** 0.9
                                         + rg.normal(0, P["ang_jit"]), 25, 125))
                d0 = np.cos(ang) * T + np.sin(ang) * (np.cos(az) * u + np.sin(az) * v)
                Rs = np.interp(s, sc, stem_radius(sc, L, sr0, P["tip_r"]))
                if dead:
                    rb = float(np.clip(0.0045 + 0.0075 * Lb ** 0.8 * rg.uniform(0.8, 1.2), 0.004, 0.45 * Rs))
                else:
                    rb = float(np.clip(0.013 * Lb ** 1.1, 0.006, 0.45 * Rs))
                start = c + d0 * Rs * 0.4
                droop = P["droop"] * (rg.uniform(0.7, 1.3)) if not dead else rg.uniform(0.35, 0.8)
                tipup = P["tipup"] * rg.uniform(0.6, 1.3) * (0.0 if dead else 1.0)
                bp = _branch_path(rg, start, d0, Lb, 0.28 if not dead else 0.2, droop, tipup, P["wig"] * (2.0 if dead else 1.0),
                                  wind_vec * 0.35, P["tip_from"])
                br = _radii(len(bp), rb, max(0.004, rb * (0.08 if not dead else 0.3)))
                if dead:      # 根元のふくらみ（こぶ）
                    br = br * (1 + 0.6 * np.exp(-np.linspace(0, 1, len(bp)) * 9))
                branch_list.append((bp, br, dead, az, Lb, x))

    # ---- 小枝（2 次）と葉の小枝のアンカー
    A_pos, A_dir, A_up, A_scale, A_kind, A_age = [], [], [], [], [], []

    def add_anchor(p, d, upv, sc, kind, ag):
        A_pos.append(p); A_dir.append(d); A_up.append(upv); A_scale.append(sc); A_kind.append(kind); A_age.append(ag)

    def anchors_along(pts, cum_, s0, s1, gap, ag, tip_kind=True, side_ang=(25, 55)):
        s = s0
        flip = 1 if rg.random() < 0.5 else -1
        while s < s1:
            c = _at(pts, cum_, s)
            T = _tan_at(pts, cum_, s)
            zz = np.array([0, 0, 1.0])
            side = _unit(np.cross(T, zz)) if abs(T[2]) < 0.95 else _perp(T)[0]
            yaw = np.deg2rad(rg.uniform(*side_ang)) * flip
            d = _unit(np.cos(yaw) * T + np.sin(yaw) * side + np.array([0, 0, rg.uniform(-0.15, 0.25)]))
            upv = _unit(zz - np.dot(zz, d) * d + rg.normal(0, 0.25, 3))
            sc = rg.uniform(0.75, 1.2)
            add_anchor(c, d, upv, sc, 1, ag)
            flip = -flip
            s += gap * rg.uniform(0.7, 1.3)
        if tip_kind:
            T = _tan_at(pts, cum_, cum_[-1])
            upv = _unit(np.array([0, 0, 1.0]) - T[2] * T + rg.normal(0, 0.2, 3))
            add_anchor(pts[-1].copy(), T, upv, rg.uniform(0.95, 1.3), 0, ag)

    for bp, br, dead, az, Lb, x in branch_list:
        sk.branches.append(dict(pts=bp, rad=br, order=1, dead=dead, broken=dead, trunk=False))
        if dead:
            if Lb > 0.45:      # 枯れ枝にも 1〜3 本の細い側枝
                bc0 = _cum(bp)
                for _ in range(int(rg.integers(1, 4))):
                    c = _at(bp, bc0, bc0[-1] * rg.uniform(0.3, 0.85))
                    T = _tan_at(bp, bc0, bc0[-1] * 0.5)
                    d = _unit(T * 0.6 + rg.normal(size=3) * 0.6 + np.array([0, 0, -0.2]))
                    p2 = _branch_path(rg, c, d, float(rg.uniform(0.1, 0.35)), 0.1, 0.4, 0.0, 0.1, np.zeros(3), 0.5)
                    sk.branches.append(dict(pts=p2, rad=_radii(len(p2), 0.003, 0.0008), order=2, dead=True, broken=True, trunk=False))
            continue
        bc = _cum(bp)
        Ltot = bc[-1]
        ag = float(np.clip(0.9 - 0.7 * x + rg.normal(0, 0.05), 0, 1))
        # 小枝は左右交互・前向き
        s = Ltot * rg.uniform(0.08, 0.16)
        flip = 1 if rg.random() < 0.5 else -1
        while s < Ltot * 0.94:
            c = _at(bp, bc, s)
            T = _tan_at(bp, bc, s)
            zz = np.array([0, 0, 1.0])
            side = _unit(np.cross(T, zz)) if abs(T[2]) < 0.95 else _perp(T)[0]
            up_n = np.cross(side, T)
            roll = np.deg2rad(rg.uniform(-30, 55))   # 下向きに寄る
            sdir = np.cos(roll) * side * flip - np.sin(roll) * up_n * 0.8
            ang = np.deg2rad(rg.uniform(*P["o2_ang"]))
            d0 = _unit(np.cos(ang) * T + np.sin(ang) * sdir)
            sfrac = s / Ltot
            pr = (1 - sfrac) ** 0.75 * (0.3 + 0.7 * _smooth(sfrac, 0.0, 0.3))
            l2 = Ltot * P["o2_ratio"] * pr * rg.lognormal(0, 0.25)
            if l2 >= P["o2_min"]:
                rp = np.interp(s, bc, br)
                rb2 = float(np.clip(0.01 * l2 ** 1.0 + 0.0015, 0.0018, 0.6 * rp))
                st = c + d0 * rp * 0.5
                p2 = _branch_path(rg, st, d0, l2, 0.2, P["o2_droop"] * rg.uniform(0.7, 1.3),
                                  P["o2_tipup"] * rg.uniform(0.6, 1.3), P["o2_wig"], wind_vec * 0.25, 0.5)
                r2 = _radii(len(p2), rb2, max(0.0012, rb2 * 0.15))
                sk.branches.append(dict(pts=p2, rad=r2, order=2, dead=False, broken=False, trunk=False))
                c2 = _cum(p2)
                anchors_along(p2, c2, c2[-1] * 0.18, c2[-1] * 0.97, P["twig_gap"], ag)
            flip = -flip if rg.random() < 0.85 else flip
            s += rg.uniform(*P["o2_gap"])
        # 枝の先の 35% は葉の小枝を直接つける
        anchors_along(bp, bc, Ltot * 0.62, Ltot * 0.97, P["twig_gap"] * 1.4, ag)

    # 梢（幹の先）にも葉の小枝
    for sp, sc, _, _, is_main in stems:
        L = sc[-1]
        if P["broken"] and is_main and P["n_leaders"] == 1:
            continue
        anchors_along(sp, sc, L * 0.93, L, 0.14, 0.05)

    pos = np.array(A_pos, float).reshape(-1, 3)
    dr = np.array(A_dir, float).reshape(-1, 3)
    up = np.array(A_up, float).reshape(-1, 3)
    # 樹冠の外側からの深さ（1 = いちばん外）
    rho = np.hypot(pos[:, 0], pos[:, 1]) if len(pos) else np.zeros(0)
    if len(pos):
        zb = np.clip((pos[:, 2] / 1.5).astype(int), 0, int(Htop / 1.5) + 1)
        mx = np.zeros(zb.max() + 1)
        np.maximum.at(mx, zb, rho)
        k = np.ones(3) / 3
        mx = np.convolve(np.pad(mx, 1, mode="edge"), k, mode="valid")
        shell = rho / np.maximum(mx[zb], 0.3)
    else:
        shell = np.zeros(0)
    sk.anchors = dict(pos=pos, dir=dr, up=up, scale=np.array(A_scale), kind=np.array(A_kind, int),
                      age=np.array(A_age), shell=shell)
    sk.info = dict(height=Htop, hc=hc, params=P)
    return sk


# ---------------------------------------------------------------- メッシュ
def tube(pts, rad, sides, tile, rg=None, lobes=None, cap="apex", bury=0.0):
    """1 本の管。頂点は (輪の数)×(sides+1)（継ぎ目の UV 用に 1 列ふやす）。
    UV：u は円周を整数枚のタイルに、v は長さ方向を tile(m) ごとに 1。"""
    pts = np.asarray(pts, float)
    rad = np.asarray(rad, float)
    if bury > 0:      # 根元の下に輪をひとつ足す（斜面で浮かない）
        pts = np.vstack([pts[0] - np.array([0, 0, bury]), pts])
        rad = np.concatenate([[rad[0] * 1.02], rad])
    n = len(pts)
    T = np.empty_like(pts)
    T[1:-1] = pts[2:] - pts[:-2]
    T[0] = pts[1] - pts[0]
    T[-1] = pts[-1] - pts[-2]
    T = _unit(T)
    axes = np.eye(3)
    ref = axes[np.argmin(np.abs(T @ axes.T).sum(0))]
    N = _unit(ref - (T @ ref)[:, None] * T)
    B = np.cross(T, N)
    a = np.linspace(0, 2 * np.pi, sides + 1)
    ca, sa = np.cos(a), np.sin(a)
    R = np.repeat(rad[:, None], sides + 1, 1)
    if lobes is not None:
        amp, k, ph = lobes
        zz = pts[:, 2:3]
        R = R * (1 + amp * np.exp(-np.maximum(zz, 0) / 0.9) * np.cos(k * a[None, :] + ph))
    if rg is not None:
        nz = rg.normal(0, 0.05, (n, sides))                 # 板ごとの出入り（輪郭がぎざぎざになる）
        if n > 2:
            nz = 0.6 * nz + 0.4 * np.vstack([nz[:1], nz[:-1]])
        nz = np.concatenate([nz, nz[:, :1]], 1)
        R = R * (1 + nz)
    V = (pts[:, None, :] + R[:, :, None] * (ca[None, :, None] * N[:, None, :] + sa[None, :, None] * B[:, None, :]))
    cum = _cum(pts)
    ntile = max(1, int(round(2 * np.pi * max(rad[0], 0.004) / tile)))
    U = np.repeat((a / (2 * np.pi) * ntile)[None, :], n, 0)
    Vv = np.repeat((cum / tile)[:, None], sides + 1, 1)
    uv = np.stack([U, Vv], -1).reshape(-1, 2)
    verts = V.reshape(-1, 3)
    rr = R.reshape(-1)
    i = np.arange(n - 1)[:, None]
    j = np.arange(sides)[None, :]
    a0 = (i * (sides + 1) + j).ravel()
    a1 = a0 + 1
    b0 = a0 + (sides + 1)
    b1 = b0 + 1
    faces = np.concatenate([np.stack([a0, a1, b0], 1), np.stack([a1, b1, b0], 1)])
    if cap and rad[-1] > 0.0035:
        last = (n - 1) * (sides + 1)
        if cap == "apex":
            tip = pts[-1] + T[-1] * rad[-1] * 1.2
        else:     # 折れた面：少し傾けた平らな面
            tip = pts[-1] + T[-1] * rad[-1] * 0.15 + N[-1] * rad[-1] * 0.5
        verts = np.vstack([verts, tip])
        uv = np.vstack([uv, [0.0, cum[-1] / tile]])
        rr = np.concatenate([rr, [rad[-1] * 0.2]])
        ti = len(verts) - 1
        fa = np.stack([last + np.arange(sides), last + np.arange(1, sides + 1), np.full(sides, ti)], 1)
        faces = np.concatenate([faces, fa])
    return verts, faces.astype(np.int64), uv, rr


# 段ごとの作り（次数ごとの辺数・輪の間隔(m)・含める次数）
LOD_WOOD = {
    0: dict(sides={0: 40, 1: 8, 2: 5}, gap={0: 0.25, 1: 0.2, 2: 0.2}, orders=(0, 1, 2), min_r2=0.0),
    1: dict(sides={0: 10, 1: 5, 2: 3}, gap={0: 0.6, 1: 0.5, 2: 0.45}, orders=(0, 1), min_r2=0.0),
    2: dict(sides={0: 6, 1: 4, 2: 3}, gap={0: 1.2, 1: 1.0, 2: 1.0}, orders=(0, 1), min_r2=0.0),
}


def _decimate(pts, rad, gap):
    cum = _cum(pts)
    keep = [0]
    last = 0.0
    for i in range(1, len(pts) - 1):
        if cum[i] - last >= gap:
            keep.append(i)
            last = cum[i]
    keep.append(len(pts) - 1)
    keep = np.array(sorted(set(keep)))
    return pts[keep], rad[keep]


def wood_mesh(sk, lod=0, species="larch", variant=0, tile=0.5):
    cfg = LOD_WOOD[min(lod, 2)]
    rg = make_rng(species, variant, 2)
    Vs, Fs, Us, Rs, Ds, Os = [], [], [], [], [], []
    off = 0
    for b in sk.branches:
        o = b["order"]
        if o not in cfg["orders"]:
            continue
        pts, rad = _decimate(b["pts"], b["rad"], cfg["gap"][o])
        if len(pts) < 2:
            continue
        lobes = None
        if b.get("trunk") and o == 0 and pts[0][2] < 0.01:
            lobes = (0.22, int(rg.integers(3, 6)), rg.uniform(0, 6.28))
        sides = cfg["sides"][o]
        v, f, uv, rr = tube(pts, rad, sides, tile, rg=rg if o == 0 else None, lobes=lobes,
                            cap="flat" if b["broken"] else "apex", bury=0.35 if lobes is not None else 0.0)
        Vs.append(v); Fs.append(f + off); Us.append(uv); Rs.append(rr)
        Ds.append(np.full(len(v), 1.0 if b["dead"] or (b["broken"] and not b.get("trunk")) else 0.0))
        Os.append(np.full(len(v), o))
        off += len(v)
    return dict(verts=np.vstack(Vs).astype(np.float32), faces=np.vstack(Fs).astype(np.int32),
                uv=np.vstack(Us).astype(np.float32), radius=np.concatenate(Rs).astype(np.float32),
                dead=np.concatenate(Ds).astype(np.float32), order=np.concatenate(Os).astype(np.float32))
