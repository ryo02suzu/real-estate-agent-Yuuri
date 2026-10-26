# PLATEAU の東京タワー（港区の LOD2）の外形を測る：足元の中心・平面の向き・高さごとの幅（tower.py が使う）
import json, struct, io, math, sys, os
import numpy as np, DracoPy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import ecef, enu_basis, GEOID
t = json.load(open('manifest.json'))['tower']
b = open(t['tile'] + '.glb', 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]; gj = json.loads(b[20:20 + jl]); binstart = 20 + jl + 8
center = np.array(json.load(open(t['tile'] + '.json'))['center'])
def bv(i):
    v = gj['bufferViews'][i]; o = binstart + v.get('byteOffset', 0); return b[o:o + v['byteLength']]
lat, lon = t['lat'], t['lon']
R = enu_basis(lat, lon); o = ecef(lat, lon, GEOID)
V = []
for mesh in gj['meshes']:
    for pr in mesh['primitives']:
        ext = pr['extensions']['KHR_draco_mesh_compression']
        dm = DracoPy.decode(bv(ext['bufferView']))
        pts = np.array(dm.points, dtype=np.float64).reshape(-1, 3)
        bat = None
        for a in dm.attributes:
            if [k for k, v in ext['attributes'].items() if v == a['unique_id']] == ['_BATCHID']: bat = np.array(a['data']).reshape(-1)
        if bat is None: continue
        sel = np.isclose(bat, t['batch'])
        P = np.stack([pts[:, 0], -pts[:, 2], pts[:, 1]], 1) + center
        V.append(((P - o) @ R.T)[sel])
V = np.concatenate(V)
low = V[V[:, 2] < V[:, 2].min() + 6]
c = low[:, :2].mean(0)
best = None
for a in np.radians(np.arange(0, 90, 0.5)):
    rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    q = (low[:, :2] - c) @ rot
    area = (q[:, 0].max() - q[:, 0].min()) * (q[:, 1].max() - q[:, 1].min())
    if best is None or area < best[0]: best = (area, math.degrees(a))
json.dump({'center_enu_tower': c.tolist(), 'rot_deg': best[1], 'z0': float(V[:, 2].min()), 'lat': lat, 'lon': lon}, open('tower-profile.json', 'w'))
print('tower base', c.round(2), 'rotation', best[1], 'z0', round(float(V[:, 2].min()), 1))
