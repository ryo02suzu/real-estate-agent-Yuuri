// 中部9県の市町村（316）。市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 道路種別の公式図・問い合わせ先はまだ調べていない（coverage: "unknown" = 調査中）。調べた県から {niigata,…,aichi}.ts に移す。
import type { Municipality } from "../municipalities";

export const CHUBU_PENDING: Municipality[] = [
  // 福井県（17）
  { pref: "福井県", name: "福井市", codes: ["18201"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "敦賀市", codes: ["18202"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "小浜市", codes: ["18204"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "大野市", codes: ["18205"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "勝山市", codes: ["18206"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "鯖江市", codes: ["18207"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "あわら市", codes: ["18208"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "越前市", codes: ["18209"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "坂井市", codes: ["18210"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "永平寺町", codes: ["18322"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "池田町", codes: ["18382"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "南越前町", codes: ["18404"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "越前町", codes: ["18423"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "美浜町", codes: ["18442"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "高浜町", codes: ["18481"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "おおい町", codes: ["18483"], coverage: "unknown", maps: [] },
  { pref: "福井県", name: "若狭町", codes: ["18501"], coverage: "unknown", maps: [] },
];
