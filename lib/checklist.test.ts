import { afterEach, describe, expect, it, vi } from "vitest";
import { checklistKey, loadDone, toggleDone } from "./checklist";

function fakeStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), clear: () => map.clear(), key: () => null, length: 0 };
}

describe("やることの済んだ印", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("物件ごとに済・未済を入れ替えて端末に残す", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const k = checklistKey(35.662926, 139.699448);
    expect(k).toBe("35.66293,139.69945");
    expect(loadDone(k).size).toBe(0);
    expect([...toggleDone(k, "touki")]).toEqual(["touki"]);
    expect([...toggleDone(k, "road")]).toEqual(["touki", "road"]);
    expect([...toggleDone(k, "touki")]).toEqual(["road"]);
    expect([...loadDone(k)]).toEqual(["road"]);
    // 別の物件には影響しない
    expect(loadDone(checklistKey(35.5, 139.6)).size).toBe(0);
  });

  it("localStorage が使えなくても落ちない", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadDone("a").size).toBe(0);
    expect([...toggleDone("a", "site")]).toEqual(["site"]);
  });
});
