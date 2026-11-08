"use client";

// PC の「調査デスク」の枠：上の帯（ロゴ・検索欄・時間帯・対応エリア・使い方・設定）、左の細い列（検索・いまの物件・お気に入り・履歴・
// 書類・比較・使い方・表示）、物件を調べる前の真ん中のカード（ホーム）、調べている・通信の失敗の一言
import Image from "next/image";
import { CircleHelp, Columns2, FileText, History, LoaderCircle, MapPin, Search, Settings, SlidersHorizontal, Star, TriangleAlert, X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import type { DeskTod } from "@/lib/app/desk";
import { TOD_LABEL, TODS } from "@/lib/app/desk";
import { placeTitle } from "@/lib/app/scene";
import { historyKey, type HistoryItem } from "@/lib/history";
import { MUNICIPALITIES } from "@/lib/roadmap";
import { Wordmark } from "../header";

const MARK = { src: "/logo-mark.webp", w: 204, h: 202 };
/** 端末が Mac か（検索欄の近道の字を ⌘K にする。ほかは Ctrl+K） */
export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export type RailKey = "home" | "favorites" | "history" | "docs" | "compare" | "guide" | "settings";

export function Topbar({
  input,
  setInput,
  loading,
  onSearch,
  onHome,
  tod,
  todAuto,
  onTod,
  onOpen,
  open,
  mac,
}: {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onSearch: () => void;
  onHome: () => void;
  tod: DeskTod;
  /** 時計に合わせている（押すと上の帯で選ぶに変わる） */
  todAuto: boolean;
  onTod: (t: DeskTod) => void;
  onOpen: (k: "area" | "guide" | "settings") => void;
  open: string | null;
  mac: boolean;
}) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <header className="desk-topbar glass">
      <button type="button" className="desk-brand" onClick={onHome} aria-label="MICHILU のホームへ" title="ホームへ">
        <Image src={MARK.src} alt="" width={Math.round((30 * MARK.w) / MARK.h)} height={30} priority />
        <Wordmark className="text-[19px] leading-none" />
      </button>
      <form
        className="desk-search"
        role="search"
        aria-label="住所・地番で調べる"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <Search size={18} strokeWidth={1.9} aria-hidden className="shrink-0 text-[var(--muted)]" />
        <label htmlFor="address" className="sr-only">
          住所・地番
        </label>
        <input
          ref={field}
          id="address"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="住所・地番を入れる（例：渋谷区神南1-19-11、地番 熊谷市下奈良391-3）"
          autoComplete="off"
          enterKeyHint="search"
          spellCheck={false}
        />
        {input && (
          <button
            type="button"
            className="btn ghost icon"
            aria-label="入力を消す"
            onClick={() => {
              setInput("");
              field.current?.focus();
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
        <span className="kbd" aria-hidden title="検索欄へ">
          {mac ? "⌘K" : "Ctrl+K"}
        </span>
        <button type="submit" className="btn primary go" disabled={loading || !input.trim()}>
          {loading ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null}
          {loading ? "調べています" : "調べる"}
        </button>
      </form>
      <div className="desk-topright">
        <div className="seg" role="group" aria-label={`3D の光の時間帯（${todAuto ? "いまは時計に合わせています" : "上の帯で選んでいます"}）`}>
          {TODS.map((t) => (
            <button key={t} type="button" aria-pressed={t === tod} onClick={() => onTod(t)} title={todAuto && t === tod ? `${TOD_LABEL[t]}（時計に合わせています）` : `${TOD_LABEL[t]}の光にする`}>
              {TOD_LABEL[t]}
            </button>
          ))}
        </div>
        <button type="button" className="btn ghost wide-only" aria-pressed={open === "area"} onClick={() => onOpen("area")}>
          対応エリア
        </button>
        <button type="button" className="btn ghost wide-only" aria-pressed={open === "guide"} onClick={() => onOpen("guide")}>
          使い方
        </button>
        <button type="button" className="btn ghost icon" aria-label="設定" title="設定" aria-pressed={open === "settings"} onClick={() => onOpen("settings")}>
          <Settings size={18} strokeWidth={1.9} />
        </button>
      </div>
    </header>
  );
}

/** 左の列のボタン（形はアイコン、名前は読み上げと、押せる所に乗せたときの札） */
function Tab({ label, icon, onClick, current, badge, disabled }: { label: string; icon: ReactNode; onClick: () => void; current?: boolean; badge?: number; disabled?: boolean }) {
  return (
    <button type="button" className="tab" onClick={onClick} aria-pressed={current} aria-label={badge ? `${label}（${badge}件）` : label} disabled={disabled}>
      {icon}
      {!!badge && (
        <span className="badge" aria-hidden>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      <span className="tip" aria-hidden>
        {label}
      </span>
    </button>
  );
}

/** 物件の札（地番か町名）。いまの物件は押すとカルテのいちばん上へ・物件の場所へ、最近調べた物件は押すと開く */
export type RailProp = { key: string; title: string; sub: string; current: boolean; onClick: () => void };

export function Rail({ open, onOpen, favorites, compare, docsReady, props }: { open: string | null; onOpen: (k: RailKey) => void; favorites: number; compare: number; docsReady: boolean; props: RailProp[] }) {
  const s = { size: 19, strokeWidth: 1.9 };
  return (
    <nav className="desk-rail glass" aria-label="画面の切り替え">
      <Tab label="検索（ホーム）" icon={<Search {...s} />} onClick={() => onOpen("home")} />
      {props.length > 0 && <div className="sep" aria-hidden />}
      {props.map((p) => (
        <button key={p.key} type="button" className="prop" onClick={p.onClick} aria-current={p.current ? "true" : undefined} aria-label={`${p.current ? "いまの物件" : "最近調べた物件"}：${p.title} ${p.sub}`} title={`${p.title} ${p.sub}`}>
          <b>{p.title}</b>
          <span>{p.sub}</span>
        </button>
      ))}
      <div className="sep" aria-hidden />
      <Tab label="お気に入り" icon={<Star {...s} />} onClick={() => onOpen("favorites")} current={open === "favorites"} badge={favorites} />
      <Tab label="履歴" icon={<History {...s} />} onClick={() => onOpen("history")} current={open === "history"} />
      <Tab label={docsReady ? "書類・出力" : "書類・出力（物件を調べると作れます）"} icon={<FileText {...s} />} onClick={() => onOpen("docs")} current={open === "docs"} disabled={!docsReady} />
      <Tab label="並べて比較" icon={<Columns2 {...s} />} onClick={() => onOpen("compare")} current={open === "compare"} badge={compare} />
      <div className="spacer" />
      <Tab label="使い方" icon={<CircleHelp {...s} />} onClick={() => onOpen("guide")} current={open === "guide"} />
      <Tab label="表示（見た目・動き・時間帯）" icon={<SlidersHorizontal {...s} />} onClick={() => onOpen("settings")} current={open === "settings"} />
    </nav>
  );
}

/** 物件を調べる前の真ん中のカード */
export function Welcome({ history, areaText, onPick, onExample, onAll, onArea }: { history: HistoryItem[]; areaText: string; onPick: (h: HistoryItem) => void; onExample: (q: string) => void; onAll: () => void; onArea: () => void }) {
  const recent = history.slice(0, 3);
  return (
    <section className="desk-welcome glass" aria-labelledby="desk-welcome-title">
      <h1 id="desk-welcome-title">
        住所か地番を1つ入れると、
        <br />
        地図と 3D で周りごと見えます。
      </h1>
      <p>道路・法令・ハザード・周辺・相場・筆が右のカルテに並び、照会文や重説の下書きまで同じ画面で作れます。</p>
      <div className="ex">
        {["渋谷区神南1-19-11", "地番 熊谷市下奈良391-3", "松戸市古ヶ崎四丁目3556-1"].map((q) => (
          <button key={q} type="button" className="btn" onClick={() => onExample(q)}>
            {q}
          </button>
        ))}
      </div>
      <p className="hint mt-3 flex items-center justify-center gap-1.5">
        <MapPin size={14} aria-hidden />
        住所が分からない土地は、地図をクリックして「ここで調べる」
      </p>
      <dl className="stats">
        <div>
          <dt>対応市区町村</dt>
          <dd>{MUNICIPALITIES.length}</dd>
        </div>
        <div>
          <dt>対応エリア</dt>
          <dd className="small">
            <button type="button" className="btn ghost small" onClick={onArea} aria-label={`対応エリア：${areaText}（一覧を開く）`}>
              {areaText}
            </button>
          </dd>
        </div>
        <div>
          <dt>地図リンクの自動確認</dt>
          <dd className="small">毎週</dd>
        </div>
      </dl>
      {recent.length > 0 && (
        <div className="recent">
          <span className="hint">最近の検索</span>
          {recent.map((h) => (
            <button key={historyKey(h)} type="button" className="btn ghost small" onClick={() => onPick(h)}>
              {placeTitle(h).title || h.address}
            </button>
          ))}
          <button type="button" className="btn ghost small" onClick={onAll}>
            すべて見る
          </button>
        </div>
      )}
    </section>
  );
}

/** 調べている・失敗の一言（真ん中の上） */
export function Banner({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading)
    return (
      <p className="desk-banner is-busy" role="status">
        <span className="desk-loading" aria-hidden />
        調べています…
      </p>
    );
  if (!error) return null;
  return (
    <p className="desk-banner is-error" role="alert">
      <TriangleAlert size={16} className="mt-[2px] shrink-0" aria-hidden />
      {error}
    </p>
  );
}
