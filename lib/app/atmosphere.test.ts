import { describe, expect, it } from "vitest";
import { dirFromAltAz, exposureFor, radiance, skyColor, sunTransmittance } from "./atmosphere";

describe("大気の計算（空をコードで描く式）", () => {
  it("昼の空は上が青く、地平線は白っぽい", () => {
    const s = dirFromAltAz(55, 180);
    const top = skyColor(dirFromAltAz(24, 262), s, 55);
    const hz = skyColor(dirFromAltAz(2, 262), s, 55);
    expect(top[2]).toBeGreaterThan(top[0] + 60);
    expect(Math.min(...hz)).toBeGreaterThan(200);
  });
  it("日没の太陽の方向は赤く、反対側より明るい（澄んだ冬の空気）。霞が濃いと差が小さい", () => {
    const s = dirFromAltAz(-3, 262);
    const toward = radiance(dirFromAltAz(2, 262), s, 0.3);
    const away = radiance(dirFromAltAz(2, 82), s, 0.3);
    expect(toward[0]).toBeGreaterThan(toward[2] * 3);
    expect(toward[0]).toBeGreaterThan(away[0] * 1.5);
    expect(toward[0] / toward[2]).toBeGreaterThan(away[0] / away[2]);
    const hazyToward = radiance(dirFromAltAz(2, 262), s, 2.5);
    const hazyAway = radiance(dirFromAltAz(2, 82), s, 2.5);
    expect(hazyToward[0]).toBeGreaterThanOrEqual(hazyAway[0]);
    expect(hazyToward[0] / hazyAway[0]).toBeLessThan(toward[0] / away[0]);
  });
  it("霞が多いほど空は白っぽく（青と赤の差が小さく）、遠くの太陽は暗い", () => {
    const s = dirFromAltAz(55, 180);
    const clear = skyColor(dirFromAltAz(24, 262), s, 55, { aero: 0.15, glow: 1 });
    const hazy = skyColor(dirFromAltAz(24, 262), s, 55, { aero: 3, glow: 1 });
    expect(hazy[2] - hazy[0]).toBeLessThan((clear[2] - clear[0]) * 0.6);
    expect(sunTransmittance(dirFromAltAz(5, 262), 3)[0]).toBeLessThan(sunTransmittance(dirFromAltAz(5, 262), 0.15)[0] * 0.6);
  });
  it("太陽が沈むほど空は暗くなり、−18° より下では散乱の光がほぼ無い", () => {
    let prev = Infinity;
    for (const alt of [20, 5, 0, -3, -6, -9, -12]) {
      const L = radiance(dirFromAltAz(24, 262), dirFromAltAz(alt, 262));
      const lum = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
      expect(lum).toBeLessThan(prev);
      prev = lum;
    }
    const night = radiance(dirFromAltAz(24, 262), dirFromAltAz(-20, 285));
    expect(Math.max(...night)).toBeLessThan(1e-4);
  });
  it("太陽の光の透過は、低いほど少なく赤い", () => {
    const high = sunTransmittance(dirFromAltAz(60, 200));
    const low = sunTransmittance(dirFromAltAz(1, 262));
    expect(high[2]).toBeGreaterThan(0.7);
    expect(low[0]).toBeGreaterThan(low[2] * 20);
    expect(low[0]).toBeLessThan(high[0]);
    expect(sunTransmittance(dirFromAltAz(-5, 262))).toEqual([0, 0, 0]);
  });
  it("露出は昼に低く、夜に高く、間は連続", () => {
    expect(exposureFor(40)).toBe(exposureFor(10));
    expect(exposureFor(-20)).toBeCloseTo(exposureFor(-12), 6);
    let prev = 0;
    for (let a = 15; a >= -15; a -= 0.5) {
      const e = exposureFor(a);
      expect(e).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = e;
    }
  });
  it("夜の空にも地（街の明かりの照り返し）があり、地平線の方が明るい", () => {
    const s = dirFromAltAz(-25, 300);
    const top = skyColor(dirFromAltAz(24, 262), s, -25);
    const hz = skyColor(dirFromAltAz(1, 262), s, -25);
    expect(top[2]).toBeGreaterThan(top[0]);
    expect(hz[0]).toBeGreaterThan(top[0]);
  });
});
