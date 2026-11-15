// 窓口の名前・住所の出し方で、都道府県の名前を見分ける所をここにまとめる
// （前は「東京都」と「◯◯県」だけを見ていて、大阪府・京都府・北海道の窓口の前に市町村の名前が付いていた）

/** 都道府県の名前（住所や窓口の名前の先頭） */
export const PREF_HEAD = /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/;

/** 都道府県の窓口か（名前が「東京都 …」「北海道 …」「大阪府 …」「◯◯県 …」で始まる） */
const PREF_DESK = /^(東京都|北海道|(?:京都|大阪)府|\S{2,3}県)\s/;

/**
 * 画面・書類に出す窓口の名前。都道府県の窓口（「埼玉県 川越建築安全センター」「北海道 空知総合振興局 …」）はそのまま、
 * 市区町村の窓口は市区町村の名前を前に付ける（「さいたま市 建築指導課」）
 */
export function deptLabel(city: string, dept: string): string {
  return PREF_DESK.test(dept) ? dept : `${city} ${dept}`;
}

/**
 * 都道府県の出している地図か（ボタンの名前に、その市区町村の都道府県の名前が入っている）。その呼び方（県・府・道・都）を返す。
 * 市区町村の地図は undefined（「国道/県道/市道」「県域統合型GIS」のように「県」の字があるだけでは、都道府県の地図としない）
 */
export function prefUnit(label: string, pref: string): string | undefined {
  return label.includes(pref) ? pref.slice(-1) : undefined;
}
