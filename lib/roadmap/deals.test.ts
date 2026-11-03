import { describe, expect, it } from "vitest";
import { areaCap, code5, DEALS_DATA, dealCity, dealFile, dealKind, dealsInTown, dealSummary, median, totalText, townKey, unitPrice, type DealRecord } from "./deals";

const rec = (o: Partial<DealRecord>): DealRecord => ({ k: "取引", t: "宅地(土地)", c: "13113", p: 85_000_000, ...o });

describe("取引事例（不動産情報ライブラリ）", () => {
  it("町名を地区名と比べる形にする（丁目を外し、漢数字をそろえる）", () => {
    expect(townKey("神南一丁目")).toBe("神南");
    expect(townKey("神南１丁目")).toBe("神南");
    expect(townKey("古ケ崎四丁目")).toBe("古ケ崎");
    expect(townKey("青木")).toBe("青木");
    // 不動産情報ライブラリの地区名の「大字」、小字の「字」、ヶ・ヵ。丁目を外すと空になる町はそのまま
    expect(townKey("大字指扇")).toBe("指扇");
    expect(townKey("大津町字五浦")).toBe(townKey("大津町五浦一丁目"));
    expect(townKey("中郷町汐見ヶ丘")).toBe(townKey("中郷町汐見ケ丘"));
    expect(townKey("八丁目")).toBe("8丁目");
    expect(townKey("壱丁目東")).toBe("壱丁目東");
  });

  it("同じ町の事例だけ", () => {
    const rs = [rec({ d: "神南" }), rec({ d: "宇田川町" }), rec({})];
    expect(dealsInTown(rs, "神南一丁目")).toHaveLength(1);
    expect(dealsInTown(rs, "")).toEqual([]);
    // ぴったりの地区名が無いとき：町名より粗い地区名（町のあとの小字、甲乙丙丁・いろはの1字）は同じ町。別の町は違う
    const coarse = [rec({ d: "磯原町" }), rec({ d: "下妻" }), rec({ d: "本町" }), rec({ d: "日本橋" })];
    expect(dealsInTown(coarse, "磯原町磯原")).toEqual([coarse[0]]);
    expect(dealsInTown(coarse, "下妻乙")).toEqual([coarse[1]]);
    expect(dealsInTown(coarse, "本町田")).toEqual([]);
    expect(dealsInTown(coarse, "日本橋小網町")).toEqual([]);
    expect(dealsInTown([rec({ d: "本町田" }), rec({ d: "本町" })], "本町田")).toHaveLength(1);
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
    // 面積の上限の印（9999＝2,000㎡以上、8888＝5,000㎡以上）では単価を計算しない
    expect(unitPrice(rec({ t: "宅地(土地)", p: 36_000_000, a: 9999 }))).toBeUndefined();
    expect(unitPrice(rec({ t: "宅地(土地)", p: 36_000_000, a: 9999, u: 13_000 }))).toBe(13_000);
    expect(unitPrice(rec({ t: "林地", p: 1_000_000, a: 8888 }))).toBeUndefined();
    expect(areaCap(9999)).toBe("2,000㎡以上");
    expect(areaCap(8888)).toBe("5,000㎡以上");
    expect(areaCap(260)).toBeUndefined();
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

describe("茨城県・栃木県の市区町村コード（先頭の0）", () => {
  it("API が先頭の0を落としたコードも、5桁のコードで見つかる", () => {
    expect(code5("9201")).toBe("09201");
    expect(code5("13113")).toBe("13113");
    // 前のデータは「9201.json」の名前で置いてある
    const files = { "9201": "栃木県宇都宮市", "13113": "東京都渋谷区", "08201": "茨城県水戸市" };
    expect(dealFile("09201", files)).toBe("9201");
    expect(dealFile("13113", files)).toBe("13113");
    expect(dealFile("08201", files)).toBe("08201");
    const cities = Object.fromEntries(Object.entries(files).map(([c, n]) => [code5(c), n]));
    expect(dealCity(["09201"], "栃木県宇都宮市南大通り一丁目2番3号", cities)).toBe("09201");
  });
  it("今のデータでも、宇都宮市・水戸市の事例がある", () => {
    if (!DEALS_DATA.url) return;
    expect(DEALS_DATA.cities["09201"]).toBe("栃木県宇都宮市");
    expect(DEALS_DATA.cities["08201"]).toBe("茨城県水戸市");
    expect(Object.keys(DEALS_DATA.cities).every((c) => c.length === 5)).toBe(true);
  });
});
