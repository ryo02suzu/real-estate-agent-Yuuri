// 結果パネルの高さの段階（小・中・大）と、ドラッグ／ボタンでの移り方。
export type Snap = "small" | "medium" | "large";
const ORDER: Snap[] = ["small", "medium", "large"];

export const up = (s: Snap): Snap => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(s) + 1)];
export const down = (s: Snap): Snap => ORDER[Math.max(0, ORDER.indexOf(s) - 1)];

/** ドラッグの移動量(px。上向きが負)から次の段階を決める。短い動きは今の段階に戻す */
export function snapAfterDrag(current: Snap, dy: number, threshold = 40): Snap {
  if (dy <= -threshold) return up(current);
  if (dy >= threshold) return down(current);
  return current;
}

/** 段階ごとの高さ(CSS)。大は上の操作帯とセーフエリアを残す */
export const SNAP_HEIGHT: Record<Snap, string> = {
  small: "176px",
  medium: "54dvh",
  large: "calc(100dvh - 72px - env(safe-area-inset-top))",
};
