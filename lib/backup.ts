// 調査記録の書き出し・読み込み：履歴・お気に入り・確認の記録・済んだ印を1つのファイル（JSON）にまとめる。
// 機種変更や Safari のデータ削除に備える。読み込みは足すだけ（上書きしない。同じ物件・同じ確認事項は新しい方を残す）。
// ファイルは端末の中で作り、共有シート・ダウンロードで保存する。サーバーには送らない
import { exportChecklist, mergeChecklist } from "./checklist";
import { loadFavorites, mergeFavorites, type FavoriteItem } from "./favorites";
import { loadHistory, mergeHistory, type HistoryItem } from "./history";
import { allRecords, mergeRecords, type PropertyRecords } from "./records";

export type Bundle = {
  app: "michilu";
  version: 1;
  exportedAt: string;
  history: HistoryItem[];
  favorites: FavoriteItem[];
  records: PropertyRecords[];
  checklist: Record<string, { done: string[]; at: number }>;
};

export function makeBundle(now = new Date()): Bundle {
  return { app: "michilu", version: 1, exportedAt: now.toISOString(), history: loadHistory(), favorites: loadFavorites(), records: allRecords(), checklist: exportChecklist() };
}

/** ファイルの名前（michilu-記録-2026-10-25.json） */
export function bundleFileName(now = new Date()): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return `michilu-記録-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export type BundleSummary = { ok: true; exportedAt: string; history: number; favorites: number; records: number; first: string[] } | { ok: false; reason: string };

/** 読み込む前に中身を確かめる（書き出した日時・件数・最初の3件の住所） */
export function bundleSummary(text: string): BundleSummary {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, reason: "JSON のファイルではありません" };
  }
  if (!v || typeof v !== "object" || (v as { app?: unknown }).app !== "michilu") return { ok: false, reason: "MICHILU が書き出したファイルではありません" };
  const b = v as Partial<Bundle>;
  const history = Array.isArray(b.history) ? b.history : [];
  const favorites = Array.isArray(b.favorites) ? b.favorites : [];
  const records = Array.isArray(b.records) ? b.records : [];
  // 最初の3件の住所（履歴と記録で同じ住所は1つに）
  const first = [...new Set([...history.map((h) => h?.address), ...records.map((r) => r?.label)].filter((s): s is string => typeof s === "string" && !!s))].slice(0, 3);
  return { ok: true, exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "", history: history.length, favorites: favorites.length, records: records.length, first };
}

/** 最後に書き出した日時を覚える鍵（右上のメニュー（≡）の「最後の書き出し」に出す。端末の中だけ。書き出すファイルには入れない） */
const EXPORTED_KEY = "michilu:exported-at";
/** 書き出したとき window に出す合図（開いているメニューが「最後の書き出し」を読み直す） */
export const EXPORTED_EVENT = "michilu:exported";

/** 書き出した（共有シートで渡した・ダウンロードした）ことを覚える */
export function noteExported(now = Date.now()): void {
  try {
    localStorage.setItem(EXPORTED_KEY, String(now));
  } catch {
    // 覚えられなくても、書き出しはできている
  }
  if (typeof dispatchEvent === "function") dispatchEvent(new Event(EXPORTED_EVENT));
}

/** 最後に書き出した日時（ミリ秒）。まだ書き出していない・読めないときは null */
export function lastExported(): number | null {
  try {
    const v = Number(localStorage.getItem(EXPORTED_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** 足す（上書きしない）。足した数を返す */
export function importBundle(text: string): { ok: boolean; added: { history: number; favorites: number; records: number; checklist: number } } {
  const s = bundleSummary(text);
  if (!s.ok) return { ok: false, added: { history: 0, favorites: 0, records: 0, checklist: 0 } };
  const b = JSON.parse(text) as Partial<Bundle>;
  const history = mergeHistory(Array.isArray(b.history) ? b.history : []);
  const favorites = mergeFavorites(Array.isArray(b.favorites) ? b.favorites : []);
  const records = mergeRecords(Array.isArray(b.records) ? b.records : []).added;
  const checklist = mergeChecklist(b.checklist && typeof b.checklist === "object" ? b.checklist : {});
  return { ok: true, added: { history, favorites, records, checklist } };
}
