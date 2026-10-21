"use client";

// スマホの画面（紺の新しい見た目）。上の写真の部分と検索窓・白いカード・下のメニューの枠の中に、検索する前のホーム、
// 物件の6つのタブ（基本情報・周辺環境・相場・取引・法令・規制・ハザード・取引事例）、検索履歴・お気に入り・マイページを出す。
// 幅393ptの絵の寸法で描き、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）。下から出す画面（シート）は拡大・縮小しない
import { Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { favoriteKey, toggleFavorite, removeFavorite, type FavoriteItem } from "@/lib/favorites";
import type { HistoryItem } from "@/lib/history";
import { MUNICIPALITIES, type LookupResult } from "@/lib/roadmap";
import { BUILDING_DATA } from "@/lib/roadmap/building-data";
import { LAND_PRICE_DATA } from "@/lib/roadmap/land-price-data";
import { chibanLabel, kuikiLabel, parcelMark } from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { POI_DATA } from "@/lib/roadmap/poi";
import { SCHOOL_DATA } from "@/lib/roadmap/school-data";
import { STATION_DATA } from "@/lib/roadmap/walk";
import { ZONING_DATA } from "@/lib/roadmap/zoning-data";
import { buildSummary } from "@/lib/summary";
import { DraftSheet } from "../draft-sheet";
import { FullMap } from "../full-map";
import { GuideMapSheet } from "../guide-map";
import { CitiesSheet, HelpSheet, MenuSheet } from "../info-sheets";
import { LocationPicker } from "../location-picker";
import { PrintSheet } from "../print-sheet";
import { copyText, loaded } from "../result-view";
import { Sheet } from "../sheet";
import { useCopy } from "../use-copy";
import { MapAppsSheet, ReportSheet } from "./app-sheets";
import { DetailSheet } from "./detail-sheets";
import { ART_W, BottomNav, Hero, SheetFrame, ZOOM, type NavKey } from "./frame";
import { AccountPage, FavoritesPage, HistoryPage, HomePage, NotOkPage } from "./pages";
import { BottomActions, PropertyHeader, TabBar, type TabKey } from "./property-head";
import { AroundTab } from "./tab-around";
import { BasicTab } from "./tab-basic";
import { DealsTab } from "./tab-deals";
import { HazardTab } from "./tab-hazard";
import { LawTab } from "./tab-law";
import { PriceTab } from "./tab-price";
import type { MapOpen, SheetKind, TabProps } from "./types";
import { useProperty, type Ok } from "./use-property";
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

  const ok = shown?.result.status === "ok" ? (shown.result as Ok) : undefined;
  const isFav = (h: HistoryItem) => favorites.some((f) => favoriteKey(f) === favoriteKey(h));

  let body: ReactNode;
  if (page === "history")
    body = <HistoryPage history={history} isFavorite={isFav} onToggleFavorite={(h) => setFavorites(toggleFavorite(h))} onPick={pickRecent} onClear={props.onClearHistory} />;
  else if (page === "favorites") body = <FavoritesPage favorites={favorites} onPick={pickRecent} onRemove={(f) => setFavorites(removeFavorite(f))} />;
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
      />
    );
  else if (shown && shown.result.status !== "ok") body = <NotOkPage query={shown.query} result={shown.result} onPick={props.onPickAddress} onMap={openMap} />;
  else if (!ok)
    body = (
      <HomePage
        history={history}
        favorites={favorites}
        areaText={areaText}
        cityCount={MUNICIPALITIES.length}
        onPick={pickRecent}
        onMap={openMap}
        onHere={pickHere}
        onChiban={typeChiban}
        onHistory={() => go("history")}
        onFavorites={() => go("favorites")}
        onCities={() => setSheet("cities")}
        onHelp={() => setSheet("help")}
        locating={locating}
      />
    );

  return (
    <div className="theme-navy flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#f7f9fd]" style={{ fontFeatureSettings: "normal", letterSpacing: 0 }}>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="relative mx-auto" style={{ width: ART_W, zoom: ZOOM }}>
          <Hero
            input={input}
            setInput={setInput}
            onSearch={() => {
              setPage("home");
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
          {/* 物件の画面は、検索履歴などのページを見ているあいだも残す（戻ったときに読み直さない・タブもそのまま） */}
          {ok && (
            <div hidden={page !== "home"}>
              <PropertyView key={`${ok.lat},${ok.lng},${ok.matchedAddress}`} result={ok} loading={loading} error={error} favorite={isFav(itemOf(shown!.query, ok))} onFavorite={() => setFavorites(toggleFavorite(itemOf(shown!.query, ok)))} onPick={props.onPickAddress} onPickPoint={onPickPoint} onFix={openMap} scroller={scroller} />
            </div>
          )}
          {(!ok || page !== "home") && (
            <SheetFrame>
              <Banner loading={loading} error={error} notice={notice} onDismiss={() => setNotice(null)} />
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
  result,
  loading,
  error,
  favorite,
  onFavorite,
  onPick,
  onPickPoint,
  onFix,
  scroller,
}: {
  result: Ok;
  loading: boolean;
  error: string | null;
  favorite: boolean;
  onFavorite: () => void;
  onPick: (address: string) => void;
  onPickPoint: (lat: number, lng: number) => void;
  onFix: () => void;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const data = useProperty(result);
  const [tab, setTab] = useState<TabKey>("basic");
  const [detail, setDetail] = useState<{ kind: SheetKind; arg?: number } | null>(null);
  const [mapApps, setMapApps] = useState(false);
  const [report, setReport] = useState(false);
  const [draft, setDraft] = useState(false);
  const [guide, setGuide] = useState(false);
  const [full, setFull] = useState<MapOpen | null>(null);
  const tabBar = useRef<HTMLDivElement>(null);
  const addr = useCopy();
  const shareCopy = useCopy();
  const reportCopy = useCopy();
  const input = loaded({ ...data, landPrice: data.landPrice5 });

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
        <Banner loading={loading} error={error} />
        <PlaceNote result={result} onPick={onPick} onFix={onFix} />
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
      <DraftSheet result={result} input={input} open={draft} onClose={() => setDraft(false)} />
      <GuideMapSheet result={result} open={guide} onClose={() => setGuide(false)} />
      <PrintSheet result={result} zoning={data.zoning} parcels={data.parcels} roads={data.roads} hazard={data.hazard} building={data.building} landPrice={data.landPrice5} schools={data.schools} stations={data.stations} pois={data.pois} />
    </>
  );
}

/** 物件の場所の確かさ（番地まで一致しない・地番が見つからない・地図で選んだ地点）と、場所を直す */
function PlaceNote({ result, onPick, onFix }: { result: Ok; onPick: (address: string) => void; onFix: () => void }) {
  const { approximate, picked, parcel, parcelMiss, parcelOthers } = result;
  let text: ReactNode = null;
  let warn = false;
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
    text = "番地が見つからず、町の中心を表示しています。";
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
    ["学区", `小学校区・中学校区（国土数値情報）${SCHOOL_DATA.edition}`],
    ["駅", `鉄道データ（国土数値情報）${STATION_DATA.year}年`],
    ["周辺施設", `© OpenStreetMap contributors（ODbL）${POI_DATA.date}時点`],
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
