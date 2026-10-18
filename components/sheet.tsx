"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { CloseIcon } from "./icons";

/**
 * 中身が画面に入りきらなければ、data-dense を "1" → "2" と付けて詰める（globals.css の dense・denser。
 * 詰め方を書いた中身だけが詰まる）。読み込みで中身が変わったときや画面の向きを変えたときも測り直す
 */
function useDense(ref: React.RefObject<HTMLDivElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const fit = () => {
      for (const level of ["", "1", "2"]) {
        if (level) el.dataset.dense = level;
        else delete el.dataset.dense;
        if (el.scrollHeight <= el.clientHeight + 1) return;
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

/** 画面下から出るシート。背景タップと Esc で閉じる */
export function Sheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  useDense(body, open);
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

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="閉じる" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={body} className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl lg:max-w-lg lg:rounded-3xl lg:pb-6 bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 shadow-xl [@media(max-height:720px)]:pt-2">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden [@media(max-height:720px)]:mb-1" />
        <div className="mb-4 flex items-center justify-between [@media(max-height:720px)]:mb-2">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="閉じる" className="rounded-full p-2 text-muted hover:bg-mint">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
