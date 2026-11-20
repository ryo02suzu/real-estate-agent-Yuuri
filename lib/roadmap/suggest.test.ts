import { describe, expect, it } from "vitest";
import { suggestLabel, suggestLevel, wantsSuggest } from "./suggest";

describe("入力途中の住所の候補", () => {
  it("短い入力・地番で探す入力は聞かない", () => {
    expect(wantsSuggest("渋谷")).toBe(false);
    expect(wantsSuggest("地番 熊谷市下奈良391-3")).toBe(false);
    expect(wantsSuggest("渋谷区神南1")).toBe(true);
  });
  it("候補ごとに、入れた番号のどこまで当たったかを付ける（代表点はそう書く）", () => {
    expect(suggestLevel("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目９番")).toBe("block");
    expect(suggestLabel("block", "東京都千代田区丸の内一丁目９番")).toBe("番まで（街区の代表点）");
    expect(suggestLevel("渋谷区神南1-19-11", "東京都渋谷区神南一丁目１９番１１号")).toBe("full");
    expect(suggestLabel("full", "東京都渋谷区神南一丁目１９番１１号")).toBe("号まで");
    expect(suggestLevel("千代田区丸の内", "東京都千代田区丸の内")).toBe("town");
    expect(suggestLabel("town", "東京都千代田区丸の内")).toBe("町まで（町の代表点）");
    expect(suggestLabel("block", "愛知県新城市新城山田５８７番地")).toBe("番地まで（代表点）");
  });
});
