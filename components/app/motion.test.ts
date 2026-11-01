import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const KEY = "michilu:motion";
let data: Map<string, string>;
// 呼び出せる形の型にする（ReturnType<typeof vi.fn> だと、テストの中で storage.getItem(KEY) を呼べない）
let storage: {
  getItem: Mock<(key: string) => string | null>;
  setItem: Mock<(key: string, value: string) => void>;
  removeItem: Mock<(key: string) => void>;
};
let notify: ReturnType<typeof vi.fn>;

function denied(): never {
  throw new DOMException("保存が拒否されました", "SecurityError");
}

beforeEach(() => {
  vi.resetModules();
  data = new Map();
  storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
  };
  notify = vi.fn();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("dispatchEvent", notify);
});

afterEach(() => vi.unstubAllGlobals());

describe("動きの設定と端末保存の失敗", () => {
  it("保存できる場合は選択を保存し、別の画面からの変更も読み直す", async () => {
    const { motionSetting, setMotionSetting } = await import("./motion");
    expect(motionSetting()).toBe(true);
    setMotionSetting(false);
    expect(data.get(KEY)).toBe("off");
    expect(motionSetting()).toBe(false);
    setMotionSetting(true);
    expect(data.has(KEY)).toBe(false);
    data.set(KEY, "off");
    expect(motionSetting()).toBe(false);
    expect(notify.mock.calls.map(([event]) => event.type)).toEqual([KEY, KEY]);
  });

  it("読み書きが拒否されても、このページの間はOFFとONを選び直せる", async () => {
    Object.values(storage).forEach((method) => method.mockImplementation(denied));
    const { motionSetting, setMotionSetting } = await import("./motion");
    expect(motionSetting()).toBe(true);
    setMotionSetting(false);
    expect(motionSetting()).toBe(false);
    expect(motionSetting()).toBe(false);
    setMotionSetting(true);
    expect(motionSetting()).toBe(true);
    setMotionSetting(false);
    expect(motionSetting()).toBe(false);
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it("読むことはできてもOFFの保存が拒否されたら、古いONに戻らない", async () => {
    storage.setItem.mockImplementation(denied);
    const { motionSetting, setMotionSetting } = await import("./motion");
    setMotionSetting(false);
    expect(storage.getItem(KEY)).toBeNull();
    expect(motionSetting()).toBe(false);
    expect(motionSetting()).toBe(false);
  });

  it("保存済みOFFの削除が拒否されても、このページではONにできる", async () => {
    data.set(KEY, "off");
    storage.removeItem.mockImplementation(denied);
    const { motionSetting, setMotionSetting } = await import("./motion");
    expect(motionSetting()).toBe(false);
    setMotionSetting(true);
    expect(storage.getItem(KEY)).toBe("off");
    expect(motionSetting()).toBe(true);
  });

  it("途中で読み取りが拒否されても、最後に読めたOFFを維持する", async () => {
    data.set(KEY, "off");
    const { motionSetting } = await import("./motion");
    expect(motionSetting()).toBe(false);
    storage.getItem.mockImplementation(denied);
    expect(motionSetting()).toBe(false);
  });

  it("保存が復旧して選び直せたら、端末保存との同期に戻る", async () => {
    storage.setItem.mockImplementation(denied);
    const { motionSetting, setMotionSetting } = await import("./motion");
    setMotionSetting(false);
    expect(motionSetting()).toBe(false);
    setMotionSetting(true);
    expect(motionSetting()).toBe(true);
    data.set(KEY, "off");
    expect(motionSetting()).toBe(false);
  });
});
