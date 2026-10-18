// 重要事項説明書・販売図面（物件概要）に書き写すための下書き。ミチルで調べた結果を、書類の欄の並びに並べ直す。
// どれも国・市のデータによる参考で、法令上の判断（再建築の可否など）はしない。分からない欄は「要確認」とし、確かめる先を添える
import type { LookupResult } from "./roadmap";
import { buildingSummary, type BuildingResult } from "./roadmap/building";
import { BUILDING_CREDIT } from "./roadmap/building-data";
import { groupHazardMaps, HAZARD_CREDIT, HAZARD_MAP_LABELS, hazardRows, wagamachiUrl, type Elevation, type HazardMaps, type HazardReport } from "./roadmap/hazard";
import { KOZU_CREDIT } from "./roadmap/kozu-data";
import { distanceText, kindText, priceText, type LandPriceHit } from "./roadmap/land-price";
import { LAND_PRICE_CREDIT } from "./roadmap/land-price-data";
import { chibanLabel, estimatedMark, estimatedNote, kuikiLabel, type Estimated } from "./roadmap/parcel";
import { PARCEL_CREDIT } from "./roadmap/parcel-data";
import type { NearbyRoad } from "./roadmap/road-read";
import { schoolCredit, schoolLine, type Schools } from "./roadmap/school";
import { lineLabel, STATION_CREDIT, type StationWalk } from "./roadmap/walk";
import { MORIDO_CREDIT, moridoCaution, moridoDetail, moridoValue, type Morido } from "./roadmap/morido";
import { zoningRows, type Zoning, type ZoningStatus } from "./roadmap/zoning";
import { ZONING_CREDIT } from "./roadmap/zoning-data";

/** 下書きの1行。check：役所・法務局・現地で確かめる必要がある（データが無い・参考にとどまる） */
export type DraftRow = { label: string; value: string; note?: string; check?: boolean };
export type DraftSection = { title: string; rows: DraftRow[] };

export type DraftInput = {
  zoning?: { zoning: Zoning; st?: ZoningStatus; morido?: Morido };
  parcels?: { target?: string; neighbors: string[]; reference: boolean; estimated?: Estimated };
  roads?: NearbyRoad[];
  hazard?: { report: HazardReport; elevation: Elevation | null; maps: HazardMaps; muniCd: string };
  building?: BuildingResult;
  landPrice?: LandPriceHit[];
  schools?: Schools;
  stations?: StationWalk[];
};

const CHECK = "要確認";

/** 重要事項説明書（法令上の制限・道路・災害）と販売図面（物件概要）の欄の並びの下書き */
export function buildDraft(result: Extract<LookupResult, { status: "ok" }>, { zoning, parcels, roads, hazard, building, landPrice, schools, stations }: DraftInput = {}): DraftSection[] {
  const m = result.municipality;
  const p = result.parcel;
  const found = p && !result.picked ? p : undefined;
  const sections: DraftSection[] = [];

  // 物件の表示
  const place: DraftRow[] = [
    {
      label: "所在（住所）",
      value: `${result.matchedAddress}${found ? "" : " 付近"}`,
      note: result.picked ? "地図で選んだ地点" : result.approximate ? "番地まで見つからず、町の中心の位置" : undefined,
      check: result.approximate,
    },
  ];
  if (found) place.push({ label: "所在（地番）", value: `${kuikiLabel(found.kuiki)} ${chibanLabel(found.chibanRaw).replace(/^地番 /, "")}${estimatedMark(found)}`, note: found.estimated ? `公図から推定した位置（${estimatedNote(found.estimated)}）` : undefined, check: !!found.estimated });
  else if (parcels?.target)
    place.push({
      label: "所在（地番）",
      value: `${parcels.target}${parcels.estimated ? "（推定）" : ""}`,
      note: parcels.reference ? "住所の地点にある筆（参考）。住居表示と地番は別のもの" : undefined,
      check: true,
    });
  else place.push({ label: "所在（地番）", value: CHECK, note: "登記・公図で確認", check: true });
  if (parcels?.neighbors.length) place.push({ label: "隣地の地番", value: parcels.neighbors.join("、"), note: "境界が接している筆（地図データから）" });
  place.push({ label: "緯度・経度", value: `${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}` });
  sections.push({ title: "物件の表示", rows: place });

  // 都市計画法・建築基準法に基づく制限
  const law: DraftRow[] = [];
  if (zoning) {
    for (const r of zoningRows(zoning.zoning, zoning.st)) {
      if (r.label === "建ぺい率・容積率") {
        const [bcr, far] = r.value.split(" ・ ");
        law.push({ label: "建ぺい率", value: r.value === "データなし" ? CHECK : `${bcr}（指定）`, check: r.value === "データなし" });
        law.push({ label: "容積率", value: r.value === "データなし" ? CHECK : `${far}（指定）`, note: "前面道路の幅による制限・角地の緩和は含まない", check: r.value === "データなし" });
        continue;
      }
      const missing = r.value === "データなし";
      law.push({ label: r.label === "区域" ? "区域区分" : r.label, value: missing ? CHECK : r.value, note: missing ? "市の都市計画図で確認" : r.sub, check: missing || r.warn });
    }
    if (zoning.st?.asOf) law.push({ label: "データの時点", value: `${zoning.st.city}：${zoning.st.asOf}` });
  } else law.push({ label: "用途地域など", value: CHECK, note: "都市計画のデータを読み込めませんでした。市の都市計画図で確認", check: true });
  // その他の法令：盛土規制法の区域（国のデータ。重要事項説明の根拠には使えないので、指定した都県・市の資料で確かめる）
  const md = zoning?.morido;
  if (md) {
    law.push({ label: "宅地造成及び特定盛土等規制法", value: `${moridoValue(md)}（国のデータ・参考）`, note: `${moridoDetail(md)}。${moridoCaution(md.authority)}`, check: true });
    if (md.link) law.push({ label: "盛土規制法の確認先", value: md.link.label, note: md.link.url });
  } else law.push({ label: "宅地造成及び特定盛土等規制法", value: CHECK, note: "区域を指定した都県・市（盛土規制法の担当課）で確認", check: true });
  sections.push({ title: "法令に基づく制限の概要（参考）", rows: law });

  // 敷地と道路との関係
  const road: DraftRow[] = [];
  if (roads?.length)
    for (const r of roads)
      road.push({
        label: r.direction === "地点上" ? "地点の上の道路" : `${r.direction}の道路（約${Math.max(1, Math.round(r.distance))}m）`,
        value: `${r.label}${r.width ? `・幅員 ${r.width}` : ""}`,
        check: true,
      });
  else road.push({ label: "道路の種別・幅員", value: CHECK, note: "市の道路種別の地図・窓口で確認", check: true });
  const map = result.links.find((l) => l.kind !== "public_road") ?? result.links[0];
  if (map) road.push({ label: "確認先の地図", value: `${map.label}`, note: map.url });
  const c = result.contact;
  if (c) {
    const dept = /^(東京都|\S{2,3}県)\s/.test(c.dept) ? c.dept : `${m.name} ${c.dept}`;
    road.push({ label: "窓口", value: `${dept}${c.phone ? ` ${c.phone}` : ""}`, note: c.noPhoneInquiry ? "道路種別は電話では答えてもらえない（窓口で確認）" : undefined });
  }
  sections.push({ title: "敷地と道路との関係（参考）", rows: road });

  // 災害：重要事項説明で所在地を示す市区町村のハザードマップ（水防法）と、国のデータで読んだ地点の値（参考）
  const maps: DraftRow[] = [];
  if (hazard) {
    const groups = groupHazardMaps(hazard.maps);
    for (const g of groups) maps.push({ label: g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・"), value: `${m.name}のハザードマップ`, note: g.url });
    if (!groups.length) maps.push({ label: "ハザードマップ", value: `${m.name}（わがまちハザードマップ）`, note: wagamachiUrl(hazard.muniCd) });
  } else maps.push({ label: "ハザードマップ", value: CHECK, note: "市区町村のハザードマップで確認", check: true });
  sections.push({ title: "ハザードマップ（重要事項説明で所在地を示す市区町村の地図）", rows: maps });
  if (hazard) sections.push({ title: "災害リスク（国のデータ・参考）", rows: hazardRows(hazard.report, hazard.elevation).map((r) => ({ label: r.label, value: r.value, check: r.warn })) });

  // 販売図面（物件概要）
  const outline: DraftRow[] = [];
  // 交通（広告の書き方：「東急東横線「菊名」駅 徒歩8分」。徒歩は道路距離 80m を1分の目安）
  for (const s of stations ?? [])
    outline.push({
      label: "交通",
      value: `${s.lines.map(lineLabel).join("・")}「${s.name}」駅 ${s.routed ? `徒歩約${s.minutes}分` : `直線約${(s.meters / 1000).toFixed(1)}km`}`,
      note: s.routed ? `道路距離 約${Math.round(s.meters / 10) * 10}m・駅の出入口までではない目安` : "歩いて行ける範囲に駅なし・直線距離",
      check: true,
    });
  const y = zoning?.zoning.youto[0];
  if (y) outline.push({ label: "用途地域・建ぺい率・容積率", value: `${zoning!.zoning.youto.map((o) => o.name).join("／")}${y.bcr ? `／建ぺい率${y.bcr}%` : ""}${y.far ? `／容積率${y.far}%` : ""}` });
  if (zoning?.zoning.bouka) outline.push({ label: "防火指定", value: zoning.zoning.bouka });
  if (schools?.elementary) outline.push({ label: "小学校区", value: schoolLine(schools.elementary) });
  if (schools?.junior) outline.push({ label: "中学校区", value: schoolLine(schools.junior) });
  const hit = building?.hit;
  if (hit) outline.push({ label: "建物（PLATEAU）", value: `${buildingSummary(hit.building)}${hit.building.height ? `・高さ約${hit.building.height.toFixed(1)}m` : ""}`, note: "登記・建築確認の内容とは異なることがある", check: true });
  const near = (landPrice ?? [])[0];
  if (near) outline.push({ label: "近くの地価", value: `${kindText(near.kind)} ${near.no}（${near.bearing}へ${distanceText(near.distance)}）：${priceText(near.price)}`, note: "標準地・基準地の価格で、物件の価格ではない" });
  if (outline.length) sections.push({ title: "販売図面（物件概要）向け（参考）", rows: outline });

  // 出典（それぞれの出典の文のまま。見出しは付けない）
  const credits: DraftRow[] = [];
  const credit = (value: string) => credits.push({ label: "", value });
  if (p || parcels) credit(`筆の${PARCEL_CREDIT}`);
  if (p?.estimated || parcels?.estimated) credit(KOZU_CREDIT);
  if (zoning) credit(`都市計画の${ZONING_CREDIT}`);
  if (md) credit(`盛土規制法の区域の${MORIDO_CREDIT}`);
  if (hazard) credit(`災害リスクの${HAZARD_CREDIT}`);
  if (hit) credit(`建物の${BUILDING_CREDIT}`);
  if (near) credit(`地価の${LAND_PRICE_CREDIT}`);
  if (schools?.elementary || schools?.junior) credit(`学区の${schoolCredit(schools)}`);
  if (stations?.length) credit(`駅の${STATION_CREDIT}`);
  if (credits.length) sections.push({ title: "出典", rows: credits });
  return sections;
}

/** コピーする文字（「■見出し」と「項目：値（注）」の行） */
export function draftText(sections: DraftSection[], at: Date = new Date()): string {
  const lines = [`【重説・物件概要の下書き（MICHILU・${at.getFullYear()}年${at.getMonth() + 1}月${at.getDate()}日）】`];
  for (const s of sections) lines.push("", ...sectionLines(s));
  lines.push("", DRAFT_NOTE);
  return lines.join("\n");
}

/** 見出しごとにコピーする文字 */
export function sectionLines(s: DraftSection): string[] {
  return [`■${s.title}`, ...s.rows.map((r) => `${r.label ? `${r.label}：` : ""}${r.value}${r.note ? `（${r.note}）` : ""}${r.check && r.value !== CHECK ? "【要確認】" : ""}`)];
}

/** 下書きに必ず添える注意 */
export const DRAFT_NOTE =
  "※国・市のデータをもとにした参考の下書きです。重要事項説明・広告に書く内容は、役所・法務局での調査と現地で確認してください。MICHILU は法令上の判断（再建築の可否など）はしません。";
