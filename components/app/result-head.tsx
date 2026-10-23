"use client";

// 物件の画面の上の部分：街の写真の帯（写真はあとで届くので今は NO IMAGE。戻る・お気に入り・共有のボタンと、住所の見出し。
// 住所は押すとコピー）、その帯に重ねる6つのタブの切り替え（iPhone のセグメントと同じ形。横にすべらせず、6つが同じ幅で並ぶ）、
// 場所の注意（番地まで一致しないなど）。押せる所は iPhone と同じ 36〜44pt
import { ArrowLeft, Check, ChevronDown, Copy, Info, Share2, Star, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { HEAD, NoImage, WARN } from "./r-ui";
import { NAVY } from "./ui";

export type TabKey = "basic" | "around" | "price" | "law" | "hazard" | "deals";

export const TABS: { key: TabKey; label: string; long: string }[] = [
  { key: "basic", label: "基本", long: "基本情報" },
  { key: "around", label: "周辺", long: "周辺環境" },
  { key: "price", label: "相場", long: "相場" },
  { key: "law", label: "法令", long: "法令・規制" },
  { key: "hazard", label: "ハザード", long: "ハザード" },
  { key: "deals", label: "取引", long: "取引事例" },
];

/** 写真の帯の高さと、タブの切り替えを重ねる量 */
export const BAND_H = 108;
export const BAND_OVERLAP = 24;

function Round({ onClick, label, pressed, children }: { onClick: () => void; label: string; pressed?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={pressed} className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-white/90 shadow-[0_2px_8px_rgba(10,30,60,0.18)] active:bg-white">
      {children}
    </button>
  );
}

/** 街の写真の帯：戻る・お気に入り・共有と、住所（押すとコピー） */
export function ResultBand({ title, sub, onBack, onCopy, copied, favorite, onFavorite, onShare }: { title: string; sub: string; onBack: () => void; onCopy: () => void; copied: boolean; favorite: boolean; onFavorite: () => void; onShare: () => void }) {
  return (
    <div className="relative overflow-hidden" style={{ height: BAND_H }}>
      <NoImage top size={10} className="absolute inset-0" />
      {/* 写真の下を暗くして、白い字を読めるようにする */}
      <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,25,50,0.12) 0%, rgba(10,25,50,0) 28%, rgba(10,25,50,0.1) 50%, rgba(10,25,50,0.68) 100%)" }} />
      <div className="absolute left-[8px] right-[8px] flex items-center gap-[8px]" style={{ top: 6, height: 36 }}>
        <Round onClick={onBack} label="ホームに戻る">
          <ArrowLeft size={21} strokeWidth={2} absoluteStrokeWidth color={HEAD} />
        </Round>
        <span className="flex-1" />
        <Round onClick={onFavorite} label={favorite ? "お気に入りから外す" : "お気に入りに保存"} pressed={favorite}>
          <Star size={20} strokeWidth={1.8} absoluteStrokeWidth color={favorite ? "#f5a524" : HEAD} fill={favorite ? "#f5a524" : "none"} />
        </Round>
        <Round onClick={onShare} label="共有">
          <Share2 size={19} strokeWidth={1.8} absoluteStrokeWidth color={HEAD} />
        </Round>
      </div>
      <button onClick={onCopy} aria-label="住所をコピー" className="absolute left-[16px] right-[16px] text-left" style={{ bottom: BAND_OVERLAP + 8 }}>
        <span className="block truncate font-bold leading-[1.2] text-white" style={{ fontSize: title.length > 15 ? 18 : 20, textShadow: "0 1px 8px rgba(0,0,0,0.4)" }}>
          {title}
        </span>
        <span className="mt-[3px] flex items-center gap-[4px] leading-none" style={{ fontSize: 12, color: copied ? "#a6f0c6" : "rgba(255,255,255,0.88)", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
          <span className="truncate">{copied ? "住所をコピーしました" : sub}</span>
          {copied ? <Check size={12} strokeWidth={2.4} absoluteStrokeWidth className="shrink-0" /> : <Copy size={12} strokeWidth={1.8} absoluteStrokeWidth className="shrink-0" />}
        </span>
      </button>
    </div>
  );
}

/** 6つのタブの切り替え（写真の帯の下に重ねる。選んだものは紺の丸が動く） */
export function TabSegments({ tab, onTab }: { tab: TabKey; onTab: (t: TabKey) => void }) {
  const idx = Math.max(
    0,
    TABS.findIndex((t) => t.key === tab),
  );
  return (
    <div role="tablist" aria-label="物件の情報" className="relative mx-[16px] flex rounded-full bg-white p-[3px] shadow-[0_6px_18px_rgba(20,45,85,0.14)]" style={{ height: 40, marginTop: -BAND_OVERLAP }}>
      <span aria-hidden className="absolute rounded-full transition-transform duration-200 ease-out" style={{ top: 3, bottom: 3, left: 3, width: `calc((100% - 6px) / ${TABS.length})`, transform: `translateX(${idx * 100}%)`, background: NAVY, boxShadow: "0 3px 10px rgba(15,47,95,0.28)" }} />
      {TABS.map((t) => {
        const on = t.key === tab;
        return (
          <button key={t.key} role="tab" aria-selected={on} aria-label={t.long} onClick={() => onTab(t.key)} className="relative z-[1] flex-1 whitespace-nowrap rounded-full font-semibold leading-none transition-colors duration-200" style={{ fontSize: 12.5, color: on ? "#fff" : "#2b3a55" }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 場所の注意（番地まで一致しない・地番が見つからない・地図で選んだ地点）と「場所を直す」。
 * ふだんは1行（short）で、押すと全文（children）。1画面に収めるため。open で最初から全文（地番の候補のボタンがあるとき）
 */
export function PlaceBanner({ warn, short, children, onFix, open: openFirst = false }: { warn: boolean; short: ReactNode; children: ReactNode; onFix: () => void; open?: boolean }) {
  const [open, setOpen] = useState(openFirst);
  return (
    <div className="mx-[16px] mt-[8px] flex items-start gap-[8px] rounded-[12px] px-[12px] py-[8px]" style={{ background: warn ? "#fdf1ec" : "#eef4fb", color: warn ? WARN : "#1c3a6a" }}>
      {warn ? <TriangleAlert size={15} strokeWidth={1.8} absoluteStrokeWidth className="mt-[6px] shrink-0" /> : <Info size={15} strokeWidth={1.8} absoluteStrokeWidth className="mt-[6px] shrink-0" />}
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 flex-1 py-[4px] text-left leading-[1.45]" style={{ fontSize: 12.5 }}>
        {open ? (
          children
        ) : (
          <span className="flex items-center gap-[3px]">
            <span className="min-w-0 truncate">{short}</span>
            <ChevronDown size={13} strokeWidth={2} absoluteStrokeWidth className="shrink-0 opacity-70" />
          </span>
        )}
      </button>
      <button onClick={onFix} className="mt-[0px] shrink-0 rounded-full border border-current px-[10px] py-[6px] font-semibold leading-none" style={{ fontSize: 12 }}>
        場所を直す
      </button>
    </div>
  );
}
