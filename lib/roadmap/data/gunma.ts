// 群馬県 全35市町村（2026-09 調査）。出典は docs/kanto-north-research.md。
// 特定行政庁は前橋・高崎・桐生・伊勢崎・太田・館林の6市。沼田・渋川・藤岡・富岡・安中・みどりの6市は限定特定行政庁
// （小規模建築物だけ市）で、道路種別を含むそれ以外は県の土木事務所が扱う。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { geocloud, wagmap } from "../vendors";

const pref = "群馬県" as const;

/** マッピングぐんまの指定道路図。42条1項4号・5号・2項のみ（1号＝道路法の道路は載らない） */
const PREF_ROAD_MAP: MapLink = {
  kind: "designated_only",
  label: "群馬県 指定道路図（マッピングぐんま・1項4号/5号/2項のみ）",
  build: wagmap("pref-gunma", 155, { host: "https://mapping-gunma.pref.gunma.jp", scale: 2500 }),
  verified: true,
};

const OFFICE: Record<string, Contact> = {
  maebashi: { dept: "群馬県 前橋土木事務所 建築係", phone: "027-234-4224" },
  takasaki: { dept: "群馬県 高崎土木事務所 建築係", phone: "027-322-4186" },
  ota: { dept: "群馬県 太田土木事務所 建築係", phone: "0276-32-2345" },
  numata: { dept: "群馬県 沼田土木事務所 建築係", phone: "0278-24-5511" },
  nakanojo: { dept: "群馬県 中之条土木事務所 建築係", phone: "0279-75-3047" },
};

// --- 特定行政庁の6市 ---------------------------------------------------------

const CITIES: Municipality[] = [
  {
    pref,
    name: "前橋市",
    codes: ["10201"],
    coverage: "partial",
    maps: [
      {
        kind: "road_type",
        label: "建築基準法道路種別地図（さーちずまえばし・1項5号/指定外）",
        build: geocloud("https://searchizu-maebashi.geocloud.jp/webgis/", "mp=140-17&bt=0"),
        verified: true,
      },
    ],
    contact: { dept: "都市計画部 建築指導課", phone: "027-898-6753", note: "電話だけの道路相談は不可。予約して窓口（写真持参）かFAXで", noPhoneInquiry: true },
    note: "地図で分かるのは位置指定道路（1項5号）と指定外道路。2項道路などは建築指導課で確認。",
  },
  {
    pref,
    name: "高崎市",
    codes: ["10202"],
    coverage: "none",
    maps: [],
    contact: {
      dept: "建築指導課",
      phone: "027-321-1271",
      email: "kenchikushidou@city.takasaki.gunma.jp",
      note: "電話だけでは確認不可。地図（1/500〜1/1000）・公図をFAXかメールで送れば電話で回答。未判定の道は道路相談票で約1か月",
    },
  },
  {
    pref,
    name: "桐生市",
    codes: ["10203"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（図郭番号から選ぶPDF）", build: null, url: "https://www.city.kiryu.lg.jp/kurashi/jutaku/1013857/index.html", verified: false }],
    contact: { dept: "都市整備部 建築指導課", phone: "0277-48-9032" },
    note: "市は「不動産取引の資料には使えない参考図」としている。最新は建築指導課で確認。",
  },
  {
    pref,
    name: "伊勢崎市",
    codes: ["10204"],
    coverage: "partial",
    maps: [PREF_ROAD_MAP],
    contact: { dept: "建築指導課", phone: "0270-24-5111（代表）" },
    note: "県の地図で指定道路の一部が確認できる。道路種別は建築指導課で確認。",
  },
  {
    pref,
    name: "太田市",
    codes: ["10205"],
    coverage: "none",
    maps: [],
    contact: { dept: "建築指導課", phone: "0276-47-1111（代表）" },
  },
  {
    pref,
    name: "館林市",
    codes: ["10207"],
    coverage: "none",
    maps: [],
    contact: { dept: "建築指導課", phone: "0276-72-4111（代表）" },
  },
];

// --- 限定特定行政庁の6市（道路種別は県、位置指定道路の図は市が公開） ---------

const limitedCity = (name: string, code: string, office: keyof typeof OFFICE, cityMap: MapLink): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [cityMap, PREF_ROAD_MAP],
  contact: OFFICE[office],
  note: "市が公開しているのは位置指定道路の図。1号（公道）は載っていないので土木事務所で確認。",
});

const designated = (label: string, url: string): MapLink => ({ kind: "designated_only", label, build: null, url, verified: false });

const LIMITED_CITIES: Municipality[] = [
  limitedCity("沼田市", "10206", "numata", designated("指定道路図（沼田市・位置指定道路）", "https://www.city.numata.gunma.jp/jigyosha/1003548/1005936/1008826.html")),
  limitedCity("渋川市", "10208", "maebashi", designated("位置指定道路（渋川市地図情報）", "https://www2.wagmap.jp/shibukawa/Portal")),
  limitedCity("藤岡市", "10209", "takasaki", designated("指定道路図（藤岡市・位置指定道路）", "https://www.city.fujioka.gunma.jp/kakuka/f_toshikei2/shiteidouro.html")),
  limitedCity("富岡市", "10210", "takasaki", designated("指定道路図（富岡市・位置指定道路）", "https://www.city.tomioka.lg.jp/www/contents/1585534668687/index.html")),
  limitedCity("安中市", "10211", "takasaki", designated("指定道路図（安中市・位置指定道路）", "https://www.city.annaka.lg.jp/jutaku/kenchiku/shiteidouro.html")),
  limitedCity("みどり市", "10212", "ota", designated("指定道路図（みどり市・位置指定道路）", "https://www.city.midori.gunma.jp/sangyou/1001651/1001811/1002814.html")),
];

// --- 県が扱う町村 --------------------------------------------------------------

const prefTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_ROAD_MAP],
  contact: OFFICE[office],
  note: "県の地図は1項4号・5号・2項のみ。公道（1号）かどうかは土木事務所か町村で確認。",
});

const PREF_TOWNS: Municipality[] = [
  prefTown("榛東村", "10344", "maebashi"),
  prefTown("吉岡町", "10345", "maebashi"),
  prefTown("玉村町", "10464", "maebashi"),
  prefTown("上野村", "10366", "takasaki"),
  prefTown("神流町", "10367", "takasaki"),
  prefTown("下仁田町", "10382", "takasaki"),
  prefTown("南牧村", "10383", "takasaki"),
  prefTown("甘楽町", "10384", "takasaki"),
  prefTown("中之条町", "10421", "nakanojo"),
  prefTown("長野原町", "10424", "nakanojo"),
  prefTown("嬬恋村", "10425", "nakanojo"),
  prefTown("草津町", "10426", "nakanojo"),
  prefTown("高山村", "10428", "nakanojo"),
  prefTown("東吾妻町", "10429", "nakanojo"),
  prefTown("片品村", "10443", "numata"),
  prefTown("川場村", "10444", "numata"),
  prefTown("昭和村", "10448", "numata"),
  prefTown("みなかみ町", "10449", "numata"),
  prefTown("板倉町", "10521", "ota"),
  prefTown("明和町", "10522", "ota"),
  prefTown("千代田町", "10523", "ota"),
  prefTown("大泉町", "10524", "ota"),
  prefTown("邑楽町", "10525", "ota"),
];

export const GUNMA: Municipality[] = [...CITIES, ...LIMITED_CITIES, ...PREF_TOWNS];
