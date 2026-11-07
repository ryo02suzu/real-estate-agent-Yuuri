// 中部9県の市町村（316）。市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 道路種別の公式図・問い合わせ先を調べる前の市町村を coverage: "unknown"（調査中）でここに置き、調べた県から data/<県>.ts に移した。
// 2026-11-07 に9県すべて調べ終えたので空（新しい地方を足すときも、同じ形の調査中の一覧から始める）。
import type { Municipality } from "../municipalities";

export const CHUBU_PENDING: Municipality[] = [];
