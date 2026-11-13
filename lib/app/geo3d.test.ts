import { describe, expect, it } from "vitest";
import { CITY_CAMERA, decodeDist, ecef, ecefToEnuRows, encodeDist, enuBasis, vfovOf, viewDir, type V3 } from "./geo3d";

const apply = (m: number[], p: V3): V3 => [0, 1, 2].map((i) => m[i * 4] * p[0] + m[i * 4 + 1] * p[1] + m[i * 4 + 2] * p[2] + m[i * 4 + 3]) as V3;

describe("地球の座標とカメラ", () => {
  it("ECEF：赤道・経度 0 の地表は (6378137, 0, 0)、北極は z だけ", () => {
    const p = ecef(0, 0, 0);
    expect(p[0]).toBeCloseTo(6378137, 3);
    expect(Math.abs(p[1]) + Math.abs(p[2])).toBeLessThan(1e-6);
    expect(ecef(90, 0, 0)[2]).toBeCloseTo(6356752.314, 2);
  });
  it("東・北・上は直交する単位ベクトル", () => {
    const [e, n, u] = enuBasis(35.664, 139.7616);
    const d = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const v of [e, n, u]) expect(d(v, v)).toBeCloseTo(1, 12);
    expect(d(e, n)).toBeCloseTo(0, 12);
    expect(d(n, u)).toBeCloseTo(0, 12);
  });
  it("ECEF → ENU：カメラの位置は原点、真上 100m は (0,0,100)、東京タワー（約 1.6km 西南西）は西と南", () => {
    const { lat, lon, h } = CITY_CAMERA;
    const m = ecefToEnuRows(lat, lon, h);
    const o = apply(m, ecef(lat, lon, h));
    expect(Math.hypot(...o)).toBeLessThan(1e-4);
    const up = apply(m, ecef(lat, lon, h + 100));
    expect(up[2]).toBeCloseTo(100, 4);
    const tower = apply(m, ecef(35.65866, 139.7454, 36.7));
    expect(tower[0]).toBeLessThan(-1400);
    expect(tower[1]).toBeLessThan(-500);
    expect(Math.hypot(tower[0], tower[1])).toBeGreaterThan(1500);
    expect(Math.hypot(tower[0], tower[1])).toBeLessThan(1700);
  });
  it("向き：方位 246° は西南西、画角 62°・393:275 の縦は約 45.6°", () => {
    const v = viewDir(246, 0);
    expect(v[0]).toBeLessThan(-0.9);
    expect(v[1]).toBeLessThan(-0.4);
    expect(vfovOf(62, 393 / 275)).toBeCloseTo(45.61, 2);
  });
  it("距離の絵：24 ビットで 2.4cm ごと。0〜400km を往復できる", () => {
    for (const d of [0, 3.2, 1581.4, 12345.678, 100000, 399999]) {
      const [r, g, b] = encodeDist(d);
      expect(Math.abs(decodeDist(r, g, b) - d)).toBeLessThan(0.013);
    }
    expect(encodeDist(1e9)).toEqual([255, 255, 255]);
  });
});
