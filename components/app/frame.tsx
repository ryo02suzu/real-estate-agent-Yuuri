"use client";

// スマホの新しい見た目（紺）の枠：絵の幅（393pt。画面の幅に合わせて拡大・縮小する。CSS の zoom。値は app/layout.tsx の <head> で決める。
// components/app/zoom.ts）、スマホの画面だけで読む画像、ロゴ、検索窓の入力欄、いちばん下のメニュー。
// 検索する前のホームは components/app/home.tsx、物件の画面は components/app/mobile-app.tsx
import { Search, Star } from "lucide-react";
import type { CSSProperties, ImgHTMLAttributes, ReactNode, RefObject } from "react";
import { ClockBack } from "./icons";

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
  onPhoto = false,
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
  /** 写真の上のすりガラスの欄（字を白く） */
  onPhoto?: boolean;
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
        className={`absolute left-0 top-1/2 bg-transparent font-medium outline-none placeholder:font-normal [&::-webkit-search-cancel-button]:hidden ${onPhoto ? "text-white placeholder:text-white/85" : "text-[#121a2b] placeholder:text-[#8d97a8]"}`}
        style={{ width: `calc(100% / ${k})`, fontSize: "calc(16px / var(--app-zoom, 1))", transform: `translateY(-50%) scale(${k})`, transformOrigin: "left center" }}
      />
    </div>
  );
}

/** 下のメニューの 3 つ（検索・お気に入り・履歴）と、ホームの右上のメニュー（≡）から開くページ（書類・出力・その他） */
export type NavKey = "home" | "history" | "favorites" | "docs" | "account";

/** 白いメニュー（物件・下のメニューのページ）の色 */
const ON = "#133664";
const OFF = "#68738a";
/** ホームの写真の上のメニュー（暗いすりガラス）の色 */
const ON_DARK = "#5aaeff";
const OFF_DARK = "rgba(255,255,255,0.78)";
/** 3つを同じ幅で並べる（幅393pt ÷ 3） */
const NAV_W = ART_W / 3;
/** iPhone のアプリの下のメニューと同じくらいの大きさ（アイコン約24pt・名前11pt） */
const NAV: { key: NavKey; label: string; icon: (color: string, on: boolean) => ReactNode }[] = [
  { key: "home", label: "検索", icon: (c, on) => <Search size={24} strokeWidth={on ? 2.1 : 1.7} absoluteStrokeWidth color={c} /> },
  { key: "favorites", label: "お気に入り", icon: (c, on) => <Star size={24} strokeWidth={on ? 2 : 1.6} absoluteStrokeWidth color={c} fill={on ? c : "none"} /> },
  { key: "history", label: "履歴", icon: (c, on) => <ClockBack size={24} stroke={on ? 2 : 1.6} color={c} /> },
];

/**
 * いちばん下のメニュー（検索・お気に入り・履歴）。dark はホームの写真の上（暗いすりガラス。上の角を丸め、選んでいる所の下に線）。
 * 書類・出力とその他は、ホームの右上のメニュー（≡）から開く
 */
export function BottomNav({ active, onSelect, dark = false }: { active: NavKey; onSelect: (key: NavKey) => void; dark?: boolean }) {
  const on = dark ? ON_DARK : ON;
  const off = dark ? OFF_DARK : OFF;
  return (
    <nav
      aria-label="画面の切り替え"
      className={`app-touch relative shrink-0 overflow-hidden pb-[max(0px,calc(env(safe-area-inset-bottom)-12px))] ${dark ? "rounded-t-[calc(26px*var(--app-zoom,1))] border-t border-white/15 backdrop-blur-xl backdrop-saturate-150" : "border-t border-[#e6ebf2] bg-white/95 backdrop-blur"}`}
      style={dark ? { background: "rgba(22,26,34,0.58)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" } : undefined}
    >
      <div className="relative mx-auto" style={{ width: ART_W, height: 58, zoom: ZOOM }}>
        {NAV.map((n, i) => {
          const sel = n.key === active;
          return (
            <button
              key={n.key}
              onClick={() => onSelect(n.key)}
              aria-current={sel ? "page" : undefined}
              className="nav-item absolute flex flex-col items-center justify-center gap-[4px] active:opacity-60"
              style={{ left: i * NAV_W, top: 0, width: NAV_W, height: 58 }}
            >
              {n.icon(sel ? on : off, sel)}
              <span className="whitespace-nowrap leading-none" style={{ fontSize: 11, color: sel ? on : off, fontWeight: sel ? 600 : 500 }}>
                {n.label}
              </span>
              {dark && sel && <span aria-hidden className="absolute rounded-full" style={{ bottom: 2, width: 34, height: 2.5, background: on }} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
