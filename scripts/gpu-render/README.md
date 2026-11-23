# GPU で描く（Runpod）

オープニングなどの動く映像を、GPU の機械で Blender に描かせる道具（持ち主 2026-11-22：「色んな道具は駆使する前提で Claude が操作する」。
GPU の機械は持ち主が Runpod で借りられるようにした）。CPU だけの機械（GitHub Actions・作業場）では光の計算を 1 コマ 16〜32 回しか
できなかったのを、1,000 回以上にし、立体の雲・4K で描けるようにする。

## 動かし方

GitHub の Actions →「GPU で描く（Runpod）」→ Run workflow（`.github/workflows/gpu-render.yml`）。

| 入力 | 意味 |
|---|---|
| job | 描く仕事（`scripts/gpu-render/jobs/<job>/`。中の `run.sh` が動く） |
| gpu | GPU の種類（カンマ区切り。前から順に、借りられるものを使う） |
| cloud | SECURE（安定）か COMMUNITY（安い） |
| minutes | 仕事を待つ上限（分）。過ぎたら止めて機械を消す |
| env | 仕事に渡す設定（`SAMPLES=1024 RES=1920x1080` のように空白で区切る） |
| lane | 列（1〜4）。違う列の回は同時に動く（動画のコマを何台かに分けて描くとき）。同じ列で続けて頼むと、GitHub は待っている前の回を取り消すので、同時に頼むときは列を分ける |

流れ：前の回の止め忘れ（`michilu-render-` で始まる 3 時間より古い機械）を消す → GPU を借りる → 動き始めるまで待つ →
仕事のファイルと、できたものを送る先（R2 の期限付きの URL）を機械に送る → 機械の中で `pod-wrap.sh` が Blender（既定 5.3.0）を入れて
`run.sh` を動かし、`/root/out` を tar にして送る → 終わるまで記録を出しながら待つ → R2 から受け取り、Actions の成果物にする →
**成功しても失敗しても、取り消しても、機械を消す**。

- 機械の中のコマンドは Runpod の API（`POST /v2/pods/{id}/exec`）で動かす。exec が使えない機械に当たったときは、この回だけの
  使い捨ての SSH の鍵（機械には `PUBLIC_KEY` で渡す。像は Runpod の公式の `runpod/base`）で、GitHub の機械から SSH でつなぐ。
- 鍵：`RUNPOD_API_KEY`（Runpod の Credentials → API Keys で作ったもの）と `R2_*` は GitHub の Secrets。中身はログに出さない。
  機械には R2 の鍵を渡さず、1 つのファイルだけ置ける 6 時間の期限付き URL を渡す。
- お金：Runpod は前払いの残高から、機械が動いている間だけ引かれる（RTX 4090 で 1 時間 SECURE 0.89 ドル・COMMUNITY 0.34 ドル。
  2026-11-23 に Runpod の API の GPU の一覧で見た値段）。
- 速さの目安（2026-11-23 の動作確認）：RTX 4090・OptiX で、1920×1080・光の計算 1,024 回の 1 枚（空と立体の雲）が 7.9 秒。
  機械を借りてから消すまで 2 分半。

## 道具

| ファイル | 役目 |
|---|---|
| `runpod_job.py` | Runpod の API（借りる・待つ・送る・動かす・待つ・消す・古い機械を消す・GPU の値段） |
| `pod-wrap.sh` | 機械の中で動く：Blender を入れ、`run.sh` を動かし、できたものを送る。状態は `/root/state`、記録は `/root/log.txt` |
| `jobs/smoke/` | 動作確認：朝日の空と立体の雲を 1 枚描き、使った装置（OptiX・CUDA）とかかった時間を `report.txt` に書く |

## 仕事の作り方

`jobs/<名前>/run.sh` を置く。環境変数 `BLENDER`（Blender の場所）・`JOB`（このフォルダ）・`OUT`（できたものを置く所）が使える。
大きな素材（地形・航空写真・空の写真など）は、`run.sh` の中で公開の置き場から取る（素材の利用規約は使う前に原本で確かめる）。
