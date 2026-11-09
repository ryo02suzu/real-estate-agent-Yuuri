import { describe, expect, it } from "vitest";
import { addressNumbers, isApproximate, partialMatch } from "./geocode";

describe("住所の一致の深さ", () => {
  it("番地がまったく無い一致は、町の中心（isApproximate）", () => {
    expect(isApproximate("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目")).toBe(true);
    expect(isApproximate("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目９番")).toBe(false);
  });

  it("号などが見つからず、その手前までの一致を見分ける（漢数字の丁目・全角の数字も数える）", () => {
    expect(partialMatch("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目９番")).toBe(true);
    expect(partialMatch("東京都千代田区丸の内一丁目9番1号", "東京都千代田区丸の内一丁目９番")).toBe(true);
    expect(partialMatch("渋谷区神南1-19-11", "東京都渋谷区神南一丁目１９番１１号")).toBe(false);
    // 建物名・部屋番号の数字は数えない（丁目・番地・号の3つまで）
    expect(partialMatch("渋谷区神南1-19-11 ビル301", "東京都渋谷区神南一丁目１９番１１号")).toBe(false);
    // 郵便番号は数えない
    expect(partialMatch("〒150-0041 渋谷区神南1-19-11", "東京都渋谷区神南一丁目１９番１１号")).toBe(false);
    // 町の中心だけの一致は isApproximate の側
    expect(partialMatch("千代田区丸の内1-9-1", "東京都千代田区丸の内")).toBe(false);
  });

  it("地割（「第13地割」）の番号は町名の一部：番地として数えず、国土地理院の漢数字（第十三地割）と同じに数える", () => {
    expect(partialMatch("矢巾町大字南矢幅第13地割123番地", "岩手県矢巾町大字南矢幅第十三地割１２３番地")).toBe(false);
    expect(isApproximate("矢巾町大字南矢幅第13地割123番地", "岩手県矢巾町大字南矢幅第十三地割１２３番地")).toBe(false);
    // 番地を書かずに地割まで → 町の中心ではない（入れたとおり）
    expect(isApproximate("矢巾町大字南矢幅第13地割", "岩手県矢巾町大字南矢幅第十三地割")).toBe(false);
    // 番地を書いたのに地割までしか合わない → 町の中心
    expect(isApproximate("矢巾町大字南矢幅第13地割123番地", "岩手県矢巾町大字南矢幅第十三地割")).toBe(true);
    expect(addressNumbers("岩手県野田村大字野田第二十地割１４番地")).toEqual([20, 14]);
  });
});
