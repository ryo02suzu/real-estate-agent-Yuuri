"use client";

// 物件の画面（街の模型の上のすりガラスのシート）で使う小さな部品。ホーム・お気に入り・書類・出力と同じ見た目：白い字、
// 札は少し明るい透明のタイル（components/app/docs.tsx の小さなボタンと同じ）、見出しは薄い白の字（favorites.tsx の LABEL）、
// いちばんの操作は金色のアイコンのすりガラスのボタン（docs.tsx の .docs-main）。色は暗い地の上で読める明るさにしてある。
// 寸法は幅393ptの値（1px = 1pt。画面の幅に合わせて拡大・縮小する）
import { ChevronRight, ExternalLink } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Tone } from "@/lib/app/hazard-level";
import type { StatusKey } from "./tokens";

/** 字と線の色 */
export const G = {
  text: "#ffffff",
  sub: "rgba(255,255,255,0.72)",
  faint: "rgba(255,255,255,0.52)",
  line: "rgba(255,255,255,0.12)",
  gold: "#ffd36b",
  warn: "#ffc27a",
  red: "#ffb4a6",
  green: "#8ff0c8",
  blue: "#a9d4ff",
  chevron: "rgba(255,255,255,0.5)",
} as const;

/** 札（少し明るい透明のタイル。ぼかしはシートの1枚だけにして、札には付けない） */
export const TILE: CSSProperties = { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" };
/** 目立たせる札（要注意：橙、金：調べた土地、青：水） */
export const TILE_WARN: CSSProperties = { background: "linear-gradient(180deg, rgba(255,183,94,0.16), rgba(255,183,94,0.05))", border: "1px solid rgba(255,183,94,0.34)" };
export const TILE_GOLD: CSSProperties = { background: "linear-gradient(160deg, rgba(255,201,74,0.15), rgba(255,201,74,0.03) 65%), rgba(255,255,255,0.06)", border: "1px solid rgba(255,201,74,0.3)" };
export const TILE_BLUE: CSSProperties = { background: "linear-gradient(160deg, rgba(116,187,255,0.16), rgba(116,187,255,0.03) 70%), rgba(255,255,255,0.06)", border: "1px solid rgba(116,187,255,0.3)" };
/** 札の角の丸さ */
const R = "rounded-[18px]";
/** 数字の字（すっきりした数字。等幅） */
export const NUM: CSSProperties = { fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em" };

/** 区分の印の色（暗い地の上） */
export const GTONE: Record<Tone, { bg: string; fg: string }> = {
  out: { bg: "rgba(69,211,158,0.16)", fg: "#8ff0c8" },
  near: { bg: "rgba(69,211,158,0.16)", fg: "#8ff0c8" },
  caution: { bg: "rgba(255,214,102,0.16)", fg: "#ffe08a" },
  mid: { bg: "rgba(255,170,90,0.2)", fg: "#ffc58f" },
  high: { bg: "rgba(255,120,100,0.22)", fg: "#ffb4a6" },
  none: { bg: "rgba(255,255,255,0.1)", fg: "rgba(255,255,255,0.75)" },
  map: { bg: "rgba(116,187,255,0.16)", fg: "#a9d4ff" },
};
/** 調査の状況の札の色（暗い地の上。components/app/tokens.ts の STATUS と同じ意味） */
export const GSTATUS: Record<StatusKey | "loading", { color: string; bg: string }> = {
  auto: { color: "#cfe0ff", bg: "rgba(160,190,255,0.14)" },
  official: { color: "#a9d4ff", bg: "rgba(116,187,255,0.16)" },
  confirmed: { color: "#8ff0c8", bg: "rgba(69,211,158,0.16)" },
  partial: { color: "#8ff0c8", bg: "rgba(69,211,158,0.12)" },
  unconfirmed: { color: "rgba(255,255,255,0.7)", bg: "rgba(255,255,255,0.08)" },
  failed: { color: "#ffc58f", bg: "rgba(255,170,90,0.16)" },
  loading: { color: "rgba(255,255,255,0.6)", bg: "rgba(255,255,255,0.08)" },
};

/** 見出し（薄い白の字）と右の「もっと見る ›」 */
export function GHead({ title, note, more = "もっと見る", onMore, className = "" }: { title: string; note?: string; more?: string; onMore?: () => void; className?: string }) {
  return (
    <div className={`flex min-h-[32px] items-center justify-between gap-[8px] px-[4px] ${className}`}>
      <div className="flex min-w-0 items-baseline gap-[8px]">
        <h2 className="shrink-0 font-semibold leading-none" style={{ fontSize: 14, letterSpacing: 1.2, color: "rgba(255,255,255,0.66)" }}>
          {title}
        </h2>
        {note && (
          <span className="truncate leading-none" style={{ fontSize: 12, color: G.faint }}>
            {note}
          </span>
        )}
      </div>
      {onMore && (
        <button onClick={onMore} className="press -mr-[6px] flex h-[40px] shrink-0 items-center px-[6px]" style={{ fontSize: 13.5, color: "rgba(255,255,255,0.8)" }}>
          {more}
          <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth />
        </button>
      )}
    </div>
  );
}

/** 札（押せる・外のページ・ただの箱） */
export function GCard({ children, onClick, href, style, className = "", label }: { children: ReactNode; onClick?: () => void; href?: string; style?: CSSProperties; className?: string; label?: string }) {
  const cls = `${R} block w-full text-left ${className}`;
  const st = { ...TILE, ...style };
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" aria-label={label} className={`press-soft ${cls} active:brightness-125`} style={st}>
        {children}
      </a>
    );
  if (onClick)
    return (
      <button onClick={onClick} aria-label={label} className={`press-soft ${cls} active:brightness-125`} style={st}>
        {children}
      </button>
    );
  return (
    <div className={cls} style={st}>
      {children}
    </div>
  );
}

/** 値の札（2列の表の1マス）：小さな名前・値・1行の補足。押せるものは右上に › */
export function GCell({ label, value, sub, onClick, warn, height = 66 }: { label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void; warn?: boolean; height?: number }) {
  const body = (
    <>
      <span className="block truncate leading-none" style={{ fontSize: 11.5, color: G.faint }}>
        {label}
      </span>
      <span className="mt-[6px] block truncate font-semibold leading-[1.25]" style={{ fontSize: 16, color: warn ? G.warn : G.text }}>
        {value}
      </span>
      {sub !== undefined && (
        <span className="mt-[3px] block truncate leading-none" style={{ fontSize: 11, color: G.faint, minHeight: 11 }}>
          {sub}
        </span>
      )}
      {onClick && <ChevronRight size={14} strokeWidth={2} absoluteStrokeWidth color={G.chevron} className="absolute right-[8px] top-[9px]" />}
    </>
  );
  const cls = `relative block min-w-0 overflow-hidden rounded-[16px] px-[12px] text-left`;
  const style: CSSProperties = { ...(warn ? TILE_WARN : TILE), height, paddingTop: 9, paddingBottom: 7 };
  return onClick ? (
    <button onClick={onClick} className={`${cls} press-soft w-full active:brightness-125`} style={style}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

/** 一覧の1行（丸いアイコン・名前・説明・右の値）。押せる行は右に ›、外のページに行く行は ↗。札の中に重ねて使う */
export function GRow({ icon, iconBg = "rgba(255,255,255,0.1)", title, sub, right, rightColor = G.text, onClick, href, minH = 56, line = true }: { icon?: ReactNode; iconBg?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; rightColor?: string; onClick?: () => void; href?: string; minH?: number; line?: boolean }) {
  const body = (
    <>
      {icon && (
        <span className="flex shrink-0 items-center justify-center rounded-[12px]" style={{ width: 36, height: 36, background: iconBg }}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 15, color: G.text }}>
          {title}
        </span>
        {sub && (
          <span className="mt-[2px] block truncate leading-[1.35]" style={{ fontSize: 12, color: G.faint }}>
            {sub}
          </span>
        )}
      </span>
      {right && (
        <span className="shrink-0 whitespace-nowrap text-right font-semibold leading-none" style={{ fontSize: 13, color: rightColor }}>
          {right}
        </span>
      )}
      {href ? <ExternalLink size={15} strokeWidth={1.8} absoluteStrokeWidth color={G.chevron} className="shrink-0" /> : onClick ? <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color={G.chevron} className="shrink-0" /> : null}
    </>
  );
  const cls = `flex w-full items-center gap-[12px] px-[12px] py-[8px] text-left ${line ? "border-t border-white/10 first:border-t-0" : ""}`;
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`${cls} active:bg-white/5`} style={{ minHeight: minH }}>
        {body}
      </a>
    );
  return onClick ? (
    <button onClick={onClick} className={`${cls} active:bg-white/5`} style={{ minHeight: minH }}>
      {body}
    </button>
  ) : (
    <div className={cls} style={{ minHeight: minH }}>
      {body}
    </div>
  );
}

/** いちばんの操作（すりガラスのまま少し明るく、金色に光るアイコン。書類・出力の大きなボタンと同じ） */
export function GMain({ icon, title, sub, onClick, href }: { icon: ReactNode; title: ReactNode; sub?: ReactNode; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <span className="relative flex shrink-0 items-center justify-center rounded-full" style={{ width: 38, height: 38, background: "rgba(255,201,74,0.16)", border: "1px solid rgba(255,201,74,0.42)", boxShadow: "0 0 14px rgba(255,190,70,0.28)", color: G.gold }}>
        {icon}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate font-semibold leading-[1.25]" style={{ fontSize: 16, color: G.text }}>
          {title}
        </span>
        {sub && (
          <span className="mt-[3px] block truncate leading-[1.3]" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            {sub}
          </span>
        )}
      </span>
      {href ? <ExternalLink size={17} strokeWidth={1.9} absoluteStrokeWidth color="rgba(255,255,255,0.75)" className="relative shrink-0" /> : <ChevronRight size={18} strokeWidth={1.9} absoluteStrokeWidth color="rgba(255,255,255,0.75)" className="relative shrink-0" />}
    </>
  );
  const cls = "docs-main press-soft press relative flex w-full items-center gap-[12px] overflow-hidden rounded-[18px] py-[10px] pl-[12px] pr-[12px] text-left";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={{ minHeight: 64 }}>
      {body}
    </a>
  ) : (
    <button onClick={onClick} className={cls} style={{ minHeight: 64 }}>
      {body}
    </button>
  );
}

/** 小さな丸いボタン（絞り込み・外の地図など）。on で白く光る */
export function GPill({ children, onClick, href, icon, on = false, className = "" }: { children: ReactNode; onClick?: () => void; href?: string; icon?: ReactNode; on?: boolean; className?: string }) {
  const cls = `press flex h-[36px] shrink-0 items-center gap-[5px] rounded-full px-[12px] font-semibold leading-none ${className}`;
  const style: CSSProperties = on ? { fontSize: 13, background: "rgba(255,255,255,0.94)", color: "#1b3f73", boxShadow: "0 4px 14px rgba(5,15,35,0.22)" } : { fontSize: 13, color: "rgba(255,255,255,0.92)", ...TILE };
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
      {icon}
      {children}
      <ExternalLink size={12} strokeWidth={1.9} absoluteStrokeWidth className="opacity-70" />
    </a>
  ) : (
    <button onClick={onClick} className={cls} style={style}>
      {icon}
      {children}
    </button>
  );
}

/** 区分の印（区域外=緑、注意=黄、高い=赤、データなし=灰、地図で確認=青） */
export function GBadge({ tone, children, size = 12 }: { tone: Tone; children: ReactNode; size?: number }) {
  const t = GTONE[tone];
  return (
    <span className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-[8px] font-bold leading-none" style={{ background: t.bg, color: t.fg, height: 22, fontSize: size }}>
      {children}
    </span>
  );
}

/** 3つ並べる小さな数字の札 */
export function GStat({ label, value, unit, note, small = false }: { label: string; value: string; unit?: string; note?: string; small?: boolean }) {
  return (
    <div className="min-w-0 rounded-[16px] px-[10px] py-[9px]" style={TILE}>
      <p className="truncate leading-none" style={{ fontSize: 11, color: G.faint }}>
        {label}
      </p>
      <p className="mt-[7px] flex items-baseline truncate font-semibold leading-none" style={{ fontSize: small ? 15 : 17.5, color: G.text, height: 18, ...NUM }}>
        {value}
        {unit && (
          <span className="ml-[2px] font-medium" style={{ fontSize: 10.5, color: G.sub }}>
            {unit}
          </span>
        )}
      </p>
      <p className="mt-[6px] truncate leading-none" style={{ fontSize: 10.5, color: G.faint, minHeight: 11 }}>
        {note}
      </p>
    </div>
  );
}

/** 薄い注記（出典など） */
export function GNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`px-[4px] leading-[1.55] ${className}`} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
      {children}
    </p>
  );
}

/** 読み込み中・データなしの薄い字 */
export function GFaint({ children = "確認中…" }: { children?: ReactNode }) {
  return (
    <span className="font-normal" style={{ color: G.faint }}>
      {children}
    </span>
  );
}
