import { describe, expect, it } from "vitest";
import { dirFromAltAz } from "./atmosphere";
import { artificialVisibility, cityAmbient, irradiance, skyIrradianceSH, sunIrradiance } from "./city-light";

describe("街を照らす光（空の式から）", () => {
  it("昼は屋根（上向き）が壁より明るく、地面向きは暗い", () => {
    const s = dirFromAltAz(50, 180);
    const sh = skyIrradianceSH(s, 50, 0);
    const up = irradiance(sh, [0, 0, 1]), down = irradiance(sh, [0, 0, -1]), west = irradiance(sh, [-1, 0, 0]);
    expect(up[2]).toBeGreaterThan(west[2]);
    expect(west[2]).toBeGreaterThan(down[2]);
    // 青空の光は青い
    expect(up[2]).toBeGreaterThan(up[0]);
  });
  it("夕方は西を向いた壁が東を向いた壁より明るく、赤い", () => {
    const s = dirFromAltAz(2, 250);
    const sh = skyIrradianceSH(s, 2, 0);
    const w = irradiance(sh, [-0.94, -0.34, 0]), e = irradiance(sh, [0.94, 0.34, 0]);
    expect(w[0]).toBeGreaterThan(e[0]);
    const sun = sunIrradiance(s, 2);
    expect(sun[0]).toBeGreaterThan(sun[2] * 1.5);
  });
  it("曇りは向きによる差が小さい灰色の光。夜は直射なし・街の照り返しあり", () => {
    const s = dirFromAltAz(40, 200);
    const oc = skyIrradianceSH(s, 40, 1);
    const w = irradiance(oc, [-1, 0, 0]), e = irradiance(oc, [1, 0, 0]);
    expect(Math.abs(w[1] - e[1]) / w[1]).toBeLessThan(0.05);
    expect(Math.abs(w[0] - w[2]) / w[1]).toBeLessThan(0.15);
    expect(sunIrradiance(dirFromAltAz(-20, 300), -20)).toEqual([0, 0, 0]);
    expect(cityAmbient(-20)[0]).toBeGreaterThan(0.04);
    expect(artificialVisibility(30)).toBe(0);
  });
});
