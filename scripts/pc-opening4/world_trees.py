"""実写の世界に本物の森を植える（world.py の extras=world_trees から add(world) で呼ばれる）。notes/world-trees.md に作り方と数字。

  python world.py -- data=work/world/reveal out=... frame=600 extras=world_trees [trees_range=15000 trees_density=1 trees_seed=1 trees_floor=1]

やること
  1. 航空写真（暗い青緑＝針葉樹）と標高（傾き・森林限界）から、木の立つ場所の確率の地図を作る（世界の位置だけで決まる固定の地図）。
  2. 木の位置・種類・変種・大きさ・向きは「世界の 4m 格子の 1 目ごとの hash」だけで決める。コマには左右されない（ちらつかない）。
     コマごとに変わるのは「見えない木を外す」ことだけ（視野の外・地形の裏で 30m 以上のゆとり・雲の上面より 150m 以上下）。
  3. 木は trees/scatter.py の instance_trees（点にインスタンス）で置く。木ごとに写真の色の ±30% の色づけ（インスタンス属性 tint）。
  4. 林の地面を暗く（反射率 0.04〜0.08）し、写真は大きくぼかした色づけだけにする（地形の材質 "terrain" の base_out の後ろに混ぜる節を 1 つ入れる）。
  広葉樹（11 月は葉がない）は木の素材がないので置かない。写真のまま残す。
"""
from __future__ import annotations

import json
import math
import os
import re
import resource
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import geo4  # noqa: E402

EARTH, K0 = geo4.EARTH, geo4.K0

# ------------------------------------------------------------------ 定数（出典は notes/world-trees.md）
TREELINE = 2500.0          # 森林限界（m）。環境省 中部山岳国立公園：おおむね 2,500m 以上は高山帯（ハイマツ・お花畑）
TREELINE_FADE = 140.0      # 森林限界の手前でまばらに・低くなる幅（m）
TILE = 2048.0              # 地図の 1 区画（世界に固定の格子）。木の格子の 4m 目 512×512 が 1 区画
CELL = 4.0                 # 木の候補の格子（m）。最大 625 本/ha
PAD = 900.0                # 区画のまわりに足して計算する幅（ぼかしの端が区画で変わらないように）
DENS_MAX_HA = 470.0        # 閉じた林の木の数（本/ha）。立山 1980m のオオシラビソ林：DBH5cm 以上 725 本/ha・林冠 10〜12m
SHADOW_LEN = 11.0 * 28.0   # 太陽高度 5 度で、高さ 28m の木の影の長さ（m）。視野の外の木の影が視野に入るかを見る
SALT = {"u1": 11, "u2": 12, "u3": 13, "u4": 14, "sp": 15, "var": 16, "yaw": 17, "scl": 18, "hgt": 19, "dead": 20}


# ------------------------------------------------------------------ 位置だけで決まる乱数・雑音
def _mix64(x):
    with np.errstate(over="ignore"):
        x = (x ^ (x >> np.uint64(30))) * np.uint64(0xBF58476D1CE4E5B9)
        x = (x ^ (x >> np.uint64(27))) * np.uint64(0x94D049BB133111EB)
        x = x ^ (x >> np.uint64(31))
    return x


def h01(ix, iy, salt):
    """整数の格子の目 (ix, iy) から 0〜1 の固定の乱数（機械によらず同じ）"""
    with np.errstate(over="ignore"):
        a = np.asarray(ix).astype(np.int64).astype(np.uint64) * np.uint64(0x9E3779B97F4A7C15)
        b = np.asarray(iy).astype(np.int64).astype(np.uint64) * np.uint64(0xC2B2AE3D27D4EB4F)
        x = _mix64(a ^ (b + np.uint64(salt) * np.uint64(0x165667B19E3779F9)))
    return (x >> np.uint64(11)).astype(np.float64) / float(1 << 53)


def vnoise(e, n, scale, salt):
    """世界の位置で決まるなめらかな 0〜1 の雑音（格子の乱数を補間）"""
    x = np.asarray(e, np.float64) / scale
    y = np.asarray(n, np.float64) / scale
    i, j = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - i, y - j
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = h01(i, j, salt), h01(i + 1, j, salt)
    c, d = h01(i, j + 1, salt), h01(i + 1, j + 1, salt)
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def smooth(x, a, b):
    t = np.clip((np.asarray(x, np.float64) - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ------------------------------------------------------------------ 航空写真（国土地理院 全国最新写真・シームレス）
class Photo:
    """world_fetch.py が作る p12〜p17。取れなかったタイルは (128,128,128) で埋めてある → 使えない所として扱う。"""

    def __init__(self, data, name):
        self.meta = json.load(open(os.path.join(data, f"{name}.json")))
        self.name = name
        self.z = self.meta["z"]
        self.k = 2.0 ** self.z / (EARTH * K0)
        self.px_m = 1.0 / (self.k * 256.0)
        self.path = os.path.join(data, f"{name}.jpg")
        self.cache = {}

    def prepared(self, res):
        f = max(1, int(round(res / self.px_m)))
        if f in self.cache:
            return self.cache[f]
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = None
        im = np.asarray(Image.open(self.path).convert("RGB"))
        h, w = im.shape[:2]
        valid = ~np.all(im == 128, axis=2)
        if f > 1:
            h2, w2 = h // f, w // f
            rgb = np.empty((h2, w2, 3), np.float32)
            cov = np.empty((h2, w2), np.float32)
            for y in range(0, h2, 256):       # 帯ごとに平均（メモリを抑える）
                y1 = min(h2, y + 256)
                blk = im[y * f:y1 * f, :w2 * f].astype(np.float32).reshape(y1 - y, f, w2, f, 3)
                v = valid[y * f:y1 * f, :w2 * f].astype(np.float32).reshape(y1 - y, f, w2, f)
                s = v.sum(axis=(1, 3))
                rgb[y:y1] = (blk * v[..., None]).sum(axis=(1, 3)) / np.maximum(s[..., None], 1.0) / 255.0
                cov[y:y1] = s / float(f * f)
        else:
            rgb = None
            cov = valid.astype(np.float32)
        out = (im if rgb is None else rgb, cov, f)
        self.cache = {f: out}
        return out

    def sample(self, e, n, res):
        """(rgb 0〜1 の浮動小数, 使える割合 0〜1)。e, n は同じ形の配列"""
        img, cov, f = self.prepared(res)
        z = self.z
        u = (e * self.k + geo4.MX0 * 2 ** z - self.meta["x0"]) / self.meta["nx"]
        v = 1.0 - (geo4.MY0 * 2 ** z - self.meta["y0"]) / self.meta["ny"] + n * self.k / self.meta["ny"]
        h, w = cov.shape
        px = u * w - 0.5
        py = (1.0 - v) * h - 0.5
        inside = (px >= 0) & (py >= 0) & (px <= w - 1.001) & (py <= h - 1.001)
        fx = np.clip(px, 0, w - 1.001)
        fy = np.clip(py, 0, h - 1.001)
        x0, y0 = fx.astype(np.int64), fy.astype(np.int64)
        tx, ty = (fx - x0).astype(np.float32), (fy - y0).astype(np.float32)
        w00, w10, w01, w11 = (1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty
        c = cov[y0, x0] * w00 + cov[y0, x0 + 1] * w10 + cov[y0 + 1, x0] * w01 + cov[y0 + 1, x0 + 1] * w11
        sc = 1.0 / 255.0 if img.dtype == np.uint8 else 1.0
        col = (img[y0, x0] * w00[..., None] + img[y0, x0 + 1] * w10[..., None] + img[y0 + 1, x0] * w01[..., None] + img[y0 + 1, x0 + 1] * w11[..., None]) * sc
        c = np.where(inside, c, 0.0)
        # 使えない画素（灰色）が混ざる所は色が灰色にひっぱられるので、使える割合が低い所は重みを落とす
        return col, np.clip((c - 0.5) * 2.0, 0.0, 1.0)


# ------------------------------------------------------------------ 本体
class Ctx:
    def __init__(self, world):
        self.w = world
        o = world.opt
        self.range = float(o.get("trees_range", "15000"))
        self.dens = float(o.get("trees_density", "1"))
        self.seed = int(o.get("trees_seed", "1"))
        self.floor = o.get("trees_floor", "1") == "1"
        self.debug = o.get("trees_debug", "")
        self.cams = np.array([c["pos"] for c in json.load(open(os.path.join(HERE, "cameras.json")))["frames"].values()], np.float64)
        from scipy.spatial import cKDTree
        self.path_tree = cKDTree(self.cams[:, :2])
        self.photos = []
        for nm in ("p12", "p13", "p14", "p15", "p16", "p17"):       # 粗い → 細かい。写真の拡大の段（pfuji は使わない）
            if os.path.exists(os.path.join(world.DATA, f"{nm}.json")):
                self.photos.append(Photo(world.DATA, nm))
        self.tiles = {}
        self.stat = {"tile_seconds": 0.0}

    # --- 固定の標高（コマによらない）。世界の ground はカメラからの距離で細かい段を足すので、分類には使わない
    def static_ground(self, e, n):
        h = None
        for i, L in enumerate(self.w.DEMS):
            v, ok = L.sample(e, n)
            h = v.astype(np.float64) if i == 0 else h + (v - h) * ok
        return h

    def dpath(self, e, n):
        return self.path_tree.query(np.stack([np.ravel(e), np.ravel(n)], 1))[0].reshape(np.shape(e))

    def res_for(self, ti, tj):
        d = float(self.dpath(np.array([(ti + 0.5) * TILE]), np.array([(tj + 0.5) * TILE]))[0])
        return 4.0 if d < 2500.0 + 1450.0 else 8.0

    def photo_rgb(self, E, N, res):
        out = np.zeros(E.shape + (3,), np.float32)
        have = np.zeros(E.shape, np.float32)
        for L in self.photos:
            c3, cv = L.sample(E, N, res)
            # 細かい写真ほど後から重ねる（使える所だけ）
            out = out + (c3 - out) * cv[..., None]
            have = np.maximum(have, cv)
        return out, have

    def tile(self, ti, tj):
        key = (ti, tj)
        if key in self.tiles:
            return self.tiles[key]
        from scipy.ndimage import gaussian_filter
        t0 = time.time()
        res = self.res_for(ti, tj)
        nc = int(TILE / res)
        pc = int(PAD / res)
        N = nc + 2 * pc
        e0, n0 = ti * TILE, tj * TILE
        ee = e0 - PAD + (np.arange(N) + 0.5) * res
        nn = n0 - PAD + (np.arange(N) + 0.5) * res
        E, Nn = np.meshgrid(ee, nn)
        z = self.static_ground(E, Nn).astype(np.float32)
        gy, gx = np.gradient(z, res)
        slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
        ridge = (z - gaussian_filter(z, 250.0 / res)).astype(np.float32)
        rgb, cov = self.photo_rgb(E, Nn, res)
        # 写真の全体の covered 割合：どの写真にも載っていない所は森にしない
        covered = np.zeros(E.shape, np.float32)
        for L in self.photos[:1]:
            covered = L.sample(E, Nn, res)[1]
        V = rgb.max(axis=2)
        mn = rgb.min(axis=2)
        S = (V - mn) / np.maximum(V, 1e-3)
        Y = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
        veg = smooth(S, 0.085, 0.17) * (1.0 - smooth(V, 0.80, 0.93)) * covered
        sg = 300.0 / res
        num = gaussian_filter(Y * veg, sg)
        den = gaussian_filter(veg, sg)
        yref = np.where(den > 0.02, num / np.maximum(den, 1e-3), 0.25)
        # 写真に焼き込まれた昼の陰影（南・高さ 55 度の太陽）を、標高の陰影の割合で弱めてから相対の明るさにする
        az, el = math.radians(180.0), math.radians(55.0)
        ndl = (-gx * math.sin(az) * math.cos(el) - gy * math.cos(az) * math.cos(el) + math.sin(el)) / np.sqrt(1.0 + gx * gx + gy * gy)
        shade = np.clip(ndl / math.sin(el), 0.25, 1.6)
        Yd = Y / (0.5 + 0.5 * shade)
        num = gaussian_filter(Yd * veg, sg)
        den = gaussian_filter(veg, sg)
        yref = np.where(den > 0.02, num / np.maximum(den, 1e-3), 0.25)
        yrel = (Yd / np.maximum(yref, 0.03)).astype(np.float32)
        # 色づけ用のぼかした色（約 12m）
        sm = 12.0 / res
        rgbb = np.stack([gaussian_filter(rgb[..., c], max(sm, 0.5)) for c in range(3)], 2)
        sl = (slice(pc, pc + nc), slice(pc, pc + nc))
        T = dict(res=res, e0=e0, n0=n0, nc=nc, z=z[sl], slope=slope[sl], ridge=ridge[sl], veg=veg[sl].astype(np.float32),
                 yrel=yrel[sl], rgb=rgbb[sl].astype(np.float32), covered=covered[sl])
        # 木のある確率
        E_, N_ = E[sl], Nn[sl]
        zz = T["z"]
        tl = TREELINE + 70.0 * (vnoise(E_, N_, 700.0, 101 + self.seed) - 0.5) * 2.0
        alt = 1.0 - smooth(zz, tl - TREELINE_FADE, tl)
        slp = 1.0 - smooth(T["slope"], 45.0, 56.0)
        yr = T["yrel"]
        f_dark = 1.0 - smooth(yr, 1.00, 1.30)
        f_light = smooth(yr, 0.95, 1.20) * (1.0 - smooth(yr, 1.50, 1.90))
        zone_larch = smooth(1800.0 - zz, 0.0, 220.0) * (1.0 - smooth(T["slope"], 14.0, 26.0))
        base = T["veg"] * alt * slp
        p_fir = base * np.clip(f_dark + 0.22 * f_light, 0.0, 1.0)
        p_lar = base * zone_larch * np.clip(0.35 * f_dark + 1.0 * f_light, 0.0, 1.0)
        T["p_fir"] = p_fir.astype(np.float32)
        T["p_lar"] = p_lar.astype(np.float32)
        T["p_tree"] = np.clip(p_fir + p_lar, 0.0, 1.0).astype(np.float32)
        T["alt"] = alt.astype(np.float32)
        self.tiles[key] = T
        self.stat["tile_seconds"] += time.time() - t0
        return T

    def sample(self, T, name, e, n):
        res = T["res"]
        a = T[name]
        nc = T["nc"]
        fx = np.clip((e - T["e0"]) / res - 0.5, 0, nc - 1.001)
        fy = np.clip((n - T["n0"]) / res - 0.5, 0, nc - 1.001)
        x0, y0 = fx.astype(np.int64), fy.astype(np.int64)
        tx, ty = fx - x0, fy - y0
        if a.ndim == 3:
            tx, ty = tx[..., None], ty[..., None]
        return a[y0, x0] * (1 - tx) * (1 - ty) + a[y0, x0 + 1] * tx * (1 - ty) + a[y0 + 1, x0] * (1 - tx) * ty + a[y0 + 1, x0 + 1] * tx * ty


# ------------------------------------------------------------------ 高さ・密度（森林帯のモデル）
def stand_height(z):
    """林冠の高さ（m）。下の方は 22m、森林限界に向かって低く（立山 1980m の閉じた林で 10〜12m。ふつうは疎林で低い）"""
    return np.interp(z, [1400, 1800, 2000, 2200, 2350, 2450, 2520], [24.0, 22.0, 17.0, 12.0, 7.5, 4.0, 2.4])


def stand_density(z):
    """林冠の木の本数（本/ha）の相対（1 = DENS_MAX_HA）。森林限界に向かってまばら"""
    return np.interp(z, [1400, 2000, 2250, 2400, 2500], [1.0, 0.95, 0.75, 0.45, 0.2])


class Variants:
    def __init__(self):
        from trees import species, library
        self.h, self.pool, self.dead = {}, {}, {}
        for sp in ("larch", "fir"):
            hs = np.array([species.get_params(sp, v)["height"] for v in range(library.N_VARIANTS)], np.float64)
            dead = np.array([library.is_dead(sp, v) for v in range(library.N_VARIANTS)])
            self.h[sp] = hs
            self.dead[sp] = np.nonzero(dead)[0]
            live = np.nonzero(~dead)[0]
            bins = np.exp(np.linspace(np.log(2.0), np.log(40.0), 40))
            K = 8
            pool = np.zeros((len(bins), K), np.int32)
            for i, b in enumerate(bins):
                order = live[np.argsort(np.abs(np.log(hs[live] / b)))]
                pool[i] = order[:K]
            self.pool[sp] = (bins, pool)

    def pick(self, sp, height, u_var, dead):
        """height（m）に近い変種を、位置の hash（u_var）で選ぶ。dead なら立ち枯れの変種"""
        bins, pool = self.pool[sp]
        bi = np.clip(np.searchsorted(bins, height) - 1, 0, len(bins) - 1)
        # 近い方の目
        bi = np.where(np.abs(np.log(height / bins[np.minimum(bi + 1, len(bins) - 1)])) < np.abs(np.log(height / bins[bi])), np.minimum(bi + 1, len(bins) - 1), bi)
        # 上位の候補ほど選ばれやすく：8 つのうち近い方から 6 つ
        k = np.minimum((u_var * 6).astype(int), 5)
        v = pool[bi, k]
        if len(self.dead[sp]):
            dv = self.dead[sp][(u_var * len(self.dead[sp])).astype(int) % len(self.dead[sp])]
            v = np.where(dead, dv, v)
        return v.astype(np.int32)

    def height_of(self, sp, v):
        return self.h[sp][v]


# ------------------------------------------------------------------ 見えない木を外す（コマごと）
class Culler:
    def __init__(self, world, ctx):
        self.w = world
        self.ctx = ctx
        self.cam = np.asarray(world.CAM_W, np.float64)
        self.M = np.asarray(world.M, np.float64)
        self.tan_h = 18.0 / float(world.opt.get("trees_lens", world.LENS))      # 確かめ用：望遠で一部だけ見るとき、視野の外しは広い画角のまま
        self.tan_v = self.tan_h * world.H / world.W
        self.sun_h = -np.array([world.SUN_DIR[0], world.SUN_DIR[1]]) / max(1e-6, math.hypot(world.SUN_DIR[0], world.SUN_DIR[1]))   # 影の向き
        self.cloud_cut = None
        if world.CLOUDS != "none":
            self.cloud_cut = world.CLOUD_TOP - 150.0
        self.hor = None

    def cam_space(self, e, n, z):
        d = np.stack([e - self.cam[0], n - self.cam[1], z - self.cam[2]], 1)
        cx, cy, cz = d @ self.M[:, 0], d @ self.M[:, 1], d @ self.M[:, 2]
        return cx, cy, -cz

    def in_cone(self, e, n, z, margin_tan=0.07, pad_m=0.0):
        cx, cy, dep = self.cam_space(e, n, z)
        dep_ = np.maximum(dep, 1.0)
        ok = (dep > -pad_m) & (np.abs(cx) <= self.tan_h * dep_ * 1.0 + margin_tan * dep_ + pad_m) & (np.abs(cy) <= self.tan_v * dep_ + margin_tan * dep_ + pad_m)
        return ok

    def build_horizon(self, nbin=2400):
        """カメラから見て各方位の、距離ごとの「それまでの最大の仰角」。地形の裏の木を外すのに使う。"""
        w = self.w
        cx0 = self.cam
        heading = math.radians(w.HEADING)
        span = math.radians(80.0)         # 視野の半分＋影の分の余白
        ang = heading + np.linspace(-span, span, nbin)
        self.hor_ang0, self.hor_da = ang[0], ang[1] - ang[0]
        d = 30.0 * 1.006 ** np.arange(0, int(math.log(max(self.ctx.range, 2000.0) / 30.0) / math.log(1.006)) + 2)
        self.hor_d = d
        E = cx0[0] + np.sin(ang)[:, None] * d[None, :]
        N = cx0[1] + np.cos(ang)[:, None] * d[None, :]
        g = w.ground(E.ravel(), N.ravel()).reshape(E.shape) - geo4.curvature_drop(E, N)
        a = (g - cx0[2]) / d[None, :]
        cm = np.maximum.accumulate(a, axis=1)
        # 隣の方位の最大も取る（細い尾根を見落とさない）
        cm = np.maximum(cm, np.maximum(np.roll(cm, 1, axis=0), np.roll(cm, -1, axis=0)))
        self.hor = cm.astype(np.float32)

    def hidden_by_terrain(self, e, n, ztop, spare=30.0):
        """木の梢が、手前の地形の稜線の下 spare m より深い所にあるなら True"""
        dx, dy = e - self.cam[0], n - self.cam[1]
        dist = np.hypot(dx, dy)
        az = np.arctan2(dx, dy)
        da = (az - self.hor_ang0 + math.pi) % (2 * math.pi) - math.pi
        bi = np.rint(da / self.hor_da).astype(np.int64)
        inside = (bi >= 1) & (bi < self.hor.shape[0] - 1) & (dist > 60.0)
        bi = np.clip(bi, 0, self.hor.shape[0] - 1)
        k = np.clip(np.searchsorted(self.hor_d, dist) - 2, 0, len(self.hor_d) - 1)      # 木の手前の目まで
        occ = self.hor[bi, k]
        occ_z = self.cam[2] + occ * dist
        return inside & (ztop + spare < occ_z)


# ------------------------------------------------------------------ 木を作る
def make_points(ctx, cull, vr):
    w = ctx.w
    rng_t0 = time.time()
    CE, CN = float(w.CE), float(w.CN)
    # 区画の選択：視野に入りうる区画だけ（広めに）
    t_all = []
    rt = int(math.ceil(ctx.range / TILE)) + 1
    ci, cj = int(math.floor(CE / TILE)), int(math.floor(CN / TILE))
    sx = np.linspace(0.0, 1.0, 5)
    for ti in range(ci - rt, ci + rt + 1):
        for tj in range(cj - rt, cj + rt + 1):
            ee = (ti + sx) * TILE
            nn = (tj + sx) * TILE
            E, N = np.meshgrid(ee, nn)
            r = np.hypot(E - CE, N - CN)
            if r.min() > ctx.range + 100.0:
                continue
            if r.min() < 1500.0:
                t_all.append((ti, tj))
                continue
            z = w.ground(E.ravel(), N.ravel()) - geo4.curvature_drop(E.ravel(), N.ravel())
            z = np.concatenate([z, z + 1500.0, z - 600.0])
            ok = cull.in_cone(np.tile(E.ravel(), 3), np.tile(N.ravel(), 3), z, margin_tan=0.5 + 0.0, pad_m=900.0)
            if ok.any():
                t_all.append((ti, tj))
    ctx.stat["tiles"] = len(t_all)
    cull.build_horizon()
    ctx.stat["horizon_seconds"] = round(time.time() - rng_t0, 1)
    out = []
    counts = {"cells": 0, "blocks": 0, "stage1": 0, "cloud": 0, "cone": 0, "terrain": 0, "final": 0}
    BL = 32.0                                   # 粗い外しの目（m）
    nb = int(TILE / BL)
    nci = int(TILE / CELL)
    cpb = int(BL / CELL)
    for (ti, tj) in t_all:
        # --- 粗い外し（32m の目ごとに：雲の下・視野の外・地形の裏・範囲の外）。見えない目は木を作らない
        bi_, bj_ = np.meshgrid(np.arange(nb), np.arange(nb))
        be = (ti * TILE + (bi_.ravel() + 0.5) * BL)
        bn = (tj * TILE + (bj_.ravel() + 0.5) * BL)
        bz = w.ground(be, bn)
        bzs = bz - geo4.curvature_drop(be, bn)
        okb = (np.hypot(be - CE, bn - CN) < ctx.range + 60.0)
        if cull.cloud_cut is not None:
            okb &= bz + 25.0 > cull.cloud_cut
        pad = 40.0 + BL
        okc = cull.in_cone(be, bn, bzs, margin_tan=0.05, pad_m=pad) | cull.in_cone(be, bn, bzs + 35.0, margin_tan=0.05, pad_m=pad)
        for f_ in (0.5, 1.0):
            okc |= cull.in_cone(be + cull.sun_h[0] * SHADOW_LEN * f_, bn + cull.sun_h[1] * SHADOW_LEN * f_, bzs - 20.0 * f_, margin_tan=0.03, pad_m=pad)
        okb &= okc
        okb &= ~cull.hidden_by_terrain(be, bn, bzs + 35.0 + 25.0, 30.0)
        counts["blocks"] += int(okb.sum())
        if not okb.any():
            continue
        T = ctx.tile(ti, tj)
        bsel = np.nonzero(okb)[0]
        bx, by = bi_.ravel()[bsel], bj_.ravel()[bsel]
        sub = np.arange(cpb)
        sx_, sy_ = np.meshgrid(sub, sub)
        IX = (ti * nci + bx[:, None] * cpb + sx_.ravel()[None, :]).ravel()
        IY = (tj * nci + by[:, None] * cpb + sy_.ravel()[None, :]).ravel()
        counts["cells"] += IX.size
        u1 = h01(IX, IY, SALT["u1"] + ctx.seed * 100)
        # 世界の位置だけで決まる「間引き」：カメラの通り道（全コマ）から遠い内側ほどまびく。尾根（地形の出っぱり）は間引かない
        e_c = (IX + 0.5) * CELL
        n_c = (IY + 0.5) * CELL
        dp = ctx.dpath(e_c, n_c)
        thin = 1.0 - 0.72 * smooth(dp, 3000.0, 12000.0)
        ridge = ctx.sample(T, "ridge", e_c, n_c)
        crest = smooth(ridge, 8.0, 22.0)
        kmax = np.maximum(thin, crest)
        keep = u1 < kmax
        counts["stage1"] += int(keep.sum())
        if not keep.any():
            continue
        IX, IY, kmax, dp = IX[keep], IY[keep], kmax[keep], dp[keep]
        e = (IX + h01(IX, IY, SALT["u2"] + ctx.seed * 100)) * CELL
        n = (IY + h01(IX, IY, SALT["u3"] + ctx.seed * 100)) * CELL
        zt = w.ground(e, n)                                      # 本当の標高（地形のメッシュと同じ）
        zs = zt - geo4.curvature_drop(e, n)                      # 場面の z
        # 雲の上面より 150m 以上下は見えない
        if cull.cloud_cut is not None:
            k = zt > cull.cloud_cut
            e, n, zt, zs, IX, IY, kmax, dp = e[k], n[k], zt[k], zs[k], IX[k], IY[k], kmax[k], dp[k]
        counts["cloud"] += e.size
        if not e.size:
            continue
        # 視野（木の根・梢・影の先のどれかが視野に入る）
        ok = cull.in_cone(e, n, zs, margin_tan=0.05, pad_m=40.0) | cull.in_cone(e, n, zs + 30.0, margin_tan=0.05, pad_m=40.0)
        for f in (0.5, 1.0):
            ok |= cull.in_cone(e + cull.sun_h[0] * SHADOW_LEN * f, n + cull.sun_h[1] * SHADOW_LEN * f, zs - 20.0 * f, margin_tan=0.03, pad_m=30.0)
        e, n, zt, zs, IX, IY, kmax, dp = e[ok], n[ok], zt[ok], zs[ok], IX[ok], IY[ok], kmax[ok], dp[ok]
        counts["cone"] += e.size
        if not e.size:
            continue
        # ここからの判定は「位置だけ」で決まる（固定）
        pf = ctx.sample(T, "p_fir", e, n)
        pl = ctx.sample(T, "p_lar", e, n)
        ptree = np.clip(pf + pl, 0.0, 1.0)
        zst = ctx.sample(T, "z", e, n)
        dens = stand_density(zst) * DENS_MAX_HA * ctx.dens / 625.0
        # 林のまとまり・すき間（220m・60m・18m の雑音）
        f = 0.5 * vnoise(e, n, 220.0, 31 + ctx.seed) + 0.3 * vnoise(e, n, 60.0, 32 + ctx.seed) + 0.2 * vnoise(e, n, 18.0, 33 + ctx.seed)
        gap = 0.25 + 0.95 * smooth(f, 0.30, 0.48)
        gap = np.minimum(gap, 1.0) if False else gap
        pacc = np.clip(ptree * dens * gap, 0.0, 1.0)
        u4 = h01(IX, IY, SALT["u4"] + ctx.seed * 100)
        acc = u4 < pacc
        e, n, zt, zs, IX, IY, kmax, dp, pf, pl, zst, f = (a[acc] for a in (e, n, zt, zs, IX, IY, kmax, dp, pf, pl, zst, f))
        if not e.size:
            continue
        # 地形の裏（梢の 30m 下まで裏）を外す。梢の高さはあとで決まるので、ここでは大きめに 30m の木
        hid = cull.hidden_by_terrain(e, n, zs + 30.0, 30.0)
        e, n, zt, zs, IX, IY, kmax, dp, pf, pl, zst, f = (a[~hid] for a in (e, n, zt, zs, IX, IY, kmax, dp, pf, pl, zst, f))
        counts["terrain"] += e.size
        if not e.size:
            continue
        # 種類・高さ・変種・向き・大きさ（位置の hash）
        usp = h01(IX, IY, SALT["sp"] + ctx.seed * 100)
        is_larch = usp < (pl / np.maximum(pf + pl, 1e-6))
        hh = stand_height(zst) * np.exp(0.30 * (vnoise(e, n, 130.0, 41 + ctx.seed) - 0.5) * 2.0 + 0.16 * (h01(IX, IY, SALT["hgt"] + ctx.seed * 100) - 0.5) * 3.4)
        hh = np.where(is_larch, hh * 1.18, hh)
        hh = np.clip(hh, 2.4, 34.0)
        dead = (vnoise(e, n, 35.0, 51 + ctx.seed) > 0.80) & (h01(IX, IY, SALT["dead"] + ctx.seed * 100) < 0.7) & (hh > 8.0)
        uv = h01(IX, IY, SALT["var"] + ctx.seed * 100)
        variant = np.zeros(e.size, np.int32)
        for code, spn in ((0, "larch"), (1, "fir")):
            m = is_larch if code == 0 else ~is_larch
            if m.any():
                variant[m] = vr.pick(spn, hh[m], uv[m], dead[m])
        hv = np.where(is_larch, vr.h["larch"][variant], vr.h["fir"][variant])
        scale = hh / hv * np.exp(0.05 * (h01(IX, IY, SALT["scl"] + ctx.seed * 100) - 0.5) * 3.4)
        # まびいた分は木を少し大きく（木の被りを保つ）
        scale = scale * np.clip(kmax, 0.2, 1.0) ** -0.28
        scale = np.clip(scale, 0.45, 1.7)
        yaw = h01(IX, IY, SALT["yaw"] + ctx.seed * 100) * 2 * np.pi
        # 写真の色の ±30%：ぼかした写真の明るさ（局所の平均との比）
        yr = ctx.sample(T, "yrel", e, n)
        tint = np.clip(yr, 0.55, 1.6) ** 0.55
        tint = np.clip(tint, 0.78, 1.28)
        # 根を少し地面に埋める（遠い粗いメッシュの上で浮かない）
        sink = np.clip(0.0005 * np.hypot(e - CE, n - CN), 0.0, 3.0)
        out.append(dict(e=e, n=n, z=zs - sink, species=np.where(is_larch, 0, 1).astype(np.int32), variant=variant, yaw=yaw,
                        scale=scale, tint=tint, dead=dead, hh=hh, zt=zt))
    if not out:
        return None, counts
    P = {k: np.concatenate([o[k] for o in out]) for k in out[0]}
    counts["final"] = int(P["e"].size)
    return P, counts


# ------------------------------------------------------------------ 材質に木ごとの色づけを足す
def patch_tint_materials(coll_objects):
    import bpy
    done = set()
    for ob in coll_objects:
        for slot in ob.material_slots:
            m = slot.material
            if m is None or m.name in done or not m.use_nodes:
                continue
            done.add(m.name)
            if "bark" in m.name:
                continue
            nt = m.node_tree
            gain = [n for n in nt.nodes if n.bl_idname == "ShaderNodeAttribute" and n.attribute_name == "gain"]
            at = nt.nodes.new("ShaderNodeAttribute")
            at.attribute_type = "INSTANCER"
            at.attribute_name = "tint"
            if gain:
                gnode = gain[0]
                links = [l for l in nt.links if l.from_node == gnode and l.from_socket.name == "Color"]
                for l in links:
                    mx = nt.nodes.new("ShaderNodeMix")
                    mx.data_type = "RGBA"
                    mx.blend_type = "MULTIPLY"
                    mx.inputs[0].default_value = 1.0
                    to = l.to_socket
                    nt.links.remove(l)
                    nt.links.new(gnode.outputs["Color"], mx.inputs[6])
                    nt.links.new(at.outputs["Color"], mx.inputs[7])
                    nt.links.new(mx.outputs[2], to)
            else:
                for pr in [n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"]:
                    inp = pr.inputs["Base Color"]
                    mx = nt.nodes.new("ShaderNodeMix")
                    mx.data_type = "RGBA"
                    mx.blend_type = "MULTIPLY"
                    mx.inputs[0].default_value = 1.0
                    if inp.is_linked:
                        src = inp.links[0].from_socket
                        nt.links.new(src, mx.inputs[6])
                    else:
                        mx.inputs[6].default_value = inp.default_value
                    nt.links.new(at.outputs["Color"], mx.inputs[7])
                    nt.links.new(mx.outputs[2], inp)


# ------------------------------------------------------------------ 林の地面
def bake_floor(ctx, cull):
    """林の地面マスクの画像（8m）を焼いて、地形の材質の base_out の後ろに混ぜる節を 1 つ入れる。"""
    import bpy
    w = ctx.w
    CE, CN = float(w.CE), float(w.CN)
    res = 8.0
    half = min(ctx.range, 16000.0)
    e0, n0 = math.floor((CE - half) / TILE) * TILE, math.floor((CN - half) / TILE) * TILE
    e1, n1 = math.ceil((CE + half) / TILE) * TILE, math.ceil((CN + half) / TILE) * TILE
    nx, ny = int((e1 - e0) / res), int((n1 - n0) / res)
    nx, ny = min(nx, 4096), min(ny, 4096)
    A = np.zeros((ny, nx), np.float32)
    C = np.zeros((ny, nx, 3), np.float32)
    mask_t0 = time.time()
    n_t = 0
    for (ti, tj), T in list(ctx.tiles.items()):
        te0, tn0 = T["e0"], T["n0"]
        if te0 < e0 or tn0 < n0 or te0 + TILE > e0 + nx * res or tn0 + TILE > n0 + ny * res:
            continue
        f = int(round(res / T["res"]))
        a = T["p_tree"]
        c = T["rgb"]
        yr = np.clip(T["yrel"], 0.5, 1.8)
        if f > 1:
            nn_ = a.shape[0] // f
            a = a[:nn_ * f, :nn_ * f].reshape(nn_, f, nn_, f).mean(axis=(1, 3))
            c = c[:nn_ * f, :nn_ * f].reshape(nn_, f, nn_, f, 3).mean(axis=(1, 3))
            yr = yr[:nn_ * f, :nn_ * f].reshape(nn_, f, nn_, f).mean(axis=(1, 3))
        k = a.shape[0]
        xi, yi = int((te0 - e0) / res), int((tn0 - n0) / res)
        A[yi:yi + k, xi:xi + k] = a
        # 林の地面の色：落ち葉・土（線形の反射率 0.04〜0.08）に、写真の明るさの差を少しだけ
        base = np.array([0.062, 0.047, 0.032], np.float32) * float(w.opt.get("trees_floor_albedo", "1.2"))
        lum = (0.5 + 0.5 * np.clip(yr, 0.6, 1.5)) ** 1.0
        tintc = np.clip(c / np.maximum(c.mean(axis=2, keepdims=True), 1e-3), 0.8, 1.25)
        C[yi:yi + k, xi:xi + k] = np.clip(base[None, None, :] * lum[..., None] * (0.7 + 0.3 * tintc), 0.035, 0.12)
        n_t += 1
    from scipy.ndimage import gaussian_filter
    A = gaussian_filter(A, 1.5)
    A = np.clip(A * 1.6, 0.0, 1.0) * 0.97
    for ch in range(3):
        C[..., ch] = gaussian_filter(C[..., ch], 1.0)
    lin = np.clip(C, 0.0, 1.0)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    px = np.concatenate([srgb, A[..., None]], axis=2).astype(np.float32)
    img = bpy.data.images.new("trees_floor", nx, ny, alpha=True, float_buffer=False)
    img.pixels.foreach_set(px.ravel())
    img.colorspace_settings.name = "sRGB"
    img.alpha_mode = "CHANNEL_PACKED"
    img.pack()
    # 材質に混ぜる
    mat = None
    for m in bpy.data.materials:
        if m.name == "terrain" or m.name.startswith("terrain"):
            if m.use_nodes and "base_out" in m.node_tree.nodes:
                mat = m
                break
    if mat is None:
        ctx.stat["floor"] = "terrain 材質が見つからない"
        return
    nt = mat.node_tree
    ro = nt.nodes["base_out"]
    bsdf = [n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"][0]
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.vector_type = "POINT"
    mp.inputs["Location"].default_value = (-e0 / (nx * res), -n0 / (ny * res), 0.0)
    mp.inputs["Scale"].default_value = (1.0 / (nx * res), 1.0 / (ny * res), 1.0)
    nt.links.new(geo.outputs["Position"], mp.inputs["Vector"])
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = img
    tx.interpolation = "Linear"
    tx.extension = "CLIP"
    nt.links.new(mp.outputs["Vector"], tx.inputs["Vector"])
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.blend_type = "MIX"
    nt.links.new(tx.outputs["Alpha"], mx.inputs[0])
    nt.links.new(ro.outputs[0], mx.inputs[6])
    nt.links.new(tx.outputs["Color"], mx.inputs[7])
    nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
    ctx.stat["floor"] = f"{nx}x{ny} {round(time.time() - mask_t0, 1)}s tiles={n_t}"


# ------------------------------------------------------------------ 入口
def add(world):
    import bpy
    from trees import scatter
    t0 = time.time()
    log = world.log
    ctx = Ctx(world)
    vr = Variants()
    cull = Culler(world, ctx)
    log(f"木: 範囲 {ctx.range:.0f}m 密度 x{ctx.dens} seed {ctx.seed}")
    P, counts = make_points(ctx, cull, vr)
    t_pts = time.time() - t0
    st = world.STATS
    st["trees_tiles"] = ctx.stat.get("tiles")
    st["trees_counts"] = counts
    st["trees_points_seconds"] = round(t_pts, 1)
    st["trees_tile_seconds"] = round(ctx.stat["tile_seconds"], 1)
    if P is None:
        log("木: 置く木がない")
        return
    log(f"木: {counts} 点の生成 {t_pts:.1f} 秒")
    if ctx.debug:
        np.savez_compressed(ctx.debug, **{k: v for k, v in P.items()})
    pts = {k: P[k] for k in ("e", "n", "z", "species", "variant", "yaw", "scale")}
    t1 = time.time()
    r = scatter.instance_trees(pts, [np.asarray(world.CAM_W)], "wtrees", scene=world.scene)
    ob = r["object"]
    a = ob.data.attributes.new("tint", "FLOAT_COLOR", "POINT")
    tt = (P["tint"] * float(world.opt.get("trees_gain", "1.8"))).astype(np.float32)
    a.data.foreach_set("color", np.stack([tt, tt, tt, np.ones_like(tt)], 1).ravel())
    coll = bpy.data.collections.get("wtrees_lib")
    patch_tint_materials(list(coll.objects))
    lod = r["lod"]
    sp = pts["species"]
    st["trees_instances"] = int(r["n"])
    st["trees_per_lod"] = r["per_lod"]
    st["trees_by_species_lod"] = {f"{nm}_lod{k}": int(((sp == s) & (lod == k)).sum()) for s, nm in ((0, "larch"), (1, "fir")) for k in range(4)}
    st["trees_meshes"] = int(r["n_meshes"])
    st["trees_dead"] = int(P["dead"].sum())
    st["trees_instance_seconds"] = round(time.time() - t1, 1)
    if ctx.floor:
        bake_floor(ctx, cull)
        st["trees_floor"] = ctx.stat.get("floor")
    st["trees_total_seconds"] = round(time.time() - t0, 1)
    st["trees_peak_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0)
    log(f"木: 置いた {r['n']} 本・lod {r['per_lod']}・{time.time() - t0:.1f} 秒")
