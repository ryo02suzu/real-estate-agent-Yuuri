import { describe, expect, it } from "vitest";
import { airFrom } from "./air";
import { METER, meterExposure } from "./sky-vars";
import { solar } from "./sun";
import { NO_WEATHER } from "./weather";

/** 日時（UTC）と湿度 → 自動露出の絞り（0.4〜1） */
const adj = (iso: string, humidity: number) => {
  const d = new Date(iso);
  const s = solar(d);
  return meterExposure(s.altitude, s.azimuth, undefined, airFrom({ ...NO_WEATHER, humidity }, d));
};

describe("カメラの自動露出（帯に入る空の明るさで絞る）", () => {
  it("太陽が後ろにある昼と、夜は絞らない", () => {
    expect(adj("2026-10-26T02:30:00Z", 35)).toBe(1); // 10/26 11:30
    expect(adj("2026-12-20T01:30:00Z", 25)).toBe(1); // 12/20 10:30
    expect(adj("2026-07-15T03:00:00Z", 75)).toBe(1); // 7/15 12:00
    expect(adj("2026-10-26T11:00:00Z", 50)).toBe(1); // 20:00
  });
  it("逆光の午後は絞る（太陽が画角に近いほど・遅いほど強く。下限 0.4）", () => {
    const a = adj("2026-10-26T05:30:00Z", 10); // 14:30
    const b = adj("2026-10-26T06:00:00Z", 35); // 15:00
    expect(a).toBeLessThan(0.7);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThanOrEqual(METER.min);
    expect(adj("2026-04-10T07:00:00Z", 55)).toBeLessThan(0.7); // 4/10 16:00
  });
  it("霞が多い（湿った）日ほど太陽の周りが明るく、よく絞る", () => {
    expect(adj("2026-10-26T06:00:00Z", 85)).toBeLessThan(adj("2026-10-26T06:00:00Z", 20));
  });
});
