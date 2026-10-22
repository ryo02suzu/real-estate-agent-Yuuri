// スマホの新しいホームの絵（調査メニューの6つの色つきアイコンと、見出しの下の強みの小さなアイコン）。
// デザインの絵のアイコンに似せて描いたもの。元の絵の部品が届いたら差し替える
import { useId, type CSSProperties } from "react";

type P = { size?: number; style?: CSSProperties };

/** SVG のグラデーションの id（url(#…) で使えない記号を外す） */
function useSvgId(): string {
  return `g${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** 道路（青）：奥へ細くなる道と白い線 */
export function RoadArt({ size = 24, style }: P) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6c9cf4" />
          <stop offset="1" stopColor="#1f4fd6" />
        </linearGradient>
      </defs>
      <path d="M8.6 3.5h6.8L22 20.5H2z" fill={`url(#${id})`} />
      <path d="M10.6 4.6 7.3 19.6M13.4 4.6l3.3 15" stroke="#fff" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M12 5.2v2.2M12 9.6v2.6M12 14.4v3" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}

/** 法令・都市計画（紫）：重なった3枚の層 */
export function LayersArt({ size = 24, style }: P) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden fill="none" strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b79cf7" />
          <stop offset="1" stopColor="#7a4fe0" />
        </linearGradient>
      </defs>
      <path d="m3 15.6 9 4.6 9-4.6" stroke="#7a4fe0" strokeWidth="1.6" />
      <path d="m3 11.8 9 4.6 9-4.6" stroke="#8b63e8" strokeWidth="1.6" />
      <path d="M12 3.4 3 8l9 4.6L21 8z" fill={`url(#${id})`} stroke="#7a4fe0" strokeWidth="1.4" />
    </svg>
  );
}

/** ハザード（水色）：波と、チェックの付いた盾 */
export function HazardArt({ size = 24, style }: P) {
  const wave = (y: number) => `M1.8 ${y}c1.3-1.1 2.6-1.1 3.9 0s2.6 1.1 3.9 0 2.6-1.1 3.9 0`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden fill="none" strokeLinecap="round">
      <path d={wave(8)} stroke="#2bb3e3" strokeWidth="1.6" />
      <path d={wave(12.2)} stroke="#2bb3e3" strokeWidth="1.6" />
      <path d={wave(16.4)} stroke="#2bb3e3" strokeWidth="1.6" />
      <path d="M17.4 9.2 22 10.9v3.5c0 2.9-1.9 4.9-4.6 5.9-2.7-1-4.6-3-4.6-5.9v-3.5z" fill="#1d6fe0" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
      <path d="m15.4 14.6 1.4 1.4 2.6-2.8" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

/** 土地・建物（緑）：家と木 */
export function HouseTreeArt({ size = 24, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.4 11.6 9.6 5.4l7.2 6.2" stroke="#1f9d55" strokeWidth="1.7" />
      <path d="M4.6 10v9.6h10V10" stroke="#1f9d55" strokeWidth="1.7" />
      <path d="M8.1 19.6v-4.8h3v4.8" stroke="#1f9d55" strokeWidth="1.5" />
      <path d="M19.2 8.4c1.9 1 3 3 2.7 5-.3 1.7-1.5 2.6-2.7 2.6s-2.4-.9-2.7-2.6c-.3-2 .8-4 2.7-5z" fill="#3cc46d" />
      <path d="M19.2 12.2v7.4M1.6 19.6h20.8" stroke="#1f9d55" strokeWidth="1.5" />
    </svg>
  );
}

/** 価格（橙）：円の硬貨と、受ける手 */
export function YenArt({ size = 24, style }: P) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <radialGradient id={id} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffe3b3" />
          <stop offset="1" stopColor="#f9b44c" />
        </radialGradient>
      </defs>
      <circle cx="13" cy="9.6" r="7" fill={`url(#${id})`} stroke="#ee8a12" strokeWidth="1.5" />
      <path d="m10.6 6.4 2.4 3.3 2.4-3.3M13 9.7v4.4M10.8 10.6h4.4M10.8 12.4h4.4" stroke="#d97706" strokeWidth="1.4" />
      <path d="M1.8 17.2c1.6-.9 3.2-1 4.8-.2l2.6 1.2c1.1.5 2.3.5 3.4 0l4.6-2" stroke="#ee8a12" strokeWidth="1.5" />
      <path d="M1.8 20.6c2.4.8 4.8 1 7.4.6 2.2-.4 4.3-1.4 6.3-2.8" stroke="#ee8a12" strokeWidth="1.5" />
    </svg>
  );
}

/** 周辺環境（赤）：ビルと、場所のしるし */
export function TownArt({ size = 24, style }: P) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f47ca0" />
          <stop offset="1" stopColor="#e23d68" />
        </linearGradient>
      </defs>
      <path d="M2.4 20.4V10.2h5.4v10.2z" fill="#f8a5bd" />
      <path d="M7.8 20.4V3.6h7.4v16.8z" fill={`url(#${id})`} />
      <path d="M9.6 6.4h1.4M12.2 6.4h1.4M9.6 9.2h1.4M12.2 9.2h1.4M9.6 12h1.4M12.2 12h1.4M9.6 14.8h1.4M12.2 14.8h1.4M4 13h2M4 15.8h2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M18.8 12.2c1.7 0 3 1.3 3 2.9 0 2.3-3 4.9-3 4.9s-3-2.6-3-4.9c0-1.6 1.3-2.9 3-2.9z" fill="#e23d68" />
      <circle cx="18.8" cy="15.1" r="1.1" fill="#fff" />
      <path d="M1.6 20.6h20.8" stroke="#e23d68" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** 強みの印：ピン（塗り） */
export function PinFill({ size = 12, color = "#133664", style }: P & { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <path d="M12 1.8c-4.5 0-8 3.4-8 7.8C3.9 15.5 12 22.2 12 22.2s8.1-6.7 8.1-12.6c0-4.4-3.6-7.8-8.1-7.8z" fill={color} />
      <circle cx="12" cy="9.6" r="3" fill="#fff" />
    </svg>
  );
}

/** 強みの印：チェックの付いた盾（塗り） */
export function ShieldFill({ size = 12, color = "#133664", style }: P & { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <path d="M12 2 4.2 5.1v6.2c0 4.9 3.3 8.6 7.8 10.5 4.5-1.9 7.8-5.6 7.8-10.5V5.1z" fill={color} />
      <path d="m8.4 11.9 2.5 2.5 4.6-5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
