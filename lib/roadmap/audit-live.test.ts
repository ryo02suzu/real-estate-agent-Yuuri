// 全市区町村の点検（ネットが要るので、AUDIT_LIVE=1 のときだけ。.github/workflows/weekly-audit.yml が毎週動かす）。
// 対応している市区町村ごとに、代表点（役所の座標。無ければ国土地理院の住所検索の市区町村の点。お客様の住所は使わない）で、
// アプリと同じ読み方で 用途地域・学区・最寄り駅・地価・ハザード・盛土規制法・砂防指定地など・自然公園など・地番 を出し、
// おかしな所（代表点が別の市区町村・データの無い種類を「指定なし」と言いそうな所・直線でいちばん近い駅が徒歩の上位に無い など）を
// 一覧にして AUDIT_OUT（既定は audit-report/）に Markdown と JSON で書く。ふつうのテスト（npm test）では動かない。
//   AUDIT_LIVE=1 npx vitest run lib/roadmap/audit-live.test.ts
//   AUDIT_ONLY=桐生市,船橋市 で市区町村を絞れる
//   AUDIT_PREF=青森県,岩手県 で都道府県を絞れる（地方ごとに分けて動かすとき）
import { mkdir, open, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { Source } from "pmtiles";
import { describe, expect, it, vi } from "vitest";
import { geocodeCandidates, reverseGeocode } from "./geocode";
import { hazardAt, hazardRows, type TileFetcher } from "./hazard";
import { houreiAt } from "./hourei";
import { houreiTileSource } from "./hourei-tiles";
import { nearestLandPrices } from "./land-price";
import { landPriceTileSource } from "./land-price-tiles";
import { moridoAt } from "./morido";
import { moridoTileSource } from "./morido-tiles";
import { MUNICIPALITIES, findMunicipality, noCityPlanning, type Municipality } from "./municipalities";
import { parcelAt } from "./parcel";
import { pmtilesParcelSource } from "./parcel-tiles";
import { schoolGaps, schoolsAt } from "./school";
import { schoolTileSource } from "./school-tiles";
import { tochiAt, tochiLine } from "./tochi";
import { tochiTileSource } from "./tochi-tiles";
import { zoningTileSource } from "./zoning-tiles";
import { nearbyStations, nearestStations, type Station } from "./walk";
import { noneLabel, OTHER_LABELS, statusFor, zoningArea, zoningAt, type ZoningLayer, type ZoningStatus } from "./zoning";
import ZONING_STATUS from "./data/zoning-status.json";
import HOUREI_SRC from "./data/hourei-source.json";
import LAND_SRC from "./data/land-price-source.json";
import MORIDO_SRC from "./data/morido-source.json";
import SCHOOL_SRC from "./data/school-source.json";
import STATION_SRC from "./data/station-source.json";
import TOCHI_SRC from "./data/tochi-source.json";
import ZONING_SRC from "./data/zoning-source.json";
import OFFICES from "./data/office-points.json";

/** 住所検索で市区町村の名前だけでは見つからない所（島の町村は「…島」を付けて書く） */
const QUERY: Record<string, string> = { 三宅村: "東京都三宅島三宅村", 八丈町: "東京都八丈島八丈町", 大島町: "東京都大島町", 小笠原村: "東京都小笠原村" };

const live = describe.runIf(process.env.AUDIT_LIVE === "1");
const OUT = process.env.AUDIT_OUT || "audit-report";
const ONLY = (process.env.AUDIT_ONLY || "").split(",").filter(Boolean);
const PREFS = (process.env.AUDIT_PREF || "").split(",").filter(Boolean);
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY || 4);

/** アプリと同じサイトに置いたファイル（public/）を、範囲を指定して読む */
function fileSource(url: string): Source {
  const path = `public${url}`;
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  return {
    getKey: () => path,
    getBytes: async (offset: number, length: number) => {
      fh ??= await open(path, "r");
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) as ArrayBuffer };
    },
  };
}

/** 重ねるハザードマップのタイル（PNG）を画素にする（ブラウザは canvas、ここは sharp） */
const nodeFetcher: TileFetcher = async (url) => {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
};

const zoningSrc = zoningTileSource(fileSource(ZONING_SRC.url));
const schoolSrc = schoolTileSource(fileSource(SCHOOL_SRC.url));
const landSrc = landPriceTileSource(fileSource(LAND_SRC.url));
const houreiSrc = houreiTileSource(fileSource(HOUREI_SRC.url));
const moridoSrc = moridoTileSource(fileSource(MORIDO_SRC.url));
const tochiSrc = tochiTileSource(fileSource(TOCHI_SRC.url));
const STATIONS = (JSON.parse(readFileSync(`public${STATION_SRC.url}`, "utf-8")) as { stations: Station[] }).stations;

type Row = {
  pref: string;
  name: string;
  point?: [number, number];
  /** 調べた中身（画面に出る言い方に近い短い文） */
  facts: Record<string, string>;
  /** 見直しが要りそうな所 */
  flags: string[];
  /** 知っておくとよいこと（データの無い種類など） */
  notes: string[];
};

const safe = async <T,>(f: () => Promise<T>): Promise<T | Error> => {
  try {
    return await f();
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
};

async function auditOne(m: Municipality): Promise<Row> {
  const row: Row = { pref: m.pref, name: m.name, facts: {}, flags: [], notes: [] };
  const muni = m.codes[0];
  // 代表点：役所の座標（地図リンクの確認と同じ。lib/roadmap/data/office-points.json）、無ければ国土地理院の住所検索の市区町村の点
  const office = (OFFICES as Record<string, number[]>)[`${m.pref}${m.name}`];
  let lat: number;
  let lng: number;
  if (office) {
    lat = office[0];
    lng = office[1];
  } else {
    const geo = await safe(() => geocodeCandidates(QUERY[m.name] ?? `${m.pref}${m.name}`));
    const g = geo instanceof Error ? undefined : geo[0];
    if (!g) {
      row.flags.push(`代表点：住所検索で見つからない${geo instanceof Error ? `（${geo.message}）` : ""}`);
      return row;
    }
    ({ lat, lng } = g);
  }
  row.point = [Number(lat.toFixed(5)), Number(lng.toFixed(5))];
  const rev = await safe(() => reverseGeocode(lat, lng));
  const back = rev instanceof Error || !rev ? undefined : findMunicipality(rev.muniCd);
  if (!back) row.flags.push(`代表点：市区町村を判定できない${rev instanceof Error ? `（${rev.message}）` : ""}`);
  else if (back.name !== m.name) row.flags.push(`代表点：${back.name}と判定（住所検索の点が市区町村の外）`);

  // 用途地域・区域
  const st: ZoningStatus | undefined = statusFor(m.codes, ZONING_STATUS as Record<string, ZoningStatus>);
  const z = await safe(() => zoningAt(lat, lng, zoningSrc));
  if (z instanceof Error) row.flags.push(`用途地域：読み込めず（${z.message}）`);
  else if (z) {
    const y = z.youto[0];
    row.facts["区域"] = zoningArea(z, st, noCityPlanning(m));
    row.facts["用途地域"] = y ? `${z.youto.map((o) => o.name).join("／")}（${y.bcr ?? "―"}/${y.far ?? "―"}）` : z.tokei || z.jyuntoshi ? noneLabel(st, "youto") : "―";
    row.facts["防火"] = z.bouka ?? noneLabel(st, "bouka");
    row.facts["高度地区"] = z.koudoti ? "指定あり" : noneLabel(st, "koudoti");
    if (!st && !noCityPlanning(m)) row.notes.push("用途地域：この市区町村の都市計画のデータが国のデータに無い");
    if (y && (!y.bcr || !y.far)) row.notes.push("用途地域：建ぺい率・容積率の数値がデータに無い（参考値で出す）");
    if (row.facts["区域"] === "データなし") row.flags.push("区域：都市計画区域のデータが無く、区域外かどうか言えない");
    const label = (l: string) => ({ youto: "用途地域", senbiki: "区域区分", tokei: "都市計画区域", bouka: "防火・準防火", koudoti: "高度地区", chikukei: "地区計画" })[l] ?? OTHER_LABELS.find(([k]) => k === (l as ZoningLayer))?.[1] ?? l;
    const zero = st ? (Object.entries(st.layers) as [string, number][]).filter(([, v]) => v === 0).map(([k]) => label(k)) : [];
    if (zero.length) row.notes.push(`都市計画：国のデータに無い種類（画面は「データなし」）：${zero.join("・")}`);
  }

  // 学区
  const sc = await safe(() => schoolsAt(lat, lng, schoolSrc));
  if (sc instanceof Error) row.flags.push(`学区：読み込めず（${sc.message}）`);
  else {
    row.facts["学区"] = [sc?.elementary ? `小 ${sc.elementary.name}` : "", sc?.junior ? `中 ${sc.junior.name}` : ""].filter(Boolean).join("・") || "―";
    for (const gp of schoolGaps(muni, sc)) {
      const why = gp.why === "terms" ? "利用条件で出せない" : gp.why === "absent" ? "国のデータに無い" : "代表点を含む区域がデータに無い";
      (gp.why === "outside" ? row.flags : row.notes).push(`学区：${gp.label}は${why}`);
    }
  }

  // 最寄り駅（国土地理院の道路で）
  const near = nearbyStations(lat, lng, STATIONS);
  const ws = await safe(() => nearestStations(lat, lng));
  if (ws instanceof Error) row.flags.push(`駅：道のりを出せず（${ws.message}）`);
  else if (!ws.length) row.notes.push("駅：20km 以内に駅が無い");
  else {
    const top = ws[0];
    row.facts["最寄り駅"] = ws.map((s) => `${s.name} ${s.routed ? `徒歩${s.minutes}分` : `直線${Math.round(s.meters)}m`}（${s.to ?? "platform"}）`).join("・");
    if (top.to === "platform") row.notes.push(`駅：${top.name}駅は出入口・駅舎が分からずホームまで測った`);
    // 直線でいちばん近い駅が、徒歩の3駅に入っていない（川・線路の向こうなら正しいこともある）
    const first = near[0]?.station.n;
    if (first && near[0].straight < 2000 && !ws.some((s) => s.name === first)) row.flags.push(`駅：直線でいちばん近い${first}駅が、徒歩の3駅に入っていない`);
    // 近い駅（数百m）は大通りの向こうの出入口などで比が大きくなりやすいので、差が 400m を超えるときだけ
    if (top.routed && top.meters > top.straight * 2.2 && top.meters - top.straight > 400) row.flags.push(`駅：${top.name}駅の道のりが直線の${(top.meters / top.straight).toFixed(1)}倍（遠回り）`);
  }

  // 地価（地価公示・地価調査）
  const lp = await safe(() => nearestLandPrices(lat, lng, landSrc, { count: 3, maxM: 6000 }));
  if (lp instanceof Error) row.flags.push(`地価：読み込めず（${lp.message}）`);
  // 島など、地点がそもそも無い所もある（アプリは「近くに地価の地点がありません」と出す）
  else if (!lp.length) row.notes.push("地価：6km 以内に地価公示・地価調査の地点が無い");
  else {
    row.facts["地価"] = lp.map((h) => `${h.kind}${h.no} ${Math.round(h.distance)}m ${h.price}円/㎡（${h.year}）`).join("・");
    if (lp[0].distance > 3000) row.notes.push(`地価：いちばん近い地点まで${Math.round(lp[0].distance)}m`);
  }

  // ハザード（重ねるハザードマップ）
  const hz = await safe(() => hazardAt(lat, lng, nodeFetcher));
  if (hz instanceof Error) row.flags.push(`ハザード：読み込めず（${hz.message}）`);
  else {
    const rows = hazardRows(hz);
    row.facts["ハザード"] = rows.map((r) => `${r.kind}:${r.value}`).join("・");
    for (const r of rows) if (/読み込めず|エラー/.test(r.value)) row.flags.push(`ハザード：${r.kind}が読み込めず`);
  }

  // 盛土規制法・砂防指定地など・自然公園など
  const md = await safe(() => moridoAt(lat, lng, muni, moridoSrc));
  row.facts["盛土規制法"] = md instanceof Error ? "読み込めず" : md ? (md.area?.kind ?? "区域外") : "データなし";
  if (md instanceof Error) row.flags.push(`盛土規制法：読み込めず（${md.message}）`);
  const hr = await safe(() => houreiAt(lat, lng, muni, houreiSrc));
  if (hr instanceof Error) row.flags.push(`砂防指定地など：読み込めず（${hr.message}）`);
  else if (hr) {
    row.facts["砂防指定地など"] = hr.hits.length ? hr.hits.map((h) => h.kind).join("・") : "区域外";
    if (hr.missing.length) row.notes.push(`砂防指定地など：県のデータに無い種類：${hr.missing.join("・")}`);
  }
  const tc = await safe(() => tochiAt(lat, lng, muni, tochiSrc));
  row.facts["自然公園など"] = tc instanceof Error ? "読み込めず" : tc ? tochiLine(tc) : "データなし";
  if (tc instanceof Error) row.flags.push(`自然公園など：読み込めず（${tc.message}）`);

  // 地番（登記所備付地図・公図から推定・地番参考図）
  const pc = await safe(() => parcelAt(lat, lng, pmtilesParcelSource));
  if (pc instanceof Error) row.flags.push(`地番：読み込めず（${pc.message}）`);
  else row.facts["地番"] = pc ? `${pc.chibanRaw}${pc.estimated ? "（公図から推定）" : pc.sanko ? "（地番参考図）" : ""}` : "―";
  return row;
}

async function pool<T, R>(items: T[], n: number, f: (t: T) => Promise<R>, done?: (i: number, r: R) => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await f(items[i]);
        done?.(i, out[i]);
      }
    }),
  );
  return out;
}

function markdown(rows: Row[], asOf: string): string {
  const flagged = rows.filter((r) => r.flags.length);
  const lines = [
    `# MICHILU 全市区町村の点検（${asOf}）`,
    "",
    `対応している ${rows.length} 市区町村の代表点（役所の座標。無ければ国土地理院の住所検索の市区町村の点）で、アプリと同じ読み方で調べた結果。`,
    "お客様の住所は使っていない。「見直しが要りそうな所」は自動で見つけた候補で、間違いと決まったものではない。",
    "",
    "## データの時点",
    "",
    `- 用途地域：${ZONING_SRC.url}（${(ZONING_SRC as { edition?: string }).edition ?? ""}）`,
    `- 学区：${SCHOOL_SRC.edition}`,
    `- 駅：鉄道データ ${STATION_SRC.year}年、駅の出入口 ${(STATION_SRC as { doorsDate?: string }).doorsDate ?? "―"}`,
    `- 地価：${LAND_SRC.url}`,
    `- 盛土規制法：${MORIDO_SRC.url}・砂防指定地など：${HOUREI_SRC.url}・自然公園など：${TOCHI_SRC.url}`,
    "",
    `## 見直しが要りそうな所（${flagged.length} 市区町村）`,
    "",
    ...(flagged.length ? flagged.flatMap((r) => [`- **${r.pref}${r.name}**`, ...r.flags.map((f) => `  - ${f}`)]) : ["なし"]),
    "",
    "## 市区町村ごとの結果",
    "",
    "| 市区町村 | 区域・用途地域 | 学区 | 最寄り駅 | 地価（いちばん近い） | 見直し | メモ |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) =>
      [
        `${r.pref}${r.name}`,
        `${r.facts["区域"] ?? "―"}・${r.facts["用途地域"] ?? "―"}`,
        r.facts["学区"] ?? "―",
        (r.facts["最寄り駅"] ?? "―").split("・")[0],
        (r.facts["地価"] ?? "―").split("・")[0],
        r.flags.join("<br>") || "",
        r.notes.join("<br>") || "",
      ]
        .map((c) => c.replace(/\|/g, "／"))
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    ),
    "",
  ];
  return lines.join("\n");
}

live("全市区町村の点検", () => {
  it("代表点で、用途地域・学区・駅・地価・ハザードなどを出し、見直しが要りそうな所を書き出す", { timeout: 3_600_000 }, async () => {
    // 駅のデータはアプリと同じサイトのファイル（/data/…）なので、そこだけ手元のファイルを返す
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      return u.startsWith("/data/") ? Promise.resolve(new Response(readFileSync(`public${u}`))) : real(url, init);
    });
    const list = MUNICIPALITIES.filter((m) => (!ONLY.length || ONLY.includes(m.name)) && (!PREFS.length || PREFS.includes(m.pref)));
    const started = Date.now();
    const rows = await pool(list, CONCURRENCY, auditOne, (i, r) => {
      if (r.flags.length || i % 25 === 0) console.log(`[${i + 1}/${list.length}] ${r.pref}${r.name}${r.flags.length ? `：${r.flags.join(" / ")}` : ""}`);
    });
    vi.unstubAllGlobals();
    const asOf = new Date().toISOString().slice(0, 10);
    await mkdir(OUT, { recursive: true });
    await writeFile(`${OUT}/audit.json`, JSON.stringify({ asOf, rows }, null, 1));
    await writeFile(`${OUT}/audit.md`, markdown(rows, asOf));
    console.log(`点検：${rows.length} 市区町村・見直し候補 ${rows.filter((r) => r.flags.length).length}・${Math.round((Date.now() - started) / 1000)}秒`);
    // 代表点を出せなかった市区町村が多ければ（住所検索の障害など）、点検そのものが失敗
    expect(rows.filter((r) => !r.point).length).toBeLessThan(Math.max(3, rows.length * 0.05));
  });
});
