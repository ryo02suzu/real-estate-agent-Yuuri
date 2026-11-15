// 北海道の市町村（179）。市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 道路種別の公式図・問い合わせ先を調べる前の市町村を coverage: "unknown"（調査中）でここに置き、調べた道県から data/<道県>.ts に移す。
// 札幌市は区のコードをまとめて1つ（市そのもののコード 01100 は使わない）。北方領土の6村（色丹村・泊村・留夜別村・留別村・紗那村・蘂取村）は入れていない
import type { Municipality } from "../municipalities";

export const HOKKAIDO_PENDING: Municipality[] = [
];
