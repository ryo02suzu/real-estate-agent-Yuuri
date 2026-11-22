// 物件概要書（Excel）。重説・物件概要の下書き（lib/draft.ts の buildDraft。MICHILU にある情報だけ）を、項目・内容・確認・
// 確認先の表にして、編集できる .xlsx にする（lib/xlsx.ts。端末の中で作り、どこにも送らない）。
// 法令上の判断（建てられるか・接道を満たすか）はしない。データで分からない欄は「要確認」と確かめる先、出典と注意も入れる。
import { DRAFT_NOTE, type DraftSection } from "./draft";
import { XLSX_STYLE as S, xlsxBytes, type XlsxCell, type XlsxSheet } from "./xlsx";

/** 表の列：項目・内容・確認（要確認／確認済み）・確認先・備考（幅は文字数） */
export const OVERVIEW_COLS = [22, 54, 10, 48];
export const OVERVIEW_HEAD = ["項目", "内容", "確認", "確認先・備考"] as const;

function dateText(at: Date): string {
  return `${at.getFullYear()}年${at.getMonth() + 1}月${at.getDate()}日`;
}

/**
 * 物件概要書の表。name：物件の名前（地番。無ければ住所）。
 * 1 行目：表題、2 行目：作成日と注意、3 行目：列の見出し（表示を止め、印刷の各ページの上にも付ける）、そのあと欄ごとに
 * 欄の見出しの行と項目の行。出典は最後にまとめ、いちばん下に注意。
 */
export function overviewSheet(sections: DraftSection[], name: string, at: Date): XlsxSheet {
  const rows: XlsxCell[][] = [];
  const merges: string[] = [];
  const heights: Record<number, number> = {};
  const full = (v: string, s: (typeof S)[keyof typeof S]) => {
    rows.push([{ v, s }, { v: "", s }, { v: "", s }, { v: "", s }]);
    merges.push(`A${rows.length}:D${rows.length}`);
  };
  full(`物件概要書（下書き）　${name}`, S.title);
  heights[rows.length] = 30;
  full(`作成 ${dateText(at)}・MICHILU（国・市のデータによる参考。法令上の判断はしていません）`, S.small);
  rows.push(OVERVIEW_HEAD.map((v) => ({ v, s: S.head })));
  heights[rows.length] = 21;
  const source = sections.find((s) => /^出典/.test(s.title));
  for (const sec of sections) {
    if (sec === source) continue;
    full(sec.title, S.section);
    heights[rows.length] = 21;
    for (const r of sec.rows) {
      const mark = r.confirmed ? { v: "確認済み", s: S.done } : r.check ? { v: "要確認", s: S.check } : { v: "", s: S.value };
      rows.push([{ v: r.label, s: S.label }, { v: r.value, s: S.value }, mark, { v: r.note ?? "", s: S.note }]);
    }
  }
  // 出典は、内容の列に 1 つずつ（長いので折り返す。セルをつなぐと Excel が高さを合わせないので、つながない）
  if (source?.rows.length) {
    full("出典", S.section);
    heights[rows.length] = 21;
    for (const r of source.rows) rows.push([{ v: "出典", s: S.label }, { v: r.value, s: S.value }, { v: "", s: S.value }, { v: "", s: S.note }]);
  }
  rows.push([]);
  rows.push([{ v: "注意", s: S.label }, { v: DRAFT_NOTE, s: S.value }, { v: "", s: S.value }, { v: "", s: S.note }]);
  return { name: "物件概要書", cols: OVERVIEW_COLS, rows, merges, heights, freezeBelow: 3, printTitleRow: 3 };
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

/** 物件の名前（所在の地番。分からなければ住所） */
export function overviewName(sections: DraftSection[]): string {
  const place = sections.find((s) => s.title === "物件の表示")?.rows ?? [];
  const chiban = place.find((r) => r.label === "所在（地番）" && r.value !== "要確認")?.value;
  const address = place.find((r) => r.label === "所在（住所）")?.value;
  return (chiban || address || "物件").trim();
}
