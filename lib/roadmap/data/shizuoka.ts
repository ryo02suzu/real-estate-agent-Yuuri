// 静岡県 全35市町（2026-11 調査）。出典は docs/shizuoka-research.md。
// 特定行政庁は静岡・浜松・沼津・富士・富士宮・焼津の6市。限定特定行政庁は三島・御殿場・裾野・島田・藤枝・磐田・袋井・掛川・湖西の9市で、
// 静岡県ではこの9市も建築基準法上の道路（道路種別・指定道路図）を市が扱う（県の指定道路図の公開は土木事務所の管内だけ）。
// 残り20市町は県の5土木事務所（下田・熱海・沼津・島田・袋井）。松崎町・西伊豆町・川根本町は全域が都市計画区域外。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { arcgisExperienceAt, geocloud, geocloudMp, sonicweb, wagmap } from "../vendors";

const pref = "静岡県" as const;

/**
 * 静岡県GIS「建築基準法上の道路」（mp=101）。県が特定行政庁として所管する区域（土木事務所の管内）だけの参考図。
 * 1〜3号（県道・市町道。一部は最新でない）、4号（2014年3月31日時点）、5号・2項・特定通路・避難通路（2021年4月1日時点）。
 * geocloud 旧版と同じ ?mp=…&z=&ll= の形。県庁の位置で中心一致を確認
 */
const PREF_ROAD_MAP: MapLink = {
  kind: "road_type",
  label: "静岡県 建築基準法上の道路（県GIS・県所管の区域のみ）",
  build: geocloud("https://www.gis.pref.shizuoka.jp/", "mc=02&mp=101"),
  verified: true,
  tip: "4号は2014年3月末、5号・2項は2021年4月1日時点。それ以降の指定は土木事務所で",
};

const OFFICE: Record<string, Contact> = {
  shimoda: { dept: "静岡県 下田土木事務所 都市計画課", phone: "0558-24-2109" },
  atami: { dept: "静岡県 熱海土木事務所 都市計画課 建築班", phone: "0557-82-9191" },
  numazu: { dept: "静岡県 沼津土木事務所 建築住宅課 建築班", phone: "055-920-2224" },
  shimada: { dept: "静岡県 島田土木事務所 建築住宅課", phone: "0547-37-5273" },
  fukuroi: { dept: "静岡県 袋井土木事務所 建築住宅課", phone: "0538-42-3294" },
};

const PREF_NOTE = "県の地図は参考図で、4号は2014年3月末、5号・2項は2021年4月1日時点。それ以降の指定と色の無い道は土木事務所で確認。";

/** 県が扱う市町（土木事務所の管内）。県GISの参考図が見られる */
const prefTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_ROAD_MAP],
  contact: OFFICE[office],
  note: PREF_NOTE,
});

/** 全域が都市計画区域外の町（県「静岡県の土地利用」の市町別都市計画区域面積に区域が無い） */
const outsideTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: OFFICE[office],
  note: "全域が都市計画区域外（県の資料）。建築基準法6条1項4号の知事指定区域の有無と建築の扱いは土木事務所で確認。",
});

/** PDF の分割図で公開している市の入口ページ */
const pdfSheets = (kind: MapLink["kind"], label: string, url: string, tip: string): MapLink => ({ kind, label, build: null, url, verified: true, tip });

// --- 特定行政庁の6市 ---------------------------------------------------------

const CITIES: Municipality[] = [
  {
    pref,
    name: "静岡市",
    codes: ["22101", "22102", "22103"],
    coverage: "partial",
    maps: [
      {
        // しずマップ（geocloud 新版）の「建築基準法上の指定道路情報」（地図 500）。3号（官有地・民有地）・4号・5号・2項（官有地・民有地）・非道路
        kind: "road_type",
        label: "建築基準法上の指定道路情報（しずマップ・3号/4号/5号/2項）",
        build: geocloudMp("city.shizuoka.geocloud.jp", 500),
        verified: true,
      },
      { kind: "public_road", label: "道路台帳図情報（しずマップ・市道の路線名と幅員）", build: geocloudMp("city.shizuoka.geocloud.jp", 600), verified: true },
    ],
    contact: { dept: "都市局 建築部 建築安全推進課 管理係（道路台帳の閲覧）", phone: "054-221-1371", note: "道路種別の相談は狭あい道路係 054-221-1238（窓口は静岡庁舎）" },
    note: "地図に 1号（公道）は載っていない。市道かどうかは道路台帳図情報で見る。色の無い道と最新の指定は建築安全推進課で確認。",
  },
  {
    pref,
    name: "浜松市",
    codes: ["22138", "22139", "22140"],
    coverage: "full",
    // 浜松市地図情報サイト（wagmap）の指定道路図。凡例は 1号〜5号・2項・建築基準法外道路・判定保留道路（都市計画区域内、2026年8月31日時点）。市役所の南で中心一致
    maps: [{ kind: "road_type", label: "指定道路図（浜松市地図情報サイト・1号〜5号/2項/判定保留）", build: wagmap("hamamatsu", 65), verified: true }],
    contact: { dept: "都市整備部 建築行政課", phone: "053-457-2474" },
    contactByCode: {
      "22138": { dept: "都市整備部 建築行政課", phone: "053-457-2474" },
      "22139": { dept: "北部都市整備事務所（浜名区・天竜区）", phone: "053-585-1161" },
      "22140": { dept: "北部都市整備事務所（浜名区・天竜区）", phone: "053-585-1161" },
    },
    note: "地図は都市計画区域内のみ。黒・灰の線（未調査の道路）と判定保留の道は建築行政課で確認。",
  },
  {
    pref,
    name: "沼津市",
    codes: ["22203"],
    coverage: "partial",
    maps: [
      pdfSheets(
        "road_type",
        "指定道路図（PDF 43枚・2号/3号/4号/5号/2項）",
        "https://www.city.numazu.shizuoka.jp/shisei/office/ichiran/toshikei/jyutakuseisaku/shiteidourozu.htm",
        "一覧ページの索引図から物件の載っている番号の図を開く（2024年3月31日時点）",
      ),
    ],
    contact: { dept: "都市計画部 住宅政策課", phone: "055-934-4766" },
    note: "図に 1号（公道）は載っていない。最新の指定は住宅政策課で確認。",
  },
  {
    pref,
    name: "富士市",
    codes: ["22210"],
    coverage: "partial",
    // ふじタウンマップ（wagmap）の指定道路情報（mid=11）。市が指定した道路のおおよその位置
    maps: [{ kind: "designated_only", label: "指定道路情報（ふじタウンマップ・位置指定道路（5号）のみ）", build: wagmap("fujicity", 11), verified: true }],
    contact: { dept: "都市整備部 建築土地対策課（市庁舎7階）", phone: "0545-55-2903" },
    note: "地図に載るのは位置指定道路（5号）のおおよその位置だけ。ほかの種別は建築土地対策課で確認。",
  },
  { pref, name: "富士宮市", codes: ["22207"], coverage: "none", maps: [], contact: { dept: "都市整備部 建築住宅課 建築指導係", phone: "0544-22-1229" } },
  {
    pref,
    name: "焼津市",
    codes: ["22212"],
    coverage: "none",
    maps: [],
    contact: { dept: "都市政策部 建築住宅課 建築指導担当（本庁舎5階）", phone: "054-626-2161", note: "指定道路図は窓口で閲覧（ネット非公開）" },
  },
];

// --- 限定特定行政庁の9市（静岡県では道路種別も市が扱う） ---------------------

const LIMITED_CITIES: Municipality[] = [
  {
    pref,
    name: "三島市",
    codes: ["22206"],
    coverage: "partial",
    maps: [
      pdfSheets("road_type", "指定道路図（PDF 38枚・4号/5号/2項）", "https://www.city.mishima.shizuoka.jp/page/2249.html", "一覧ページの索引図から物件の載っている図を開く（2025年3月14日時点）。凡例と整合表も同じページ"),
      {
        kind: "public_road",
        label: "道路台帳図（三島市地図情報提供システム）",
        build: null,
        url: "https://webgis.alandis.jp/mishima22/portal/index.html",
        verified: false,
        tip: "2026年3月に公開された市のGIS。道路台帳図・上下水道台帳図（道路種別は載っていない）",
      },
    ],
    contact: { dept: "計画まちづくり部 住宅政策課 建築指導係", phone: "055-983-2644" },
    note: "図に 1号（公道）は載っていない。最新の指定は住宅政策課で確認。",
  },
  {
    pref,
    name: "御殿場市",
    codes: ["22215"],
    coverage: "partial",
    // ごてんばNAVI（wagmap、2026年3月運用開始）。建築基準法道路（mid=19）・道路台帳（mid=14）。市役所（萩原）で中心一致
    maps: [
      { kind: "road_type", label: "建築基準法道路（ごてんばNAVI・2号/3号/4号/5号/2項）", build: wagmap("gotembacity", 19), verified: true },
      { kind: "public_road", label: "道路台帳（ごてんばNAVI）", build: wagmap("gotembacity", 14), verified: true },
    ],
    contact: { dept: "都市建設部 建築住宅課", phone: "0550-82-4224" },
    note: "地図に 1号（公道）は載っていない。市道かどうかは道路台帳で見る。",
  },
  {
    pref,
    name: "裾野市",
    codes: ["22220"],
    coverage: "partial",
    maps: [
      pdfSheets("designated_only", "位置指定道路図（PDF 59枚・5号のみ）", "https://www.city.susono.shizuoka.jp/soshiki/6/1/3/6/14762.html", "一覧ページの全域図から物件の載っている番号の図を開く（2026年3月23日時点）"),
    ],
    contact: { dept: "建設部 都市計画課 建築住宅係（市役所2階）", phone: "055-995-1856" },
    note: "ネットで分かるのは位置指定道路（5号）だけ。2項道路などの種別は都市計画課で確認。",
  },
  {
    pref,
    name: "島田市",
    codes: ["22209"],
    coverage: "full",
    // 島田市わが街ガイド（wagmap）。建築基準法上の道路（mid=7）・道路台帳図（mid=8）。市役所（中央町）で中心一致
    maps: [
      { kind: "road_type", label: "建築基準法上の道路（島田市わが街ガイド・1号〜5号/2項/特定通路/法外道路）", build: wagmap("shimada", 7), verified: true },
      { kind: "public_road", label: "道路台帳図（島田市わが街ガイド）", build: wagmap("shimada", 8), verified: true },
    ],
    contact: { dept: "都市基盤部 建築住宅課", phone: "0547-36-7184" },
    note: "地図は概ねの位置と種類。正確な情報は建築住宅課の窓口で確認。",
  },
  {
    pref,
    name: "藤枝市",
    codes: ["22214"],
    coverage: "none",
    maps: [],
    contact: { dept: "都市建設部 建築住宅課（東館2階）", phone: "054-643-3481", note: "以前は県GISに載っていたが2024年5月に外れた。窓口で確認" },
  },
  {
    pref,
    name: "磐田市",
    codes: ["22211"],
    coverage: "partial",
    // いわたGIS（Sonicweb iwata）の指定道路情報（建築基準法）th_11。位置指定道路の図面もダウンロードできる。
    // Sonicweb は海外からの自動確認を 404 で拒むため、中心一致は未確認
    maps: [{ kind: "road_type", label: "指定道路情報（いわたGIS・建築基準法）", build: sonicweb("iwata", "th_11"), verified: false }],
    contact: { dept: "建設部 建築住宅課 建築グループ", phone: "0538-37-4899" },
    note: "地図は指定道路など種別の一部。色の無い道は建築住宅課で確認。",
  },
  {
    pref,
    name: "袋井市",
    codes: ["22216"],
    coverage: "full",
    maps: [
      {
        // どまんなか袋井navi（wagmap）の道路情報マップ（mid=3）に建築基準法指定道路図（2025年3月17日時点）。路線網図・道路台帳と同じ地図
        kind: "road_type",
        label: "建築基準法指定道路図（どまんなか袋井navi 道路情報マップ・1号/2号/3号/5号/2項）",
        build: wagmap("fukuroi", 3),
        verified: true,
        tip: "「レイヤ表示切替」で建築基準法指定道路図を表示（路線網図と重なると色が分かりにくい）",
      },
      pdfSheets("road_type", "指定道路図（PDF 61枚・1号/2号/3号/5号/2項）", "https://www.city.fukuroi.shizuoka.jp/soshiki/53/1/tatemono_shinsa/1548400898426.html", "全域図か町名リストで図郭番号を確かめて開く（2025年3月17日時点）"),
    ],
    contact: {
      dept: "都市建設部 建築住宅課 住宅土地対策室",
      phone: "0538-44-3123",
      note: "指定道路図の電話・FAX・メールでの問い合わせは不可。場所の分かる地図と公図を持って窓口へ",
      noPhoneInquiry: true,
    },
    note: "4号（計画道路）は載っていない。色の無い道（建築基準法外）でも道路法の道路で幅員4m以上なら1号になることがある。",
  },
  {
    pref,
    name: "掛川市",
    codes: ["22213"],
    coverage: "full",
    // ｅ－地図かけがわ（wagmap）。建築基準法指定道路マップ（mid=16）・市道認定路線マップ（mid=17）
    maps: [
      { kind: "road_type", label: "建築基準法指定道路マップ（ｅ－地図かけがわ・1号/2号/3号/5号/2項）", build: wagmap("kakegawa", 16), verified: true },
      { kind: "public_road", label: "市道認定路線マップ（ｅ－地図かけがわ）", build: wagmap("kakegawa", 17), verified: true },
    ],
    contact: { dept: "くらし環境部 くらしデザイン課 建築営繕係", phone: "0537-21-1152", note: "地図の内容は都市政策課 計画・土地利用係 0537-21-1151" },
    note: "地図は概略位置で、4号は載っていない。詳細と最新の指定は窓口で確認。",
  },
  {
    pref,
    name: "湖西市",
    codes: ["22221"],
    coverage: "full",
    maps: [
      {
        // GISこさい（ArcGIS Experience Builder）の「建築基準法第42条の規定による道路」ページ。1号・2号・3号・5号・2項（属性 a_type）。
        // 公開のフィーチャレイヤから物件のまわりの道路の種別を文字で読める
        kind: "road_type",
        label: "建築基準法第42条の規定による道路（GISこさい）",
        build: arcgisExperienceAt("https://experience.arcgis.com/experience/dd07e699e2ce41ac8a265a386f59f6f3/page/page_40/", "widget_950"),
        verified: true,
        tip: "最初に利用規約の同意にチェックして OK",
        read: { layers: [{ url: "https://services5.arcgis.com/KCMGoYYcTgZdlker/arcgis/rest/services/kentikukijyunho_42jyo_kiteidoro/FeatureServer/0" }], field: "a_type" },
      },
    ],
    contact: { dept: "建設部 建築住宅課 建築住宅係", phone: "053-576-4549" },
  },
];

// --- 県が扱う20市町 --------------------------------------------------------------

const PREF_TOWNS: Municipality[] = [
  prefTown("熱海市", "22205", "atami"),
  prefTown("伊東市", "22208", "atami"),
  prefTown("下田市", "22219", "shimoda"),
  prefTown("東伊豆町", "22301", "shimoda"),
  prefTown("河津町", "22302", "shimoda"),
  prefTown("南伊豆町", "22304", "shimoda"),
  outsideTown("松崎町", "22305", "shimoda"),
  outsideTown("西伊豆町", "22306", "shimoda"),
  prefTown("伊豆市", "22222", "numazu"),
  prefTown("伊豆の国市", "22225", "numazu"),
  prefTown("函南町", "22325", "numazu"),
  prefTown("清水町", "22341", "numazu"),
  prefTown("長泉町", "22342", "numazu"),
  prefTown("小山町", "22344", "numazu"),
  prefTown("牧之原市", "22226", "shimada"),
  prefTown("吉田町", "22424", "shimada"),
  outsideTown("川根本町", "22429", "shimada"),
  {
    // 菊川市は県（袋井土木事務所）の所管だが、市のきくのんマップ（wagmap）に建築基準法道路（mid=5）と市道認定路線網図（mid=11）がある
    ...prefTown("菊川市", "22224", "fukuroi"),
    maps: [
      { kind: "road_type", label: "建築基準法道路（きくのんマップ・1号/3号/5号/2項/特定通路）", build: wagmap("kikugawa", 5), verified: true },
      PREF_ROAD_MAP,
      { kind: "public_road", label: "市道認定路線網図（きくのんマップ）", build: wagmap("kikugawa", 11), verified: true },
    ],
    note: `市の地図は参考図（市の問い合わせは都市計画課 住宅建築係 0537-35-0957）。道路種別の判断は袋井土木事務所。${PREF_NOTE}`,
  },
  prefTown("御前崎市", "22223", "fukuroi"),
  prefTown("森町", "22461", "fukuroi"),
];

export const SHIZUOKA: Municipality[] = [...CITIES, ...LIMITED_CITIES, ...PREF_TOWNS];
