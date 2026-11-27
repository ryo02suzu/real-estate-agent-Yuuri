"""第4版オープニングの共通の決まり（時間割・座標・光）。計画は PLAN.md。

この版は 30.0 秒・720 コマ（0〜719）・3840x2160（2026-11-25 改訂の計画どおり）。山の場面はコマ 131（5.458 秒）から。
つなぎ目（もやの白い 8 コマ）は ①12.5〜12.8 秒（コマ 300〜307）と ②19.1〜19.4 秒（コマ 458〜465）。
"""
from __future__ import annotations

import os
from pathlib import Path

FPS = 24
DURATION = 30.0
FRAMES = 720
RES = (3840, 2160)

# 場面の名前, 始まり(秒), 終わり(秒)。計画 2 章の表のまま
BEATS = [
    ("A 日本列島", 0.0, 3.4),
    ("B ズームイン", 3.4, 5.2),
    ("雲を抜ける", 5.0, 5.9),
    ("C1 朝焼けの穂高へ", 5.9, 8.2),
    ("C2 吊尾根すれすれ", 8.2, 11.2),
    ("D1 谷へ飛びこむ", 11.2, 14.0),
    ("D2 梢と川すれすれ", 14.0, 17.4),
    ("D3 上流へ", 17.4, 19.4),
    ("E 尾根を越えて開ける", 19.4, 23.4),
    ("F 白鳥", 23.2, 27.4),
    ("G ロゴ", 24.8, 29.9),
    ("H 白い雲へ", 29.0, 30.0),
]

CUT_T = 5.45          # 宇宙の場面 → 山の場面。山の最初のコマは 131
FIRST_MOUNTAIN_FRAME = 131
# つなぎ目（もやの白い 8 コマ）の真ん中のコマ。コマ 300〜307（12.5〜12.8 秒）と 458〜465（19.1〜19.4 秒）
SEAM_FRAMES = (304, 462)
SEAM_HALF = 4         # 前後 4 コマ（計 8 コマ）はもやの中

SUN_AZ = 115.0        # 北から時計回り（度）
SUN_EL = 5.0
END_COLOR = "#f3f1ec"

ORIGIN_LAT = 36.2490  # 河童橋
ORIGIN_LON = 137.6380
SEED = 20261125

HERE = Path(__file__).resolve().parent
WORK = Path(os.environ.get("PC_OPENING4_WORK", HERE / "work"))
TERRAIN_DIR = HERE.parent / "pc-opening3" / "work" / "terrain"   # 標高データの置き場（読むだけ）
WIDE_DIR = HERE.parent / "pc-opening" / "work"                  # 広い範囲の標高（mid.npy。国土地理院 z11。読むだけ）
