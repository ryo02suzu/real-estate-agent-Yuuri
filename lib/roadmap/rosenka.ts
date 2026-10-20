// 路線価（相続税・固定資産税）の確認先。一般財団法人資産評価システム研究センターの「全国地価マップ」（chikamap.jp）を、
// 物件の場所で開く（地図は年度・年分ごとに別の番号。最新の番号は data/chikamap.json。scripts/chikamap/update.py が毎月確かめる）。
// 地図のデータは取り込まない（リンクだけ）。初めて開くと利用条件の画面が出て、同意すると物件の場所の地図に進む
import CHIKAMAP from "./data/chikamap.json";

export type RosenkaKind = "souzoku" | "kotei";

export type RosenkaLink = { kind: RosenkaKind; /** 「相続税路線価等（令和7年分）」 */ name: string; url: string };

/** 路線価の数字が読める縮尺（1/1,500） */
const SCALE = 1500;

/** 全国地価マップの地図を、物件の地点を中心に開く URL（gprj=2：座標は世界測地系の経度・緯度） */
export const chikamapUrl = (mid: number, lat: number, lng: number, scale = SCALE) =>
  `https://www.chikamap.jp/chikamap/Map?mid=${mid}&mpx=${lng.toFixed(6)}&mpy=${lat.toFixed(6)}&mps=${scale}&gprj=2`;

/** 物件の場所の路線価の地図（相続税・固定資産税の最新の年分・年度） */
export function rosenkaLinks(lat: number, lng: number): RosenkaLink[] {
  return (["souzoku", "kotei"] as const).map((kind) => ({ kind, name: CHIKAMAP.maps[kind].name, url: chikamapUrl(CHIKAMAP.maps[kind].mid, lat, lng) }));
}

/** 画面の注記（相続税は国税庁、固定資産税は市町村（東京23区は都）が決めたもの。路線価は物件の価格ではない） */
export const ROSENKA_NOTE = "全国地価マップ（資産評価システム研究センター）で開きます。利用条件に同意すると、物件の場所が地図の中心に出ます";

/** 確かめる先（路線価は物件の価格ではない） */
export const ROSENKA_CHECK = "相続税路線価は国税庁、固定資産税路線価は市町村（東京23区は都）が公表したもの。物件の価格ではありません";
