STATUS: READY

# 農場（op4-farm）：無料の GitHub の機械で、依頼ファイルの仕事を同時に 20 台まで動かす

## 使い方（10 行）

1. 依頼を書く：`scripts/pc-opening4/farm/requests/<名前>.json`（例 `requests/example.json`、煙テスト用 `requests/smoke.json`）。
   `{"data":["world-reveal","trees"],"max_parallel":20,"jobs":[{"name":"reveal-a","run":"world.py -- data=work/world/reveal out={out} frame=600 res=640x360 samples=24 clouds=volume haze=1 threads=4","timeout_min":120}]}`
   `run` は scripts/pc-opening4 で `python <run>` として動く。`{out}` は空の出力フォルダ。名前は `^[a-z0-9][a-z0-9-]{0,40}$`・重ねない・`farmdata-` で始めない。1 依頼 256 件まで。
2. commit して push（農場は push した commit から描く）：`git add <依頼ファイル> <変えたファイル> && git commit && git pull --rebase origin claude/modest-ptolemy-f1dk59 && git push origin HEAD:claude/modest-ptolemy-f1dk59`
3. 動かす（MCP を `ToolSearch` で `select:mcp__github__actions_run_trigger,mcp__github__actions_list,mcp__github__get_job_logs` と読み込む）：
   `mcp__github__actions_run_trigger` method=`run_workflow` owner=`ryo02suzu` repo=`real-estate-agent-Yuuri` workflow_id=`op4-farm.yml` ref=`claude/modest-ptolemy-f1dk59` inputs=`{"request":"scripts/pc-opening4/farm/requests/<名前>.json"}`（`"sha":"<commit>"` を足すとその commit。空なら ref の先頭）。
4. run id を探す：`mcp__github__actions_list` method=`list_workflow_runs` resource_id=`op4-farm.yml` workflow_runs_filter=`{"event":"workflow_dispatch"}` perPage=3（先頭が今の回。`id` が run id。他の人の回も混ざるので `head_sha` と時刻で見分ける）。
5. 待つ：シェルは 1 回 2 分で切れる。`python3 -c "import time; time.sleep(100)"` を繰り返し、そのあいだに `mcp__github__actions_list` method=`list_workflow_jobs` resource_id=`<run id>` で `status`・`conclusion` と各 step を見る（全部の job が completed になるまで）。失敗は `mcp__github__get_job_logs`（job_id か、run_id + failed_only=true、tail_lines=100）。
6. 取る：`python3 scripts/pc-opening4/farm/fetch_results.py <run_id> <request.json> <dest>` → `<dest>/<仕事名>/out/…`・`log.txt`・`time.json`（表に 仕事・秒・終了コード・ファイル が出る。無い tar は MISSING と出る）。
   直接の URL：`https://pub-2be6c197b42d4c0f9c3c7f1915ec5cff.r2.dev/farm/<run_id>/<仕事名>.tar`（`out/`・`log.txt`・`time.json` が入った tar）。GitHub の artifact（名前は仕事名・7 日）も同じ tar。
7. 大きな絵を分ける：`python3 scripts/pc-opening4/farm/tiles.py --name reveal4k --grid 5x4 --overlap 48 --run "world.py -- data=work/world/reveal out={out} frame=600 res=3840x2160 samples=256 clouds=volume"` → jobs を標準出力に出し（依頼の jobs に貼る）、並びを `farm/layouts/<name>.json` に書く（`border=` を足す。割合・下から・絵の大きさは変わらない）。
8. 貼る：`python3 scripts/pc-opening4/farm/stitch.py <dest> scripts/pc-opening4/farm/layouts/<name>.json --out full.png`（`<dest>/<タイル名>/out/frame_*.png` を使い、重なりを直線の重みで混ぜる。EXR のタイルがあれば `full.exr` も。`--pattern` で名前を変える）。
9. 出力の形：job が終わると終了コードを見て、0 以外なら GitHub 上の job は赤になるが、`out/` は必ず上がる（時間切れ・失敗でも）。`log.txt` は最後の 2000 行（1 行 400 字まで）。
10. 手元と同じ命令：データは `scripts/pc-opening4/work/` の同じ場所に広げるので、`run` はそのまま手元でも通る（`python world.py -- data=work/world/reveal ...`）。

## データセット（`farm/datasets.json` の表。足すときは数行足すだけ）

| 名前 | 中身（作る命令） | 置き場（scripts/pc-opening4 から） | 作る時間（実測） | 作り直す条件 |
|---|---|---|---|---|
| `world-<ショット>`（reveal・c2・all。world_fetch.py の `SHOTS` の名前なら何でも） | `python world_fetch.py work/world/<ショット> --shot <ショット> --cache work/world/tiles` | `work/world/<ショット>` | reveal：約 9 分（約 2,100 枚・4 枚/秒）。タイルは `work/world/tiles` を別の cache にして次のショットが使い回す | world_fetch.py・cameras.json・config.py・geo4.py の中身が変わったとき |
| `globe` | `python globe_fetch.py --data work/globe` のあとに `--detail`（z12・z14） | `work/globe` | 約 20 + 20 分（notes/globe.md の実測。農場では未実測） | globe_fetch.py・config.py |
| `trees` | `python -m trees.library` | `work/trees/library.blend` | 約 5 分（notes/trees.md。農場では未実測） | trees/ の .py・atlas・lodcal.json・config.py |

- 知らない名前は plan で「知らないデータセット名 …（あるのは …）」と赤くなって止まる。
- 仕組み：data の job（serial＝タイルを共有するものは 1 つずつ順に、parallel＝同時）が cache（キーは `op4-data-<名前>-<中身の hash>`）を探し、あれば作らず、なければ作って cache に置く。どちらでも、この回の中では artifact `farmdata-<名前>`（1 日）にして render の各 job に渡す。タイルの cache は `op4-tiles-world-<run_id>-<名前>`（restore-keys は `op4-tiles-world-`）。
- 同じ取得先を 2 つの回で同時に取りに行かないこと（別の人が同じショットを作っている最中は待つ。cache ができれば以後は取りに行かない）。

## 限り

- 同時に動く job は 20 台まで（GitHub の無料枠。ここで動く全員で共有。plan の `max_parallel` は 20 で切る）。1 台は約 4 コア・15.6 GB。
- 1 job 6 時間まで（`timeout_min` は 1〜330。既定 120。`timeout --signal=INT` で止めてから、あるぶんを上げる）。1 依頼 256 job まで。
- artifact は 7 日で消える。R2 の tar は 300 MB 以下だけ置く（超えたら step summary に書き、artifact だけ）。
- R2 の URL は公開。非公開のデータ・鍵・顧客の情報は絶対に置かない（`out` に何を書くかに注意）。
- cache は全体で 10 GB・7 日使わないと消える。タイルの cache は回ごとに新しい名前で置くので古いものから消える。
- 費用は 0 円（公開リポジトリの標準の機械）。GPU（Runpod）は使わない。

## 測った値（煙テスト 2026-11-27 JST 7:04〜7:19）

煙テスト＝`requests/smoke.json`：`world-reveal` と 3 job（全面 320x180・サンプル 8・clouds=surface、と、640x360 を 2 タイルにしたもの 2 つ。かさなり 32 画素）。

| 回 | run id | 全体 | 中身 |
|---|---|---|---|
| 1 回目（cache なし） | 46074381984 | 11 分 05 秒 | plan 17 秒 → data（world-reveal を取って作る）9 分 15 秒 → render 3 台 約 70〜80 秒 |
| 2 回目（cache あり） | 46075631789 | 約 2 分 | plan 21 秒 → data **12 秒**（cache を出して artifact にするだけ。取りには行かない）→ render 3 台 約 65〜80 秒 |

- 待ち行列：依頼して job が動き出すまで 2〜4 秒（空いているとき）。
- render 1 台の準備（描く前）：checkout 10〜16 秒（リポジトリが大きい）+ apt 6〜17 秒 + `pip install bpy==5.3.0 …` 20〜25 秒 + データの artifact 受け取り 5〜8 秒（world-reveal は約 430 MB） + 広げる 1 秒未満 = **約 45〜65 秒**。終わりの上げ（R2・artifact）約 5〜10 秒。
- 描いた時間（time.json）：全面 320x180 サンプル 8 が 8.7 秒、タイル 640x360 サンプル 8 が 13.0 秒と 9.7 秒。world.py は組み立て 約 5 秒・メモリ 1.3 GB。
- runner：nproc = 4、メモリ 15.6 GB。
- 貼った絵：`review/farm/smoke-stitched-640x360.jpg`（2 タイル、継ぎ目は見えない）・`review/farm/smoke-full-320x180.jpg`。
- 数字の見方：1 台の準備が約 1 分なので、描きが 1〜2 分より短い仕事を 1 件ずつ出すのは損。短い仕事は 1 job にまとめ、`run` を 1 つの python スクリプトの中で回す。

## つまずいたとき

- plan が赤い：step の `::error::` の行を読む（名前・run の書き方・スクリプトの場所・データセット名）。依頼ファイルは **push した commit に入っている**必要がある（`sha` を指定したときは、その commit に）。
- dispatch が 404：このワークフローは main に無いので、必ず `ref=claude/modest-ptolemy-f1dk59` を付ける。`.github/workflows/op4-farm.yml` を変えて push したあとは、push で登録し直される。
- MISSING が出る：まだ終わっていない、job が plan・data の失敗で動かなかった、または tar が 300 MB を超えた（その場合は run の artifact から。`mcp__github__actions_list` method=`list_workflow_run_artifacts`）。
- job が赤で out がある：`log.txt` を見る（`time.json` の exit_code が 0 以外 = 描く命令の失敗。124 = 時間切れ）。
- 描くのが遅い／メモリが足りない：1 台は 4 コア・15.6 GB。タイルを細かく（tiles.py の --grid）。`threads=4` を指定する。
- データを作り直したい：中身（keyfiles）を変えると自動で作り直す。強制したいときは、その keyfiles のどれかを変える（または Actions の画面で cache を消す）。
- 2 つの回が同時にタイルを取る：避ける。順にやる。
