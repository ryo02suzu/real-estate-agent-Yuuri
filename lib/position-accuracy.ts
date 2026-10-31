// 結果の位置の目安（スマホの結果パネルの最初に出す）。住所の一致・町の中心・公図から推定した筆・地図で選んだ地点を区別する。
// 「ここが物件の場所」と断定しない（番地までは一致しないことがある）。
// 同じ目安から、スマホの日本地図のカメラの寄り具合とピンの形も決める（pointView。components/japan-map.tsx）。
import type { LookupResult } from "./roadmap";
import { estimatedNote } from "./roadmap/parcel";

type Ok = Extract<LookupResult, { status: "ok" }>;

/**
 * address：住所の一致（番地までは一致しないことがある）／town：番地が見つからず町・大字の代表点／picked：地図で選んだ地点／
 * parcel：地番で探した筆（登記所の地図データ）／estimated・estimated-low：公図から位置を推定した筆
 */
export type AccuracyKind = "address" | "town" | "picked" | "parcel" | "estimated" | "estimated-low";

export type Accuracy = {
  kind: AccuracyKind;
  label: string;
  /** 注意して見てほしい（町の中心・推定）。位置のずれを直す「場所を直す」を促す */
  warn: boolean;
};

export function positionAccuracy(r: Pick<Ok, "approximate" | "picked" | "parcel">): Accuracy {
  // 番地が見つからず、町・大字の代表点を出しているとき
  if (r.approximate) return { kind: "town", label: "町の中心", warn: true };
  // 地図で選んだ地点（その地点の筆は参考）
  if (r.picked) return { kind: "picked", label: "地図で選んだ地点", warn: false };
  // 地番で探した筆。公図から位置を推定した筆は「推定」
  if (r.parcel) {
    if (r.parcel.estimated === "low") return { kind: "estimated-low", label: "推定（確度低）", warn: true };
    if (r.parcel.estimated) return { kind: "estimated", label: "推定", warn: true };
    return { kind: "parcel", label: "地番で探した筆", warn: false };
  }
  // 住所の一致。番地までは一致しないことがあるので「付近」
  return { kind: "address", label: "付近", warn: false };
}

/** 結果（ok・未対応の市町村）の位置の目安。未対応の市町村は住所の一致（付近）として扱う */
export function accuracyOf(r: LookupResult): Accuracy | null {
  if (r.status === "ok") return positionAccuracy(r);
  if (r.status === "unsupported") return { kind: "address", label: "付近", warn: false };
  return null;
}

/**
 * スマホの日本地図で、確定した地点を見せる寄り具合（MapLibre のズーム）とピン。
 * - 町の中心は、町の広がりが見える所まで引く（z14 は北緯36度で 375px 幅が約1.5km。番地の位置ではないので、寄りすぎない）
 * - 住所の一致は街区が見える z16（約360m）、筆・地図で選んだ地点は z17（約180m）
 * - 推定の筆のずれ（数m・5m前後）は z17 でも数px なので、引かずに、中抜きのピンと小さな札（「推定」）で見分けられるようにする
 * - 誤差の円・建物の範囲は描かない（データに無いので作らない）
 */
export type PointView = {
  zoom: number;
  pin: "solid" | "hollow";
  /** ピンの説明（読み上げ・長押し） */
  title: string;
  /** ピンの横の小さな札（注意して見てほしいときだけ） */
  tag?: string;
};

export type CameraTarget = { lat: number; lng: number; view: PointView };

/**
 * 新しい結果が出たときの地図のカメラ（スマホの日本地図）。key はカメラを寄せ直す合図。
 * - 確定した結果（ok・未対応の市町村）：その地点へ。key を増やす（同じ地点の調べ直しでも寄せ直す）
 * - 候補待ち・見つからない：カメラもピンも前のまま（key も増やさない。地図を動かして見ていても引き戻さない）
 * - 結果なし（ホーム）：日本全体（cam は null）
 */
export function nextCamera(prev: { cam: CameraTarget | null; key: number }, result: LookupResult | null): { cam: CameraTarget | null; key: number } {
  if (!result) return { cam: null, key: prev.key };
  const a = accuracyOf(result);
  if (!a || (result.status !== "ok" && result.status !== "unsupported")) return prev;
  return { cam: { lat: result.lat, lng: result.lng, view: pointView(a.kind) }, key: prev.key + 1 };
}

export function pointView(kind: AccuracyKind): PointView {
  switch (kind) {
    case "town":
      return { zoom: 14, pin: "hollow", title: "町の中心（番地が見つからず、町・大字の代表点を表示しています）", tag: "町の中心" };
    case "estimated":
      return { zoom: 17, pin: "hollow", title: `公図から推定した筆の位置（${estimatedNote("high")}）`, tag: "推定" };
    case "estimated-low":
      return { zoom: 17, pin: "hollow", title: `公図から推定した筆の位置（${estimatedNote("low")}）`, tag: "推定・確度低" };
    case "parcel":
      return { zoom: 17, pin: "solid", title: "地番で探した筆の位置" };
    case "picked":
      return { zoom: 17, pin: "solid", title: "地図で選んだ地点" };
    case "address":
      return { zoom: 16, pin: "solid", title: "検索した住所の付近（番地までは一致しないことがあります）" };
  }
}
