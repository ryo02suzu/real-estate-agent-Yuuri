#!/bin/bash
# オープニング第3版のコマを集めて、動画（AV1・HEVC・H.264）にする。手伝いの作業場（worker.sh）が描いたコマ
# （作業場それぞれのブランチの frames3/*.webp）と、GitHub Actions の回が描いたコマ（frames-* の成果物を広げた PNG）を合わせる。
#
#   bash scripts/pc-opening3/assemble.sh <作業の場所> <Actions のコマの場所> <ブランチ> [<ブランチ> ...]
#
# - <作業の場所>/all/0000.png〜0506.png にそろえ、足りないコマがあれば番号を出して止まる
# - 動画は public/opening3/opening-av1.webm・opening-hevc.mp4・opening.mp4（2560×1440・24 コマ/秒）
# - ブランチは git fetch して frames3/ だけを取り出す（作業の場所の外は変えない）
set -euo pipefail
WORK="$1"
ACT="$2"
shift 2
ROOT=$(git rev-parse --show-toplevel)
mkdir -p "$WORK/w" "$WORK/all"

for b in "$@"; do
  echo "ブランチ $b"
  git -C "$ROOT" fetch -q origin "$b"
  git -C "$ROOT" archive FETCH_HEAD frames3 | tar -x -C "$WORK/w"
done

python3 - "$WORK" "$ACT" <<'EOF'
import os, sys
from PIL import Image
work, act = sys.argv[1], sys.argv[2]
src = {}
for d, ext in ((os.path.join(work, "w", "frames3"), ".webp"), (act, ".png")):
    if not os.path.isdir(d):
        continue
    for f in os.listdir(d):
        if f.endswith(ext) and f[:4].isdigit():
            src.setdefault(int(f[:4]), os.path.join(d, f))
miss = [i for i in range(507) if i not in src]
print(f"コマ {len(src)} / 507")
if miss:
    print("足りないコマ:", miss)
    sys.exit(1)
size = None
for i in range(507):
    out = os.path.join(work, "all", f"{i:04d}.png")
    im = Image.open(src[i]).convert("RGB")
    size = size or im.size
    if im.size != size:
        print(f"コマ {i} の大きさが違う：{im.size}（{size}）")
        sys.exit(1)
    if not os.path.exists(out):
        im.save(out, compress_level=1)
print("そろった：", size)
EOF

OUT="$ROOT/public/opening3"
mkdir -p "$OUT"
IN="$WORK/all/%04d.png"
# AV1（Chrome・Firefox・Edge・新しい Safari）。森の細かい動きでも 1 秒あたり 4〜5Mbps ほど
ffmpeg -y -loglevel error -framerate 24 -i "$IN" -c:v libsvtav1 -preset 5 -crf 30 -pix_fmt yuv420p10le -g 48 "$OUT/opening-av1.webm"
# HEVC（AV1 を再生できない Apple の機器）
ffmpeg -y -loglevel error -framerate 24 -i "$IN" -c:v libx265 -preset slow -crf 24 -pix_fmt yuv420p10le -tag:v hvc1 -g 48 -x265-params log-level=error -movflags +faststart "$OUT/opening-hevc.mp4"
# H.264（ほかの古い機器）
ffmpeg -y -loglevel error -framerate 24 -i "$IN" -c:v libx264 -preset slow -crf 21 -profile:v high -level 5.1 -pix_fmt yuv420p -g 48 -movflags +faststart "$OUT/opening.mp4"
ls -la "$OUT"
