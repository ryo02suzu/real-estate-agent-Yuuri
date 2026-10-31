"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { webglAvailable } from "@/lib/map-style";
import { MapIllustration } from "./illustrations";
import type { StageApi } from "./japan-map";

export type { StageApi };

// MapLibre GL は、スマホのホームを開いたときにだけ読み込む
const JapanMap = dynamic(() => import("./japan-map"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-mint" />,
});

/** スマホのホームの背景（日本地図）。WebGL が使えない端末は静かな絵に替え、動かさずに結果へ進む */
export function StageMap({ onReady }: { onReady: (api: StageApi | null) => void }) {
  // null: 確認前（サーバー描画・PC では何も読み込まない）
  const [mode, setMode] = useState<"map" | "fallback" | null>(null);
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    const ok = webglAvailable();
    if (!ok) onReady(null);
    queueMicrotask(() => setMode(ok ? "map" : "fallback"));
  }, [onReady]);

  if (mode === "map") {
    return (
      <JapanMap
        onReady={onReady}
        onFail={() => {
          onReady(null);
          setMode("fallback");
        }}
      />
    );
  }
  return (
    <div className="absolute inset-0 bg-mint" aria-hidden>
      {mode === "fallback" && <MapIllustration className="absolute inset-x-0 top-1/3 h-1/2 w-full opacity-70" />}
    </div>
  );
}
