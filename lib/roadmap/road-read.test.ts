import { describe, expect, it, vi } from "vitest";
import { nearest, readRoads, readRoadShapes, ringsToPolygons, roadShort, type RoadRead } from "./road-read";

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
              // 凡例に無いコード（市の地図にも描かれない）
              { attributes: { SYUBETU: "999", MIN_FUKUIN: 0, MAX_FUKUIN: 0 }, geometry: { paths: [line(0, 2)] } },
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

describe("地図に描く道路の形", () => {
  const LAYER = "https://example.com/arcgis/rest/services/区/FeatureServer/1";
  const BBOX: [number, number, number, number] = [139.7, 35.7, 139.71, 35.71];
  // 時計回り（外周）と反時計回り（穴）
  const outer = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];
  const hole = [
    [0.2, 0.2],
    [0.8, 0.2],
    [0.8, 0.8],
    [0.2, 0.8],
    [0.2, 0.2],
  ];
  const outer2 = outer.map(([x, y]) => [x + 2, y]);

  it("ArcGIS の rings を、外周ごとの多角形（穴つき）に分ける", () => {
    expect(ringsToPolygons([outer, hole, outer2] as [number, number][][])).toEqual([[outer, hole], [outer2]]);
  });

  it("範囲の中の線と面を、凡例の種別名・色をつけて返す。続きがあれば次のページも読む", async () => {
    const queries: URL[] = [];
    const f = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => {
        if (!url.includes("/query?"))
          return { drawingInfo: { renderer: { type: "uniqueValue", uniqueValueInfos: [{ value: "210", label: "42条2項(公道)", symbol: { color: [38, 115, 0, 255] } }] } } };
        const u = new URL(url);
        queries.push(u);
        const offset = Number(u.searchParams.get("resultOffset"));
        // 1ページ目は上限いっぱい（続きあり）、2ページ目で終わり
        if (offset === 0)
          return {
            exceededTransferLimit: true,
            features: Array.from({ length: 1000 }, () => ({ attributes: { CODE1: "210" }, geometry: { paths: [[[139.701, 35.701], [139.702, 35.701]]] } })),
          };
        return { features: [{ attributes: { CODE1: "210" }, geometry: { rings: [outer] } }, { attributes: { CODE1: "999" }, geometry: { paths: [[[0, 0], [1, 1]]] } }] };
      },
    }));
    const fc = await readRoadShapes({ layers: [{ url: LAYER, field: "CODE1" }] }, BBOX, { fetchFn: f });
    expect(queries.map((q) => q.searchParams.get("resultOffset"))).toEqual(["0", "1000"]);
    expect(fc.truncated).toBe(false);
    expect(queries[0].searchParams.get("geometry")).toBe("139.7,35.7,139.71,35.71");
    expect(queries[0].searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
    expect(queries[0].searchParams.get("outFields")).toBe("CODE1");
    // 1000本の線と1つの面。凡例に無いコード（999）は、市の地図にも描かれないので入れない
    expect(fc.features.length).toBe(1001);
    expect(fc.features[0]).toMatchObject({ geometry: { type: "MultiLineString" }, properties: { label: "42条2項(公道)", short: "2項道路", color: "#267300" } });
    expect(fc.features[1000]).toMatchObject({ geometry: { type: "MultiPolygon", coordinates: [[outer]] }, properties: { short: "2項道路" } });
  });

  it("上限まで読んでも続きがあれば、読み切れなかったと返す", async () => {
    const full = vi.fn(async () => ({
      ok: true,
      json: async () => ({ exceededTransferLimit: true, features: Array.from({ length: 1000 }, () => ({ attributes: {}, geometry: { paths: [[[0, 0], [1, 1]]] } })) }),
    }));
    const fc = await readRoadShapes({ layers: [{ url: `${LAYER}z`, label: "42条2項" }] }, BBOX, { fetchFn: full });
    expect(full).toHaveBeenCalledTimes(4);
    expect(fc.features.length).toBe(4000);
    expect(fc.truncated).toBe(true);
  });

  it("種別ごとのレイヤは、レイヤの名前と色を使う。サーバのエラーは失敗にする", async () => {
    const ok = vi.fn(async () => ({ ok: true, json: async () => ({ features: [{ attributes: {}, geometry: { rings: [outer] } }] }) }));
    const fc = await readRoadShapes({ layers: [{ url: `${LAYER}x`, label: "42条1項1号", color: "#8f3b03" }] }, BBOX, { fetchFn: ok });
    expect(fc.features).toEqual([{ type: "Feature", properties: { label: "42条1項1号", short: "1項1号", color: "#8f3b03" }, geometry: { type: "MultiPolygon", coordinates: [[outer]] } }]);
    expect(fc.truncated).toBe(false);
    const bad = vi.fn(async () => ({ ok: true, json: async () => ({ error: { code: 400 } }) }));
    await expect(readRoadShapes({ layers: [{ url: `${LAYER}y`, label: "x" }] }, BBOX, { fetchFn: bad })).rejects.toThrow();
  });
});
