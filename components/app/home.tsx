"use client";

// スマホのホーム（検索する前の画面）。届いたデザインのとおり、画面いっぱいの夕焼けの街の写真（public/home/sunset-*.webp。届いた背景の絵。
// 下のメニューの後ろまで敷くので、写真は components/app/mobile-app.tsx が HomeBackdrop で画面の一番奥に置く）の上に、上から：
// ロゴ（今までのマークと MICHILU の白い版）と右上のメニュー（≡。お知らせ・使い方・データ・アプリ・アカウント。HomeMenu）、
// 「不動産の現場に、／すぐ使える情報を。」、住所・地番の検索欄（すりガラス。キーボードの「検索」か、字を入れると出る → で調べる）、
// 写真の街並みを見せる空き、最近の検索（暗いすりガラスの一覧に3件。続きは履歴のページ）。
// まだ何も調べていないときは、最近の検索の代わりに「はじめての方へ」（住所と地番の例。押すとそのまま調べる）を出す。
// 写真の上の字は白（読みやすいよう薄い影）。寸法は幅393ptの値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）。
// 縦は画面の高さに合わせ、検索欄と最近の検索のあいだの空きで伸び縮みする（背の低い画面でもスクロールせずに収まる）
import { ArrowRight, Bell, ChevronRight, CircleHelp, Database, Download, LoaderCircle, MapPin, MapPinned, Menu, Search, Smartphone, TriangleAlert, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { monthDay, placeParts } from "@/lib/app/scene";
import { MUNICIPALITIES } from "@/lib/roadmap";
import { historyKey, type HistoryItem } from "@/lib/history";
import type { Resume } from "@/lib/resume";
import { Sheet } from "../sheet";
import { PhoneImg, ScaledInput } from "./frame";
import { TABS } from "./result-head";
import { PAGE } from "./tokens";

/** 時刻・電池の帯の色（下のメニューのページで、空の変数 --sky-top が入る前の値。app/layout.tsx の themeColor と同じ） */
export const SKY = "#e6eff9";
/** ホームの時刻・電池の帯の色（写真のいちばん上の空の色） */
export const HOME_TOP = "#386fab";
export { PAGE };

/** 写真の上の字が明るい空や建物に重なっても読めるよう、薄い影を付ける */
const SHADOW = "0 1px 3px rgba(0,0,0,0.35), 0 0 12px rgba(0,0,0,0.18)";
/** 写真の上の字が建物に重なっても読めるよう、にじませる（下のメニューのページの帯。昼は白、夜は紺。空の変数 --sky-halo） */
export const GLOW = "0 0 10px rgba(var(--sky-halo, 255,255,255),0.95), 0 0 3px rgba(var(--sky-halo, 255,255,255),0.95)";
/** 地の奥の淡い光（下のメニューのページで使う） */
export const AURORA =
  "radial-gradient(60% 42% at 0% 45%, rgba(110,140,255,0.13) 0%, rgba(110,140,255,0) 100%), radial-gradient(55% 38% at 100% 58%, rgba(40,190,255,0.12) 0%, rgba(40,190,255,0) 100%)";

/** 明るいすりガラス（検索欄・右上のメニュー） */
const LIGHT_GLASS: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.14) 100%)",
  border: "1px solid rgba(255,255,255,0.42)",
  boxShadow: "0 10px 30px rgba(10,20,40,0.22), inset 0 1px 0 rgba(255,255,255,0.35)",
  backdropFilter: "blur(18px) saturate(140%)",
  WebkitBackdropFilter: "blur(18px) saturate(140%)",
};
/** 暗いすりガラス（最近の検索の一覧・注意） */
const DARK_GLASS: CSSProperties = {
  background: "linear-gradient(180deg, rgba(40,44,54,0.52) 0%, rgba(28,32,42,0.58) 100%)",
  border: "1px solid rgba(255,255,255,0.16)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)",
  backdropFilter: "blur(22px) saturate(140%)",
  WebkitBackdropFilter: "blur(22px) saturate(140%)",
};
const SUB = "rgba(255,255,255,0.72)";

/** 最近の検索に出す数 */
const RECENT = 3;
/** まだ何も調べていないときの例（押すとそのまま調べる） */
const EXAMPLES: { Icon: typeof Search; title: string; sub: string; query: string }[] = [
  { Icon: Search, title: "住所で調べる", sub: "例：渋谷区神南1-19-11", query: "渋谷区神南1-19-11" },
  { Icon: MapPinned, title: "地番で調べる", sub: "例：松戸市古ヶ崎四丁目3556-1", query: "松戸市古ヶ崎四丁目3556-1" },
];

/** 検索欄の下に出す注意（空のまま調べた・通信できない） */
export type HomeMessage = { text: string } | null;

/** 現れるときの動きの遅れ（上から順に） */
const rise = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });
/** 浮き上がる動きは開いた最初の1回だけ（下のメニューで戻ったときは短いフェード） */
let risen = false;

/**
 * 画面いっぱいの写真（下のメニューの後ろまで敷く）。上と下を少し暗くして、白い字とメニューを読みやすくする。
 * 写真は届いた絵（3764×6684）を幅 900・1260・1620 に縮めた 3 枚から、画面に合う大きさを端末が選ぶ（1620 で Pro Max の画面と同じ細かさ）。
 * 縦長の画面では高さに合わせて左右を切るので、写真の幅は画面の高さの 56.3%（絵の縦横比）
 */
export function HomeBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: "#2a3a55" }}>
      <PhoneImg
        src="/home/sunset-1260.webp"
        srcSet="/home/sunset-900.webp 900w, /home/sunset-1260.webp 1260w, /home/sunset-1620.webp 1620w"
        sizes="(min-aspect-ratio: 9/16) 100vw, 56.3vh"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "62% 50%" }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,18,40,0.30) 0%, rgba(8,18,40,0) 26%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.30) 100%)" }} />
    </div>
  );
}

/** 画面の高さ（pt。拡大・縮小の前の値）。スクロールする箱の高さを拡大率で割る */
function useScreenHeight(root: RefObject<HTMLElement | null>): number | undefined {
  const [h, setH] = useState<number>();
  useEffect(() => {
    const box = root.current?.closest<HTMLElement>("[data-scroller]");
    if (!box) return;
    const measure = () => {
      const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-zoom")) || 1;
      setH(box.clientHeight / zoom);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [root]);
  return h;
}

/** 最近の検索の2行目（「地番：3556-1」「番地：1-19-11」）。番地や地番が無いものは調べた日 */
function secondLine(h: HistoryItem): string {
  const { city, town, full, chiban } = placeParts(h);
  if (h.ll) return `地図で選んだ場所・${monthDay(h.at)}`;
  const tail = city && full.startsWith(city) ? full.slice(city.length).trim() : full;
  const num = town && tail.startsWith(town) ? tail.slice(town.length).trim() : "";
  if (num) return `${chiban ? "地番" : "番地"}：${num}`;
  return `${monthDay(h.at)}に調べました`;
}

export function HomeScreen({
  input,
  setInput,
  onSubmit,
  loading,
  message,
  onDismiss,
  history,
  onPickRecent,
  onHistory,
  onTry,
  onMenu,
  unread,
  inputRef,
  resume,
}: {
  input: string;
  setInput: (v: string) => void;
  /** 調べる（キーボードの「検索」か、検索欄の →） */
  onSubmit: () => void;
  loading: boolean;
  message: HomeMessage;
  onDismiss: () => void;
  history: HistoryItem[];
  onPickRecent: (h: HistoryItem) => void;
  onHistory: () => void;
  /** 「はじめての方へ」の例をそのまま調べる */
  onTry: (address: string) => void;
  /** 右上のメニュー（≡） */
  onMenu: () => void;
  /** まだ見ていないお知らせがある（≡ に印） */
  unread: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  /** 直近7日に見ていた物件（最近の検索のその行に「続きから」と、見ていたタブを添える。開くとそのタブから） */
  resume?: Resume;
}) {
  const recent = history.slice(0, RECENT);
  const root = useRef<HTMLDivElement>(null);
  const screen = useScreenHeight(root);
  // 最初の1回かは、このマウントの間は変えない（履歴の読み込みなどで描き直しても、動きの途中で切り替わらない）
  const [first] = useState(() => !risen);
  useEffect(() => {
    risen = true;
  }, []);
  const riseClass = first ? "home-rise" : "";

  return (
    <div ref={root} className={`app-touch relative flex flex-col text-white ${first ? "" : "page-in"}`} style={{ minHeight: screen }}>
      {/* ロゴと右上のメニュー */}
      <div className="relative flex items-start justify-between" style={{ padding: "16px 18px 0 20px" }}>
        <PhoneImg src="/home/logo-mark-white.webp" alt="MICHILU" width={802} height={159} draggable={false} className={`${riseClass} block`} style={{ height: 30, width: "auto", marginTop: 6, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
        <button onClick={onMenu} aria-label={unread ? "メニュー（新しいお知らせがあります）" : "メニュー"} className="press relative flex items-center justify-center rounded-full" style={{ ...LIGHT_GLASS, width: 46, height: 46 }}>
          <Menu size={22} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
          {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 2, top: 2, width: 11, height: 11 }} />}
        </button>
      </div>

      {/* ひとこと */}
      <p className={`${riseClass} relative font-medium`} style={{ margin: "14px 0 0 20px", fontSize: 15.5, lineHeight: "25px", letterSpacing: 1.6, textShadow: SHADOW, ...rise(60) }}>
        不動産の現場に、
        <br />
        すぐ使える情報を。
      </p>

      {/* 住所・地番の検索欄（すりガラス） */}
      {/* 浮き上がる動きは、すりガラスの箱そのものに付ける（外の箱が動くと、後ろがぼけない） */}
      <form
        role="search"
        className="relative"
        style={{ margin: "74px 19px 0" }}
        onSubmit={(e) => {
          e.preventDefault();
          // スマホは調べたらキーボードを閉じる（開いたままだと結果の下半分が隠れる）
          inputRef.current?.blur();
          onSubmit();
        }}
      >
        <div className={`${riseClass} flex items-center rounded-full transition-[box-shadow] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.28)]`} style={{ ...LIGHT_GLASS, height: 56, ...rise(100) }}>
          <Search size={22} strokeWidth={1.9} absoluteStrokeWidth color="#fff" className="ml-[20px] shrink-0" />
          <ScaledInput value={input} onChange={setInput} inputRef={inputRef} size={17} className="ml-[13px] mr-[4px]" label="住所・地番" autoComplete="off" placeholder="住所・地番で検索" onPhoto />
          {loading ? (
            <span className="mr-[16px] flex shrink-0 items-center gap-[6px]" style={{ fontSize: 13 }}>
              <LoaderCircle size={18} strokeWidth={2} absoluteStrokeWidth className="animate-spin" />
              調べています
            </span>
          ) : (
            input && (
              <>
                <button type="button" onClick={() => setInput("")} aria-label="入力を消す" className="flex h-[44px] w-[34px] shrink-0 items-center justify-center">
                  <span className="flex items-center justify-center rounded-full bg-white/25" style={{ width: 20, height: 20 }}>
                    <X size={12} strokeWidth={2.4} absoluteStrokeWidth color="#fff" />
                  </span>
                </button>
                <button type="submit" aria-label="調べる" className="press mr-[7px] flex shrink-0 items-center justify-center rounded-full bg-white" style={{ width: 42, height: 42 }}>
                  <ArrowRight size={20} strokeWidth={2.2} absoluteStrokeWidth color="#1b3f73" />
                </button>
              </>
            )
          )}
        </div>
        {message && (
          <button type="button" onClick={onDismiss} className="mt-[10px] flex w-full items-start gap-[8px] rounded-[16px] px-[14px] py-[10px] text-left leading-[1.55]" style={{ ...DARK_GLASS, fontSize: 13 }}>
            <TriangleAlert size={15} strokeWidth={1.9} absoluteStrokeWidth color="#ffcf8a" className="mt-[2px] shrink-0" />
            {message.text}
          </button>
        )}
      </form>

      {/* 写真の街並みを見せる空き（画面の高さに合わせて伸び縮み） */}
      <div className="min-h-[28px] flex-1" />

      {/* 最近の検索（暗いすりガラスの一覧に3件）。まだ何も調べていないときは「はじめての方へ」 */}
      <section className="relative" style={{ padding: "0 19px 22px" }}>
        {recent.length ? (
          <>
            <SectionHead title="最近の検索" onMore={onHistory} className={riseClass} />
            <ul className={`${riseClass} overflow-hidden rounded-[22px]`} style={{ ...DARK_GLASS, ...rise(160) }}>
              {recent.map((h) => {
                const { city, town, full } = placeParts(h);
                const resumed = resume && historyKey(h) === resume.historyKey;
                return (
                  <li key={historyKey(h)} className="border-t border-white/[0.12] first:border-t-0">
                    <Row
                      Icon={Search}
                      title={city && town ? `${city}${town}` : full}
                      sub={
                        <>
                          {secondLine(h)}
                          {resumed && <span className="ml-[6px] font-semibold text-[#8cc8ff]">続きから：{TABS.find((t) => t.key === resume.tab)?.long ?? "基本情報"}</span>}
                        </>
                      }
                      label={`${full}を開く`}
                      onClick={() => onPickRecent(h)}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <SectionHead title="はじめての方へ" className={riseClass} />
            <ul className={`${riseClass} overflow-hidden rounded-[22px]`} style={{ ...DARK_GLASS, ...rise(160) }}>
              {EXAMPLES.map((x) => (
                <li key={x.query} className="border-t border-white/[0.12] first:border-t-0">
                  <Row Icon={x.Icon} title={x.title} sub={x.sub} label={`${x.title}（${x.sub}）`} onClick={() => onTry(x.query)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/** 一覧の1行（左に虫めがね、2行の字、右に ›） */
function Row({ Icon, title, sub, label, onClick }: { Icon: typeof Search; title: string; sub: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex min-h-[57px] w-full items-center gap-[14px] py-[9px] pl-[20px] pr-[16px] text-left active:bg-white/10">
      <Icon size={21} strokeWidth={1.8} absoluteStrokeWidth color="rgba(255,255,255,0.9)" className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 16 }}>
          {title}
        </span>
        <span className="mt-[3px] block truncate leading-[1.3]" style={{ fontSize: 13.5, color: SUB }}>
          {sub}
        </span>
      </span>
      <ChevronRight size={20} strokeWidth={2} absoluteStrokeWidth color="rgba(255,255,255,0.85)" className="shrink-0" />
    </button>
  );
}

/** 章の見出し（白い太字）と「すべて見る ›」（押せる高さは44pt） */
function SectionHead({ title, onMore, className = "" }: { title: string; onMore?: () => void; className?: string }) {
  return (
    <div className={`${className} flex h-[36px] items-center justify-between`} style={{ marginBottom: 6, ...rise(140) }}>
      <h2 className="whitespace-nowrap font-bold leading-none" style={{ fontSize: 18.5, letterSpacing: 0.5, textShadow: SHADOW }}>
        {title}
      </h2>
      {onMore && (
        <button onClick={onMore} className="-mr-[8px] flex h-[44px] shrink-0 items-center gap-[2px] px-[8px] active:opacity-60" style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", textShadow: SHADOW }}>
          すべて見る
          <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth />
        </button>
      )}
    </div>
  );
}

/** ホームの右上のメニュー（≡）。下のメニューに入れていない、ときどき使うもの（お知らせ・使い方・データ・アプリ・アカウント） */
export function HomeMenu({
  open,
  onClose,
  onNews,
  unread,
  onHelp,
  onCities,
  onSources,
  onStorage,
  onInstall,
  standalone,
  onMore,
}: {
  open: boolean;
  onClose: () => void;
  onNews: () => void;
  unread: boolean;
  onHelp: () => void;
  /** 対応している市区町村 */
  onCities: () => void;
  /** データの出典と時点 */
  onSources: () => void;
  /** 調査記録の書き出し・読み込み */
  onStorage: () => void;
  /** ホーム画面に追加 */
  onInstall: () => void;
  standalone: boolean;
  /** アカウント・その他のページ */
  onMore: () => void;
}) {
  if (!open) return null;
  const groups: { title: string; items: { Icon: typeof Search; title: string; sub: string; dot?: boolean; right?: string; run: () => void }[] }[] = [
    {
      title: "お知らせ・使い方",
      items: [
        { Icon: Bell, title: "お知らせ", sub: "新しい機能・データの更新", dot: unread, right: unread ? "新着" : undefined, run: onNews },
        { Icon: CircleHelp, title: "使い方", sub: "住所・地番・地図で調べて、市の地図を開くまで", run: onHelp },
      ],
    },
    {
      title: "データ",
      items: [
        { Icon: MapPin, title: "対応している市区町村", sub: "関東1都6県", right: String(MUNICIPALITIES.length), run: onCities },
        { Icon: Database, title: "データの出典と時点", sub: "国・自治体の公開データ", run: onSources },
        { Icon: Download, title: "調査記録の書き出し・読み込み", sub: "機種変更・データ消失への備え", run: onStorage },
      ],
    },
    {
      title: "アプリ",
      items: [
        { Icon: Smartphone, title: "ホーム画面に追加", sub: standalone ? "追加したアプリで開いています" : "ブラウザの枠なしで、アプリのように使う", right: standalone ? "追加済み" : undefined, run: onInstall },
        { Icon: UserRound, title: "アカウント・その他", sub: "ログイン・会社での共有（準備中）、件数", run: onMore },
      ],
    },
  ];
  return (
    <div className="theme-navy">
      <Sheet title="メニュー" open onClose={onClose}>
        {groups.map((g, gi) => (
          <section key={g.title} className={gi ? "mt-3" : ""}>
            <h3 className="text-[12px] font-semibold text-muted">{g.title}</h3>
            <ul className="divide-y divide-line">
              {g.items.map((it) => (
                <li key={it.title}>
                  <button
                    onClick={() => {
                      onClose();
                      it.run();
                    }}
                    className="flex w-full items-center gap-3 py-3 text-left active:bg-mint/50"
                  >
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-brand">
                      <it.Icon className="h-[18px] w-[18px]" />
                      {it.dot && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#f0263a]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold text-ink">{it.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-[1.5] text-muted">{it.sub}</span>
                    </span>
                    {it.right && <span className={`shrink-0 text-[12px] font-semibold ${it.dot ? "text-[#c0391b]" : "text-muted"}`}>{it.right}</span>}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Sheet>
    </div>
  );
}
