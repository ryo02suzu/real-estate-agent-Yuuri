import { describe, expect, it } from "vitest";
import { ratioHint } from "./ratio-hint";
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
