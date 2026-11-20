"""PC のオープニング CG の時間割とカメラの動き（numpy だけ。Blender の外でも確かめられる）。

場面は3つで、つなぎ目は雲の中（画面が白いうち）で切り替える：
  global … 列島の場面（夜明けの太平洋 → 列島が海から現れる → 列島を見渡して、北アルプスへ降りる）。単位は km
  local  … 上高地の場面（穂高の稜線を越え、上高地の谷へ降り、梓川の上を飛び、東の稜線より高く上がると、雲海と朝日）。単位は m
  top    … 真上から見た日本列島（PC のホームの地図へつなぐ）。単位は km（global と同じ場面）

キー（通る所）は「秒・緯度・経度・高さ・向き（北 0°・東 90°）・見下ろす角（下が負）・傾き（右に傾くと正）・焦点距離 mm」。
キーの間は、速さがつながるように補間する（急に止まったり向きが跳んだりしない）。
"""

from __future__ import annotations

import math

import numpy as np

from geo import R_EARTH, enu, local_axes

FPS = 30
T_END = 13.5
# 雲の中で場面を切り替える秒
CUT_LOCAL = 5.6
CUT_TOP = 12.9
# 列島の場面の原点と、高さの強調（列島を高い空から見ると、本当の高さでは起伏がほとんど見えないので 2.5 倍にする）
P0 = (36.0, 137.6)
EXAG = 2.5
# 上高地の場面の原点（梓川の谷のあたり）
P1 = (36.265, 137.68)
# 朝日の向き（方位・高さ）。上高地の場面では、稜線を越えた先の正面に来るように。
# 列島の場面は、九州の南西から北東を見るので、右前から光が当たり、太平洋が光るように少し高く
SUN_AZ = 104.0
SUN_EL = 5.0
GLOBAL_SUN = (80.0, 11.0)
# 列島が海から現れる間（秒）と、現れる前に沈めておく深さ（km。強調した高さで、富士山より深く）
RISE = (0.6, 3.6)
RISE_DEPTH = 3.8 * EXAG + 0.6

# 列島の場面（高さは km）。九州の南西の空から、北東へ弓なりに伸びる列島を見る（朝日は右前）
GLOBAL_KEYS = [
    # 秒, 緯度, 経度, 高さkm, 向き, 見下ろす角, 傾き, 焦点距離
    (0.0, 27.8, 127.0, 160.0, 32.0, -14.0, 0.0, 30.0),  # 夜明けの東シナ海〜太平洋。高い空から北東を見る
    (1.2, 28.1, 127.3, 175.0, 32.0, -15.0, 0.0, 30.0),  # 列島が現れ始める
    (3.7, 28.4, 128.0, 560.0, 34.0, -28.0, 0.0, 30.0),  # 引きながら上がって、列島全体
    (4.6, 31.8, 132.0, 300.0, 40.0, -38.0, 0.0, 30.0),  # 北アルプスへ降り始める
    (5.2, 34.8, 136.0, 120.0, 45.0, -50.0, 0.0, 30.0),
    (5.6, 35.9, 137.3, 60.0, 48.0, -55.0, 0.0, 30.0),  # 雲の中へ
]
# 上高地の場面の道筋（高さは自動：地面からの高さの目安を保ち、山の手前で先に上がる。海抜の下限も付けられる。
# 速さは目安の比で、全体を ROUTE_START〜ROUTE_END に合わせる）。
# 緯度, 経度, 地面からの高さの目安 m, 海抜の下限 m, 速さの目安, 見下ろす角の足し（度）, 焦点距離
LOCAL_ROUTE = [
    (36.2985, 137.6555, 700.0, 0.0, 1.00, -16.0, 30.0),  # 雲を抜けると、涸沢の上（奥穂高の北東）
    (36.2868, 137.6505, 200.0, 0.0, 0.90, -14.0, 30.0),  # 吊尾根（奥穂高と前穂高の間）をかすめる
    (36.2745, 137.6468, 330.0, 0.0, 1.00, -20.0, 30.0),  # 岳沢を谷へ降りる
    (36.2590, 137.6455, 220.0, 0.0, 0.72, -8.0, 30.0),  # 河童橋の東。谷底の森と梓川
    (36.2532, 137.6530, 200.0, 0.0, 0.62, -6.0, 30.0),  # 谷底で大きく左へ弧を描く
    (36.2522, 137.6640, 200.0, 0.0, 0.62, -5.0, 30.0),  # 明神
    (36.2545, 137.6770, 260.0, 2000.0, 0.65, -2.0, 31.0),  # 上がり始める（前を見たまま）
    (36.2558, 137.6900, 400.0, 2900.0, 0.60, -4.0, 32.0),  # 東の稜線より高く出る（朝日が見える）
    (36.2552, 137.7000, 400.0, 3300.0, 0.34, -3.0, 34.0),  # 雲海と朝日。少し右（東南東）へ向けて、富士山も入れる（ロゴ）
    (36.2522, 137.7082, 400.0, 3400.0, 0.20, -4.0, 34.0),
]
ROUTE_START = CUT_LOCAL - 0.35  # 白い間に少し前から動かしておく
ROUTE_END = 11.9
# 道筋のあと：雲海を見下ろしながら上がる（雲の中で、真上から見た日本へ切り替える）
TILT_TO = -50.0
# 真上から見た日本列島（高さは km）
TOP_KEYS = [
    (12.9, 37.2, 137.8, 4200.0, 0.0, -90.0, 0.0, 35.0),
    (13.5, 37.2, 137.8, 3700.0, 0.0, -90.0, 0.0, 35.0),
]
# 画面が白くなる（雲の中）ときの、白さの山（秒：始め・いちばん白い・終わり）
WHITEOUTS = [(5.1, CUT_LOCAL, 5.95), (12.35, CUT_TOP, 13.2)]


def ease(u):
    u = np.clip(u, 0.0, 1.0)
    return u * u * (3.0 - 2.0 * u)


def rise_offset(t: float) -> float:
    """列島の高さのずれ（km。負は海の下）。RISE の間に、ゆっくり動き出して、ゆっくり止まる"""
    u = (t - RISE[0]) / (RISE[1] - RISE[0])
    return -RISE_DEPTH * (1.0 - float(ease(u)))


def whiteness(t: float) -> float:
    """画面の白さ（0〜1。雲の中）"""
    w = 0.0
    for a, m, b in WHITEOUTS:
        if a <= t <= m:
            w = max(w, float(ease((t - a) / (m - a))))
        elif m < t <= b:
            w = max(w, float(1.0 - ease((t - m) / (b - m))))
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
    """その場面で描くコマの番号"""
    total = int(round(T_END * FPS))
    a = int(round(CUT_LOCAL * FPS))
    b = int(round(CUT_TOP * FPS))
    if scene == "global":
        return list(range(0, a + 1))
    if scene == "local":
        return list(range(a, b + 1))
    return list(range(b, total))


def camera(scene: str, f: int) -> dict:
    """コマ f のカメラ（その場面の座標での位置・右・上・前・焦点距離）"""
    t = f / FPS
    if scene in ("global", "top"):
        keys = unwrap_heading(GLOBAL_KEYS if scene == "global" else TOP_KEYS)
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
    hdg = _smooth(hdg, 30)
    slope = np.gradient(zs) / np.maximum(np.hypot(np.gradient(xs), np.gradient(ys)), 1e-6)
    pitch = _smooth(np.degrees(np.arctan(slope)) * 0.6, 30) + bias
    rate = np.gradient(hdg) / np.maximum(np.gradient(t), 1e-6)  # 度/秒
    roll = _smooth(np.clip(rate * 0.35, -12.0, 12.0), 30)
    _ROUTE.update(s=s, x=x, y=y, z=z, ground=g, t=t, bias=bias, focal=focal, hdg=hdg, pitch=pitch, roll=roll)
    return _ROUTE


def local_state(t: float) -> tuple[float, float, float, float, float, float, float]:
    """上高地の場面の、時刻 t の 位置（東・北 m）・高さ（m）・向き・見下ろす角・焦点距離・傾き"""
    r = route()
    if t <= ROUTE_END:
        s = float(np.interp(t, r["t"], r["s"]))
        x, y, z, hdg, pitch, focal, roll = (float(np.interp(s, r["s"], r[k])) for k in ("x", "y", "z", "hdg", "pitch", "focal", "roll"))
        return x, y, z, hdg, pitch, focal, roll
    # 道筋のあと：同じ向きにゆっくり進みながら上がり、雲海を見下ろす
    x0, y0, z0, h0, p0, f0, r0 = local_state(ROUTE_END)
    xe, ye = local_state(ROUTE_END - 0.1)[:2]
    vx, vy = (x0 - xe) / 0.1, (y0 - ye) / 0.1
    d = t - ROUTE_END
    span = CUT_TOP - ROUTE_END
    u = float(ease(d / span))
    slow = d - 0.5 * d * d / span  # 進む速さを、だんだん落とす
    return x0 + vx * slow, y0 + vy * slow, z0 + 2200.0 * u * u, h0, p0 + (TILT_TO - p0) * u, f0, r0 * (1.0 - u)


def sun_dir(scene: str) -> np.ndarray:
    """太陽の向き（その場面の座標）"""
    a, e = math.radians(SUN_AZ), math.radians(SUN_EL)
    s = np.array([math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), math.sin(e)])
    if scene == "local":
        return s
    a, e = math.radians(GLOBAL_SUN[0]), math.radians(GLOBAL_SUN[1])
    s = np.array([math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), math.sin(e)])
    E, N, U = local_axes(P1[0], P1[1], *P0)
    return s[0] * E + s[1] * N + s[2] * U


def report(near=None, near_meta=None, mid=None, mid_meta=None) -> None:
    """カメラの速さ・向きの変わる速さ・地面からの高さを、0.1 秒ごとに出す（確かめる用）"""
    from geo import height_at

    for scene in ("global", "local", "top"):
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
