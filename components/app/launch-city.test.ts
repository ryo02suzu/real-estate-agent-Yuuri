import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LAUNCH_CITY_SCRIPT } from "./launch-city-script";

type Pose = { phi: number; h: number; cz: number; v: number; roll: number; px: number; py: number };
type Api = {
  rng: (seed: number) => () => number;
  cityRoads: (seed: number) => number[];
  towers: (seed: number) => number[];
  pose: (t: number, W: number, H: number, hf: number, mx: number, my: number) => Pose;
  MARK: [number, number][][];
  timing: { A0: number; A1: number; B1: number; DIVE: number; END: number; WAVE_AT: number; WAVE_LEN: number };
};

/** <head> に入れる本物の文字列を動かし、描かずに中身（街の道・カメラ・時間割）だけを受け取る */
function load(): Api {
  let api: Api | null = null;
  const g = globalThis as { __michiluLaunchTest?: (a: Api) => void };
  g.__michiluLaunchTest = (a) => {
    api = a;
  };
  try {
    new Function(LAUNCH_CITY_SCRIPT)();
  } finally {
    delete g.__michiluLaunchTest;
  }
  if (!api) throw new Error("launch-city.js が中身を渡さなかった");
  return api;
}

const city = load();
const { A1, B1, DIVE, END, WAVE_AT, WAVE_LEN } = city.timing;
// 16 Pro くらいの画面（402×874）と、真ん中のロゴのマークの位置・最後の高さ
const W = 402;
const H = 874;
const MX = 118;
const MY = 402;
const HF = 990;

afterAll(() => {
  delete (globalThis as { __michiluLaunchTest?: unknown }).__michiluLaunchTest;
});

describe("長い版のオープニング「光の道の街」（components/app/launch-city.js）", () => {
  it("<head> に入れる文字列は、そのまま動く（コメントの行を除いても壊れない）", () => {
    expect(LAUNCH_CITY_SCRIPT).not.toMatch(/^\s*\/\//m);
    expect(() => new Function(LAUNCH_CITY_SCRIPT)).not.toThrow();
  });

  it("街の道は、同じ種なら毎回同じ。どの道も短く切られ、光は M（原点）に近い端から伸びる", () => {
    const a = city.cityRoads(20261102);
    expect(a).toEqual(city.cityRoads(20261102));
    expect(a.length % 6).toBe(0);
    expect(a.length / 6).toBeGreaterThan(500);
    for (let i = 0; i < a.length; i += 6) {
      const [ax, az, bx, bz, kind, t0] = a.slice(i, i + 6);
      expect(Math.hypot(bx - ax, bz - az)).toBeLessThanOrEqual(120.001);
      expect(Math.hypot(ax, az)).toBeLessThanOrEqual(Math.hypot(bx, bz) + 1e-9);
      expect([0, 1]).toContain(kind);
      // 光が届く秒：地平線の一点から広がり、いちばん遠い道にも、真下を向き始める前後（約2秒）には届く
      expect(t0).toBeGreaterThan(0);
      expect(t0).toBeLessThan(2.2);
    }
    // 大通り（金色）もある
    expect(a.filter((_, i) => i % 6 === 4 && a[i] === 1).length).toBeGreaterThan(20);
  });

  it("遠くの光の柱（高い建物）は 90 本、M より奥にある", () => {
    const t = city.towers(7);
    expect(t.length).toBe(90 * 4);
    for (let i = 0; i < t.length; i += 4) expect(t[i + 1]).toBeGreaterThan(0);
  });

  it("カメラは段の切り替わりで飛ばない（低く飛ぶ → 上がって真下を向く → M へ寄る）", () => {
    const near = (a: Pose, b: Pose) => {
      expect(Math.abs(a.phi - b.phi)).toBeLessThan(0.01);
      expect(Math.abs(a.h - b.h) / b.h).toBeLessThan(0.01);
      expect(Math.abs(a.cz - b.cz)).toBeLessThan(Math.max(2, Math.abs(b.cz) * 0.01));
      expect(Math.abs(a.px - b.px)).toBeLessThan(0.5);
      expect(Math.abs(a.py - b.py)).toBeLessThan(0.5);
      expect(Math.abs(a.roll - b.roll)).toBeLessThan(0.002);
    };
    near(city.pose(A1 - 1e-4, W, H, HF, MX, MY), city.pose(A1 + 1e-4, W, H, HF, MX, MY));
    near(city.pose(B1 - 1e-4, W, H, HF, MX, MY), city.pose(B1 + 1e-4, W, H, HF, MX, MY));
    // 低く飛ぶあいだは少し傾き、上がり始めるまでに水平に戻る
    expect(city.pose(0.2, W, H, HF, MX, MY).roll).toBeLessThan(-0.05);
    expect(city.pose(A1, W, H, HF, MX, MY).roll).toBe(0);
  });

  it("描き終わりのカメラは M の真上で真下を向き、画面のロゴのマークの中心に M の中心が来る", () => {
    const p = city.pose(B1, W, H, HF, MX, MY);
    expect(p.phi).toBeCloseTo(Math.PI / 2, 6);
    expect(p.h).toBeCloseTo(HF, 6);
    expect(p.cz).toBe(0);
    expect(p.v).toBe(1);
    expect(p.px).toBe(MX);
    expect(p.py).toBe(MY);
    // そのあとは M へ少し寄って止まる（街だけが広がる。M はロゴに入れ替わって消える）
    expect(city.pose(END, W, H, HF, MX, MY).h).toBeCloseTo(HF * 0.78, 6);
    expect(END).toBeCloseTo(B1 + DIVE, 9);
  });

  it("ロゴのマーク（M）の線は、ロゴの絵（802×159）の中にある", () => {
    for (const path of city.MARK) {
      for (const [x, y] of path) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(802 * 0.28);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(159);
      }
    }
  });

  it("時間割が CSS（app/globals.css）とそろっている：光の波は輪と同時、描き終わりは幕が上がる前", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const ring = css.match(/animation:\s*launch-ring\s+[\d.]+s\s+cubic-bezier\([^)]*\)\s+([\d.]+)s/);
    const lift = css.match(/\[data-grand\]\s+\.launch-veil\s*\{[^}]*animation:\s*launch-lift\s+[\d.]+s\s+cubic-bezier\([^)]*\)\s+([\d.]+)s/);
    const canvasLift = css.match(/animation:\s*launch-lift-canvas\s+[\d.]+s\s+cubic-bezier\([^)]*\)\s+([\d.]+)s/);
    expect(ring && lift && canvasLift).toBeTruthy();
    expect(WAVE_AT).toBeCloseTo(Number(ring![1]), 6);
    expect(Number(canvasLift![1])).toBe(Number(lift![1]));
    expect(END).toBeLessThan(Number(lift![1]));
    // 光の波は、描き終わる前に消えきる（止めた最後の絵に残らない）
    expect(WAVE_AT + WAVE_LEN).toBeLessThanOrEqual(END);
  });
});
