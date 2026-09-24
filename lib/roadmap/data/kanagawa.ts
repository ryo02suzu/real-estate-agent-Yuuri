// 神奈川県 全33市町村（2026-09 調査）。出典は docs/kanagawa-research.md。
// 道路種別は特定行政庁の12市が各市、それ以外の9市町村＋12町村は県の土木事務所が扱う（県「各土木事務所一覧」）。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { alandis, geocloud, machiInfo, wagmap, yokohamaMappy } from "../vendors";

const pref = "神奈川県" as const;

// --- 特定行政庁の12市（道路種別は各市が扱う） ------------------------------------

const CITIES: Municipality[] = [
  {
    pref,
    name: "横浜市",
    codes: Array.from({ length: 18 }, (_, i) => String(14101 + i)),
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法道路種別（iマッピー）", build: yokohamaMappy, verified: true }],
    contact: {
      dept: "建築局 建築指導課（市庁舎25階）",
      phone: "045-671-4531",
      note: "電話では答えてもらえない。窓口か「建築基準法にかかる道路相談票」で相談",
      noPhoneInquiry: true,
    },
  },
  {
    pref,
    name: "川崎市",
    codes: ["14131", "14132", "14133", "14134", "14135", "14136", "14137"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法道路種別（ガイドマップかわさき）", build: geocloud("https://kawasaki.geocloud.jp/webgis/", "mp=37&bt=0"), verified: true }],
    // 建築審査課は区ごとに担当が分かれる
    contactByCode: {
      ...Object.fromEntries(["14131", "14132"].map((c) => [c, { dept: "まちづくり局 建築審査課（南部担当）", phone: "044-200-3016" }])),
      ...Object.fromEntries(["14133", "14134"].map((c) => [c, { dept: "まちづくり局 建築審査課（中部担当）", phone: "044-200-3020" }])),
      ...Object.fromEntries(["14135", "14136", "14137"].map((c) => [c, { dept: "まちづくり局 建築審査課（北部担当）", phone: "044-200-3045" }])),
    },
  },
  {
    pref,
    name: "相模原市",
    codes: ["14151", "14152", "14153"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "建築基準法道路種別（さがみはら地図情報）",
        build: geocloud("https://sagamihara.geocloud.jp/webgis/", "mp=12&op=70&vlf=-1"),
        verified: true,
      },
    ],
    contact: { dept: "建築審査課 道路担当（第1別館4階）", phone: "042-707-1644", note: "道路の扱いは窓口のみ（電話・FAX・郵送不可）", noPhoneInquiry: true },
  },
  {
    pref,
    name: "横須賀市",
    codes: ["14201"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "建築基準法道路（指定道路図）", build: wagmap("yokosuka", 6), verified: true }],
    contact: { dept: "都市部 建築指導課（分館4階）", phone: "046-822-8320" },
  },
  {
    pref,
    name: "平塚市",
    codes: ["14203"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "建築基準法の道路（ひらつかわくわくマップ）",
        build: alandis("https://webgis.alandis.jp/hiratsuka14/webgis_181", "guest60", "&li=12&si=0"),
        verified: true,
      },
    ],
    contact: { dept: "建築指導課 建築指導担当", phone: "0463-21-9731", note: "道路種別は電話・FAXでは答えてもらえない。窓口で確認", noPhoneInquiry: true },
  },
  {
    pref,
    name: "鎌倉市",
    codes: ["14204"],
    coverage: "none",
    maps: [],
    contact: {
      dept: "都市調整部 建築指導課（本庁舎3階）",
      phone: "0467-61-3592",
      email: "kensi@city.kamakura.kanagawa.jp",
      note: "道路種別は窓口のPC端末で確認（電話不可）。新しい指定道路図を策定中",
      noPhoneInquiry: true,
    },
  },
  {
    pref,
    name: "藤沢市",
    codes: ["14205"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "指定道路（ふじさわキュンマップ）",
        build: alandis("https://webgis.alandis.jp/fujisawa14/210/webgis", "guest_machizukuri", "&li=3&si=0"),
        verified: true,
      },
    ],
    contact: { dept: "建築指導課（分庁舎3階）", phone: "0466-50-3539", note: "電話・FAX・郵送・メールでの道路種別の問い合わせは不可。窓口で確認", noPhoneInquiry: true },
    note: "種別の色が付いていない道は未判定。建築指導課で相談。",
  },
  {
    pref,
    name: "小田原市",
    codes: ["14206"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（Navi-O）", build: wagmap("navi-odawara", 100), verified: true }],
    contact: { dept: "都市部 建築指導課（市役所6階）", phone: "0465-33-1577", note: "色の無い道は、案内図・公図・境界確定図を持って窓口で相談" },
  },
  {
    pref,
    name: "茅ヶ崎市",
    codes: ["14207"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "指定道路図（まっぷdeちがさき）", build: wagmap("chigasaki", 15), verified: true },
      { kind: "public_road", label: "市道番号・認定幅員図", build: wagmap("chigasaki", 83), verified: true },
    ],
    contact: { dept: "都市部 建築指導課（本庁舎3階）", phone: "0467-81-7184" },
  },
  {
    pref,
    name: "秦野市",
    codes: ["14211"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "指定道路種別（はだのWEBマップ）", build: wagmap("hadano", 17), verified: true },
      { kind: "public_road", label: "認定市道路線網図", build: wagmap("hadano", 5), verified: true },
    ],
    contact: { dept: "都市部 建築指導課", phone: "0463-83-0883" },
  },
  {
    pref,
    name: "厚木市",
    codes: ["14212"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "建築基準法道路（厚木タウンマップ）", build: wagmap("atsugi", 4), verified: true },
      { kind: "public_road", label: "路線網図（市道）", build: wagmap("atsugi", 11), verified: true },
    ],
    contact: { dept: "都市みらい部 建築指導課 建築指導係", phone: "046-225-2430", note: "電話だけの問い合わせには答えてもらえない。窓口か電子申請で道路相談", noPhoneInquiry: true },
  },
  {
    pref,
    name: "大和市",
    codes: ["14213"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "大和市指定道路マップ", build: machiInfo("yamato_city", "gis-road.html"), verified: true }],
    contact: { dept: "街づくり施設部 建築指導課 建築指導係", phone: "046-260-5425" },
  },
];

// --- 県が特定行政庁の市町村（窓口は県の土木事務所） ------------------------------

const OFFICE: Record<string, Contact> = {
  yokosuka: { dept: "神奈川県 横須賀土木事務所 まちづくり・建築指導課", phone: "046-853-8800" },
  hiratsuka: { dept: "神奈川県 平塚土木事務所 建築指導課", phone: "0463-45-3150" },
  atsugi: { dept: "神奈川県 厚木土木事務所 まちづくり・建築指導課", phone: "046-223-1711" },
  atsugiEast: { dept: "神奈川県 厚木土木事務所 東部センター まちづくり・建築指導課", phone: "0467-79-2843" },
  kensei: { dept: "神奈川県 県西土木事務所 まちづくり・建築指導課", phone: "0465-83-5111" },
};

/** 県の指定道路マップ（e-かなマップ）。県所管区域の42条全種別と「精査中または未判定」を表示 */
const PREF_ROAD_MAP: MapLink = { kind: "road_type", label: "神奈川県指定道路マップ（e-かなマップ）", build: wagmap("pref-kanagawa", 21), verified: true };

const prefArea = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "full",
  maps: [PREF_ROAD_MAP],
  contact: OFFICE[office],
  note: "赤線（精査中または未判定）や色の無い道は、土木事務所で確認。",
});

const PREF_AREAS: Municipality[] = [
  prefArea("逗子市", "14208", "yokosuka"),
  prefArea("三浦市", "14210", "yokosuka"),
  prefArea("葉山町", "14301", "yokosuka"),
  prefArea("伊勢原市", "14214", "hiratsuka"),
  prefArea("寒川町", "14321", "hiratsuka"),
  prefArea("大磯町", "14341", "hiratsuka"),
  prefArea("二宮町", "14342", "hiratsuka"),
  prefArea("愛川町", "14401", "atsugi"),
  prefArea("清川村", "14402", "atsugi"),
  prefArea("海老名市", "14215", "atsugiEast"),
  prefArea("座間市", "14216", "atsugiEast"),
  prefArea("綾瀬市", "14218", "atsugiEast"),
  prefArea("南足柄市", "14217", "kensei"),
  prefArea("中井町", "14361", "kensei"),
  prefArea("大井町", "14362", "kensei"),
  prefArea("松田町", "14363", "kensei"),
  prefArea("山北町", "14364", "kensei"),
  prefArea("開成町", "14366", "kensei"),
  prefArea("箱根町", "14382", "kensei"),
  prefArea("真鶴町", "14383", "kensei"),
  prefArea("湯河原町", "14384", "kensei"),
];

export const KANAGAWA: Municipality[] = [...CITIES, ...PREF_AREAS];
