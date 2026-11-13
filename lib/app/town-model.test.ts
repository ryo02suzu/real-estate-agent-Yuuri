import { describe, expect, it } from "vitest";
import { toWorldPixel } from "../tiles";
import { buildingHeight, buildTown, depthFloor, directionOf, frontRoads, inRing, localOf, metersPerPixel, nearestOnLine, rankText, roadWidth, signedArea, TOWN_ZOOM, townSeams, townTiles, type RawTown, type XZ } from "./town-model";

const sq = (x: number, z: number, w: number, d = w): XZ[] => [
  [x, z],
  [x + w, z],
  [x + w, z + d],
  [x, z + d],
];

describe("座標", () => {
  const origin = { lat: 35.80519, lng: 139.90002 };
  it("原点は (0, 0)、東は +x、南は +z、1m はおよそ 1", () => {
    const to = localOf(origin);
    const [x0, z0] = to(origin.lng, origin.lat);
    expect(Math.abs(x0)).toBeLessThan(1e-6);
    expect(Math.abs(z0)).toBeLessThan(1e-6);
    const [x, z] = to(origin.lng + 0.001, origin.lat - 0.001);
    expect(x).toBeGreaterThan(85);
    expect(x).toBeLessThan(95);
    expect(z).toBeGreaterThan(105);
    expect(z).toBeLessThan(115);
  });
  it("2×2 枚のタイルは原点をはさみ、継ぎ目は原点から半タイル以内", () => {
    const tiles = townTiles(origin);
    const p = toWorldPixel(origin.lat, origin.lng, TOWN_ZOOM);
    const [tx, ty] = tiles[0];
    expect(p.x / 256).toBeGreaterThan(tx + 0.5);
    expect(p.x / 256).toBeLessThan(tx + 1.5);
    expect(p.y / 256).toBeGreaterThan(ty + 0.5);
    expect(p.y / 256).toBeLessThan(ty + 1.5);
    const s = townSeams(origin);
    const half = 128 * metersPerPixel(origin.lat, TOWN_ZOOM);
    expect(Math.abs(s.x)).toBeLessThanOrEqual(half + 1e-6);
    expect(Math.abs(s.z)).toBeLessThanOrEqual(half + 1e-6);
  });
});

describe("建物の高さと継ぎ目", () => {
  it("種類と大きさで高さの目安が決まる", () => {
    expect(buildingHeight("house", 60)).toBe(6.2);
    expect(buildingHeight("house", 150)).toBe(7.4);
    expect(buildingHeight("solid", 2000)).toBe(16);
    expect(buildingHeight("shed", 40)).toBe(3.2);
  });
  it("継ぎ目で切れた建物は合わせた面積で同じ高さ、離れた建物は別", () => {
    const raw: RawTown = {
      buildings: [
        { ring: sq(-8, 0, 8, 12), code: 3101 },
        { ring: sq(0, 0, 9, 12), code: 3101 },
        { ring: sq(30, 30, 8, 8), code: 3101 },
      ],
      roads: [],
      water: [],
    };
    const t = buildTown(raw, { x: 0, z: 999 });
    expect(t.buildings).toHaveLength(3);
    // 96㎡ と 108㎡ は別々なら 7.4m、合わせて 204㎡ でも 7.4m。大きさの段を越える例で確かめる
    const raw2: RawTown = { ...raw, buildings: [{ ring: sq(-12, 0, 12, 10), code: 3101 }, { ring: sq(0, 0, 12, 10), code: 3101 }, { ring: sq(30, 30, 12, 10), code: 3101 }] };
    const t2 = buildTown(raw2, { x: 0, z: 999 });
    expect(t2.buildings[0].height).toBe(9);
    expect(t2.buildings[1].height).toBe(9);
    expect(t2.buildings[2].height).toBe(7.4);
  });
  it("半径の外の建物と小さすぎる建物は入れない", () => {
    const raw: RawTown = { buildings: [{ ring: sq(500, 0, 10), code: 3101 }, { ring: sq(5, 5, 2), code: 3101 }, { ring: sq(10, 10, 10), code: 3102 }], roads: [], water: [] };
    const t = buildTown(raw, { x: 999, z: 999 });
    expect(t.buildings).toHaveLength(1);
    expect(t.buildings[0].kind).toBe("solid");
  });
  it("外周は面積が正（下向きの z で時計回り）", () => {
    expect(signedArea(sq(0, 0, 10))).toBe(100);
  });
});

describe("道路", () => {
  it("幅の区分から幅の目安", () => {
    expect(roadWidth("3m未満")).toBe(2.6);
    expect(roadWidth("3m-5.5m未満")).toBe(4.3);
    expect(roadWidth("5.5m-13m未満")).toBe(8);
    expect(roadWidth("19.5m以上")).toBe(22);
  });
  it("筆に接する道路だけを前の道路にする", () => {
    const lot = sq(0, 0, 20, 30);
    const roads = [
      { line: [[-10, 33], [40, 33]] as XZ[], width: 4.3, major: false },
      { line: [[-10, 60], [40, 60]] as XZ[], width: 4.3, major: false },
      { line: [[10, -50], [10, 15]] as XZ[], width: 2.6, major: false },
    ];
    expect(frontRoads(roads, lot)).toEqual([0, 2]);
    expect(inRing([10, 10], lot)).toBe(true);
    expect(inRing([30, 10], lot)).toBe(false);
  });
});

describe("向きと幅の書き方", () => {
  it("8方位（x は東、z は南）", () => {
    expect(directionOf(0, -10)).toBe("北");
    expect(directionOf(10, 0)).toBe("東");
    expect(directionOf(0, 10)).toBe("南");
    expect(directionOf(-10, 10)).toBe("南西");
  });
  it("幅員の区分を短く", () => {
    expect(rankText("3m-5.5m未満")).toBe("3〜5.5m未満");
    expect(rankText("3m未満")).toBe("3m未満");
    expect(rankText("19.5m以上")).toBe("19.5m以上");
    expect(rankText("不明")).toBe("");
  });
  it("線のいちばん近い点", () => {
    expect(nearestOnLine([5, 5], [[0, 0], [10, 0]])).toEqual([5, 0]);
  });
});

describe("浸水深の区分の下限", () => {
  it("区分の名前から下限を読む", () => {
    expect(depthFloor("5〜10m")).toBe(5);
    expect(depthFloor("0.5〜3m")).toBe(0.5);
    expect(depthFloor("20m以上")).toBe(20);
    expect(depthFloor("0.5m未満")).toBe(0.3);
    expect(depthFloor(undefined)).toBe(0);
    expect(depthFloor("特別警戒区域")).toBe(0);
  });
});
