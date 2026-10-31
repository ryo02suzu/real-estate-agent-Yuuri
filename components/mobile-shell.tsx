"use client";

// スマホ（横幅 1024px 未満）のメイン画面：日本地図の上に、検索ドックと結果パネル（小・中・大）を重ねる。
// 検索の入力欄（SearchCard）は、ホームでも結果でも同じ位置・同じ部品のまま（フォーカス中に作り直さない）。
// 結果の項目を押すと、同じパネルの中で一覧が詳細に替わり、「戻る」で一覧（スクロール位置そのまま）に戻る（components/panel-detail.tsx）。
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LookupResult } from "@/lib/roadmap";
import type { HistoryItem } from "@/lib/history";
import { SIDE_LEFT, SIDE_PANEL_TOP, SIDE_QUERY, SIDE_TOP, sidePanelWidth } from "@/lib/mobile-layout";
import { PANEL_MS } from "@/lib/motion";
import { down, DRAG_SLOP, dragHeight, nextVelocity, SNAP_HEIGHT, snapAfterRelease, snapForDetail, snapPx, up, type Snap, type SnapHeights } from "@/lib/panel-snap";
import { nextCamera, type CameraTarget } from "@/lib/position-accuracy";
import { Header } from "./header";
import { HistoryChips } from "./history-list";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon } from "./icons";
import { DETAIL_CLOSE_EVENT, PanelDetailContext, type DetailEntry, type PanelDetailApi } from "./panel-detail";
import { ResultView, type MapOpen } from "./result-view";
import { SearchCard } from "./search-card";
import { openModalCount } from "./use-modal";

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
/** 画面の幅(px)。横向きのときの左のパネルの幅を決めるのに使う */
function useViewportWidth(): number {
  return useSyncExternalStore(resizeSubscribe, () => window.innerWidth, () => 390);
}

const sideSubscribe = (cb: () => void) => {
  const mq = window.matchMedia(SIDE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** 横向きの背の低い画面（iPhone の横向きなど）か。パネルを左に寄せ、地図を右に見せる（lib/mobile-layout.ts） */
function useSideLayout(): boolean {
  return useSyncExternalStore(sideSubscribe, () => window.matchMedia(SIDE_QUERY).matches, () => false);
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
  input,
  setInput,
  loading,
  error,
  history,
  areaText,
  onSearch,
  onRetry,
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
  onCancelEdit,
}: {
  shown: MobileShown | null;
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  error: string | null;
  history: HistoryItem[];
  /** 調査に対応している地域（「関東1都6県」など） */
  areaText: string;
  onSearch: () => void;
  /** 失敗した検索を、同じ対象（住所・地点）と同じ積み方で調べ直す（エラーの「もう一度」。app/page.tsx） */
  onRetry: () => void;
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
  /** 結果の画面で住所を書き換えた・検索中の「キャンセル」：検索を無効にし、入力を今の結果の住所に戻す（app/page.tsx） */
  onCancelEdit?: () => void;
}) {
  const reduced = useReducedMotion();
  const kbd = useKeyboardInset();
  const vh = useViewportHeight();
  const vw = useViewportWidth();
  // 横向きの背の低い画面：パネルを左の列に（段階・ドラッグは使わず、列の高さいっぱいでスクロール）、地図は右に
  const side = useSideLayout();
  const sideW = sidePanelWidth(vw);
  const [mapOk, setMapOk] = useState(true);
  // シート・メニューなどポータルを青緑にそろえる目印（CSS 側でスマホ幅のときだけ効く）
  useEffect(() => {
    document.body.dataset.mui = "1";
    return () => {
      delete document.body.dataset.mui;
    };
  }, []);

  // 確定した実地点（住所・ピン・地図カメラは同じ結果から決める）。候補待ち・見つからないときはカメラを動かさない。
  // 位置の目安（付近・町の中心・推定など）に合わせて、寄り具合とピンの形も決める（パネルの「位置の目安」と同じ判定。lib/position-accuracy.ts）。
  // camera.key はカメラを寄せ直す合図で、確定した結果が出るたびに増える（app/page.tsx の focus は PC の地図と共通で、
  // 候補待ちでも増えるので使わない）
  const [camera, setCamera] = useState<{ cam: CameraTarget | null; key: number }>({ cam: null, key: 0 });
  const [prevShown, setPrevShown] = useState<MobileShown | null>(null);
  if (prevShown !== shown) {
    setPrevShown(shown);
    setCamera(nextCamera(camera, shown?.result ?? null));
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

  // パネルの実際の高さを測る。出典（地理院タイル）をパネルの上に出す位置は、CSS の値（--mui-panel-h）に直接書く
  // （段階の切り替え・ドラッグの間は毎フレーム変わるので、React の再描画をしない）。
  // ホームは内容の高さで決まるので、地図の中心をずらす量にも使う（結果は段階の見込みを使うので、結果の間は React に渡さない）
  const shell = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [panelH, setPanelH] = useState(176);
  /** 横向き（左のパネル）のときの、パネルの右端(px)。地図のピン・日本全体をその右に見せる */
  const [sideRight, setSideRight] = useState(0);
  /** パネルの最後に測った高さ(px)。ホーム⇄結果で高さを動かすときの出発点 */
  const lastH = useRef(0);
  const homeRef = useRef(!shown);
  useLayoutEffect(() => {
    homeRef.current = !shown;
  });
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const h = Math.round(rect.height);
      lastH.current = h;
      // 横向き（左のパネル）では、パネルは右下の出典に重ならない（左下の知らせはパネルの右へ出す。--mui-map-left）
      shell.current?.style.setProperty("--mui-panel-h", side ? "0px" : `${h}px`);
      if (side) setSideRight(Math.round(rect.right));
      // ホーム⇄結果の高さの動きの途中は React に渡さない（毎フレームの再描画をしない。動き終わりに1回だけ渡す）
      else if (homeRef.current && !el.dataset.anim) setPanelH(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [side]);

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
  // Esc（キーボード）でも詳細を閉じる。全画面の地図・シートなど、上に重なる画面があれば、そちらの Esc を優先する（components/use-modal.ts）
  useEffect(() => {
    if (!inDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || e.keyCode === 229 || openModalCount() > 0) return;
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
  // 横向き（左のパネル）は下を覆わないので 0。代わりに左のパネルの右端より右に見せる（測る前は幅からの見込み）
  const hasResult = !!shown;
  const mapInset = side ? 0 : Math.min(hasResult ? snapPx(saved ?? snap, vh) : panelH, MAX_MAP_INSET);
  const mapLeft = side ? sideRight || sideW + 8 : 0;

  // ホーム（内容の高さ）⇄ 結果（段階の高さ）で、パネルの高さを動かす。CSS は内容の高さ（auto）との間を動かせず、
  // 一瞬で替わってしまうので、替わる前の高さ(px)から目標の高さへ、パネルの動き（--mui-dur-panel）で動かす。
  // 地図のカメラの動きと同時に始まり、検索の確定 → 地点へのカメラ → 結果がひと続きに見える（待たせない。動いている間も操作できる）。
  // 横向き（左のパネル）は高さが列で決まるので動かさない。reduced-motion では動かさない
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasResult = useRef(hasResult);
  useLayoutEffect(() => {
    if (wasResult.current === hasResult) return;
    wasResult.current = hasResult;
    const el = panel.current;
    const from = lastH.current;
    if (!el || side || reduced || !from) return;
    if (animTimer.current) clearTimeout(animTimer.current);
    // 目標：結果は段階の高さ（React が style に付けた値）、ホームは内容の高さ（いま測る）
    const target = hasResult ? el.style.height : `${Math.round(el.getBoundingClientRect().height)}px`;
    if (!target) return;
    el.dataset.anim = "1";
    el.style.height = `${from}px`;
    // ここまでの高さを確定させてから目標へ（そうしないと transition が効かない）
    el.getBoundingClientRect();
    el.style.height = target;
    animTimer.current = setTimeout(() => {
      animTimer.current = null;
      delete el.dataset.anim;
      if (!homeRef.current) return;
      // ホームは内容の高さ（auto）に戻す（履歴の増減に合わせて伸び縮みする）。地図の中心をずらす量も1回だけ渡す
      el.style.height = "";
      setPanelH(Math.round(el.getBoundingClientRect().height));
    }, PANEL_MS + 50);
  });
  useEffect(
    () => () => {
      if (animTimer.current) clearTimeout(animTimer.current);
    },
    [],
  );

  // ヘッダー限定のドラッグ（本文のスクロールとは分ける）。指に合わせてパネルの高さを直接動かし（毎フレームの React の再描画はしない）、
  // 離したら、離した高さと指の速さで近い段階へ（lib/panel-snap.ts）。取り消された（pointercancel など）ら元の段階に戻す。
  // ヘッダーのボタンは pointerdown を止めているので、押してもドラッグにならない
  const drag = useRef<{ id: number; y: number; startH: number; h: SnapHeights; moved: boolean; v: number; lastY: number; lastT: number } | null>(null);
  /** 中・大の段階の実際の高さを測るための、見えない要素（dvh・セーフエリアを CSS と同じ式で） */
  const probeMedium = useRef<HTMLDivElement>(null);
  const probeLarge = useRef<HTMLDivElement>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 横向き（左のパネル）は段階が無い（列の高さいっぱいで、中をスクロール）
    if (side || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    const el = panel.current;
    if (!el) return;
    const now = el.getBoundingClientRect().height;
    // パネルの高さの上限（style の maxHeight と同じ）
    const max = (shell.current?.clientHeight ?? now + kbd + 8) - kbd - 8;
    const h: SnapHeights = {
      small: snapPx("small", vh),
      medium: Math.min(probeMedium.current?.offsetHeight ?? now, max),
      large: Math.min(probeLarge.current?.offsetHeight ?? now, max),
    };
    drag.current = { id: e.pointerId, y: e.clientY, startH: now, h, moved: false, v: 0, lastY: e.clientY, lastT: e.timeStamp };
    // パネルが段階の間を動いている途中でも、触れた所で止める（そのまま動き続けて、指が動き出したときに跳ねないように）
    el.dataset.dragging = "1";
    el.style.height = `${now}px`;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = panel.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y;
    // 少しの指のぶれはタップとみなす
    if (!d.moved && Math.abs(dy) < DRAG_SLOP) return;
    d.moved = true;
    d.v = nextVelocity(d.v, e.clientY - d.lastY, e.timeStamp - d.lastT);
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    el.style.height = `${dragHeight(d.startH, dy, d.h)}px`;
  };
  const finish = (e: React.PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const el = panel.current;
    if (!el) return;
    delete el.dataset.dragging;
    // タップ（ほとんど動かしていない）・取り消し（pointercancel など）は今の段階のまま（止めた所から、その段階の高さへ戻る）
    const next = cancelled || !d.moved ? snap : snapAfterRelease(dragHeight(d.startH, e.clientY - d.y, d.h), d.v, e.timeStamp - d.lastT, d.h);
    // 段階の高さ（CSS）に戻す。指を離した高さから、パネルの動き（--mui-dur-panel）でその段階へ動く。React の値と同じにしておく
    el.style.height = SNAP_HEIGHT[next];
    if (next !== snap) setSnap(next);
  };

  // 検索中か、結果の画面で住所を書き換えた（まだ調べていない）：「キャンセル」で検索を止め、今の結果の住所に戻す（物件・パネルはそのまま）。
  // Esc は入力欄にいたまま取り消す。ボタンのときはキーボードも閉じる
  const editing = loading || (!!shown && input.trim() !== shown.query.trim());
  const cancelByKey = () => onCancelEdit?.();
  const cancelEdit = () => {
    onCancelEdit?.();
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && a.id === "address") a.blur();
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

  const snapBtn = "mui-press mui-hit flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mui-primary-soft)] text-[var(--mui-primary)] disabled:opacity-40";

  return (
    <PanelDetailContext.Provider value={api}>
      <div
        ref={shell}
        className="relative min-h-0 flex-1 overflow-hidden bg-[var(--mui-primary-soft)] text-[var(--mui-ink)]"
        style={{ "--mui-kbd": `${kbd}px`, "--mui-map-left": `${mapLeft}px` } as React.CSSProperties}
        data-side={side ? "1" : undefined}
      >
        {/* 中・大の段階の実際の高さを測る（ドラッグの始めだけ読む。見えない・場所を取らない） */}
        <div ref={probeMedium} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 w-0" style={{ height: SNAP_HEIGHT.medium }} />
        <div ref={probeLarge} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 w-0" style={{ height: SNAP_HEIGHT.large }} />
        {/* 地図が失敗しても、住所入力（下のパネル）は使える */}
        {mapOk && <JapanMap point={camera.cam} focus={camera.key} bottomInset={mapInset} leftInset={mapLeft} reducedMotion={reduced} onFail={() => setMapOk(false)} />}
        {!mapOk && (
          <p role="status" className="absolute inset-x-4 top-24 rounded-xl bg-white/90 p-3 text-[13px] text-[var(--mui-muted)]" style={side ? { left: mapLeft + 8, top: 16 } : undefined}>
            地図を表示できませんでした。住所を入力して調べられます。
          </p>
        )}

        {/* ロゴ・メニューの帯。縦向きは上の中央、横向きは左の列（パネルの上）。地図の側を空ける */}
        <div
          className={`pointer-events-none absolute top-0 pt-[max(8px,env(safe-area-inset-top))] ${side ? "" : "inset-x-0 px-3"}`}
          style={side ? { left: SIDE_LEFT, width: sideW } : undefined}
        >
          <div className={`pointer-events-auto rounded-2xl bg-white/90 px-3 py-1.5 shadow-[0_2px_12px_rgba(15,118,110,0.15)] backdrop-blur ${side ? "" : "mx-auto max-w-md"}`}>
            <Header compact onMenu={onMenu} onHome={hasResult ? onHome : undefined} />
          </div>
        </div>

        <section
          ref={panel}
          aria-label={hasResult ? "調査結果" : "住所を調べる"}
          style={
            side
              ? // 横向き：左の列。結果は列の高さいっぱい（中をスクロール）、ホームは内容の高さ（列の高さまで）。キーボードの分は下を上げる。
                // 横向きのキーボードは高さの半分以上を覆うので、入力中はパネルをロゴの帯の上まで上げて、入力欄が隠れないようにする
                {
                  left: SIDE_LEFT,
                  top: kbd > 0 ? SIDE_TOP : SIDE_PANEL_TOP,
                  width: sideW,
                  ...(hasResult ? { bottom: kbd + 8 } : { maxHeight: `calc(100% - ${kbd > 0 ? SIDE_TOP : SIDE_PANEL_TOP} - ${kbd}px - 8px)` }),
                }
              : { height: hasResult ? SNAP_HEIGHT[snap] : undefined, bottom: kbd, maxHeight: `calc(100% - ${kbd}px - 8px)` }
          }
          className={`mui-panel absolute flex flex-col bg-white ${
            side ? "rounded-3xl shadow-[0_6px_24px_rgba(15,60,56,0.2)]" : "inset-x-0 mx-auto max-w-md rounded-t-3xl shadow-[0_-6px_24px_rgba(15,60,56,0.18)]"
          }`}
        >
          {hasResult && (
            <div
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={(e) => finish(e, false)}
              onPointerCancel={(e) => finish(e, true)}
              onLostPointerCapture={(e) => finish(e, true)}
              className={side ? "shrink-0 px-4 pb-1 pt-3" : "shrink-0 cursor-grab touch-none select-none px-4 pb-1 pt-2"}
              data-testid="panel-header"
            >
              {/* つまみ（ドラッグの印）は、段階のある縦向きだけ */}
              {!side && <div className="mx-auto h-1 w-10 rounded-full bg-[var(--mui-line)]" aria-hidden />}
              <div className={`flex items-center gap-2 ${side ? "" : "mt-1.5"}`}>
                {detail && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => detail.close()}
                    aria-label="一覧に戻る"
                    className="mui-press mui-hit flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-[var(--mui-primary-soft)] pl-2 pr-3 text-[13px] font-semibold text-[var(--mui-primary)]"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    戻る
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <h2 ref={titleRef} tabIndex={-1} className="truncate text-[15px] font-semibold outline-none">
                    {detail ? detail.title : title}
                  </h2>
                  {/* 詳細を開いている間も、どの物件の詳細かを見せる */}
                  {detail && <p className="truncate text-[12px] text-[var(--mui-muted)]">{title}</p>}
                  {/* 詳細の間は入力欄と一覧（回る印・エラーの箱）が隠れるので、調べている・失敗したことをここに出す
                      （全画面の地図の「ここで調べる」など、詳細の上から調べ直したとき） */}
                  {detail && loading && (
                    <p role="status" aria-live="polite" className="truncate text-[12px] font-semibold text-[var(--mui-primary)]">
                      調べています…
                    </p>
                  )}
                  {detail && !loading && error && (
                    <p role="alert" className="flex items-center gap-1.5 text-[12px] text-[var(--mui-warn-ink)]">
                      <span className="min-w-0 truncate">{error}</span>
                      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onRetry} className="mui-hit shrink-0 font-semibold text-[var(--mui-primary)] underline">
                        もう一度
                      </button>
                    </p>
                  )}
                </div>
                {/* 段階のボタンは縦向きだけ（横向きの左のパネルは列の高さいっぱい） */}
                {!side && (
                  <>
                    <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setSnap(up(snap))} disabled={snap === "large"} aria-label="パネルを広げる" className={snapBtn}>
                      <ChevronRightIcon className="h-4 w-4 -rotate-90" />
                    </button>
                    <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setSnap(down(snap))} disabled={snap === "small"} aria-label="パネルを狭める" className={snapBtn}>
                      <ChevronRightIcon className="h-4 w-4 rotate-90" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 詳細を開いている間も、一覧・主入力は消さずに隠すだけ（入力欄の部品は同じまま。一覧のスクロール位置も残る） */}
          <div hidden={inDetail} className={`shrink-0 px-4 ${hasResult ? "pb-2" : "pt-4 pb-2"}`}>
            {!hasResult && (
              <div className="mb-3">
                <h1 className="text-[16px] font-semibold leading-snug">不動産の現場に、すぐ使える情報を。</h1>
                <p className="mt-0.5 text-[13px] text-[var(--mui-muted)]">調査対応：{areaText}</p>
              </div>
            )}
            {/* 主入力。ホーム⇄結果で同じ位置・同じ部品のまま（フォーカス中に差し替えない。キャンセルは横に足すだけ） */}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchCard
                  value={input}
                  onChange={setInput}
                  onSearch={onSearch}
                  loading={loading}
                  onMap={hasResult ? undefined : onMap}
                  compact={hasResult}
                  teal
                  onEscape={editing ? cancelByKey : undefined}
                />
              </div>
              {editing && (
                <button type="button" onClick={cancelEdit} className="mui-press mui-hit shrink-0 rounded-full px-1.5 py-2 text-[13px] font-semibold text-[var(--mui-primary)]">
                  キャンセル
                </button>
              )}
            </div>
          </div>

          <div ref={listRef} hidden={inDetail} className="mui-list-in min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
            {error && (
              <div role="alert" className="mb-2 flex items-start gap-2 rounded-2xl bg-[var(--mui-warn-bg)] p-3 text-sm text-[var(--mui-warn-ink)]">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">{error}</span>
                <button type="button" onClick={onRetry} className="mui-press mui-hit shrink-0 rounded-full bg-white px-3 py-1 text-[13px] font-semibold">
                  もう一度
                </button>
              </div>
            )}

            {shown ? (
              <ResultView query={shown.query} result={shown.result} onPick={onPickAddress} onFix={onFix} onExpand={(o) => onExpand(o)} onGuide={onGuide} />
            ) : (
              <div className="space-y-3">
                <HistoryChips items={history.slice(0, 3)} onSelect={onPickHistory} onShowAll={onShowHistory} />
                <div className="flex gap-2 text-[13px]">
                  <button type="button" onClick={onOpenHelp} className="mui-press mui-hit rounded-full bg-[var(--mui-primary-soft)] px-3 py-1.5 font-semibold text-[var(--mui-primary-ink)]">
                    使い方
                  </button>
                  <button type="button" onClick={onOpenCities} className="mui-press mui-hit rounded-full bg-[var(--mui-primary-soft)] px-3 py-1.5 font-semibold text-[var(--mui-primary-ink)]">
                    対応エリア
                  </button>
                </div>
              </div>
            )}

            <p className="mt-3 flex items-start gap-2 text-[12px] leading-[1.7] text-[var(--mui-muted)]">
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
