// 九州・沖縄8県（福岡・佐賀・長崎・熊本・大分・宮崎・鹿児島・沖縄）の市町村（274）。市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 道路種別の公式図・問い合わせ先を調べる前の市町村を coverage: "unknown"（調査中）でここに置き、調べた道県から data/<道県>.ts に移す。
// 政令市（北九州市・福岡市・熊本市）は区のコードをまとめて1つ（逆ジオコーダは区のコードを返すので、市そのもののコード 40100・40130・43100 は使わない）
import type { Municipality } from "../municipalities";

export const KYUSHU_PENDING: Municipality[] = [
  // 福岡県（残り 1）
  { pref: "福岡県", name: "福岡市", codes: ["40131", "40132", "40133", "40134", "40135", "40136", "40137"], coverage: "unknown", maps: [] },
  // 熊本県（残り 2）
  { pref: "熊本県", name: "熊本市", codes: ["43101", "43102", "43103", "43104", "43105"], coverage: "unknown", maps: [] },
  { pref: "熊本県", name: "八代市", codes: ["43202"], coverage: "unknown", maps: [] },
  // 宮崎県（残り 3）
  { pref: "宮崎県", name: "都城市", codes: ["45202"], coverage: "unknown", maps: [] },
  { pref: "宮崎県", name: "延岡市", codes: ["45203"], coverage: "unknown", maps: [] },
  { pref: "宮崎県", name: "日向市", codes: ["45206"], coverage: "unknown", maps: [] },
  // 鹿児島県（残り 3）
  { pref: "鹿児島県", name: "鹿屋市", codes: ["46203"], coverage: "unknown", maps: [] },
  { pref: "鹿児島県", name: "薩摩川内市", codes: ["46215"], coverage: "unknown", maps: [] },
  { pref: "鹿児島県", name: "霧島市", codes: ["46218"], coverage: "unknown", maps: [] },
  // 沖縄県（残り 4）
  { pref: "沖縄県", name: "宜野湾市", codes: ["47205"], coverage: "unknown", maps: [] },
  { pref: "沖縄県", name: "浦添市", codes: ["47208"], coverage: "unknown", maps: [] },
  { pref: "沖縄県", name: "沖縄市", codes: ["47211"], coverage: "unknown", maps: [] },
  { pref: "沖縄県", name: "うるま市", codes: ["47213"], coverage: "unknown", maps: [] },
];
