"use client";

// 見た目の見本（ChatGPT で作った画面の絵）をそのまま敷いて、絵の各部分にボタンを重ねたホーム。
// 絵の中の住所・数字は見本のままで、本物のデータではない。検索窓だけは本物（絵の検索窓の上に重ねる）。
// 本物の部品ができた所から、絵のその部分を部品に置きかえていく。
// public/mock/ の絵は、iPhone の枠つきの元の絵（863×1822）から画面の部分だけを切り出し、さらに
// ステータスバーと下のメニューを切り離したもの。押せる所の座標は元の絵の座標で書き、SX・TOP を引いて使う
import { useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "./icons";

/** 元の絵の中の画面の位置と大きさ */
const SX = 35; // 画面の左端
const W = 792; // 画面の幅
const TOP = 112; // 上の絵の上端（ステータスバーの下、ロゴの少し上）
const NAV_TOP = 1685; // 下のメニューの帯の上端
const NAV_END = 1768; // 下のメニューの帯の下端（ホームバーの上）
const MAIN_H = NAV_TOP - TOP;
const NAV_H = NAV_END - NAV_TOP;

/** 絵の中の押せる所（元の絵の座標。x1,y1,x2,y2） */
type Spot = { label: string; box: [number, number, number, number]; action: string };

const MAIN_SPOTS: Spot[] = [
  { label: "検索履歴", box: [558, 114, 640, 186], action: "history" },
  { label: "保存", box: [646, 114, 726, 186], action: "favorites" },
  { label: "メニュー", box: [730, 114, 810, 186], action: "menu" },
  { label: "この場所の道路種別の地図を開く", box: [54, 282, 808, 483], action: "nudge" },
  { label: "お気に入り", box: [558, 524, 700, 582], action: "favorites" },
  { label: "共有", box: [704, 524, 808, 582], action: "nudge" },
  { label: "基本情報", box: [54, 605, 186, 663], action: "nudge" },
  { label: "周辺環境", box: [190, 605, 308, 663], action: "nudge" },
  { label: "相場・取引", box: [312, 605, 438, 663], action: "nudge" },
  { label: "法令・規制", box: [442, 605, 568, 663], action: "nudge" },
  { label: "ハザード", box: [572, 605, 690, 663], action: "nudge" },
  { label: "取引事例", box: [694, 605, 808, 663], action: "nudge" },
  { label: "地図で選ぶ", box: [56, 682, 414, 1088], action: "map" },
  { label: "土地の参考価格", box: [56, 1097, 414, 1223], action: "nudge" },
  { label: "周辺の取引相場", box: [56, 1233, 414, 1333], action: "nudge" },
  { label: "もっと見る", box: [686, 1348, 808, 1384], action: "nudge" },
  { label: "周辺の取引事例", box: [56, 1547, 426, 1627], action: "nudge" },
  { label: "法令・規制の詳細", box: [436, 1547, 808, 1627], action: "help" },
  { label: "この情報を共有", box: [56, 1633, 426, 1687], action: "nudge" },
  { label: "レポートを作成", box: [436, 1633, 808, 1687], action: "nudge" },
];

const NAV_SPOTS: Spot[] = [
  { label: "ホーム", box: [60, NAV_TOP, 210, NAV_END], action: "home" },
  { label: "検索履歴", box: [260, NAV_TOP, 410, NAV_END], action: "history" },
  { label: "お気に入り", box: [450, NAV_TOP, 600, NAV_END], action: "favorites" },
  { label: "マイページ", box: [650, NAV_TOP, 800, NAV_END], action: "account" },
];

/** 絵の検索窓の枠（この上に本物の検索窓を重ねる） */
const SEARCH_BOX: [number, number, number, number] = [58, 193, 806, 265];

const pct = ([x1, y1, x2, y2]: [number, number, number, number], top: number, h: number) => ({
  left: `${((x1 - SX) / W) * 100}%`,
  top: `${((y1 - top) / h) * 100}%`,
  width: `${((x2 - x1) / W) * 100}%`,
  height: `${((y2 - y1) / h) * 100}%`,
});

type Props = {
  input: string;
  setInput: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  error: string | null;
  onAction: (action: string) => void;
};

export function MockHome({ input, setInput, onSearch, loading, error, onAction }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(false);

  // 結果が無いと使えない所を押したとき：検索窓へ戻して「まず住所を」と出す
  const act = (action: string) => {
    if (action === "nudge" || action === "home") {
      scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
      if (action === "nudge") {
        setHint(true);
        inputRef.current?.focus();
        setTimeout(() => setHint(false), 2200);
      }
      return;
    }
    onAction(action);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f4f8fd]">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pt-[env(safe-area-inset-top)]">
        <div className="relative mx-auto w-full max-w-[600px]">
          {/* 絵（上の部分） */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mock/home-main.jpg" alt="" width={W} height={MAIN_H} className="block h-auto w-full select-none" draggable={false} />

          {MAIN_SPOTS.map((s) => (
            <button key={s.label + s.box[1]} onClick={() => act(s.action)} aria-label={s.label} className="absolute rounded-xl active:bg-navy/10" style={pct(s.box, TOP, MAIN_H)} />
          ))}

          {/* 本物の検索窓（絵の検索窓の上） */}
          <form
            className="absolute"
            style={pct(SEARCH_BOX, TOP, MAIN_H)}
            onSubmit={(e) => {
              e.preventDefault();
              if (window.matchMedia("(pointer: coarse)").matches) (document.activeElement as HTMLElement | null)?.blur();
              onSearch();
            }}
          >
            <label htmlFor="address" className="sr-only">
              住所
            </label>
            <div className="flex h-full items-center gap-1.5 rounded-full bg-white py-[3px] pl-3 pr-[3px] shadow-[0_6px_18px_rgba(15,47,95,0.12)] ring-1 ring-white focus-within:ring-navy/30">
              <SearchIcon className="h-5 w-5 shrink-0 text-navy" />
              <input
                ref={inputRef}
                id="address"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="住所・地番を入力"
                autoComplete="off"
                enterKeyHint="search"
                className="min-w-0 flex-1 bg-transparent text-[16px] text-navy-deep outline-none placeholder:text-steel/60"
              />
              {input && (
                <button type="button" onClick={() => setInput("")} aria-label="入力を消す" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mist text-steel">
                  <CloseIcon className="h-3 w-3" />
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                aria-label="検索"
                className="bg-navy-gradient flex aspect-square h-full shrink-0 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-60"
              >
                {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <SearchIcon className="h-[18px] w-[18px]" />}
              </button>
            </div>
            {(hint || error) && (
              <p role={error ? "alert" : undefined} className={`absolute left-2 right-2 top-full mt-2 rounded-xl px-3 py-2 text-[12.5px] shadow-[0_6px_18px_rgba(15,47,95,0.16)] ${error ? "bg-[#fdecec] text-[#b4533c]" : "bg-navy text-white"}`}>
                {error ?? "まず住所を入れて検索してください"}
              </p>
            )}
          </form>
        </div>
      </div>

      {/* 下のメニュー（絵の帯） */}
      <div className="shrink-0 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="relative mx-auto w-full max-w-[600px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mock/home-nav.jpg" alt="" width={W} height={NAV_H} className="block h-auto w-full select-none" draggable={false} />
          {NAV_SPOTS.map((s) => (
            <button key={s.label} onClick={() => act(s.action)} aria-label={s.label} className="absolute active:bg-navy/10" style={pct(s.box, NAV_TOP, NAV_H)} />
          ))}
        </div>
      </div>
    </div>
  );
}
