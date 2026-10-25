import { beforeEach, describe, expect, it } from "vitest";
import { bundleSummary, importBundle, makeBundle } from "./backup";
import { toggleDone } from "./checklist";
import { loadFavorites, toggleFavorite } from "./favorites";
import { addHistory, loadHistory } from "./history";
import { loadRecords, writeRecord } from "./records";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

describe("書き出しと読み込み", () => {
  it("書き出した中身を確かめてから、足すだけで読み込める", () => {
    addHistory({ address: "東京都渋谷区神南一丁目19番11号", city: "渋谷区", coverage: "full", at: 1000, pid: "a:x" });
    toggleFavorite({ address: "東京都渋谷区神南一丁目19番11号", city: "渋谷区", coverage: "full", at: 1000 });
    writeRecord("a:x", "東京都渋谷区神南一丁目19番11号", "road", "kind", { done: true, method: "公式サイト" });
    toggleDone("35.66000,139.70000", "road");
    const text = JSON.stringify(makeBundle(new Date("2026-10-25T00:00:00Z")));
    const s = bundleSummary(text);
    expect(s).toMatchObject({ ok: true, history: 1, favorites: 1, records: 1, first: ["東京都渋谷区神南一丁目19番11号"] });

    // 別の端末（空）に読み込む
    store.clear();
    const r = importBundle(text);
    expect(r.added).toEqual({ history: 1, favorites: 1, records: 1, checklist: 1 });
    expect(loadHistory()).toHaveLength(1);
    expect(loadFavorites()).toHaveLength(1);
    expect(loadRecords("a:x").items.road?.kind.done).toBe(true);
    // もう一度読み込んでも増えない
    expect(importBundle(text).added).toEqual({ history: 0, favorites: 0, records: 0, checklist: 0 });
  });
  it("MICHILU のファイルでなければ断る", () => {
    expect(bundleSummary("{}")).toMatchObject({ ok: false });
    expect(bundleSummary("not json")).toMatchObject({ ok: false });
    expect(importBundle("{}").ok).toBe(false);
  });
});
