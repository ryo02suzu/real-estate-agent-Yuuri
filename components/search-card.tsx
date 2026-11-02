"use client";

import { useState } from "react";
import { CloseIcon, MapIcon, PasteIcon, PinIcon, SearchIcon } from "./icons";

type Props = {
  /** 結果画面の上に置く小さい版（貼り付けの行を出さない） */
  compact?: boolean;
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  /** 「地図で選ぶ」（住所の代わりに地図で場所を選ぶ） */
  onMap?: () => void;
  /** 新しいモバイルUI（青緑・白）の見た目 */
  teal?: boolean;
  /** 入力欄で Esc（日本語入力の変換中は除く）：スマホの結果の画面の「キャンセル」と同じ */
  onEscape?: () => void;
};

export function SearchCard({
  compact,
  value,
  onChange,
  onSearch,
  loading,
  onMap,
  teal,
  onEscape,
}: Props) {
  const [pasteError, setPasteError] = useState(false);

  async function paste() {
    setPasteError(false);
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) onChange(text.trim().replace(/\s+/g, " "));
    } catch {
      // 権限がない端末では長押し貼り付けに任せる
      setPasteError(true);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // スマホ・タブレットは検索したらキーボードを閉じる（開いたままだと結果の下半分が隠れる）
        if (window.matchMedia("(pointer: coarse)").matches) (document.activeElement as HTMLElement | null)?.blur();
        onSearch();
      }}
    >
      <label htmlFor="address" className="sr-only">
        住所
      </label>
      <div
        className={`flex items-center gap-2 rounded-full bg-white py-1 pl-4 pr-1 ${
          teal
            ? "border border-[var(--mui-line)] focus-within:ring-2 focus-within:ring-[var(--mui-primary)]/30"
            : "border border-white shadow-soft focus-within:ring-2 focus-within:ring-brand-light/30"
        }`}
      >
        <PinIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
        <input
          id="address"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={
            onEscape &&
            ((e) => {
              if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              onEscape();
            })
          }
          placeholder="住所・地番を入力（例：東京都渋谷区神南1-1-1）"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-ink outline-none placeholder:text-[12px] placeholder:text-muted/70"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="入力を消す"
            className={`rounded-full p-1.5 text-muted hover:bg-mint ${teal ? "mui-hit-y" : ""}`}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !value.trim()}
          aria-label="検索"
          className={`${teal ? "mui-press mui-hit bg-[var(--mui-primary)]" : "bg-gold shadow-[0_6px_16px_rgba(138,102,50,0.35)] transition active:scale-95"} flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white disabled:opacity-60`}
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <SearchIcon className="h-5 w-5" />
          )}
        </button>
      </div>
      {!compact && (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-3 text-[11px] text-muted">
          <span className="min-w-0">
            {pasteError
              ? "貼り付けできませんでした。入力欄を長押ししてください。"
              : loading
                ? "検索中…"
                : onMap
                  ? "住所か地図で調べられます"
                  : "住所を貼り付けて検索できます"}
          </span>
          <span className="flex shrink-0 gap-1.5">
            {onMap && (
              <button type="button" onClick={onMap} className={`flex items-center gap-1 rounded-full bg-mint px-2.5 py-1 font-bold text-brand ${teal ? "mui-hit" : ""}`}>
                <MapIcon className="h-3.5 w-3.5" />
                地図で選ぶ
              </button>
            )}
            {!value && (
              <button type="button" onClick={paste} className={`flex items-center gap-1 rounded-full bg-mint px-2.5 py-1 font-bold text-brand ${teal ? "mui-hit" : ""}`}>
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
