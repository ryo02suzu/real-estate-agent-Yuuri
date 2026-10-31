import { describe, expect, it } from "vitest";
import { down, snapAfterDrag, up } from "./panel-snap";

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
});
