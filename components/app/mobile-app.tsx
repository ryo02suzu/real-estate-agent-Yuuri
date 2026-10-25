"use client";

// スマホの画面（紺の新しい見た目）。検索する前のホームは components/app/home.tsx。物件の画面は、上の街の写真の帯（写真はあとで届くので
// 今は NO IMAGE）と6つのタブの切り替えの下に、タブごとに1画面に収まる中身（components/app/r-*.tsx）。下のメニューのページ
// （履歴・お気に入り・書類・出力・その他）は components/app/tab-pages.tsx、見つからない・候補・未対応は components/app/pages.tsx。
// 幅393ptの絵の寸法で描き、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）。下から出す画面（シート）は拡大・縮小しない
import { Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { favoriteKey, removeFavorite, toggleFavoriteChecked, type FavoriteItem } from "@/lib/favorites";
import type { HistoryItem } from "@/lib/history";
import type { LookupResult } from "@/lib/roadmap";
import { chibanLabel, chibanQueryOf, registryChiban } from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { buildSummary } from "@/lib/summary";
import { DraftSheet } from "../draft-sheet";
import { FullMap } from "../full-map";
import { GuideMapSheet } from "../guide-map";
import { LocationPicker } from "../location-picker";
import { addressOffLot, registryNeighbors } from "../parcel-card";
import { PrintSheet } from "../print-sheet";
import { copyText, loaded } from "../result-view";
import { TriageSheet, useChecklist } from "../triage-sheet";
import { useCopy } from "../use-copy";
import { MapAppsSheet, ReportSheet } from "./app-sheets";
import { DetailSheet } from "./detail-sheets";
import { ART_W, BottomNav, ZOOM, type NavKey } from "./frame";
import { HomeScreen, PAGE, SKY, type HomeMessage } from "./home";
import { AppCitiesSheet, AppHelpSheet, AppSourcesSheet } from "./info";
import { InstallSheet, useStandalone } from "./install";
import { useFixedScreen } from "./no-bounce";
import { SKY_EVENT, skyTop, useSkyClock } from "./sky";
import { markNewsSeen, NewsSheet, useUnreadNews } from "./news";
import { NotOkPage } from "./pages";
import { AroundTab } from "./r-around";
import { BasicTab } from "./r-basic";
import { DealsTab } from "./r-deals";
import { HazardTab } from "./r-hazard";
import { LawTab } from "./r-law";
import { PriceTab } from "./r-price";
import { BAND_TOP, displayAddress, WARN } from "./r-ui";
import { PlaceBanner, ResultBand, TabSegments, type TabKey } from "./result-head";
import { AccountPage, DocsPage, FavoritesPage, HistoryPage, TabBanner, type DocKind } from "./tab-pages";
import type { MapOpen, SheetKind, TabProps } from "./types";
import { reducedMotion } from "./tokens";
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
};

type AppSheet = "help" | "cities" | "sources" | "install" | null;

export function MobileApp(props: MobileAppProps) {
  const { shown, input, setInput, loading, error, history, favorites, setFavorites, onSearch, onPickHistory, onPickPoint } = props;
  const [page, setPage] = useState<NavKey>("home");
  const [sheet, setSheet] = useState<AppSheet>(null);
  const [picker, setPicker] = useState<{ start?: { lat: number; lng: number }; busy?: boolean } | null>(null);
  // 地図で選んで読んでいる間（読み終わったら地図を閉じ、板が結果の帯につながる）
  const sawLoading = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 物件の「レポートを作成」（書類・出力）。下のメニューの「書類・出力」からも開く
  const [report, setReport] = useState(false);
  const [news, setNews] = useState(false);
  const unread = useUnreadNews();
  const offline = useOffline();
  const standalone = useStandalone();
  // 中身が画面に収まっていても、スワイプで画面全体が動かないようにする
  useFixedScreen();
  // 時間連動の空（1分ごとに入れ直す）
  useSkyClock();
  // 書類・出力のタイルで選んだ書類（その物件の画面が出たら、すぐ開く）
  const [wanted, setWanted] = useState<{ kind: DocKind; key: string } | null>(null);
  const wantedDone = useCallback(() => setWanted(null), []);
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
  // 物件を開けなかったら（見つからない等）、頼まれていたレポートも開かない
  const status = shown?.result.status;
  useEffect(() => {
    if (!status) return;
    queueMicrotask(() => {
      if (status !== "ok") {
        setReport(false);
        setWanted(null);
      }
    });
  }, [status, resultKey]);
  // 調べられなかった（通信の失敗など）ときも、頼まれていたレポートは開かない（次に調べた物件で急に開かないように）
  useEffect(() => {
    if (error)
      queueMicrotask(() => {
        setReport(false);
        setWanted(null);
      });
  }, [error]);

  const go = useCallback((p: NavKey) => {
    setPage(p);
    scroller.current?.scrollTo(0, 0);
  }, []);

  const openMap = () => {
    const r = shown?.result;
    setPicker({ start: r && (r.status === "ok" || r.status === "unsupported") ? { lat: r.lat, lng: r.lng } : undefined });
  };
  const pickRecent = (h: HistoryItem) => {
    setPage("home");
    onPickHistory(h);
  };
  /** 物件の画面の「戻る」。検索する前のホームに戻る */
  const backHome = () => {
    setPage("home");
    props.onHome();
  };
  /** ホームの「調査を開始する」。住所も地番も同じ欄（地番かどうかは調べるときに見分ける。lib/roadmap の splitChiban） */
  const submitHome = () => {
    if (!input.replace(/^\s*地番\s*/, "").trim()) {
      setNotice(EMPTY);
      inputRef.current?.focus();
      return;
    }
    setNotice(null);
    onSearch();
  };

  const ok = shown?.result.status === "ok" ? (shown.result as Ok) : undefined;
  // 検索する前のホーム（新しいUI）。調べている間もホームのまま（「調査を開始する」が回る）
  const showHome = page === "home" && !shown;
  // 下のメニューのページ（履歴・お気に入り・書類・出力・その他）は、大きな見出しのページにする
  const tabPage = page !== "home";
  // 時刻・電池の帯の色をページに合わせる（ホームと下のメニューのページは時間連動の空の上端の色、物件の画面は写真の帯の上の色。
  // PC の色は変えない）。空が変わるたびに合わせ直す
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][media="(max-width: 1023px)"]');
    const set = () => meta?.setAttribute("content", showHome || tabPage ? (skyTop() ?? SKY) : BAND_TOP);
    set();
    addEventListener(SKY_EVENT, set);
    return () => removeEventListener(SKY_EVENT, set);
  }, [showHome, tabPage]);
  const failure = error ?? (offline ? OFFLINE : null);
  const homeMessage: HomeMessage = failure ? { text: failure } : notice ? { text: notice } : null;
  const isFav = (h: HistoryItem) => favorites.some((f) => favoriteKey(f) === favoriteKey(h));
  /** 短いお知らせ（1.8秒で消える。コピー・保存の完了など、動きだけでなく文字でも伝える） */
  const flashTimer = useRef(0);
  const flash = (text: string) => {
    setNotice(text);
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setNotice(null), 1800);
  };
  /** ★を押した。保存できなかったら元のまま（見た目だけ保存済みにしない）で、その旨を知らせる */
  const toggleFav = (h: HistoryItem) => {
    const r = toggleFavoriteChecked(h);
    setFavorites(r.items);
    if (!r.saved) setNotice("お気に入りを保存できませんでした。端末の空き容量と、プライベートブラウズでないことを確かめてください。");
    else flash(r.added ? "お気に入りに保存しました" : "お気に入りから外しました");
  };
  // 地図で選んで読み終わったら地図を閉じる。対応している端末では、板が結果の帯へつながる動き（View Transitions）
  const pickerBusy = !!picker?.busy;
  useEffect(() => {
    if (!pickerBusy) return;
    if (loading) {
      sawLoading.current = true;
      return;
    }
    if (!sawLoading.current) return;
    sawLoading.current = false;
    const close = () => setPicker(null);
    if (typeof document.startViewTransition === "function" && !reducedMotion()) {
      // つながる動きが作れなかったときは、そのまま閉じる（失敗を画面のエラーにしない）
      const t = document.startViewTransition(() => flushSync(close));
      t.ready.catch(() => {});
      t.finished.catch(() => {});
    } else queueMicrotask(close);
  }, [pickerBusy, loading]);
  /** いま開いている物件（履歴・お気に入りと同じ形） */
  const current = ok ? itemOf(shown!.query, ok) : undefined;
  /** その物件のレポートの画面を開く（開いている物件ならそのまま、ほかの物件なら調べ直してから） */
  const openDocsFor = (h: HistoryItem) => {
    setReport(true);
    if (current && favoriteKey(current) === favoriteKey(h)) setPage("home");
    else pickRecent(h);
  };
  /** 書類の種類を押した：開いている物件（無ければ最近の物件）で、その書類をすぐ開く */
  const makeDoc = (kind: DocKind) => {
    const target = current ?? history[0];
    if (!target) {
      setNotice("先にホームで物件を調べると、ここから書類を作れます。");
      return;
    }
    setWanted({ kind, key: favoriteKey(target) });
    if (current) setPage("home");
    else pickRecent(target);
  };


  const tabBanner = <TabBanner loading={loading && !offline} error={failure} notice={notice} onDismiss={() => setNotice(null)} />;
  let body: ReactNode;
  if (page === "history")
    body = <HistoryPage history={history} isFavorite={isFav} onToggleFavorite={toggleFav} onPick={pickRecent} onClear={props.onClearHistory} onHome={() => go("home")} banner={tabBanner} />;
  else if (page === "favorites") body = <FavoritesPage favorites={favorites} onPick={pickRecent} onDocs={openDocsFor} onRemove={(f) => setFavorites(removeFavorite(f))} onHome={() => go("home")} banner={tabBanner} />;
  else if (page === "docs")
    body = (
      <DocsPage
        banner={tabBanner}
        current={current}
        history={history}
        onMake={makeDoc}
        onReport={() => {
          setPage("home");
          setReport(true);
        }}
        onPick={openDocsFor}
        onHistory={() => go("history")}
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
        onNews={() => {
          setNews(true);
          markNewsSeen();
        }}
        unread={unread}
        onInstall={() => setSheet("install")}
        standalone={standalone}
        historyCount={history.length}
        favoriteCount={favorites.length}
        banner={tabBanner}
      />
    );
  else if (shown && shown.result.status !== "ok")
    body = <NotOkPage query={shown.query} result={shown.result} onPick={props.onPickAddress} onMap={openMap} onBack={backHome} banner={<Banner loading={loading && !offline} error={failure} notice={notice} onDismiss={() => setNotice(null)} />} />;

  return (
    <div className="theme-navy app-touch flex min-h-0 w-full flex-1 flex-col overflow-hidden" style={{ fontFeatureSettings: "normal", letterSpacing: 0, background: PAGE }}>
      <div ref={scroller} data-scroller className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="relative mx-auto" style={{ width: ART_W, zoom: ZOOM }}>
          {showHome && (
            <HomeScreen
              input={input}
              setInput={setInput}
              onSubmit={submitHome}
              loading={loading}
              message={homeMessage}
              onDismiss={() => setNotice(null)}
              history={history}
              onPickRecent={pickRecent}
              onHistory={() => go("history")}
              onMap={openMap}
              onTry={props.onPickAddress}
              onHelp={() => setSheet("help")}
              onBell={() => {
                setNews(true);
                markNewsSeen();
              }}
              unread={unread}
              onLogo={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })}
              inputRef={inputRef}
            />
          )}
          {/* 物件の画面は、検索履歴などのページを見ているあいだも残す（戻ったときに読み直さない・タブもそのまま） */}
          {ok && (
            <div hidden={page !== "home"}>
              <PropertyView
                key={`${ok.lat},${ok.lng},${ok.matchedAddress}`}
                report={report}
                setReport={setReport}
                query={shown!.query}
                result={ok}
                loading={loading}
                error={error}
                offline={offline}
                favorite={isFav(itemOf(shown!.query, ok))}
                onFavorite={() => toggleFav(itemOf(shown!.query, ok))}
                notice={notice}
                onDismiss={() => setNotice(null)}
                named={!picker}
                onPick={props.onPickAddress}
                onPickPoint={onPickPoint}
                onFix={openMap}
                onBack={backHome}
                wanted={wanted}
                onWantedDone={wantedDone}
                scroller={scroller}
              />
            </div>
          )}
          {tabPage && (
            <div key={page} className="page-in">
              {body}
            </div>
          )}
          {!showHome && !tabPage && !ok && body}
        </div>
      </div>
      <BottomNav
        active={page}
        onSelect={(k) => {
          if (k === "home" && page === "home") {
            if (shown) props.onHome();
            else scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
          } else go(k);
        }}
      />

      <Portal>
        <AppHelpSheet open={sheet === "help"} onClose={() => setSheet(null)} />
        <InstallSheet open={sheet === "install"} onClose={() => setSheet(null)} />
        <AppCitiesSheet open={sheet === "cities"} onClose={() => setSheet(null)} />
        <AppSourcesSheet open={sheet === "sources"} onClose={() => setSheet(null)} />
        <NewsSheet open={news} onClose={() => setNews(false)} />
        {picker && (
          <LocationPicker
            start={picker.start}
            busy={picker.busy}
            onClose={() => setPicker(null)}
            onPick={(lat, lng) => {
              setPicker({ start: picker.start, busy: true });
              setPage("home");
              onPickPoint(lat, lng);
            }}
          />
        )}
      </Portal>
    </div>
  );
}

/** 空のまま調べようとしたときの一言 */
const EMPTY = "住所か地番を入れてください（例：渋谷区神南1-19-11、松戸市古ヶ崎四丁目3556-1）。";

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

/** 調べている・通信の失敗・お知らせ（物件の画面と見つからない画面の上） */
function Banner({ loading, error, notice, onDismiss }: { loading: boolean; error: string | null; notice?: string | null; onDismiss?: () => void }) {
  if (loading)
    return (
      <p className="mx-[16px] mt-[8px] flex items-center gap-[6px] rounded-[12px] bg-[#eef4fb] px-[12px] py-[9px] leading-none" style={{ fontSize: 13, color: "#1c3a6a" }}>
        <LoaderCircle size={15} strokeWidth={1.8} absoluteStrokeWidth className="animate-spin" />
        調べています…
      </p>
    );
  const text = error ?? notice;
  if (!text) return null;
  const warn = !!error;
  return (
    <button onClick={onDismiss} className="mx-[16px] mt-[8px] flex w-[calc(100%-32px)] items-start gap-[6px] rounded-[12px] px-[12px] py-[9px] text-left leading-[1.45]" style={{ fontSize: 13, background: warn ? "#fdf1ec" : "#eef4fb", color: warn ? WARN : "#1c3a6a" }}>
      {warn ? <TriangleAlert size={15} strokeWidth={1.8} absoluteStrokeWidth className="mt-[2px] shrink-0" /> : <Info size={15} strokeWidth={1.8} absoluteStrokeWidth className="mt-[2px] shrink-0" />}
      {text}
    </button>
  );
}

/** 物件の画面（6つのタブ）。データはここで読む */
function PropertyView({
  report,
  setReport,
  query,
  result,
  loading,
  error,
  offline,
  favorite,
  onFavorite,
  notice,
  onDismiss,
  named,
  onPick,
  onPickPoint,
  onFix,
  onBack,
  wanted,
  onWantedDone,
  scroller,
}: {
  report: boolean;
  setReport: (open: boolean) => void;
  query: string;
  result: Ok;
  loading: boolean;
  error: string | null;
  offline: boolean;
  favorite: boolean;
  onFavorite: () => void;
  /** お知らせ（お気に入りを保存できなかった、など） */
  notice: string | null;
  onDismiss: () => void;
  /** 帯が地図の板からつながる名前を持つか（地図を開いている間は false） */
  named: boolean;
  onPick: (address: string) => void;
  onPickPoint: (lat: number, lng: number) => void;
  onFix: () => void;
  onBack: () => void;
  /** 書類・出力のタイルで選んだ書類（この物件のものならすぐ開く） */
  wanted: { kind: DocKind; key: string } | null;
  onWantedDone: () => void;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const data = useProperty(result);
  const [tab, setTab] = useState<TabKey>("basic");
  const [detail, setDetail] = useState<{ kind: SheetKind; arg?: number } | null>(null);
  const [mapApps, setMapApps] = useState(false);
  const [triage, setTriage] = useState(false);
  const [draft, setDraft] = useState(false);
  const [guide, setGuide] = useState(false);
  const [full, setFull] = useState<MapOpen | null>(null);
  const addr = useCopy();
  const shareCopy = useCopy();
  const reportCopy = useCopy();
  const checklist = useChecklist(result);
  // 共有の文の先頭に、要注意点と次にやること（済んだ印も）を入れる
  const input = { ...loaded({ ...data, landPrice: data.landPrice5 }), triage: data.triage, done: checklist.done };
  // 書類・出力のタイルで選んだ書類を、この物件の画面が出たらすぐ開く（印刷とコピーは押した操作の中でないと動かないので、レポートの画面から）
  const myKey = favoriteKey(itemOf(query, result));
  useEffect(() => {
    if (!wanted || wanted.key !== myKey) return;
    const { kind } = wanted;
    queueMicrotask(() => {
      if (kind === "triage") setTriage(true);
      else if (kind === "draft") setDraft(true);
      else if (kind === "guide") setGuide(true);
      else setReport(true);
      onWantedDone();
    });
  }, [wanted, myKey, onWantedDone, setReport]);

  const changeTab = (t: TabKey) => {
    setTab(t);
    // タブを変えたら、その画面のいちばん上から
    scroller.current?.scrollTo(0, 0);
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
    report: () => setReport(true),
  };
  const p = result.parcel;
  const found = p && !result.picked ? p : undefined;
  const title = `${displayAddress(result.matchedAddress)}${found ? ` ${chibanLabel(found.chibanRaw)}` : ""}`;

  return (
    <>
      <ResultBand title={title} sub={copyText(result)} onBack={onBack} onCopy={() => addr.copy(copyText(result))} copied={addr.done} favorite={favorite} onFavorite={onFavorite} onShare={share} named={named} />
      <TabSegments tab={tab} onTab={changeTab} />
      <Banner loading={loading && !offline} error={error ?? (offline ? OFFLINE : null)} notice={notice ?? (shareCopy.done ? "共有の文をコピーしました" : null)} onDismiss={onDismiss} />
      <PlaceNote query={query} result={result} data={data} onPick={onPick} onFix={onFix} />
      <div key={tab} className="tab-in px-[16px] pb-[8px] pt-[8px]">
        {tab === "basic" && <BasicTab {...props} />}
        {tab === "around" && <AroundTab {...props} />}
        {tab === "price" && <PriceTab {...props} />}
        {tab === "law" && <LawTab {...props} />}
        {tab === "hazard" && <HazardTab {...props} />}
        {tab === "deals" && <DealsTab {...props} />}
      </div>

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

/** 地番の候補などの小さなボタン（注意の中） */
function MiniButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="press rounded-full bg-white px-[9px] py-[5px] font-semibold leading-none shadow-[0_1px_3px_rgba(20,45,85,0.1)]" style={{ fontSize: 12.5, color: "#133664" }}>
      {children}
    </button>
  );
}

/**
 * 物件の場所の確かさで注意がいるとき（番地まで一致しない・地番が見つからない・住所の地点が道路の筆・地図で選んだ地点で筆が無い）
 * だけ出す。地番で探した筆・地図で選んだ地点の筆は、基本情報の「地番」の札に書く（1画面に収めるため）
 */
function PlaceNote({ query, result, data, onPick, onFix }: { query: string; result: Ok; data: PropertyData; onPick: (address: string) => void; onFix: () => void }) {
  const { approximate, picked, parcel, parcelMiss } = result;
  let text: ReactNode = null;
  let short: ReactNode = null;
  let warn = false;
  // 住所で調べた地点が、道路・水路の筆か隣地のとても多い筆（地番の付いた公道など）の上。番地が地番の地域なら
  // （住居表示の「号」まで合った地点でなければ）地番で探し直せるようにする
  const off = !picked && !parcel && !approximate ? addressOffLot(data.parcels) : undefined;
  const chibanArea = !/号$/.test(result.matchedAddress);
  const onRoad = !!off && (off === "large" || chibanArea);
  const asChiban = chibanArea ? chibanQueryOf(query, /丁目/.test(result.town)) : undefined;
  if (parcelMiss) {
    warn = true;
    short = parcelMiss.reason === "not_found" ? `地番 ${parcelMiss.chiban} は見つかりません` : parcelMiss.reason === "no_map" ? "地番の地図データがない地域です" : "地番の地図を読み込めませんでした";
    text = (
      <>
        {parcelMiss.reason === "not_found"
          ? `地番 ${parcelMiss.chiban} は見つかりません（${PARCEL_DATA.edition}の地図）。`
          : parcelMiss.reason === "no_map"
            ? "この地域は地番の地図データがありません。"
            : "地番の地図データを読み込めませんでした。"}
        {approximate && "町の中心を表示しています。"}
        {parcelMiss.similar.length > 0 && (
          <span className="mt-[5px] flex flex-wrap items-center gap-[5px]">
            近い地番：
            {parcelMiss.similar.slice(0, 4).map((c) => (
              <MiniButton key={c} onClick={() => onPick(`地番 ${result.matchedAddress}${c}`)}>
                {c}
              </MiniButton>
            ))}
          </span>
        )}
      </>
    );
  } else if (approximate) {
    warn = true;
    short = "番地が見つからず、町の中心を表示しています";
    text = "番地が見つからず、町の中心を表示しています。地番・建物は、場所を直すと出ます。";
  } else if (onRoad) {
    warn = true;
    short = off === "large" && data.parcels.status === "ok" ? `住所の地点が道路などの筆の可能性（地番 ${registryChiban(data.parcels.parcel.chibanRaw)}）` : `住所の地点が${off}の筆の上です`;
    text = (
      <>
        {off === "large" && data.parcels.status === "ok"
          ? `住所の地点の筆（地番 ${registryChiban(data.parcels.parcel.chibanRaw)}）は隣地が${registryNeighbors(data.parcels).length}筆あり、道路など物件の外の土地の可能性があります。${chibanArea ? "番地が地番の地域なら、地番で探すと土地（筆）が出ます。" : "「場所を直す」で建物の位置を選ぶと、物件の土地の地番・面積が出ます。"}`
          : `住所の地点が${off}の上です。番地が地番の地域なら、地番で探すと土地（筆）が出ます。`}
        {asChiban && (
          <span className="mt-[5px] flex">
            <MiniButton onClick={() => onPick(asChiban)}>「{asChiban}」で探す</MiniButton>
          </span>
        )}
      </>
    );
  } else if (picked && !parcel) {
    short = "地図で選んだ地点です（町名まで）";
    text = "地図で選んだ地点です（番地は分からないので町名まで）。";
  }
  if (!text) return null;
  return (
    <PlaceBanner warn={warn} short={short} onFix={onFix} open={!!parcelMiss}>
      {text}
    </PlaceBanner>
  );
}
