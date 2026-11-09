import { describe, expect, it } from "vitest";
import { down, dragHeight, FLICK_WINDOW_MS, nextVelocity, SNAP_HEIGHT, snapAfterRelease, snapForDetail, snapPx, up, type SnapHeights } from "./panel-snap";

/** 390×844 の画面の段階の高さ（小176・中54%・大は上の操作帯を残す） */
const H: SnapHeights = { small: 176, medium: 456, large: 772 };

describe("パネルの段階", () => {
  it("ボタンは端で止まる", () => {
    expect(up("large")).toBe("large");
    expect(down("small")).toBe("small");
    expect(up("small")).toBe("medium");
    expect(down("large")).toBe("medium");
  });
});

describe("ヘッダーのドラッグ（指に追従して、離したら近い段階へ）", () => {
  it("ドラッグ中の高さは指の動きのとおり。小より低く・大より高くはしない", () => {
    expect(dragHeight(456, -100, H)).toBe(556); // 上へ100px
    expect(dragHeight(456, 120, H)).toBe(336); // 下へ120px
    expect(dragHeight(456, -900, H)).toBe(772);
    expect(dragHeight(456, 900, H)).toBe(176);
  });

  it("ゆっくり離したら、離した高さに一番近い段階", () => {
    expect(snapAfterRelease(600, 0, 0, H)).toBe("medium"); // 中(456)と大(772)の間で中に近い
    expect(snapAfterRelease(650, 0, 0, H)).toBe("large");
    expect(snapAfterRelease(300, 0, 0, H)).toBe("small");
    expect(snapAfterRelease(456, 0, 0, H)).toBe("medium");
  });

  it("速くはじいたら、その向きで次の段階（少ししか動いていなくても）", () => {
    expect(snapAfterRelease(470, -0.8, 10, H)).toBe("large"); // 中から少し上へはじく
    expect(snapAfterRelease(440, 0.8, 10, H)).toBe("small"); // 中から少し下へはじく
    expect(snapAfterRelease(772, -1.2, 10, H)).toBe("large"); // 大より上は無い
    expect(snapAfterRelease(176, 1.2, 10, H)).toBe("small"); // 小より下は無い
  });

  it("指を止めてから離したら、はじいたことにしない（離した高さで決める）", () => {
    expect(snapAfterRelease(470, -0.8, FLICK_WINDOW_MS + 10, H)).toBe("medium");
  });

  it("指の速さは直近の動きを重く見る。時間が進んでいなければ前の値のまま", () => {
    expect(nextVelocity(0, -20, 10)).toBeCloseTo(-1.6);
    expect(nextVelocity(-1, 0, 16)).toBeCloseTo(-0.2);
    expect(nextVelocity(0.5, 10, 0)).toBe(0.5);
  });
});

describe("パネルの段階の高さ", () => {
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
