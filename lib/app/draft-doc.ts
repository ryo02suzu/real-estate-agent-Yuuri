// 重説・物件概要の下書き（lib/draft.ts。PC と同じ中身）を、スマホの書類の形（lib/app/doc.ts）にする。
// 欄の文に混じった URL（「…（https://…）」）は「確かめる先」にして、文からは外す（画面では「開く」、コピーした文では最後のリンク集）。
// 隣地の地番は同じ所在をまとめて短くする（「松戸市古ケ崎4丁目 3555-1・3555-2…」）。数字は半角にそろえる
import type { DraftSection } from "../draft";
import { compactParcels, half, jaDate, type Doc, type DocItem, type DocSection } from "./doc";

const URL_IN = /（(https?:\/\/[^）\s]+)）/;

/** 1つの欄の行を、書類の行にする */
function rowItem(r: DraftSection["rows"][number]): DocItem {
  let text = half(r.value);
  let link: DocItem["link"];
  const m = text.match(URL_IN);
  if (m) {
    text = text.replace(URL_IN, "").trim();
    link = { label: `${r.label}：${text}`, url: m[1] };
  }
  let note = r.note ? half(r.note) : undefined;
  if (note && /^https?:\/\//.test(note)) {
    link = { label: `${r.label}：${text}`, url: note };
    note = undefined;
  }
  // 確かめた結果の欄は「確認済み」の印を付けるので、注の頭の「確認済み」は省く
  if (r.confirmed && note) note = note.replace(/^確認済み\s*/, "");
  if (r.label === "隣地の地番" && !/^省略/.test(text)) {
    const more = text.match(/、ほか(\d+)筆（公図で確認）$/);
    const list = text.replace(/、ほか\d+筆（公図で確認）$/, "").split("、");
    text = `${compactParcels(list).join("／")}${more ? `／ほか${more[1]}筆（公図で確認）` : ""}`;
  }
  return { label: r.label, text, note, link, tone: r.confirmed ? "ok" : r.check ? "check" : undefined };
}

/** 下書きの1つの欄（タブの中身） */
export function draftSectionDoc(s: DraftSection): DocSection {
  return { title: s.title, items: s.rows.map(rowItem) };
}

/** 出典の行から、前の行・同じ行にもう出ている文（「。」まで）を外す（PC の下書きの出典は、欄ごとに同じ注を足すことがある） */
export function uniqueSentences(rows: string[]): string[] {
  const seen = new Set<string>();
  return rows
    .map((r) =>
      r
        .split(/(?<=。)/)
        .filter((x) => {
          const k = x.replace(/。$/, "").trim();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .join(""),
    )
    .filter((r) => r.trim());
}

/** 下書きの全部（コピーする文の元） */
export function draftDoc(sections: DraftSection[], date: Date): Doc {
  const checks = sections.reduce((n, x) => n + x.rows.filter((r) => r.check).length, 0);
  const confirmed = sections.reduce((n, x) => n + x.rows.filter((r) => r.confirmed).length, 0);
  return {
    title: "重説・物件概要の下書き",
    head: [`作成日：${jaDate(date)}（MICHILU の調査から・参考）`, `要確認 ${checks}か所${confirmed ? `・確認済み ${confirmed}か所（あなたが確かめた結果）` : ""}`],
    sections: sections.filter((s) => !/^出典/.test(s.title)).map(draftSectionDoc),
    foot: ["※重説・販売図面の欄の順に並べた参考の下書きです（法令上の判断はしません）。【要確認】の欄は、役所・法務局・現地で確かめてから書いてください。", ...uniqueSentences(sections.filter((s) => /^出典/.test(s.title)).flatMap((s) => s.rows.map((r) => half(r.value)))).map((r) => `※${r}`)],
  };
}
