// 愛知県 全54市町村（2026-11 調査）。出典は docs/aichi-research.md。
// 特定行政庁は名古屋・豊橋・岡崎・一宮・春日井・豊田の6市。限定特定行政庁は瀬戸・半田・豊川・刈谷・安城・西尾・江南・小牧・稲沢・東海・大府の11市
// （小さな建築物の確認は市、残りは県の建築指導課分室。道路種別の相談は市の建築課）。残り37市町村は県が扱い、建築確認は建築指導課分室、相談は4建設事務所
// （尾張・知多・西三河・東三河）の建築課。県は指定道路図をネットに出していない。設楽町・東栄町・豊根村は全域が都市計画区域外。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { cloudgis, sonicweb, wagmap } from "../vendors";

const pref = "愛知県" as const;

const OFFICE: Record<string, Contact> = {
  owariKikaku: { dept: "愛知県 尾張建設事務所 建築課 企画グループ", phone: "052-961-1845" },
  owariShido1a: { dept: "愛知県 尾張建設事務所 建築課 指導第一グループ", phone: "052-961-1813" },
  owariShido1b: { dept: "愛知県 尾張建設事務所 建築課 指導第一グループ", phone: "052-961-1838" },
  owariShido2a: { dept: "愛知県 尾張建設事務所 建築課 指導第二グループ", phone: "052-961-1838" },
  owariShido2b: { dept: "愛知県 尾張建設事務所 建築課 指導第二グループ", phone: "052-961-1435" },
  chita: { dept: "愛知県 知多建設事務所 建築課 企画・指導グループ", phone: "0569-21-3245" },
  nishimikawa: { dept: "愛知県 西三河建設事務所 建築課", phone: "0564-27-2734" },
  higashimikawa: { dept: "愛知県 東三河建設事務所 建築課 企画・指導グループ", phone: "0532-52-1315" },
};

const PREF_NOTE = "県が扱う市町村で、県は指定道路図をネットに出していない。道路種別の相談は建設事務所の建築課（相談カード）か市町村の建築担当窓口で。建築確認は県の建築指導課分室（市町村を経由）。";

/** 県が扱う市町村。道路種別の地図は無く、市町村の道路台帳などがあれば添える */
const prefTown = (name: string, code: string, office: keyof typeof OFFICE, maps: MapLink[] = []): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps,
  contact: OFFICE[office],
  note: PREF_NOTE,
});

/** 全域が都市計画区域外の町村（県の6都市計画区域のどれにも入らない北設楽郡） */
const outsideTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: OFFICE[office],
  note: "全域が都市計画区域外（県の都市計画区域の一覧に無い）。建築基準法6条1項4号の知事指定区域の有無と建築の扱いは建設事務所で確認。",
});

/** PDF や画像の分割図で公開している入口ページ */
const sheets = (kind: MapLink["kind"], label: string, url: string, tip: string): MapLink => ({ kind, label, build: null, url, verified: true, tip });

/** 海外からは開けない（接続が切れる）ポータルの入口。中心一致は未確認 */
const portal = (label: string, url: string, tip: string): MapLink => ({ kind: "public_road", label, build: null, url, verified: false, tip });

// --- 特定行政庁の6市 ---------------------------------------------------------

const NAGOYA: Municipality = {
  pref,
  name: "名古屋市",
  codes: ["23101", "23102", "23103", "23104", "23105", "23106", "23107", "23108", "23109", "23110", "23111", "23112", "23113", "23114", "23115", "23116"],
  coverage: "full",
  maps: [
    {
      // 市の「指定道路図」（MapLibre の地図。#ズーム/緯度/経度 で開く）。1号・2号・3号・5号・2項と特定通路。4号は載っていない
      kind: "road_type",
      label: "指定道路図（名古屋市・1号/2号/3号/5号/2項）",
      build: (lat, lng) => `https://www.shiteidourozu.city.nagoya.jp/nagoya/#17/${lat.toFixed(6)}/${lng.toFixed(6)}`,
      verified: true,
      tip: "最初に利用条件に同意する。4号は載っていない。赤い線の特定通路は建築基準法の道路ではない",
    },
    portal("名古屋市道路認定図（市道の認定路線）", "https://www.douroninteizu.city.nagoya.jp/", "道路法の認定と認定幅員を見る。幅員の無い路線は道路台帳平面図で"),
  ],
  contact: { dept: "住宅都市局 建築指導部 建築指導課 道路審査担当（西庁舎2階）", phone: "052-972-2928" },
  note: "地図に表示が無い道や疑義のある道は道路審査担当へ。現況の幅員は現地で確かめる。",
};

const TOYOHASHI: Municipality = {
  pref,
  name: "豊橋市",
  codes: ["23201"],
  coverage: "partial",
  maps: [
    // ちずみる豊橋（wagmap）の「建築基準法道路図」（mid=30、試行版）と「認定路線網図」（mid=7）
    { kind: "road_type", label: "建築基準法道路図（ちずみる豊橋・試行版、1号/2項）", build: wagmap("toyohashi", 30), verified: true, tip: "試行版。最終の種別は建築指導課の窓口で" },
    { kind: "public_road", label: "認定路線網図（ちずみる豊橋・市道）", build: wagmap("toyohashi", 7), verified: true },
  ],
  contact: {
    dept: "建設部 建築指導課 建築審査グループ（東館3階）",
    phone: "0532-51-2581",
    note: "地番だけを伝える電話の照会は受けない。遠方は案内図と公図に敷地と道を示して FAX（0532-56-3815）かメールで",
    noPhoneInquiry: true,
  },
  note: "道路種別の確認は建築審査グループの窓口（都市計画図か住宅地図、公図の写しを持参）。",
};

const OKAZAKI: Municipality = {
  pref,
  name: "岡崎市",
  codes: ["23202"],
  coverage: "partial",
  maps: [
    // 岡崎市わが街ガイド（wagmap）の「建築関係情報」（mid=4。建築基準法上の道路を一部のエリアだけ公開）と「市道認定路線図」（mid=3）
    { kind: "road_type", label: "建築関係情報（岡崎市わが街ガイド・1号〜5号/2項、一部のエリア）", build: wagmap("okazakicity", 4), verified: true, tip: "道路種別が載っているのは一部のエリアだけ。無い所は建築指導課へ" },
    { kind: "public_road", label: "市道認定路線図（岡崎市わが街ガイド・認定状況と幅員）", build: wagmap("okazakicity", 3), verified: true },
  ],
  contact: {
    dept: "都市政策部 建築指導課 建築審査係（西庁舎1階）",
    phone: "0564-23-6192",
    note: "道路種別の電話照会は受けない。問合せ票と公図を FAX（0564-65-5566）か、窓口（相談の受付は原則9時〜12時）",
    noPhoneInquiry: true,
  },
  note: "市道の路線名・幅員は道路維持課（0564-23-6223）。国道1号は国、国道248号・473号と県道は県。",
};

const ICHINOMIYA: Municipality = {
  pref,
  name: "一宮市",
  codes: ["23203"],
  coverage: "none",
  // 138マップ（Sonicweb）の市道認定路線網図（テーマ th_105）。海外からは開けないので中心一致は未確認
  maps: [{ kind: "public_road", label: "市道認定路線網図（138マップ・路線名と一部エリアの幅員）", build: sonicweb("ichinomiya", "th_105"), verified: false }],
  contact: {
    dept: "建築部 建築指導課 建築審査グループ",
    phone: "0586-28-8645",
    note: "道路種別は専用フォームで照会（市道認定の有無・幅員を道水路管理課で確かめてから）。電話の照会は受けない",
    noPhoneInquiry: true,
  },
  note: "道路種別の地図はネット非公開。市道の路線名・幅員は道水路管理課（本庁舎8階 0586-28-8637、電話不可）。",
};

const KASUGAI: Municipality = {
  pref,
  name: "春日井市",
  codes: ["23206"],
  coverage: "none",
  // 道風くんの春日井まっぷ（wagmap）の「道路台帳平面図」（mid=23、令和7年度）
  maps: [{ kind: "public_road", label: "道路台帳平面図（道風くんの春日井まっぷ・認定道路の幅員）", build: wagmap("kasugai", 23), verified: true }],
  contact: { dept: "まちづくり推進部 建築指導課", phone: "0568-85-6328" },
  note: "道路種別の地図はネット非公開。市道・赤道の認定は土木管理課（市役所7階 0568-85-6272）。",
};

const TOYOTA: Municipality = {
  pref,
  name: "豊田市",
  codes: ["23211"],
  coverage: "partial",
  maps: [
    // とよたiマップ（wagmap）の「建築基準法道路情報」（mid=13、2023年6月30日公開。4号は表示されない。5号は指定番号・指定日も出る）
    { kind: "road_type", label: "建築基準法道路情報マップ（とよたiマップ・1号/2号/3号/5号/2項）", build: wagmap("toyotacity", 13), verified: true, tip: "4号道路は地図に出ない。道をクリックすると種別。5号は指定番号と指定日も出る" },
    { kind: "public_road", label: "道路台帳・基準点（とよたiマップ・市道の幅員）", build: wagmap("toyotacity", 10), verified: true },
  ],
  contact: { dept: "都市整備部 建築相談課（西庁舎4階）", phone: "0565-34-6649", note: "不明な点は案内図と地番を あいち電子申請・届出システムか問合せフォーム、メールで" },
  note: "4号道路は地図に無いので建築相談課で確認。",
};

// --- 限定特定行政庁の11市 ----------------------------------------------------------

const LIMITED_NOTE = "限定特定行政庁（小さな建築物の確認は市、残りは県の建築指導課分室）。道路種別の地図はネット非公開。";

const SETO: Municipality = {
  pref,
  name: "瀬戸市",
  codes: ["23204"],
  coverage: "none",
  maps: [sheets("public_road", "認定路線網図情報提供サービス（市道の路線名と最大・最小幅員）", "https://www.cloud-gis.jp/setomaps/terms_douro.html", "同意してから町・丁目を選ぶか地図を押す。幅員の正確な値は維持管理課の窓口（電話・FAX不可）")],
  contact: { dept: "都市計画課（建築確認）", phone: "0561-88-2686" },
  note: LIMITED_NOTE,
};

const HANDA: Municipality = {
  pref,
  name: "半田市",
  codes: ["23205"],
  coverage: "none",
  maps: [portal("認定路線網図・道路台帳図（半田市・市道の路線名と幅員）", "https://www.sonicweb-asp.jp/handa/", "Sonicweb の地図。入口から認定路線網図か道路台帳図を選ぶ")],
  contact: { dept: "建設部 建築課 建築指導担当", phone: "0569-84-0671" },
  note: LIMITED_NOTE,
};

const TOYOKAWA: Municipality = {
  pref,
  name: "豊川市",
  codes: ["23207"],
  coverage: "none",
  maps: [],
  contact: { dept: "建設部 建築課 建築指導係", phone: "0533-89-2117", note: "道路種別は窓口（案内図・公図の写しを持参）。遠方はメールで照会し回答は電話。電話だけの照会は受けない", noPhoneInquiry: true },
  note: LIMITED_NOTE,
};

const KARIYA: Municipality = {
  pref,
  name: "刈谷市",
  codes: ["23210"],
  coverage: "none",
  maps: [],
  contact: { dept: "建設部 建築課", phone: "0566-62-1021", note: "道路種別は場所の特定が難しいので電話では答えず、公図の写しを持って窓口へ", noPhoneInquiry: true },
  note: LIMITED_NOTE,
};

const ANJO: Municipality = {
  pref,
  name: "安城市",
  codes: ["23212"],
  coverage: "none",
  // あんじょうマップ（wagmap）の「道路台帳・認定路線」（mid=40）
  maps: [{ kind: "public_road", label: "道路台帳・認定路線（あんじょうマップ・市道）", build: wagmap("anjo", 40), verified: true }],
  contact: { dept: "建設部 建築課 建築指導係", phone: "0566-71-2241" },
  note: LIMITED_NOTE,
};

const NISHIO: Municipality = {
  pref,
  name: "西尾市",
  codes: ["23213"],
  coverage: "none",
  maps: [],
  contact: { dept: "都市整備部 建築課 建築開発担当", phone: "0563-65-2381", note: "法42条の道路種別の照会は電子申請でもできる" },
  note: LIMITED_NOTE,
};

const KONAN: Municipality = {
  pref,
  name: "江南市",
  codes: ["23217"],
  coverage: "none",
  maps: [sheets("public_road", "江南市道路台帳図（PDF・索引図と86枚）", "https://www.city.konan.lg.jp/kurashi/douro/1005935/1019718/1019683.html", "索引図で番号を選んで開く。前年度末のデータ")],
  contact: { dept: "都市整備部 建築課", phone: "0587-54-1111", note: "市役所の代表番号" },
  note: LIMITED_NOTE,
};

const KOMAKI: Municipality = {
  pref,
  name: "小牧市",
  codes: ["23219"],
  coverage: "none",
  maps: [sheets("public_road", "小牧市道路線認定図（PDF・索引図と5枚、2026年4月1日現在）", "https://www.city.komaki.aichi.jp/admin/soshiki/kensetsubu/douro/2/22318.html", "索引図で区域を選ぶ。路線名・幅員は専用フォームでも照会できる")],
  contact: { dept: "建設部 建築課 建築係", phone: "0568-76-1142" },
  note: `${LIMITED_NOTE} 1982年10月より前の建築物の記録は尾張建設事務所建築課へ。`,
};

const INAZAWA: Municipality = {
  pref,
  name: "稲沢市",
  codes: ["23220"],
  coverage: "none",
  maps: [sheets("public_road", "稲沢市道認定路線網図（PDF・2021年4月1日現在）", "https://www.city.inazawa.aichi.jp/0000000132.html", "路線の位置と名称だけ。幅員は用地管理課（0587-32-1379）へ")],
  contact: { dept: "建設部 建築課", phone: "0587-32-1409" },
  note: LIMITED_NOTE,
};

const TOKAI: Municipality = {
  pref,
  name: "東海市",
  codes: ["23222"],
  coverage: "none",
  // 東海市地図情報システム（wagmap）の「道路台帳平面図」（mid=31）と「道路台帳路線認定図」（mid=32）。同意の画面の先は未確認
  maps: [
    { kind: "public_road", label: "道路台帳平面図（東海市地図情報システム・市道の幅員）", build: wagmap("tokai", 31), verified: false, tip: "最初のお知らせを閉じて同意する。令和4年度末の内容" },
    { kind: "public_road", label: "道路台帳路線認定図（東海市地図情報システム・路線名）", build: wagmap("tokai", 32), verified: false },
  ],
  contact: { dept: "都市建設部 建築住宅課 開発・指導グループ", phone: "0562-38-6404" },
  note: LIMITED_NOTE,
};

const OBU: Municipality = {
  pref,
  name: "大府市",
  codes: ["23223"],
  coverage: "none",
  maps: [portal("大府市公開型GIS（道路台帳・市道の名称と幅員）", "https://webgis.alandis.jp/obu23/portal/contents/index.html", "入口から「道路台帳」を選ぶ")],
  contact: { dept: "都市政策課 建築指導係", phone: "0562-45-6314" },
  note: LIMITED_NOTE,
};

// --- 県が扱う37市町村（建設事務所の管内）-------------------------------------------------

const PREF_TOWNS: Municipality[] = [
  // 尾張建設事務所 企画グループ
  prefTown("津島市", "23208", "owariKikaku"),
  prefTown("犬山市", "23215", "owariKikaku", [portal("わんマップ（犬山市・市道の路線名と幅員）", "http://webgis.alandis.jp/inuyama23/portal/top/", "入口から道路情報を選ぶ")]),
  prefTown("豊山町", "23342", "owariKikaku"),
  prefTown("大口町", "23361", "owariKikaku"),
  prefTown("扶桑町", "23362", "owariKikaku"),
  // 尾張建設事務所 指導第一グループ
  prefTown("尾張旭市", "23226", "owariShido1a", [sheets("public_road", "市道認定路線網図（PDF・10枚と路線一覧、2026年4月現在）", "https://www.city.owariasahi.lg.jp/page/37898.html", "路線名・番号だけ。幅員は土木管理課（0561-76-8162）へ")]),
  prefTown("北名古屋市", "23234", "owariShido1a", [sheets("public_road", "北名古屋市道路台帳図（PDF・割図56枚）", "https://www.city.kitanagoya.lg.jp/shisei/machizukuri/1005101/1006125/1006128.html", "割図の番号を選んで開く")]),
  prefTown("東郷町", "23302", "owariShido1a"),
  prefTown("豊明市", "23229", "owariShido1a"),
  prefTown("長久手市", "23238", "owariShido1b", [{ kind: "public_road", label: "長久手市認定道路情報マップ（市道の路線名と台帳の幅員）", build: cloudgis("nagakute.cloudgis.jp", "road"), verified: true }]),
  prefTown("日進市", "23230", "owariShido1b", [{ kind: "public_road", label: "道路台帳図（にっしんまっぷ・市道の認定と幅員）", build: sonicweb("nisshin", "th_16"), verified: false, tip: "海外からは開けないので中心一致は未確認" }]),
  // 尾張建設事務所 指導第二グループ
  prefTown("愛西市", "23232", "owariShido2a"),
  prefTown("清須市", "23233", "owariShido2a", [sheets("public_road", "清須市道路台帳図（地区を押して開く分割図、2025年3月現在）", "https://www.city.kiyosu.aichi.jp/jigyosha_joho/chizujoho/dourohaisuiro_daityo.html", "全体図で地区を押し、上の「道路台帳図」を選ぶ")]),
  prefTown("岩倉市", "23228", "owariShido2a", [sheets("public_road", "道路台帳路線網図（PDF・索引図と2冊）", "https://www.city.iwakura.aichi.jp/0000006622.html", "路線番号だけ。幅員はオンライン申請・窓口・FAX で維持管理課（0587-38-5813）へ")]),
  prefTown("大治町", "23424", "owariShido2b"),
  prefTown("あま市", "23237", "owariShido2b", [sheets("public_road", "あま市道路台帳図（PDF・索引図と01〜89）", "https://www.city.ama.aichi.jp/kurashi/kotsu/douro/1006126.html", "索引図で番号を確かめて開く。幅員は参考値で現地が優先")]),
  prefTown("弥富市", "23235", "owariShido2b"),
  prefTown("蟹江町", "23425", "owariShido2b"),
  prefTown("飛島村", "23427", "owariShido2b"),
  // 知多建設事務所
  prefTown("常滑市", "23216", "chita", [portal("常滑市の地図情報（公開型GIS・道路台帳図と路線網図）", "https://webgis.alandis.jp/tokoname23/portal/contents/index.html", "入口から「道路」を選ぶ")]),
  prefTown("知多市", "23224", "chita", [{ kind: "public_road", label: "知多市情報マップ（認定道路情報・市道の路線名と幅員）", build: cloudgis("chita.cloudgis.jp", "road"), verified: true }]),
  prefTown("阿久比町", "23441", "chita"),
  prefTown("東浦町", "23442", "chita"),
  prefTown("南知多町", "23445", "chita"),
  prefTown("美浜町", "23446", "chita"),
  prefTown("武豊町", "23447", "chita"),
  // 西三河建設事務所
  prefTown("碧南市", "23209", "nishimikawa"),
  prefTown("知立市", "23225", "nishimikawa", [
    { kind: "public_road", label: "市道認定路線網図（知立市地図閲覧サービス）", build: wagmap("chiryu", 7), verified: true },
    { kind: "public_road", label: "市道幅員表示図（知立市地図閲覧サービス）", build: wagmap("chiryu", 8), verified: true },
  ]),
  prefTown("高浜市", "23227", "nishimikawa", [{ kind: "public_road", label: "道路網図マップ（高浜市・市道）", build: wagmap("takahama", 4), verified: false, tip: "同意の画面の先は未確認" }]),
  prefTown("みよし市", "23236", "nishimikawa", [sheets("public_road", "みよし市道路網図（PDF・索引図6枚と路線リスト）", "https://www.city.aichi-miyoshi.lg.jp/soshiki/toshikensetsu/dourokasen/4/1/585.html", "索引図の番号で路線番号を調べ、路線リストで路線名を見る")]),
  prefTown("幸田町", "23501", "nishimikawa"),
  // 東三河建設事務所
  prefTown("蒲郡市", "23214", "higashimikawa", [{ kind: "public_road", label: "蒲郡市情報マップ（道路台帳・市道の名称と幅員）", build: cloudgis("gamagori.cloudgis.jp", "road"), verified: true, tip: "2022年4月1日時点の認定道路" }]),
  prefTown("新城市", "23221", "higashimikawa"),
  prefTown("田原市", "23231", "higashimikawa", [{ kind: "public_road", label: "道路情報（たはらeマップ・道路網図）", build: wagmap("taharacity", 30), verified: false, tip: "同意の画面の先は未確認" }]),
  outsideTown("設楽町", "23561", "higashimikawa"),
  outsideTown("東栄町", "23562", "higashimikawa"),
  outsideTown("豊根村", "23563", "higashimikawa"),
];

export const AICHI: Municipality[] = [
  NAGOYA, TOYOHASHI, OKAZAKI, ICHINOMIYA, KASUGAI, TOYOTA,
  SETO, HANDA, TOYOKAWA, KARIYA, ANJO, NISHIO, KONAN, KOMAKI, INAZAWA, TOKAI, OBU,
  ...PREF_TOWNS,
];
