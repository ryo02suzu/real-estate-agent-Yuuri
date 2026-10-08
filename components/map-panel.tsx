"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { webglAvailable } from "@/lib/map-style";
import type { LiveMapProps } from "./live-map";

// MapLibre GL（約1MB）は、動く地図を出すときにだけ読み込む
const LiveMap = dynamic(() => import("./live-map"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-mint" />,
});

/** 動く地図。WebGL が使えない端末では fallback（静的なプレビューなど）を出す */
export function MapPanel({ fallback, ...props }: Omit<LiveMapProps, "onFail"> & { fallback: React.ReactNode }) {
  const [ok, setOk] = useState(() => typeof document !== "undefined" && webglAvailable());
  if (!ok) return <>{fallback}</>;
  return <LiveMap {...props} onFail={() => setOk(false)} />;
}
