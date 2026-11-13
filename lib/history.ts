// 直近の検索履歴。顧客物件の住所なのでサーバーには送らず、端末の localStorage にだけ置く。
// プライベートブラウズ等で localStorage が使えない場合は、履歴なしで動く。
import type { Municipality } from "./roadmap";

export type HistoryItem = {
  address: string;
  city?: string;
  coverage?: Municipality["coverage"];
  at: number;
  /** 地図で選んだ地点（[緯度, 経度]）。住所は町までなので、選び直すときはこの座標で調べる */
  ll?: [number, number];
  /** 物件の鍵（lib/property-id.ts）。信頼できる識別情報があるときだけ同じ物件としてまとめる */
  pid?: string;
};

/** 同じ検索かどうか（地図で選んだ地点は座標で比べる） */
export const historyKey = (h: HistoryItem) => (h.ll ? h.ll.join(",") : h.address);

const KEY = "michilu:history";
/**
 * 端末に残す検索の数（古いものから消える。ホームの「最近の検索」はこの先頭の3件、PC の検索履歴のシートは先頭の30件）。
 * 忙しい週でも1〜2か月前に調べた物件までさかのぼれるように 200 件（前は30件で、1週間ほどで消えていた）。
 * 1件は 200 バイトほどなので、200 件でも 40KB ほど（端末の保存の上限は 5MB ほど）
 */
export const HISTORY_MAX = 200;
const MAX = HISTORY_MAX;

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const items: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? (items as HistoryItem[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** 先頭に追加する。同じ住所（地図で選んだ地点は同じ座標）は古い方を消す。保存後の一覧を返す */
export function addHistory(item: HistoryItem): HistoryItem[] {
  const next = [item, ...loadHistory().filter((h) => historyKey(h) !== historyKey(item))].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても検索自体は続ける
  }
  return next;
}

/** 読み込み（書き出したファイルから）：足すだけ。同じ検索は新しい方を残す。足した数を返す */
export function mergeHistory(items: HistoryItem[]): number {
  const cur = loadHistory();
  const map = new Map(cur.map((h) => [historyKey(h), h]));
  let added = 0;
  for (const h of items) {
    if (!h || typeof h.address !== "string" || typeof h.at !== "number") continue;
    const k = historyKey(h);
    const mine = map.get(k);
    if (!mine || h.at > mine.at) {
      map.set(k, mine ? { ...mine, ...h } : h);
      added++;
    }
  }
  const next = [...map.values()].sort((a, b) => b.at - a.at).slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても続ける
  }
  return added;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}

/** 一覧を保存する。保存できたかを返す */
function save(list: HistoryItem[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * いまの一覧（画面が持っている一覧。端末に保存できないときも、画面の一覧から消す）から、items を消して保存する。
 * 消したあとの一覧と、保存できたかを返す（保存できなければ、開き直すと戻る）
 */
export function removeHistory(list: readonly HistoryItem[], items: readonly HistoryItem[]): { items: HistoryItem[]; saved: boolean } {
  const drop = new Set(items.map(historyKey));
  const next = list.filter((h) => !drop.has(historyKey(h)));
  return { items: next, saved: save(next) };
}

/**
 * 消したものを戻す（「元に戻す」）。調べた日時の新しい順に並べ直すので、元の位置に戻る。
 * 消したあとに同じ検索をし直していたら、新しい方を残す。最大 HISTORY_MAX 件
 */
export function restoreHistory(list: readonly HistoryItem[], items: readonly HistoryItem[]): HistoryItem[] {
  const map = new Map(list.map((h) => [historyKey(h), h]));
  for (const h of items) {
    const k = historyKey(h);
    const mine = map.get(k);
    if (!mine || h.at > mine.at) map.set(k, h);
  }
  const next = [...map.values()].sort((a, b) => b.at - a.at).slice(0, MAX);
  save(next);
  return next;
}
