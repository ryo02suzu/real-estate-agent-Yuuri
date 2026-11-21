// 九州・沖縄8県（福岡・佐賀・長崎・熊本・大分・宮崎・鹿児島・沖縄）の市町村（274）。市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 道路種別の公式図・問い合わせ先を調べる前の市町村を coverage: "unknown"（調査中）でここに置き、調べた道県から data/<道県>.ts に移す。
// 2026-11-21 に、福岡市を data/fukuoka.ts（FUKUOKA_CITIES）に、八代市を data/kumamoto.ts（KUMAMOTO_CITIES）に移した。
// 日向市は、市のホームページがシステム障害で臨時のページのままで、道路の図のページも課のページも確かめられないので、ここに残す（docs/miyazaki-research.md）
import type { Municipality } from "../municipalities";

export const KYUSHU_PENDING: Municipality[] = [
  // 宮崎県（残り 1）
  { pref: "宮崎県", name: "日向市", codes: ["45206"], coverage: "unknown", maps: [] },
];
