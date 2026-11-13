# データセット名から、3D Tiles の ZIP の URL を探し、ZIP の目次から建物のタイル集合の場所を返す
import json, sys, urllib.request, os
sys.path.insert(0, os.path.dirname(__file__))
from remotezip import listing
def pkg(name):
    with urllib.request.urlopen(f'https://www.geospatial.jp/ckan/api/3/action/package_show?id={name}', timeout=60) as r:
        return json.load(r)['result']
def tiles_zip(name):
    for s in pkg(name)['resources']:
        u = s.get('url') or ''
        if u.endswith('.zip') and ('3dtiles' in u.lower()):
            return u
    return None
if __name__ == '__main__':
    name = sys.argv[1]
    url = tiles_zip(name)
    print('zip', url)
    if not url: sys.exit()
    cache = f'lists/{name}.json'
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    if not os.path.exists(cache):
        n, ents = listing(url)
        json.dump({'url': url, 'size': n, 'entries': ents}, open(cache, 'w'))
    d = json.load(open(cache))
    sets = sorted({e['name'].split('/')[0] for e in d['entries'] if e['name'].endswith('tileset.json') and 'bldg' in e['name']} | {e['name'].rsplit('/', 1)[0] for e in d['entries'] if e['name'].endswith('tileset.json') and 'bldg' in e['name']})
    for s in sets: print('  ', s)
