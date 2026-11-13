import { describe, expect, it } from "vitest";
import { fitSize, MAX_EDGE } from "./site-photos";

describe("現地の写真メモ", () => {
  it("長い辺を決まった長さまでに縮める（小さい写真は大きくしない・縦横の比は変えない）", () => {
    expect(fitSize(4032, 3024)).toEqual({ w: MAX_EDGE, h: 1200 });
    expect(fitSize(3024, 4032)).toEqual({ w: 1200, h: MAX_EDGE });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
    expect(fitSize(0, 0)).toEqual({ w: 1, h: 1 });
  });
});
