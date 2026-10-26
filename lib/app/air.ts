// 空気のにごり（湿度）。霞の粒（エアロゾル）は湿度が高いと水を吸ってふくらみ、光をよく散らす。東京の空が夏に白っぽく、
// 冬の乾いた日に深く青いのはこのため。気象庁の湿度（10 分ごと）と季節から霞の量 aero（1 ＝ 湿度 50% の平年）を決め、
//  - 空の色（ミー散乱の係数。lib/app/atmosphere.ts）、太陽のにじみの広がり
//  - 遠くの霞（見通し。lib/app/city.ts）
//  - 星の見え方（霞に消える）、夜の空の明るさ（街の明かりが霞で散って空が明るくなる）
// に使う。湿度が分からないときは月ごとの平年の湿度
import { jstDate } from "./city-date";
import type { Weather } from "./weather";

export type Air = {
  /** 霞の量（地表近くの霞の係数に掛ける。1 で見通し約 20km。0.1〜2.5） */
  aero: number;
  /** 使った湿度（%） */
  rh: number;
  /** 夜の空の地（街明かりの照り返し）の倍率 */
  glow: number;
  /** 星の見える度合い（0〜1） */
  stars: number;
};

/** 東京の月ごとの平年の湿度（%。1〜12 月） */
export const RH_NORMAL = [0, 51, 52, 57, 62, 68, 75, 76, 74, 75, 70, 64, 56];
/**
 * 季節の霞の多さ（湿度 50% のとき）。冬は大陸からの乾いた澄んだ空気で少なく（見通し 100km 級）、春は黄砂、
 * 夏は光化学スモッグ・もやで多い（見通し 10km 前後）
 */
export const AERO_SEASON = [0, 0.18, 0.22, 0.45, 0.6, 0.75, 1.0, 1.2, 1.2, 1.0, 0.65, 0.35, 0.18];

/** 湿度 rh（%）での霞の粒のふくらみ（湿度 50% を 1 とする。Hänel の式の形） */
export function growth(rh: number): number {
  const r = Math.min(97, Math.max(10, rh)) / 100;
  return Math.pow(0.5 / (1 - r), 0.8);
}

export function airFrom(w: Weather, at: Date): Air {
  const { m } = jstDate(at);
  const rh = w.humidity === null ? RH_NORMAL[m] : Math.min(100, Math.max(0, w.humidity));
  // 上限 2.5（見通し約 8km）。それより濃いのは霧・雨で、そちらで描く
  const aero = Math.round(Math.min(2.5, Math.max(0.1, growth(rh) * AERO_SEASON[m])) * 1000) / 1000;
  return {
    aero,
    rh,
    glow: Math.round(Math.min(1.9, Math.max(0.85, 0.65 + 0.35 * aero)) * 1000) / 1000,
    stars: Math.round(Math.min(1, Math.max(0.15, Math.exp(-0.5 * (aero - 0.1)))) * 1000) / 1000,
  };
}
