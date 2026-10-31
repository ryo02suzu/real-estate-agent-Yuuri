import { describe, expect, it } from "vitest";
import { createGeneration, inputAfterResult, runGuarded } from "./search-gen";

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

describe("検索の応答と入力欄", () => {
  it("待っている間に打ち直していなければ、結果の住所にそろえる。打ち直していたら（変換中の文字も）残す", () => {
    expect(inputAfterResult("渋谷区神南1-1", "渋谷区神南1-1", "渋谷区神南1-1")).toBe("渋谷区神南1-1");
    expect(inputAfterResult(" 渋谷区神南1-1 ", "渋谷区神南1-1", "渋谷区神南1-1")).toBe("渋谷区神南1-1");
    expect(inputAfterResult("横浜市港北区", "渋谷区神南1-1", "渋谷区神南1-1")).toBe("横浜市港北区");
    // 地図で選んだ地点：始めたときの入力のままなら、選んだ地点の住所（町名まで）にする
    expect(inputAfterResult("前の住所", "前の住所", "埼玉県熊谷市宮町二丁目")).toBe("埼玉県熊谷市宮町二丁目");
  });
});

/** page.tsx の「キャンセル」「もう一度」と同じ持ち方を真似た画面モデル（入力・表示中の結果・最後の検索） */
function editScreen() {
  const s = { loading: false, error: false, input: "", shown: null as { query: string } | null };
  const gen = createGeneration();
  let last: { target: string; push: boolean } | null = null;
  const calls: { target: string; push: boolean }[] = [];
  const run = (target: string, push: boolean, load: () => Promise<string>) => {
    last = { target, push };
    calls.push({ target, push });
    const startedWith = s.input;
    return runGuarded(gen, load, {
      onStart: () => {
        s.loading = true;
        s.error = false;
      },
      onResult: (q) => {
        s.input = inputAfterResult(s.input, startedWith, q);
        s.shown = { query: q };
      },
      onError: () => {
        s.error = true;
      },
      onSettled: () => {
        s.loading = false;
      },
    });
  };
  const cancel = () => {
    gen.cancel();
    s.loading = false;
    s.error = false;
    if (s.shown) s.input = s.shown.query;
  };
  const retry = (load: () => Promise<string>) => last && run(last.target, last.push, load);
  return { s, run, cancel, retry, calls };
}

describe("結果の画面での書き換え・キャンセル・もう一度", () => {
  it("検索中にキャンセル：遅れて届いた応答は出ず、入力は今の結果の住所に戻る（物件はそのまま）", async () => {
    const { s, run, cancel } = editScreen();
    s.input = "A";
    await run("A", true, async () => "A");
    s.input = "B";
    const b = deferred<string>();
    const pb = run("B", true, () => b.promise);
    cancel();
    b.resolve("B");
    await pb;
    expect(s).toMatchObject({ loading: false, input: "A", shown: { query: "A" } });
  });

  it("書き換えただけ（まだ調べていない）でキャンセル：入力が戻る", async () => {
    const { s, run, cancel } = editScreen();
    s.input = "A";
    await run("A", true, async () => "A");
    s.input = "A の書きかけ";
    cancel();
    expect(s.input).toBe("A");
  });

  it("「もう一度」は、入力欄の住所ではなく、失敗した検索と同じ対象・同じ積み方で調べ直す", async () => {
    const { s, run, retry, calls } = editScreen();
    s.input = "物件A";
    await run("物件A", true, async () => "物件A");
    // 地図で選んだ地点（URL から開いた・積まない）で調べて失敗
    await run("ll:36.1,139.4", false, () => Promise.reject(new Error("net")));
    expect(s.error).toBe(true);
    await retry(async () => "埼玉県熊谷市宮町二丁目");
    expect(calls.at(-1)).toEqual({ target: "ll:36.1,139.4", push: false });
    expect(s).toMatchObject({ error: false, shown: { query: "埼玉県熊谷市宮町二丁目" } });
  });
});
