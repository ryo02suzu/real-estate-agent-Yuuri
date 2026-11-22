#!/bin/bash
# 赤富士の試し撮り：材料（国土地理院の標高・航空写真）を取り、Blender で描き、短い動画にもする。
# 設定（gpu-render の env で渡す）：FRAMES=1-90・RES=1920x1080・SAMPLES=512・STRIDE=1・
# それ以外の scene.py の設定は EXTRA にカンマ区切りで（EXTRA=lens=70,exposure=-0.8,sun=9）
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq --no-install-recommends python3-numpy python3-pil ffmpeg >/dev/null
DATA=/root/data
python3 "$JOB/fetch.py" "$DATA"
"$BLENDER" -b --factory-startup --python "$JOB/scene.py" -- "$DATA" "$OUT" \
  "frames=${FRAMES:-1-90}" "res=${RES:-1920x1080}" "samples=${SAMPLES:-512}" "stride=${STRIDE:-1}" ${EXTRA//,/ } 2>&1 | grep -vE "^Fra:|DeprecationWarning|use_nodes" || true
n=$(ls "$OUT/frames"/*.png 2>/dev/null | wc -l)
echo "描いたコマ：$n"
[ "$n" -gt 0 ] || exit 1
if [ "$n" -gt 1 ]; then
  first=$(ls "$OUT/frames"/*.png | head -1 | xargs basename .png)
  ffmpeg -loglevel error -y -framerate 30 -start_number "$((10#$first))" -i "$OUT/frames/%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 16 "$OUT/preview.mp4"
  echo "動画：$(du -h "$OUT/preview.mp4" | cut -f1)"
fi
