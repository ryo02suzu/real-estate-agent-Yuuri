"use client";

// 物件の欄（ピン・住所・コピー・お気に入り・共有）、6つのタブ、下の2つのボタン（この情報を共有・レポートを作成）。
// 寸法はデザインの絵（基本情報の1枚目）から測った値
import { ChevronRight, Copy, Database, FileText, House, MapPin, Share, Share2, Star, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { BarsOutline } from "./icons";
import { NAVY } from "./ui";

export type TabKey = "basic" | "around" | "price" | "law" | "hazard" | "deals";

export const TABS: { key: TabKey; label: string; w: number; icon: (c: string) => ReactNode }[] = [
  { key: "basic", label: "基本情報", w: 57.2, icon: (c) => <House size={10.8} strokeWidth={1.1} absoluteStrokeWidth color={c} /> },
  { key: "around", label: "周辺環境", w: 55.4, icon: (c) => <MapPin size={10.5} strokeWidth={1.1} absoluteStrokeWidth color={c} /> },
  { key: "price", label: "相場・取引", w: 63.9, icon: (c) => <BarsOutline size={10.5} stroke={2.2} color={c} /> },
  { key: "law", label: "法令・規制", w: 63.4, icon: (c) => <FileText size={10.5} strokeWidth={1.1} absoluteStrokeWidth color={c} /> },
  { key: "hazard", label: "ハザード", w: 55.3, icon: (c) => <TriangleAlert size={11} strokeWidth={1.1} absoluteStrokeWidth color={c} /> },
  { key: "deals", label: "取引事例", w: 50.7, icon: (c) => <Database size={10} strokeWidth={1.1} absoluteStrokeWidth color={c} /> },
];

/** 紺の涙形のピン（白い丸の地に置く） */
function PinBadge() {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef4fb]" style={{ width: 30.9, height: 30.9 }}>
      <svg viewBox="0 0 24 32" width={12} height={16} aria-hidden>
        <path d="M12 0C5.4 0 0 5.2 0 11.7 0 20 12 32 12 32s12-12 12-20.3C24 5.2 18.6 0 12 0Z" fill={NAVY} />
        <circle cx="12" cy="11.5" r="4.4" fill="#eef4fb" />
      </svg>
    </span>
  );
}

export function PropertyHeader({
  title,
  sub,
  onCopy,
  copied,
  favorite,
  onFavorite,
  onShare,
  icon,
}: {
  title: ReactNode;
  /** 住所の下の小さな行（押すとコピー） */
  sub?: string;
  onCopy?: () => void;
  copied?: boolean;
  favorite?: boolean;
  onFavorite?: () => void;
  onShare?: () => void;
  /** ピンの代わりのアイコン（検索履歴などのページ） */
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start pl-[9.7px] pr-[8.8px] pt-[8.4px]">
      {icon ?? <PinBadge />}
      <div className="ml-[8.3px] min-w-0 flex-1 pt-[5.4px]">
        <h2 className="font-bold leading-[1.3] text-[#111827]" style={{ fontSize: 10.5 }}>
          {title}
        </h2>
        {sub && (
          <button onClick={onCopy} disabled={!onCopy} className="mt-[3.2px] flex max-w-full items-center gap-[4px] text-left leading-[1.25]" style={{ fontSize: 7.86, color: "#6b7789" }}>
            <span className="min-w-0 break-all">{copied ? "コピーしました" : sub}</span>
            {onCopy && <Copy size={7.5} strokeWidth={1.1} absoluteStrokeWidth color="#1b375f" className="shrink-0" />}
          </button>
        )}
      </div>
      {(onFavorite || onShare) && (
        <div className="ml-[6px] flex shrink-0 gap-[5.3px] pt-[3.9px]">
          {onFavorite && (
            <button
              onClick={onFavorite}
              aria-pressed={favorite}
              className="flex items-center justify-center gap-[4.6px] rounded-full border border-[#e3e8ef] bg-white active:bg-[#f2f5f9]"
              style={{ width: 68.7, height: 23.8 }}
            >
              <Star size={9.6} strokeWidth={1.2} absoluteStrokeWidth color={favorite ? "#f5a524" : NAVY} fill={favorite ? "#f5a524" : "none"} />
              <span className="font-medium leading-none" style={{ fontSize: 6.8, color: "#1b3768" }}>
                {favorite ? "保存済み" : "お気に入り"}
              </span>
            </button>
          )}
          {onShare && (
            <button onClick={onShare} className="flex items-center justify-center gap-[3.6px] rounded-full border border-[#e3e8ef] bg-white active:bg-[#f2f5f9]" style={{ width: 39.2, height: 23.8 }}>
              <Share2 size={9} strokeWidth={1.2} absoluteStrokeWidth color={NAVY} />
              <span className="font-medium leading-none" style={{ fontSize: 6.3, color: "#1b3768" }}>
                共有
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TabBar({ tab, onTab, refEl }: { tab: TabKey; onTab: (t: TabKey) => void; refEl?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={refEl} role="tablist" className="mx-[9.2px] flex justify-between" style={{ scrollMarginTop: 8 }}>
      {TABS.map((t) => {
        const on = t.key === tab;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onTab(t.key)}
            className="flex items-center justify-center gap-[5px] rounded-[5px]"
            style={{ width: t.w, height: 25.4, background: on ? NAVY : "#f2f5f9" }}
          >
            {t.icon(on ? "#fff" : "#516379")}
            <span className="whitespace-nowrap leading-none" style={{ fontSize: 6.43, color: on ? "#fff" : "#2b3d58", fontWeight: on ? 600 : 500, marginTop: 1.5 }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 下の2つのボタン */
export function BottomActions({ onShare, onReport, shared }: { onShare: () => void; onReport: () => void; shared?: boolean }) {
  return (
    <div className="mx-[8.8px] mt-[5.5px] flex gap-[5.5px] pb-[1.9px]">
      <button
        onClick={onShare}
        className="flex items-center justify-center gap-[6.5px] rounded-full border-[1.2px] bg-white active:bg-[#f2f5f9]"
        style={{ width: 179.9, height: 26.8, borderColor: NAVY }}
      >
        <Share size={12} strokeWidth={1.3} absoluteStrokeWidth color={NAVY} />
        <span className="font-bold leading-none" style={{ fontSize: 8.18, color: NAVY }}>
          {shared ? "文面をコピーしました" : "この情報を共有"}
        </span>
      </button>
      <button onClick={onReport} className="relative flex items-center justify-center gap-[6.5px] rounded-full active:opacity-90" style={{ width: 178.5, height: 26.8, background: NAVY }}>
        <FileText size={13.5} strokeWidth={1.3} absoluteStrokeWidth color="#fff" />
        <span className="font-bold leading-none text-white" style={{ fontSize: 8.72 }}>
          レポートを作成
        </span>
        <ChevronRight size={10} strokeWidth={1.5} absoluteStrokeWidth color="#fff" className="absolute" style={{ right: 17.4 }} />
      </button>
    </div>
  );
}
