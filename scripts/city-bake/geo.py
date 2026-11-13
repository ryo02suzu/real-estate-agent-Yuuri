# 座標の変換（GRS80 ≒ WGS84）と、カメラの定義
import math, numpy as np
A = 6378137.0; F = 1 / 298.257222101; E2 = F * (2 - F)
def ecef(lat, lon, h):
    la, lo = math.radians(lat), math.radians(lon)
    n = A / math.sqrt(1 - E2 * math.sin(la) ** 2)
    return np.array([(n + h) * math.cos(la) * math.cos(lo), (n + h) * math.cos(la) * math.sin(lo), (n * (1 - E2) + h) * math.sin(la)])
def enu_basis(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    e = np.array([-math.sin(lo), math.cos(lo), 0])
    n = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    u = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    return np.stack([e, n, u])  # 行が E, N, U
GEOID = 36.7  # 東京付近のジオイド高（標高 → 楕円体高）
# 視点：汐留の上空（東京タワーの東北東 約1.6km）。標高 200m。西南西を向く
CAM = dict(lat=35.6640, lon=139.7616, h=260 + GEOID, heading=246.0, hfov=62.0, aspect=393 / 275, pitch=0.25)
TOKYO_TOWER = (35.65866, 139.7454)
FUJI = (35.3606, 138.7274, 3776)
def cam_frame():
    o = ecef(CAM['lat'], CAM['lon'], CAM['h']); R = enu_basis(CAM['lat'], CAM['lon'])
    return o, R
def to_enu(p_ecef):
    o, R = cam_frame()
    return (np.asarray(p_ecef) - o) @ R.T
