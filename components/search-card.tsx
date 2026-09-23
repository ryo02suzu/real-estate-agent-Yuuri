"use client";

import { useState } from "react";
import { CloseIcon, PasteIcon, SearchIcon } from "./icons";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
  /** 例: 「埼玉県・千葉県 全117市町村に対応」 */
  coverageText: string;
  onShowCities: () => void;
};

export function SearchCard({ value, onChange, onSearch, loading, coverageText, onShowCities }: Props) {
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
      className="rounded-3xl bg-white p-4 border border-line shadow-[0_4px_24px_rgba(30,63,74,0.06)]"
    >
      <label htmlFor="address" className="sr-only">
        住所
      </label>
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 focus-within:border-brand-light focus-within:ring-2 focus-within:ring-brand-light/20">
        <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
        <input
          id="address"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="住所を入力"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-3.5 text-base text-ink outline-none placeholder:text-muted/70"
        />
        {value ? (
          <button type="button" onClick={() => onChange("")} aria-label="入力を消す" className="rounded-full p-1.5 text-muted hover:bg-mint">
            <CloseIcon className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={paste} className="flex shrink-0 items-center gap-1 rounded-xl bg-mint px-2.5 py-1.5 text-xs font-bold text-brand">
            <PasteIcon className="h-4 w-4" />
            貼り付け
          </button>
        )}
      </div>
      <p className="mt-2 px-1 text-xs text-muted">
        {pasteError ? "貼り付けできませんでした。入力欄を長押しして貼り付けてください。" : "例）埼玉県越谷市越ヶ谷4-2-1"}
      </p>

      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-40"
      >
        {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <SearchIcon className="h-5 w-5" />}
        {loading ? "検索中…" : "検索"}
      </button>

      <button type="button" onClick={onShowCities} className="mt-3 w-full text-center text-xs text-brand underline-offset-2 hover:underline">
        {coverageText}（一覧を見る）
      </button>
    </form>
  );
}
