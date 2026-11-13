// 右上のメニュー（≡。components/app/app-menu.tsx）に出す短い一言。どれも端末に残っている設定・記録から作る（サーバーには送らない）。
// 書類の差出人が入っているか・照会の文面（ひな形）をどう使っているか・調査記録をいつ書き出したか・この端末に残っている記録の数・
// 続きから開く物件
import { historyKey, type HistoryItem } from "../history";
import type { InquirySettings } from "../inquiry-store";
import type { PropertyRecords } from "../records";
import type { Resume } from "../resume";
import { hasSender, type Sender } from "../sender";
import { stamp } from "./history-view";

/**
 * 書類の差出人の行：入っていれば「会社名・担当者」と「電話・メール」の2行（set。書類の右上に入れる形と同じ。lib/sender.ts の
 * senderShort）。行の中は折り返してよい区切りごとに分けて返す（会社名や「担当 山田」の途中で折り返さないため）。
 * 無ければ入れると何に入るか（「未設定」の札を出す）
 */
export function senderNote(s: Sender): { lines: string[][]; set: boolean } {
  if (!hasSender(s)) return { lines: [["会社名・担当者を入れると、照会文・調査メモ・案内図に入ります"]], set: false };
  const lines = [
    [s.company, s.person && `担当 ${s.person}`],
    [s.phone && `TEL ${s.phone}`, s.email],
  ].map((l) => l.filter((x): x is string => !!x));
  return { lines: lines.filter((l) => l.length > 0), set: true };
}

/** 照会の文面（ひな形）の行：いま使うひな形（自分のひな形の数）と、FAX をメールで送る宛先の形を入れてあるか */
export function templateNote(s: InquirySettings): string {
  const mine = s.list.find((t) => t.id === s.pick);
  const base = s.list.length ? `自分のひな形 ${s.list.length}件・使うのは「${mine ? mine.name.trim() || "名前なし" : "標準"}」` : "標準のひな形で作ります。自分のひな形も作れます";
  return s.fax ? `${base}・FAX をメールで送る宛先の形あり` : base;
}

/**
 * 調査記録の書き出し・読み込みの行：最後に書き出した日時。まだ書き出しておらず、この端末に残っている記録があるときは
 * 書き出しを勧める（warn。Safari は使わない日が続くと保存データを消すことがあり、機種変更でも引き継がれない）
 */
export function backupNote(last: number | null, now: number, items: number): { text: string; warn: boolean } {
  if (last) return { text: `最後の書き出し ${stamp(last, now, true)}`, warn: false };
  if (items > 0) return { text: "まだ書き出していません。機種変更・データの消失に備えて", warn: true };
  return { text: "機種変更・データの消失への備え", warn: false };
}

/** 確認の記録がある物件の数（確認事項を1つでも書いた物件。消して空になった物件は数えない） */
export function recordedCount(list: readonly PropertyRecords[]): number {
  return list.filter((r) => Object.values(r.items).some((t) => !!t && Object.keys(t).length > 0)).length;
}

/**
 * 「続きから」の物件：直近（lib/resume.ts の RESUME_DAYS 日以内）に開いていた物件のうち、履歴に残っているもの
 * （履歴から消した物件は出さない。押すと履歴の行から開き直し、前に見ていたタブから続く）。tab は開いていたタブの鍵
 */
export function resumeTarget(r: Resume | undefined, history: readonly HistoryItem[]): { item: HistoryItem; tab: string; at: number } | null {
  if (!r) return null;
  const item = history.find((h) => historyKey(h) === r.historyKey);
  return item ? { item, tab: r.tab, at: r.at } : null;
}
