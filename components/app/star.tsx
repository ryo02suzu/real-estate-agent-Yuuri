"use client";

// お気に入りの星。保存できて on になった瞬間だけ、1 → 1.25 → 1 に弾んで薄い輪が広がる（app/globals.css の .star-pop・.star-ring、360ms）。
// 外すときは弾まない（色が戻るだけ）。保存に失敗したときは on にならないので、動かない
import { Star } from "lucide-react";
import { useState } from "react";
import { STAR } from "./tokens";

export function FavStar({ on, size = 20, off = "#a3adbd", stroke = 1.8 }: { on: boolean; size?: number; /** 外れているときの線の色 */ off?: string; stroke?: number }) {
  const [prev, setPrev] = useState(on);
  const [pop, setPop] = useState(0);
  if (on !== prev) {
    setPrev(on);
    if (on) setPop((n) => n + 1);
  }
  return (
    <span key={pop} className={`relative inline-flex ${pop && on ? "star-pop star-ring" : ""}`} style={{ width: size, height: size }}>
      <Star size={size} strokeWidth={stroke} absoluteStrokeWidth color={on ? STAR : off} fill={on ? STAR : "none"} className="transition-colors duration-200" />
    </span>
  );
}
