"use client";

// PC の「調査デスク」の枠：上の帯（ロゴ・検索欄・時間帯・対応エリア・使い方・設定。検索欄を押すと、入力が空なら例・最近の検索・
// 地図で調べる案内の一覧）、左の細い列（検索・いまの物件・お気に入り・履歴・書類・比較・使い方・表示）、調べている・通信の失敗の一言
import Image from "next/image";
import { CircleHelp, Columns2, FileText, History, LoaderCircle, MapPin, Search, Settings, SlidersHorizontal, Star, TriangleAlert, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { DeskTod } from "@/lib/app/desk";
import { TOD_LABEL, TODS } from "@/lib/app/desk";
import { placeTitle } from "@/lib/app/scene";
import { historyKey, type HistoryItem } from "@/lib/history";
import { suggestAddresses, wantsSuggest, type Suggestion } from "@/lib/roadmap/suggest";
import { Wordmark } from "../header";

/** 検索欄の下に出す例（入力が空のとき） */
const EXAMPLES = ["渋谷区神南1-19-11", "地番 熊谷市下奈良391-3", "松戸市古ヶ崎四丁目3556-1"];

const MARK = { src: "/logo-mark.webp", w: 204, h: 202 };
/** 端末が Mac か（検索欄の近道の字を ⌘K にする。ほかは Ctrl+K） */
export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export type RailKey = "home" | "favorites" | "history" | "docs" | "compare" | "guide" | "settings";

export function Topbar({
  input,
  setInput,
  loading,
  onSearch,
  onPick,
  onHome,
  tod,
  todAuto,
  onTod,
  onOpen,
  open,
  mac,
  recent = [],
  onPickHistory,
}: {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onSearch: () => void;
  /** 入力途中の候補を選んだ（その住所で調べる） */
  onPick?: (address: string) => void;
  onHome: () => void;
  tod: DeskTod;
  /** 時計に合わせている（押すと上の帯で選ぶに変わる） */
  todAuto: boolean;
  onTod: (t: DeskTod) => void;
  onOpen: (k: "area" | "guide" | "settings") => void;
  open: string | null;
  mac: boolean;
  /** 入力が空のとき、検索欄の下に例と一緒に出す最近の検索（押すとその物件を開く） */
  recent?: HistoryItem[];
  onPickHistory?: (item: HistoryItem) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  // 入力途中の候補：入力が止まって 0.35 秒たったら、国土地理院の住所検索に聞く（古い返事は捨てる）
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const asked = useRef("");
  useEffect(() => {
    if (!onPick || !focused || loading || !wantsSuggest(input)) return;
    const q = input;
    const timer = setTimeout(() => {
      asked.current = q;
      suggestAddresses(q)
        .then((list) => {
          if (asked.current === q) {
            setSugs(list);
            setActive(-1);
          }
        })
        .catch(() => asked.current === q && setSugs([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [input, focused, loading, onPick]);
  const showSugs = !!onPick && focused && !loading && wantsSuggest(input) && sugs.length > 0;
  // 入力が空で検索欄を押したとき：例の住所・地番と最近の検索（前はホームの真ん中のカードにあった。日本の絵を隠さないように、ここへ移した）
  const homeOpts = [
    ...EXAMPLES.map((q) => ({ key: `ex:${q}`, label: q, recent: false, run: () => { setInput(q); onPick?.(q); } })),
    ...recent.slice(0, 3).map((h) => ({ key: `h:${historyKey(h)}`, label: placeTitle(h).title || h.address, recent: true, run: () => onPickHistory?.(h) })),
  ];
  const showHome = !!onPick && focused && !loading && !input.trim();
  const listSize = showSugs ? sugs.length : showHome ? homeOpts.length : 0;
  const runHome = (i: number) => {
    setActive(-1);
    field.current?.blur();
    homeOpts[i]?.run();
  };
  const pick = (s: Suggestion, i: number) => {
    setSugs([]);
    setActive(-1);
    field.current?.blur();
    // 号・枝番まで当たらない先頭の候補は、入れたとおりの住所で調べる（国の返した住所に置き換えると、入れた号が消えて
    // 「街区の代表点」と分からなくなる。先頭の候補は、入れたとおりに調べたときと同じ場所）
    const q = s.level !== "full" && i === 0 ? input : s.title;
    setInput(q);
    onPick?.(q);
  };
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
          onChange={(e) => {
            setInput(e.target.value);
            if (!wantsSuggest(e.target.value)) setSugs([]);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (!listSize) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = listSize;
              setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              if (showSugs) pick(sugs[active], active);
              else runHome(active);
            } else if (e.key === "Escape") {
              setSugs([]);
              setActive(-1);
              if (showHome) field.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={showSugs || showHome}
          aria-controls="address-suggest"
          aria-autocomplete="list"
          aria-activedescendant={(showSugs || showHome) && active >= 0 ? `address-suggest-${active}` : undefined}
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
        {showSugs && (
          <ul id="address-suggest" role="listbox" aria-label="住所の候補" className="desk-suggest">
            {sugs.map((s, i) => (
              <li
                key={s.title}
                id={`address-suggest-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "on" : undefined}
                // 押したときに検索欄の focus が外れて候補が消える前に選ぶ
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s, i);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <MapPin size={14} aria-hidden className="shrink-0 text-[var(--muted)]" />
                <span className="addr">{s.title}</span>
                <span className={`lv ${s.level}`}>{s.label}</span>
              </li>
            ))}
            <li role="presentation" className="src">住所の候補：国土地理院の住所検索</li>
          </ul>
        )}
        {showHome && (
          <ul id="address-suggest" role="listbox" aria-label="例と最近の検索" className="desk-suggest home">
            {homeOpts.map((o, i) => (
              <Fragment key={o.key}>
                {(i === 0 || (o.recent && !homeOpts[i - 1].recent)) && (
                  <li role="presentation" className="grp">
                    {o.recent ? "最近の検索" : "例"}
                  </li>
                )}
                <li
                  id={`address-suggest-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "on" : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    runHome(i);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  {o.recent ? <History size={14} aria-hidden className="shrink-0 text-[var(--muted)]" /> : <Search size={14} aria-hidden className="shrink-0 text-[var(--muted)]" />}
                  <span className="addr">{o.label}</span>
                </li>
              </Fragment>
            ))}
            <li role="presentation" className="src">
              <MapPin size={13} aria-hidden className="mr-1 inline-block align-[-2px]" />
              住所が分からない土地は、地図をクリックして「ここで調べる」
            </li>
          </ul>
        )}
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
