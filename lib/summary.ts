// 調べた結果を、メモや報告にそのまま貼れる文章にする
import type { LookupResult } from "./roadmap";
import { buildingSummary, type BuildingResult } from "./roadmap/building";
import { BUILDING_CREDIT } from "./roadmap/building-data";
import { groupHazardMaps, HAZARD_CREDIT, HAZARD_MAP_LABELS, hazardRows, wagamachiUrl, type Elevation, type HazardMaps, type HazardReport } from "./roadmap/hazard";
import { asOfText, changeText, distanceText, kindText, priceText, type LandPriceHit } from "./roadmap/land-price";
import { LAND_PRICE_CREDIT } from "./roadmap/land-price-data";
import { schoolCredit, schoolLine, type Schools } from "./roadmap/school";
import { SCHOOL_DATA } from "./roadmap/school-data";
import { STATION_CREDIT, stationLine, type StationWalk } from "./roadmap/walk";
import { KOZU_CREDIT } from "./roadmap/kozu-data";
import { chibanLabel, estimatedMark, estimatedNote, kuikiLabel, type Estimated } from "./roadmap/parcel";
import { PARCEL_CREDIT } from "./roadmap/parcel-data";
import type { NearbyRoad } from "./roadmap/road-read";
import { zoningRows, type Zoning, type ZoningStatus } from "./roadmap/zoning";
import { ZONING_CREDIT } from "./roadmap/zoning-data";

const COVERAGE_SHORT = { full: "ネットで全種別が分かる", partial: "ネットで分かるのは一部", none: "ネット非公開（窓口で確認）", outside: "都市計画区域外（窓口で確認）" } as const;

/**
 * zoning：地点の都市計画、parcels：謄本・公図用の「所在 地番」の行（物件の筆と隣の筆。reference は住所の地点の筆で参考）、
 * roads：市の地図データで読んだ、物件のまわりの道路の種別、hazard：国のハザードマップのデータで読んだ地点の災害リスクと、
 * 市区町村のハザードマップのページ、landPrice：近くの地価公示・地価調査の地点（近い順）、schools：地点の小学校区・中学校区。
 * 読み込めていれば添える
 */
export function buildSummary(
  result: Extract<LookupResult, { status: "ok" }>,
  {
    zoning,
    parcels,
    roads,
    hazard,
    building,
    landPrice,
    schools,
    stations,
  }: {
    zoning?: { zoning: Zoning; st?: ZoningStatus };
    parcels?: { target?: string; neighbors: string[]; reference: boolean; estimated?: Estimated };
    roads?: NearbyRoad[];
    hazard?: { report: HazardReport; elevation: Elevation | null; maps: HazardMaps; muniCd: string };
    building?: BuildingResult;
    landPrice?: LandPriceHit[];
    schools?: Schools;
    stations?: StationWalk[];
  } = {},
): string {
  const m = result.municipality;
  const p = result.parcel;
  const lines = [`【道路種別の確認先】${result.matchedAddress}${p && !result.picked ? ` ${chibanLabel(p.chibanRaw)}${estimatedMark(p)}` : " 付近"}`];
  // 地図で選んだ地点・地番で探した筆は、その地点を地理院地図で開けるようにする
  if (result.picked || p) lines.push(`${result.picked ? "地図で選んだ地点" : "筆の位置"}：https://maps.gsi.go.jp/#18/${result.lat.toFixed(6)}/${result.lng.toFixed(6)}/`);
  if (p && result.picked) lines.push(`この地点の筆：${chibanLabel(p.chibanRaw)}（${kuikiLabel(p.kuiki)}）${estimatedMark(p)}`);
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
  if (hazard) {
    lines.push("【災害リスク（国のデータ・参考）】");
    for (const r of hazardRows(hazard.report, hazard.elevation)) lines.push(`・${r.label}：${r.value}`);
    const groups = groupHazardMaps(hazard.maps);
    for (const g of groups) lines.push(`・${m.name}の${g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}のハザードマップ\n  ${g.url}`);
    if (!groups.length) lines.push(`・${m.name}のハザードマップ（わがまちハザードマップ）\n  ${wagamachiUrl(hazard.muniCd)}`);
  }
  const hit = building?.hit;
  if (hit) lines.push(`【建物（PLATEAU・参考）】${buildingSummary(hit.building)}${hit.building.height ? `・高さ約${hit.building.height.toFixed(1)}m` : ""}`);
  // 近くの地価（共有の文面は3地点まで）
  const prices = (landPrice ?? []).slice(0, 3);
  if (prices.length) {
    lines.push("【近くの地価（標準地・基準地の価格・参考）】");
    for (const h of prices)
      lines.push(`・${kindText(h.kind)} ${h.no}（${h.usage}・${h.bearing}へ${distanceText(h.distance)}）：${priceText(h.price)}（前年比 ${changeText(h.change)}、${asOfText(h)}）`);
  }
  if (stations?.length) {
    lines.push("【最寄り駅（徒歩の目安・道路距離 80m を1分）】");
    for (const s of stations) lines.push(`・${stationLine(s)}`);
  }
  if (schools?.elementary || schools?.junior) {
    lines.push(`【学区（参考・${SCHOOL_DATA.edition}のデータ）】`);
    if (schools.elementary) lines.push(`・小学校：${schoolLine(schools.elementary)}`);
    if (schools.junior) lines.push(`・中学校：${schoolLine(schools.junior)}`);
  }
  const withParcels = !!parcels && (!!parcels.target || parcels.neighbors.length > 0);
  if (parcels && withParcels) {
    lines.push(`【謄本・公図用の地番${parcels.reference ? "（住所の地点の筆・参考）" : ""}${parcels.estimated ? `（公図から推定した位置・${estimatedNote(parcels.estimated)}）` : ""}】`);
    if (parcels.target) lines.push(`・物件：${parcels.target}`);
    if (parcels.neighbors.length) lines.push(`・隣地：${parcels.neighbors.join("、")}`);
  }
  lines.push("※地図は参考図。最終確認は窓口で。");
  if (p || withParcels) lines.push(`※筆の${PARCEL_CREDIT}。`);
  if (p?.estimated || parcels?.estimated) lines.push(`※${KOZU_CREDIT}。`);
  if (zoning) lines.push(`※都市計画の${ZONING_CREDIT}。`);
  if (hazard) lines.push(`※災害リスクの${HAZARD_CREDIT}。`);
  if (hit) lines.push(`※建物の${BUILDING_CREDIT}。`);
  if (prices.length) lines.push(`※地価の${LAND_PRICE_CREDIT}。物件そのものの価格ではありません。`);
  if (schools?.elementary || schools?.junior) lines.push(`※学区の${schoolCredit(schools)}。学区は見直されることがあります。指定校は教育委員会で確認を。`);
  if (stations?.length) lines.push(`※駅の${STATION_CREDIT}。駅の出入口までではないので、広告には実際の道路距離で。`);
  return lines.join("\n");
}
