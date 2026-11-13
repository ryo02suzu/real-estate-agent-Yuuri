"use client";

// スマホの右上のメニュー（≡）。ホーム・お気に入り・履歴・書類・出力の右上から開く。
// 見た目はほかのページと同じ作り：後ろのページの写真はそのまま残し（ページの字と板・下のメニューは薄れて消える）、写真をぼかして
// 紺に沈め、その上に左上のロゴ・右上の ×（≡ と同じ位置）・英字の小見出しと大きな見出し（— MENU／メニュー）・すりガラスの板を置く。
// 上から、このアプリの仕事の順に：
//  1. まだ見ていないお知らせ（あるときだけ。≡ の赤い印の中身）
//  2. 続きから（開いている物件、無ければ直近7日に見ていた物件。押すと前に見ていたタブから）
//  3. 調べる（白いボタンの「住所・地番で調べる」と、地図で選ぶ・現在地）
//  4. ページ（お気に入り・履歴・書類・出力。件数と、いま見ているページの印）
//  5. 書類と記録（書類の差出人・照会の文面・記録の書き出し。入っているか・未設定か・まだ書き出していないかを出す）
//  6. データと案内（対応エリア・出典と時点・使い方・お知らせ）
//  7. このアプリ（動きの演出・ホーム画面に追加・パソコンでも使う・アカウント）と、安心の一言・最終更新日
// 動き：開くと ≡ の所から紺の幕が円く広がり（.menu-tint。円の動きはこのファイルで付ける）、≡ の3本の線が × に変わり、見出しと板が
// 上から順に浮き上がって、件数が数え上がる。閉じると円が × へ縮み、× が ≡ に戻って、ページが元どおり現れる。いちばん上で下へ
// 引いて離すと閉じる（引いている間は板がついてきて、幕が薄れる。閉じる所まで引くと × が光る）。動きを減らす設定では動かさない。
// 設定・案内のシートは、メニューの上に重ねて開き、閉じるとメニューに戻る（入れた値がすぐ見える）。ページを移る・地図を開く・
// 調べ始めるものは、メニューを閉じてから動く（現在地は、位置が取れるまでメニューの上で待つ）。
// 寸法は幅393ptの値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）。PC はこの画面を使わない（PC の設定・使い方は
// components/desk/overlays.tsx）。CSS は app/globals.css の .menu-*
import { ArrowRight, Bell, Building2, Check, ChevronRight, CircleHelp, Database, Download, FilePenLine, FileText, LoaderCircle, LocateFixed, Map as MapIcon, MapPin, Monitor, Search, ShieldCheck, Smartphone, Sparkles, Star, UserRound, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { stamp } from "@/lib/app/history-view";
import { backupNote, recordedCount, resumeTarget, senderNote, templateNote } from "@/lib/app/menu";
import { placeLine } from "@/lib/app/scene";
import { EXPORTED_EVENT, lastExported } from "@/lib/backup";
import type { HistoryItem } from "@/lib/history";
import { useInquirySettings } from "@/lib/inquiry-store";
import { allRecords } from "@/lib/records";
import { latestResume } from "@/lib/resume";
import { MUNICIPALITIES } from "@/lib/roadmap";
import { AREA_SHORT } from "@/lib/roadmap/regions";
import { useSender } from "@/lib/sender";
import { ART_W, PhoneImg, ZOOM, type NavKey } from "./frame";
import { HIT, LIGHT_GLASS } from "./home";
import { ClockBack } from "./icons";
import { NEWS } from "./news";
import { PageTitle, useCountUp } from "./page-head";
import { TABS, tabOf } from "./result-head";
import { reducedMotion } from "./tokens";

/** メニューのページ（下のメニューのページと、その他） */
export type MenuPage = "history" | "favorites" | "docs" | "account";
/** メニューを開いている間の、時刻・電池の帯の色（紺の幕のいちばん上の色。components/app/mobile-app.tsx） */
export const MENU_TOP = "#0a1224";

/** 閉じる動きの長さ（app/globals.css の .menu-root[data-menu="closing"]・[data-menu="swiped"] と同じ） */
const OUT_MS = 300;
/** 下へ引いて閉じる距離（画面の px。ゴムのように重くなる引き具合のあとの値） */
const PULL_CLOSE = 72;
/** 字の色（白の3段） */
const INK = "rgba(255,255,255,0.95)";
const SUBTLE = "rgba(255,255,255,0.64)";
const FAINT = "rgba(255,255,255,0.42)";
/** 明るい青（押せる字・アイコン。ページのアイコンと同じ光） */
const SKY_BLUE = "#9fd0ff";
const ICON_GLOW: CSSProperties = { filter: "drop-shadow(0 0 6px rgba(120,190,255,0.5))" };
/** 「未設定」「おすすめ」の札（琥珀色） */
const AMBER = "#ffc069";
/** 英字・数字（ロゴの MICHILU と同じ書体。components/app/page-head.tsx と同じ） */
const LATIN = "var(--font-jost), sans-serif";
/**
 * すりガラスの板（ページの板と同じ形・縁・影）。後ろは幕のぼかしで既にぼけているので、板には重ねてぼかしを掛けない
 * （ぼかしの上のぼかしは効かず、電池を使うだけ）
 */
const BOARD: CSSProperties = {
  background: "var(--glass-board-bg)",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 30px rgba(0,0,0,0.22)",
};
/** 小さな板（ページ・データと案内のタイル） */
const TILE: CSSProperties = { ...BOARD, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 20px rgba(0,0,0,0.2)" };
/** いま見ているページのタイル（縁を明るく、上から淡い白） */
const TILE_ON: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%), var(--glass-board-bg)",
  border: "1px solid rgba(255,255,255,0.5)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.24), 0 8px 22px rgba(0,0,0,0.24)",
};
/** 地図で選ぶ・現在地のボタン（白いボタンの下の、透けるボタン。ページの検索欄と同じ明るいすりガラスの色） */
const GLASS_BTN: CSSProperties = {
  background: "var(--glass-light-bg)",
  border: "1px solid rgba(255,255,255,0.3)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 24px rgba(0,0,0,0.14)",
};

/** 上から順に浮き上がる遅れ（.menu-rise） */
const rise = (i: number): CSSProperties => ({ "--d": `${i * 42}ms` }) as CSSProperties;

/** 最後に書き出した日時（書き出すと読み直す） */
function useLastExported(): number | null {
  return useSyncExternalStore(
    (cb) => {
      addEventListener(EXPORTED_EVENT, cb);
      addEventListener("storage", cb);
      return () => {
        removeEventListener(EXPORTED_EVENT, cb);
        removeEventListener("storage", cb);
      };
    },
    lastExported,
    () => null,
  );
}

/** 円の真ん中と大きさ（画面の px）。r0 はボタンの円、r1 は画面のいちばん遠い角まで */
type Circle = { x: number; y: number; r0: number; r1: number };

/** el の真ん中から画面の四隅まで届く円 */
function circleFrom(el: Element | null | undefined): Circle {
  const r = el?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth - 41;
  const y = r ? r.top + r.height / 2 : 60;
  return { x, y, r0: r ? r.width / 2 : 23, r1: Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 2 };
}

/** 開いた ≡（ページの帯の ≡ で、画面に見えているもの。components/app/page-head.tsx の data-menu-button） */
function openedFrom(): Element | undefined {
  return [...document.querySelectorAll("[data-menu-button]")].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
  });
}

/** 幕を円で広げる・縮める（Web Animations。clip-path の円） */
function animateCircle(el: HTMLElement, c: Circle, out: boolean): Animation | null {
  if (typeof el.animate !== "function") return null;
  const at = (r: number) => `circle(${r}px at ${c.x}px ${c.y}px)`;
  const frames = [at(c.r0), at(c.r1)].map((v) => ({ clipPath: v, webkitClipPath: v }));
  return el.animate(out ? frames.reverse() : frames, out ? { duration: OUT_MS, easing: "cubic-bezier(0.55, 0, 0.8, 0.2)", fill: "forwards" } : { duration: 560, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "backwards" });
}

/** 引いた距離を、ゴムのように重くして返す（離れるほど伸びにくい） */
const rubber = (d: number) => 190 * (1 - Math.exp(-d / 300));

export function AppMenu({
  open,
  onClose,
  covered,
  page,
  current,
  onCurrent,
  history,
  onResume,
  onSearch,
  onMap,
  onHere,
  locating,
  onNews,
  unread,
  onHelp,
  onCities,
  onSources,
  onStorage,
  onSender,
  onTemplates,
  onInstall,
  standalone,
  onPage,
  historyCount,
  favoriteCount,
  motion,
  onMotion,
}: {
  open: boolean;
  onClose: () => void;
  /** 上に設定・案内のシートが重なっている（Esc はシートだけを閉じる） */
  covered: boolean;
  /** いま見ているページ（ページのタイルに印を付ける。ホームは印なし） */
  page: NavKey;
  /** 開いている物件（物件の画面を開いたまま、ほかのページを見ているとき） */
  current?: HistoryItem;
  /** 開いている物件の画面に戻る */
  onCurrent: () => void;
  /** 調べた履歴（続きからの物件を探す） */
  history: HistoryItem[];
  /** 続きから：履歴の行から開き直す（前に見ていたタブから続く） */
  onResume: (h: HistoryItem) => void;
  /** 住所・地番で調べる（ホームの検索欄へ） */
  onSearch: () => void;
  /** 地図で場所を選ぶ（住所の無い土地も選べる） */
  onMap: () => void;
  /** 現在地で調べる（位置が取れるまで locating） */
  onHere: () => void;
  locating: boolean;
  onNews: () => void;
  unread: boolean;
  onHelp: () => void;
  /** 対応している市区町村 */
  onCities: () => void;
  /** データの出典と時点 */
  onSources: () => void;
  /** 調査記録の書き出し・読み込み */
  onStorage: () => void;
  /** 書類の差出人（会社名・担当者。照会文・調査メモ・案内図に入れる） */
  onSender: () => void;
  /** 照会の文面（ひな形）：照会文の件名・本文のひな形と、FAX をメールで送るサービスの宛先の形（components/app/template-editor.tsx） */
  onTemplates: () => void;
  /** ホーム画面に追加 */
  onInstall: () => void;
  standalone: boolean;
  /** ページへ移る（履歴・お気に入り・書類・出力・その他） */
  onPage: (p: MenuPage) => void;
  /** 履歴の物件の数（同じ物件はまとめて1件） */
  historyCount: number;
  favoriteCount: number;
  /** 動きの演出（検索したときの地球からのズーム・写真の動き）がオンか */
  motion: boolean;
  onMotion: (on: boolean) => void;
}) {
  // 閉じるときは、閉じる動きが終わるまで残す（動きを減らす設定ではすぐ消す）。下へ引いて閉じたときは、引いた向きのまま消える
  const [closing, setClosing] = useState(false);
  const [swiped, setSwiped] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setClosing(false);
      setSwiped(false);
    } else if (!reducedMotion()) setClosing(true);
  }
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => setClosing(false), OUT_MS);
    return () => clearTimeout(t);
  }, [closing]);
  const shown = open || closing;
  // 中身をスクロールしたか（上の帯にすりガラスを敷く・小さな見出しを出す）。開き直したら一番上から
  const [scrolled, setScrolled] = useState(false);
  const [titled, setTitled] = useState(false);
  if (!shown && (scrolled || titled)) {
    setScrolled(false);
    setTitled(false);
  }

  const root = useRef<HTMLDivElement>(null);
  const tint = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const coveredRef = useRef(covered);
  // 閉じる関数は描くたびに新しくなるので、指で引いている途中に受け付け直さないよう ref で持つ
  const closeRef = useRef(onClose);
  useEffect(() => {
    coveredRef.current = covered;
    closeRef.current = onClose;
  }, [covered, onClose]);

  // 開いたら × に、閉じたら開く前の所（≡）に戻す。戻すのは描き終えたあと（描く間に動かすと、React が描く前の所（×）へ戻すため）。
  // 閉じてすぐ別の所（検索欄）へ移したときは、そのままにする（メニューの中か、どこにも無いときだけ戻す）
  useLayoutEffect(() => {
    if (!open) return;
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = root.current;
    closeBtn.current?.focus({ preventScroll: true });
    return () =>
      queueMicrotask(() => {
        const now = document.activeElement;
        if (!now || now === document.body || box?.contains(now)) back?.focus({ preventScroll: true });
      });
  }, [open]);
  // 開く：≡ の所から紺の幕を円く広げる（描く前に始めるので、広がる前の幕は一度も見えない）
  useLayoutEffect(() => {
    const el = tint.current;
    if (!open || !el || reducedMotion()) return;
    const a = animateCircle(el, circleFrom(openedFrom() ?? closeBtn.current), false);
    return () => a?.cancel();
  }, [open]);
  // 閉じる：幕を × へ縮める（下へ引いて閉じたときは縮めず、薄れて消える。app/globals.css）
  useLayoutEffect(() => {
    const el = tint.current;
    if (!closing || swiped || !el) return;
    const a = animateCircle(el, circleFrom(closeBtn.current), true);
    return () => a?.cancel();
  }, [closing, swiped]);
  // 開いている間は、後ろのページの字と板・下のメニューを薄れさせて消し、動きを止め、光の重ねを隠す。閉じる間は元に戻しながら
  // （app/globals.css の html[data-menu]）
  useEffect(() => {
    if (!shown) return;
    const html = document.documentElement;
    html.dataset.menu = open ? "open" : "closing";
    return () => {
      delete html.dataset.menu;
    };
  }, [shown, open]);
  // Esc で閉じる（上にシートが重なっているときは、シートだけが閉じる）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !coveredRef.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  // いちばん上で下へ引いて離すと閉じる。引いている間は中身がついてきて（ゴムのように重く）、幕が少し薄れる。
  // 閉じる所まで引くと × が光る（data-armed）。足りなければ元の位置へ戻る（data-settle）
  useEffect(() => {
    const sc = scroller.current;
    const box = content.current;
    const el = root.current;
    if (!open || !sc || !box || !el) return;
    let y0 = 0;
    let t0 = 0;
    let d = 0;
    let pull = 0;
    let dragging = false;
    let settle = 0;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      y0 = e.touches[0].clientY;
      t0 = performance.now();
      d = 0;
      pull = 0;
      dragging = false;
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - y0;
      if (!dragging) {
        if (dy <= 0 || sc.scrollTop > 0) return;
        // いちばん上で下へ動き始めたら、最初の動きから端末のはね返り（スクロールの行き過ぎ）を止める（iPhone は最初の動きで
        // スクロールするかを決め、あとから止められないため）。6px までは押しただけかもしれないので、まだ動かさない
        if (e.cancelable) e.preventDefault();
        if (dy <= 6) return;
        dragging = true;
        clearTimeout(settle);
        el.dataset.drag = "1";
        delete el.dataset.settle;
      }
      d = Math.max(0, dy);
      pull = rubber(d);
      box.style.transform = `translate3d(0, ${pull.toFixed(1)}px, 0)`;
      el.style.setProperty("--pull", Math.min(1, pull / PULL_CLOSE).toFixed(3));
      if (pull >= PULL_CLOSE) el.dataset.armed = "1";
      else delete el.dataset.armed;
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      delete el.dataset.drag;
      delete el.dataset.armed;
      const v = d / Math.max(1, performance.now() - t0);
      box.style.transform = "";
      if (pull >= PULL_CLOSE || (v > 0.6 && d > 30)) {
        // 引いた所から、そのまま下へ消える（.menu-root[data-menu="swiped"]）
        setSwiped(true);
        closeRef.current();
        return;
      }
      el.dataset.settle = "1";
      el.style.removeProperty("--pull");
      settle = window.setTimeout(() => delete el.dataset.settle, 340);
    };
    sc.addEventListener("touchstart", start, { passive: true });
    sc.addEventListener("touchmove", move, { passive: false });
    sc.addEventListener("touchend", end);
    sc.addEventListener("touchcancel", end);
    return () => {
      clearTimeout(settle);
      sc.removeEventListener("touchstart", start);
      sc.removeEventListener("touchmove", move);
      sc.removeEventListener("touchend", end);
      sc.removeEventListener("touchcancel", end);
    };
  }, [open]);

  if (!shown) return null;

  // Tab で外へ出ない（最後から最初へ・最初から最後へ回る）
  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href]")];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={root} className="menu-root fixed inset-0 z-[45] text-white" role="dialog" aria-modal="true" aria-label="メニュー" data-menu={open ? "open" : swiped ? "swiped" : "closing"} onKeyDown={trap}>
      {/* 後ろの写真をぼかす（ふわっと現れる）と、≡ の所から円く広がる紺の幕 */}
      <div aria-hidden className="menu-blur absolute inset-0" />
      <div ref={tint} aria-hidden className="menu-tint absolute inset-0" />

      <div
        ref={scroller}
        className="app-touch absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-y-contain"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        onScroll={(e) => {
          const y = e.currentTarget.scrollTop;
          setScrolled(y > 4);
          setTitled(y > 58);
        }}
      >
        <div ref={content} className="menu-content">
          <div className="relative mx-auto" style={{ width: ART_W, zoom: ZOOM, padding: "62px 0 30px" }}>
            <PageTitle en="MENU" ja="メニュー" />
            <MenuBody
              page={page}
              current={current}
              onCurrent={onCurrent}
              history={history}
              onResume={onResume}
              onSearch={onSearch}
              onMap={onMap}
              onHere={onHere}
              locating={locating}
              onNews={onNews}
              unread={unread}
              onHelp={onHelp}
              onCities={onCities}
              onSources={onSources}
              onStorage={onStorage}
              onSender={onSender}
              onTemplates={onTemplates}
              onInstall={onInstall}
              standalone={standalone}
              onPage={onPage}
              historyCount={historyCount}
              favoriteCount={favoriteCount}
              motion={motion}
              onMotion={onMotion}
            />
          </div>
        </div>
      </div>

      {/* 上の帯：ロゴと ×（ページの帯のロゴと ≡ と同じ位置。≡ の3本の線が × に変わる）。中身をスクロールしたら、帯にすりガラスを
          敷き、大きな見出しが帯の下へ入ったら、ロゴと入れ替わりに真ん中に小さく「メニュー」 */}
      <div className="menu-head pointer-events-none absolute inset-x-0 top-0" data-scrolled={scrolled || undefined} data-titled={titled || undefined} style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div aria-hidden className="menu-headbar absolute inset-0" />
        <div className="relative mx-auto flex items-start justify-between" style={{ width: ART_W, zoom: ZOOM, padding: "16px 18px 10px 20px" }}>
          <PhoneImg src="/home/logo-mark-white.webp" alt="MICHILU" width={802} height={159} draggable={false} className="menu-logo block" style={{ height: 30, width: "auto", marginTop: 6, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
          <span aria-hidden className="menu-mini absolute left-1/2 font-semibold" style={{ top: 28, fontSize: 15.5, letterSpacing: "0.08em" }}>
            メニュー
          </span>
          <button
            ref={closeBtn}
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="menu-x press pointer-events-auto relative flex shrink-0 items-center justify-center rounded-full"
            style={{ ...LIGHT_GLASS, width: 46, height: 46, minWidth: HIT, minHeight: HIT }}
          >
            <span aria-hidden className="menu-bars">
              <span className="mb mb1" />
              <span className="mb mb2" />
              <span className="mb mb3" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * メニューの中身。開くたびに作り直すので、確認の記録の数・続きからの物件・「今日・昨日」は開いたときの値
 */
function MenuBody({
  page,
  current,
  onCurrent,
  history,
  onResume,
  onSearch,
  onMap,
  onHere,
  locating,
  onNews,
  unread,
  onHelp,
  onCities,
  onSources,
  onStorage,
  onSender,
  onTemplates,
  onInstall,
  standalone,
  onPage,
  historyCount,
  favoriteCount,
  motion,
  onMotion,
}: {
  page: NavKey;
  current?: HistoryItem;
  onCurrent: () => void;
  history: HistoryItem[];
  onResume: (h: HistoryItem) => void;
  onSearch: () => void;
  onMap: () => void;
  onHere: () => void;
  locating: boolean;
  onNews: () => void;
  unread: boolean;
  onHelp: () => void;
  onCities: () => void;
  onSources: () => void;
  onStorage: () => void;
  onSender: () => void;
  onTemplates: () => void;
  onInstall: () => void;
  standalone: boolean;
  onPage: (p: MenuPage) => void;
  historyCount: number;
  favoriteCount: number;
  motion: boolean;
  onMotion: (on: boolean) => void;
}) {
  const [now] = useState(() => Date.now());
  const [records] = useState(() => recordedCount(allRecords()));
  const [resume] = useState(() => resumeTarget(latestResume(), history));
  const sender = useSender();
  const templates = useInquirySettings();
  const exported = useLastExported();
  const sn = senderNote(sender);
  const backup = backupNote(exported, now, historyCount + favoriteCount + records);
  const cities = useCountUp(MUNICIPALITIES.length, true);

  // 上から順に浮き上がる順番（お知らせ・続きからが無いときは、その分詰める）
  const top = (unread ? 1 : 0) + (current || resume ? 1 : 0);
  const resumeTab = resume ? (TABS.find((t) => t.key === tabOf(resume.tab))?.long ?? "概要") : "";

  return (
    <>
      {/* 1. まだ見ていないお知らせ（≡ の赤い印の中身） */}
      {unread && (
        <div className="menu-rise mx-[19px] mt-[24px]" style={rise(0)}>
          <button
            onClick={onNews}
            className="press-soft flex w-full items-center gap-[12px] rounded-[20px] px-[15px] py-[12px] text-left"
            style={{ background: "linear-gradient(100deg, rgba(240,38,58,0.22) 0%, rgba(255,255,255,0.07) 62%)", border: "1px solid rgba(255,128,138,0.32)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 26px rgba(0,0,0,0.16)" }}
          >
            <span className="relative flex size-[38px] shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Bell size={18} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
              <span className="menu-ping absolute right-[1px] top-[1px] size-[10px] rounded-full bg-[#f0263a]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-[7px] leading-none">
                <span className="rounded-full bg-[#f0263a] px-[7px] py-[3px] font-bold text-white" style={{ fontSize: 10.5 }}>
                  新着
                </span>
                <span style={{ fontSize: 12, color: SUBTLE }}>{NEWS[0].date}</span>
              </span>
              <span className="mt-[6px] line-clamp-2 font-semibold leading-[1.4]" style={{ fontSize: 14, color: INK }}>
                {NEWS[0].title}
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={2} absoluteStrokeWidth color={FAINT} className="shrink-0" />
          </button>
        </div>
      )}

      {/* 2. 続きから（開いている物件。無ければ直近に見ていた物件） */}
      {current ? (
        <div className={`menu-rise mx-[19px] ${unread ? "mt-[10px]" : "mt-[24px]"}`} style={rise(unread ? 1 : 0)}>
          <ResumeCard Icon={MapPin} label="開いている物件" title={placeLine(current)} note="物件の画面に戻る" onClick={onCurrent} />
        </div>
      ) : (
        resume && (
          <div className={`menu-rise mx-[19px] ${unread ? "mt-[10px]" : "mt-[24px]"}`} style={rise(unread ? 1 : 0)}>
            <ResumeCard Icon={ClockIcon} label={`続きから・${stamp(resume.at, now, true)}`} title={placeLine(resume.item)} note={`前に見ていた「${resumeTab}」から続けます`} onClick={() => onResume(resume.item)} />
          </div>
        )
      )}

      {/* 3. 調べる（白いボタンがいちばん目立つ。ページの「ホームで調べる」と同じ白） */}
      <div className={`menu-rise mx-[19px] ${top ? "mt-[12px]" : "mt-[24px]"}`} style={rise(top)}>
        <button onClick={onSearch} className="press flex w-full items-center justify-center gap-[9px] rounded-full bg-white font-semibold" style={{ height: 54, fontSize: 16.5, letterSpacing: "0.04em", color: "#1b3f73", boxShadow: "0 12px 28px rgba(0,0,0,0.24), inset 0 -1px 0 rgba(27,63,115,0.08)" }}>
          <Search size={19} strokeWidth={2.2} absoluteStrokeWidth />
          住所・地番で調べる
        </button>
        <div className="mt-[9px] grid grid-cols-2 gap-[9px]">
          <button onClick={onMap} aria-label="地図で選ぶ（住所の無い土地も、地図で場所を選んで調べられます）" className="press flex items-center justify-center gap-[7px] rounded-full font-semibold" style={{ ...GLASS_BTN, height: 48, fontSize: 14.5, color: INK }}>
            <MapIcon size={17} strokeWidth={1.9} absoluteStrokeWidth color={SKY_BLUE} />
            地図で選ぶ
          </button>
          <button onClick={onHere} aria-busy={locating || undefined} aria-label="現在地で調べる（今いる場所のまわりの地図を開きます）" className="press flex items-center justify-center gap-[7px] rounded-full font-semibold" style={{ ...GLASS_BTN, height: 48, fontSize: 14.5, color: INK }}>
            {locating ? <LoaderCircle size={17} strokeWidth={2} absoluteStrokeWidth color={SKY_BLUE} className="animate-spin" /> : <LocateFixed size={17} strokeWidth={1.9} absoluteStrokeWidth color={SKY_BLUE} />}
            {locating ? "位置を確認中…" : "現在地で調べる"}
          </button>
        </div>
      </div>

      {/* 4. ページ（件数と、いま見ているページの印） */}
      <nav aria-label="ページ" className="menu-rise mx-[19px] mt-[22px] grid grid-cols-3 gap-[8px]" style={rise(top + 1)}>
        <PageTile Icon={Star} en="FAVORITES" ja="お気に入り" n={favoriteCount} on={page === "favorites"} onClick={() => onPage("favorites")} />
        <PageTile Icon={ClockIcon} en="HISTORY" ja="履歴" n={historyCount} on={page === "history"} onClick={() => onPage("history")} />
        <PageTile Icon={FileText} en="DOCUMENTS" ja="書類・出力" sub="照会文・調査メモ" on={page === "docs"} onClick={() => onPage("docs")} />
      </nav>

      {/* 5. 書類と記録 */}
      <section className="menu-rise" style={rise(top + 2)}>
        <Head title="書類と記録" />
        <Board>
          <Row
            Icon={Building2}
            title="書類の差出人"
            sub={
              sn.set
                ? sn.lines.map((l, i) => (
                    <span key={i} className="block truncate">
                      {l.join("・")}
                    </span>
                  ))
                : sn.lines[0].join("")
            }
            badge={
              sn.set ? (
                <span className="flex shrink-0 items-center gap-[2px] font-semibold leading-none" style={{ fontSize: 11.5, color: "#7fe0a6" }}>
                  <Check size={13} strokeWidth={2.4} absoluteStrokeWidth />
                  入力済み
                </span>
              ) : (
                <Chip>未設定</Chip>
              )
            }
            onClick={onSender}
          />
          <Row Icon={FilePenLine} title="照会の文面（ひな形）" sub={templateNote(templates)} onClick={onTemplates} />
          <Row Icon={Download} title="記録の書き出し・読み込み" sub={backup.text} dot={backup.warn} badge={backup.warn ? <Chip>おすすめ</Chip> : undefined} onClick={onStorage} />
        </Board>
      </section>

      {/* 6. データと案内 */}
      <section className="menu-rise" style={rise(top + 3)}>
        <Head title="データと案内" />
        <div className="mx-[19px] grid grid-cols-2 gap-[8px]">
          <InfoTile Icon={MapPin} title="対応エリア" label={`対応している市区町村 ${MUNICIPALITIES.length.toLocaleString("ja-JP")}（${AREA_SHORT}）`} onClick={onCities}>
            <span className="mt-[7px] flex items-baseline leading-none">
              <span style={{ fontFamily: LATIN, fontSize: 21, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>{cities.toLocaleString("ja-JP")}</span>
              <span className="ml-[3px]" style={{ fontSize: 11, color: SUBTLE }}>
                市区町村
              </span>
            </span>
            <span className="mt-[6px] block leading-[1.35]" style={{ fontSize: 11, color: SUBTLE }}>
              {AREA_SHORT}
            </span>
          </InfoTile>
          <InfoTile Icon={Database} title="出典と時点" sub="地価・用途地域・地番・取引事例の時点と出典" onClick={onSources} />
          <InfoTile Icon={CircleHelp} title="使い方" sub="探す → 調べる → 記録する → 書類にする" onClick={onHelp} />
          <InfoTile Icon={Bell} title="お知らせ" sub={`${NEWS[0].date}　${NEWS[0].title}`} dot={unread} onClick={onNews} />
        </div>
      </section>

      {/* 7. このアプリ */}
      <section className="menu-rise" style={rise(top + 4)}>
        <Head title="このアプリ" />
        <Board>
          <MotionRow on={motion} onChange={onMotion} />
          <Row Icon={Smartphone} title="ホーム画面に追加" sub={standalone ? "追加したアプリで開いています" : "ブラウザの枠なしで、アプリのように使う"} right={standalone ? <span className="shrink-0" style={{ fontSize: 12, color: SUBTLE }}>追加済み</span> : undefined} onClick={onInstall} />
          <PcRow />
          <Row Icon={UserRound} title="アカウント・その他" sub="ログイン・会社での共有（準備中）" onClick={() => onPage("account")} />
        </Board>
      </section>

      {/* 安心の一言と最終更新日 */}
      <div className="menu-rise mx-[19px] mt-[22px] flex gap-[10px] px-[4px]" style={rise(top + 5)}>
        <ShieldCheck size={18} strokeWidth={1.8} absoluteStrokeWidth color={SKY_BLUE} className="mt-[2px] shrink-0" style={ICON_GLOW} />
        <p className="leading-[1.7]" style={{ fontSize: 12, color: SUBTLE }}>
          入れた住所・座標は MICHILU のサーバーには送りません（住所検索は国土地理院へ）。履歴・記録・差出人は、この端末の中だけに残ります。MICHILU は判定をしません。最終確認は役所の窓口・公的な資料で。
        </p>
      </div>
      <p className="mt-[14px] text-center" style={{ fontSize: 11, color: FAINT }}>
        MICHILU（ミチル）・最終更新 {NEWS[0].date}
      </p>
    </>
  );
}

/** 時計に戻る矢印（履歴のアイコン。下のメニューと同じ形）。lucide のアイコンと同じ指定で描く（absoluteStrokeWidth は画面の線の太さ） */
function ClockIcon({ size = 24, color = "currentColor", strokeWidth = 1.6, absoluteStrokeWidth = false, style }: { size?: number | string; color?: string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean; style?: CSSProperties }) {
  const s = Number(size);
  const w = Number(strokeWidth);
  return <ClockBack size={s} color={color} stroke={absoluteStrokeWidth ? (w * 24) / s : w} style={style} />;
}

/** 続きから・開いている物件の板（左に何の物件か・名前・続ける所、右に白い丸の矢印） */
function ResumeCard({ Icon, label, title, note, onClick }: { Icon: LucideIcon | typeof ClockIcon; label: string; title: string; note: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={`${label}：${title}（${note}）`} className="press-soft group flex w-full items-center gap-[12px] rounded-[22px] py-[14px] pl-[18px] pr-[14px] text-left" style={BOARD}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-[6px] leading-none" style={{ fontSize: 12.5, letterSpacing: 0.6, color: SUBTLE }}>
          <Icon size={13} strokeWidth={1.8} absoluteStrokeWidth color={SKY_BLUE} />
          {label}
        </span>
        <span className="mt-[8px] block truncate font-medium leading-[1.3]" style={{ fontSize: 17, color: INK }}>
          {title}
        </span>
        <span className="mt-[5px] block truncate leading-[1.3]" style={{ fontSize: 12.5, color: SKY_BLUE }}>
          {note}
        </span>
      </span>
      <span className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-white transition-transform duration-200 group-active:translate-x-[3px]" style={{ boxShadow: "0 8px 20px rgba(0,0,0,0.26)" }}>
        <ArrowRight size={20} strokeWidth={2.2} absoluteStrokeWidth color="#1b3f73" />
      </span>
    </button>
  );
}

/** ページのタイル（左上にアイコン、下に英字の小見出し・名前・件数。いま見ているページは縁を明るくして「表示中」） */
function PageTile({ Icon, en, ja, n, sub, on, onClick }: { Icon: LucideIcon | typeof ClockIcon; en: string; ja: string; n?: number; sub?: string; on: boolean; onClick: () => void }) {
  const shown = useCountUp(n ?? 0, true);
  return (
    <button
      onClick={onClick}
      aria-current={on ? "page" : undefined}
      aria-label={`${ja}${n !== undefined ? ` ${n}件` : ""}${on ? "（表示中）" : ""}`}
      className="press-soft relative flex h-[108px] min-w-0 flex-col rounded-[18px] px-[12px] pb-[11px] pt-[12px] text-left"
      style={on ? TILE_ON : TILE}
    >
      <Icon size={18} strokeWidth={1.8} absoluteStrokeWidth color={SKY_BLUE} style={ICON_GLOW} />
      {on && (
        <span className="absolute right-[9px] top-[11px] flex items-center gap-[4px] leading-none" style={{ fontSize: 10, color: "rgba(255,255,255,0.86)" }}>
          <span className="size-[5px] rounded-full bg-[#5aaeff]" style={{ boxShadow: "0 0 6px rgba(90,174,255,0.9)" }} />
          表示中
        </span>
      )}
      <span className="mt-auto block whitespace-nowrap leading-none" style={{ fontFamily: LATIN, fontSize: 8.5, fontWeight: 500, letterSpacing: "0.24em", color: "rgba(255,255,255,0.7)" }}>
        {en}
      </span>
      <span className="mt-[5px] block whitespace-nowrap font-bold leading-none" style={{ fontSize: 15, letterSpacing: "0.04em", color: INK }}>
        {ja}
      </span>
      <span className="mt-[7px] flex h-[21px] items-baseline leading-none">
        {n !== undefined ? (
          <>
            <span style={{ fontFamily: LATIN, fontSize: 20, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>{shown.toLocaleString("ja-JP")}</span>
            <span className="ml-[2px]" style={{ fontSize: 11, color: SUBTLE }}>
              件
            </span>
          </>
        ) : (
          <span className="truncate self-end" style={{ fontSize: 11, color: SUBTLE }}>
            {sub}
          </span>
        )}
      </span>
    </button>
  );
}

/** 章の見出し（控えめな白の字と、右へ伸びる細い線） */
function Head({ title }: { title: string }) {
  return (
    <h3 className="mx-[21px] mb-[10px] mt-[28px] flex items-center gap-[10px] font-semibold leading-none" style={{ fontSize: 12.5, letterSpacing: 1.4, color: "rgba(255,255,255,0.62)" }}>
      {title}
      <span aria-hidden className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.22), rgba(255,255,255,0))" }} />
    </h3>
  );
}

/** 行をまとめる板（行の間に、アイコンの右から細い線。app/globals.css の .menu-row） */
function Board({ children }: { children: ReactNode }) {
  return (
    <div className="mx-[19px] overflow-hidden rounded-[22px]" style={BOARD}>
      {children}
    </div>
  );
}

/** 小さな札（「未設定」「おすすめ」。琥珀色） */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full px-[8px] py-[4px] font-bold leading-none" style={{ fontSize: 11, color: AMBER, background: "rgba(255,192,105,0.16)", border: "1px solid rgba(255,192,105,0.45)" }}>
      {children}
    </span>
  );
}

/** 一覧の1行（左に光るアイコン、名前（横に札）と説明（2行まで）、右に「追加済み」などと ›） */
function Row({ Icon, title, badge, sub, right, dot = false, onClick }: { Icon: LucideIcon; title: string; badge?: ReactNode; sub?: ReactNode; right?: ReactNode; dot?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="menu-row group relative flex w-full items-center gap-[14px] pl-[17px] pr-[14px] text-left" style={{ minHeight: 64 }}>
      <span className="relative flex w-[22px] shrink-0 justify-center transition-transform duration-150 group-active:scale-90">
        <Icon size={20} strokeWidth={1.8} absoluteStrokeWidth color={SKY_BLUE} style={ICON_GLOW} />
        {dot && <span className="absolute -right-[4px] -top-[3px] size-[8px] rounded-full" style={{ background: AMBER, boxShadow: "0 0 7px rgba(255,192,105,0.85)" }} />}
      </span>
      <span className="min-w-0 flex-1 py-[12px]">
        <span className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px]">
          <span className="font-semibold leading-[1.3]" style={{ fontSize: 15, color: INK }}>
            {title}
          </span>
          {badge}
        </span>
        {sub && (
          <span className="mt-[3px] line-clamp-2 break-words leading-[1.45]" style={{ fontSize: 12.5, color: SUBTLE }}>
            {sub}
          </span>
        )}
      </span>
      {right}
      <ChevronRight size={16} strokeWidth={2} absoluteStrokeWidth color={FAINT} className="shrink-0 transition-transform duration-200 group-active:translate-x-[2px]" />
    </button>
  );
}

/** データと案内のタイル（左上にアイコン、名前、ひとこと。中身を差し替えられる） */
function InfoTile({ Icon, title, sub, label, dot = false, onClick, children }: { Icon: LucideIcon; title: string; sub?: string; label?: string; dot?: boolean; onClick: () => void; children?: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="press-soft relative flex min-h-[112px] min-w-0 flex-col items-start rounded-[18px] px-[14px] pb-[12px] pt-[13px] text-left" style={TILE}>
      <span className="relative">
        <Icon size={19} strokeWidth={1.8} absoluteStrokeWidth color={SKY_BLUE} style={ICON_GLOW} />
        {dot && <span className="absolute -right-[4px] -top-[3px] size-[9px] rounded-full bg-[#f0263a]" style={{ boxShadow: "0 0 6px rgba(240,38,58,0.8)" }} />}
      </span>
      <span className="mt-[9px] block font-semibold leading-none" style={{ fontSize: 14.5, color: INK }}>
        {title}
      </span>
      {children ?? (
        <span className="mt-[6px] line-clamp-3 leading-[1.4]" style={{ fontSize: 11.5, color: SUBTLE }}>
          {sub}
        </span>
      )}
    </button>
  );
}

/**
 * パソコンでも使う：同じアドレスをパソコンで開くと、大きな画面の調査デスク（3D の街・カルテ・並べて比較）。押すと、このアプリの
 * アドレス（物件の情報は入れない）を共有シートで送るか、送れない端末ではコピーする。記録は端末ごとなので、書き出し・読み込みで移す
 */
function PcRow() {
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 2600);
    return () => clearTimeout(t);
  }, [done]);
  const send = async () => {
    const url = `${location.origin}/`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "MICHILU（ミチル）", url });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone("アドレスをコピーしました。パソコンのブラウザで開いてください");
    } catch {
      setDone(`パソコンのブラウザで ${url} を開いてください`);
    }
  };
  return <Row Icon={Monitor} title="パソコンでも使う" sub={done ?? "同じアドレスで、大きな画面の調査デスク（3Dの街・並べて比較）。記録は端末ごとです"} onClick={() => void send()} />;
}

/** 動きの演出のオン・オフ（押してもメニューは閉じない） */
function MotionRow({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const id = "menu-motion";
  return (
    <label htmlFor={id} className="menu-row relative flex w-full cursor-pointer items-center gap-[14px] pl-[17px] pr-[14px]" style={{ minHeight: 64 }}>
      <span className="flex w-[22px] shrink-0 justify-center">
        <Sparkles size={20} strokeWidth={1.8} absoluteStrokeWidth color={SKY_BLUE} style={ICON_GLOW} />
      </span>
      <span className="min-w-0 flex-1 py-[12px]">
        <span className="block font-semibold leading-[1.3]" style={{ fontSize: 15, color: INK }}>
          動きの演出
        </span>
        <span className="mt-[3px] block leading-[1.45]" style={{ fontSize: 12.5, color: SUBTLE }}>
          調べたときの地球からのズーム・写真のゆっくりした動き
        </span>
      </span>
      <input id={id} type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[#9db8e6]" style={{ background: on ? "#2f7cf6" : "rgba(255,255,255,0.2)" }}>
        <span className={`absolute top-[2px] h-[26px] w-[26px] rounded-full bg-white shadow transition-[left] duration-200 ${on ? "left-[22px]" : "left-[2px]"}`} />
      </span>
    </label>
  );
}
