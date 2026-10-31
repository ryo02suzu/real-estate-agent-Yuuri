import { describe, expect, it } from "vitest";
import { alreadyThere, atJapanView, createRunToken, distanceKm, JAPAN_VIEW, PROPERTY_ZOOM, zoomDuration } from "./motion";

describe("zoomDuration", () => {
  it("700〜1100ms に収まり、遠いほど長い", () => {
    expect(zoomDuration(0, false)).toBe(700);
    expect(zoomDuration(5000, false)).toBe(1100);
    expect(zoomDuration(300, false)).toBeGreaterThan(700);
    expect(zoomDuration(300, false)).toBeLessThan(1100);
  });
  it("動きを減らす設定なら 0", () => {
    expect(zoomDuration(500, true)).toBe(0);
  });
});

describe("distanceKm / alreadyThere", () => {
  it("東京駅と新宿駅は約6km", () => {
    const d = distanceKm([139.7671, 35.6812], [139.7005, 35.6896]);
    expect(d).toBeGreaterThan(5.5);
    expect(d).toBeLessThan(6.5);
  });
  it("同じ地点で寄っていれば動かさない。引いていれば動かす", () => {
    const p: [number, number] = [139.7, 35.68];
    expect(alreadyThere({ center: p, zoom: PROPERTY_ZOOM }, p)).toBe(true);
    expect(alreadyThere({ center: p, zoom: JAPAN_VIEW.zoom }, p)).toBe(false);
    expect(alreadyThere({ center: [139.71, 35.68], zoom: PROPERTY_ZOOM }, p)).toBe(false);
  });
  it("日本全体の表示の判定", () => {
    expect(atJapanView({ zoom: JAPAN_VIEW.zoom })).toBe(true);
    expect(atJapanView({ zoom: PROPERTY_ZOOM })).toBe(false);
  });
});

describe("createRunToken", () => {
  it("新しい検索が始まると古いものは無効になる", () => {
    const t = createRunToken();
    const a = t.next();
    const b = t.next();
    expect(t.isCurrent(a)).toBe(false);
    expect(t.isCurrent(b)).toBe(true);
  });
});
