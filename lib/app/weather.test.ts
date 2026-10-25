import { beforeEach, describe, expect, it } from "vitest";
import { cloudFromCode, forecastCodeFor, fromJma, jstHours, latestPoint, lightsLevel, loadCachedWeather, occupancy, parseWeatherOverride, pointFile, saveCachedWeather, towerLit, type JmaPoint } from "./weather";

const jst = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`);

// 2026-10-26 03:10 の東京（大手町）の実際の観測（小雨・湿度 96%）
const RAIN: JmaPoint = { temp: [19.7, 0], humidity: [96, 0], sun10m: [0, 0], precipitation10m: [0.5, 0], wind: [1.8, 0] };
const SUNNY: JmaPoint = { temp: [18.2, 0], humidity: [45, 0], sun10m: [10, 0], precipitation10m: [0, 0], wind: [3.1, 0] };
const SNOWY: JmaPoint = { temp: [0.4, 0], humidity: [90, 0], sun10m: [0, 0], precipitation10m: [1.2, 0], wind: [2, 0] };

describe("天気（気象庁の観測と予報から）", () => {
  it("雨量があれば雨。気温が低ければ雪", () => {
    const r = fromJma(RAIN, "313", jst("2026-10-26", "03:10"), -40);
    expect(r.kind).toBe("rain");
    expect(r.cloud).toBeGreaterThanOrEqual(0.9);
    expect(r.precip).toBeCloseTo(0.17, 2);
    expect(r.fog).toBeGreaterThan(0);
    const s = fromJma(SNOWY, "200", jst("2027-01-20", "10:00"), 25);
    expect(s.kind).toBe("snow");
  });
  it("昼は日照から雲量を読む（10分日照が満ちていれば晴れ）", () => {
    const w = fromJma(SUNNY, "200", jst("2026-10-26", "12:00"), 45);
    expect(w.kind).toBe("clear");
    expect(w.cloud).toBeLessThan(0.4);
    const c = fromJma({ ...SUNNY, sun10m: [0, 0] }, "200", jst("2026-10-26", "12:00"), 45);
    expect(c.kind).toBe("cloudy");
  });
  it("夜は予報のコードで雲量を決める", () => {
    expect(cloudFromCode("100", 20)).toBeLessThan(0.3);
    expect(cloudFromCode("101", 10)).toBeCloseTo(0.42, 2);
    expect(cloudFromCode("200", 20)).toBeCloseTo(0.75, 2);
    expect(cloudFromCode("211", 20)).toBeCloseTo(0.35, 2);
    expect(cloudFromCode("211", 9)).toBeCloseTo(0.75, 2);
    expect(cloudFromCode("313", 20)).toBeCloseTo(0.8, 2);
    expect(cloudFromCode("abc", 20)).toBeNull();
    const n = fromJma({ ...SUNNY, sun10m: [0, 0], humidity: [60, 0] }, "100", jst("2026-10-26", "22:00"), -40);
    expect(n.kind).toBe("clear");
  });
  it("予報の JSON から今日のコードを取る。点のファイル名は 3 時間ごと", () => {
    const data = [{ timeSeries: [{ timeDefines: ["2026-10-25T17:00:00+09:00", "2026-10-26T00:00:00+09:00", "2026-10-27T00:00:00+09:00"], areas: [{ weatherCodes: ["313", "300", "202"] }] }] }];
    expect(forecastCodeFor(data, jst("2026-10-25", "20:00"))).toBe("313");
    expect(forecastCodeFor(data, jst("2026-10-26", "03:10"))).toBe("300");
    expect(forecastCodeFor({}, jst("2026-10-26", "03:10"))).toBeNull();
    expect(pointFile("2026-10-26T03:10:00+09:00")).toEqual({ file: "20261026_03.json", prev: "20261026_00.json" });
    expect(pointFile("2026-10-26T00:00:00+09:00")).toEqual({ file: "20261026_00.json", prev: "20261025_21.json" });
    expect(latestPoint({ "20261026030000": SUNNY, "20261026031000": RAIN })).toBe(RAIN);
  });
  it("プレビュー用の固定（#w=）", () => {
    expect(parseWeatherOverride("#w=rain")?.kind).toBe("rain");
    expect(parseWeatherOverride("#t=2026-06-21T18:30&w=snow:0.8")).toMatchObject({ kind: "snow", precip: 0.8 });
    expect(parseWeatherOverride("#w=cloudy")?.cloud).toBeGreaterThan(0.9);
    expect(parseWeatherOverride("#w=fog:0.4")?.fog).toBeCloseTo(0.4, 2);
    expect(parseWeatherOverride("#w=xyz")).toBeNull();
    expect(parseWeatherOverride("#q=abc")).toBeNull();
  });
  it("窓の明かりは 19 時ごろはほぼ全部、深夜は 3 割ほど。昼は点いていても見えない", () => {
    expect(occupancy(19)).toBe(1);
    expect(occupancy(3)).toBeLessThan(0.35);
    expect(occupancy(12)).toBeCloseTo(0.8, 2);
    expect(lightsLevel(jst("2026-10-25", "19:00"), -25)).toBe(1);
    expect(lightsLevel(jst("2026-10-25", "12:00"), 45)).toBe(0);
    expect(lightsLevel(jst("2026-10-25", "03:00"), -50)).toBeLessThan(0.35);
    expect(jstHours(jst("2026-10-25", "19:30"))).toBeCloseTo(19.5, 6);
  });
  it("東京タワーは夕方から 24 時まで点き、0 時に消える", () => {
    expect(towerLit(jst("2026-10-25", "19:00"))).toBe(true);
    expect(towerLit(jst("2026-10-25", "23:59"))).toBe(true);
    expect(towerLit(jst("2026-10-26", "00:00"))).toBe(false);
    expect(towerLit(jst("2026-10-26", "03:00"))).toBe(false);
  });
});

describe("天気の覚え（端末に 30 分）", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });
  it("30 分以内なら使い、過ぎたら使わない", () => {
    const w = fromJma(RAIN, "300", jst("2026-10-26", "03:10"), -40);
    saveCachedWeather(w, 1000);
    expect(loadCachedWeather(1000 + 10 * 60e3)?.kind).toBe("rain");
    expect(loadCachedWeather(1000 + 31 * 60e3)).toBeNull();
  });
});
