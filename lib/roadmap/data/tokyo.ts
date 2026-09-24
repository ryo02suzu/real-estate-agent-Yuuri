// 東京都 全62区市町村（2026-09 調査）。出典は docs/tokyo-research.md。
// 多摩: 特定行政庁の11市は各市、それ以外の15市2町・檜原村・奥多摩町は都の多摩建築指導事務所。島しょは都（各支庁の土木課が窓口）。
import type { Contact, Municipality } from "../municipalities";
import { alandis, arcgisExperience, arcgisWebApp, geocloud, geocloudMp, sonicweb, wagmap } from "../vendors";

const pref = "東京都" as const;

// --- 多摩の特定行政庁11市（道路種別は各市が扱う） ------------------------------

const TAMA_CITIES: Municipality[] = [
  {
    pref,
    name: "八王子市",
    codes: ["13201"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路マップ（試行・ArcGIS）", build: arcgisExperience("98e34509695f4543b012c0b6f118b681", "widget_124"), verified: false }],
    contact: { dept: "まちなみ整備部 建築指導課", phone: "042-620-7263", note: "道路種別は電話・FAXでは答えてもらえない。窓口で確認", noPhoneInquiry: true },
    note: "地図（ArcGIS）は読み込みに時間がかかることがあります。試行中のため最新は窓口で確認。",
  },
  {
    pref,
    name: "立川市",
    codes: ["13202"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "道路種別図（立川市地理情報システム）", build: alandis("https://webgis.alandis.jp/tachikawa13/webgis", "kenchiku"), verified: true }],
    contact: { dept: "都市整備部 建築指導課 審査係", phone: "042-523-2111（代表・内線2342〜2344）" },
    note: "道路種別図は複製（スクリーンショットを含む）禁止。",
  },
  {
    pref,
    name: "武蔵野市",
    codes: ["13203"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "道路種別図（むさしのマップ）", build: geocloud("https://musashino.geocloud.jp/webgis/", "mp=3&op=90&ot=1&vlf=-1"), verified: true }],
    contact: { dept: "都市整備部 建築指導課 管理係", phone: "0422-60-1874", hours: "平日 8:30〜12:00・13:00〜17:00" },
  },
  {
    pref,
    name: "三鷹市",
    codes: ["13204"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "道路種別図（三鷹市わがまちマップ）", build: wagmap("mitakacity", 29), verified: true }],
    contact: { dept: "都市整備部 建築指導課 審査係", phone: "0422-29-9744", note: "道路種別図の内容は電話では答えてもらえない。窓口で確認", noPhoneInquiry: true },
  },
  {
    pref,
    name: "府中市",
    codes: ["13206"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "道路種別図（がいどまっぷ府中）", build: geocloudMp("fugis.city.fuchu.tokyo.jp", 35), verified: true }],
    contact: { dept: "都市整備部 建築指導課", phone: "042-335-4479" },
  },
  {
    pref,
    name: "調布市",
    codes: ["13208"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "道路種別図（調布まっぷ）", build: wagmap("chofu", 5), verified: true },
      { kind: "public_road", label: "路線認定図（市道）", build: wagmap("chofu", 6), verified: false },
    ],
    contact: { dept: "都市整備部 建築指導課", phone: "042-481-7515", note: "道路種別は電話・メール・FAX不可。窓口で確認", noPhoneInquiry: true },
  },
  {
    pref,
    name: "町田市",
    codes: ["13209"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法道路種別（地図情報まちだ）", build: geocloud("https://machida.kukanjoho.jp/webgis/", "mp=66"), verified: true }],
    contact: { dept: "都市づくり部 建築開発審査課", phone: "042-724-4273" },
  },
  {
    pref,
    name: "小平市",
    codes: ["13211"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "道路種別図（こだいら地図情報システム）", build: sonicweb("kodaira", "th_24"), verified: true },
      { kind: "public_road", label: "認定路線網図（市道）", build: sonicweb("kodaira", "th_16"), verified: false },
    ],
    contact: { dept: "都市開発部 建築指導課 管理担当", phone: "042-346-9851" },
  },
  {
    pref,
    name: "日野市",
    codes: ["13212"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "道路種別図（地図検索・試行・ArcGIS）",
        build: arcgisWebApp("hinocity.maps.arcgis.com", "08e3629b00114275925dbb849668e12c"),
        verified: false,
      },
    ],
    contact: { dept: "まちづくり部 建築指導課", phone: "042-587-6211", note: "道路の扱いは電話・メールでは答えてもらえない。窓口で確認", noPhoneInquiry: true },
    note: "ネットの図は更新が年2回程度。最新は建築指導課の道路種別台帳で確認。",
  },
  {
    pref,
    name: "国分寺市",
    codes: ["13214"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（わがまちマップ国分寺）", build: wagmap("kokubunji", 19), verified: true }],
    contact: { dept: "まちづくり部 建築指導課 審査担当", phone: "042-312-8669" },
  },
  {
    pref,
    name: "西東京市",
    codes: ["13229"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "西東京市道路種別図（PDF）",
        build: null,
        url: "https://www.city.nishitokyo.lg.jp/siseizyoho/matidukuri/kentikusidou/dourosyubetu.html",
        verified: false,
      },
      { kind: "public_road", label: "道路網図（西東京市まちづくりマップ）", build: wagmap("nishitokyo", 2), verified: false },
    ],
    contact: { dept: "まちづくり部 建築指導課 審査係", phone: "042-438-4017" },
  },
];

// --- 都の多摩建築指導事務所が扱う15市2町と檜原村・奥多摩町 ------------------------

const TAMA_OFFICE: Record<string, Contact> = {
  first: { dept: "東京都 多摩建築指導事務所 建築指導第一課（立川合同庁舎2階）", phone: "042-548-2044", note: "道路の扱いは電話・FAXでは答えてもらえない。窓口で確認", noPhoneInquiry: true },
  second: { dept: "東京都 多摩建築指導事務所 建築指導第二課（東村山市本町）", phone: "042-313-3370", note: "道路の扱いは電話・FAXでは答えてもらえない。窓口で確認", noPhoneInquiry: true },
  third: { dept: "東京都 多摩建築指導事務所 建築指導第三課（青梅合同庁舎3階）", phone: "0428-23-3423", note: "道路の扱いは電話・FAXでは答えてもらえない。窓口で確認", noPhoneInquiry: true },
};

const tamaArea = (name: string, code: string, office: keyof typeof TAMA_OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "full",
  // 東京都の地図は 1/1000 だと表示されない（縮尺一覧に無い）ため 1/2500 で開く
  maps: [{ kind: "road_type", label: "建築基準法 多摩地域道路種別情報（東京都）", build: wagmap("tokyo_tokeizu", 2, { scale: 2500 }), verified: true }],
  contact: TAMA_OFFICE[office],
});

const TAMA_AREAS: Municipality[] = [
  tamaArea("昭島市", "13207", "first"),
  tamaArea("国立市", "13215", "first"),
  tamaArea("狛江市", "13219", "first"),
  tamaArea("東大和市", "13220", "first"),
  tamaArea("武蔵村山市", "13223", "first"),
  tamaArea("多摩市", "13224", "first"),
  tamaArea("稲城市", "13225", "first"),
  tamaArea("小金井市", "13210", "second"),
  tamaArea("東村山市", "13213", "second"),
  tamaArea("清瀬市", "13221", "second"),
  tamaArea("東久留米市", "13222", "second"),
  tamaArea("青梅市", "13205", "third"),
  tamaArea("福生市", "13218", "third"),
  tamaArea("羽村市", "13227", "third"),
  tamaArea("あきる野市", "13228", "third"),
  tamaArea("瑞穂町", "13303", "third"),
  tamaArea("日の出町", "13305", "third"),
  // 都の地図は「15市2町」が対象で、檜原村・奥多摩町は載っていない
  { pref, name: "檜原村", codes: ["13307"], coverage: "none", maps: [], contact: TAMA_OFFICE.third },
  { pref, name: "奥多摩町", codes: ["13308"], coverage: "none", maps: [], contact: TAMA_OFFICE.third },
];

// --- 島しょ（特定行政庁は東京都。窓口は各支庁の土木課） ------------------------

const ISLAND_OFFICE: Record<string, Contact> = {
  oshima: { dept: "東京都 大島支庁 土木課", phone: "04992-2-4441" },
  miyake: { dept: "東京都 三宅支庁 土木港湾課", phone: "04994-2-1311" },
  hachijo: { dept: "東京都 八丈支庁 土木課", phone: "04996-2-1114" },
  ogasawara: { dept: "東京都 小笠原支庁 土木課", phone: "04998-2-2123" },
};

const island = (name: string, code: string, office: keyof typeof ISLAND_OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps: [],
  contact: ISLAND_OFFICE[office],
  note: "島ごとに都市計画区域の有無が違う。接道の扱いも含めて支庁に確認。",
});

const ISLANDS: Municipality[] = [
  island("大島町", "13361", "oshima"),
  island("利島村", "13362", "oshima"),
  island("新島村", "13363", "oshima"),
  island("神津島村", "13364", "oshima"),
  island("三宅村", "13381", "miyake"),
  island("御蔵島村", "13382", "miyake"),
  island("八丈町", "13401", "hachijo"),
  island("青ヶ島村", "13402", "hachijo"),
  island("小笠原村", "13421", "ogasawara"),
];

export const TOKYO: Municipality[] = [...TAMA_CITIES, ...TAMA_AREAS, ...ISLANDS];
