"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useDesktop } from "@/lib/use-desktop";
import { CloseIcon } from "./icons";
import { PanelDetail, usePanelDetail } from "./panel-detail";

/**
 * 中身が画面に入りきらなければ、data-dense を "1" → "2" → "3" と付けて詰める（globals.css の dense・denser・densest。
 * 詰め方を書いた中身だけが詰まる。"3" ではシートを画面の上近くまで伸ばす）。読み込みで中身が変わったときや画面の向きを変えたときも測り直す。
 * PC（1024px 以上）だけ。スマホは詰めず、シートの中でスクロールして読む
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

/**
 * 画面下から出るシート。背景タップと Esc で閉じる。
 * detail：結果の項目の詳細。スマホの結果パネルの中なら、シートではなくパネルの中（一覧の代わり）に出す（components/panel-detail.tsx）
 */
export function Sheet({ title, open, onClose, children, detail }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; detail?: boolean }) {
  const panel = usePanelDetail();
  if (detail && panel) {
    return (
      <PanelDetail api={panel} title={title} open={open} onClose={onClose}>
        {children}
      </PanelDetail>
    );
  }
  return (
    <ModalSheet title={title} open={open} onClose={onClose}>
      {children}
    </ModalSheet>
  );
}

function ModalSheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const desktop = useDesktop();
  useDense(body, open && desktop);
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
      <div ref={body} className="relative max-h-[92dvh] w-full data-[dense=3]:max-h-[calc(100dvh_-_max(24px,env(safe-area-inset-top)_+_8px))] max-w-md overflow-y-auto rounded-t-3xl lg:max-w-lg lg:rounded-3xl lg:pb-6 bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 shadow-xl short:pt-2">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden short:mb-1 densest:mb-0.5" />
        <div className="mb-4 flex items-center justify-between short:mb-2 densest:mb-0.5">
          <h2 className="text-lg font-bold text-ink densest:text-base">{title}</h2>
          <button onClick={onClose} aria-label="閉じる" className="rounded-full p-2 text-muted hover:bg-mint">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
