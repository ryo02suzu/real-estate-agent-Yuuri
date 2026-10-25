import { beforeEach, describe, expect, it } from "vitest";
import { latestResume, loadResume, RESUME_DAYS, saveResume } from "./resume";

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

describe("調査の再開", () => {
  it("物件ごとにタブ・シート・スクロール位置を残し、直近の物件を「続きから」に出す", () => {
    saveResume({ pid: "a:x", label: "渋谷区神南1-19-11", historyKey: "渋谷区神南1-19-11", tab: "law", sheet: "roads", scroll: 120 });
    const r = loadResume("a:x");
    expect(r).toMatchObject({ tab: "law", sheet: "roads", scroll: 120 });
    expect(latestResume()?.pid).toBe("a:x");
    // 7日を過ぎたら「続きから」にも、開いたときの復元にも使わない
    const later = Date.now() + (RESUME_DAYS + 1) * 86400e3;
    expect(latestResume(later)).toBeUndefined();
    expect(loadResume("a:x", later)).toBeUndefined();
  });
  it("鍵の無い物件は残さない", () => {
    saveResume({ pid: "", label: "", historyKey: "", tab: "basic", scroll: 0 });
    expect(latestResume()).toBeUndefined();
  });
});
