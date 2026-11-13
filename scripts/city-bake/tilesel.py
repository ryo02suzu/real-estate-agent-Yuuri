# タイル集合（tileset.json）から、視界に入る末端のタイルを選ぶ
import os, json, math, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import ecef, to_enu, CAM
def leaves(t, acc=None, depth=0):
    acc = [] if acc is None else acc
    kids = t.get('children', [])
    if not kids: acc.append((t, depth))
    for c in kids: leaves(c, acc, depth + 1)
    return acc
def in_view(region, margin=6.0, maxdist=30000):
    w, s, e, n, h0, h1 = region
    hv = CAM['hfov'] / 2 + margin
    vf = math.degrees(math.atan(math.tan(math.radians(CAM['hfov'] / 2)) / CAM['aspect'])) + margin
    for lo in np.linspace(w, e, 6):
        for la in np.linspace(s, n, 6):
            for h in (h0, h1):
                v = to_enu(ecef(math.degrees(la), math.degrees(lo), h))
                d = math.hypot(v[0], v[1])
                if d < 1 or d > maxdist: continue
                az = math.degrees(math.atan2(v[0], v[1])) % 360
                da = (az - CAM['heading'] + 540) % 360 - 180
                el = math.degrees(math.atan2(v[2], d))
                if abs(da) <= hv and abs(el - CAM['pitch']) <= vf: return True
    return False
if __name__ == '__main__':
    ts = json.load(open(sys.argv[1]))
    L = leaves(ts['root'])
    depths = {}
    for t, d in L: depths[d] = depths.get(d, 0) + 1
    sel = [t['content']['uri'] for t, d in L if in_view(t['boundingVolume']['region'])]
    print('leaves', len(L), 'depths', depths, 'in view', len(sel))
    json.dump(sel, open(sys.argv[2], 'w'))
