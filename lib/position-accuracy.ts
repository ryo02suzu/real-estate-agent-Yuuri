// 結果の位置の目安（スマホの結果パネルの最初に出す）。住所の一致・町の中心・公図から推定した筆・地図で選んだ地点を区別する。
// 「ここが物件の場所」と断定しない（番地までは一致しないことがある）。
import type { LookupResult } from "./roadmap";

type Ok = Extract<LookupResult, { status: "ok" }>;

export type Accuracy = {
  label: string;
  /** 注意して見てほしい（町の中心・推定）。位置のずれを直す「場所を直す」を促す */
  warn: boolean;
};

export function positionAccuracy(r: Pick<Ok, "approximate" | "picked" | "parcel">): Accuracy {
  // 番地が見つからず、町・大字の代表点を出しているとき
  if (r.approximate) return { label: "町の中心", warn: true };
  // 地図で選んだ地点（その地点の筆は参考）
  if (r.picked) return { label: "地図で選んだ地点", warn: false };
  // 地番で探した筆。公図から位置を推定した筆は「推定」
  if (r.parcel) {
    if (r.parcel.estimated) return { label: r.parcel.estimated === "low" ? "推定（確度低）" : "推定", warn: true };
    return { label: "地番で探した筆", warn: false };
  }
  // 住所の一致。番地までは一致しないことがあるので「付近」
  return { label: "付近", warn: false };
}
