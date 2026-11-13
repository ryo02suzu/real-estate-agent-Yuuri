import { describe, expect, it } from "vitest";
import { ratioHint, refLandPoint, usageForZone } from "./ratio-hint";
import type { LandPriceHit } from "../roadmap/land-price";

const hit = (zone: string, distance: number, bcr?: number, far?: number): LandPriceHit =>
  ({ kind: "公示", no: "松戸-1", point: [139.9, 35.8], price: 120000, usage: "住宅地", year: 2026, history: [], zone, bcr, far, distance, bearing: "北" }) as LandPriceHit;

describe("建ぺい率・容積率の参考（近くの同じ用途地域の地点）", () => {
  it("同じ用途地域のいちばん近い地点の値", () => {
    const h = ratioHint("第1種低層住居専用地域", [hit("1中専", 100, 60, 200), hit("1低専", 800, 50, 100), hit("1低専", 400, 60, 100)]);
    expect(h).toMatchObject({ bcr: 60, far: 100, distance: 400 });
  });

  it("遠い地点・数値の無い地点・用途地域の無いときは出さない", () => {
    expect(ratioHint("第一種低層住居専用地域", [hit("1低専", 2000, 50, 100)])).toBeUndefined();
    expect(ratioHint("第一種低層住居専用地域", [hit("1低専", 300)])).toBeUndefined();
    expect(ratioHint(undefined, [hit("1低専", 300, 50, 100)])).toBeUndefined();
  });
});

describe("土地の参考価格の地点（物件の用途地域に合う用途）", () => {
  const at = (usage: LandPriceHit["usage"], distance: number, price: number): LandPriceHit =>
    ({ kind: "公示", no: `板橋-${distance}`, point: [139.6, 35.7], price, usage, year: 2026, history: [], distance, bearing: "北" }) as LandPriceHit;
  it("用途地域から地点の用途を決める（準工業・用途地域なしは決めない）", () => {
    expect(usageForZone("第1種中高層住居専用地域")).toBe("住宅地");
    expect(usageForZone("田園住居地域")).toBe("住宅地");
    expect(usageForZone("近隣商業地域")).toBe("商業地");
    expect(usageForZone("商業地域")).toBe("商業地");
    expect(usageForZone("工業地域")).toBe("工業地");
    expect(usageForZone("工業専用地域")).toBe("工業地");
    expect(usageForZone("準工業地域")).toBeUndefined();
    expect(usageForZone(undefined)).toBeUndefined();
  });
  it("住宅地の物件では、近い商業地より住宅地の地点を選ぶ", () => {
    const hits = [at("商業地", 350, 666000), at("住宅地", 600, 480000), at("住宅地", 900, 450000)];
    expect(refLandPoint(hits, "第1種中高層住居専用地域")).toMatchObject({ top: { price: 480000 }, matched: true });
  });
  it("2km 以内に同じ用途が無い・用途を決めない所では、いちばん近い地点（matched は false）", () => {
    const hits = [at("商業地", 350, 666000), at("住宅地", 2600, 300000)];
    expect(refLandPoint(hits, "第1種低層住居専用地域")).toMatchObject({ top: { price: 666000 }, matched: false });
    expect(refLandPoint(hits, "準工業地域")).toMatchObject({ top: { price: 666000 }, matched: false });
    expect(refLandPoint([], "商業地域").top).toBeUndefined();
  });
});
