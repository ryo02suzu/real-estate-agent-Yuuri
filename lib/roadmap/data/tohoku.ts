// 東北6県の市町村のうち、道路種別の公式図・問い合わせ先をまだ登録していない市町村。市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 道路種別の公式図・問い合わせ先を調べる前の市町村を coverage: "unknown"（調査中）でここに置き、調べた県から data/<県>.ts に移す。
// 登録済み：宮城県（data/miyagi.ts）・青森県（data/aomori.ts）・山形県（data/yamagata.ts）・福島県（data/fukushima.ts）・岩手県（data/iwate.ts）
import type { Municipality } from "../municipalities";

export const TOHOKU_PENDING: Municipality[] = [
  // 秋田県（25）
  { pref: "秋田県", name: "秋田市", codes: ["05201"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "能代市", codes: ["05202"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "横手市", codes: ["05203"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "大館市", codes: ["05204"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "男鹿市", codes: ["05206"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "湯沢市", codes: ["05207"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "鹿角市", codes: ["05209"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "由利本荘市", codes: ["05210"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "潟上市", codes: ["05211"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "大仙市", codes: ["05212"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "北秋田市", codes: ["05213"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "にかほ市", codes: ["05214"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "仙北市", codes: ["05215"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "小坂町", codes: ["05303"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "上小阿仁村", codes: ["05327"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "藤里町", codes: ["05346"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "三種町", codes: ["05348"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "八峰町", codes: ["05349"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "五城目町", codes: ["05361"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "八郎潟町", codes: ["05363"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "井川町", codes: ["05366"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "大潟村", codes: ["05368"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "美郷町", codes: ["05434"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "羽後町", codes: ["05463"], coverage: "unknown", maps: [] },
  { pref: "秋田県", name: "東成瀬村", codes: ["05464"], coverage: "unknown", maps: [] },
];
