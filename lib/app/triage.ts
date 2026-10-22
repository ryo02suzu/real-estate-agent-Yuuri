// 物件を調べた結果を並べる前に出す「この物件で問題になりそうな所」と「次にやること」。
// 読んだデータ（都市計画・道路・筆・ハザード・建物・国の地点データ）から、取引や建築に効きそうな所（要注意）と、データだけでは
// 分からず確かめないといけない所（要確認）を拾い、確かめる窓口ごとに「何を・どこで・どうやって」をまとめる。
// どれも参考で、法令の判断（再建築の可否など）はしない。画面の見た目は持たず（文字と並びだけ）、スマホ・PC・共有の文・印刷から同じものを使う
import { ASK, BRING } from "../inquiry";
import type { LookupResult } from "../roadmap";
import type { BuildingResult } from "../roadmap/building";
import { CHIBANZU_NOTE, chibanzuFor } from "../roadmap/chibanzu";
import { groupHazardMaps, HAZARD_MAP_LABELS, HAZARDS, wagamachiUrl, type HazardKind, type HazardMaps, type HazardReport, type LayerHit } from "../roadmap/hazard";
import { HOUREI_LAWS, houreiGroups, houreiOffice, houreiOfficeAll, PREF_NAMES, type Hourei, type HoureiKind } from "../roadmap/hourei";
import { isekiFor } from "../roadmap/iseki";
import type { Liquefaction } from "../roadmap/liquefaction";
import { moridoAuthority, type Morido } from "../roadmap/morido";
import { hasPieceMark, kuikiLabel, neighborList, registryChiban, type Parcel } from "../roadmap/parcel";
import { PARCEL_DATA } from "../roadmap/parcel-data";
import type { RirekiRecord } from "../roadmap/rireki";
import { roadShort, type NearbyRoad } from "../roadmap/road-read";
import { suidoFor } from "../roadmap/suido";
import { tochiCheck, type Tochi } from "../roadmap/tochi";
import { contactName, NO_CITY_GAS, NO_SEWER, utilitiesFor, type UtilityContact } from "../roadmap/utilities";
import type { Zoning, ZoningStatus } from "../roadmap/zoning";
import type { Zousei } from "../roadmap/zousei";
import { roadWidthOf } from "./legal";

type Ok = Extract<LookupResult, { status: "ok" }>;

/** 読み込みの状態（画面の部品の state と同じ形。none はその地点・市区町村にデータが無い） */
export type State<T> = { status: "loading" } | { status: "error" } | { status: "none" } | ({ status: "ok" } & T);

export type TriageInput = {
  result: Ok;
  zoning: State<{ zoning: Zoning; st?: ZoningStatus; morido?: Morido; hourei?: Hourei; tochi?: Tochi }>;
  /** kind：どうやって決めた筆か。neighbors：隣の筆の地番（登記の地番）。approximate：町の中心なので筆を探していない */
  parcels: { status: "loading" } | { status: "error" } | { status: "none"; approximate?: boolean } | { status: "ok"; parcel: Parcel; kind: "chiban" | "picked" | "address"; neighbors: string[] };
  roads: State<{ roads: NearbyRoad[] }>;
  hazard: State<{ report: HazardReport; maps: HazardMaps; muniCd: string }>;
  building: State<{ result: BuildingResult }>;
  liq?: State<{ value: Liquefaction | null }>;
  zousei?: State<{ value: Zousei }>;
  rireki?: State<{ value: RirekiRecord[] }>;
};

/** 要注意：データで制限・危険が見つかった。要確認：データが無い・参考なので、確かめないと分からない */
export type Level = "warn" | "check";

export type Topic = "place" | "road" | "zoning" | "law" | "hazard" | "building" | "utility";

export type Issue = {
  id: string;
  level: Level;
  topic: Topic;
  /** 「市街化調整区域」 */
  title: string;
  /** 取引・建築にどう効くか（1〜2文） */
  detail: string;
  /** どこで確かめるか（短く） */
  confirm?: string;
};

export type Link = { label: string; url: string };

/** 次にやることの1つ（窓口・場所ごと） */
export type Action = {
  /** やることの印（端末に「済」を保存するときの鍵。窓口の種類ごとに固定） */
  id: string;
  /** 1：必ず。2：この物件では必要。3：念のため */
  priority: 1 | 2 | 3;
  /** 「道路種別を確かめる」 */
  title: string;
  /** 窓口・場所（「渋谷区 都市整備部 建築課 調査係」「法務局」「現地」） */
  where: string;
  /** 確かめること */
  what: string[];
  /** 連絡の仕方・注意（「電話では答えてもらえない。窓口で確認」） */
  how?: string;
  phone?: string;
  links?: Link[];
  /** 持っていくもの */
  bring?: string[];
};

export type Triage = {
  /** 要注意を先に、次に要確認 */
  issues: Issue[];
  /** 優先の順 */
  actions: Action[];
  /** まだ読んでいるデータ（これが空になるまで「問題なし」とは言わない） */
  pending: string[];
  /** 読めなかったデータ */
  failed: string[];
  /** 「要注意 2件・要確認 5件」「確認中」 */
  headline: string;
};

const meters = (d: number) => `約${Math.max(1, Math.round(d))}m`;

/** 市の担当課の言い方（道路種別の窓口が分かっていれば、都市計画の担当もその市の中） */
const dept = (m: Ok["municipality"], role: string) => `${m.name}の${role}の担当課`;

/** 最初の道路（地点にいちばん近い道路）の種別から見る注意 */
function roadIssues(roads: NearbyRoad[]): Issue[] {
  const out: Issue[] = [];
  const r = roads[0];
  if (!r) return out;
  const s = roadShort(r.label);
  const where = r.direction === "地点上" ? "地点の上の道路" : `${r.direction}側の道路（${meters(r.distance)}）`;
  if (/^2項/.test(s))
    out.push({
      id: "road-2kou",
      level: "warn",
      topic: "road",
      title: "前面道路が2項道路（幅4m未満）の可能性",
      detail: `${where}は市の地図で「${r.label}」。建て替えのときは道路の中心から2mまで下がる（セットバック）必要があり、その分は敷地面積に入りません。`,
      confirm: "セットバックの位置・距離と中心線の確定を窓口で",
    });
  else if (/法定外|未判定/.test(s) || /道路以外|非道路|指定外|法外|42条以外|43条/.test(r.label.normalize("NFKC")))
    out.push({
      id: "road-not-road",
      level: "warn",
      topic: "road",
      title: "前面道路が建築基準法の道路でない可能性",
      detail: `${where}は市の地図で「${r.label}」。建築基準法の道路に2m以上接していないと、原則として建物を建てられません（43条）。許可（43条2項）の例があるかも含めて窓口で確かめてください。`,
      confirm: "接道の扱いを建築指導の窓口で",
    });
  else if (/5号/.test(s) || /位置指定/.test(r.label))
    out.push({
      id: "road-shitei",
      level: "check",
      topic: "road",
      title: "前面道路が位置指定道路（私道）の可能性",
      detail: `${where}は市の地図で「${r.label}」。私道なら、所有者と通行・掘削の承諾、指定の幅員どおりに整備されているかを確かめます。`,
      confirm: "指定図面の写しと所有者を窓口・登記で",
    });
  else if (/予定道路/.test(s))
    out.push({ id: "road-yotei", level: "check", topic: "road", title: "前面道路が予定道路", detail: `${where}は市の地図で「${r.label}」。道路としての扱いを窓口で確かめてください。` });
  const w = roadWidthOf(r.width);
  if (w !== undefined && w < 4 && !/^2項/.test(s))
    out.push({
      id: "road-narrow",
      level: "warn",
      topic: "road",
      title: `前面道路の幅員が4m未満（${r.width}）`,
      detail: "幅4m未満の道路は、セットバックや建築の制限がかかることがあります。現況の幅と道路の種別をあわせて確かめてください。",
    });
  return out;
}

/** 浸水の種類（洪水・内水・高潮・津波）の注意。浸水深 0.5m 以上（床上）は要注意、それ未満・近くは要確認 */
function depthIssue(kind: "flood" | "naisui" | "takashio" | "tsunami", hits: LayerHit[]): Issue | undefined {
  const name = HAZARDS[kind].short;
  const at = hits.filter((h) => h.at).sort((a, b) => b.at!.rank - a.at!.rank)[0]?.at;
  if (at) {
    const deep = at.rank >= 3;
    return {
      id: `hazard-${kind}`,
      level: deep ? "warn" : "check",
      topic: "hazard",
      title: `${name}の浸水想定区域（${at.label}）`,
      detail: `国のデータ（想定最大規模）で${at.label}の浸水が想定されています。${deep ? "床上浸水のおそれがある深さです。" : ""}重要事項説明では市区町村のハザードマップで所在地を示します。`,
      confirm: "市区町村のハザードマップで",
    };
  }
  const near = hits.filter((h) => h.near).sort((a, b) => a.near!.distance - b.near!.distance)[0]?.near;
  if (near)
    return {
      id: `hazard-${kind}-near`,
      level: "check",
      topic: "hazard",
      title: `${name}の想定区域が${meters(near.distance)}先`,
      detail: `地点は区域の外ですが、${meters(near.distance)}先に${near.cls.label}の区域があります。敷地の形や位置の誤差で区域に入ることがあります。`,
      confirm: "市区町村のハザードマップで",
    };
  return undefined;
}

function hazardIssues(report: HazardReport): Issue[] {
  const out: Issue[] = [];
  const ok = (k: HazardKind) => {
    const r = report[k];
    return r?.status === "ok" ? r : undefined;
  };
  for (const k of ["flood", "naisui", "takashio", "tsunami"] as const) {
    const r = ok(k);
    if (!r) continue;
    const i = depthIssue(k, r.hits);
    if (i) out.push(i);
    else if (k === "naisui" && r.noData)
      out.push({ id: "hazard-naisui-nodata", level: "check", topic: "hazard", title: "内水（雨水出水）は国のデータなし", detail: "市区町村が国にデータを出していないため、内水の浸水想定は市区町村の内水ハザードマップで確かめます。", confirm: "市区町村の内水ハザードマップで" });
  }
  const kaoku = ok("kaoku");
  if (kaoku?.hits.some((h) => h.at))
    out.push({ id: "hazard-kaoku", level: "warn", topic: "hazard", title: "家屋倒壊等氾濫想定区域", detail: "洪水のとき、家屋が倒壊・流失するおそれがある区域です（氾濫流・河岸侵食）。", confirm: "市区町村のハザードマップで" });
  const keizoku = ok("keizoku");
  const kz = keizoku?.hits.filter((h) => h.at).sort((a, b) => b.at!.rank - a.at!.rank)[0]?.at;
  if (kz && kz.rank >= 4) out.push({ id: "hazard-keizoku", level: "warn", topic: "hazard", title: `浸水継続時間 ${kz.label}`, detail: "洪水のとき、長く浸水が続くと想定されている地点です。", confirm: "市区町村のハザードマップで" });
  const dosha = ok("dosha");
  if (dosha) {
    const at = dosha.hits.filter((h) => h.at).sort((a, b) => b.at!.rank - a.at!.rank)[0];
    if (at?.at)
      out.push({
        id: "hazard-dosha",
        level: "warn",
        topic: "hazard",
        title: `土砂災害${at.at.label}（${at.layer.name}）`,
        detail: at.at.rank >= 3 ? "特別警戒区域では、建物の構造の制限や宅地の売買のときの届出などがあります。重要事項説明の対象です。" : "警戒区域は重要事項説明の対象です。区域の指定は都道府県の公表図で確かめます。",
        confirm: "都道府県の公表図・市区町村の窓口で",
      });
    else {
      const near = dosha.hits.filter((h) => h.near).sort((a, b) => a.near!.distance - b.near!.distance)[0];
      if (near?.near)
        out.push({ id: "hazard-dosha-near", level: "check", topic: "hazard", title: `土砂災害の区域が${meters(near.near.distance)}先`, detail: `地点は区域の外ですが、${meters(near.near.distance)}先に${near.layer.name}の${near.near.cls.label}があります。`, confirm: "都道府県の公表図で" });
    }
  }
  return out;
}

/** 都市計画・法令の注意 */
function zoningIssues(result: Ok, z: Zoning, st: ZoningStatus | undefined, morido?: Morido, hourei?: Hourei, tochi?: Tochi): Issue[] {
  const out: Issue[] = [];
  const m = result.municipality;
  const flag = (l: keyof ZoningStatus["layers"]) => (st ? st.layers[l] : 0);
  const y = z.youto[0];
  if (z.senbiki === "市街化調整区域")
    out.push({
      id: "senbiki",
      level: "warn",
      topic: "zoning",
      title: "市街化調整区域",
      detail: "市街化を抑える区域で、原則として建築や開発に都道府県・市の許可が要ります。建てられる用途・既存の宅地の扱いを先に確かめないと、売れない・建てられない土地のことがあります。",
      confirm: "開発許可の担当で、建築の可否と条件を",
    });
  if (!z.tokei && !z.jyuntoshi && (st && flag("tokei") === 1))
    out.push({ id: "outside", level: "check", topic: "zoning", title: "都市計画区域の外", detail: "接道義務（建築基準法43条）や用途地域の制限は原則かかりませんが、建築確認が要る建物かどうかなど、扱いを市で確かめてください。", confirm: "市の建築・都市計画の担当で" });
  if (z.road !== undefined)
    out.push({ id: "plan-road", level: "warn", topic: "zoning", title: "都市計画道路が近い", detail: `中心線まで${meters(z.road)}。計画線にかかる部分には建築の制限があり、将来の収用の可能性もあります（都市計画法53条）。`, confirm: "計画線の位置と事業の予定を都市計画の担当で" });
  const near = z.youtoNear[0];
  if (near) out.push({ id: "youto-near", level: "warn", topic: "zoning", title: "用途地域の境目が近い", detail: `${meters(near.distance)}先で${near.name}に変わります。敷地がまたがると、面積の割合で建ぺい率・容積率が決まります。`, confirm: "都市計画図で境目の位置を" });
  for (const p of z.others.filter((o) => o.layer === "chikukei"))
    out.push({ id: "chikukei", level: "warn", topic: "zoning", title: `地区計画${p.name ? `「${p.name}」` : ""}の区域`, detail: "用途・高さ・壁面の位置・最低敷地面積などに独自のルールがあることがあります。", confirm: "市の地区計画の図書で" });
  if (z.bouka === "防火地域") out.push({ id: "bouka", level: "warn", topic: "zoning", title: "防火地域", detail: "階数3以上か延べ面積100㎡超は耐火建築物等にする必要があり、建築費に効きます（建築基準法61条）。" });
  if (z.koudoti) out.push({ id: "koudoti", level: "check", topic: "zoning", title: "高度地区の指定", detail: "建物の高さの上限や北側の斜線が加わります。種類（第1種・第2種など）はデータに無いので、都市計画図で確かめます。", confirm: "市の都市計画図で" });
  if (y && (!y.bcr || !y.far)) out.push({ id: "ratio", level: "check", topic: "zoning", title: "建ぺい率・容積率がデータに無い", detail: "市のデータに数値が入っていません。都市計画図・窓口で確かめてください。", confirm: "市の都市計画の担当で" });
  if ((z.tokei || z.jyuntoshi) && !y && z.senbiki !== "市街化調整区域" && flag("youto") === 0)
    out.push({ id: "youto-nodata", level: "check", topic: "zoning", title: "用途地域のデータが無い", detail: `${m.name}の用途地域は国のデータにありません。都市計画図で確かめてください。`, confirm: "市の都市計画図で" });

  if (morido?.area)
    out.push({ id: "morido", level: "warn", topic: "law", title: morido.area.kind, detail: `盛土・切土などの工事に許可や届出が要ります（盛土規制法）。区域の指定は${morido.authority}。国のデータの概略の区域なので、指定した${morido.authority}の資料で確かめます。`, confirm: `${morido.authority}の盛土規制法の担当で` });
  if (hourei) {
    const pref = PREF_NAMES[hourei.pref];
    for (const g of houreiGroups(hourei.hits))
      out.push({
        id: `hourei-${g.kind}`,
        level: "warn",
        topic: "law",
        title: g.kind,
        detail: `${g.text}。工事や建築に許可・制限があり、重要事項説明の対象です（${HOUREI_LAWS[g.kind].law}）。国のデータの概略の区域なので、指定の図面で確かめます。`,
        confirm: `${houreiOffice(g.kind, g.kind === "災害危険区域" ? `${pref}・${m.name}` : pref, g.hits[0]?.office)}で`,
      });
    if (hourei.missing.length)
      out.push({ id: "hourei-missing", level: "check", topic: "law", title: `${hourei.missing.join("・")}は国のデータに無い`, detail: `${pref}の${hourei.missing.join("・")}は国のデータに入っていないので、区域に入るかは${houreiOfficeAll(hourei.missing, pref)}で確かめます。` });
  }
  if (tochi) {
    if (tochi.park && tochi.park !== "普通地域") out.push({ id: "park", level: "warn", topic: "law", title: `自然公園の${tochi.park}`, detail: "建物の新築・増築などに許可が要ります（自然公園法）。", confirm: "都県の自然公園の担当で" });
    else if (tochi.park) out.push({ id: "park-futsu", level: "check", topic: "law", title: "自然公園の普通地域", detail: "一定の規模の工作物の新築などに届出が要ります（自然公園法）。", confirm: "都県の自然公園の担当で" });
    if (tochi.agri === "農用地区域") out.push({ id: "agri", level: "warn", topic: "law", title: "農業振興地域の農用地区域", detail: "農地以外にすること（転用）は原則できません（農振法）。住宅を建てるには区域からの除外が要ります。", confirm: `${m.name}の農業委員会で` });
    else if (tochi.agri) out.push({ id: "agri-shinko", level: "check", topic: "law", title: "農業振興地域（農用地区域の外）", detail: "農地なら転用の許可（農地法）が要ります。地目と農用地区域かどうかを確かめます。", confirm: `${m.name}の農業委員会で` });
    if (tochi.forest === "保安林") out.push({ id: "forest", level: "warn", topic: "law", title: "保安林", detail: "木を切ったり、土地の形を変えるのに許可が要ります（森林法）。", confirm: "都県の森林の担当で" });
    else if (tochi.forest) out.push({ id: "forest-plan", level: "check", topic: "law", title: tochi.forest, detail: "一定の面積の開発や伐採に許可・届出が要ります（森林法）。", confirm: tochi.forest === "国有林" ? "森林管理署で" : `${m.name}の林務の担当で` });
  }
  return out;
}

/** 場所の確かさ・筆（地番）の注意 */
function placeIssues(input: TriageInput): Issue[] {
  const { result, parcels } = input;
  const out: Issue[] = [];
  const m = result.municipality;
  if (result.parcelMiss) {
    const r = result.parcelMiss;
    out.push({
      id: "parcel-miss",
      level: "check",
      topic: "place",
      title: `地番 ${r.chiban} が見つからない`,
      detail: r.reason === "not_found" ? `${PARCEL_DATA.edition}の地図に見つかりません。分筆・合筆で地番が変わったか、小字が違う可能性があります。${r.similar.length ? `近い地番：${r.similar.slice(0, 4).join("・")}。` : ""}` : r.reason === "no_map" ? "この地域は登記所の地図データがありません。" : "地図データを読み込めませんでした。",
      confirm: "法務局の公図・登記で地番と位置を",
    });
  } else if (result.approximate) out.push({ id: "approximate", level: "check", topic: "place", title: "番地が見つからず、町の中心を表示", detail: "この地点のデータ（用途地域・ハザードなど）は物件の場所のものではないことがあります。地図で物件の場所を選び直してください。", confirm: "「場所を直す」で物件の位置を" });
  if (parcels.status === "ok") {
    const p = parcels.parcel;
    if (parcels.kind === "address") {
      const raw = p.chibanRaw;
      if (/^(道|水)/.test(raw)) out.push({ id: "on-road", level: "check", topic: "place", title: `住所の地点が${/^水/.test(raw) ? "水路" : "道路"}の上`, detail: "住所の点が建物の入口側に置かれているためです。物件の土地の地番は、地番で探すか、地図で建物の位置を選ぶと出ます。", confirm: "地番で探し直す・場所を直す" });
      else if (parcels.neighbors.length >= 30) out.push({ id: "off-lot", level: "check", topic: "place", title: `住所の地点の筆（地番 ${registryChiban(raw)}）は隣地が${parcels.neighbors.length}筆`, detail: "道路など物件の外の土地の可能性があります。この筆の面積・隣地は物件のものではないかもしれません。", confirm: "公図で物件の筆を" });
      else out.push({ id: "address-parcel", level: "check", topic: "place", title: `住所の地点の筆は地番 ${registryChiban(raw)}（参考）`, detail: "住居表示の住所と地番は別のものです。物件の土地がこの筆かどうかは、公図・登記で確かめます。", confirm: "法務局の公図・登記で" });
    }
    if (p.estimated) out.push({ id: "estimated", level: "check", topic: "place", title: `筆の位置は公図から推定${p.estimated === "low" ? "（確度低）" : ""}`, detail: `この辺りの登記所の地図は公図（任意座標）です。公図の形を道路の縁に合わせて置いた推定の位置なので、${p.estimated === "low" ? "5m前後" : "数m"}ずれて隣の筆の地番になることがあります。`, confirm: "法務局の公図で" });
    if (p.sanko) out.push({ id: "sanko", level: "check", topic: "place", title: "市町村の地番参考図の筆", detail: `${p.undetermined ? "登記所の地図では筆界未定地です。" : ""}参考図は登記の地番・筆の形と違うことがあります。`, confirm: "法務局の公図・登記で" });
    if (/^筆界未定/.test(p.chibanRaw)) out.push({ id: "undetermined", level: "warn", topic: "place", title: "筆界未定地", detail: "隣の筆との境界が決まっていない土地です。境界の確定（筆界特定・測量）が要ることがあり、融資や売買に効きます。", confirm: "法務局の公図・登記で" });
    if (hasPieceMark(p.chibanRaw) && p.chibanRaws && p.chibanRaws.length > 1) out.push({ id: "pieces", level: "check", topic: "place", title: `地図データでは${p.chibanRaws.length}つの区画に分かれた筆`, detail: `地番 ${registryChiban(p.chibanRaw)} は地図データで「${p.chibanRaws.join("」「")}」に分かれています（登記の地番は1つ）。面積は区画を合わせたものです。`, confirm: "公図・地積測量図で" });
  } else if (parcels.status === "none" && !parcels.approximate && !result.parcelMiss) {
    const chibanzu = chibanzuFor(m, result.lat, result.lng);
    out.push({ id: "no-parcel", level: "check", topic: "place", title: "この地点の筆が地図データに無い", detail: `登記所の地図データにこの地点の筆がありません（データの無い地域か、道路・河川など）。${chibanzu ? `${m.name}の${chibanzu.name}で地番を確かめられます。` : ""}`, confirm: "法務局の公図で" });
  } else if (parcels.status === "error") out.push({ id: "parcel-error", level: "check", topic: "place", title: "地番の地図データを読めなかった", detail: "通信の問題で筆を読めませんでした。時間をおいて調べ直してください。" });
  return out;
}

/** 国のデータの地点の注意（液状化・大規模盛土造成地・災害履歴） */
function groundIssues(input: TriageInput): Issue[] {
  const out: Issue[] = [];
  const liq = input.liq?.status === "ok" ? input.liq.value : undefined;
  if (liq && liq.level <= 2) out.push({ id: "liq", level: "warn", topic: "hazard", title: `液状化${liq.label.replace(/^液状化/, "")}（${liq.landform}）`, detail: "地形から見た液状化の起きやすさの目安です。地盤調査や都道府県・市区町村の液状化マップで確かめてください。", confirm: "市区町村の液状化マップ・地盤調査で" });
  else if (liq && liq.level === 3) out.push({ id: "liq-mid", level: "check", topic: "hazard", title: `液状化がやや起きやすい地形（${liq.landform}）`, detail: "地形から見た目安です。地盤調査や市区町村の液状化マップで確かめてください。", confirm: "市区町村の液状化マップで" });
  const zs = input.zousei?.status === "ok" ? input.zousei.value : undefined;
  if (zs?.inside) {
    const a = zs.areas[0];
    out.push({ id: "zousei", level: "warn", topic: "hazard", title: `大規模盛土造成地の中${a?.kind && a.kind !== "区分なし" ? `（${a.kind}）` : ""}`, detail: "安全性の確認が必要な盛土造成地です（直ちに危険というものではありません）。擁壁・地盤の状況と、市区町村の大規模盛土造成地マップを確かめてください。", confirm: "市区町村の大規模盛土造成地マップで" });
  } else if (zs && zs.areas.length) out.push({ id: "zousei-near", level: "check", topic: "hazard", title: `大規模盛土造成地が${meters(zs.areas[0].distance)}先`, detail: "敷地の位置の誤差で造成地に入ることがあります。市区町村の大規模盛土造成地マップで確かめてください。", confirm: "市区町村の大規模盛土造成地マップで" });
  const rs = input.rireki?.status === "ok" ? input.rireki.value.filter((r) => r.inside || r.distance <= 50) : [];
  if (rs.length) out.push({ id: "rireki", level: "check", topic: "hazard", title: `過去の災害の記録：${rs.map((r) => `${r.when} ${r.label}`).slice(0, 3).join("・")}`, detail: "国土調査（土地履歴調査）の記録です。記録の無い地域もあります。", confirm: "市区町村の防災の資料で" });
  return out;
}

function buildingIssues(input: TriageInput): Issue[] {
  const b = input.building.status === "ok" ? input.building.result.hit : undefined;
  if (!b) return [];
  const y = b.building.year;
  if (y !== undefined && y <= 1981) return [{ id: "old-building", level: "warn", topic: "building", title: `建物の建築年が${y}年（旧耐震基準の可能性）`, detail: "1981年5月以前に確認を受けた建物は旧耐震基準の可能性があります。検査済証・建築計画概要書と、耐震診断の有無を確かめてください。", confirm: "建築計画概要書を建築指導の窓口で" }];
  return [];
}

function utilityIssues(result: Ok): Issue[] {
  const u = utilitiesFor(result.municipality);
  const out: Issue[] = [];
  if (u?.sewer && u.sewer.length === 0) out.push({ id: "no-sewer", level: "warn", topic: "utility", title: "公共下水道の無い市町村", detail: `${NO_SEWER}。浄化槽の設置・維持の費用がかかります。`, confirm: `${result.municipality.name}の担当で排水の方法を` });
  if (u?.gas && u.gas.length === 0) out.push({ id: "no-gas", level: "check", topic: "utility", title: "都市ガスの供給区域の外", detail: `${NO_CITY_GAS}。`, confirm: "売主・ガスの販売店で" });
  return out;
}

const COVERAGE_ISSUE: Record<Ok["municipality"]["coverage"], Issue | undefined> = {
  full: undefined,
  partial: { id: "coverage-partial", level: "check", topic: "road", title: "道路種別はネットで一部しか分からない市", detail: "位置指定道路など一部の種別だけが地図で分かります。載っていない道路は窓口で確かめます。", confirm: "建築指導の窓口で" },
  none: { id: "coverage-none", level: "check", topic: "road", title: "道路種別はネット非公開の市", detail: "前面道路の建築基準法上の種別は、窓口で確かめるしかありません（再建築の可否・セットバックに直結します）。", confirm: "建築指導の窓口で" },
  outside: { id: "coverage-outside", level: "check", topic: "road", title: "都市計画区域の無い市町村", detail: "接道義務（建築基準法43条）は原則かかりませんが、建築の扱いは市町村で確かめてください。", confirm: "市町村の建築の担当で" },
};

/** 次にやること */
function buildActions(input: TriageInput, issues: Issue[]): Action[] {
  const { result } = input;
  const m = result.municipality;
  const c = result.contact;
  const has = (id: string) => issues.some((i) => i.id === id);
  const out: Action[] = [];

  // 1. 道路種別（MICHILU の中心。重説の「敷地と道路の関係」）
  {
    const maps = result.links.filter((l) => l.kind !== "public_road");
    const what = [...ASK];
    if (has("road-2kou")) what.unshift("2項道路のセットバックの位置・距離（中心線の確定の有無）");
    if (has("road-not-road")) what.unshift("建築基準法の道路に接しているか。接していなければ43条2項の許可（認定）の見込み");
    if (has("road-shitei")) what.unshift("位置指定道路の指定番号・指定図面の写し。私道の所有者と承諾の要否");
    const deptName = c ? (/^(東京都|\S{2,3}県)\s/.test(c.dept) ? c.dept : `${m.name} ${c.dept}`) : dept(m, "建築指導（道路種別）");
    // 窓口の注意（市のデータの備考があればそれを、無ければ電話の可否だけ）
    const phoneNote = c?.note ? `${c.note.replace(/[。．]?$/, "")}。` : c?.noPhoneInquiry ? "電話では答えてもらえません（窓口・FAX・メール）。" : "";
    const how =
      m.coverage === "none"
        ? `ネットでは非公開。${c?.noPhoneInquiry ? "電話では答えてもらえないので、窓口（FAX・メールの可否は要確認）で確かめます。" : "窓口か電話で確かめます。"}${c?.note && !c.noPhoneInquiry ? phoneNote : ""}`
        : m.coverage === "outside"
          ? "都市計画区域の外なので接道義務は原則ありませんが、建築の扱いを市町村で確かめます。"
          : `まず${m.coverage === "full" ? "市の地図で種別を見てから" : "市の地図で分かる種別を見てから"}、重説には窓口で道路台帳・指定道路調書を確かめます。${phoneNote}`;
    out.push({
      id: "road",
      priority: 1,
      title: "前面道路の種別と幅員を確かめる",
      where: deptName,
      what,
      how,
      phone: c?.phone,
      links: maps.map((l) => ({ label: l.label, url: l.url })),
      bring: BRING,
    });
  }

  // 2. 市街化調整区域：建てられるかを先に
  if (has("senbiki"))
    out.push({
      id: "chosei",
      priority: 1,
      title: "市街化調整区域で建てられるかを確かめる",
      where: dept(m, "開発許可（都市計画）"),
      what: ["この土地に建築できるか（既存宅地・分家住宅・線引き前宅地などの扱い）", "建てられる用途・規模と、許可（都市計画法43条・34条）の要否", "既存の建物の再建築の可否"],
      how: "口頭で聞いた内容は書面（相談の記録）で残してもらうと安心です。",
    });

  // 3. 法務局：謄本・公図（地番が分かっていれば、物件と隣地）
  {
    const p = input.parcels.status === "ok" ? input.parcels : undefined;
    const numbered = p && /^\d/.test(p.parcel.chibanRaw) ? `${kuikiLabel(p.parcel.kuiki)} ${registryChiban(p.parcel.chibanRaw)}` : undefined;
    const what = [
      numbered ? `登記事項証明書（土地）：${p?.kind === "address" ? `住所の地点の筆 ${numbered}（参考。物件の筆かを確認）` : numbered}。所有者・地目・地積・抵当権` : "登記事項証明書（土地・建物）：所有者・地目・地積・抵当権（地番は売主・公図で確認）",
      "公図：筆の形・接道・隣地との位置関係。公図と地図のずれ",
      "地積測量図（あれば）：境界・面積の根拠",
      // 隣地は、物件の筆が分かっているときだけ（道路・水路の筆や、隣地のとても多い筆の隣は物件の隣地ではない）
      ...(numbered && p && p.neighbors.length && !(p.kind === "address" && p.neighbors.length >= 30) ? [`隣地の地番（境界の確認・承諾の相手${p.kind === "address" ? "。住所の地点の筆の隣なので参考" : ""}）：${neighborList(p.neighbors, 10)}`] : []),
    ];
    const chibanzu = chibanzuFor(m, result.lat, result.lng);
    out.push({
      id: "touki",
      priority: 1,
      title: "謄本・公図を取る",
      where: "法務局（登記情報提供サービスでも可）",
      what,
      how: "登記情報提供サービスはネットで即日（有料・要登録）。証明書が要るときは法務局の窓口か郵送。",
      links: [{ label: "登記情報提供サービス", url: "https://www1.touki.or.jp/" }, ...(chibanzu ? [{ label: `${chibanzu.name}（${CHIBANZU_NOTE.slice(0, 18)}…）`, url: chibanzu.url }] : [])],
    });
  }

  // 4. 都市計画（データが無い・注意があるとき）
  {
    const z = input.zoning.status === "ok" ? input.zoning : undefined;
    const needs = !z || ["outside", "plan-road", "youto-near", "chikukei", "koudoti", "ratio", "youto-nodata"].some(has);
    if (needs) {
      const what: string[] = [];
      if (!z) what.push("用途地域・建ぺい率・容積率・防火地域・高度地区（データを読めなかったので一式）");
      if (has("ratio")) what.push("建ぺい率・容積率の指定値");
      if (has("youto-nodata")) what.push("用途地域と建ぺい率・容積率");
      if (has("koudoti")) what.push("高度地区の種類と高さの制限");
      if (has("plan-road")) what.push("都市計画道路の計画線の位置と、事業の予定（建築の制限の範囲）");
      if (has("youto-near")) what.push("用途地域の境目の正確な位置（敷地がまたがるか）");
      if (has("chikukei")) what.push("地区計画の内容（用途・高さ・壁面の位置・最低敷地面積・届出）");
      if (has("outside")) what.push("都市計画区域の外での建築の扱い");
      out.push({ id: "toshi", priority: !z || has("ratio") || has("youto-nodata") ? 1 : 2, title: "都市計画の制限を確かめる", where: dept(m, "都市計画"), what, how: "都市計画図（縦覧）か窓口。多くの市は都市計画情報をネットでも公開しています。" });
    } else out.push({ id: "toshi", priority: 3, title: "都市計画の制限を確かめる", where: dept(m, "都市計画"), what: ["用途地域・建ぺい率・容積率・防火地域の指定値（データは概ねの位置。重説の数値は市の都市計画図で）"] });
  }

  // 5. 盛土規制法・土砂災害等の区域・自然公園など
  {
    const z = input.zoning.status === "ok" ? input.zoning : undefined;
    const md = z?.morido;
    if (md?.area || !z)
      out.push({
        id: "morido",
        priority: md?.area ? 1 : 2,
        title: "盛土規制法の区域を確かめる",
        where: `${md?.authority ?? moridoAuthority(m.codes[0])}の盛土規制法の担当課`,
        what: [md?.area ? `${md.area.kind}の指定（告示）と、工事の許可・届出の要否` : "宅地造成等工事規制区域・特定盛土等規制区域に入るか"],
        links: md?.link ? [md.link] : undefined,
      });
    const hr = z?.hourei;
    if (hr) {
      const pref = PREF_NAMES[hr.pref];
      const groups = houreiGroups(hr.hits);
      if (groups.length || hr.missing.length) {
        const kinds: HoureiKind[] = [...groups.map((g) => g.kind), ...hr.missing];
        out.push({
          id: "hourei",
          priority: groups.length ? 1 : 2,
          title: "砂防・急傾斜地・地すべり・災害危険区域を確かめる",
          where: houreiOfficeAll(kinds, kinds.includes("災害危険区域") ? `${pref}・${m.name}` : pref),
          what: [...groups.map((g) => `${g.kind}の指定の図面と、工事・建築の制限（${g.text}）`), ...(hr.missing.length ? [`${hr.missing.join("・")}に入るか（国のデータに無い）`] : [])],
        });
      }
    }
    const tc = z?.tochi;
    if (tc && (tc.park || tc.agri || tc.forest)) {
      const check = tochiCheck(tc, m.name);
      out.push({
        id: "tochi",
        priority: has("park") || has("agri") || has("forest") ? 1 : 2,
        title: "自然公園・農地・森林の規制を確かめる",
        where: check ?? "都県・市の担当",
        what: [...(tc.park ? [`自然公園の${tc.park}での建築の許可・届出`] : []), ...(tc.agri ? ["農用地区域かどうか。農地なら転用の許可（農地法）と除外の可否"] : []), ...(tc.forest ? [`${tc.forest}での開発・伐採の許可・届出（林地開発）`] : [])],
      });
    }
  }

  // 6. ハザードマップ（重説で所在地を示す市区町村の地図）
  {
    const h = input.hazard.status === "ok" ? input.hazard : undefined;
    const groups = h ? groupHazardMaps(h.maps) : [];
    const links: Link[] = groups.length ? groups.map((g) => ({ label: `${m.name}のハザードマップ（${g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}）`, url: g.url })) : [{ label: `${m.name}（わがまちハザードマップ）`, url: wagamachiUrl(h?.muniCd ?? m.codes[0]) }];
    const warned = issues.filter((i) => i.topic === "hazard" && i.level === "warn").map((i) => i.title);
    out.push({
      id: "hazard",
      priority: 1,
      title: "ハザードマップで所在地を示す",
      where: `${m.name}のハザードマップ（水防法の浸水想定区域図）`,
      what: ["洪水・内水・高潮・津波の浸水想定区域図で物件の所在地を示す（重要事項説明）", "土砂災害警戒区域に入るか", ...(warned.length ? [`国のデータで読んだ注意：${warned.join("、")}`] : [])],
      how: "国のデータで読んだ値は参考です。重説は市区町村の地図で。",
      links,
    });
  }

  // 7. 上下水道・ガス（重説の供給施設）
  {
    const u = utilitiesFor(m);
    const ledgers = suidoFor(m, result.lat, result.lng);
    const names = (list: UtilityContact[] | undefined, other: string) => (list?.length ? list.map(contactName).join("・") : other);
    const links: Link[] = [...ledgers.map((l) => ({ label: `${l.name}（${l.kind}の台帳）`, url: l.url })), ...[...(u?.water ?? []), ...(u?.sewer ?? []), ...(u?.gas ?? [])].map((x) => ({ label: `${contactName(x)}（${x.kind}）`, url: x.url }))];
    out.push({
      id: "utility",
      priority: 1,
      title: "上下水道・ガスの引込みを確かめる",
      where: `${names(u?.water, "水道局")}・${u?.sewer && u.sewer.length === 0 ? `${m.name}（浄化槽の担当）` : names(u?.sewer, "下水道の担当")}${u?.gas?.length ? `・${names(u.gas, "")}` : ""}`,
      what: ["前面道路の配水管の有無・口径と、敷地への引込み管（給水装置図）", u?.sewer && u.sewer.length === 0 ? NO_SEWER : "前面道路の下水道管（汚水・雨水）と公共ます。浄化槽の要否", u?.gas && u.gas.length === 0 ? `${NO_CITY_GAS}。ガスの種類と設備は売主・販売店で` : "都市ガスかプロパンガスか。前面道路のガス管の有無（都市ガスの導管事業者）", "私道・他人地を通る引込みなら、掘削・通行の承諾"],
      how: ledgers.length ? "台帳の地図をネットで下調べしてから、口径・引込みは窓口へ。" : "台帳の閲覧は窓口（市区町村・水道局）。",
      links,
    });
  }

  // 8. 埋蔵文化財
  {
    const ik = isekiFor(m, result.lat, result.lng);
    out.push({
      id: "iseki",
      priority: 2,
      title: "埋蔵文化財包蔵地かを確かめる",
      where: ik.office,
      what: ["周知の埋蔵文化財包蔵地（遺跡）に入るか。入るなら着工前の届出（文化財保護法93条）と試掘の可能性", ...(ik.note ? [ik.note] : [])],
      how: ik.map ? "遺跡地図はネットで下調べ。包蔵地かどうかの回答は教育委員会で。" : "教育委員会（文化財の担当）に住所・地番で照会。",
      links: ik.map ? [{ label: ik.map.name, url: ik.map.url }] : undefined,
    });
  }

  // 9. 建物：建築計画概要書・検査済証
  if (input.building.status === "ok" && input.building.result.hit)
    out.push({
      id: "building",
      priority: has("old-building") ? 1 : 2,
      title: "建物の確認申請・検査済証を確かめる",
      where: dept(m, "建築指導（建築計画概要書の閲覧）"),
      what: ["建築計画概要書の閲覧（建築年・用途・階数・確認番号）", "検査済証の有無（無ければ既存不適格・違反の可能性を確かめる）", ...(has("old-building") ? ["耐震診断・耐震改修の有無（旧耐震の可能性）"] : [])],
    });

  // 10. 現地
  out.push({
    id: "site",
    priority: 1,
    title: "現地で確かめる",
    where: "現地",
    what: ["前面道路の現況の幅（側溝・L字溝の位置）。4m未満ならセットバックの跡・隣の建て替えの後退位置", "境界標（杭・プレート）の有無と、塀・擁壁・越境（枝・配管・屋根）", "高低差・擁壁の状態（ひび・はらみ・水抜き）。盛土・切土の跡", "電柱・支線・水道やガスの引込みの位置。私道の舗装・通行の状況", "建物があれば外観の傾き・ひび、近隣の様子（騒音・においなど）"],
    bring: ["メジャー（道路の幅）", "住宅地図・公図の写し", "カメラ（前面道路・境界・擁壁を撮る）"],
  });

  return out.sort((a, b) => a.priority - b.priority);
}

const PENDING_LABELS: [keyof TriageInput, string][] = [
  ["zoning", "都市計画・法令"],
  ["parcels", "地番"],
  ["roads", "道路種別"],
  ["hazard", "ハザード"],
  ["building", "建物"],
  ["liq", "液状化"],
  ["zousei", "大規模盛土造成地"],
  ["rireki", "災害履歴"],
];

/** 読んだデータから、要注意・要確認と次にやることを出す */
export function triageOf(input: TriageInput): Triage {
  const { result } = input;
  const issues: Issue[] = [];
  issues.push(...placeIssues(input));
  const cov = COVERAGE_ISSUE[result.municipality.coverage];
  if (cov) issues.push(cov);
  if (input.roads.status === "ok") {
    issues.push(...roadIssues(input.roads.roads));
    if (!input.roads.roads.length && result.municipality.coverage !== "none") issues.push({ id: "road-none", level: "check", topic: "road", title: "50m以内に道路種別のデータが無い", detail: "市の地図データに、物件のまわりの道路の種別が入っていません。地図を直接見るか、窓口で確かめます。", confirm: "市の地図・建築指導の窓口で" });
  } else if (input.roads.status === "error") issues.push({ id: "road-error", level: "check", topic: "road", title: "道路種別のデータを読めなかった", detail: "市の地図データを読み込めませんでした。市の地図を直接開いて確かめてください。" });
  if (input.zoning.status === "ok") issues.push(...zoningIssues(result, input.zoning.zoning, input.zoning.st, input.zoning.morido, input.zoning.hourei, input.zoning.tochi));
  else if (input.zoning.status === "error") issues.push({ id: "zoning-error", level: "check", topic: "zoning", title: "都市計画のデータを読めなかった", detail: "用途地域・建ぺい率・容積率・防火地域などを読み込めませんでした。市の都市計画図で確かめてください。", confirm: "市の都市計画図で" });
  if (input.hazard.status === "ok") issues.push(...hazardIssues(input.hazard.report));
  else if (input.hazard.status === "error") issues.push({ id: "hazard-error", level: "check", topic: "hazard", title: "ハザードのデータを読めなかった", detail: "国のハザードマップのデータを読み込めませんでした。市区町村のハザードマップで確かめてください。", confirm: "市区町村のハザードマップで" });
  issues.push(...groundIssues(input));
  issues.push(...buildingIssues(input));
  issues.push(...utilityIssues(result));

  const order: Record<Level, number> = { warn: 0, check: 1 };
  const topics: Topic[] = ["place", "road", "zoning", "law", "hazard", "building", "utility"];
  issues.sort((a, b) => order[a.level] - order[b.level] || topics.indexOf(a.topic) - topics.indexOf(b.topic));

  const pending = PENDING_LABELS.filter(([k]) => (input[k] as { status?: string } | undefined)?.status === "loading").map(([, l]) => l);
  const failed = PENDING_LABELS.filter(([k]) => (input[k] as { status?: string } | undefined)?.status === "error").map(([, l]) => l);
  const warns = issues.filter((i) => i.level === "warn").length;
  const checks = issues.length - warns;
  const headline = pending.length && !issues.length ? "確認中" : `${warns ? `要注意 ${warns}件` : "要注意なし"}・要確認 ${checks}件${pending.length ? "（確認中あり）" : ""}`;
  return { issues, actions: buildActions(input, issues), pending, failed, headline };
}

/** 共有の文・印刷に出す行 */
export function triageLines(t: Triage, done: ReadonlySet<string> = new Set()): string[] {
  const lines: string[] = [];
  lines.push(`【要注意点】${t.headline}`);
  for (const i of t.issues) lines.push(`${i.level === "warn" ? "▲" : "・"}${i.title}${i.confirm ? `（${i.confirm}）` : ""}`);
  if (!t.issues.length) lines.push(t.pending.length ? `・${t.pending.join("・")}を確認中` : "・データで見つかった注意はありません（確かめる所は下の「次にやること」）");
  if (t.failed.length) lines.push(`・読めなかったデータ：${t.failed.join("・")}`);
  lines.push("【次にやること】");
  for (const a of t.actions) lines.push(`${done.has(a.id) ? "☑" : "□"}${a.title}：${a.where}${a.phone ? ` ${a.phone}` : ""}`, ...a.what.map((w) => `  ・${w}`));
  return lines;
}

export const TRIAGE_NOTE = "国・市のデータから MICHILU が拾った注意と確認先です。法令上の判断（再建築の可否など）はしません。重要事項説明は役所・法務局・現地で確かめてください。";
