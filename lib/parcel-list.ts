// 謄本・公図を取るときの地番の一覧（法務局の窓口・登記情報提供サービスに、所在と地番を1筆ずつ写せるよう1行に1筆）。
// 中身は結果の文面（lib/summary.ts）の地番の欄と同じ考え方：物件の筆、隣の筆（境界が接している筆）、注意と出典。
// 住所の地点の筆（住所で調べたとき）は物件の筆とは限らないので、その旨を添える。法的な判断はしない
import type { LookupResult } from "./roadmap";
import { parcelCreditLine } from "./roadmap/kozu-data";
import { estimatedNote, type Estimated } from "./roadmap/parcel";
import { SANKO_NOTE } from "./roadmap/sanko-data";

type Ok = Extract<LookupResult, { status: "ok" }>;

/** 結果の文面・下書きと同じ形の筆の入力（components/result-view.tsx の loaded） */
export type ParcelListInput = {
  /** 物件の筆（「千代田区三番町 2-1」。地番の無い道路・水路なら無し） */
  target?: string;
  /** 隣の筆（境界が接している筆。登記の地番） */
  neighbors: string[];
  /** 住所の地点の筆（参考）か */
  reference: boolean;
  /** 住所の地点の筆が、隣地のとても多い筆（道路など物件の外の土地の可能性） */
  offLot?: boolean;
  estimated?: Estimated;
  sanko?: string;
};

/** 法務局・登記情報提供サービスでの指定の仕方（文の最後に添える） */
export const PARCEL_LIST_HOWTO = "法務局の窓口・登記情報提供サービスでは、所在（市区町村・町名）と地番を1筆ずつ指定します。地番は「2-1」のように枝番まで。";

export function parcelListText(result: Ok, parcels: ParcelListInput | undefined): string {
  const lines = [`【謄本・公図を取るときの地番】${result.matchedAddress.normalize("NFKC")}`];
  if (!parcels || (!parcels.target && !parcels.neighbors.length)) {
    lines.push("この場所の筆は、地図データの中に見つかりませんでした。市町村の地番図（参考図）か法務局の窓口で、地番を確かめてください。");
    return lines.join("\n");
  }
  const note = parcels.offLot
    ? "住所の地点にある筆（参考）。隣地がとても多く、道路など物件の外の土地の可能性があるので、公図で物件の筆を確かめてください"
    : parcels.reference
      ? "住所の地点にある筆（参考）。住居表示と地番は別のものなので、公図で物件の筆を確かめてください"
      : undefined;
  lines.push("", "■ 物件の筆");
  lines.push(parcels.target ? `${parcels.target}${parcels.estimated ? "（推定の位置）" : parcels.sanko ? "（地番参考図）" : ""}` : "地番なし（道路・水路など）");
  if (note) lines.push(`※${note}`);
  if (parcels.neighbors.length) {
    lines.push("");
    // 住所の地点の筆が道路などの可能性があるときは、その筆の隣地（道沿いの筆）を物件の隣地として並べない
    if (parcels.offLot) lines.push(`■ 隣の筆：省略（この筆に接する筆は${parcels.neighbors.length}筆。公図で物件の筆を確かめてから、隣地を調べてください）`);
    else lines.push(`■ 隣の筆（境界が接している筆・${parcels.neighbors.length}筆）`, ...parcels.neighbors);
  }
  lines.push("", `※${PARCEL_LIST_HOWTO}`);
  if (parcels.estimated) lines.push(`※筆の位置は公図から推定したもの（${estimatedNote(parcels.estimated)}）。`);
  if (parcels.sanko) lines.push(`※${SANKO_NOTE}。`);
  lines.push(`※${parcelCreditLine(!!parcels.estimated, parcels.sanko)}。`);
  return lines.join("\n");
}
