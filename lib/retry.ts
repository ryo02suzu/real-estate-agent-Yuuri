// 通信の一時的な失敗（502 など）で「読み込めませんでした」にならないよう、少し待ってもう一度だけ試す
export async function withRetry<T>(fn: () => Promise<T>, { retries = 1, delayMs = 1200 } = {}): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0) throw e;
    await new Promise((r) => setTimeout(r, delayMs));
    return withRetry(fn, { retries: retries - 1, delayMs: delayMs * 2 });
  }
}
