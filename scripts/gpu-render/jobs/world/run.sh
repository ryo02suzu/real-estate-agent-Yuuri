#!/bin/bash
# 第4版オープニング「実写の世界」の 1 枚（コマ 600・雲海が開ける場面）を GPU で描く。
# 設定（gpu-render の env で渡す）：SHA=取るコミット（必須）・SHOT=reveal・FRAMES=600（1 枚）・RES=2560x1440・SAMPLES=256・
# それ以外の world.py の設定は EXTRA にカンマ区切りで（EXTRA=clouds=surface,haze=0）。既定は clouds=volume haze=1 glare=1。
# 材料（国土地理院のタイル）は機械の中で取る（1 秒 4 枚まで。reveal は約 2,100 枚で 9 分前後）。
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
EXTRA="${EXTRA:-}"
SHA="${SHA:?SHA（取るコミット）を env で渡してください}"
SHOT="${SHOT:-reveal}"
FRAME="${FRAMES:-600}"
RES="${RES:-2560x1440}"
SAMPLES="${SAMPLES:-256}"
case "$SHOT$FRAME$RES$SAMPLES$SHA" in *[!A-Za-z0-9x._-]*) echo "設定に使えない文字があります"; exit 1;; esac
mkdir -p "$OUT"
apt-get install -y -qq --no-install-recommends python3-numpy python3-pil git ca-certificates >/dev/null
# 公開リポジトリから、決まったコミットの scripts/pc-opening4 だけを取る
CODE=/root/code
rm -rf "$CODE"
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/ryo02suzu/real-estate-agent-Yuuri "$CODE" 2>/dev/null \
  || git clone -q --filter=blob:none --sparse https://github.com/ryo02suzu/real-estate-agent-Yuuri "$CODE"
git -C "$CODE" sparse-checkout set scripts/pc-opening4
git -C "$CODE" fetch -q --depth 1 origin "$SHA" 2>/dev/null || git -C "$CODE" fetch -q origin "$SHA"
git -C "$CODE" checkout -q "$SHA"
P4="$CODE/scripts/pc-opening4"
DATA=/root/data
python3 "$P4/world_fetch.py" "$DATA" --shot "$SHOT" 2>&1 | tail -n 15
# 使う装置と空きの記録
{ echo "GPU: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1)"; echo "commit: $SHA"; } > "$OUT/report.txt"
run() {  # run <out> <res> <samples> <extra...>
  local o="$1" r="$2" s="$3"; shift 3
  "$BLENDER" -b --factory-startup --python "$P4/world.py" -- "data=$DATA" "out=$o" "frame=$FRAME" "res=$r" "samples=$s" \
    device=gpu threads=4 exr=1 clouds=volume haze=1 glare=1 "$@" ${EXTRA//,/ } 2>&1 | grep --line-buffered -vE "^Fra:|DeprecationWarning|use_nodes" || true
}
# 先に小さく確かめる（本番が失敗しても何か残るように）
run "$OUT/small" 960x540 32
run "$OUT/full" "$RES" "$SAMPLES"
n=$(ls "$OUT"/full/frame_*.png 2>/dev/null | wc -l)
{ echo "描いたコマ：$n"
  for d in small full; do f=$(ls "$OUT/$d"/*_stats.json 2>/dev/null | head -1); [ -n "$f" ] && { echo "[$d]"; python3 -c "
import json,sys
s=json.load(open(sys.argv[1]))
print('装置',s.get('device'),'大きさ',s.get('res'),'光の回数',s.get('samples'))
print('組み立て秒',s.get('build_seconds'),'描く秒',s.get('render_seconds'),'最大メモリMB',s.get('peak_mb'))" "$f"; }; done; } >> "$OUT/report.txt"
cat "$OUT/report.txt"
[ "$n" -gt 0 ] || exit 1
