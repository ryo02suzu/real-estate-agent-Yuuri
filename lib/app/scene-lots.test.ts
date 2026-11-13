import { describe, expect, it } from "vitest";
import type { Polygon } from "../roadmap/parcel";
import { boundsOf, clipRing, clipSegment, labelPoint, nearOrigin, ringArea, shapeOf, type Rect } from "./scene-lots";
import type { XZ } from "./town-model";

const rect: Rect = { x0: 0, z0: 0, x1: 10, z1: 10 };
/** 経度・緯度の代わりに、そのままメートルとして読む */
const asIs = (lng: number, lat: number): XZ => [lng, lat];

describe("切り抜き", () => {
  it("四角からはみ出した輪は、四角の中だけになる", () => {
    const ring: XZ[] = [
      [-5, 2],
      [5, 2],
      [5, 8],
      [-5, 8],
    ];
    const out = clipRing(ring, rect);
    expect(ringArea(out)).toBeCloseTo(30);
    expect(out.every(([x]) => x >= 0)).toBe(true);
  });
  it("外の輪は空になる", () => {
    expect(clipRing([[20, 20], [30, 20], [30, 30]], rect)).toEqual([]);
  });
  it("線分は四角の中の部分だけ。外なら null", () => {
    expect(clipSegment([-5, 5], [5, 5], rect)).toEqual([
      [0, 5],
      [5, 5],
    ]);
    expect(clipSegment([-5, -5], [-1, -1], rect)).toBeNull();
  });
});

describe("筆の形", () => {
  it("タイルの継ぎ目に乗る線は描かず、2つのタイルに分かれた筆も1つの輪郭になる", () => {
    // 東西 0〜20、継ぎ目は x = 10。のりしろとして 1m はみ出している
    const left: Polygon = [
      [
        [0, 0],
        [11, 0],
        [11, 6],
        [0, 6],
        [0, 0],
      ],
    ];
    const right: Polygon = [
      [
        [9, 0],
        [20, 0],
        [20, 6],
        [9, 6],
        [9, 0],
      ],
    ];
    const s = shapeOf(
      [
        { polygons: [left], rect: { x0: -100, z0: -100, x1: 10, z1: 100 } },
        { polygons: [right], rect: { x0: 10, z0: -100, x1: 100, z1: 100 } },
      ],
      asIs,
    );
    // 継ぎ目（x = 10）の上の縦の線は無い
    expect(s.edges.some(([a, b]) => Math.abs(a[0] - 10) < 1e-6 && Math.abs(b[0] - 10) < 1e-6)).toBe(false);
    // 輪郭の長さは 20 + 20 + 6 + 6
    const len = s.edges.reduce((t, [a, b]) => t + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
    expect(len).toBeCloseTo(52);
    // 面は重ならない（合わせて 120㎡）
    expect(s.fills.reduce((t, f) => t + ringArea(f.outer), 0)).toBeCloseTo(120);
    // 角は4つ（継ぎ目の上の点は角にしない）
    expect(s.corners).toHaveLength(4);
  });
  it("L 字の筆の札は、筆の中に置く", () => {
    const l: Polygon = [
      [
        [0, 0],
        [30, 0],
        [30, 4],
        [4, 4],
        [4, 30],
        [0, 30],
        [0, 0],
      ],
    ];
    const s = shapeOf([{ polygons: [l], rect: { x0: -100, z0: -100, x1: 100, z1: 100 } }], asIs);
    const p = labelPoint(s)!;
    const insideL = (p[0] >= 0 && p[0] <= 30 && p[1] >= 0 && p[1] <= 4) || (p[0] >= 0 && p[0] <= 4 && p[1] >= 0 && p[1] <= 30);
    expect(insideL).toBe(true);
    expect(boundsOf(s)).toEqual([0, 0, 30, 30]);
  });
});

describe("範囲", () => {
  it("原点からの距離で、円に掛かるかを見る", () => {
    expect(nearOrigin([100, -10, 120, 10], 150)).toBe(true);
    expect(nearOrigin([200, 200, 220, 220], 150)).toBe(false);
    expect(nearOrigin([-10, -10, 10, 10], 1)).toBe(true);
  });
});
