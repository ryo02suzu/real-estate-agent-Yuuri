// 東京タワーの点灯（公式サイトの決まり）：日没〜24 時。ランドマークライトは 7/7 の夜から白（夏）、10 月初旬の夜からオレンジ（冬）。
// 月曜と木曜の 20:00〜22:00 はインフィニティ・ダイヤモンドヴェール（月ごとの色。2 つの模様が 30 分ごとに替わり、替わり目は白く 4 分）。
// 日没〜24 時の毎正時は 2 分間「純白の煌めき」（大展望台とトップデッキの上部）。展望台は 23 時まで。特別点灯は予告なく変わるので扱わない
import { jstDate } from "./city";
import { jstHours } from "./weather";

export type RGB3 = [number, number, number];
/** ダイヤモンドヴェールの月ごとの色（1月 黄金色 … 12月 常盤色） */
export const VEIL_COLORS: RGB3[] = [
  [1.0, 0.76, 0.22], [0.96, 0.32, 0.46], [1.0, 0.62, 0.78], [0.55, 0.92, 0.32], [0.38, 0.72, 1.0], [0.68, 0.52, 1.0],
  [0.14, 0.42, 1.0], [0.2, 0.78, 0.42], [0.62, 0.38, 0.86], [1.0, 0.38, 0.12], [1.0, 0.2, 0.12], [0.1, 0.66, 0.42],
];
export const LANDMARK_WINTER: RGB3 = [1.0, 0.5, 0.16];
export const LANDMARK_SUMMER: RGB3 = [0.82, 0.88, 1.0];

export type TowerLight = {
  /** 塔の照明が点いているか（日没〜24 時） */
  on: boolean;
  /** 0 ランドマーク、1 ダイヤモンドヴェール（模様 A）、2 同（模様 B） */
  mode: 0 | 1 | 2;
  /** 0〜1：ヴェールの替わり目に白く包む強さ */
  white: number;
  color: RGB3;
  /** 毎正時の「純白の煌めき」 */
  sparkle: boolean;
  /** 展望台の窓の明かり（23 時まで） */
  decks: boolean;
};

export function towerLight(at: Date, sunAltitude: number): TowerLight {
  const h = jstHours(at);
  const { m, d, dow } = jstDate(at);
  const on = sunAltitude < -0.83 && h >= 12;
  const summer = (m === 7 && d >= 7) || m === 8 || m === 9;
  let mode: 0 | 1 | 2 = 0;
  let white = 0;
  if (on && (dow === 1 || dow === 4) && h >= 20 && h < 22) {
    const min = (h - 20) * 60;
    mode = Math.floor(min / 30) % 2 === 0 ? 1 : 2;
    // 替わり目（20:30・21:00・21:30）の 4 分は白く包む
    const since = min % 30;
    if (min >= 30 && since < 4) white = Math.sin((since / 4) * Math.PI);
  }
  const color = mode ? VEIL_COLORS[m - 1] : summer ? LANDMARK_SUMMER : LANDMARK_WINTER;
  const minute = (h % 1) * 60;
  return { on, mode, white: Math.round(white * 100) / 100, color, sparkle: on && minute < 2 && Math.floor(h) !== 0, decks: on && h < 23 };
}
