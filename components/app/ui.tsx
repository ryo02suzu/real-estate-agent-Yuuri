"use client";

// スマホの新しい見た目（紺）の色と、地図の上の小さな部品。寸法は本物の大きさ（1px = 1pt。画面は幅に合わせて拡大・縮小する。
// components/app/zoom.ts）
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Tone } from "@/lib/app/hazard-level";

export const NAVY = "#133664";

/** 印の色（区域外=緑、注意=淡い黄、やや高い=黄、高い=赤、データなし=灰、地図で確認=青、近くにあり=緑） */
export const TONE: Record<Tone, { bg: string; fg: string }> = {
  out: { bg: "#d4f1df", fg: "#1c2740" },
  near: { bg: "#cdeedc", fg: "#1c2740" },
  caution: { bg: "#fff3c4", fg: "#5c4a00" },
  mid: { bg: "#ffe59c", fg: "#1c2740" },
  high: { bg: "#ffd7c6", fg: "#c0391b" },
  none: { bg: "#eef1f5", fg: "#5d6880" },
  map: { bg: "#e3edfb", fg: "#1f5fd1" },
};

/** ★（塗り）。fill は 0〜1 で、左から塗る割合 */
export function StarMark({ size = 15, fill = 1, color = "#1a2f5a", empty = "#c9d1dd" }: { size?: number; fill?: number; color?: string; empty?: string }) {
  const id = `st${Math.round(fill * 100)}${color.slice(1)}${empty.slice(1)}`;
  const d = "M12 1.6l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.7l-6.4 3.5L7 14.1l-5.3-5 7.2-.9Z";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={24 * fill} height="24" />
        </clipPath>
      </defs>
      <path d={d} fill={empty} />
      <path d={d} fill={color} clipPath={`url(#${id})`} />
    </svg>
  );
}

/** 5つ星（value は 1〜5。半分は半分だけ塗る。null は灰色） */
export function Stars({ value, size = 15, gap = 2, color = "#1a2f5a" }: { value: number | null; size?: number; gap?: number; color?: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap }} aria-label={value === null ? "評価なし" : `5点中${value}点`}>
      {[0, 1, 2, 3, 4].map((k) => (
        <StarMark key={k} size={size} color={color} fill={value === null ? 0 : Math.max(0, Math.min(1, Math.round((value - k) * 2) / 2))} />
      ))}
    </span>
  );
}

/** 物件のピン（紺の涙形に白い丸） */
export function PinMark({ width = 24, height = 32, color = NAVY }: { width?: number; height?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 32" width={width} height={height} aria-hidden className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
      <path d="M12 0C5.4 0 0 5.2 0 11.7 0 20 12 32 12 32s12-12 12-20.3C24 5.2 18.6 0 12 0Z" fill={color} />
      <circle cx="12" cy="11.5" r="4.6" fill="#fff" />
    </svg>
  );
}

/** 地図の上の白い丸ボタン（拡大） */
export function MapRoundButton({ children, onClick, label, style }: { children: ReactNode; onClick?: () => void; label: string; style?: CSSProperties }) {
  return (
    <button onClick={onClick} aria-label={label} className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_5px_rgba(10,30,60,0.18)] active:bg-[#f2f5f9]" style={style}>
      {children}
    </button>
  );
}

/** 地図の上の白い吹き出し（住所） */
export function MapBubble({ children, size = 12 }: { children: ReactNode; size?: number }) {
  return (
    <span className="whitespace-nowrap rounded-full bg-white px-[10px] py-[6px] font-semibold leading-none text-[#1d2433] shadow-[0_1px_6px_rgba(10,30,60,0.16)]" style={{ fontSize: size }}>
      {children}
    </span>
  );
}

/** 地図の左下の白い丸い角のボタン（「地図アプリで開く ›」など） */
export function MapPill({ icon, label, onClick, href, size = 13 }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; size?: number }) {
  const cls = "absolute bottom-[8px] left-[8px] flex items-center gap-[6px] rounded-full bg-white py-[8px] pl-[11px] pr-[8px] font-semibold leading-none text-[#1d2433] shadow-[0_1px_6px_rgba(10,30,60,0.16)] active:bg-[#f2f5f9]";
  const body = (
    <>
      {icon}
      <span style={{ fontSize: size }}>{label}</span>
      <ChevronRight size={size + 1} strokeWidth={1.8} absoluteStrokeWidth color="#1d2433" />
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  );
}
