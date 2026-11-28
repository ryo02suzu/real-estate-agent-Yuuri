import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLotOk, LOT_OK_EVENT, LOT_OK_KEY, LOT_OK_MAX, lotOkIn, lotOkKey, lotOkSnapshot, setLotOk } from "./lot-ok";

/** 端末の localStorage の代わり */
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("「この筆で進める」を押した筆を端末に覚える", () => {
  const events: string[] = [];
  beforeEach(() => {
    events.length = 0;
    vi.stubGlobal("localStorage", fakeStorage());
    vi.stubGlobal("dispatchEvent", (e: Event) => events.push(e.type));
  });
  afterEach(() => {
    setLotOk("a|1", false);
    vi.unstubAllGlobals();
  });

  it("筆の鍵は地番区域と登記の地番（地図データの印の付いた区画は同じ筆）", () => {
    expect(lotOkKey({ kuiki: "渋谷区_神南_１丁目__", chibanRaw: "51-3W2" })).toBe("渋谷区_神南_１丁目__|51-3");
    expect(lotOkKey({ kuiki: "渋谷区_神南_１丁目__", chibanRaw: "51-3W1" })).toBe(lotOkKey({ kuiki: "渋谷区_神南_１丁目__", chibanRaw: "51-3" }));
  });

  it("押した筆だけ覚え、取り消すと消える。変わったら合図を出す", () => {
    expect(lotOkIn(lotOkSnapshot(), "a|1")).toBe(false);
    setLotOk("a|1", true);
    expect(lotOkIn(lotOkSnapshot(), "a|1")).toBe(true);
    expect(lotOkIn(lotOkSnapshot(), "a|2")).toBe(false);
    expect(JSON.parse(localStorage.getItem(LOT_OK_KEY)!)).toEqual(["a|1"]);
    expect(events).toEqual([LOT_OK_EVENT]);
    setLotOk("a|1", true);
    expect(JSON.parse(localStorage.getItem(LOT_OK_KEY)!)).toEqual(["a|1"]);
    setLotOk("a|1", false);
    expect(lotOkIn(lotOkSnapshot(), "a|1")).toBe(false);
    expect(localStorage.getItem(LOT_OK_KEY)).toBeNull();
  });

  it("覚える数には上限がある（古いものから消える）。壊れた値は空として読む", () => {
    for (let i = 0; i < LOT_OK_MAX + 5; i++) setLotOk(`k|${i}`, true);
    const list = JSON.parse(localStorage.getItem(LOT_OK_KEY)!) as string[];
    expect(list).toHaveLength(LOT_OK_MAX);
    expect(list[0]).toBe(`k|${LOT_OK_MAX + 4}`);
    expect(lotOkIn(lotOkSnapshot(), "k|0")).toBe(false);
    // 履歴を全部消すときは、覚えた筆も全部消す
    clearLotOk();
    expect(localStorage.getItem(LOT_OK_KEY)).toBeNull();
    expect(lotOkIn(lotOkSnapshot(), list[0])).toBe(false);
    expect(lotOkIn("{こわれた", "a|1")).toBe(false);
    expect(lotOkIn('{"a|1":true}', "a|1")).toBe(false);
  });

  it("localStorage が使えない端末では、開いている間だけ覚える", () => {
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
    setLotOk("a|1", true);
    expect(lotOkIn(lotOkSnapshot(), "a|1")).toBe(true);
    setLotOk("a|1", false);
    expect(lotOkIn(lotOkSnapshot(), "a|1")).toBe(false);
  });
});
