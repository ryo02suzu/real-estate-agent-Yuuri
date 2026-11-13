import { describe, expect, it } from "vitest";
import { PARCEL_ZOOM, tileBounds, type LngLat, type Parcel } from "../roadmap/parcel";
import { toWorldPixel } from "../tiles";
import { lotCorners } from "./lot-shape";

// 横浜市港南区のあたり。1m はおよそ経度 0.0000110°・緯度 0.0000090°
const LAT = 35.3805;
const LNG = 139.5485;
const DX = 1 / (111_320 * Math.cos((LAT * Math.PI) / 180));
const DY = 1 / 110_950;
const at = (x: number, y: number): LngLat => [LNG + x * DX, LAT + y * DY];

/** 1 枚のタイルの中の筆（点はメートルで、地点からの東・北） */
function parcelOf(ring: [number, number][]): Parcel {
  const p = toWorldPixel(LAT, LNG, PARCEL_ZOOM);
  const tile: [number, number] = [Math.floor(p.x / 256), Math.floor(p.y / 256)];
  const [w, s, e, n] = tileBounds(tile[0], tile[1]);
  const pts = ring.map(([x, y]) => at(x, y));
  // 試験の筆がタイルの中に収まっていること（継ぎ目の点は数えないので）
  for (const [lng, lat] of pts) if (lng <= w || lng >= e || lat <= s || lat >= n) throw new Error("タイルの外");
  return { kuiki: "テスト", chiban: "1-1", chibanRaw: "1-1", pieces: [{ polygons: [[[...pts, pts[0]]]], tile }], point: { lat: LAT, lng: LNG } };
}

describe("辺の数（筆の形の目安）", () => {
  it("長方形は 4", () => {
    expect(lotCorners(parcelOf([[-8, -6], [8, -6], [8, 6], [-8, 6]]))).toBe(4);
  });
  it("辺の途中の点（隣の筆の角）や、ほとんど曲がらない点は数えない", () => {
    expect(lotCorners(parcelOf([[-8, -6], [0, -6], [8, -6], [8, 6], [0, 6.05], [-8, 6]]))).toBe(4);
  });
  it("L 字は 6", () => {
    expect(lotCorners(parcelOf([[-8, -6], [8, -6], [8, 0], [0, 0], [0, 6], [-8, 6]]))).toBe(6);
  });
  it("形が無ければ数えない", () => {
    const p = parcelOf([[-8, -6], [8, -6], [8, 6], [-8, 6]]);
    expect(lotCorners({ ...p, pieces: [] })).toBeUndefined();
  });
});
