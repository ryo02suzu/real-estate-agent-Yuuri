import { describe, expect, it } from "vitest";
import logo from "./opening-logo.json";
import { arcMask, coverRect, ease, glintMask, logoBox, logoFrame, OPENING, OPENING_BIG_SCREEN, shouldPlayOpening, sweepMask } from "./opening";

const base = { reduced: false, motion: true, deepLink: false, played: false, off: false };

describe("shouldPlayOpening", () => {
  it("はじめて開いた PC で、動きの設定がオンなら流す", () => {
    expect(shouldPlayOpening(base)).toBe(true);
  });
  it("動きを減らす設定・物件のリンク・このタブで流した・流さない設定・通信量を減らす・裏のタブでは流さない", () => {
    expect(shouldPlayOpening({ ...base, reduced: true })).toBe(false);
    expect(shouldPlayOpening({ ...base, motion: false })).toBe(false);
    expect(shouldPlayOpening({ ...base, deepLink: true })).toBe(false);
    expect(shouldPlayOpening({ ...base, played: true })).toBe(false);
    expect(shouldPlayOpening({ ...base, off: true })).toBe(false);
    expect(shouldPlayOpening({ ...base, saveData: true })).toBe(false);
    expect(shouldPlayOpening({ ...base, hidden: true })).toBe(false);
  });
});

describe("映像を画面いっぱいに置く", () => {
  it("16:9 の画面では、そのまま拡大する", () => {
    expect(coverRect(1920, 1080)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(coverRect(3840, 2160).scale).toBe(2);
  });
  it("横長の画面では上下を切り（上を多く残す）、縦長の画面では左右を切る", () => {
    const wide = coverRect(2560, 1080);
    expect(wide.x).toBeCloseTo(0);
    expect(wide.y).toBeLessThan(0);
    const cut = 1080 * wide.scale - 1080;
    expect(-wide.y).toBeLessThan(cut / 2);
    const tall = coverRect(1440, 1080);
    expect(tall.y).toBeCloseTo(0);
    expect(tall.x).toBeLessThan(0);
  });
  it("ロゴの箱は、映像の中の決まった所（穂高の稜線の上の空）で、どの画面でも切れない", () => {
    // 画面そのものの大きさと、ブラウザーの枠で縦が縮んだ窓（1920×1080 の画面・拡大 125%・150% のノート PC など）
    for (const [w, h] of [
      [1024, 640],
      [1440, 900],
      [1440, 790],
      [1920, 1080],
      [1920, 940],
      [1536, 730],
      [1280, 590],
      [2560, 1080],
      [1366, 1024],
    ]) {
      const b = logoBox(w, h);
      expect(b.left).toBeGreaterThan(0);
      expect(b.top).toBeGreaterThan(h * 0.03);
      expect(b.left + b.width).toBeLessThan(w);
      expect(b.top + b.height).toBeLessThan(h * 0.6);
      expect(b.height / b.width).toBeCloseTo(logo.height / logo.width, 3);
    }
  });
});

describe("ロゴの出し方（朝日の光から生まれる）", () => {
  const s = OPENING.logoStart;
  it("光の点がまたたくまでは、何も見せない", () => {
    const f = logoFrame(s - 0.5);
    expect(f.star.opacity).toBe(0);
    expect(f.arc.on).toBe(false);
    expect(f.letters.every((l) => l.opacity === 0)).toBe(true);
    expect(f.mountain).toBeLessThan(logo.mountain[0]);
    expect(f.wave).toBeLessThan(logo.wave[0]);
  });
  it("円弧は、光の点から両側へ描かれ、最後は元の円弧の全部になる", () => {
    const early = logoFrame(s + 0.5);
    expect(early.arc.from).toBeLessThan(logo.starAngle);
    expect(early.arc.to).toBeGreaterThan(logo.starAngle);
    const done = logoFrame(s + 1.2);
    expect(done.arc.from).toBeCloseTo(logo.arcFrom);
    expect(done.arc.to).toBeCloseTo(logo.arcTo);
  });
  it("文字は朝日の側（左）から 1 字ずつ、ぼけた所からピントが合う", () => {
    const f = logoFrame(s + 1.3);
    const o = f.letters.map((l) => l.opacity);
    for (let i = 1; i < o.length; i++) expect(o[i]).toBeLessThanOrEqual(o[i - 1]);
    expect(f.letters[0].blur).toBeLessThan(f.letters[6].blur);
    const all = logoFrame(s + 2.3);
    expect(all.letters.every((l) => l.opacity === 1 && l.blur === 0)).toBe(true);
  });
  it("出しきると、元のロゴと同じ（山・波は右の端まで、光の帯は終わっている）", () => {
    const f = logoFrame(s + 3.2);
    expect(f.mountain).toBeGreaterThan(logo.mountain[1]);
    expect(f.wave).toBeGreaterThan(logo.wave[1]);
    expect(f.glint.opacity).toBe(0);
    expect(f.all).toBe(1);
  });
  it("最後は白い雲へ溶けて消える", () => {
    expect(logoFrame(OPENING.logoOut[1]).all).toBe(0);
    expect(logoFrame(OPENING.logoOut[1]).backdrop).toBe(0);
    expect(OPENING.logoOut[1]).toBeLessThanOrEqual(OPENING.duration);
  });
});

describe("映像の選び方", () => {
  it("大きい画面・細かい画面だけ 2560×1440 を選び、ほかの映像は画面を問わない（一番下の H.264 はいつでも選べる）", () => {
    const [big, ...rest] = OPENING.sources;
    expect(big.media).toBe(OPENING_BIG_SCREEN);
    expect(rest.every((s) => s.media === undefined)).toBe(true);
    expect(OPENING.sources.at(-1)?.type).toMatch(/^video\/mp4; codecs="avc1\./);
  });
  it("映像を作り直したときに変える印（?v=）は、全部の映像で同じ", () => {
    const v = new Set(OPENING.sources.map((s) => new URL(s.src, "https://x").searchParams.get("v")));
    expect(v.size).toBe(1);
    expect([...v][0]).toMatch(/^\d{8,}$/);
  });
});

describe("mask の文字列", () => {
  it("円弧・左から・光の帯の mask を作る", () => {
    expect(arcMask(-60, -20)).toMatch(/^conic-gradient\(from 28\.00deg at /);
    expect(sweepMask(0.5)).toBe("linear-gradient(90deg, #000 46.00%, transparent 50.00%)");
    expect(glintMask(0.3)).toBe("linear-gradient(100deg, transparent 20.00%, #000 30.00%, transparent 40.00%)");
  });
  it("ease は 0 から 1 へ、範囲の外は止まる", () => {
    expect(ease(-1, 0, 1)).toBe(0);
    expect(ease(2, 0, 1)).toBe(1);
    expect(ease(0.5, 0, 1)).toBeCloseTo(0.5);
  });
});
