"use client";

// スマホのホーム（検索する前の画面）。新しい見た目（紺）：街並みの上にロゴ・見出し・検索と最近の検索、
// 白いパネルに「MICHILUの強み」と「できること」、いちばん下にメニュー。縦にスクロールする。
// 結果の画面と PC はまだ前の見た目（順に移す）
import { useRef, useState } from "react";
import { MUNICIPALITIES } from "@/lib/roadmap";
import { historyKey, type HistoryItem } from "@/lib/history";
import { BrandLockup } from "./brand";
import { CityHero, RoadMapArt } from "./city-hero";
import {
  AlertIcon,
  ArrowRightIcon,
  BookmarkIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  HazardIcon,
  HomeIcon,
  InfoIcon,
  LandPriceIcon,
  MapIcon,
  MenuIcon,
  ParcelIcon,
  PasteIcon,
  PinIcon,
  RoadIcon,
  SearchIcon,
  TrainIcon,
  UserIcon,
  ZoningIcon,
} from "./icons";

type Props = {
  input: string;
  setInput: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  error: string | null;
  history: HistoryItem[];
  onPickHistory: (h: HistoryItem) => void;
  onShowHistory: () => void;
  /** 「地図で選ぶ」（住所の代わりに地図で場所を選ぶ） */
  onMap: () => void;
  onMenu: () => void;
  onFavorites: () => void;
  onAccount: () => void;
  onHelp: () => void;
  onCities: () => void;
  /** 「関東1都6県」など */
  areaText: string;
};

const FEATURES: { title: string; body: string; Icon: typeof MapIcon }[] = [
  { title: "道路種別", body: "公式の道路図を物件の場所で開く", Icon: RoadIcon },
  { title: "法令・規制", body: "用途地域・建ぺい率・容積率・防火", Icon: ZoningIcon },
  { title: "ハザード", body: "洪水・土砂・高潮・津波の想定区域", Icon: HazardIcon },
  { title: "地番・筆", body: "謄本を取る地番と隣地の一覧", Icon: ParcelIcon },
  { title: "周辺環境", body: "駅・学校・施設までの徒歩の目安", Icon: TrainIcon },
  { title: "相場・地価", body: "近くの公示地価と路線価", Icon: LandPriceIcon },
];

export function HomeMobile({ input, setInput, onSearch, loading, error, history, onPickHistory, onShowHistory, onMap, onMenu, onFavorites, onAccount, onHelp, onCities, areaText }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteError, setPasteError] = useState(false);

  async function paste() {
    setPasteError(false);
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setInput(text.trim().replace(/\s+/g, " "));
    } catch {
      // 権限がない端末では長押し貼り付けに任せる
      setPasteError(true);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sky">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {/* 街並みの上：ロゴ・見出し・検索・最近の検索 */}
        <div className="relative">
          <CityHero className="absolute inset-0 h-full w-full" />
          <div className="relative px-4 pb-5 pt-[max(12px,env(safe-area-inset-top))]">
            <header className="flex items-start justify-between gap-2">
              <div className="pt-1.5">
                <BrandLockup />
              </div>
              <div className="flex shrink-0 gap-0.5">
                <TopButton Icon={ClockIcon} label="検索履歴" onClick={onShowHistory} />
                <TopButton Icon={BookmarkIcon} label="保存" onClick={onFavorites} />
                <TopButton Icon={MenuIcon} label="メニュー" onClick={onMenu} />
              </div>
            </header>

            <h1 className="mt-6 text-[29px] font-bold leading-[1.4] tracking-[0.08em] text-navy-deep">
              調べる時間を、
              <br />
              商談の時間に。
            </h1>
            <span className="mt-3 block h-[3px] w-12 rounded-full bg-navy/35" />

            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                // スマホは検索したらキーボードを閉じる（開いたままだと結果の下半分が隠れる）
                if (window.matchMedia("(pointer: coarse)").matches) (document.activeElement as HTMLElement | null)?.blur();
                onSearch();
              }}
            >
              <label htmlFor="address" className="sr-only">
                住所
              </label>
              <div className="flex items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 shadow-[0_8px_26px_rgba(15,47,95,0.14)] ring-1 ring-white focus-within:ring-navy/30">
                <SearchIcon className="h-5 w-5 shrink-0 text-navy" />
                <input
                  ref={inputRef}
                  id="address"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="住所・地番を入力"
                  autoComplete="off"
                  enterKeyHint="search"
                  className="min-w-0 flex-1 bg-transparent py-2 text-[16px] text-navy-deep outline-none placeholder:text-steel/70"
                />
                {input && (
                  <button
                    type="button"
                    onClick={() => setInput("")}
                    aria-label="入力を消す"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-steel"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  aria-label="検索"
                  className="bg-navy-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-[0_6px_16px_rgba(15,47,95,0.35)] transition active:scale-95 disabled:opacity-60"
                >
                  {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <SearchIcon className="h-5 w-5" />}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 px-2 text-[11px] text-steel">
                <span className="min-w-0 truncate">{pasteError ? "貼り付けできませんでした。入力欄を長押ししてください。" : loading ? "検索中…" : "住所か地図で調べられます"}</span>
                <span className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={onMap} className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 font-semibold text-navy shadow-[0_2px_8px_rgba(15,47,95,0.1)]">
                    <MapIcon className="h-3.5 w-3.5" />
                    地図で選ぶ
                  </button>
                  {!input && (
                    <button type="button" onClick={paste} className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 font-semibold text-navy shadow-[0_2px_8px_rgba(15,47,95,0.1)]">
                      <PasteIcon className="h-3.5 w-3.5" />
                      貼り付け
                    </button>
                  )}
                </span>
              </div>
            </form>
            {error && (
              <p role="alert" className="mt-2 flex gap-2 rounded-2xl bg-[#fdecec] p-3 text-[13px] text-[#b4533c]">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            {history.length > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <button onClick={onShowHistory} className="flex shrink-0 items-center gap-1 text-[11px] text-steel">
                  <ClockIcon className="h-4 w-4" />
                  最近の検索
                </button>
                <ul className="no-scrollbar -mr-4 flex min-w-0 flex-1 gap-2 overflow-x-auto pr-4">
                  {history.map((h) => (
                    <li key={historyKey(h)} className="shrink-0">
                      <button
                        onClick={() => onPickHistory(h)}
                        className="flex max-w-[12rem] items-center gap-1.5 rounded-full bg-mist/95 px-3 py-1.5 text-[12px] font-semibold text-navy-deep active:bg-mist"
                      >
                        {h.ll ? <MapIcon className="h-3.5 w-3.5 shrink-0 text-navy-soft" /> : <PinIcon className="h-3.5 w-3.5 shrink-0 text-navy-soft" />}
                        <span className="truncate">{h.address}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* 白いパネル：強み・できること */}
        <div className="relative -mt-3 rounded-t-[24px] bg-white px-4 pb-6 pt-5 shadow-[0_-10px_30px_rgba(15,47,95,0.07)]">
          <button
            onClick={() => inputRef.current?.focus()}
            className="bg-navy-gradient relative block w-full overflow-hidden rounded-2xl p-4 text-left text-white shadow-[0_10px_28px_rgba(15,47,95,0.28)] active:scale-[0.99]"
          >
            <RoadMapArt className="absolute inset-y-0 right-0 h-full w-[60%]" />
            <span className="relative block w-[70%]">
              <span className="inline-block rounded-full bg-white/18 px-2.5 py-0.5 text-[10.5px] tracking-[0.06em]">MICHILUの強み</span>
              <span className="mt-2 block text-[19px] font-bold leading-[1.4]">
                道路種別の地図を、
                <br />
                物件の場所で開く
              </span>
              <span className="mt-1.5 block text-[11px] leading-[1.7] text-white/85">
                建築基準法上の道路種別を、各自治体の
                <br />
                公開図面で確認できます。
              </span>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-navy">
                住所を入れて調べる
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </span>
            </span>
          </button>

          <section className="mt-5">
            <h2 className="mb-2.5 text-[14px] font-bold text-navy-deep">できること</h2>
            <div className="grid grid-cols-2 gap-2">
              {FEATURES.map(({ title, body, Icon }) => (
                <button key={title} onClick={onHelp} className="flex items-start gap-2.5 rounded-2xl border border-hairline bg-sky/70 px-3 py-3 text-left active:bg-mist">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-navy shadow-[0_2px_8px_rgba(15,47,95,0.08)]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-navy-deep">{title}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-[1.55] text-steel">{body}</span>
                  </span>
                </button>
              ))}
            </div>
            <button onClick={onCities} className="mt-2 flex w-full items-center gap-2.5 rounded-2xl border border-hairline px-3 py-3 text-left active:bg-mist">
              <span className="text-[12px] text-steel">対応エリア</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-navy-deep">
                {areaText}・全{MUNICIPALITIES.length}市区町村
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-steel" />
            </button>
          </section>

          <p className="mt-5 flex items-start gap-2 text-[10.5px] leading-[1.7] text-steel">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
          </p>
        </div>
      </div>

      {/* いちばん下のメニュー */}
      <nav className="shrink-0 border-t border-hairline bg-white px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
        <ul className="grid grid-cols-4">
          {(
            [
              ["ホーム", HomeIcon, undefined, true],
              ["検索履歴", ClockIcon, onShowHistory, false],
              ["お気に入り", BookmarkIcon, onFavorites, false],
              ["マイページ", UserIcon, onAccount, false],
            ] as const
          ).map(([label, Icon, onClick, active]) => (
            <li key={label}>
              <button onClick={onClick} aria-current={active ? "page" : undefined} className={`flex w-full flex-col items-center gap-0.5 py-1 text-[10.5px] ${active ? "font-semibold text-navy" : "text-steel"}`}>
                <Icon className="h-6 w-6" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** 右上の丸いボタン（下に名前） */
function TopButton({ Icon, label, onClick }: { Icon: typeof MapIcon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex w-[46px] flex-col items-center gap-1 text-[10px] text-navy-deep">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-navy-deep shadow-[0_4px_14px_rgba(15,47,95,0.14)]">
        <Icon className="h-5 w-5" />
      </span>
      {label}
    </button>
  );
}
