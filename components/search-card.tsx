"use client";

import { useState } from "react";
import { CloseIcon, PasteIcon, PinIcon, SearchIcon } from "./icons";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
};

export function SearchCard({ value, onChange, onSearch, loading }: Props) {
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
        onSearch();
      }}
    >
      <label htmlFor="address" className="sr-only">
        住所
      </label>
      <div className="flex items-center gap-2 rounded-full border border-white bg-white py-2 pl-5 pr-2 shadow-soft focus-within:ring-2 focus-within:ring-brand-light/30">
        <PinIcon className="h-5 w-5 shrink-0 text-muted" />
        <input
          id="address"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="住所を入力（例：東京都渋谷区神南1-1-1）"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-ink outline-none placeholder:text-[13px] placeholder:text-muted/70"
        />
        {value && (
          <button type="button" onClick={() => onChange("")} aria-label="入力を消す" className="rounded-full p-1.5 text-muted hover:bg-mint">
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !value.trim()}
          aria-label="検索"
          className="bg-gold flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-[0_6px_16px_rgba(138,102,50,0.35)] transition active:scale-95 disabled:opacity-60"
        >
          {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <SearchIcon className="h-6 w-6" />}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between px-3 text-xs text-muted">
        <span>{pasteError ? "貼り付けできませんでした。入力欄を長押ししてください。" : loading ? "検索中…" : "住所を貼り付けて検索できます"}</span>
        {!value && (
          <button type="button" onClick={paste} className="flex shrink-0 items-center gap-1 rounded-full bg-mint px-3 py-1.5 font-bold text-brand">
            <PasteIcon className="h-3.5 w-3.5" />
            貼り付け
          </button>
        )}
      </div>
    </form>
  );
}
