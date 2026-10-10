import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

describe("一度だけ読み直す", () => {
  it("1回目が失敗しても、2回目が成功すればその結果", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("502")).mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { delayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("2回とも失敗すれば失敗", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("502"));
    await expect(withRetry(fn, { delayMs: 1 })).rejects.toThrow("502");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
