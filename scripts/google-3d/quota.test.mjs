// Google の実写 3D の回数の見張り役（scripts/google-3d/quota.mjs）の、日付と割り当ての計算
import { describe, expect, it } from "vitest";
import { pacificMidnight, pacificParts, pacificWindow, pickQuota, planLimit, sumSeries } from "./quota.mjs";

describe("太平洋時間の日付（1 日の割り当ては太平洋時間の 0 時に戻る）", () => {
  it("冬（UTC−8）・夏（UTC−7）・切り替えの日の 0 時", () => {
    expect(pacificMidnight(2026, 11, 8).toISOString()).toBe("2026-11-08T08:00:00.000Z");
    expect(pacificMidnight(2026, 7, 1).toISOString()).toBe("2026-07-01T07:00:00.000Z");
    // 夏時間の始まり（3/8 の 2 時）と終わり（11/1 の 2 時）の日の 0 時は、まだ前の時間
    expect(pacificMidnight(2026, 3, 8).toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(pacificMidnight(2026, 11, 1).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(pacificParts(new Date("2026-11-09T07:45:00Z"))).toEqual({ y: 2026, m: 11, d: 8, hh: 23, mm: 45 });
  });
  it("今日と今月の始まり・23:30 を過ぎたか・明日が同じ月か", () => {
    const w = pacificWindow(new Date("2026-11-08T20:00:00Z"));
    expect(w.today.toISOString()).toBe("2026-11-08T08:00:00.000Z");
    expect(w.month.toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(w.late).toBe(false);
    expect(w.sameMonthTomorrow).toBe(true);
    const last = pacificWindow(new Date("2026-12-01T07:45:00Z"));
    expect(last.late).toBe(true);
    expect(last.sameMonthTomorrow).toBe(false);
  });
});

describe("その日の割り当て（月の上限 − 今月使った数。日ごとの上限は付けない）", () => {
  it("ふだんは、今月の前の日までに使った数を引いた残りを今日の割り当てに", () => {
    expect(planLimit({ cap: 999, usedBeforeToday: 300, usedToday: 50, now: new Date("2026-11-08T20:00:00Z") })).toEqual({ limit: 699, mode: "today" });
    // 月の初め：999 回全部をその日に使える
    expect(planLimit({ cap: 999, usedBeforeToday: 0, usedToday: 0, now: new Date("2026-11-01T18:00:00Z") })).toEqual({ limit: 999, mode: "today" });
  });
  it("23:30 を過ぎたら、明日の分（今日使った数も引く）を先に入れる。月の最後の日は今日の分のまま", () => {
    expect(planLimit({ cap: 999, usedBeforeToday: 300, usedToday: 50, now: new Date("2026-11-09T07:45:00Z") })).toEqual({ limit: 649, mode: "tomorrow" });
    expect(planLimit({ cap: 999, usedBeforeToday: 900, usedToday: 80, now: new Date("2026-12-01T07:45:00Z") })).toEqual({ limit: 99, mode: "today" });
  });
  it("使い切ったら 0（それ以上は Google が断る）", () => {
    expect(planLimit({ cap: 999, usedBeforeToday: 999, usedToday: 0, now: new Date("2026-11-20T20:00:00Z") }).limit).toBe(0);
    expect(planLimit({ cap: 999, usedBeforeToday: 1200, usedToday: 0, now: new Date("2026-11-20T20:00:00Z") }).limit).toBe(0);
  });
});

describe("割り当ての選び方・数の足し方", () => {
  const infos = [
    { quotaId: "RootTilesetRequestsPerDay", metric: "tile.googleapis.com/root_requests", refreshInterval: "day", quotaDisplayName: "Root tileset requests per day" },
    { quotaId: "RendererRequestsPerMinute", metric: "tile.googleapis.com/renderer_requests", refreshInterval: "minute", quotaDisplayName: "Renderer requests per minute" },
  ];
  it("ID の指定があればそれ、無ければ 1 日の「root」の割り当て", () => {
    expect(pickQuota(infos, "RendererRequestsPerMinute").quotaId).toBe("RendererRequestsPerMinute");
    expect(pickQuota(infos, "").quotaId).toBe("RootTilesetRequestsPerDay");
  });
  it("見つからない・2 つ以上なら止まる（割り当ての一覧を出す）", () => {
    expect(() => pickQuota(infos, "Nope")).toThrow(/Nope/);
    expect(() => pickQuota([...infos, { ...infos[0], quotaId: "Root2" }], "")).toThrow(/GOOGLE_3D_QUOTA_ID/);
    expect(() => pickQuota([infos[1]], "")).toThrow(/0 個/);
  });
  it("Cloud Monitoring の答えの点を全部足す（int64 は文字で来る）", () => {
    expect(sumSeries({ timeSeries: [{ points: [{ value: { int64Value: "12" } }, { value: { int64Value: "3" } }] }, { points: [{ value: { int64Value: "5" } }] }] })).toBe(20);
    expect(sumSeries({})).toBe(0);
  });
});
