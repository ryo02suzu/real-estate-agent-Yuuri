# 大きな ZIP を全部落とさずに、HTTP の Range で目次（central directory）だけ読む。必要なら 1 ファイルだけ取り出す
import struct, sys, zlib, urllib.request, json
def rng(url, start, end):
    req = urllib.request.Request(url, headers={'Range': f'bytes={start}-{end}'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()
def size(url):
    req = urllib.request.Request(url, method='HEAD')
    with urllib.request.urlopen(req, timeout=60) as r:
        return int(r.headers['Content-Length'])
def listing(url):
    n = size(url)
    tail = rng(url, max(0, n - 65557), n - 1)
    i = tail.rfind(b'PK\x05\x06')
    cd_size, cd_off = struct.unpack('<II', tail[i + 12:i + 20])
    entries_total = struct.unpack('<H', tail[i + 10:i + 12])[0]
    if cd_off == 0xFFFFFFFF or cd_size == 0xFFFFFFFF or entries_total == 0xFFFF:
        j = tail.rfind(b'PK\x06\x07')
        z64_off = struct.unpack('<Q', tail[j + 8:j + 16])[0]
        z = rng(url, z64_off, z64_off + 55)
        entries_total, cd_size, cd_off = struct.unpack('<QQQ', z[32:56])
    cd = rng(url, cd_off, cd_off + cd_size - 1)
    out = []; p = 0
    while p < len(cd) and cd[p:p + 4] == b'PK\x01\x02':
        method = struct.unpack('<H', cd[p + 10:p + 12])[0]
        csize, usize = struct.unpack('<II', cd[p + 20:p + 28])
        fnl, exl, cml = struct.unpack('<HHH', cd[p + 28:p + 34])
        lho = struct.unpack('<I', cd[p + 42:p + 46])[0]
        name = cd[p + 46:p + 46 + fnl].decode('utf-8', 'replace')
        ex = cd[p + 46 + fnl:p + 46 + fnl + exl]
        q = 0
        while q + 4 <= len(ex):
            hid, hl = struct.unpack('<HH', ex[q:q + 4]); body = ex[q + 4:q + 4 + hl]
            if hid == 1:
                vals = []; k = 0
                for need in (usize == 0xFFFFFFFF, csize == 0xFFFFFFFF, lho == 0xFFFFFFFF):
                    if need: vals.append(struct.unpack('<Q', body[k:k + 8])[0]); k += 8
                    else: vals.append(None)
                usize = vals[0] if vals[0] is not None else usize
                csize = vals[1] if vals[1] is not None else csize
                lho = vals[2] if vals[2] is not None else lho
            q += 4 + hl
        out.append({'name': name, 'method': method, 'csize': csize, 'usize': usize, 'off': lho})
        p += 46 + fnl + exl + cml
    return n, out
def extract(url, e):
    h = rng(url, e['off'], e['off'] + 29)
    fnl, exl = struct.unpack('<HH', h[26:30])
    start = e['off'] + 30 + fnl + exl
    data = rng(url, start, start + e['csize'] - 1)
    return zlib.decompress(data, -15) if e['method'] == 8 else data
if __name__ == '__main__':
    url, out = sys.argv[1], sys.argv[2]
    n, ents = listing(url)
    json.dump({'size': n, 'entries': ents}, open(out, 'w'))
    print('zip bytes', n, 'entries', len(ents))
