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

function save(items: FavoriteItem[]): FavoriteItem[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // 保存できなくても画面は続ける
  }
  return items;
}

export const isFavorite = (item: FavoriteItem) => loadFavorites().some((f) => favoriteKey(f) === favoriteKey(item));

/** 入っていなければ先頭に足し、入っていれば外す。保存後の一覧を返す */
export function toggleFavorite(item: FavoriteItem): FavoriteItem[] {
  const rest = loadFavorites().filter((f) => favoriteKey(f) !== favoriteKey(item));
  return save(isFavorite(item) ? rest : [item, ...rest].slice(0, MAX));
}

export const removeFavorite = (item: FavoriteItem): FavoriteItem[] => save(loadFavorites().filter((f) => favoriteKey(f) !== favoriteKey(item)));
