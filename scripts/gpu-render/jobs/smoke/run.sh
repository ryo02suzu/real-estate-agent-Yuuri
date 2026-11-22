#!/bin/bash
# 動作確認：GPU（OptiX、無ければ CUDA）で、朝日の空と立体の雲を 1 枚描き、かかった時間を測る
set -euo pipefail
"$BLENDER" -b --factory-startup --python "$JOB/smoke.py" -- "$OUT" "${SAMPLES:-1024}" "${RES:-1920x1080}"
