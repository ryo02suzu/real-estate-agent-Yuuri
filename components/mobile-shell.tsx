"use client";

// スマホの新しい見た目（紺）の枠：上にロゴと右上のボタン、検索窓、いちばん下にメニュー。中身（ホーム・結果）は縦にスクロールする。
// .theme-navy で、今までの部品（シート・カード）の色も紺になる（app/globals.css）
import { BrandLockup } from "./brand";
import { CityHero } from "./city-hero";
import { BookmarkIcon, ClockIcon, CloseIcon, HomeIcon, MapIcon, MenuIcon, PasteIcon, SearchIcon, UserIcon } from "./icons";
import { useState } from "react";

export function MobileFrame({ header, search, nav, children }: { header: React.ReactNode; search: React.ReactNode; nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="theme-navy flex min-h-0 flex-1 flex-col bg-sky text-ink">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="relative">
          <CityHero className="absolute inset-0 h-full w-full" />
          <div className="relative mx-auto max-w-[600px] px-4 pb-3 pt-[max(10px,env(safe-area-inset-top))]">
            {header}
            {search}
          </div>
        </div>
        <div className="mx-auto max-w-[600px]">{children}</div>
      </div>
      {nav}
    </div>
  );
}

/** ロゴと、右上の 検索履歴・保存・メニュー */
export function MobileHeader({ onHome, onHistory, onFavorites, onMenu }: { onHome?: () => void; onHistory: () => void; onFavorites: () => void; onMenu: () => void }) {
  const lockup = <BrandLockup />;
  return (
    <header className="flex items-center justify-between gap-2">
      {onHome ? (
        <button onClick={onHome} aria-label="ホームへ戻る" className="shrink-0 text-left">
          {lockup}
        </button>
      ) : (
        <div className="shrink-0">{lockup}</div>
      )}
      <div className="flex shrink-0 gap-1">
        <TopButton Icon={ClockIcon} label="検索履歴" onClick={onHistory} />
        <TopButton Icon={BookmarkIcon} label="保存" onClick={onFavorites} />
        <TopButton Icon={MenuIcon} label="メニュー" onClick={onMenu} />
      </div>
    </header>
  );
}

function TopButton({ Icon, label, onClick }: { Icon: typeof MapIcon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex w-[48px] flex-col items-center gap-0.5 text-[10px] text-navy-deep">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-navy-deep">
        <Icon className="h-[22px] w-[22px]" />
      </span>
      {label}
    </button>
  );
}

/** 検索窓（白い丸い枠、右に紺の丸いボタン）。home のときは下に「地図で選ぶ」「貼り付け」 */
export function MobileSearch({
  inputRef,
  input,
  setInput,
  onSearch,
  loading,
  onMap,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  input: string;
  setInput: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  /** ホームだけ：「地図で選ぶ」 */
  onMap?: () => void;
}) {
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
    <form
      className="mt-3"
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
      <div className="flex items-center gap-1.5 rounded-full bg-white py-1 pl-3.5 pr-1 shadow-[0_6px_18px_rgba(15,47,95,0.12)] ring-1 ring-white focus-within:ring-navy/30">
        <SearchIcon className="h-5 w-5 shrink-0 text-navy" />
        <input
          ref={inputRef}
          id="address"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="住所・地番を入力"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[16px] text-navy-deep outline-none placeholder:text-steel/60"
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
          className="bg-navy-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-60"
        >
          {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <SearchIcon className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {onMap && (
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
      )}
    </form>
  );
}

/** いちばん下のメニュー */
export function BottomNav({ active, onHome, onHistory, onFavorites, onAccount }: { active?: "home"; onHome: () => void; onHistory: () => void; onFavorites: () => void; onAccount: () => void }) {
  const items = [
    ["ホーム", HomeIcon, onHome, active === "home"],
    ["検索履歴", ClockIcon, onHistory, false],
    ["お気に入り", BookmarkIcon, onFavorites, false],
    ["マイページ", UserIcon, onAccount, false],
  ] as const;
  return (
    <nav className="shrink-0 border-t border-hairline bg-white px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
      <ul className="mx-auto grid max-w-[600px] grid-cols-4">
        {items.map(([label, Icon, onClick, on]) => (
          <li key={label}>
            <button onClick={onClick} aria-current={on ? "page" : undefined} className={`flex w-full flex-col items-center gap-0.5 py-1 text-[10.5px] ${on ? "font-semibold text-navy" : "text-steel"}`}>
              <Icon className="h-6 w-6" />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
