// 調べた結果を、メモや報告にそのまま貼れる文章にする
import type { LookupResult } from "./roadmap";
import { buildingSummary, type BuildingResult } from "./roadmap/building";
import { BUILDING_CREDIT } from "./roadmap/building-data";
import { GROUND_NOTE, groundMaps, groupHazardMaps, HAZARD_CREDIT, HAZARD_MAP_LABELS, hazardRows, wagamachiUrl, type Elevation, type HazardMaps, type HazardReport } from "./roadmap/hazard";
import { asOfText, changeText, distanceText, kindText, priceText, type LandPriceHit } from "./roadmap/land-price";
import { LAND_PRICE_CREDIT } from "./roadmap/land-price-data";
import { schoolCredit, schoolLine, type Schools } from "./roadmap/school";
import { SCHOOL_DATA } from "./roadmap/school-data";
import { POI_SOURCES, poiLine, type PoiWalk } from "./roadmap/poi";
import { ROAD_CREDIT, STATION_CREDIT, stationLine, type StationWalk } from "./roadmap/walk";
import { KOZU_CREDIT } from "./roadmap/kozu-data";
import { rosenkaLinks } from "./roadmap/rosenka";
import { SANKO_NOTE, sankoCredit } from "./roadmap/sanko-data";
import { chibanLabel, estimatedNote, kuikiLabel, neighborList, parcelMark, type Estimated } from "./roadmap/parcel";
import { PARCEL_CREDIT } from "./roadmap/parcel-data";
import type { NearbyRoad } from "./roadmap/road-read";
import { CHIBANZU_NOTE, chibanzuFor } from "./roadmap/chibanzu";
import { HOUREI_CREDIT, HOUREI_SHORT, houreiGroups, houreiLine, houreiNotesLine, type Hourei } from "./roadmap/hourei";
import { TOCHI_CREDIT, tochiCheck, tochiLine, type Tochi } from "./roadmap/tochi";
import { isekiFor, isekiLine } from "./roadmap/iseki";
import { suidoFor } from "./roadmap/suido";
import { contactName, noContactText, UTILITIES_CHECKED, utilitiesFor } from "./roadmap/utilities";
import { MORIDO_CREDIT, moridoLine, type Morido } from "./roadmap/morido";
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
    pois,
  }: {
    zoning?: { zoning: Zoning; st?: ZoningStatus; morido?: Morido; hourei?: Hourei; tochi?: Tochi };
    parcels?: { target?: string; neighbors: string[]; reference: boolean; offLot?: boolean; estimated?: Estimated; sanko?: string };
    roads?: NearbyRoad[];
    hazard?: { report: HazardReport; elevation: Elevation | null; maps: HazardMaps; muniCd: string };
    building?: BuildingResult;
    landPrice?: LandPriceHit[];
    schools?: Schools;
    stations?: StationWalk[];
    pois?: PoiWalk[];
  } = {},
): string {
  const m = result.municipality;
  const p = result.parcel;
  const lines = [`【道路種別の確認先】${result.matchedAddress}${p && !result.picked ? ` ${chibanLabel(p.chibanRaw)}${parcelMark(p)}` : " 付近"}`];
  // 地図で選んだ地点・地番で探した筆は、その地点を地理院地図で開けるようにする
  if (result.picked || p) lines.push(`${result.picked ? "地図で選んだ地点" : "筆の位置"}：https://maps.gsi.go.jp/#18/${result.lat.toFixed(6)}/${result.lng.toFixed(6)}/`);
  if (p && result.picked) lines.push(`この地点の筆：${chibanLabel(p.chibanRaw)}（${kuikiLabel(p.kuiki)}）${parcelMark(p)}`);
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
    if (zoning.morido) lines.push(`・盛土規制法：${moridoLine(zoning.morido)}`);
    if (zoning.hourei) {
      lines.push(`・砂防・急傾斜地など：${houreiLine(zoning.hourei)}`);
      for (const g of houreiGroups(zoning.hourei.hits)) lines.push(`  （${HOUREI_SHORT[g.kind]}：${g.text}）`);
    }
    if (zoning.tochi) {
      const check = tochiCheck(zoning.tochi, m.name);
      lines.push(`・自然公園・農業振興地域・森林：${tochiLine(zoning.tochi)}（${zoning.tochi.year}年度の国のデータ・参考）`);
      if (check) lines.push(`  （${check}）`);
    }
  }
  // 埋蔵文化財の確認先（都県・市の遺跡地図と教育委員会）。都市計画が読めなくても出す
  const iseki = isekiFor(m, result.lat, result.lng);
  lines.push(`【埋蔵文化財】${isekiLine(iseki)}${iseki.map ? `\n  ${iseki.map.url}` : ""}`);
  // 上下水道の台帳の地図（公開している市町村だけ）
  const ledgers = suidoFor(m, result.lat, result.lng);
  if (ledgers.length) {
    lines.push("【上下水道の台帳（市区町村の地図・参考）】");
    for (const l of ledgers) lines.push(`・${l.name}\n  ${l.url}`);
  }
  // 水道・下水道・都市ガスの照会先（調べた市区町村だけ）
  const u = utilitiesFor(m);
  if (u) {
    lines.push(`【上下水道・ガスの照会先（${UTILITIES_CHECKED}時点）】`);
    for (const [what, kind, list] of [["水道", "上水道", u.water], ["下水道", "下水道", u.sewer], ["都市ガス", "ガス", u.gas]] as const) {
      if (!list) continue;
      if (!list.length) lines.push(`・${what}：${noContactText(kind)}`);
      for (const c of list) lines.push(`・${what}：${contactName(c)}${c.how ? `（${c.how}）` : ""}\n  ${c.url}`);
    }
  }
  if (hazard) {
    lines.push("【災害リスク（国のデータ・参考）】");
    for (const r of hazardRows(hazard.report, hazard.elevation)) lines.push(`・${r.label}：${r.value}`);
    const groups = groupHazardMaps(hazard.maps);
    for (const g of groups) lines.push(`・${m.name}の${g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}のハザードマップ\n  ${g.url}`);
    if (!groups.length) lines.push(`・${m.name}のハザードマップ（わがまちハザードマップ）\n  ${wagamachiUrl(hazard.muniCd)}`);
    // 大規模盛土造成地・液状化の発生傾向は、国の重ねるハザードマップを物件の場所で開く
    for (const g of groundMaps(result.lat, result.lng)) lines.push(`・${g.label}（国の重ねるハザードマップ）\n  ${g.url}`);
    lines.push(`  （${GROUND_NOTE}）`);
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
  // 路線価（相続税・固定資産税）は、全国地価マップを物件の場所で開く
  lines.push("【路線価（全国地価マップ・参考）】");
  for (const l of rosenkaLinks(result.lat, result.lng)) lines.push(`・${l.name}\n  ${l.url}`);
  if (stations?.length) {
    lines.push("【最寄り駅（徒歩の目安・道路距離 80m を1分）】");
    for (const s of stations) lines.push(`・${stationLine(s)}`);
  }
  if (pois?.length) {
    lines.push("【周辺施設（徒歩の目安・道路距離 80m を1分）】");
    for (const w of pois) lines.push(`・${poiLine(w)}`);
  }
  if (schools?.elementary || schools?.junior) {
    lines.push(`【学区（参考・${SCHOOL_DATA.edition}のデータ）】`);
    if (schools.elementary) lines.push(`・小学校：${schoolLine(schools.elementary)}`);
    if (schools.junior) lines.push(`・中学校：${schoolLine(schools.junior)}`);
  }
  const withParcels = !!parcels && (!!parcels.target || parcels.neighbors.length > 0);
  if (parcels && withParcels) {
    lines.push(`【謄本・公図用の地番${parcels.offLot ? "（住所の地点の筆・参考。道路など物件の外の土地の可能性）" : parcels.reference ? "（住所の地点の筆・参考）" : ""}${parcels.estimated ? `（公図から推定した位置・${estimatedNote(parcels.estimated)}）` : parcels.sanko ? `（地番参考図・${SANKO_NOTE}）` : ""}】`);
    if (parcels.target) lines.push(`・物件：${parcels.target}`);
    if (parcels.neighbors.length) lines.push(`・隣地：${neighborList(parcels.neighbors)}`);
  }
  // 市町村の地番図（物件の場所で開く URL）。地図データに筆が無いときの確認先にもなる
  const chibanzu = chibanzuFor(m, result.lat, result.lng);
  if (chibanzu) lines.push(`【地番の参考図】${chibanzu.name}：${chibanzu.url}`, `  （${CHIBANZU_NOTE}）`);
  lines.push("※地図は参考図。最終確認は窓口で。");
  if (p || withParcels) lines.push(`※筆の${PARCEL_CREDIT}。`);
  if (p?.estimated || parcels?.estimated) lines.push(`※${KOZU_CREDIT}。`);
  const sanko = p?.sanko ?? parcels?.sanko;
  if (sanko) lines.push(`※参考図の筆の${sankoCredit(sanko)}。`);
  if (zoning) lines.push(`※都市計画の${ZONING_CREDIT}。`);
  if (zoning?.morido) lines.push(`※盛土規制法の区域の${MORIDO_CREDIT}。概略の区域で、重要事項説明には${zoning.morido.authority}の資料で確認を。`);
  if (zoning?.tochi) lines.push(`※自然公園・農業振興地域・森林の${TOCHI_CREDIT}。縮尺約1/5万の概略の区域。`);
  const hr = zoning?.hourei;
  if (hr) {
    lines.push(`※砂防指定地などの区域の${HOUREI_CREDIT}。概略の区域で、重要事項説明には指定した都県・市の資料で確認を。`);
    // 都県が利用条件で求める特記事項（区域外と書くときも、データの時点などを添える）
    const notes = houreiNotesLine(hr.pref);
    if (notes) lines.push(`※${notes}`);
  }
  lines.push(`※遺跡地図は包蔵地の概要を示すもの。包蔵地（遺跡）に入るかは${iseki.office}で確認を。`);
  if (hazard) lines.push(`※災害リスクの${HAZARD_CREDIT}。`);
  if (hit) lines.push(`※建物の${BUILDING_CREDIT}。`);
  if (prices.length) lines.push(`※地価の${LAND_PRICE_CREDIT}。物件そのものの価格ではありません。`);
  if (schools?.elementary || schools?.junior) lines.push(`※学区の${schoolCredit(schools)}。学区は見直されることがあります。指定校は教育委員会で確認を。`);
  if (stations?.length) lines.push(`※駅の${STATION_CREDIT}。駅の出入口までではないので、広告には実際の道路距離で。`);
  if (pois?.length)
    lines.push(`※周辺施設は${POI_SOURCES}を加工して作成${stations?.length ? "" : `。${ROAD_CREDIT}`}。施設の位置までの目安なので、広告には実際の道路距離と、施設が今もあるかを確かめて。`);
  return lines.join("\n");
}
