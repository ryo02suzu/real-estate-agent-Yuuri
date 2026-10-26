import { describe, expect, it } from "vitest";
import { airFrom, growth } from "./air";
import { NO_WEATHER } from "./weather";

const jst = (ymd: string, hm = "12:00") => new Date(`${ymd}T${hm}:00+09:00`);

describe("空気のにごり（湿度）", () => {
  it("湿度が高いほど霞が多い。湿度 50% が 1、95% は 4 倍近く", () => {
    expect(growth(50)).toBeCloseTo(1, 6);
    expect(growth(30)).toBeLessThan(0.9);
    expect(growth(95)).toBeGreaterThan(5);
    expect(growth(100)).toBe(growth(97));
  });
  it("乾いた冬は霞が少なく星がよく見え、湿った夏は白っぽく星が消え、夜の空が明るい", () => {
    const winter = airFrom({ ...NO_WEATHER, humidity: 30 }, jst("2027-01-15"));
    const summer = airFrom({ ...NO_WEATHER, humidity: 85 }, jst("2026-07-20"));
    expect(winter.aero).toBeLessThan(0.2);
    expect(summer.aero).toBeGreaterThan(2.5);
    expect(winter.stars).toBeGreaterThan(0.95);
    expect(summer.stars).toBeLessThan(0.5);
    expect(summer.glow).toBeGreaterThan(winter.glow);
    expect(airFrom({ ...NO_WEATHER, humidity: 99 }, jst("2026-07-20")).aero).toBe(4);
  });
  it("湿度が分からないときは月ごとの平年の湿度", () => {
    expect(airFrom(NO_WEATHER, jst("2027-01-15")).rh).toBe(51);
    expect(airFrom(NO_WEATHER, jst("2026-07-20")).rh).toBe(76);
    expect(airFrom(NO_WEATHER, jst("2026-07-20")).aero).toBeGreaterThan(airFrom(NO_WEATHER, jst("2027-01-15")).aero * 5);
  });
});
