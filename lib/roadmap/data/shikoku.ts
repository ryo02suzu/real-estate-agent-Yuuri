// 四国4県（徳島・香川・愛媛・高知）の市町村（95）。市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 道路種別の公式図・問い合わせ先を調べる前の市町村を coverage: "unknown"（調査中）でここに置き、調べた道県から data/<道県>.ts に移す。
// 2026-11-15 に、最後の松山市を data/ehime.ts（EHIME_CITIES）に移し、四国の調査中は無くなった。
import type { Municipality } from "../municipalities";

export const SHIKOKU_PENDING: Municipality[] = [];
