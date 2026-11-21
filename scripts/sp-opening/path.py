#!/usr/bin/env python3
"""スマホのオープニング「富士の目覚め」の時間割・カメラの動き・太陽（numpy だけ。Blender の外でも確かめられる）。

  python3 path.py            # 太陽の時刻とカメラの向きを解いて work/plan.json に、各コマの太陽の画面上の位置を work/sun_px.json に
  python3 path.py --report   # 0.1 秒ごとの高さ・速さ・山頂の見える高さと太陽の位置

構成（約 7.5 秒・30 コマ/秒・225 コマ。ホームへのつなぎはアプリが描く）：
  0.0〜0.6 静寂：夜明け前の藍の雲の中。奥（富士の方）から金の光が漏れる
  0.6〜2.4 上昇：加速して雲の中を真上へ。雲の切れ端がレンズの前を下へ流れ去る。雲が薄くなり、上に富士の影が透ける
  2.4〜3.2 突破：雲海の上面を抜け、勢いがすっと止まる。光が一気に満ちる
  3.2〜5.6 対面：富士、山頂の縁から太陽（ダイヤモンド富士）。ゆっくり押し込みつつ少し回り込む（揺らさない）
  5.6〜7.5 ロゴ：光が落ち着く（ロゴはアプリが描く。山頂の光の点から生まれる）

座標は山頂（剣ヶ峰）を原点にした 東・北・上（m。地球の丸みを入れる。geo.enu）。
カメラの位置は「山頂から見た方位・水平の距離・海抜の高さ」で決め、方位は全体を回して、4.2 秒に太陽が山頂の縁に
来るように解く（太陽の時刻と組みで。下の solve）。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import common as C
import terrain as T
from geo import enu, local_axes  # noqa: E402

DIAMOND_T = 4.2  # ダイヤモンドの瞬間（秒）
DIAMOND_OFFSET = -0.15  # その瞬間の太陽の中心の、山頂の縁からの高さ（度。負は縁の下＝上の一部だけが出る）
# キー：秒, 山頂からの水平の距離 km, 方位のずれ（度。回り込み）, 海抜 m, 横の画角（度）, 山頂の画面の高さ（上からの割合）
KEYS = [
    (0.0, 14.62, -0.30, 1000.0, 16.0, 0.45),
    (0.6, 14.59, -0.29, 1016.0, 16.0, 0.45),
    (1.2, 14.50, -0.26, 1110.0, 15.6, 0.45),
    (1.5, 14.45, -0.24, 1172.0, 15.0, 0.45),
    (2.2, 14.27, -0.18, 1300.0, 12.8, 0.43),
    (2.8, 14.13, -0.12, 1372.0, 12.2, 0.39),
    (3.2, 14.09, -0.08, 1398.0, 11.8, 0.37),
    (4.2, 14.01, 0.00, 1430.0, 11.2, 0.36),
    (5.6, 13.92, 0.065, 1455.0, 11.0, 0.36),
    (7.5, 13.885, 0.075, 1460.0, 10.95, 0.36),
]
# 5.6 秒からはほとんど止まる（約 20m/秒）。この間は 3 コマおきに描いて、間を混ぜて作れる（post.py）
LOOK_TIMES = {"a": 1.5, "b": 2.8, "c": 4.2}  # 見た目の確認の静止画


def hermite(ts, vs, t):
    """キーの間を、速さがつながるように補間する（山・谷のキーで止まる）。PC の path.hermite と同じ考え方"""
    ts = np.asarray(ts, float)
    vs = np.asarray(vs, float)
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
    t = float(np.clip(t, ts[0], ts[-1]))
    k = int(np.clip(np.searchsorted(ts, t, side="right") - 1, 0, n - 2))
    h = ts[k + 1] - ts[k]
    u = (t - ts[k]) / h
    return (2 * u**3 - 3 * u**2 + 1) * vs[k] + (u**3 - 2 * u**2 + u) * h * m[k] + (-2 * u**3 + 3 * u**2) * vs[k + 1] + (u**3 - u**2) * h * m[k + 1]


def key_state(t: float):
    vals = hermite([k[0] for k in KEYS], [list(k[1:]) for k in KEYS], t)
    d_km, dbrg, alt, hfov, sy = (float(v) for v in vals)
    return d_km * 1000.0, dbrg, alt, hfov, sy


def cam_latlon(t: float, bearing0: float):
    d, dbrg, alt, hfov, sy = key_state(t)
    lat, lon = T.bearing_point(C.SUMMIT[0], C.SUMMIT[1], bearing0 + dbrg, d)
    return lat, lon, alt, hfov, sy


def summit_peak(lat: float, lon: float, alt: float, az0: float, win: float = 1.2):
    """カメラから見た山頂のあたりの輪郭のいちばん高い所（方位・高さ・距離）"""
    d = math.hypot(*[float(v) for v in enu(C.SUMMIT[0], C.SUMMIT[1], 0.0, lat, lon)[:2]])
    azs = np.arange(az0 - win, az0 + win, 0.003)
    prof, pd = T.profile(lat, lon, alt, azs, d - 3500.0, d + 2500.0, 3.0)
    k = int(np.argmax(prof))
    return float(azs[k]), float(prof[k]), float(pd[k])


def sun_time_for_el(lat: float, lon: float, el_app: float) -> dt.datetime:
    y, m, d = C.DATE
    t0 = dt.datetime(y, m, d, 4, 30, tzinfo=C.JST)
    lo, hi = 0.0, 3.0 * 3600.0
    for _ in range(50):
        mid = (lo + hi) / 2
        if C.sun_position(t0 + dt.timedelta(seconds=mid), lat, lon)[2] < el_app:
            lo = mid
        else:
            hi = mid
    return t0 + dt.timedelta(seconds=lo)


def solve() -> dict:
    """4.2 秒に、太陽の中心が山頂の縁の DIAMOND_OFFSET 度上に来るよう、道筋の向き（方位）と太陽の時刻を決める"""
    bearing0 = 260.0
    for _ in range(8):
        lat, lon, alt, *_ = cam_latlon(DIAMOND_T, bearing0)
        e, n, _u = enu(C.SUMMIT[0], C.SUMMIT[1], 0.0, lat, lon)
        az_summit = math.degrees(math.atan2(float(e), float(n))) % 360.0
        paz, pel, pdist = summit_peak(lat, lon, alt, az_summit)
        when = sun_time_for_el(lat, lon, pel + DIAMOND_OFFSET)
        saz, seg, sea = C.sun_position(when, lat, lon)
        bearing0 += saz - paz  # 山頂のまわりに回すと、山頂の見える方位も同じだけ回る
    lat, lon, alt, *_ = cam_latlon(DIAMOND_T, bearing0)
    sv_local = C.sun_vec(saz, sea)
    sv = local_axes(lat, lon, *C.SUMMIT).T @ sv_local  # 原点（山頂）の座標での向き
    return dict(bearing0=bearing0, time=when.isoformat(), sun_az=saz, sun_el_geo=seg, sun_el_app=sea, sun_vec=sv.tolist(),
                cam_lat=lat, cam_lon=lon, cam_alt=alt, peak_az=paz, peak_el=pel, peak_dist=pdist,
                cam_ground=float(T.ground(lat, lon)[0]))


def orientation(hdg: float, pitch: float, axes: np.ndarray) -> np.ndarray:
    """向き・見上げる角（度）→ カメラの 右・上・前（3×3 の行。axes はその地点の 東・北・上）。傾けない"""
    E, N, U = axes
    h, p = math.radians(hdg), math.radians(pitch)
    hv = math.sin(h) * E + math.cos(h) * N
    right = math.cos(h) * E - math.sin(h) * N
    fwd = math.cos(p) * hv + math.sin(p) * U
    up = np.cross(right, fwd)
    up /= np.linalg.norm(up)
    right = np.cross(fwd, up)
    return np.array([right, up, fwd])


_PLAN: dict = {}


def plan() -> dict:
    if not _PLAN:
        with open(os.path.join(C.WORK, "plan.json")) as f:
            _PLAN.update(json.load(f))
    return _PLAN


def camera(f: int, p: dict | None = None) -> dict:
    """コマ f のカメラ（原点＝山頂の座標での位置・右・上・前、焦点距離 mm（横 36mm）、画角）"""
    p = p or plan()
    t = f / C.FPS
    lat, lon, alt, hfov, sy = cam_latlon(t, p["bearing0"])
    e, n, u = enu(lat, lon, alt, *C.SUMMIT)
    pos = np.array([float(e), float(n), float(u)])
    axes = local_axes(lat, lon, *C.SUMMIT)
    # 山頂（剣ヶ峰）を、横は真ん中、縦は上から sy の所に置く
    rel = axes @ (np.array([0.0, 0.0, 3774.0]) - pos)  # その地点の 東・北・上
    s_az = math.degrees(math.atan2(rel[0], rel[1]))
    s_el = math.degrees(math.atan2(rel[2], math.hypot(rel[0], rel[1])))
    vt = math.tan(math.radians(hfov) / 2) * C.H / C.W
    pitch = s_el - math.degrees(math.atan((1.0 - 2.0 * sy) * vt))
    rot = orientation(s_az, pitch, axes)
    return dict(t=t, pos=pos, right=rot[0], up=rot[1], fwd=rot[2], focal=18.0 / math.tan(math.radians(hfov) / 2), sensor=36.0,
                hfov=hfov, lat=lat, lon=lon, alt=alt, pitch=pitch, hdg=s_az)


def project(cam: dict, d: np.ndarray, w: int = C.W, h: int = C.H):
    """向き d（原点の座標）→ 画面の画素（x, y。左上が 0）"""
    fpx = cam["focal"] / cam["sensor"] * w
    z = float(d @ cam["fwd"])
    return w / 2 + float(d @ cam["right"]) / z * fpx, h / 2 - float(d @ cam["up"]) / z * fpx


def sun_dir(p: dict | None = None) -> np.ndarray:
    return np.asarray((p or plan())["sun_vec"], float)


def sun_pixels(p: dict) -> list[dict]:
    """各コマの太陽の中心の画面上の位置（1080×2340 の画素）と、山頂の縁から出ている割合（0〜1）"""
    sv = sun_dir(p)
    out = []
    r_sun = 0.2665
    for f in range(C.N_FRAMES):
        cam = camera(f, p)
        x, y = project(cam, sv)
        # 太陽の方位での山の輪郭の高さ → 円盤のうち縁より上にある割合
        loc = local_axes(cam["lat"], cam["lon"], *C.SUMMIT) @ sv
        az = math.degrees(math.atan2(loc[0], loc[1]))
        el = math.degrees(math.asin(loc[2]))
        prof, _ = T.profile(cam["lat"], cam["lon"], cam["alt"], np.array([az]), 9000.0, 20000.0, 3.0)
        hgt = (el - float(prof[0])) / r_sun  # 円盤の中心の、縁からの高さ（半径を 1 として）
        h = float(np.clip(hgt, -1.0, 1.0))
        vis = 1.0 if hgt >= 1 else (0.0 if hgt <= -1 else (math.acos(-h) - (-h) * math.sqrt(1 - h * h)) / math.pi)
        out.append(dict(frame=f, t=round(f / C.FPS, 4), x=round(x, 1), y=round(y, 1), visible=round(vis, 3)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    C.ensure_work()
    p = solve()
    with open(os.path.join(C.WORK, "plan.json"), "w") as f:
        json.dump(p, f, indent=1, ensure_ascii=False)
    _PLAN.clear()
    _PLAN.update(p)
    print(json.dumps({k: (round(v, 5) if isinstance(v, float) else v) for k, v in p.items() if k != "sun_vec"}, ensure_ascii=False))
    px = sun_pixels(p)
    with open(os.path.join(C.WORK, "sun_px.json"), "w") as f:
        json.dump(dict(width=C.W, height=C.H, fps=C.FPS, frames=px), f, ensure_ascii=False)
    for t in (0.0, 0.6, 1.5, 2.4, 2.8, 3.2, 4.2, 5.6, 7.45):
        q = px[min(int(round(t * C.FPS)), C.N_FRAMES - 1)]
        print(f"{t:4.2f}s 太陽 ({q['x']:7.1f}, {q['y']:7.1f}) 出ている割合 {q['visible']:.2f}")
    if a.report:
        prev = None
        for f in range(0, C.N_FRAMES, 3):
            c = camera(f, p)
            v = 0.0 if prev is None else np.linalg.norm(c["pos"] - prev["pos"]) * C.FPS / 3
            print(f"{c['t']:5.2f}s 海抜 {c['alt']:6.0f}m 速さ {v:6.1f}m/s 見上げ {c['pitch']:5.2f}° 画角 {c['hfov']:4.1f}°")
            prev = c


if __name__ == "__main__":
    main()
