"use client";

import { useSyncExternalStore } from "react";
import { pdfViewerOf, type PdfViewer, type ViewSize } from "./roadmap/sheet-pdf";

// PDF の図を物件の場所を真ん中にして開くための、ブラウザの PDF ビューアと窓の大きさ（PC の地図ボタン。lib/roadmap/sheet-pdf.ts）。
// 窓の大きさが変わったら作り直す。サーバー（静的に書き出すとき）では null
const snapshot = () => `${pdfViewerOf(navigator.userAgent) ?? ""}|${window.innerWidth}|${window.innerHeight}`;

function subscribe(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

export function usePdfView(): { viewer: PdfViewer; size: ViewSize } | null {
  const key = useSyncExternalStore(subscribe, snapshot, () => "");
  const [viewer, width, height] = key.split("|");
  return viewer ? { viewer: viewer as PdfViewer, size: { width: Number(width), height: Number(height) } } : null;
}
