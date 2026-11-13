import json, sys, os, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_tiles import work
plan = json.load(open(sys.argv[1]))
for p in plan:
    if not p['sel']: continue
    d = json.load(open(f"lists/{p['name']}.json"))
    ents = {e['name']: e for e in d['entries']}
    out = f"tiles/{p['set']}"
    os.makedirs(out, exist_ok=True)
    jobs = [(p['url'], ents[p['set'] + '/' + u], out, u.replace('/', '_').replace('.b3dm', '')) for u in p['sel']]
    with cf.ThreadPoolExecutor(10) as ex:
        res = list(ex.map(work, jobs))
    print(p['set'][-50:], 'tiles', len(res), flush=True)
