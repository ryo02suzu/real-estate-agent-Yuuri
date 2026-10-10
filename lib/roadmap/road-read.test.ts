import { describe, expect, it, vi } from "vitest";
import { nearest, readRoads, roadShort, type RoadRead } from "./road-read";

const LAT = 35.82;
const LNG = 139.55;
// 1m ≒ 緯度 0.000009・経度 0.0000111（北緯36度付近）
const M = 0.000009;
const LX = 0.0000111;

describe("道路の種別の短い呼び方", () => {
  it("42条の項・号", () => {
    expect(roadShort("法第42条第1項第1号道路")).toBe("1項1号");
    expect(roadShort("第42条第1項第5号")).toBe("1項5号");
    expect(roadShort("法第42条第2項道路")).toBe("2項道路");
    expect(roadShort("42条2項")).toBe("2項道路");
    expect(roadShort("法第42条第2項道路(3項において水平距離を指定したもの)")).toBe("2項道路");
    expect(roadShort("予定道路(法第68条の7)")).toBe("予定道路");
    expect(roadShort("法定外道路（42条2項外）")).toBe("法定外");
    expect(roadShort("未判定")).toBe("未判定");
    expect(roadShort("法第４２条第１項第３号道路")).toBe("1項3号");
  });
});

describe("いちばん近い所と方角", () => {
  it("北に 10m の東西の道", () => {
    const r = nearest([LNG, LAT], [[[LNG - 50 * LX, LAT + 10 * M], [LNG + 50 * LX, LAT + 10 * M]]]);
    expect(r.distance).toBeGreaterThan(9.5);
    expect(r.distance).toBeLessThan(10.5);
    expect(Math.abs(r.bearing)).toBeLessThan(1);
  });
  it("東に 5m の南北の道", () => {
    const r = nearest([LNG, LAT], [[[LNG + 5 * LX, LAT - 50 * M], [LNG + 5 * LX, LAT + 50 * M]]]);
    expect(r.distance).toBeGreaterThan(4.5);
    expect(r.distance).toBeLessThan(5.5);
    expect(r.bearing).toBeGreaterThan(89);
    expect(r.bearing).toBeLessThan(91);
  });
});

describe("地図データを読む", () => {
  const LAYER = "https://example.com/arcgis/rest/services/町/FeatureServer/0";
  const line = (dx: number, dy: number, len = 40): number[][] => [
    [LNG + dx * LX - (len / 2) * LX, LAT + dy * M],
    [LNG + dx * LX + (len / 2) * LX, LAT + dy * M],
  ];
  const fetchFn = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes("/query?")
        ? {
            features: [
              { attributes: { SYUBETU: "180", MIN_FUKUIN: 3.6, MAX_FUKUIN: 4 }, geometry: { paths: [line(0, 6)] } },
              { attributes: { SYUBETU: "130", MIN_FUKUIN: 0, MAX_FUKUIN: 0 }, geometry: { paths: [line(0, -20)] } },
              // 同じ種別・同じ方角の続き（まとめる）
              { attributes: { SYUBETU: "180", MIN_FUKUIN: 0, MAX_FUKUIN: 0 }, geometry: { paths: [line(0, 9)] } },
            ],
          }
        : {
            drawingInfo: {
              renderer: {
                type: "uniqueValue",
                uniqueValueInfos: [
                  { value: "130", label: "法第42条第1項第1号道路", symbol: { color: [46, 166, 13, 255] } },
                  { value: "180", label: "法第42条第2項道路", symbol: { color: [99, 222, 255, 255] } },
                ],
              },
            },
          },
  }));

  it("凡例でコードを種別名にし、近い順に方角と距離・幅員を出す", async () => {
    const read: RoadRead = { layers: [{ url: LAYER }], field: "SYUBETU", width: ["MIN_FUKUIN", "MAX_FUKUIN"] };
    const roads = await readRoads(read, LAT, LNG, { fetchFn });
    expect(roads.map((r) => [r.short, r.direction, Math.round(r.distance), r.width, r.color])).toEqual([
      ["2項道路", "北", 6, "3.6〜4.0m", "#63deff"],
      ["1項1号", "南", 20, undefined, "#2ea60d"],
    ]);
    const q = fetchFn.mock.calls.map(([u]) => u).find((u) => u.includes("/query?"))!;
    expect(new URL(q).searchParams.get("distance")).toBe("50");
    expect(new URL(q).searchParams.get("outFields")).toBe("SYUBETU,MIN_FUKUIN,MAX_FUKUIN");
  });

  it("種別ごとのレイヤは、レイヤの名前をそのまま種別にする（凡例は読まない）", async () => {
    // 東に 8m の南北の道
    const east = [
      [LNG + 8 * LX, LAT - 20 * M],
      [LNG + 8 * LX, LAT + 20 * M],
    ];
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ features: [{ attributes: {}, geometry: { paths: [east] } }] }) }));
    const roads = await readRoads({ layers: [{ url: `${LAYER}x`, label: "第42条第2項", color: "#a553b7" }] }, LAT, LNG, { fetchFn: f });
    expect(roads).toEqual([{ label: "第42条第2項", short: "2項道路", color: "#a553b7", distance: expect.any(Number), direction: "東", width: undefined }]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("サーバのエラーは失敗として返す", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ error: { code: 400 } }) }));
    await expect(readRoads({ layers: [{ url: `${LAYER}y`, label: "x" }] }, LAT, LNG, { fetchFn: f })).rejects.toThrow();
  });
});
