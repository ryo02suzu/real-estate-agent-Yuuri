import { describe, expect, it } from "vitest";
import { parsePhones } from "./phone";
import { TILE, tilesAround, toWorldPixel } from "./tiles";

describe("parsePhones", () => {
  it("複数番号とラベルを分ける", () => {
    expect(parsePhones("048-242-6344（第1係）/ 048-258-1199（第2係）")).toEqual([
      { number: "048-242-6344", label: "第1係" },
      { number: "048-258-1199", label: "第2係" },
    ]);
  });

  it("ラベルなしの番号", () => {
    expect(parsePhones("049-224-5987")).toEqual([{ number: "049-224-5987", label: undefined }]);
  });

  it("番号がなければ空", () => {
    expect(parsePhones("窓口のみ")).toEqual([]);
  });
});

describe("tiles", () => {
  it("経度0・緯度0はズーム0で世界の中心", () => {
    expect(toWorldPixel(0, 0, 0)).toEqual({ x: 128, y: 128 });
  });

  it("中心点は必ず真ん中のタイルの中に入る", () => {
    const { tiles, offsetX, offsetY } = tilesAround(35.892464, 139.789764, 17);
    expect(tiles).toHaveLength(9);
    expect(offsetX).toBeGreaterThanOrEqual(TILE);
    expect(offsetX).toBeLessThan(TILE * 2);
    expect(offsetY).toBeGreaterThanOrEqual(TILE);
    expect(offsetY).toBeLessThan(TILE * 2);
    expect(tiles[4].url).toMatch(/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/std\/17\/\d+\/\d+\.png$/);
  });

  it("縮小表示(128px・5x5)でも中心点は真ん中のタイルの中", () => {
    const { tiles, offsetX, offsetY } = tilesAround(35.892464, 139.789764, 18, { size: 128, radius: 2, layer: "pale" });
    expect(tiles).toHaveLength(25);
    expect(offsetX).toBeGreaterThanOrEqual(128 * 2);
    expect(offsetX).toBeLessThan(128 * 3);
    expect(offsetY).toBeGreaterThanOrEqual(128 * 2);
    expect(offsetY).toBeLessThan(128 * 3);
    expect(tiles[12].url).toContain("/pale/18/");
  });
});
