"use client";

// スマホの画面（紺の新しい見た目）。検索する前のホームは新しいUIの絵どおり（components/app/home.tsx）。
// それ以外は上の写真の部分と検索窓・白いカード・下のメニューの枠の中に、物件の6つのタブ（基本情報・周辺環境・相場・取引・法令・規制・
// ハザード・取引事例）、検索履歴・お気に入り・書類・出力・その他を出す。
// 幅393ptの絵の寸法で描き、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）。下から出す画面（シート）は拡大・縮小しない
import { Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { favoriteKey, toggleFavorite, removeFavorite, type FavoriteItem } from "@/lib/favorites";
import type { HistoryItem } from "@/lib/history";
import { MUNICIPALITIES, type LookupResult } from "@/lib/roadmap";
import { BUILDING_DATA } from "@/lib/roadmap/building-data";
import { LAND_PRICE_DATA } from "@/lib/roadmap/land-price-data";
import { chibanLabel, chibanQueryOf, kuikiLabel, parcelMark, registryChiban } from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { HOSPITAL_SOURCE } from "@/lib/roadmap/facilities";
import { POI_DATA } from "@/lib/roadmap/poi";
import { SCHOOL_DATA } from "@/lib/roadmap/school-data";
import { STATION_DATA } from "@/lib/roadmap/walk";
import { ZONING_DATA } from "@/lib/roadmap/zoning-data";
import { DEALS_DATA, DEALS_NOTE } from "@/lib/roadmap/deals";
import { buildSummary } from "@/lib/summary";
import { DraftSheet } from "../draft-sheet";
import { FullMap } from "../full-map";
import { GuideMapSheet } from "../guide-map";
import { CitiesSheet, HelpSheet, MenuSheet } from "../info-sheets";
import { LocationPicker } from "../location-picker";
import { addressOffLot, registryNeighbors } from "../parcel-card";
import { PrintSheet } from "../print-sheet";
import { copyText, loaded } from "../result-view";
import { TriageSheet, useChecklist } from "../triage-sheet";
import { Sheet } from "../sheet";
import { useCopy } from "../use-copy";
import { MapAppsSheet, ReportSheet } from "./app-sheets";
import { DetailSheet } from "./detail-sheets";
import { ART_W, BottomNav, Hero, SheetFrame, ZOOM, type NavKey } from "./frame";
import { HomeScreen, modeOf, PAGE, type HomeMessage, type SearchMode } from "./home";
import { markNewsSeen, NewsSheet, useUnreadNews } from "./news";
import { NotOkPage } from "./pages";
import { AccountPage, DocsPage, FavoritesPage, HistoryPage, TabBanner } from "./tab-pages";
import { BottomActions, PropertyHeader, TabBar, type TabKey } from "./property-head";
import { AroundTab } from "./tab-around";
import { BasicTab } from "./tab-basic";
import { DealsTab } from "./tab-deals";
import { HazardTab } from "./tab-hazard";
import { LawTab } from "./tab-law";
import { PriceTab } from "./tab-price";
import type { MapOpen, SheetKind, TabProps } from "./types";
import { useProperty, type Ok, type PropertyData } from "./use-property";
import { applyAppZoom } from "./zoom";

type Shown = { query: string; result: LookupResult };

const noop = () => () => {};
/** 下から出す画面は document.body に出す（拡大・縮小している枠の外に置く） */
function Portal({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return client ? createPortal(<div className="theme-navy">{children}</div>, document.body) : null;
}

export type MobileAppProps = {
  shown: Shown | null;
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  error: string | null;
  history: HistoryItem[];
  favorites: FavoriteItem[];
  setFavorites: (f: FavoriteItem[]) => void;
  onSearch: () => void;
  onPickAddress: (address: string) => void;
  onPickPoint: (lat: number, lng: number) => void;
  onPickHistory: (h: HistoryItem) => void;
  onClearHistory: () => void;
  onHome: () => void;
  areaText: string;
};

type AppSheet = "menu" | "help" | "cities" | "sources" | null;

export function MobileApp(props: MobileAppProps) {
  const { shown, input, setInput, loading, error, history, favorites, setFavorites, onSearch, onPickHistory, onPickPoint, areaText } = props;
  const [page, setPage] = useState<NavKey>("home");
  const [sheet, setSheet] = useState<AppSheet>(null);
  const [picker, setPicker] = useState<{ start?: { lat: number; lng: number } } | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // ホームの調べ方（住所・地番・地図）と、調査メニューで選んだ「調べたら開くタブ」・その案内
  const [mode, setMode] = useState<SearchMode>(() => modeOf(input));
  const [startTab, setStartTab] = useState<TabKey | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // 物件の「レポートを作成」（書類・出力）。下のメニューの「書類・出力」からも開く
  const [report, setReport] = useState(false);
  const [news, setNews] = useState(false);
  const unread = useUnreadNews();
  const offline = useOffline();
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 開発中の再マウントで <html> の style が消えたときのため、拡大率をもう一度入れる
  useLayoutEffect(() => applyAppZoom(), []);
  // 自分で document.body に出す部品（重説の下書き・案内図）も紺の色にする（PC はこの画面を使わないので金色のまま）
  useEffect(() => {
    document.body.classList.add("theme-navy");
    return () => document.body.classList.remove("theme-navy");
  }, []);

  // 新しく調べたら、ホーム（物件の画面）のいちばん上へ
  const resultKey = shown ? `${shown.query}|${shown.result.status}|${"lat" in shown.result ? `${shown.result.lat},${shown.result.lng}` : ""}` : "";
  useEffect(() => {
    queueMicrotask(() => setPage("home"));
    scroller.current?.scrollTo(0, 0);
  }, [resultKey]);
  // 物件が開いたら、調査メニューで選んだタブ・案内は使い終わり。開けなかったら（見つからない等）、頼まれていたレポートも開かない
  const status = shown?.result.status;
  useEffect(() => {
    if (!status) return;
    queueMicrotask(() => {
      setStartTab(null);
      setHint(null);
      if (status !== "ok") setReport(false);
    });
  }, [status, resultKey]);
  // 調べられなかった（通信の失敗など）ときも、頼まれていたレポートは開かない（次に調べた物件で急に開かないように）
  useEffect(() => {
    if (error) queueMicrotask(() => setReport(false));
  }, [error]);

  const go = useCallback((p: NavKey) => {
    setPage(p);
    scroller.current?.scrollTo(0, 0);
  }, []);

  const pickHere = () => {
    if (!navigator.geolocation) return setNotice("この端末では現在地を使えません。");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onPickPoint(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        setNotice("現在地を取得できませんでした。位置情報の利用を許可してください。");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const typeChiban = () => {
    setInput("地番 ");
    // 押した操作の中で入力欄に入れる（iPhone はそうしないとキーボードが出ない）
    inputRef.current?.focus();
  };
  const openMap = () => {
    const r = shown?.result;
    setPicker({ start: r && (r.status === "ok" || r.status === "unsupported") ? { lat: r.lat, lng: r.lng } : undefined });
  };
  const pickRecent = (h: HistoryItem) => {
    setPage("home");
    onPickHistory(h);
  };
  /** 調べ方の切り替え。地番の欄では入力に「地番 」を付けて調べる（入力欄には出さない） */
  const changeMode = (m: SearchMode) => {
    setMode(m);
    setNotice(null);
    const text = input.replace(/^\s*地番\s*/, "").trim();
    if (m === "address") setInput(text);
    else if (m === "chiban") setInput(text ? `地番 ${text}` : "");
  };
  const submitHome = () => {
    if (!input.replace(/^\s*地番\s*/, "").trim()) {
      setNotice(mode === "chiban" ? "地番を入れてください。" : "住所を入れてください。地番のときは「地番から検索」を選びます。");
      inputRef.current?.focus();
      return;
    }
    setNotice(null);
    onSearch();
  };

  const ok = shown?.result.status === "ok" ? (shown.result as Ok) : undefined;
  // 検索する前のホーム（新しいUI）。調べている間もホームのまま（「調査を開始する」が回る）
  const showHome = page === "home" && !shown;
  const failure = error ?? (offline ? OFFLINE : null);
  const homeMessage: HomeMessage = failure ? { text: failure, warn: true } : notice ? { text: notice, warn: true } : hint ? { text: hint, warn: false } : null;
  const isFav = (h: HistoryItem) => favorites.some((f) => favoriteKey(f) === favoriteKey(h));

  // 下のメニューのページ（履歴・お気に入り・書類・出力・その他）は、大きな見出しのページにする（物件の画面の上の部分は出さない）
  const tabPage = page !== "home";
  const tabBanner = <TabBanner loading={loading && !offline} error={failure} notice={notice} onDismiss={() => setNotice(null)} />;
  let body: ReactNode;
  if (page === "history")
    body = <HistoryPage history={history} isFavorite={isFav} onToggleFavorite={(h) => setFavorites(toggleFavorite(h))} onPick={pickRecent} onClear={props.onClearHistory} banner={tabBanner} />;
  else if (page === "favorites") body = <FavoritesPage favorites={favorites} onPick={pickRecent} onRemove={(f) => setFavorites(removeFavorite(f))} banner={tabBanner} />;
  else if (page === "docs")
    body = (
      <DocsPage
        banner={tabBanner}
        history={history}
        onPick={(h) => {
          // 調べ終わったら、その物件の「レポートを作成」を開く
          setReport(true);
          pickRecent(h);
        }}
      />
    );
  else if (page === "account")
    body = (
      <AccountPage
        onHelp={() => setSheet("help")}
        onCities={() => setSheet("cities")}
        onHistory={() => go("history")}
        onFavorites={() => go("favorites")}
        onSources={() => setSheet("sources")}
        historyCount={history.length}
        favoriteCount={favorites.length}
        banner={tabBanner}
      />
    );
  else if (shown && shown.result.status !== "ok") body = <NotOkPage query={shown.query} result={shown.result} onPick={props.onPickAddress} onMap={openMap} />;

  return (
    <div className="theme-navy flex min-h-0 w-full flex-1 flex-col overflow-hidden" style={{ fontFeatureSettings: "normal", letterSpacing: 0, background: showHome || tabPage ? PAGE : "#f7f9fd" }}>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="relative mx-auto" style={{ width: ART_W, zoom: ZOOM }}>
          {showHome ? (
            <HomeScreen
              input={input}
              setInput={setInput}
              mode={mode}
              onMode={changeMode}
              onSubmit={submitHome}
              loading={loading}
              locating={locating}
              message={homeMessage}
              onDismiss={() => {
                setNotice(null);
                setHint(null);
              }}
              history={history}
              onPickRecent={pickRecent}
              onHistory={() => go("history")}
              onMap={openMap}
              onHere={pickHere}
              onMenu={(tab, title) => {
                setStartTab(tab);
                setNotice(null);
                setHint(`調べると「${title}」から開きます。${mode === "map" ? "地図で場所を選んでください。" : "住所か地番を入れてください。"}`);
                // 押した操作の中で入力欄に入れる（iPhone はそうしないとキーボードが出ない）
                if (mode === "map") scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
                else inputRef.current?.focus();
              }}
              onMenuAll={() => setSheet("help")}
              onDocs={() => go("docs")}
              onBell={() => {
                setNews(true);
                markNewsSeen();
              }}
              unread={unread}
              onCities={() => setSheet("cities")}
              onSources={() => setSheet("sources")}
              onLogo={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })}
              areaText={areaText}
              cityCount={MUNICIPALITIES.length}
              inputRef={inputRef}
            />
          ) : tabPage ? null : (
            <Hero
              input={input}
              setInput={setInput}
              onSearch={() => {
                setPage("home");
                // 空のまま押したら、何を入れるかを出して入力欄に戻す
                if (!input.trim()) {
                  setNotice("住所か地番を入れてください（例：渋谷区神南1-19-11、地番 松戸市古ヶ崎四丁目3556-1）。");
                  inputRef.current?.focus();
                  return;
                }
                setNotice(null);
                onSearch();
              }}
              loading={loading}
              recent={history}
              onPickRecent={pickRecent}
              quick={[
                { label: "地図で選ぶ", onClick: openMap },
                { label: "現在地で調べる", onClick: pickHere },
                { label: "地番で調べる", onClick: typeChiban },
              ]}
              onHome={() => {
                setPage("home");
                props.onHome();
              }}
              onHistory={() => go("history")}
              onFavorites={() => go("favorites")}
              onMenu={() => setSheet("menu")}
              inputRef={inputRef}
            />
          )}
          {/* 物件の画面は、検索履歴などのページを見ているあいだも残す（戻ったときに読み直さない・タブもそのまま） */}
          {ok && (
            <div hidden={page !== "home"}>
              <PropertyView
                key={`${ok.lat},${ok.lng},${ok.matchedAddress}`}
                initialTab={startTab ?? undefined}
                report={report}
                setReport={setReport}
                query={shown!.query}
                result={ok}
                loading={loading}
                error={error}
                offline={offline}
                favorite={isFav(itemOf(shown!.query, ok))}
                onFavorite={() => setFavorites(toggleFavorite(itemOf(shown!.query, ok)))}
                onPick={props.onPickAddress}
                onPickPoint={onPickPoint}
                onFix={openMap}
                scroller={scroller}
              />
            </div>
          )}
          {tabPage && body}
          {!showHome && !tabPage && !ok && (
            <SheetFrame>
              {/* 通信できないあいだは「調べています」より先に、通信できないことを出す */}
              <Banner loading={loading && !offline} error={error ?? (offline ? OFFLINE : null)} notice={notice} onDismiss={() => setNotice(null)} />
              {body}
            </SheetFrame>
          )}
          <div style={{ height: 8 }} />
        </div>
      </div>
      <BottomNav
        active={page}
        onSelect={(k) => {
          if (k === "home" && page === "home") {
            if (shown) props.onHome();
            else scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
          } else if (k === "docs" && ok) {
            // 物件を開いていれば、その物件の「レポートを作成」を開く
            setPage("home");
            setReport(true);
          } else go(k);
        }}
      />

      <Portal>
        <MenuSheet
          open={sheet === "menu"}
          onClose={() => setSheet(null)}
          onOpen={(s) => (s === "history" ? (setSheet(null), go("history")) : setSheet(s))}
        />
        <HelpSheet open={sheet === "help"} onClose={() => setSheet(null)} />
        <CitiesSheet open={sheet === "cities"} onClose={() => setSheet(null)} />
        <SourcesSheet open={sheet === "sources"} onClose={() => setSheet(null)} />
        <NewsSheet open={news} onClose={() => setNews(false)} />
        {picker && (
          <LocationPicker
            start={picker.start}
            onClose={() => setPicker(null)}
            onPick={(lat, lng) => {
              setPicker(null);
              setPage("home");
              onPickPoint(lat, lng);
            }}
          />
        )}
      </Portal>
    </div>
  );
}

/** 通信できないときの一言 */
const OFFLINE = "通信できません（オフライン）。電波の良い場所で調べ直してください。読めなかった項目は「読み込めず」と出ます。";

/** 端末が通信できないか（ブラウザの online / offline） */
function useOffline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      addEventListener("online", cb);
      addEventListener("offline", cb);
      return () => {
        removeEventListener("online", cb);
        removeEventListener("offline", cb);
      };
    },
    () => !navigator.onLine,
    () => false,
  );
}

/** お気に入りに保存する形（検索履歴と同じ。地図で選んだ地点は座標で調べ直す） */
function itemOf(query: string, r: Ok): HistoryItem {
  return { address: r.picked ? r.matchedAddress : query, city: r.municipality.name, coverage: r.municipality.coverage, at: Date.now(), ...(r.picked ? { ll: [r.lat, r.lng] as [number, number] } : {}) };
}

/** 調べている・通信の失敗・お知らせ */
function Banner({ loading, error, notice, onDismiss }: { loading: boolean; error: string | null; notice?: string | null; onDismiss?: () => void }) {
  if (loading)
    return (
      <p className="mx-[9px] mt-[8px] flex items-center gap-[5px] rounded-[7px] bg-[#eef4fb] px-[9px] py-[7px] leading-none" style={{ fontSize: 7.4, color: "#1c3a6a" }}>
        <LoaderCircle size={10} strokeWidth={1.6} absoluteStrokeWidth className="animate-spin" />
        調べています…
      </p>
    );
  const text = error ?? notice;
  if (!text) return null;
  return (
    <button onClick={onDismiss} className="mx-[9px] mt-[8px] flex w-[calc(100%-18px)] items-start gap-[5px] rounded-[7px] bg-[#fdf1ec] px-[9px] py-[7px] text-left leading-[1.5]" style={{ fontSize: 7.4, color: "#8a4f3a" }}>
      <TriangleAlert size={10} strokeWidth={1.6} absoluteStrokeWidth className="mt-[1px] shrink-0" />
      {text}
    </button>
  );
}

/** 物件の画面（6つのタブ）。データはここで読む */
function PropertyView({
  initialTab,
  report,
  setReport,
  query,
  result,
  loading,
  error,
  offline,
  favorite,
  onFavorite,
  onPick,
  onPickPoint,
  onFix,
  scroller,
}: {
  /** 開いたときのタブ（ホームの調査メニューで選んだもの） */
  initialTab?: TabKey;
  report: boolean;
  setReport: (open: boolean) => void;
  query: string;
  result: Ok;
  loading: boolean;
  error: string | null;
  offline: boolean;
  favorite: boolean;
  onFavorite: () => void;
  onPick: (address: string) => void;
  onPickPoint: (lat: number, lng: number) => void;
  onFix: () => void;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const data = useProperty(result);
  const [tab, setTab] = useState<TabKey>(initialTab ?? "basic");
  const [detail, setDetail] = useState<{ kind: SheetKind; arg?: number } | null>(null);
  const [mapApps, setMapApps] = useState(false);
  const [triage, setTriage] = useState(false);
  const [draft, setDraft] = useState(false);
  const [guide, setGuide] = useState(false);
  const [full, setFull] = useState<MapOpen | null>(null);
  const tabBar = useRef<HTMLDivElement>(null);
  const addr = useCopy();
  const shareCopy = useCopy();
  const reportCopy = useCopy();
  const checklist = useChecklist(result);
  // 共有の文の先頭に、要注意点と次にやること（済んだ印も）を入れる
  const input = { ...loaded({ ...data, landPrice: data.landPrice5 }), triage: data.triage, done: checklist.done };

  const changeTab = (t: TabKey) => {
    setTab(t);
    // タブの並びが画面の上に隠れていたら、タブが見える所まで戻す
    const bar = tabBar.current;
    const box = scroller.current;
    if (bar && box && bar.getBoundingClientRect().top < box.getBoundingClientRect().top) bar.scrollIntoView({ block: "start" });
  };
  const share = async () => {
    const text = buildSummary(result, input);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await shareCopy.copy(text);
  };
  const props: TabProps = {
    result,
    data,
    go: changeTab,
    open: (kind, arg) => setDetail({ kind, arg }),
    expand: (o) => setFull(o ?? {}),
    mapApps: () => setMapApps(true),
  };
  const p = result.parcel;
  const found = p && !result.picked ? p : undefined;
  const title = found ? `${result.matchedAddress} ${chibanLabel(found.chibanRaw)}` : result.matchedAddress;

  return (
    <>
      <SheetFrame>
        <PropertyHeader title={title} sub={copyText(result)} onCopy={() => addr.copy(copyText(result))} copied={addr.done} favorite={favorite} onFavorite={onFavorite} onShare={share} />
        <Banner loading={loading && !offline} error={error ?? (offline ? OFFLINE : null)} />
        <PlaceNote query={query} result={result} data={data} onPick={onPick} onFix={onFix} />
        <div className="mt-[10.5px]">
          <TabBar tab={tab} onTab={changeTab} refEl={tabBar} />
        </div>
        {tab === "basic" && <BasicTab {...props} />}
        {tab === "around" && <AroundTab {...props} />}
        {tab === "price" && <PriceTab {...props} />}
        {tab === "law" && <LawTab {...props} />}
        {tab === "hazard" && <HazardTab {...props} />}
        {tab === "deals" && <DealsTab {...props} />}
        <BottomActions onShare={share} onReport={() => setReport(true)} shared={shareCopy.done} />
      </SheetFrame>

      <Portal>
        <DetailSheet kind={detail?.kind ?? null} arg={detail?.arg} onClose={() => setDetail(null)} result={result} data={data} expand={(o) => setFull(o ?? {})} />
        <MapAppsSheet result={result} open={mapApps} onClose={() => setMapApps(false)} onMichilu={() => setFull({})} onFix={onFix} />
        <ReportSheet
          open={report}
          onClose={() => setReport(false)}
          onTriage={() => {
            setReport(false);
            setTriage(true);
          }}
          triageSub={data.triage.headline}
          onMemo={() => {
            setReport(false);
            // 押した操作の中で印刷を呼ぶ（iPhone はプリントの画面から PDF にもできる）
            window.print();
          }}
          onDraft={() => {
            setReport(false);
            setDraft(true);
          }}
          onGuide={() => {
            setReport(false);
            setGuide(true);
          }}
          onCopy={() => reportCopy.copy(buildSummary(result, input))}
          copied={reportCopy.done}
        />
        {full && <FullMap result={result} withRoads={full.roads} hazard={full.hazard} landPrice={full.landPrice} onClose={() => setFull(null)} onPick={(lat, lng) => onPickPoint(lat, lng)} />}
      </Portal>
      <TriageSheet result={result} triage={data.triage} open={triage} onClose={() => setTriage(false)} />
      <DraftSheet result={result} input={input} open={draft} onClose={() => setDraft(false)} />
      <GuideMapSheet result={result} open={guide} onClose={() => setGuide(false)} />
      <PrintSheet result={result} zoning={data.zoning} parcels={data.parcels} roads={data.roads} hazard={data.hazard} building={data.building} landPrice={data.landPrice5} schools={data.schools} stations={data.stations} pois={data.pois} triage={data.triage} />
    </>
  );
}

/** 物件の場所の確かさ（番地まで一致しない・地番が見つからない・地図で選んだ地点）と、場所を直す */
function PlaceNote({ query, result, data, onPick, onFix }: { query: string; result: Ok; data: PropertyData; onPick: (address: string) => void; onFix: () => void }) {
  const { approximate, picked, parcel, parcelMiss, parcelOthers } = result;
  let text: ReactNode = null;
  let warn = false;
  // 住所で調べた地点が、道路・水路の筆か隣地のとても多い筆（地番の付いた公道など）の上。番地が地番の地域なら
  // （住居表示の「号」まで合った地点でなければ）地番で探し直せるようにする
  const off = !picked && !parcel && !approximate ? addressOffLot(data.parcels) : undefined;
  const chibanArea = !/号$/.test(result.matchedAddress);
  const onRoad = !!off && (off === "large" || chibanArea);
  const asChiban = chibanArea ? chibanQueryOf(query, /丁目/.test(result.town)) : undefined;
  if (parcelMiss) {
    warn = true;
    text = (
      <>
        {parcelMiss.reason === "not_found"
          ? `地番 ${parcelMiss.chiban} は見つかりません（${PARCEL_DATA.edition}の地図）。`
          : parcelMiss.reason === "no_map"
            ? "この地域は地番の地図データがありません。"
            : "地番の地図データを読み込めませんでした。"}
        {approximate && "町の中心を表示しています。"}
        {parcelMiss.similar.length > 0 && (
          <span className="mt-[3px] flex flex-wrap items-center gap-[4px]">
            近い地番：
            {parcelMiss.similar.slice(0, 4).map((c) => (
              <button key={c} onClick={() => onPick(`地番 ${result.matchedAddress}${c}`)} className="rounded-full bg-white px-[6px] py-[2px] font-bold" style={{ color: "#133664" }}>
                {c}
              </button>
            ))}
          </span>
        )}
      </>
    );
  } else if (approximate) {
    warn = true;
    text = "番地が見つからず、町の中心を表示しています。地番・建物は、場所を直すと出ます。";
  } else if (onRoad) {
    warn = true;
    text = (
      <>
        {off === "large" && data.parcels.status === "ok"
          ? `住所の地点の筆（地番 ${registryChiban(data.parcels.parcel.chibanRaw)}）は隣地が${registryNeighbors(data.parcels).length}筆あり、道路など物件の外の土地の可能性があります。${chibanArea ? "番地が地番の地域なら、地番で探すと土地（筆）が出ます。" : "「場所を直す」で建物の位置を選ぶと、物件の土地の地番・面積が出ます。"}`
          : `住所の地点が${off}の上です。番地が地番の地域なら、地番で探すと土地（筆）が出ます。`}
        {asChiban && (
          <span className="mt-[3px] flex">
            <button onClick={() => onPick(asChiban)} className="rounded-full bg-white px-[6px] py-[2px] font-bold" style={{ color: "#133664" }}>
              「{asChiban}」で探す
            </button>
          </span>
        )}
      </>
    );
  } else if (parcel && !picked) {
    text = `地番で探した筆です（${kuikiLabel(parcel.kuiki)}）${parcelMark(parcel)}。筆は${PARCEL_DATA.edition}の地図で、分筆などで変わることがあります。${parcelOthers ? `同じ地番の筆がほかに${parcelOthers}件あります。` : ""}`;
  } else if (picked) {
    text = parcel ? `地図で選んだ地点の筆：${chibanLabel(parcel.chibanRaw)}（${kuikiLabel(parcel.kuiki)}）${parcelMark(parcel)}` : "地図で選んだ地点です（番地は分からないので町名まで）。";
  }
  if (!text) return null;
  return (
    <div className={`mx-[9px] mt-[7px] flex items-start gap-[5px] rounded-[7px] px-[8px] py-[6px] leading-[1.5] ${warn ? "bg-[#fdf1ec]" : "bg-[#f4f7fb]"}`} style={{ fontSize: 6.8, color: warn ? "#8a4f3a" : "#5d6880" }}>
      {warn ? <TriangleAlert size={9} strokeWidth={1.6} absoluteStrokeWidth className="mt-[1.5px] shrink-0" /> : <Info size={9} strokeWidth={1.5} absoluteStrokeWidth className="mt-[1.5px] shrink-0" />}
      <span className="min-w-0 flex-1">{text}</span>
      <button onClick={onFix} className="shrink-0 rounded-full border border-current px-[6px] py-[2.5px] font-bold leading-none">
        場所を直す
      </button>
    </div>
  );
}

/** データの出典と時点 */
function SourcesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: [string, string][] = [
    ["道路種別の地図・問い合わせ先", "関東1都6県の市区町村の公開ページ（毎週リンクを自動で確認）"],
    ["用途地域など（都市計画）", `都市計画決定GISデータ（国土交通省）${ZONING_DATA.edition}`],
    ["地番・筆の形", `登記所備付地図データ（法務省）${PARCEL_DATA.edition}・市町村の地番参考図`],
    ["建物", `3D都市モデル PLATEAU（国土交通省）${BUILDING_DATA.edition ?? ""}`],
    ["地価", `地価公示・都道府県地価調査（国土数値情報）${LAND_PRICE_DATA.edition}`],
    ...(DEALS_DATA.url ? ([["取引事例", `不動産情報ライブラリ（国土交通省）の取引価格・成約価格 ${DEALS_DATA.periods}。${DEALS_NOTE}`]] as [string, string][]) : []),
    ["学区", `小学校区・中学校区（国土数値情報）${SCHOOL_DATA.edition}`],
    ["駅", `鉄道データ（国土数値情報）${STATION_DATA.year}年`],
    ["周辺施設", `© OpenStreetMap contributors（ODbL）${POI_DATA.date}時点${HOSPITAL_SOURCE ? `。病院は${HOSPITAL_SOURCE}` : ""}`],
    ["ハザード", "重ねるハザードマップ（国土交通省・国土地理院）を開くたびに読む"],
    ["避難場所", "指定緊急避難場所データ（国土地理院）を開くたびに読む"],
    ["地図・航空写真・道のり", "地理院タイル・地理院地図Vector（国土地理院）"],
  ];
  return (
    <Sheet title="データの出典と時点" open={open} onClose={onClose}>
      <dl className="divide-y divide-line/70">
        {rows.map(([k, v]) => (
          <div key={k} className="py-2">
            <dt className="text-[12px] text-muted">{k}</dt>
            <dd className="text-[13.5px] leading-[1.55] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11.5px] leading-[1.6] text-muted">国・自治体の公開データを加工して表示しています。データは参考情報で、最新の状況や法的な判断は、役所の窓口・公的な資料で確認してください。</p>
    </Sheet>
  );
}
