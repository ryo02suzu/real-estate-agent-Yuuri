// スマホの「結果の文面」：調べた結果を、仕事のチャット・メール・社内の報告に貼って読みやすい形にまとめる（lib/app/doc.ts の形）。
// 「要点」は結論（要注意点）・物件の概要・災害・残りのやることだけ（上司・同僚への一報）。「詳しく」は法令・地価・周辺・地番・
// 上下水道・確認先のリンク・出典まで（社内の記録・報告書の元）。中身は PC の結果の文面（lib/summary.ts）と同じデータから作るが、
// 順と書き方を読む人に合わせて並べ直す。法令上の判断（再建築の可否など）はしない
import type { LookupResult } from "../roadmap";
import { buildingSummary, type BuildingResult } from "../roadmap/building";
import { BUILDING_CREDIT } from "../roadmap/building-data";
import { CHIBANZU_NOTE, chibanzuFor } from "../roadmap/chibanzu";
import { GROUND_NOTE, groundMaps, groupHazardMaps, HAZARD_CREDIT, HAZARD_MAP_LABELS, hazardRows, wagamachiUrl, type Elevation, type HazardMaps, type HazardReport } from "../roadmap/hazard";
import { HOUREI_CREDIT, HOUREI_SHORT, houreiGroups, houreiLine, houreiNotesLine, type Hourei } from "../roadmap/hourei";
import { isekiFor, isekiLine } from "../roadmap/iseki";
import { KOZU_CREDIT } from "../roadmap/kozu-data";
import { asOfText, changeText, distanceText, kindText, priceText, type LandPriceHit } from "../roadmap/land-price";
import { LAND_PRICE_CREDIT } from "../roadmap/land-price-data";
import { MORIDO_CREDIT, moridoLine, type Morido } from "../roadmap/morido";
import { chibanLabel, estimatedNote, kuikiLabel, parcelMark, type Estimated } from "../roadmap/parcel";
import { PARCEL_CREDIT } from "../roadmap/parcel-data";
import { POI_SOURCES, poiLine, type PoiWalk } from "../roadmap/poi";
import type { NearbyRoad } from "../roadmap/road-read";
import { rosenkaLinks } from "../roadmap/rosenka";
import { SANKO_NOTE, sankoCredit } from "../roadmap/sanko-data";
import { schoolCredit, schoolGaps, schoolGapShort, schoolLine, type Schools } from "../roadmap/school";
import { SCHOOL_DATA } from "../roadmap/school-data";
import { suidoFor } from "../roadmap/suido";
import { TOCHI_CREDIT, tochiCheck, tochiLine, type Tochi } from "../roadmap/tochi";
import { contactName, noContactText, UTILITIES_CHECKED, utilitiesFor } from "../roadmap/utilities";
import { ROAD_CREDIT, STATION_CREDIT, stationLine, type StationWalk } from "../roadmap/walk";
import { zoningRows, type Zoning, type ZoningStatus } from "../roadmap/zoning";
import { ZONING_CREDIT } from "../roadmap/zoning-data";
import { RECORD_ITEMS, RECORD_TOPICS, type PropertyRecords } from "../records";
import { compactParcels, half, jaDate, type Doc, type DocItem, type DocSection } from "./doc";
import { ratioHint } from "./ratio-hint";
import { TRIAGE_NOTE, type Action, type Triage } from "./triage";

type Ok = Extract<LookupResult, { status: "ok" }>;

export type ReportDetail = "short" | "full";

/** 入力（lib/summary.ts の buildSummary と同じ。レポートで外した項目は入れない） */
export type ReportInput = {
  zoning?: { zoning: Zoning; st?: ZoningStatus; morido?: Morido; hourei?: Hourei; tochi?: Tochi };
  parcels?: { target?: string; neighbors: string[]; reference: boolean; offLot?: boolean; estimated?: Estimated; sanko?: string };
  roads?: NearbyRoad[];
  hazard?: { report: HazardReport; elevation: Elevation | null; maps: HazardMaps; muniCd: string };
  building?: BuildingResult;
  landPrice?: LandPriceHit[];
  schools?: Schools;
  stations?: StationWalk[];
  pois?: PoiWalk[];
  triage?: Triage;
  done?: ReadonlySet<string>;
};

export type ReportOptions = {
  detail: ReportDetail;
  /** 調べた日（文の頭に出す） */
  date: Date;
  /** 筆の面積の目安（「約770㎡（約233坪）」） */
  area?: string;
  /** あなたの確認の記録（スマホで書いたもの） */
  records?: PropertyRecords;
};

const COVERAGE_TEXT = { full: "道路種別はネットの地図で分かる", partial: "道路種別はネットで一部だけ分かる", none: "道路種別はネット非公開（窓口で確認）", outside: "都市計画区域外（窓口で確認）",
  unknown: "道路種別の公開の有無は調査中（県か市の建築指導課で確認）" } as const;

const md = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 物件の行（「物件：千葉県松戸市古ケ崎四丁目 地番 3556-1（推定）」） */
function propertyLine(result: Ok): string {
  const p = result.parcel;
  const found = p && !result.picked ? p : undefined;
  const lot = found ? `${chibanLabel(found.chibanRaw)}${parcelMark(found)}` : result.picked ? "（地図で選んだ地点）" : "付近";
  return `物件：${half(result.matchedAddress)} ${lot}`.trim();
}

/** 確認先の短い言い方（「法務局の公図で」）を、注の文にする（「法務局の公図で確認」） */
const confirmText = (c: string) => (/[でを]$/.test(c) ? `${c}確認` : c);

/** 要注意点の行（▲ 要注意・要確認）。withNote：確かめる先を注で添える */
function issueItems(triage: Triage, withNote: boolean): DocItem[] {
  const items: DocItem[] = triage.issues.length
    ? triage.issues.map((i) => ({ text: i.title, tone: i.level === "warn" ? "warn" : "check", note: withNote && i.confirm ? confirmText(i.confirm) : undefined }))
    : [{ text: triage.pending.length ? `${triage.pending.join("・")}を確認中` : "データで見つかった注意はありません（下の「次にやること」は確かめてください）" }];
  if (triage.failed.length) items.push({ text: `読めなかったデータ：${triage.failed.join("・")}`, tone: "check" });
  return items;
}

/** 次にやることの章（済んだものは☑）。full：確かめることの細かい点まで。results：やることの1つに添える、確かめた結果 */
function actionSection(triage: Triage, done: ReadonlySet<string>, full: boolean, results?: (a: Action) => string[]): DocSection {
  const left = triage.actions.filter((a) => !done.has(a.id)).length;
  const items: DocItem[] = triage.actions.map((a) => {
    const r = results?.(a) ?? [];
    return {
      box: done.has(a.id) ? "done" : "todo",
      text: `${a.title}：${a.where}${a.phone ? ` ${a.phone}` : ""}`,
      note: full ? a.how : undefined,
      // 隣地の地番の行は所在の繰り返しが長いので、同じ所在をまとめる
      sub: full ? [...a.what.map((w) => half(w).replace(/：((?:[^、：]+ \S+、)+[^、：]+ \S+)$/, (_, list: string) => `：${compactParcels(list.split("、")).join("／")}`)), ...(r.length ? [`確かめた結果：${r.join("・")}`] : [])] : undefined,
    };
  });
  return { title: `次にやること（残り ${left}件／${triage.actions.length}件）`, items };
}

/** 要注意点と次にやること（スマホの一覧のコピー）。results：やることごとに、確かめた結果（記録）を添える */
export function todoDoc(result: Ok, triage: Triage, done: ReadonlySet<string>, date: Date, results?: (a: Action) => string[]): Doc {
  const sections: DocSection[] = [{ title: `要注意点（${triage.headline}）`, items: issueItems(triage, true) }];
  if (triage.actions.length) sections.push(actionSection(triage, done, true, results));
  return { title: "要注意点と次にやること", head: [propertyLine(result), `作成日：${jaDate(date)}（MICHILU で調査）`], sections, foot: [`※${TRIAGE_NOTE}`] };
}

/** 結果の文面の中身 */
export function buildReport(result: Ok, input: ReportInput, opts: ReportOptions): Doc {
  const full = opts.detail === "full";
  const m = result.municipality;
  const p = result.parcel;
  const found = p && !result.picked ? p : undefined;
  const { zoning, parcels, roads, hazard, building, landPrice, schools, stations, pois, triage, done = new Set<string>() } = input;
  const sections: DocSection[] = [];

  // 題の下：物件と調べた日
  const head = [propertyLine(result), `調べた日：${jaDate(opts.date)}（MICHILU で調査）`];
  head.push(`地図：https://maps.gsi.go.jp/#18/${result.lat.toFixed(6)}/${result.lng.toFixed(6)}/`);

  // 要点（いちばん上に結論）
  if (triage) sections.push({ title: `要点（${triage.headline}）`, items: issueItems(triage, full) });

  // 物件の概要（重説・図面で最初に見る所）
  const outline: DocItem[] = [];
  if (found) outline.push({ label: "地番", text: `${half(kuikiLabel(found.kuiki))} ${chibanLabel(found.chibanRaw).replace(/^地番 /, "")}${parcelMark(found)}`, note: found.estimated ? `公図から推定した位置・${estimatedNote(found.estimated)}` : found.sanko ? SANKO_NOTE : undefined });
  else if (parcels?.target) outline.push({ label: "地番", text: `${half(parcels.target)}（参考）`, note: parcels.offLot ? "住所の地点にある筆。道路など物件の外の土地の可能性があるので公図で確認" : "住所の地点にある筆。住居表示と地番は別なので公図で確認", tone: "check" });
  if (opts.area) outline.push({ label: "面積", text: opts.area, note: "地図上の目安。登記の地積で確認" });
  const zr = zoning ? zoningRows(zoning.zoning, zoning.st) : [];
  const zv = (label: string) => zr.find((r) => r.label === label);
  if (zoning) {
    const area = zv("区域");
    const youto = zv("用途地域");
    if (youto) outline.push({ label: "用途地域", text: `${half(youto.value)}${area && area.value !== "データなし" ? `（${area.value}）` : ""}`, tone: area?.warn ? "warn" : undefined });
    else if (area) outline.push({ label: "区域", text: area.value, tone: area.warn ? "warn" : undefined });
    const bf = zv("建ぺい率・容積率");
    // 都市計画のデータに無いときは、画面の（参考）と同じ、近くの同じ用途地域の地点の値を添える（画面と文面で食い違わないように）
    const hint = bf?.value === "データなし" ? ratioHint(zoning.zoning.youto[0]?.name, landPrice ?? []) : undefined;
    if (bf)
      outline.push({
        label: "建ぺい率・容積率",
        text: bf.value === "データなし" ? (hint ? `都市計画のデータになし（参考：約${Math.round(hint.distance)}m先の同じ用途地域の${hint.label}は ${hint.bcr}%・${hint.far}%）` : "データなし（市で確認）") : bf.value.replace(" ・ ", "・"),
        tone: bf.value === "データなし" ? "check" : undefined,
      });
    const fire = zv("防火・準防火");
    const height = zv("高度地区");
    if (fire || height) outline.push({ label: "防火・高度", text: [fire && `防火 ${fire.value}`, height && `高度地区 ${height.value}`].filter(Boolean).join("／") });
  }
  if (roads?.length) {
    const r = roads[0];
    outline.push({ label: "まわりの道路", text: `${r.direction === "地点上" ? "地点の上" : `${r.direction} 約${Math.max(1, Math.round(r.distance))}m`}：${r.label}${r.width ? `（幅員 ${r.width}）` : ""}`, note: "市の地図データで読んだ参考。種別は窓口で確認", tone: "check" });
  }
  if (stations?.length) outline.push({ label: "最寄り駅", text: stationLine(stations[0]) });
  if (schools?.elementary || schools?.junior) outline.push({ label: "学区", text: [schools.elementary && `小 ${schools.elementary.name}`, schools.junior && `中 ${schools.junior.name}`].filter(Boolean).join("・") });
  const hit = building?.hit;
  if (hit && full) outline.push({ label: "建物", text: `${buildingSummary(hit.building)}${hit.building.height ? `・高さ約${hit.building.height.toFixed(1)}m` : ""}`, note: "PLATEAU の推定" });
  if (outline.length) sections.push({ title: "物件の概要（参考）", items: outline });

  // 法令・規制（詳しくだけ全部。要点では注意があるものだけ）
  if (zoning) {
    const items: DocItem[] = [];
    for (const r of zr) {
      if (["区域", "用途地域", "建ぺい率・容積率", "防火・準防火", "高度地区"].includes(r.label) && !full) continue;
      if (!full && !r.warn) continue;
      items.push({ label: r.label, text: half(r.value), tone: r.warn ? "warn" : r.value === "データなし" ? "check" : undefined });
    }
    if (zoning.st?.asOf && full) items.push({ label: "データの時点", text: `${zoning.st.city}：${zoning.st.asOf}` });
    if (zoning.morido) {
      const line = moridoLine(zoning.morido);
      const inArea = !/区域外/.test(line);
      if (full || inArea) items.push({ label: "盛土規制法", text: line, tone: inArea ? "warn" : undefined });
    }
    if (zoning.hourei) {
      const inArea = zoning.hourei.hits.length > 0;
      if (full || inArea) items.push({ label: "砂防・急傾斜地など", text: houreiLine(zoning.hourei), tone: inArea ? "warn" : undefined, sub: full ? houreiGroups(zoning.hourei.hits).map((g) => `${HOUREI_SHORT[g.kind]}：${g.text}`) : undefined });
    }
    if (zoning.tochi) {
      const inArea = !!(zoning.tochi.park || zoning.tochi.agri || zoning.tochi.forest);
      const check = tochiCheck(zoning.tochi, m.name);
      if (full || inArea) items.push({ label: "自然公園・農振・森林", text: `${tochiLine(zoning.tochi)}（${zoning.tochi.year}年度の国のデータ）`, tone: inArea ? "warn" : undefined, note: check ?? undefined });
    }
    const iseki = isekiFor(m, result.lat, result.lng);
    if (full) items.push({ label: "埋蔵文化財", text: isekiLine(iseki), tone: "check", link: iseki.map ? { label: "埋蔵文化財の地図", url: iseki.map.url } : undefined });
    if (items.length) sections.push({ title: "法令上の制限（参考）", items });
  }

  // 災害リスク：注意のあるものを先に、区域外はまとめて1行
  if (hazard) {
    const rows = hazardRows(hazard.report, hazard.elevation);
    const items: DocItem[] = [];
    const quiet: string[] = [];
    for (const r of rows) {
      if (r.kind === "elevation") continue;
      if (r.warn || (full && r.value !== "区域外")) items.push({ label: r.name, text: r.value, tone: r.warn ? "warn" : undefined, note: full ? r.sub : undefined });
      else if (r.value === "区域外") quiet.push(r.name);
      else items.push({ label: r.name, text: r.value });
    }
    if (quiet.length) items.push({ label: "区域外", text: quiet.join("・") });
    const elev = rows.find((r) => r.kind === "elevation");
    if (elev) items.push({ label: "標高", text: elev.value, tone: elev.warn ? "warn" : undefined });
    const maps = groupHazardMaps(hazard.maps);
    if (full) {
      for (const g of maps) items.push({ text: `${m.name}の${g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}のハザードマップ（重要事項説明で所在地を示す地図）`, link: { label: `${m.name}のハザードマップ（${g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}）`, url: g.url } });
      if (!maps.length) items.push({ text: `${m.name}のハザードマップ`, link: { label: "わがまちハザードマップ", url: wagamachiUrl(hazard.muniCd) } });
      for (const g of groundMaps(result.lat, result.lng)) items.push({ text: `${g.label}（国の重ねるハザードマップ）`, link: { label: g.label, url: g.url } });
    }
    sections.push({ title: "災害リスク（国のデータ・参考）", items, lead: full ? `重要事項説明は${m.name}のハザードマップで所在地を示してください。` : undefined });
  }

  // 地価・路線価（詳しくだけ）
  if (full) {
    const items: DocItem[] = [];
    for (const h of (landPrice ?? []).slice(0, 3)) items.push({ text: `${kindText(h.kind)} ${h.no}：${priceText(h.price)}`, note: `${h.usage}・${h.bearing}へ${distanceText(h.distance)}・前年比 ${changeText(h.change)}・${asOfText(h)}` });
    for (const l of rosenkaLinks(result.lat, result.lng)) items.push({ text: l.name, link: { label: `${l.name}（全国地価マップ）`, url: l.url } });
    if (items.length) sections.push({ title: "地価・路線価（参考。物件の価格ではありません）", items });
  }

  // 周辺（詳しくだけ）
  if (full && (stations?.length || pois?.length || schools)) {
    const items: DocItem[] = [];
    for (const s of stations ?? []) items.push({ label: "駅", text: stationLine(s) });
    if (schools?.elementary) items.push({ label: "小学校", text: schoolLine(schools.elementary) });
    if (schools?.junior) items.push({ label: "中学校", text: schoolLine(schools.junior) });
    for (const g of schools ? schoolGaps(m.codes[0], schools) : []) items.push({ label: g.key === "es" ? "小学校" : "中学校", text: `データなし（${schoolGapShort(g.why, m.name)}。教育委員会で確認）`, tone: "check" });
    for (const w of pois ?? []) {
      const [label, ...rest] = poiLine(w).split("：");
      items.push(rest.length ? { label, text: rest.join("：") } : { text: label });
    }
    if (items.length) sections.push({ title: "周辺（徒歩は道路距離 80m を1分の目安）", items, lead: schools ? `学区は${SCHOOL_DATA.edition}のデータ。指定校は教育委員会で確認。` : undefined });
  }

  // 謄本・公図用の地番（詳しくだけ。要点では筆の数だけ）
  const withParcels = !!parcels && (!!parcels.target || parcels.neighbors.length > 0);
  if (parcels && withParcels && full) {
    const items: DocItem[] = [];
    if (parcels.target) items.push({ label: "物件の筆", text: `${half(parcels.target)}${parcels.reference ? "（参考）" : ""}`, tone: parcels.reference || parcels.offLot ? "check" : undefined });
    if (parcels.neighbors.length && parcels.offLot) items.push({ label: "隣の筆", text: `省略（この筆に接する筆は${parcels.neighbors.length}筆。公図で物件の筆を確かめてから）` });
    else if (parcels.neighbors.length) items.push({ label: `隣の筆（${parcels.neighbors.length}筆）`, text: compactParcels(parcels.neighbors).join("／") });
    const chibanzu = chibanzuFor(m, result.lat, result.lng);
    if (chibanzu) items.push({ text: `${chibanzu.name}（${CHIBANZU_NOTE}）`, link: { label: chibanzu.name, url: chibanzu.url } });
    sections.push({ title: "謄本・公図用の地番", items, lead: parcels.estimated ? `筆の位置は公図から推定（${estimatedNote(parcels.estimated)}）。` : parcels.sanko ? `${SANKO_NOTE}。` : undefined });
  }

  // 上下水道・ガスの照会先（詳しくだけ）
  if (full) {
    const items: DocItem[] = [];
    const u = utilitiesFor(m);
    if (u)
      for (const [what, kind, list] of [["水道", "上水道", u.water], ["下水道", "下水道", u.sewer], ["都市ガス", "ガス", u.gas]] as const) {
        if (!list) continue;
        if (!list.length) items.push({ label: what, text: noContactText(kind) });
        for (const c of list) items.push({ label: what, text: contactName(c), note: c.how, link: { label: `${what}：${contactName(c)}`, url: c.url } });
      }
    for (const l of suidoFor(m, result.lat, result.lng)) items.push({ label: "台帳", text: l.name, link: { label: l.name, url: l.url } });
    if (items.length) sections.push({ title: `上下水道・ガスの照会先（${UTILITIES_CHECKED}時点）`, items });
  }

  // 道路種別の確認先（詳しくでは地図のリンクも）
  {
    const items: DocItem[] = [{ label: m.name, text: COVERAGE_TEXT[m.coverage] }];
    const c = result.contact;
    if (c) {
      const dept = /^(東京都|\S{2,3}県)\s/.test(c.dept) ? c.dept : `${m.name} ${c.dept}`;
      items.push({ label: "窓口", text: `${dept}${c.phone ? ` ${c.phone}` : ""}`, note: c.noPhoneInquiry ? "道路種別は電話では答えてもらえない。窓口で確認" : undefined });
    }
    if (full) for (const l of result.links) items.push({ text: `${l.label}${l.pinpoint ? "" : "（地図の中で住所を検索）"}`, link: { label: l.label, url: l.url } });
    if (full && roads && roads.length > 1) for (const r of roads.slice(1)) items.push({ label: "まわりの道路", text: `${r.direction === "地点上" ? "地点の上" : `${r.direction} 約${Math.max(1, Math.round(r.distance))}m`}：${r.label}${r.width ? `（幅員 ${r.width}）` : ""}` });
    sections.push({ title: "道路種別の確認先", items });
  }

  // 次にやること（済んだものは☑）
  if (triage?.actions.length) sections.push(actionSection(triage, done, full));

  // あなたの確認の記録
  if (opts.records) {
    const items: DocItem[] = [];
    for (const t of RECORD_TOPICS) {
      const recs = opts.records.items[t];
      if (!recs) continue;
      for (const s of RECORD_ITEMS[t].subs) {
        const r = recs[s.id];
        if (!r) continue;
        const how = [r.method, r.source].filter(Boolean).join("・");
        items.push({ box: r.done ? "done" : "todo", label: `${RECORD_ITEMS[t].label}／${s.label}`, text: r.note || (r.done ? "確認済み" : "未確認"), note: [r.done ? `確認 ${md(r.at)}` : "", how].filter(Boolean).join("・") || undefined });
      }
    }
    if (items.length) sections.push({ title: "確認した結果（この端末の記録・MICHILU の判定ではありません）", items });
  }

  // 注意と出典（要点では短く1つにまとめる）
  const foot = ["※国・市のデータによる参考情報です。法令上の判断（再建築の可否など）はしていません。重要事項説明などの最終確認は、役所・法務局・現地で行ってください。"];
  if (full) {
    const credits: string[] = [];
    if (p || withParcels) credits.push(`筆の${PARCEL_CREDIT}。`);
    if (p?.estimated || parcels?.estimated) credits.push(`${KOZU_CREDIT}。`);
    const sanko = p?.sanko ?? parcels?.sanko;
    if (sanko) credits.push(`参考図の筆の${sankoCredit(sanko)}。`);
    if (zoning) credits.push(`都市計画の${ZONING_CREDIT}。`);
    if (zoning?.morido) credits.push(`盛土規制法の区域の${MORIDO_CREDIT}。概略の区域です。`);
    if (zoning?.tochi) credits.push(`自然公園・農業振興地域・森林の${TOCHI_CREDIT}。`);
    if (zoning?.hourei) {
      credits.push(`砂防指定地などの区域の${HOUREI_CREDIT}。`);
      const notes = houreiNotesLine(zoning.hourei.pref);
      if (notes) credits.push(notes);
    }
    if (hazard) credits.push(`災害リスクの${HAZARD_CREDIT}。${GROUND_NOTE}。`);
    if (hit) credits.push(`建物の${BUILDING_CREDIT}。`);
    if (landPrice?.length) credits.push(`地価の${LAND_PRICE_CREDIT}。`);
    if (schools?.elementary || schools?.junior) credits.push(`学区の${schoolCredit(schools)}。`);
    if (stations?.length) credits.push(`駅の${STATION_CREDIT}。`);
    if (pois?.length) credits.push(`周辺施設は${POI_SOURCES}を加工して作成${stations?.length ? "" : `。${ROAD_CREDIT}`}。`);
    foot.push("", "■ 出典", ...credits.map((c) => `・${c}`));
  } else {
    const names = [
      zoning && "都市計画決定GISデータ（国土交通省）",
      (p || withParcels) && "登記所備付地図データ（法務省）",
      hazard && "ハザードマップポータルサイト（国土交通省・国土地理院）",
      (zoning?.morido || zoning?.hourei || zoning?.tochi || landPrice?.length || schools || stations?.length) && "国土数値情報（国土交通省）",
      (stations?.length || pois?.length || schools) && "地理院地図Vector（国土地理院）",
      (stations?.length || pois?.length) && "© OpenStreetMap contributors（ODbL）",
    ].filter(Boolean);
    if (names.length) foot.push(`※出典：${names.join("・")}を加工して作成。くわしい出典は「詳しく」の文面に入ります。`);
  }
  return { title: "物件調査の結果", head, sections, foot };
}
