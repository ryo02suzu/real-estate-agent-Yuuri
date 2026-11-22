#!/bin/bash
# Runpod の機械の中で動く：Blender を入れ、仕事（/root/job/run.sh）を動かし、できたもの（/root/out）を R2 の期限付き URL へ送る。
# 状態は /root/state（running → done <終了コード>）、記録は /root/log.txt（runpod_job.py follow が読む）。
set -uo pipefail
echo running > /root/state
finish() { echo "done $1" > /root/state; exit "$1"; }
export JOB=/root/job OUT=/root/out
mkdir -p "$OUT"
BLENDER_VERSION="${BLENDER_VERSION:-5.3.0}"
echo "== 機械：$(date -u +%FT%TZ)"
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader || echo "nvidia-smi が無い"
echo "== Blender ${BLENDER_VERSION} を入れる"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null && apt-get install -y -qq --no-install-recommends ca-certificates curl xz-utils \
  libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libice6 libgl1 libegl1 libglib2.0-0 libxext6 \
  libwayland-client0 libdbus-1-3 >/dev/null || finish 11
major="${BLENDER_VERSION%.*}"
curl -fsSL --retry 3 "https://download.blender.org/release/Blender${major}/blender-${BLENDER_VERSION}-linux-x64.tar.xz" -o /root/blender.tar.xz || finish 12
mkdir -p /opt/blender && tar -xJf /root/blender.tar.xz -C /opt/blender --strip-components=1 && rm -f /root/blender.tar.xz || finish 13
export BLENDER=/opt/blender/blender
"$BLENDER" --version | head -1
echo "== 仕事を動かす：$(date -u +%FT%TZ)"
start=$(date +%s)
(cd "$JOB" && { [ -f ./_env ] && . ./_env; true; } && bash run.sh)
code=$?
echo "== 仕事が終わった（終了コード ${code}・$(( $(date +%s) - start )) 秒）"
echo "== できたものを送る"
tar -cf /root/out.tar -C "$OUT" . && ls -la /root/out.tar
if [ -s "$JOB/_put_url" ]; then
  curl -fsS --retry 3 -X PUT -T /root/out.tar "$(cat "$JOB/_put_url")" -o /dev/null -w "送った（HTTP %{http_code}）\n" || finish 21
fi
finish "$code"
