"use client";

// スマホの画面（紺の新しい見た目）。検索する前のホームは components/app/home.tsx。物件の画面は、いちばん奥に街の模型
// （components/app/property-scene.tsx・property-3d.ts）、その上に地番の見出しと、すりガラスのシート（6つのタブの切り替えと、
// タブごとの中身 components/app/r-*.tsx）。下のメニューのページ
// （履歴・お気に入り・書類・出力・その他）は components/app/tab-pages.tsx、見つからない・候補・未対応は components/app/pages.tsx。
// 幅393ptの絵の寸法で描き、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）。下から出す画面（シート）は拡大・縮小しない
import {
  ChevronLeft,
  CircleHelp,
  FileText,
  Landmark,
  Info,
  LoaderCircle,
  Phone,
  Receipt,
  Route,
  Share2,
  Store,
  TriangleAlert,
  Waves,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { createPortal, flushSync } from "react-dom";
import {
  favoriteKey,
  removeFavorite,
  restoreFavorite,
  toggleFavoriteChecked,
  type FavoriteItem,
} from "@/lib/favorites";
import { historyKey, type HistoryItem } from "@/lib/history";
import { webglAvailable } from "@/lib/map-style";
import { propertyIdOf } from "@/lib/property-id";
import {
  loadRecords,
  recordLines,
  RECORDS_EVENT,
  type PropertyRecords,
  type RecordTopic,
} from "@/lib/records";
import {
  latestResume,
  loadResume,
  saveResume,
  type Resume,
} from "@/lib/resume";
import type { LookupResult } from "@/lib/roadmap";
import { partialMatch } from "@/lib/roadmap/geocode";
import { groupHazardMaps, wagamachiUrl } from "@/lib/roadmap/hazard";
import {
  chibanLabel,
  chibanQueryOf,
  registryChiban,
  type Neighbor,
} from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { buildSummary } from "@/lib/summary";
import { parcelAreaM2, TSUBO_M2 } from "@/lib/app/area";
import { DraftSheet } from "../draft-sheet";
import { FullMap } from "../full-map";
import { GuideMapSheet } from "../guide-map";
import { LocationPicker } from "../location-picker";
import {
  addressOffLot,
  pickKey,
  registryNeighbors,
  type ParcelPick,
} from "../parcel-card";
import { PrintSheet } from "../print-sheet";
import { copyText, loaded } from "../result-view";
import { TriageSheet, useChecklist } from "../triage-sheet";
import { useCopy } from "../use-copy";
import { ActionBar, type BarAction } from "./action-bar";
import {
  MapAppsSheet,
  pickSections,
  ReportSheet,
  type SectionKey,
} from "./app-sheets";
import { DetailSheet } from "./detail-sheets";
import { ART_W, BottomNav, ZOOM, type NavKey } from "./frame";
import { DocsBackdrop, DocsPage, docsPhoto, docsTop, type DocKind } from "./docs";
import {
  FavoritesBackdrop,
  FavoritesPage,
  favoritesPhoto,
  favoritesTop,
  UndoToast,
} from "./favorites";
import { prefetchFlight, SPACE_BACKGROUND } from "./flight-space";
import type { FlightTarget } from "./globe-flight";
import {
  HOME_TOP,
  HomeBackdrop,
  HomeMenu,
  HomeScreen,
  PAGE,
  SKY,
  useScreenHeight,
  VT,
  type HomeMessage,
} from "./home";
import { setMotionSetting, useMotionSetting } from "./motion";
import {
  AppCitiesSheet,
  AppHelpSheet,
  AppSourcesSheet,
  StorageSheet,
} from "./info";
import { InstallSheet, useStandalone } from "./install";
import { useFixedScreen } from "./no-bounce";
import { RecordSheet } from "./record-sheet";
import { Expand } from "./research";
import { SKY_EVENT, skyTop, useShrink, useSkyClock } from "./sky";
import { FavStar } from "./star";
import { topicStatuses } from "./status";
import { markNewsSeen, NewsSheet, useUnreadNews } from "./news";
import { NotOkPage } from "./pages";
import { AroundTab } from "./r-around";
import { areaLabel, BasicTab } from "./r-basic";
import { HazardTab } from "./r-hazard";
import { LawTab } from "./r-law";
import { PriceTab } from "./r-price";
import { RoadTab } from "./r-road";
import { BAND_TOP, displayAddress, WARN } from "./r-ui";
import { sceneTop, type PropertyScene } from "./property-3d";
import { PropertyBackdrop, propertyPartNow } from "./property-scene";
import {
  HeroChip,
  PlaceBanner,
  PropertyHero,
  tabOf,
  TABS,
  TabSegments,
  type TabKey,
} from "./result-head";
import { AccountPage, TabBanner } from "./tab-pages";
import { HistoryBackdrop, HistoryPage, historyPhoto, historyTop, HistoryUndoToast, type HistorySnapshot } from "./history";
import { LaunchIntro } from "./launch";
import { propertyCount, removedText } from "@/lib/app/history-view";
import {
  SHEET_KINDS,
  type FrontRoad,
  type HazardPick,
  type MapOpen,
  type SheetKind,
  type TabProps,
} from "./types";
import { reducedMotion } from "./tokens";
import { useProperty, type Ok, type PropertyData } from "./use-property";
import { clearShell, fitNames, nameShell, scrollArea } from "./vt";
import { statusBarColor } from "@/lib/app/status-bar";
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
  return client
    ? createPortal(<div className="theme-navy">{children}</div>, document.body)
    : null;
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
  /** 履歴から消す（行・期間）。端末に保存できたかを返す */
  onRemoveHistory: (items: HistoryItem[]) => boolean;
  /** 消した履歴を元に戻す */
  onRestoreHistory: (items: HistoryItem[]) => void;
  /** 調査記録を読み込んだあと（履歴・お気に入りを端末から読み直す） */
  onReloadStores: () => void;
  onHome: () => void;
};

type AppSheet = "help" | "cities" | "sources" | "install" | "storage" | null;

/** ホームの最近の検索 ⇄ 履歴のつながる動き（morphTo）で、行・板・検索欄のほかに名前を付ける所（ロゴの帯・ページの名前） */
const MORPH_SHELL: ReadonlySet<string> = new Set(["app-brand", "page-title"]);

export function MobileApp(props: MobileAppProps) {
  const {
    shown,
    input,
    setInput,
    loading,
    error,
    history,
    favorites,
    setFavorites,
    onSearch,
    onPickHistory,
    onPickPoint,
  } = props;
  const [page, setPage] = useState<NavKey>("home");
  const [sheet, setSheet] = useState<AppSheet>(null);
  const [picker, setPicker] = useState<{
    start?: { lat: number; lng: number };
    busy?: boolean;
  } | null>(null);
  // 地図で選んで読んでいる間（読み終わったら地図を閉じ、板が結果の帯につながる）
  const sawLoading = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 物件の「レポートを作成」（書類・出力）。下のメニューの「書類・出力」からも開く
  const [report, setReport] = useState(false);
  const [news, setNews] = useState(false);
  // ホームの右上のメニュー（≡）
  const [menu, setMenu] = useState(false);
  // 動きの演出（≡ の「動きの演出」。端末の「視差効果を減らす」がオンなら出さない）
  const motionOn = useMotionSetting();
  // 検索したときの「地球から土地までズーム」。flight は飛んでいる間だけ。降りる先は調べ終わった結果から（flightTarget）
  const [flight, setFlight] = useState<{ key: number; label: string } | null>(
    null,
  );
  const [flightTarget, setFlightTarget] = useState<FlightTarget>(null);
  const flightFrom = useRef<unknown>(undefined);
  // 履歴のページから物件を開いたとき：物件の画面から戻る先を履歴にする（backTo）。開いたときの履歴の絞り込み・並べ方・位置（histSnap）は、
  // 戻ったときに HistoryPage へ渡して元に戻す（histRestore）。調べている間は、押した行に「調べています」を出す（opening）。
  // 下のメニューなどで、ほかのページへ自分で移ったら、戻る先は消す
  const backTo = useRef<"history" | null>(null);
  const [fromHistory, setFromHistory] = useState(false);
  const histSnap = useRef<HistorySnapshot | null>(null);
  const [histRestore, setHistRestore] = useState<HistorySnapshot | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  /** 物件の画面の戻るボタンの読み上げの名前 */
  const backLabel = fromHistory ? "履歴に戻る" : "ホームに戻る";
  /** 戻る先（履歴）を消す */
  const forgetBack = () => {
    backTo.current = null;
    histSnap.current = null;
    setFromHistory(false);
  };
  // 地球の演出が消え始めた（宇宙の背景も一緒に消す）
  const [leaving, setLeaving] = useState(false);
  // 降りたあと、物件の画面がふわっと出る間
  const [arrive, setArrive] = useState(false);
  // お気に入りから外した物件（下に「元に戻す」を出す。index は外す前の位置、key は出し直すための印）
  const [undo, setUndo] = useState<{
    item: FavoriteItem;
    index: number;
    key: number;
  } | null>(null);
  // 履歴から消した物件（下に「元に戻す」を出す。続けて消したら足していき、まとめて戻す。key は出し直すための印）
  const [histUndo, setHistUndo] = useState<{
    items: HistoryItem[];
    key: number;
  } | null>(null);
  // お気に入りの「すべて見る」を開いているか（ほかのページへ行ったら閉じる。下のメニューのお気に入りをもう一度押しても閉じる）
  const [favAll, setFavAll] = useState(false);
  const unread = useUnreadNews();
  const offline = useOffline();
  const standalone = useStandalone();
  // 中身が画面に収まっていても、スワイプで画面全体が動かないようにする
  useFixedScreen();
  // 時間連動の空（1分ごとに入れ直す）
  useSkyClock();
  // 書類・出力のタイルで選んだ書類（その物件の画面が出たら、すぐ開く）
  const [wanted, setWanted] = useState<{ kind: DocKind; key: string } | null>(
    null,
  );
  const wantedDone = useCallback(() => setWanted(null), []);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 下部操作バーの置き場（物件の画面が中身を入れる。拡大・縮小する枠の外に置く）
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null);
  // 物件の画面の街の模型の置き場（中身の後ろ。物件の画面が中身を入れる）
  const [sceneSlot, setSceneSlot] = useState<HTMLDivElement | null>(null);
  // 開発中の再マウントで <html> の style が消えたときのため、拡大率をもう一度入れる
  useLayoutEffect(() => applyAppZoom(), []);
  // 自分で document.body に出す部品（重説の下書き・案内図）も紺の色にする（PC はこの画面を使わないので金色のまま）
  useEffect(() => {
    document.body.classList.add("theme-navy");
    return () => document.body.classList.remove("theme-navy");
  }, []);

  // 新しく調べたら、ホーム（物件の画面）のいちばん上へ
  const resultKey = shown
    ? `${shown.query}|${shown.result.status}|${"lat" in shown.result ? `${shown.result.lat},${shown.result.lng}` : ""}`
    : "";
  useEffect(() => {
    // 履歴から開いた物件から戻った（物件の画面が閉じた）ときは、出たときの履歴へ戻る（絞り込み・位置は HistoryPage が戻す）
    if (!resultKey && backTo.current === "history") {
      const snap = histSnap.current;
      backTo.current = null;
      histSnap.current = null;
      queueMicrotask(() => {
        setHistRestore(snap);
        setFromHistory(false);
        setPage("history");
      });
      return;
    }
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

  // ほかの3ページの写真（いまの時間帯）を、開いて少ししてから先に読んでおく（初めてページを切り替えたとき、写真が遅れて出ないように）
  useEffect(() => {
    const t = window.setTimeout(() => {
      for (const src of [favoritesPhoto(), historyPhoto(), docsPhoto()]) {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
      }
    }, 2600);
    return () => clearTimeout(t);
  }, []);

  const go = useCallback((p: NavKey) => {
    setPage(p);
    scroller.current?.scrollTo(0, 0);
  }, []);
  // ホームの最近の検索 ⇄ 履歴のつながる動きの間（両方のページの行・見出し・検索欄に同じ名前が付く。home.tsx の VT）
  const [morph, setMorph] = useState(false);
  /**
   * ホームの最近の検索 ⇄ 履歴を、つながる動きで行き来する（View Transitions）：最近の3件の行・見出し・検索欄は、
   * 相手のページの同じ物件の行・見出し・欄へ滑って形を変え、ほかはふわっと入れ替わる（app/globals.css の .vt-recent）。
   * 対応していない端末と、動きを減らす設定では、そのまま切り替える
   */
  const morphTo = (p: NavKey) => {
    if (typeof document.startViewTransition !== "function" || reducedMotion()) {
      go(p);
      return;
    }
    // 名前は動きの間だけ付ける（今の画面に付けてから、切り替える）。履歴は、いちばん上のいつもの形で開く
    setHistRestore(null);
    flushSync(() => setMorph(true));
    // 画面に収まっていない行・板・欄は名前を外す（スクロールで隠れていた所から飛んだり、下のメニューの上を通ったりしないように。
    // 今日の行が多くて縦に長い板は、見えている所で切って滑らせる。components/app/vt.ts）
    const sc = scroller.current;
    const unclip = sc ? fitNames(sc, scrollArea(sc), [VT.card]) : () => {};
    // ロゴの帯は止めたまま、ページの名前は入れ替える（ページの切り替えと同じ。tabTo）
    const shell = sc ? nameShell(sc, scrollArea(sc), MORPH_SHELL) : new Set<string>();
    let unclipNew = () => {};
    const html = document.documentElement;
    // 向き（履歴へは上へ、ホームへは下へ。行の動き出す順を変える）
    const dir = p === "history" ? "vt-up" : "vt-down";
    html.classList.add("vt-recent", dir);
    const t = document.startViewTransition(() => {
      flushSync(() => setPage(p));
      scroller.current?.scrollTo(0, 0);
      const next = scroller.current;
      if (next) {
        unclipNew = fitNames(next, scrollArea(next), [VT.card]);
        nameShell(next, scrollArea(next), shell);
      }
    });
    const done = () => {
      unclip();
      unclipNew();
      clearShell(scroller.current, shell);
      html.classList.remove("vt-recent", dir);
      setMorph(false);
    };
    // 動きが作れなかったときも、切り替えはそのまま（失敗を画面のエラーにしない）
    t.finished.then(done, done);
    t.ready.catch(() => {});
  };

  /** ページの上の帯・名前・検索欄のうち、そのページ（いまの開き方）にあるもの（tabTo で名前を付ける所） */
  const shellOf = (k: NavKey): Set<string> => {
    const home = k === "home" && !shown;
    const fav = k === "favorites" && !favAll;
    const s = new Set<string>();
    if (home || fav || k === "history" || k === "docs") {
      s.add("app-brand");
      s.add("page-title");
    }
    if (home || fav || k === "history") s.add("vt-search");
    return s;
  };
  /**
   * 下のメニューでページを切り替える（View Transitions）：ロゴの帯と下のメニューは止めたまま、ページの名前は前の名前が上へ抜けて
   * 次の名前が下から現れ、検索欄はすりガラスのまま字だけが入れ替わり、写真と中身はふわっと入れ替わる（中身はそれぞれのページの
   * 現れる動きで、上から順に浮き上がる。app/globals.css の .vt-tab）。下のメニューの線は、押した所へ滑る（.nav-mark）。
   * 同じページ・対応していない端末・動きを減らす設定では、そのまま切り替える（ページの現れる動きはそのまま）
   */
  const tabTo = (p: NavKey) => {
    const sc = scroller.current;
    if (p === page || typeof document.startViewTransition !== "function" || reducedMotion() || !sc) {
      go(p);
      return;
    }
    const html = document.documentElement;
    // 次のページにもあるものだけに名前を付ける（片方のページにしか無いものは、写真や中身と一緒にふわっと入れ替える。
    // 片方にしか無いものに名前を付けると、その絵が動きのあとまで残って見えることがある）
    const shell = nameShell(sc, scrollArea(sc), shellOf(p));
    html.classList.add("vt-tab");
    const t = document.startViewTransition(() => {
      flushSync(() => setPage(p));
      sc.scrollTo(0, 0);
      nameShell(sc, scrollArea(sc), shell);
    });
    const done = () => {
      clearShell(sc, shell);
      html.classList.remove("vt-tab");
    };
    t.finished.then(done, done);
    t.ready.catch(() => {});
  };

  const openMap = () => {
    const r = shown?.result;
    setPicker({
      start:
        r && (r.status === "ok" || r.status === "unsupported")
          ? { lat: r.lat, lng: r.lng }
          : undefined,
    });
  };
  const pickRecent = (h: HistoryItem) => {
    forgetBack();
    if (page === "home" && !shown) takeOff(h.address.replace(/^地番\s*/, ""));
    setPage("home");
    onPickHistory(h);
  };
  /**
   * 履歴のページで行を押した：地球から降りる（動きの演出がオンのとき。ホームから調べたときと同じ）。降りないときは、押した行に
   * 「調べています」を出して、調べ終わるまで履歴のまま（終わったら物件の画面へ。下の札にも「調べています」）。
   * 物件の画面から戻ると、出たときの履歴（絞り込み・並べ方・位置）へ戻る
   */
  const openFromHistory = (h: HistoryItem, snap: HistorySnapshot) => {
    backTo.current = "history";
    histSnap.current = snap;
    setFromHistory(true);
    setHistRestore(null);
    if (takeOff(h.address.replace(/^地番\s*/, ""))) setPage("home");
    else setOpening(historyKey(h));
    onPickHistory(h);
  };
  /** 物件の画面の「戻る」。検索する前のホームに戻る */
  const backHome = () => {
    setPage("home");
    props.onHome();
  };
  /** ホーム・履歴から調べるとき、地球から飛ぶ（動きの演出がオンで、動きを減らす設定でなく、WebGL が使えるときだけ）。飛んだかを返す */
  const takeOff = (label: string): boolean => {
    if (!motionOn || reducedMotion() || !webglAvailable()) return false;
    flightFrom.current = shown;
    setFlightTarget(null);
    setLeaving(false);
    setFlight({ key: Date.now(), label });
    return true;
  };
  /** ホームの検索。住所も地番も同じ欄（地番かどうかは調べるときに見分ける。lib/roadmap の splitChiban） */
  const submitHome = () => {
    if (!input.replace(/^\s*地番\s*/, "").trim()) {
      setNotice(EMPTY);
      inputRef.current?.focus();
      return;
    }
    setNotice(null);
    takeOff(input.trim());
    onSearch();
  };

  const ok = shown?.result.status === "ok" ? (shown.result as Ok) : undefined;
  // 検索する前のホーム（新しいUI）。調べている間もホームのまま（「調査を開始する」が回る）
  const showHome = page === "home" && !shown;
  // 下のメニューのページ（履歴・お気に入り・書類・出力・その他）は、大きな見出しのページにする
  const tabPage = page !== "home";
  // ホームの「続きから」：直近7日に見ていた物件（最近の検索のその行に印を付ける）
  const [resume, setResume] = useState<Resume | undefined>(undefined);
  useEffect(() => {
    if (showHome) queueMicrotask(() => setResume(latestResume()));
  }, [showHome, history]);
  // 時刻・電池の帯の色をページに合わせる（地球の演出の間は宇宙の色、ホームは写真のいちばん上の空の色、下のメニューのページは
  // 時間連動の空の上端の色、物件の画面は街の模型の空の上の色（時間帯で変わる）。PC の色は変えない）。空が変わるたびに合わせ直す
  const flying = !!flight;
  const okLat = ok?.lat;
  const okLng = ok?.lng;
  // 帯の色は3か所に入れる：theme-color（Android と iOS 18 までの Safari）、body の背景（iOS 26 の Safari は theme-color を使わず
  // body の背景色で帯を塗る。ホーム画面に追加したアプリは、帯の所が body の上の余白（app/globals.css）になる。そこでは帯の字が白
  // なので、明るい色は白い字が読める濃さまで暗くする。lib/app/status-bar.ts）
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][media="(max-width: 1023px)"]',
    );
    const set = () => {
      const color = flying
        ? FLIGHT_TOP
        : showHome
          ? HOME_TOP
          : page === "favorites"
            ? favoritesTop()
            : page === "docs"
              ? docsTop()
              : page === "history"
                ? historyTop()
                : tabPage
                  ? (skyTop() ?? SKY)
                  : okLat !== undefined && okLng !== undefined
                    ? sceneTop(propertyPartNow(okLat, okLng))
                    : BAND_TOP;
      meta?.setAttribute("content", color);
      document.body.style.backgroundColor = standalone
        ? statusBarColor(color)
        : color;
    };
    set();
    addEventListener(SKY_EVENT, set);
    return () => removeEventListener(SKY_EVENT, set);
  }, [showHome, tabPage, flying, page, okLat, okLng, standalone]);
  // PC の画面に切り替わったら、body の背景は元の色に戻す
  useEffect(
    () => () => {
      document.body.style.backgroundColor = "";
    },
    [],
  );
  // お気に入りのページを離れたら「元に戻す」はしまい、「すべて見る」も閉じる。履歴のページを離れたら、履歴の「元に戻す」もしまう
  useEffect(() => {
    if (page !== "favorites")
      queueMicrotask(() => {
        setUndo(null);
        setFavAll(false);
      });
    if (page !== "history")
      queueMicrotask(() => {
        setHistUndo(null);
        setHistRestore(null);
      });
  }, [page]);
  // 調べ終わったら、降りる先を地球の演出に渡す（見つからない・候補から選ぶ・調べられなかったときは降りない）
  useEffect(() => {
    if (!flight) return;
    if (shown && shown !== flightFrom.current) {
      const r = shown.result;
      queueMicrotask(() =>
        setFlightTarget(
          r.status === "ok" || r.status === "unsupported"
            ? { lat: r.lat, lng: r.lng }
            : "none",
        ),
      );
    } else if (error && !loading) queueMicrotask(() => setFlightTarget("none"));
  }, [flight, shown, error, loading]);
  // 履歴から開いた物件（地球から降りないとき）を調べ終わったら、物件の画面へ。調べられなかったら履歴のまま（下の札にわけが出る）
  useEffect(() => {
    if (!opening || loading) return;
    queueMicrotask(() => {
      setOpening(null);
      if (error) {
        backTo.current = null;
        histSnap.current = null;
        setFromHistory(false);
        return;
      }
      setPage("home");
      scroller.current?.scrollTo(0, 0);
    });
  }, [opening, loading, error]);
  // ホームを開いている間に、地球の演出の部品と、はじめに見える地球の絵を先に読んでおく（押してからの待ちを減らす）
  useEffect(() => {
    if (!showHome || !motionOn || reducedMotion()) return;
    const t = window.setTimeout(prefetchFlight, 2500);
    return () => clearTimeout(t);
  }, [showHome, motionOn]);
  const failure = error ?? (offline ? OFFLINE : null);
  const homeMessage: HomeMessage = failure
    ? { text: failure }
    : notice
      ? { text: notice }
      : null;
  const isFav = (h: HistoryItem) =>
    favorites.some((f) => favoriteKey(f) === favoriteKey(h));
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
    if (!r.saved)
      setNotice(
        "お気に入りを保存できませんでした。端末の空き容量と、プライベートブラウズでないことを確かめてください。",
      );
    else
      flash(r.added ? "お気に入りに保存しました" : "お気に入りから外しました");
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
    if (
      typeof document.startViewTransition === "function" &&
      !reducedMotion()
    ) {
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

  const tabBanner = (
    <TabBanner
      loading={loading && !offline}
      error={failure}
      notice={notice}
      onDismiss={() => setNotice(null)}
    />
  );
  let body: ReactNode;
  if (page === "history")
    body = (
      <HistoryPage
        history={history}
        isFavorite={isFav}
        onToggleFavorite={toggleFav}
        onPick={openFromHistory}
        opening={opening}
        restore={histRestore}
        onDocs={openDocsFor}
        onRemove={(items) => {
          if (!props.onRemoveHistory(items))
            setNotice(
              "この端末に履歴を保存できないため、開き直すと戻ります。端末の空き容量と、プライベートブラウズでないことを確かめてください。",
            );
          setHistUndo((u) => ({
            items: [...(u?.items ?? []), ...items],
            key: Date.now(),
          }));
        }}
        onNotice={flash}
        onHome={() => go("home")}
        onMenu={() => setMenu(true)}
        unread={unread}
        morph={morph}
      />
    );
  else if (page === "favorites")
    body = (
      <FavoritesPage
        favorites={favorites}
        onPick={pickRecent}
        onDocs={openDocsFor}
        onRemove={(f) => {
          const index = favorites.findIndex(
            (x) => favoriteKey(x) === favoriteKey(f),
          );
          setFavorites(removeFavorite(f));
          setUndo({ item: f, index, key: Date.now() });
        }}
        onHome={() => go("home")}
        onMenu={() => setMenu(true)}
        unread={unread}
        all={favAll}
        onAll={setFavAll}
        banner={
          <TabBanner
            glass
            loading={loading && !offline}
            error={failure}
            notice={notice}
            onDismiss={() => setNotice(null)}
          />
        }
      />
    );
  else if (page === "docs")
    body = (
      <DocsPage
        banner={
          <TabBanner
            glass
            loading={loading && !offline}
            error={failure}
            notice={notice}
            onDismiss={() => setNotice(null)}
          />
        }
        current={current}
        history={history}
        onMake={makeDoc}
        onReport={() => {
          setPage("home");
          setReport(true);
        }}
        onPick={openDocsFor}
        onHistory={() => go("history")}
        onHome={() => go("home")}
        onMenu={() => setMenu(true)}
        unread={unread}
        motion={motionOn}
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
        onStorage={() => setSheet("storage")}
        standalone={standalone}
        historyCount={propertyCount(history)}
        favoriteCount={favorites.length}
        banner={tabBanner}
      />
    );
  else if (shown && shown.result.status !== "ok")
    body = (
      <NotOkPage
        query={shown.query}
        result={shown.result}
        onPick={props.onPickAddress}
        onMap={openMap}
        onBack={backHome}
        backLabel={backLabel}
        banner={
          <Banner
            loading={loading && !offline}
            error={failure}
            notice={notice}
            onDismiss={() => setNotice(null)}
          />
        }
      />
    );

  return (
    <div
      className="theme-navy app-touch relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      style={{
        fontFeatureSettings: "normal",
        letterSpacing: 0,
        background: PAGE,
      }}
    >
      {/* アプリを開いたときの演出（紺の幕とロゴ。終わったら外れる。components/app/launch.tsx） */}
      <LaunchIntro />
      {/* ホーム・お気に入り・書類・出力は画面いっぱいの写真（下のメニューの後ろまで） */}
      {showHome && <HomeBackdrop drift={motionOn} />}
      {page === "favorites" && (
        <FavoritesBackdrop scroller={scroller} motion={motionOn} />
      )}
      {page === "docs" && <DocsBackdrop motion={motionOn} />}
      {page === "history" && (
        <HistoryBackdrop scroller={scroller} motion={motionOn} />
      )}
      {/* 物件の画面の街の模型（ほかのページを見ている間は隠して描かない。戻ったときに作り直さない） */}
      {ok && (
        <div
          ref={setSceneSlot}
          className="absolute inset-0"
          style={{ visibility: page === "home" ? "visible" : "hidden" }}
        />
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          data-scroller
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
        >
          <div
            className="relative mx-auto"
            style={{ width: ART_W, zoom: ZOOM }}
          >
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
                onHistory={() => morphTo("history")}
                morph={morph}
                onTry={(a) => {
                  takeOff(a);
                  props.onPickAddress(a);
                }}
                onMenu={() => setMenu(true)}
                unread={unread}
                inputRef={inputRef}
                resume={resume}
              />
            )}
            {/* 物件の画面は、検索履歴などのページを見ているあいだも残す（戻ったときに読み直さない・タブもそのまま） */}
            {ok && (
              <div
                hidden={page !== "home"}
                className={arrive ? "flight-arrive" : undefined}
              >
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
                  backLabel={backLabel}
                  wanted={wanted}
                  onWantedDone={wantedDone}
                  scroller={scroller}
                  barSlot={barSlot}
                  barHidden={page !== "home"}
                  sceneSlot={sceneSlot}
                  motion={motionOn}
                  hold={!!flight && !leaving}
                />
              </div>
            )}
            {/* お気に入り・書類・出力・履歴は自分で上から順に浮き上がる（外の箱を動かすと、すりガラスの後ろがぼけない） */}
            {tabPage && (
              <div
                key={page}
                className={
                  page === "favorites" ||
                  page === "docs" ||
                  page === "history" ||
                  morph
                    ? undefined
                    : "page-in"
                }
              >
                {body}
              </div>
            )}
            {!showHome && !tabPage && !ok && body}
          </div>
        </div>
        {/* 下部操作バーの置き場（物件の画面が中身を入れる） */}
        <div
          ref={setBarSlot}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30"
        />
        {/* 履歴のページのお知らせ（コピーしました など）と、消したあとの「元に戻す」（下のメニューのすぐ上に浮かせる。一覧はスクロールするので） */}
        {page === "history" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[12px] z-40 flex justify-center">
            <div
              className="flex flex-col items-center gap-[8px] px-[16px]"
              style={{ width: ART_W, zoom: ZOOM }}
            >
              <div className="pointer-events-auto w-full empty:hidden">
                <TabBanner
                  glass
                  loading={loading && !offline}
                  error={failure}
                  notice={notice}
                  onDismiss={() => setNotice(null)}
                />
              </div>
              {histUndo && (
                <HistoryUndoToast
                  key={histUndo.key}
                  text={removedText(histUndo.items)}
                  onUndo={() => {
                    props.onRestoreHistory(histUndo.items);
                    setHistUndo(null);
                  }}
                  onClose={() => setHistUndo(null)}
                />
              )}
            </div>
          </div>
        )}
        {/* お気に入りから外したあとの「元に戻す」（下のメニューのすぐ上） */}
        {undo && page === "favorites" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[12px] z-40 flex justify-center">
            <div
              className="flex justify-center px-[16px]"
              style={{ width: ART_W, zoom: ZOOM }}
            >
              <UndoToast
                key={undo.key}
                item={undo.item}
                onUndo={() => {
                  setFavorites(restoreFavorite(undo.item, undo.index));
                  setUndo(null);
                }}
                onClose={() => setUndo(null)}
              />
            </div>
          </div>
        )}
      </div>
      <BottomNav
        dark={
          showHome ||
          page === "favorites" ||
          page === "docs" ||
          page === "history" ||
          (!!ok && page === "home")
        }
        active={page}
        onSelect={(k) => {
          // 履歴から開いた物件を見ているときに「履歴」を押したら、出たときの履歴（絞り込み・位置）へ戻る。ほかへ移ったら戻る先は消す
          const snap =
            k === "history" && backTo.current === "history"
              ? histSnap.current
              : null;
          forgetBack();
          setOpening(null);
          setHistRestore(snap);
          if (k === "home" && page === "home") {
            if (shown) props.onHome();
            else scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
          } else if (k === "favorites" && page === "favorites") {
            // すべて見るを開いていたら、いつもの画面へ戻る
            setFavAll(false);
            scroller.current?.scrollTo(0, 0);
          } else if (k === "history" && page === "history") {
            // 履歴を見ているときにもう一度押したら、いちばん上へ滑って戻る
            scroller.current?.scrollTo({
              top: 0,
              behavior: reducedMotion() ? "auto" : "smooth",
            });
          } else if (
            // ホームの最近の検索 ⇄ 履歴は、行がつながる動きで行き来する
            (k === "history" && showHome) ||
            (k === "home" && page === "history" && !shown)
          )
            morphTo(k);
          else tabTo(k);
        }}
      />

      <Portal>
        <AppHelpSheet open={sheet === "help"} onClose={() => setSheet(null)} />
        <InstallSheet
          open={sheet === "install"}
          onClose={() => setSheet(null)}
        />
        <AppCitiesSheet
          open={sheet === "cities"}
          onClose={() => setSheet(null)}
        />
        <AppSourcesSheet
          open={sheet === "sources"}
          onClose={() => setSheet(null)}
        />
        <StorageSheet
          open={sheet === "storage"}
          onClose={() => setSheet(null)}
          standalone={standalone}
          onImported={props.onReloadStores}
        />
        <NewsSheet open={news} onClose={() => setNews(false)} />
        {/* 宇宙の背景は押した瞬間に出す（地球の地図の部品を読んでいる間も） */}
        {flight && (
          <div
            aria-hidden
            className={`fixed inset-0 z-[79] ${leaving ? "flight-out" : "flight-in"}`}
            style={{ backgroundImage: SPACE_BACKGROUND }}
          />
        )}
        {flight && (
          <GlobeFlight
            key={flight.key}
            label={flight.label}
            target={flightTarget}
            onLeave={(landed) => {
              setLeaving(true);
              // 地球の演出が消えていくのと同時に、物件の画面をふわっと出す（消えてから出すと、一度はっきり見えてから薄くなってちらつく）
              if (landed) {
                setArrive(true);
                window.setTimeout(() => setArrive(false), ARRIVE_MS);
              }
            }}
            onDone={() => {
              setFlight(null);
              // モーダルを閉じた後、調査内容へ戻す。住所欄に戻してキーボードを再表示しない。
              scroller.current?.focus({ preventScroll: true });
            }}
          />
        )}
        <HomeMenu
          open={menu}
          onClose={() => setMenu(false)}
          onMap={openMap}
          onNews={() => {
            setNews(true);
            markNewsSeen();
          }}
          unread={unread}
          onHelp={() => setSheet("help")}
          onCities={() => setSheet("cities")}
          onSources={() => setSheet("sources")}
          onStorage={() => setSheet("storage")}
          onInstall={() => setSheet("install")}
          standalone={standalone}
          onMore={() => go("account")}
          motion={motionOn}
          onMotion={setMotionSetting}
        />
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

/** 検索したときの「地球から土地までズーム」（地図の部品と一緒に、使うときだけ読む。components/app/globe-flight.tsx） */
const GlobeFlight = dynamic(() => import("./globe-flight"), { ssr: false });
/** 降りたあと、物件の画面がふわっと出る間（app/globals.css の .flight-arrive は 0.6 秒。少し長めに待ってから外す） */
const ARRIVE_MS = 700;
/** 地球の演出の間の、時刻・電池の帯の色（宇宙） */
const FLIGHT_TOP = "#03060f";

/** 空のまま調べようとしたときの一言 */
const EMPTY =
  "住所か地番を入れてください（例：渋谷区神南1-19-11、松戸市古ヶ崎四丁目3556-1）。";

/** 通信できないときの一言 */
const OFFLINE =
  "通信できません（オフライン）。電波の良い場所で調べ直してください。読めなかった項目は「読み込めず」と出ます。";

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
  return {
    address: r.picked ? r.matchedAddress : query,
    city: r.municipality.name,
    coverage: r.municipality.coverage,
    at: Date.now(),
    ...(r.picked ? { ll: [r.lat, r.lng] as [number, number] } : {}),
  };
}

/** 調べている・通信の失敗・お知らせ（物件の画面と見つからない画面の上） */
function Banner({
  loading,
  error,
  notice,
  onDismiss,
  dark = false,
}: {
  loading: boolean;
  error: string | null;
  notice?: string | null;
  onDismiss?: () => void;
  /** 物件の画面のすりガラスのシートの中（暗い地の色） */
  dark?: boolean;
}) {
  if (loading)
    return (
      <p
        className={`mx-[16px] mt-[8px] flex items-center gap-[6px] rounded-[12px] px-[12px] py-[9px] leading-none ${dark ? "" : "bg-[#eef4fb]"}`}
        style={{
          fontSize: 13,
          color: dark ? "#cfe5ff" : "#1c3a6a",
          ...(dark
            ? {
                background: "rgba(116,187,255,0.12)",
                border: "1px solid rgba(116,187,255,0.28)",
              }
            : {}),
        }}
      >
        <LoaderCircle
          size={15}
          strokeWidth={1.8}
          absoluteStrokeWidth
          className="animate-spin"
        />
        調べています…
      </p>
    );
  const text = error ?? notice;
  if (!text) return null;
  const warn = !!error;
  return (
    <button
      onClick={onDismiss}
      className="mx-[16px] mt-[8px] flex w-[calc(100%-32px)] items-start gap-[6px] rounded-[12px] px-[12px] py-[9px] text-left leading-[1.45]"
      style={
        dark
          ? {
              fontSize: 13,
              background: warn
                ? "rgba(255,183,94,0.12)"
                : "rgba(116,187,255,0.12)",
              border: `1px solid ${warn ? "rgba(255,183,94,0.3)" : "rgba(116,187,255,0.28)"}`,
              color: warn ? "#ffd3a0" : "#cfe5ff",
            }
          : {
              fontSize: 13,
              background: warn ? "#fdf1ec" : "#eef4fb",
              color: warn ? WARN : "#1c3a6a",
            }
      }
    >
      {warn ? (
        <TriangleAlert
          size={15}
          strokeWidth={1.8}
          absoluteStrokeWidth
          className="mt-[2px] shrink-0"
        />
      ) : (
        <Info
          size={15}
          strokeWidth={1.8}
          absoluteStrokeWidth
          className="mt-[2px] shrink-0"
        />
      )}
      {text}
    </button>
  );
}

/** 前回開いていたシートを戻す期限（公式道路図・電話から戻ったときのため。それより古ければタブとスクロール位置だけ） */
const RESUME_SHEET_MS = 30 * 60e3;
/** 下部操作バーの分だけ、タブの中身の下を空ける */
const BAR_PAD = 76;

/** 物件の画面（6つのタブ）。データはここで読む。あなたの確認の記録と、前回見ていた所（再開）もここ */
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
  backLabel,
  wanted,
  onWantedDone,
  scroller,
  barSlot,
  barHidden,
  sceneSlot,
  motion,
  hold,
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
  /** 戻るボタンの読み上げの名前（履歴から開いたときは「履歴に戻る」） */
  backLabel: string;
  /** 書類・出力のタイルで選んだ書類（この物件のものならすぐ開く） */
  wanted: { kind: DocKind; key: string } | null;
  onWantedDone: () => void;
  scroller: React.RefObject<HTMLDivElement | null>;
  /** 下部操作バーの置き場（拡大・縮小する枠の外） */
  barSlot: HTMLElement | null;
  /** ほかのページを見ている間は下部操作バーを隠す（街の模型も描かない） */
  barHidden: boolean;
  /** 街の模型の置き場（中身の後ろ。拡大・縮小する枠の外） */
  sceneSlot: HTMLElement | null;
  /** 動きの演出がオンか（≡ の設定） */
  motion: boolean;
  /** 地球からのズームの演出が出ている間は、模型の着地を待つ（演出が消え始めたら降りる） */
  hold: boolean;
}) {
  const data = useProperty(result);
  // 物件の鍵（筆 → 地図の地点 → 住所。lib/property-id.ts）。確認の記録と再開はこの鍵で
  const pid = propertyIdOf(query, result);
  // 前回見ていた所（7日以内）：タブは戻す。シートは 30 分以内なら戻す（公式道路図・電話から戻ったとき）
  const [resume] = useState(() => loadResume(pid));
  const [tab, setTab] = useState<TabKey>(() => tabOf(resume?.tab) ?? "basic");
  const [detail, setDetail] = useState<{
    kind: SheetKind;
    arg?: number;
  } | null>(() => {
    const sheet = resume?.sheet;
    return sheet &&
      Date.now() - resume.at < RESUME_SHEET_MS &&
      (SHEET_KINDS as readonly string[]).includes(sheet)
      ? { kind: sheet as SheetKind }
      : null;
  });
  // あなたの確認の記録（端末の中だけ）。読み込み（その他）で変わったら読み直す
  const [records, setRecords] = useState<PropertyRecords>(() =>
    loadRecords(pid),
  );
  useEffect(() => {
    const reload = () => setRecords(loadRecords(pid));
    addEventListener(RECORDS_EVENT, reload);
    return () => removeEventListener(RECORDS_EVENT, reload);
  }, [pid]);
  const [recordTopic, setRecordTopic] = useState<RecordTopic | null>(null);
  const statuses = topicStatuses(result, data, records);
  const [mapApps, setMapApps] = useState(false);
  const [triage, setTriage] = useState(false);
  const [draft, setDraft] = useState(false);
  const [guide, setGuide] = useState(false);
  const [full, setFull] = useState<MapOpen | null>(null);
  // 見出しの「推定の位置」の説明を出しているか
  const [about, setAbout] = useState(false);
  // 街の模型：隣の土地を出すか、ハザードのタブで選んだ種類、模型が出せるか（出せなければ平らな地図）、土地に接する道路（地理院の地図）
  const [neighbors, setNeighbors] = useState(false);
  const [hazPick, setHazPick] = useState<HazardPick>("flood");
  const [has3d, setHas3d] = useState(true);
  const [front, setFront] = useState<FrontRoad[] | null>(null);
  const scene = useRef<PropertyScene | null>(null);
  // 謄本・公図の請求に貼る地番：押して選んだ筆（概要の「隣の土地」・地番の詳しい画面・街の模型・拡大した地図で同じものを選ぶ）。
  // 地番は登記の地番。物件ごとに空から（この画面は物件ごとに作り直す）
  const [picked, setPicked] = useState<Neighbor[]>([]);
  const togglePick = (n: Neighbor) => {
    const k = pickKey(n);
    setPicked((cur) =>
      cur.some((x) => pickKey(x) === k)
        ? cur.filter((x) => pickKey(x) !== k)
        : [...cur, { kuiki: n.kuiki, chiban: registryChiban(n.chiban) }],
    );
  };
  const pick: ParcelPick = {
    list: picked,
    toggle: togglePick,
    set: setPicked,
    onMap: () => {
      setDetail(null);
      setFull({ parcels: true });
    },
  };
  // レポートに入れない項目（レポートの画面で選ぶ）
  const [off, setOff] = useState<ReadonlySet<SectionKey>>(() => new Set());
  const addr = useCopy();
  const shareCopy = useCopy();
  const reportCopy = useCopy();
  const checklist = useChecklist(result);
  // 共有の文の先頭に、要注意点と次にやること（済んだ印も）を入れる。外した項目は抜く
  const input = pickSections(
    {
      ...loaded({ ...data, landPrice: data.landPrice5 }),
      triage: data.triage,
      done: checklist.done,
    },
    off,
  );
  /** 共有・コピーの文（結果の文面と、あなたの確認の記録） */
  const summaryText = () =>
    [buildSummary(result, input), ...recordLines(records)].join("\n");
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

  const m = result.municipality;
  const p = result.parcel;
  const found = p && !result.picked ? p : undefined;
  const title = `${displayAddress(result.matchedAddress)}${found ? ` ${chibanLabel(found.chibanRaw)}` : ""}`;
  const longTab = TABS.find((t) => t.key === tab)?.long ?? "";

  // スクロールで見出しが流れたら、上に住所のバーを出す（タブの切り替えはその下に留まる）
  const root = useRef<HTMLDivElement>(null);
  useShrink(root, 140);
  const screenH = useScreenHeight(root);
  // 見出し（街の模型が見える所）の高さ：画面の 60%（背の低い画面でも 330pt）
  const heroH = Math.round(Math.max(330, (screenH ?? 760) * 0.6));
  const heroBox = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropBox = useRef<HTMLDivElement>(null);
  // シートが模型を覆いきったら模型を描かない
  const [covered, setCovered] = useState(false);
  const [flatCenter, setFlatCenter] = useState(300);
  // 模型の割り付け：土地を見出しの字とシートのあいだに置き、スクロールではその半分の速さで上へ（奥にあるように見せる）。
  // 札は上のボタン・見出しの字・シートに重ねない。模型ができたときにも測る（placeScene）
  const placeScene = useRef<() => void>(() => {});
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const place = () => {
      const box = backdropBox.current?.getBoundingClientRect();
      const sheet = sheetRef.current?.getBoundingClientRect();
      const text = textRef.current?.getBoundingClientRect();
      const top = topRef.current?.getBoundingClientRect();
      if (!box || !sheet || !text || !top || !box.height) return;
      const y = Math.max(0, el.scrollTop);
      const zoom =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--app-zoom",
          ),
        ) || 1;
      const sheetTop = sheet.top - box.top;
      const textBottom = text.bottom - box.top;
      const centerY = (textBottom + sheetTop) / 2 + y * 0.5;
      const bar = 56 * zoom;
      const cover = Math.min(
        1,
        Math.max(0, y / Math.max(1, sheetTop + y - bar)),
      );
      scene.current?.setLayout({
        centerY,
        sheetTop,
        topLimit: Math.max(top.bottom - box.top, y > 4 ? bar : 0) + 4,
        // 見出しの字の行ごとの四角（字の右の空いた所には札を出せる）
        avoid: [...(textRef.current?.children ?? [])].map((c) => {
          const r = c.getBoundingClientRect();
          return {
            l: r.left - box.left - 8,
            t: r.top - box.top - 6,
            r: r.right - box.left + 8,
            b: r.bottom - box.top + 6,
          };
        }),
        cover,
      });
      setCovered(cover > 0.985);
      if (y < 1) setFlatCenter(centerY);
    };
    placeScene.current = place;
    let frame = 0;
    const onScroll = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          place();
        });
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    if (sheetRef.current) ro.observe(sheetRef.current);
    if (textRef.current) ro.observe(textRef.current);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(frame);
      placeScene.current = () => {};
    };
  }, [scroller]);
  // 見出しの上で指を横になぞると模型が回り、2本指で寄る（縦はいつものスクロール。ボタンの上は触らない）
  const onHeroPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = scene.current;
    if (!s) return;
    const ev = e.nativeEvent;
    if (e.type === "pointerdown") {
      if ((e.target as Element).closest("button, a")) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 押さえ続けられない端末でも、動きはそのまま渡す
      }
      s.pointerDown(ev);
    } else if (e.type === "pointermove") s.pointerMove(ev);
    else if (e.type === "pointerup") s.pointerUp(ev);
    else s.pointerCancel(ev);
  };
  // トラックパッドの2本指の広げ・すぼめ（ctrl＋ホイール）で寄る。ふつうのホイールはスクロール
  useEffect(() => {
    const el = heroBox.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !scene.current) return;
      e.preventDefault();
      scene.current.wheel(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // 再開のために、開いているタブ・シートと止まったときのスクロール位置を残す（この物件の鍵があるときだけ）
  const detailKind = detail?.kind;
  const ll = result.picked ? `${result.lat},${result.lng}` : "";
  useEffect(() => {
    if (!pid) return;
    saveResume({
      pid,
      label: title,
      historyKey: myKey,
      ll: ll ? (ll.split(",").map(Number) as [number, number]) : undefined,
      tab,
      sheet: detailKind,
      scroll: scroller.current?.scrollTop ?? 0,
    });
  }, [pid, title, myKey, ll, tab, detailKind, scroller]);
  // スクロール中は下部操作バーを薄くし、止まったら戻す（止まった位置を再開のために残す）
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer = 0;
    let on = false;
    const onScroll = () => {
      // 別のページ（履歴など）を見ている間のスクロールは、この物件のものではない
      if (!root.current || root.current.offsetParent === null) return;
      if (!on) {
        on = true;
        setScrolling(true);
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        on = false;
        setScrolling(false);
        if (pid)
          saveResume({
            pid,
            label: title,
            historyKey: myKey,
            ll: ll
              ? (ll.split(",").map(Number) as [number, number])
              : undefined,
            tab,
            sheet: detailKind,
            scroll: el.scrollTop,
          });
      }, 160);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [scroller, pid, title, myKey, ll, tab, detailKind]);
  // 前回のスクロール位置へ。読み込みで中身が伸びるまで届かないことがあるので、3秒まで何度か試す（届いたら終わり）。
  // 指で動かし始めたらやめる
  const touched = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    const y = resume?.scroll ?? 0;
    if (!el || !y) return;
    const stop = () => {
      touched.current = true;
    };
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("wheel", stop, { passive: true });
    const timers: number[] = [];
    let done = false;
    const go = () => {
      if (done || touched.current) return;
      if (el.scrollHeight - el.clientHeight >= y) {
        el.scrollTo(0, y);
        done = true;
      }
    };
    const frame = requestAnimationFrame(go);
    for (const ms of [300, 700, 1500, 3000])
      timers.push(window.setTimeout(go, ms));
    return () => {
      cancelAnimationFrame(frame);
      for (const t of timers) clearTimeout(t);
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("wheel", stop);
    };
    // 開いたときの1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 文字を入れている間（キーボードが出ている間）は下部操作バーを隠す
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const check = () => {
      const a = document.activeElement;
      setTyping(!!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"));
    };
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
    };
  }, []);

  const changeTab = (t: TabKey) => {
    if (t === tab) return;
    setTab(t);
    // タブを変えたら、いちばん上へ（街の模型の見せ方が変わるのを見せる）
    scroller.current?.scrollTo({
      top: 0,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  };
  const share = async () => {
    const text = summaryText();
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
    triage: () => setTriage(true),
    checklist,
    pid,
    records,
    statuses,
    record: setRecordTopic,
    has3d,
    neighbors,
    setNeighbors,
    pick,
    hazard: hazPick,
    setHazard: setHazPick,
    front,
  };

  // 下部操作バー：いま見ているタブの主役（概要＝レポート、道路＝市町村の道路種別の図か問い合わせ先、法令＝都市計画のくわしい話、
  // ハザード＝市区町村のハザードマップ、周辺＝施設の一覧、相場＝下の取引事例へ）と、脇役の★・共有
  const primary: BarAction = (() => {
    const icon = (I: typeof FileText) => (
      <I size={17} strokeWidth={1.9} absoluteStrokeWidth />
    );
    switch (tab) {
      case "around":
        return {
          label: "施設の一覧",
          icon: icon(Store),
          onClick: () => setDetail({ kind: "pois" }),
        };
      case "price":
        return {
          label: "取引事例を見る",
          icon: icon(Receipt),
          onClick: () =>
            document.getElementById("pv-deals")?.scrollIntoView({
              behavior: reducedMotion() ? "auto" : "smooth",
              block: "start",
            }),
        };
      case "road": {
        const link = result.links[0];
        const offline = m.coverage === "none" || m.coverage === "outside";
        return link && !offline
          ? {
              label: `${m.name}の道路種別の図`,
              icon: icon(Route),
              href: link.url,
            }
          : {
              label: "問い合わせ先",
              icon: icon(Phone),
              onClick: () => setDetail({ kind: "contact" }),
            };
      }
      case "law":
        return data.zoning.status === "ok"
          ? {
              label: "都市計画のくわしい話",
              icon: icon(Landmark),
              onClick: () => setDetail({ kind: "zoning" }),
            }
          : {
              label: "問い合わせ先",
              icon: icon(Phone),
              onClick: () => setDetail({ kind: "contact" }),
            };
      case "hazard": {
        const h = data.hazard;
        const url =
          h.status === "ok"
            ? (groupHazardMaps(h.maps)[0]?.url ?? wagamachiUrl(h.muniCd))
            : `https://disaportal.gsi.go.jp/maps/?ll=${result.lat.toFixed(6)},${result.lng.toFixed(6)}&z=16&base=pale&vs=c1j0l0u0t0h0z0`;
        return {
          label: `${m.name}のハザードマップ`,
          icon: icon(Waves),
          href: url,
        };
      }
      default:
        return {
          label: "レポートを作成",
          icon: icon(FileText),
          onClick: () => setReport(true),
        };
    }
  })();
  const secondary: BarAction[] = [
    {
      label: "",
      title: favorite ? "お気に入りから外す" : "お気に入りに保存",
      icon: <FavStar on={favorite} size={20} off="#fff" />,
      onClick: onFavorite,
      pressed: favorite,
    },
    {
      label: "共有",
      icon: <Share2 size={16} strokeWidth={1.9} absoluteStrokeWidth />,
      onClick: () => void share(),
    },
  ];

  // 見出しの札：面積・坪、推定の位置・地番参考図（押すと説明）、同じ地番がほかにある
  const shownParcel =
    data.parcels.status === "ok" ? data.parcels.parcel : undefined;
  const lotParcel =
    shownParcel &&
    /^\d/.test(shownParcel.chibanRaw) &&
    addressOffLot(data.parcels) === undefined
      ? shownParcel
      : undefined;
  const lotNumber = lotParcel ? registryChiban(lotParcel.chibanRaw) : undefined;
  const lotArea =
    lotParcel && data.parcels.status === "ok" && data.parcels.kind !== "address"
      ? parcelAreaM2(lotParcel)
      : undefined;
  const eyebrow = result.picked
    ? "地図で選んだ地点"
    : found
      ? "地番で調べた土地"
      : lotNumber
        ? "住所で調べた場所（住所の地点の筆）"
        : "住所で調べた場所";
  const where = displayAddress(result.matchedAddress);
  const chips = (
    <>
      {lotArea && (
        <HeroChip>
          約{areaLabel(lotArea, !!(lotParcel?.estimated || lotParcel?.sanko))}㎡
          <span className="opacity-60">・</span>
          {lotParcel?.estimated || lotParcel?.sanko
            ? `約${Math.round(lotArea / TSUBO_M2)}坪（目安）`
            : `${(lotArea / TSUBO_M2).toFixed(1)}坪`}
        </HeroChip>
      )}
      {lotParcel && (lotParcel.estimated || lotParcel.sanko) && (
        <HeroChip
          tone="gold"
          onClick={() => setAbout((v) => !v)}
          icon={<CircleHelp size={13} strokeWidth={2} absoluteStrokeWidth />}
        >
          {lotParcel.sanko ? "市の地番参考図" : "推定の位置"}
        </HeroChip>
      )}
      {!!result.parcelOthers && (
        <HeroChip tone="warn" onClick={() => setDetail({ kind: "parcel" })}>
          同じ地番がほかに{result.parcelOthers}件
        </HeroChip>
      )}
    </>
  );
  // 出典（模型に使っているもの。タブで変わる）
  const credit = [
    has3d
      ? "地図：国土地理院ベクトルタイル（建物の高さは目安）"
      : "地図：地理院タイル",
    lotParcel
      ? lotParcel.sanko
        ? "筆：市町村の地番参考図"
        : lotParcel.estimated
          ? "筆：登記所備付地図データ（法務省）から推定した位置"
          : "筆：登記所備付地図データ（法務省）を加工"
      : "",
    tab === "law" ? "用途地域：国土交通省 都市計画決定GISデータ" : "",
    tab === "hazard" ? "ハザード：重ねるハザードマップ（国土地理院）" : "",
    tab === "around"
      ? "施設・駅の出入口：© OpenStreetMap contributors・駅・学区：国土数値情報"
      : "",
    tab === "price" ? "地価：国土数値情報（地価公示・地価調査）" : "",
  ].filter(Boolean);

  return (
    <div ref={root} className="pv-page relative text-white">
      {/* いちばん奥：街の模型（拡大・縮小する枠の外の置き場に出す） */}
      {sceneSlot &&
        createPortal(
          <PropertyBackdrop
            result={result}
            data={data}
            tab={tab}
            motion={motion}
            hold={hold}
            neighbors={neighbors}
            picked={picked}
            hazard={hazPick}
            visible={!barHidden && !covered}
            onReady={(api) => {
              scene.current = api;
              if (api) placeScene.current();
            }}
            onFlat={() => setHas3d(false)}
            onFront={setFront}
            flatCenter={flatCenter}
            boxRef={backdropBox}
          />,
          sceneSlot,
        )}

      {/* スクロールしたら上に出る細いバー：戻る・地番か住所（押すとコピー）・見ているタブ・★ */}
      <div className="pointer-events-none sticky top-0 z-20 h-0">
        <div
          className="compact-bar pointer-events-auto flex items-center gap-[6px] px-[8px]"
          style={{
            height: 56,
            background:
              "linear-gradient(180deg, rgba(14,24,42,0.66) 0%, rgba(14,24,42,0.54) 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(20px) saturate(140%)",
            WebkitBackdropFilter: "blur(20px) saturate(140%)",
          }}
        >
          <button
            onClick={onBack}
            aria-label={backLabel}
            className="press flex size-[44px] shrink-0 items-center justify-center rounded-full"
          >
            <ChevronLeft
              size={24}
              strokeWidth={2}
              absoluteStrokeWidth
              color="#fff"
            />
          </button>
          <button
            onClick={() => addr.copy(copyText(result))}
            aria-label="住所をコピー"
            className="min-w-0 flex-1 text-left"
          >
            <span
              className="block truncate font-semibold leading-none"
              style={{ fontSize: 16 }}
            >
              {lotNumber ? (
                <>
                  <span
                    className="mr-[6px] font-medium"
                    style={{ fontSize: 12, color: "#ffe2a3", letterSpacing: 1 }}
                  >
                    地番
                  </span>
                  {lotNumber}
                </>
              ) : (
                where
              )}
            </span>
            <span
              className="mt-[4px] block truncate leading-none"
              style={{
                fontSize: 11,
                color: addr.done ? "#a6f0c6" : "rgba(255,255,255,0.66)",
              }}
            >
              {addr.done
                ? "住所をコピーしました"
                : `${lotNumber ? `${where}・` : ""}${longTab}`}
            </span>
          </button>
          <button
            onClick={onFavorite}
            aria-label={favorite ? "お気に入りから外す" : "お気に入りに保存"}
            aria-pressed={favorite}
            className="press flex size-[44px] shrink-0 items-center justify-center rounded-full"
          >
            <FavStar on={favorite} size={21} off="#fff" />
          </button>
        </div>
      </div>

      {/* 見出し（街の模型が見える所）。指で横になぞると模型が回る */}
      <div
        ref={heroBox}
        className="pv-hero relative select-none"
        style={{ height: heroH, touchAction: "pan-y" }}
        onPointerDown={onHeroPointer}
        onPointerMove={onHeroPointer}
        onPointerUp={onHeroPointer}
        onPointerCancel={onHeroPointer}
        onClick={() => {
          // 模型の土地をたたいたら、地番の詳しい画面。隣の土地を出しているときは、隣の筆をたたくと選ぶ・外す
          const s = scene.current;
          if (!s) return;
          if (s.takeLotTap()) {
            setDetail({ kind: "parcel" });
            return;
          }
          const nb = s.takeNeighborTap();
          if (nb) {
            const [kuiki, chiban] = nb.split("|");
            togglePick({ kuiki, chiban });
          }
        }}
      >
        <PropertyHero
          eyebrow={eyebrow}
          lot={lotNumber}
          title={where}
          address={copyText(result).normalize("NFKC")}
          onCopy={() => addr.copy(copyText(result))}
          copied={addr.done}
          chips={chips}
          more={
            lotParcel && (lotParcel.estimated || lotParcel.sanko) ? (
              <Expand open={about}>
                <div>
                  <p
                    className="mt-[8px] max-w-[300px] rounded-[14px] px-[11px] py-[8px] leading-[1.55]"
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.88)",
                      background: "rgba(10,16,30,0.55)",
                      textShadow: "none",
                    }}
                  >
                    {lotParcel.sanko
                      ? "この筆の形は、市町村の地番参考図から作ったものです。登記所の地図とは違うことがあります。公図・地積測量図で確かめてください。"
                      : `この筆の位置は、公図（任意座標）を道路の縁に合わせて推定したものです（確かさ：${lotParcel.estimated === "high" ? "高め" : "低め"}）。数mずれることがあります。公図・地積測量図で確かめてください。`}
                  </p>
                </div>
              </Expand>
            ) : undefined
          }
          onBack={onBack}
          backLabel={backLabel}
          favorite={favorite}
          onFavorite={onFavorite}
          onShare={share}
          named={named}
          topRef={topRef}
          textRef={textRef}
        />
        <p
          className="pv-credit pointer-events-none absolute bottom-[10px] right-[12px] max-w-[300px] text-right leading-[1.35]"
          style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.62)",
            textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          }}
        >
          {credit.map((c) => (
            <span key={c} className="block">
              {c}
            </span>
          ))}
        </p>
      </div>

      {/* すりガラスのシート（タブの切り替えと中身） */}
      <div
        ref={sheetRef}
        className="pv-sheet relative"
        style={{ minHeight: Math.max(0, (screenH ?? 760) - 56) }}
      >
        <div aria-hidden className="flex h-[18px] items-center justify-center">
          <span className="h-[5px] w-[38px] rounded-full bg-white/30" />
        </div>
        {/* タブの切り替えは、見出しが流れても上のバーの下に留まる */}
        <div
          className="sticky-tabs pv-tabs sticky z-[15] pb-[4px]"
          style={{ top: 56 }}
        >
          <TabSegments tab={tab} onTab={changeTab} />
        </div>
        <Banner
          dark
          loading={loading && !offline}
          error={error ?? (offline ? OFFLINE : null)}
          notice={
            notice ?? (shareCopy.done ? "共有の文をコピーしました" : null)
          }
          onDismiss={onDismiss}
        />
        <PlaceNote
          query={query}
          result={result}
          data={data}
          onPick={onPick}
          onFix={onFix}
        />
        <div
          key={tab}
          className="pv-pane px-[14px] pt-[10px]"
          style={{ paddingBottom: BAR_PAD + 18 }}
        >
          {tab === "basic" && <BasicTab {...props} />}
          {tab === "road" && <RoadTab {...props} />}
          {tab === "law" && <LawTab {...props} />}
          {tab === "hazard" && <HazardTab {...props} />}
          {tab === "around" && <AroundTab {...props} />}
          {tab === "price" && <PriceTab {...props} />}
        </div>
      </div>
      {barSlot &&
        createPortal(
          <ActionBar
            primary={primary}
            secondary={secondary}
            hidden={barHidden || typing}
            dim={scrolling}
          />,
          barSlot,
        )}

      <Portal>
        <DetailSheet
          kind={detail?.kind ?? null}
          arg={detail?.arg}
          onClose={() => setDetail(null)}
          result={result}
          data={data}
          expand={(o) => setFull(o ?? {})}
          pick={pick}
          statuses={statuses}
          onRecord={(t) => {
            setDetail(null);
            setRecordTopic(t);
          }}
        />
        <RecordSheet
          open={!!recordTopic}
          topic={recordTopic}
          pid={pid}
          label={title}
          records={records}
          status={statuses.find((s) => s.topic === recordTopic)}
          onClose={() => setRecordTopic(null)}
          onChange={setRecords}
        />
        <MapAppsSheet
          result={result}
          open={mapApps}
          onClose={() => setMapApps(false)}
          onMichilu={() => setFull({})}
          onFix={onFix}
        />
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
          onCopy={() => reportCopy.copy(summaryText())}
          copied={reportCopy.done}
          preview={summaryText()}
          off={off}
          onToggle={(k) =>
            setOff((cur) => {
              const next = new Set(cur);
              if (next.has(k)) next.delete(k);
              else next.add(k);
              return next;
            })
          }
        />
        {full && (
          <FullMap
            result={result}
            withRoads={full.roads}
            hazard={full.hazard}
            landPrice={full.landPrice}
            parcels={full.parcels}
            pick={
              data.parcels.status === "ok"
                ? { ...pick, base: data.parcels.parcel.kuiki }
                : undefined
            }
            onClose={() => setFull(null)}
            onPick={(lat, lng) => onPickPoint(lat, lng)}
          />
        )}
      </Portal>
      <TriageSheet
        result={result}
        triage={data.triage}
        open={triage}
        onClose={() => setTriage(false)}
      />
      <DraftSheet
        result={result}
        input={input}
        open={draft}
        onClose={() => setDraft(false)}
      />
      <GuideMapSheet
        result={result}
        open={guide}
        onClose={() => setGuide(false)}
      />
      <PrintSheet
        result={result}
        zoning={data.zoning}
        parcels={data.parcels}
        roads={data.roads}
        hazard={data.hazard}
        building={data.building}
        landPrice={data.landPrice5}
        schools={data.schools}
        stations={data.stations}
        pois={data.pois}
        triage={data.triage}
        records={records}
      />
    </div>
  );
}

/** 地番の候補などの小さなボタン（注意の中） */
function MiniButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="press rounded-full bg-white px-[9px] py-[5px] font-semibold leading-none shadow-[0_1px_3px_rgba(20,45,85,0.1)]"
      style={{ fontSize: 12.5, color: "#133664" }}
    >
      {children}
    </button>
  );
}

/**
 * 物件の場所の確かさで注意がいるとき（番地まで一致しない・地番が見つからない・住所の地点が道路の筆・地図で選んだ地点で筆が無い）
 * だけ出す。地番で探した筆・地図で選んだ地点の筆は、基本情報の「地番」の札に書く（1画面に収めるため）
 */
function PlaceNote({
  query,
  result,
  data,
  onPick,
  onFix,
}: {
  query: string;
  result: Ok;
  data: PropertyData;
  onPick: (address: string) => void;
  onFix: () => void;
}) {
  const { approximate, picked, parcel, parcelMiss } = result;
  let text: ReactNode = null;
  let short: ReactNode = null;
  let warn = false;
  // 住所で調べた地点が、道路・水路の筆か隣地のとても多い筆（地番の付いた公道など）の上。番地が地番の地域なら
  // （住居表示の「号」まで合った地点でなければ）地番で探し直せるようにする
  const off =
    !picked && !parcel && !approximate
      ? addressOffLot(data.parcels)
      : undefined;
  const chibanArea = !/号$/.test(result.matchedAddress);
  const onRoad = !!off && (off === "large" || chibanArea);
  const asChiban = chibanArea
    ? chibanQueryOf(query, /丁目/.test(result.town))
    : undefined;
  if (parcelMiss) {
    warn = true;
    short =
      parcelMiss.reason === "not_found"
        ? `地番 ${parcelMiss.chiban} は見つかりません`
        : parcelMiss.reason === "no_map"
          ? "地番の地図データがない地域です"
          : "地番の地図を読み込めませんでした";
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
              <MiniButton
                key={c}
                onClick={() => onPick(`地番 ${result.matchedAddress}${c}`)}
              >
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
    text =
      "番地が見つからず、町の中心を表示しています。地番・建物は、場所を直すと出ます。";
  } else if (onRoad) {
    warn = true;
    short =
      off === "large" && data.parcels.status === "ok"
        ? `住所の地点が道路などの筆の可能性（地番 ${registryChiban(data.parcels.parcel.chibanRaw)}）`
        : `住所の地点が${off}の筆の上です`;
    text = (
      <>
        {off === "large" && data.parcels.status === "ok"
          ? `住所の地点の筆（地番 ${registryChiban(data.parcels.parcel.chibanRaw)}）は隣地が${registryNeighbors(data.parcels).length}筆あり、道路など物件の外の土地の可能性があります。${chibanArea ? "番地が地番の地域なら、地番で探すと土地（筆）が出ます。" : "「場所を直す」で建物の位置を選ぶと、物件の土地の地番・面積が出ます。"}`
          : `住所の地点が${off}の上です。番地が地番の地域なら、地番で探すと土地（筆）が出ます。`}
        {asChiban && (
          <span className="mt-[5px] flex">
            <MiniButton onClick={() => onPick(asChiban)}>
              「{asChiban}」で探す
            </MiniButton>
          </span>
        )}
      </>
    );
  } else if (
    !picked &&
    !parcel &&
    partialMatch(query, result.matchedAddress)
  ) {
    // 号などが住所のデータに無く、その手前（番まで）の代表の地点を出しているとき
    const matched = displayAddress(result.matchedAddress);
    short = `住所は「${matched}」までの一致です`;
    text = `入力した住所の最後の番号（号など）は国土地理院の住所のデータに無いため、「${matched}」の代表の地点を出しています。建物の位置と違うときは「場所を直す」で直してください。`;
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
