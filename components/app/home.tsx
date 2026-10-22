"use client";

// スマホの新しいホーム（検索する前の画面）。届いた絵（街の写真・写真入りの「調査を開始する」・調査メニューの3Dアイコン）を使い、
// iPhone 16 Pro などの画面でスクロールせずに1画面に収まるように組んだもの。
// 上から：街の写真の上にロゴ・お知らせ・見出し、調べるカード（住所も地番も1つの欄に入れる。地図で選ぶボタンつき）、
// 最近の検索（町の写真つきのカードを横にすべらせる）、調査メニュー（6つ）。文字はゴシック1種類（本文と同じ Noto Sans JP）。
// 調べるカードはすりガラス（後ろの街の写真をぼかして見せる）。現れるときの動きとボタンの光は app/globals.css の .home-rise・.home-shine。
// 寸法は幅393ptの値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）。幅に対して背の低い画面（iPhone SE など）では、
// low:（app/globals.css）で見出し・カード・調査メニューを少し詰めて1画面に収める
import { ArrowRight, Bell, ChevronRight, Info, LoaderCircle, Map as MapIcon, Search, TriangleAlert, X } from "lucide-react";
import type { CSSProperties, RefObject } from "react";
import { monthDay, placeholderScenes, placeParts, SCENES, sceneSrc, type SceneKey } from "@/lib/app/scene";
import { historyKey, type HistoryItem } from "@/lib/history";
import { ART_W, LogoLockup, PhoneImg, ScaledInput } from "./frame";
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

/** 写真の部分の高さ。調べるカードはこの下の方に重ねる（カードの上端は 158pt。背の低い画面は 134pt。カードの -mt） */
const PHOTO_H = 240;
/** 街の写真の幅（右に寄せる。元の写真は 1672×941） */
const PHOTO_W = 432;

/** 写真の上の文字が建物に重なっても読めるよう、白くにじませる（届いた写真の見出しと同じ効き方） */
const GLOW = "0 0 10px rgba(255,255,255,0.95), 0 0 3px rgba(255,255,255,0.95)";
/** すりガラス（後ろをぼかして白く透かす。縁は白く光らせる） */
const GLASS: CSSProperties = {
  background: "rgba(255,255,255,0.62)",
  backdropFilter: "blur(18px) saturate(1.6)",
  WebkitBackdropFilter: "blur(18px) saturate(1.6)",
  border: "1px solid rgba(255,255,255,0.85)",
};
/** 入力欄の縁の細い光（青・紫・水色） */
const FIELD_EDGE = "linear-gradient(#fff,#fff) padding-box, linear-gradient(120deg,#b4cbfb 0%,#cbbcfa 50%,#a6def9 100%) border-box";
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

/** 最近の検索がまだ無いときに見せる町の写真 */
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
  onBell,
  unread,
  onCities,
  onLogo,
  cityCount,
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
  onBell: () => void;
  unread: boolean;
  onCities: () => void;
  onLogo: () => void;
  cityCount: number;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const recent = history.slice(0, 10);
  const scenes = placeholderScenes(recent);

  return (
    <div className="app-touch relative overflow-hidden" style={{ background: PAGE }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: 280, background: AURORA }} />

      {/* 街の写真の部分（上端は時刻・電池の帯の色からつなぐ） */}
      <div className="relative overflow-hidden" style={{ height: PHOTO_H }}>
        <PhoneImg src="/home/hero.webp" alt="" draggable={false} className="absolute max-w-none" style={{ width: PHOTO_W, height: (PHOTO_W * 941) / 1672, left: ART_W - PHOTO_W, top: -6 }} />
        <div className="absolute inset-x-0 top-0" style={{ height: 56, background: `linear-gradient(180deg,${SKY} 0%,rgba(230,239,249,0) 100%)` }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(247,250,253,0.9) 0%,rgba(247,250,253,0.72) 30%,rgba(247,250,253,0.2) 50%,rgba(247,250,253,0) 60%)" }} />
        <div className="absolute inset-x-0 bottom-0" style={{ height: 84, background: `linear-gradient(180deg,rgba(243,246,251,0) 0%,${PAGE} 92%)` }} />

        <button onClick={onLogo} aria-label="MICHILU ホーム" className="absolute flex items-center" style={{ left: 16, top: 6, height: 44 }}>
          <LogoLockup style={{ height: 30 }} />
        </button>
        <button onClick={onBell} aria-label={unread ? "お知らせ（新しいお知らせがあります）" : "お知らせ"} className="absolute flex items-center justify-center active:opacity-70" style={{ right: 8, top: 6, width: 44, height: 44 }}>
          <span className="flex items-center justify-center rounded-full shadow-[0_4px_14px_rgba(15,47,95,0.14)]" style={{ ...GLASS, width: 38, height: 38 }}>
            <Bell size={19} strokeWidth={1.7} absoluteStrokeWidth color={HEAD} />
          </span>
          {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 6, top: 6, width: 11, height: 11 }} />}
        </button>

        <h1
          className="home-rise absolute top-[54px] whitespace-nowrap text-[27px] font-bold leading-[35px] low:top-[50px] low:text-[23px] low:leading-[29px]"
          style={{ left: 16, letterSpacing: 0.6, color: HEAD, textShadow: GLOW, fontFeatureSettings: '"palt"' }}
        >
          調べる時間を、
          <br />
          商談の時間に。
        </h1>
        <p
          className="home-rise absolute top-[131px] whitespace-nowrap text-[12.5px] font-medium leading-none low:top-[113px] low:text-[11.5px]"
          style={{ left: 17, letterSpacing: 0.6, color: "#2b3954", textShadow: GLOW, fontFeatureSettings: '"palt"', ...rise(60) }}
        >
          不動産調査を、もっと早く、もっとシンプルに。
        </p>
      </div>

      {/* 調べる（すりガラスのカード。住所も地番もこの欄に入れる） */}
      <div className="home-rise relative mx-[16px] -mt-[82px] rounded-[22px] p-[12px] shadow-[0_14px_34px_rgba(20,48,95,0.13)] low:-mt-[106px] low:p-[10px]" style={{ ...GLASS, ...rise(100) }}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            // スマホは調べたらキーボードを閉じる（開いたままだと結果の下半分が隠れる）
            inputRef.current?.blur();
            onSubmit();
          }}
        >
          <div
            className="flex h-[52px] items-center rounded-[15px] border border-transparent transition-shadow focus-within:shadow-[0_0_0_3px_rgba(61,123,255,0.16),0_8px_22px_rgba(61,123,255,0.18)] low:h-[48px]"
            style={{ background: FIELD_EDGE }}
          >
            <Search size={19} strokeWidth={1.9} absoluteStrokeWidth color={NAVY} className="ml-[14px] shrink-0" />
            <ScaledInput value={input} onChange={setInput} inputRef={inputRef} size={16} className="ml-[10px] mr-[2px]" label="住所・地番" autoComplete="off" placeholder="住所・地番を入力" />
            {input && (
              <button type="button" onClick={() => setInput("")} aria-label="入力を消す" className="flex h-[40px] w-[34px] shrink-0 items-center justify-center">
                <span className="flex items-center justify-center rounded-full bg-[#dfe4ec]" style={{ width: 22, height: 22 }}>
                  <X size={13} strokeWidth={2.2} absoluteStrokeWidth color="#4d586d" />
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onMap}
              aria-label="地図で場所を選ぶ"
              className="mr-[6px] flex h-[38px] shrink-0 items-center gap-[4px] rounded-[11px] bg-[#edf2fb] px-[10px] font-bold leading-none active:bg-[#e1e9f7]"
              style={{ fontSize: 13, color: NAVY }}
            >
              <MapIcon size={16} strokeWidth={1.9} absoluteStrokeWidth />
              地図
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="home-shine relative mt-[10px] block h-[56px] w-full overflow-hidden rounded-[16px] text-white shadow-[0_10px_22px_rgba(15,47,95,0.28)] transition-transform active:scale-[0.985] disabled:opacity-95 low:mt-[8px] low:h-[50px]"
          >
            <PhoneImg src="/home/cta.webp" alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-y-0 left-0 flex items-center justify-center gap-[8px] whitespace-nowrap font-bold" style={{ width: "62%", fontSize: 17, letterSpacing: 2 }}>
              {loading ? (
                <>
                  <LoaderCircle size={19} strokeWidth={2} absoluteStrokeWidth className="animate-spin" />
                  調べています…
                </>
              ) : (
                <>
                  調査を開始する
                  <ArrowRight size={19} strokeWidth={2} absoluteStrokeWidth />
                </>
              )}
            </span>
          </button>
        </form>

        {message && (
          <button type="button" onClick={onDismiss} className="mt-[10px] flex w-full items-start gap-[7px] rounded-[12px] px-[12px] py-[9px] text-left leading-[1.5]" style={{ fontSize: 12.5, background: message.warn ? "#fdf1ec" : "#eef4fb", color: message.warn ? "#8a4f3a" : "#1c3a6a" }}>
            {message.warn ? <TriangleAlert size={15} strokeWidth={1.8} absoluteStrokeWidth className="mt-[2px] shrink-0" /> : <Info size={15} strokeWidth={1.8} absoluteStrokeWidth className="mt-[2px] shrink-0" />}
            {message.text}
          </button>
        )}
      </div>

      {/* 最近の検索（町の写真つきのカードを横にすべらせる） */}
      <section className="home-rise relative mt-[12px] low:mt-[10px]" style={rise(160)}>
        <SectionHead title="最近の検索" note="写真は町のイメージ" onMore={history.length ? onHistory : undefined} />
        {recent.length ? (
          <ul className="no-scrollbar mt-[4px] flex snap-x snap-mandatory scroll-pl-[16px] gap-[10px] overflow-x-auto px-[16px] pb-[8px]">
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
                    <span className="relative block h-[68px] low:h-[54px]">
                      <PhoneImg src={sceneSrc(scene)} alt="" loading="lazy" draggable={false} className="block h-full w-full object-cover" style={{ objectPosition: `50% ${SCENES[scene].y}%` }} />
                      {kind && (
                        <span className="absolute rounded-full bg-white/85 px-[7px] py-[4px] font-bold leading-none backdrop-blur" style={{ left: 6, top: 6, fontSize: 10.5, color: NAVY }}>
                          {kind}
                        </span>
                      )}
                    </span>
                    <span className="block px-[10px] pb-[10px] pt-[7px] low:pb-[8px] low:pt-[6px]">
                      <span className="block truncate font-bold leading-[1.3]" style={{ fontSize: 14, color: TEXT, fontFeatureSettings: '"palt"' }}>
                        {town || full}
                      </span>
                      <span className="mt-[3px] block truncate leading-[1.3]" style={{ fontSize: 11.5, color: LIGHT }}>
                        {city || "対応エリアの外"}・{monthDay(h.at)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <FirstRun cityCount={cityCount} onCities={onCities} />
        )}
      </section>

      {/* 調査メニュー（届いた絵の3Dアイコン） */}
      <section className="home-rise relative mt-[6px] pb-[8px] low:mt-[4px]" style={rise(220)}>
        <SectionHead title="調査メニュー" onMore={onMenuAll} />
        <div className="mt-[4px] grid grid-cols-2 gap-[8px] px-[16px] low:gap-[6px]">
          {MENU.map((m) => (
            <button
              key={m.title}
              onClick={() => onMenu(m.tab, m.title)}
              className="flex h-[52px] min-w-0 items-center rounded-[16px] border border-white bg-white text-left shadow-[0_4px_14px_rgba(20,45,85,0.07)] transition-transform active:scale-[0.97] low:h-[46px]"
            >
              <PhoneImg src={`/home/menu/${m.icon}.webp`} alt="" draggable={false} className="ml-[3px] block size-[46px] shrink-0 low:size-[42px]" />
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
    </div>
  );
}

/** カードの見出し（左に青い印）と「すべて見る ›」（押せる高さは44pt） */
function SectionHead({ title, note, onMore }: { title: string; note?: string; onMore?: () => void }) {
  return (
    <div className="flex h-[30px] items-center justify-between px-[16px] low:h-[28px]">
      <div className="flex min-w-0 items-center gap-[7px]">
        <span aria-hidden className="shrink-0 rounded-full" style={{ width: 3.5, height: 15, background: ACCENT }} />
        <h2 className="whitespace-nowrap font-bold leading-none" style={{ fontSize: 17, color: HEAD, letterSpacing: 0.3 }}>
          {title}
        </h2>
        {note && (
          <span className="truncate leading-none" style={{ fontSize: 11, color: LIGHT }}>
            {note}
          </span>
        )}
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

/** 最近の検索がまだ無いとき（初めて開いたとき）：ここに町の写真つきで並ぶことと、対応エリア */
function FirstRun({ cityCount, onCities }: { cityCount: number; onCities: () => void }) {
  return (
    <div className="mx-[16px] mb-[8px] mt-[4px] rounded-[16px] bg-white p-[10px] shadow-[0_4px_14px_rgba(20,45,85,0.08)]">
      <div className="grid grid-cols-3 gap-[6px]">
        {SAMPLE.map((k) => (
          <PhoneImg key={k} src={sceneSrc(k)} alt="" loading="lazy" draggable={false} className="block h-[50px] w-full rounded-[10px] object-cover low:h-[38px]" style={{ objectPosition: `50% ${SCENES[k].y}%` }} />
        ))}
      </div>
      <p className="mt-[8px] px-[2px] font-bold leading-[1.3]" style={{ fontSize: 14, color: TEXT }}>
        まだ調べた物件はありません
      </p>
      <div className="mt-[2px] flex items-center justify-between px-[2px]">
        <p className="min-w-0 truncate leading-[1.3]" style={{ fontSize: 12, color: LIGHT }}>
          調べると、町の写真つきで並びます
        </p>
        <button onClick={onCities} className="-my-[12px] flex h-[40px] shrink-0 items-center font-semibold active:opacity-60" style={{ fontSize: 12, color: LINK }}>
          {cityCount}市区町村に対応
          <ChevronRight size={14} strokeWidth={2} absoluteStrokeWidth />
        </button>
      </div>
    </div>
  );
}
