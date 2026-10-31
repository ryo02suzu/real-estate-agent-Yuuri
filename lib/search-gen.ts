// 検索の「世代」管理。新しい検索・キャンセル・ホーム・戻るで世代を進め、古い応答が画面を上書きしないようにする。

export type Generation = {
  /** 新しい検索を始める。以前の検索はすべて古くなる */
  begin: () => number;
  /** 進行中の検索を無効にする（ホーム・戻る・キャンセル） */
  cancel: () => void;
  isCurrent: (token: number) => boolean;
};

export function createGeneration(): Generation {
  let n = 0;
  return {
    begin: () => ++n,
    cancel: () => {
      n++;
    },
    isCurrent: (t) => t === n,
  };
}

/**
 * 1回の検索を世代つきで実行する。応答が古ければ onResult / onError / onSettled のどれも呼ばない
 * （古い finally が新しい検索の読み込み表示を消さないため）。onStart は常に呼ぶ。
 * 戻り値は「この応答を画面に反映したか」。
 */
export async function runGuarded<T>(
  gen: Generation,
  load: () => Promise<T>,
  h: { onStart: () => void; onResult: (v: T) => void; onError: () => void; onSettled: () => void },
): Promise<boolean> {
  const token = gen.begin();
  h.onStart();
  try {
    const v = await load();
    if (!gen.isCurrent(token)) return false;
    h.onResult(v);
    return true;
  } catch {
    if (!gen.isCurrent(token)) return false;
    h.onError();
    return false;
  } finally {
    if (gen.isCurrent(token)) h.onSettled();
  }
}
