import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAMERA_MS, cubicBezier, EASE_OUT, easeOut, PANEL_MS } from "./motion";

const css = readFileSync(join(__dirname, "..", "app/globals.css"), "utf8");
/** reduced-motion の上書きより前（:root の通常の値） */
const base = css.slice(0, css.indexOf("@media (prefers-reduced-motion: reduce)"));

describe("動きの決まり（CSS と地図のカメラで同じ値）", () => {
  it("パネルの長さは CSS の --mui-dur-panel と同じ", () => {
    expect(base).toMatch(new RegExp(`--mui-dur-panel:\\s*${PANEL_MS}ms;`));
  });

  it("減速カーブは CSS の --mui-ease と同じ", () => {
    const m = base.match(/--mui-ease:\s*cubic-bezier\(([^)]+)\);/);
    expect(m).not.toBeNull();
    expect(m![1].split(",").map((s) => Number(s.trim()))).toEqual([...EASE_OUT]);
  });

  it("日本全体 → 地点のカメラは仕様の目安（900〜1400ms）の中", () => {
    expect(CAMERA_MS).toBeGreaterThanOrEqual(900);
    expect(CAMERA_MS).toBeLessThanOrEqual(1400);
  });
});

describe("cubicBezier（CSS の cubic-bezier と同じ形）", () => {
  it("始まりは 0、終わりは 1。範囲の外は丸める", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(-0.5)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });

  it("進み具合は戻らない（単調に増える）", () => {
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = easeOut(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it("減速：前半で大きく進み、終わりはゆっくり", () => {
    expect(easeOut(0.25)).toBeGreaterThan(0.6);
    expect(easeOut(0.5)).toBeGreaterThan(0.85);
    expect(1 - easeOut(0.9)).toBeLessThan(0.01);
  });

  it("直線（linear）は時間どおり、ease-in-out は中央で半分", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const t of [0.1, 0.33, 0.5, 0.8]) expect(linear(t)).toBeCloseTo(t, 5);
    expect(cubicBezier(0.42, 0, 0.58, 1)(0.5)).toBeCloseTo(0.5, 5);
  });

  it("CSS の ease（0.25, 0.1, 0.25, 1）の既知の値に合う", () => {
    // ブラウザの実装（WebKit の UnitBezier）と同じ計算で、x=0.5 のとき約 0.8024
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });
});
