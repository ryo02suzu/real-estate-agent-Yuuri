#!/bin/bash
# オープニング第3版のコマを、別のクラウドの作業場（Claude Code のセッション）で描いて、そのセッションのブランチに入れる。
# GitHub Actions は同時に 20 台までなので、それを超えて同時に描くために使う（持ち主の許可：2026-11-21「たくさんのコンピュータを
# 同時に使うことも作ることも全部許可」）。
#
#   bash scripts/pc-opening3/worker.sh <コマ（例 0-14）> [解像度 2560x1440] [spp 32]
#
# - 5 コマずつ描き、描けた分をすぐ frames3/<4けたのコマ番号>.webp（品質 96）にしてコミット・push する
#   （作業場が途中で止まっても、描けた分は残る。もう一度動かすと、ある分は飛ばして続きから描く）
# - 地形・土地の種類・素材・飛び方は、このリポジトリの道具で作る（GitHub Actions の prep と同じ。同じものができる）
# - 最後に「WORKER DONE <コマ>」と出す
set -euo pipefail
FRAMES="$1"
RES="${2:-2560x1440}"
SPP="${3:-32}"
ROOT=$(git rev-parse --show-toplevel)
HERE="$ROOT/scripts/pc-opening3"
OUT="$ROOT/frames3"
BL="${BL:-/tmp/blv/bin/python}"
# コマは、手伝いの作業場それぞれのブランチにだけ入れる（main と、本体の作業ブランチには入れない）
BR=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)
case "$BR" in
  main | master | HEAD | claude/modest-ptolemy-f1dk59)
    if [ -z "${WORKER_NOPUSH:-}" ]; then
      echo "このブランチ（$BR）には入れない。このセッションの作業ブランチに切り替えてから動かす"
      exit 2
    fi
    ;;
esac
mkdir -p "$OUT"
cd "$HERE"

# システムの python3 に、道具（path3.py・post3.py）が使う部品が無い機械がある（無いと 5 コマ描いたあとの仕上げで止まった）
python3 -c "import numpy, scipy, PIL, OpenEXR" 2>/dev/null || pip install -q numpy scipy pillow OpenEXR
if [ ! -x "$BL" ] || ! "$BL" -c "import bpy" 2>/dev/null; then
  echo "Blender（bpy）を入れる"
  python3 -m venv /tmp/blv
  /tmp/blv/bin/pip install -q bpy==5.3.0 numpy scipy pillow OpenEXR
fi
if [ ! -f work/terrain/near_carved.npy ] || [ ! -f work/landcover/plants.npz ]; then
  echo "地形・土地の種類・素材を作る"
  python3 data.py
  python3 landcover.py
  python3 assets.py
fi
# 飛び方は、いつも今のコードで作り直す（数秒。取り込んだ材料の path3.json が古くても、そろう）
python3 path3.py

# 描くコマの一覧（「a-b」「a,b」）
LIST=$(python3 - "$FRAMES" <<'EOF'
import sys
out = []
for part in sys.argv[1].split(","):
    if "-" in part:
        a, b = (int(v) for v in part.split("-"))
        out += list(range(a, b + 1))
    elif part.strip():
        out.append(int(part))
print(" ".join(str(f) for f in sorted(set(out))))
EOF
)
todo=()
for f in $LIST; do
  [ -f "$OUT/$(printf %04d "$f").webp" ] || todo+=("$f")
done
echo "描くコマ：${#todo[@]} 枚（${todo[*]:-なし}）"

push() {
  [ -n "${WORKER_NOPUSH:-}" ] && return 0
  cd "$ROOT"
  git add frames3
  if ! git diff --cached --quiet; then
    git commit -q -m "オープニング第3版のコマ（$1。worker.sh で描いたもの）"
    for i in 1 2 3 4; do git push -q -u origin HEAD && break; sleep $((i * 5)); done
  fi
  cd "$HERE"
}

i=0
while [ $i -lt ${#todo[@]} ]; do
  batch=("${todo[@]:$i:5}")
  spec=$(IFS=,; echo "${batch[*]}")
  # 描いた EXR は消さない（仕上げで止まっても、もう一度動かすと描き直さずに仕上げから続く。scene3.py は EXR のあるコマを飛ばす）
  "$BL" scene3.py -- --frames "$spec" --res "$RES" --spp "$SPP" --out work/exr_w
  python3 post3.py --frames work/exr_w work/png_w
  for f in "${batch[@]}"; do
    n=$(printf %04d "$f")
    p="work/png_w/$n.png"
    python3 -c "import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], quality=96, method=4)" "$p" "$OUT/$n.webp"
  done
  push "$spec"
  echo "描けた：$spec"
  i=$((i + 5))
done
echo "WORKER DONE $FRAMES"
