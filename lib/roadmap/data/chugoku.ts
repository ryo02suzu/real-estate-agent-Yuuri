// 中国5県（鳥取・島根・岡山・広島・山口）の市町村（107）のうち、道路種別の公式図・問い合わせ先をまだ調べ終えていない市。
// 市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。調べた県の「県が扱う市町村」は data/<県>.ts に移した
// （2026-11-15：広島 15・岡山 20・山口 10・鳥取 15・島根 11 の 71市町村）。残りは、市が建築確認と道路を扱う市（特定行政庁・限定特定行政庁）の 36市で、
// 道路図は「調査中」（coverage: "unknown"）のままここに置く。
// 政令市（岡山市・広島市）は区のコードをまとめて1つ（逆ジオコーダは区のコードを返すので、市そのもののコード 33100・34100 は使わない）
import type { Municipality } from "../municipalities";

export const CHUGOKU_PENDING: Municipality[] = [
  // 鳥取県（残り 4）
  { pref: "鳥取県", name: "鳥取市", codes: ["31201"], coverage: "unknown", maps: [] },
  { pref: "鳥取県", name: "米子市", codes: ["31202"], coverage: "unknown", maps: [] },
  { pref: "鳥取県", name: "倉吉市", codes: ["31203"], coverage: "unknown", maps: [] },
  { pref: "鳥取県", name: "境港市", codes: ["31204"], coverage: "unknown", maps: [] },
  // 島根県（残り 8）
  { pref: "島根県", name: "松江市", codes: ["32201"], coverage: "unknown", maps: [] },
  { pref: "島根県", name: "浜田市", codes: ["32202"], coverage: "unknown", maps: [] },
  { pref: "島根県", name: "出雲市", codes: ["32203"], coverage: "unknown", maps: [] },
  { pref: "島根県", name: "益田市", codes: ["32204"], coverage: "unknown", maps: [] },
  { pref: "島根県", name: "大田市", codes: ["32205"], coverage: "unknown", maps: [] },
  { pref: "島根県", name: "安来市", codes: ["32206"], coverage: "unknown", maps: [] },
  { pref: "島根県", name: "江津市", codes: ["32207"], coverage: "unknown", maps: [] },
  { pref: "島根県", name: "雲南市", codes: ["32209"], coverage: "unknown", maps: [] },
  // 岡山県（残り 6）
  { pref: "岡山県", name: "倉敷市", codes: ["33202"], coverage: "unknown", maps: [] },
  { pref: "岡山県", name: "津山市", codes: ["33203"], coverage: "unknown", maps: [] },
  { pref: "岡山県", name: "玉野市", codes: ["33204"], coverage: "unknown", maps: [] },
  { pref: "岡山県", name: "笠岡市", codes: ["33205"], coverage: "unknown", maps: [] },
  { pref: "岡山県", name: "総社市", codes: ["33208"], coverage: "unknown", maps: [] },
  { pref: "岡山県", name: "新見市", codes: ["33210"], coverage: "unknown", maps: [] },
  // 広島県（残り 7）
  { pref: "広島県", name: "呉市", codes: ["34202"], coverage: "unknown", maps: [] },
  { pref: "広島県", name: "三原市", codes: ["34204"], coverage: "unknown", maps: [] },
  { pref: "広島県", name: "尾道市", codes: ["34205"], coverage: "unknown", maps: [] },
  { pref: "広島県", name: "福山市", codes: ["34207"], coverage: "unknown", maps: [] },
  { pref: "広島県", name: "三次市", codes: ["34209"], coverage: "unknown", maps: [] },
  { pref: "広島県", name: "東広島市", codes: ["34212"], coverage: "unknown", maps: [] },
  { pref: "広島県", name: "廿日市市", codes: ["34213"], coverage: "unknown", maps: [] },
  // 山口県（残り 9）
  { pref: "山口県", name: "下関市", codes: ["35201"], coverage: "unknown", maps: [] },
  { pref: "山口県", name: "宇部市", codes: ["35202"], coverage: "unknown", maps: [] },
  { pref: "山口県", name: "山口市", codes: ["35203"], coverage: "unknown", maps: [] },
  { pref: "山口県", name: "萩市", codes: ["35204"], coverage: "unknown", maps: [] },
  { pref: "山口県", name: "防府市", codes: ["35206"], coverage: "unknown", maps: [] },
  { pref: "山口県", name: "岩国市", codes: ["35208"], coverage: "unknown", maps: [] },
  { pref: "山口県", name: "長門市", codes: ["35211"], coverage: "unknown", maps: [] },
  { pref: "山口県", name: "周南市", codes: ["35215"], coverage: "unknown", maps: [] },
  { pref: "山口県", name: "山陽小野田市", codes: ["35216"], coverage: "unknown", maps: [] },
];
