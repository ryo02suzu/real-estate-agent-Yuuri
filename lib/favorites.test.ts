import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFavorites, removeFavorite, restoreFavorite, toggleFavorite } from "./favorites";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const a = { address: "A", at: 1 };
const b = { address: "B", at: 2 };
const c = { address: "C", at: 3 };

describe("favorites の元に戻す", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    // 新しく保存したものが先頭：C, B, A
    toggleFavorite(a);
    toggleFavorite(b);
    toggleFavorite(c);
  });

  it("外したものを元の位置に戻す", () => {
    const index = loadFavorites().findIndex((f) => f.address === "B");
    removeFavorite(b);
    expect(loadFavorites().map((f) => f.address)).toEqual(["C", "A"]);
    expect(restoreFavorite(b, index).map((f) => f.address)).toEqual(["C", "B", "A"]);
    expect(loadFavorites().map((f) => f.address)).toEqual(["C", "B", "A"]);
  });

  it("もう入っていれば増やさない", () => {
    expect(restoreFavorite(b, 0).map((f) => f.address)).toEqual(["C", "B", "A"]);
  });

  it("位置が一覧より後ろなら最後に、負なら先頭に", () => {
    removeFavorite(a);
    expect(restoreFavorite(a, 99).map((f) => f.address)).toEqual(["C", "B", "A"]);
    removeFavorite(c);
    expect(restoreFavorite(c, -3).map((f) => f.address)).toEqual(["C", "B", "A"]);
  });

  it("地図で選んだ地点は座標で見分ける（同じ町の別の地点を戻せる）", () => {
    const p = { address: "埼玉県熊谷市宮町二丁目", at: 4, ll: [36.1471, 139.3885] as [number, number] };
    const q = { address: "埼玉県熊谷市宮町二丁目", at: 5, ll: [36.1475, 139.389] as [number, number] };
    toggleFavorite(p);
    toggleFavorite(q);
    removeFavorite(p);
    expect(restoreFavorite(p, 1).map((f) => f.ll?.join(","))).toEqual(["36.1475,139.389", "36.1471,139.3885", undefined, undefined, undefined]);
  });
});
