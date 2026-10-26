import { describe, expect, it } from "vitest";
import { dayKind, jpHoliday, snowlineM, treeSeason, visibilityKm, windowOccupancy } from "./city";
import { towerLight } from "./tower";
import { NO_WEATHER } from "./weather";

const jst = (ymd: string, hm = "12:00") => new Date(`${ymd}T${hm}:00+09:00`);

describe("祝日と曜日", () => {
  it("国民の祝日・振替休日・国民の休日・年末年始", () => {
    expect(jpHoliday(jst("2026-01-01"))).toBe(true);
    expect(jpHoliday(jst("2026-01-12"))).toBe(true); // 成人の日（1月第2月曜）
    expect(jpHoliday(jst("2026-03-20"))).toBe(true); // 春分の日
    expect(jpHoliday(jst("2026-05-06"))).toBe(true); // 振替休日（5/3 が日曜）
    expect(jpHoliday(jst("2026-09-22"))).toBe(true); // 国民の休日（敬老の日と秋分の日の間）
    expect(jpHoliday(jst("2026-09-23"))).toBe(true); // 秋分の日
    expect(jpHoliday(jst("2026-10-12"))).toBe(true); // スポーツの日
    expect(jpHoliday(jst("2026-10-26"))).toBe(false);
    expect(dayKind(jst("2026-10-26"))).toBe("weekday");
    expect(dayKind(jst("2026-10-24"))).toBe("saturday");
    expect(dayKind(jst("2026-12-30"))).toBe("holiday");
  });
});

describe("窓の明かり（用途・曜日・時刻）", () => {
  it("平日の夜はオフィスが階ごとに消え、住宅は 20〜22 時がいちばん多い。休日のオフィスは暗い", () => {
    const wd19 = windowOccupancy(jst("2026-10-26", "19:00"));
    const wd23 = windowOccupancy(jst("2026-10-26", "23:00"));
    expect(wd19[1]).toBeGreaterThan(0.55);
    expect(wd23[1]).toBeLessThan(0.2);
    expect(windowOccupancy(jst("2026-10-26", "21:00"))[4]).toBeGreaterThan(0.8);
    expect(windowOccupancy(jst("2026-10-26", "03:00"))[4]).toBeLessThan(0.15);
    expect(windowOccupancy(jst("2026-10-25", "19:00"))[1]).toBeLessThan(0.15); // 日曜
  });
});

describe("見通し・雪線・木の季節", () => {
  it("乾いた冬の晴れは 100km 超（富士山が見える）、雨や霧は数 km", () => {
    expect(visibilityKm({ ...NO_WEATHER, humidity: 30 }, jst("2027-01-15"))).toBeGreaterThan(100);
    expect(visibilityKm({ ...NO_WEATHER, humidity: 75 }, jst("2026-07-15"))).toBeLessThan(40);
    expect(visibilityKm({ ...NO_WEATHER, kind: "rain", precip: 0.5, cloud: 0.97, humidity: 95 }, jst("2026-10-26"))).toBeLessThan(8);
    expect(visibilityKm({ ...NO_WEATHER, fog: 0.8, humidity: 99 }, jst("2026-10-26"))).toBeLessThan(2);
  });
  it("富士山は夏に雪がなく、冬は低くまで白い。桜は 3 月末、紅葉は 11 月末", () => {
    expect(snowlineM(jst("2026-08-10"))).toBeGreaterThan(3776);
    expect(snowlineM(jst("2027-02-01"))).toBeLessThan(1700);
    expect(treeSeason(jst("2027-03-30")).blossom).toBeGreaterThan(0.8);
    expect(treeSeason(jst("2026-11-28")).autumn).toBeGreaterThan(0.9);
    expect(treeSeason(jst("2026-07-01")).autumn).toBe(0);
  });
});

describe("東京タワーの点灯", () => {
  it("日没〜24 時。夏は白、冬はオレンジ。月・木の 20〜22 時はダイヤモンドヴェール、毎正時は純白の煌めき", () => {
    expect(towerLight(jst("2026-10-26", "19:30"), -15).on).toBe(true);
    expect(towerLight(jst("2026-10-26", "12:00"), 40).on).toBe(false);
    expect(towerLight(jst("2026-10-27", "00:30"), -40).on).toBe(false);
    expect(towerLight(jst("2026-08-12", "20:00"), -10).color).toEqual([0.82, 0.88, 1.0]); // 水曜（月・木の 20 時台はヴェール）
    expect(towerLight(jst("2026-11-10", "19:00"), -15).color).toEqual([1.0, 0.5, 0.16]);
    const veil = towerLight(jst("2026-10-26", "20:10"), -20); // 月曜
    expect(veil.mode).toBe(1);
    expect(veil.color).toEqual([1.0, 0.38, 0.12]); // 10 月 茜色
    expect(towerLight(jst("2026-10-26", "20:31"), -20).white).toBeGreaterThan(0.5);
    expect(towerLight(jst("2026-10-27", "20:10"), -20).mode).toBe(0); // 火曜
    expect(towerLight(jst("2026-10-26", "21:01"), -20).sparkle).toBe(true);
    expect(towerLight(jst("2026-10-26", "21:05"), -20).sparkle).toBe(false);
    expect(towerLight(jst("2026-10-26", "23:30"), -30).decks).toBe(false);
  });
});
