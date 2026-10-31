"use client";

// スマホ（横幅 1024px 未満）のメイン画面：日本地図の上に、検索ドックと結果パネル（小・中・大）を重ねる。
// 検索の入力欄（SearchCard）は、ホームでも結果でも同じ位置・同じ部品のまま（フォーカス中に作り直さない）。
// 結果の項目を押すと、同じパネルの中で一覧が詳細に替わり、「戻る」で一覧（スクロール位置そのまま）に戻る（components/panel-detail.tsx）。
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LookupResult } from "@/lib/roadmap";
import type { HistoryItem } from "@/lib/history";
import { down, SNAP_HEIGHT, snapAfterDrag, snapForDetail, snapPx, up, type Snap } from "@/lib/panel-snap";
import { Header } from "./header";
import { HistoryChips } from "./history-list";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon } from "./icons";
import { DETAIL_CLOSE_EVENT, PanelDetailContext, type DetailEntry, type PanelDetailApi } from "./panel-detail";
import { ResultView, type MapOpen } from "./result-view";
import { SearchCard } from "./search-card";

const JapanMap = dynamic(() => import("./japan-map"), { ssr: false });

export type MobileShown = { query: string; result: LookupResult };

/** 地図の中心をずらす量の上限(px)。パネルが大きくても、地図の見える帯を残す */
const MAX_MAP_INSET = 520;

const reducedSubscribe = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useReducedMotion(): boolean {
  return useSyncExternalStore(reducedSubscribe, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
}

const resizeSubscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
/** 画面の高さ(px)。パネルの段階（中は画面の54%など）から、地図の中心をずらす量を決めるのに使う */
function useViewportHeight(): number {
  return useSyncExternalStore(resizeSubscribe, () => window.innerHeight, () => 800);
}

/** iPhone のキーボードで隠れる分(px)。パネルをその上に持ち上げる（Android などレイアウトが縮む端末では 0） */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return inset;
}

export function MobileShell({
  shown,
  focus,
  input,
  setInput,
  loading,
  error,
  history,
  areaText,
  onSearch,
  onPickAddress,
  onPickHistory,
  onShowHistory,
  onMenu,
  onHome,
  onMap,
  onFix,
  onExpand,
  onGuide,
  onOpenHelp,
  onOpenCities,
  onDetailChange,
}: {
  shown: MobileShown | null;
  focus: number;
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  error: string | null;
  history: HistoryItem[];
  /** 調査に対応している地域（「関東1都6県」など） */
  areaText: string;
  onSearch: () => void;
  onPickAddress: (a: string) => void;
  onPickHistory: (h: HistoryItem) => void;
  onShowHistory: () => void;
  onMenu: () => void;
  onHome: () => void;
  onMap: () => void;
  onFix: () => void;
  onExpand: (o?: MapOpen) => void;
  /** 案内図（A4）を開く */
  onGuide: () => void;
  onOpenHelp: () => void;
  onOpenCities: () => void;
  /** 詳細を開いた・閉じた（端末の「戻る」で閉じられるよう、履歴につなぐ。app/page.tsx） */
  onDetailChange?: (open: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const kbd = useKeyboardInset();
  const vh = useViewportHeight();
  const [mapOk, setMapOk] = useState(true);
  // シート・メニューなどポータルを青緑にそろえる目印（CSS 側でスマホ幅のときだけ効く）
  useEffect(() => {
    document.body.dataset.mui = "1";
    return () => {
      delete document.body.dataset.mui;
    };
  }, []);

  // 確定した実地点（住所・ピン・地図カメラは同じ結果から決める）。候補待ち・見つからないときはカメラを動かさない
  const confirmed = useMemo(() => {
    const r = shown?.result;
    return r && (r.status === "ok" || r.status === "unsupported") ? { lat: r.lat, lng: r.lng } : null;
  }, [shown]);
  const [cam, setCam] = useState<{ lat: number; lng: number } | null>(null);
  const [prevShown, setPrevShown] = useState<MobileShown | null>(null);
  if (prevShown !== shown) {
    setPrevShown(shown);
    if (!shown) setCam(null);
    else if (confirmed) setCam(confirmed);
  }

  // パネルの段階。新しい結果が出たら中、候補・エラーも中で見せる。詳細は広い「大」で読み、戻ると元の段階に戻る
  const [snap, setSnap] = useState<Snap>("medium");
  const [seen, setSeen] = useState<MobileShown | null>(null);
  const [detail, setDetail] = useState<DetailEntry | null>(null);
  const [saved, setSaved] = useState<Snap | null>(null);
  const [prevDetail, setPrevDetail] = useState<DetailEntry | null>(null);
  if (seen !== shown) {
    setSeen(shown);
    if (shown) setSnap("medium");
    setSaved(null);
  }
  if (prevDetail !== detail) {
    setPrevDetail(detail);
    const next = snapForDetail({ snap, saved }, !!prevDetail, !!detail);
    if (next.snap !== snap) setSnap(next.snap);
    if (next.saved !== saved) setSaved(next.saved);
  }
  const inDetail = !!detail;

  // パネルの実際の高さを測る（ホームは内容の高さで決まるので、地図の中心をずらす量に使う）
  const panel = useRef<HTMLElement>(null);
  const [panelH, setPanelH] = useState(176);
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPanelH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- 一覧 ⇄ 詳細 ----
  const listRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const setHostEl = useCallback((el: HTMLDivElement | null) => {
    hostRef.current = el;
    setHost(el);
  }, []);
  const inDetailRef = useRef(false);
  const detailRef = useRef<DetailEntry | null>(null);
  const listTop = useRef(0);
  const trigger = useRef<HTMLElement | null>(null);
  const wasDetail = useRef(false);
  useEffect(() => {
    inDetailRef.current = inDetail;
    detailRef.current = detail;
  });
  const opened = useCallback((e: DetailEntry) => {
    // 一覧から開くとき（詳細どうしの付け替えではないとき）だけ、一覧のスクロール位置と、押した行を覚える
    if (!inDetailRef.current) {
      listTop.current = listRef.current?.scrollTop ?? 0;
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setDetail(e);
  }, []);
  const closed = useCallback((id: string) => setDetail((d) => (d?.id === id ? null : d)), []);
  const api = useMemo<PanelDetailApi>(() => ({ host, opened, closed }), [host, opened, closed]);

  useLayoutEffect(() => {
    if (inDetail === wasDetail.current) return;
    wasDetail.current = inDetail;
    if (inDetail) {
      // 詳細は先頭から。見出しにフォーカスを移して、読み上げ・キーボードが詳細から始まるようにする
      if (hostRef.current) hostRef.current.scrollTop = 0;
      titleRef.current?.focus({ preventScroll: true });
    } else {
      // 一覧に戻る：スクロール位置と、押した行へのフォーカスを戻す
      if (listRef.current) listRef.current.scrollTop = listTop.current;
      trigger.current?.focus({ preventScroll: true });
      trigger.current = null;
    }
  }, [inDetail]);

  // 新しい結果が出たら、開いている詳細は閉じる（別の物件の詳細を見せ続けない）
  useEffect(() => {
    detailRef.current?.close();
  }, [shown]);
  // 端末の「戻る」で詳細を閉じる（app/page.tsx から）
  useEffect(() => {
    const on = () => detailRef.current?.close();
    window.addEventListener(DETAIL_CLOSE_EVENT, on);
    return () => window.removeEventListener(DETAIL_CLOSE_EVENT, on);
  }, []);
  // Esc（キーボード）でも詳細を閉じる。全画面の地図・シートなど、上に重なる画面があれば、そちらの Esc を優先する
  useEffect(() => {
    if (!inDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || document.querySelector("[role=dialog]")) return;
      detailRef.current?.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inDetail]);
  useEffect(() => {
    onDetailChange?.(inDetail);
  }, [inDetail, onDetailChange]);

  // 地図の中心をずらす量。結果は段階の見込みの高さ（パネルが動き終わる前から正しい位置へ）、ホームは測った高さ。
  // 詳細を開いている間は、詳細を開く前の段階のまま（詳細を開いても地図は動かさない）
  const hasResult = !!shown;
  const mapInset = Math.min(hasResult ? snapPx(saved ?? snap, vh) : panelH, MAX_MAP_INSET);

  // ヘッダー限定のドラッグ（本文のスクロールとは分ける）
  const drag = useRef<{ y: number; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d) setSnap((s) => snapAfterDrag(s, e.clientY - d.y));
  };

  const status = shown?.result.status;
  const r = shown?.result;
  const title =
    r && (r.status === "ok" || r.status === "unsupported")
      ? r.matchedAddress
      : status === "choose"
        ? "候補から選んでください"
        : status === "not_found"
          ? "住所が見つかりませんでした"
          : "";

  const snapBtn = "mui-press flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mui-primary-soft)] text-[var(--mui-primary)] disabled:opacity-40";

  return (
    <PanelDetailContext.Provider value={api}>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--mui-primary-soft)] text-[var(--mui-ink)]">
        {/* 地図が失敗しても、住所入力（下のパネル）は使える */}
        {mapOk && <JapanMap point={cam} focus={focus} bottomInset={mapInset} reducedMotion={reduced} onFail={() => setMapOk(false)} />}
        {!mapOk && (
          <p role="status" className="absolute inset-x-4 top-24 rounded-xl bg-white/90 p-3 text-[12px] text-[var(--mui-muted)]">
            地図を表示できませんでした。住所を入力して調べられます。
          </p>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-[max(8px,env(safe-area-inset-top))]">
          <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-white/90 px-3 py-1.5 shadow-[0_2px_12px_rgba(15,118,110,0.15)] backdrop-blur">
            <Header compact onMenu={onMenu} onHome={hasResult ? onHome : undefined} />
          </div>
        </div>

        <section
          ref={panel}
          aria-label={hasResult ? "調査結果" : "住所を調べる"}
          data-dragging={dragging ? "1" : undefined}
          style={{ height: hasResult ? SNAP_HEIGHT[snap] : undefined, bottom: kbd, maxHeight: `calc(100% - ${kbd}px - 8px)` }}
          className="mui-panel absolute inset-x-0 mx-auto flex max-w-md flex-col rounded-t-3xl bg-white shadow-[0_-6px_24px_rgba(15,60,56,0.18)]"
        >
          {hasResult && (
            <div
              onPointerDown={onDown}
              onPointerUp={end}
              onPointerCancel={end}
              className="shrink-0 cursor-grab touch-none select-none px-4 pb-1 pt-2"
              data-testid="panel-header"
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-[var(--mui-line)]" aria-hidden />
              <div className="mt-1.5 flex items-center gap-2">
                {detail && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => detail.close()}
                    aria-label="一覧に戻る"
                    className="mui-press flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-[var(--mui-primary-soft)] pl-2 pr-3 text-[13px] font-semibold text-[var(--mui-primary)]"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    戻る
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <h2 ref={titleRef} tabIndex={-1} className="truncate text-[14px] font-semibold outline-none">
                    {detail ? detail.title : title}
                  </h2>
                  {/* 詳細を開いている間も、どの物件の詳細かを見せる */}
                  {detail && <p className="truncate text-[11px] text-[var(--mui-muted)]">{title}</p>}
                </div>
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setSnap(up(snap))} disabled={snap === "large"} aria-label="パネルを広げる" className={snapBtn}>
                  <ChevronRightIcon className="h-4 w-4 -rotate-90" />
                </button>
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setSnap(down(snap))} disabled={snap === "small"} aria-label="パネルを狭める" className={snapBtn}>
                  <ChevronRightIcon className="h-4 w-4 rotate-90" />
                </button>
              </div>
            </div>
          )}

          {/* 詳細を開いている間も、一覧・主入力は消さずに隠すだけ（入力欄の部品は同じまま。一覧のスクロール位置も残る） */}
          <div hidden={inDetail} className={`shrink-0 px-4 ${hasResult ? "pb-2" : "pt-4 pb-2"}`}>
            {!hasResult && (
              <div className="mb-3">
                <h1 className="text-[15px] font-semibold leading-snug">不動産の現場に、すぐ使える情報を。</h1>
                <p className="mt-0.5 text-[11px] text-[var(--mui-muted)]">調査対応：{areaText}</p>
              </div>
            )}
            {/* 主入力。ホーム⇄結果で同じ位置・同じ部品のまま（フォーカス中に差し替えない） */}
            <SearchCard value={input} onChange={setInput} onSearch={onSearch} loading={loading} onMap={hasResult ? undefined : onMap} compact={hasResult} teal />
          </div>

          <div ref={listRef} hidden={inDetail} className="mui-list-in min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
            {error && (
              <div role="alert" className="mb-2 flex items-start gap-2 rounded-2xl bg-[var(--mui-warn-bg)] p-3 text-sm text-[var(--mui-warn-ink)]">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">{error}</span>
                <button type="button" onClick={onSearch} className="mui-press shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-semibold">
                  もう一度
                </button>
              </div>
            )}

            {shown ? (
              <ResultView query={shown.query} result={shown.result} onPick={onPickAddress} onFix={onFix} onExpand={(o) => onExpand(o)} onGuide={onGuide} />
            ) : (
              <div className="space-y-3">
                <HistoryChips items={history.slice(0, 3)} onSelect={onPickHistory} onShowAll={onShowHistory} />
                <div className="flex gap-2 text-[12px]">
                  <button type="button" onClick={onOpenHelp} className="mui-press rounded-full bg-[var(--mui-primary-soft)] px-3 py-1.5 font-semibold text-[var(--mui-primary-ink)]">
                    使い方
                  </button>
                  <button type="button" onClick={onOpenCities} className="mui-press rounded-full bg-[var(--mui-primary-soft)] px-3 py-1.5 font-semibold text-[var(--mui-primary-ink)]">
                    対応エリア
                  </button>
                </div>
              </div>
            )}

            <p className="mt-3 flex items-start gap-2 text-[10.5px] leading-[1.7] text-[var(--mui-muted)]">
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
              表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
            </p>
          </div>

          {/* 項目の詳細の置き場所（components/panel-detail.tsx）。詳細を開いている間だけ見える */}
          <div
            ref={setHostEl}
            hidden={!inDetail}
            data-testid="panel-detail"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-1"
          />
        </section>
      </div>
    </PanelDetailContext.Provider>
  );
}
