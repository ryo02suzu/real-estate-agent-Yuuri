// スマホの新UIの動きの決まり（app/globals.css の --mui-* と同じ値。lib/motion.test.ts で一致を確かめる）。
// パネル（CSS の transition）と地図のカメラ（MapLibre の easeTo）に同じ長さ・同じ減速を使い、
// パネルが動くときに地図の注目地点が別の速さで動いて「ずれて見える」ことを無くす。

/** パネルの段階の動き(ms)。CSS の --mui-dur-panel と同じ */
export const PANEL_MS = 300;
/** 減速カーブ。CSS の --mui-ease（cubic-bezier(0.22, 1, 0.36, 1)）と同じ */
export const EASE_OUT: readonly [number, number, number, number] = [0.22, 1, 0.36, 1];
/** 日本全体 → 地点のカメラの動き(ms)。仕様の目安 900〜1400ms */
export const CAMERA_MS = 1300;

/**
 * CSS の cubic-bezier(x1, y1, x2, y2) と同じ形の関数（時間の割合 0〜1 → 進み具合 0〜1）。
 * MapLibre の easing に渡し、CSS の transition と同じ減速で地図を動かす
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  /** x（時間の割合）に当たる曲線の媒介変数 t。ニュートン法で速く求め、収束しなければ二分法 */
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-7) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-7) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solve(x)));
}

/** パネルと同じ減速（--mui-ease） */
export const easeOut = cubicBezier(...EASE_OUT);
