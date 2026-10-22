import { describe, expect, it } from "vitest";
import { mesh250, mesh2Around, mesh2Of, meshBounds, meshCenter } from "./mesh";

describe("地域メッシュ", () => {
  it("東京駅は 3次メッシュ 53394611、250m メッシュ 5339461132", () => {
    expect(mesh250(35.681236, 139.767125)).toBe("5339461132");
    expect(mesh2Of("5339461132")).toBe("533946");
  });

  it("国のデータの例：函館市の 6240552941 の中心は、そのメッシュに入る", () => {
    const [lng, lat] = meshCenter("6240552941");
    expect(mesh250(lat, lng)).toBe("6240552941");
    expect(lat).toBeGreaterThan(41.7);
    expect(lat).toBeLessThan(41.8);
  });

  it("250m メッシュの大きさは緯度 7.5 秒・経度 11.25 秒", () => {
    const [[w, s], [e, n]] = meshBounds("5339461132");
    expect((n - s) * 3600).toBeCloseTo(7.5, 6);
    expect((e - w) * 3600).toBeCloseTo(11.25, 6);
    // 区画の中のどの点も同じコード
    expect(mesh250(s + 1e-6, w + 1e-6)).toBe("5339461132");
    expect(mesh250(n - 1e-6, e - 1e-6)).toBe("5339461132");
  });

  it("境界の上の点は北・東の区画", () => {
    const [[w, s]] = meshBounds("5339461132");
    expect(mesh250(s, w)).toBe("5339461132");
    // 1次メッシュの境目（北緯 35度20分 = 53 の南端）
    expect(mesh250(35 + 20 / 60, 139.5)).toMatch(/^5339/);
  });

  it("日本の範囲の外は無し", () => {
    expect(mesh250(0, 0)).toBeUndefined();
  });

  it("半径にかかる 2次メッシュ：真ん中なら1つ、境目の近くなら2つ以上", () => {
    const [lng, lat] = meshCenter("5339461132");
    expect(mesh2Around(lat, lng, 300)).toEqual(["533946"]);
    const [[w, s]] = meshBounds("533946");
    expect(mesh2Around(s + 0.0005, w + 0.0005, 500).length).toBe(4);
  });
});
