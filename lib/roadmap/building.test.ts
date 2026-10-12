import { open } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import {
  BUILDING_ZOOM,
  buildingAt,
  buildingLabel,
  buildingRows,
  buildingSummary,
  storeysLabel,
  tilesNear,
  usageGroup,
  usageShort,
  type Building,
  type BuildingSource,
} from "./building";
import { buildingTileSource } from "./building-tiles";
import SOURCE from "./data/building-source.json";
import { tileOf } from "./parcel";

/** 代表点と、範囲（代表点からの m）の建物 */
const bldg = (lng: number, lat: number, box: [number, number, number, number], props: Partial<Building> = {}): Building => ({ point: [lng, lat], box, ...props });

/** 地点 (lat, lng) から東へ ex m・北へ ny m の経度・緯度 */
const move = (lat: number, lng: number, ex: number, ny: number): [number, number] => [lng + ex / (110_950 * Math.cos((lat * Math.PI) / 180)), lat + ny / 110_950];

const LAT = 35.7295;
const LNG = 139.7109;
const [TX, TY] = tileOf(LAT, LNG, BUILDING_ZOOM);

/** 地点のタイルだけに建物がある偽のタイル */
const oneTile = (bs: Building[]): BuildingSource => ({ tile: async (x, y) => (x === TX && y === TY ? bs : null) });

describe("読むタイル", () => {
  it("タイルの真ん中なら1枚、端に近ければ隣のタイルも", () => {
    // タイルの中央の緯度経度
    const n = 2 ** BUILDING_ZOOM;
    const lng = ((TX + 0.5) / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (TY + 0.5)) / n))) * 180) / Math.PI;
    expect(tilesNear(lat, lng)).toEqual([[TX, TY]]);
    const lngW = (TX / n) * 360 - 180 + 1e-6;
    expect(tilesNear(lat, lngW)).toEqual([
      [TX - 1, TY],
      [TX, TY],
    ]);
  });
});

describe("地点の建物", () => {
  it("地点を範囲に含む建物のうち、代表点が近いもの", async () => {
    const [aLng, aLat] = move(LAT, LNG, 3, 2);
    const [bLng, bLat] = move(LAT, LNG, -12, 0);
    const r = await buildingAt(
      LAT,
      LNG,
      oneTile([bldg(aLng, aLat, [-8, -8, 8, 8], { usage: "共同住宅", above: 5 }), bldg(bLng, bLat, [-15, -10, 15, 10], { usage: "住宅", above: 2 })]),
    );
    expect(r?.hit?.building.usage).toBe("共同住宅");
    expect(r?.hit?.distance).toBeCloseTo(Math.hypot(3, 2), 0);
    expect(r?.others).toEqual([]);
  });

  it("物件の筆の中に代表点がある建物を先に。同じ筆のほかの建物も返す", async () => {
    // 筆：地点のまわり 20m 四方
    const sq = [move(LAT, LNG, -10, -10), move(LAT, LNG, 10, -10), move(LAT, LNG, 10, 10), move(LAT, LNG, -10, 10), move(LAT, LNG, -10, -10)];
    const near = move(LAT, LNG, -12, 0); // 筆の外（近い）
    const lot = move(LAT, LNG, 6, 0); // 筆の中
    const shed = move(LAT, LNG, -6, 7); // 筆の中だが地点は範囲の外（物置など）
    const r = await buildingAt(
      LAT,
      LNG,
      oneTile([
        bldg(near[0], near[1], [-14, -5, 14, 5], { usage: "住宅" }),
        bldg(lot[0], lot[1], [-8, -5, 8, 5], { usage: "共同住宅" }),
        bldg(shed[0], shed[1], [-2, -2, 2, 2], { usage: "その他" }),
      ]),
      [[sq]],
    );
    expect(r?.hit?.building.usage).toBe("共同住宅");
    expect(r?.hit?.onParcel).toBe(true);
    expect(r?.others.map((h) => h.building.usage)).toEqual(["その他"]);
  });

  it("地点に建物が無ければ hit は無し。PLATEAU の無い所は null", async () => {
    const far = move(LAT, LNG, 40, 0);
    expect(await buildingAt(LAT, LNG, oneTile([bldg(far[0], far[1], [-5, -5, 5, 5])]))).toEqual({ hit: undefined, others: [] });
    expect(await buildingAt(LAT, LNG, { tile: async () => null })).toBeNull();
  });
});

describe("建物の文字", () => {
  it("用途の短い名前と区分", () => {
    expect(usageShort("店舗等併用共同住宅")).toBe("店舗併用共同");
    expect(usageShort("共同住宅")).toBe("共同住宅");
    expect(usageShort("業務施設")).toBe("業務");
    expect(usageShort("運輸倉庫施設")).toBe("運輸倉庫");
    expect(usageGroup("店舗等併用住宅")).toBe("mixed");
    expect(usageGroup("共同住宅")).toBe("apartment");
    expect(usageGroup("商業施設")).toBe("commercial");
    expect(usageGroup(undefined)).toBe("other");
  });
  it("地図の文字・要約・行", () => {
    const b = bldg(0, 0, [0, 0, 0, 0], { usage: "共同住宅", detail: "集合住宅", above: 5, below: 1, structure: "耐火造", height: 15.24, area: 320, survey: 2021 });
    expect(buildingLabel(b)).toBe("共同住宅 5F");
    expect(buildingLabel({ name: "池袋駅", usage: "運輸倉庫施設" })).toBe("池袋駅");
    expect(storeysLabel(b)).toBe("地上5階・地下1階");
    expect(buildingSummary(b)).toBe("共同住宅・地上5階・地下1階・耐火造");
    expect(buildingRows(b).map((r) => `${r.label}：${r.value}`)).toEqual([
      "用途：共同住宅（集合住宅）",
      "階数：地上5階・地下1階",
      "構造（防火）：耐火造",
      "高さ：約15.2m",
      "建築面積の目安：約320m²",
      "調査年：2021年",
    ]);
  });
});

describe("建物のデータの置き場所（data/building-source.json）", () => {
  it("置き場所は空（まだ作っていない）か R2 の PMTiles。データのある市区町村は5桁のコード", () => {
    expect(SOURCE.url === "" || /^https:\/\/.+\.pmtiles$/.test(SOURCE.url)).toBe(true);
    for (const c of SOURCE.codes) expect(c).toMatch(/^(0[89]|1[0-4])\d{3}$/);
    if (SOURCE.url) {
      expect(SOURCE.edition).toMatch(/^\d{4}年\d{1,2}月時点$/);
      // 東京23区は全部ある
      for (let c = 13101; c <= 13123; c++) expect(SOURCE.codes).toContain(String(c));
    }
  });
});

// scripts/building-tiles/build.py で作ったタイル（試しに作ったもの）を読むとき：BUILDING_PMTILES=<ファイル> npx vitest run lib/roadmap/building.test.ts
const FILE = process.env.BUILDING_PMTILES;
const fileSource = (path: string): Source => ({
  getKey: () => path,
  getBytes: async (offset, length) => {
    const fh = await open(path, "r");
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) };
    } finally {
      await fh.close();
    }
  },
});

describe.runIf(!!FILE)("作った建物のタイル", () => {
  it("建物の範囲の内側の地点で調べると、ほとんどはその建物を選ぶ（形が無いので、範囲の重なりで外れることはある）", async () => {
    const src = buildingTileSource(fileSource(FILE!));
    // 豊島区・江戸川区の住宅地のタイルの建物。代表点から範囲の角へ 30% 寄った地点で調べる
    const sample: Building[] = [];
    for (const [lat, lng] of [
      [35.7372, 139.7462],
      [35.6838, 139.8641],
    ]) {
      const t = (await src.tile(...tileOf(lat, lng, BUILDING_ZOOM))) ?? [];
      sample.push(...t.filter((_, i) => i % Math.max(1, Math.floor(t.length / 100)) === 0).slice(0, 100));
    }
    let same = 0;
    let n = 0;
    for (const b of sample) {
      for (const [sx, sy] of [
        [1, 1],
        [-1, -1],
      ]) {
        const [lng, lat] = move(b.point[1], b.point[0], 0.3 * (sx > 0 ? b.box[2] : b.box[0]), 0.3 * (sy > 0 ? b.box[3] : b.box[1]));
        const r = await buildingAt(lat, lng, src);
        n++;
        if (r?.hit?.building.point.join() === b.point.join()) same++;
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(same / n).toBeGreaterThan(0.95);
  });
  it("豊島区の住宅地：用途・階数・構造が入っている", async () => {
    const src = buildingTileSource(fileSource(FILE!));
    const t = await src.tile(...tileOf(35.7372, 139.7462, BUILDING_ZOOM));
    const withUsage = (t ?? []).filter((b) => b.usage && b.above && b.structure);
    expect(withUsage.length).toBeGreaterThan(100);
  });
});
