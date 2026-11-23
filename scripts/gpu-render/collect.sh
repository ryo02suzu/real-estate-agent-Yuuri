#!/bin/bash
# 何台かの GPU に分けて描いた動画のコマを集め、1 本の確かめ用の動画にする（gpu-render.yml の回を、列（lane）ごとに分けたとき）。
#
#   scripts/gpu-render/collect.sh <出力のフォルダ> <実行の番号>...
#
# 各回のできたもの（R2 の公開の URL：gpu/<実行の番号>/out.tar）を取り、frames/*.png を 1 つのフォルダに集める。
# コマの番号が抜けていたら止める。動画：preview.mp4（H.264・crf 16・30 コマ/秒。確かめ用。アプリに入れる映像は別に作る）。
# R2 の公開の URL は R2_PUBLIC_URL（既定は今の置き場）。
set -euo pipefail
OUT="${1:?出力のフォルダ}"
shift
BASE="${R2_PUBLIC_URL:-https://pub-2be6c197b42d4c0f9c3c7f1915ec5cff.r2.dev/}"
BASE="${BASE%/}"
mkdir -p "$OUT/frames" "$OUT/parts"
for R in "$@"; do
  [[ "$R" =~ ^[0-9]+$ ]] || { echo "実行の番号は数で: $R" >&2; exit 1; }
  if [ ! -f "$OUT/parts/$R.tar" ]; then
    curl -fsS -A "Mozilla/5.0 (compatible; render-collect/1.0)" -o "$OUT/parts/$R.tar" "$BASE/gpu/$R/out.tar"
  fi
  mkdir -p "$OUT/parts/$R"
  tar -xf "$OUT/parts/$R.tar" -C "$OUT/parts/$R"
  n=$(ls "$OUT/parts/$R/frames"/*.png 2>/dev/null | wc -l)
  echo "$R: $n コマ"
  [ "$n" -gt 0 ] && cp "$OUT/parts/$R/frames"/*.png "$OUT/frames/"
  [ -f "$OUT/parts/$R/report.txt" ] && sed 's/^/  /' "$OUT/parts/$R/report.txt"
done
first=$(basename "$(ls "$OUT/frames"/*.png | head -1)" .png)
last=$(basename "$(ls "$OUT/frames"/*.png | tail -1)" .png)
missing=0
for i in $(seq "$((10#$first))" "$((10#$last))"); do
  [ -f "$OUT/frames/$(printf %04d "$i").png" ] || { echo "抜けているコマ: $i" >&2; missing=1; }
done
[ "$missing" = 0 ] || exit 1
echo "コマ $first〜$last（$(ls "$OUT/frames"/*.png | wc -l) 枚）"
ffmpeg -loglevel error -y -framerate 30 -start_number "$((10#$first))" -i "$OUT/frames/%04d.png" \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart "$OUT/preview.mp4"
echo "動画：$OUT/preview.mp4（$(du -h "$OUT/preview.mp4" | cut -f1)）"
