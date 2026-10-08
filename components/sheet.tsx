"use client";

import { useEffect } from "react";
import { CloseIcon } from "./icons";

/** 画面下から出るシート。背景タップと Esc で閉じる */
export function Sheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
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
      <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl lg:max-w-lg lg:rounded-3xl lg:pb-6 bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 shadow-xl [@media(max-height:720px)]:pt-2">
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
