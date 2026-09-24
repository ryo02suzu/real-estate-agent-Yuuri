// 栃木県 全25市町（2026-09 調査）。出典は docs/kanto-north-research.md。
// 特定行政庁は宇都宮・足利・栃木・佐野・鹿沼・日光・小山・大田原・那須塩原の9市。
// それ以外の市町は県（令和7年4月から県庁の建築指導課に集約）が扱う。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { sonicweb, wagmap } from "../vendors";

const pref = "栃木県" as const;

/** 県の指定道路台帳（建築行政情報センター）。1項5号の一部のみ、URLで位置を渡せない */
const PREF_ROAD_MAP: MapLink = {
  kind: "designated_only",
  label: "栃木県 指定道路台帳（位置指定道路の一部のみ）",
  build: null,
  url: "https://ds.icba-info.jp/siteidouro/tochigi/pref/",
  verified: false,
};

const OFFICE: Record<string, Contact> = {
  first: { dept: "栃木県 県土整備部 建築指導課 審査指導第一担当（県庁北別館3階）", phone: "028-623-2867" },
  second: { dept: "栃木県 県土整備部 建築指導課 審査指導第二担当（県庁北別館3階）", phone: "028-623-2872" },
};

// --- 特定行政庁の9市 ---------------------------------------------------------

const CITIES: Municipality[] = [
  {
    pref,
    name: "宇都宮市",
    codes: ["09201"],
    coverage: "none",
    maps: [],
    contact: {
      dept: "都市整備部 建築指導課 指導グループ（市役所11階）",
      phone: "028-632-2574",
      note: "電話では答えてもらえない。住宅地図・公図を持って窓口へ。判断できない道は道路調査で2週間〜1か月",
      noPhoneInquiry: true,
    },
  },
  { pref, name: "足利市", codes: ["09202"], coverage: "none", maps: [{ kind: "public_road", label: "認定路線網図（市道）", build: sonicweb("ashikaga", "th_3"), verified: true }], contact: { dept: "都市建設部 建築指導課 建築指導担当", phone: "0284-20-2170" } },
  {
    pref,
    name: "栃木市",
    codes: ["09203"],
    coverage: "partial",
    maps: [{ kind: "designated_only", label: "指定道路図（栃木市地理情報システム・位置指定道路の一部）", build: sonicweb("tochigi", "th_38"), verified: true }],
    contact: { dept: "建築指導課 建築指導係", phone: "0282-21-2441" },
    note: "公開は位置指定道路の一部だけ。建築確認では必ず建築指導課で最新を確認。",
  },
  { pref, name: "佐野市", codes: ["09204"], coverage: "none", maps: [{ kind: "public_road", label: "路線網図（市道）", build: sonicweb("sano", "th_54"), verified: true }], contact: { dept: "都市建設部 建築指導課", phone: "0283-20-3104" } },
  {
    pref,
    name: "鹿沼市",
    codes: ["09205"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（PDF・2023年3月時点）", build: null, url: "https://www.city.kanuma.tochigi.jp/0380/info-0000000267-1.html", verified: false }],
    contact: { dept: "建築指導課", phone: "0289-63-2242" },
    note: "図は2023年3月末時点。最新は建築指導課で確認。",
  },
  {
    pref,
    name: "日光市",
    codes: ["09206"],
    coverage: "partial",
    maps: [{ kind: "designated_only", label: "指定道路図（画像・1項4号/5号/2項）", build: null, url: "https://www.city.nikko.lg.jp/soshiki/7/1035/6/8377.html", verified: false }],
    contact: { dept: "建設部 建築住宅課 建築指導係", phone: "0288-21-5197", note: "図で分からない道はフォームで照会・調査を依頼できる" },
  },
  { pref, name: "小山市", codes: ["09208"], coverage: "none", maps: [{ kind: "public_road", label: "認定道路情報（おやまわが街ガイド）", build: wagmap("oyamacity", 3, { scale: 2500 }), verified: true }], contact: { dept: "建築指導課 建築指導係（市役所4階）", phone: "0285-22-9233" } },
  { pref, name: "大田原市", codes: ["09210"], coverage: "none", maps: [], contact: { dept: "建築指導課", phone: "0287-23-1178" } },
  { pref, name: "那須塩原市", codes: ["09213"], coverage: "none", maps: [], contact: { dept: "建築指導課", phone: "0287-62-7174" } },
];

// --- 県が扱う市町 --------------------------------------------------------------

const prefArea = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_ROAD_MAP],
  contact: OFFICE[office],
  note: "県のネット公開は位置指定道路の一部だけ。種別の無い道は県の建築指導課で確認。",
});

const PREF_AREAS: Municipality[] = [
  prefArea("矢板市", "09211", "first"),
  prefArea("さくら市", "09214", "first"),
  prefArea("那須烏山市", "09215", "first"),
  prefArea("上三川町", "09301", "first"),
  prefArea("壬生町", "09361", "first"),
  prefArea("塩谷町", "09384", "first"),
  prefArea("高根沢町", "09386", "first"),
  prefArea("那須町", "09407", "first"),
  prefArea("那珂川町", "09411", "first"),
  prefArea("真岡市", "09209", "second"),
  prefArea("下野市", "09216", "second"),
  prefArea("益子町", "09342", "second"),
  prefArea("茂木町", "09343", "second"),
  prefArea("市貝町", "09344", "second"),
  prefArea("芳賀町", "09345", "second"),
  prefArea("野木町", "09364", "second"),
];

export const TOCHIGI: Municipality[] = [...CITIES, ...PREF_AREAS];
