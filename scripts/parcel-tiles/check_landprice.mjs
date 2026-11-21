// 地番タイルの点検：地価公示・地価調査の全地点（アプリのタイル public/data/land-price-*.pmtiles。所在及び地番が書いてある）で、
// その地点を含む筆の地番（アプリと同じ選び方）が所在の地番と合うかを総当たりで比べる。ずれた地図・古い地図・形の誤りの見落としを探すのに使う。
//
//   node scripts/parcel-tiles/check_landprice.mjs <地番タイル kanto-2026.pmtiles の置き場所> [結果の TSV]
//
// 地番タイルは R2 の公開 URL（lib/roadmap/data/parcel-source.json）から手元に取っておく（約1.2GB。範囲指定で分けて取る）。
// 結果：分類ごとの数（一致／枝番違い・近くに一致／別の地番・一致は遠い／町の名前が違う …）と、地点ごとの TSV。
// 「一致は遠い」「町の名前が違う」「近くに一致なし」の地点は、その地図が測地系の取り違え（約460m）や古い地図でないかを調べる
// （scripts/parcel-tiles/misplaced-sheets.json の決まりの作り方は docs/features.md 99）。
import fs from "node:fs";
import { landPricePoints, openPmtiles, parcelMatcher, tileXY } from "./landprice-match.mjs";

const [parcelFile, outFile = "landprice-check.tsv"] = process.argv.slice(2);
if (!parcelFile) {
  console.error("使い方: node scripts/parcel-tiles/check_landprice.mjs <kanto-2026.pmtiles> [結果の TSV]");
  process.exit(1);
}
const lpFile = fs.readdirSync("public/data").filter((f) => /^land-price-.*\.pmtiles$/.test(f)).sort().pop();
const lp = openPmtiles(`public/data/${lpFile}`);
const pm = openPmtiles(parcelFile);
const Z = 16, LZ = 13;

// 地価公示・地価調査の全地点（z13 のタイルを関東の範囲で読む）
const [x0, y1] = tileXY(LZ, 138.5, 26.6), [x1, y0] = tileXY(LZ, 142.21, 37.1);
const points = landPricePoints(lp, (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
const check = parcelMatcher(pm, "fude", Z);

const out = fs.createWriteStream(outFile);
const count = {};
for (const p of points) {
  const { cat, pick, want, near } = check(p);
  count[cat] = (count[cat] ?? 0) + 1;
  out.write([p.no, p.k, p.a, p.lng.toFixed(7), p.lat.toFixed(7), cat, pick?.kuiki ?? "", pick?.chiban ?? "", want ?? "", near ? near.d.toFixed(1) : "", near?.kuiki ?? ""].join("\t") + "\n");
}
out.end();
console.log(`地点 ${points.length}（${lpFile}）`);
for (const [k, v] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log(`地点ごとの結果: ${outFile}`);
