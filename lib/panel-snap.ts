// 結果パネルの高さの段階（小・中・大）と、ドラッグ／ボタンでの移り方。
export type Snap = "small" | "medium" | "large";
const ORDER: Snap[] = ["small", "medium", "large"];

export const up = (s: Snap): Snap => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(s) + 1)];
export const down = (s: Snap): Snap => ORDER[Math.max(0, ORDER.indexOf(s) - 1)];

/** 段階ごとの、いまの画面での実際の高さ(px)。ドラッグの始めに1回だけ測る（components/mobile-shell.tsx） */
export type SnapHeights = Record<Snap, number>;

/** これより短い指の動きは、ドラッグではなくタップとみなす(px) */
export const DRAG_SLOP = 6;
/** はじいたとみなす指の速さ(px/ms) */
export const FLICK_SPEED = 0.45;
/** 指を止めてからこの時間(ms)より後に離したら、はじいたことにしない */
export const FLICK_WINDOW_MS = 90;

/** ドラッグ中のパネルの高さ（指に追従）。dy は指の移動量(px。下向きが正)。小より低く・大より高くはしない */
export function dragHeight(startPx: number, dy: number, h: SnapHeights): number {
  return Math.round(Math.min(h.large, Math.max(h.small, startPx - dy)));
}

/** 指の縦の速さ(px/ms。下向きが正)。直近の動きを重く見る */
export function nextVelocity(prev: number, dy: number, dt: number): number {
  if (dt <= 0) return prev;
  return prev * 0.2 + (dy / dt) * 0.8;
}

/**
 * 指を離したときの段階。速くはじいたら、その向きで今の高さの次の段階（上へなら今より高い段階のうち一番低いもの）。
 * そうでなければ、離した高さに一番近い段階。velocity は指の縦の速さ(px/ms。上向きが負)、idleMs は最後に指が動いてからの時間
 */
export function snapAfterRelease(heightPx: number, velocity: number, idleMs: number, h: SnapHeights): Snap {
  const v = idleMs > FLICK_WINDOW_MS ? 0 : velocity;
  if (v <= -FLICK_SPEED) return ORDER.find((s) => h[s] > heightPx + 1) ?? "large";
  if (v >= FLICK_SPEED) return [...ORDER].reverse().find((s) => h[s] < heightPx - 1) ?? "small";
  let best: Snap = "small";
  for (const s of ORDER) if (Math.abs(h[s] - heightPx) < Math.abs(h[best] - heightPx)) best = s;
  return best;
}

/**
 * 詳細（結果パネルの中）を開く・閉じるときの段階。開くと読みやすい「大」にし、開く前の段階を覚えておいて、閉じたら戻す。
 * 詳細どうしの付け替え（開いたまま別の詳細へ）では動かさない。saved が空のまま閉じたら今の段階のまま
 */
export function snapForDetail(state: { snap: Snap; saved: Snap | null }, wasOpen: boolean, isOpen: boolean): { snap: Snap; saved: Snap | null } {
  if (isOpen && !wasOpen) return { snap: "large", saved: state.snap };
  if (!isOpen && wasOpen && state.saved) return { snap: state.saved, saved: null };
  return state;
}

const SMALL_PX = 176;
const MEDIUM_PERCENT = 54;
/** 大のとき、パネルの上に残す操作帯（ロゴ・メニュー）の高さ */
const TOP_RESERVE_PX = 72;

/** 段階ごとの高さ(CSS)。大は上の操作帯とセーフエリアを残す */
export const SNAP_HEIGHT: Record<Snap, string> = {
  small: `${SMALL_PX}px`,
  medium: `${MEDIUM_PERCENT}dvh`,
  large: `calc(100dvh - ${TOP_RESERVE_PX}px - env(safe-area-inset-top))`,
};

/**
 * 段階ごとの高さ(px)の見込み（vh: 画面の高さ）。パネルが動き終わる前から、地図の中心をずらす量
 * （ピンがパネルに隠れないように）を決めるのに使う。大はセーフエリアの分を含まない近似
 */
export function snapPx(s: Snap, vh: number): number {
  if (s === "small") return SMALL_PX;
  if (s === "medium") return Math.round((vh * MEDIUM_PERCENT) / 100);
  return Math.max(SMALL_PX, Math.round(vh - TOP_RESERVE_PX));
}
