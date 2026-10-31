// 結果パネルの詳細（一覧 → 詳細）を、ブラウザの履歴＝端末の「戻る」につなぐ。
// 詳細を開くと同じURLのまま履歴をひとつ積み、「戻る」を押すと詳細だけ閉じて一覧に戻る（検索し直さない）。
// ホームから何画面進んだか（depth）は、これまでどおり結果と詳細の分も数える。

export type NavState = { depth?: number; detail?: boolean } | null | undefined;

/** ホームから何画面進んだところか（pushState で積んだ数） */
export const depthOf = (s: NavState): number => (typeof s?.depth === "number" ? s.depth : 0);

/** 詳細を開いたとき積む履歴の状態（ホームから1画面深くなり、詳細の印を付ける） */
export const detailState = (cur: NavState): Record<string, unknown> => ({ ...(cur ?? {}), depth: depthOf(cur) + 1, detail: true });

/** 結果を積む・置き換えるときの状態（詳細の印は引き継がない）。depth：積むなら今より1深く、置き換えるなら今のまま */
export const resultState = (cur: NavState, push: boolean): Record<string, unknown> => ({
  ...(cur ?? {}),
  depth: depthOf(cur) + (push ? 1 : 0),
  detail: false,
});

/** 詳細の印だけ外した状態（印が付いた履歴に、詳細を出さずに着いたとき） */
export const withoutDetail = (cur: NavState): Record<string, unknown> => ({ ...(cur ?? {}), detail: false });

/**
 * ホームへ戻るとき、履歴をいくつ戻すか。0 なら履歴は戻さず、いまの画面をホームに置き換える
 * （最初の画面が結果で、戻る先のホームの履歴が無いとき。詳細の履歴が積まれていても、その分は数えずに判断する）
 */
export function stepsToHome(depth: number, detailOpen: boolean): number {
  const resultDepth = detailOpen ? depth - 1 : depth;
  return resultDepth > 0 ? depth : 0;
}

/**
 * popstate（戻る・進む）の扱い。
 * - skip：画面の「戻る」ボタンで自分が history.back() した分。何もしない
 * - close-detail：詳細を出している最中の端末の「戻る」。詳細（と、その上の地図）だけ閉じる。検索し直さない
 * - normalize：詳細の印が付いた履歴に、詳細を出さずに着いた（進む・再読み込み）。印だけ外し、画面はそのまま
 * - navigate：それ以外。従来どおり URL から調べ直す・ホームへ
 */
export type PopDecision = "skip" | "close-detail" | "normalize" | "navigate";

export function decidePop(i: { skip: boolean; detailOpen: boolean; state: NavState }): PopDecision {
  if (i.skip) return "skip";
  if (i.detailOpen) return "close-detail";
  if (i.state?.detail) return "normalize";
  return "navigate";
}
