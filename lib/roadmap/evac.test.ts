import { describe, expect, it } from "vitest";
import { EVAC_KINDS, evacSitesNear, evacTileUrl, type JsonFetcher } from "./evac";

const site = (name: string, lng: number, lat: number, kinds: number[], address = "") => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { name, address, ...Object.fromEntries(kinds.map((k) => [`disaster${k}`, 1])) },
});

describe("指定緊急避難場所", () => {
  it("物件の近い順に3つ。2つのレイヤに同じ場所があっても1つにし、災害の種類を読む", async () => {
    const urls: string[] = [];
    const fetchJson: JsonFetcher = async (url) => {
      urls.push(url);
      const features = url.includes("skhb01")
        ? [site("神南小学校", 139.7012, 35.6655, [1, 4], "東京都渋谷区神南1-3-10"), site("遠い公園", 139.75, 35.7, [1])]
        : [site("神南小学校", 139.7012, 35.6655, [1, 4], "東京都渋谷区神南1-3-10"), site("代々木公園", 139.6949, 35.6717, [4, 6]), site("渋谷区役所", 139.6981, 35.6618, [4])];
      return { type: "FeatureCollection", features };
    };
    const sites = await evacSitesNear(35.6640, 139.6990, fetchJson);
    expect(sites.map((s) => s.name)).toEqual(["渋谷区役所", "神南小学校", "代々木公園"]);
    expect(sites[1].kinds.map((k) => EVAC_KINDS[k])).toEqual(["洪水", "地震"]);
    expect(sites[1].address).toBe("東京都渋谷区神南1-3-10");
    expect(sites[0].straight).toBeGreaterThan(200);
    expect(sites[0].straight).toBeLessThan(400);
    expect(urls.every((u) => /\/xyz\/skhb0[14]\/10\/\d+\/\d+\.geojson$/.test(u))).toBe(true);
  });

  it("無いタイル（null）は飛ばす。範囲より遠い場所は出さない", async () => {
    const fetchJson: JsonFetcher = async (url) => (url.includes("skhb01") ? null : { features: [site("遠い場所", 139.9, 35.9, [4])] });
    expect(await evacSitesNear(35.6640, 139.6990, fetchJson, { maxM: 3000 })).toEqual([]);
  });

  it("タイルの URL", () => {
    expect(evacTileUrl("skhb04", 909, 403)).toBe("https://cyberjapandata.gsi.go.jp/xyz/skhb04/10/909/403.geojson");
  });
});
