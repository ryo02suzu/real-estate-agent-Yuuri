// 公図から推定した筆（推定の筆のタイル。レイヤ kozu）の確かさを、国の地価公示・地価調査の地点で測る。
// 地点（アプリのタイル public/data/land-price-*.pmtiles の lp。所在及び地番が書いてある）のうち、選んだ都府県・市区町村の地点を全部読み、
// 地点を含む推定の筆の地番（アプリと同じ選び方）が所在の地番と合うかを、確度の高い推定（q=1）と低い推定（q=2）に分けて数える
// （scripts/parcel-tiles/check_landprice.mjs と同じ数え方。docs/features.md の 120・182）。
//
//   node scripts/kozu-tiles/check_accuracy.mjs <推定の筆のタイル .pmtiles> --codes 11,12,13,14 --name kanto --json kanto.json
//   node scripts/kozu-tiles/check_accuracy.mjs <推定の筆のタイル .pmtiles> --set kinki --json kinki.json --tsv kinki.tsv
//
//   --codes  数える地点の都府県コード（2桁）か市区町村コード（5桁。政令市は区のコード）。カンマ区切り
//   --set    公開しているまとまりの名前。市区町村は lib/roadmap/data/kozu-source.json の sets のもの（--codes の代わり）
//   --source --set で読むまとまりの一覧（既定 lib/roadmap/data/kozu-source.json）
//   --name   まとまりの名前（結果に書く。--set のときはその名前）
//   --layer  タイルのレイヤ名（既定 kozu）
//   --landprice  地価の地点のタイル（既定 public/data/ の一番新しい land-price-*.pmtiles）
//   --json   結果のまとめ（まとまりの全体と都府県ごと）を書くファイル。scripts/kozu-tiles/sets.py --record でまとまりに入れる
//   --tsv    推定の筆の中にあった地点ごとの結果
//
// 推定の筆のタイルは R2 の公開 URL（kozu-source.json の url。公開していないまとまりは kozu/<name>-<日時>.pmtiles）から
// 手元に取っておく（範囲指定で読めるので、全部を取ってもよい）。地点の市区町村は、所在の都道府県と市区町村の名前を
// 国土地理院の市区町村の表（lib/roadmap/data/gsi-muni-codes.json）に当てて決める（当たらない地点は数えずに数だけ出す）。
//
// 分け方（地点を含む推定の筆が無い地点は数えない）：
//   一致（exact）     筆の地番区域・地番が所在と同じ
//   30m 以内（within30） 一致に加え、選んだ筆は違うが 30m 以内に同じ地番の筆がある（地点で重なる別の筆が同じ地番のときも）
//   別の場所（elsewhere） 同じ地番の筆が 30m より遠い・近く（まわりのタイル）に無い・別の町の筆（地番が同じでも）
//   比べられない（other） 所在に地番が無い・地点を含む筆に地番が無い（道など）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { landPricePoints, openPmtiles, parcelMatcher } from "../parcel-tiles/landprice-match.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** 分類（landprice-match.mjs の parcelMatcher）→ 分け方 */
const BUCKET = {
  一致: "exact",
  "重なる別の筆が一致（選ばれない）": "near",
  "枝番違い・近くに一致": "near",
  "別の地番・近くに一致": "near",
  "町の名前が違う・近くに一致あり": "near",
  町の名前が違う: "elsewhere",
  // 地番は同じでも別の町の筆（横浜市中区「住吉町1丁目2番」の地点が「太田町 2」の筆の中、など）
  "地番一致・町の名前が違う": "elsewhere",
  "枝番違い・一致は遠い": "elsewhere",
  "枝番違い・近くに一致なし": "elsewhere",
  "別の地番・一致は遠い": "elsewhere",
  "別の地番・近くに一致なし": "elsewhere",
  所在に地番なし: "other",
  "地番の無い筆（道など）": "other",
};
const LABEL = { exact: "一致", near: "30m 以内", elsewhere: "別の場所", other: "比べられない" };

function parseArgs(argv) {
  const a = { layer: "kozu", source: path.join(ROOT, "lib/roadmap/data/kozu-source.json") };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(codes|set|name|layer|landprice|json|tsv|source)$/);
    if (m) a[m[1]] = argv[++i];
    else rest.push(argv[i]);
  }
  a.file = rest[0];
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args.file || (!args.codes && !args.set)) {
  console.error("使い方: node scripts/kozu-tiles/check_accuracy.mjs <推定の筆のタイル .pmtiles> (--codes 11,12,13,14 | --set kanto) [--name kanto] [--layer kozu] [--landprice …] [--json 結果.json] [--tsv 地点ごと.tsv]");
  process.exit(1);
}
let codes;
let name = args.name ?? "";
if (args.set) {
  const set = JSON.parse(fs.readFileSync(args.source, "utf-8")).sets?.[args.set];
  if (!set) {
    console.error(`まとまり ${args.set} が ${args.source} にありません（公開していないまとまりは --codes で都府県を指定する）`);
    process.exit(1);
  }
  codes = set.codes;
  name ||= args.set;
} else codes = args.codes.split(",").map((c) => c.trim()).filter(Boolean);
if (!codes.length || codes.some((c) => !/^\d{2}(?:\d{3})?$/.test(c))) {
  console.error(`都府県コード（2桁）か市区町村コード（5桁）を指定してください: ${codes.join(",")}`);
  process.exit(1);
}
const wanted = (code) => codes.includes(code) || codes.includes(code.slice(0, 2));

// 所在（「大阪府 堺市堺区…」「三重県 三重郡川越町大字…」）→ 市区町村コード。名前の長い順に当てる（「大和郡山市」を「郡山市」より先に）
// 所在と表で字の違う名前（「鎌ヶ谷」「鎌ケ谷」・高知県の「檮原町」「梼原町」）はそろえる
const norm = (s) => s.normalize("NFKC").replace(/\s/g, "").replace(/ヶ/g, "ケ").replace(/檮/g, "梼");
const GSI = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/roadmap/data/gsi-muni-codes.json"), "utf-8"));
const PREF_CODE = {};
const NAMES = {};
for (const [pref, list] of Object.entries(GSI)) {
  PREF_CODE[pref] = Object.keys(list)[0].slice(0, 2);
  NAMES[pref] = Object.entries(list)
    .map(([code, n]) => [norm(n), code])
    .sort((a, b) => b[0].length - a[0].length);
}
const PREF_RE = new RegExp(`^(${Object.keys(GSI).join("|")})\\s*(.*)$`);
function muniOf(addr) {
  const m = addr.normalize("NFKC").match(PREF_RE);
  if (!m) return null;
  const names = NAMES[m[1]];
  const rest = norm(m[2]);
  // 町村は郡の名前から書かれている（「三重郡川越町」）。表の名前は郡を付けない
  for (const s of [rest, rest.replace(/^.+?郡/, "")]) {
    const hit = names.find(([n]) => s.startsWith(n));
    if (hit) return hit[1];
  }
  return null;
}

const lpFile = args.landprice ?? path.join(ROOT, "public/data", fs.readdirSync(path.join(ROOT, "public/data")).filter((f) => /^land-price-.*\.pmtiles$/.test(f)).sort().pop());
const lp = openPmtiles(lpFile);
const check = parcelMatcher(openPmtiles(args.file), args.layer);

const empty = () => ({ points: 0, exact: 0, within30: 0, elsewhere: 0, other: 0, categories: {} });
const prefs = {};
const total = { points: 0, unmatched: 0, inside: 0, high: empty(), low: empty() };
const rows = [];
const unmatched = [];
for (const p of landPricePoints(lp)) {
  const code = muniOf(p.a);
  if (!code) {
    // 所在の都道府県が数える都府県なら、当たらなかった数を出す（表に無い名前。市区町村の合併・名前の変更など）
    const pref = PREF_CODE[p.a.normalize("NFKC").match(PREF_RE)?.[1] ?? ""];
    if (pref && codes.some((c) => c.slice(0, 2) === pref)) {
      total.unmatched++;
      unmatched.push(p.a);
    }
    continue;
  }
  if (!wanted(code)) continue;
  const pc = code.slice(0, 2);
  const pref = (prefs[pc] ??= { name: Object.keys(PREF_CODE).find((k) => PREF_CODE[k] === pc), points: 0, inside: 0, high: empty(), low: empty() });
  total.points++;
  pref.points++;
  const r = check(p);
  if (r.none || !r.hits.length) continue;
  total.inside++;
  pref.inside++;
  const level = r.pick?.q === 1 ? "high" : "low";
  const bucket = BUCKET[r.cat];
  if (!bucket) throw new Error(`分け方の無い分類: ${r.cat}`);
  for (const s of [total[level], pref[level]]) {
    s.points++;
    s.categories[r.cat] = (s.categories[r.cat] ?? 0) + 1;
    if (bucket === "exact") s.exact++;
    if (bucket === "exact" || bucket === "near") s.within30++;
    if (bucket === "elsewhere") s.elsewhere++;
    if (bucket === "other") s.other++;
  }
  rows.push([p.no, p.k, p.a, p.lng.toFixed(7), p.lat.toFixed(7), code, r.pick?.q ?? "", r.cat, LABEL[bucket], r.pick?.kuiki ?? "", r.pick?.chiban ?? "", r.want ?? "", r.near ? r.near.d.toFixed(1) : "", r.near?.kuiki ?? ""]);
}

const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
const levels = (o) => Object.fromEntries(["high", "low"].filter((k) => o[k].points).map((k) => [k, o[k]]));
const report = {
  name,
  file: path.basename(args.file),
  layer: args.layer,
  landprice: path.basename(lpFile),
  codes,
  date,
  method: `地価公示・地価調査の地点（${path.basename(lpFile)}）のうち推定の筆の中にある地点で、筆の地番を所在の地番と比べた（scripts/kozu-tiles/check_accuracy.mjs）`,
  points: total.points,
  unmatched: total.unmatched,
  inside: total.inside,
  ...levels(total),
  prefs: Object.fromEntries(Object.entries(prefs).sort().map(([k, v]) => [k, { name: v.name, points: v.points, inside: v.inside, ...levels(v) }])),
};
if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 1) + "\n");
if (args.tsv)
  fs.writeFileSync(args.tsv, [["番号", "種類", "所在", "経度", "緯度", "市区町村", "q", "分類", "分け方", "筆の地番区域", "筆の地番", "所在の地番", "同じ地番の筆まで(m)", "その地番区域"], ...rows].map((r) => r.join("\t")).join("\n") + "\n");

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");
const line = (label, s) =>
  s.points ? `  ${label}: ${s.points}地点  一致 ${s.exact}（${pct(s.exact, s.points)}）・30m 以内 ${s.within30}（${pct(s.within30, s.points)}）・別の場所 ${s.elsewhere}（${pct(s.elsewhere, s.points)}）・比べられない ${s.other}` : `  ${label}: 0地点`;
console.log(`${name || path.basename(args.file)}：地価の地点 ${total.points}（${path.basename(lpFile)}・市区町村が分からない地点 ${total.unmatched}）のうち、推定の筆の中 ${total.inside}`);
console.log(line("確度の高い推定（q=1）", total.high));
console.log(line("確度の低い推定（q=2）", total.low));
for (const [k, v] of Object.entries(prefs).sort()) {
  console.log(` ${k} ${v.name}：地点 ${v.points}・推定の筆の中 ${v.inside}`);
  console.log(line("q=1", v.high));
  console.log(line("q=2", v.low));
}
if (unmatched.length) console.log(`  市区町村が分からない地点の例: ${unmatched.slice(0, 5).join("／")}`);
for (const level of ["high", "low"])
  if (total[level].points) console.log(`  ${level} の分類: ${Object.entries(total[level].categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("・")}`);
