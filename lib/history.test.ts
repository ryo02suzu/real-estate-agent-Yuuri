import { beforeEach, describe, expect, it, vi } from "vitest";
import { addHistory, clearHistory, loadHistory } from "./history";

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

  it("新しい順に最大5件", () => {
    for (let i = 1; i <= 7; i++) addHistory({ address: `住所${i}`, at: i });
    expect(loadHistory().map((h) => h.address)).toEqual(["住所7", "住所6", "住所5", "住所4", "住所3"]);
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

  it("壊れたデータは無視する", () => {
    localStorage.setItem("michilu:history", "{broken");
    expect(loadHistory()).toEqual([]);
  });
});
