// 市区町村コード表（国土地理院の市区町村表から作った data/gsi-muni-codes.json）のうち、対応している都道府県の分。
// 表には準備中の地方（regions.json の preparing）の道県も入っているが、アプリが住所から市区町村を見つけるとき・市区町村の名前を出すときは、
// 対応している都道府県だけを使う（準備中の地方の市町村を、対応エリアの市町村と取り違えないため）
import GSI_CODES from "./data/gsi-muni-codes.json";
import { PREF_NAMES } from "./regions";

const OPEN = new Set(Object.values(PREF_NAMES));

/** 都道府県の名前 → { 市区町村コード: 名前（政令市の区は「さいたま市 西区」） }。対応している都道府県だけ */
export const MUNI_CODES: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(GSI_CODES as Record<string, Record<string, string>>).filter(([pref]) => OPEN.has(pref)),
);
