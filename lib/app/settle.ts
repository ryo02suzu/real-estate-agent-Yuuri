// 指で動かしたものを離したあとの止まり方（スマホの履歴のページの行をなぞる操作。components/app/history.tsx）。
// 離したときの速さを引き継いで動き出し、なめらかに止まる長さと曲線を決める（CSS の transition に渡す）。
/** 離したあとの止まり方（長さと曲線） */
export type Settle = { dur: number; ease: string };
/**
 * 指を離したときの速さを引き継いで止まる動き。いまの位置 from から to へ、離した速さ v（pt/ms。左がマイナス）で動き出し、なめらかに止まる。
 * 曲線の出だしの傾き（y1/x1）が、離した速さと同じになるようにする（速く払うほど短く、ゆっくり離すといつもの止まり方）
 */
export function settleFrom(from: number, to: number, v: number): Settle | null {
  const dist = Math.abs(to - from);
  const speed = Math.abs(v) * 1000;
  if (dist < 1 || speed < 60 || Math.sign(to - from) !== Math.sign(v)) return null;
  const dur = Math.min(0.38, Math.max(0.16, (2.8 * dist) / speed));
  const x1 = 0.22;
  const y1 = Math.min(1, ((speed * dur) / dist) * x1);
  return { dur, ease: `cubic-bezier(${x1}, ${y1.toFixed(3)}, 0.25, 1)` };
}
