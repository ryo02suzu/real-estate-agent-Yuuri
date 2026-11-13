// 毎週の点検の報告（.github/workflows/weekly-audit.yml が使う）。全市区町村の点検（lib/roadmap/audit-live.test.ts）の結果に、
// 先週の結果からの変わり目、データの時点と、データの自動更新（GitHub Actions）の最後の結果を合わせて、Issue の本文（summary.md）と
// 毎週のコメント（comment.md）にする。お客様の住所は扱わない（市区町村の代表点と、公開データの中身だけ）。
//   node scripts/audit/report.mjs <今週の audit.json> [先週の audit.json] <出力のフォルダ>
// GitHub の情報（自動更新の結果・データを最後に入れた日）は gh コマンド（GH_TOKEN）で読む。読めなければその欄は「―」
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [curPath, prevPath, outDir = "."] = process.argv.slice(2);
const cur = JSON.parse(readFileSync(curPath, "utf-8"));
const prev = prevPath && existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf-8")) : null;
const repo = process.env.GITHUB_REPOSITORY;
const runUrl = repo && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : "";

/** gh コマンド（読めなければ undefined） */
function gh(args) {
  if (!repo) return undefined;
  try {
    return execFileSync("gh", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 }).trim();
  } catch {
    return undefined;
  }
}

// ---- データの時点と、自動更新の最後の結果 ----
// [画面の名前, データの見出しのファイル, 自動更新のワークフロー, そのファイルから時点を出す]
const json = (f) => {
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return {};
  }
};
/** ファイル名の作った日（「…-20261018.pmtiles」→「2026-10-18」）。無ければ年 */
const fromUrl = (u) => {
  const name = String(u || "").split("/").pop();
  const d = name.match(/\d{8}/g);
  if (d) return d[d.length - 1].replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  return name.match(/\d{4}/g)?.join("・") ?? "―";
};
const SOURCES = [
  ["用途地域など（都市計画）", "lib/roadmap/data/zoning-source.json", "zoning-tiles.yml", (d) => d.edition ?? fromUrl(d.url)],
  ["地価公示・地価調査", "lib/roadmap/data/land-price-source.json", "land-price.yml", (d) => d.edition ?? fromUrl(d.url)],
  ["学区", "lib/roadmap/data/school-source.json", "school-districts.yml", (d) => d.edition],
  ["駅（駅の出入口）", "lib/roadmap/data/station-source.json", "stations.yml", (d) => `${d.year}年（出入口 ${d.doorsDate ?? "―"}）`],
  ["砂防指定地・急傾斜地など", "lib/roadmap/data/hourei-source.json", "hourei.yml", (d) => `${fromUrl(d.url)} 作成`],
  ["盛土規制法の区域", "lib/roadmap/data/morido-source.json", "morido.yml", (d) => d.asOf ?? fromUrl(d.url)],
  ["自然公園・農振・森林", "lib/roadmap/data/tochi-source.json", "tochi.yml", (d) => `${fromUrl(d.url)} 作成`],
  ["周辺施設（OpenStreetMap）", "lib/roadmap/data/poi-source.json", "poi.yml", (d) => d.date],
  ["市区町村のハザードマップのページ", "lib/roadmap/data/hazard-maps.json", "hazard-maps.yml", (d) => d.updated ?? "―"],
  ["路線価の地図の番号", "lib/roadmap/data/chikamap.json", "chikamap.yml", (d) => `${d.checked ?? "―"} 確認`],
  ["地番（登記所備付地図）", "lib/roadmap/data/parcel-source.json", "parcel-tiles.yml", (d) => d.edition ?? fromUrl(d.url)],
  ["地番（公図から推定）", "lib/roadmap/data/kozu-source.json", "kozu-tiles.yml", (d) => d.edition ?? fromUrl(d.url)],
  ["地番（市町村の地番参考図）", "lib/roadmap/data/sanko-source.json", "sanko-tiles.yml", (d) => `${d.built ?? fromUrl(d.url)} 作成`],
  ["建物（PLATEAU）", "lib/roadmap/data/building-source.json", "building-tiles.yml", (d) => d.edition ?? fromUrl(d.url)],
  ["取引事例（不動産情報ライブラリ）", "lib/roadmap/data/deals-source.json", "deals.yml", (d) => d.periods ?? "―"],
  ["液状化・人口など（不動産情報ライブラリ）", "lib/roadmap/data/reinfolib-source.json", "reinfolib.yml", (d) => fromUrl(`${d.liq?.asOf ?? ""}.json`)],
  ["地図リンク（道路種別の地図など）", null, "link-check.yml", () => "毎週確認"],
];
const JA = { success: "成功", failure: "失敗", cancelled: "取り消し", skipped: "とばした", timed_out: "時間切れ", startup_failure: "起動失敗" };
const freshness = SOURCES.map(([label, file, wf, ver]) => {
  const d = file ? json(file) : {};
  const last = file ? gh(["api", `repos/${repo}/commits?path=${file}&per_page=1`, "--jq", ".[0].commit.committer.date"]) : undefined;
  const run = gh(["run", "list", "--workflow", wf, "--limit", "1", "--json", "conclusion,status,createdAt,url", "--jq", ".[0]"]);
  const r = run ? JSON.parse(run || "{}") : {};
  const result = r.status && r.status !== "completed" ? "実行中" : r.conclusion ? (JA[r.conclusion] ?? r.conclusion) : "―";
  return { label, version: String(ver(d) ?? "―"), last: last ? last.slice(0, 10) : "―", run: r.createdAt ? r.createdAt.slice(0, 10) : "―", result, url: r.url, failed: ["failure", "timed_out", "startup_failure"].includes(r.conclusion) };
});

// ---- 先週から変わった所（代表点で出した中身） ----
const KEYS = ["区域", "用途地域", "防火", "高度地区", "学区", "最寄り駅", "地価", "盛土規制法", "砂防指定地など", "自然公園など", "地番"];
const first = (k, v) => (k === "最寄り駅" || k === "地価" ? String(v ?? "").split("・")[0] : v);
const changes = [];
if (prev) {
  const before = new Map(prev.rows.map((r) => [`${r.pref}${r.name}`, r]));
  for (const r of cur.rows) {
    const p = before.get(`${r.pref}${r.name}`);
    if (!p) continue;
    for (const k of KEYS) {
      const a = first(k, p.facts?.[k]);
      const b = first(k, r.facts?.[k]);
      // 地価の値段・最寄り駅の分数は少し動くことがあるので、駅名・地点番号が変わったときだけ
      const name = (v) => (k === "最寄り駅" ? String(v ?? "").split(" ")[0] : k === "地価" ? String(v ?? "").split(" ")[0] : v);
      if ((a ?? "") !== (b ?? "") && name(a) !== name(b)) changes.push(`- ${r.pref}${r.name}：${k}「${a ?? "―"}」→「${b ?? "―"}」`);
    }
  }
}
const flagged = cur.rows.filter((r) => r.flags.length);
const prevFlags = new Set(prev ? prev.rows.flatMap((r) => r.flags.map((f) => `${r.pref}${r.name}|${f}`)) : []);
const newFlags = flagged.flatMap((r) => r.flags.filter((f) => !prevFlags.has(`${r.pref}${r.name}|${f}`)).map((f) => `${r.pref}${r.name}：${f}`));
const failed = freshness.filter((f) => f.failed);

const cap = (lines, n) => (lines.length > n ? [...lines.slice(0, n), `- ほか ${lines.length - n} 件（実行のページの audit-report を見てください）`] : lines);
const summary = [
  `# 毎週の点検の結果（${cur.asOf}）`,
  "",
  "MICHILU が出す情報（用途地域・学区・最寄り駅・地価・ハザード・盛土規制法・砂防指定地など・自然公園など・地番）を、対応している全市区町村の代表点（役所の座標。無ければ国土地理院の住所検索の市区町村の点。お客様の住所は使わない）で、アプリと同じ読み方で毎週調べ直した結果です。",
  "「見直し候補」は自動で見つけた候補で、間違いと決まったものではありません。",
  runUrl ? `\n市区町村ごとの全部の結果（表と JSON）は [実行のページ](${runUrl}) の audit-report にあります。` : "",
  "",
  `## まとめ`,
  "",
  `- 調べた市区町村：${cur.rows.length}`,
  `- 見直し候補：${flagged.length} 市区町村（先週から新しく ${prev ? newFlags.length : "―"} 件）`,
  `- 先週から変わった所：${prev ? changes.length : "―（先週の結果なし）"} 件`,
  `- 失敗した自動更新：${failed.length} 件${failed.length ? `（${failed.map((f) => f.label).join("・")}）` : ""}`,
  "",
  `## 見直し候補`,
  "",
  ...(flagged.length ? cap(flagged.flatMap((r) => r.flags.map((f) => `- ${r.pref}${r.name}：${f}`)), 120) : ["なし"]),
  "",
  `## 先週から変わった所（代表点の中身）`,
  "",
  ...(prev ? (changes.length ? cap(changes, 120) : ["なし"]) : ["先週の結果が無いので、来週から比べます。"]),
  "",
  `## データの時点と自動更新`,
  "",
  "| データ | アプリのデータの版・時点 | 最後に入れた日 | 自動更新の最後の実行 | 結果 |",
  "|---|---|---|---|---|",
  ...freshness.map((f) => `| ${f.label} | ${f.version} | ${f.last} | ${f.run} | ${f.url ? `[${f.result}](${f.url})` : f.result} |`),
  "",
  "国のデータは年に1回などの更新なので、「最後に入れた日」が古くても、新しいデータが出ていなければ正常です（自動更新が毎週・毎月それを見ています）。",
  "",
].join("\n");
const comment = [
  `### ${cur.asOf} の点検`,
  "",
  `見直し候補 ${flagged.length} 市区町村（新しく ${prev ? newFlags.length : "―"} 件）・先週から変わった所 ${prev ? changes.length : "―"} 件・失敗した自動更新 ${failed.length} 件。`,
  ...(newFlags.length ? ["", "新しい見直し候補：", ...cap(newFlags.map((f) => `- ${f}`), 30)] : []),
  ...(failed.length ? ["", "失敗した自動更新：", ...failed.map((f) => `- ${f.label}${f.url ? `（${f.url}）` : ""}`)] : []),
  "",
  runUrl ? `くわしくは本文と [実行のページ](${runUrl})。` : "",
].join("\n");
// Issue の本文は 65536 字まで
writeFileSync(`${outDir}/summary.md`, summary.length > 60000 ? `${summary.slice(0, 60000)}\n\n（長いので途中まで。続きは実行のページ）\n` : summary);
writeFileSync(`${outDir}/comment.md`, comment.slice(0, 60000));
// 何かあったか（ワークフローがコメントするかを決める）
writeFileSync(`${outDir}/notable.txt`, newFlags.length || failed.length || changes.length ? "yes" : "no");
console.log(comment);
