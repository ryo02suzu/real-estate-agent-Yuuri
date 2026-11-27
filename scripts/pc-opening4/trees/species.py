"""種類ごとの決まり（パラメータ）。

カラマツ（Larix kaempferi）：
  若木は円すい形で枝が地面近くまで残る。壮年は細い円すい〜卵形。老木は幅広く不ぞろいで、
  風で片側に流れ、梢が折れる・二股になる。下の枝は枯れて落ちる。
  枝は輪生ぎみに出て、細く、すこし垂れて先が反り上がる。小枝は左右に並ぶ。
  変種 0〜11 は手で決めた型（樹齢・形がはっきり違う）。12 以上は、型を土台に乱数でずらした別の木
  （森の試しで同じ木が出ないように、いくらでも作れる）。

ほかの種類を足すとき：SPECIES に 1 つ足す。kind="decurrent"（幹が分かれる）は n_leaders>1・fork_h で
treegen がそのまま作れる。葉の小枝は twig に名前を書く（twigs.py に作る）。
"""
import numpy as np
from .treegen import make_rng

# (名前, 樹齢の段, 高さ, 上書き)
LARCH_ARCHETYPES = [
    # 幹は全部 1 本の芯（二股なし）。樹冠の幅は高さの 25〜35%、樹冠の底は高さの 35〜65%（若木は低い）。
    ("young-cone",      "young",  9.0,  dict(lenmax=0.15, peak_a=0.25, peak_b=0.9, crown_base=0.06, droop=0.18, sweep=0.04)),
    ("young-slim",      "young", 11.5,  dict(lenmax=0.12, peak_a=0.35, peak_b=0.8, crown_base=0.16, droop=0.2, asym=((0.3, 1.0),))),
    ("young-bent",      "young", 10.0,  dict(lenmax=0.14, crown_base=0.12, lean=0.14, lean_az=2.2, wind=0.2, wind_az=0.6)),
    ("mature-tall",     "mature", 25.0, dict(lenmax=0.115, peak_a=0.5, peak_b=1.0, crown_base=0.42, sweep=0.06)),
    ("mature-oval",     "mature", 21.0, dict(lenmax=0.13, peak_a=0.7, peak_b=0.8, crown_base=0.38, droop=0.3)),
    ("mature-lopsided", "mature", 23.0, dict(lenmax=0.12, crown_base=0.40, asym=((0.45, 3.3),), wind=0.25, wind_az=0.2)),
    ("mature-narrow",   "mature", 24.0, dict(lenmax=0.095, peak_a=0.4, peak_b=1.1, crown_base=0.36, ang_lo=108, ang_hi=42, tipup=1.3)),
    ("mature-sparse",   "mature", 19.0, dict(lenmax=0.12, crown_base=0.50, whorl_gap=(1.0, 1.6), whorl_n=(2, 4), dead_low=0.5)),
    ("old-broad",       "old",   29.0,  dict(lenmax=0.14, peak_a=0.9, peak_b=0.7, crown_base=0.46, droop=0.3)),
    ("old-straight",    "old",   30.0,  dict(lenmax=0.115, peak_a=0.8, peak_b=0.8, crown_base=0.42, sweep=0.1)),
    ("old-windswept",   "old",   27.0,  dict(lenmax=0.125, crown_base=0.40, wind=0.5, wind_az=1.0, lean=0.14, lean_az=1.0, asym=((0.4, 1.0),))),
    ("old-ragged",      "old",   32.0,  dict(lenmax=0.12, peak_a=1.0, peak_b=0.6, crown_base=0.55, dead_low=0.6, whorl_n=(2, 5))),
]

AGE_BASE = {
    "young":  dict(age=0.15, dead_keep=0.45, ang_lo=104.0, ang_hi=50.0, twig_gap=0.03),
    "mature": dict(age=0.5,  dead_keep=0.9, ang_lo=112.0, ang_hi=52.0, twig_gap=0.032),
    "old":    dict(age=0.95, dead_keep=1.0, ang_lo=116.0, ang_hi=58.0, twig_gap=0.034, sweep=0.12, o2_ratio=0.4),
}


def _jitter(rg, p, strong):
    """型をすこしずらす（強さ strong）。"""
    k = 0.08 + 0.12 * strong
    for key in ("lenmax", "peak_a", "peak_b", "droop", "o2_ratio", "sweep"):
        if key in p:
            p[key] = p[key] * float(np.exp(rg.normal(0, k)))
    p["height"] *= float(np.exp(rg.normal(0, 0.03 + 0.04 * strong)))
    p["asym"] = tuple(list(p.get("asym", ())) + [(float(rg.uniform(0.1, 0.4)), float(rg.uniform(0, 6.28)))])
    p["wind_az"] = p.get("wind_az", 0.0) + float(rg.normal(0, 0.6 * strong))
    return p


def larch_params(variant):
    rg = make_rng("larchparams", variant, 0)
    base_i = variant % len(LARCH_ARCHETYPES)
    name, cls, H, over = LARCH_ARCHETYPES[base_i]
    gen = variant >= len(LARCH_ARCHETYPES)
    if gen:
        # 12 以上：別の木（連続的にばらつく。森の試し用に何本でも作れる）。5%は立ち枯れ
        j = int(rg.integers(0, len(LARCH_ARCHETYPES)))
        name, cls, H, over = LARCH_ARCHETYPES[j]
        name = f"{name}*"
    p = dict(AGE_BASE[cls])
    p.update(height=H, **over)
    if gen:
        edge = (variant % 7 == 0)          # 林のふちの木（樹冠が低い）。7 番に 1 本
        p["height"] = float(rg.uniform(16.0, 32.0)) if not edge else float(rg.uniform(14.0, 24.0))
        p["crown_base"] = float(rg.uniform(0.10, 0.30)) if edge else float(rg.uniform(0.35, 0.65))
        p["lenmax"] = float(rg.uniform(0.095, 0.145)) * (1.2 if edge else 1.0)
        p["lean"] = float(rg.uniform(0.0, 0.16))
        p["lean_az"] = float(rg.uniform(0, 6.28))
        p["broken"] = bool(rg.random() < 0.06)
        p["top_frac"] = 0.93
        p["sweep"] = float(rg.uniform(0.04, 0.12)) * (2.2 if rg.random() < 0.12 else 1.0)
        if cls == "young":
            cls = "mature"
            p.update(AGE_BASE["mature"])
        H = p["height"]
    p["edge"] = bool(gen and variant % 7 == 0)
    d_target = float(rg.uniform(0.22, 0.65)) if gen else {"young": 0.24, "mature": 0.5, "old": 0.62}[cls]
    p["r0"] = float(np.clip(d_target / 2 * (H / 26.0) ** 0.5, 0.09, 0.33)) if gen else H * {"young": 0.0125, "mature": 0.0115, "old": 0.0150}[cls]
    p["tip_r"] = 0.02
    p["name"] = name
    p["age_class"] = cls
    # 葉の色：木ごとに連続（色相 ±6 度）。1 割強は黄緑、1 割強はさび色
    u = rg.random()
    if u < 0.12:
        tone = float(rg.uniform(0.0, 0.12))
    elif u > 0.88:
        tone = float(rg.uniform(0.86, 1.0))
    else:
        tone = float(np.clip(rg.normal(0.45, 0.17), 0.1, 0.85))
    p["tone"] = tone
    # 落ちた葉の割合（葉の残り 55〜100%。15〜20% の木は目に見えてまばら）
    thin = rg.random() < 0.18
    p["bare"] = float(rg.uniform(0.28, 0.45)) if thin else float(rg.uniform(0.0, 0.14))
    if cls == "old" and not gen:
        p["bare"] = max(p["bare"], 0.15)
    p["standing_dead"] = bool(gen and rg.random() < 0.035)
    if gen:
        p = _jitter(rg, p, 0.6)
    else:
        p = _jitter(rg, p, 0.25)
    return p


# ---------------------------------------------------------------- 常緑針葉樹（シラビソ・オオシラビソ・コメツガをまとめて 1 種類「fir」）
# 植物の確認（出典は notes/trees.md）：シラビソ Abies veitchii は高さ 25m ほど・円すい形の細い樹冠・枝は輪生で水平〜やや下がり先が反る。
# 亜高山帯（2000〜2500m）の林は風と雪で、梢が折れる・曲がる・風下に枝が流れた「旗」の木が多く、若木が混じり、立ち枯れ（灰色の幹と枝のこぶ）も立つ。
# 変種 0〜11：手で決めた型（11 は立ち枯れ）。12〜23：型をもとに連続的にばらつく別の木（17 は立ち枯れ）。24 以上：同様（8% が立ち枯れ）。
FIR_BASE = dict(age=0.5, ang_lo=100.0, ang_hi=58.0, ang_jit=8.0, droop=0.2, tipup=1.5, tip_from=0.7,
                o2_gap=(0.10, 0.21), o2_ratio=0.3, o2_ang=(50.0, 75.0), o2_droop=0.25, o2_tipup=0.6, o2_min=0.12,
                o2_roll=(-12.0, 22.0), twig_gap=0.04, dead_keep=0.5, dead_len=(0.2, 1.3), dead_low=0.15, rho_k=0.45,
                wig=0.04, taper=0.9)
FIR_ARCHETYPES = [
    ("spire-tall",    21.0, dict(lenmax=0.115, peak_a=0.35, peak_b=0.85, crown_base=0.06, prof_floor=0.3)),
    ("spire-narrow",  24.0, dict(lenmax=0.088, peak_a=0.3, peak_b=0.95, crown_base=0.10, ang_lo=96.0, prof_floor=0.2)),
    ("open-skirt",    15.0, dict(lenmax=0.17, peak_a=0.3, peak_b=0.8, crown_base=0.02, prof_floor=0.6, droop=0.26)),
    ("broken-top",    18.0, dict(lenmax=0.12, peak_a=0.4, peak_b=0.8, crown_base=0.08, broken=True, top_frac=0.86, prof_floor=0.25)),
    ("flagged",       17.0, dict(lenmax=0.13, peak_a=0.35, peak_b=0.8, crown_base=0.12, wind=0.6, wind_az=0.8, lean=0.12, lean_az=0.8, prof_floor=0.2)),
    ("bent-leader",   19.0, dict(lenmax=0.115, peak_a=0.35, peak_b=0.9, crown_base=0.10, lean=0.32, lean_az=3.0, sweep=0.12, prof_floor=0.25)),
    ("young-small",    4.2, dict(lenmax=0.27, peak_a=0.3, peak_b=0.8, crown_base=0.0, prof_floor=0.7, whorl_gap=(0.12, 0.22), whorl_n=(4, 6), o2_min=0.08, twig_gap=0.035)),
    ("young-mid",      6.2, dict(lenmax=0.22, peak_a=0.3, peak_b=0.8, crown_base=0.0, prof_floor=0.6, whorl_gap=(0.14, 0.26), whorl_n=(4, 6), lean=0.06, lean_az=2.0)),
    ("hemlock-droop", 20.0, dict(lenmax=0.105, peak_a=0.4, peak_b=0.85, crown_base=0.08, droop=0.42, tipup=1.0, ang_lo=108.0, o2_droop=0.5, lean=0.22, lean_az=5.0, prof_floor=0.2)),
    ("stout-old",     22.0, dict(lenmax=0.15, peak_a=0.5, peak_b=0.7, crown_base=0.15, dead_low=0.4, asym=((0.35, 1.0),), broken=True, top_frac=0.94, prof_floor=0.15)),
    ("flag-broken",   14.0, dict(lenmax=0.14, peak_a=0.35, peak_b=0.8, crown_base=0.05, wind=0.5, wind_az=4.0, broken=True, top_frac=0.9, lean=0.1, lean_az=4.0, prof_floor=0.3)),
    ("snag",          15.0, dict(crown_base=0.99, broken=True, top_frac=0.9, dead_keep=0.8, dead_len=(0.5, 1.9), standing_dead=True, lean=0.05, lean_az=1.0)),
]
FIR_DEAD = (11, 17)


def fir_params(variant):
    rg = make_rng("firparams", variant, 0)
    gen = variant >= len(FIR_ARCHETYPES)
    j = variant if not gen else int(rg.integers(0, len(FIR_ARCHETYPES) - 1))      # 生成した木は、立ち枯れ以外の型から
    name, H, over = FIR_ARCHETYPES[j]
    p = dict(FIR_BASE)
    p.update(height=H, **over)
    dead = (variant in FIR_DEAD) or (variant >= 24 and rg.random() < 0.08)
    if gen:
        young = rg.random() < 0.2
        p["height"] = float(rg.uniform(2.4, 6.5)) if young else float(rg.uniform(7.0, 23.0))
        if young:
            p.update(crown_base=0.0, prof_floor=0.6, lenmax=float(rg.uniform(0.2, 0.28)), whorl_gap=(0.12, 0.24), whorl_n=(4, 6), o2_min=0.08, twig_gap=0.035)
        else:
            p["lenmax"] = float(rg.uniform(0.09, 0.16))
            p["crown_base"] = float(rg.uniform(0.02, 0.2))
            p["peak_a"] = float(rg.uniform(0.28, 0.55))
            p["peak_b"] = float(rg.uniform(0.7, 1.0))
            p["prof_floor"] = float(rg.uniform(0.1, 0.45))
            p["broken"] = bool(rg.random() < 0.25)
            p["top_frac"] = float(rg.uniform(0.84, 0.95))
            if rg.random() < 0.3:
                p["wind"] = float(rg.uniform(0.3, 0.7))
                p["wind_az"] = float(rg.uniform(0, 6.28))
            p["lean"] = float(rg.uniform(0.0, 0.3))
            p["lean_az"] = float(rg.uniform(0, 6.28))
            p["droop"] = float(rg.uniform(0.15, 0.4))
        p["sweep"] = float(rg.uniform(0.04, 0.12))
        name = name + "*"
    H = p["height"]
    if "whorl_gap" not in p:
        p["whorl_gap"] = (max(0.15, 0.011 * H), max(0.24, 0.021 * H))
        p["whorl_n"] = (5, 7) if H > 9 else (4, 6)
    k = 0.08 + 0.12 * (0.6 if gen else 0.25)
    for key in ("lenmax", "peak_a", "peak_b", "droop"):
        if key in p:
            p[key] = p[key] * float(np.exp(rg.normal(0, k)))
    p.setdefault("lenmax", 0.1)
    p["lenmax"] *= 0.72 if H > 9 else 0.85          # 樹冠の幅は高さの 25〜30%（枝＋小枝で測る）
    p["asym"] = tuple(list(p.get("asym", ())) + [(float(rg.uniform(0.08, 0.32)), float(rg.uniform(0, 6.28)))])
    p["wind_az"] = p.get("wind_az", 0.0) + float(rg.normal(0, 0.3))
    p["r0"] = float(np.clip(0.0085 * H * (1.2 if p.get("broken") else 1.0), 0.03, 0.3))
    p["tip_r"] = 0.012 if H < 8 else 0.02
    p["name"], p["age_class"] = name, "fir"
    p.setdefault("lenmax", 0.1)
    p["tone"] = float(np.clip(rg.normal(0.5, 0.2), 0.0, 1.0))
    p["bare"] = float(rg.uniform(0.0, 0.1))
    if dead:
        p.update(crown_base=0.99, broken=True, top_frac=float(rg.uniform(0.82, 0.95)), dead_keep=0.8, dead_len=(0.5, 1.9), standing_dead=True)
        p["height"] = float(rg.uniform(10, 20)) if gen else p["height"]
        p["r0"] = float(np.clip(0.0085 * p["height"], 0.05, 0.3))
    p["standing_dead"] = bool(dead)
    p["edge"] = False
    return p


SPECIES = {
    "larch": dict(params=larch_params, twig="larch", grower="excurrent", n_hand_variants=len(LARCH_ARCHETYPES)),
    "fir": dict(params=fir_params, twig="fir", grower="excurrent", n_hand_variants=24),
}


def get_params(species, variant):
    return SPECIES[species]["params"](variant)
