import { describe, expect, it } from "vitest";
import { cloudField, flightMood, flightStyle, gsiToTerrarium, hazeBackground, LOOKS, terrainExaggeration, terrariumHeight, type FlightMood } from "./flight-look";
import { bearingTo, centerFor, distanceKm, zoomForMpp } from "./flight-handoff";

/** 国土地理院の標高タイルの 1 画素（x = R×65536 + G×256 + B） */
const gsiPixel = (x: number) => [(x >> 16) & 255, (x >> 8) & 255, x & 255, 255];

describe("国土地理院の標高 → terrarium", () => {
  const convert = (px: number[]) => {
    const a = new Uint8ClampedArray(px);
    gsiToTerrarium(a);
    return terrariumHeight(a[0], a[1], a[2]);
  };
  it("正の高さ（富士山の頂上 3776.12m）", () => {
    expect(convert(gsiPixel(377612))).toBeCloseTo(3776.12, 1);
  });
  it("0m と、値なし（海。2^23）は 0m", () => {
    expect(convert(gsiPixel(0))).toBeCloseTo(0, 2);
    expect(convert(gsiPixel(8388608))).toBeCloseTo(0, 2);
  });
  it("負の高さ（−12.34m）", () => {
    expect(convert(gsiPixel(16777216 - 1234))).toBeCloseTo(-12.34, 1);
  });
  it("透明な画素は 0m・不透明にする", () => {
    const a = new Uint8ClampedArray([10, 20, 30, 0]);
    gsiToTerrarium(a);
    expect(terrariumHeight(a[0], a[1], a[2])).toBeCloseTo(0, 2);
    expect(a[3]).toBe(255);
  });
});

describe("山の立体の強さ", () => {
  it("遠くは強め、土地の近くは本物の高さ。間はなめらか", () => {
    expect(terrainExaggeration(5)).toBe(1.9);
    expect(terrainExaggeration(16)).toBe(1);
    let prev = Infinity;
    for (let z = 8; z <= 15; z += 0.5) {
      const e = terrainExaggeration(z);
      expect(e).toBeLessThanOrEqual(prev);
      expect(e).toBeGreaterThanOrEqual(1);
      expect(e).toBeLessThanOrEqual(1.9);
      prev = e;
    }
  });
});

describe("雲の模様", () => {
  const n = 64;
  const f = cloudField(n);
  it("0〜1 で、雲のある所とない所がある", () => {
    let lo = 0;
    let hi = 0;
    for (const v of f) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v === 0) lo++;
      if (v > 0.5) hi++;
    }
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThan(0);
  });
  it("決まった種なら毎回同じ形", () => {
    expect(cloudField(n)).toEqual(f);
    expect(cloudField(n, 99)).not.toEqual(f);
  });
  it("左右・上下の端がつながる（並べても継ぎ目が出ない）", () => {
    // 端の列と反対側の端の列の差は、となり合う列どうしの差と同じくらい
    let edge = 0;
    let inner = 0;
    for (let y = 0; y < n; y++) {
      edge += Math.abs(f[y * n + (n - 1)] - f[y * n]);
      inner += Math.abs(f[y * n + 1] - f[y * n]);
    }
    expect(edge).toBeLessThan(inner * 3 + 1);
    let edgeY = 0;
    let innerY = 0;
    for (let x = 0; x < n; x++) {
      edgeY += Math.abs(f[(n - 1) * n + x] - f[x]);
      innerY += Math.abs(f[n + x] - f[x]);
    }
    expect(edgeY).toBeLessThan(innerY * 3 + 1);
  });
});

describe("時間帯ごとの地図の作り", () => {
  const ids = (mood: FlightMood, terrain = true) => flightStyle(mood, { terrain }).layers.map((l) => l.id);
  it("昼は街明かり・道路の光がなく、夜はある", () => {
    expect(ids("day")).not.toContain("lights");
    expect(ids("day")).not.toContain("road-light");
    expect(ids("night")).toEqual(expect.arrayContaining(["lights", "glow", "road-glow", "road-light", "tint"]));
    expect(ids("dusk")).toEqual(expect.arrayContaining(["lights", "road-light"]));
    expect(ids("evening")).toContain("lights");
    expect(ids("evening")).not.toContain("road-light");
  });
  it("重ねる順：地球 → 写真 → 山の陰影 → 時間帯の色（いちばん上）", () => {
    for (const mood of Object.keys(LOOKS) as FlightMood[]) {
      const l = ids(mood);
      expect(l[0]).toBe("earth");
      expect(l.indexOf("photo")).toBeLessThan(l.indexOf("shade"));
      if (l.includes("tint")) expect(l[l.length - 1]).toBe("tint");
    }
  });
  it("山の立体の部品は、立体にするときだけ入る（陰影とは別の読み先）", () => {
    expect(flightStyle("day", { terrain: true }).sources.dem).toBeDefined();
    expect(flightStyle("day", { terrain: false }).sources.dem).toBeUndefined();
    expect(flightStyle("day", { terrain: false }).sources.shade).toBeDefined();
  });
  it("読む先は NASA と国土地理院だけ", () => {
    const s = flightStyle("night", { terrain: true });
    for (const src of Object.values(s.sources)) {
      const tiles = "tiles" in src ? (src.tiles ?? []) : [];
      for (const t of tiles) expect(t).toMatch(/^(https:\/\/gibs\.earthdata\.nasa\.gov\/|https:\/\/cyberjapandata\.gsi\.go\.jp\/|gsidem:\/\/cyberjapandata\.gsi\.go\.jp\/)/);
    }
  });
  it("地平線の霞は時間帯の霞の色で、上下の端は透明", () => {
    const g = hazeBackground("evening");
    // 夕方の霞 #f0b48e
    expect(g).toContain("rgba(240,180,142,0)");
    expect(g).toContain("rgba(240,180,142,0.6)");
    expect(g.startsWith("linear-gradient(to bottom")).toBe(true);
    expect(g.trim().endsWith("rgba(240,180,142,0) 100%)")).toBe(true);
  });
  it("時間帯は太陽の高さで決まる（東京駅で 11 月 2 日：昼・夕方・夜）", () => {
    expect(flightMood(new Date("2026-11-02T13:40:00+09:00"))).toBe("day");
    expect(flightMood(new Date("2026-11-02T16:20:00+09:00"))).toBe("evening");
    expect(flightMood(new Date("2026-11-02T21:00:00+09:00"))).toBe("night");
  });
});

describe("模型へのつなぎの計算", () => {
  it("1px の長さからズーム（赤道で 1 枚 512px）", () => {
    expect(zoomForMpp(40075016.686 / 512, 0)).toBeCloseTo(0, 6);
    expect(zoomForMpp(40075016.686 / 512 / 2 ** 16, 0)).toBeCloseTo(16, 6);
    // 緯度が上がると、同じ長さでもズームは小さい
    expect(zoomForMpp(1, 35.8)).toBeLessThan(zoomForMpp(1, 0));
  });
  it("方位と距離（松戸あたりから富士山は西南西・約 110km）", () => {
    const from = { lat: 35.7876, lng: 139.9031 };
    const fuji = { lat: 35.3606, lng: 138.7274 };
    const b = bearingTo(from, fuji);
    expect(b).toBeGreaterThan(235);
    expect(b).toBeLessThan(255);
    expect(distanceKm(from, fuji)).toBeGreaterThan(100);
    expect(distanceKm(from, fuji)).toBeLessThan(125);
    expect(bearingTo({ lat: 35, lng: 139 }, { lat: 36, lng: 139 })).toBeCloseTo(0, 6);
    expect(bearingTo({ lat: 35, lng: 139 }, { lat: 35, lng: 140 })).toBeCloseTo(90, 6);
  });
  it("土地を画面の中心からずらして置くときの地図の中心", () => {
    const t = { lat: 35.7876, lng: 139.9031 };
    // ずらさなければ土地そのもの
    const c0 = centerFor(t, 0, 0, 30, 16);
    expect(c0.lat).toBeCloseTo(t.lat, 9);
    expect(c0.lng).toBeCloseTo(t.lng, 9);
    // 北が上で、土地を画面の上へ（dy < 0）置くと、地図の中心は土地より南
    const up = centerFor(t, 0, -160, 0, 16);
    expect(up.lat).toBeLessThan(t.lat);
    expect(up.lng).toBeCloseTo(t.lng, 9);
    // 1px の長さどおりにずれる（ズーム 16 で約 0.97m/px → 160px で約 155m）
    const m = (t.lat - up.lat) * 111195;
    expect(m).toBeGreaterThan(140);
    expect(m).toBeLessThan(170);
    // 東が上（向き 90°）なら、土地を上へ置くと地図の中心は土地より西
    const east = centerFor(t, 0, -160, 90, 16);
    expect(east.lng).toBeLessThan(t.lng);
    expect(east.lat).toBeCloseTo(t.lat, 6);
  });
});
