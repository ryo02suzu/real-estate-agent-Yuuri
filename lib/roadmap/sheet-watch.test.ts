// 図の差し替えの自動追従。PDF の図を並べた市の一覧ページを見て、図のファイル名が変わっていたら
// データの URL を新しいファイルに書き換える（lib/roadmap/data の中を置き換える）。
// ネットにつなぐので通常のテストでは動かさない。SHEET_WATCH=1 で実行し、GitHub Actions で毎週まわす
// （.github/workflows/sheet-watch.yml）。一覧ページに並んでいたリンクは data/sheet-pages.json に記録し、
// 次回は「前回と同じ文字のリンクがどのファイルに変わったか」で差し替えを見つける。
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import SNAPSHOT from "./data/sheet-pages.json";
import { MUNICIPALITIES } from "./index";
import { extractFileLinks, findReplacements, type Replacement, type SheetUrl } from "./page-links";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DATA_DIR = join(process.cwd(), "lib/roadmap/data");

async function fetchPage(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    return { html: await res.text(), url: res.url };
  } catch {
    return null;
  }
}

/** 差し替え先が本当に図のファイルとして開けるか（エラーページの HTML ではないか） */
async function opensAsFile(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Range: "bytes=0-1023" }, signal: AbortSignal.timeout(30_000) });
    await res.body?.cancel();
    return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

/** data の下の .ts / .json をすべて */
function dataFiles(dir = DATA_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? dataFiles(join(dir, e.name)) : /\.(ts|json)$/.test(e.name) && e.name !== "sheet-pages.json" ? [join(dir, e.name)] : [],
  );
}

type Found = Replacement & { city: string; page: string };

describe.skipIf(!process.env.SHEET_WATCH)("図の差し替えの自動追従", () => {
  it("一覧ページの図のリンクを見て、変わったファイルを追う", { timeout: 20 * 60_000 }, async () => {
    const snapshot = structuredClone(SNAPSHOT) as Record<string, Record<string, string>>;
    // 一覧ページごとに、そのページに並ぶ図（同じページを複数の市が使うことは無いが、まとめて扱う）
    const pages = new Map<string, { city: string; sheets: SheetUrl[] }[]>();
    for (const m of MUNICIPALITIES)
      for (const map of m.maps) {
        if (!map.sheets || !map.url) continue;
        const sheets = map.sheets.cells.map(([label, url]) => ({ label, url: url.split("#")[0] }));
        pages.set(map.url, [...(pages.get(map.url) ?? []), { city: `${m.pref}${m.name}`, sheets }]);
      }

    const replaced: Found[] = [];
    const unresolved: { city: string; page: string; labels: string[] }[] = [];
    const unreachable: { city: string; page: string }[] = [];
    let snapshotChanged = false;

    for (const [page, entries] of pages) {
      const city = entries.map((e) => e.city).join("・");
      const got = await fetchPage(page);
      if (!got) {
        unreachable.push({ city, page });
        continue;
      }
      const links = extractFileLinks(got.html, got.url);
      const ours = entries.flatMap((e) => e.sheets);
      const ourUrls = new Set(ours.map((o) => o.url));
      const before = snapshot[page] ?? {};
      // 一覧ページから図へ直接リンクしていない市（索引図や地区ごとのページから選ぶ市）は比べない。
      // 前回の記録に自分の図が載っていたページは、今回すべて差し替わっていても比べる
      const listedNow = [...ourUrls].filter((u) => links.some((l) => l.href === u)).length;
      const listedBefore = [...ourUrls].filter((u) => u in before).length;
      if (listedNow < ourUrls.size / 2 && listedBefore < ourUrls.size / 2) continue;

      const r = findReplacements(ours, links, before);
      for (const x of r.replaced) {
        if (await opensAsFile(x.to)) replaced.push({ ...x, city, page });
        else unresolved.push({ city, page, labels: [x.label] });
      }
      if (r.unresolved.length) unresolved.push({ city, page, labels: [...new Set(r.unresolved.map((u) => u.label))] });

      // 記録は、並ぶファイルが変わったときだけ書き直す（ファイルの大きさの表示が変わっただけでは書かない）
      const now = Object.fromEntries(links.map((l) => [l.href, l.text]));
      const same = Object.keys(now).length === Object.keys(before).length && Object.keys(now).every((h) => h in before);
      if (!same) {
        snapshot[page] = now;
        snapshotChanged = true;
      }
    }

    // データの URL を書き換える（JSON の分割図も TS のデータも、同じ URL の文字列をそのまま置き換える）
    if (replaced.length)
      for (const file of dataFiles()) {
        const text = readFileSync(file, "utf8");
        let next = text;
        for (const x of replaced) next = next.split(x.from).join(x.to);
        if (next !== text) writeFileSync(file, next);
      }
    if (snapshotChanged) {
      const sorted = Object.fromEntries(Object.keys(snapshot).sort().map((k) => [k, snapshot[k]]));
      writeFileSync(join(DATA_DIR, "sheet-pages.json"), JSON.stringify(sorted, null, 1) + "\n");
    }

    const report = [
      `# 図の差し替えの確認（${new Date().toISOString().slice(0, 10)}）`,
      "",
      `一覧ページ ${pages.size} 件 / 差し替えを追った図 ${replaced.length} 件 / 追えなかった図 ${unresolved.length} 件 / つながらないページ ${unreachable.length} 件`,
      ...(replaced.length
        ? ["", "## 差し替えを追った図（データの URL を書き換え済み）", "", "| 市区町村 | 図 | 前 | 後 |", "|---|---|---|---|", ...replaced.map((x) => `| ${x.city} | ${x.label} | ${x.from} | ${x.to} |`)]
        : []),
      ...(unresolved.length
        ? [
            "",
            "## 追えなかった図（一覧ページから消えたが、差し替え先が1つに決まらない）",
            "",
            "lib/roadmap/data の URL を手で直す。図の範囲が変わっていれば docs/pdf-sheets.md の手順で求め直す。",
            "",
            "| 市区町村 | 図 | 一覧ページ |",
            "|---|---|---|",
            ...unresolved.map((u) => `| ${u.city} | ${u.labels.join("、")} | ${u.page} |`),
          ]
        : []),
      ...(unreachable.length ? ["", "## つながらない一覧ページ（一時的な障害や海外回線の遮断の可能性）", "", ...unreachable.map((u) => `- ${u.city}: ${u.page}`)] : []),
    ].join("\n");
    writeFileSync("sheet-watch-report.md", report + "\n");
    // ワークフローが Issue を立てるかどうかの判断に使う
    writeFileSync("sheet-watch.json", JSON.stringify({ replaced: replaced.length, unresolved: unresolved.length }));
    console.log(report);
  });
});
