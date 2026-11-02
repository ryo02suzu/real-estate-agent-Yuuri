import { beforeEach, describe, expect, it, vi } from "vitest";
import { addHistory, clearHistory, loadHistory, removeHistory, restoreHistory } from "./history";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("history", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));

  it("新しい順に最大30件", () => {
    for (let i = 1; i <= 32; i++) addHistory({ address: `住所${i}`, at: i });
    const got = loadHistory().map((h) => h.address);
    expect(got).toHaveLength(30);
    expect(got.slice(0, 3)).toEqual(["住所32", "住所31", "住所30"]);
    expect(got.at(-1)).toBe("住所3");
  });

  it("同じ住所は先頭に移動して重複しない", () => {
    addHistory({ address: "A", at: 1 });
    addHistory({ address: "B", at: 2 });
    addHistory({ address: "A", at: 3, city: "越谷市" });
    expect(loadHistory()).toEqual([
      { address: "A", at: 3, city: "越谷市" },
      { address: "B", at: 2 },
    ]);
  });

  it("地図で選んだ地点は座標で区別する（同じ町の別の地点は両方残る）", () => {
    addHistory({ address: "埼玉県熊谷市宮町二丁目", at: 1, ll: [36.1471, 139.3885] });
    addHistory({ address: "埼玉県熊谷市宮町二丁目", at: 2, ll: [36.1475, 139.389] });
    addHistory({ address: "埼玉県熊谷市宮町二丁目", at: 3 });
    addHistory({ address: "埼玉県熊谷市宮町二丁目", at: 4, ll: [36.1471, 139.3885] });
    expect(loadHistory().map((h) => h.at)).toEqual([4, 3, 2]);
  });

  it("全消去できる", () => {
    addHistory({ address: "A", at: 1 });
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });

  it("localStorage が使えなくても落ちない", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadHistory()).toEqual([]);
    expect(addHistory({ address: "A", at: 1 })).toEqual([{ address: "A", at: 1 }]);
    expect(() => clearHistory()).not.toThrow();
  });

  it("選んだものだけ消して、元に戻すと同じ位置に戻る", () => {
    addHistory({ address: "A", at: 1 });
    addHistory({ address: "B", at: 2 });
    addHistory({ address: "C", at: 3, ll: [35.1, 139.1] });
    const list = loadHistory();
    const gone = [list[1], list[0]];
    const r = removeHistory(list, gone);
    expect(r.saved).toBe(true);
    expect(r.items.map((h) => h.address)).toEqual(["A"]);
    expect(loadHistory().map((h) => h.address)).toEqual(["A"]);
    expect(restoreHistory(r.items, gone).map((h) => h.at)).toEqual([3, 2, 1]);
    expect(loadHistory().map((h) => h.at)).toEqual([3, 2, 1]);
  });

  it("元に戻す前に同じ検索をし直していたら、新しい方を残す", () => {
    addHistory({ address: "A", at: 1 });
    const gone = loadHistory();
    removeHistory(gone, gone);
    const again = addHistory({ address: "A", at: 5, city: "越谷市" });
    expect(restoreHistory(again, gone)).toEqual([{ address: "A", at: 5, city: "越谷市" }]);
  });

  it("端末に保存できなくても、画面の一覧からは消せる", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    });
    const list = [
      { address: "B", at: 2 },
      { address: "A", at: 1 },
    ];
    const r = removeHistory(list, [list[0]]);
    expect(r).toEqual({ items: [{ address: "A", at: 1 }], saved: false });
    expect(restoreHistory(r.items, [list[0]]).map((h) => h.address)).toEqual(["B", "A"]);
  });

  it("壊れたデータは無視する", () => {
    localStorage.setItem("michilu:history", "{broken");
    expect(loadHistory()).toEqual([]);
  });
});
