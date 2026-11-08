import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, GOOGLE_RENEW_MS, GOOGLE_SESSION_MS, googleFailOf, googleFailText, googleLight, modelLight, parsePrefs, sessionUsable, todOfSun } from "./desk";

describe("PC の設定の読み込み", () => {
  it("無い・壊れた・知らない値は既定に戻す", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("[1,2]")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ theme: "purple", tod: "noon", zoom: 3 }))).toEqual(DEFAULT_PREFS);
  });
  it("正しい値はそのまま", () => {
    const p = { theme: "dark", todMode: "manual", tod: "evening", zoom: "far" };
    expect(parsePrefs(JSON.stringify(p))).toEqual(p);
  });
});

describe("時間帯", () => {
  it("時計：昇る途中の低い太陽は朝、高ければ昼、沈む途中は夕、沈みきれば夜", () => {
    expect(todOfSun(8, true)).toBe("morning");
    expect(todOfSun(40, true)).toBe("day");
    expect(todOfSun(30, false)).toBe("day");
    expect(todOfSun(3, false)).toBe("evening");
    expect(todOfSun(-12, false)).toBe("night");
  });
  it("模型の光：選んだ時間帯は、その時間帯らしい太陽（朝は東・夕は西の低い日）", () => {
    expect(modelLight("morning")).toMatchObject({ part: "day", az: 105 });
    expect(modelLight("evening")).toMatchObject({ part: "evening", az: 250 });
    expect(modelLight("night").part).toBe("night");
    // 時計に合わせるときは今の太陽の向き
    expect(modelLight("day", { az: 200, alt: 33 })).toEqual({ part: "day", az: 200, alt: 33 });
  });
  it("Google の 3D の光：昼は写真の色のまま近く、夜は暗い青に寄せる。太陽が沈んでいれば向きは時間帯のまま", () => {
    const day = googleLight("day");
    expect(day.tint).toEqual([1, 1, 1]);
    expect(day.ambient + day.sun).toBeGreaterThan(1);
    const night = googleLight("night");
    expect(night.tint[0]).toBeLessThan(0.6);
    expect(night.sun).toBe(0);
    expect(googleLight("evening", { az: 255, alt: -3 }).az).toBe(250);
    expect(googleLight("evening", { az: 255, alt: 5 })).toMatchObject({ az: 255, alt: 5 });
  });
});

describe("Google の実写 3D のセッション（1 回のルートの要求で 3 時間まで）", () => {
  const t0 = 1_700_000_000_000;
  it("作ってから 2 時間 55 分までは使い回す。その後と、まだ作っていないときは取り直す", () => {
    expect(GOOGLE_SESSION_MS).toBe(3 * 3600_000);
    expect(sessionUsable(t0, t0)).toBe(true);
    expect(sessionUsable(t0, t0 + GOOGLE_RENEW_MS - 1)).toBe(true);
    expect(sessionUsable(t0, t0 + GOOGLE_RENEW_MS)).toBe(false);
    expect(sessionUsable(0, t0)).toBe(false);
    // 時計が戻った（端末の時刻を直した）ときも取り直す
    expect(sessionUsable(t0, t0 - 1000)).toBe(false);
  });
  it("断られたわけ：429 は上限、403 は使えない設定、ほかは読めなかった", () => {
    expect(googleFailOf(429)).toBe("quota");
    expect(googleFailOf(403)).toBe("denied");
    expect(googleFailOf(500)).toBe("failed");
    expect(googleFailOf(undefined)).toBe("failed");
    expect(googleFailText("quota")).toMatch(/上限/);
    expect(googleFailText("nokey")).toMatch(/地理院/);
  });
});
