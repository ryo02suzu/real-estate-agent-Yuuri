#!/usr/bin/env python3
"""1 枚の大きな絵を、タイルの仕事に分ける（world.py の border=x0,y0,x1,y1 を足す）。
  python3 farm/tiles.py --name reveal4k --grid 5x4 --overlap 48 --run "world.py -- data=work/world/reveal out={out} frame=600 res=3840x2160 samples=256 clouds=volume"
列 x 行（5x4 = 横 5・縦 4）。jobs の配列を標準出力に出す（依頼ファイルの jobs にそのまま入れられる）。
かさなり（overlap 画素）は上下左右に足す。並びの情報は --layout（既定 farm/layouts/<name>.json）に書く。
border は 0〜1 の割合・y は下から・絵の大きさは変わらない（border の外は描かれない）。標準ライブラリだけ。"""
import argparse
import json
import os
import re
import sys

ap = argparse.ArgumentParser()
ap.add_argument("--name", required=True)
ap.add_argument("--grid", required=True, help="列x行（例 5x4）")
ap.add_argument("--overlap", type=int, default=48)
ap.add_argument("--run", required=True)
ap.add_argument("--timeout", type=int, default=120)
ap.add_argument("--layout", default=None)
ap.add_argument("--res", default=None, help="run に res= が無いとき")
a = ap.parse_args()

m = re.search(r"\bres=(\d+)x(\d+)", a.run) or (re.match(r"(\d+)x(\d+)$", a.res or "") if a.res else None)
if not m:
    sys.exit("run に res=WxH が要ります")
W, H = int(m.group(1)), int(m.group(2))
cols, rows = (int(v) for v in a.grid.lower().split("x"))
tiles = []
for r in range(rows):
    for c in range(cols):
    # 芯（かさならない分担）
        cx0, cx1 = round(c * W / cols), round((c + 1) * W / cols)
        cy0, cy1 = round(r * H / rows), round((r + 1) * H / rows)  # 上から
        x0, x1 = max(0, cx0 - a.overlap), min(W, cx1 + a.overlap)
        y0, y1 = max(0, cy0 - a.overlap), min(H, cy1 + a.overlap)
        name = f"{a.name}-c{c}-r{r}"
        if len(name) > 41:
            sys.exit(f"名前 {name} が長すぎます（41 字まで）。--name を短く")
        fx0, fx1 = x0 / W, x1 / W
        fy0, fy1 = (H - y1) / H, (H - y0) / H   # 下から
        border = f"border={fx0:.6f},{fy0:.6f},{fx1:.6f},{fy1:.6f}"
        tiles.append({"name": name, "x0": x0, "y0": y0, "x1": x1, "y1": y1, "core": [cx0, cy0, cx1, cy1],
                      "job": {"name": name, "run": f"{a.run} {border}", "timeout_min": a.timeout}})
layout_path = a.layout or os.path.join(os.path.dirname(os.path.abspath(__file__)), "layouts", f"{a.name}.json")
os.makedirs(os.path.dirname(layout_path), exist_ok=True)
json.dump({"name": a.name, "width": W, "height": H, "grid": [cols, rows], "overlap": a.overlap,
           "tiles": [{k: v for k, v in t.items() if k != "job"} for t in tiles]}, open(layout_path, "w"), indent=1)
print(json.dumps([t["job"] for t in tiles], ensure_ascii=False, indent=1))
print(f"layout: {layout_path}", file=sys.stderr)
