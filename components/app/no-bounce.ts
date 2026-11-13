"use client";

// スマホの画面を固定する：中身が画面に収まっていても、スワイプで画面全体が動かないようにする。
// iPhone の Safari は、スクロールできない所を指で引っぱると画面全体が跳ねる（rubber band）。CSS の overscroll-behavior だけでは
// 止まらないことがあるので、touchmove を見張り、スクロールできる所（縦に動く一覧・横にすべらせるチップの列）が、その向きに
// まだ動けるときだけ通す。シートや全画面の地図は document.body に出すので document で見張る
// （MapLibre の地図は自分で touchmove を止めるので邪魔にならない。2本指のピンチは通す）
import { useEffect } from "react";

const SCROLL = new Set(["auto", "scroll"]);

/** その向きに動ける（true）・動けない端にいる（false）・スクロールする部品ではない（null） */
function canScroll(el: HTMLElement, dx: number, dy: number): boolean | null {
  const cs = getComputedStyle(el);
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (!SCROLL.has(cs.overflowY) || el.scrollHeight <= el.clientHeight + 1) return null;
    return dy > 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  }
  if (!SCROLL.has(cs.overflowX) || el.scrollWidth <= el.clientWidth + 1) return null;
  return dx > 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

/** スマホの画面が出ているあいだ、画面を固定する */
export function useFixedScreen(): void {
  useEffect(() => {
    let x0 = 0;
    let y0 = 0;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) {
        x0 = t.clientX;
        y0 = t.clientY;
      }
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !e.cancelable) return;
      const t = e.touches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (!dx && !dy) return;
      let el: HTMLElement | null = e.target instanceof Element ? (e.target as HTMLElement) : null;
      while (el && el !== document.body) {
        const r = canScroll(el, dx, dy);
        if (r === true) return;
        if (r === false) break;
        el = el.parentElement;
      }
      e.preventDefault();
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
    };
  }, []);
}
