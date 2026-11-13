// 書類・出力のページに出す、いま開いている物件の調査の状態（要注意点の見出し・次にやることの残り・あなたの確認の記録の数・
// 読み込み中のデータ）。物件の画面（components/app/mobile-app.tsx の PropertyView）が入れ、書類・出力のページ
// （components/app/docs.tsx）が読む。物件の画面はほかのページを見ている間も残っているので、ページを切り替えても状態は残る。
// 端末の外には出さない（メモリの中だけ）
import { useSyncExternalStore } from "react";

export type DocStatus = {
  /** 物件の鍵（lib/favorites.ts の favoriteKey） */
  key: string;
  /** 「要注意 2件・要確認 5件」「確認中」（lib/app/triage.ts の headline） */
  headline: string;
  /** まだ読んでいるデータの名前 */
  pending: string[];
  /** 読めなかったデータの名前 */
  failed: string[];
  /** 次にやることの残りと全部 */
  actionsLeft: number;
  actionsTotal: number;
  /** あなたの確認の記録（確認済みにした確認事項の数） */
  records: number;
};

let current: DocStatus | undefined;
const listeners = new Set<() => void>();

/** 物件の画面が、いまの状態を入れる（閉じるときは undefined） */
export function publishDocStatus(s: DocStatus | undefined): void {
  current = s;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const read = () => current;

/** その物件の状態（物件の画面が入れたものと鍵が合うときだけ）。サーバーで描くときは何も入っていない（物件の画面はサーバーでは描かない） */
export function useDocStatus(key: string | undefined): DocStatus | undefined {
  const s = useSyncExternalStore(subscribe, read, read);
  return key && s && s.key === key ? s : undefined;
}

/** 名前は2つまで並べ、残りは数で（幅の狭い画面で1行に収まるように） */
const few = (names: string[]) => (names.length > 2 ? `${names.slice(0, 2).join("・")} ほか${names.length - 2}` : names.join("・"));

/** カードの物件の名前の下の1行：「やること あと8件・確認の記録 3件・読み込み中（地価）」 */
export function docStatusLine(s: DocStatus): string {
  const parts = [s.actionsTotal && !s.actionsLeft ? "やること すべて済み" : `やること あと${s.actionsLeft}件`, `確認の記録 ${s.records}件`];
  if (s.pending.length) parts.push(`読み込み中（${few(s.pending)}）`);
  else if (s.failed.length) parts.push(`読めなかったデータ：${few(s.failed)}`);
  return parts.join("・");
}

/** 「要注意点と次にやること」のボタンの説明（状態が分かればその見出し） */
export function docMainSub(s: DocStatus | undefined): string {
  return s ? s.headline : "問題になりそうな所と、確かめる窓口";
}
