// 北海道の市町村（179）。市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 道路種別の公式図・問い合わせ先を調べる前の市町村を coverage: "unknown"（調査中）でここに置き、調べた道県から data/<道県>.ts に移す。
// 札幌市は区のコードをまとめて1つ（市そのもののコード 01100 は使わない）。北方領土の6村（色丹村・泊村・留夜別村・留別村・紗那村・蘂取村）は入れていない
import type { Municipality } from "../municipalities";

export const HOKKAIDO_PENDING: Municipality[] = [
  // 北海道（残り 16）
  { pref: "北海道", name: "網走市", codes: ["01211"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "留萌市", codes: ["01212"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "稚内市", codes: ["01214"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "紋別市", codes: ["01219"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "根室市", codes: ["01223"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "富良野市", codes: ["01229"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "登別市", codes: ["01230"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "伊達市", codes: ["01233"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "東神楽町", codes: ["01453"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "美幌町", codes: ["01543"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "遠軽町", codes: ["01555"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "白老町", codes: ["01578"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "音更町", codes: ["01631"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "芽室町", codes: ["01637"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "幕別町", codes: ["01643"], coverage: "unknown", maps: [] },
  { pref: "北海道", name: "中標津町", codes: ["01692"], coverage: "unknown", maps: [] },
];
