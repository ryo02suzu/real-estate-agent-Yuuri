// 千葉県 全54市町村（2026-09 調査）。出典は docs/chiba-research.md。
// 道路種別は「特定行政庁が市長の21市」は各市、それ以外は県の土木事務所が扱う（県「指定道路情報について」）。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { alandis, geocloud, geocloudMp, sonicweb, wagmap } from "../vendors";

const pref = "千葉県" as const;

/** 都市計画区域が市町村の一部だけの場合の注意書き */
const PARTLY_OUTSIDE = "市町村内の一部は都市計画区域外（その区域は接道義務が原則かからない）。";

// --- 特定行政庁が市長の21市（道路種別は各市が扱う） ------------------------------

const CITIES: Municipality[] = [
  {
    pref,
    name: "千葉市",
    codes: ["12101", "12102", "12103", "12104", "12105", "12106"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "建築基準法道路（千葉市地図情報システム）", build: alandis("https://webgis.alandis.jp/chiba12/webgis", "guest3", "&li=3&si=0"), verified: true },
      { kind: "public_road", label: "認定道路（市道）", build: alandis("https://webgis.alandis.jp/chiba12/webgis", "guest1", "&li=1&si=0"), verified: true },
    ],
    contact: { dept: "建築情報相談課", phone: "043-245-5841" },
    note: "色の無い（白地の）道路は、建築基準法の道路でないか未判定。",
  },
  {
    pref,
    name: "市川市",
    codes: ["12203"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（いち案内）", build: geocloud("https://gis.city.ichikawa.lg.jp/webgis/", "p=0&bt=0&mp=201-74"), verified: true }],
    contact: { dept: "建築指導課 道路・許可グループ", phone: "047-712-6334", note: "道路種別の電話での問い合わせは不可。窓口で確認", noPhoneInquiry: true },
  },
  {
    pref,
    name: "船橋市",
    codes: ["12204"],
    coverage: "none",
    maps: [{ kind: "public_road", label: "道路台帳図（市道）", build: sonicweb("funabashi", "th_22"), verified: true }],
    contact: { dept: "建築指導課（市役所6階）", phone: "047-436-2672", hours: "平日 9:00〜17:00", note: "道路種別は窓口のみ（電話・FAX不可）", noPhoneInquiry: true },
  },
  {
    pref,
    name: "松戸市",
    codes: ["12207"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "指定道路（やさシティマップ）", build: sonicweb("matsudo", "th_33"), verified: true },
      { kind: "public_road", label: "認定路線網図（市道）", build: sonicweb("matsudo", "th_8"), verified: true },
    ],
    contact: { dept: "建築指導課（新館8階）", phone: "047-366-7368", note: "道路種別の電話での問い合わせは不可。窓口で確認", noPhoneInquiry: true },
  },
  {
    pref,
    name: "柏市",
    codes: ["12217"],
    coverage: "none",
    maps: [{ kind: "public_road", label: "市道認定路線網図", build: sonicweb("kashiwa", "th_15"), verified: true }],
    contact: { dept: "建築指導課（分庁舎2 1階）", phone: "04-7167-1145", note: "道路種別は窓口のみ（電話・FAX・メール不可）", noPhoneInquiry: true },
  },
  {
    pref,
    name: "市原市",
    codes: ["12219"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "指定道路図（いちはらマップ）",
        build: alandis("https://www2.city-gis.ichihara.chiba.jp/ichihara/alandis/webgis", "guest15", "&li=14&si=0"),
        verified: true,
      },
      {
        kind: "public_road",
        label: "道路台帳図（市道）",
        build: alandis("https://www2.city-gis.ichihara.chiba.jp/ichihara/alandis/webgis", "guest07", "&li=7&si=0"),
        verified: true,
      },
    ],
    contact: { dept: "建築指導課", phone: "0436-23-9840" },
    note: `色分けの無い道路は、建築基準法の道路でないか未判定。${PARTLY_OUTSIDE}`,
  },
  {
    pref,
    name: "佐倉市",
    codes: ["12212"],
    coverage: "partial",
    maps: [
      { kind: "designated_only", label: "指定道路図（5号・2項のみ、地区別PDF）", build: null, url: "https://www.city.sakura.lg.jp/soshiki/kenchikushidoka/oshirase/3275.html", verified: false },
    ],
    contact: { dept: "建築指導課 建築指導班", phone: "043-484-6169", note: "電話での照会は不可。窓口か千葉県電子申請サービスで照会（当日〜翌営業日に回答）", noPhoneInquiry: true },
  },
  {
    pref,
    name: "八千代市",
    codes: ["12221"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法の道路種別（図郭番号から選ぶPDF）", build: null, url: "https://www.city.yachiyo.lg.jp/soshiki/44/3993.html", verified: false }],
    contact: { dept: "建築指導課（新館5階）", phone: "047-421-6774", note: "電話・FAX・メール不可。窓口か電子申請（道路種別照会）で確認", noPhoneInquiry: true },
  },
  {
    pref,
    name: "我孫子市",
    codes: ["12222"],
    coverage: "partial",
    maps: [{ kind: "designated_only", label: "建築基準法道路種別図（位置指定道路のみ）", build: geocloudMp("abiko.geocloud.jp", 12), verified: true }],
    contact: { dept: "建築住宅課", phone: "04-7185-1111（代表）", hours: "平日 8:30〜17:00" },
  },
  {
    pref,
    name: "浦安市",
    codes: ["12227"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図", build: sonicweb("urayasu", "th_81"), verified: true }],
    contact: { dept: "建築指導課（市役所6階）", phone: "047-712-6548", note: "道路種別の相談は窓口のみ（電話不可）", noPhoneInquiry: true },
  },
  {
    pref,
    name: "習志野市",
    codes: ["12216"],
    coverage: "none",
    maps: [],
    contact: { dept: "建築指導課（市庁舎4階）", phone: "047-453-9231" },
  },
  {
    pref,
    name: "木更津市",
    codes: ["12206"],
    coverage: "none",
    maps: [{ kind: "public_road", label: "道路情報マップ（市道路線網図）", build: wagmap("kisarazu", 3), verified: true }],
    contact: {
      dept: "都市整備部 建築指導課",
      phone: "0438-23-8596",
      note: "電話では答えてもらえない。窓口・FAX・郵送・問い合わせフォームで地図を添えて照会",
      noPhoneInquiry: true,
    },
  },
  {
    pref,
    name: "流山市",
    codes: ["12220"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法道路種別台帳マップ（スマホ版）", build: alandis("https://webgis.alandis.jp/nagareyama12/webgis_mobile", "guest2"), verified: true }],
    contact: { dept: "まちづくり推進部 都市計画課", phone: "04-7150-6087" },
  },
  {
    pref,
    name: "成田市",
    codes: ["12211"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路情報（なりた地図情報）", build: wagmap("narita", 4), verified: true }],
    contact: { dept: "建築住宅課（行政棟5階）", phone: "0476-20-1564", email: "kenchiku@city.narita.chiba.jp" },
  },
  {
    pref,
    name: "鎌ケ谷市",
    codes: ["12224"],
    coverage: "none",
    maps: [],
    contact: { dept: "都市建設部 建築住宅課 建築係", phone: "047-445-1466", note: "オンラインでの照会も受け付けている" },
  },
  {
    pref,
    name: "野田市",
    codes: ["12208"],
    coverage: "none",
    maps: [],
    contact: { dept: "都市計画課 建築指導担当", phone: "04-7199-7603" },
  },
  {
    pref,
    name: "君津市",
    codes: ["12225"],
    coverage: "none",
    maps: [],
    contact: {
      dept: "建設部 建築課 審査指導係",
      phone: "0439-56-1142",
      note: "電話では答えてもらえない。窓口か「建築基準法道路種別照会フォーム」（https://logoform.jp/f/Wuu3y）で照会",
      noPhoneInquiry: true,
    },
    note: "都市計画区域は旧君津町の区域だけ。それ以外の区域は接道義務が原則かからない。",
  },
  {
    pref,
    name: "茂原市",
    codes: ["12210"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "道路情報（指定道路図）", build: wagmap("mobara", 7), verified: true }],
    contact: { dept: "建築課", phone: "0475-20-1588" },
  },
  {
    pref,
    name: "四街道市",
    codes: ["12228"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法道路（指定道路図PDF）", build: null, url: "https://webgis.alandis.jp/yotsukaido12/portal/douro.html", verified: false }],
    contact: {
      dept: "都市部 建築課",
      phone: "043-421-6144",
      note: "色が読み取りにくい箇所は、地図に位置を示して FAX（043-424-8921）で問い合わせる",
    },
  },
  {
    pref,
    name: "白井市",
    codes: ["12232"],
    coverage: "none",
    maps: [],
    contact: { dept: "都市建設部 建築宅地課", phone: "047-492-1111（代表）" },
  },
  {
    pref,
    name: "印西市",
    codes: ["12231"],
    coverage: "none",
    maps: [{ kind: "public_road", label: "認定市道路網図", build: wagmap("inzai", 2), verified: true }],
    contact: { dept: "開発建築課 建築指導係", phone: "0476-33-4909", hours: "平日 9:00〜16:30", note: "道路相談書を提出して判定してもらう" },
  },
];

// --- 県が特定行政庁の市町村（窓口は県の土木事務所） ------------------------------

const OFFICE: Record<string, Contact> = {
  inba: { dept: "千葉県 印旛土木事務所 建築課", phone: "043-483-1141" },
  narita: { dept: "千葉県 成田土木事務所 建築宅地課", phone: "0476-26-4854" },
  katori: { dept: "千葉県 香取土木事務所 建築宅地課", phone: "0478-52-5554" },
  kaiso: { dept: "千葉県 海匝土木事務所 建築宅地課", phone: "0479-72-1172" },
  sanbu: { dept: "千葉県 山武土木事務所 建築宅地課", phone: "0475-54-1133" },
  chosei: { dept: "千葉県 長生土木事務所 建築宅地課", phone: "0475-24-4286" },
  awa: { dept: "千葉県 安房土木事務所 建築宅地課", phone: "0470-22-4340" },
  kimitsu: { dept: "千葉県 君津土木事務所 建築宅地課", phone: "0438-25-5137" },
};

/** 県の指定道路情報地図。URLで位置を渡せない（同意後に地図内で住所検索） */
const PREF_ROAD_MAP: MapLink = {
  kind: "designated_only",
  label: "千葉県 指定道路情報地図（位置指定・2項など一部の路線）",
  build: null,
  url: "https://ds.icba-info.jp/siteidouro/chiba/pref/",
  verified: false,
};

const prefArea = (name: string, code: string, office: keyof typeof OFFICE, partlyOutside = false): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_ROAD_MAP],
  contact: OFFICE[office],
  note: `県の地図は一部の指定道路のみ。42条1項1〜3号は載っていない。${partlyOutside ? PARTLY_OUTSIDE : ""}`,
});

/** 都市計画区域が無い町（千葉県は準都市計画区域の指定も無い） */
const outside = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: OFFICE[office],
});

const PREF_AREAS: Municipality[] = [
  prefArea("八街市", "12230", "inba"),
  prefArea("酒々井町", "12322", "inba"),
  prefArea("栄町", "12329", "inba"),
  prefArea("富里市", "12233", "narita"),
  prefArea("多古町", "12347", "narita"),
  prefArea("芝山町", "12409", "narita"),
  prefArea("香取市", "12236", "katori"),
  prefArea("東庄町", "12349", "katori", true),
  prefArea("銚子市", "12202", "kaiso"),
  prefArea("匝瑳市", "12235", "kaiso", true),
  prefArea("旭市", "12215", "kaiso", true),
  prefArea("東金市", "12213", "sanbu"),
  prefArea("山武市", "12237", "sanbu"),
  prefArea("大網白里市", "12239", "sanbu"),
  prefArea("九十九里町", "12403", "sanbu"),
  prefArea("横芝光町", "12410", "sanbu"),
  prefArea("一宮町", "12421", "chosei"),
  prefArea("白子町", "12424", "chosei"),
  prefArea("長南町", "12427", "chosei", true),
  prefArea("長生村", "12423", "chosei"),
  prefArea("勝浦市", "12218", "chosei", true),
  prefArea("いすみ市", "12238", "chosei", true),
  prefArea("御宿町", "12443", "chosei"),
  prefArea("館山市", "12205", "awa"),
  prefArea("鴨川市", "12223", "awa", true),
  prefArea("袖ケ浦市", "12229", "kimitsu"),
  prefArea("富津市", "12226", "kimitsu", true),
  outside("南房総市", "12234", "awa"),
  outside("鋸南町", "12463", "awa"),
  outside("神崎町", "12342", "katori"),
  outside("睦沢町", "12422", "chosei"),
  outside("長柄町", "12426", "chosei"),
  outside("大多喜町", "12441", "chosei"),
];

export const CHIBA: Municipality[] = [...CITIES, ...PREF_AREAS];
