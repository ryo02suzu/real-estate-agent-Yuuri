"use client";

import { useSyncExternalStore } from "react";

// 横幅 1024px 以上（PC・横向きのタブレット）なら PC 用の画面にする
const QUERY = "(min-width: 1024px)";

// 印刷のあいだは紙の幅で判定が変わり、画面が組み替わって（都市計画などを読み直して）読み込み中の表示が印刷されてしまう。
// 印刷の前後（beforeprint〜afterprint）は判定を変えない
let printing = false;
let last = false;
const snapshot = () => {
  if (!printing) last = window.matchMedia(QUERY).matches;
  return last;
};

export function useDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(QUERY);
      const before = () => {
        printing = true;
      };
      const after = () => {
        printing = false;
        cb();
      };
      mq.addEventListener("change", cb);
      window.addEventListener("beforeprint", before);
      window.addEventListener("afterprint", after);
      return () => {
        mq.removeEventListener("change", cb);
        window.removeEventListener("beforeprint", before);
        window.removeEventListener("afterprint", after);
      };
    },
    snapshot,
    () => false,
  );
}
