"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";

/**
 * 中身が画面に入りきらなければ、data-dense を "1" → "2" → "3" と付けて詰める（globals.css の dense・denser・densest。
 * 詰め方を書いた中身だけが詰まる。"3" ではシートを画面の上近くまで伸ばす）。読み込みで中身が変わったときや画面の向きを変えたときも測り直す
 */
function useDense(ref: React.RefObject<HTMLDivElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const fit = () => {
      for (const level of ["", "1", "2", "3"]) {
        if (level) el.dataset.dense = level;
        else delete el.dataset.dense;
        if (el.scrollHeight <= el.clientHeight) return;
      }
    };
    fit();
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    const ro = new ResizeObserver(later);
    for (const c of el.children) ro.observe(c);
    addEventListener("resize", later);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      removeEventListener("resize", later);
    };
  });
}

const phone = () => typeof matchMedia !== "undefined" && matchMedia("(max-width: 1023px)").matches;
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** 閉じる動きの長さ（app/globals.css の sheet-up の reverse と同じ） */
const OUT_MS = 240;
/** 指で下にすべらせて閉じる：この距離（px）か速さ（px/ms）を超えたら閉じる */
const SWIPE_CLOSE_PX = 90;
const SWIPE_CLOSE_V = 0.6;

/**
 * 画面下から出るシート。背景タップと Esc で閉じる。
 * スマホでは下から上がって現れ（320ms）、閉じるときは下へ戻る（240ms）。つまみ・見出しを下に引くか、中身をいちばん上まで
 * 戻してから下に引くと閉じられる（app/globals.css の .sheet-*）。PC は今までどおり（動かさない）
 */
export function Sheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLButtonElement>(null);
  // 閉じるときは、閉じる動きが終わるまで残す（スマホだけ。指ですべらせて閉じたときは、もう下にあるので残さない）
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  // 指ですべらせて閉じたときは true（閉じる動きを付けない）
  const [swiped, setSwiped] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setClosing(false);
    else if (phone() && !reduced() && !swiped) setClosing(true);
    if (swiped) setSwiped(false);
  }
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => setClosing(false), OUT_MS);
    return () => clearTimeout(t);
  }, [closing]);
  const shown = open || closing;
  useDense(body, shown);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // 指で下にすべらせて閉じる（スマホだけ）。つまみ・見出しからはいつでも、中身からはいちばん上にあるときだけ
  useEffect(() => {
    const el = body.current;
    if (!open || !el || !phone()) return;
    let y0 = 0;
    let dy = 0;
    let t0 = 0;
    let dragging = false;
    let grip = false;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      y0 = e.touches[0].clientY;
      t0 = performance.now();
      dy = 0;
      dragging = false;
      grip = !!(e.target as Element | null)?.closest?.("[data-sheet-grip]");
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const d = e.touches[0].clientY - y0;
      if (!dragging) {
        if (d > 6 && (grip || el.scrollTop <= 0)) {
          dragging = true;
          el.dataset.drag = "1";
          delete el.dataset.settle;
        } else return;
      }
      dy = Math.max(0, d);
      el.style.transform = `translateY(${dy}px)`;
      if (dim.current) dim.current.style.opacity = String(Math.max(0, 1 - dy / Math.max(1, el.clientHeight)));
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      delete el.dataset.drag;
      const v = dy / Math.max(1, performance.now() - t0);
      el.dataset.settle = "1";
      if (dy > SWIPE_CLOSE_PX || v > SWIPE_CLOSE_V) {
        // もう下にあるので、閉じる動きは付けずにそのまま下へ
        setSwiped(true);
        el.style.transform = "translateY(110%)";
        if (dim.current) dim.current.style.opacity = "0";
        setTimeout(onClose, reduced() ? 0 : 180);
      } else {
        el.style.transform = "";
        if (dim.current) dim.current.style.opacity = "";
        setTimeout(() => delete el.dataset.settle, 220);
      }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [open, onClose]);

  if (!shown) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label={title} data-state={closing ? "closing" : "open"}>
      <button ref={dim} aria-label="閉じる" className="sheet-backdrop absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={body}
        className="sheet-panel relative max-h-[92dvh] w-full data-[dense=3]:max-h-[calc(100dvh_-_max(24px,env(safe-area-inset-top)_+_8px))] max-w-md overflow-y-auto overscroll-y-contain rounded-t-3xl lg:max-w-lg lg:rounded-3xl lg:pb-6 bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 shadow-xl [@media(max-height:720px)]:pt-2"
      >
        <div data-sheet-grip className="-mx-5 -mt-4 px-5 pt-4 [@media(max-height:720px)]:-mt-2 [@media(max-height:720px)]:pt-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden [@media(max-height:720px)]:mb-1 densest:mb-0.5" />
          <div className="mb-4 flex items-center justify-between [@media(max-height:720px)]:mb-2 densest:mb-0.5">
            <h2 className="text-lg font-bold text-ink densest:text-base">{title}</h2>
            <button onClick={onClose} aria-label="閉じる" className="rounded-full p-2 text-muted hover:bg-mint">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
