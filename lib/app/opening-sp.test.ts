import { describe, expect, it } from "vitest";
import logo from "./opening-logo.json";
import { SP_OPENING, spBars, spCover, spLogoBox, spLogoFrame, spPoint, spRise } from "./opening-sp";

/** スマホの画面（CSS の画素）と、上のカメラ部分・時刻の帯の高さ（safe-area-inset-top のおおよそ） */
const PHONES: [string, number, number, number][] = [
  ["iPhone SE", 375, 667, 20],
  ["iPhone 13 mini", 375, 812, 50],
  ["iPhone 14", 390, 844, 47],
  ["iPhone 15・16", 393, 852, 59],
  ["iPhone 15 Pro Max", 430, 932, 59],
  ["Android（細長い）", 360, 800, 24],
  ["Android（大きい）", 412, 915, 24],
];

describe("映像を画面いっぱいに置く（真ん中で切る）", () => {
  it("今のスマホ（19.5:9）では、ほとんど切らない", () => {
    const c = spCover(393, 852);
    expect(Math.abs(c.x)).toBeLessThan(2);
    expect(Math.abs(c.y)).toBeLessThan(2);
  });
  it("古い 16:9 の機種では上下を同じだけ切り、太陽（山頂）は画面に入る", () => {
    const c = spCover(375, 667);
    expect(c.x).toBeCloseTo(0, 5);
    expect(c.y).toBeLessThan(0);
    const sun = spPoint(375, 667, SP_OPENING.sun.x, SP_OPENING.sun.y);
    expect(sun.y).toBeGreaterThan(0.2 * 667);
    expect(sun.y).toBeLessThan(0.6 * 667);
  });
});

describe("映画の横長の帯", () => {
  it("雲の中の間は、真ん中に幅 / 2.39 の帯だけを見せる", () => {
    const bar = spBars(1.0, 393, 852);
    expect(852 - 2 * bar).toBeCloseTo(393 / 2.39, 3);
  });
  it("雲海を抜ける瞬間に開き、開ききると帯は無い（だんだん開く）", () => {
    const [a, b] = SP_OPENING.bars.open;
    let prev = spBars(a, 393, 852);
    for (let t = a + 0.05; t <= b; t += 0.05) {
      const now = spBars(t, 393, 852);
      expect(now).toBeLessThanOrEqual(prev + 1e-9);
      prev = now;
    }
    expect(spBars(b, 393, 852)).toBe(0);
    expect(spBars(SP_OPENING.duration, 393, 852)).toBe(0);
  });
});

describe("ロゴの置き場所（富士の上の空）", () => {
  it.each(PHONES)("%s：画面の中で、上のカメラ部分・時刻の帯にかからず、山頂より上", (_name, w, h, safeTop) => {
    const b = spLogoBox(w, h);
    expect(b.left).toBeGreaterThan(0);
    expect(b.left + b.width).toBeLessThan(w);
    expect(b.top).toBeGreaterThan(safeTop + 40);
    const sun = spPoint(w, h, SP_OPENING.sun.x, SP_OPENING.sun.y);
    expect(b.top + b.height).toBeLessThan(sun.y - 20);
    // ロゴは読める大きさ（画面の幅の 6 割以上）
    expect(b.width / w).toBeGreaterThan(0.6);
  });
});

describe("山頂の太陽から昇る光の点", () => {
  const [a, b] = SP_OPENING.rise;
  it("昇り始めは太陽の所、着くのはロゴの光の点の所", () => {
    const s = spRise(a);
    expect(s.x).toBeCloseTo(SP_OPENING.sun.x, 3);
    expect(s.y).toBeCloseTo(SP_OPENING.sun.y, 3);
    const e = spRise(b);
    const bw = SP_OPENING.logo.w;
    const bh = (bw * logo.height) / logo.width;
    expect(e.x).toBeCloseTo(SP_OPENING.logo.cx - bw / 2 + logo.star[0] * bw, 3);
    expect(e.y).toBeCloseTo(SP_OPENING.logo.cy - bh / 2 + logo.star[1] * bh, 3);
  });
  it("昇る前と、ロゴの光の点に入れ替わったあとは見せない", () => {
    expect(spRise(a - 0.1).opacity).toBe(0);
    expect(spRise(b + 0.3).opacity).toBe(0);
    expect(spRise((a + b) / 2).opacity).toBeGreaterThan(0.5);
  });
});

describe("ロゴの出し方（PC と同じ。縦の画面用に速く）", () => {
  it("光の点がまたたくまでは、何も見せない", () => {
    const f = spLogoFrame(SP_OPENING.logoStart - 0.2);
    expect(f.star.opacity).toBe(0);
    expect(f.letters.every((l) => l.opacity === 0)).toBe(true);
  });
  it("映像が終わる前に出しきり、終わりまでそのまま（消すのはホームへ溶けるとき）", () => {
    const formed = SP_OPENING.logoStart + 3.1 / SP_OPENING.logoSpeed;
    expect(formed).toBeLessThan(SP_OPENING.duration);
    for (const t of [formed, SP_OPENING.duration]) {
      const f = spLogoFrame(t);
      expect(f.all).toBe(1);
      expect(f.letters.every((l) => l.opacity > 0.999)).toBe(true);
      expect(f.mountain).toBeGreaterThan(logo.mountain[1]);
      expect(f.glint.opacity).toBe(0);
    }
  });
});
