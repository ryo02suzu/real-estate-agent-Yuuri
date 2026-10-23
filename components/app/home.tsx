"use client";

// スマホの新しいホーム（検索する前の画面）。届いた絵をそのまま使い、iPhone 16 Pro などの画面でスクロールせずに1画面に収まるように組んだもの。
// 上から：街の写真（届いた絵の構図のまま。見出し「調べる時間を、商談の時間に。」と副題は絵の字を消して、絵と同じ位置・大きさに
// アプリの字で描く。写真の街並みが見出しの下に見えるよう、調べるカードは街並みの途中に重ねる）の上にロゴ・お知らせ、調べるカード
// （住所も地番も1つの欄に入れる。地図で選ぶボタンつき。写真入りの「調査を開始する」）、最近の検索（写真の小さな札つきの一覧に4件まで。
// 続きは履歴のページ）。調べた物件がまだ少ないうちは、その下に「使い方」（住所・地番・地図の3つの入口。例を押すとそのまま調べる）を
// 出して、画面の下が空かないようにする。調査メニューと書類のバナーは置かない（調べれば全部のタブが出る。書類は下のメニューの「書類・出力」から）。
// 字は端末の標準の字（app/globals.css の .theme-navy）。大きさと太さは iPhone の標準の段階：見出し26pt太字、章の見出し18pt太字、
// 入力・ボタン17pt、行の名前16pt中太字、説明・副題13pt、下のメニュー10.5pt。字の間は詰めない（palt を使わない）
// 調べるカードはすりガラス（後ろの街の写真を少しぼかして透かす）。現れるときの動きとボタンの光は app/globals.css の .home-rise・.home-shine。
// 寸法は幅393ptの値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）。幅に対して背の低い画面（iPhone SE など）では、
// low:（app/globals.css）でカードを少し詰める
import { ArrowRight, Bell, ChevronRight, LoaderCircle, Map as MapIcon, MapPinned, Search, TriangleAlert, X } from "lucide-react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { monthDay, placeholderScenes, placeParts, SCENES, sceneSrc, type SceneKey } from "@/lib/app/scene";
import { historyKey, type HistoryItem } from "@/lib/history";
import { LogoLockup, PhoneImg, ScaledInput } from "./frame";
import { GLASS } from "./r-ui";
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
 * 写真の部分の高さ。写真（public/home/hero.webp）は届いた絵の 1672×941 から字を消して x125〜1380・y62〜941（下端まで）を切り抜いた
 * もので、幅393pt・高さ275pt にぴったり合う。見出しは絵と同じ位置（上端44pt・字は25pt）に描く。街並みは147pt から下。
 * 調べるカードは街並みが見えるよう 190pt から重ねる（カードの -mt）。写真の下端は地の色に溶かす
 */
const PHOTO_H = 275;

/** 写真の上の字が建物に重なっても読めるよう、白くにじませる（届いた絵の見出しと同じ効き方） */
const GLOW = "0 0 10px rgba(255,255,255,0.95), 0 0 3px rgba(255,255,255,0.95)";
/** 地の奥の淡い光（最近の検索のあたり。下の端に届く前に消える）。下のメニューのページでも使う */
export const AURORA =
  "radial-gradient(60% 42% at 0% 45%, rgba(110,140,255,0.13) 0%, rgba(110,140,255,0) 100%), radial-gradient(55% 38% at 100% 58%, rgba(40,190,255,0.12) 0%, rgba(40,190,255,0) 100%)";

/** 最近の検索がまだ無いときに見せる写真（丸く重ねて3枚） */
const SAMPLE: SceneKey[] = ["suburb", "newtown", "urban"];

/** 「使い方」の3つの入口（例を押すと、そのまま調べる） */
const TRY: { key: "address" | "chiban" | "map"; Icon: typeof Search; title: string; sub: string; example?: string }[] = [
  { key: "address", Icon: Search, title: "住所で調べる", sub: "例：渋谷区神南1-19-11", example: "渋谷区神南1-19-11" },
  { key: "chiban", Icon: MapPinned, title: "地番で調べる", sub: "例：松戸市古ヶ崎四丁目3556-1", example: "松戸市古ヶ崎四丁目3556-1" },
  { key: "map", Icon: MapIcon, title: "地図で選ぶ", sub: "住所の無い土地も選べます" },
];
/** 調べた物件がこの数より少ないうちは「使い方」を出す */
const TRY_UNTIL = 3;

/** 調べるカードの下に出す注意（空のまま調べた・通信できない） */
export type HomeMessage = { text: string } | null;

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
  onTry,
  onHelp,
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
  /** 「使い方」の例をそのまま調べる */
  onTry: (address: string) => void;
  /** 使い方のシート */
  onHelp: () => void;
  onBell: () => void;
  unread: boolean;
  onLogo: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const recent = history.slice(0, 4);
  const scenes = placeholderScenes(recent);

  return (
    <div className="app-touch relative overflow-hidden" style={{ background: PAGE }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: 280, background: AURORA }} />

      {/* 街の写真の部分（上端は時刻・電池の帯の色からつなぐ） */}
      <div className="relative overflow-hidden" style={{ height: PHOTO_H }}>
        <PhoneImg src="/home/hero.webp" alt="" width={1255} height={879} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-x-0 top-0" style={{ height: 36, background: `linear-gradient(180deg,${SKY} 0%,rgba(230,239,249,0) 100%)` }} />
        <div className="absolute inset-x-0 bottom-0" style={{ height: 40, background: `linear-gradient(180deg,rgba(243,246,251,0) 0%,${PAGE} 100%)` }} />
        <button onClick={onLogo} aria-label="MICHILU ホーム" className="absolute flex items-center" style={{ left: 16, top: 4, height: 40 }}>
          <LogoLockup style={{ height: 28 }} />
        </button>
        <button onClick={onBell} aria-label={unread ? "お知らせ（新しいお知らせがあります）" : "お知らせ"} className="absolute flex items-center justify-center active:opacity-70" style={{ right: 8, top: 3, width: 44, height: 44 }}>
          <span className="flex items-center justify-center rounded-full shadow-[0_4px_14px_rgba(15,47,95,0.14)]" style={{ ...GLASS, width: 38, height: 38 }}>
            <Bell size={19} strokeWidth={1.7} absoluteStrokeWidth color={HEAD} />
          </span>
          {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 6, top: 6, width: 11, height: 11 }} />}
        </button>

        {/* 見出しと副題（絵と同じ位置・大きさ。絵の字は消してある） */}
        <h1 className="home-rise absolute whitespace-nowrap font-bold" style={{ left: 16, top: 44, fontSize: 26, lineHeight: "34px", letterSpacing: 0.2, color: HEAD, textShadow: GLOW }}>
          調べる時間を、
          <br />
          商談の時間に。
        </h1>
        <p className="home-rise absolute whitespace-nowrap leading-none" style={{ left: 16, top: 115, fontSize: 13, letterSpacing: 0.2, color: "#26324a", textShadow: GLOW, ...rise(60) }}>
          不動産調査を、もっと早く、もっとシンプルに。
        </p>
      </div>

      {/* 調べる（すりガラスのカード。住所も地番もこの欄に入れる） */}
      <div className="home-rise relative mx-[16px] -mt-[85px] rounded-[22px] p-[9px] shadow-[0_14px_34px_rgba(20,48,95,0.13)] low:p-[8px]" style={{ ...GLASS, ...rise(100) }}>
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
            <ScaledInput value={input} onChange={setInput} inputRef={inputRef} size={17} className="ml-[9px] mr-[2px]" label="住所・地番" autoComplete="off" placeholder="住所・地番を入力" />
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
              style={{ fontSize: 14, color: NAVY }}
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
            <span className="absolute inset-y-0 left-0 flex items-center justify-center gap-[7px] whitespace-nowrap font-semibold" style={{ width: "62%", fontSize: 17, letterSpacing: 0.4 }}>
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
          <button type="button" onClick={onDismiss} className="mt-[8px] flex w-full items-start gap-[7px] rounded-[12px] bg-[#fdf1ec] px-[12px] py-[9px] text-left leading-[1.5]" style={{ fontSize: 13, color: "#8a4f3a" }}>
            <TriangleAlert size={15} strokeWidth={1.8} absoluteStrokeWidth className="mt-[2px] shrink-0" />
            {message.text}
          </button>
        )}
      </div>

      {/* 最近の検索（写真の小さな札つきの一覧に4件まで） */}
      <section className="home-rise relative mt-[8px] low:mt-[6px]" style={rise(160)}>
        <SectionHead title="最近の検索" onMore={history.length ? onHistory : undefined} />
        {recent.length ? (
          <ul className="mx-[16px] mt-[2px] overflow-hidden rounded-[18px] bg-white shadow-[0_4px_14px_rgba(20,45,85,0.08)]">
            {recent.map((h, i) => {
              const { city, town, full, chiban } = placeParts(h);
              const scene = scenes[i];
              const kind = chiban ? "・地番" : h.ll ? "・地図" : "";
              return (
                <li key={historyKey(h)} className="border-t border-[#eef2f6] first:border-t-0">
                  <button onClick={() => onPickRecent(h)} aria-label={`${full}（${monthDay(h.at)}${kind}）を開く`} className="flex min-h-[72px] w-full items-center gap-[12px] py-[8px] pl-[10px] pr-[10px] text-left active:bg-[#f5f8fc] low:min-h-[64px]">
                    <PhoneImg src={sceneSrc(scene)} alt="" loading="lazy" draggable={false} className="block size-[56px] shrink-0 rounded-[14px] object-cover low:size-[48px]" style={{ objectPosition: `50% ${SCENES[scene].y}%` }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 16, color: TEXT }}>
                        {town || full}
                      </span>
                      <span className="mt-[2px] block truncate leading-[1.35]" style={{ fontSize: 13, color: LIGHT }}>
                        {city || "対応エリアの外"}・{monthDay(h.at)}
                        {kind}
                      </span>
                    </span>
                    <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <FirstRun />
        )}
      </section>

      {/* 使い方（調べた物件がまだ少ないうちだけ。例を押すとそのまま調べる） */}
      {history.length < TRY_UNTIL && (
        <section className="home-rise relative mt-[10px] low:mt-[8px]" style={rise(220)}>
          <SectionHead title="使い方" more="くわしく" onMore={onHelp} />
          <ul className="mx-[16px] mt-[2px] overflow-hidden rounded-[18px] bg-white shadow-[0_4px_14px_rgba(20,45,85,0.08)]">
            {TRY.map((t) => (
              <li key={t.key} className="border-t border-[#eef2f6] first:border-t-0">
                <button onClick={() => (t.example ? onTry(t.example) : onMap())} className="flex min-h-[56px] w-full items-center gap-[12px] py-[8px] pl-[12px] pr-[10px] text-left active:bg-[#f5f8fc] low:min-h-[52px]">
                  <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 38, height: 38 }}>
                    <t.Icon size={18} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 16, color: TEXT }}>
                      {t.title}
                    </span>
                    <span className="mt-[1px] block truncate leading-[1.35]" style={{ fontSize: 13, color: LIGHT }}>
                      {t.sub}
                    </span>
                  </span>
                  <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div style={{ height: 6 }} />
    </div>
  );
}

/** 章の見出し（左に青い印）と「すべて見る ›」（押せる高さは44pt） */
function SectionHead({ title, more = "すべて見る", onMore }: { title: string; more?: ReactNode; onMore?: () => void }) {
  return (
    <div className="flex h-[28px] items-center justify-between px-[16px]">
      <div className="flex min-w-0 items-center gap-[8px]">
        <span aria-hidden className="shrink-0 rounded-full" style={{ width: 3.5, height: 16, background: ACCENT }} />
        <h2 className="whitespace-nowrap font-bold leading-none" style={{ fontSize: 18, color: HEAD }}>
          {title}
        </h2>
      </div>
      {onMore && (
        <button onClick={onMore} className="-mr-[8px] flex h-[44px] shrink-0 items-center px-[8px] active:opacity-60" style={{ fontSize: 15, color: LINK }}>
          {more}
          <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth />
        </button>
      )}
    </div>
  );
}

/** 最近の検索がまだ無いとき（初めて開いたとき）。1行の高さに収める（Safari でも1画面に入るように） */
function FirstRun() {
  return (
    <div className="mx-[16px] mt-[2px] flex items-center gap-[12px] rounded-[18px] bg-white py-[8px] pl-[10px] pr-[12px] shadow-[0_4px_14px_rgba(20,45,85,0.08)]" style={{ minHeight: 56 }}>
      <div className="flex shrink-0 -space-x-[10px]">
        {SAMPLE.map((k, i) => (
          <PhoneImg key={k} src={sceneSrc(k)} alt="" loading="lazy" draggable={false} className="relative block size-[40px] rounded-full border-2 border-white object-cover" style={{ objectPosition: `50% ${SCENES[k].y}%`, zIndex: SAMPLE.length - i }} />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-[1.3]" style={{ fontSize: 15, color: TEXT }}>
          まだ調べた物件はありません
        </p>
        <p className="mt-[1px] truncate leading-[1.35]" style={{ fontSize: 12.5, color: LIGHT }}>
          調べた物件が、ここに並びます
        </p>
      </div>
    </div>
  );
}
