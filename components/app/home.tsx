"use client";

// スマホの新しいホーム（検索する前の画面）。デザインの絵（新しいUI）の並びで、上から：街の写真の上にロゴ・お知らせ・見出し・強みの3つ、
// 白いカードに調べ方の切り替え（住所・地番・地図）・入力欄・「調査を開始する」、最近の検索（町の写真つき）、調査メニュー（6つ）、
// 書類を作るバナー。写真・ロゴ・ボタンの地・バナーの地は届いた素材から切り出したもの（public/home/。焼き込みの文字は消して、
// 文字はここで描く）。寸法は絵（幅393pt）から測った値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）
import { ArrowRight, Bell, ChevronRight, Clock3, House, Info, LoaderCircle, LocateFixed, Map as MapIcon, MapPinned, Search, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { placeholderScenes, placeTitle, SCENES, sceneSrc, stamp } from "@/lib/app/scene";
import { historyKey, type HistoryItem } from "@/lib/history";
import { serif } from "./fonts";
import { ART_W, LogoLockup, PhoneImg, ScaledInput } from "./frame";
import { HazardArt, HouseTreeArt, LayersArt, PinFill, RoadArt, ShieldFill, TownArt, YenArt } from "./home-art";
import type { TabKey } from "./property-head";
import { NAVY, SUB } from "./ui";

/** 画面の地の色 */
const PAGE = "#f3f6fb";
const HEAD = "#0f1b33";
const TEXT = "#141b2b";

/** 写真の部分の高さ（検索のカードが下の方に重なる） */
const HERO_H = 236;
/** 検索のカードの上端 */
const CARD_TOP = 195;
/** 街の写真の幅（右に寄せる。元の写真は 1672×941） */
const PHOTO_W = 430;

export type SearchMode = "address" | "chiban" | "map";

const MODES: { key: SearchMode; label: string; Icon: LucideIcon }[] = [
  { key: "address", label: "住所から検索", Icon: House },
  { key: "chiban", label: "地番から検索", Icon: MapPinned },
  { key: "map", label: "地図から選択", Icon: MapIcon },
];

/** 地番の欄では「地番 」を前に付けて調べる（入力欄には出さない） */
const CHIBAN = /^\s*地番\s*/;
export const modeOf = (input: string): SearchMode => (CHIBAN.test(input) ? "chiban" : "address");

const MENU: { tab: TabKey; title: string; sub: [string, string]; art: ReactNode; bg: string }[] = [
  { tab: "law", title: "道路", sub: ["接道・道路種別", "幅員など"], art: <RoadArt size={22} />, bg: "linear-gradient(150deg,#f1f6ff 0%,#dfe9fd 100%)" },
  { tab: "law", title: "法令・都市計画", sub: ["用途地域・建ぺい率", "容積率など"], art: <LayersArt size={22} />, bg: "linear-gradient(150deg,#f7f3ff 0%,#e9e1fc 100%)" },
  { tab: "hazard", title: "ハザード", sub: ["洪水・内水・高潮", "土砂災害など"], art: <HazardArt size={22} />, bg: "linear-gradient(150deg,#effafe 0%,#d9f0fa 100%)" },
  { tab: "basic", title: "土地・建物", sub: ["地番・筆形・", "建物情報など"], art: <HouseTreeArt size={22} />, bg: "linear-gradient(150deg,#effbf3 0%,#daf2e2 100%)" },
  { tab: "price", title: "価格", sub: ["地価公示・地価調査", "路線価など"], art: <YenArt size={22} />, bg: "linear-gradient(150deg,#fff8ee 0%,#fde8cc 100%)" },
  { tab: "around", title: "周辺環境", sub: ["駅・学校・施設", "生活利便性など"], art: <TownArt size={22} />, bg: "linear-gradient(150deg,#fff3f6 0%,#fde0e8 100%)" },
];

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
  const recent = history.slice(0, 3);
  const scenes = placeholderScenes(recent);
  // 地番の欄では、入力欄に「地番 」を出さない（調べるときに前に付ける）
  const shown = mode === "chiban" ? input.replace(CHIBAN, "") : input;
  const change = (v: string) => setInput(mode === "chiban" && v.trim() ? `地番 ${v.replace(CHIBAN, "")}` : v);

  return (
    <div className={serif.variable} style={{ background: PAGE }}>
      {/* 街の写真の部分 */}
      <div className="relative overflow-hidden" style={{ height: HERO_H }}>
        <PhoneImg src="/home/hero.webp" alt="" draggable={false} className="absolute max-w-none" style={{ width: PHOTO_W, height: (PHOTO_W * 941) / 1672, left: ART_W - PHOTO_W, top: 0 }} />
        {/* 左は見出しのために白くぼかし、下は地の色へ */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(248,250,253,0.95) 0%,rgba(248,250,253,0.84) 30%,rgba(248,250,253,0.32) 52%,rgba(248,250,253,0) 66%)" }} />
        <div className="absolute inset-x-0 bottom-0" style={{ height: 78, background: `linear-gradient(180deg,rgba(243,246,251,0) 0%,${PAGE} 88%)` }} />

        <button onClick={onLogo} aria-label="MICHILU ホーム" className="absolute" style={{ left: 18, top: 12, height: 30 }}>
          <LogoLockup style={{ height: 30 }} />
        </button>
        <button
          onClick={onBell}
          aria-label={unread ? "お知らせ（新しいお知らせがあります）" : "お知らせ"}
          className="absolute flex items-center justify-center rounded-full bg-white/[0.88] shadow-[0_3px_10px_rgba(15,47,95,0.12)] active:bg-white"
          style={{ left: 351, top: 13, width: 27, height: 27 }}
        >
          <Bell size={12.5} strokeWidth={1.35} absoluteStrokeWidth color={HEAD} />
          {unread && <span className="absolute rounded-full border border-white bg-[#f0263a]" style={{ right: 3.6, top: 3.4, width: 6.6, height: 6.6 }} />}
        </button>

        <h1 className="home-serif absolute whitespace-nowrap" style={{ left: 21, top: 59, fontSize: 26.5, lineHeight: "35px", letterSpacing: 0.6, color: HEAD }}>
          調べる時間を、
          <br />
          商談の時間に。
        </h1>
        <p className="absolute whitespace-nowrap leading-none" style={{ left: 22, top: 136, fontSize: 9.4, letterSpacing: 0.55, color: "#1f2a40" }}>
          不動産調査を、もっと早く、もっとシンプルに。
        </p>

        {/* 強みの3つ */}
        <div className="absolute flex gap-[6.5px]" style={{ left: 18, right: 14.5, top: 157 }}>
          <Badge icon={<PinFill size={11} color={NAVY} />} label={`${areaText}対応`} onClick={onCities} />
          <Badge icon={<DocOutline />} label={`道路図 ${cityCount}市区町村`} onClick={onCities} />
          <Badge icon={<ShieldFill size={11} color={NAVY} />} label="公式情報に直結" onClick={onSources} />
        </div>
      </div>

      {/* 調べる（切り替え・入力欄・調査を開始する） */}
      <div className="relative mx-[10px] rounded-[13px] bg-white px-[11px] pb-[11px] pt-[10px] shadow-[0_8px_24px_rgba(20,48,95,0.09)]" style={{ marginTop: CARD_TOP - HERO_H }}>
        <div role="tablist" aria-label="調べ方" className="flex gap-[5px]">
          {MODES.map(({ key, label, Icon }) => {
            const on = mode === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                onClick={() => onMode(key)}
                className="flex min-w-0 flex-1 items-center justify-center gap-[5px] rounded-[8px] leading-none"
                style={{
                  height: 30,
                  background: on ? "linear-gradient(135deg,#27599f 0%,#153c78 55%,#0c2a5a 100%)" : "#f1f4f9",
                  color: on ? "#fff" : "#1b2a44",
                  boxShadow: on ? "0 3px 9px rgba(15,47,95,0.28)" : undefined,
                  fontSize: 8.6,
                  fontWeight: on ? 700 : 600,
                }}
              >
                <Icon size={12} strokeWidth={1.4} absoluteStrokeWidth className="shrink-0" />
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
            <div className="mt-[10px] flex items-center gap-[7px] rounded-[9px] bg-[#f4f7fb] pl-[11px] pr-[6px]" style={{ height: 35 }}>
              <MapIcon size={13} strokeWidth={1.4} absoluteStrokeWidth color={NAVY} className="shrink-0" />
              <span className="min-w-0 flex-1 leading-[1.4]" style={{ fontSize: 7.6, color: SUB }}>
                地図で物件の場所を選んで調べます。住所の無い土地も選べます。
              </span>
              <button
                type="button"
                onClick={onHere}
                disabled={locating}
                className="flex shrink-0 items-center gap-[3px] rounded-full bg-white px-[8px] font-bold leading-none shadow-[0_1px_4px_rgba(20,45,85,0.12)] disabled:opacity-70"
                style={{ height: 23, fontSize: 7.6, color: NAVY }}
              >
                <LocateFixed size={10} strokeWidth={1.5} absoluteStrokeWidth />
                {locating ? "確認中…" : "現在地で調べる"}
              </button>
            </div>
          ) : (
            <div className="mt-[10px] flex items-center rounded-[9px] border border-[#e1e7ef] bg-white focus-within:border-[#9fb4d6]" style={{ height: 35 }}>
              <Search size={13.5} strokeWidth={1.4} absoluteStrokeWidth color="#5d6880" className="ml-[11px] shrink-0" />
              <ScaledInput
                value={shown}
                onChange={change}
                inputRef={inputRef}
                size={9.2}
                className="ml-[8px] mr-[4px]"
                label={mode === "chiban" ? "地番" : "住所"}
                autoComplete={mode === "chiban" ? "off" : "street-address"}
                placeholder={mode === "chiban" ? "地番を入力（例：松戸市古ヶ崎四丁目3556-1）" : "住所を入力（例：東京都世田谷区上野毛3丁目1-2）"}
              />
              {shown && (
                <button type="button" onClick={() => setInput("")} aria-label="入力を消す" className="mr-[9px] flex shrink-0 items-center justify-center rounded-full bg-[#eef1f5]" style={{ width: 17, height: 17 }}>
                  <X size={8.5} strokeWidth={1.3} absoluteStrokeWidth color="#5d6880" />
                </button>
              )}
            </div>
          )}

          <button type="submit" disabled={loading} className="relative mt-[9px] block w-full overflow-hidden rounded-[14px] text-white shadow-[0_6px_16px_rgba(12,40,90,0.25)] active:opacity-90" style={{ height: 46 }}>
            <PhoneImg src="/home/cta.webp" alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-y-0 left-0 flex items-center justify-center gap-[7px] whitespace-nowrap" style={{ width: "62%", fontSize: 14.5, letterSpacing: 1.6, fontWeight: 500 }}>
              {loading ? (
                <>
                  <LoaderCircle size={14} strokeWidth={1.6} absoluteStrokeWidth className="animate-spin" />
                  調べています…
                </>
              ) : (
                <>
                  {mode === "map" ? "地図を開いて選ぶ" : "調査を開始する"}
                  <ArrowRight size={14} strokeWidth={1.5} absoluteStrokeWidth />
                </>
              )}
            </span>
          </button>
        </form>

        {message && (
          <button type="button" onClick={onDismiss} className="mt-[8px] flex w-full items-start gap-[5px] rounded-[7px] px-[9px] py-[7px] text-left leading-[1.5]" style={{ fontSize: 7.4, background: message.warn ? "#fdf1ec" : "#eef4fb", color: message.warn ? "#8a4f3a" : "#1c3a6a" }}>
            {message.warn ? <TriangleAlert size={10} strokeWidth={1.6} absoluteStrokeWidth className="mt-[1px] shrink-0" /> : <Info size={10} strokeWidth={1.6} absoluteStrokeWidth className="mt-[1px] shrink-0" />}
            {message.text}
          </button>
        )}
      </div>

      {/* 最近の検索（町の写真つき） */}
      <section className="mx-[10px] mt-[10px] rounded-[13px] bg-white px-[11px] pb-[10px] pt-[12px] shadow-[0_6px_20px_rgba(20,48,95,0.06)]">
        <Head icon={<Clock3 size={13} strokeWidth={1.35} absoluteStrokeWidth color={HEAD} />} title="最近の検索" onMore={onHistory} />
        {recent.length ? (
          <>
            <ul className="mt-[10px] flex gap-[6.5px]">
              {recent.map((h, i) => {
                const { title, full, chiban } = placeTitle(h);
                const scene = scenes[i];
                const kind = chiban ? "・地番" : h.ll ? "・地図" : "";
                return (
                  <li key={historyKey(h)} className="min-w-0 shrink-0" style={{ width: 113.3 }}>
                    <button
                      onClick={() => onPickRecent(h)}
                      aria-label={`${full}（${stamp(h.at)}${kind}）を開く`}
                      className="block w-full overflow-hidden rounded-[8px] bg-white text-left shadow-[0_2px_9px_rgba(20,45,85,0.12)] active:opacity-80"
                    >
                      <PhoneImg src={sceneSrc(scene)} alt="" loading="lazy" draggable={false} className="block w-full object-cover" style={{ height: 45.5, objectPosition: `50% ${SCENES[scene].y}%` }} />
                      <span className="flex items-center gap-[2px] pb-[7px] pl-[7px] pr-[4px] pt-[6.5px]">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold leading-[1.25]" style={{ fontSize: 8.3, color: TEXT, fontFeatureSettings: '"palt"' }}>
                            {title}
                          </span>
                          <span className="mt-[3px] block truncate leading-none" style={{ fontSize: 6.9, color: SUB }}>
                            {stamp(h.at)}
                            {kind}
                          </span>
                        </span>
                        <ChevronRight size={8.5} strokeWidth={1.4} absoluteStrokeWidth color="#2a3550" className="shrink-0" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-[6px] leading-none" style={{ fontSize: 6.2, color: "#8a95a6" }}>
              写真は町のようすのイメージです（物件の写真ではありません）
            </p>
          </>
        ) : (
          <p className="mt-[9px] pb-[2px] leading-[1.6]" style={{ fontSize: 7.4, color: SUB }}>
            まだありません。上の欄で調べると、ここに町の写真つきで並びます（この端末の中だけに保存）。
          </p>
        )}
      </section>

      {/* 調査メニュー */}
      <section className="mx-[10px] mt-[10px] rounded-[13px] bg-white px-[11px] pb-[11px] pt-[12px] shadow-[0_6px_20px_rgba(20,48,95,0.06)]">
        <Head title="調査メニュー" onMore={onMenuAll} />
        <div className="mt-[10px] grid grid-cols-3 gap-x-[6px] gap-y-[6.5px]">
          {MENU.map((m) => (
            <button key={m.title} onClick={() => onMenu(m.tab, m.title)} className="flex items-center rounded-[9px] bg-white pl-[6px] pr-[5px] text-left shadow-[0_2px_9px_rgba(20,45,85,0.09)] active:bg-[#f7f9fd]" style={{ height: 51.5 }}>
              <span className="flex shrink-0 items-center justify-center rounded-[9px]" style={{ width: 33, height: 33, background: m.bg }}>
                {m.art}
              </span>
              <span className="ml-[6px] min-w-0 flex-1">
                <span className="flex items-center justify-between gap-[2px]">
                  <span className="whitespace-nowrap font-bold leading-none" style={{ fontSize: 8.5, color: TEXT, fontFeatureSettings: '"palt"' }}>
                    {m.title}
                  </span>
                  <ChevronRight size={8} strokeWidth={1.4} absoluteStrokeWidth color="#2a3550" className="shrink-0" />
                </span>
                <span className="mt-[4px] block whitespace-nowrap leading-[1.45]" style={{ fontSize: 6.6, color: SUB }}>
                  {m.sub[0]}
                  <br />
                  {m.sub[1]}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 書類を作る */}
      <button onClick={onDocs} className="relative mx-[13px] mb-[12px] mt-[10px] block overflow-hidden rounded-[12px] text-left shadow-[0_6px_20px_rgba(60,40,20,0.08)] active:opacity-90" style={{ width: ART_W - 26, height: ((ART_W - 26) * 272) / 1400 }}>
        <PhoneImg src="/home/docs.webp" alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute" style={{ left: 14.5, top: 14.5 }}>
          <span className="block whitespace-nowrap font-bold leading-none" style={{ fontSize: 13.8, color: "#0f2a5c", letterSpacing: 0.2 }}>
            調査結果から書類を作成
          </span>
          <span className="mt-[7px] block whitespace-nowrap leading-[1.6]" style={{ fontSize: 7.9, color: "#4b5568" }}>
            調査メモ・重説下書き・物件概要・案内図を
            <br />
            ワンクリックで作成できます。
          </span>
        </span>
      </button>
    </div>
  );
}

/** カードの見出し（明朝）と「すべて見る ›」 */
function Head({ icon, title, onMore }: { icon?: ReactNode; title: string; onMore?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="home-serif flex items-center gap-[6px] leading-none" style={{ fontSize: 12.4, color: HEAD, letterSpacing: 0.4 }}>
        {icon}
        {title}
      </h2>
      {onMore && (
        <button onClick={onMore} className="flex items-center gap-[2px] leading-none" style={{ fontSize: 8, color: "#26334d" }}>
          すべて見る
          <ChevronRight size={9} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      )}
    </div>
  );
}

/** 強みの白い札 */
function Badge({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-auto items-center justify-center gap-[5px] rounded-full bg-white/[0.9] px-[8px] leading-none shadow-[0_2px_8px_rgba(20,45,85,0.08)] active:bg-white" style={{ height: 23.5 }}>
      {icon}
      <span className="whitespace-nowrap font-bold" style={{ fontSize: 8.2, color: TEXT }}>
        {label}
      </span>
    </button>
  );
}

/** 書類の線の印（強みの「道路図」） */
function DocOutline() {
  return (
    <svg viewBox="0 0 24 24" width={11} height={11} aria-hidden fill="none" stroke={NAVY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
      <path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h7" />
    </svg>
  );
}
