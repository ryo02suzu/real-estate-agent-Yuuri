"use client";

// ソフトキーボードが出ても、シートの中の入力欄が隠れないようにする（スマホ）。visualViewport で、キーボードに隠れている
// 画面の下の高さを測って返す（その分の空きを、動かす枠の最後に足す）。入力欄に触れたら、キーボードの上に見えるまで枠を動かす。
// visualViewport の無い端末では何もしない（ブラウザに任せる）
import { useEffect, useState, type RefObject } from "react";

/** 枠の中の入力欄を、キーボードの上に出す。返す値は、キーボードに隠れている高さ（px。枠の最後の空きにする） */
export function useKeyboardSafe(box: RefObject<HTMLElement | null>): number {
  const [hidden, setHidden] = useState(0);
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    const el = box.current;
    if (!vv || !el) return;
    let timer = 0;
    const reveal = () => {
      const a = document.activeElement;
      if (!(a instanceof HTMLElement) || !el.contains(a) || !a.matches("input, textarea")) return;
      const top = vv.offsetTop + 8;
      const bottom = vv.offsetTop + vv.height - 12;
      const r = a.getBoundingClientRect();
      // 高い欄（本文）は、全部は出せないので上の5行ほどが見えればよい
      const need = Math.min(r.bottom, r.top + 120);
      if (need > bottom) el.scrollTop += need - bottom;
      else if (r.top < top) el.scrollTop -= top - r.top;
    };
    const measure = () => {
      setHidden(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
      clearTimeout(timer);
      timer = window.setTimeout(reveal, 60);
    };
    // キーボードが上がりきってから（iPhone で約 0.3 秒）
    const onFocus = () => {
      clearTimeout(timer);
      timer = window.setTimeout(reveal, 320);
    };
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    el.addEventListener("focusin", onFocus);
    return () => {
      clearTimeout(timer);
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      el.removeEventListener("focusin", onFocus);
    };
  }, [box]);
  return hidden;
}
