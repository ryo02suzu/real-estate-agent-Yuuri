#!/usr/bin/env bash
# ホームの帯の街（PLATEAU）を焼き込む。work/ で実行し、最後に public/home/city と public/home/sky に置く。
# 必要：python3（numpy scipy pillow DracoPy）、node（three@0.169.0 playwright）。ダウンロードは約 2GB（地理院タイルは約 120MB）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
mkdir -p "$HERE/work" && cd "$HERE/work"
[ -d node_modules/three ] || npm i --no-save three@0.169.0 playwright
# 1. データセットの目次（ZIP の中身は HTTP の Range で読む。全体は落とさない）
for name in $(python3 -c "import json;print(' '.join(sorted({s['name'] for s in json.load(open('$HERE/sets.json'))})))"); do python3 "$HERE/plateau_pkg.py" "$name"; done
# 2. 視界と距離帯に入るタイルを選んで取り出す（近く 10km は質感付き LOD2、その先は LOD1）
python3 "$HERE/plan_sets.py" "$HERE/sets.json" plan.json
python3 "$HERE/fetch_plan.py" plan.json
# 3. 地面と山（地理院のシームレス空中写真と標高）、上から見た空中写真と道路中心線
python3 "$HERE/ground.py"
python3 "$HERE/manifest.py"
python3 "$HERE/mosaics.py"
# 4. 東京タワーの格子の模型と、形を作り直す高層ビル（麻布台ヒルズ森JPタワー）
python3 "$HERE/tower_profile.py" && python3 "$HERE/tower.py"
python3 "$HERE/landmarks.py"
echo '{"pt": [184, 112, 48, 84], "ss": 24}' > tower-region.json
# 5. ヘッドレスの Chromium で焼き込む（色・向き・距離と建物番号、真上からの高さ）。画面の 4 倍（4716×3300）。
#    街の層は塔を抜いて描き、塔だけを画面の一部（tower-region.json：393×275pt の中の 184,112 から 48×84pt）を 1pt あたり 24 画素で描く
cp "$HERE/bake.html" "$HERE/scene.js" .
python3 -m http.server 4180 --bind 127.0.0.1 >/dev/null 2>&1 & SRV=$!
node "$HERE/session.js" http://127.0.0.1:4180/bake.html & SES=$!
until [ -f res/ready.json ]; do sleep 5; done
mkdir -p bake
python3 "$HERE/cmd.py" alb "window.bake.renderPass('albedo', { w: 4716, h: 3300, hide: [4] })" bake/albedo.bin
python3 "$HERE/cmd.py" nrm "window.bake.renderPass('normal', { w: 4716, h: 3300, hide: [4] })" bake/normal.bin
python3 "$HERE/cmd.py" geo "window.bake.renderPass('geo', { w: 4716, h: 3300, float: true, hide: [4] })" bake/geo.bin
python3 "$HERE/cmd.py" twr "window.bake.renderPass('tower', { w: 4716, h: 3300, hide: [4] })" bake/tower.bin
V="view: [9432, 6600, 4416, 2688, 1152, 2016], w: 1152, h: 2016, only: 4"
python3 "$HERE/cmd.py" twa "window.bake.renderPass('albedo', { $V })" bake/tw_albedo.bin
python3 "$HERE/cmd.py" twn "window.bake.renderPass('normal', { $V })" bake/tw_normal.bin
python3 "$HERE/cmd.py" twe "window.bake.renderPass('tower', { $V })" bake/tw_attr.bin
python3 "$HERE/cmd.py" twg "window.bake.renderPass('geo', { $V, float: true })" bake/tw_geo.bin
python3 "$HERE/cmd.py" dsm "window.bake.topdown({ size: 4096, half: 4500, cx: -3200, cy: -1420, hide: [4] })" bake/dsm.bin
echo '{"id":"q","quit":true}' > cmd/zz_quit.json; kill $SRV || true; wait $SES || true
# 6. 仕上げ（窓と外装・影用の高さ・空の見え方・道路・航空障害灯・塔の層）と配置
python3 "$HERE/post1.py" && python3 "$HERE/post2.py" && python3 "$HERE/post3.py" && python3 "$HERE/post4.py" && python3 "$HERE/post5.py"
mkdir -p "$ROOT/public/home/city/2x" "$ROOT/public/home/city/3x"
cp layers/2x/*.webp "$ROOT/public/home/city/2x/" && cp layers/3x/*.webp "$ROOT/public/home/city/3x/" && cp layers/dsm.webp layers/lights.json "$ROOT/public/home/city/"
echo "layers/tower.json の値（pt, dist, ax, ay）を components/app/sky-canvas.tsx の TOWER に入れる: $(cat layers/tower.json)"
echo "焼き込み完了。代わりの絵（public/home/sky）は、ビルドしたアプリを #t=…&w=clear&l=0 で撮って作る（README）"
