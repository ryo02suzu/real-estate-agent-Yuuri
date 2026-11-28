// 物件概要書（Excel）。重説・物件概要の下書き（lib/draft.ts の buildDraft。MICHILU にある情報だけ）から物件概要書に載せる欄を選び、
// A4 縦 1 枚（PDF にして送る）の、編集できる .xlsx にする（lib/xlsx.ts。端末の中で作り、どこにも送らない）。
// 載せる欄（持ち主の指示 2026-11-22）：物件の表示（所在と、土地・建物。面積は登記事項証明書を見て書き込む欄）・都市計画法と建築基準法の制限・
// その他の法令（国のデータで区域に入るものだけ）・飲用水・ガス・排水施設・現地で確かめたこと、いちばん下に写真を貼る枠。列は項目と内容の 2 つ。
// 載せない欄：緯度経度・隣地・地番の参考図・データの時点・建築基準法39条（区域に入るときは載せる）・敷地と道路との関係・ハザードマップ・
// 災害リスク・販売図面向け・周辺環境・出典の欄・URL だけの欄。出典は、載せた欄のデータの分だけ、いちばん下に小さな字で残す（利用規約で決まっている）。
// 法令上の判断（建てられるか・接道を満たすか）はしない。データで分からない欄は「要確認」と確かめる先。
import { DRAFT_NOTE, ksjCredits, LAW_CREDITS, type DraftRow, type DraftSection, type DraftSrc } from "./draft";
import { XLSX_STYLE as S, xlsxBytes, type XlsxCell, type XlsxSheet, type XlsxStyle } from "./xlsx";

/**
 * 表の列：項目・内容の 2 つ（幅は文字数。合わせて A4 縦の幅に収まる）。確認（要確認・確認済み）と確認先・備考の列は付けない
 * （持ち主の指示 2026-11-22。確かめる先はアプリの下書きにある）
 */
export const OVERVIEW_COLS = [22, 64];
/** 登記事項証明書（謄本）を見て書き込む面積の欄 */
export const AREA_ROWS = { land: "地積（登記簿）", building: "床面積（登記簿）" } as const;

/** 物件概要書の 1 行：下書きの欄・欄の中の小見出し（土地・建物）・書き込む面積の欄 */
export type OverviewItem = { row: DraftRow } | { sub: string } | { area: string };
export type OverviewPart = { title: string; items: OverviewItem[] };

/** あなたが確かめた結果のうち、区域に入らない・当てはまらないもの（その他の法令の欄に載せない） */
const NOT_APPLICABLE = /^(区域外|該当なし|該当しない|当てはまらない|包蔵地ではない|対象外|指定なし|なし|無し|ない)/;
const hasUrl = (s?: string) => !!s && /https?:\/\//.test(s);

/** 「…（推定）」→「…（推定・参考）」、印が無ければ「…（参考）」（かっこを重ねない） */
const withMark = (value: string, mark: string) => (/）$/.test(value) ? `${value.slice(0, -1)}・${mark}）` : `${value}（${mark}）`);

/**
 * 所在（地番）の欄の内容。確認先の列が無い（持ち主の指示 2026-11-22）ので、内容だけで「物件の地番と確かめたものではない」と分かるように書く
 * （地番で探した筆は下書きのまま。2026-11-28：住所の地点の筆を物件の地番のように書いていた・地番参考図の筆には「参考」も付いていなかった）。
 * - 道路など物件の外の土地の可能性がある筆（off）：地番は書かない（画面でも物件の筆として出していない）
 * - 住所の地点の筆（address。住居表示と地番は別のもの）：「要確認」を先に書き、筆は参考として添える
 * - 地図で選んだ地点の筆（picked）：地番に「参考」を添える
 */
function lotRow(r: DraftRow): DraftRow {
  if (r.lot === "off") return { ...r, value: "要確認（この地点の筆は道路など物件の外の土地の可能性。公図で確認）" };
  if (r.lot === "address") return { ...r, value: `要確認（住所の地点の筆は ${withMark(r.value, "参考").replace(/（([^（）]*)）$/, "・$1")}）` };
  if (r.lot === "picked") return { ...r, value: withMark(r.value, "参考") };
  return r;
}

/**
 * 物件概要書に載せる欄と、その出典（載せた欄のデータの分だけ）。
 * 物件の表示は「所在（住所）」のあとに土地（地番・あなたが確かめた登記の地番や境界・地積）と建物（床面積）の小見出しで分ける
 */
export function overviewParts(sections: DraftSection[]): { parts: OverviewPart[]; credits: string[] } {
  const sec = (re: RegExp) => sections.find((s) => re.test(s.title));
  const rowsOf = (re: RegExp) => (sec(re)?.rows ?? []).filter((r) => !hasUrl(r.value) && !hasUrl(r.note));
  const parts: OverviewPart[] = [];
  const push = (title: string, rows: DraftRow[]) => {
    if (rows.length) parts.push({ title, items: rows.map((row) => ({ row })) });
  };

  const place = rowsOf(/^物件の表示/).filter((r) => !/^(緯度・経度|隣地の地番|地番の参考図)$/.test(r.label));
  const address = place.filter((r) => r.label === "所在（住所）");
  const land = place.filter((r) => r.label !== "所在（住所）").map(lotRow);
  parts.push({
    title: "物件の表示",
    items: [...address.map((row) => ({ row })), { sub: "土地" }, ...land.map((row) => ({ row })), { area: AREA_ROWS.land }, { sub: "建物" }, { area: AREA_ROWS.building }],
  });
  // 都市計画：データの時点は載せない。建築基準法39条（災害危険区域）は、国のデータで区域に入るときだけ
  const law = sec(/^都市計画法/);
  push(law?.title ?? "都市計画法・建築基準法に基づく制限（参考）", rowsOf(/^都市計画法/).filter((r) => r.label !== "データの時点" && (r.src !== "hourei" || r.area === "in")));
  // その他の法令：国のデータで区域に入るもの・あなたが確かめて当てはまったものだけ（区域外・分からない欄・確認先の地図は載せない）。
  // 土砂災害警戒区域等（災害リスクの欄。ハザードマップのデータ）に入るときは、土砂災害防止法の区域としてここに載せる
  const other = rowsOf(/^その他の法令/).filter((r) => (r.confirmed ? !NOT_APPLICABLE.test(r.value.normalize("NFKC").trim()) : r.area === "in"));
  const dosha = sec(/^災害リスク/)?.rows.find((r) => r.src === "hazard" && r.area === "in");
  if (dosha) other.push({ label: "土砂災害防止法（土砂災害警戒区域等）", value: `${dosha.value}（国のデータ・参考）`, note: "区域の指定は都道府県の公表図・窓口で確認", check: true, src: "hazard" });
  push(sec(/^その他の法令/)?.title ?? "その他の法令に基づく制限（参考）", other);
  // 飲用水・ガス・排水：照会先・台帳のページ（URL だけの欄）は載せない（照会先の名前は、それぞれの欄の確認先にある）
  const supply = sec(/^飲用水/);
  if (supply) push(supply.title, rowsOf(/^飲用水/));
  const site = sec(/^現地で確かめたこと/);
  if (site) push(site.title, rowsOf(/^現地で確かめたこと/));

  // 出典：載せた欄のデータの分だけ（筆・都市計画・国土数値情報の法令の区域・都県の特記事項・土砂災害）
  const used = new Set<DraftSrc>();
  for (const p of parts) for (const it of p.items) if ("row" in it && it.row.src) used.add(it.row.src);
  const draftCredit = (src: DraftSrc) => sec(/^出典/)?.rows.find((r) => r.src === src)?.value;
  const credits: string[] = [];
  const add = (c: string | undefined) => {
    if (c && !credits.includes(c)) credits.push(c);
  };
  if (used.has("parcel")) add(draftCredit("parcel"));
  if (used.has("zoning")) add(draftCredit("zoning"));
  ksjCredits((["morido", "hourei", "tochi"] as const).filter((k) => used.has(k)).map((k) => LAW_CREDITS[k])).forEach(add);
  if (used.has("hourei")) add(draftCredit("notes"));
  if (used.has("hazard")) add(draftCredit("hazard"));
  return { parts, credits };
}

function dateText(at: Date): string {
  return `${at.getFullYear()}年${at.getMonth() + 1}月${at.getDate()}日`;
}

// ---------------------------------------------------------------- 高さの見積もり（写真の枠の大きさと、つないだセルの高さを決める）

/** A4 縦の、余白を除いた高さ（pt。上下の余白 0.45 インチ。lib/xlsx.ts の 1 ページに収める印刷） */
export const PAGE_HEIGHT = 841.89 - 2 * 0.45 * 72;
/** 列の幅（文字数）→ 画素（標準の字（游ゴシック 11pt）の数字の幅は 8 画素） */
const colPx = (w: number) => w * 8;
/** 文字の幅（全角を 1、半角を 0.55） */
function textUnits(s: string): number {
  let u = 0;
  for (const ch of s) u += /[\u0000-ÿ｡-ﾟ]/.test(ch) ? 0.55 : 1;
  return u;
}
/** 折り返したときの行の数（少し多めに見積もる） */
export function textLines(s: string, widthPx: number, pt: number): number {
  const per = Math.max(1, ((widthPx - 8) / ((pt * 4) / 3)) * 0.92);
  return s.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(textUnits(line) / per)), 0);
}
/** 1 行の高さ（pt。游ゴシックは字の大きさの約 1.7 倍。11pt で 18.75pt） */
const lineHeight = (pt: number) => pt * 1.7;

/** 写真の枠の高さ（pt）：1 ページの残り。小さすぎず（はみ出すときは Excel が 1 ページに縮める）、大きすぎず（4:3 の写真を 2 枚並べる大きさくらい） */
export const PHOTO_HEIGHT = { min: 170, max: 280 } as const;

/**
 * 物件概要書の表（A4 縦 1 枚）。name：物件の名前（地番。無ければ住所）。
 * 1 行目：表題、2 行目：作成日と注意、そのあと欄ごとに欄の見出しの行と、項目・内容の行。物件の表示は土地・建物の小見出しで分け、
 * 地積・床面積は空けておく（数を入れると「123.45㎡」と出る）。最後に写真を貼る枠（横いっぱい）と、注意・出典（小さな字）
 */
export function overviewSheet(sections: DraftSection[], name: string, at: Date): XlsxSheet {
  const { parts, credits } = overviewParts(sections);
  const rows: XlsxCell[][] = [];
  const merges: string[] = [];
  const heights: Record<number, number> = {};
  const [wA, wB] = OVERVIEW_COLS.map(colPx);
  const wAll = wA + wB;
  let total = 0;
  /** 2 列をつないだ 1 行（高さを決める。つないだセルは Excel が高さを合わせない） */
  const full = (v: string, s: XlsxStyle, h: number) => {
    rows.push([{ v, s }, { v: "", s }]);
    merges.push(`A${rows.length}:B${rows.length}`);
    heights[rows.length] = h;
    total += h;
  };
  /** 項目の行（高さは Excel が中身に合わせる。ここでは写真の枠の大きさを決めるために見積もるだけ） */
  const line = (label: string, value: XlsxCell) => {
    rows.push([{ v: label, s: S.label }, value]);
    total += Math.max(textLines(label, wA, 9) * lineHeight(9), textLines(value?.v ?? "", wB, 9.5) * lineHeight(9.5)) + 1;
  };

  const title = `物件概要書（下書き）　${name}`;
  full(title, S.title, Math.max(26, textLines(title, wAll, 14) * lineHeight(14) + 2));
  full(`作成 ${dateText(at)}・MICHILU（国・市のデータによる参考。法令上の判断はしていません）`, S.small, 15);
  for (const part of parts) {
    full(part.title, S.section, 18);
    for (const it of part.items) {
      if ("sub" in it) full(it.sub, S.sub, 16);
      else if ("area" in it) line(it.area, { v: "", s: S.area });
      else line(it.row.label, { v: it.row.value, s: S.value });
    }
  }

  // いちばん下の注意と出典（小さな字。つないだセルなので、高さは多めに見積もる）
  const foot = [DRAFT_NOTE, credits.join("　")].filter(Boolean).join("\n");
  const footHeight = Math.ceil((textLines(foot, wAll, 7.5) + 0.5) * lineHeight(7.5));
  // 写真を貼る枠（横いっぱい。2 枚並べて貼れる）。高さは 1 ページの残り
  full("写真", S.section, 18);
  const photo = Math.round(Math.min(PHOTO_HEIGHT.max, Math.max(PHOTO_HEIGHT.min, PAGE_HEIGHT - total - 4 - footHeight - 6)));
  rows.push([{ v: "", s: S.photo }, { v: "", s: S.photo }]);
  merges.push(`A${rows.length}:B${rows.length}`);
  heights[rows.length] = photo;
  rows.push([]);
  heights[rows.length] = 4;
  full(foot, S.fine, footHeight);
  return { name: "物件概要書", cols: OVERVIEW_COLS, rows, merges, heights, print: "page", hideGrid: true };
}

/** 物件概要書の .xlsx */
export function overviewXlsx(sections: DraftSection[], name: string, at: Date = new Date()): Uint8Array {
  return xlsxBytes({ sheets: [overviewSheet(sections, name, at)], title: `物件概要書 ${name}`, creator: "MICHILU", created: at });
}

/** ファイルの名前（物件概要書_地番か住所_20261122.xlsx）。ファイル名に使えない記号は外す */
export function overviewFileName(name: string, at: Date = new Date()): string {
  const ymd = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;
  const safe = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 60);
  return `物件概要書_${safe || "物件"}_${ymd}.xlsx`;
}

/**
 * 物件の名前（表題とファイルの名前）。所在の地番。分からなければ住所。
 * 住所の地点の筆（参考）と、道路など物件の外の土地の可能性がある筆は、物件の地番と確かめたものではないので名前にしない（住所にする）
 */
export function overviewName(sections: DraftSection[]): string {
  const place = sections.find((s) => s.title === "物件の表示")?.rows ?? [];
  const chiban = place.find((r) => r.label === "所在（地番）" && r.value !== "要確認" && r.lot !== "address" && r.lot !== "off")?.value;
  const address = place.find((r) => r.label === "所在（住所）")?.value;
  return (chiban || address || "物件").trim();
}
