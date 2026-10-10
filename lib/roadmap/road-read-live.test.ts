// 道路種別の読み取りを本物の地図データ（埼玉県・行田市・つくば市の公開 ArcGIS レイヤ）で確かめる。ネットにつなぐので ROAD_LIVE=1 のときだけ
import { describe, expect, it } from "vitest";
import { MUNICIPALITIES } from "./municipalities";
import { readRoads, type RoadLayer } from "./road-read";

/** レイヤの最初の道路の、線の途中の点（そこを物件の地点にする） */
async function pointOn(layer: RoadLayer, where = "1=1"): Promise<{ lat: number; lng: number }> {
  const q = new URLSearchParams({ f: "json", where, returnGeometry: "true", outSR: "4326", resultRecordCount: "1" });
  const d = (await (await fetch(`${layer.url}/query?${q}`)).json()) as { features: { geometry: { paths: number[][][] } }[] };
  const path = d.features[0].geometry.paths[0];
  const [a, b] = [path[0], path[Math.min(1, path.length - 1)]];
  return { lng: (a[0] + b[0]) / 2, lat: (a[1] + b[1]) / 2 };
}

const readOf = (city: string) => MUNICIPALITIES.find((m) => m.name === city)!.maps.find((l) => l.read)!.read!;

describe.skipIf(!process.env.ROAD_LIVE)("道路種別の読み取り（本物のデータ）", () => {
  it("埼玉県の指定道路図（三芳町）：2項道路の上の地点", { timeout: 60_000 }, async () => {
    const read = readOf("三芳町");
    const p = await pointOn(read.layers[0], "SYUBETU='180'");
    const roads = await readRoads(read, p.lat, p.lng);
    console.log("三芳町", roads.map((r) => `${r.direction} ${r.distance.toFixed(1)}m ${r.label} ${r.width ?? ""}`).join(" / "));
    expect(roads[0]).toMatchObject({ label: "法第42条第2項道路", short: "2項道路", direction: "地点上" });
  });

  it("埼玉県の指定道路図は20町すべてのレイヤが読める", { timeout: 120_000 }, async () => {
    const towns = MUNICIPALITIES.filter((m) => m.maps.some((l) => l.read?.field === "SYUBETU"));
    expect(towns.length).toBe(20);
    for (const m of towns) {
      const url = m.maps.find((l) => l.read)!.read!.layers[0].url;
      const d = (await (await fetch(`${url}?f=json`)).json()) as { name?: string; error?: unknown };
      expect(d.error, m.name).toBeUndefined();
      expect(d.name, m.name).toContain("指定道路");
    }
  });

  for (const [city, label] of [
    ["行田市", "42条2項"],
    ["つくば市", "第42条第2項"],
  ] as const)
    it(`${city}：${label} の上の地点`, { timeout: 60_000 }, async () => {
      const read = readOf(city);
      const layer = read.layers.find((l) => l.label === label)!;
      const p = await pointOn(layer);
      const roads = await readRoads(read, p.lat, p.lng);
      console.log(city, roads.map((r) => `${r.direction} ${r.distance.toFixed(1)}m ${r.label}`).join(" / "));
      expect(roads.find((r) => r.label === label)?.distance).toBeLessThan(1.5);
    });
});
