"use client";

// スマホの新しい見た目（紺）の小さな部品。寸法と色はデザインの絵（幅393pt）から測った値で、画面は幅に合わせて拡大・縮小する
// （components/app/mobile-app.tsx の zoom）。ここでの 1px は絵の 1pt
import { ChevronRight, ImageIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Tone } from "@/lib/app/hazard-level";

export const NAVY = "#133664";
export const INK = "#111827";
export const INK2 = "#141b2b";
export const LABEL = "#6b778a";
export const SUB = "#5d6880";
export const BLUE = "#1f6fe0";
export const RED = "#f0263a";
export const HAIR = "#eef2f6";
export const BORDER = "#e9eef4";

/** 枠つきの白いカード */
export function Card({ className = "", style, children, onClick }: { className?: string; style?: CSSProperties; children: ReactNode; onClick?: () => void }) {
  const cls = `rounded-[7px] border border-[#e9eef4] bg-white shadow-[0_1px_4px_rgba(20,45,85,0.05)] ${className}`;
  return onClick ? (
    <button onClick={onClick} className={`block w-full text-left active:bg-[#f7f9fd] ${cls}`} style={style}>
      {children}
    </button>
  ) : (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

/** 「もっと見る ›」 */
export function More({ onClick, label = "もっと見る", size = 6.8 }: { onClick?: () => void; label?: string; size?: number }) {
  return (
    <button onClick={onClick} className="flex shrink-0 items-center gap-[1px] leading-none" style={{ fontSize: size, color: BLUE, fontWeight: 500 }}>
      {label}
      <ChevronRight size={size + 0.5} strokeWidth={1.6} absoluteStrokeWidth color={BLUE} />
    </button>
  );
}

/** 写真が入る所（写真はあとで届く） */
export function NoImage({ className = "", style, small = false, label = "NO IMAGE" }: { className?: string; style?: CSSProperties; small?: boolean; label?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center overflow-hidden bg-[linear-gradient(160deg,#d5dde7_0%,#bcc7d4_100%)] text-white ${className}`} style={style}>
      <ImageIcon size={small ? 9 : 14} strokeWidth={1.6} absoluteStrokeWidth />
      <span className="mt-[2px] font-semibold leading-none" style={{ fontSize: small ? 5 : 6.5, letterSpacing: "0.14em" }}>
        {label}
      </span>
    </div>
  );
}

/** 読み込み中・データなしの薄い文字 */
export function Faint({ children, size = 6.6 }: { children: ReactNode; size?: number }) {
  return (
    <span className="font-normal" style={{ fontSize: size, color: "#8a95a6" }}>
      {children}
    </span>
  );
}

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

export function Chip({ tone, children, w, h = 15.6, size = 8.4 }: { tone: Tone; children: ReactNode; w?: number; h?: number; size?: number }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full px-[8px] font-bold leading-none" style={{ background: t.bg, color: t.fg, height: h, minWidth: w, fontSize: size }}>
      {children}
    </span>
  );
}

/** ★（塗り）。fill は 0〜1 で、左から塗る割合 */
export function StarMark({ size = 10, fill = 1, color = "#1a2f5a", empty = "#c9d1dd" }: { size?: number; fill?: number; color?: string; empty?: string }) {
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
export function Stars({ value, size = 6.4, gap = 1.85, color = "#1a2f5a" }: { value: number | null; size?: number; gap?: number; color?: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap }} aria-label={value === null ? "評価なし" : `5点中${value}点`}>
      {[0, 1, 2, 3, 4].map((k) => (
        <StarMark key={k} size={size} color={color} fill={value === null ? 0 : Math.max(0, Math.min(1, Math.round((value - k) * 2) / 2))} />
      ))}
    </span>
  );
}

/** 物件のピン（紺の涙形に白い丸） */
export function PinMark({ width = 19, height = 25.3, color = NAVY }: { width?: number; height?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 32" width={width} height={height} aria-hidden className="drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.3)]">
      <path d="M12 0C5.4 0 0 5.2 0 11.7 0 20 12 32 12 32s12-12 12-20.3C24 5.2 18.6 0 12 0Z" fill={color} />
      <circle cx="12" cy="11.5" r="4.6" fill="#fff" />
    </svg>
  );
}

/** 地図の上の白い丸ボタン（拡大） */
export function MapRoundButton({ children, onClick, label, style }: { children: ReactNode; onClick?: () => void; label: string; style?: CSSProperties }) {
  return (
    <button onClick={onClick} aria-label={label} className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(10,30,60,0.15)]" style={style}>
      {children}
    </button>
  );
}

/** 地図の上の白い吹き出し（住所） */
export function MapBubble({ children, size = 5.9 }: { children: ReactNode; size?: number }) {
  return (
    <span className="whitespace-nowrap rounded-full bg-white px-[9px] py-[5px] font-semibold leading-none text-[#1d2433] shadow-[0_1px_5px_rgba(10,30,60,0.14)]" style={{ fontSize: size }}>
      {children}
    </span>
  );
}

/** 地図の左下の白い丸い角のボタン（「地図アプリで開く ›」など） */
export function MapPill({ icon, label, onClick, href, size = 7.4 }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; size?: number }) {
  const cls = "absolute bottom-[5px] left-[5px] flex items-center gap-[5px] rounded-full bg-white py-[6px] pl-[9px] pr-[7px] leading-none text-[#1d2433] shadow-[0_1px_6px_rgba(10,30,60,0.14)] active:bg-[#f2f5f9]";
  const body = (
    <>
      {icon}
      <span style={{ fontSize: size }}>{label}</span>
      <ChevronRight size={size} strokeWidth={1.5} absoluteStrokeWidth color="#1d2433" />
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

/** 小さな注記（出典など） */
export function Note({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`leading-[1.6] ${className}`} style={{ fontSize: 6, color: "#8a95a6" }}>
      {children}
    </p>
  );
}

/** 見出し（アイコン＋太字）と右の「もっと見る」 */
export function SectionHead({ icon, title, size = 9.2, right }: { icon?: ReactNode; title: ReactNode; size?: number; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-[6px]">
      {icon}
      <h3 className="min-w-0 flex-1 font-bold leading-none" style={{ fontSize: size, color: INK2 }}>
        {title}
      </h3>
      {right}
    </div>
  );
}

/** 「〇分」の距離の書き方：道のりが分かれば徒歩の分数、分からなければ直線距離 */
export function distText(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.max(10, Math.round(m / 10) * 10)}m`;
}
