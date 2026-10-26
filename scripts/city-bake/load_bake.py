import numpy as np, json
def load(name, dtype=np.uint8):
    info = json.load(open(f'bake/{name}.bin.json'))
    a = np.frombuffer(open(f'bake/{name}.bin', 'rb').read(), dtype).reshape(info['h'], info['w'], 4)[::-1]
    return a
