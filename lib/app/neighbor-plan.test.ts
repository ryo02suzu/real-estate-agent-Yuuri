import { describe, expect, it } from "vitest";
import { bearingOf, bySide, clipShape, dir8, fillPath, planWindow, scaleBar, sharedEdge, sideOf, sideText, type Side } from "./neighbor-plan";
import type { SceneShape } from "./scene-lots";
import type { XZ } from "./town-model";

/** 四角の筆（x0..x1・z0..z1。z は南が +） */
function box(x0: number, z0: number, x1: number, z1: number): SceneShape {
  const outer: XZ[] = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const edges: [XZ, XZ][] = outer.map((p, i) => [p, outer[(i + 1) % 4]]);
  return { fills: [{ outer, holes: [] }], edges, corners: outer };
}

describe("隣の土地の方角", () => {
  it("方位角は北が 0°・東が 90°（z は南が +）", () => {
    expect(bearingOf([0, 0], [0, -10])).toBeCloseTo(0);
    expect(bearingOf([0, 0], [10, 0])).toBeCloseTo(90);
    expect(bearingOf([0, 0], [0, 10])).toBeCloseTo(180);
    expect(bearingOf([0, 0], [-10, 0])).toBeCloseTo(270);
  });

  it("8つの方角に分ける（境目は 22.5°）", () => {
    expect(dir8(0)).toBe("北");
    expect(dir8(22)).toBe("北");
    expect(dir8(23)).toBe("北東");
    expect(dir8(90)).toBe("東");
    expect(dir8(200)).toBe("南");
    expect(dir8(225)).toBe("南西");
    expect(dir8(338)).toBe("北");
    expect(dir8(-90)).toBe("西");
  });

  it("北・東・南西の角の筆：接する長さと方角", () => {
    const target = box(0, 0, 10, 20); // 幅10m・奥行20m
    const center: XZ = [5, 10];
    const north = sideOf(target, center, box(0, -15, 10, 0))!;
    expect(north.dir).toBe("北");
    expect(north.length).toBeCloseTo(10, 0);
    const east = sideOf(target, center, box(10, 5, 25, 20))!;
    expect(east.dir).toBe("東");
    expect(east.length).toBeCloseTo(15, 0);
    // 角だけで接する筆
    const corner = sideOf(target, center, box(-8, 20.3, 0, 30))!;
    expect(corner.dir).toBe("南西");
    expect(corner.length).toBeLessThan(1.2);
    expect(sideText(corner)).toBe("南西の角で接する");
    // 離れた筆は接していない
    expect(sideOf(target, center, box(30, 0, 40, 10))).toBeNull();
  });

  it("L 字に回り込む筆は、接している所の真ん中の方角", () => {
    const target = box(0, 0, 10, 10);
    // 北と東に回り込む（北の辺 10m と東の辺 10m）
    const l: SceneShape = {
      fills: [],
      edges: [
        [
          [0, 0],
          [10, 0],
        ],
        [
          [10, 0],
          [10, 10],
        ],
      ],
      corners: [],
    };
    const s = sharedEdge(target.edges, l.edges);
    expect(s.length).toBeCloseTo(20, 0);
    const side = sideOf(target, [5, 5], l)!;
    expect(side.dir).toBe("北東");
  });

  it("文：短い境界は小数1桁、長い境界は整数", () => {
    const s = (length: number): Side => ({ dir: "北", bearing: 0, length, mid: [0, 0] });
    expect(sideText(s(8.36))).toBe("北側・境界 約8.4m");
    expect(sideText(s(12.6))).toBe("北側・境界 約13m");
  });

  it("並びは北から時計回り、同じ方角は長い順。方角の無いものは最後", () => {
    const mk = (id: string, dir: Side["dir"] | null, length = 1) => ({ id, side: dir ? { dir, bearing: 0, length, mid: [0, 0] as XZ } : null });
    const sorted = bySide([mk("a", "西"), mk("b", "北", 3), mk("c", null), mk("d", "北", 9), mk("e", "南東")]);
    expect(sorted.map((x) => x.id)).toEqual(["d", "b", "e", "a", "c"]);
  });
});

describe("配置図の範囲", () => {
  it("物件の筆を真ん中に、幅÷高さをそろえ、余白を取る", () => {
    const r = planWindow(box(0, 0, 10, 20), 1.6);
    expect((r.x1 - r.x0) / (r.z1 - r.z0)).toBeCloseTo(1.6);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(5);
    expect((r.z0 + r.z1) / 2).toBeCloseTo(10);
    // 筆がすっかり入り、上下に 8m 以上の余白（縦長の筆でも、横長の図の上下が詰まらない）
    expect(r.z0).toBeLessThanOrEqual(-8);
    expect(r.z1).toBeGreaterThanOrEqual(28);
    const tall = planWindow(box(0, 0, 20, 40), 1.75);
    expect(tall.z0).toBeLessThanOrEqual(-8);
    expect(tall.z1).toBeGreaterThanOrEqual(48);
  });

  it("小さな筆でも狭くなりすぎず、大きな筆（畑など）は筆が入る広さ", () => {
    const small = planWindow(box(0, 0, 4, 4), 1.6);
    expect(small.x1 - small.x0).toBeGreaterThanOrEqual(26);
    const big = planWindow(box(0, 0, 200, 120), 1.6);
    expect(big.x1 - big.x0).toBeGreaterThanOrEqual(206);
  });

  it("切り抜き：範囲の外の筆は空、掛かる筆は範囲の中だけ", () => {
    const r = { x0: 0, z0: 0, x1: 10, z1: 10 };
    expect(clipShape(box(20, 20, 30, 30), r).fills).toHaveLength(0);
    const c = clipShape(box(5, 5, 15, 15), r);
    expect(c.fills).toHaveLength(1);
    expect(Math.max(...c.fills[0].outer.map((p) => p[0]))).toBeCloseTo(10);
    expect(fillPath(c.fills)).toMatch(/^M[\d. L]+Z$/);
    expect(fillPath(c.fills)).toContain("10.00 10.00");
  });

  it("縮尺の棒は幅の 1/5 くらいの切りのいい長さ", () => {
    expect(scaleBar(40)).toBe(10);
    expect(scaleBar(60)).toBe(10);
    expect(scaleBar(100)).toBe(20);
    expect(scaleBar(18)).toBe(5);
  });
});
