"use client";

// PC の「調査デスク」の小さな部品：重ねて開く画面の枠（見出し・閉じる・Esc）、進み具合の輪、ひとこと（トースト）、
// document.body に出す入れ物（今までのシート。.glass の backdrop-filter の中では fixed の基準がずれるため）
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/** document.body に出す（サーバーでは何も出さない） */
export function BodyPortal({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return client ? createPortal(children, document.body) : null;
}

/**
 * 重ねて開く画面の枠。開いたら見出しへフォーカスを移し、閉じたら開く前の所へ戻す。Esc で閉じる（入力中の文字の確定は除く）。
 * narrow は真ん中に細く（使い方・設定など）。wide は呼ぶ側がカルテを隠す
 */
export function Overlay({ title, hint, actions, onClose, narrow, children, label }: { title: string; hint?: ReactNode; actions?: ReactNode; onClose: () => void; narrow?: boolean; children: ReactNode; label?: string }) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    head.current?.focus({ preventScroll: true });
    return () => {
      // 開く前にフォーカスのあった所へ戻す（まだ画面にあれば）
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      // 今までのシート（document.body の上の dialog）が開いていれば、そちらが閉じる
      if (document.querySelector("body > [role=dialog], body > div > [role=dialog]")) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <section className={`desk-ov glass${narrow ? " narrow" : ""}`} role="dialog" aria-modal="false" aria-label={label ?? title}>
      <div className="desk-ov-head">
        <h2 ref={head} tabIndex={-1}>
          {title}
        </h2>
        <span className="hint">{hint}</span>
        {actions}
        <button type="button" className="btn ghost icon" onClick={onClose} aria-label={`${title}を閉じる`} title="閉じる（Esc）">
          <X size={18} strokeWidth={1.9} />
        </button>
      </div>
      <div className="desk-ov-body">{children}</div>
    </section>
  );
}

/** 進み具合の輪（done / total）。読み上げは文字で */
export function Ring({ done, total }: { done: number; total: number }) {
  const r = 23;
  const c = 2 * Math.PI * r;
  const f = total ? Math.min(1, done / total) : 0;
  return (
    <svg className="desk-ring" viewBox="0 0 56 56" aria-hidden>
      <circle className="bg" cx="28" cy="28" r={r} />
      <circle className="fg" cx="28" cy="28" r={r} strokeDasharray={c.toFixed(1)} strokeDashoffset={(c * (1 - f)).toFixed(1)} />
      <text x="28" y="32.5" textAnchor="middle">
        {total ? `${Math.round(f * 100)}%` : "—"}
      </text>
    </svg>
  );
}

export type Toast = { text: string; action?: { label: string; run: () => void } };

/** ひとこと（コピーした・比較に加えた・代わりの 3D にした など）。数秒で消える。読み上げにも伝える */
export function useToast(): [Toast | null, (t: Toast | string) => void, () => void] {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef(0);
  const show = useCallback((t: Toast | string) => {
    const v = typeof t === "string" ? { text: t } : t;
    setToast(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), v.action ? 5000 : 2600);
  }, []);
  const hide = useCallback(() => setToast(null), []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, show, hide];
}

export function ToastView({ toast, onHide }: { toast: Toast | null; onHide: () => void }) {
  return (
    <div role="status" aria-live="polite" className="contents">
      {toast && (
        <div className="desk-toast">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.run();
                onHide();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** クリップボードへ写す（できなければ選べる窓で出す）。写せたか */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("コピーしてください", text);
    return false;
  }
}
