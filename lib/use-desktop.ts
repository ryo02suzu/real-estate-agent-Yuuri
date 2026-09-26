"use client";

import { useSyncExternalStore } from "react";

// 横幅 1024px 以上（PC・横向きのタブレット）なら PC 用の画面にする
const QUERY = "(min-width: 1024px)";

export function useDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
