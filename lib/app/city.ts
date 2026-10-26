// ホームの街（PLATEAU の実在の建物）を、今の時刻と天気で照らすための決まり。
//  窓の明かり：建物の用途（PLATEAU の属性）ごとに、曜日・祝日・時刻で点いている割合を決める（オフィスは平日の夜に階ごとに消え、
//  土日祝と年末年始は暗い。住宅は夜に増えて深夜に減る）。見通し（遠くの霞・富士山が見えるか）は湿度と天気から。
//  富士山の雪線は月ごと、木は季節（桜・新緑・紅葉・冬枯れ）で色を変える。どれも演出のためのおおまかな値
import { airFrom } from "./air";
import { ATMOS } from "./atmosphere";
import { jstDate } from "./city-date";
import type { Weather } from "./weather";
import { jstHours } from "./weather";

export { jstDate };

const nthMonday = (y: number, m: number, n: number) => {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
};
const shunbun = (y: number) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const shubun = (y: number) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

/** その日が「国民の祝日」そのものか（振替休日・国民の休日は含まない） */
function baseHoliday(y: number, m: number, d: number): boolean {
  const fixed: Record<number, number[]> = { 1: [1], 2: [11, 23], 4: [29], 5: [3, 4, 5], 8: [11], 11: [3, 23] };
  if (fixed[m]?.includes(d)) return true;
  if (m === 1 && d === nthMonday(y, 1, 2)) return true;
  if (m === 3 && d === shunbun(y)) return true;
  if (m === 7 && d === nthMonday(y, 7, 3)) return true;
  if (m === 9 && (d === nthMonday(y, 9, 3) || d === shubun(y))) return true;
  if (m === 10 && d === nthMonday(y, 10, 2)) return true;
  return false;
}

const shift = (y: number, m: number, d: number, k: number) => {
  const t = new Date(Date.UTC(y, m - 1, d + k));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
};

/** 日本の祝日（振替休日と国民の休日を含む）。日本時間の日付で */
export function jpHoliday(at: Date): boolean {
  const { y, m, d } = jstDate(at);
  if (baseHoliday(y, m, d)) return true;
  // 振替休日：日曜の祝日のあと、最初の祝日でない日
  for (let k = 1; k <= 6; k++) {
    const p = shift(y, m, d, -k);
    if (!baseHoliday(p.y, p.m, p.d)) break;
    if (p.dow === 0) return true;
  }
  // 国民の休日：前後が祝日の平日
  const a = shift(y, m, d, -1), b = shift(y, m, d, 1);
  return baseHoliday(a.y, a.m, a.d) && baseHoliday(b.y, b.m, b.d);
}

export type DayKind = "weekday" | "saturday" | "holiday";
/** 平日・土曜・休日（日曜・祝日・年末年始 12/29〜1/3） */
export function dayKind(at: Date): DayKind {
  const { m, d, dow } = jstDate(at);
  if (dow === 0 || jpHoliday(at) || (m === 12 && d >= 29) || (m === 1 && d <= 3)) return "holiday";
  return dow === 6 ? "saturday" : "weekday";
}

/** 用途の区分（焼き込みの番号と同じ）：1 オフィス 2 商業 3 ホテル 4 住宅 5 公共・学校 6 その他 */
export const USE = { office: 1, commercial: 2, hotel: 3, residential: 4, public: 5, other: 6 } as const;

type Curve = [number, number][];
const lerpCurve = (c: Curve, h: number) => {
  const x = ((h % 24) + 24) % 24;
  for (let i = 0; i < c.length - 1; i++) {
    const [h0, v0] = c[i];
    const [h1, v1] = c[i + 1];
    if (x >= h0 && x <= h1) return v0 + ((v1 - v0) * (x - h0)) / (h1 - h0);
  }
  return c[c.length - 1][1];
};
const CURVES: Record<DayKind, Record<number, Curve>> = {
  weekday: {
    1: [[0, 0.06], [6, 0.06], [7.5, 0.3], [9, 0.8], [18, 0.8], [19, 0.62], [20, 0.46], [21, 0.33], [22, 0.22], [23, 0.12], [24, 0.06]],
    2: [[0, 0.06], [9, 0.1], [10, 0.85], [20, 0.85], [21, 0.6], [22, 0.3], [23, 0.12], [24, 0.06]],
    3: [[0, 0.3], [2, 0.18], [5, 0.15], [6.5, 0.45], [8, 0.4], [10, 0.2], [17, 0.35], [20, 0.75], [23, 0.55], [24, 0.3]],
    4: [[0, 0.38], [1, 0.25], [2, 0.14], [4, 0.1], [5.5, 0.22], [7, 0.55], [8.5, 0.35], [16, 0.25], [18, 0.55], [20, 0.85], [22, 0.8], [23, 0.62], [24, 0.38]],
    5: [[0, 0.04], [7, 0.06], [8.5, 0.75], [17, 0.75], [18.5, 0.4], [20, 0.18], [22, 0.06], [24, 0.04]],
    6: [[0, 0.12], [6, 0.12], [8, 0.4], [18, 0.5], [21, 0.4], [23, 0.2], [24, 0.12]],
  },
  saturday: {
    1: [[0, 0.05], [8, 0.08], [10, 0.25], [17, 0.22], [20, 0.12], [24, 0.05]],
    2: [[0, 0.06], [9, 0.1], [10, 0.9], [20.5, 0.9], [22, 0.35], [23, 0.12], [24, 0.06]],
    3: [[0, 0.32], [2, 0.2], [5, 0.15], [7, 0.45], [10, 0.25], [17, 0.4], [20, 0.8], [23, 0.6], [24, 0.32]],
    4: [[0, 0.45], [1, 0.32], [2, 0.2], [4, 0.12], [6, 0.18], [8, 0.45], [12, 0.35], [17, 0.5], [20, 0.88], [23, 0.7], [24, 0.45]],
    5: [[0, 0.03], [9, 0.2], [17, 0.2], [19, 0.06], [24, 0.03]],
    6: [[0, 0.1], [8, 0.25], [18, 0.4], [22, 0.25], [24, 0.1]],
  },
  holiday: {
    1: [[0, 0.04], [9, 0.06], [12, 0.12], [17, 0.1], [20, 0.06], [24, 0.04]],
    2: [[0, 0.06], [9, 0.1], [10, 0.85], [20, 0.85], [21.5, 0.3], [23, 0.1], [24, 0.06]],
    3: [[0, 0.3], [2, 0.2], [5, 0.15], [7, 0.45], [10, 0.25], [17, 0.4], [20, 0.78], [23, 0.55], [24, 0.3]],
    4: [[0, 0.42], [1, 0.3], [2, 0.18], [4, 0.1], [6, 0.15], [8.5, 0.45], [12, 0.38], [17, 0.5], [20, 0.86], [22.5, 0.7], [24, 0.42]],
    5: [[0, 0.03], [24, 0.03]],
    6: [[0, 0.1], [8, 0.2], [18, 0.35], [22, 0.2], [24, 0.1]],
  },
};

/** 用途ごとの「点いている割合」（index 0 は使わない）。オフィスは階ごと、ほかは窓ごとに使う */
export function windowOccupancy(at: Date): number[] {
  const kind = dayKind(at);
  const h = jstHours(at);
  const c = CURVES[kind];
  return [0, 1, 2, 3, 4, 5, 6].map((k) => (k === 0 ? 0 : Math.round(lerpCurve(c[k], h) * 1000) / 1000));
}

/** 見通し（km。コシュミーダーの式）。空の霞と同じ量（lib/app/air.ts）から。乾いた冬の晴れた日は富士山（約 100km）が見え、雨・雪・霧で短くなる */
export function visibilityKm(w: Weather, at: Date): number {
  let v = 3.912 / (ATMOS.betaM * ATMOS.mieExt * airFrom(w, at).aero + 0.0115);
  if (w.precip > 0) v = Math.min(v, (w.kind === "snow" ? 4.5 : 8) * (1 - 0.5 * w.precip) + 1.5);
  if (w.fog > 0) v = Math.min(v, Math.max(0.6, 12 * (1 - w.fog) ** 2));
  if (w.cloud > 0.9 && w.precip === 0) v = Math.min(v, 35);
  return Math.round(v * 10) / 10;
}

const DOY = (at: Date) => {
  const { y, m, d } = jstDate(at);
  return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400e3;
};
const yearly = (knots: [number, number][], doy: number) => {
  // [日（年の何日目）, 値] を一年で巡回して補間
  const k = [...knots, [knots[0][0] + 365, knots[0][1]] as [number, number]];
  const x = doy < knots[0][0] ? doy + 365 : doy;
  for (let i = 0; i < k.length - 1; i++) if (x >= k[i][0] && x <= k[i + 1][0]) return k[i][1] + ((k[i + 1][1] - k[i][1]) * (x - k[i][0])) / (k[i + 1][0] - k[i][0]);
  return knots[0][1];
};

/** 富士山・丹沢の雪線（m）。夏（7〜9 月）は雪がない */
export function snowlineM(at: Date): number {
  return Math.round(yearly([[15, 1600], [46, 1500], [75, 1800], [106, 2300], [136, 2800], [167, 3400], [185, 4200], [270, 4200], [280, 3700], [305, 3000], [334, 2300], [355, 1900]], DOY(at)));
}

/** 木の季節：桜（0〜1）・新緑・紅葉・冬枯れ */
export function treeSeason(at: Date): { blossom: number; fresh: number; autumn: number; bare: number } {
  const d = DOY(at);
  const bump = (c: number, w: number) => Math.max(0, 1 - Math.abs(d - c) / w);
  return {
    blossom: Math.round(Math.min(1, bump(88, 9) * 1.4) * 100) / 100, // 3/29 ごろ
    fresh: Math.round(bump(125, 30) * 100) / 100,
    autumn: Math.round(Math.min(1, bump(332, 22) * 1.3) * 100) / 100, // 11/28 ごろ
    bare: Math.round(Math.max(bump(30, 45), 0) * 100) / 100,
  };
}
