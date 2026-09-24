// 全地図リンクの死活確認。役所の位置でURLを作って開き、404 やエラーページになっていないかを見る。
// ネットにつなぐので通常のテストでは動かさない。`npm run check-links`（LINK_CHECK=1）で実行し、
// GitHub Actions で毎週まわす（.github/workflows/link-check.yml）。結果は link-check-report.md に書く。
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import POINTS from "./data/office-points.json";
import { MUNICIPALITIES, buildLinks } from "./index";

// 一部の地図は自動ブラウザ風のアクセスを拒むので、iPhone の Safari として取りに行く
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ERROR_TEXT = /ページが見つかりません|お探しのページ|Page Not Found|404 Not Found|ファイルが見つかりません|公開を終了/i;

type Row = { city: string; label: string; url: string; result: "ok" | "broken" | "unreachable"; detail: string };

async function check(url: string): Promise<Pick<Row, "result" | "detail">> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (res.status >= 400) return { result: "broken", detail: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/html")) {
      const body = await res.text();
      const m = body.slice(0, 20_000).match(ERROR_TEXT);
      if (m) return { result: "broken", detail: `エラーページ（${m[0]}）` };
    }
    return { result: "ok", detail: `HTTP ${res.status}` };
  } catch (e) {
    // 海外の回線を断る役所もあるので、つながらないだけなら「要確認」にとどめる
    return { result: "unreachable", detail: e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e) };
  }
}

describe.skipIf(!process.env.LINK_CHECK)("地図リンクの死活確認", () => {
  it("すべての地図リンクが開ける", { timeout: 20 * 60_000 }, async () => {
    const points = POINTS as unknown as Record<string, [number, number]>;
    const jobs: Omit<Row, "result" | "detail">[] = [];
    const missing: string[] = [];
    for (const m of MUNICIPALITIES) {
      const p = points[m.pref + m.name];
      if (!p && m.maps.some((l) => l.build)) missing.push(m.pref + m.name);
      const [lat, lng] = p ?? [0, 0];
      for (const l of buildLinks(m, lat, lng)) if (l.pinpoint ? p : true) jobs.push({ city: `${m.pref}${m.name}`, label: l.label, url: l.url });
    }
    // 同じURL（県の地図の入口など）は1回だけ見る
    const unique = [...new Map(jobs.map((j) => [j.url, j])).values()];

    const rows: Row[] = [];
    const queue = [...unique];
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (let j = queue.shift(); j; j = queue.shift()) rows.push({ ...j, ...(await check(j.url)) });
      }),
    );

    const broken = rows.filter((r) => r.result === "broken");
    const unreachable = rows.filter((r) => r.result === "unreachable");
    const line = (r: Row) => `| ${r.city} | ${r.label} | ${r.detail} | [開く](${r.url}) |`;
    const report = [
      `# 地図リンクの確認結果（${new Date().toISOString().slice(0, 10)}）`,
      "",
      `確認 ${rows.length} 件 / 壊れている ${broken.length} 件 / つながらない ${unreachable.length} 件`,
      ...(missing.length ? ["", `役所の座標が無く確認できなかった市区町村: ${missing.join("、")}（lib/roadmap/data/office-points.json に追加）`] : []),
      ...(broken.length ? ["", "## 壊れている", "", "| 市区町村 | 地図 | 内容 | URL |", "|---|---|---|---|", ...broken.map(line)] : []),
      ...(unreachable.length ? ["", "## つながらない（一時的な障害や海外回線の遮断の可能性）", "", "| 市区町村 | 地図 | 内容 | URL |", "|---|---|---|---|", ...unreachable.map(line)] : []),
    ].join("\n");
    writeFileSync("link-check-report.md", report + "\n");
    console.log(report);

    expect(broken.map((r) => `${r.city} ${r.label}: ${r.detail}`)).toEqual([]);
    expect(missing).toEqual([]);
  });
});
