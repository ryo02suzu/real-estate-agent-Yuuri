import { describe, expect, it } from "vitest";
import { areaText, clipRing, ringAreaM2, TSUBO_M2 } from "./area";
import type { LngLat } from "../roadmap/parcel";

// 東京の緯度で、東西・南北に約10mの四角
const lat = 35.66;
const dLng = 10 / (111_320 * Math.cos((lat * Math.PI) / 180));
const dLat = 10 / 110_950;
const square: LngLat[] = [
  [139.7, lat],
  [139.7 + dLng, lat],
  [139.7 + dLng, lat + dLat],
  [139.7, lat + dLat],
];

describe("筆の面積", () => {
  it("10m 四方は約100㎡", () => {
    expect(ringAreaM2(square)).toBeCloseTo(100, 1);
  });

  it("四角で切り抜くと、はみ出した分を数えない", () => {
    const half = clipRing(square, [139.7, lat, 139.7 + dLng / 2, lat + 1]);
    expect(ringAreaM2(half)).toBeCloseTo(50, 1);
  });

  it("坪と㎡の表示", () => {
    expect(areaText(100)).toBe(`約100.00㎡（約${(100 / TSUBO_M2).toFixed(2)}坪）`);
  });
});
