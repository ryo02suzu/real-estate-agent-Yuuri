import { describe, expect, it } from "vitest";
import { cloudDrift, cloudField, flashAt, layerDist, mergeCloud, parseTime, rainField, rainMmh, sampleField, satTimes, sunVisibility, thunderInfo, tileBounds, toPixel } from "./satellite";
import { NO_WEATHER } from "./weather";

describe("ひまわり・ナウキャストのタイル", () => {
  it("z6 の 56/25 は東京のまわり（経度 135〜140.6、緯度 32〜36.6）。東京は右上の方", () => {
    const b = tileBounds(6, 56, 25);
    expect(b.lonW).toBe(135);
    expect(b.lonE).toBeCloseTo(140.625, 3);
    expect(b.latN).toBeCloseTo(36.597, 2);
    expect(b.latS).toBeCloseTo(31.952, 2);
    const [px, py] = toPixel(b, 256, 139.7616, 35.664);
    expect(Math.floor(px)).toBe(216);
    expect(Math.floor(py)).toBe(52);
  });
  it("候補の時刻は「今 − 8 分」から 2.5 分刻み", () => {
    const t = satTimes(new Date("2026-10-26T03:38:25Z"), 3, "");
    expect(t).toEqual(["20261026033000", "20261026032730", "20261026032500"]);
    expect(satTimes(new Date(), 3, "#t=2026-10-26T12:00&sat=20261025030000")).toEqual(["20261025030000"]);
    expect(parseTime("20261026033000").toISOString()).toBe("2026-10-26T03:30:00.000Z");
  });
});

describe("雲の場", () => {
  it("昼は可視で濃さ、赤外で高さ。夜は赤外だけで、地面より冷たい所が雲", () => {
    const size = 32;
    const b = tileBounds(6, 56, 25);
    const ir = new Uint8ClampedArray(size * size).fill(60);
    const alb = new Uint8ClampedArray(size * size).fill(80);
    // 左上：低い雲（明るく暖かい）、右下：高い雲（明るく冷たい）
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) alb[y * size + x] = 220;
    for (let y = 16; y < 32; y++) for (let x = 16; x < 32; x++) { alb[y * size + x] = 240; ir[y * size + x] = 190; }
    const f = cloudField(ir, alb, size, b, "t", { lat: 35, lon: 137 });
    expect(f.data[(2 * size + 2) * 4]).toBeGreaterThan(200); // 低い雲 R
    expect(f.data[(2 * size + 2) * 4 + 1]).toBe(0);
    expect(f.data[(20 * size + 20) * 4 + 1]).toBeGreaterThan(200); // 高い雲 G
    expect(f.data[(2 * size + 20) * 4]).toBe(0); // 晴れ
    expect(f.night).toBe(false);
    const n = cloudField(ir, null, size, b, "t");
    expect(n.night).toBe(true);
    expect(n.data[(20 * size + 20) * 4 + 1]).toBeGreaterThan(200);
    expect(n.data[(2 * size + 2) * 4]).toBe(0); // 夜は暖かい低い雲は見えない
  });
  it("太陽の隠れ具合：太陽の向きの先の雲を読む。雲が無ければ 1、厚い雲なら 0 に近い", () => {
    const size = 128;
    const b = tileBounds(6, 56, 25);
    const cam = { lat: 34.3, lon: 137.8 };
    const [cx, cy] = toPixel(b, size, cam.lon, cam.lat);
    // 全面が高い雲（冷たく明るい）。カメラの真上だけ半径 2 画素（≒ 8km）が晴れ
    const ir = new Uint8ClampedArray(size * size).fill(190);
    const alb = new Uint8ClampedArray(size * size).fill(240);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < 1.6 ** 2) { alb[y * size + x] = 80; ir[y * size + x] = 60; }
    const f = cloudField(ir, alb, size, b, "t", cam);
    const up: [number, number, number] = [0, 0, 1];
    // 南の低い太陽（高度 20°）：低い層は 3km 先（晴れ）、高い層は 20km 先（雲）
    const south: [number, number, number] = [0, -0.94, 0.342];
    expect(sunVisibility(f, up, 0.5, [1.4, 7.5], [0, 0], 0, cam)).toBeGreaterThan(0.9);
    expect(sunVisibility(f, south, 0.5, [1.4, 7.5], [0, 0], 0, cam)).toBeLessThan(0.15);
    expect(sunVisibility(null, south, 0.6, [1.4, 7.5])).toBeCloseTo(0.55, 3);
    expect(sunVisibility(f, [0, -0.94, -0.342], 0.5, [1.4, 7.5])).toBe(1);
    expect(layerDist([0, 0, 1], 1.4)).toBeCloseTo(1.14, 2);
    expect(layerDist([0, 1, 0], 1.4)).toBeGreaterThan(100);
    expect(sampleField(f, 0, 0, 1, cam)).toBeLessThan(0.1);
    expect(sampleField(f, 0, -30, 1, cam)).toBeGreaterThan(0.9);
  });
  it("雲量は衛星（夜は予報で補う）", () => {
    const size = 8;
    const b = tileBounds(6, 56, 25);
    const f = cloudField(new Uint8ClampedArray(64).fill(60), new Uint8ClampedArray(64).fill(240), size, b, "t", { lat: 34, lon: 137.8 });
    expect(f.fraction).toBe(1);
    expect(mergeCloud(0.1, f)).toBe(1);
    expect(mergeCloud(0.9, { ...f, night: true, fraction: 0.1 })).toBeCloseTo(0.77, 2);
    expect(mergeCloud(0.4, null)).toBe(0.4);
  });
});

describe("雨と雷", () => {
  it("ナウキャストの色 → mm/h。透明は 0", () => {
    expect(rainMmh(242, 242, 255, 255)).toBe(0.5);
    expect(rainMmh(33, 140, 255, 255)).toBe(7.5);
    expect(rainMmh(180, 0, 104, 255)).toBe(90);
    expect(rainMmh(0, 0, 0, 0)).toBe(0);
    expect(rainMmh(120, 120, 120, 255)).toBe(0);
  });
  it("雨の場はカメラの位置の雨の強さを出す", () => {
    const b = tileBounds(8, 226, 100, 2);
    const [cx, cy] = toPixel(b, 512, 139.7616, 35.664);
    const rgba = new Uint8ClampedArray(256 * 256 * 4);
    // カメラの画素（タイル dx=1, dy=0 の中）に 7.5mm/h
    const dx = Math.floor(cx / 256), dy = Math.floor(cy / 256);
    const lx = Math.round(cx) - dx * 256, ly = Math.round(cy) - dy * 256;
    for (let yy = ly - 1; yy <= ly + 1; yy++) for (let xx = lx - 1; xx <= lx + 1; xx++) rgba.set([33, 140, 255, 255], (yy * 256 + xx) * 4);
    const f = rainField([{ dx, dy, rgba }], 2, b, "t");
    expect(f.mmhAtCamera).toBeCloseTo(7.5, 0);
    expect(f.any).toBe(true);
    expect(f.data[((Math.round(cy)) * 512 + Math.round(cx)) * 4]).toBe(Math.round(7.5 * 2.5));
  });
  it("雷：いちばん近い発雷域の向きと距離", () => {
    const b = tileBounds(8, 226, 100, 2);
    const rgba = new Uint8ClampedArray(256 * 256 * 4);
    const [cx, cy] = toPixel(b, 512, 139.7616, 35.664);
    // カメラの真西 100 画素（≒ 60km）に発雷域
    const x = Math.round(cx) - 100 - 256, y = Math.round(cy);
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) rgba.set([250, 245, 0, 255], (yy * 256 + xx) * 4);
    const t = thunderInfo([{ dx: 0, dy: 0, rgba }], 2, b, "t");
    expect(t.on).toBe(true);
    expect(Math.abs(t.bearing - 270)).toBeLessThan(3);
    expect(t.distKm).toBeGreaterThanOrEqual(45);
    expect(t.distKm).toBeLessThan(70);
    expect(thunderInfo([], 2, b, "t").on).toBe(false);
  });
  it("稲光は発雷域があるときだけ、その向きで。遠いほど弱い", () => {
    const th = { on: true, bearing: 250, distKm: 40, time: "t", fetchedAt: 0 };
    let hits = 0;
    for (let s = 0; s < 220; s += 0.02) if (flashAt(s, th).k > 0) hits++;
    expect(hits).toBeGreaterThan(5);
    expect(hits).toBeLessThan(600);
    expect(flashAt(1, { ...th, distKm: 200 }).k).toBe(0);
    expect(flashAt(1, null).k).toBe(0);
    const f = flashAt(0, th);
    expect(f.dir[0]).toBeLessThan(0);
  });
  it("雲は風で流れる（北の風 5m/s、10 分 → 南へ 6km）", () => {
    const [x, y] = cloudDrift({ ...NO_WEATHER, wind: 5, windDir: 16 }, 600);
    expect(Math.abs(x)).toBeLessThan(0.01);
    expect(y).toBeCloseTo(-6, 2);
    expect(cloudDrift(NO_WEATHER, 600)).toEqual([0, 0]);
  });
});
