"use client";

// スマホの新しいホーム（検索する前の画面）。届いた絵をそのまま使い、iPhone 16 Pro などの画面でスクロールせずに1画面に収まるように組んだもの。
// 上から：街の写真（見出し「調べる時間を、商談の時間に。」は写真に入っている明朝の字。副題は同じゴシックでアプリが描く）の上にロゴ・お知らせ、
// 調べるカード（住所も地番も1つの欄に入れる。地図で選ぶボタンつき。写真入りの「調査を開始する」）、最近の検索（写真つきのカードを横に
// すべらせる）、調査メニュー（届いた絵の3Dアイコン・6つ）、書類を作るバナー（届いた絵。押すと書類・出力のページ）。
// 字は写真の見出しに合わせて、章の見出し（最近の検索・調査メニュー）だけ同じ明朝（components/app/fonts.ts）。ほかは本文のゴシック。
// 調べるカードはすりガラス（後ろの街の写真をぼかして見せる）。現れるときの動きとボタンの光は app/globals.css の .home-rise・.home-shine。
// 寸法は幅393ptの値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）。幅に対して背の低い画面（iPhone SE など）では、
// low:（app/globals.css）でカード・調査メニュー・バナーを少し詰める（それでも入りきらない分はスクロール）
import { ArrowRight, Bell, ChevronRight, Info, LoaderCircle, Map as MapIcon, Search, TriangleAlert, X } from "lucide-react";
import type { CSSProperties, RefObject } from "react";
import { monthDay, placeholderScenes, placeParts, SCENES, sceneSrc, type SceneKey } from "@/lib/app/scene";
import { historyKey, type HistoryItem } from "@/lib/history";
import { serif } from "./fonts";
import { LogoLockup, PhoneImg, ScaledInput } from "./frame";
import type { TabKey } from "./property-head";
import { NAVY } from "./ui";

/** 時刻・電池の帯の色（app/layout.tsx の themeColor と同じ）。写真の上端をこの色からつなぐ */
export const SKY = "#e6eff9";
/** 画面の地の色 */
export const PAGE = "#f3f6fb";
const HEAD = "#0f1b33";
const TEXT = "#162033";
const LIGHT = "#66728a";
const LINK = "#1f5fbf";
/** 見出しの左の印（近未来の青） */
const ACCENT = "linear-gradient(180deg,#3d7bff 0%,#22c1ee 100%)";

/**
 * 写真の部分の高さ。写真（public/home/hero.webp）は届いた絵の 1672×941 から x125〜1380・y20〜786 を切り抜いたもので、幅393pt・高さ240pt
 * にぴったり合う（見出しの字は約25pt・上端は57pt）。調べるカードはこの下の方（158pt）に重ねる（カードの -mt）
 */
const PHOTO_H = 240;

/** 写真の上の字が建物に重なっても読めるよう、白くにじませる（写真の見出しと同じ効き方） */
const GLOW = "0 0 10px rgba(255,255,255,0.95), 0 0 3px rgba(255,255,255,0.95)";
/** すりガラス（後ろをぼかして白く透かす。縁は白く光らせる） */
const GLASS: CSSProperties = {
  background: "rgba(255,255,255,0.62)",
  backdropFilter: "blur(18px) saturate(1.6)",
  WebkitBackdropFilter: "blur(18px) saturate(1.6)",
  border: "1px solid rgba(255,255,255,0.85)",
};
/** 地の奥の淡い光（最近の検索から調査メニューのあたり。下の端に届く前に消える） */
const AURORA =
  "radial-gradient(60% 42% at 0% 45%, rgba(110,140,255,0.13) 0%, rgba(110,140,255,0) 100%), radial-gradient(55% 38% at 100% 58%, rgba(40,190,255,0.12) 0%, rgba(40,190,255,0) 100%)";

const MENU: { tab: TabKey; icon: string; title: string; sub: string }[] = [
  { tab: "law", icon: "road", title: "道路", sub: "接道・種別・幅員" },
  { tab: "law", icon: "law", title: "法令・都市計画", sub: "用途地域・建ぺい率" },
  { tab: "hazard", icon: "hazard", title: "ハザード", sub: "洪水・土砂・高潮" },
  { tab: "basic", icon: "land", title: "土地・建物", sub: "地番・筆形・建物" },
  { tab: "price", icon: "price", title: "価格", sub: "地価公示・路線価" },
  { tab: "around", icon: "around", title: "周辺環境", sub: "駅・学校・施設" },
];

/** 最近の検索がまだ無いときに見せる写真 */
const SAMPLE: SceneKey[] = ["suburb", "newtown", "urban"];

export type HomeMessage = { text: string; warn: boolean } | null;

/** 現れるときの動きの遅れ（上から順に） */
const rise = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

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
  onMap,
  onMenu,
  onMenuAll,
  onDocs,
  onBell,
  unread,
  onLogo,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  /** 「調査を開始する」 */
  onSubmit: () => void;
  loading: boolean;
  message: HomeMessage;
  onDismiss: () => void;
  history: HistoryItem[];
  onPickRecent: (h: HistoryItem) => void;
  onHistory: () => void;
  /** 地図で場所を選ぶ（住所の無い土地も選べる） */
  onMap: () => void;
  /** 調査メニュー（調べたら、そのタブから開く） */
  onMenu: (tab: TabKey, title: string) => void;
  onMenuAll: () => void;
  /** 書類を作るバナー（書類・出力のページ） */
  onDocs: () => void;
  onBell: () => void;
  unread: boolean;
  onLogo: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const recent = history.slice(0, 10);
  const scenes = placeholderScenes(recent);

  return (
    <div className={`${serif.variable} app-touch relative overflow-hidden`} style={{ background: PAGE }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: 280, background: AURORA }} />

      {/* 街の写真の部分（見出しは写真の字。上端は時刻・電池の帯の色からつなぐ） */}
      <div className="relative overflow-hidden" style={{ height: PHOTO_H }}>
        <PhoneImg src="/home/hero.webp" alt="" width={1255} height={766} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-x-0 top-0" style={{ height: 48, background: `linear-gradient(180deg,${SKY} 0%,rgba(230,239,249,0) 100%)` }} />
        <div className="absolute inset-x-0 bottom-0" style={{ height: 70, background: `linear-gradient(180deg,rgba(243,246,251,0) 0%,${PAGE} 92%)` }} />
        <h1 className="sr-only">調べる時間を、商談の時間に。</h1>

        <button onClick={onLogo} aria-label="MICHILU ホーム" className="absolute flex items-center" style={{ left: 16, top: 6, height: 44 }}>
          <LogoLockup style={{ height: 30 }} />
        </button>
        <button onClick={onBell} aria-label={unread ? "お知らせ（新しいお知らせがあります）" : "お知らせ"} className="absolute flex items-center justify-center active:opacity-70" style={{ right: 8, top: 6, width: 44, height: 44 }}>
          <span className="flex items-center justify-center rounded-full shadow-[0_4px_14px_rgba(15,47,95,0.14)]" style={{ ...GLASS, width: 38, height: 38 }}>
            <Bell size={19} strokeWidth={1.7} absoluteStrokeWidth color={HEAD} />
          </span>
          {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 6, top: 6, width: 11, height: 11 }} />}
        </button>

        {/* 副題（写真の中の字は消してある。写真のままだと8.5ptで小さいので、同じゴシックで描く） */}
        <p className="home-rise absolute whitespace-nowrap font-medium leading-none" style={{ left: 16, top: 125, fontSize: 12, letterSpacing: 0.9, color: "#26324a", textShadow: GLOW, fontFeatureSettings: '"palt"', ...rise(60) }}>
          不動産調査を、もっと早く、もっとシンプルに。
        </p>
      </div>

      {/* 調べる（すりガラスのカード。住所も地番もこの欄に入れる） */}
      <div className="home-rise relative mx-[16px] -mt-[82px] rounded-[22px] p-[10px] shadow-[0_14px_34px_rgba(20,48,95,0.13)] low:p-[8px]" style={{ ...GLASS, ...rise(100) }}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            // スマホは調べたらキーボードを閉じる（開いたままだと結果の下半分が隠れる）
            inputRef.current?.blur();
            onSubmit();
          }}
        >
          <div className="flex h-[44px] items-center rounded-full border border-[#d8e0eb] bg-white shadow-[inset_0_1px_2px_rgba(20,45,85,0.05)] transition-[border-color,box-shadow] focus-within:border-[#9db8e6] focus-within:shadow-[0_0_0_3px_rgba(61,123,255,0.12)]">
            <Search size={17} strokeWidth={1.8} absoluteStrokeWidth color="#7c8aa3" className="ml-[15px] shrink-0" />
            <ScaledInput value={input} onChange={setInput} inputRef={inputRef} size={15} className="ml-[9px] mr-[2px]" label="住所・地番" autoComplete="off" placeholder="住所・地番を入力" />
            {input && (
              <button type="button" onClick={() => setInput("")} aria-label="入力を消す" className="flex h-[40px] w-[32px] shrink-0 items-center justify-center">
                <span className="flex items-center justify-center rounded-full bg-[#e3e8f0]" style={{ width: 20, height: 20 }}>
                  <X size={12} strokeWidth={2.2} absoluteStrokeWidth color="#4d586d" />
                </span>
              </button>
            )}
            <span aria-hidden className="mx-[2px] h-[20px] w-px shrink-0 bg-[#e3e9f1]" />
            <button
              type="button"
              onClick={onMap}
              aria-label="地図で場所を選ぶ"
              className="mr-[3px] flex h-[38px] shrink-0 items-center gap-[4px] rounded-full px-[11px] font-semibold leading-none active:bg-[#eef3fa]"
              style={{ fontSize: 12.5, color: NAVY }}
            >
              <MapIcon size={15} strokeWidth={1.8} absoluteStrokeWidth />
              地図
            </button>
          </div>

          {/* 届いた写真入りのボタン（文字はアプリで描く） */}
          <button
            type="submit"
            disabled={loading}
            className="home-shine relative mt-[8px] block h-[48px] w-full overflow-hidden rounded-[14px] text-white shadow-[0_8px_20px_rgba(15,47,95,0.22)] transition-transform active:scale-[0.985] disabled:opacity-95 low:h-[44px]"
          >
            <PhoneImg src="/home/cta.webp" alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 45%" }} />
            <span className="absolute inset-y-0 left-0 flex items-center justify-center gap-[7px] whitespace-nowrap font-bold" style={{ width: "62%", fontSize: 16, letterSpacing: 1.8 }}>
              {loading ? (
                <>
                  <LoaderCircle size={18} strokeWidth={2} absoluteStrokeWidth className="animate-spin" />
                  調べています…
                </>
              ) : (
                <>
                  調査を開始する
                  <ArrowRight size={18} strokeWidth={2} absoluteStrokeWidth />
                </>
              )}
            </span>
          </button>
        </form>

        {message && (
          <button type="button" onClick={onDismiss} className="mt-[8px] flex w-full items-start gap-[7px] rounded-[12px] px-[12px] py-[9px] text-left leading-[1.5]" style={{ fontSize: 12.5, background: message.warn ? "#fdf1ec" : "#eef4fb", color: message.warn ? "#8a4f3a" : "#1c3a6a" }}>
            {message.warn ? <TriangleAlert size={15} strokeWidth={1.8} absoluteStrokeWidth className="mt-[2px] shrink-0" /> : <Info size={15} strokeWidth={1.8} absoluteStrokeWidth className="mt-[2px] shrink-0" />}
            {message.text}
          </button>
        )}
      </div>

      {/* 最近の検索（写真つきのカードを横にすべらせる） */}
      <section className="home-rise relative mt-[8px] low:mt-[6px]" style={rise(160)}>
        <SectionHead title="最近の検索" onMore={history.length ? onHistory : undefined} />
        {recent.length ? (
          <ul className="no-scrollbar mt-[2px] flex snap-x snap-mandatory scroll-pl-[16px] gap-[10px] overflow-x-auto px-[16px] pb-[4px] low:pb-[2px]">
            {recent.map((h, i) => {
              const { city, town, full, chiban } = placeParts(h);
              const scene = scenes[i];
              const kind = chiban ? "地番" : h.ll ? "地図" : "";
              return (
                <li key={historyKey(h)} className="shrink-0 snap-start" style={{ width: 138 }}>
                  <button
                    onClick={() => onPickRecent(h)}
                    aria-label={`${full}（${monthDay(h.at)}${kind ? `・${kind}` : ""}）を開く`}
                    className="block w-full overflow-hidden rounded-[16px] bg-white text-left shadow-[0_4px_14px_rgba(20,45,85,0.10)] transition-transform active:scale-[0.97]"
                  >
                    <span className="relative block h-[62px] low:h-[50px]">
                      <PhoneImg src={sceneSrc(scene)} alt="" loading="lazy" draggable={false} className="block h-full w-full object-cover" style={{ objectPosition: `50% ${SCENES[scene].y}%` }} />
                      {kind && (
                        <span className="absolute rounded-full bg-white/85 px-[7px] py-[4px] font-bold leading-none backdrop-blur" style={{ left: 6, top: 6, fontSize: 10.5, color: NAVY }}>
                          {kind}
                        </span>
                      )}
                    </span>
                    <span className="block px-[10px] pb-[9px] pt-[6px]">
                      <span className="block truncate font-bold leading-[1.3]" style={{ fontSize: 14, color: TEXT, fontFeatureSettings: '"palt"' }}>
                        {town || full}
                      </span>
                      <span className="mt-[2px] block truncate leading-[1.3]" style={{ fontSize: 11.5, color: LIGHT }}>
                        {city || "対応エリアの外"}・{monthDay(h.at)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <FirstRun />
        )}
      </section>

      {/* 調査メニュー（届いた絵の3Dアイコン） */}
      <section className="home-rise relative mt-[2px]" style={rise(220)}>
        <SectionHead title="調査メニュー" onMore={onMenuAll} />
        <div className="mt-[2px] grid grid-cols-2 gap-[7px] px-[16px] low:gap-[6px]">
          {MENU.map((m) => (
            <button
              key={m.title}
              onClick={() => onMenu(m.tab, m.title)}
              className="flex h-[48px] min-w-0 items-center rounded-[16px] border border-white bg-white text-left shadow-[0_4px_14px_rgba(20,45,85,0.07)] transition-transform active:scale-[0.97] low:h-[44px]"
            >
              <PhoneImg src={`/home/menu/${m.icon}.webp`} alt="" draggable={false} className="ml-[2px] block size-[44px] shrink-0 low:size-[40px]" />
              <span className="ml-[4px] min-w-0 flex-1">
                <span className="block whitespace-nowrap font-bold leading-[1.25]" style={{ fontSize: 14, color: TEXT, fontFeatureSettings: '"palt"' }}>
                  {m.title}
                </span>
                <span className="mt-[2px] block whitespace-nowrap leading-[1.3]" style={{ fontSize: 10.5, color: LIGHT, fontFeatureSettings: '"palt"' }}>
                  {m.sub}
                </span>
              </span>
              <ChevronRight size={14} strokeWidth={2} absoluteStrokeWidth color="#9aa5b6" className="mr-[7px] shrink-0" />
            </button>
          ))}
        </div>
      </section>

      {/* 書類を作る（届いた絵のバナー。写真の書類の左の空いた所に字を置く。押すと書類・出力のページ） */}
      <button
        onClick={onDocs}
        className="home-rise relative mx-[16px] mb-[10px] mt-[10px] block h-[62px] w-[calc(100%-32px)] overflow-hidden rounded-[16px] text-left shadow-[0_6px_20px_rgba(60,40,20,0.10)] transition-transform active:scale-[0.985] low:mb-[8px] low:mt-[8px] low:h-[56px]"
        style={rise(280)}
      >
        <PhoneImg src="/home/docs.webp" alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "0% 50%" }} />
        <span className="absolute top-1/2 -translate-y-1/2" style={{ left: 16 }}>
          <span className="block whitespace-nowrap font-bold leading-none" style={{ fontSize: 15, color: "#0f2a5c", fontFeatureSettings: '"palt"' }}>
            調査結果から書類を作成
          </span>
          <span className="mt-[6px] block whitespace-nowrap leading-none" style={{ fontSize: 11.5, color: "#4b5568", fontFeatureSettings: '"palt"' }}>
            調査メモ・重説下書き・案内図
          </span>
        </span>
        <span className="absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-[#3c4a64]/85 text-white" style={{ right: 10, width: 30, height: 30 }}>
          <ChevronRight size={17} strokeWidth={2} absoluteStrokeWidth />
        </span>
      </button>
    </div>
  );
}

/** 章の見出し（写真の見出しと同じ明朝。左に青い印）と「すべて見る ›」（押せる高さは44pt） */
function SectionHead({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <div className="flex h-[28px] items-center justify-between px-[16px] low:h-[26px]">
      <div className="flex min-w-0 items-center gap-[7px]">
        <span aria-hidden className="shrink-0 rounded-full" style={{ width: 3.5, height: 15, background: ACCENT }} />
        <h2 className="home-serif whitespace-nowrap font-bold leading-none" style={{ fontSize: 17, color: HEAD, letterSpacing: 0.5 }}>
          {title}
        </h2>
      </div>
      {onMore && (
        <button onClick={onMore} className="-mr-[8px] flex h-[44px] shrink-0 items-center gap-[1px] px-[8px] font-semibold active:opacity-60" style={{ fontSize: 13, color: LINK }}>
          すべて見る
          <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth />
        </button>
      )}
    </div>
  );
}

/** 最近の検索がまだ無いとき（初めて開いたとき） */
function FirstRun() {
  return (
    <div className="mx-[16px] mb-[4px] mt-[2px] rounded-[16px] bg-white p-[10px] shadow-[0_4px_14px_rgba(20,45,85,0.08)]">
      <div className="grid grid-cols-3 gap-[6px]">
        {SAMPLE.map((k) => (
          <PhoneImg key={k} src={sceneSrc(k)} alt="" loading="lazy" draggable={false} className="block h-[46px] w-full rounded-[10px] object-cover low:h-[36px]" style={{ objectPosition: `50% ${SCENES[k].y}%` }} />
        ))}
      </div>
      <p className="mt-[8px] px-[2px] font-bold leading-[1.3]" style={{ fontSize: 14, color: TEXT }}>
        まだ調べた物件はありません
      </p>
      <p className="mt-[2px] px-[2px] leading-[1.3]" style={{ fontSize: 12, color: LIGHT }}>
        住所か地番を入れて調べると、ここに並びます
      </p>
    </div>
  );
}
