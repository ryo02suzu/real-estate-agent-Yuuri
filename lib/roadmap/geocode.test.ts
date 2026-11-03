import { describe, expect, it } from "vitest";
import { isApproximate, partialMatch, refineCandidates, retryQuery, type GeocodeResult } from "./geocode";

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
});

describe("正式な名前で探し直す（retryQuery・refineCandidates）", () => {
  it("町名の送り仮名が抜けていたら、正式な町名に番地をつなげる", () => {
    expect(retryQuery("宇都宮市南大通1-2-3", "栃木県宇都宮市南大通り")).toBe("栃木県宇都宮市南大通り1-2-3");
    expect(retryQuery("栃木県宇都宮市南大通1丁目2-3", "栃木県宇都宮市南大通り")).toBe("栃木県宇都宮市南大通り1丁目2-3");
  });
  it("市の「市」が抜けていたら足す", () => {
    expect(retryQuery("宇都宮南大通り1-2-3", "栃木県宇都宮市")).toBe("宇都宮市南大通り1-2-3");
  });
  it("丁目まで一致・別の町名・番地なしでは作らない", () => {
    expect(retryQuery("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目")).toBeNull();
    expect(retryQuery("宇都宮市北大通1-1", "栃木県宇都宮市南大通り")).toBeNull();
    expect(retryQuery("宇都宮市南大通り", "栃木県宇都宮市南大通り")).toBeNull();
    expect(retryQuery("宇都宮市南大通り1-1-99", "栃木県宇都宮市南大通り")).toBeNull();
  });
  const at = (matchedAddress: string): GeocodeResult[] => [{ lat: 36.5, lng: 139.9, matchedAddress }];
  it("市を足し、町名を直して、番地まで一致させる（2回まで）", async () => {
    const table: Record<string, string> = {
      "宇都宮市南大通1-2-3": "栃木県宇都宮市南大通り",
      "栃木県宇都宮市南大通り1-2-3": "栃木県宇都宮市南大通り一丁目２番３号",
    };
    const asked: string[] = [];
    const search = async (q: string) => (asked.push(q), table[q] ? at(table[q]) : []);
    const got = await refineCandidates("宇都宮南大通1-2-3", at("栃木県宇都宮市"), search);
    expect(got[0].matchedAddress).toBe("栃木県宇都宮市南大通り一丁目２番３号");
    expect(asked).toEqual(["宇都宮市南大通1-2-3", "栃木県宇都宮市南大通り1-2-3"]);
  });
  it("番地まで一致していれば探し直さない。別の場所に当たったら元のまま", async () => {
    const never = async () => {
      throw new Error("呼ばない");
    };
    const exact = at("栃木県宇都宮市南大通り一丁目２番３号");
    expect(await refineCandidates("宇都宮市南大通り1-2-3", exact, never)).toBe(exact);
    const town = at("栃木県宇都宮市南大通り");
    expect(await refineCandidates("宇都宮市南大通1-2-3", town, async () => at("栃木県小山市城山町一丁目１番"))).toBe(town);
  });
});
