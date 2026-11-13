# 描く建物を決め、建物ごとの通し番号（gid）と属性の表を作る。東京タワー（PLATEAU の塔）は外して、別の格子の模型に替える
import os, json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import CAM, ecef, to_enu, enu_basis, GEOID
import numpy as np
sets = []
for p in json.load(open('plan.json')):
    if p['sel'] and p['kind'] != 'veg': sets.append({'dir': 'tiles/' + p['set'], 'kind': p['kind'], 'dmin': p['dmin'], 'dmax': p['dmax'], 'ward': '港区' if '13103' in p['name'] else p['name']})
hv = CAM['hfov'] / 2 + 4
gid = 0; table = [None]; tiles = []; tower = None
for s in sets:
    for f in sorted(os.listdir(s['dir'])):
        if not f.endswith('.json'): continue
        m = json.load(open(f"{s['dir']}/{f}")); c = m['cols']; n = m['n']
        gmap = [0] * n
        for i in range(n):
            x, y, h = c['x'][i], c['y'][i], c['h'][i]
            if x is None or y is None: continue
            v = to_enu(ecef(y, x, GEOID))
            d = math.hypot(v[0], v[1])
            az = math.degrees(math.atan2(v[0], v[1])) % 360
            if abs((az - CAM['heading'] + 540) % 360 - 180) > hv + math.degrees(math.atan2(120, max(d, 1))): continue
            if not (s['dmin'] < d <= s['dmax']) and not (s['dmin'] == 0 and d <= s['dmax']): continue
            if d < 150: continue
            hh0 = h if isinstance(h, (int, float)) else 0
            # 遠くの低い建物は画面で 1 画素未満なので、地面の写真に任せる
            if d > 10000 and hh0 < 22: continue
            if d > 6000 and hh0 < 9: continue
            hh = h if isinstance(h, (int, float)) else None
            if s['ward'] == '港区' and hh and hh > 330:
                tower = {'tile': f"{s['dir']}/{f[:-5]}", 'batch': i, 'lon': x, 'lat': y}; continue
            gid += 1; gmap[i] = gid
            st = c['st'][i]
            st = st if isinstance(st, (int, float)) and 0 < st < 200 else None
            uc = c['usage_code'][i]
            table.append([int(uc) if uc and str(uc).isdigit() else 0, round(hh, 1) if hh else None, st, round(x, 6), round(y, 6), 1 if s['kind'] == 'lod2' else 0])
        if any(gmap):
            tiles.append({'path': f"{s['dir']}/{f[:-5]}", 'center': m['center'] or m['rtc_center_ft'], 'kind': s['kind'], 'gmap': gmap})
o = ecef(CAM['lat'], CAM['lon'], CAM['h']); R = enu_basis(CAM['lat'], CAM['lon'])
# 植生（港区の木 1 本ずつと植栽）
for p in json.load(open('plan.json')):
    if p['sel'] and p['kind'] == 'veg':
        for f in sorted(os.listdir('tiles/' + p['set'])):
            if f.endswith('.json'):
                j = json.load(open(f"tiles/{p['set']}/{f}"))
                tiles.append({'path': f"tiles/{p['set']}/{f[:-5]}", 'center': j['center'] or j['rtc_center_ft'], 'kind': 'veg', 'gmap': [1] * j['n']})
json.dump({'cam': CAM, 'camEcef': o.tolist(), 'enu': R.tolist(), 'tiles': tiles, 'ground': json.load(open('ground.json')), 'tower': tower}, open('manifest.json', 'w'))
json.dump(table, open('buildings.json', 'w'))
print('tiles', len(tiles), 'buildings', gid, 'tower', tower)
