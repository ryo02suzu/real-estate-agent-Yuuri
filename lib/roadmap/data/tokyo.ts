// 東京都 全62区市町村（2026-09 調査）。出典は docs/tokyo-research.md。
// 23区: 各区が特定行政庁。多摩: 特定行政庁の11市は各市、それ以外の15市2町・檜原村・奥多摩町は都の多摩建築指導事務所。島しょは都（各支庁の土木課が窓口）。
import type { Contact, Municipality } from "../municipalities";
import { alandis, arcgisExperience, arcgisWebApp, chuoMap, geocloud, geocloudMp, machiInfoMap, sonicweb, wagmap } from "../vendors";

const pref = "東京都" as const;

// --- 23区（各区が特定行政庁） ------------------------------------------------

/** 窓口のみで電話では道路種別を答えない区の注意書き */
const COUNTER_ONLY = "道路種別は電話・FAX・メールでは答えてもらえない。窓口で確認";

const WARDS: Municipality[] = [
  {
    pref,
    name: "千代田区",
    codes: ["13101"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "建築基準法上の道路種別（千代田区都市計画情報提供ポータル・ArcGIS）",
        // この地図は URL での位置指定を受け付けない（4326・平面直角座標とも無視）。開いたら画面の「住所検索」で探す
        build: null,
        url: "https://tokei-gis2.chiyodatoshikei.jp/toshikei/apps/experiencebuilder/experience/?id=6ce28f9528e44850b850f0ce0f34eadc",
        verified: true,
        tip: "区全体の地図が開きます。画面の「住所検索」タブで住所を入れてください（読み込みに少し時間がかかります）。",
      },
    ],
    contact: { dept: "環境まちづくり部 建築指導課 建築審査係", phone: "03-5211-4308", email: "kenchikushidou@city.chiyoda.lg.jp" },
  },
  {
    pref,
    name: "中央区",
    codes: ["13102"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "中央区都市計画情報等閲覧システム", build: chuoMap, verified: true, tip: "開いたら画面の「地図【A】用途地域等」を押し、「【L】建築基準法上の道路種別」に切り替えてください。" }],
    contact: { dept: "都市整備部 建築課 建築調整係（区役所5階）", phone: "03-3546-5453", note: "場所の取り違えを防ぐため、道路種別は窓口で案内", noPhoneInquiry: true },
  },
  {
    pref,
    name: "港区",
    codes: ["13103"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（分割図から選ぶPDF）", build: null, url: "https://www.city.minato.tokyo.jp/kenchikushinsa/douroshubetsu/siteidourozu.html", verified: false }],
    contact: { dept: "街づくり支援部 建築課 建築審査係（区役所6階605）", phone: "03-3578-2286", note: COUNTER_ONLY, noPhoneInquiry: true },
  },
  {
    pref,
    name: "新宿区",
    codes: ["13104"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法の道路種別情報（新宿区みんなのGIS）", build: sonicweb("shinjuku2", "th_1209"), verified: true }],
    contact: { dept: "都市計画部 建築調整課 細街路拡幅整備担当（本庁舎8階）", phone: "03-5273-3733", note: COUNTER_ONLY, noPhoneInquiry: true },
  },
  {
    pref,
    name: "文京区",
    codes: ["13105"],
    coverage: "none",
    maps: [{ kind: "public_road", label: "道路台帳平面図（区道のみ）", build: null, url: "https://www.city.bunkyo.lg.jp/b034/p004775/index.html", verified: false }],
    contact: { dept: "都市計画部 建築指導課 審査担当（シビックセンター18階）", phone: "03-5803-1263" },
    note: "23区で唯一、指定道路図をネット公開していない。窓口で確認。",
  },
  {
    pref,
    name: "台東区",
    codes: ["13106"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "建築基準法道路マップ（たいとうマップ）", build: wagmap("taito", 4), verified: true },
      { kind: "public_road", label: "認定道路・道路台帳図", build: wagmap("taito", 3), verified: true },
    ],
    contact: { dept: "都市づくり部 建築課 狭あい道路担当", phone: "03-5246-1337" },
  },
  {
    pref,
    name: "墨田区",
    codes: ["13107"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（建築基準法上の道路種別）", build: sonicweb("sumida", "th_8"), verified: true }],
    contact: { dept: "都市計画部 建築指導課（区役所9階）", phone: "03-5608-6267", note: "後退方法や中心線などの詳細は電話・メール・FAXでは答えてもらえない。窓口で確認" },
  },
  {
    pref,
    name: "江東区",
    codes: ["13108"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路マップ（ことまっぷ）", build: geocloudMp("koto.geocloud.jp", 3), verified: true }],
    contact: { dept: "都市整備部 建築課 道路調査係（5階27番窓口）", phone: "03-3647-9736" },
  },
  {
    pref,
    name: "品川区",
    codes: ["13109"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（しながわMAP）", build: wagmap("shinagawa", 67), verified: true }],
    contact: { dept: "都市環境部 建築課（本庁舎6階）", phone: "03-5742-6769" },
  },
  {
    pref,
    name: "目黒区",
    codes: ["13110"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "目黒区指定道路図（めぐろ地図情報サービス）", build: sonicweb("meguro", "th_3"), verified: true }],
    contact: { dept: "都市整備部 建築課 調査係（総合庁舎6階）", phone: "03-5722-9638", note: COUNTER_ONLY, noPhoneInquiry: true },
  },
  {
    pref,
    name: "大田区",
    codes: ["13111"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路情報（大田区わがまちガイド）", build: wagmap("ota", 1), verified: true }],
    contact: { dept: "まちづくり推進部 建築調整課 地域道路整備担当", phone: "03-5744-1308", note: "道路相談は窓口のみ（一般の道路相談は12:00〜13:00）", noPhoneInquiry: true },
  },
  {
    pref,
    name: "世田谷区",
    codes: ["13112"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（せたがやiMap）", build: sonicweb("setagaya", "shiteidouro"), verified: true, tip: "最初の利用規約の画面で、いちばん下の「同意する」を押してください。" }],
    contact: { dept: "防災街づくり担当部 建築安全課（二子玉川分庁舎2階）", phone: "03-6432-7188", note: COUNTER_ONLY, noPhoneInquiry: true },
  },
  {
    pref,
    name: "渋谷区",
    codes: ["13113"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法の道路（指定道路図）", build: wagmap("shibuya", 1008), verified: true }],
    contact: { dept: "都市整備部 建築課 調査係", phone: "03-3463-2734", note: COUNTER_ONLY, noPhoneInquiry: true },
  },
  {
    pref,
    name: "中野区",
    codes: ["13114"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "中野区建築基準法道路種別図（なかのデータマップ）", build: wagmap("nakanodatamap", 52), verified: true },
      { kind: "public_road", label: "認定路線網図・道路台帳現況平面図", build: wagmap("nakanodatamap", 61), verified: true },
    ],
    contact: { dept: "都市基盤部 建築課 道路判定係（区役所9階）", phone: "03-3228-5549", note: "間違いを防ぐため電話ではなく窓口で相談", noPhoneInquiry: true },
  },
  {
    pref,
    name: "杉並区",
    codes: ["13115"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法の道路（すぎナビ）", build: geocloudMp("suginami.geocloud.jp", 402), verified: true }],
    contact: { dept: "都市整備部 狭あい道路整備課 狭あい道路係（西棟4階）", phone: "03-3312-2111（代表）", note: "誤りを防ぐため電話での問い合わせは不可。窓口で確認", noPhoneInquiry: true },
  },
  {
    pref,
    name: "豊島区",
    codes: ["13116"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "道路台帳現況平面図及び建築基準法上の道路種別等（ArcGIS）",
        build: arcgisWebApp("toshisei.maps.arcgis.com", "c4832f4fda79495fab7b83e2001817a5"),
        verified: true,
        tip: "最初は路線番号が出ます。右上のレイヤ一覧（重なった四角のボタン）で、道路種別のレイヤを表示してください。",
      },
    ],
    contact: { dept: "都市整備部 建築課", phone: "03-3981-1111（代表）" },
  },
  {
    pref,
    name: "北区",
    codes: ["13117"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（PDF）", build: null, url: "https://www.city.kita.lg.jp/dev-environment/construction/1009298/1009491.html", verified: false }],
    contact: { dept: "まちづくり部 建築課 細街路整備係（第一庁舎7階）", phone: "03-3908-9194", note: COUNTER_ONLY, noPhoneInquiry: true },
  },
  {
    pref,
    name: "荒川区",
    codes: ["13118"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "指定道路マップ（荒川区地図情報）", build: wagmap("arakawa", 2), verified: true },
      { kind: "public_road", label: "道路台帳・路線網図", build: wagmap("arakawa", 4), verified: true },
    ],
    contact: { dept: "防災都市づくり部 建築指導課 細街路整備係", phone: "03-3802-3111（代表）", note: "指定道路の詳細は電話不可。窓口で確認", noPhoneInquiry: true },
  },
  {
    pref,
    name: "板橋区",
    codes: ["13119"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（どこナビいたばし）", build: machiInfoMap("itabashi.machi-info.jp", 100034), verified: true }],
    contact: { dept: "都市整備部 建築指導課 意匠審査係", phone: "03-3579-2573", note: COUNTER_ONLY, noPhoneInquiry: true },
    note: "区の利用規約で「不動産取引等の資料として利用不可」。現地確認と窓口での確認が前提。",
  },
  {
    pref,
    name: "練馬区",
    codes: ["13120"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法による道路等（ねりまっぷ・参考公開）", build: sonicweb("nerimap", "th_216"), verified: true }],
    contact: { dept: "建築・開発担当部 建築審査課 道路調査係（本庁舎15階）", phone: "03-5984-1984" },
    note: "参考公開。最終確認は建築審査課 道路調査係の窓口で。",
  },
  {
    pref,
    name: "足立区",
    codes: ["13121"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法道路（指定道路）（あだち地図情報）", build: sonicweb("adachi2", "th_2"), verified: true }],
    contact: { dept: "建築室 道路照会担当", phone: "03-3880-5463" },
  },
  {
    pref,
    name: "葛飾区",
    codes: ["13122"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法道路種別（かつしかWEBマップ）", build: sonicweb("katsushika", "th_25"), verified: true }],
    contact: { dept: "都市整備部 住環境整備課 開発指導係", phone: "03-5654-8349" },
  },
  {
    pref,
    name: "江戸川区",
    codes: ["13123"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路情報（江戸川区）", build: wagmap("edogawa", 2), verified: true }],
    contact: { dept: "都市開発部 建築指導課 調査係", phone: "03-5662-1104" },
  },
];

// --- 多摩の特定行政庁11市（道路種別は各市が扱う） ------------------------------

const TAMA_CITIES: Municipality[] = [
  {
    pref,
    name: "八王子市",
    codes: ["13201"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路マップ（試行・ArcGIS）", build: arcgisExperience("98e34509695f4543b012c0b6f118b681", "widget_124"), verified: true }],
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
      { kind: "public_road", label: "路線認定図（市道）", build: wagmap("chofu", 6), verified: true },
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
      { kind: "public_road", label: "認定路線網図（市道）", build: sonicweb("kodaira", "th_16"), verified: true },
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
        verified: true,
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
      { kind: "public_road", label: "道路網図（西東京市まちづくりマップ）", build: wagmap("nishitokyo", 2), verified: true },
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

export const TOKYO: Municipality[] = [...WARDS, ...TAMA_CITIES, ...TAMA_AREAS, ...ISLANDS];
