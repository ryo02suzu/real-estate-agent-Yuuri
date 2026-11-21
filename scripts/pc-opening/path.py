"""PC のオープニング CG の時間割とカメラの動き（numpy だけ。Blender の外でも確かめられる）。

構成「ひとつの夜明け」（約16秒・30コマ/秒）。光は朝日だけ。カットは割らず、場面のつなぎは雲の中で行う：
  global … 列島の場面。日本海の高い空から、夜明け前の日本を東へ見る。朝日が太平洋の側から上がり、光が列島を
            なでて日本が浮かび上がる。そのまま北アルプスへ降りて、薄い雲の中へ。単位は km
  local  … 上高地の場面（晩秋）。涸沢の上で朝焼けの穂高を見て、吊尾根をかすめ、岳沢を降り、朝もやの谷を飛び、
            徳本峠のあたりで東の稜線より高く上がると、雲海と朝日。白鳥が朝日へ向かい、ロゴ（アプリが動画の上に
            描く）。最後は高く上がりながら見下ろし、薄い雲を抜けて、真上から見た日本（PC のホーム）へ。単位は m

キー（通る所）は「秒・緯度・経度・高さ・向き（北 0°・東 90°）・見下ろす角（下が負）・傾き（右に傾くと正）・焦点距離 mm」。
キーの間は、速さがつながるように補間する（急に止まったり向きが跳んだりしない）。
"""

from __future__ import annotations

import math

import numpy as np

from geo import R_EARTH, enu, local_axes

FPS = 30
T_END = 16.0
# 雲の中で、列島の場面から上高地の場面へ切り替える秒
CUT_LOCAL = 4.3
# 列島の場面の原点と、高さの強調（高い空から見ると、本当の高さでは起伏がほとんど見えないので強める）
P0 = (36.0, 137.6)
EXAG = 1.3
# 上高地の場面の原点（梓川の谷のあたり）
P1 = (36.265, 137.68)
# 朝日の向き（方位。11月上旬の上高地の日の出のころ）と、上高地の場面の太陽の高さ
SUN_AZ = 113.0
SUN_EL = 3.0
# 列島の場面の太陽の高さ（上高地での高さ。秒ごと）。地平線の下から上がり、明るい所が東（太平洋の側）から西へ広がる
GLOBAL_SUN_EL = [(0.0, -1.8), (0.5, -1.3), (2.4, 4.6), (CUT_LOCAL + 0.2, 6.5)]

# 列島の場面（高さは km）。九州の南の高い空から、北東へ弓なりに伸びる夜明け前の列島を見る（朝日は右＝太平洋の側）。
# 光が右から左へ列島をなでたら、北アルプスへ降りる
GLOBAL_KEYS = [
    (0.0, 33.0, 132.6, 340.0, 47.0, -29.0, 0.0, 30.0),
    (2.4, 33.5, 133.4, 300.0, 50.0, -31.0, 0.0, 30.0),
    (3.3, 35.2, 135.9, 120.0, 54.0, -42.0, 0.0, 30.0),
    (3.95, 36.0, 137.2, 36.0, 60.0, -52.0, 0.0, 30.0),
    (CUT_LOCAL + 0.2, 36.17, 137.47, 12.0, 63.0, -56.0, 0.0, 30.0),
]
# 降りるときは、北アルプス（穂高）を画面の真ん中に保つ（見る向きを、この秒の間に、キーの向きから穂高へ移す）
DIVE = (2.2, 3.3)
DIVE_TARGET = (36.29, 137.65, 2800.0)
# 上高地の場面の道筋（高さは自動：地面からの高さの目安を保ち、山の手前で先に上がる。海抜の下限も付けられる。
# 速さは目安の比で、全体を ROUTE_START〜ROUTE_END に合わせる）。
# 緯度, 経度, 地面からの高さの目安 m, 海抜の下限 m, 速さの目安, 見下ろす角の足し（度）, 焦点距離
LOCAL_ROUTE = [
    (36.2985, 137.6555, 700.0, 0.0, 1.00, -16.0, 30.0),  # 雲を抜けると、涸沢の上（奥穂高の北東）。朝焼けの穂高
    (36.2868, 137.6505, 220.0, 0.0, 0.90, -14.0, 30.0),  # 吊尾根（奥穂高と前穂高の間）をかすめる
    (36.2745, 137.6468, 330.0, 0.0, 1.00, -18.0, 28.0),  # 岳沢を谷へ降りる
    (36.2632, 137.6482, 240.0, 0.0, 0.70, -10.0, 26.0),  # 河童橋の上。左へ大きく弧を描き始める
    (36.2566, 137.6560, 210.0, 0.0, 0.58, -6.0, 26.0),  # 谷底の森と梓川（朝もや）
    (36.2541, 137.6665, 210.0, 0.0, 0.60, -5.0, 27.0),  # 明神の下流
    (36.2550, 137.6770, 270.0, 2000.0, 0.66, -3.0, 30.0),  # 上がり始める（前を見たまま）
    (36.2548, 137.6895, 420.0, 2950.0, 0.58, -4.0, 32.0),  # 徳本峠のあたりで、東の稜線より高く出る（朝日が見える）
    (36.2500, 137.6985, 420.0, 3300.0, 0.34, -3.0, 34.0),  # 雲海と朝日（南東へ向く。朝日は画面の左寄り）
    (36.2455, 137.7062, 420.0, 3380.0, 0.20, -3.0, 34.0),
]
ROUTE_START = CUT_LOCAL - 0.3  # 雲の中で少し前から動かしておく
ROUTE_END = 11.5
# 道筋のあと：ほとんど止まって雲海と朝日を見せ（ロゴ）、最後は静かに上がりながら少し上を向き、光の中の薄い雲へ（白くなってホームへ）
HOLD_END = 14.9
TILT_TO = 5.0
# 白鳥（7羽）が朝日へ向かう間（秒）。カメラがほとんど止まってから、右から入って朝日の中へ消える
SWANS = (9.7, 11.7)
# ロゴの光の点がまたたく秒（白鳥が光の中へ消えたところ）。アプリはこの秒からロゴを出す
LOGO_START = 11.6
# 薄い雲の中を通る（画面が雲で白くなる）ときの、濃さの山（秒：始め・いちばん濃い・終わり）
CLOUD_PASSES = [(3.75, CUT_LOCAL, 4.8), (15.2, T_END, T_END)]


def ease(u):
    u = np.clip(u, 0.0, 1.0)
    return u * u * (3.0 - 2.0 * u)


def cloudiness(t: float) -> float:
    """雲の中の濃さ（0〜1）"""
    w = 0.0
    for a, m, b in CLOUD_PASSES:
        if a <= t <= m:
            w = max(w, float(ease((t - a) / max(1e-6, m - a))))
        elif m < t <= b:
            w = max(w, float(1.0 - ease((t - m) / max(1e-6, b - m))))
    return w


def hermite(ts, vs, t):
    """キー（時刻 ts、値 vs：N×D）を、速さがつながるように補間する。行き過ぎて戻る所（キーの山・谷）は、そのキーで止まる"""
    ts = np.asarray(ts, dtype=float)
    vs = np.asarray(vs, dtype=float)
    n = len(ts)
    m = np.zeros_like(vs)
    for i in range(n):
        if i == 0:
            m[i] = (vs[1] - vs[0]) / (ts[1] - ts[0])
        elif i == n - 1:
            m[i] = (vs[-1] - vs[-2]) / (ts[-1] - ts[-2])
        else:
            a = (vs[i] - vs[i - 1]) / (ts[i] - ts[i - 1])
            b = (vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i])
            mm = (vs[i + 1] - vs[i - 1]) / (ts[i + 1] - ts[i - 1])
            m[i] = np.where(a * b <= 0, 0.0, mm)
    t = np.clip(np.asarray(t, dtype=float), ts[0], ts[-1])
    k = np.clip(np.searchsorted(ts, t, side="right") - 1, 0, n - 2)
    h = ts[k + 1] - ts[k]
    u = ((t - ts[k]) / h)[..., None]
    h00 = 2 * u**3 - 3 * u**2 + 1
    h10 = u**3 - 2 * u**2 + u
    h01 = -2 * u**3 + 3 * u**2
    h11 = u**3 - u**2
    return h00 * vs[k] + h10 * h[..., None] * m[k] + h01 * vs[k + 1] + h11 * h[..., None] * m[k + 1]


def unwrap_heading(keys, col=4):
    """向きの列を、359° → 1° のような所で飛ばないようにつなぐ"""
    out = [list(k) for k in keys]
    for i in range(1, len(out)):
        d = (out[i][col] - out[i - 1][col] + 180.0) % 360.0 - 180.0
        out[i][col] = out[i - 1][col] + d
    return out


def orientation(hdg: float, pitch: float, roll: float, axes: np.ndarray) -> np.ndarray:
    """向き・見下ろす角・傾き（度）→ カメラの 右・上・前（3×3 の行。axes はその地点の 東・北・上）"""
    E, N, U = axes
    h, p, r = math.radians(hdg), math.radians(pitch), math.radians(roll)
    hv = math.sin(h) * E + math.cos(h) * N
    right = math.cos(h) * E - math.sin(h) * N
    fwd = math.cos(p) * hv + math.sin(p) * U
    up = np.cross(right, fwd)
    up /= np.linalg.norm(up)
    right = np.cross(fwd, up)
    # 傾き（右へ傾くと正）
    r2 = math.cos(r) * right - math.sin(r) * up
    u2 = math.cos(r) * up + math.sin(r) * right
    return np.array([r2, u2, fwd])


def frames(scene: str) -> list[int]:
    """その場面で描くコマの番号（つなぎ目のまわりは、雲の中で混ぜられるように両方の場面で描く）"""
    total = int(round(T_END * FPS))
    cut = int(round(CUT_LOCAL * FPS))
    if scene == "global":
        return list(range(0, cut + 4))
    return list(range(cut - 3, total))


def camera(scene: str, f: int) -> dict:
    """コマ f のカメラ（その場面の座標での位置・右・上・前・焦点距離）"""
    t = f / FPS
    if scene == "global":
        keys = unwrap_heading(GLOBAL_KEYS)
        vals = [[k[1], k[2], math.log(k[3]), k[4], k[5], k[6], k[7]] for k in keys]
        lat, lon, la, hdg, pitch, roll, focal = hermite([k[0] for k in keys], vals, t)
        alt = math.exp(la)
        e, n, u = enu(lat, lon, alt * 1000.0, *P0)
        pos = np.array([float(e), float(n), float(u)]) / 1000.0
        axes = local_axes(lat, lon, *P0)
    else:
        # 傾きは、向きの変わる速さに合わせる（鷹が曲がるときのように。右へ曲がると右へ傾く）
        x, y, alt, hdg, pitch, focal, roll = local_state(t)
        z = alt - (x * x + y * y) / (2.0 * R_EARTH)  # 地球の丸みの分
        pos = np.array([x, y, z], dtype=float)
        axes = np.eye(3)
        lat = P1[0] + math.degrees(y / R_EARTH)
        lon = P1[1] + math.degrees(x / (R_EARTH * math.cos(math.radians(P1[0]))))
    rot = orientation(float(hdg), float(pitch), float(roll), axes)
    if scene == "global" and t > DIVE[0]:
        w = float(ease((t - DIVE[0]) / (DIVE[1] - DIVE[0])))
        te, tn, tu = enu(DIVE_TARGET[0], DIVE_TARGET[1], DIVE_TARGET[2] * EXAG, *P0)
        to = np.array([float(te), float(tn), float(tu)]) / 1000.0 - pos
        to /= np.linalg.norm(to)
        fwd = rot[2] * (1 - w) + to * w
        fwd /= np.linalg.norm(fwd)
        upv = axes[2]
        right = np.cross(fwd, upv)
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        rot = np.array([right, up, fwd])
    return dict(t=t, pos=pos, right=rot[0], up=rot[1], fwd=rot[2], focal=float(focal), lat=float(lat), lon=float(lon))


_TERRAIN: dict = {}


def terrain() -> dict:
    """上高地のまわり（near）と北アルプス〜富士山（mid）の標高（fetch.py で保存したもの）"""
    if not _TERRAIN:
        import json
        import os

        here = os.path.dirname(os.path.abspath(__file__))
        work = os.environ.get("PC_OPENING_WORK", os.path.join(here, "work"))
        for name in ("near", "mid"):
            with open(os.path.join(work, f"{name}.json")) as f:
                _TERRAIN[name + "_meta"] = json.load(f)
            _TERRAIN[name] = np.load(os.path.join(work, f"{name}.npy"))
    return _TERRAIN


def ground(lat, lon) -> np.ndarray:
    """地面の標高（m）。上高地のまわりは細かいデータ、外は粗いデータ"""
    from geo import height_at

    T = terrain()
    lat = np.atleast_1d(lat)
    lon = np.atleast_1d(lon)
    w, s, e, n = T["near_meta"]["bbox"]
    inside = (lon > w) & (lon < e) & (lat > s) & (lat < n)
    out = height_at(T["mid"], T["mid_meta"], lat, lon)
    if inside.any():
        out[inside] = height_at(T["near"], T["near_meta"], lat[inside], lon[inside])
    return out


def _catmull_rom(P: np.ndarray, step: float = 5.0) -> tuple[np.ndarray, np.ndarray]:
    """通過点を滑らかに結ぶ（centripetal Catmull-Rom）。点の並びと、それぞれがどの通過点の間か（小数）"""
    Q = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    pts, idx = [], []
    for i in range(len(Q) - 3):
        p0, p1, p2, p3 = Q[i : i + 4]
        t0 = 0.0
        t1 = t0 + np.linalg.norm(p1 - p0) ** 0.5
        t2 = t1 + np.linalg.norm(p2 - p1) ** 0.5
        t3 = t2 + np.linalg.norm(p3 - p2) ** 0.5
        n = max(8, int(np.linalg.norm(p2 - p1) / step))
        ts = np.linspace(t1, t2, n, endpoint=False)[:, None]
        a1 = (t1 - ts) / (t1 - t0) * p0 + (ts - t0) / (t1 - t0) * p1
        a2 = (t2 - ts) / (t2 - t1) * p1 + (ts - t1) / (t2 - t1) * p2
        a3 = (t3 - ts) / (t3 - t2) * p2 + (ts - t2) / (t3 - t2) * p3
        b1 = (t2 - ts) / (t2 - t0) * a1 + (ts - t0) / (t2 - t0) * a2
        b2 = (t3 - ts) / (t3 - t1) * a2 + (ts - t1) / (t3 - t1) * a3
        pts.append((t2 - ts) / (t2 - t1) * b1 + (ts - t1) / (t2 - t1) * b2)
        idx.append(i + (ts[:, 0] - t1) / (t2 - t1))
    pts.append(Q[-2][None])
    idx.append(np.array([len(P) - 1.0]))
    return np.vstack(pts), np.concatenate(idx)


def _smooth(a: np.ndarray, sigma: float) -> np.ndarray:
    """ガウスでならす（sigma は点の数。端は端の値でのばす）"""
    r = int(3 * sigma)
    if r < 1:
        return a.copy()
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    return np.convolve(np.pad(a, r, mode="edge"), k, mode="valid")


_ROUTE: dict = {}


def route() -> dict:
    """上高地の道筋を、5m ごとの点にする（位置・高さ・時刻・見下ろす角の足し・焦点距離）"""
    if _ROUTE:
        return _ROUTE
    R = np.array(LOCAL_ROUTE)
    W = np.array([[float(v) for v in enu(r[0], r[1], 0.0, *P1)[:2]] for r in R])
    pts, idx = _catmull_rom(W)
    # 5m ごとに並べ直す
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s_raw = np.concatenate([[0.0], np.cumsum(seg)])
    s = np.arange(0.0, s_raw[-1], 5.0)
    x = np.interp(s, s_raw, pts[:, 0])
    y = np.interp(s, s_raw, pts[:, 1])
    k = np.interp(s, s_raw, idx)

    def param(col):
        return _smooth(np.interp(k, np.arange(len(R)), R[:, col]), 40)

    clear, floor, speed, bias, focal = param(2), param(3), param(4), param(5), param(6)
    # 地面（道の左右 100m も見る：斜面の横をかすめるときに、山にめり込まない）
    tx, ty = np.gradient(x), np.gradient(y)
    tn = np.hypot(tx, ty)
    nx, ny = -ty / tn, tx / tn
    g = np.full_like(s, -1e9)
    for off in (-100.0, -50.0, 0.0, 50.0, 100.0):
        gx, gy = x + nx * off, y + ny * off
        lat = P1[0] + np.degrees(gy / R_EARTH)
        lon = P1[1] + np.degrees(gx / (R_EARTH * math.cos(math.radians(P1[0]))))
        g = np.maximum(g, ground(lat, lon))
    want = np.maximum(g + clear, floor)
    # 山の手前で先に上がる（前 700m・後ろ 200m の一番高い所）→ ならす → 目安より下がらない
    z = want.copy()
    n = len(s)
    ahead, behind = 140, 40
    for i in range(n):
        z[i] = want[max(0, i - behind) : min(n, i + ahead)].max()
    for sigma in (50, 25):
        z = np.maximum(_smooth(z, sigma), want)
    z = _smooth(z, 12)
    # 時刻：速さの目安の比で配り、全体を ROUTE_START〜ROUTE_END に合わせる
    dt = 5.0 / np.maximum(speed, 0.05)
    t = np.concatenate([[0.0], np.cumsum(dt[:-1])])
    t = ROUTE_START + t / t[-1] * (ROUTE_END - ROUTE_START)
    # 向き・見下ろす角・傾きは、なめらかにした道筋から（高さを地形に合わせたときの細かい段差で、向きが跳ねないように）
    xs, ys, zs = _smooth(x, 40), _smooth(y, 40), _smooth(z, 40)
    hdg = np.degrees(np.unwrap(np.arctan2(np.gradient(xs), np.gradient(ys))))
    hdg = _smooth(hdg, 110)  # 向きは約 0.5km の幅でならす（曲がるときに先を見る。向きの変わる速さを抑える）
    slope = np.gradient(zs) / np.maximum(np.hypot(np.gradient(xs), np.gradient(ys)), 1e-6)
    ang = np.degrees(np.arctan(slope))
    pitch = _smooth(np.where(ang > 0, ang * 0.15, ang * 0.6), 70) + bias
    rate = np.gradient(hdg) / np.maximum(np.gradient(t), 1e-6)  # 度/秒
    level = np.clip((s[-1] * 0.82 - s) / (s[-1] * 0.12), 0.0, 1.0)  # 最後（雲海と朝日の景色）は水平に戻す
    roll = _smooth(np.clip(rate * 0.3, -14.0, 14.0) * level, 40)
    _ROUTE.update(s=s, x=x, y=y, z=z, ground=g, t=t, bias=bias, focal=focal, hdg=hdg, pitch=pitch, roll=roll)
    return _ROUTE


def local_state(t: float) -> tuple[float, float, float, float, float, float, float]:
    """上高地の場面の、時刻 t の 位置（東・北 m）・高さ（m）・向き・見下ろす角・焦点距離・傾き"""
    r = route()
    if t <= ROUTE_END:
        s = float(np.interp(t, r["t"], r["s"]))
        x, y, z, hdg, pitch, focal, roll = (float(np.interp(s, r["s"], r[k])) for k in ("x", "y", "z", "hdg", "pitch", "focal", "roll"))
        return x, y, z, hdg, pitch, focal, roll
    # 道筋のあと：同じ向きにゆっくり進み（ほとんど止まる。ロゴ）、HOLD_END からは静かに上がりながら少し上を向く
    x0, y0, z0, h0, p0, f0, r0 = local_state(ROUTE_END)
    xe, ye, ze = local_state(ROUTE_END - 0.1)[:3]
    vx, vy, vz = (x0 - xe) / 0.1, (y0 - ye) / 0.1, (z0 - ze) / 0.1
    d = t - ROUTE_END
    tau = 0.9
    glide = tau * (1.0 - math.exp(-d / tau)) + 0.05 * d  # 進む量（秒に直した量。速さはだんだん落ち、少しだけ残る）
    x, y, z = x0 + vx * glide, y0 + vy * glide, z0 + max(vz, 0.0) * glide + 25.0 * d
    pitch, roll = p0, r0 * math.exp(-d / 0.6)
    if t > HOLD_END:
        e = t - HOLD_END
        span = T_END - HOLD_END
        u = float(ease(e / span))
        z += 700.0 * (e / span) ** 2  # 静かに上がる（だんだん速く）
        pitch = p0 + (TILT_TO - p0) * u
    return x, y, z, h0, pitch, f0, roll


def global_sun_el(t: float) -> float:
    """列島の場面の、時刻 t の太陽の高さ（度。上高地での高さ）"""
    ts = [k[0] for k in GLOBAL_SUN_EL]
    vs = [[k[1]] for k in GLOBAL_SUN_EL]
    return float(hermite(ts, vs, t)[0])


def sun_dir(scene: str, t: float | None = None) -> np.ndarray:
    """太陽の向き（その場面の座標）。列島の場面は時刻 t で高さが変わる（地平線の下から上がる）"""
    el = SUN_EL if scene == "local" else global_sun_el(0.0 if t is None else t)
    a, e = math.radians(SUN_AZ), math.radians(el)
    s = np.array([math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), math.sin(e)])
    if scene == "local":
        return s
    E, N, U = local_axes(P1[0], P1[1], *P0)
    return s[0] * E + s[1] * N + s[2] * U


def report(near=None, near_meta=None, mid=None, mid_meta=None) -> None:
    """カメラの速さ・向きの変わる速さ・地面からの高さを、0.1 秒ごとに出す（確かめる用）"""
    from geo import height_at

    for scene in ("global", "local"):
        fs = frames(scene)
        prev = None
        print(f"--- {scene}")
        for f in fs:
            c = camera(scene, f)
            unit = 1000.0 if scene != "local" else 1.0
            line = f"{c['t']:5.2f}s"
            if prev is not None:
                v = np.linalg.norm(c["pos"] - prev["pos"]) * unit * FPS
                turn = math.degrees(math.acos(float(np.clip(np.dot(c["fwd"], prev["fwd"]), -1, 1)))) * FPS
                line += f"  速さ {v:7.0f}m/s  向きの変化 {turn:5.1f}°/s"
            if scene == "local" and near is not None:
                g = float(height_at(near, near_meta, c["lat"], c["lon"])[0])
                if not (near_meta["bbox"][0] < c["lon"] < near_meta["bbox"][2] and near_meta["bbox"][1] < c["lat"] < near_meta["bbox"][3]):
                    g = float(height_at(mid, mid_meta, c["lat"], c["lon"])[0])
                line += f"  地面から {c['pos'][2] + (c['pos'][0] ** 2 + c['pos'][1] ** 2) / (2 * R_EARTH) - g:6.0f}m（地面 {g:5.0f}m）"
            if f % 3 == 0:
                print(line)
            prev = c


if __name__ == "__main__":
    import json
    import os

    here = os.path.dirname(os.path.abspath(__file__))
    work = os.environ.get("PC_OPENING_WORK", os.path.join(here, "work"))
    near = np.load(os.path.join(work, "near.npy"))
    mid = np.load(os.path.join(work, "mid.npy"))
    with open(os.path.join(work, "near.json")) as f:
        nm = json.load(f)
    with open(os.path.join(work, "mid.json")) as f:
        mm = json.load(f)
    report(near, nm, mid, mm)
