"use client";

// 見た目の見本（ChatGPT で作った画面の絵）をそのまま敷いて、絵の各部分にボタンを重ねたホーム。
// 絵の中の住所・数字は見本のままで、本物のデータではない。検索窓だけは本物（絵の検索窓の上に重ねる）。
// 本物の部品ができた所から、絵のその部分を部品に置きかえていく（public/mock/ の絵は 852px 幅の元の絵から、
// ステータスバーと下のメニューを切り離したもの）
import { useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "./icons";

/** 元の絵の大きさ（ステータスバーを除いた上の部分と、下のメニューの帯） */
const W = 852;
const TOP = 68;
const MAIN_H = 1756 - TOP;
const NAV_H = 1824 - 1756;

/** 絵の中の押せる所（元の絵の座標。x1,y1,x2,y2） */
type Spot = { label: string; box: [number, number, number, number]; action: string };

const MAIN_SPOTS: Spot[] = [
  { label: "検索履歴", box: [548, 78, 628, 148], action: "history" },
  { label: "保存", box: [650, 78, 728, 148], action: "favorites" },
  { label: "メニュー", box: [745, 78, 825, 148], action: "menu" },
  { label: "この場所の道路種別の地図を開く", box: [20, 254, 832, 494], action: "nudge" },
  { label: "お気に入り", box: [570, 532, 724, 594], action: "favorites" },
  { label: "共有", box: [733, 532, 828, 594], action: "nudge" },
  { label: "基本情報", box: [30, 618, 156, 678], action: "nudge" },
  { label: "周辺環境", box: [160, 618, 288, 678], action: "nudge" },
  { label: "相場・取引", box: [292, 618, 432, 678], action: "nudge" },
  { label: "法令・規制", box: [437, 618, 579, 678], action: "nudge" },
  { label: "ハザード", box: [583, 618, 706, 678], action: "nudge" },
  { label: "取引事例", box: [710, 618, 830, 678], action: "nudge" },
  { label: "地図で選ぶ", box: [30, 688, 422, 1128], action: "map" },
  { label: "土地の参考価格", box: [30, 1138, 422, 1264], action: "nudge" },
  { label: "周辺の取引相場", box: [30, 1270, 422, 1372], action: "nudge" },
  { label: "もっと見る", box: [705, 1385, 830, 1425], action: "nudge" },
  { label: "周辺の取引事例", box: [30, 1593, 420, 1684], action: "nudge" },
  { label: "法令・規制の詳細", box: [434, 1593, 830, 1684], action: "help" },
  { label: "この情報を共有", box: [30, 1690, 420, 1750], action: "nudge" },
  { label: "レポートを作成", box: [434, 1690, 830, 1750], action: "nudge" },
];

const NAV_SPOTS: Spot[] = [
  { label: "ホーム", box: [30, 1756, 180, 1824], action: "home" },
  { label: "検索履歴", box: [240, 1756, 400, 1824], action: "history" },
  { label: "お気に入り", box: [450, 1756, 610, 1824], action: "favorites" },
  { label: "マイページ", box: [670, 1756, 830, 1824], action: "account" },
];

/** 絵の検索窓の枠（この上に本物の検索窓を重ねる） */
const SEARCH_BOX: [number, number, number, number] = [30, 165, 822, 238];

const pct = ([x1, y1, x2, y2]: [number, number, number, number], top: number, h: number) => ({
  left: `${(x1 / W) * 100}%`,
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
    <div className="flex min-h-0 flex-1 flex-col bg-[#e5edf6]">
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
            <div className="flex h-full items-center gap-2 rounded-full bg-white pl-3 pr-2 shadow-[0_6px_18px_rgba(15,47,95,0.12)] ring-1 ring-white focus-within:ring-navy/30">
              <button type="submit" disabled={loading} aria-label="検索" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy active:bg-mist">
                {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-navy/30 border-t-navy" /> : <SearchIcon className="h-6 w-6" />}
              </button>
              <input
                ref={inputRef}
                id="address"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="住所・地番を入力"
                autoComplete="off"
                enterKeyHint="search"
                className="min-w-0 flex-1 bg-transparent text-[17px] text-navy-deep outline-none placeholder:text-steel/60"
              />
              {input && (
                <button type="button" onClick={() => setInput("")} aria-label="入力を消す" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-steel">
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
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
            <button key={s.label} onClick={() => act(s.action)} aria-label={s.label} className="absolute active:bg-navy/10" style={pct(s.box, 1756, NAV_H)} />
          ))}
        </div>
      </div>
    </div>
  );
}
