// 調べた結果を、メモや報告にそのまま貼れる文章にする
import type { LookupResult } from "./roadmap";
import { chibanLabel, kuikiLabel } from "./roadmap/parcel";
import { PARCEL_CREDIT } from "./roadmap/parcel-data";
import type { NearbyRoad } from "./roadmap/road-read";
import { zoningRows, type Zoning, type ZoningStatus } from "./roadmap/zoning";
import { ZONING_CREDIT } from "./roadmap/zoning-data";

const COVERAGE_SHORT = { full: "ネットで全種別が分かる", partial: "ネットで分かるのは一部", none: "ネット非公開（窓口で確認）", outside: "都市計画区域外（窓口で確認）" } as const;

/**
 * zoning：地点の都市計画、parcels：謄本・公図用の「所在 地番」の行（物件の筆と隣の筆。reference は住所の地点の筆で参考）、
 * roads：市の地図データで読んだ、物件のまわりの道路の種別。読み込めていれば添える
 */
export function buildSummary(
  result: Extract<LookupResult, { status: "ok" }>,
  {
    zoning,
    parcels,
    roads,
  }: { zoning?: { zoning: Zoning; st?: ZoningStatus }; parcels?: { target?: string; neighbors: string[]; reference: boolean }; roads?: NearbyRoad[] } = {},
): string {
  const m = result.municipality;
  const p = result.parcel;
  const lines = [`【道路種別の確認先】${result.matchedAddress}${p && !result.picked ? ` ${chibanLabel(p.chibanRaw)}` : " 付近"}`];
  // 地図で選んだ地点・地番で探した筆は、その地点を地理院地図で開けるようにする
  if (result.picked || p) lines.push(`${result.picked ? "地図で選んだ地点" : "筆の位置"}：https://maps.gsi.go.jp/#18/${result.lat.toFixed(6)}/${result.lng.toFixed(6)}/`);
  if (p && result.picked) lines.push(`この地点の筆：${chibanLabel(p.chibanRaw)}（${kuikiLabel(p.kuiki)}）`);
  lines.push(`${m.pref}${m.name}：${COVERAGE_SHORT[m.coverage]}`);
  for (const l of result.links) lines.push(`・${l.label}${l.pinpoint ? "" : "（地図内で住所検索）"}\n  ${l.url}`);
  if (roads?.length) {
    lines.push("【物件のまわりの道路（市の地図データ・参考）】");
    for (const r of roads) lines.push(`・${r.direction === "地点上" ? "地点の上" : `${r.direction} 約${Math.max(1, Math.round(r.distance))}m`}：${r.label}${r.width ? `（幅員 ${r.width}）` : ""}`);
  }
  const c = result.contact;
  if (c) {
    const dept = /^(東京都|\S{2,3}県)\s/.test(c.dept) ? c.dept : `${m.name} ${c.dept}`;
    lines.push(`・窓口：${dept}${c.phone ? ` ${c.phone}` : ""}${c.noPhoneInquiry ? "（道路種別は電話不可・窓口で確認）" : ""}`);
  }
  if (zoning) {
    lines.push("【都市計画（参考）】");
    for (const r of zoningRows(zoning.zoning, zoning.st)) lines.push(`・${r.label}：${r.value}`);
    if (zoning.st?.asOf) lines.push(`  （${zoning.st.city}のデータは${zoning.st.asOf}時点）`);
  }
  const withParcels = !!parcels && (!!parcels.target || parcels.neighbors.length > 0);
  if (parcels && withParcels) {
    lines.push(`【謄本・公図用の地番${parcels.reference ? "（住所の地点の筆・参考）" : ""}】`);
    if (parcels.target) lines.push(`・物件：${parcels.target}`);
    if (parcels.neighbors.length) lines.push(`・隣地：${parcels.neighbors.join("、")}`);
  }
  lines.push("※地図は参考図。最終確認は窓口で。");
  if (p || withParcels) lines.push(`※筆の${PARCEL_CREDIT}。`);
  if (zoning) lines.push(`※都市計画の${ZONING_CREDIT}。`);
  return lines.join("\n");
}
