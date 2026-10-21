# sanko-src-import（一時的）

埼玉県・千葉県のオープンデータサイトは GitHub Actions から読めない（403）ので、手元で `scripts/sanko/build.py --fetch-only` で取った
12市町の地番参考図の zip と import.json を置く。`.github/workflows/sanko-tiles.yml` の import_ref でこのブランチを読み、R2 の写し
（sanko/src/）に足したら、このブランチは消す。
