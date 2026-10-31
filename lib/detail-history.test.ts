import { describe, expect, it } from "vitest";
import { decidePop, depthOf, detailState, overlayAction, resultState, stepsToHome, withoutDetail } from "./detail-history";

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

  it("ホームへ戻る歩数：結果を積んだ分（詳細の分を含めて）戻る。最初の画面が結果なら戻さず置き換える", () => {
    expect(stepsToHome(2, false)).toBe(2);
    expect(stepsToHome(3, true)).toBe(3); // ホーム→結果→結果→詳細：詳細の分も含めて3つ戻る
    expect(stepsToHome(0, false)).toBe(0);
    // ?q= で直接開いた結果（深さ0）で詳細を開いている（深さ1）：戻る先のホームの履歴は無いので、戻さずにホームに置き換える
    expect(stepsToHome(1, true)).toBe(0);
    expect(stepsToHome(0, true)).toBe(0);
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

describe("重なった画面（詳細・シート・全画面の地図）の履歴は、いくつ重なってもひとつ", () => {
  it("開いたら積み、全部閉じたら自分で戻す。積んだまま重ねても増やさない", () => {
    expect(overlayAction(true, false)).toBe("push");
    expect(overlayAction(true, true)).toBeNull();
    expect(overlayAction(false, true)).toBe("back");
    expect(overlayAction(false, false)).toBeNull();
  });

  it("端末の「戻る」でいちばん上だけ閉じ、まだ下に残っていれば積み直す（次の「戻る」で次の画面を閉じる）", () => {
    // 詳細の上に全画面の地図：戻る → popstate で履歴は消費済み（has=false）、地図を閉じても詳細が残る（want=true）→ 積み直す
    expect(decidePop({ skip: false, detailOpen: true, state: { depth: 1 } })).toBe("close-detail");
    expect(overlayAction(true, false)).toBe("push");
    // 次の戻る：詳細も閉じる → もう何も残っていない → 何もしない
    expect(overlayAction(false, false)).toBeNull();
  });
});
