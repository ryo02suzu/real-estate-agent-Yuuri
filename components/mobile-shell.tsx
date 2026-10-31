"use client";

// スマホ（横幅 1024px 未満）のメイン画面：日本地図の上に、検索ドックと結果パネル（小・中・大）を重ねる。
// 検索の入力欄（SearchCard）は、ホームでも結果でも同じ位置・同じ部品のまま（フォーカス中に作り直さない）。
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LookupResult } from "@/lib/roadmap";
import type { HistoryItem } from "@/lib/history";
import { down, SNAP_HEIGHT, snapAfterDrag, up, type Snap } from "@/lib/panel-snap";
import { Header } from "./header";
import { HistoryChips } from "./history-list";
import { AlertIcon, ChevronRightIcon, InfoIcon } from "./icons";
import { ResultView, type MapOpen } from "./result-view";
import { SearchCard } from "./search-card";

const JapanMap = dynamic(() => import("./japan-map"), { ssr: false });

export type MobileShown = { query: string; result: LookupResult };

const reducedSubscribe = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useReducedMotion(): boolean {
  return useSyncExternalStore(reducedSubscribe, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
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
  onSearch,
  onPickAddress,
  onPickHistory,
  onShowHistory,
  onMenu,
  onHome,
  onMap,
  onFix,
  onExpand,
  onOpenHelp,
  onOpenCities,
}: {
  shown: MobileShown | null;
  focus: number;
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  error: string | null;
  history: HistoryItem[];
  onSearch: () => void;
  onPickAddress: (a: string) => void;
  onPickHistory: (h: HistoryItem) => void;
  onShowHistory: () => void;
  onMenu: () => void;
  onHome: () => void;
  onMap: () => void;
  onFix: () => void;
  onExpand: (o?: MapOpen) => void;
  onOpenHelp: () => void;
  onOpenCities: () => void;
}) {
  const reduced = useReducedMotion();
  const kbd = useKeyboardInset();
  const [mapOk, setMapOk] = useState(true);

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

  // パネルの段階。新しい結果が出たら中、候補・エラーも中で見せる
  const [snap, setSnap] = useState<Snap>("medium");
  const [seen, setSeen] = useState<MobileShown | null>(null);
  if (seen !== shown) {
    setSeen(shown);
    if (shown) setSnap("medium");
  }

  // パネルの実際の高さを測って、地図の中心をずらす
  const panel = useRef<HTMLElement>(null);
  const [panelH, setPanelH] = useState(176);
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPanelH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const hasResult = !!shown;
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

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--mui-primary-soft)] text-[var(--mui-ink)]">
      {/* 地図が失敗しても、住所入力（下のパネル）は使える */}
      {mapOk && <JapanMap point={cam} focus={focus} bottomInset={Math.min(panelH, 520)} reducedMotion={reduced} onFail={() => setMapOk(false)} />}
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
              <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</h2>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setSnap(up(snap))}
                disabled={snap === "large"}
                aria-label="パネルを広げる"
                className="mui-press flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mui-primary-soft)] text-[var(--mui-primary)] disabled:opacity-40"
              >
                <ChevronRightIcon className="h-4 w-4 -rotate-90" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setSnap(down(snap))}
                disabled={snap === "small"}
                aria-label="パネルを狭める"
                className="mui-press flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mui-primary-soft)] text-[var(--mui-primary)] disabled:opacity-40"
              >
                <ChevronRightIcon className="h-4 w-4 rotate-90" />
              </button>
            </div>
          </div>
        )}

        <div className={`shrink-0 px-4 ${hasResult ? "pb-2" : "pt-4 pb-2"}`}>
          {/* 主入力。ホーム⇄結果で同じ位置・同じ部品のまま（フォーカス中に差し替えない） */}
          <SearchCard value={input} onChange={setInput} onSearch={onSearch} loading={loading} onMap={hasResult ? undefined : onMap} compact={hasResult} teal />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
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
            <ResultView
              panel
              query={shown.query}
              result={shown.result}
              onPick={onPickAddress}
              onFix={onFix}
              onExpand={(o) => onExpand(o)}
            />
          ) : (
            <div className="space-y-3">
              <HistoryChips items={history} onSelect={onPickHistory} onShowAll={onShowHistory} />
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
      </section>
    </div>
  );
}
