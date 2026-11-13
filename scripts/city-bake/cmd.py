# 作業場に命令を送り、終わるまで待つ：python cmd.py <id> "<js>" [保存先]
import json, sys, time, os
cid, js = sys.argv[1], sys.argv[2]
save = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs('cmd', exist_ok=True)
if os.path.exists(f'res/{cid}.json'): os.remove(f'res/{cid}.json')
json.dump({'id': cid, 'js': js, 'save': save}, open(f'cmd/{int(time.time()*1000)}_{cid}.json', 'w'))
t0 = time.time()
while not os.path.exists(f'res/{cid}.json'):
    time.sleep(2)
    if time.time() - t0 > float(os.environ.get('CMD_TIMEOUT', 3000)): print('timeout'); sys.exit(1)
print(open(f'res/{cid}.json').read()[:600], 'wait', round(time.time() - t0, 1))
