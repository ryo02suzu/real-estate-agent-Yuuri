// スマホの新しい見た目（紺）で使う、線のアイコン集（lucide）に無い形のアイコン
import type { CSSProperties } from "react";

/** ロゴの「M」（デザインの絵から写した形。正式なマークが届いたら差し替える） */
export function MockLogoMark({ style }: { style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 36 26" style={style} aria-hidden>
      <defs>
        <linearGradient id="mk-mid" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#8a9db8" stopOpacity="0.95" />
          <stop offset="1" stopColor="#c9d3df" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="mk-band" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0e1f3b" />
          <stop offset="0.45" stopColor="#13284a" />
          <stop offset="0.55" stopColor="#6a7f9d" />
          <stop offset="1" stopColor="#8396b0" />
        </linearGradient>
        <linearGradient id="mk-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6c819f" />
          <stop offset="1" stopColor="#dbe2ea" />
        </linearGradient>
      </defs>
      <path d="M15.5 1.3 23.6 12.6 21.4 15.2 15.5 6.6Z" fill="url(#mk-mid)" />
      <path d="M32.1 7.9 35 .5 35.5 25.8 32 22Z" fill="url(#mk-right)" />
      <path d="M19.4 18.2 34.9.6 32.1 7.9 21.2 20.3Z" fill="url(#mk-band)" />
      <path d="M.3 25.7 15.5 1.2 15.5 6.4 5.1 22.9Z" fill="#0f1d36" />
    </svg>
  );
}

/** 塗りつぶしの家（下のメニューで選ばれている「ホーム」） */
export function HouseFill({ size = 24, color = "currentColor", style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <path
        fillRule="evenodd"
        fill={color}
        d="M10.6 2.6a2.2 2.2 0 0 1 2.8 0l7.4 6.1c.5.4.8 1 .8 1.7V19a3 3 0 0 1-3 3h-3.2v-5.4a1.9 1.9 0 0 0-1.9-1.9h-3a1.9 1.9 0 0 0-1.9 1.9V22H5.4a3 3 0 0 1-3-3v-8.6c0-.7.3-1.3.8-1.7Z"
      />
    </svg>
  );
}

/** 縦の棒が3本（「相場・取引」のタブ） */
export function BarsOutline({ size = 24, color = "currentColor", stroke = 1.8, style }: { size?: number; color?: string; stroke?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="round" aria-hidden>
      <rect x="3" y="13" width="4" height="8" rx="1" />
      <rect x="10" y="9" width="4" height="12" rx="1" />
      <rect x="17" y="4" width="4" height="17" rx="1" />
    </svg>
  );
}

/** 棒グラフと右上がりの矢印（取引相場・取引事例） */
export function GrowthChart({ size = 24, color = "currentColor", style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <g fill={color}>
        <rect x="2.5" y="15" width="3.6" height="8" rx="0.4" />
        <rect x="7.7" y="12.5" width="3.6" height="10.5" rx="0.4" />
        <rect x="12.9" y="14" width="3.6" height="9" rx="0.4" />
        <rect x="18.1" y="10" width="3.6" height="13" rx="0.4" />
      </g>
      <path d="M2.5 10.5 8.5 5.5l4.2 3.3L20.5 2.2" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.6 1.6h4.6v4.6" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 積んだコイン（土地の参考価格） */
export function CoinStack({ size = 24, color = "currentColor", style }: { size?: number; color?: string; style?: CSSProperties }) {
  const coin = (cx: number, top: number, n: number) => {
    const rx = 6.4;
    const ry = 2.4;
    const h = 3.3;
    const bottom = top + h * n;
    return (
      <g>
        <path d={`M${cx - rx} ${top}v${h * n}a${rx} ${ry} 0 0 0 ${rx * 2} 0v-${h * n}`} fill="#fff" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        {Array.from({ length: n - 1 }, (_, i) => (
          <path key={i} d={`M${cx - rx} ${top + h * (i + 1)}a${rx} ${ry} 0 0 0 ${rx * 2} 0`} fill="none" stroke={color} strokeWidth="1.5" />
        ))}
        <ellipse cx={cx} cy={top} rx={rx} ry={ry} fill="#fff" stroke={color} strokeWidth="1.5" />
        <path d={`M${cx - rx} ${bottom}`} />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 24 22" width={size} height={(size * 22) / 24} style={style} aria-hidden>
      {coin(8.2, 3.4, 3)}
      {coin(16, 10.2, 2)}
    </svg>
  );
}

/** 時計と左回りの矢印（検索履歴）。矢印は左側 */
export function ClockBack({ size = 24, color = "currentColor", stroke = 1.6, style }: { size?: number; color?: string; stroke?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.3 9.6A8.3 8.3 0 1 1 3.9 14" />
      <path d="M1.9 8.4 4.2 11.3 7.2 9.2" />
      <path d="M12 7.3v5l3.3 2.1" />
    </svg>
  );
}

type IconProps = { size?: number; color?: string; style?: CSSProperties };

/** 歩く人（徒歩） */
export function Walker({ size = 24, color = "currentColor", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="13.6" cy="3.6" r="2.1" />
      <path d="M13.2 7.9 11 14.6l3.4 3.3V23" />
      <path d="M11 14.6 8.2 23" />
      <path d="M12.7 9.2 9.6 11.6v3" />
      <path d="M13.2 7.9l2.5 3.4 3.1 1" />
    </svg>
  );
}

/** 塗りの角帽（学校） */
export function CapFill({ size = 24, color = "currentColor", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill={color} aria-hidden>
      <path d="M12 3.2.6 8.6 12 14l9.1-4.3v5.1h1.6V8.6Z" />
      <path d="M5.3 12.4v3.9c0 1.7 3 3.6 6.7 3.6s6.7-1.9 6.7-3.6v-3.9L12 15.6Z" />
      <circle cx="21.9" cy="16.6" r="1.3" />
    </svg>
  );
}

/** 塗りの木（公園） */
export function TreeFill({ size = 24, color = "currentColor", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill={color} aria-hidden>
      <path d="M12 1.5a4.8 4.8 0 0 0-4.7 3.9A4.4 4.4 0 0 0 4.6 12a4.2 4.2 0 0 0 1.8 5.6 4.4 4.4 0 0 0 4.4.6v4.3h2.4v-4.3a4.4 4.4 0 0 0 4.4-.6 4.2 4.2 0 0 0 1.8-5.6 4.4 4.4 0 0 0-2.7-6.6A4.8 4.8 0 0 0 12 1.5Z" />
    </svg>
  );
}

/** 赤い四角に白い十字（病院） */
export function HospitalFill({ size = 24, color = "currentColor", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill={color} />
      <path d="M9.6 5.5h4.8v4.1h4.1v4.8h-4.1v4.1H9.6v-4.1H5.5V9.6h4.1Z" fill="#fff" />
    </svg>
  );
}

/** カプセル（ドラッグストア） */
export function PillIcon({ size = 24, color = "currentColor", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <g transform="rotate(-45 12 12)">
        <rect x="1.6" y="7.4" width="20.8" height="9.2" rx="4.6" fill="#fff" stroke={color} strokeWidth="2" />
        <path d="M12 7.4h5.8a4.6 4.6 0 0 1 0 9.2H12Z" fill={color} />
      </g>
    </svg>
  );
}

/** 塗りのフォークとナイフ（飲食店） */
export function CutleryFill({ size = 24, color = "currentColor", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill={color} aria-hidden>
      <path d="M4.2 1.5h1.6v6.3h1.1V1.5h1.6v6.3h1.1V1.5h1.6v7.7a3.4 3.4 0 0 1-2.4 3.2v10.1H6.6V12.4a3.4 3.4 0 0 1-2.4-3.2Z" />
      <path d="M18.6 1.5c-2.6.8-4.4 4.6-4.4 9.4v1.5h2.6v10.1h2.6V1.5Z" />
    </svg>
  );
}

/** ★（塗り）。fill は 0〜1 で、左から塗る割合 */
export function StarMark({ size = 10, fill = 1, color = "#1a2f5a", empty = "#c9d1dd", style }: { size?: number; fill?: number; color?: string; empty?: string; style?: CSSProperties }) {
  const id = `st-${Math.round(fill * 100)}-${color.slice(1)}`;
  const d = "M12 1.6l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.7l-6.4 3.5L7 14.1l-5.3-5 7.2-.9Z";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
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

/** 塗りの縦棒3本（評価の見出し） */
export function BarsFill({ size = 24, color = "currentColor", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill={color} aria-hidden>
      <rect x="2" y="13" width="5" height="10" rx="1.6" />
      <rect x="9.5" y="7.5" width="5" height="15.5" rx="1.6" />
      <rect x="17" y="1" width="5" height="22" rx="1.6" />
    </svg>
  );
}

/** ロゼット（勲章）：丸に星とリボン */
export function AwardFill({ size = 24, color = "currentColor", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <path d="M7.4 13.2 4 20.6l3.6-.6 1.8 3.1 2.9-6.4M16.6 13.2l3.4 7.4-3.6-.6-1.8 3.1-2.9-6.4" fill={color} />
      <circle cx="12" cy="8.6" r="7.8" fill={color} />
      <circle cx="12" cy="8.6" r="5.6" fill="none" stroke="#fff" strokeWidth="1.2" />
      <path d="M12 4.5l1.3 2.7 2.9.4-2.1 2 .5 2.9L12 11.1l-2.6 1.4.5-2.9-2.1-2 2.9-.4Z" fill="#fff" />
    </svg>
  );
}

/** 電車（正面）。最寄り駅の見出し */
export function TrainOutline({ size = 24, color = "currentColor", stroke = 2, style }: IconProps & { stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.2" y="1.8" width="15.6" height="16" rx="4" />
      <path d="M4.2 10.2h15.6" />
      <path d="M8.2 17.8 5.6 22.2M15.8 17.8l2.6 4.4" />
      <circle cx="8.6" cy="14" r="0.9" fill={color} />
      <circle cx="15.4" cy="14" r="0.9" fill={color} />
    </svg>
  );
}

/** 接道：台形の道と中央の破線 */
export function RoadIcon({ size = 24, color = "currentColor", stroke = 1.8, style }: IconProps & { stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M8 2.5h8l5 19H3Z" />
      <path d="M12 6v2.6M12 11.4v2.6M12 16.8v2.4" />
    </svg>
  );
}

/** 斜線制限：直角三角形と斜めの線 */
export function SlopeIcon({ size = 24, color = "currentColor", stroke = 1.6, style }: IconProps & { stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M3 21.5h18M5 21.5V8M5 21.5 19 3" />
      <path d="M5 16.5h3.5v5" />
    </svg>
  );
}

/** 道路幅員：左右の矢印と両端の斜め線 */
export function WidthIcon({ size = 24, color = "currentColor", stroke = 1.6, style }: IconProps & { stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M4 4 1.5 20M20 4l2.5 16" />
      <path d="M5.5 12h13M8 9.5 5.5 12 8 14.5M16 9.5l2.5 2.5-2.5 2.5" />
    </svg>
  );
}

/** 赤い丸に「!」 */
export function AlertFill({ size = 24, color = "#e5484d", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <circle cx="12" cy="12" r="11" fill={color} />
      <path d="M12 6v7.5" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="12" cy="17.6" r="1.7" fill="#fff" />
    </svg>
  );
}

/** 緑の丸にチェック */
export function CheckFill({ size = 24, color = "#14905a", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <circle cx="12" cy="12" r="11.5" fill={color} />
      <path d="M6.8 12.3 10.4 15.8 17.4 8.6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 紺の書類（塗り） */
export function DocFill({ size = 24, color = "#173a6e", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <path d="M5.5 1.5h9.2l5.8 5.8v13.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-17a2 2 0 0 1 2-2Z" fill={color} />
      <path d="M14.7 1.5v5.8h5.8" fill="#4f6f9e" />
      <path d="M7.5 12h9M7.5 15.3h9M7.5 18.6h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 青いビル（塗り）2棟 */
export function TowersFill({ size = 24, color = "#2f7be6", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <path d="M11.5 1.2v3.3" stroke={color} strokeWidth="1.2" />
      <rect x="8.4" y="4.2" width="9" height="18.6" rx="0.6" fill={color} />
      <rect x="2.6" y="11" width="6.6" height="11.8" rx="0.6" fill="#7fb0f0" />
      <rect x="16.6" y="9.5" width="5.2" height="13.3" rx="0.6" fill="#5b95ec" />
      <g fill="#fff">
        <rect x="10.3" y="7" width="1.6" height="1.6" />
        <rect x="13.8" y="7" width="1.6" height="1.6" />
        <rect x="10.3" y="10.5" width="1.6" height="1.6" />
        <rect x="13.8" y="10.5" width="1.6" height="1.6" />
        <rect x="10.3" y="14" width="1.6" height="1.6" />
        <rect x="13.8" y="14" width="1.6" height="1.6" />
        <rect x="4.2" y="14" width="1.4" height="1.4" />
        <rect x="4.2" y="17.2" width="1.4" height="1.4" />
        <rect x="12" y="18.8" width="2" height="4" />
      </g>
    </svg>
  );
}

/** オレンジの太陽（塗りの丸と光） */
export function SunFill({ size = 24, color = "#f7931e", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <circle cx="12" cy="12" r="5.2" fill={color} />
      <g stroke={color} strokeWidth="2" strokeLinecap="round">
        <path d="M12 1.5v2.6M12 19.9v2.6M1.5 12h2.6M19.9 12h2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
      </g>
    </svg>
  );
}

/** 青い3本の波（洪水） */
export function WavesFill({ size = 24, color = "#1f5fd1", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M1.5 5.5c2.6-2 4.6-2 7 0s4.4 2 7 0 4.4-2 7 0" />
      <path d="M1.5 12c2.6-2 4.6-2 7 0s4.4 2 7 0 4.4-2 7 0" />
      <path d="M1.5 18.5c2.6-2 4.6-2 7 0s4.4 2 7 0 4.4-2 7 0" />
    </svg>
  );
}

/** 青い雲と雨（内水） */
export function RainCloud({ size = 24, color = "#1f6fe0", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <path d="M6.3 15.2a4.6 4.6 0 0 1-.4-9.2A6.4 6.4 0 0 1 18 6.9a4.2 4.2 0 0 1 .3 8.3Z" fill={color} />
      <path d="M7 18.2l-.9 3M10.4 18.2l-.9 3M13.8 18.2l-.9 3M17.2 18.2l-.9 3" stroke="#2a4f8f" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** 紺の山（土砂災害） */
export function Landslide({ size = 24, color = "#1d3264", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <path d="M1 22.5 13.6 2.5l9.4 20Z" fill={color} />
      <path d="M8.3 22.5c.4-3.1 2.1-4.2 1.8-6.6-.3-2.1-1.9-3-.9-5.2" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M3.3 22.5c1.2-2.6 2.6-3.6 3.1-5.8" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** オレンジの点と波（液状化） */
export function Liquefaction({ size = 24, color = "#f26a3d", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <g fill={color}>
        <circle cx="12" cy="2.6" r="1.6" />
        <circle cx="7.4" cy="7" r="1.6" />
        <circle cx="16.6" cy="7" r="1.6" />
        <circle cx="3" cy="11.4" r="1.6" />
        <circle cx="12" cy="11.4" r="1.6" />
        <circle cx="21" cy="11.4" r="1.6" />
      </g>
      <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
        <path d="M1.5 16.4c1.8-1.3 3.4-1.3 5.2 0s3.4 1.3 5.2 0 3.4-1.3 5.2 0 3.4 1.3 5.2 0" />
        <path d="M1.5 20.8c1.8-1.3 3.4-1.3 5.2 0s3.4 1.3 5.2 0 3.4-1.3 5.2 0 3.4 1.3 5.2 0" />
      </g>
    </svg>
  );
}

/** オレンジのビルと揺れ（地震） */
export function Quake({ size = 24, color = "#e8622c", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} aria-hidden>
      <rect x="6.6" y="2" width="10.8" height="20.5" rx="0.8" fill={color} />
      <g fill="#fff">
        <rect x="8.6" y="4.8" width="2.4" height="2.2" />
        <rect x="13" y="4.8" width="2.4" height="2.2" />
        <rect x="8.6" y="9.2" width="2.4" height="2.2" />
        <rect x="13" y="9.2" width="2.4" height="2.2" />
        <rect x="8.6" y="13.6" width="2.4" height="2.2" />
        <rect x="13" y="13.6" width="2.4" height="2.2" />
        <rect x="10.8" y="18" width="2.4" height="4.5" />
      </g>
      <path d="M3.6 7.2 1.8 10l1.8 2.8L1.8 15.6l1.8 2.8M20.4 7.2l1.8 2.8-1.8 2.8 1.8 2.8-1.8 2.8" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 緑の走る人（避難） */
export function Runner({ size = 24, color = "#169b4f", style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="15.4" cy="3.3" r="2.2" fill={color} stroke="none" />
      <path d="M13.8 7.4 10.7 14l4 3.3-.4 5" />
      <path d="M10.7 14 7.8 18.8l-5 .6" />
      <path d="M13.8 7.4 8.6 9l-2.2 3.6" />
      <path d="M13.8 7.4l2.6 4.3 4.1.4" />
    </svg>
  );
}

/** 半円のメーター（総合ハザード評価）。needle は針の位置（0=左端・1=右端。無ければ灰色の針を真ん中の少し右に） */
export function Gauge({ style, needle }: { style?: CSSProperties; needle?: number }) {
  // 中心 (31.5, 31.5)、半径 26.5、線の太さ 7。左から 黄 → 橙 → 灰
  const r = 26.5;
  const cx = 31.5;
  const cy = 31.5;
  const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)] as const;
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = pt(a0);
    const [x1, y1] = pt(a1);
    return `M${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  return (
    <svg viewBox="0 0 63 36" style={style} aria-hidden>
      {needle === undefined ? (
        <>
          <path d={arc(180, 128)} stroke="#ffd877" strokeWidth="7" fill="none" />
          <path d={arc(128, 52)} stroke="#f7a90c" strokeWidth="7" fill="none" />
          <path d={arc(52, 0)} stroke="#c7cedb" strokeWidth="7" fill="none" />
        </>
      ) : (
        // 針があるときは、左から 低い（緑）→ 注意（黄）→ やや高い（橙）→ 高い（赤）
        <>
          <path d={arc(180, 135)} stroke="#8fd6a9" strokeWidth="7" fill="none" />
          <path d={arc(135, 90)} stroke="#ffd877" strokeWidth="7" fill="none" />
          <path d={arc(90, 45)} stroke="#f7a90c" strokeWidth="7" fill="none" />
          <path d={arc(45, 0)} stroke="#ef6a5b" strokeWidth="7" fill="none" />
        </>
      )}
      {needle === undefined ? (
        <path d="M28.9 29.6 47.7 12.4 33.5 33.2Z" fill="#cfd6e1" />
      ) : (
        // 針（中心から半径の8割まで。角度は左端 180° → 右端 0°）
        <g transform={`rotate(${-(180 - 180 * Math.min(1, Math.max(0, needle)))} ${cx} ${cy})`}>
          <path d={`M${cx} ${cy - 2.6}L${cx + r * 0.82} ${cy}L${cx} ${cy + 2.6}Z`} fill="#1e3a66" />
        </g>
      )}
      <circle cx={cx} cy={cy} r="3.4" fill="#1e5bb7" />
    </svg>
  );
}
