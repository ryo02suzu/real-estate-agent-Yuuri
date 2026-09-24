// 茨城県 全44市町村（2026-09 調査）。出典は docs/kanto-north-research.md。
// 特定行政庁は水戸・日立・土浦・古河・高萩・北茨城・取手・つくば・ひたちなかの9市。
// それ以外の35市町村は県（本庁の県央建築指導室と4つの県民センター）が扱う。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { sonicweb, wagmap } from "../vendors";

const pref = "茨城県" as const;

/**
 * いばらきデジタルまっぷ「指定道路（一部地域）」。市町村ごとに 5号・2項（古河市は3号も）と認定道路のレイヤがある。
 * 1/1000 では開かないため 1/2500
 */
const PREF_ROAD_MAP: MapLink = {
  kind: "designated_only",
  label: "茨城県 指定道路（いばらきデジタルまっぷ・5号/2項と認定道路）",
  build: wagmap("ibaraki", 30, { scale: 2500 }),
  verified: true,
};

const OFFICE: Record<string, Contact> = {
  central: { dept: "茨城県 土木部 都市局 建築指導課 県央建築指導室", phone: "029-301-4784" },
  north: { dept: "茨城県 県北県民センター 建築指導課", phone: "0294-80-3344" },
  rokko: { dept: "茨城県 鹿行県民センター 建築指導課", phone: "0291-33-4113" },
  south: { dept: "茨城県 県南県民センター 建築指導課", phone: "029-822-8519" },
  west: { dept: "茨城県 県西県民センター 建築指導課", phone: "0296-24-9152" },
};

const PREF_NOTE = "県の地図は位置指定道路（5号）・2項道路と認定道路まで。色の無い道は窓口で確認。";

// --- 特定行政庁の9市 ---------------------------------------------------------

const onPrefMap = (name: string, code: string, contact: Contact): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_ROAD_MAP],
  contact,
  note: `市の指定道路（一部）は県の地図で公開。${PREF_NOTE}`,
});

const CITIES: Municipality[] = [
  onPrefMap("水戸市", "08201", { dept: "建築指導課 審査第2係", phone: "029-224-1111（代表・内線3461）" }),
  onPrefMap("日立市", "08202", { dept: "都市建設部 建築指導課（本庁舎5階）", phone: "0294-22-3111（代表・内線428）" }),
  {
    pref,
    name: "土浦市",
    codes: ["08203"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "指定道路（土浦市地図情報）", build: sonicweb("tsuchiura", "th_1"), verified: true },
      { kind: "public_road", label: "認定路線網図（市道）", build: sonicweb("tsuchiura", "th_30"), verified: true },
    ],
    contact: { dept: "建築指導課 建築係（本庁舎4階）", phone: "029-826-1111（代表・内線2254）" },
  },
  onPrefMap("古河市", "08204", { dept: "建築指導課", phone: "0280-76-1511（代表）" }),
  { pref, name: "高萩市", codes: ["08214"], coverage: "none", maps: [], contact: { dept: "都市建設課 建築指導検査室（本庁舎2階）", phone: "0293-23-7032" } },
  { pref, name: "北茨城市", codes: ["08215"], coverage: "none", maps: [], contact: { dept: "建築課", phone: "0293-43-1111（代表・内線254）" } },
  onPrefMap("取手市", "08217", { dept: "建築指導課", phone: "0297-74-2141（代表）" }),
  {
    pref,
    name: "つくば市",
    codes: ["08220"],
    coverage: "none",
    maps: [],
    contact: { dept: "建築指導課", phone: "029-883-1111（代表）" },
    note: "市道かどうかは「つくミル」の認定道路マップで確認できるが、建築基準法の道路種別は窓口で確認。",
  },
  onPrefMap("ひたちなか市", "08221", { dept: "建築指導課 審査係", phone: "029-273-0111（代表・内線1351）" }),
];

// --- 県が扱う35市町村 ----------------------------------------------------------

const prefArea = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_ROAD_MAP],
  contact: OFFICE[office],
  note: PREF_NOTE,
});

const PREF_AREAS: Municipality[] = [
  prefArea("笠間市", "08216", "central"),
  prefArea("那珂市", "08226", "central"),
  prefArea("小美玉市", "08236", "central"),
  prefArea("茨城町", "08302", "central"),
  prefArea("大洗町", "08309", "central"),
  prefArea("城里町", "08310", "central"),
  prefArea("東海村", "08341", "central"),
  prefArea("常陸太田市", "08212", "north"),
  prefArea("常陸大宮市", "08225", "north"),
  prefArea("大子町", "08364", "north"),
  prefArea("鹿嶋市", "08222", "rokko"),
  prefArea("潮来市", "08223", "rokko"),
  prefArea("神栖市", "08232", "rokko"),
  prefArea("行方市", "08233", "rokko"),
  prefArea("鉾田市", "08234", "rokko"),
  prefArea("石岡市", "08205", "south"),
  prefArea("龍ケ崎市", "08208", "south"),
  prefArea("牛久市", "08219", "south"),
  prefArea("守谷市", "08224", "south"),
  prefArea("稲敷市", "08229", "south"),
  prefArea("かすみがうら市", "08230", "south"),
  prefArea("つくばみらい市", "08235", "south"),
  prefArea("美浦村", "08442", "south"),
  prefArea("阿見町", "08443", "south"),
  prefArea("河内町", "08447", "south"),
  prefArea("利根町", "08564", "south"),
  prefArea("結城市", "08207", "west"),
  prefArea("下妻市", "08210", "west"),
  prefArea("常総市", "08211", "west"),
  prefArea("筑西市", "08227", "west"),
  prefArea("坂東市", "08228", "west"),
  prefArea("桜川市", "08231", "west"),
  prefArea("八千代町", "08521", "west"),
  prefArea("五霞町", "08542", "west"),
  prefArea("境町", "08546", "west"),
];

export const IBARAKI: Municipality[] = [...CITIES, ...PREF_AREAS];
