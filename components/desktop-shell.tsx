"use client";

// PC の画面「調査デスク」（横幅 1024px 以上。スマホは components/app）。全面に「地図」（MapLibre ＋ 地理院タイル。components/live-map.tsx）か
// 「3D」（Google の実写 3D、出せなければ地理院のデータの街の模型。components/desk/stage-3d.tsx）を敷き、上の帯（ロゴ・検索欄・時間帯・
// 対応エリア・使い方・設定）、左の細い列（検索・いまの物件・お気に入り・履歴・書類・比較・使い方・表示）、右のカルテ（components/desk/property.tsx）、
// 真ん中に重ねて開く画面（お気に入り・履歴・書類・比較・使い方・対応エリア・設定・要注意点・取引事例）を置く。
// 規約：Google の 3D を出している間は、地理院の地図（タイル）を同じ画面に出さない（地図と 3D は切り替えで、同時に見えない。案内図など
// 地理院の地図のある画面を開くときは、Google の 3D を隠す）。住所はサーバーに送らない（データはブラウザから公的な API へ直接）
import { Box, Compass, LocateFixed, Map as MapIcon, Maximize2, Minimize2, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { addCompare, clearCompare, loadCompare, removeCompare, type CompareItem } from "@/lib/app/compare";
import { loadPrefs, savePrefs, todOfSun, ZOOM_DIST, type DeskPrefs, type DeskTod, type GoogleFail } from "@/lib/app/desk";
import { placeParts } from "@/lib/app/scene";
import { BASE, solar } from "@/lib/app/sun";
import { favoriteKey, toggleFavoriteChecked, type FavoriteItem } from "@/lib/favorites";
import { historyKey, type HistoryItem } from "@/lib/history";
import { setMapOverlay, showHazardOnMap, showLandPriceOnMap } from "@/lib/map-style";
import type { AddressFix, LookupResult } from "@/lib/roadmap";
import type { HazardKind } from "@/lib/roadmap/hazard";
import { setMotionSetting, useMotionSetting } from "./app/motion";
import { reducedMotion } from "./app/tokens";
import { MapIllustration } from "./illustrations";
import type { MapPlace } from "./live-map";
import { MapPanel } from "./map-panel";
import { MapPreview } from "./map-preview";
import { ResultView } from "./result-view";
import { Banner, isMac, Rail, Topbar, Welcome, type RailKey } from "./desk/chrome";
import type { DocKind } from "./desk/docs";
import { googleFailed, GOOGLE_3D_CONFIGURED } from "./desk/google-3d";
import { AreaOverlay, CompareOverlay, FavoritesOverlay, GuideOverlay, HistoryOverlay, placeLabel, SettingsOverlay } from "./desk/overlays";
import { DeskProperty, itemOf, type Layers3D, type PropOverlay } from "./desk/property";
import type { MapLayer, SectionKey } from "./desk/sections";
import { modelCredit, type Engine, type StageControls } from "./desk/stage-3d";
import { ToastView, useToast } from "./desk/ui";

type Shown = { query: string; result: LookupResult; literal?: AddressFix };
type ShellOverlay = "favorites" | "history" | "compare" | "guide" | "area" | "settings";
type AnyOverlay = ShellOverlay | PropOverlay;

/** 上の帯・左の列・カルテの大きさ（app/desk.css と同じ値。地図と 3D の物件を、見えている所の真ん中に置くのに使う） */
const PAD_X = 16;
const PAD_Y = 12;
const GAP = 12;
const RAIL = 76;
const TOP = 56;
const karteWidth = (w: number) => (w < 1200 ? 420 : 456);

/** 画面の大きさ */
function useViewport(): { w: number; h: number } {
  const [v, setV] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return v;
}

/** 端末の「視差効果を減らす」 */
function useReduced(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    reducedMotion,
    () => false,
  );
}

/** 時計に合わせた時間帯と太陽（物件の場所の太陽。5 分ごとに見直す） */
function useClockSun(lat: number, lng: number): { tod: DeskTod; az: number; alt: number } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    const s = solar(new Date(now), { lat, lng, utcOffset: 540 });
    return { tod: todOfSun(s.altitude, s.rising), az: Math.round(s.azimuth), alt: Math.round(s.altitude) };
  }, [now, lat, lng]);
}

export function DesktopShell({
  shown,
  focus,
  input,
  setInput,
  loading,
  error,
  history,
  favorites,
  setFavorites,
  areaText,
  onSearch,
  onPickAddress,
  onLiteral,
  onPickPoint,
  onPickHistory,
  onRemoveHistory,
  onClearHistory,
  onHome,
}: {
  shown: Shown | null;
  /** 住所で調べた回数（変わると地図が物件の場所へ戻る） */
  focus: number;
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  error: string | null;
  history: HistoryItem[];
  favorites: FavoriteItem[];
  setFavorites: (f: FavoriteItem[]) => void;
  areaText: string;
  onSearch: () => void;
  onPickAddress: (address: string) => void;
  onLiteral?: (fix: AddressFix) => void;
  onPickPoint: (lat: number, lng: number) => void;
  onPickHistory: (item: HistoryItem) => void;
  onRemoveHistory: (items: HistoryItem[]) => void;
  onClearHistory: () => void;
  onHome?: () => void;
}) {
  const ok = shown?.result.status === "ok" ? shown.result : null;
  const point = shown && (shown.result.status === "ok" || shown.result.status === "unsupported") ? { lat: shown.result.lat, lng: shown.result.lng } : undefined;
  const vp = useViewport();
  const reduced = useReduced();
  const motion = useMotionSetting();
  const [mac] = useState(isMac);
  const [toast, showToast, hideToast] = useToast();

  // 設定（端末に保存）
  const [prefs, setPrefsState] = useState<DeskPrefs>(loadPrefs);
  const setPrefs = useCallback(
    (p: DeskPrefs) => {
      setPrefsState(p);
      if (!savePrefs(p)) showToast("設定をこの端末に保存できませんでした（開いている間は使えます）");
    },
    [showToast],
  );
  const clock = useClockSun(point?.lat ?? BASE.lat, point?.lng ?? BASE.lng);
  const tod: DeskTod = prefs.todMode === "clock" ? clock.tod : prefs.tod;
  const sun = prefs.todMode === "clock" ? { az: clock.az, alt: clock.alt } : undefined;

  // 地図 ⇄ 3D（ページを開くたびに地図から。3D は開いたときだけ読み込む）
  const [mode, setMode] = useState<"map" | "3d">("map");
  const view: "map" | "3d" = ok && mode === "3d" ? "3d" : "map";
  const [wide, setWide] = useState(false);
  const [layers3d, setLayers3d] = useState<Layers3D>({ parcels: true, zoning: false, hazard: false, places: false });

  // 重ねて開く画面・カルテで開いている項目は、物件が変わったら閉じる・最初に戻す（開いたときの物件を覚えて比べる）
  const [ov, setOv] = useState<{ name: AnyOverlay; at: Shown | null } | null>(null);
  const overlay = ov && (ov.at === shown || ["guide", "area", "settings"].includes(ov.name)) ? ov.name : null;
  const setOverlay = useCallback((name: AnyOverlay | null) => setOv(name ? { name, at: shown } : null), [shown]);
  const [sec, setSec] = useState<{ key: SectionKey | null; at: Shown | null }>({ key: "basic", at: null });
  const section = sec.at === shown ? sec.key : "basic";
  const setSection = useCallback((key: SectionKey | null) => setSec({ key, at: shown }), [shown]);
  const [docKind, setDocKind] = useState<DocKind>("draft");

  // 物件から届くもの（左の列の札・地図の駅と学校・いま出している 3D・案内図を開いているか）
  const [info, setInfo] = useState<{ lot?: string; town: string } | null>(null);
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [engine, setEngine] = useState<{ e: Engine; note?: string } | null>(null);
  const [gsiPane, setGsiPane] = useState(false);
  const told = useRef(false);
  const onEngine = useCallback(
    (e: Engine, note?: string) => {
      setEngine({ e, note });
      // 上限・断られた・読めないときは、代わりの 3D に切り替えたことを一言だけ知らせる（鍵が無いのはいつものことなので知らせない）
      const f = googleFailed();
      if (e === "model" && note && f && f !== "nokey" && !told.current) {
        told.current = true;
        showToast(note);
      }
    },
    [showToast],
  );

  // 比較（端末に保存）
  const [compare, setCompare] = useState<CompareItem[]>(() => loadCompare());

  // 地図・3D の物件の置き場所（見えている所）
  const karteShown = !!ok && !wide && overlay !== "docs" && overlay !== "compare";
  const frame = {
    left: wide ? PAD_X : PAD_X + RAIL + GAP,
    right: karteShown ? PAD_X + karteWidth(vp.w) + GAP : PAD_X,
    top: PAD_Y + TOP + GAP,
    bottom: PAD_Y,
  };

  const [stageSlot, setStageSlot] = useState<HTMLDivElement | null>(null);
  const [centerEl, setCenterEl] = useState<HTMLElement | null>(null);
  const [creditSlot, setCreditSlot] = useState<HTMLDivElement | null>(null);
  // 3D の出典の高さ（重ねる画面をその上で止め、ロゴと出典をいつも見せる）
  const [creditBox, setCreditBox] = useState<HTMLDivElement | null>(null);
  const [creditH, setCreditH] = useState(0);
  useEffect(() => {
    if (!creditBox) return;
    const ro = new ResizeObserver(() => setCreditH(Math.ceil(creditBox.getBoundingClientRect().height)));
    ro.observe(creditBox);
    return () => ro.disconnect();
  }, [creditBox]);
  const controlsRef = useRef<StageControls | null>(null);
  // カルテの「比較に加える」と同じ（比較の画面の「今の物件を加える」から呼ぶ）
  const addCurrentRef = useRef<(() => void) | null>(null);
  const [recenter, setRecenter] = useState(0);

  // ⌘K・Ctrl+K・「/」で検索欄へ（入っている住所を選んだ状態）。Esc で大きく見るのをやめる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      const k = e.key.toLowerCase();
      if ((k === "k" && (e.metaKey || e.ctrlKey) && !e.altKey) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        if (e.isComposing) return;
        const field = document.getElementById("address") as HTMLInputElement | null;
        if (!field) return;
        e.preventDefault();
        field.focus();
        field.select();
        return;
      }
      if (e.key === "Escape" && wide && !document.querySelector("[role=dialog]")) setWide(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wide]);

  const favItem = ok && shown ? itemOf(shown.query, ok) : null;
  const isFav = !!favItem && favorites.some((f) => favoriteKey(f) === favoriteKey(favItem));
  const toggleFav = (item: HistoryItem) => {
    const r = toggleFavoriteChecked(item);
    setFavorites(r.items);
    showToast(!r.saved ? "お気に入りを保存できませんでした（この端末の保存がいっぱいか、保存できない設定です）" : r.added ? "お気に入りに保存しました" : "お気に入りから外しました");
  };
  const addToCompare = (c: CompareItem) => {
    const r = addCompare(compare, c);
    setCompare(r.list);
    showToast({
      text: r.dropped ? `比較に加えました（いっぱいなので「${r.dropped.title}」を外しました）` : `比較に加えました（${r.list.length}件）`,
      action: r.list.length >= 2 ? { label: "並べて見る", run: () => setOverlay("compare") } : undefined,
    });
  };

  /** 地図に切り替えて、その種類を重ねる（カルテの「地図に重ねる」・3D の用途地域とハザード） */
  const toMap = useCallback((layer?: MapLayer, arg?: HazardKind | [number, number]) => {
    setMode("map");
    if (!layer) return;
    // 地図は隠れていても読み込んであるので、切り替えたあとすぐに重ねられる
    requestAnimationFrame(() => {
      if (layer === "hazard") showHazardOnMap(typeof arg === "string" ? arg : "flood");
      else if (layer === "landPrice" && Array.isArray(arg)) showLandPriceOnMap(arg);
      else setMapOverlay(layer, true);
    });
  }, []);
  const onFix = useCallback(() => {
    setMode("map");
    setOverlay(null);
    showToast("地図のピンを物件の場所へ動かすか、地図をクリックして「ここで調べる」を押してください");
  }, [setOverlay, showToast]);

  const onRail = (k: RailKey) => {
    if (k === "home") {
      setOverlay(null);
      const field = document.getElementById("address") as HTMLInputElement | null;
      field?.focus();
      field?.select();
      return;
    }
    if (k === "docs") {
      if (ok) setOverlay(overlay === "docs" ? null : "docs");
      return;
    }
    setOverlay(overlay === k ? null : k);
  };
  const goHome = () => {
    setOverlay(null);
    setWide(false);
    onHome?.();
  };
  const pickTod = (t: DeskTod) => setPrefs({ ...prefs, todMode: "manual", tod: t });

  // Google の 3D の状態（設定の画面に出す）
  const gstate: GoogleFail | "ok" | "idle" = !GOOGLE_3D_CONFIGURED ? "nokey" : (googleFailed() ?? (engine?.e === "google" ? "ok" : "idle"));
  const motionOn = motion && !reduced;
  const showInfo = ok ? info : null;
  const propKey = ok && shown ? `${shown.query}|${ok.lat},${ok.lng}` : "";

  const deskStyle = {
    "--desk-left": `${frame.left}px`,
    "--desk-right": `${frame.right}px`,
    "--desk-top": `${frame.top}px`,
    "--desk-credit-h": `${view === "3d" ? creditH : 0}px`,
  } as React.CSSProperties;

  // 代わりの 3D（街の模型）の出典：使っているものだけ（見せ方で変わる。DeskProperty の見せ方の決め方と同じ）
  const modelView = layers3d.zoning ? "law" : layers3d.hazard ? "hazard" : layers3d.places ? "around" : section === "road" || section === "law" || section === "hazard" || section === "around" || section === "price" ? section : "basic";
  const credit3d = view === "3d" && engine?.e === "model" && ok ? modelCredit(modelView, true) : null;

  return (
    <div className="desk" data-theme={prefs.theme} data-karte={karteShown ? "1" : undefined} data-wide={wide ? "1" : undefined} data-ovwide={overlay === "docs" || overlay === "compare" ? "1" : undefined} data-ov={overlay ? "1" : undefined} data-view={view} data-motion={motionOn ? undefined : "off"} style={deskStyle}>
      {/* 全面：地図（いつも読み込んでおき、3D の間は見せない）と 3D */}
      <div className="desk-stage">
        <div className="desk-layer" hidden={view !== "map"} aria-hidden={view !== "map"}>
          <MapPanel
            point={point}
            sheet={ok ? ok.links.find((l) => l.sheet)?.sheet : undefined}
            parcel={ok?.parcel}
            roads={ok ? (() => {
              const l = ok.links.find((x) => x.read);
              return l?.read ? { read: l.read, city: ok.municipality.name } : undefined;
            })() : undefined}
            focusKey={focus + recenter}
            onPick={onPickPoint}
            padding={{ left: frame.left + 8, top: frame.top + 8, right: frame.right + 8, bottom: frame.bottom + 8 }}
            toolsClassName="desk-map-tools"
            skin="desk"
            places={ok ? places : undefined}
            fallback={
              <div className="absolute inset-0" style={{ paddingLeft: frame.left, paddingRight: frame.right, paddingTop: frame.top, paddingBottom: frame.bottom }}>
                {point ? <MapPreview lat={point.lat} lng={point.lng} className="h-full" large /> : <MapIllustration className="h-full w-full opacity-70" />}
              </div>
            }
          />
        </div>
        <div ref={setStageSlot} className="desk-layer" hidden={view !== "3d"} />
      </div>

      <div className="desk-ui">
        <Topbar input={input} setInput={setInput} loading={loading} onSearch={onSearch} onHome={goHome} tod={tod} todAuto={prefs.todMode === "clock"} onTod={pickTod} onOpen={(k) => setOverlay(overlay === k ? null : k)} open={overlay} mac={mac} />
        <Rail
          open={overlay}
          onOpen={onRail}
          favorites={favorites.length}
          compare={compare.length}
          docsReady={!!ok}
          props={[
            ...(showInfo && ok
              ? [
                  {
                    key: propKey,
                    title: showInfo.lot ?? showInfo.town,
                    sub: showInfo.lot ? showInfo.town : ok.municipality.name,
                    current: true,
                    onClick: () => {
                      setOverlay(null);
                      setWide(false);
                      setRecenter((n) => n + 1);
                      controlsRef.current?.recenter();
                      document.querySelector(".desk-sections")?.scrollTo({ top: 0, behavior: motionOn ? "smooth" : "auto" });
                    },
                  },
                ]
              : []),
            // 最近調べた物件（履歴の新しい順。いまの物件は除く）
            ...history
              .filter((h) => !favItem || historyKey(h) !== historyKey(favItem))
              .slice(0, showInfo ? 2 : 3)
              .map((h) => {
                const t = placeLabel(h);
                return {
                  key: historyKey(h),
                  title: t.big,
                  // 札は狭いので、地番の下は町名だけ（いまの物件の札と同じ）
                  sub: (t.big !== placeParts(h).town && placeParts(h).town) || t.place,
                  current: false,
                  onClick: () => {
                    setOverlay(null);
                    onPickHistory(h);
                  },
                };
              }),
          ]}
        />

        <section ref={setCenterEl} className="desk-center" aria-label="地図と 3D">
          {/* 地図 ⇄ 3D・大きく見る */}
          {ok && (
            <div className="desk-modebar">
              <div className="seg" role="group" aria-label="地図と 3D の切り替え">
                <button type="button" aria-pressed={view === "map"} onClick={() => setMode("map")}>
                  <span className="inline-flex items-center gap-1">
                    <MapIcon size={14} aria-hidden />
                    地図
                  </span>
                </button>
                <button type="button" aria-pressed={view === "3d"} onClick={() => setMode("3d")} title={GOOGLE_3D_CONFIGURED ? "Google の実写 3D（出せないときは地理院のデータの街の模型）" : "地理院のデータで作った街の模型"}>
                  <span className="inline-flex items-center gap-1">
                    <Box size={14} aria-hidden />
                    3D
                  </span>
                </button>
              </div>
              <button type="button" className="btn small" aria-pressed={wide} onClick={() => setWide((v) => !v)} title={wide ? "元の画面に戻す（Esc）" : "左の列とカルテを隠して大きく見る"}>
                {wide ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
                {wide ? "元に戻す" : "大きく見る"}
              </button>
            </div>
          )}

          {/* 3D の層と操作 */}
          {view === "3d" && ok && (
            <>
              <div className="desk-layers" role="group" aria-label="3D に重ねるもの">
                <button type="button" className="btn" aria-pressed={layers3d.parcels} onClick={() => setLayers3d((l) => ({ ...l, parcels: !l.parcels }))}>
                  <i aria-hidden />
                  筆・地番
                </button>
                {(["zoning", "hazard", "places"] as const).map((k) => {
                  const label = k === "zoning" ? "用途地域" : k === "hazard" ? "ハザード" : "駅・学校";
                  // Google の 3D には地理院・国の地図の色（用途地域・ハザード）を重ねない。地図に切り替えて重ねる
                  const toMapOnly = engine?.e === "google" && k !== "places";
                  return (
                    <button
                      key={k}
                      type="button"
                      className="btn"
                      aria-pressed={!toMapOnly && layers3d[k]}
                      title={toMapOnly ? `地図に切り替えて${label}を重ねます（Google の 3D には重ねません）` : engine?.e === "model" && k !== "places" ? `街の模型の地面に${label}の色を敷きます` : undefined}
                      onClick={() => {
                        if (toMapOnly) return toMap(k === "zoning" ? "zoning" : "hazard");
                        // 街の模型の見せ方は1つずつ（用途地域・ハザード・駅と学校）
                        setLayers3d((l) => ({ ...l, zoning: k === "zoning" ? !l.zoning : false, hazard: k === "hazard" ? !l.hazard : false, places: k === "places" ? !l.places : engine?.e === "google" ? l.places : false }));
                      }}
                    >
                      <i aria-hidden />
                      {label}
                      {toMapOnly && <span className="text-[11px] text-[var(--muted)]">（地図で）</span>}
                    </button>
                  );
                })}
              </div>
              <div className="desk-ctl" role="group" aria-label="3D の操作">
                <button type="button" className="btn" onClick={() => controlsRef.current?.zoomIn()} aria-label="寄る" title="寄る（＋）">
                  <Plus size={18} />
                </button>
                <button type="button" className="btn" onClick={() => controlsRef.current?.zoomOut()} aria-label="引く" title="引く（−）">
                  <Minus size={18} />
                </button>
                <button type="button" className="btn" onClick={() => controlsRef.current?.rotate(1)} aria-label="左へ回す" title="左へ回す（←）">
                  <RotateCcw size={17} />
                </button>
                <button type="button" className="btn" onClick={() => controlsRef.current?.rotate(-1)} aria-label="右へ回す" title="右へ回す（→）">
                  <RotateCw size={17} />
                </button>
                <button type="button" className="btn" onClick={() => controlsRef.current?.northUp()} aria-label="北を上に" title="北を上に">
                  <Compass size={18} />
                </button>
                <button type="button" className="btn" onClick={() => controlsRef.current?.recenter()} aria-label="物件の場所へ" title="物件の場所へ（0）">
                  <LocateFixed size={18} />
                </button>
              </div>
              <div className="desk-foot">
                <div className="desk-hints" aria-label="3D の操作のしかた">
                  <span>ドラッグで回す</span>
                  <span>Shift＋ドラッグで動かす</span>
                  <span>ホイールで寄る</span>
                  {engine?.e === "model" && <span>土地をクリックで地番</span>}
                </div>
                <div ref={setCreditBox} className="desk-credits">
                  {credit3d && <p className="desk-credit">{credit3d.join("・")}</p>}
                  <div ref={setCreditSlot} className="flex flex-col items-start gap-1.5" />
                </div>
              </div>
            </>
          )}

          <Banner loading={loading} error={error} />

          {!shown && !overlay && <Welcome history={history} areaText={areaText} onPick={onPickHistory} onExample={(q) => { setInput(q); onPickAddress(q); }} onAll={() => setOverlay("history")} onArea={() => setOverlay("area")} />}
          {shown && !ok && !overlay && (
            <div className="desk-card glass">
              <ResultView query={shown.query} result={shown.result} onPick={onPickAddress} desktop />
            </div>
          )}

          {overlay === "favorites" && (
            <FavoritesOverlay
              items={favorites}
              onOpen={(f) => {
                setOverlay(null);
                onPickHistory(f);
              }}
              onRemove={(f) => {
                const r = toggleFavoriteChecked(f);
                setFavorites(r.items);
                showToast(r.saved ? "お気に入りから外しました" : "保存できませんでした");
              }}
              onClose={() => setOverlay(null)}
            />
          )}
          {overlay === "history" && (
            <HistoryOverlay
              items={history}
              onOpen={(h) => {
                setOverlay(null);
                onPickHistory(h);
              }}
              onRemove={(items) => onRemoveHistory(items)}
              onClear={onClearHistory}
              onClose={() => setOverlay(null)}
            />
          )}
          {overlay === "compare" && (
            <CompareOverlay
              items={compare}
              current={!!ok}
              onAddCurrent={() => addCurrentRef.current?.()}
              onOpen={(c) => {
                setOverlay(null);
                onPickHistory(c.item);
              }}
              onRemove={(c) => setCompare(removeCompare(compare, c.key))}
              onClear={() => setCompare(clearCompare())}
              onClose={() => setOverlay(null)}
            />
          )}
          {overlay === "guide" && <GuideOverlay mac={mac} onClose={() => setOverlay(null)} />}
          {overlay === "area" && <AreaOverlay onClose={() => setOverlay(null)} />}
          {overlay === "settings" && (
            <SettingsOverlay
              prefs={prefs}
              setPrefs={setPrefs}
              motion={motion}
              setMotion={setMotionSetting}
              google={gstate}
              onClose={() => setOverlay(null)}
              onClearCompare={() => {
                setCompare(clearCompare());
                showToast("比較を全部外しました");
              }}
            />
          )}
        </section>

        {ok && shown && (
          <DeskProperty
            key={propKey}
            query={shown.query}
            result={ok}
            mode={view}
            section={section}
            setSection={setSection}
            overlay={overlay}
            setOverlay={setOverlay}
            docKind={docKind}
            setDocKind={setDocKind}
            layers3d={layers3d}
            stageSlot={stageSlot}
            centerEl={centerEl}
            creditSlot={creditSlot}
            frame={frame}
            tod={tod}
            sun={sun}
            dist={ZOOM_DIST[prefs.zoom]}
            motion={motionOn}
            reduced={reduced || !motion}
            hide3d={gsiPane}
            favorite={isFav}
            onFavorite={toggleFav}
            onCompare={addToCompare}
            onPick={onPickAddress}
            onLiteral={onLiteral}
            onMap={toMap}
            onFix={onFix}
            onPlaces={setPlaces}
            onEngine={onEngine}
            onInfo={setInfo}
            onGsiPane={setGsiPane}
            controlsRef={controlsRef}
            addCurrentRef={addCurrentRef}
            toast={showToast}
          />
        )}
      </div>
      <ToastView toast={toast} onHide={hideToast} />
    </div>
  );
}
