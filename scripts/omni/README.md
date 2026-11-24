# 動画を作る AI でオープニングを作る（Gemini Omni Flash）

持ち主の依頼（2026-11-24）：PC のオープニングを「映画で使えるクオリティ」で。構成は持ち主の言葉どおり：
「日本列島が出現し、ズームしていって鷹のような視点で大自然を駆け抜けて、その奥にミチルのロゴを上品に演出させてホーム画面に繋げる」
（2026-11-20）。今までの作り方（国の標高と航空写真を Blender で描く。`scripts/pc-opening`・`scripts/pc-opening3`・`scripts/gpu-render`）は、
森の木が同じ形のくり返しになるなど、作り物っぽさの根本が直せなかったので、本物らしさは動画を作る AI に任せる。日本の形が要る
場面は、国の地形データから描いた絵を「最初と最後の 1 枚」として渡し、AI にはそのあいだを作らせる（形がずれない）。

## 動かし方

GitHub の Actions の「動画を作る AI（Gemini Omni）」（`.github/workflows/omni-video.yml`）を、仕事の名前（`jobs/<名前>.json`）と
この回の上限（ドル）で動かす。できた動画は R2 の公開の置き場 `omni/<実行の番号>/<場面>.mp4`（音は外してある）。

```bash
python3 scripts/omni/omni.py plan scripts/omni/jobs/test1.json   # 場面と、かかる額の見込み（AI は呼ばない）
```

| ファイル | 中身 |
|---|---|
| `omni.py` | AI を呼ぶ道具（Python の標準のものだけ）。上限を超える見込みなら作らない。場面ごとに並べて作り、続き（after・extend）は前の場面を待つ |
| `jobs/*.json` | 仕事（場面の文・長さ・大きさ・最初と最後の絵）。書き方は `omni.py` の説明 |
| `frames/` | AI に渡す絵。`s1-first-sea.jpg`・`s1-last-japan.jpg` は第2版のオープニングの列島の場面の 72 コマ目（同じ視点で、陸を消した海だけの絵と、陸のある絵。`scripts/pc-opening/film.py global --frames 72 --hide land,alps` と `atmos.py global`） |

## 確かめたこと（公式の説明。2026-11-24）

- モデルは `gemini-omni-1.2-flash`（Veo 3.1 は 2026-10-22 に提供が終わった）。Interactions API（`POST /v1beta/interactions`）。
- 長さ 3〜15 秒（最初と最後の 2 枚のあいだ・続きは 3〜10 秒。続けて全部で 30 秒まで）。大きさ 360p・720p・1080p・4k
  （1080p と 4k は引き伸ばし）。16:9 か 9:16。音は消せない（`omni.py` が外す）。見えない透かし（SynthID）が入る。
- 値段（有料のみ。無料の枠は無い）：1 秒 360p 0.023・720p 約 0.07・1080p 0.104・4k 0.209 ドル（https://aistudio.google.com/docs/pricing）。
- 利用規約（https://aistudio.google.com/docs/terms）：Google は作った映像の持ち主にならない。仕事（professional or business purposes）
  のための API で、18 歳以上。日本は使える国の一覧にある。作った映像の使い方の責任は使う側にある。
- 出典：AI に渡した絵（国の地形データから描いたもの）が映像に残るので、アプリに入れるときは今までどおり地理院タイルを加工したことを
  書き、AI で作ったことも書く。
