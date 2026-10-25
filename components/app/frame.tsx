"use client";

// スマホの新しい見た目（紺）の枠：絵の幅（393pt。画面の幅に合わせて拡大・縮小する。CSS の zoom。値は app/layout.tsx の <head> で決める。
// components/app/zoom.ts）、スマホの画面だけで読む画像、ロゴ、検索窓の入力欄、いちばん下のメニュー。
// 検索する前のホームは components/app/home.tsx、物件の画面は components/app/mobile-app.tsx
import { Ellipsis, FileText, Star } from "lucide-react";
import type { CSSProperties, ImgHTMLAttributes, ReactNode, RefObject } from "react";
import { ClockBack, HouseFill } from "./icons";

/** 絵の幅（pt）。この幅で描いて、画面の幅に合わせて拡大・縮小する */
export const ART_W = 393;
export const ZOOM = "var(--app-zoom, 1)";

/** 1×1 の透明な画像（PC の幅でスマホの画像の代わりに入れる） */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * スマホの画面だけで読む画像。最初の表示（書き出した HTML）はスマホの画面で、PC は表示のあとで PC の画面に切り替わるので、
 * PC の幅では空の画像にして読み込ませない（<picture> の中の画像には React が先読みも付けない）
 */
export function PhoneImg(props: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={BLANK} />
      <img {...props} alt={props.alt ?? ""} />
    </picture>
  );
}

/**
 * ロゴ（新しいマーク・MICHILU・「不動産の現場に、すぐ使える情報を。」。届いた素材から切り出した透過の画像）。
 * sky のときは白い版（形はそのまま、色だけ白。public/home/logo-white.webp）を重ね、空が暗いときに白へ切り替える（--sky-dark）
 */
export function LogoLockup({ style, sky = false }: { style?: CSSProperties; sky?: boolean }) {
  const alt = "MICHILU 不動産の現場に、すぐ使える情報を。";
  if (!sky) return <PhoneImg src="/home/logo.webp" alt={alt} width={900} height={160} draggable={false} style={{ width: "auto", ...style }} />;
  return (
    <span className="relative inline-block" style={{ height: style?.height }}>
      <PhoneImg src="/home/logo.webp" alt={alt} width={900} height={160} draggable={false} className="sky-logo-navy block" style={{ width: "auto", ...style }} />
      <PhoneImg src="/home/logo-white.webp" alt="" aria-hidden width={900} height={160} draggable={false} className="sky-logo-white absolute left-0 top-0 block" style={{ width: "auto", ...style }} />
    </span>
  );
}

/**
 * 検索窓の入力欄。iPhone は 16px より小さい字の入力欄に触れると画面を拡大するので、字を 16px（拡大・縮小の後で）で描いてから
 * transform で絵の大きさ（size pt）に縮める
 */
export function ScaledInput({
  value,
  onChange,
  inputRef,
  placeholder = "住所・地番を入力（例：渋谷区神南1-19-11）",
  label = "住所・地番",
  size = 10.06,
  autoComplete = "street-address",
  className = "ml-[10.3px] mr-[4px]",
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
  label?: string;
  /** 絵の上の字の大きさ（pt） */
  size?: number;
  autoComplete?: string;
  className?: string;
}) {
  const k = `calc(${size} * var(--app-zoom, 1) / 16)`;
  return (
    <div className={`relative h-full min-w-0 flex-1 overflow-hidden ${className}`}>
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="absolute left-0 top-1/2 bg-transparent font-medium text-[#121a2b] outline-none placeholder:font-normal placeholder:text-[#8d97a8] [&::-webkit-search-cancel-button]:hidden"
        style={{ width: `calc(100% / ${k})`, fontSize: "calc(16px / var(--app-zoom, 1))", transform: `translateY(-50%) scale(${k})`, transformOrigin: "left center" }}
      />
    </div>
  );
}

export type NavKey = "home" | "history" | "favorites" | "docs" | "account";

const ON = "#133664";
const OFF = "#68738a";
/** 5つを同じ幅で並べる（幅393pt ÷ 5） */
const NAV_W = ART_W / 5;
/** iPhone のアプリの下のメニューと同じくらいの大きさ（アイコン約24pt・名前10.5pt） */
const NAV: { key: NavKey; label: string; icon: (on: boolean) => ReactNode }[] = [
  { key: "home", label: "ホーム", icon: (on) => <HouseFill size={24} color={on ? ON : OFF} /> },
  { key: "history", label: "履歴", icon: (on) => <ClockBack size={24} stroke={on ? 2 : 1.6} color={on ? ON : OFF} /> },
  { key: "favorites", label: "お気に入り", icon: (on) => <Star size={23} strokeWidth={on ? 2 : 1.6} absoluteStrokeWidth color={on ? ON : OFF} fill={on ? ON : "none"} /> },
  { key: "docs", label: "書類・出力", icon: (on) => <FileText size={23} strokeWidth={on ? 2 : 1.6} absoluteStrokeWidth color={on ? ON : OFF} /> },
  { key: "account", label: "その他", icon: (on) => <Ellipsis size={24} strokeWidth={on ? 2.6 : 2.2} absoluteStrokeWidth color={on ? ON : OFF} /> },
];

/** いちばん下のメニュー（ホーム・履歴・お気に入り・書類・出力・その他） */
export function BottomNav({ active, onSelect }: { active: NavKey; onSelect: (key: NavKey) => void }) {
  return (
    <nav aria-label="画面の切り替え" className="app-touch shrink-0 overflow-hidden border-t border-[#e6ebf2] bg-white/95 pb-[max(0px,calc(env(safe-area-inset-bottom)-12px))] backdrop-blur">
      <div className="relative mx-auto" style={{ width: ART_W, height: 54, zoom: ZOOM }}>
        {NAV.map((n, i) => {
          const on = n.key === active;
          return (
            <button
              key={n.key}
              onClick={() => onSelect(n.key)}
              aria-current={on ? "page" : undefined}
              className="absolute flex flex-col items-center justify-center gap-[4px] active:opacity-60"
              style={{ left: i * NAV_W, top: 0, width: NAV_W, height: 54 }}
            >
              {n.icon(on)}
              <span className="whitespace-nowrap leading-none" style={{ fontSize: 10.5, color: on ? ON : OFF, fontWeight: on ? 600 : 500 }}>
                {n.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
