"use client";

// スマホの下のメニューの「お気に入り」。画面いっぱいの写真（届いた富士山と湖の絵。昼は public/favorites/fuji-day.webp、昼と夕方のあいだは
// fuji-afternoon.webp、夕方は fuji-evening.webp、夜は fuji-night.webp。太陽の高さで切り替える。lib/app/sun.ts の favPart と
// components/app/day-photo.ts。下のメニューの後ろまで
// 敷くので、components/app/mobile-app.tsx が FavoritesBackdrop で画面のいちばん奥に置く）の上に、ふたつの画面：
// ・いつもの画面（スクロールしない）：ホームと同じロゴの帯と右上のメニュー（≡）、ページの名前（FAVORITES・お気に入り・件数。page-head.tsx）、
//   ホームと同じ検索欄（絞り込み）。その下は富士山の窓（富士山を隠さない）。富士山のふもとより下に「最近保存した物件　すべて見る ›」と、
//   半透明のすりガラスの板に最近保存した物件を、入るだけ（新しく保存した順）。絞り込みの欄に触れている間は、
//   一覧が検索欄のすぐ下へ滑り上がり（キーボードに隠れないように）、離すと富士山の下へ戻る。
// ・すべて見る：戻るボタン・絞り込み・並べ方（新しい順・市区町村ごと。白い札が滑る）・すべての物件（スクロールできる）。
//   行き来するときは、板と行と検索欄が滑ってつながる（View Transitions。名前は components/app/home.tsx の VT。.vt-fav）。
// 行は写真の札を付けず、市区町村と町名・番地か地番と日時・書類のボタン・★。板は字が読みやすいよう、ホームより少し濃いすりガラス。
// 動き（app/globals.css の .fav-*）：開くと写真がふわっと落ち着き、上から順に浮き上がり、行は少しずつ遅れて現れる。
// 昼と夕方のあいだは左のふもとの西日がゆっくり揺らぎ、湖に映った西日がきらめく。夕方は太陽の光がゆっくり揺らぎ、湖に映った光の道がきらめき、
// 富士山の雪が夕日にほんのり染まる。夜は月の光が揺らぎ、星が瞬き、月の光の道がきらめく
// （≡ の「動きの演出」がオンのとき）。すべて見るでスクロールすると、写真が
// ゆっくり上へ寄って暗くなり、上に見出しの細いバーが出る（押すといちばん上へ）。
// ★を押すと星が抜けて行がたたまれ、下に「元に戻す」が出る（UndoToast。mobile-app.tsx が出す）。
// 動きを減らす設定では、位置の動きを止める（すぐ切り替わる）
import { ChevronLeft, ChevronRight, FileText, Search, Star, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { placeParts } from "@/lib/app/scene";
import { favPart, type FavPart } from "@/lib/app/sun";
import { favoriteKey, type FavoriteItem } from "@/lib/favorites";
import { partNow, useDayLayers, useDayPart, useLayerEntry } from "./day-photo";
import { PhoneImg, ScaledInput } from "./frame";
import { BrandBar, PageTitle } from "./page-head";
import { DARK_GLASS, HIT, LIGHT_GLASS, SHADOW, useScreenHeight, VT } from "./home";
import { useShrink } from "./sky";
import { matches, useNow, when } from "./tab-pages";
import { reducedMotion } from "./tokens";

/**
 * 時間帯ごとの富士山の写真（昼・昼と夕方のあいだ・夕方・夜。切り替えは lib/app/sun.ts の favPart と components/app/day-photo.ts）。
 * ar は写真の縦横比（幅÷高さ）、x・y は写真が画面より大きいときに切る位置（0〜1）。bg は読み込むまでの地の色、top は時刻・電池の帯の色
 * （写真のいちばん上に、上の暗いぼかしを重ねた色）。fuji は富士山の位置（絵の高さに対する割合。届いた絵で測った）：頂・雪の下の端・
 * foot はいつもの画面の一覧の板の上の端の限り（ふもと。ここより上に板を置かず、富士山を隠さない）、x は頂の横の位置（絵の幅に対する %）。
 * 動きの演出がオンのときに重ねる光：glow は雪をほんのり染める光の色、halo は太陽・月のまわりの光（位置 %、幅は絵の幅に対する %、色）、
 * glints は湖に映った光の道のきらめき（glint は粒の色とにじみの色）、stars は写真の星（瞬かせる）
 */
type FavPhoto = {
  src: string;
  srcSet?: string;
  sizes?: string;
  ar: number;
  x: number;
  y: number;
  bg: string;
  top: string;
  fuji: { peak: number; snow: number; foot: number; x: number };
  glow?: string;
  halo?: { x: number; y: number; w: number; bg: string };
  glints?: Sparkle[];
  glint?: { core: string; glow: string };
  stars?: Sparkle[];
};
/** 光の粒（位置は絵に対する %、大きさ px、点滅の長さと遅れ 秒、明るさ 0〜1） */
type Sparkle = { x: number; y: number; size: number; dur: number; delay: number; a?: number };

/** 決まった並びの乱数（毎回同じ並び） */
const seeded = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

/** 湖に映った光の道のきらめき：道の真ん中 x（%）、始まり y0（%）と長さ（%）、広がり（下ほど広がる） */
function pathGlints(seed: number, n: number, x: number, y0: number, len: number, spread0: number, grow: number): Sparkle[] {
  const rnd = seeded(seed);
  return Array.from({ length: n }, () => {
    const y = y0 + Math.pow(rnd(), 1.6) * len;
    const spread = spread0 + (y - y0) * grow;
    return { x: x + (rnd() * 2 - 1) * spread, y, size: 2 + Math.round(rnd() * 2), dur: 2.2 + rnd() * 2.2, delay: rnd() * 3.2 };
  });
}

/**
 * 夜の写真の星（届いた絵で、まわりより明るい小さな点を探して測った。x・y は %、d はまわりとの明るさの差）。
 * 雲のふちの明るい所と、画面のいちばん上の端は外した
 */
const NIGHT_STARS: Sparkle[] = (() => {
  const rnd = seeded(29);
  const found: [number, number, number][] = [
    [85.12, 1.97, 171], [90.75, 6.46, 123], [54.73, 2.45, 121], [23.27, 14.0, 120], [4.36, 15.74, 109], [30.29, 19.45, 103],
    [34.86, 14.54, 99], [12.43, 27.35, 98], [40.6, 10.53, 91], [53.88, 13.17, 87], [49.2, 33.39, 85], [8.18, 21.01, 84],
    [17.96, 31.0, 78], [61.0, 7.3, 77], [15.83, 31.36, 76], [67.48, 6.64, 72], [5.42, 33.33, 70], [27.21, 32.02, 69],
    [42.51, 3.17, 65], [6.38, 14.9, 65], [63.66, 7.3, 64], [30.82, 26.87, 60], [20.51, 32.32, 58], [75.66, 37.7, 48],
    [96.39, 11.31, 47], [15.09, 36.51, 46],
  ];
  return found.map(([x, y, d]) => ({ x, y, size: d > 100 ? 3 : 2, dur: 2.6 + rnd() * 2.8, delay: rnd() * 4, a: Math.min(1, Math.max(0.5, d / 150)) }));
})();
/**
 * 夕方：夕日と紅富士・湖・すすき（届いた絵 941×1672）。頂 39.6%・雪 46.5% まで・ふもと 55.5%・湖 59.5% から。
 * 太陽は富士山の左のふもと（9.1%・49%）なので、太陽が画面に入るよう左寄せで切る（富士山は右）。湖に映った太陽の光の道は 9% のあたり
 */
const EVENING: FavPhoto = {
  src: "/favorites/fuji-evening.webp",
  ar: 941 / 1672,
  x: 0.15,
  y: 0.4,
  bg: "#2c3550",
  top: "#344968",
  fuji: { peak: 0.396, snow: 0.465, foot: 0.555, x: 62.7 },
  glow: "255,150,120",
  halo: { x: 9.1, y: 49, w: 70, bg: "radial-gradient(circle, rgba(255,236,196,0.62) 0%, rgba(255,196,120,0.3) 14%, rgba(255,160,90,0.12) 34%, rgba(255,150,80,0) 62%)" },
  glints: pathGlints(11, 14, 9.1, 60.2, 13, 0.9, 0.18),
  glint: { core: "#fff6dc", glow: "rgba(255,214,140,0.85)" },
};
const FAV_PHOTOS: Record<FavPart, FavPhoto> = {
  /** 昼：青空と雪の富士山・湖・すすき（届いた絵 941×1672）。頂 39.7%・雪と雲 46%・ふもと 55.5%・湖 60% から。頂が画面の中ほどより少し右に来る位置で切る */
  day: {
    src: "/favorites/fuji-day.webp",
    ar: 941 / 1672,
    x: 0.65,
    y: 0.4,
    bg: "#2f5a8a",
    top: "#134078",
    fuji: { peak: 0.397, snow: 0.46, foot: 0.555, x: 62.5 },
  },
  /**
   * 昼と夕方のあいだ：青空と雪の富士山、左のふもとに傾いた西日・湖・すすき（届いた絵 941×1672）。頂 40.1%（横 64.7%）・雪 46.5% まで・
   * ふもと 55.5%・湖 59.5% から。西日は絵の左の端（2%・49.7%）なので、左に寄せて切る（富士山は右）。湖に映った西日は左の端から 8% のあたり
   */
  afternoon: {
    src: "/favorites/fuji-afternoon.webp",
    ar: 941 / 1672,
    x: 0,
    y: 0.4,
    bg: "#3a5478",
    top: "#36527c",
    fuji: { peak: 0.401, snow: 0.466, foot: 0.555, x: 64.7 },
    halo: { x: 2, y: 49.7, w: 60, bg: "radial-gradient(circle, rgba(255,240,205,0.55) 0%, rgba(255,214,150,0.26) 14%, rgba(255,190,120,0.1) 34%, rgba(255,180,110,0) 62%)" },
    glints: pathGlints(5, 14, 8, 61.5, 9, 3, 0.6),
    glint: { core: "#fff8e6", glow: "rgba(255,226,170,0.85)" },
  },
  evening: EVENING,
  /**
   * 夜：月と星・月明かりの富士山・町の明かりと湖（届いた絵 941×1671）。頂 40.3%・雪 47%・ふもと 56〜57%（その下に町の明かり）・湖 60% から。
   * 月は 81.8%・21%（検索欄の上の右に見える）。月の光の道は湖の右（81% あたりから下へ広がる）
   */
  night: {
    src: "/favorites/fuji-night.webp",
    ar: 941 / 1671,
    x: 0.65,
    y: 0.4,
    bg: "#101826",
    top: "#0c182a",
    fuji: { peak: 0.403, snow: 0.47, foot: 0.56, x: 61.5 },
    halo: { x: 81.8, y: 20.95, w: 26, bg: "radial-gradient(circle, rgba(232,240,255,0.55) 0%, rgba(205,220,255,0.24) 16%, rgba(190,205,255,0.08) 38%, rgba(190,205,255,0) 64%)" },
    glints: pathGlints(7, 18, 80.5, 61.5, 33, 2, 0.2),
    glint: { core: "#f4f8ff", glow: "rgba(190,210,255,0.8)" },
    stars: NIGHT_STARS,
  },
};

/** お気に入りのページの時刻・電池の帯の色（いまの時間帯の写真のいちばん上の色） */
export function favoritesTop(): string {
  return FAV_PHOTOS[partNow(favPart)].top;
}

/** いまの時間帯の写真（開いてから先に読んでおく。components/app/mobile-app.tsx） */
export function favoritesPhoto(): string {
  return FAV_PHOTOS[partNow(favPart)].src;
}

/** 富士山の頂を置く高さ：検索欄の下の端から、この分だけ下（pt） */
const PEAK_GAP = 40;
/** 富士山の頂を置きたい高さ（pt。ページの上から）。横向きなど低い画面は検索欄が上にあるので、その下 */
const peakTarget = (screen: number) => (screen < 520 ? LAYOUT.compactSearchBottom : LAYOUT.searchBottom) + PEAK_GAP;

/**
 * 写真の箱の置き方（px）。w・h は写真を敷く所（.fav-backdrop）の大きさ、target は富士山の頂を置きたい高さ（px）。
 * まず画面を覆う大きさに合わせ（app/globals.css の .fav-stage と同じ）、頂が target より下にあれば、頂が target に来るまで写真を上へ寄せる
 * （富士山を検索欄と一覧のあいだに。下の湖とすすきは、どのみち一覧と下のメニューに隠れる所）。寄せた分だけ下が空かないよう、頂を中心に少し大きくする。
 * at(f) は、絵の高さに対する割合 f の所が、写真を敷く所の上から何 px に来るか
 */
function fujiFrame(w: number, h: number, p: FavPhoto, target: number) {
  const w0 = Math.max(w, h * p.ar);
  const h0 = w0 / p.ar;
  const top0 = (h - h0) * p.y;
  const peak0 = top0 + h0 * p.fuji.peak;
  if (peak0 <= target) return { shift: 0, scale: 1, at: (f: number) => top0 + h0 * f };
  const scale = Math.max(1, (h - target) / (top0 + h0 - peak0));
  return { shift: peak0 - target, scale, at: (f: number) => target + (f - p.fuji.peak) * h0 * scale };
}

/** 写真を敷く所の大きさと、富士山の頂を置く高さ（px）。画面の大きさが変わったら測り直す */
type Box = { w: number; h: number; target: number };
function useBox(box: RefObject<HTMLElement | null>, scroller: RefObject<HTMLElement | null>): Box | null {
  const [size, setSize] = useState<Box | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-zoom")) || 1;
      const screen = (scroller.current?.clientHeight ?? el.clientHeight) / zoom;
      setSize({ w: el.clientWidth, h: el.clientHeight, target: peakTarget(screen) * zoom });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (scroller.current) ro.observe(scroller.current);
    return () => ro.disconnect();
  }, [box, scroller]);
  return size;
}

/** スクロールで写真が寄りきるまでの量（px） */
const PARALLAX_RANGE = 320;
/** 見出しの細いバーを出すスクロールの量（pt） */
const BAR_AT = 118;
/** 星を押してから行が消えきるまで（app/globals.css の .fav-leaving と同じ） */
const LEAVE_MS = 340;
/** 「元に戻す」を出しておく時間 */
const UNDO_MS = 5000;
/** 現れるときの動きの遅れ */
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/**
 * 画面いっぱいの富士山の写真（下のメニューの後ろまで敷く。昼・昼と夕方のあいだ・夕方・夜で切り替え、変わるときはゆっくり重ねる）。上と下を少し暗くして、
 * 白い字とメニューを読みやすくする。写真の上に、光（昼と夕方のあいだは西日の揺らぎ・湖のきらめき、夕方は太陽の揺らぎ・湖のきらめき・紅富士、
 * 夜は月の光・星の瞬き・月の光の道のきらめき）を絵と同じ位置に重ねる
 * （写真と光を同じ箱に入れ、箱を画面いっぱいに合わせる。.fav-stage）。
 * スクロールした量を --fav-p（0〜1）に書き、写真が上へ寄って暗くなる（動きの演出がオフ・動きを減らす設定では暗くなるだけ）
 */
export function FavoritesBackdrop({ scroller, motion }: { scroller: RefObject<HTMLElement | null>; motion: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const { shown, layers, swapping, done } = useDayLayers(favPart);
  const size = useBox(box, scroller);
  useEffect(() => {
    const el = box.current;
    const sc = scroller.current;
    if (!el || !sc) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const p = Math.min(1, Math.max(0, sc.scrollTop / PARALLAX_RANGE));
      el.style.setProperty("--fav-p", p.toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      sc.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [scroller]);
  return (
    <div ref={box} aria-hidden data-part={shown} className={`fav-backdrop pointer-events-none absolute inset-0 overflow-hidden ${motion ? "fav-alive" : ""}`} style={{ background: FAV_PHOTOS[shown].bg }}>
      {layers.map((p) => (
        <FujiScene key={p} photo={FAV_PHOTOS[p]} size={size} swap={p === shown && swapping} onShown={done} />
      ))}
      {/* 上は少し暗く（見出し）、下も少しだけ暗く（下のメニュー）。物件はすりガラスの板に乗せるので、写真はなるべくそのまま */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,14,32,0.36) 0%, rgba(5,14,32,0) 30%, rgba(0,0,0,0) 60%, rgba(3,8,18,0.36) 100%)" }} />
      {/* スクロールするほど暗く（一覧が読みやすい）。絞り込みに触れている間も少し暗く */}
      <div className="fav-dim absolute inset-0" />
      <div className="fav-focus absolute inset-0" />
    </div>
  );
}

/** 1枚の富士山の写真と、その上の光。読み込めてから現れる（components/app/day-photo.ts の useLayerEntry） */
function FujiScene({ photo: p, size, swap, onShown }: { photo: FavPhoto; size: Box | null; swap: boolean; onShown: () => void }) {
  const entry = useLayerEntry(swap, onShown);
  // 富士山の頂が検索欄の少し下に来るよう、写真を上へ寄せる（頂を中心に少し大きく）
  const f = size ? fujiFrame(size.w, size.h, p, size.target) : { shift: 0, scale: 1 };
  return (
    <div className={`absolute inset-0 ${entry.className}`}>
      <div className="fav-stage" style={{ "--fav-ar": p.ar, "--fav-x": p.x, "--fav-y": p.y, "--glint": p.glint?.core, "--glint-glow": p.glint?.glow } as CSSProperties}>
        <div className="fav-frame" style={{ "--fav-shift": `${-f.shift}px`, "--fav-scale": f.scale, "--fav-origin": `${p.fuji.peak * 100}%` } as CSSProperties}>
          <div className="fav-drift absolute inset-0">
            <PhoneImg
              src={p.src}
              srcSet={p.srcSet}
              sizes={p.sizes}
              alt=""
              draggable={false}
              decoding="async"
              onLoad={entry.onLoad}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `${p.x * 100}% ${p.y * 100}%` }}
            />
            {p.halo && <span className="fav-halo" style={{ left: `${p.halo.x}%`, top: `${p.halo.y}%`, width: `${p.halo.w}%`, background: p.halo.bg }} />}
            {p.stars?.map((g, i) => (
              <span key={`s${i}`} className="fav-star" style={{ left: `${g.x}%`, top: `${g.y}%`, width: g.size, height: g.size, animationDuration: `${g.dur}s`, animationDelay: `${g.delay}s`, "--a": g.a } as CSSProperties} />
            ))}
            {/* 雪が光にほんのり染まって、ゆっくり明るくなっては落ち着く（動きの演出がオンのときだけ） */}
            {p.glow && (
              <span
                className="fav-alpen"
                style={{
                  left: `${p.fuji.x}%`,
                  top: `${((p.fuji.peak + p.fuji.snow) / 2 + 0.01) * 100}%`,
                  background: `radial-gradient(closest-side, rgba(${p.glow},0.55) 0%, rgba(${p.glow},0.22) 45%, rgba(${p.glow},0) 100%)`,
                }}
              />
            )}
            {p.glints?.map((g, i) => (
              <span key={i} className="fav-glint" style={{ left: `${g.x}%`, top: `${g.y}%`, width: g.size, height: g.size, animationDuration: `${g.dur}s`, animationDelay: `${g.delay}s` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 2行目：番地か地番（地図で選んだ所はそう書く）と、保存した・調べた日時（書類・出力の一覧も同じ。components/app/docs.tsx） */
export function placeSubLine(f: FavoriteItem, time: string): string {
  if (f.ll) return `地図で選んだ場所・${time}`;
  const { city, town, full, chiban } = placeParts(f);
  const tail = city && full.startsWith(city) ? full.slice(city.length).trim() : full;
  const num = town && tail.startsWith(town) ? tail.slice(town.length).trim() : "";
  return num ? `${chiban ? "地番" : "番地"}：${num}・${time}` : time;
}

/** 物件を乗せる板（ホームの最近の検索より少し濃いすりガラス。透けすぎると字が読みにくいので。色は app/globals.css の --glass-board-bg。書類・出力も同じ） */
export const BOARD: CSSProperties = {
  background: "var(--glass-board-bg)",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 30px rgba(0,0,0,0.22)",
  backdropFilter: "blur(22px) saturate(160%)",
  WebkitBackdropFilter: "blur(22px) saturate(160%)",
};
/**
 * いつもの画面の寸法（pt）：検索欄の下の端（ホームと同じ位置）、検索欄と板のあいだ、板の中の見出しの行（「最近保存した物件　すべて見る」と線）、
 * 行の高さ、下の余白。下のメニューの高さ（富士山の位置を測る前の見積もりに使う）
 */
const LAYOUT = { searchBottom: 256, compactSearchBottom: 202, gap: 24, head: 45, row: 63, bottom: 14, nav: 59 };

/**
 * 富士山のふもとが、いつもの画面のどこに来るか（pt。ページの上から）。写真の置き方は fujiFrame（写真の箱と同じ計算）。
 * 写真（.fav-backdrop）の大きさや、時間帯で写真が変わったら測り直す
 */
function useFujiFoot(root: RefObject<HTMLElement | null>, screen: number | undefined, photo: FavPhoto): number | undefined {
  const [foot, setFoot] = useState<number>();
  useEffect(() => {
    const el = root.current;
    const back = document.querySelector<HTMLElement>(".fav-backdrop");
    if (!el || !back) return;
    const measure = () => {
      const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-zoom")) || 1;
      const b = back.getBoundingClientRect();
      const sc = el.closest<HTMLElement>("[data-scroller]");
      // 写真と同じ置き方（頂を検索欄の少し下へ寄せたあと）で、ふもとの高さを出す
      const f = fujiFrame(b.width, b.height, photo, peakTarget((sc?.clientHeight ?? b.height) / zoom) * zoom);
      setFoot((b.top + f.at(photo.fuji.foot) - el.getBoundingClientRect().top) / zoom);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(back);
    return () => ro.disconnect();
  }, [root, screen, photo]);
  return foot;
}

/**
 * 一覧が「富士山の下」⇄「検索欄のすぐ下」へ移ったとき（key が変わったとき。時間帯で写真が変わり、ふもとの高さが変わったときも）、
 * 前の位置から滑らせる（移ったあとで、前の位置との差を 0 へ戻していく）。
 * すりガラスの後ろがぼけるよう、動かすのは位置だけ（薄くしない）。動きを減らす設定では、すぐ切り替える
 */
function useSlide(el: RefObject<HTMLElement | null>, key: string) {
  const last = useRef<{ key: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) {
      last.current = null;
      return;
    }
    const top = node.getBoundingClientRect().top;
    const prev = last.current;
    last.current = { key, top };
    if (!prev || prev.key === key || Math.abs(prev.top - top) < 1 || reducedMotion()) return;
    const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-zoom")) || 1;
    node.animate([{ transform: `translateY(${(prev.top - top) / zoom}px)` }, { transform: "translateY(0)" }], { duration: 480, easing: "cubic-bezier(0.22, 0.9, 0.24, 1)" });
  });
}
/** 章の見出し（ホームの「最近の検索」と同じ、控えめな白の字。書類・出力も同じ） */
export const LABEL: CSSProperties = { fontSize: 15, letterSpacing: 1.5, color: "rgba(255,255,255,0.62)" };

export function FavoritesPage({
  favorites,
  onPick,
  onDocs,
  onRemove,
  onHome,
  onMenu,
  unread,
  banner,
  all,
  onAll,
}: {
  favorites: FavoriteItem[];
  onPick: (f: FavoriteItem) => void;
  /** その物件の書類を作る（レポートの画面） */
  onDocs: (f: FavoriteItem) => void;
  /** お気に入りから外す（行がたたまれてから呼ぶ。「元に戻す」は mobile-app.tsx が出す） */
  onRemove: (f: FavoriteItem) => void;
  onHome: () => void;
  /** 右上のメニュー（≡。ホームと同じ） */
  onMenu: () => void;
  unread: boolean;
  banner?: ReactNode;
  /** すべて見るの画面を開いているか（mobile-app.tsx が持つ。下のメニューのお気に入りをもう一度押すと閉じる） */
  all: boolean;
  onAll: (open: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const screen = useScreenHeight(root);
  useShrink(root, BAR_AT);
  const [q, setQ] = useState("");
  const [byCity, setByCity] = useState(false);
  // 並べ方を変えたあとは、行をすぐ出し始める（開いたときは見出しや欄が浮き上がるのを待つ）
  const [resorted, setResorted] = useState(false);
  // たたんでいる途中の行（星を押した）
  const [leaving, setLeaving] = useState<string[]>([]);
  // いつもの画面 ⇄ すべて見るのつながる動きの間（板・行・検索欄に名前を付ける）
  const [morph, setMorph] = useState(false);
  const now = useNow();
  const list = favorites.filter((f) => matches(f, q));
  // 横向き・キーボードで画面が低いときは、ホームと同じく余白を詰める
  const compact = screen !== undefined && screen < 520;

  // いつもの画面：検索欄と一覧のあいだを富士山の窓にする。一覧の板は富士山のふもとより下に、入るだけ（スクロールしない）。
  // 横向きなど低い画面は、検索欄のすぐ下から
  const h = screen ?? 700;
  const part = useDayPart(favPart);
  const photo = FAV_PHOTOS[part];
  const foot = useFujiFoot(root, screen, photo);
  // 板の上の端：検索欄のすぐ下か、富士山のふもとより下。行は板の中の見出しの下に、入るだけ
  const nearTop = (compact ? LAYOUT.compactSearchBottom : LAYOUT.searchBottom) + LAYOUT.gap;
  const boardTop = compact ? nearTop : Math.max(nearTop, foot ?? (h + LAYOUT.nav) * photo.fuji.foot);
  const fit = Math.max(1, Math.floor((h - boardTop - LAYOUT.head - LAYOUT.bottom) / LAYOUT.row));
  const shown = list.slice(0, fit);
  // 絞り込みの欄に触れている間（キーボードが出ている間）は、一覧を検索欄のすぐ下へ滑らせる（下に置いたままだとキーボードに隠れる）。
  // 離したら富士山の下へ戻る。行を押した指の下で板が動かないよう、戻るのは少し待ってから
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef(0);
  useEffect(() => () => clearTimeout(typingTimer.current), []);
  const section = useRef<HTMLElement>(null);
  useSlide(section, `${typing}:${part}`);
  // つながる動きで結ぶ行（いつもの画面の何行目か）
  const rowIndex = new Map(shown.map((f, i) => [favoriteKey(f), i]));
  const rowVt = (f: FavoriteItem) => {
    const i = morph ? rowIndex.get(favoriteKey(f)) : undefined;
    return i === undefined ? undefined : VT.row(i);
  };

  /** 星を押した：星が抜けて行がたたまれてから外す（動きを減らす設定ではすぐ外す） */
  const release = (f: FavoriteItem) => {
    const key = favoriteKey(f);
    if (leaving.includes(key)) return;
    if (reducedMotion()) {
      onRemove(f);
      return;
    }
    setLeaving((l) => [...l, key]);
    // ページを離れていても外す（「元に戻す」で戻せる）
    window.setTimeout(() => {
      onRemove(f);
      setLeaving((l) => l.filter((k) => k !== key));
    }, LEAVE_MS);
  };

  /** いつもの画面 ⇄ すべて見る（板と行と検索欄が滑ってつながる。対応していない端末・動きを減らす設定ではそのまま切り替える） */
  const toAll = (open: boolean) => {
    const scroller = root.current?.closest<HTMLElement>("[data-scroller]");
    if (typeof document.startViewTransition !== "function" || reducedMotion()) {
      onAll(open);
      scroller?.scrollTo(0, 0);
      return;
    }
    flushSync(() => setMorph(true));
    const html = document.documentElement;
    html.classList.add("vt-fav");
    const t = document.startViewTransition(() => {
      flushSync(() => onAll(open));
      scroller?.scrollTo(0, 0);
    });
    const done = () => {
      html.classList.remove("vt-fav");
      setMorph(false);
    };
    t.finished.then(done, done);
    t.ready.catch(() => {});
  };

  const row = (f: FavoriteItem, i: number, stagger: number) => {
    const key = favoriteKey(f);
    return (
      <FavRow
        key={key}
        item={f}
        time={when(f.at, now)}
        leaving={leaving.includes(key)}
        vt={rowVt(f)}
        style={delay(q ? 0 : stagger + Math.min(i, 9) * 45)}
        onPick={() => onPick(f)}
        onDocs={() => onDocs(f)}
        onRelease={() => release(f)}
      />
    );
  };

  const search = (
    <form
      role="search"
      className="fav-search relative"
      style={{ margin: all ? "18px 19px 0" : `${compact ? 20 : 74}px 19px 0` }}
      onSubmit={(e) => {
        e.preventDefault();
        inputRef.current?.blur();
      }}
      onFocus={() => {
        clearTimeout(typingTimer.current);
        setTyping(true);
      }}
      onBlur={() => {
        clearTimeout(typingTimer.current);
        typingTimer.current = window.setTimeout(() => setTyping(false), 140);
      }}
    >
      {/* ホームの検索欄と同じ形・大きさ・すりガラス */}
      <div
        data-vt-tab="vt-search"
        className="flex items-center rounded-full transition-[box-shadow] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.28)]"
        style={{ ...LIGHT_GLASS, height: "max(56px, 3.3em)", fontSize: 17, viewTransitionName: morph ? VT.search : undefined }}
      >
        <Search size={22} strokeWidth={1.9} absoluteStrokeWidth color="#fff" className="ml-[20px] shrink-0" />
        <ScaledInput value={q} onChange={setQ} inputRef={inputRef} size={17} className="ml-[13px] mr-[4px]" label="お気に入りを絞り込む" autoComplete="off" placeholder="町名・市区町村でしぼる" onPhoto />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="入力を消す" className="mr-[4px] flex shrink-0 items-center justify-center" style={{ width: HIT, height: HIT }}>
            <span className="flex items-center justify-center rounded-full bg-white/25" style={{ width: 20, height: 20 }}>
              <X size={12} strokeWidth={2.4} absoluteStrokeWidth color="#fff" />
            </span>
          </button>
        )}
      </div>
    </form>
  );

  // まだ無いとき：低いカード（富士山にかからないよう、星は見出しの横に）
  const empty = (
    <div className="fav-rise rounded-[22px] px-[20px] pb-[16px] pt-[15px]" style={{ ...BOARD, ...delay(200) }}>
      <p className="flex items-center gap-[8px] font-medium leading-[1.4]" style={{ fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
        <Star size={19} strokeWidth={1.7} absoluteStrokeWidth color="#ffc94a" className="fav-empty-star shrink-0" style={{ filter: "drop-shadow(0 0 6px rgba(255,196,74,0.6))" }} />
        保存した物件はまだありません
      </p>
      <p className="mt-[5px] leading-[1.6]" style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
        物件を調べた画面の右上や下の操作バーの ☆ を押すと、ここに並びます。履歴の行の ☆ からも保存できます。
      </p>
      <button onClick={onHome} className="press mt-[11px] flex items-center gap-[7px] rounded-full bg-white px-[18px] font-semibold" style={{ height: HIT, fontSize: 15, color: "#1b3f73" }}>
        <Search size={17} strokeWidth={2.1} absoluteStrokeWidth />
        ホームで調べる
      </button>
    </div>
  );

  const noMatch = (
    <div className="fav-rise rounded-[22px] px-[20px] py-[16px] text-center" style={BOARD}>
      <p className="font-medium" style={{ fontSize: 15.5, color: "rgba(255,255,255,0.95)" }}>
        当てはまる物件がありません
      </p>
      <p className="mt-[4px]" style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
        絞り込みの文字を変えてみてください。
      </p>
    </div>
  );

  // ── いつもの画面（スクロールしない） ──
  if (!all)
    return (
      <div ref={root} className="fav-page app-touch relative flex flex-col overflow-hidden text-white" style={{ height: screen }}>
        {/* ロゴと右上のメニュー（4ページで同じ）と、ページの名前（components/app/page-head.tsx） */}
        <BrandBar onMenu={onMenu} unread={unread} />
        <PageTitle en="FAVORITES" ja="お気に入り" count={favorites.length} intro={!morph} />
        {search}
        {/* 富士山の窓（画面の高さで伸び縮みする）。絞り込みの欄に触れている間はたたんで、一覧を検索欄のすぐ下へ */}
        {!typing && <div aria-hidden className="flex-1" />}
        {/* 最近保存した物件（新しく保存した順。富士山のふもとより下に、入るだけ） */}
        <section ref={section} className="relative" style={{ padding: `${LAYOUT.gap}px 19px ${LAYOUT.bottom}px` }}>
          {favorites.length === 0 ? (
            empty
          ) : list.length === 0 ? (
            noMatch
          ) : (
            // 見出し（「最近保存した物件　すべて見る（n件）›」）は板の中のいちばん上に。写真の町並みや湖の明るさに字が埋もれない
            <div className="fav-rise overflow-hidden rounded-[22px]" style={{ ...BOARD, ...delay(170), viewTransitionName: morph ? VT.card : undefined }}>
              <div className="flex items-center justify-between gap-x-[8px] border-b border-white/[0.12] pl-[18px] pr-[6px]" style={{ minHeight: LAYOUT.head - 1 }}>
                <h2 className="truncate font-semibold leading-[1.3]" style={{ ...LABEL, fontSize: 14, letterSpacing: 1.2 }}>
                  {q ? `「${q}」に当てはまる物件` : "最近保存した物件"}
                </h2>
                <button
                  onClick={() => toAll(true)}
                  className="press group flex shrink-0 items-center gap-[2px] rounded-full px-[8px] transition-[background-color,opacity] active:bg-white/15"
                  style={{ minHeight: HIT, fontSize: 14, color: "rgba(255,255,255,0.78)" }}
                >
                  すべて見る{list.length > shown.length ? `（${list.length}件）` : ""}
                  <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth className="transition-transform duration-200 group-active:translate-x-[3px]" />
                </button>
              </div>
              <ul>{shown.map((f, i) => row(f, i, 230))}</ul>
            </div>
          )}
        </section>
        {/* 読み込み中・お知らせの札は、下に浮かせて出す（いつもの画面はスクロールしないので、物件の数を変えない） */}
        {banner && <div className="pointer-events-auto absolute inset-x-[19px] bottom-[14px] z-10">{banner}</div>}
      </div>
    );

  // ── すべて見る（スクロールできる） ──
  const groups: { label: string; items: FavoriteItem[] }[] = [];
  if (byCity) {
    const m = new Map<string, FavoriteItem[]>();
    for (const f of list) {
      const k = f.city ?? "対応エリアの外";
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    for (const [label, items] of [...m.entries()].sort((a, b) => b[1].length - a[1].length)) groups.push({ label, items });
  } else groups.push({ label: "", items: list });
  const order = new Map<string, number>();
  groups.flatMap((g) => g.items).forEach((f, i) => order.set(favoriteKey(f), i));
  const base = resorted ? 0 : 170;
  return (
    <div ref={root} className="fav-page app-touch relative text-white" style={{ minHeight: screen }}>
      {/* スクロールすると上に出る細いバー（押すといちばん上へ） */}
      <div className="pointer-events-none sticky top-0 z-20 h-0">
        <button
          onClick={() => root.current?.closest<HTMLElement>("[data-scroller]")?.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" })}
          className="fav-bar flex w-full items-center justify-center gap-[6px]"
          style={{ height: 50, background: "linear-gradient(180deg, rgba(14,24,42,0.62) 0%, rgba(14,24,42,0.5) 100%)", borderBottom: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(20px) saturate(140%)", WebkitBackdropFilter: "blur(20px) saturate(140%)" }}
          aria-label="いちばん上へ"
          tabIndex={-1}
        >
          <Star size={15} strokeWidth={1.8} absoluteStrokeWidth color="#ffc94a" fill="#ffc94a" />
          <span className="font-semibold" style={{ fontSize: 16.5, letterSpacing: 0.6 }}>
            すべてのお気に入り
          </span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>{favorites.length}件</span>
        </button>
      </div>

      {/* 戻るボタンと見出し */}
      <div className="relative flex items-center gap-[12px]" style={{ padding: "16px 18px 0 16px" }}>
        <button onClick={() => toAll(false)} aria-label="お気に入りに戻る" className="press flex shrink-0 items-center justify-center rounded-full" style={{ ...LIGHT_GLASS, width: 46, height: 46, minWidth: HIT, minHeight: HIT }}>
          <ChevronLeft size={24} strokeWidth={2} absoluteStrokeWidth color="#fff" />
        </button>
        <div className="min-w-0">
          <h1 className="fav-rise truncate font-bold" style={{ fontSize: 22, lineHeight: "28px", letterSpacing: 1.2, textShadow: SHADOW }}>
            すべてのお気に入り
          </h1>
          <p className="fav-rise mt-[2px] truncate" style={{ fontSize: 13, letterSpacing: 0.6, color: "rgba(255,255,255,0.8)", textShadow: SHADOW, ...delay(60) }}>
            {favorites.length}件・この端末だけに保存（最大50件）
          </p>
        </div>
      </div>

      {search}

      {/* 並べ方（白い札が滑る） */}
      <div role="radiogroup" aria-label="並べ方" className="fav-rise relative flex rounded-full" style={{ ...LIGHT_GLASS, minHeight: HIT, height: 44, padding: 3, margin: "12px 19px 0", ...delay(140) }}>
        <span aria-hidden className="fav-thumb absolute rounded-full" style={{ top: 3, bottom: 3, left: 3, width: "calc(50% - 3px)", transform: byCity ? "translateX(100%)" : "none" }} />
        {(
          [
            ["新しい順", false],
            ["市区町村ごと", true],
          ] as const
        ).map(([label, v]) => (
          <button
            key={label}
            role="radio"
            aria-checked={byCity === v}
            onClick={() => {
              if (byCity === v) return;
              setResorted(true);
              setByCity(v);
            }}
            className="relative flex-1 rounded-full font-semibold transition-colors duration-300"
            style={{ fontSize: 14, letterSpacing: 0.4, color: byCity === v ? "#1b3f73" : "#fff" }}
          >
            {label}
          </button>
        ))}
      </div>

      {banner && <div className="relative mt-[10px] px-[19px]">{banner}</div>}

      {/* すべての物件（並べ方を変えたら作り直して、行が順に入れ替わる） */}
      <section key={byCity ? "city" : "new"} className="relative" style={{ padding: "18px 19px 24px" }}>
        {favorites.length === 0
          ? empty
          : list.length === 0
            ? noMatch
            : groups.map((g, gi) => (
                <div key={g.label || "all"} style={{ marginTop: gi ? 16 : 0 }}>
                  {g.label && (
                    <div className="fav-rise flex h-[34px] items-center justify-between px-[4px]" style={{ marginBottom: 6, ...delay(q ? 0 : base + gi * 60) }}>
                      <h2 className="truncate font-semibold leading-none" style={LABEL}>
                        {g.label}
                      </h2>
                      <span className="shrink-0" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
                        {g.items.length}件
                      </span>
                    </div>
                  )}
                  <ul className="fav-rise overflow-hidden rounded-[22px]" style={{ ...BOARD, ...delay(q ? 0 : base + 20 + gi * 60), viewTransitionName: morph && gi === 0 ? VT.card : undefined }}>
                    {g.items.map((f) => row(f, order.get(favoriteKey(f)) ?? 0, base + 80))}
                  </ul>
                </div>
              ))}
        <p className="fav-rise mt-[16px] px-[4px] leading-[1.6]" style={{ fontSize: 11.5, color: "rgba(255,255,255,0.66)", textShadow: SHADOW, ...delay(320) }}>
          地図・データは参考情報です。MICHILUは判定をしません。重要事項説明などの最終確認は、必ず役所の窓口・公的な資料で行ってください。
        </p>
      </section>
    </div>
  );
}

/** 保存した物件の1行（市区町村と町名・番地と日時）。右に書類と★ */
function FavRow({
  item,
  time,
  leaving,
  vt,
  style,
  onPick,
  onDocs,
  onRelease,
}: {
  item: FavoriteItem;
  time: string;
  leaving: boolean;
  vt?: string;
  style: CSSProperties;
  onPick: () => void;
  onDocs: () => void;
  onRelease: () => void;
}) {
  const { city, town, full } = placeParts(item);
  return (
    <li className={`fav-row border-t border-white/[0.12] first:border-t-0 ${leaving ? "fav-leaving" : ""}`} style={{ ...style, viewTransitionName: vt }}>
      <div className="fav-row-in flex items-center">
        <button onClick={onPick} aria-label={`${full}を開く`} className="flex min-h-[62px] min-w-0 flex-1 flex-col justify-center py-[9px] pl-[18px] pr-[4px] text-left transition-colors active:bg-white/10">
          <span className="block truncate font-medium leading-[1.3]" style={{ fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
            {city && town ? `${city}${town}` : full}
          </span>
          <span className="mt-[3px] block truncate leading-[1.3]" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            {placeSubLine(item, time)}
          </span>
        </button>
        <button onClick={onDocs} aria-label="この物件の書類を作る" className="press flex shrink-0 items-center justify-center rounded-full active:bg-white/10" style={{ width: HIT, height: HIT }}>
          <FileText size={20} strokeWidth={1.8} absoluteStrokeWidth color="rgba(255,255,255,0.72)" />
        </button>
        <button onClick={onRelease} aria-label="お気に入りから外す" className="mr-[6px] flex shrink-0 items-center justify-center rounded-full active:bg-white/10" style={{ width: HIT, height: HIT }}>
          <Star size={21} strokeWidth={1.7} absoluteStrokeWidth color="#ffc94a" fill="#ffc94a" className={leaving ? "fav-star-off" : ""} style={{ filter: "drop-shadow(0 0 6px rgba(255,196,74,0.55))" }} />
        </button>
      </div>
    </li>
  );
}

/** 外したあとに下に出る「元に戻す」（5 秒で消える）。消えるときは少し下がって薄れる */
export function UndoToast({ item, onUndo, onClose }: { item: FavoriteItem; onUndo: () => void; onClose: () => void }) {
  const [out, setOut] = useState(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const t1 = window.setTimeout(() => setOut(true), UNDO_MS);
    const t2 = window.setTimeout(() => close.current(), UNDO_MS + 240);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [item]);
  const { town, full } = placeParts(item);
  return (
    <div role="status" className={`fav-toast pointer-events-auto flex max-w-full items-center gap-[10px] rounded-full py-[4px] pl-[16px] pr-[4px] text-white ${out ? "fav-toast-out" : ""}`} style={{ ...DARK_GLASS, minHeight: 52 }}>
      <Star size={16} strokeWidth={1.8} absoluteStrokeWidth color="rgba(255,255,255,0.75)" className="shrink-0" />
      <span className="min-w-0 truncate" style={{ fontSize: 14 }}>
        「{town || full}」を外しました
      </span>
      <button onClick={onUndo} className="press shrink-0 rounded-full bg-white px-[15px] font-semibold" style={{ height: HIT, fontSize: 14, color: "#1b3f73" }}>
        元に戻す
      </button>
    </div>
  );
}
