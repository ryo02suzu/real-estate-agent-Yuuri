# 選んだタイルを ZIP から取り出し、glb（CESIUM_RTC を外す）と建物の属性に分けて保存する
import json, struct, sys, os, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from remotezip import extract
def parse_b3dm(b):
    magic, ver, blen, ftj, ftb, btj, btb = struct.unpack('<4sIIIIII', b[:28])
    p = 28
    ft = json.loads(b[p:p + ftj]); p += ftj
    ftbin = b[p:p + ftb]; p += ftb
    bt = json.loads(b[p:p + btj]) if btj else {}; p += btj
    btbin = b[p:p + btb]; p += btb
    return ft, bt, btbin, b[p:]
def bt_column(bt, btbin, key, n):
    v = bt.get(key)
    if v is None: return [None] * n
    if isinstance(v, list): return v
    off = v['byteOffset']; ct = v['componentType']
    fmt = {'DOUBLE': 'd', 'FLOAT': 'f', 'BYTE': 'b', 'UNSIGNED_BYTE': 'B', 'SHORT': 'h', 'UNSIGNED_SHORT': 'H', 'INT': 'i', 'UNSIGNED_INT': 'I'}[ct]
    sz = struct.calcsize(fmt)
    return list(struct.unpack('<' + fmt * n, btbin[off:off + sz * n]))
def fix_glb(glb):
    # JSON チャンクから CESIUM_RTC を取り出して外す（three.js が知らない拡張のため）
    jl = struct.unpack('<I', glb[12:16])[0]
    gj = json.loads(glb[20:20 + jl])
    center = (gj.get('extensions') or {}).get('CESIUM_RTC', {}).get('center')
    for k in ('extensionsUsed', 'extensionsRequired'):
        if k in gj: gj[k] = [x for x in gj[k] if x != 'CESIUM_RTC']
    if 'extensions' in gj: gj['extensions'].pop('CESIUM_RTC', None)
    js = json.dumps(gj, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    rest = glb[20 + jl:]
    body = struct.pack('<I', len(js)) + b'JSON' + js + rest
    out = b'glTF' + struct.pack('<II', 2, 12 + len(body)) + body
    return out, center
KEYS = {'usage': 'bldg:usage', 'h': 'bldg:measuredHeight', 'st': 'bldg:storeysAboveGround', 'id': 'gml_id', 'name': 'gml:name', 'x': '_x', 'y': '_y', 'ft': 'feature_type'}
def work(args):
    url, ent, out_dir, key = args
    dst = f'{out_dir}/{key}.glb'
    if os.path.exists(dst) and os.path.exists(f'{out_dir}/{key}.json'): return key, 'cached'
    b = extract(url, ent)
    ft, bt, btbin, glb = parse_b3dm(b)
    n = ft.get('BATCH_LENGTH', 0)
    glb2, center = fix_glb(glb)
    cols = {k: bt_column(bt, btbin, v, n) for k, v in KEYS.items()}
    # 用途は文字なので、コードも残す（attributes の中）
    codes = []
    for a in (bt.get('attributes') or [None] * n):
        codes.append((a or {}).get('bldg:usage_code'))
    cols['usage_code'] = codes
    rtc = (json.loads(glb[20:20 + struct.unpack('<I', glb[12:16])[0]]).get('extensions') or {}).get('CESIUM_RTC', {}).get('center')
    open(dst, 'wb').write(glb2)
    json.dump({'n': n, 'center': rtc, 'rtc_center_ft': ft.get('RTC_CENTER'), 'cols': cols}, open(f'{out_dir}/{key}.json', 'w'), ensure_ascii=False)
    return key, n
if __name__ == '__main__':
    url, listing, prefix, sel, out_dir = sys.argv[1:6]
    os.makedirs(out_dir, exist_ok=True)
    ents = {e['name']: e for e in json.load(open(listing))['entries']}
    uris = json.load(open(sel))
    jobs = [(url, ents[prefix + u], out_dir, u.replace('/', '_').replace('.b3dm', '')) for u in uris]
    done = 0
    with cf.ThreadPoolExecutor(8) as ex:
        for key, n in ex.map(work, jobs):
            done += 1
            if done % 50 == 0: print('done', done, '/', len(jobs), flush=True)
    print('all', done)
