"use client";

import { useState } from "react";

/** クリップボードへ書き込み、2秒だけ「コピーしました」を出す */
export function useCopy() {
  const [done, setDone] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      window.prompt("コピーしてください", text);
    }
  };
  return { done, copy };
}
