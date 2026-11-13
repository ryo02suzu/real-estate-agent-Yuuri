// 確かめた結果（確認の記録のうち、確認済みで答えを書いたもの）を書類に入れるための形。重説の下書き（lib/draft.ts）が、
// 対応する欄を「確認済み」に書き換え、データだけの「要確認」を外す。記録は端末の中だけ（lib/records.ts）。MICHILU の判定ではない
import { RECORD_ITEMS, RECORD_TOPICS, type PropertyRecords, type RecordTopic } from "../records";
import { RESULT_FIELDS } from "./todo";

/** 確かめた結果の1つ。label は答えの見出し（盛土・砂防のように1つの確認事項に2つ以上書くときは、それぞれの見出し） */
export type ConfirmedItem = { topic: RecordTopic; sub: string; label: string; value: string; detail: string };

const md = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 確認の記録から、確かめた結果を取り出す（確認済みで、答え・メモのあるものだけ。並びは確認の記録の項目の順） */
export function confirmedItems(records: PropertyRecords | undefined): ConfirmedItem[] {
  if (!records) return [];
  const fields = Object.values(RESULT_FIELDS).flat();
  const out: ConfirmedItem[] = [];
  for (const topic of RECORD_TOPICS)
    for (const s of RECORD_ITEMS[topic].subs) {
      const r = records.items[topic]?.[s.id];
      const note = r?.note?.trim();
      if (!r?.done || !note) continue;
      const detail = `確認済み ${md(r.at)}${r.method ? `・${r.method}` : ""}${r.source ? `・${r.source}` : ""}`;
      const mine = fields.filter((f) => f.topic === topic && f.sub === s.id);
      // 2つ以上のやることが書く確認事項は「見出し：答え」を「／」でつないである。見出しの無い所（自由に書いたメモ）は確認事項の名前で
      const labels = [...new Set(mine.map((f) => f.label))];
      if (labels.length > 1) {
        for (const seg of note.split("／").map((x) => x.trim()).filter(Boolean)) {
          const label = labels.find((l) => seg.startsWith(`${l}：`));
          out.push({ topic, sub: s.id, label: label ?? s.label, value: label ? seg.slice(label.length + 1) : seg, detail });
        }
      } else out.push({ topic, sub: s.id, label: s.label, value: note, detail });
    }
  return out;
}
