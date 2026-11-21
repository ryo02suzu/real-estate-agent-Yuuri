"""スマホのオープニング「富士の目覚め」の共通の設定（場所・大きさ・時間割の基本・太陽の位置の計算）。

numpy だけで書く（Blender の中でも外でも使う）。地形の座標の道具は PC の scripts/pc-opening/geo.py をそのまま使う。
"""

from __future__ import annotations

import datetime as _dt
import math
import os
import sys

import numpy as np

sys.dont_write_bytecode = True  # PC の道具を読み込んでも、そのフォルダにキャッシュを書かない

HERE = os.path.dirname(os.path.abspath(__file__))
PC = os.path.join(os.path.dirname(HERE), "pc-opening")
if PC not in sys.path:
    sys.path.append(PC)

WORK = os.environ.get("SP_OPENING_WORK", os.path.join(HERE, "work"))

# 画面：今の多くのスマホ（19.5:9）。古い 16:9 の機種では上下を切るので、大事なものは真ん中の 1080×1920 に入れる
W, H = 1080, 2340
SS = 2  # 2 倍の大きさで描いて縮める
FPS = 30
T_END = 7.5
N_FRAMES = int(round(T_END * FPS))  # 225
# 0〜2.4 秒はアプリが映画の帯（2.39:1）をかぶせる。見せたいものは真ん中の帯（高さ = 幅 / 2.39）に入れる
LETTERBOX = 2.39

# 国土地理院のタイル
TILE_URL = {
    "dem5a": "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png",  # 5m（航空レーザ測量）。ズーム 15
    "dem": "https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png",  # 10m。ズーム 14 まで
}
SUMMIT = (35.36060, 138.72741)  # 剣ヶ峰（標高タイルのいちばん高い点、3,774m）

# 日時：2027 年 4 月 25 日の朝（日本時間）。田貫湖のダイヤモンド富士の季節
DATE = (2027, 4, 25)
JST = _dt.timezone(_dt.timedelta(hours=9))


def julian_day(t: _dt.datetime) -> float:
    return t.astimezone(_dt.timezone.utc).timestamp() / 86400.0 + 2440587.5


def sun_position(t: _dt.datetime, lat: float, lon: float) -> tuple[float, float, float]:
    """太陽の方位（北 0°・東 90°）、高さ（屈折なし）、見かけの高さ（大気の屈折を含む）。NOAA の式"""
    T = (julian_day(t) - 2451545.0) / 36525.0
    L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360.0
    M = math.radians(357.52911 + T * (35999.05029 - 0.0001537 * T))
    e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    C = math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + math.sin(2 * M) * (0.019993 - 0.000101 * T) + math.sin(3 * M) * 0.000289
    omega = math.radians(125.04 - 1934.136 * T)
    lam = math.radians(L0 + C - 0.00569 - 0.00478 * math.sin(omega))
    eps0 = 23.0 + (26.0 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60.0) / 60.0
    eps = math.radians(eps0 + 0.00256 * math.cos(omega))
    decl = math.asin(math.sin(eps) * math.sin(lam))
    y = math.tan(eps / 2) ** 2
    L0r = math.radians(L0)
    eot = 4 * math.degrees(y * math.sin(2 * L0r) - 2 * e * math.sin(M) + 4 * e * y * math.sin(M) * math.cos(2 * L0r)
                           - 0.5 * y * y * math.sin(4 * L0r) - 1.25 * e * e * math.sin(2 * M))
    tu = t.astimezone(_dt.timezone.utc)
    minutes = tu.hour * 60 + tu.minute + tu.second / 60.0 + tu.microsecond / 6e7
    ha = math.radians(((minutes + eot + 4 * lon) % 1440.0) / 4.0 - 180.0)
    la = math.radians(lat)
    cz = math.sin(la) * math.sin(decl) + math.cos(la) * math.cos(decl) * math.cos(ha)
    el = 90.0 - math.degrees(math.acos(max(-1.0, min(1.0, cz))))
    az = (math.degrees(math.atan2(math.sin(ha), math.cos(ha) * math.sin(la) - math.tan(decl) * math.cos(la))) + 180.0) % 360.0
    if el > 85.0:
        r = 0.0
    elif el > 5.0:
        te = math.tan(math.radians(el))
        r = 58.1 / te - 0.07 / te**3 + 0.000086 / te**5
    elif el > -0.575:
        r = 1735.0 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)))
    else:
        r = -20.772 / math.tan(math.radians(el))
    return az, el, el + r / 3600.0


def sun_vec(az: float, el: float) -> np.ndarray:
    """方位・高さ（度）→ 東・北・上の向き"""
    a, e = math.radians(az), math.radians(el)
    return np.array([math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), math.sin(e)])


def sun_color(el_deg: float) -> tuple[float, float, float]:
    """太陽の光の色（空気を長く通るほど赤い）。PC の film.sun_color と同じ式（film.py は bpy を読み込むので写した）"""
    el = max(el_deg, 0.3)
    air = 1.0 / (math.sin(math.radians(el)) + 0.15 * (el + 3.885) ** -1.253)  # Kasten–Young
    t = np.exp(-np.array([0.0193, 0.0345, 0.0716]) * 1.6 * air)
    t /= t.max()
    return tuple(float(v) for v in t)


def read_exr(path: str) -> dict:
    """Blender の EXR（何層か）→ {層の名前: 配列}。PC の atmos.read_exr と同じ（atmos は PC の path.py を読むので写した）"""
    import OpenEXR

    f = OpenEXR.File(path)
    out = {}
    for part in f.parts:
        for k, v in part.channels.items():
            out[k.split(".", 1)[1] if "." in k else k] = np.asarray(v.pixels, dtype=np.float32)
    return out


def ensure_work() -> None:
    os.makedirs(WORK, exist_ok=True)
