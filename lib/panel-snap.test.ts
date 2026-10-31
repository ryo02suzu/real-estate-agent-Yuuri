import { describe, expect, it } from "vitest";
import { down, SNAP_HEIGHT, snapAfterDrag, snapForDetail, snapPx, up } from "./panel-snap";

describe("パネルの段階", () => {
  it("ボタンは端で止まる", () => {
    expect(up("large")).toBe("large");
    expect(down("small")).toBe("small");
    expect(up("small")).toBe("medium");
    expect(down("large")).toBe("medium");
  });
  it("ドラッグは閾値を超えたときだけ動く", () => {
    expect(snapAfterDrag("medium", -80)).toBe("large");
    expect(snapAfterDrag("medium", 80)).toBe("small");
    expect(snapAfterDrag("medium", -10)).toBe("medium");
    expect(snapAfterDrag("large", -200)).toBe("large");
  });
  it("段階の高さの見込み(px)は、CSSの高さと同じ規則（小176px・中54%・大は上の操作帯を残す）", () => {
    expect(SNAP_HEIGHT.small).toBe("176px");
    expect(SNAP_HEIGHT.medium).toBe("54dvh");
    expect(snapPx("small", 844)).toBe(176);
    expect(snapPx("medium", 844)).toBe(456);
    expect(snapPx("medium", 667)).toBe(360);
    expect(snapPx("large", 844)).toBe(772);
  });
  it("極端に低い画面でも、大は小より低くならない", () => {
    expect(snapPx("large", 200)).toBe(176);
  });
});

describe("詳細を開く・閉じるときのパネルの段階", () => {
  it("開くと「大」になり、開く前の段階を覚える。閉じると元の段階に戻る", () => {
    const opened = snapForDetail({ snap: "medium", saved: null }, false, true);
    expect(opened).toEqual({ snap: "large", saved: "medium" });
    expect(snapForDetail(opened, true, false)).toEqual({ snap: "medium", saved: null });
  });

  it("小から開いても、閉じると小に戻る", () => {
    const opened = snapForDetail({ snap: "small", saved: null }, false, true);
    expect(snapForDetail(opened, true, false).snap).toBe("small");
  });

  it("開いたまま別の詳細へ付け替えても、最初の段階を覚えたまま（動かさない）", () => {
    const opened = snapForDetail({ snap: "medium", saved: null }, false, true);
    expect(snapForDetail(opened, true, true)).toEqual(opened);
  });

  it("開いていないときは何もしない。覚えが無いまま閉じても今の段階のまま", () => {
    const s = { snap: "medium" as const, saved: null };
    expect(snapForDetail(s, false, false)).toEqual(s);
    expect(snapForDetail({ snap: "large", saved: null }, true, false)).toEqual({ snap: "large", saved: null });
  });
});
