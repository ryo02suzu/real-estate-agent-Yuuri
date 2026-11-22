#!/bin/bash
# オープニング第3版のコマを集めて、動画（AV1・HEVC・H.264）にする。手伝いの作業場（worker.sh）が描いたコマ
# （作業場それぞれのブランチの frames3b/*.webp）と、GitHub Actions の回が描いたコマ（frames-* の成果物を広げた PNG）を合わせる。
#
#   bash scripts/pc-opening3/assemble.sh <作業の場所> <Actions のコマの場所> <ブランチ> [<ブランチ> ...]
#
# - <作業の場所>/all/0000.png〜0506.png にそろえ、足りないコマがあれば番号を出して止まる
#   （同じコマが両方にあれば、劣化の無い Actions の PNG を使う。PNG はコピーせずリンクにする）
# - そろえたコマに、最後の色の仕上げ（grade3.py）をかけて <作業の場所>/graded/ に置き、それを動画にする
# - 動画は public/opening3/ に（24 コマ/秒・507 コマ）：
#     opening-av1.webm（AV1・2560×1440。大きい画面・細かい画面）・opening-av1-1080.webm（AV1・1920×1080。ふつうの画面）
#     opening-hevc.mp4（HEVC・2560×1440。AV1 を再生できない Apple の機器）・opening.mp4（H.264・1920×1080。ほかの古い機器）
# - ブランチは git fetch して frames3b/ だけを取り出す（作業の場所の外は変えない）
# - ONLY=<av1|av1-1080|hevc|avc> で 1 つだけ作る（試すとき）
set -euo pipefail
WORK="$1"
ACT="$2"
shift 2
ROOT=$(git rev-parse --show-toplevel)
mkdir -p "$WORK/w" "$WORK/all"

for b in "$@"; do
  echo "ブランチ $b"
  git -C "$ROOT" fetch -q origin "$b"
  git -C "$ROOT" archive FETCH_HEAD frames3b | tar -x -C "$WORK/w"
done

python3 - "$WORK" "$ACT" <<'EOF'
import os, sys
from PIL import Image
work, act = sys.argv[1], sys.argv[2]
src = {}
# 先に Actions の PNG（劣化なし）、無いコマだけ作業場の WebP（品質 96）
for d, ext in ((act, ".png"), (os.path.join(work, "w", "frames3b"), ".webp")):
    if not os.path.isdir(d):
        continue
    for f in os.listdir(d):
        if f.endswith(ext) and f[:4].isdigit():
            src.setdefault(int(f[:4]), os.path.abspath(os.path.join(d, f)))
miss = [i for i in range(507) if i not in src]
print(f"コマ {len(src)} / 507（PNG {sum(p.endswith('.png') for p in src.values())}・WebP {sum(p.endswith('.webp') for p in src.values())}）")
if miss:
    print("足りないコマ:", miss)
    sys.exit(1)
size = None
for i in range(507):
    out = os.path.join(work, "all", f"{i:04d}.png")
    im = Image.open(src[i])
    size = size or im.size
    if im.size != size:
        print(f"コマ {i} の大きさが違う：{im.size}（{size}）")
        sys.exit(1)
    if os.path.lexists(out):
        os.remove(out)
    if src[i].endswith(".png") and im.mode == "RGB":
        os.symlink(src[i], out)
    else:
        im.convert("RGB").save(out, compress_level=1)
print("そろった：", size)
EOF

# 最後の色の仕上げ（黒を締める・白い雲の肩を丸める・彩度を少し。最後の白い雲ではかけない。grade3.py）
python3 "$ROOT/scripts/pc-opening3/grade3.py" "$WORK/all" "$WORK/graded"

OUT="$ROOT/public/opening3"
mkdir -p "$OUT"
IN="$WORK/graded/%04d.png"
ONLY="${ONLY:-}"
# AV1：見た目の細かさを優先する設定（tune=0）と量子化の行列。森の細かい動きで 1 秒あたり 9〜12Mbps ほど
AV1P="tune=0:enable-qm=1"
if [ -z "$ONLY" ] || [ "$ONLY" = av1 ]; then
  ffmpeg -y -loglevel error -framerate 24 -i "$IN" -c:v libsvtav1 -preset 5 -crf 32 -svtav1-params "$AV1P" -pix_fmt yuv420p10le -g 48 "$OUT/opening-av1.webm"
fi
if [ -z "$ONLY" ] || [ "$ONLY" = av1-1080 ]; then
  ffmpeg -y -loglevel error -framerate 24 -i "$IN" -vf scale=1920:1080:flags=lanczos -c:v libsvtav1 -preset 5 -crf 32 -svtav1-params "$AV1P" -pix_fmt yuv420p10le -g 48 "$OUT/opening-av1-1080.webm"
fi
# HEVC（AV1 を再生できない Apple の機器。どれも細かい画面なので 2560×1440 だけ）
if [ -z "$ONLY" ] || [ "$ONLY" = hevc ]; then
  ffmpeg -y -loglevel error -framerate 24 -i "$IN" -c:v libx265 -preset slow -crf 27 -pix_fmt yuv420p10le -tag:v hvc1 -g 48 -x265-params log-level=error -movflags +faststart "$OUT/opening-hevc.mp4"
fi
# H.264（ほかの古い機器。1920×1080）
if [ -z "$ONLY" ] || [ "$ONLY" = avc ]; then
  ffmpeg -y -loglevel error -framerate 24 -i "$IN" -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 23 -profile:v high -level 4.1 -pix_fmt yuv420p -g 48 -movflags +faststart "$OUT/opening.mp4"
fi
ls -la "$OUT"
