import { describe, expect, it } from "vitest";
import { dealCity, dealKind, dealsInTown, dealSummary, median, totalText, townKey, unitPrice, type DealRecord } from "./deals";

const rec = (o: Partial<DealRecord>): DealRecord => ({ k: "取引", t: "宅地(土地)", c: "13113", p: 85_000_000, ...o });

describe("取引事例（不動産情報ライブラリ）", () => {
  it("町名を地区名と比べる形にする（丁目を外し、漢数字をそろえる）", () => {
    expect(townKey("神南一丁目")).toBe("神南");
    expect(townKey("神南１丁目")).toBe("神南");
    expect(townKey("古ケ崎四丁目")).toBe("古ケ崎");
    expect(townKey("青木")).toBe("青木");
  });

  it("同じ町の事例だけ", () => {
    const rs = [rec({ d: "神南" }), rec({ d: "宇田川町" }), rec({})];
    expect(dealsInTown(rs, "神南一丁目")).toHaveLength(1);
    expect(dealsInTown(rs, "")).toEqual([]);
  });

  it("政令市は住所の区のファイルを選ぶ。データの無い市区町村は選ばない", () => {
    const cities = { "14109": "神奈川県横浜市港北区", "14101": "神奈川県横浜市鶴見区", "13113": "東京都渋谷区" };
    expect(dealCity(["14101", "14109"], "神奈川県横浜市港北区新横浜2-1", cities)).toBe("14109");
    expect(dealCity(["13113"], "東京都渋谷区神南1-19-11", cities)).toBe("13113");
    expect(dealCity(["11201"], "埼玉県川越市", cities)).toBeUndefined();
  });

  it("m² 単価：土地は単価の欄か総額÷面積、マンションは総額÷面積、土地と建物は出さない", () => {
    expect(unitPrice(rec({ u: 1_000_000 }))).toBe(1_000_000);
    expect(unitPrice(rec({ a: 100 }))).toBe(850_000);
    expect(unitPrice(rec({ t: "中古マンション等", p: 60_000_000, a: 60 }))).toBe(1_000_000);
    expect(unitPrice(rec({ t: "宅地(土地と建物)", a: 100 }))).toBeUndefined();
  });

  it("件数と単価の中央値", () => {
    const rs = [rec({ a: 100 }), rec({ a: 50 }), rec({ t: "中古マンション等", p: 60_000_000, a: 60 }), rec({ t: "宅地(土地と建物)" })];
    expect(dealSummary(rs)).toEqual({ count: 4, land: Math.round((850_000 + 1_700_000) / 2), mansion: 1_000_000 });
    expect(median([])).toBeUndefined();
    expect(dealKind("宅地(土地と建物)")).toBe("house");
  });

  it("総額の書き方", () => {
    expect(totalText(68_000_000)).toBe("6,800万円");
    expect(totalText(125_000_000)).toBe("1.25億円");
    expect(totalText(300_000_000)).toBe("3億円");
  });
});
