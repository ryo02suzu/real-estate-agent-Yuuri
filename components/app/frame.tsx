"use client";

// スマホの新しい見た目（紺）の枠：上の写真の部分（ロゴ・右上のボタン・見出し・検索窓・最近の検索）、白いカードの台紙、いちばん下のメニュー。
// 寸法はデザインの絵（幅393pt。上のステータスバー24ptは切り落とす）から測った値で、画面の幅に合わせて全体を拡大・縮小する
// （CSS の zoom。値は app/layout.tsx の <head> で決める。components/app/zoom.ts）
import { Bookmark, LoaderCircle, Menu, Search, User, X } from "lucide-react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { HistoryItem } from "@/lib/history";
import { ClockBack, HouseFill, MockLogoMark } from "./icons";
import { NAVY } from "./ui";

/** 絵の幅（pt）。この幅で描いて、画面の幅に合わせて拡大・縮小する */
export const ART_W = 393;
export const ZOOM = "var(--app-zoom, 1)";

const at = (x: number, y: number, w?: number, h?: number): CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  ...(w !== undefined && { width: w }),
  ...(h !== undefined && { height: h }),
});

/** 写真の部分の高さ（白いカードの台紙が下の 21.5pt に重なる） */
const HERO_H = 212;
const OVERLAP = 21.5;

/** 「東京都渋谷区神南一丁目19-11」→「渋谷区神南一丁目19-11」（チップに入るよう都道府県を外す） */
export function shortAddress(a: string): string {
  return a.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "");
}

export type QuickChip = { label: string; onClick: () => void };

export function Hero({
  input,
  setInput,
  onSearch,
  loading,
  recent,
  onPickRecent,
  quick,
  onHome,
  onHistory,
  onFavorites,
  onMenu,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  recent: HistoryItem[];
  onPickRecent: (h: HistoryItem) => void;
  /** 最近の検索が無いときに出す、調べ方のチップ */
  quick: QuickChip[];
  onHome: () => void;
  onHistory: () => void;
  onFavorites: () => void;
  onMenu: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative" style={{ height: HERO_H }}>
      {/* 背景の写真（届くまでは、空の明るさから下に向かって暗くなるグラデーション。左は見出しのために白く） */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#e4edf6_0%,#dfe5ec_32%,#b9c3cd_55%,#7d8c9b_77%,#56687a_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0)_45%,rgba(120,160,210,0.28)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(252,251,249,0.97)_0%,rgba(252,251,249,0.9)_32%,rgba(252,251,249,0)_62%)] [mask-image:linear-gradient(180deg,#000_0%,#000_52%,transparent_70%)]" />
      </div>

      {/* ロゴ（押すとホーム） */}
      <button onClick={onHome} aria-label="MICHILU ホーム" className="absolute" style={at(16, 12, 190, 36)}>
        <MockLogoMark style={at(4.5, 5, 35.3, 25.9)} />
        <span className="font-latin absolute whitespace-nowrap leading-none" style={{ left: 58, top: 5.26, fontSize: 15.2, letterSpacing: 3.95, fontWeight: 500, color: "#0f1b33" }}>
          MICHILU
        </span>
        <span className="absolute whitespace-nowrap leading-none" style={{ left: 56.6, top: 23.74, fontSize: 7.2, letterSpacing: 0.64, color: "#3c4658" }}>
          不動産の現場に、すぐ使える情報を。
        </span>
      </button>

      {/* 右上：検索履歴・保存・メニュー */}
      <TopButton cx={279.1} label="検索履歴" onClick={onHistory}>
        <ClockBack size={14} stroke={1.5} />
      </TopButton>
      <TopButton cx={322.2} label="保存" onClick={onFavorites}>
        <Bookmark size={13} strokeWidth={1.3} absoluteStrokeWidth />
      </TopButton>
      <button onClick={onMenu} aria-label="メニュー" className="absolute flex items-center justify-center rounded-full bg-white/40 text-[#0f1b33] active:bg-white/70" style={at(365.8 - 14.75, 23.5 - 14.75, 29.5, 29.5)}>
        <Menu size={14} strokeWidth={1.3} absoluteStrokeWidth />
      </button>

      {/* 見出し */}
      <h1 className="absolute whitespace-nowrap font-medium" style={{ left: 23.5, top: 60.8, fontSize: 18.4, letterSpacing: 3.22, lineHeight: "24.2px", color: "#142034" }}>
        調べる時間を、
        <br />
        商談の時間に。
      </h1>
      <div className="absolute bg-[#a3aebb]" style={at(24, 114.8, 23.1, 0.8)} />

      {/* 検索窓 */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          inputRef?.current?.blur();
          onSearch();
        }}
        className="absolute flex items-center rounded-full bg-white shadow-[0_2px_6px_rgba(10,25,50,0.12)]"
        style={at(15.8, 121.2, 360.5, 32.6)}
      >
        <Search size={13.5} strokeWidth={1.4} absoluteStrokeWidth color="#18233a" className="ml-[14.6px] shrink-0" />
        <ScaledInput value={input} onChange={setInput} inputRef={inputRef} />
        {input && (
          <button type="button" onClick={() => setInput("")} aria-label="入力を消す" className="mr-[1px] flex shrink-0 items-center justify-center rounded-full bg-[#ececee]" style={{ width: 16.6, height: 16.6 }}>
            <X size={8} strokeWidth={1} absoluteStrokeWidth color="#8e98a6" />
          </button>
        )}
        <button type="submit" aria-label="調べる" disabled={loading} className="ml-[1.2px] mr-[1.3px] flex shrink-0 items-center justify-center rounded-full active:opacity-80" style={{ width: 39.2, height: 28, background: NAVY }}>
          {loading ? <LoaderCircle size={12.5} strokeWidth={1.6} absoluteStrokeWidth color="#fff" className="animate-spin" /> : <Search size={12.5} strokeWidth={1.4} absoluteStrokeWidth color="#fff" />}
        </button>
      </form>

      {/* 最近の検索（無ければ調べ方のチップ） */}
      <div className="absolute flex items-center" style={{ left: 15.8, right: 13.8, top: 163.4, height: 20.7 }}>
        <ClockBack size={12.5} stroke={1.5} color="#e8edf2" style={{ flexShrink: 0 }} />
        <span className="ml-[5.3px] shrink-0 leading-none" style={{ fontSize: 7.1, color: "#e6ebf0", width: 40 }}>
          {recent.length ? "最近の検索" : "調べ方"}
        </span>
        <div className="ml-[4.4px] flex min-w-0 flex-1 gap-[5.3px]">
          {(recent.length
            ? recent.slice(0, 3).map((h) => ({ key: `${h.address}|${h.ll?.join(",") ?? ""}`, label: shortAddress(h.address), onClick: () => onPickRecent(h) }))
            : quick.map((q) => ({ key: q.label, label: q.label, onClick: q.onClick }))
          ).map((c) => (
            <button key={c.key} onClick={c.onClick} className="flex min-w-0 max-w-[108px] items-center justify-center rounded-full bg-white/[0.87] px-[8px] text-[#1a2233] active:bg-white" style={{ height: 20.7 }}>
              <span className="truncate leading-none" style={{ fontSize: 7.25 }}>
                {c.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 検索窓の入力欄。iPhone は 16px より小さい字の入力欄に触れると画面を拡大するので、字を 16px（拡大・縮小の後で）で描いてから
 * transform で絵の大きさ（10pt）に縮める
 */
function ScaledInput({ value, onChange, inputRef }: { value: string; onChange: (v: string) => void; inputRef?: RefObject<HTMLInputElement | null> }) {
  const k = "calc(10.06 * var(--app-zoom, 1) / 16)";
  return (
    <div className="relative ml-[10.3px] mr-[4px] h-full min-w-0 flex-1 overflow-hidden">
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoComplete="street-address"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="住所・地番を入力（例：渋谷区神南1-19-11）"
        aria-label="住所・地番"
        className="absolute left-0 top-1/2 bg-transparent font-medium text-[#121a2b] outline-none placeholder:font-normal placeholder:text-[#8d97a8] [&::-webkit-search-cancel-button]:hidden"
        style={{ width: `calc(100% / ${k})`, fontSize: "calc(16px / var(--app-zoom, 1))", transform: `translateY(-50%) scale(${k})`, transformOrigin: "left center" }}
      />
    </div>
  );
}

function TopButton({ cx, label, onClick, children }: { cx: number; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="absolute flex flex-col items-center" style={{ left: cx - 22, top: 9.45, width: 44 }}>
      <span className="flex items-center justify-center rounded-full bg-white/40 text-[#0f1b33] active:bg-white/70" style={{ width: 29.5, height: 29.5 }}>
        {children}
      </span>
      <span className="mt-[3.7px] whitespace-nowrap leading-none" style={{ fontSize: 6.4, color: "#1a2840" }}>
        {label}
      </span>
    </button>
  );
}

/** 写真の部分に重なる台紙と白いカード */
export function SheetFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-t-[18px] bg-[#f7f9fd] px-[6px] pb-[2px] pt-[7px]" style={{ marginTop: -OVERLAP }}>
      <div className="rounded-[14px] bg-white pb-[2px]">{children}</div>
    </div>
  );
}

export type NavKey = "home" | "history" | "favorites" | "account";

const NAV: { key: NavKey; label: string; cx: number; icon: (on: boolean) => ReactNode }[] = [
  { key: "home", label: "ホーム", cx: 49.4, icon: (on) => <HouseFill size={15.5} color={on ? "#1b3563" : "#5f697c"} /> },
  { key: "history", label: "検索履歴", cx: 146.2, icon: (on) => <ClockBack size={15.5} stroke={on ? 1.8 : 1.45} color={on ? "#1b3563" : "#5f697c"} /> },
  { key: "favorites", label: "お気に入り", cx: 247.7, icon: (on) => <Bookmark size={15} strokeWidth={on ? 1.7 : 1.3} absoluteStrokeWidth color={on ? "#1b3563" : "#5f697c"} fill={on ? "#1b3563" : "none"} /> },
  { key: "account", label: "マイページ", cx: 345.3, icon: (on) => <User size={15} strokeWidth={on ? 1.7 : 1.3} absoluteStrokeWidth color={on ? "#1b3563" : "#5f697c"} /> },
];

/** いちばん下のメニュー（ホーム・検索履歴・お気に入り・マイページ） */
export function BottomNav({ active, onSelect }: { active: NavKey; onSelect: (key: NavKey) => void }) {
  return (
    <nav aria-label="メニュー" className="shrink-0 overflow-hidden bg-white pb-[max(0px,calc(env(safe-area-inset-bottom)-12px))] shadow-[0_-1px_6px_rgba(16,40,80,0.06)]">
      <div className="relative mx-auto" style={{ width: ART_W, height: 51, zoom: ZOOM }}>
        {NAV.map((n) => {
          const on = n.key === active;
          return (
            <button
              key={n.key}
              onClick={() => onSelect(n.key)}
              aria-current={on ? "page" : undefined}
              className="absolute flex flex-col items-center pt-[7.4px]"
              style={{ left: n.cx - 40, top: 0, width: 80, height: 51 }}
            >
              {n.icon(on)}
              <span className="leading-none" style={{ marginTop: on ? 5.2 : 4.7, fontSize: on ? 7.3 : 7.44, color: on ? "#1b3563" : "#6a7385", fontWeight: on ? 700 : 400 }}>
                {n.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
