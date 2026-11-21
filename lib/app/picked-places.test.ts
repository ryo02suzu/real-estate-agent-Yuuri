import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LookupResult } from "../roadmap";
import { forgetPlace, needsPick, PICKED_KEY, PICKED_MAX, placeDate, placeKey, recallPlace, rememberPlace } from "./picked-places";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

// テストの住所は公の施設（東京駅・桐生市役所）
const ok = (extra: Partial<Extract<LookupResult, { status: "ok" }>>) =>
  ({ status: "ok", lat: 35.68, lng: 139.76, matchedAddress: "東京都千代田区丸の内一丁目9番", town: "丸の内一丁目", approximate: false, ...extra }) as LookupResult;

describe("地図で選んだ物件の場所を、端末に覚える", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));

  it("覚えた場所を、同じ住所で（全角・半角・空白・ハイフンの違いがあっても）思い出す", () => {
    rememberPlace("千代田区丸の内1-9-1", 35.6812, 139.7671, 1000);
    expect(recallPlace("千代田区丸の内１−９−１")).toEqual({ q: "千代田区丸の内1-9-1", lat: 35.6812, lng: 139.7671, at: 1000 });
    expect(recallPlace(" 千代田区丸の内1ー9ー1")).toBeUndefined(); // 長音はそろえない（町名に使う）
    expect(recallPlace("千代田区丸の内1-9-2")).toBeUndefined();
  });

  it("同じ住所は新しい場所に置き換え、新しい順に最大 PICKED_MAX 件", () => {
    rememberPlace("桐生市織姫町1-1", 36.4, 139.3, 1);
    rememberPlace("桐生市織姫町1-1", 36.41, 139.31, 2);
    expect(recallPlace("桐生市織姫町1-1")?.lat).toBe(36.41);
    for (let i = 0; i < PICKED_MAX + 5; i++) rememberPlace(`住所${i}`, 35, 139, 10 + i);
    const list = JSON.parse(localStorage.getItem(PICKED_KEY) ?? "[]") as { q: string }[];
    expect(list).toHaveLength(PICKED_MAX);
    expect(list[0].q).toBe(`住所${PICKED_MAX + 4}`);
    expect(recallPlace("桐生市織姫町1-1")).toBeUndefined(); // いちばん古いものから消える
  });

  it("消せる。最後の1件を消すと保存の場所ごと消す", () => {
    rememberPlace("千代田区丸の内1-9-1", 35.68, 139.76);
    forgetPlace("千代田区丸の内１－９－１");
    expect(recallPlace("千代田区丸の内1-9-1")).toBeUndefined();
    expect(localStorage.getItem(PICKED_KEY)).toBeNull();
  });

  it("保存できない端末・壊れたデータでも止まらない", () => {
    localStorage.setItem(PICKED_KEY, "{壊れた");
    expect(recallPlace("千代田区丸の内1-9-1")).toBeUndefined();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("使えない");
      },
      setItem: () => {
        throw new Error("使えない");
      },
      removeItem: () => {
        throw new Error("使えない");
      },
    });
    expect(() => rememberPlace("千代田区丸の内1-9-1", 35.68, 139.76)).not.toThrow();
    expect(recallPlace("千代田区丸の内1-9-1")).toBeUndefined();
  });

  it("空の住所・数でない座標は覚えない", () => {
    expect(rememberPlace("  ", 35, 139)).toBeUndefined();
    expect(rememberPlace("桐生市織姫町1-1", Number.NaN, 139)).toBeUndefined();
    expect(placeKey(" ")).toBe("");
  });

  it("場所が確かでない結果（見つからない・町の中心・街区の代表点・地番の筆が無い）のときだけ、地図で選んだら覚える", () => {
    expect(needsPick({ status: "not_found" }, "千代田区丸の内1-9-1")).toBe(true);
    expect(needsPick(ok({}), "千代田区丸の内1-9-1")).toBe(true); // 号が無く、9番の代表点
    expect(needsPick(ok({ approximate: true, matchedAddress: "東京都千代田区丸の内一丁目" }), "千代田区丸の内1-9-1")).toBe(true); // 町の中心
    expect(needsPick(ok({ matchedAddress: "東京都千代田区丸の内一丁目9番1号" }), "千代田区丸の内1-9-1")).toBe(false); // 号まで
    expect(needsPick(ok({ parcelMiss: { near: [] } as never }), "桐生市織姫町1番1")).toBe(true);
    expect(needsPick(ok({ picked: true }), "")).toBe(false); // 地図で選んだ地点そのもの
    expect(needsPick({ status: "choose", candidates: [] }, "新宿3-1-1")).toBe(false); // 候補から選ぶ
  });

  it("画面の日付", () => {
    expect(placeDate(new Date(2026, 10, 21, 9, 0).getTime())).toBe("11月21日");
  });
});
