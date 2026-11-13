import { describe, expect, it } from "vitest";
import { contrastWithWhite, statusBarColor } from "./status-bar";

describe("時刻・電池の帯の色（白い字が読める濃さ）", () => {
  it("暗い色（ホームの空・履歴の写真の上など）は、そのまま", () => {
    expect(statusBarColor("#386fab")).toBe("#386fab");
    expect(statusBarColor("#4f5a63")).toBe("#4f5a63");
    expect(statusBarColor("#03060f")).toBe("#03060f");
  });

  it("明るい色（物件が見つからない画面・明るい空）は、白い字が読めるまで紺に寄せる", () => {
    for (const light of ["#bec7d2", "#e6eff9", "#7bb9e8", "#ffffff"]) {
      const c = statusBarColor(light);
      expect(c).not.toBe(light);
      expect(contrastWithWhite(c)).toBeGreaterThanOrEqual(3);
      // 寄せすぎない（明るさの比が 4.5 を大きく超えるほど暗くしない）
      expect(contrastWithWhite(c)).toBeLessThan(4.5);
    }
  });

  it("3桁の色と、読めない書き方", () => {
    expect(contrastWithWhite(statusBarColor("#fff"))).toBeGreaterThanOrEqual(3);
    expect(statusBarColor("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });
});
