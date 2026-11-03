"use client";

// 物件の画面の上の部分（街の模型の上に重ねる。components/app/property-scene.tsx）：戻る・お気に入り・共有のすりガラスの丸いボタン、
// 地番（住所で調べたときは住所）の大きな見出しと、住所（押すとコピー）・面積・推定の位置の札。上から順にふわっと浮き上がる。
// その下のシートの6つのタブの切り替え（概要・道路・法令・ハザード・周辺・相場。お気に入りの並べ方と同じ、すりガラスに白い札が滑る形）と、
// 場所の注意（番地まで一致しないなど）。押せる所は iPhone と同じ 36〜44pt
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Info, Share2, SpellCheck, TriangleAlert } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import { changedMarks } from "@/lib/roadmap";
import { HIT, LIGHT_GLASS, SHADOW } from "./home";
import { FavStar } from "./star";

export type TabKey = "basic" | "road" | "law" | "hazard" | "around" | "price";

export const TABS: { key: TabKey; label: string; long: string }[] = [
  { key: "basic", label: "概要", long: "概要" },
  { key: "road", label: "道路", long: "道路" },
  { key: "law", label: "法令", long: "法令・規制" },
  { key: "hazard", label: "ハザード", long: "ハザード" },
  { key: "around", label: "周辺", long: "周辺環境" },
  { key: "price", label: "相場", long: "相場・取引事例" },
];

/** 前に開いていたタブ（前の版の「基本」「取引」も読む） */
export function tabOf(key: string | undefined): TabKey | undefined {
  if (key === "deals") return "price";
  return TABS.some((t) => t.key === key) ? (key as TabKey) : undefined;
}

/** すりガラスの丸いボタン（ホーム・お気に入りの右上のメニューと同じ） */
function Round({ onClick, label, pressed, children }: { onClick: () => void; label: string; pressed?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={pressed} className="press flex shrink-0 items-center justify-center rounded-full" style={{ ...LIGHT_GLASS, width: 44, height: 44, minWidth: HIT, minHeight: HIT }}>
      {children}
    </button>
  );
}

/** 見出しの下の小さな札（面積・推定の位置など） */
export function HeroChip({ children, onClick, tone = "plain", icon }: { children: ReactNode; onClick?: () => void; tone?: "plain" | "gold" | "warn"; icon?: ReactNode }) {
  const color = tone === "gold" ? "#ffe2a3" : tone === "warn" ? "#ffc27a" : "#fff";
  const cls = "press inline-flex h-[30px] max-w-full items-center gap-[5px] rounded-full px-[11px] leading-none";
  const style = { ...LIGHT_GLASS, fontSize: 12.5, color, textShadow: "none" };
  return onClick ? (
    <button onClick={onClick} className={cls} style={style}>
      {icon}
      <span className="truncate">{children}</span>
    </button>
  ) : (
    <span className={cls} style={style}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * 見出し：上のボタンと、地番（または住所）・住所・札。topRef は上のボタンの列、textRef は字の箱（模型の札を重ねない所）。
 * named は地図の板からつながる名前を持つか（地図を開いている間は板の方が持つので false）
 */
export function PropertyHero({
  eyebrow,
  lot,
  title,
  address,
  onCopy,
  copied,
  chips,
  more,
  note,
  onBack,
  backLabel = "ホームに戻る",
  favorite,
  onFavorite,
  onShare,
  named,
  topRef,
  textRef,
}: {
  eyebrow: string;
  /** 地番（地番で調べた・筆が分かったとき） */
  lot?: string;
  /** 地番が無いときの大きな見出し（住所） */
  title: string;
  /** 住所の行（押すとコピー） */
  address: string;
  onCopy: () => void;
  copied: boolean;
  chips?: ReactNode;
  /** 札を押したときの説明（推定の位置など） */
  more?: ReactNode;
  /** 見出しのすぐ下の小さな一言（住所の書き間違いを直して出した：FixNote） */
  note?: ReactNode;
  onBack: () => void;
  /** 戻るボタンの読み上げの名前（履歴から開いたときは「履歴に戻る」） */
  backLabel?: string;
  favorite: boolean;
  onFavorite: () => void;
  onShare: () => void;
  named: boolean;
  topRef: RefObject<HTMLDivElement | null>;
  textRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div ref={topRef} className="pv-top relative z-[2] flex items-center gap-[10px] px-[14px] pt-[8px]">
        <Round onClick={onBack} label={backLabel}>
          <ChevronLeft size={24} strokeWidth={2} absoluteStrokeWidth color="#fff" />
        </Round>
        <span className="flex-1" />
        <Round onClick={onFavorite} label={favorite ? "お気に入りから外す" : "お気に入りに保存"} pressed={favorite}>
          <FavStar on={favorite} size={21} off="#fff" />
        </Round>
        <Round onClick={onShare} label="共有">
          <Share2 size={19} strokeWidth={1.9} absoluteStrokeWidth color="#fff" />
        </Round>
      </div>
      <div ref={textRef} className="pv-title relative z-[2] mx-[20px] mt-[10px] w-fit max-w-[calc(100%-40px)] text-white" style={{ textShadow: SHADOW, viewTransitionName: named ? "place-panel" : undefined }}>
        <p className="pv-rise flex items-center gap-[8px] leading-none" style={{ fontSize: 12.5, letterSpacing: 0.8, color: "rgba(255,255,255,0.8)" }}>
          <span aria-hidden className="pv-ping relative inline-block shrink-0 rounded-full" style={{ width: 7, height: 7, background: "#f4c25a" }} />
          {eyebrow}
        </p>
        {lot ? (
          <h1 className="pv-rise mt-[8px] flex items-baseline gap-[10px] leading-none" style={{ viewTransitionName: named ? "place-title" : undefined }}>
            <span className="font-semibold" style={{ fontSize: 14, letterSpacing: 2, color: "#ffe2a3" }}>
              地番
            </span>
            <span className="truncate font-semibold" style={{ fontSize: lot.length > 9 ? 34 : 42, letterSpacing: 0.4, fontVariantNumeric: "tabular-nums" }}>
              {lot}
            </span>
          </h1>
        ) : (
          <h1 className="pv-rise mt-[8px] font-bold leading-[1.2]" style={{ fontSize: title.length > 14 ? 22 : 26, letterSpacing: 0.4, viewTransitionName: named ? "place-title" : undefined }}>
            {title}
          </h1>
        )}
        {note}
        {/* 地番の見出しのときは住所の行、住所が見出しのときは同じ住所を繰り返さず「住所をコピー」だけ */}
        <button onClick={onCopy} aria-label="住所をコピー" className="pv-rise mt-[8px] flex max-w-full items-center gap-[6px] text-left leading-[1.3]" style={{ fontSize: 14, color: copied ? "#a6f0c6" : "rgba(255,255,255,0.92)", minHeight: 24 }}>
          <span className="truncate font-medium">{copied ? "住所をコピーしました" : lot ? address : "住所をコピー"}</span>
          {copied ? <Check size={14} strokeWidth={2.4} absoluteStrokeWidth className="shrink-0" /> : <Copy size={13} strokeWidth={1.9} absoluteStrokeWidth className="shrink-0 opacity-80" />}
        </button>
        {chips && <div className="pv-rise mt-[8px] flex flex-wrap gap-[6px]">{chips}</div>}
        {more}
      </div>
    </>
  );
}

/** 直した字を金色で（「南大通り」の「通」） */
function Marked({ from, to }: { from: string; to: string }) {
  const marks = changedMarks(from, to);
  return (
    <>
      {[...to].map((c, i) =>
        marks[i] ? (
          <b key={i} className="font-bold" style={{ color: "#ffd98a" }}>
            {c}
          </b>
        ) : (
          c
        ),
      )}
    </>
  );
}

/**
 * 住所の書き間違いを直して出したことの小さな一言（Google の「次の検索結果を表示しています」と同じ）。
 * 「南大道り」→「南大通り」で表示しています（直した字は金色）と、入れたとおりに探すボタン（直さずに探す）。
 * literal：入れたとおりに探したあと（「入れたとおりに表示しています」と、直した住所に戻すボタン）
 */
export function FixNote({ from, to, onSwitch, literal = false }: { from: string; to: string; onSwitch?: () => void; literal?: boolean }) {
  const say = literal ? `入れたとおりの「${from}」で表示しています` : `「${from}」を「${to}」に直して表示しています`;
  return (
    <p role="note" aria-label={say} className="pv-rise mt-[7px] flex max-w-full flex-wrap items-center gap-x-[8px] gap-y-[1px] leading-[1.45]" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.86)" }}>
      <span aria-hidden className="inline-flex min-w-0 items-center gap-[5px]">
        <SpellCheck size={14} strokeWidth={2} absoluteStrokeWidth className="shrink-0" color="#ffd98a" />
        {literal ? (
          <span className="min-w-0">
            入れたとおり（<span className="font-semibold text-white">{from}</span>）で表示
          </span>
        ) : (
          <span className="min-w-0">
            <span style={{ color: "rgba(255,255,255,0.76)" }}>{from}</span>
            <span className="mx-[4px] opacity-70">→</span>
            <span className="font-semibold text-white">
              <Marked from={from} to={to} />
            </span>
            <span className="ml-[2px]">で表示</span>
          </span>
        )}
      </span>
      {onSwitch && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSwitch();
          }}
          aria-label={literal ? `直した「${to}」で探す` : `直さずに、入れたとおりの「${from}」で探す`}
          className="press inline-flex min-h-[28px] items-center gap-[1px] font-semibold underline decoration-white/40 underline-offset-[3px]"
          style={{ color: "#fff" }}
        >
          {literal ? `「${to}」で探す` : "入れたとおりに探す"}
          <ChevronRight size={13} strokeWidth={2.2} absoluteStrokeWidth className="opacity-70" />
        </button>
      )}
    </p>
  );
}

/** 6つのタブの切り替え（すりガラスの上を白い札が滑る。お気に入りの並べ方と同じ形） */
export function TabSegments({ tab, onTab }: { tab: TabKey; onTab: (t: TabKey) => void }) {
  const idx = Math.max(
    0,
    TABS.findIndex((t) => t.key === tab),
  );
  return (
    <div role="tablist" aria-label="物件の情報" className="relative mx-[14px] flex rounded-full p-[3px]" style={{ height: 42, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
      <span aria-hidden className="pv-thumb absolute rounded-full" style={{ top: 3, bottom: 3, left: 3, width: `calc((100% - 6px) / ${TABS.length})`, transform: `translateX(${idx * 100}%)` }} />
      {TABS.map((t) => {
        const on = t.key === tab;
        return (
          <button key={t.key} role="tab" aria-selected={on} aria-label={t.long} onClick={() => onTab(t.key)} className="relative z-[1] flex-1 whitespace-nowrap rounded-full font-semibold leading-none transition-colors duration-300" style={{ fontSize: 12.5, color: on ? "#1b3f73" : "rgba(255,255,255,0.86)" }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 場所の注意（番地まで一致しない・地番が見つからない・地図で選んだ地点）と「場所を直す」。
 * ふだんは1行（short）で、押すと全文（children）。open で最初から全文（地番の候補のボタンがあるとき）
 */
export function PlaceBanner({ warn, short, children, onFix, open: openFirst = false }: { warn: boolean; short: ReactNode; children: ReactNode; onFix: () => void; open?: boolean }) {
  const [open, setOpen] = useState(openFirst);
  return (
    <div className="mx-[14px] mt-[10px] flex items-start gap-[8px] rounded-[16px] px-[12px] py-[8px]" style={{ background: warn ? "rgba(255,183,94,0.12)" : "rgba(116,187,255,0.12)", border: `1px solid ${warn ? "rgba(255,183,94,0.3)" : "rgba(116,187,255,0.28)"}`, color: warn ? "#ffd3a0" : "#cfe5ff" }}>
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
      <button onClick={onFix} className="press mt-[0px] shrink-0 rounded-full border border-current px-[10px] py-[6px] font-semibold leading-none" style={{ fontSize: 12 }}>
        場所を直す
      </button>
    </div>
  );
}
