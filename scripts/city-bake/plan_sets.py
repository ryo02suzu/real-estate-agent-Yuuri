# 各データセットの建物タイル集合から、視界かつ距離帯に入るタイルを選び、件数と容量を出す
import json, sys, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import ecef, to_enu, CAM
from remotezip import extract
from tilesel import leaves
import numpy as np
LISTS = 'lists'
def corners_stats(region):
    w, s, e, n, h0, h1 = region
    ds, inview = [], False
    hv = CAM['hfov'] / 2 + 6
    for lo in np.linspace(w, e, 5):
        for la in np.linspace(s, n, 5):
            for h in (h0, h1):
                v = to_enu(ecef(math.degrees(la), math.degrees(lo), h))
                d = math.hypot(v[0], v[1]); ds.append(d)
                az = math.degrees(math.atan2(v[0], v[1])) % 360
                if abs((az - CAM['heading'] + 540) % 360 - 180) <= hv: inview = True
    return min(ds), max(ds), inview
def plan(name, tileset_dir, dmin, dmax):
    d = json.load(open(f'{LISTS}/{name}.json'))
    ents = {e['name']: e for e in d['entries']}
    ts_name = tileset_dir + '/tileset.json'
    cache = f'tilesets/{tileset_dir}.json'
    os.makedirs('tilesets', exist_ok=True)
    if not os.path.exists(cache):
        open(cache, 'wb').write(extract(d['url'], ents[ts_name]))
    ts = json.load(open(cache))
    sel, size = [], 0
    for t, depth in leaves(ts['root']):
        a, b, iv = corners_stats(t['boundingVolume']['region'])
        if iv and a <= dmax and b >= dmin:
            uri = t['content']['uri']; e = ents.get(tileset_dir + '/' + uri)
            if e: sel.append(uri); size += e['csize']
    return d['url'], sel, size
if __name__ == '__main__':
    jobs = json.load(open(sys.argv[1]))
    out = []
    for j in jobs:
        url, sel, size = plan(j['name'], j['set'], j['dmin'], j['dmax'])
        print(f"{j['set'][-60:]:60s} tiles {len(sel):4d}  zipMB {size / 2**20:7.1f}", flush=True)
        out.append({**j, 'url': url, 'sel': sel})
    json.dump(out, open(sys.argv[2], 'w'))
