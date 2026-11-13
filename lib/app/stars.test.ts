import { describe, expect, it } from "vitest";
import { altAz, gmstDeg, planets, skyObjects, starLook, STARS, starVisibility, sunRaDec } from "./stars";

const TOKYO = { lat: 35.6812, lon: 139.7671 };
/** 2 点の角距離（度） */
function sep(ra1: number, dec1: number, ra2: number, dec2: number) {
  const R = Math.PI / 180;
  const c = Math.sin(dec1 * R) * Math.sin(dec2 * R) + Math.cos(dec1 * R) * Math.cos(dec2 * R) * Math.cos((ra1 - ra2) * R);
  return Math.acos(Math.max(-1, Math.min(1, c))) / R;
}

describe("星と惑星の位置", () => {
  it("恒星時：2000 年 1 月 1 日 12 時 UT のグリニッジ恒星時は 18.697h", () => {
    expect(gmstDeg(new Date("2000-01-01T12:00:00Z")) / 15).toBeCloseTo(18.697, 2);
  });
  it("北極星はいつでもほぼ真北・高度は緯度", () => {
    const polaris = STARS.find((s) => s[0] === "ポラリス")!;
    for (const iso of ["2026-01-15T12:00:00Z", "2026-07-15T15:00:00Z"]) {
      const p = altAz(polaris[1] * 15, polaris[2], new Date(iso), TOKYO.lat, TOKYO.lon);
      expect(Math.abs(p.alt - TOKYO.lat)).toBeLessThan(1.2);
      expect(Math.min(p.az, 360 - p.az)).toBeLessThan(1.5);
    }
  });
  it("太陽：春分の日（2026-03-20 14:46 UT）の赤経は 0h・赤緯は 0°", () => {
    const [ra, dec] = sunRaDec(new Date("2026-03-20T14:46:00Z"));
    expect(Math.min(ra, 360 - ra)).toBeLessThan(0.5);
    expect(Math.abs(dec)).toBeLessThan(0.3);
  });
  it("惑星：衝の日は太陽の反対側、合の日は太陽のそば（木星 2026-01-10 衝、土星 2025-09-21 衝、金星 2026-01-06 外合）", () => {
    const anti = (name: string, iso: string) => {
      const at = new Date(iso);
      const p = planets(at).find((x) => x.name === name)!;
      const [sra, sdec] = sunRaDec(at);
      return sep(p.ra, p.dec, sra, sdec);
    };
    expect(anti("jupiter", "2026-01-10T00:00:00Z")).toBeGreaterThan(176);
    expect(anti("saturn", "2025-09-21T00:00:00Z")).toBeGreaterThan(176);
    // 火星は軌道の傾きで、衝でも黄緯が 4° ほどずれる
    expect(anti("mars", "2025-01-16T00:00:00Z")).toBeGreaterThan(174);
    expect(anti("venus", "2026-01-06T00:00:00Z")).toBeLessThan(3);
  });
  it("惑星の明るさ：金星は -3.5 等より明るく、木星は -1.5 等より明るい", () => {
    const ps = planets(new Date("2026-10-27T10:00:00Z"));
    expect(ps.find((p) => p.name === "venus")!.mag).toBeLessThan(-3.5);
    expect(ps.find((p) => p.name === "jupiter")!.mag).toBeLessThan(-1.5);
  });
  it("いま見える星：東京の夜に高度 −1° より上で 3.2 等までのものだけ。シリウスの冬の夜は見える", () => {
    const list = skyObjects(new Date("2026-01-15T14:00:00Z"), TOKYO.lat, TOKYO.lon);
    expect(list.length).toBeGreaterThan(15);
    expect(list.every((s) => s.alt >= -1 && s.mag <= 3.2)).toBe(true);
    expect(list.some((s) => s.label === "シリウス")).toBe(true);
    // 夏の星（ベガ）は 1 月 23 時には沈んでいる
    expect(list.some((s) => s.label === "ベガ" && s.alt > 5)).toBe(false);
  });
  it("見える度合い：金星は日没の直後から、0 等は太陽 −8°、2 等は −13° より下でいっぱいに", () => {
    expect(starVisibility(-4, -2.5)).toBeCloseTo(0.5, 5);
    expect(starVisibility(-4, -4)).toBe(1);
    expect(starVisibility(0, -8)).toBe(1);
    expect(starVisibility(2, -8)).toBe(0);
    expect(starVisibility(2, -13)).toBe(1);
  });
  it("見え方：明るいほど明るく大きく、低い星ほどまたたき、惑星はほとんどまたたかない", () => {
    const base = { label: "", alt: 60, az: 0, bv: 0, planet: false, airmass: 1.15 };
    const sirius = starLook({ ...base, mag: -1.2 });
    const third = starLook({ ...base, mag: 3 });
    expect(sirius.intensity).toBeGreaterThan(1);
    expect(third.intensity).toBeLessThan(0.15);
    expect(third.intensity).toBeGreaterThan(0.05);
    expect(sirius.size).toBeGreaterThan(third.size);
    expect(starLook({ ...base, mag: 1, airmass: 3 }).twinkle).toBeGreaterThan(starLook({ ...base, mag: 1 }).twinkle);
    expect(starLook({ ...base, mag: 1, planet: true }).twinkle).toBeLessThan(0.05);
  });
});
