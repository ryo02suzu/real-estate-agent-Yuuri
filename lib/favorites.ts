// お気に入り（保存した物件）。検索履歴と同じく顧客物件の住所なので、端末の localStorage にだけ置く。
// 結果の画面の「お気に入り」で足し外しする（ホームとメニューから一覧を開く）
import type { HistoryItem } from "./history";

export type FavoriteItem = HistoryItem;

const KEY = "michilu:favorites";
const MAX = 50;

export const favoriteKey = (f: FavoriteItem) => (f.ll ? f.ll.join(",") : f.address);

export function loadFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const items: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? (items as FavoriteItem[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** 保存できたか（プライベートブラウズや容量不足で保存できないことがある） */
function store(items: FavoriteItem[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function save(items: FavoriteItem[]): FavoriteItem[] {
  // 保存できなくても画面は続ける（スマホの★は toggleFavoriteChecked で保存できたかを見る）
  store(items);
  return items;
}

export const isFavorite = (item: FavoriteItem) => loadFavorites().some((f) => favoriteKey(f) === favoriteKey(item));

/** 入っていなければ先頭に足し、入っていれば外す。保存後の一覧を返す */
export function toggleFavorite(item: FavoriteItem): FavoriteItem[] {
  const rest = loadFavorites().filter((f) => favoriteKey(f) !== favoriteKey(item));
  return save(isFavorite(item) ? rest : [item, ...rest].slice(0, MAX));
}

/**
 * 同じだが、保存できたかも返す。保存できなかったときは、保存前の一覧を返す（見た目だけ保存済みにしない。
 * スマホの★は元に戻して「保存できませんでした」と知らせる）
 */
export function toggleFavoriteChecked(item: FavoriteItem): { items: FavoriteItem[]; saved: boolean; added: boolean } {
  const before = loadFavorites();
  const added = !before.some((f) => favoriteKey(f) === favoriteKey(item));
  const next = added ? [item, ...before].slice(0, MAX) : before.filter((f) => favoriteKey(f) !== favoriteKey(item));
  const saved = store(next);
  return { items: saved ? next : before, saved, added };
}

export const removeFavorite = (item: FavoriteItem): FavoriteItem[] => save(loadFavorites().filter((f) => favoriteKey(f) !== favoriteKey(item)));

/** 読み込み（書き出したファイルから）：無いものだけ足す。足した数を返す */
export function mergeFavorites(items: FavoriteItem[]): number {
  const cur = loadFavorites();
  const have = new Set(cur.map(favoriteKey));
  const add = items.filter((f) => f && typeof f.address === "string" && !have.has(favoriteKey(f)));
  if (add.length) save([...cur, ...add].slice(0, MAX));
  return add.length;
}
