"use client";

// スマホの下のメニューの「書類・出力」。画面いっぱいの写真（届いた机の写真 3 枚。public/docs/day・evening・night.webp）を、
// 太陽の高さで昼・夕方・夜に切り替えて敷く（lib/app/sun.ts の dayPart。開いている間に時間帯が変わったら、ゆっくり入れ替わる）。
// 写真は下のメニューの後ろまで敷くので、components/app/mobile-app.tsx が DocsBackdrop で画面のいちばん奥に置く。
// 上から：ホームと同じロゴの帯と右上のメニュー（≡）、ページの名前（DOCUMENTS・書類・出力。page-head.tsx）、写真を見せる空き、
// 物件のカード（書類を作る物件と調査の状態、作れる書類。いちばん使う「要注意点と次にやること」は横いっぱいの大きなボタン（すりガラスのまま少し明るく、
// 金色のアイコン）、ほかの6つは調査の流れの順の小さなボタン 2段×3つ（役所・法務局で：照会文・地番の一覧、現地で：案内図、書類にする：調査メモ・重説の下書き・結果の文面。
// 並びは doc-kinds.tsx））、
// ほかの物件から作る（すりガラスの板に、画面に収まる数だけ。続きは履歴）、注意の一文。
// 字・すりガラスはホームとお気に入りと同じ（白い字にごく薄い影、板は components/app/favorites.tsx の BOARD）。スクロールしない
// （背の低い画面だけ、はみ出した分をスクロールできる）。
// 動き（app/globals.css の .docs-*・.day-*）：開くと写真がふわっと落ち着き、上から順に浮き上がる。≡ の「動きの演出」がオンのときは、
// 写真がごくゆっくり寄り、昼は窓の光、夕方は夕日とスタンド、夜はスタンドの明かりがゆっくり揺らぎ、夜はビルの屋上の赤い灯が点滅する。
// 動きを減らす設定では動かさない
import { ChevronRight, Clock3, MapPin, Search } from "lucide-react";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { docMainSub, docStatusLine, useDocStatus } from "@/lib/app/doc-status";
import { propertyCount } from "@/lib/app/history-view";
import { placeLine, placeParts } from "@/lib/app/scene";
import { dayPart } from "@/lib/app/sun";
import { favoriteKey } from "@/lib/favorites";
import { historyKey, type HistoryItem } from "@/lib/history";
import { partNow, useDayLayers, useLayerEntry, type DayPart } from "./day-photo";
import { DOCS, MAIN_DOC, type DocKind } from "./doc-kinds";
import { BOARD, LABEL, placeSubLine } from "./favorites";
import { PhoneImg } from "./frame";
import { BrandBar, PageTitle } from "./page-head";
import { HIT, SHADOW, useScreenHeight } from "./home";
import { useNow, when } from "./tab-pages";

/** 作れる書類の並びは components/app/doc-kinds.tsx（押すと、その書類をすぐ開く） */
export type { DocKind };

/**
 * 時間帯ごとの写真（届いた絵 941×1672）。x は縦長の画面で左右を切るときの位置（0 左 〜 1 右）：
 * 昼は右の法令の本とスタンドが見えるよう右寄せ、夕方は左の夕日と右の高いビル・スタンドが両方入る位置、夜は東京タワー（右）とスカイツリー（左）が両方入る位置。
 * shade は写真に重ねる暗さ：上は見出しの白い字のため、下はカードと一覧が乗る机の白い紙を落ち着かせるため（明るい昼ほど濃く）。
 * top は時刻・電池の帯の色（写真のいちばん上に shade を重ねた色を測った値）
 */
const PHOTOS: Record<DayPart, { src: string; x: number; bg: string; top: string; shade: string }> = {
  day: {
    src: "/docs/day.webp",
    x: 0.9,
    bg: "#56604f",
    top: "#303a36",
    shade:
      "radial-gradient(80% 24% at 18% 8%, rgba(8,16,30,0.34) 0%, rgba(8,16,30,0) 100%), linear-gradient(180deg, rgba(10,20,36,0.4) 0%, rgba(10,20,36,0.14) 17%, rgba(10,20,36,0) 30%, rgba(6,10,20,0.08) 38%, rgba(6,10,20,0.42) 54%, rgba(6,10,20,0.6) 74%, rgba(6,10,20,0.7) 100%)",
  },
  // 夕方は空が明るいので、昼と同じく見出しの後ろ（左上）を少し暗くする
  evening: {
    src: "/docs/evening.webp",
    x: 0.55,
    bg: "#5a4a44",
    top: "#42404a",
    shade:
      "radial-gradient(80% 24% at 18% 8%, rgba(14,12,30,0.32) 0%, rgba(14,12,30,0) 100%), linear-gradient(180deg, rgba(16,14,34,0.38) 0%, rgba(16,14,34,0.12) 17%, rgba(16,14,34,0) 28%, rgba(6,8,18,0.06) 36%, rgba(6,8,18,0.4) 52%, rgba(6,8,18,0.58) 72%, rgba(6,8,18,0.68) 100%)",
  },
  night: {
    src: "/docs/night.webp",
    x: 0.62,
    bg: "#0b0f16",
    top: "#0f1013",
    shade:
      "linear-gradient(180deg, rgba(4,8,18,0.2) 0%, rgba(4,8,18,0) 20%, rgba(4,6,12,0) 40%, rgba(4,6,12,0.34) 55%, rgba(4,6,12,0.52) 74%, rgba(4,6,12,0.6) 100%)",
  },
};

/**
 * 写真の中の光（位置は絵の幅・高さに対する %。届いた絵で測った）。glow は柔らかい光のにじみ（w は絵の幅に対する %、色）、
 * beacon はビルの屋上の赤い航空障害灯（同じビルの灯は同時に点滅。d は点滅の遅れ 秒）
 */
const LIGHTS: Record<DayPart, { glows: { x: number; y: number; w: number; ar?: number; color: string; a: number; dur: number }[]; beacons: { x: number; y: number; d: number }[] }> = {
  // 窓から机のペン立てと本に差す日の光（見出しの字の後ろは明るくしない）
  day: { glows: [{ x: 60, y: 30, w: 56, color: "255,240,205", a: 0.3, dur: 9 }], beacons: [] },
  // 街の向こうに沈む夕日と、点いたスタンド（横に長い光なので、にじみも横長。ar は幅÷高さ）
  evening: {
    glows: [
      { x: 29.5, y: 31, w: 70, color: "255,170,96", a: 0.5, dur: 7.5 },
      { x: 79.2, y: 26.5, w: 34, ar: 2.2, color: "255,226,170", a: 0.42, dur: 5.5 },
    ],
    beacons: [],
  },
  // スタンドの明かりと、ビルの屋上の赤い灯（右の冠のビル・その右・左のビル）
  night: {
    glows: [{ x: 36.5, y: 27.6, w: 44, color: "255,214,150", a: 0.5, dur: 6 }],
    beacons: [
      { x: 66.26, y: 13.28, d: 0 },
      { x: 68.85, y: 12.75, d: 0 },
      { x: 73.5, y: 12.86, d: 0 },
      { x: 73.86, y: 16.05, d: 0.7 },
      { x: 76.9, y: 16.29, d: 0.7 },
      { x: 60.02, y: 17.59, d: 1.25 },
      { x: 61.71, y: 17.46, d: 1.25 },
    ],
  },
};

/** 書類・出力のページの時刻・電池の帯の色（いまの時間帯の写真のいちばん上の色） */
export function docsTop(): string {
  return PHOTOS[partNow(dayPart)].top;
}

/** いまの時間帯の写真（開いてから先に読んでおく。components/app/mobile-app.tsx） */
export function docsPhoto(): string {
  return PHOTOS[partNow(dayPart)].src;
}

/**
 * 画面いっぱいの机の写真（下のメニューの後ろまで敷く）。時間帯が変わったら、前の写真の上に新しい写真をゆっくり重ねてから前のを外す
 * （components/app/day-photo.ts）
 */
export function DocsBackdrop({ motion }: { motion: boolean }) {
  const { shown, layers, swapping, done } = useDayLayers(dayPart);
  return (
    <div aria-hidden data-part={shown} className={`docs-backdrop pointer-events-none absolute inset-0 overflow-hidden ${motion ? "docs-alive" : ""}`} style={{ background: PHOTOS[shown].bg }}>
      {layers.map((p) => (
        <DocsScene key={p} part={p} swap={p === shown && swapping} onShown={done} />
      ))}
    </div>
  );
}

/** 1枚の写真と、その上の光・暗さ。読み込めてから現れる（初めは .day-intro、入れ替わりは .day-swap） */
function DocsScene({ part, swap, onShown }: { part: DayPart; swap: boolean; onShown: () => void }) {
  const p = PHOTOS[part];
  const l = LIGHTS[part];
  const entry = useLayerEntry(swap, onShown);
  return (
    <div className={`absolute inset-0 ${entry.className}`}>
      <div className="docs-stage" style={{ "--docs-x": p.x } as CSSProperties}>
        <div className="docs-drift absolute inset-0">
          <PhoneImg
            src={p.src}
            alt=""
            draggable={false}
            decoding="async"
            onLoad={entry.onLoad}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `${p.x * 100}% 50%` }}
          />
          {l.glows.map((g, i) => (
            <span key={i} className="docs-glow" style={{ left: `${g.x}%`, top: `${g.y}%`, width: `${g.w}%`, aspectRatio: g.ar ?? 1, animationDuration: `${g.dur}s`, background: `radial-gradient(closest-side, rgba(${g.color},${g.a}) 0%, rgba(${g.color},${g.a * 0.4}) 38%, rgba(${g.color},0) 100%)` }} />
          ))}
          {l.beacons.map((b, i) => (
            <span key={`b${i}`} className="docs-beacon" style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${b.d}s` }} />
          ))}
        </div>
      </div>
      <div className="absolute inset-0" style={{ background: p.shade }} />
    </div>
  );
}

/** 現れるときの動きの遅れ */
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/**
 * いつもの画面の寸法（pt）：ひとことの下の端、物件のカード（6つのタイルの 2 段。status は調査の状態の行の分）、一覧の見出し（上の余白込み）、行、
 * 注意の一文、下の余白。写真を見せる空きは、画面の高さの 2 割を残す（夕方の夕日・夜の東京タワーがカードに隠れない）
 */
const LAYOUT = { head: 126, compactHead: 120, card: 294, status: 17, listHead: 60, row: 63, note: 47, bottom: 16 };

/** 物件の名前（市区町村と町名。無ければ住所のまま） */
function placeName(h: HistoryItem): string {
  const { city, town, full } = placeParts(h);
  return city && town ? `${city}${town}` : full;
}


/** 書類・出力：書類を作る物件（開いている物件、無ければ最近調べた物件）のカードと、ほかの物件から作る一覧 */
export function DocsPage({
  current,
  history,
  onMake,
  onReport,
  onPick,
  onHistory,
  onHome,
  onMenu,
  unread,
  motion,
  banner,
}: {
  /** いま開いている物件（無ければ undefined） */
  current?: HistoryItem;
  history: HistoryItem[];
  /** 書類の種類を押した（開いている物件、無ければ最近の物件で作る） */
  onMake: (kind: DocKind) => void;
  /** 開いている物件のレポートの画面 */
  onReport: () => void;
  /** 物件を選んで、その物件のレポートの画面 */
  onPick: (h: HistoryItem) => void;
  /** 履歴のページ（一覧に出しきれない物件） */
  onHistory: () => void;
  /** ホーム（まだ物件が無いとき） */
  onHome: () => void;
  /** 右上のメニュー（≡。ホームと同じ） */
  onMenu: () => void;
  unread: boolean;
  /** 動きの演出（≡ の「動きの演出」）がオンか */
  motion: boolean;
  banner?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const screen = useScreenHeight(root);
  const now = useNow();
  // 横向き・キーボードで画面が低いときは、ホームと同じく余白を詰める
  const compact = screen !== undefined && screen < 520;
  // 書類を作る物件：開いている物件、無ければ最近調べた物件
  const target = current ?? history[0];
  const others = history.filter((h) => !target || historyKey(h) !== historyKey(target));
  // 開いている物件の調査の状態（要注意点・やることの残り・確認の記録。物件の画面が入れる）
  const status = useDocStatus(current ? favoriteKey(current) : undefined);
  // 一覧に出す数：写真を見せる空きを残して、画面に収まるだけ（1〜3件）
  const h = screen ?? 760;
  const card = LAYOUT.card + (status ? LAYOUT.status : 0);
  const room = h - (compact ? LAYOUT.compactHead : LAYOUT.head) - card - LAYOUT.listHead - LAYOUT.note - LAYOUT.bottom - (compact ? 16 : Math.round(h * 0.2));
  const shown = others.slice(0, Math.min(3, Math.max(1, Math.floor(room / LAYOUT.row))));

  return (
    <div ref={root} className="docs-page app-touch relative flex flex-col text-white" style={{ minHeight: screen }}>
      {/* ロゴと右上のメニュー（4ページで同じ）と、ページの名前（components/app/page-head.tsx） */}
      <BrandBar onMenu={onMenu} unread={unread} />
      <PageTitle en="DOCUMENTS" ja="書類・出力" style={{ marginTop: compact ? 8 : 14 }} />

      {/* 写真を見せる空き（画面の高さで伸び縮みする） */}
      <div className="min-h-[16px] flex-1" />

      {/* 物件のカード：作る物件と、作れる書類 */}
      <section aria-label="作れる書類" className="docs-rise relative mx-[19px] rounded-[24px]" style={{ ...BOARD, padding: "13px 11px 11px", ...delay(120) }}>
        <div className="flex items-center gap-[8px] pl-[7px]">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-[5px] leading-none" style={{ fontSize: 12.5, letterSpacing: 0.6, color: "rgba(255,255,255,0.62)" }}>
              {current ? <MapPin size={13} strokeWidth={2} absoluteStrokeWidth /> : <Clock3 size={13} strokeWidth={2} absoluteStrokeWidth />}
              {current ? "いま開いている物件" : target ? `最近調べた物件・${when(target.at, now)}` : "書類を作る物件"}
            </p>
            <p className="mt-[7px] truncate font-medium leading-[1.3]" style={{ fontSize: 17, color: "rgba(255,255,255,0.96)" }}>
              {target ? placeLine(target) : "まだありません"}
            </p>
          </div>
          <button
            onClick={() => (current ? onReport() : target ? onPick(target) : onHome())}
            className="press group -mr-[3px] flex shrink-0 items-center gap-[2px] rounded-full px-[8px] transition-[background-color] active:bg-white/15"
            style={{ minHeight: HIT, fontSize: 14, color: "rgba(255,255,255,0.8)" }}
          >
            {target ? "レポート" : (
              <>
                <Search size={15} strokeWidth={2} absoluteStrokeWidth className="mr-[3px]" />
                ホームで調べる
              </>
            )}
            <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth className="transition-transform duration-200 group-active:translate-x-[3px]" />
          </button>
        </div>
        {/* 開いている物件の調査の状態（やることの残り・確認の記録・読み込み中）。横いっぱいに出す */}
        {status && (
          <p className="mt-[5px] truncate pl-[7px] leading-none" style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
            {docStatusLine(status)}
          </p>
        )}
        {/* まだ物件が無いときは、押すと「先にホームで調べて」の案内（mobile-app.tsx の makeDoc）。見た目も控えめに */}
        <div style={{ opacity: target ? 1 : 0.55 }}>
          {/*
            いちばん使う書類：白で浮かせず、ほかと同じすりガラスのまま目立たせる（少し明るいガラスと上の縁の光、金色に光るアイコン、
            横いっぱいの大きさ。動きの演出がオンのときは、開いたとき1回だけ光が横切る。app/globals.css の .docs-main・.docs-sheen）
          */}
          <button onClick={() => onMake(MAIN_DOC.kind)} className="docs-main press-soft press relative mt-[11px] flex w-full items-center gap-[12px] overflow-hidden rounded-[18px] py-[10px] pl-[12px] pr-[10px] text-left" style={{ minHeight: 64 }}>
            {motion && <span aria-hidden className="docs-sheen" />}
            <span className="relative flex shrink-0 items-center justify-center rounded-full" style={{ width: 38, height: 38, background: "rgba(255,201,74,0.16)", border: "1px solid rgba(255,201,74,0.42)", boxShadow: "0 0 14px rgba(255,190,70,0.28)" }}>
              <MAIN_DOC.Icon size={19} strokeWidth={1.9} absoluteStrokeWidth color="#ffd36b" />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate font-semibold leading-[1.25]" style={{ fontSize: 16, color: "#fff" }}>
                {MAIN_DOC.title}
              </span>
              <span className="mt-[3px] block truncate leading-[1.3]" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                {docMainSub(status)}
              </span>
            </span>
            <ChevronRight size={18} strokeWidth={1.9} absoluteStrokeWidth color="rgba(255,255,255,0.75)" className="relative shrink-0" />
          </button>
          {/* ほかの書類：調査の流れの順（上の段は役所・法務局・現地で使うもの、下の段は書類にまとめるもの） */}
          <div className="mt-[8px] grid grid-cols-3 gap-[7px]">
            {DOCS.map((d) => (
              <button
                key={d.kind}
                onClick={() => onMake(d.kind)}
                aria-label={`${d.title}（${d.short}）`}
                className="press flex flex-col items-center justify-center rounded-[16px] px-[2px] text-center transition-[background-color] active:bg-white/20"
                style={{ minHeight: 68, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)" }}
              >
                <d.Icon size={20} strokeWidth={1.7} absoluteStrokeWidth color="#fff" />
                <span className="mt-[6px] whitespace-nowrap font-medium leading-none" style={{ fontSize: 12, color: "rgba(255,255,255,0.95)" }}>
                  {d.title}
                </span>
                <span className="mt-[4px] whitespace-nowrap leading-none" style={{ fontSize: 10.5, color: "rgba(255,255,255,0.58)" }}>
                  {d.short}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ほかの物件から作る（押すと、その物件のレポートの画面。出しきれない分は履歴から） */}
      {shown.length > 0 && (
        <section className="relative" style={{ padding: "18px 19px 0" }}>
          <div className="docs-rise flex min-h-[36px] items-center justify-between gap-x-[8px]" style={{ marginBottom: 6, ...delay(170) }}>
            <h2 className="truncate font-semibold leading-[1.3]" style={{ ...LABEL, textShadow: SHADOW }}>
              ほかの物件から作る
            </h2>
            {others.length > shown.length && (
              <button
                onClick={onHistory}
                className="press group -mr-[8px] flex shrink-0 items-center gap-[2px] rounded-full px-[8px] transition-[background-color] active:bg-white/15"
                style={{ minHeight: HIT, fontSize: 14, color: "rgba(255,255,255,0.78)", textShadow: SHADOW }}
              >
                履歴（{propertyCount(history)}件）
                <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth className="transition-transform duration-200 group-active:translate-x-[3px]" />
              </button>
            )}
          </div>
          <ul className="docs-rise overflow-hidden rounded-[22px]" style={{ ...BOARD, ...delay(200) }}>
            {shown.map((item, i) => (
              <DocRow key={historyKey(item)} item={item} time={when(item.at, now)} style={delay(250 + i * 45)} onPick={() => onPick(item)} />
            ))}
          </ul>
        </section>
      )}

      <p className="docs-rise relative leading-[1.6]" style={{ margin: "10px 23px 0", paddingBottom: LAYOUT.bottom, fontSize: 11.5, color: "rgba(255,255,255,0.7)", textShadow: SHADOW, ...delay(260) }}>
        どれも参考の資料です（iPhone はプリントの画面から PDF にできます）。最終確認は役所の窓口・公的な資料で。
      </p>

      {/* 読み込み中・お知らせの札は、下に浮かせて出す（スクロールしないので、カードや一覧を押し下げない） */}
      {banner && <div className="pointer-events-auto absolute inset-x-[19px] bottom-[14px] z-10">{banner}</div>}
    </div>
  );
}

/** ほかの物件の1行（市区町村と町名・番地か地番と調べた日時）。押すとその物件のレポートの画面 */
function DocRow({ item, time, style, onPick }: { item: HistoryItem; time: string; style: CSSProperties; onPick: () => void }) {
  return (
    <li className="docs-row border-t border-white/[0.12] first:border-t-0" style={style}>
      <button onClick={onPick} aria-label={`${placeParts(item).full}のレポートを開く`} className="flex min-h-[62px] w-full items-center gap-[8px] py-[9px] pl-[18px] pr-[14px] text-left transition-colors active:bg-white/10">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium leading-[1.3]" style={{ fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
            {placeName(item)}
          </span>
          <span className="mt-[3px] block truncate leading-[1.3]" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            {placeSubLine(item, time)}
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="rgba(255,255,255,0.55)" className="shrink-0" />
      </button>
    </li>
  );
}
