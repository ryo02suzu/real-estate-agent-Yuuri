import { describe, expect, it } from "vitest";
import { decidePop, depthOf, detailState, resultState, withoutDetail } from "./detail-history";

describe("詳細と端末の「戻る」", () => {
  it("深さ：印が無ければ0、あればその数", () => {
    expect(depthOf(null)).toBe(0);
    expect(depthOf(undefined)).toBe(0);
    expect(depthOf({})).toBe(0);
    expect(depthOf({ depth: 2 })).toBe(2);
    expect(depthOf({ depth: "2" as unknown as number })).toBe(0);
  });

  it("詳細を開くと、ホームから1画面深くなり、詳細の印が付く（ほかの状態は残す）", () => {
    expect(detailState({ depth: 1 })).toEqual({ depth: 2, detail: true });
    expect(detailState(null)).toEqual({ depth: 1, detail: true });
    expect(detailState({ depth: 1, other: "x" } as never)).toEqual({ depth: 2, detail: true, other: "x" });
  });

  it("結果を積むときは1深く、置き換えるときは今のまま。どちらも詳細の印は引き継がない", () => {
    expect(resultState({ depth: 2, detail: true }, true)).toEqual({ depth: 3, detail: false });
    expect(resultState({ depth: 2, detail: true }, false)).toEqual({ depth: 2, detail: false });
    expect(resultState(null, true)).toEqual({ depth: 1, detail: false });
  });

  it("印だけ外す", () => {
    expect(withoutDetail({ depth: 3, detail: true })).toEqual({ depth: 3, detail: false });
  });

  it("画面の「戻る」で自分が戻した分は何もしない（詳細が開いていても、印があっても）", () => {
    expect(decidePop({ skip: true, detailOpen: true, state: { detail: true } })).toBe("skip");
    expect(decidePop({ skip: true, detailOpen: false, state: null })).toBe("skip");
  });

  it("詳細を出している最中の端末の「戻る」は、詳細だけ閉じる（検索し直さない）", () => {
    expect(decidePop({ skip: false, detailOpen: true, state: { depth: 1 } })).toBe("close-detail");
  });

  it("詳細を出していないのに詳細の印の履歴へ着いたら、印だけ外す", () => {
    expect(decidePop({ skip: false, detailOpen: false, state: { depth: 2, detail: true } })).toBe("normalize");
  });

  it("ふつうの戻る・進むは、従来どおり調べ直す・ホームへ", () => {
    expect(decidePop({ skip: false, detailOpen: false, state: { depth: 1 } })).toBe("navigate");
    expect(decidePop({ skip: false, detailOpen: false, state: null })).toBe("navigate");
  });
});
