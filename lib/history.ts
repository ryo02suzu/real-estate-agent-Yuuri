// 直近の検索履歴。顧客物件の住所なのでサーバーには送らず、端末の localStorage にだけ置く。
// プライベートブラウズ等で localStorage が使えない場合は、履歴なしで動く。
import type { Municipality } from "./roadmap";

export type HistoryItem = {
  address: string;
  city?: string;
  coverage?: Municipality["coverage"];
  at: number;
};

const KEY = "michilu:history";
const MAX = 5;

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const items: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? (items as HistoryItem[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** 先頭に追加する。同じ住所は古い方を消す。保存後の一覧を返す */
export function addHistory(item: HistoryItem): HistoryItem[] {
  const next = [item, ...loadHistory().filter((h) => h.address !== item.address)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても検索自体は続ける
  }
  return next;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
