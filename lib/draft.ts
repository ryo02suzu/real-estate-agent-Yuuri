// 重要事項説明書・販売図面（物件概要）に書き写すための下書き。ミチルで調べた結果を、書類の欄の並びに並べ直す。
// どれも国・市のデータによる参考で、法令上の判断（再建築の可否など）はしない。分からない欄は「要確認」とし、確かめる先を添える
import type { LookupResult } from "./roadmap";
import { buildingSummary, type BuildingResult } from "./roadmap/building";
import { BUILDING_CREDIT } from "./roadmap/building-data";
import { groundMaps, groupHazardMaps, HAZARD_CREDIT, HAZARD_MAP_LABELS, hazardRows, wagamachiUrl, type Elevation, type HazardMaps, type HazardReport } from "./roadmap/hazard";
import { parcelCreditLine } from "./roadmap/kozu-data";
import { rosenkaLinks } from "./roadmap/rosenka";
import { SANKO_NOTE } from "./roadmap/sanko-data";
import { distanceText, kindText, priceText, type LandPriceHit } from "./roadmap/land-price";
import { LAND_PRICE_CREDIT } from "./roadmap/land-price-data";
import { chibanLabel, estimatedNote, kuikiLabel, parcelMark, type Estimated } from "./roadmap/parcel";
import type { NearbyRoad } from "./roadmap/road-read";
import { schoolCredit, schoolLine, type Schools } from "./roadmap/school";
import { POI_NOTE, poiCredit, poiWalkText, type PoiWalk } from "./roadmap/poi";
import { lineLabel, STATION_CREDIT, type StationWalk } from "./roadmap/walk";
import { CHIBANZU_NOTE, chibanzuFor } from "./roadmap/chibanzu";
import { HOUREI_CREDIT, HOUREI_LAWS, houreiAsOf, houreiCaution, houreiGroups, houreiNotesLine, houreiOffice, houreiOfficeAll, PREF_NAMES, type Hourei, type HoureiKind } from "./roadmap/hourei";
import { isekiFor } from "./roadmap/iseki";
import { suidoFor } from "./roadmap/suido";
import { contactName, NO_CITY_GAS, NO_SEWER, utilitiesFor, type UtilityContact } from "./roadmap/utilities";
import { TOCHI_CREDIT, tochiAgriText, tochiCheck, tochiForestText, tochiParkText, type Tochi } from "./roadmap/tochi";
import { MORIDO_CREDIT, moridoCaution, moridoDetail, moridoValue, type Morido } from "./roadmap/morido";
import { zoningRows, type Zoning, type ZoningStatus } from "./roadmap/zoning";
import { ZONING_CREDIT } from "./roadmap/zoning-data";

/** 下書きの1行。check：役所・法務局・現地で確かめる必要がある（データが無い・参考にとどまる） */
export type DraftRow = { label: string; value: string; note?: string; check?: boolean };
export type DraftSection = { title: string; rows: DraftRow[] };

export type DraftInput = {
  zoning?: { zoning: Zoning; st?: ZoningStatus; morido?: Morido; hourei?: Hourei; tochi?: Tochi };
  parcels?: { target?: string; neighbors: string[]; reference: boolean; estimated?: Estimated; sanko?: string };
  roads?: NearbyRoad[];
  hazard?: { report: HazardReport; elevation: Elevation | null; maps: HazardMaps; muniCd: string };
  building?: BuildingResult;
  landPrice?: LandPriceHit[];
  schools?: Schools;
  stations?: StationWalk[];
  pois?: PoiWalk[];
};

const CHECK = "要確認";

/** 重要事項説明書（法令上の制限・道路・災害）と販売図面（物件概要）の欄の並びの下書き */
export function buildDraft(result: Extract<LookupResult, { status: "ok" }>, { zoning, parcels, roads, hazard, building, landPrice, schools, stations, pois }: DraftInput = {}): DraftSection[] {
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
  if (found)
    place.push({
      label: "所在（地番）",
      value: `${kuikiLabel(found.kuiki)} ${chibanLabel(found.chibanRaw).replace(/^地番 /, "")}${parcelMark(found)}`,
      note: found.estimated
        ? `公図から推定した位置（${estimatedNote(found.estimated)}）`
        : found.sanko
          ? `${found.undetermined ? "登記所の地図では筆界未定地。" : ""}${SANKO_NOTE}`
          : undefined,
      check: !!(found.estimated || found.sanko),
    });
  else if (parcels?.target)
    place.push({
      label: "所在（地番）",
      value: `${parcels.target}${parcels.estimated ? "（推定）" : parcels.sanko ? "（地番参考図）" : ""}`,
      note: parcels.reference ? "住所の地点にある筆（参考）。住居表示と地番は別のもの" : undefined,
      check: true,
    });
  else place.push({ label: "所在（地番）", value: CHECK, note: "登記・公図で確認", check: true });
  if (parcels?.neighbors.length) place.push({ label: "隣地の地番", value: parcels.neighbors.join("、"), note: "境界が接している筆（地図データから）" });
  const chibanzu = chibanzuFor(m, result.lat, result.lng);
  if (chibanzu) place.push({ label: "地番の参考図", value: `${chibanzu.name}（${chibanzu.url}）`, note: CHIBANZU_NOTE });
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
  // 砂防指定地・地すべり防止区域・急傾斜地崩壊危険区域・災害危険区域（国のデータ。概略の区域で、重要事項説明の根拠には使えない）
  const hr = zoning?.hourei;
  const houreiRow = (kind: HoureiKind): DraftRow => {
    const label = `${HOUREI_LAWS[kind].law}（${kind}）`;
    if (!hr) return { label, value: CHECK, note: "区域を指定した都県・市で確認", check: true };
    const pref = PREF_NAMES[hr.pref];
    const office = houreiOffice(kind, kind === "災害危険区域" ? `${pref}・${m.name}` : pref);
    if (hr.missing.includes(kind)) return { label, value: CHECK, note: `${pref}の${kind}は国のデータに無い。${office}で確認`, check: true };
    // 都県が求める特記事項は、出典の欄にまとめて書く
    const hits = hr.hits.filter((h) => h.kind === kind);
    if (hits.length) return { label, value: "区域内（国のデータ・参考）", note: `${houreiGroups(hits)[0].text}。${houreiCaution(hits[0])}`, check: true };
    return { label, value: "区域外（国のデータ・参考）", note: `${houreiAsOf(kind, hr.pref)}の国のデータでは区域外。概略の区域で、重要事項説明には${office}で確認`, check: true };
  };
  law.push(houreiRow("災害危険区域"));
  sections.push({ title: "都市計画法・建築基準法に基づく制限（参考）", rows: law });

  // それ以外の法令に基づく制限（重説の欄の分け方のとおり）
  const other: DraftRow[] = [];
  // 盛土規制法の区域（国のデータ。重要事項説明の根拠には使えないので、指定した都県・市の資料で確かめる）
  const md = zoning?.morido;
  if (md) {
    other.push({ label: "宅地造成及び特定盛土等規制法", value: `${moridoValue(md)}（国のデータ・参考）`, note: `${moridoDetail(md)}。${moridoCaution(md.authority)}`, check: true });
    if (md.link) other.push({ label: "盛土規制法の確認先", value: md.link.label, note: md.link.url });
  } else other.push({ label: "宅地造成及び特定盛土等規制法", value: CHECK, note: "区域を指定した都県・市（盛土規制法の担当課）で確認", check: true });
  // 区域外の種類が2つ以上なら1つの欄にまとめる（スマホの1画面に収める。区域内の種類は1つずつ）
  const kinds = ["急傾斜地崩壊危険区域", "地すべり防止区域", "砂防指定地"] as const;
  const outside = hr ? kinds.filter((k) => !hr.missing.includes(k) && !hr.hits.some((h) => h.kind === k)) : [];
  for (const kind of kinds) if (outside.length < 2 || !outside.includes(kind)) other.push(houreiRow(kind));
  if (hr && outside.length >= 2) {
    const asOf = [...new Set(outside.map((k) => houreiAsOf(k, hr.pref)))].join("・");
    other.push({
      label: `${outside.map((k) => HOUREI_LAWS[k].law).join("・")}（${outside.join("・")}）`,
      value: "区域外（国のデータ・参考）",
      note: `${asOf}の国のデータではどれも区域外。概略の区域で、重要事項説明には${houreiOfficeAll([...outside], PREF_NAMES[hr.pref])}で確認`,
      check: true,
    });
  }
  // 自然公園法・農業振興地域の整備に関する法律・森林法（国のデータは2015年度・縮尺約1/5万の概略。区域外の法令が2つ以上なら1つの欄）
  const tc = zoning?.tochi;
  if (!tc)
    other.push({
      label: "自然公園法・農業振興地域の整備に関する法律・森林法",
      value: CHECK,
      note: "自然公園・保安林は都県、農用地区域は市町村の農業委員会、地域森林計画の森林は市町村の林務の担当で確認",
      check: true,
    });
  else {
    const laws = [
      { law: "自然公園法", area: "自然公園", inside: !!tc.park, text: tochiParkText(tc) },
      { law: "農業振興地域の整備に関する法律", area: "農業振興地域", inside: !!tc.agri, text: tochiAgriText(tc) },
      { law: "森林法", area: "森林地域", inside: !!tc.forest, text: tochiForestText(tc) },
    ];
    // 注は区域に入っている欄で1回（2015年度・縮尺約1/5万の概略と、確かめる先）
    const note = `${tc.year}年度・縮尺約1/5万の国のデータ。${tochiCheck(tc, m.name)}`;
    laws
      .filter((l) => l.inside)
      .forEach((l, i) => other.push({ label: l.law, value: `${l.text}（国のデータ・参考）`, note: i === 0 ? note : undefined, check: true }));
    const out = laws.filter((l) => !l.inside);
    if (out.length >= 2)
      other.push({
        label: out.map((l) => l.law).join("・"),
        value: "区域外（国のデータ・参考）",
        note: `${tc.year}年度の国のデータ（縮尺約1/5万の概略）では${out.map((l) => l.area).join("・")}の外`,
        check: true,
      });
    else if (out.length) other.push({ label: out[0].law, value: `${out[0].text}（国のデータ・参考）`, check: true });
  }
  // 文化財保護法：周知の埋蔵文化財包蔵地（遺跡）に入るかは教育委員会で確かめる。遺跡地図は概要を示すもので、証明にはならない
  const ik = isekiFor(m, result.lat, result.lng);
  other.push({ label: "文化財保護法（埋蔵文化財包蔵地）", value: CHECK, note: `包蔵地（遺跡）に入るかは${ik.office}で確認${ik.note ? `。${ik.note}` : ""}`, check: true });
  if (ik.map) other.push({ label: "遺跡地図", value: `${ik.map.name}${ik.map.at ? "（物件の場所で開く）" : ""}`, note: ik.map.url });
  sections.push({ title: "その他の法令に基づく制限（参考）", rows: other });

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

  // 飲用水・ガスの供給施設と排水施設：台帳の地図は下調べ。前面道路の本管・口径・引込みの有無は水道・下水道の担当で確かめる
  const supply: DraftRow[] = [];
  const ledgers = suidoFor(m, result.lat, result.lng);
  const water = ledgers.find((l) => l.kind === "上水道");
  const sewer = ledgers.find((l) => l.kind === "下水道");
  // 照会先（水道事業者・下水道の管理者・都市ガスの導管事業者）が分かる市区町村は、名前と確かめ方のページを添える
  const u = utilitiesFor(m);
  const names = (list: UtilityContact[] | undefined, other: string) => (list?.length ? list.map(contactName).join("・") : other);
  const contactRows = (label: string, list: UtilityContact[] | undefined) =>
    (list ?? []).forEach((c) => supply.push({ label, value: contactName(c), note: c.url }));
  supply.push({ label: "飲用水（上水道）", value: CHECK, note: `前面道路の配水管・口径・引込み管の有無は、${names(u?.water, "水道事業者（市区町村の水道局など）")}で確認`, check: true });
  contactRows("水道の照会先", u?.water);
  if (water) supply.push({ label: "水道の台帳", value: water.name, note: water.url });
  supply.push({
    label: "排水（下水道）",
    value: CHECK,
    note:
      u?.sewer && u.sewer.length === 0
        ? `${NO_SEWER}。浄化槽の要否・排水の方法は${m.name}の担当で確認`
        : `前面道路の下水道管（汚水・雨水）・公共ますの有無、浄化槽の要否は、${names(u?.sewer, "下水道の管理者（市区町村など）")}で確認`,
    check: true,
  });
  contactRows("下水道の照会先", u?.sewer);
  if (sewer) supply.push({ label: "下水道の台帳", value: sewer.name, note: sewer.url });
  const gasNote = !u?.gas
    ? "都市ガスかプロパンガスか、前面道路のガス管の有無はガス会社で確認"
    : u.gas.length
      ? `都市ガスかプロパンガスか、前面道路のガス管の有無は${names(u.gas, "")}（都市ガス）かプロパンガスの販売店で確認`
      : `${NO_CITY_GAS}。ガスの種類と設備は売主・ガスの販売店で確認`;
  supply.push({ label: "ガス", value: CHECK, note: gasNote, check: true });
  contactRows("ガスの照会先", u?.gas);
  sections.push({ title: "飲用水・ガス・排水施設（参考）", rows: supply });

  // 災害：重要事項説明で所在地を示す市区町村のハザードマップ（水防法）と、国のデータで読んだ地点の値（参考）
  const maps: DraftRow[] = [];
  if (hazard) {
    const groups = groupHazardMaps(hazard.maps);
    for (const g of groups) maps.push({ label: g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・"), value: `${m.name}のハザードマップ`, note: g.url });
    if (!groups.length) maps.push({ label: "ハザードマップ", value: `${m.name}（わがまちハザードマップ）`, note: wagamachiUrl(hazard.muniCd) });
  } else maps.push({ label: "ハザードマップ", value: CHECK, note: "市区町村のハザードマップで確認", check: true });
  sections.push({ title: "ハザードマップ（重要事項説明で所在地を示す市区町村の地図）", rows: maps });
  // 大規模盛土造成地・液状化の発生傾向は読み取らず、国の重ねるハザードマップを物件の場所で開く URL を添える
  if (hazard)
    sections.push({
      title: "災害リスク（国のデータ・参考）",
      rows: [
        ...hazardRows(hazard.report, hazard.elevation).map((r) => ({ label: r.label, value: r.value, check: r.warn })),
        ...groundMaps(result.lat, result.lng).map((g) => ({ label: g.label, value: "国の重ねるハザードマップで確認", note: g.url })),
      ],
    });

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
  // 路線価（相続税・固定資産税）は全国地価マップを物件の場所で開く URL を添える
  for (const l of rosenkaLinks(result.lat, result.lng))
    outline.push({ label: l.kind === "souzoku" ? "相続税路線価" : "固定資産税路線価", value: `全国地価マップで確認（${l.name.match(/（(.+)）/)?.[1] ?? ""}）`, note: l.url });
  if (outline.length) sections.push({ title: "販売図面（物件概要）向け（参考）", rows: outline });

  // 周辺環境（販売図面の生活環境）。種類ごとにいちばん近い施設と徒歩の目安。広告には今もある施設を道路距離で書くので、確認を1行添える
  if (pois?.length)
    sections.push({
      title: "周辺環境（販売図面の生活環境・参考）",
      rows: [...pois.map((w) => ({ label: w.label, value: `${w.name} ${poiWalkText(w)}` })), { label: "注意", value: POI_NOTE, check: true }],
    });

  // 出典（それぞれの出典の文のまま。見出しは付けない。国土数値情報のデータは1つの文にまとめる）
  const credits: DraftRow[] = [];
  const credit = (value: string) => credits.push({ label: "", value });
  // 筆の出典（登記所備付地図データ）と、公図から推定した筆の注意は1つの文に
  // 市町村の地番参考図の筆の出典（市町村ごと）も同じ文に
  if (p || parcels) credit(parcelCreditLine(!!(p?.estimated || parcels?.estimated), p?.sanko ?? parcels?.sanko));
  if (zoning) credit(`都市計画の${ZONING_CREDIT}`);
  if (hazard) credit(`災害リスクの${HAZARD_CREDIT}`);
  if (hit) credit(`建物の${BUILDING_CREDIT}`);
  const ksj: [string, string][] = [];
  if (md) ksj.push(["盛土規制法", MORIDO_CREDIT]);
  if (hr) ksj.push(["砂防指定地など", HOUREI_CREDIT]);
  if (near) ksj.push(["地価", LAND_PRICE_CREDIT]);
  if (schools?.elementary || schools?.junior) ksj.push(["学区", schoolCredit(schools)]);
  if (stations?.length) ksj.push(["駅", STATION_CREDIT]);
  if (zoning?.tochi) ksj.push(["自然公園・農振・森林", TOCHI_CREDIT]);
  ksjCredits(ksj).forEach(credit);
  // 周辺施設（OpenStreetMap）。道のりの出典は駅の出典にあれば繰り返さない
  if (pois?.length) credit(poiCredit(!stations?.length));
  // 都県が利用条件で求める特記事項（砂防指定地などの区域のデータ）
  const notes = hr && houreiNotesLine(hr.pref);
  if (notes) credit(notes);
  if (credits.length) sections.push({ title: "出典", rows: credits });
  return sections;
}

const KSJ = /^出典：「国土数値情報（(.+?)）」（国土交通省、https:\/\/nlftp\.mlit\.go\.jp\/ksj\/）を加工して作成(.*)$/;

/**
 * 国土数値情報の出典を1つの文にする（「出典：「国土数値情報」（国土交通省、…）を加工して作成（盛土規制法の区域：…データ（時点）／駅：鉄道データ（2024年））。道のりは…」）。
 * 形の違う出典はそのまま
 */
function ksjCredits(items: [what: string, credit: string][]): string[] {
  const parts: string[] = [];
  const after: string[] = [];
  const others: string[] = [];
  for (const [what, c] of items) {
    const m = c.match(KSJ);
    if (!m) {
      others.push(`${what}の${c}`);
      continue;
    }
    // 「（時点）」（入れ子のかっこもある）と、そのあとの文
    let edition = "";
    let rest = m[2];
    if (rest.startsWith("（")) {
      let depth = 0;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "（") depth++;
        else if (rest[i] === "）" && --depth === 0) {
          edition = rest.slice(0, i + 1);
          rest = rest.slice(i + 1);
          break;
        }
      }
    }
    parts.push(`${what}：${m[1]}${edition}`);
    const sentence = rest.replace(/^。/, "");
    if (sentence && !after.includes(sentence)) after.push(sentence);
  }
  if (parts.length < 2) return items.map(([what, c]) => `${what}の${c}`);
  return [`国土数値情報の出典：「国土数値情報」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成（${parts.join("／")}）${after.map((x) => `。${x}`).join("")}`, ...others];
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
