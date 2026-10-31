import { describe, expect, it } from "vitest";
import { createGeneration, runGuarded } from "./search-gen";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

/** page.tsx と同じ状態の持ち方を真似た画面モデル */
function screen() {
  const s = { loading: false, shown: null as string | null, error: false };
  const gen = createGeneration();
  const search = (load: () => Promise<string>) =>
    runGuarded(gen, load, {
      onStart: () => {
        s.loading = true;
        s.error = false;
      },
      onResult: (v) => {
        s.shown = v;
      },
      onError: () => {
        s.error = true;
      },
      onSettled: () => {
        s.loading = false;
      },
    });
  const home = () => {
    gen.cancel();
    s.loading = false;
    s.shown = null;
    s.error = false;
  };
  return { s, search, home };
}

describe("検索の世代管理", () => {
  it("A遅延→B成功: 後からAが返ってもBの結果が残り、loadingは解除済みのまま", async () => {
    const { s, search } = screen();
    const a = deferred<string>();
    const pa = search(() => a.promise);
    await search(async () => "B");
    expect(s).toMatchObject({ shown: "B", loading: false });
    a.resolve("A");
    expect(await pa).toBe(false);
    expect(s).toMatchObject({ shown: "B", loading: false });
  });

  it("A遅延中にBを開始: Aが先に返ってもBのloadingは解除されない", async () => {
    const { s, search } = screen();
    const a = deferred<string>();
    const b = deferred<string>();
    const pa = search(() => a.promise);
    const pb = search(() => b.promise);
    a.resolve("A");
    await pa;
    expect(s).toMatchObject({ shown: null, loading: true });
    b.resolve("B");
    await pb;
    expect(s).toMatchObject({ shown: "B", loading: false });
  });

  it("途中でホームへ戻ったら、遅れて届いた応答は画面に出ない", async () => {
    const { s, search, home } = screen();
    const a = deferred<string>();
    const pa = search(() => a.promise);
    home();
    a.resolve("A");
    await pa;
    expect(s).toMatchObject({ shown: null, loading: false, error: false });
  });

  it("古い応答の失敗は、新しい検索のエラー表示にならない", async () => {
    const { s, search } = screen();
    const a = deferred<string>();
    const pa = search(() => a.promise);
    await search(async () => "B");
    a.reject(new Error("net"));
    await pa;
    expect(s).toMatchObject({ shown: "B", error: false });
  });

  it("最新の検索の失敗はエラーになり、loadingは解除される", async () => {
    const { s, search } = screen();
    await search(() => Promise.reject(new Error("net")));
    expect(s).toMatchObject({ error: true, loading: false });
  });
});
