import { describe, expect, it } from "vitest";
import { settleFrom } from "./settle";

// 曲線の出だしの傾き（y1/x1）を取り出す
const slope = (ease: string) => {
  const [x1, y1] = ease.replace(/^cubic-bezier\(|\)$/g, "").split(",").map(Number);
  return y1 / x1;
};

describe("離したあとの止まり方（離した速さを引き継ぐ）", () => {
  it("止まる先へ向かって払ったときだけ、速さに合わせる（ゆっくり・反対向き・もう着いているときは、いつもの止まり方）", () => {
    expect(settleFrom(-90, -156, -0.5)).not.toBeNull();
    expect(settleFrom(-90, -156, -0.02)).toBeNull();
    expect(settleFrom(-90, -156, 0.5)).toBeNull();
    expect(settleFrom(-156, -156, -0.5)).toBeNull();
  });

  it("出だしの速さが、離したときの指の速さと同じになる", () => {
    const from = -90;
    const to = -156;
    const v = -0.5; // pt/ms（左へ 500pt/秒）
    const s = settleFrom(from, to, v)!;
    // 出だしの速さ（pt/秒）＝ 傾き × 距離 ÷ 長さ
    const start = (slope(s.ease) * Math.abs(to - from)) / s.dur;
    expect(start).toBeCloseTo(500, -1);
  });

  it("速く払うほど短く止まる（0.16〜0.38 秒の間）", () => {
    const fast = settleFrom(-60, -156, -2)!;
    const slow = settleFrom(-60, -156, -0.15)!;
    expect(fast.dur).toBeLessThan(slow.dur);
    expect(fast.dur).toBeGreaterThanOrEqual(0.16);
    expect(slow.dur).toBeLessThanOrEqual(0.38);
  });
});
