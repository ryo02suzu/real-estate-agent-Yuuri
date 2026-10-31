"use client";

// 一時的に重なる画面（下から出るシート・全画面の地図・地図で選ぶ画面）の、フォーカスと背景の扱い（lib/modal-stack.ts）。
// - 開いたら、画面そのもの（tabIndex=-1）にフォーカスを移す。マウスで開いたときにフォーカスの枠が出ないよう、ボタンではなく画面に移す
// - Esc は、いちばん上の画面だけが閉じる（日本語入力の変換中の Esc では閉じない）
// - 閉じたら、開いた元の部品へフォーカスを戻す（元が無くなっていれば戻さない）
// - スマホ（1024px 未満）だけ：Tab・Shift+Tab は画面の中をひと回り（外へ出さない）、背景は inert（キーボード・読み上げで触れない。
//   指では背景を覆う「閉じる」の面が受ける）。PC は一部のシートが左のパネルの中だけに出て、地図などはそのまま使える作りなので、
//   PC の操作を変えないよう、閉じ込めと inert はしない
// 常に出ている結果パネルには使わない。
import { useEffect, useRef } from "react";
import { backgroundOf, createModalStack, trapStep } from "@/lib/modal-stack";

const modals = createModalStack<HTMLElement>();

/** いま開いている一時的な画面の数（端末の「戻る」で、いちばん上を閉じるのに使う。app/page.tsx） */
export const openModalCount = () => modals.size();
/** いちばん上の一時的な画面を閉じる。閉じたら true */
export function closeTopModal(): boolean {
  const top = modals.top();
  if (!top) return false;
  top.close();
  return true;
}
export const subscribeModals = (fn: () => void) => modals.subscribe(fn);

const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,iframe,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

/** スマホの画面か（PC は閉じ込めと inert をしない） */
const phone = () => !window.matchMedia("(min-width: 1024px)").matches;

/** このモジュールが inert にした要素（いちばん上の画面が替わるたびに付け直す） */
let inerted: HTMLElement[] = [];
function applyInert() {
  for (const e of inerted) e.inert = false;
  inerted = [];
  const top = modals.top();
  if (!top || !top.el.isConnected || !phone()) return;
  for (const e of backgroundOf<Element>(top.el, document.body)) {
    if (e instanceof HTMLElement && !e.inert) {
      e.inert = true;
      inerted.push(e);
    }
  }
}

/** 画面の中で Tab で移れる部品（表示順）。tabIndex が負のもの（背景の暗い面など）・見えないもの・inert の中は除く */
function focusables(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.tabIndex >= 0 && !n.closest("[inert]") && n.getClientRects().length > 0);
}

/**
 * ref の要素を一時的な画面として扱う。open の間だけ有効。要素には tabIndex={-1} を付ける（画面そのものにフォーカスを移すため）
 */
export function useModal(ref: React.RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });

  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const id = modals.push(el, () => latest.current());
    applyInert();
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (!modals.isTop(id)) return;
      if (e.key === "Escape") {
        // 日本語入力の変換中（Safari は keyCode 229）の Esc は、変換の取り消しなので閉じない
        if (e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        latest.current();
        return;
      }
      if (e.key !== "Tab" || !phone()) return;
      const items = focusables(el);
      const now = document.activeElement;
      const next = trapStep(items.length, now instanceof HTMLElement ? items.indexOf(now) : -1, e.shiftKey);
      if (next === null) return;
      e.preventDefault();
      (next < 0 ? el : items[next]).focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const wasTop = modals.isTop(id);
      modals.remove(id);
      applyInert();
      // 開いた元へフォーカスを戻す（いちばん上の画面が閉じたときだけ。元が消えた・背景のままなら戻さない）
      if (wasTop && opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
