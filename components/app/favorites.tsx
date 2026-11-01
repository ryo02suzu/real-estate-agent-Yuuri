"use client";

// スマホの下のメニューの「お気に入り」。画面いっぱいの写真（届いた富士山と湖の絵。public/favorites/fuji-*.webp。下のメニューの後ろまで
// 敷くので、components/app/mobile-app.tsx が FavoritesBackdrop で画面のいちばん奥に置く）の上に、ふたつの画面：
// ・いつもの画面（スクロールしない）：ホームと同じ位置に、見出し「お気に入り」と右上のメニュー（≡）、2行のひとこと（件数）、
//   ホームと同じ検索欄（絞り込み）。その下に「最近保存した物件　すべて見る ›」と、半透明のすりガラスの板に最近保存した物件を、
//   画面に収まる数だけ（新しく保存した順）。
// ・すべて見る：戻るボタン・絞り込み・並べ方（新しい順・市区町村ごと。白い札が滑る）・すべての物件（スクロールできる）。
//   行き来するときは、板と行と検索欄が滑ってつながる（View Transitions。名前は components/app/home.tsx の VT。.vt-fav）。
// 行は写真の札を付けず、市区町村と町名・番地か地番と日時・書類のボタン・★。板は字が読みやすいよう、ホームより少し濃いすりガラス。
// 動き（app/globals.css の .fav-*）：開くと写真がふわっと落ち着き、上から順に浮き上がり、行は少しずつ遅れて現れる。
// 太陽の光がゆっくり揺らぎ、湖に映った光の道がきらめく（≡ の「動きの演出」がオンのとき）。すべて見るでスクロールすると、写真が
// ゆっくり上へ寄って暗くなり、上に見出しの細いバーが出る（押すといちばん上へ）。
// ★を押すと星が抜けて行がたたまれ、下に「元に戻す」が出る（UndoToast。mobile-app.tsx が出す）。
// 動きを減らす設定では、位置の動きを止める（すぐ切り替わる）
import { ChevronLeft, ChevronRight, FileText, Menu, Search, Star, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { placeParts } from "@/lib/app/scene";
import { favoriteKey, type FavoriteItem } from "@/lib/favorites";
import { PhoneImg, ScaledInput } from "./frame";
import { DARK_GLASS, HIT, LIGHT_GLASS, SHADOW, useScreenHeight, VT } from "./home";
import { useShrink } from "./sky";
import { matches, useNow, when } from "./tab-pages";
import { reducedMotion } from "./tokens";

/** お気に入りのページの時刻・電池の帯の色（写真のいちばん上の空に、上の暗いぼかしを重ねた色） */
export const FAVORITES_TOP = "#11304f";

/** 写真の中の太陽の位置（絵の幅・高さに対する %。届いた絵 1438×2576 で測った） */
const SUN = { x: 10.69, y: 55.17 };

/** 湖に映った太陽の光の道のきらめき（位置は絵に対する %、大きさ px、長さと遅れ 秒）。毎回同じ並び */
const GLINTS = (() => {
  let s = 11;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 14 }, () => {
    const y = 64.5 + Math.pow(rnd(), 1.6) * 20;
    // 光の道は下ほど広がる
    const spread = 1.2 + (y - 64.5) * 0.09;
    return {
      x: 10.9 + (rnd() * 2 - 1) * spread,
      y,
      size: 2 + Math.round(rnd() * 2),
      dur: 2.2 + rnd() * 2.2,
      delay: rnd() * 3.2,
    };
  });
})();

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
 * 画面いっぱいの富士山の写真（下のメニューの後ろまで敷く）。上と下を少し暗くして、白い字とメニューを読みやすくする。
 * 写真の上に、太陽の光の揺らぎと湖のきらめきを、絵と同じ位置に重ねる（写真と光を同じ箱に入れ、箱を画面いっぱいに合わせる。.fav-stage）。
 * スクロールした量を --fav-p（0〜1）に書き、写真が上へ寄って暗くなる（動きの演出がオフ・動きを減らす設定では暗くなるだけ）
 */
export function FavoritesBackdrop({ scroller, motion }: { scroller: RefObject<HTMLElement | null>; motion: boolean }) {
  const box = useRef<HTMLDivElement>(null);
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
    <div ref={box} aria-hidden className={`fav-backdrop pointer-events-none absolute inset-0 overflow-hidden ${motion ? "fav-alive" : ""}`} style={{ background: "#0f2440" }}>
      <div className="fav-stage">
        <div className="fav-intro absolute inset-0">
          <div className="fav-drift absolute inset-0">
            <PhoneImg
              src="/favorites/fuji-1260.webp"
              srcSet="/favorites/fuji-900.webp 900w, /favorites/fuji-1260.webp 1260w, /favorites/fuji-1438.webp 1438w"
              sizes="(min-aspect-ratio: 1438/2576) 100vw, 55.8vh"
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "25% 40%" }}
            />
            <span className="fav-sun" style={{ left: `${SUN.x}%`, top: `${SUN.y}%` }} />
            {GLINTS.map((g, i) => (
              <span key={i} className="fav-glint" style={{ left: `${g.x}%`, top: `${g.y}%`, width: g.size, height: g.size, animationDuration: `${g.dur}s`, animationDelay: `${g.delay}s` }} />
            ))}
          </div>
        </div>
      </div>
      {/* 上は少し暗く（見出し）、下も少しだけ暗く（下のメニュー）。物件はすりガラスの板に乗せるので、写真はなるべくそのまま */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,14,32,0.36) 0%, rgba(5,14,32,0) 30%, rgba(0,0,0,0) 60%, rgba(3,8,18,0.36) 100%)" }} />
      {/* スクロールするほど暗く（一覧が読みやすい）。絞り込みに触れている間も少し暗く */}
      <div className="fav-dim absolute inset-0" />
      <div className="fav-focus absolute inset-0" />
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
/** いつもの画面の寸法（pt）：検索欄の下の端（ホームと同じ位置）、そこから板の行の始まりまで、行の高さ、下の余白 */
const LAYOUT = { searchBottom: 256, compactSearchBottom: 202, toRows: 68, row: 63, bottom: 18 };
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

  // いつもの画面に出す数：画面に収まるだけ（スクロールしない）
  const top = compact ? LAYOUT.compactSearchBottom : LAYOUT.searchBottom;
  const fit = Math.max(1, Math.floor(((screen ?? 700) - top - LAYOUT.toRows - LAYOUT.bottom) / LAYOUT.row));
  const shown = list.slice(0, fit);
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
    >
      {/* ホームの検索欄と同じ形・大きさ・すりガラス */}
      <div
        className="fav-rise flex items-center rounded-full transition-[box-shadow] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.28)]"
        style={{ ...LIGHT_GLASS, height: "max(56px, 3.3em)", fontSize: 17, ...delay(100), viewTransitionName: morph ? VT.search : undefined }}
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

  const menuButton = (
    <button onClick={onMenu} aria-label={unread ? "メニュー（新しいお知らせがあります）" : "メニュー"} className="press relative flex shrink-0 items-center justify-center rounded-full" style={{ ...LIGHT_GLASS, width: 46, height: 46, minWidth: HIT, minHeight: HIT }}>
      <Menu size={22} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
      {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 2, top: 2, width: 11, height: 11 }} />}
    </button>
  );

  const empty = (
    <div className="fav-rise flex flex-col items-center rounded-[22px] px-[22px] pb-[22px] pt-[20px] text-center" style={{ ...BOARD, ...delay(200) }}>
      <span className="fav-empty-star flex items-center justify-center rounded-full" style={{ width: 62, height: 62, background: "radial-gradient(circle, rgba(255,201,74,0.3) 0%, rgba(255,201,74,0) 70%)" }}>
        <Star size={28} strokeWidth={1.6} absoluteStrokeWidth color="#ffc94a" style={{ filter: "drop-shadow(0 0 8px rgba(255,196,74,0.6))" }} />
      </span>
      <p className="mt-[8px] font-medium leading-[1.4]" style={{ fontSize: 16.5, color: "rgba(255,255,255,0.95)" }}>
        保存した物件はまだありません
      </p>
      <p className="mt-[6px] leading-[1.65]" style={{ fontSize: 13.5, color: "rgba(255,255,255,0.62)" }}>
        物件を調べた画面の右上の ☆ を押すと、ここに並びます。履歴の行の ☆ からも保存できます。
      </p>
      <button onClick={onHome} className="press mt-[14px] flex items-center gap-[7px] rounded-full bg-white px-[20px] font-semibold" style={{ height: HIT, fontSize: 15, color: "#1b3f73" }}>
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
        {/* 見出しと右上のメニュー（ホームのロゴと同じ位置） */}
        <div className="relative flex items-start justify-between" style={{ padding: "16px 18px 0 20px" }}>
          <h1 className="fav-rise truncate font-bold" style={{ fontSize: 28, lineHeight: "34px", letterSpacing: 1.6, marginTop: 6, textShadow: SHADOW }}>
            お気に入り
          </h1>
          {menuButton}
        </div>
        {/* ひとこと（ホームの「不動産の現場に、すぐ使える情報を。」と同じ位置・大きさ） */}
        <p className="fav-rise relative font-medium" style={{ margin: "14px 20px 0", fontSize: 15.5, lineHeight: 1.6, letterSpacing: 1.6, textShadow: SHADOW, ...delay(60) }}>
          {favorites.length ? (
            <>
              保存した物件　{favorites.length}件
              <br />
              この端末だけに保存しています
            </>
          ) : (
            <>
              見返したい物件を、
              <br />
              ここに保存できます。
            </>
          )}
        </p>
        {search}
        {/* 最近保存した物件（新しく保存した順。画面に収まる数だけ） */}
        <section className="relative" style={{ padding: "24px 19px 0" }}>
          {favorites.length === 0 ? (
            empty
          ) : list.length === 0 ? (
            noMatch
          ) : (
            <>
              <div className="fav-rise flex min-h-[36px] items-center justify-between gap-x-[8px]" style={{ marginBottom: 6, ...delay(150) }}>
                <h2 className="truncate font-semibold leading-[1.3]" style={LABEL}>
                  {q ? `「${q}」に当てはまる物件` : "最近保存した物件"}
                </h2>
                <button
                  onClick={() => toAll(true)}
                  className="press group -mr-[8px] flex shrink-0 items-center gap-[2px] rounded-full px-[8px] transition-[background-color,opacity] active:bg-white/15"
                  style={{ minHeight: HIT, fontSize: 14, color: "rgba(255,255,255,0.78)" }}
                >
                  すべて見る{list.length > shown.length ? `（${list.length}件）` : ""}
                  <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth className="transition-transform duration-200 group-active:translate-x-[3px]" />
                </button>
              </div>
              <ul className="fav-rise overflow-hidden rounded-[22px]" style={{ ...BOARD, ...delay(190), viewTransitionName: morph ? VT.card : undefined }}>
                {shown.map((f, i) => row(f, i, 240))}
              </ul>
            </>
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
