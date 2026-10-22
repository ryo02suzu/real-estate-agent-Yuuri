"use client";

// スマホの新しいホーム（検索する前の画面）。新しいUIの絵の部品と並びを、iPhone のアプリと同じ文字の大きさで組んだもの。
// 上から：街の写真の上にロゴ・お知らせ・見出し（ここだけ明朝）、調べるカード（住所・地番・地図の切り替え・入力欄・調査を開始する）、
// 最近の検索（町の写真つきのカードを横にすべらせる）、調査メニュー（6つ）、書類を作るバナー。最初の1画面は「調べる」と
// 「最近の検索」で、調査メニューとバナーは下にスクロールして見る。文字は 本文・入力16〜17pt、カードの名前15pt、説明12〜13pt、
// いちばん小さい字11pt。押せる所は高さ44pt前後。寸法は幅393ptの値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）
import { ArrowRight, Bell, ChevronRight, House, Info, LoaderCircle, LocateFixed, Map as MapIcon, MapPinned, Search, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { placeholderScenes, placeParts, SCENES, sceneSrc, stamp } from "@/lib/app/scene";
import { historyKey, type HistoryItem } from "@/lib/history";
import { serif } from "./fonts";
import { ART_W, LogoLockup, PhoneImg, ScaledInput } from "./frame";
import { HazardArt, HouseTreeArt, LayersArt, PinFill, RoadArt, ShieldFill, TownArt, YenArt } from "./home-art";
import type { TabKey } from "./property-head";
import { NAVY } from "./ui";

/** 時刻・電池の帯の色（app/layout.tsx の themeColor と同じ）。写真の上端をこの色からつなぐ */
export const SKY = "#e6eff9";
/** 画面の地の色 */
export const PAGE = "#f3f6fb";
const HEAD = "#0f1b33";
const TEXT = "#162033";
const GRAY = "#5d6880";
const LIGHT = "#6b778a";
const LINK = "#1f5fbf";
/** いちばん大事なボタンと、選んだ切り替えの紺 */
const NAVY_FILL = "linear-gradient(135deg,#2a5da6 0%,#163e7b 55%,#0c2a5a 100%)";

/** 写真の部分の高さと、検索のカードの上端（写真の下の方に重ねる） */
const PHOTO_H = 214;
const CARD_TOP = 182;
/** 街の写真の幅（右に寄せる。元の写真は 1672×941） */
const PHOTO_W = 432;

export type SearchMode = "address" | "chiban" | "map";

const MODES: { key: SearchMode; label: string; Icon: LucideIcon }[] = [
  { key: "address", label: "住所から検索", Icon: House },
  { key: "chiban", label: "地番から検索", Icon: MapPinned },
  { key: "map", label: "地図から選択", Icon: MapIcon },
];

/** 地番の欄では「地番 」を前に付けて調べる（入力欄には出さない） */
const CHIBAN = /^\s*地番\s*/;
export const modeOf = (input: string): SearchMode => (CHIBAN.test(input) ? "chiban" : "address");

const MENU: { tab: TabKey; title: string; sub: string; art: ReactNode; bg: string }[] = [
  { tab: "law", title: "道路", sub: "接道・種別・幅員", art: <RoadArt size={28} />, bg: "linear-gradient(150deg,#f1f6ff 0%,#dce7fd 100%)" },
  { tab: "law", title: "法令・都市計画", sub: "用途地域・建ぺい率", art: <LayersArt size={28} />, bg: "linear-gradient(150deg,#f7f3ff 0%,#e7defc 100%)" },
  { tab: "hazard", title: "ハザード", sub: "洪水・土砂・高潮", art: <HazardArt size={28} />, bg: "linear-gradient(150deg,#effafe 0%,#d6effa 100%)" },
  { tab: "basic", title: "土地・建物", sub: "地番・筆・建物", art: <HouseTreeArt size={28} />, bg: "linear-gradient(150deg,#effbf3 0%,#d7f1e0 100%)" },
  { tab: "price", title: "価格", sub: "公示地価・路線価", art: <YenArt size={28} />, bg: "linear-gradient(150deg,#fff8ee 0%,#fde6c8 100%)" },
  { tab: "around", title: "周辺環境", sub: "駅・学校・施設", art: <TownArt size={28} />, bg: "linear-gradient(150deg,#fff3f6 0%,#fcdde6 100%)" },
];

/** 写真の上の文字が建物に重なっても読めるよう、白くにじませる（届いた写真の見出しと同じ効き方） */
const GLOW = "0 0 10px rgba(255,255,255,0.95), 0 0 3px rgba(255,255,255,0.95)";

export type HomeMessage = { text: string; warn: boolean } | null;

export function HomeScreen({
  input,
  setInput,
  mode,
  onMode,
  onSubmit,
  loading,
  locating,
  message,
  onDismiss,
  history,
  onPickRecent,
  onHistory,
  onMap,
  onHere,
  onMenu,
  onMenuAll,
  onDocs,
  onBell,
  unread,
  onCities,
  onSources,
  onLogo,
  areaText,
  cityCount,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  mode: SearchMode;
  onMode: (m: SearchMode) => void;
  /** 「調査を開始する」（住所・地番の欄。地図の欄では onMap を呼ぶ） */
  onSubmit: () => void;
  loading: boolean;
  locating: boolean;
  message: HomeMessage;
  onDismiss: () => void;
  history: HistoryItem[];
  onPickRecent: (h: HistoryItem) => void;
  onHistory: () => void;
  onMap: () => void;
  onHere: () => void;
  /** 調査メニュー（調べたら、そのタブから開く） */
  onMenu: (tab: TabKey, title: string) => void;
  onMenuAll: () => void;
  onDocs: () => void;
  onBell: () => void;
  unread: boolean;
  onCities: () => void;
  onSources: () => void;
  onLogo: () => void;
  /** 「関東1都6県」 */
  areaText: string;
  cityCount: number;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const recent = history.slice(0, 10);
  const scenes = placeholderScenes(recent);
  // 地番の欄では、入力欄に「地番 」を出さない（調べるときに前に付ける）
  const shown = mode === "chiban" ? input.replace(CHIBAN, "") : input;
  const change = (v: string) => setInput(mode === "chiban" && v.trim() ? `地番 ${v.replace(CHIBAN, "")}` : v);

  return (
    <div className={`${serif.variable} app-touch`} style={{ background: PAGE }}>
      {/* 街の写真の部分（上端は時刻・電池の帯の色からつなぐ） */}
      <div className="relative overflow-hidden" style={{ height: PHOTO_H }}>
        <PhoneImg src="/home/hero.webp" alt="" draggable={false} className="absolute max-w-none" style={{ width: PHOTO_W, height: (PHOTO_W * 941) / 1672, left: ART_W - PHOTO_W, top: -4 }} />
        <div className="absolute inset-x-0 top-0" style={{ height: 64, background: `linear-gradient(180deg,${SKY} 0%,rgba(230,239,249,0) 100%)` }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(247,250,253,0.94) 0%,rgba(247,250,253,0.82) 32%,rgba(247,250,253,0.25) 56%,rgba(247,250,253,0) 68%)" }} />
        <div className="absolute inset-x-0 bottom-0" style={{ height: 76, background: `linear-gradient(180deg,rgba(243,246,251,0) 0%,${PAGE} 90%)` }} />

        <button onClick={onLogo} aria-label="MICHILU ホーム" className="absolute flex items-center" style={{ left: 16, top: 8, height: 44 }}>
          <LogoLockup style={{ height: 31 }} />
        </button>
        <button onClick={onBell} aria-label={unread ? "お知らせ（新しいお知らせがあります）" : "お知らせ"} className="absolute flex items-center justify-center active:opacity-70" style={{ right: 8, top: 8, width: 44, height: 44 }}>
          <span className="flex items-center justify-center rounded-full bg-white/90 shadow-[0_3px_12px_rgba(15,47,95,0.14)]" style={{ width: 38, height: 38 }}>
            <Bell size={19} strokeWidth={1.7} absoluteStrokeWidth color={HEAD} />
          </span>
          {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 6, top: 6, width: 11, height: 11 }} />}
        </button>

        <h1 className="home-serif absolute whitespace-nowrap" style={{ left: 16, top: 62, fontSize: 27, lineHeight: "36px", letterSpacing: 0.5, color: HEAD, textShadow: GLOW }}>
          調べる時間を、
          <br />
          商談の時間に。
        </h1>
        <p className="absolute whitespace-nowrap leading-none" style={{ left: 17, top: 144, fontSize: 13, letterSpacing: 0.2, color: "#26324a", fontFeatureSettings: '"palt"', textShadow: GLOW }}>
          不動産調査を、もっと早く、もっとシンプルに。
        </p>
      </div>

      {/* 調べる */}
      <div className="relative mx-[16px] rounded-[18px] bg-white p-[14px] shadow-[0_10px_30px_rgba(20,48,95,0.10)]" style={{ marginTop: CARD_TOP - PHOTO_H }}>
        <div role="tablist" aria-label="調べ方" className="grid grid-cols-3 gap-[6px]">
          {MODES.map(({ key, label, Icon }) => {
            const on = mode === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                onClick={() => onMode(key)}
                className={`flex h-[40px] min-w-0 items-center justify-center gap-[4px] rounded-[11px] font-bold leading-none transition-colors ${on ? "text-white" : "bg-[#f0f3f8] text-[#2b3a55] active:bg-[#e6ebf3]"}`}
                style={{ fontSize: 12.5, fontFeatureSettings: '"palt"', ...(on ? { background: NAVY_FILL, boxShadow: "0 4px 10px rgba(15,47,95,0.28)" } : {}) }}
              >
                <Icon size={15} strokeWidth={1.8} absoluteStrokeWidth className="shrink-0" />
                {label}
              </button>
            );
          })}
        </div>

        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "map") return onMap();
            // スマホは調べたらキーボードを閉じる（開いたままだと結果の下半分が隠れる）
            inputRef.current?.blur();
            onSubmit();
          }}
        >
          {mode === "map" ? (
            <div className="mt-[12px] flex items-center gap-[10px] rounded-[12px] bg-[#f3f6fa] py-[8px] pl-[14px] pr-[8px]" style={{ minHeight: 52 }}>
              <MapIcon size={20} strokeWidth={1.7} absoluteStrokeWidth color={NAVY} className="shrink-0" />
              <span className="min-w-0 flex-1 leading-[1.45]" style={{ fontSize: 13, color: GRAY }}>
                地図で場所を選んで調べます。
                <br />
                住所の無い土地も選べます。
              </span>
              <button
                type="button"
                onClick={onHere}
                disabled={locating}
                className="flex h-[38px] shrink-0 items-center gap-[4px] rounded-full bg-white px-[12px] font-bold leading-none shadow-[0_1px_5px_rgba(20,45,85,0.14)] active:bg-[#eef3fa] disabled:opacity-70"
                style={{ fontSize: 13, color: NAVY }}
              >
                <LocateFixed size={15} strokeWidth={1.8} absoluteStrokeWidth />
                {locating ? "確認中…" : "現在地"}
              </button>
            </div>
          ) : (
            <div className="mt-[12px] flex h-[50px] items-center rounded-[12px] border border-[#dde4ee] bg-[#f7f9fc] transition-colors focus-within:border-[#7f9ccc] focus-within:bg-white">
              <Search size={19} strokeWidth={1.8} absoluteStrokeWidth color={GRAY} className="ml-[14px] shrink-0" />
              <ScaledInput
                value={shown}
                onChange={change}
                inputRef={inputRef}
                size={16}
                className="ml-[10px] mr-[4px]"
                label={mode === "chiban" ? "地番" : "住所"}
                autoComplete={mode === "chiban" ? "off" : "street-address"}
                placeholder={mode === "chiban" ? "例：松戸市古ヶ崎四丁目3556-1" : "例：世田谷区上野毛3丁目1-2"}
              />
              {shown && (
                <button type="button" onClick={() => setInput("")} aria-label="入力を消す" className="mr-[6px] flex h-[40px] w-[40px] shrink-0 items-center justify-center">
                  <span className="flex items-center justify-center rounded-full bg-[#dfe4ec]" style={{ width: 22, height: 22 }}>
                    <X size={13} strokeWidth={2.2} absoluteStrokeWidth color="#4d586d" />
                  </span>
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-[12px] flex h-[52px] w-full items-center justify-center gap-[8px] rounded-[14px] font-bold text-white shadow-[0_8px_18px_rgba(15,47,95,0.28)] transition-transform active:scale-[0.985] disabled:opacity-90"
            style={{ background: NAVY_FILL, fontSize: 17, letterSpacing: 1.2 }}
          >
            {loading ? (
              <>
                <LoaderCircle size={19} strokeWidth={2} absoluteStrokeWidth className="animate-spin" />
                調べています…
              </>
            ) : (
              <>
                {mode === "map" ? "地図を開いて選ぶ" : "調査を開始する"}
                <ArrowRight size={19} strokeWidth={2} absoluteStrokeWidth />
              </>
            )}
          </button>
        </form>

        {message && (
          <button type="button" onClick={onDismiss} className="mt-[10px] flex w-full items-start gap-[7px] rounded-[11px] px-[12px] py-[10px] text-left leading-[1.55]" style={{ fontSize: 13, background: message.warn ? "#fdf1ec" : "#eef4fb", color: message.warn ? "#8a4f3a" : "#1c3a6a" }}>
            {message.warn ? <TriangleAlert size={16} strokeWidth={1.8} absoluteStrokeWidth className="mt-[1px] shrink-0" /> : <Info size={16} strokeWidth={1.8} absoluteStrokeWidth className="mt-[1px] shrink-0" />}
            {message.text}
          </button>
        )}
      </div>

      {/* 最近の検索（町の写真つきのカードを横にすべらせる） */}
      <section className="mt-[22px]">
        <SectionHead title="最近の検索" onMore={history.length ? onHistory : undefined} />
        {recent.length ? (
          <>
            <ul className="no-scrollbar mt-[6px] flex snap-x snap-mandatory scroll-pl-[16px] gap-[12px] overflow-x-auto px-[16px] pb-[10px] pt-[2px]">
              {recent.map((h, i) => {
                const { city, town, full, chiban } = placeParts(h);
                const scene = scenes[i];
                const kind = chiban ? "・地番" : h.ll ? "・地図" : "";
                return (
                  <li key={historyKey(h)} className="shrink-0 snap-start" style={{ width: 150 }}>
                    <button
                      onClick={() => onPickRecent(h)}
                      aria-label={`${full}（${stamp(h.at)}${kind}）を開く`}
                      className="block w-full overflow-hidden rounded-[16px] bg-white text-left shadow-[0_4px_14px_rgba(20,45,85,0.11)] transition-transform active:scale-[0.97]"
                    >
                      <PhoneImg src={sceneSrc(scene)} alt="" loading="lazy" draggable={false} className="block w-full object-cover" style={{ height: 96, objectPosition: `50% ${SCENES[scene].y}%` }} />
                      <span className="block px-[12px] pb-[12px] pt-[9px]">
                        <span className="block truncate leading-[1.3]" style={{ fontSize: 12, color: LIGHT }}>
                          {city || "対応エリアの外"}
                        </span>
                        <span className="mt-[1px] block truncate font-bold leading-[1.3]" style={{ fontSize: 15, color: TEXT, fontFeatureSettings: '"palt"' }}>
                          {town || full}
                        </span>
                        <span className="mt-[5px] block truncate leading-none" style={{ fontSize: 12, color: LIGHT }}>
                          {stamp(h.at)}
                          {kind}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="px-[16px] leading-[1.4]" style={{ fontSize: 11, color: "#8a95a6" }}>
              写真は町のようすのイメージです（物件の写真ではありません）
            </p>
          </>
        ) : (
          <FirstRun areaText={areaText} cityCount={cityCount} onCities={onCities} onSources={onSources} />
        )}
      </section>

      {/* 調査メニュー */}
      <section className="mt-[26px]">
        <SectionHead title="調査メニュー" onMore={onMenuAll} />
        <div className="mt-[6px] grid grid-cols-3 gap-[10px] px-[16px]">
          {MENU.map((m) => (
            <button
              key={m.title}
              onClick={() => onMenu(m.tab, m.title)}
              className="flex min-w-0 flex-col items-center rounded-[16px] bg-white px-[4px] pb-[12px] pt-[14px] shadow-[0_4px_14px_rgba(20,45,85,0.08)] transition-transform active:scale-[0.96]"
            >
              <span className="flex items-center justify-center rounded-[14px]" style={{ width: 48, height: 48, background: m.bg }}>
                {m.art}
              </span>
              <span className="mt-[8px] whitespace-nowrap font-bold leading-none" style={{ fontSize: 14, color: TEXT, fontFeatureSettings: '"palt"' }}>
                {m.title}
              </span>
              <span className="mt-[5px] whitespace-nowrap leading-none" style={{ fontSize: 11, color: LIGHT, fontFeatureSettings: '"palt"' }}>
                {m.sub}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 書類を作る（写真の書類の左の空いた所に文字を置く） */}
      <button onClick={onDocs} className="relative mx-[16px] mb-[24px] mt-[26px] block overflow-hidden rounded-[16px] text-left shadow-[0_6px_20px_rgba(60,40,20,0.09)] transition-transform active:scale-[0.985]" style={{ width: ART_W - 32, height: 86 }}>
        <PhoneImg src="/home/docs.webp" alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "0% 50%" }} />
        <span className="absolute top-1/2 -translate-y-1/2" style={{ left: 16 }}>
          <span className="block whitespace-nowrap font-bold leading-none" style={{ fontSize: 16, color: "#0f2a5c", fontFeatureSettings: '"palt"' }}>
            調査結果から書類を作成
          </span>
          <span className="mt-[7px] block whitespace-nowrap leading-none" style={{ fontSize: 13, color: "#4b5568", fontFeatureSettings: '"palt"' }}>
            調査メモ・重説下書き・案内図
          </span>
        </span>
        <span className="absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-[#3c4a64]/85 text-white" style={{ right: 12, width: 34, height: 34 }}>
          <ChevronRight size={19} strokeWidth={2} absoluteStrokeWidth />
        </span>
      </button>
    </div>
  );
}

/** カードの見出しと「すべて見る ›」（押せる高さは44pt） */
function SectionHead({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <div className="flex h-[44px] items-center justify-between px-[16px]">
      <h2 className="font-bold leading-none" style={{ fontSize: 20, color: HEAD, letterSpacing: 0.3 }}>
        {title}
      </h2>
      {onMore && (
        <button onClick={onMore} className="-mr-[8px] flex h-[44px] items-center gap-[1px] px-[8px] font-semibold active:opacity-60" style={{ fontSize: 14, color: LINK }}>
          すべて見る
          <ChevronRight size={16} strokeWidth={2} absoluteStrokeWidth />
        </button>
      )}
    </div>
  );
}

/** 最近の検索がまだ無いとき（初めて開いたとき）：何が並ぶかと、MICHILU の強みの3つ */
function FirstRun({ areaText, cityCount, onCities, onSources }: { areaText: string; cityCount: number; onCities: () => void; onSources: () => void }) {
  const rows: { icon: ReactNode; title: string; sub: string; onClick: () => void }[] = [
    { icon: <PinFill size={18} color={NAVY} />, title: `${areaText}に対応`, sub: `${cityCount}市区町村の道路の地図と窓口`, onClick: onCities },
    { icon: <DocOutline />, title: `道路図 ${cityCount}市区町村`, sub: "物件の場所で、役所の地図を開く", onClick: onCities },
    { icon: <ShieldFill size={18} color={NAVY} />, title: "公式情報に直結", sub: "国・自治体の公開データだけを使う", onClick: onSources },
  ];
  return (
    <div className="mx-[16px] mt-[6px] overflow-hidden rounded-[16px] bg-white shadow-[0_4px_14px_rgba(20,45,85,0.08)]">
      <div className="px-[16px] pb-[12px] pt-[14px]">
        <p className="font-bold leading-[1.35]" style={{ fontSize: 15, color: TEXT }}>
          まだ調べた物件はありません
        </p>
        <p className="mt-[4px] leading-[1.55]" style={{ fontSize: 13, color: GRAY }}>
          住所や地番を入れて調べると、ここに町の写真つきで並びます。この端末の中だけに保存します。
        </p>
      </div>
      {rows.map((r) => (
        <button key={r.title} onClick={r.onClick} className="flex w-full items-center gap-[12px] border-t border-[#eef2f6] px-[16px] py-[11px] text-left active:bg-[#f5f8fc]">
          <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 36, height: 36 }}>
            {r.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold leading-[1.3]" style={{ fontSize: 15, color: TEXT }}>
              {r.title}
            </span>
            <span className="mt-[2px] block leading-[1.4]" style={{ fontSize: 12, color: LIGHT }}>
              {r.sub}
            </span>
          </span>
          <ChevronRight size={17} strokeWidth={1.8} absoluteStrokeWidth color="#9aa5b6" className="shrink-0" />
        </button>
      ))}
    </div>
  );
}

/** 書類の線の印（強みの「道路図」） */
function DocOutline() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden fill="none" stroke={NAVY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
      <path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h7" />
    </svg>
  );
}
