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
