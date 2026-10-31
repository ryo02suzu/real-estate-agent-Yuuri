import { describe, expect, it } from "vitest";
import { positionAccuracy } from "./position-accuracy";

type Input = Parameters<typeof positionAccuracy>[0];
const parcel = (estimated?: "high" | "low") => ({ estimated }) as unknown as NonNullable<Input["parcel"]>;

describe("位置の目安", () => {
  it("住所の一致は「付近」（断定しない）", () => {
    expect(positionAccuracy({ approximate: false })).toEqual({ label: "付近", warn: false });
  });

  it("番地が見つからず町の中心を出しているときは注意", () => {
    expect(positionAccuracy({ approximate: true })).toEqual({ label: "町の中心", warn: true });
  });

  it("地図で選んだ地点", () => {
    expect(positionAccuracy({ approximate: false, picked: true })).toEqual({ label: "地図で選んだ地点", warn: false });
    // 選んだ地点の筆があっても、選んだ地点として扱う（筆は参考）
    expect(positionAccuracy({ approximate: false, picked: true, parcel: parcel() })).toEqual({ label: "地図で選んだ地点", warn: false });
  });

  it("地番で探した筆は、公図から推定したものだけ「推定」で注意", () => {
    expect(positionAccuracy({ approximate: false, parcel: parcel() })).toEqual({ label: "地番で探した筆", warn: false });
    expect(positionAccuracy({ approximate: false, parcel: parcel("high") })).toEqual({ label: "推定", warn: true });
    expect(positionAccuracy({ approximate: false, parcel: parcel("low") })).toEqual({ label: "推定（確度低）", warn: true });
  });

  it("町の中心は、ほかの条件より優先する", () => {
    expect(positionAccuracy({ approximate: true, parcel: parcel("low") }).label).toBe("町の中心");
  });
});
