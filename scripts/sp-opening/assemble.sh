#!/bin/bash
# スマホのオープニング「富士の目覚め」のコマ（GitHub Actions の frames-* を広げた PNG。0000.png〜0224.png）を集めて、動画にする。
#
#   bash scripts/sp-opening/assemble.sh <コマの場所>
#
# - 225 コマそろっているか・大きさ（1080×2340）を確かめ、足りなければ番号を出して止まる
# - 雲の中のちらつきを、前後のコマを混ぜてなめらかにし、雲を抜けた直後のもやを数コマかけて晴らす（smooth.py。<コマの場所>-smooth/ に）
# - 動画は public/opening-sp/ に（30 コマ/秒・7.5 秒。どれも音なし）：
#     opening-av1.webm（AV1・10 ビット・1080×2340。Android・新しい iPhone）
#     opening-hevc.mp4（HEVC Main 10・1080×2340。AV1 を再生できない iPhone）
#     opening.mp4（H.264・720×1560。ほかの古い機器）
#   空と雲のなめらかな明るさの移り変わりに段が出ないよう、AV1 と HEVC は 10 ビット。携帯の回線でも待たせない大きさ（数 MB）に
# - ONLY=<av1|hevc|avc> で 1 つだけ作る（試すとき）
set -euo pipefail
SRC="$1"
ROOT=$(git rev-parse --show-toplevel)
python3 - "$SRC" <<'EOF'
import os, sys
from PIL import Image
src = sys.argv[1]
miss = [i for i in range(225) if not os.path.exists(os.path.join(src, f"{i:04d}.png"))]
if miss:
    print("足りないコマ:", miss)
    sys.exit(1)
sizes = {Image.open(os.path.join(src, f"{i:04d}.png")).size for i in range(0, 225, 8)}
if sizes != {(1080, 2340)}:
    print("大きさが違う:", sizes)
    sys.exit(1)
print("そろった：225 コマ・1080×2340")
EOF

SM="${SRC%/}-smooth"
python3 "$ROOT/scripts/sp-opening/smooth.py" "$SRC" "$SM"

OUT="$ROOT/public/opening-sp"
mkdir -p "$OUT"
IN="$SM/%04d.png"
ONLY="${ONLY:-}"
if [ -z "$ONLY" ] || [ "$ONLY" = av1 ]; then
  ffmpeg -y -loglevel error -framerate 30 -i "$IN" -c:v libsvtav1 -preset 4 -crf 30 -svtav1-params "tune=0:enable-qm=1" -pix_fmt yuv420p10le -g 60 "$OUT/opening-av1.webm"
fi
if [ -z "$ONLY" ] || [ "$ONLY" = hevc ]; then
  ffmpeg -y -loglevel error -framerate 30 -i "$IN" -c:v libx265 -preset slow -crf 26 -pix_fmt yuv420p10le -tag:v hvc1 -g 60 -x265-params log-level=error -movflags +faststart "$OUT/opening-hevc.mp4"
fi
if [ -z "$ONLY" ] || [ "$ONLY" = avc ]; then
  ffmpeg -y -loglevel error -framerate 30 -i "$IN" -vf scale=720:1560:flags=lanczos -c:v libx264 -preset slow -crf 22 -profile:v high -level 3.2 -pix_fmt yuv420p -g 60 -movflags +faststart "$OUT/opening.mp4"
fi
ls -la "$OUT"
