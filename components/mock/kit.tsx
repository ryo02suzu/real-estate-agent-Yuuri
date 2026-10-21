// モック画面の道具：デザインの絵（幅393pt）の座標どおりに部品を置くための小さな部品。
// 座標は絵から測った値（pt）。文字は「インクの上端」の位置で指定する（行の箱ではなく、見えている字の上端）
import type { CSSProperties, ReactNode } from "react";
import { ImageIcon } from "lucide-react";

/** 絵の幅（pt）。画面の幅に合わせて全体を拡大・縮小する */
export const ART_W = 393;

/** 左上の位置と大きさ（絵の座標） */
export const at = (x: number, y: number, w?: number, h?: number): CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  ...(w !== undefined && { width: w }),
  ...(h !== undefined && { height: h }),
});

/** 字の上端から行の箱の上端までの差（字の大きさに対する割合）。和文と、数字・英字で違う */
const INK = { ja: 0.12, latin: 0.2 };

type TProps = {
  /** 左端（align=right なら右端、center なら中央）の x */
  x: number;
  /** 字の上端の y */
  y: number;
  /** 字の大きさ（pt） */
  s: number;
  c?: string;
  w?: number;
  ls?: number;
  /** 先頭が数字・英字の行（上端の位置の差が和文と違う） */
  latin?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/** 絵の座標に置く1行の文字 */
export function T({ x, y, s, c = "#111827", w = 400, ls = 0, latin = false, align = "left", className = "", style, children }: TProps) {
  const top = y - (latin ? INK.latin : INK.ja) * s;
  const pos: CSSProperties =
    align === "right" ? { right: ART_W - x, top } : align === "center" ? { left: x, top, transform: "translateX(-50%)" } : { left: x, top };
  return (
    <span className={`absolute whitespace-nowrap leading-none ${className}`} style={{ ...pos, fontSize: s, color: c, fontWeight: w, letterSpacing: ls, ...style }}>
      {children}
    </span>
  );
}

/** 写真が入る所（写真はあとで届く）。写真らしい中間の明るさにして、上に載る白い字やボタンが読めるようにする */
export function NoImage({ style, className = "", small = false, label = true }: { style?: CSSProperties; className?: string; small?: boolean; label?: boolean }) {
  return (
    <div className={`absolute overflow-hidden bg-[linear-gradient(160deg,#d5dde7_0%,#bcc7d4_100%)] ${className}`} style={style}>
      {label && (
        <div className="flex h-full w-full flex-col items-center justify-center text-white">
          <ImageIcon size={small ? 9 : 14} strokeWidth={1.6} absoluteStrokeWidth />
          <span className="mt-[2px] font-semibold leading-none" style={{ fontSize: small ? 5 : 6.5, letterSpacing: "0.14em" }}>
            NO IMAGE
          </span>
        </div>
      )}
    </div>
  );
}

/** 地図が入る所（今は地図を出さない）。中央は物件のピンに空けて、左上に小さく NO IMAGE */
export function MapSlot({ style, className = "", children }: { style?: CSSProperties; className?: string; children?: ReactNode }) {
  return (
    <div className={`absolute overflow-hidden bg-[#e9eef4] ${className}`} style={style}>
      <div className="absolute left-[8px] top-[8px] flex items-center gap-[3px] text-[#a9b6c5]">
        <ImageIcon size={9} strokeWidth={1.5} absoluteStrokeWidth />
        <span className="font-semibold leading-none" style={{ fontSize: 5.5, letterSpacing: "0.14em" }}>
          NO IMAGE
        </span>
      </div>
      {children}
    </div>
  );
}

/** 物件のピン（紺の涙形に白い丸） */
export function PinMark({ style, color = "#133664" }: { style?: CSSProperties; color?: string }) {
  return (
    <svg viewBox="0 0 24 32" style={style} aria-hidden>
      <path d="M12 0C5.4 0 0 5.2 0 11.7 0 20 12 32 12 32s12-12 12-20.3C24 5.2 18.6 0 12 0Z" fill={color} />
      <circle cx="12" cy="11.5" r="4.6" fill="#fff" />
    </svg>
  );
}

/** 地図のピンの下の小さな青い点（位置の目印） */
export function PinDot({ style }: { style?: CSSProperties }) {
  return <span className="absolute rounded-full border-[1.2px] border-white bg-[#8fb6ea] shadow-[0_0_0_1px_rgba(19,54,100,0.15)]" style={style} />;
}
