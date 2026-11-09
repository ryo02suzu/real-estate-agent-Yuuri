import { afterEach, describe, expect, it, vi } from "vitest";
import { webglAvailable } from "./map-style";

/** WebGL の文脈の代わり（WEBGL_lose_context があるもの） */
function fakeCanvas(gl: object | null) {
  return { getContext: (kind: string) => (kind === "webgl2" ? gl : null) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WebGL が使えるかの確認", () => {
  it("使えるなら true。確かめるために作った文脈はすぐ返す（loseContext）", () => {
    const loseContext = vi.fn();
    const gl = { getExtension: (n: string) => (n === "WEBGL_lose_context" ? { loseContext } : null) };
    vi.stubGlobal("document", { createElement: () => fakeCanvas(gl) });
    expect(webglAvailable()).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("文脈を返す仕組みが無い端末でも、結果は今までどおり true", () => {
    vi.stubGlobal("document", { createElement: () => fakeCanvas({ getExtension: () => null }) });
    expect(webglAvailable()).toBe(true);
  });

  it("使えない端末・例外は false（静的な地図に切り替える）", () => {
    vi.stubGlobal("document", { createElement: () => fakeCanvas(null) });
    expect(webglAvailable()).toBe(false);
    vi.stubGlobal("document", {
      createElement: () => {
        throw new Error("no canvas");
      },
    });
    expect(webglAvailable()).toBe(false);
  });
});
