import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadOtherLaws, type LawKey } from "./other-laws-load";

const morido = { authority: "東京都" };
const hourei = { pref: "13", hits: [], missing: [] };
const tochi = { year: 2015 };
function loaders() {
  return {
    morido: vi.fn(async () => morido),
    hourei: vi.fn(async () => hourei),
    tochi: vi.fn(async () => tochi),
  };
}

describe("その他の法令の部分的な読み込み失敗", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("正常な区域外の結果はそのまま残す", async () => {
    expect(await loadOtherLaws(loaders())).toEqual({ morido, hourei, tochi, lawErrors: [] });
  });

  it("対象外の null を通信失敗にしない", async () => {
    const empty = vi.fn(async () => null);
    expect(await loadOtherLaws({ morido: empty, hourei: empty, tochi: empty })).toEqual({
      morido: undefined, hourei: undefined, tochi: undefined, lawErrors: [],
    });
    expect(empty).toHaveBeenCalledTimes(3);
  });

  it.each<LawKey>(["morido", "hourei", "tochi"])("%s が失敗しても他の取得結果を残し、区域外とは扱わない", async (key) => {
    const source = loaders();
    source[key].mockRejectedValue(new Error("503"));
    const pending = loadOtherLaws(source);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ morido, hourei, tochi, [key]: undefined, lawErrors: [key] });
    expect(source[key]).toHaveBeenCalledTimes(2);
  });

  it("一時的な通信失敗から自動で復旧したときは未確認にしない", async () => {
    const source = loaders();
    source.morido.mockRejectedValueOnce(new Error("503"));
    const pending = loadOtherLaws(source);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ morido, hourei, tochi, lawErrors: [] });
    expect(source.morido).toHaveBeenCalledTimes(2);
  });

  it("再読み込みでは指定した種類だけを更新し、取得済みの結果を消さない", async () => {
    const source = loaders();
    const result = await loadOtherLaws(source, ["hourei"]);
    expect(result).toEqual({ hourei, lawErrors: [] });
    expect({ morido, tochi, ...result }).toEqual({ morido, hourei, tochi, lawErrors: [] });
    expect(source.morido).not.toHaveBeenCalled();
    expect(source.tochi).not.toHaveBeenCalled();
  });

  it("全種類の失敗を保持し、再試行も失敗なら未確認のままにする", async () => {
    const source = loaders();
    for (const fn of Object.values(source)) fn.mockRejectedValue(new Error("offline"));
    const pending = loadOtherLaws(source);
    await vi.runAllTimersAsync();
    const first = await pending;
    expect(first.lawErrors).toEqual(["morido", "hourei", "tochi"]);
    const retry = loadOtherLaws(source, first.lawErrors);
    await vi.runAllTimersAsync();
    expect(await retry).toEqual(first);
  });
});
