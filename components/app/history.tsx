"use client";

// スマホの下のメニューの「履歴」。お気に入り・書類・出力と同じ作り：画面いっぱいの背景（届いた住宅街の絵。朝・昼・夕方・夜で切り替える。
// 下のメニューの後ろまで敷くので、components/app/mobile-app.tsx が HistoryBackdrop で画面のいちばん奥に置く）の上に、
// ホームと同じ位置に見出し「履歴」と右上のメニュー（≡）、2行のひとこと（件数）、ホームと同じ検索欄（絞り込み）、写真を見せる空き、
// 調べた物件の一覧（日付ごと・市区町村ごとの章。すりガラスの板。行に写真は付けない）。一覧の初めの3行は、ホームの最近の検索と同じ高さに来る。
// 一覧はスクロールでき、スクロールすると写真が上へ寄って暗くなり、上に細いバー（押すといちばん上へ・虫めがねで絞り込み）が出る。
// 絞り込みの欄に触れている間・絞り込んでいる間は、調べ方の札（すべて・住所・地番・地図）が出て、一覧が検索欄のすぐ下へ滑り上がる
// （キーボードに隠れないように）。合う所は字に印を付ける。
// 行：押すと開く。☆でお気に入り。左へなぞると「コピー」「消す」（大きくなぞると、そのまま消す）。長押し（PC は右クリック、キーボードは
// Shift+F10 か ContextMenu キー、画面の読み上げは行の「その他の操作」）で、くわしい情報と操作のシート（開く・お気に入り・書類・コピー・消す）。
// キーボードの Delete でも消せる。消すと行がたたまれ、下に「元に戻す」（5秒。components/app/mobile-app.tsx が出す）。
// いちばん下の「履歴を消す…」で、過去1時間・今日・今日と昨日・すべてを選んで消せる。
// 動き（app/globals.css の .hist-*）：開くと背景がふわっと落ち着き、上から順に浮き上がり、行は少しずつ遅れて現れる。並べ方・調べ方を
// 変えると、行が新しい位置へ滑る（View Transitions。.vt-hist）。ホームの「最近の検索」の「すべて見る」から来たときは、行と板と検索欄が
// 滑ってつながる（home.tsx の VT）。≡ の「動きの演出」がオンのときは、背景がごくゆっくり寄り、朝日・夕日・月の光がゆっくり揺れる。
// 動きを減らす設定では、位置の動きを止める。
// 並べ方・消す範囲・コピーする文・日時の書き方は lib/app/history-view.ts
import { ArrowUpRight, Copy, FileText, Menu, MoreHorizontal, Search, Star, Trash2, X, type LucideIcon } from "lucide-react";
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { copyLabel, copyText, fullDate, groupByProperty, inRange, KIND_LABEL, kindOf, markOf, matches, propertyCount, rangeCounts, RANGES, recordsText, sections, stamp, type Grouped, type Kind, type Range, type Section } from "@/lib/app/history-view";
import { placeParts } from "@/lib/app/scene";
import { histPart, type HistPart } from "@/lib/app/sun";
import { historyKey, type HistoryItem } from "@/lib/history";
import { allRecords, recordsTopics, type PropertyRecords } from "@/lib/records";
import { latestResume } from "@/lib/resume";
import { Sheet } from "../sheet";
import { partNow, useDayLayers, useLayerEntry } from "./day-photo";
import { BOARD, LABEL, placeSubLine } from "./favorites";
import { PhoneImg, ScaledInput } from "./frame";
import { DARK_GLASS, HIT, LIGHT_GLASS, RECENT, SHADOW, useScreenHeight, VT } from "./home";
import { ClockBack } from "./icons";
import { TABS, tabOf } from "./result-head";
import { useShrink } from "./sky";
import { FavStar } from "./star";
import { useNow } from "./tab-pages";
import { reducedMotion } from "./tokens";
import { clearNames, nameVisible, scrollArea } from "./vt";

// ───────────────────────────── 背景 ─────────────────────────────

/**
 * 背景の写真（届いた住宅街の絵 4 枚。同じ通りを同じ場所から写した 朝・昼・夕方・夜。public/history/。941 幅の webp で、写真の情報は消してある）。
 * 太陽の高さで切り替える（lib/app/sun.ts の histPart。朝は日の出の約 15 分前から約 1 時間 30 分後まで。夕方・夜の境目は書類・出力と同じ）。
 * 構図が同じなので、時間帯が変わるときに重ねると、同じ通りの時間が進んだように見える。
 * ar は写真の縦横比（幅÷高さ）、x・y は写真が画面より大きいときに切る位置（0〜1。通りが真ん中、朝日・夕日・月が右に入る位置）、
 * bg は読み込むまでの地の色、top は時刻・電池の帯の色（写真のいちばん上に shade を重ねた色）、shade は見出し・一覧・下のメニューのための
 * 暗いぼかし（空の明るい朝・昼・夕方は、見出しの白い字が読めるよう左上を暗くする）、glow は朝日・夕日・月の光（≡ の「動きの演出」がオンの
 * ときだけ、ゆっくり明るさが揺れる。x・y は写真の中の %、w は写真の幅に対する %）
 */
type HistPhoto = { src: string; ar: number; x: number; y: number; bg: string; top: string; shade: string; glow?: { x: number; y: number; w: number; bg: string } };
/** 下の方（一覧・下のメニュー）の暗さ（どの写真も同じ） */
const LOW = "rgba(0,0,0,0) 52%, rgba(3,8,18,0.32) 78%, rgba(3,8,18,0.46) 100%";
const PHOTOS: Record<HistPart, HistPhoto> = {
  /** 朝：右の木の向こうから朝日が差し、もやのかかった山並みと通学の人（1438×2576 を縮小）。空が明るいので左上を強めに暗くする */
  morning: {
    src: "/history/morning.webp",
    ar: 941 / 1686,
    x: 0.62,
    y: 0.4,
    bg: "#5f6466",
    top: "#4f5a63",
    shade: `radial-gradient(95% 30% at 22% 8%, rgba(12,26,46,0.5) 0%, rgba(12,26,46,0.22) 55%, rgba(12,26,46,0) 100%), linear-gradient(180deg, rgba(10,22,40,0.46) 0%, rgba(10,22,40,0.2) 16%, rgba(10,22,40,0.06) 28%, rgba(0,0,0,0) 40%, ${LOW})`,
    // 写真に朝日の光の筋がもうあるので、光は控えめに（背の低い画面では朝日が検索欄の後ろに来る）
    glow: { x: 96.5, y: 27, w: 48, bg: "radial-gradient(circle, rgba(255,236,190,0.38) 0%, rgba(255,214,150,0.14) 24%, rgba(255,200,130,0.04) 46%, rgba(255,200,130,0) 64%)" },
  },
  /** 昼：青空と夏の雲、日傘の人と自転車 */
  day: {
    src: "/history/day.webp",
    ar: 941 / 1672,
    x: 0.5,
    y: 0.4,
    bg: "#4f6d8c",
    top: "#3a5c80",
    shade: `radial-gradient(95% 28% at 22% 8%, rgba(10,30,60,0.36) 0%, rgba(10,30,60,0.14) 55%, rgba(10,30,60,0) 100%), linear-gradient(180deg, rgba(8,22,44,0.38) 0%, rgba(8,22,44,0.14) 16%, rgba(0,0,0,0) 32%, ${LOW})`,
  },
  /** 夕方：山の向こうへ沈む夕日（右）と、家へ帰る人たち */
  evening: {
    src: "/history/evening.webp",
    ar: 941 / 1670,
    x: 0.6,
    y: 0.4,
    bg: "#5a4a50",
    top: "#4a4352",
    shade: `radial-gradient(95% 28% at 22% 8%, rgba(20,18,40,0.32) 0%, rgba(20,18,40,0.12) 55%, rgba(20,18,40,0) 100%), linear-gradient(180deg, rgba(14,16,34,0.36) 0%, rgba(14,16,34,0.12) 16%, rgba(0,0,0,0) 32%, ${LOW})`,
    glow: { x: 88, y: 22.3, w: 56, bg: "radial-gradient(circle, rgba(255,214,150,0.6) 0%, rgba(255,170,100,0.24) 20%, rgba(255,140,90,0.06) 45%, rgba(255,140,90,0) 65%)" },
  },
  /** 夜：満月と、街灯・窓の明かりの通り */
  night: {
    src: "/history/night.webp",
    ar: 941 / 1672,
    x: 0.6,
    y: 0.4,
    bg: "#151b24",
    top: "#121922",
    shade: `linear-gradient(180deg, rgba(5,14,32,0.34) 0%, rgba(5,14,32,0) 28%, ${LOW})`,
    glow: { x: 81, y: 9.5, w: 26, bg: "radial-gradient(circle, rgba(232,240,255,0.55) 0%, rgba(205,220,255,0.24) 16%, rgba(190,205,255,0.08) 38%, rgba(190,205,255,0) 64%)" },
  },
};

/** 履歴のページの時刻・電池の帯の色（いまの時間帯の背景のいちばん上の色） */
export function historyTop(): string {
  return PHOTOS[partNow(histPart)].top;
}

/** スクロールで背景が寄りきるまでの量（px） */
const PARALLAX_RANGE = 360;

/**
 * 画面いっぱいの背景（下のメニューの後ろまで敷く。昼・夕方・夜で切り替え、変わるときはゆっくり重ねる。components/app/day-photo.ts）。
 * スクロールした量を --hist-p（0〜1）に書き、背景が上へ寄って暗くなる（動きの演出がオフ・動きを減らす設定では暗くなるだけ）。
 * 絞り込みの欄に触れている間は、少し暗くして欄を目立たせる
 */
export function HistoryBackdrop({ scroller, motion }: { scroller: RefObject<HTMLElement | null>; motion: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const { shown, layers, swapping, done } = useDayLayers(histPart);
  useEffect(() => {
    const el = box.current;
    const sc = scroller.current;
    if (!el || !sc) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      el.style.setProperty("--hist-p", Math.min(1, Math.max(0, sc.scrollTop / PARALLAX_RANGE)).toFixed(3));
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
    <div ref={box} aria-hidden data-part={shown} className={`hist-backdrop pointer-events-none absolute inset-0 overflow-hidden ${motion ? "hist-alive" : ""}`} style={{ background: PHOTOS[shown].bg }}>
      {layers.map((p) => (
        <HistScene key={p} part={p} swap={p === shown && swapping} onShown={done} motion={motion} />
      ))}
      <div className="hist-dim absolute inset-0" />
      <div className="hist-focus absolute inset-0" />
    </div>
  );
}

/**
 * 1枚の背景（写真と、その写真の暗いぼかし・朝日・夕日・月の光）。写真は読み込めてから現れる（components/app/day-photo.ts の useLayerEntry）。
 * ぼかしは写真ごとに違うので、写真と一緒に重なって入れ替わる
 */
function HistScene({ part, swap, onShown, motion }: { part: HistPart; swap: boolean; onShown: () => void; motion: boolean }) {
  const p = PHOTOS[part];
  const { className, onLoad } = useLayerEntry(swap, onShown);
  return (
    <div className={`absolute inset-0 ${className}`}>
      <div className="hist-stage" style={{ "--hist-ar": p.ar, "--hist-x": p.x, "--hist-y": p.y } as CSSProperties}>
        <div className="hist-drift absolute inset-0">
          <PhoneImg
            src={p.src}
            alt=""
            draggable={false}
            decoding="async"
            onLoad={onLoad}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `${p.x * 100}% ${p.y * 100}%` }}
          />
          {motion && p.glow && <span className="hist-glow" style={{ left: `${p.glow.x}%`, top: `${p.glow.y}%`, width: `${p.glow.w}%`, background: p.glow.bg }} />}
        </div>
      </div>
      <div className="absolute inset-0" style={{ background: p.shade }} />
    </div>
  );
}

// ───────────────────────────── 一覧 ─────────────────────────────

/**
 * 寸法（pt）：検索欄の下の端（ホームと同じ位置。背の低い画面は詰めた位置）、一覧の下の余白（ホームの最近の検索と同じ）、
 * 初めの画面に入れる行の数（ホームの最近の検索と同じ3行）、写真を見せる空きの最小
 */
const LAYOUT = { searchBottom: 256, compactSearchBottom: 202, bottom: 22, rows: RECENT, minWindow: 28 };
/** 見出しの細いバーを出すスクロールの量（pt） */
const BAR_AT = 96;
/** 行がたたまれるまで（app/globals.css の .hist-leaving と同じ） */
const LEAVE_MS = 340;
/** なぞって消した行が左へ抜けきるまで（そのあとでたたむ） */
const SLIDE_MS = 150;
/** 長押しとみなす時間 */
const HOLD_MS = 460;
/** なぞると出る操作（コピー・消す）の幅と、板の幅（393 − 左右 19） */
const ACT_W = 78;
const OPEN_W = ACT_W * 2;
const ROW_W = 355;
/** ここより大きくなぞって離すと、そのまま消す（板の幅に対する割合） */
const FULL_AT = 0.56;
/** 「元に戻す」を出しておく時間 */
const UNDO_MS = 5000;
/** 現れる動きを付ける行の数（初めの画面に入る分。履歴は 200 件まで残るので、画面の外の行まで動かさない） */
const ENTER_ROWS = 14;
/**
 * 一度に描く行の数。履歴は 200 件まで残るので、初めは画面に入る分より少し多く描き、下へスクロールして終わりが近づいたら足していく
 * （200 行を一度に描くと、開く・並べ替えるたびに一瞬止まるので）
 */
const PAGE_ROWS = 40;

/** 章を、上から n 行までに切る（total は切る前のその章の行の数。章の見出しの件数に出す） */
function cutSections(secs: readonly Section[], n: number): (Section & { total: number })[] {
  const out: (Section & { total: number })[] = [];
  let left = n;
  for (const s of secs) {
    if (left <= 0) break;
    const rows = s.rows.slice(0, left);
    left -= rows.length;
    out.push({ label: s.label, rows, total: s.rows.length });
  }
  return out;
}
/** 現れるときの動きの遅れ */
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });
/** 画面の拡大率（指の動き（画面の px）を絵の大きさ（pt）に直す） */
const zoomNow = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-zoom")) || 1;
/** 引っぱりすぎたときの手応え（max に近づくほど動かなくなる） */
const rubber = (x: number, max: number) => max * (1 - 1 / (x / max + 1));

const KINDS: { key: Kind | "all"; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "address", label: "住所" },
  { key: "chiban", label: "地番" },
  { key: "map", label: "地図" },
];

/** 消す行の動き：遅れ（ms）と、なぞって消したか（左へ抜けてからたたむ） */
type Leave = { delay: number; slid: boolean };
/** 絞り込んで出ている物件（「履歴を消す…」で、これだけを消せる。text は絞り込みの説明） */
type Narrowed = { rows: Grouped[]; text: string };
/** 「履歴を消す…」のシートの中身（開いたときの時刻と、絞り込んで出ている物件。閉じる動きの間も同じものを出す） */
type ClearState = { at: number; narrowed: Narrowed | null };
type SheetState = { type: "row"; g: Grouped } | ({ type: "clear" } & ClearState) | null;

/** 下から出す画面は document.body に出す（拡大・縮小している枠の外に置く） */
const noop = () => () => {};
function BodyPortal({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return client ? createPortal(<div className="theme-navy">{children}</div>, document.body) : null;
}

/** クリップボードへ書く（使えない端末は、選んでコピーできる窓を出す） */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("コピーしてください", text);
    return false;
  }
}

/** 字の中の、絞り込みの文字に合う所に印を付ける */
function marked(text: string, q: string): ReactNode {
  const m = markOf(text, q);
  if (!m) return text;
  return (
    <>
      {m[0]}
      <mark className="hist-mark">{m[1]}</mark>
      {m[2]}
    </>
  );
}

/** 行の名前（市区町村と町名。無ければ住所のまま） */
function rowTitle(h: HistoryItem): string {
  const { city, town, full } = placeParts(h);
  return city && town ? `${city}${town}` : full;
}

type PlaceOpts = { filtering: boolean; screen: number; top: number; hold: boolean };
/** 置き直しのあいだで覚えておくもの：前の位置（offset の値）と、動いている途中の滑り */
type PlaceMemo = { last: number | null; anim: Animation | null };

/** 一覧を置き直す（usePlacement の中身。描き直したときと、一覧の大きさが変わったときに呼ぶ） */
function placeList(sec: HTMLElement | null, sp: HTMLElement | null, o: PlaceOpts, memo: PlaceMemo) {
  if (!sec || !sp || o.hold || !sec.offsetHeight) return;
  const z = zoomNow();
  // offset の値を絵の大きさに直す割合（拡大・縮小のしかたが端末で違っても合うように、実際の大きさとの比で出す）
  const ratio = sec.getBoundingClientRect().height / z / sec.offsetHeight;
  let gap = 14;
  if (!o.filtering) {
    // 初めの3行の下の端が、画面の下の端（の少し上）に来る空き。背の低い画面で入らなければ空きを小さくして、入るだけ見せる
    const rows = sec.querySelectorAll<HTMLElement>("li[data-row]");
    const r = rows[Math.min(LAYOUT.rows, rows.length) - 1];
    let y = r ? r.offsetHeight : sec.offsetHeight;
    let el: HTMLElement | null = r ?? null;
    while (el && el !== sec) {
      y += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    if (r && el !== sec) return;
    gap = Math.max(LAYOUT.minWindow, o.screen - o.top - y * ratio - LAYOUT.bottom);
  }
  sp.style.setProperty("height", `${Math.round(gap)}px`);
  const pos = sec.offsetTop;
  const prev = memo.last;
  memo.last = pos;
  if (prev === null || Math.abs(prev - pos) < 1 || reducedMotion()) return;
  // 動いている途中なら、いま見えている位置から続ける
  let from = (prev - pos) * ratio;
  if (memo.anim?.playState === "running") {
    from += new DOMMatrixReadOnly(getComputedStyle(sec).transform).m42 / z;
    memo.anim.cancel();
  }
  memo.anim = sec.animate([{ transform: `translateY(${from}px)` }, { transform: "translateY(0)" }], { duration: 480, easing: "cubic-bezier(0.22, 0.9, 0.24, 1)" });
}

/**
 * 一覧の置き場所。写真を見せる空き（spacer の高さ）を、初めの3行がホームの最近の検索と同じく画面の下の端に収まるように決める（背の低い画面で
 * 入らなければ、空きを小さくして入るだけ見せる）
 * （行の高さは札の数で変わるので、置いてから測る。測るのは動きの変形に左右されない offset の値で、絵の大きさ（pt）に直す）。
 * 絞り込んでいる間は、検索欄（と札）のすぐ下。置き場所が変わったら、前の位置から滑らせる（スクロールした分は含めずに比べる）。
 * 行をたたんでいる間（hold）は測らない（たたみ終わってから一度だけ置き直す）
 */
function usePlacement(list: RefObject<HTMLElement | null>, spacer: RefObject<HTMLElement | null>, o: PlaceOpts) {
  const opts = useRef(o);
  const memo = useRef<PlaceMemo>({ last: null, anim: null });
  // 描き直すたびに置き直す（変わっていなければ何もしない）
  useLayoutEffect(() => {
    opts.current = o;
    placeList(list.current, spacer.current, o, memo.current);
  });
  // 行の高さが変わったとき（字の読み込み・札の折り返しなど）も置き直す
  useEffect(() => {
    const sec = list.current;
    if (!sec) return;
    const ro = new ResizeObserver(() => placeList(list.current, spacer.current, opts.current, memo.current));
    ro.observe(sec);
    return () => ro.disconnect();
  }, [list, spacer]);
}

export function HistoryPage({
  history,
  isFavorite,
  onToggleFavorite,
  onPick,
  onDocs,
  onRemove,
  onNotice,
  onHome,
  onMenu,
  unread,
  morph = false,
}: {
  history: HistoryItem[];
  isFavorite: (h: HistoryItem) => boolean;
  onToggleFavorite: (h: HistoryItem) => void;
  onPick: (h: HistoryItem) => void;
  /** その物件の書類を作る（レポートの画面） */
  onDocs: (h: HistoryItem) => void;
  /** 履歴から消す（行がたたまれてから呼ぶ。「元に戻す」は mobile-app.tsx が出す） */
  onRemove: (items: HistoryItem[]) => void;
  /** 短いお知らせ（コピーしました など） */
  onNotice: (text: string) => void;
  onHome: () => void;
  /** 右上のメニュー（≡。ホームと同じ） */
  onMenu: () => void;
  unread: boolean;
  /** ホームの最近の検索とつながる動きの間（いちばん上の板・検索欄・最近の3件の行に、ホームと同じ名前を付ける。home.tsx の VT） */
  morph?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const screen = useScreenHeight(root);
  useShrink(root, BAR_AT);
  const now = useNow();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [byCity, setByCity] = useState(false);
  // 絞り込みの欄に触れている間（離したあと少し待つ。行や札を押した指の下で一覧が動かないように）
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef(0);
  useEffect(() => () => clearTimeout(typingTimer.current), []);
  // なぞって操作を出している行（1行だけ）
  const [openKey, setOpenKey] = useState<string | null>(null);
  // たたんでいる途中の行
  const [leaving, setLeaving] = useState<ReadonlyMap<string, Leave>>(() => new Map());
  const [sheet, setSheet] = useState<SheetState>(null);
  // 並べ方・調べ方を変えるときの、行が滑る動きの間（行に名前を付ける）
  const [listVt, setListVt] = useState(false);
  // 開いたときだけ上から順に浮き上がる（ホームの最近の検索からつながる動きで来たときは、つながる動きだけ）。少したったら、あとから出る行はすぐ出す
  const [intro] = useState(!morph);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(t);
  }, []);
  // あなたの確認の記録と、続きから（行の札に。ページを開くたびに読む）
  const [recs] = useState(() => new Map(allRecords().map((r) => [r.key, r])));
  const [resume] = useState(() => latestResume());
  // 消すのは行がたたまれてから。そのときの最新の一覧から消すよう、いちばん新しい onRemove を使う
  const removeRef = useRef(onRemove);
  useEffect(() => {
    removeRef.current = onRemove;
  });

  // 調べ方の札の件数（絞り込みの文字に合う物件の数＝その札を選んだときに出る行の数。同じ物件を何度調べても1件）
  const counts = useMemo(() => {
    const hit = history.filter((h) => matches(h, q));
    const of = (k: Kind) => propertyCount(hit.filter((h) => kindOf(h) === k));
    return { all: propertyCount(hit), address: of("address"), chiban: of("chiban"), map: of("map") } satisfies Record<Kind | "all", number>;
  }, [history, q]);
  // 調べた物件の数（見出しのひとこと・上の細いバー。同じ物件はまとめて1件＝一覧の行の数）
  const total = useMemo(() => propertyCount(history), [history]);
  // つながる動きの名前（行ごとに決まった番号）とホームの最近の検索の何番目か
  const index = useMemo(() => new Map(history.map((h, i) => [historyKey(h), i])), [history]);
  const list = history.filter((h) => (kind === "all" || kindOf(h) === kind) && matches(h, q));
  const rows = groupByProperty(list);
  // 描く行の数（下へスクロールして終わりが近づいたら足す。並べ方・絞り込みを変えても減らさない＝見ていた所が消えない）
  const [limit, setLimit] = useState(PAGE_ROWS);
  const secs = cutSections(sections(rows, byCity, now), limit);
  const more = rows.length > limit;
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = moreRef.current;
    const sc = root.current?.closest<HTMLElement>("[data-scroller]");
    if (!more || !el || !sc) return;
    // 終わりの目印が、画面の下の端から 900px 以内に来たら足す（足しても近ければ、作り直した監視がすぐもう一度足す）
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) startTransition(() => setLimit((l) => l + PAGE_ROWS));
    }, { root: sc, rootMargin: "0px 0px 900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, limit]);
  const filtering = typing || q.trim() !== "" || kind !== "all";

  // 横向き・キーボードで画面が低いときは、ホームと同じく余白を詰める
  const compact = screen !== undefined && screen < 520;
  // 写真を見せる空き：初めの3行がホームの最近の検索と同じく画面の下の端に。絞り込んでいる間は、検索欄（と札）のすぐ下
  usePlacement(listRef, spacerRef, { filtering, screen: screen ?? 700, top: compact ? LAYOUT.compactSearchBottom : LAYOUT.searchBottom, hold: leaving.size > 0 });

  // 行を開いている間は、スクロールしたり、ほかの所を押したりしたら閉じる
  useEffect(() => {
    if (!openKey) return;
    const sc = root.current?.closest<HTMLElement>("[data-scroller]");
    const close = () => setOpenKey(null);
    const down = (e: PointerEvent) => {
      const row = (e.target as Element | null)?.closest?.("[data-row]");
      if (row?.getAttribute("data-row") !== openKey) close();
    };
    sc?.addEventListener("scroll", close, { passive: true });
    document.addEventListener("pointerdown", down, true);
    return () => {
      sc?.removeEventListener("scroll", close);
      document.removeEventListener("pointerdown", down, true);
    };
  }, [openKey]);

  /** 行を消す（たたんでから消す。how はなぞって消したか。items を渡すと、その検索だけを消す） */
  const removeRows = (targets: Grouped[], how: "swipe" | "fade", items?: HistoryItem[]) => {
    const all = items ?? targets.flatMap((g) => g.members);
    if (!all.length) return;
    setOpenKey(null);
    if (reducedMotion()) {
      removeRef.current(all);
      return;
    }
    const keys = targets.map((g) => historyKey(g.item));
    const lead = how === "swipe" ? SLIDE_MS : 0;
    const step = keys.length > 1 ? 26 : 0;
    const last = Math.min(Math.max(0, keys.length - 1) * step, 360);
    setLeaving((m) => {
      const n = new Map(m);
      keys.forEach((k, i) => n.set(k, { delay: lead + Math.min(i * step, 360), slid: how === "swipe" }));
      return n;
    });
    window.setTimeout(() => {
      removeRef.current(all);
      setLeaving((m) => {
        const n = new Map(m);
        for (const k of keys) n.delete(k);
        return n;
      });
    }, lead + last + LEAVE_MS);
  };

  /** 範囲を選んで消す（過去1時間・今日・今日と昨日・すべて。t はシートを開いた時刻で、件数を数えたのと同じ）。全部消える行は順にたたむ */
  const clearRange = (range: Range, t: number) => {
    const items = history.filter((x) => inRange(x, range, t));
    const gone = new Set(items.map(historyKey));
    setSheet(null);
    removeRows(
      rows.filter((g) => g.members.every((m) => gone.has(historyKey(m)))),
      "fade",
      items,
    );
  };

  /** 絞り込んで出ている物件（文字か調べ方で絞っているときだけ） */
  const narrowedNow = (): Narrowed | null => {
    const t = q.trim();
    if ((!t && kind === "all") || !rows.length) return null;
    return { rows, text: [t && `「${t}」`, kind !== "all" && `${KIND_LABEL[kind]}で調べたもの`].filter(Boolean).join("・") };
  };

  const copy = async (x: HistoryItem) => {
    const text = copyText(x);
    if (await writeClipboard(text)) onNotice(`${copyLabel(x)}をコピーしました：${text}`);
  };

  /**
   * 並べ方・調べ方を変える：行が新しい位置へ滑り、並べ方の白い札が滑る（対応していない端末・動きを減らす設定では、そのまま切り替える）。
   * 名前（view-transition-name）は、変える前と後で画面に収まっている行にだけ付ける（components/app/vt.ts。画面の外へ・外から動く行は、
   * ほかの画面と一緒にふつうに重ねて入れ替える。名前の付いた行は動きの間いちばん手前に描かれ、下のメニューや上のバーの上を通るので）
   */
  const vtRun = useRef(0);
  const animateList = (apply: () => void) => {
    setOpenKey(null);
    const sc = scroller();
    if (typeof document.startViewTransition !== "function" || reducedMotion() || !sc || !listRef.current) {
      apply();
      return;
    }
    // 続けて押したときは、前の動きの後始末で今の動きの名前を外さない
    const run = ++vtRun.current;
    flushSync(() => setListVt(true));
    nameVisible(listRef.current, scrollArea(sc));
    const html = document.documentElement;
    html.classList.add("vt-hist");
    const t = document.startViewTransition(() => {
      flushSync(apply);
      nameVisible(listRef.current, scrollArea(sc));
    });
    const done = () => {
      if (run !== vtRun.current) return;
      html.classList.remove("vt-hist");
      clearNames(listRef.current);
      setListVt(false);
    };
    t.finished.then(done, done);
    t.ready.catch(() => {});
  };

  const scroller = () => root.current?.closest<HTMLElement>("[data-scroller]");

  // 上の細いバーに出す、いまの章（見出しがバーの下を通った、いちばん下の章。章の見出しに data-sec）。並べ方・絞り込みが変わったら数え直す
  const [cur, setCur] = useState<string | null>(null);
  const secKey = secs.map((s) => s.label).join("|");
  useEffect(() => {
    const sc = root.current?.closest<HTMLElement>("[data-scroller]");
    if (!sc) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const bar = root.current?.querySelector<HTMLElement>("[data-vt-cover]");
      const edge = (bar ? bar.getBoundingClientRect().bottom : sc.getBoundingClientRect().top) + 1;
      let label: string | null = null;
      for (const el of listRef.current?.querySelectorAll<HTMLElement>("[data-sec]") ?? []) {
        if (el.getBoundingClientRect().top >= edge) break;
        label = el.dataset.sec ?? null;
      }
      setCur(label);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    // 置いた直後も（描き終わってから）数える
    onScroll();
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      sc.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [secKey]);
  const toTop = () => scroller()?.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  /** 上の細いバーの虫めがね：いちばん上へ戻って、絞り込みの欄に入る（キーボードを出すため、押したその場で入る） */
  const toSearch = () => {
    inputRef.current?.focus({ preventScroll: true });
    toTop();
  };

  const recentIndex = (x: HistoryItem) => {
    const i = index.get(historyKey(x));
    return i !== undefined && i < RECENT ? i : undefined;
  };
  /** 行の札：続きから（前に見ていたタブ）、あなたの確認の記録（項目の名前）、同じ物件の件数（調べ方はシートに） */
  const pillsOf = (g: Grouped): ReactNode[] => {
    const out: ReactNode[] = [];
    if (resume && g.members.some((m) => historyKey(m) === resume.historyKey))
      out.push(
        <Pill key="c" tone="resume">
          続きから：{TABS.find((t) => t.key === tabOf(resume.tab))?.long ?? "概要"}
        </Pill>,
      );
    const r = g.item.pid ? recordsText(recordsTopics(recs.get(g.item.pid))) : "";
    if (r)
      out.push(
        <Pill key="r" tone="ok">
          {r}
        </Pill>,
      );
    if (g.members.length > 1)
      out.push(
        <Pill key="n" tone="plain">
          同じ物件 {g.members.length}件
        </Pill>,
      );
    return out;
  };

  const rise = intro ? "hist-rise" : "";
  // 一覧の上からの順（行が少しずつ遅れて現れる）
  const orderOf = new Map(secs.flatMap((s) => s.rows).map((g, i) => [historyKey(g.item), i]));

  const menuButton = (
    <button onClick={onMenu} aria-label={unread ? "メニュー（新しいお知らせがあります）" : "メニュー"} className="press relative flex shrink-0 items-center justify-center rounded-full" style={{ ...LIGHT_GLASS, width: 46, height: 46, minWidth: HIT, minHeight: HIT }}>
      <Menu size={22} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
      {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 2, top: 2, width: 11, height: 11 }} />}
    </button>
  );

  return (
    <div ref={root} className="hist-page app-touch relative flex flex-col text-white" style={{ minHeight: screen }}>
      {/* スクロールすると上に出る細いバー（押すといちばん上へ。虫めがねで絞り込み） */}
      {history.length > 0 && (
        <div className="pointer-events-none sticky top-0 z-20 h-0">
          <div data-vt-cover className="hist-bar relative flex w-full items-center justify-center" style={{ height: 50, background: "linear-gradient(180deg, rgba(14,24,42,0.62) 0%, rgba(14,24,42,0.5) 100%)", borderBottom: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(20px) saturate(140%)", WebkitBackdropFilter: "blur(20px) saturate(140%)" }}>
            <button onClick={toTop} className="flex h-full min-w-0 flex-1 items-center justify-center gap-[6px] px-[56px]" aria-label="いちばん上へ" tabIndex={-1}>
              <ClockBack size={15} stroke={1.9} color="rgba(255,255,255,0.85)" />
              <span className="shrink-0 font-semibold" style={{ fontSize: 16.5, letterSpacing: 0.6 }}>
                履歴
              </span>
              {/* いまの章（バーの下を通った章の見出し。変わると下からふわっと入れ替わる）。章に入る前は件数 */}
              <span key={cur ?? ""} className="hist-sub min-w-0 truncate" style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
                {cur ?? `${total}件`}
              </span>
            </button>
            <button onClick={toSearch} aria-label="絞り込む" tabIndex={-1} className="press absolute right-[6px] top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full active:bg-white/15" style={{ width: HIT, height: HIT }}>
              <Search size={19} strokeWidth={1.9} absoluteStrokeWidth color="#fff" />
            </button>
          </div>
        </div>
      )}

      {/* 見出しと右上のメニュー（ホームのロゴと同じ位置） */}
      <div className="relative flex items-start justify-between" style={{ padding: "16px 18px 0 20px" }}>
        <h1 className={`${rise} truncate font-bold`} style={{ fontSize: 28, lineHeight: "34px", letterSpacing: 1.6, marginTop: 6, textShadow: SHADOW }}>
          履歴
        </h1>
        {menuButton}
      </div>
      {/* ひとこと（ホームの「不動産の現場に、すぐ使える情報を。」と同じ位置・大きさ） */}
      <p className={`${rise} relative font-medium`} style={{ margin: `${compact ? 8 : 14}px 20px 0`, fontSize: 15.5, lineHeight: 1.6, letterSpacing: 1.6, textShadow: SHADOW, ...(intro ? delay(60) : {}) }}>
        {history.length ? (
          <>
            調べた物件　{total}件
            <br />
            この端末だけに残しています
          </>
        ) : (
          <>
            調べた物件が、
            <br />
            ここに残ります。
          </>
        )}
      </p>

      {history.length > 0 && (
        <form
          role="search"
          className="hist-search relative"
          style={{ margin: `${compact ? 20 : 74}px 19px 0` }}
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
            typingTimer.current = window.setTimeout(() => setTyping(false), 160);
          }}
        >
          {/* ホームの検索欄と同じ形・大きさ・すりガラス */}
          <div
            className={`${rise} flex items-center rounded-full transition-[box-shadow] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.28)]`}
            style={{ ...LIGHT_GLASS, height: "max(56px, 3.3em)", fontSize: 17, ...(intro ? delay(100) : {}), viewTransitionName: morph ? VT.search : undefined }}
          >
            <Search size={22} strokeWidth={1.9} absoluteStrokeWidth color="#fff" className="ml-[20px] shrink-0" />
            <ScaledInput value={q} onChange={setQ} inputRef={inputRef} size={17} className="ml-[13px] mr-[4px]" label="履歴を絞り込む" autoComplete="off" placeholder="町名・地番・市区町村でしぼる" onPhoto />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="入力を消す" className="mr-[4px] flex shrink-0 items-center justify-center" style={{ width: HIT, height: HIT }}>
                <span className="flex items-center justify-center rounded-full bg-white/25" style={{ width: 20, height: 20 }}>
                  <X size={12} strokeWidth={2.4} absoluteStrokeWidth color="#fff" />
                </span>
              </button>
            )}
          </div>
          {/* 調べ方の札（触れている間・絞り込んでいる間だけ。押しても欄から指が離れたことにしない＝キーボードを閉じない） */}
          {filtering && (
            <div role="radiogroup" aria-label="調べ方でしぼる" className="mt-[12px] flex gap-[6px]">
              {KINDS.map((k, ki) => {
                const on = kind === k.key;
                const n = counts[k.key];
                return (
                  <button
                    key={k.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!n && !on}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => k.key !== kind && animateList(() => setKind(k.key))}
                    className="hist-chip hist-hit press relative flex h-[36px] items-center gap-[5px] rounded-full px-[13px] font-semibold leading-none transition-colors disabled:opacity-40"
                    style={{ ...(on ? { background: "rgba(255,255,255,0.94)", color: "#1b3f73", boxShadow: "0 4px 14px rgba(5,15,35,0.22)" } : { ...LIGHT_GLASS, color: "#fff" }), fontSize: 13.5, ...delay(ki * 30) }}
                  >
                    {k.label}
                    <span className="font-medium" style={{ fontSize: 12, opacity: on ? 0.7 : 0.62 }}>
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </form>
      )}

      {/* 写真を見せる空き（まだ何も無いときは、画面の高さで伸び縮みして、案内を下に） */}
      {history.length === 0 ? <div className="min-h-[28px] flex-1" /> : <div ref={spacerRef} aria-hidden />}

      {/* 調べた物件の一覧 */}
      <section ref={listRef} aria-label="調べた物件" className="relative px-[19px]" style={{ paddingBottom: LAYOUT.bottom }}>
        {history.length === 0 ? (
          <div className={`${rise} rounded-[22px] px-[20px] pb-[16px] pt-[15px]`} style={{ ...BOARD, ...(intro ? delay(160) : {}) }}>
            <p className="flex items-center gap-[9px] font-medium leading-[1.4]" style={{ fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
              <ClockBack size={20} stroke={1.8} color="#9fd0ff" style={{ filter: "drop-shadow(0 0 6px rgba(120,190,255,0.55))" }} />
              検索履歴はまだありません
            </p>
            <p className="mt-[5px] leading-[1.6]" style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
              住所・地番・地図で調べると、ここに残ります。顧客物件の住所なので、サーバーには送らず、この端末の中だけに保存します。
            </p>
            <button onClick={onHome} className="press mt-[11px] flex items-center gap-[7px] rounded-full bg-white px-[18px] font-semibold" style={{ height: HIT, fontSize: 15, color: "#1b3f73" }}>
              <Search size={17} strokeWidth={2.1} absoluteStrokeWidth />
              ホームで調べる
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="hist-pop rounded-[22px] px-[20px] py-[16px] text-center" style={BOARD}>
            <p className="font-medium" style={{ fontSize: 15.5, color: "rgba(255,255,255,0.95)" }}>
              当てはまる履歴がありません
            </p>
            <p className="mt-[4px]" style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
              文字や調べ方を変えてみてください。
            </p>
            <button
              onClick={() => {
                setQ("");
                animateList(() => setKind("all"));
              }}
              className="press mx-auto mt-[11px] flex items-center gap-[6px] rounded-full px-[16px] font-semibold"
              style={{ ...LIGHT_GLASS, height: HIT, fontSize: 14, color: "#fff" }}
            >
              <X size={15} strokeWidth={2.2} absoluteStrokeWidth />
              絞り込みを外す
            </button>
          </div>
        ) : (
          <>
            {/* いちばん上の章の見出しと、並べ方（日付・市区町村。白い札が滑る）。並べ方を変えても作り直さない（札が滑るように） */}
            <div data-sec={secs[0].label} className={`${rise} flex min-h-[36px] items-center justify-between gap-x-[8px] pl-[4px]`} style={{ marginBottom: 6, ...(intro ? delay(150) : {}) }}>
              <SectionLabel label={secs[0].label} count={secs[0].total} />
              <SortToggle byCity={byCity} onChange={(v) => v !== byCity && animateList(() => setByCity(v))} />
            </div>
            {secs.map((s, si) => (
              <div key={s.label} style={{ marginTop: si ? 18 : 0 }}>
                {si > 0 && (
                  <Rise on={intro && !listVt} ms={settled ? 0 : 200 + si * 60} sec={s.label} className="flex min-h-[36px] items-center pl-[4px]" style={{ marginBottom: 6 }}>
                    <SectionLabel label={s.label} count={s.total} />
                  </Rise>
                )}
                <Board on={intro && !listVt} ms={settled ? 0 : 180 + si * 60} vt={morph && si === 0 ? VT.card : undefined}>
                  {s.rows.map((g) => {
                    const key = historyKey(g.item);
                    const i = orderOf.get(key) ?? 0;
                    const ri = recentIndex(g.item);
                    const label = copyLabel(g.item);
                    return (
                      <HistRow
                        key={key}
                        rowKey={key}
                        title={rowTitle(g.item)}
                        sub={placeSubLine(g.item, stamp(g.item.at, now, byCity))}
                        q={q}
                        pills={pillsOf(g)}
                        fav={isFavorite(g.item)}
                        open={openKey === key}
                        leave={leaving.get(key)}
                        enter={(intro || settled) && !listVt && i < ENTER_ROWS}
                        delayMs={settled || !intro ? 0 : 230 + Math.min(i, 9) * 45}
                        vt={morph && ri !== undefined ? VT.row(ri) : undefined}
                        vtName={`hist-${index.get(key) ?? i}`}
                        copyName={label}
                        onOpen={(o) => setOpenKey((k) => (o ? key : k === key ? null : k))}
                        onPick={() => onPick(g.item)}
                        onFav={() => onToggleFavorite(g.item)}
                        onCopy={() => {
                          setOpenKey(null);
                          void copy(g.item);
                        }}
                        onRemove={(slid) => removeRows([g], slid ? "swipe" : "fade")}
                        onMore={() => setSheet((cur) => (cur?.type === "row" && historyKey(cur.g.item) === key ? cur : { type: "row", g }))}
                      />
                    );
                  })}
                </Board>
              </div>
            ))}
            {/* 続きの目印（ここが近づいたら行を足す。足し終わるまで、下の「履歴を消す…」と一言は出さない） */}
            {more && <div ref={moreRef} aria-hidden style={{ height: 120 }} />}
          </>
        )}

        {history.length > 0 && !more && (
          <div className={`${rise} mt-[18px] flex justify-center`} style={intro ? delay(300) : undefined}>
            <button onClick={() => setSheet({ type: "clear", at: Date.now(), narrowed: narrowedNow() })} className="press flex items-center gap-[7px] rounded-full px-[18px] font-semibold" style={{ ...LIGHT_GLASS, height: HIT, fontSize: 14.5, color: "rgba(255,255,255,0.92)" }}>
              <Trash2 size={16} strokeWidth={1.9} absoluteStrokeWidth color="#ffb4a6" />
              履歴を消す…
            </button>
          </div>
        )}
        {!more && (
          <p className={`${rise} mt-[16px] px-[4px] leading-[1.6]`} style={{ fontSize: 11.5, color: "rgba(255,255,255,0.8)", textShadow: ON_PHOTO, ...(intro ? delay(320) : {}) }}>
            履歴はこの端末の中だけにあり、サーバーには送りません。地図・データは参考情報です。MICHILUは判定をしません。最終確認は、必ず役所の窓口・公的な資料で行ってください。
          </p>
        )}
      </section>

      <BodyPortal>
        <ClearSheet
          state={sheet?.type === "clear" ? sheet : null}
          history={history}
          onClose={() => setSheet(null)}
          onClear={clearRange}
          onClearNarrowed={(n) => {
            setSheet(null);
            removeRows(n.rows, "fade");
          }}
        />
        <RowSheet
          state={sheet?.type === "row" ? sheet.g : null}
          isFavorite={isFavorite}
          resumeTab={resume ? (TABS.find((t) => t.key === tabOf(resume.tab))?.long ?? "概要") : undefined}
          resumeKey={resume?.historyKey}
          recs={recs}
          onClose={() => setSheet(null)}
          onPick={(x) => {
            setSheet(null);
            onPick(x);
          }}
          onFav={(x) => onToggleFavorite(x)}
          onDocs={(x) => {
            setSheet(null);
            onDocs(x);
          }}
          onCopy={(x) => {
            setSheet(null);
            void copy(x);
          }}
          onRemove={(g) => {
            setSheet(null);
            // シートが下りてから、行がたたまれるのが見えるように
            window.setTimeout(() => removeRows([g], "fade"), reducedMotion() ? 0 : 220);
          }}
        />
      </BodyPortal>
    </div>
  );
}

/** 章の見出し（ホームの「最近の検索」と同じ控えめな白の字）と件数 */
/**
 * 写真の上にじかに置く字（章の見出し・下の一言）の影。朝・昼の明るい屋根や道の上でも読めるよう、字のまわりをぼかして暗くする
 * （板を敷かずに、写真を隠さない）
 */
const ON_PHOTO = "0 1px 2px rgba(0,0,0,0.55), 0 0 10px rgba(0,0,0,0.45), 0 0 22px rgba(0,0,0,0.3)";

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="flex min-w-0 items-baseline gap-[8px] font-semibold leading-[1.3]" style={{ ...LABEL, color: "rgba(255,255,255,0.92)", textShadow: ON_PHOTO }}>
      <span className="truncate">{label}</span>
      <span className="shrink-0 font-medium" style={{ fontSize: 12.5, letterSpacing: 0.4, color: "rgba(255,255,255,0.78)" }}>
        {count}件
      </span>
    </h2>
  );
}

/** 置いたときだけ浮き上がる箱（あとで on が変わっても動き直さない）。sec は章の見出しの目印（上の細いバーに、いまの章を出す） */
function Rise({ on, ms, sec, className = "", style, children }: { on: boolean; ms: number; sec?: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const [anim] = useState(on);
  return (
    <div data-sec={sec} className={`${anim ? "hist-rise" : ""} ${className}`} style={{ ...(anim ? delay(ms) : {}), ...style }}>
      {children}
    </div>
  );
}

/** 行を乗せるすりガラスの板（浮き上がる動きは板そのものに付ける。外の箱が動くと、後ろがぼけない） */
function Board({ on, ms, vt, children }: { on: boolean; ms: number; vt?: string; children: ReactNode }) {
  const [anim] = useState(on);
  return (
    <ul className={`${anim ? "hist-rise" : ""} overflow-hidden rounded-[22px]`} style={{ ...BOARD, ...(anim ? delay(ms) : {}), viewTransitionName: vt }}>
      {children}
    </ul>
  );
}

/** 並べ方（日付・市区町村。白い札が滑る） */
function SortToggle({ byCity, onChange }: { byCity: boolean; onChange: (byCity: boolean) => void }) {
  return (
    <div role="radiogroup" aria-label="並べ方" data-vt="hist-sort" className="relative flex shrink-0 rounded-full" style={{ ...LIGHT_GLASS, width: 156, height: 34, padding: 3 }}>
      <span aria-hidden className="fav-thumb absolute rounded-full" style={{ top: 3, bottom: 3, left: 3, width: "calc(50% - 3px)", transform: byCity ? "translateX(100%)" : "none" }} />
      {(
        [
          ["日付", false],
          ["市区町村", true],
        ] as const
      ).map(([label, v]) => (
        <button
          key={label}
          role="radio"
          aria-checked={byCity === v}
          onClick={() => onChange(v)}
          className="hist-hit relative min-w-0 flex-1 basis-0 whitespace-nowrap rounded-full font-semibold transition-colors duration-300"
          style={{ fontSize: 12.5, letterSpacing: 0.3, color: byCity === v ? "#1b3f73" : "#fff" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** 行の中の小さな札（同じ物件の件数・確認の記録・続きから） */
function Pill({ tone, children }: { tone: "plain" | "ok" | "resume"; children: ReactNode }) {
  const [color, bg] = tone === "ok" ? ["#8fe3b4", "rgba(52,199,123,0.17)"] : tone === "resume" ? ["#9ccfff", "rgba(90,174,255,0.17)"] : ["rgba(255,255,255,0.84)", "rgba(255,255,255,0.12)"];
  return (
    <span className="inline-flex h-[19px] max-w-full items-center truncate rounded-full px-[7px] font-semibold leading-none" style={{ fontSize: 10.5, color, background: bg }}>
      {children}
    </span>
  );
}

/** 指の動きの記録（wait：まだ決まっていない、swipe：横になぞっている、hold：長押しした、off：縦のスクロール） */
type Gesture = { id: number; x: number; y: number; from: number; cur: number; mode: "wait" | "swipe" | "hold" | "off"; lx: number; lt: number; v: number };

/**
 * 調べた物件の1行（市区町村と町名・番地か地番と日時・札）。右に☆。写真の札は付けない。
 * 左へなぞると、後ろから「コピー」「消す」が出る（指について動き、離すと開くか戻る。大きくなぞって離すと、そのまま消す）。
 * 長押し・右クリック・Shift+F10 でくわしい情報と操作のシート
 */
function HistRow({
  rowKey,
  title,
  sub,
  q,
  pills,
  fav,
  open,
  leave,
  enter,
  delayMs,
  vt,
  vtName,
  copyName,
  onOpen,
  onPick,
  onFav,
  onCopy,
  onRemove,
  onMore,
}: {
  rowKey: string;
  title: string;
  sub: string;
  q: string;
  pills: ReactNode[];
  fav: boolean;
  open: boolean;
  leave?: Leave;
  enter: boolean;
  delayMs: number;
  /** つながる動き（ホームの最近の検索）の名前 */
  vt?: string;
  /** 並べ方・調べ方を変えるときの名前（画面に見えているときだけ付ける。HistoryPage の animateList） */
  vtName: string;
  copyName: string;
  onOpen: (open: boolean) => void;
  onPick: () => void;
  onFav: () => void;
  onCopy: () => void;
  onRemove: (slid: boolean) => void;
  onMore: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const [full, setFull] = useState(false);
  const [held, setHeld] = useState(false);
  // 現れる動きは置いたときに決める（あとで変わっても動き直さない）
  const [entered] = useState(enter);
  const gesture = useRef<Gesture | null>(null);
  const holdTimer = useRef(0);
  const heldTimer = useRef(0);
  // なぞったあと・長押しのあと、指を離してすぐに来る「押した」を無視する（この時刻まで。キーボードで押したときは無視しない）
  const suppressUntil = useRef(0);
  // 長押しで開いたあと、指を離したときの「押した」を出さない（シートの外を押したことにならないように）
  const heldTouch = useRef(false);
  useEffect(
    () => () => {
      clearTimeout(holdTimer.current);
      clearTimeout(heldTimer.current);
    },
    [],
  );

  // ページが閉じた（ほかの行を開いた・スクロールした・外を押した）ら戻す
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open && !drag && !leave && dx !== 0) {
      setDx(0);
      setFull(false);
    }
  }
  // なぞって消した行は、行ごと左へ抜けてから（後ろの「消す」が広がって）たたまれる
  const [wasLeave, setWasLeave] = useState(!!leave);
  if (!!leave !== wasLeave) {
    setWasLeave(!!leave);
    if (leave?.slid) {
      setDx(-ROW_W);
      setFull(true);
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    heldTouch.current = false;
    if (leave || (e.pointerType === "mouse" && e.button !== 0)) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: dx, cur: dx, mode: "wait", lx: e.clientX, lt: e.timeStamp, v: 0 };
    clearTimeout(holdTimer.current);
    if (e.pointerType !== "mouse")
      holdTimer.current = window.setTimeout(() => {
        const s = gesture.current;
        if (!s || s.mode !== "wait" || s.from !== 0) return;
        s.mode = "hold";
        heldTouch.current = true;
        setHeld(true);
        clearTimeout(heldTimer.current);
        heldTimer.current = window.setTimeout(() => setHeld(false), 420);
        onMore();
      }, HOLD_MS);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = gesture.current;
    if (!s || s.id !== e.pointerId || s.mode === "hold" || s.mode === "off") return;
    const z = zoomNow();
    const mx = (e.clientX - s.x) / z;
    const my = (e.clientY - s.y) / z;
    if (s.mode === "wait") {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.3) {
        // 横になぞり始めた：指について動かす（縦のスクロールはブラウザに任せている。.hist-front の touch-action）
        s.mode = "swipe";
        clearTimeout(holdTimer.current);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 捕まえられなくても続ける
        }
        setDrag(true);
        onOpen(true);
      } else if (Math.hypot(mx, my) > 10) {
        // 縦のスクロール（行は動かさない）
        s.mode = "off";
        clearTimeout(holdTimer.current);
        return;
      } else return;
    }
    const dt = e.timeStamp - s.lt;
    if (dt > 0) s.v = (e.clientX - s.lx) / z / dt;
    s.lx = e.clientX;
    s.lt = e.timeStamp;
    let x = s.from + mx;
    if (x > 0) x = rubber(x, 36);
    x = Math.max(x, -ROW_W);
    s.cur = x;
    setDx(x);
    setFull(-x > ROW_W * FULL_AT);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = gesture.current;
    if (!s || s.id !== e.pointerId) return;
    gesture.current = null;
    clearTimeout(holdTimer.current);
    if (s.mode === "hold") suppressUntil.current = performance.now() + 450;
    if (s.mode !== "swipe") return;
    suppressUntil.current = performance.now() + 450;
    setDrag(false);
    if (-s.cur > ROW_W * FULL_AT && e.type !== "pointercancel") {
      onRemove(true);
      return;
    }
    // 速く左へ払ったら開く、右へ払ったら戻す。ゆっくりなら半分を越えたかで決める
    const opening = s.v < 0.4 && (s.v < -0.4 || -s.cur > OPEN_W / 2);
    setDx(opening ? -OPEN_W : 0);
    setFull(false);
    onOpen(opening);
  };
  const onTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!heldTouch.current) return;
    heldTouch.current = false;
    if (e.cancelable) e.preventDefault();
  };
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (performance.now() < suppressUntil.current) {
      suppressUntil.current = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // 開いている行を押したら、まず閉じる
    if (dx !== 0 && !leave) {
      e.preventDefault();
      e.stopPropagation();
      setDx(0);
      setFull(false);
      onOpen(false);
    }
  };
  // キーボード：Delete（Mac は delete キー＝Backspace）で消す、ContextMenu キーか Shift+F10 でシート
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove(false);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      onMore();
    }
  };

  const reveal = Math.max(0, -dx);
  return (
    <li
      data-row={rowKey}
      data-vt={vtName}
      className={`hist-row border-t border-white/[0.12] first:border-t-0 ${entered ? "hist-enter" : ""} ${leave ? "hist-leaving" : ""}`}
      style={{ ...(entered ? delay(delayMs) : {}), transitionDelay: leave ? `${leave.delay}ms` : undefined, viewTransitionName: vt }}
    >
      <div className={`hist-row-in relative ${drag ? "hist-drag" : ""}`}>
        {/* 後ろの操作（なぞった分だけ見える。指で操作するもの。キーボード・読み上げは「その他の操作」のシートから） */}
        <div aria-hidden className="hist-acts absolute inset-y-0 right-0 flex overflow-hidden" style={{ width: reveal }}>
          <button tabIndex={-1} onClick={onCopy} className="hist-act" style={{ background: "#3d7bf2", flexGrow: full ? 0.0001 : 1 }}>
            <Copy size={19} strokeWidth={1.9} absoluteStrokeWidth />
            <span>コピー</span>
          </button>
          <button tabIndex={-1} onClick={() => onRemove(true)} className="hist-act" style={{ background: "#e5484d", flexGrow: 1, alignItems: full ? "flex-start" : "center", paddingLeft: full ? 26 : 0 }}>
            <Trash2 size={19} strokeWidth={1.9} absoluteStrokeWidth />
            <span>消す</span>
          </button>
        </div>
        <div
          className={`hist-front relative flex items-center ${held ? "hist-held" : ""}`}
          style={{ transform: `translate3d(${dx}px,0,0)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onTouchEnd={onTouchEnd}
          onClickCapture={onClickCapture}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!leave) onMore();
          }}
        >
          <button onClick={onPick} onKeyDown={onKeyDown} aria-label={`${title}を開く（${sub}）`} className="flex min-h-[62px] min-w-0 flex-1 flex-col justify-center py-[9px] pl-[18px] pr-[4px] text-left outline-none transition-colors active:bg-white/10 focus-visible:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.75)]">
            <span className="block w-full truncate font-medium leading-[1.3]" style={{ fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
              {marked(title, q)}
            </span>
            <span className="mt-[3px] block w-full truncate leading-[1.3]" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              {marked(sub, q)}
            </span>
            {pills.length > 0 && <span className="mt-[5px] flex flex-wrap gap-[4px]">{pills}</span>}
          </button>
          {/* キーボード・画面の読み上げのための「その他の操作」（ふだんは見えない。キーボードで来たときだけ見える） */}
          <button onClick={onMore} aria-label={`その他の操作（${copyName}のコピー・書類・消す）`} className="sr-only focus-visible:not-sr-only focus-visible:mr-[2px] focus-visible:flex focus-visible:size-[36px] focus-visible:shrink-0 focus-visible:items-center focus-visible:justify-center focus-visible:rounded-full focus-visible:bg-white/15">
            <MoreHorizontal size={18} strokeWidth={2} absoluteStrokeWidth color="#fff" />
          </button>
          <button onClick={onFav} aria-label={fav ? "お気に入りから外す" : "お気に入りに保存"} aria-pressed={fav} className="mr-[6px] flex shrink-0 items-center justify-center rounded-full outline-none active:bg-white/10 focus-visible:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.75)]" style={{ width: HIT, height: HIT }}>
            <FavStar on={fav} size={21} stroke={1.7} off="rgba(255,255,255,0.72)" />
          </button>
        </div>
      </div>
    </li>
  );
}

/** シートの中の操作の1行（ホームの右上のメニューと同じ形） */
function ActionRow({ Icon, title, sub, danger = false, onClick }: { Icon: LucideIcon; title: string; sub?: string; danger?: boolean; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 py-3 text-left active:bg-mint/50">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${danger ? "bg-[#fdecea] text-[#c0391b]" : "bg-mint text-brand"}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[14.5px] font-semibold ${danger ? "text-[#c0391b]" : "text-ink"}`}>{title}</span>
          {sub && <span className="mt-0.5 block break-words text-[12px] leading-[1.5] text-muted">{sub}</span>}
        </span>
      </button>
    </li>
  );
}

/** 行の長押し（右クリック・Shift+F10・その他の操作）で出す、くわしい情報と操作のシート */
function RowSheet({
  state,
  isFavorite,
  resumeTab,
  resumeKey,
  recs,
  onClose,
  onPick,
  onFav,
  onDocs,
  onCopy,
  onRemove,
}: {
  state: Grouped | null;
  isFavorite: (h: HistoryItem) => boolean;
  resumeTab?: string;
  resumeKey?: string;
  recs: Map<string, PropertyRecords>;
  onClose: () => void;
  onPick: (h: HistoryItem) => void;
  onFav: (h: HistoryItem) => void;
  onDocs: (h: HistoryItem) => void;
  onCopy: (h: HistoryItem) => void;
  onRemove: (g: Grouped) => void;
}) {
  // 閉じる動きの間も中身を残す
  const [last, setLast] = useState<Grouped | null>(state);
  if (state && state !== last) setLast(state);
  const g = state ?? last;
  if (!g) return null;
  const h = g.item;
  const label = copyLabel(h);
  const fav = isFavorite(h);
  const r = h.pid ? recordsText(recordsTopics(recs.get(h.pid))) : "";
  const resumed = resumeKey !== undefined && g.members.some((m) => historyKey(m) === resumeKey);
  const first = g.members[g.members.length - 1];
  return (
    <Sheet title={rowTitle(h)} open={!!state} onClose={onClose}>
      <div className="rounded-2xl bg-[#f4f7fb] px-4 py-3">
        <p className="text-[12px] font-semibold text-muted">{label === "地番" ? "調べた地番" : label === "場所" ? "地図で選んだ場所" : "調べた住所"}</p>
        <p className="mt-0.5 break-words text-[15.5px] font-semibold leading-[1.45] text-ink">{copyText(h)}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px] leading-[1.5]">
          <dt className="text-muted">調べた日時</dt>
          <dd className="text-ink">{fullDate(h.at)}</dd>
          {g.members.length > 1 && (
            <>
              <dt className="text-muted">同じ物件</dt>
              <dd className="text-ink">
                {g.members.length}件（{g.kinds.map((k) => KIND_LABEL[k]).join("・")}）・最初は{fullDate(first.at)}
              </dd>
            </>
          )}
          {r ? (
            <>
              <dt className="text-muted">確認の記録</dt>
              <dd className="text-ink">{r}</dd>
            </>
          ) : null}
          {resumed && resumeTab && (
            <>
              <dt className="text-muted">続きから</dt>
              <dd className="text-ink">{resumeTab}のタブを見ていました</dd>
            </>
          )}
        </dl>
      </div>
      <ul className="mt-2 divide-y divide-line">
        <ActionRow Icon={ArrowUpRight} title="この物件を開く" sub={resumed ? `前に見ていた「${resumeTab}」から続けます` : "調べ直して、物件の画面を開きます"} onClick={() => onPick(h)} />
        <ActionRow Icon={Star} title={fav ? "お気に入りから外す" : "お気に入りに保存"} sub={fav ? "お気に入りのページから外します" : "お気に入りのページに並びます"} onClick={() => onFav(h)} />
        <ActionRow Icon={FileText} title="書類を作る" sub="要注意点と次にやること・調査メモ・重説の下書き・案内図" onClick={() => onDocs(h)} />
        <ActionRow Icon={Copy} title={`${label}をコピー`} sub={copyText(h)} onClick={() => onCopy(h)} />
        <ActionRow Icon={Trash2} title="履歴から消す" sub={g.members.length > 1 ? `同じ物件の${g.members.length}件をまとめて消します。お気に入りと確認の記録は残ります` : "お気に入りと確認の記録は残ります"} danger onClick={() => onRemove(g)} />
      </ul>
    </Sheet>
  );
}

/**
 * 「履歴を消す…」のシート：消す範囲（過去1時間・今日・今日と昨日・すべて）と件数（物件の数）。絞り込んでいるときは、いちばん上に
 * 「絞り込んだ物件」（いま一覧に出ている物件だけ）
 */
function ClearSheet({
  state,
  history,
  onClose,
  onClear,
  onClearNarrowed,
}: {
  state: ClearState | null;
  history: HistoryItem[];
  onClose: () => void;
  onClear: (r: Range, at: number) => void;
  onClearNarrowed: (n: Narrowed) => void;
}) {
  // 件数は開いたときの時刻で数える（閉じる動きの間も同じ中身を出しておく）
  const [last, setLast] = useState<ClearState>(state ?? { at: 0, narrowed: null });
  if (state && state !== last) setLast(state);
  const { at: t, narrowed } = state ?? last;
  const counts = rangeCounts(history, t);
  return (
    <Sheet title="履歴を消す" open={state !== null} onClose={onClose}>
      <p className="text-[13px] leading-[1.6] text-muted">消す範囲を選んでください。消したあと5秒のあいだは、下の「元に戻す」で戻せます。お気に入りと確認の記録は消えません。</p>
      <ul className="mt-2 divide-y divide-line">
        {narrowed && (
          <li>
            <button onClick={() => onClearNarrowed(narrowed)} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-mint/50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-brand">
                <Search className="h-[17px] w-[17px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">絞り込んだ物件</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted">{narrowed.text}</span>
              </span>
              <span className="shrink-0 text-[13px] text-muted">{narrowed.rows.length}件</span>
            </button>
          </li>
        )}
        {RANGES.map((r) => {
          const n = counts[r.key];
          const danger = r.key === "all";
          return (
            <li key={r.key}>
              <button disabled={!n} onClick={() => onClear(r.key, t)} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-mint/50 disabled:opacity-40">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${danger ? "bg-[#fdecea] text-[#c0391b]" : "bg-mint text-brand"}`}>
                  <Trash2 className="h-[17px] w-[17px]" />
                </span>
                <span className={`min-w-0 flex-1 text-[15px] font-semibold ${danger ? "text-[#c0391b]" : "text-ink"}`}>{r.label}</span>
                <span className="shrink-0 text-[13px] text-muted">{n ? `${n}件` : "なし"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/** 消したあとに下に出る「元に戻す」（5 秒で消える。消えるときは少し下がって薄れる）。お気に入りの UndoToast と同じ形 */
export function HistoryUndoToast({ text, onUndo, onClose }: { text: string; onUndo: () => void; onClose: () => void }) {
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
  }, []);
  return (
    <div role="status" className={`fav-toast pointer-events-auto flex max-w-full items-center gap-[10px] rounded-full py-[4px] pl-[16px] pr-[4px] text-white ${out ? "fav-toast-out" : ""}`} style={{ ...DARK_GLASS, minHeight: 52 }}>
      <Trash2 size={16} strokeWidth={1.8} absoluteStrokeWidth color="rgba(255,255,255,0.75)" className="shrink-0" />
      <span className="min-w-0 truncate" style={{ fontSize: 14 }}>
        {text}
      </span>
      <button onClick={onUndo} className="press shrink-0 rounded-full bg-white px-[15px] font-semibold" style={{ height: HIT, fontSize: 14, color: "#1b3f73" }}>
        元に戻す
      </button>
    </div>
  );
}
