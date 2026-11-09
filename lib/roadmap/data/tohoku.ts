// 東北6県の市町村（227）。市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 道路種別の公式図・問い合わせ先を調べる前の市町村を coverage: "unknown"（調査中）でここに置き、調べた県から data/<県>.ts に移した。
// 登録済み：宮城県（data/miyagi.ts）・青森県（data/aomori.ts）・山形県（data/yamagata.ts）・福島県（data/fukushima.ts）・岩手県（data/iwate.ts）・秋田県（data/akita.ts）
// 2026-11-09 に6県すべて調べ終えたので空（新しい地方を足すときも、同じ形の調査中の一覧から始める）。
import type { Municipality } from "../municipalities";

export const TOHOKU_PENDING: Municipality[] = [];
