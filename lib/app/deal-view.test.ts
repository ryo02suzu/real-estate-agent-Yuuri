import { describe, expect, it } from "vitest";
import type { DealRecord } from "../roadmap/deals";
import { builtText, dealCaveat, dealFacts, dealLand, dealPlan, dealRoad, dealTitle, dealWhen } from "./deal-view";

const rec = (o: Partial<DealRecord>): DealRecord => ({ k: "取引", t: "宅地(土地と建物)", c: "12207", p: 42_000_000, ...o });

describe("取引事例の1件の言葉", () => {
  it("何の売買か：戸建て・アパート・土地だけ・中古マンション", () => {
    expect(dealTitle(rec({ us: "住宅" }))).toBe("戸建て（土地＋建物）");
    expect(dealTitle(rec({ us: "共同住宅" }))).toBe("アパートなど（土地＋建物）");
    expect(dealTitle(rec({ us: "住宅、店舗" }))).toBe("店舗つき住宅など（土地＋建物）");
    expect(dealTitle(rec({}))).toBe("戸建てなど（土地＋建物）");
    expect(dealTitle(rec({ t: "宅地(土地)" }))).toBe("土地だけ");
    expect(dealTitle(rec({ t: "中古マンション等" }))).toBe("中古マンション");
  });
  it("時期と築年数（取引の年から数える。1年以内は新築）", () => {
    expect(dealWhen("2026年第1四半期")).toBe("2026年1〜3月");
    expect(dealWhen("2024年第3四半期")).toBe("2024年7〜9月");
    expect(builtText(rec({ by: "1974年", pe: "2026年第1四半期" }))).toBe("1974年築（築52年）");
    expect(builtText(rec({ by: "2025年", pe: "2026年第1四半期" }))).toBe("2025年築（新築）");
    expect(builtText(rec({ by: "戦前", pe: "2026年第1四半期" }))).toBe("戦前の建物");
  });
  it("広さ：戸建ては土地と延床、マンションは専有と間取り、土地は面積だけ", () => {
    expect(dealFacts(rec({ a: 170, fa: 100, by: "2010年", pe: "2026年第1四半期", s: "木造" }))).toEqual(["土地 170㎡（約51.4坪）", "建物 延床100㎡（約30.3坪）", "2010年築（築16年）", "木造"]);
    expect(dealFacts(rec({ t: "中古マンション等", a: 40, fp: "１ＬＤＫ", by: "1974年", pe: "2026年第1四半期", s: "ＲＣ" }))).toEqual(["専有 40㎡（約12.1坪）", "1LDK", "1974年築（築52年）", "RC"]);
    expect(dealFacts(rec({ t: "宅地(土地)", as: "2000㎡以上", by: "1990年" }))).toEqual(["土地 2000㎡以上"]);
    expect(dealRoad(rec({ dir: "東", rc: "市道", br: 5 }))).toBe("前面道路 東 市道 5m");
  });
  it("面積の上限の印は文字で（9999＝2,000㎡以上、8888＝5,000㎡以上、延床 9999、間口 9999.9）", () => {
    expect(dealFacts(rec({ t: "宅地(土地)", a: 9999 }))).toEqual(["土地 2,000㎡以上"]);
    expect(dealFacts(rec({ t: "林地", a: 8888 }))).toEqual(["土地 5,000㎡以上"]);
    expect(dealFacts(rec({ a: 9999, fa: 9999, by: "1990年", pe: "2026年第1四半期" }))).toEqual(["土地 2,000㎡以上", "建物 延床2,000㎡以上", "1990年築（築36年）"]);
    expect(dealLand(rec({ sh: "ほぼ長方形", fg: "9999.9" }))).toEqual(["ほぼ長方形", "間口 50m以上"]);
  });
  it("ありえない建ぺい率・容積率（記録違い）は出さない", () => {
    expect(dealPlan(rec({ cp: "商業地域", cr: 160, fr: 400 }))).toEqual(["商業地域", "容積率400%"]);
    expect(dealPlan(rec({ cp: "商業地域", cr: 80, fr: 20 }))).toEqual(["商業地域", "建ぺい率80%"]);
    expect(dealPlan(rec({ cr: 171, fr: 40 }))).toEqual([]);
  });
  it("土地の形・間口・用途地域・建ぺい率・容積率・買ったあとの使い道", () => {
    expect(dealLand(rec({ t: "宅地(土地)", sh: "ほぼ長方形", fg: "4" }))).toEqual(["ほぼ長方形", "間口 4m"]);
    expect(dealLand(rec({ sh: "不整形", fg: "12.5" }))).toEqual(["不整形", "間口 12.5m"]);
    expect(dealLand(rec({ fg: "50.0m以上" }))).toEqual(["間口 50.0m以上"]);
    expect(dealLand(rec({ t: "中古マンション等", sh: "ほぼ長方形", fg: "4" }))).toEqual([]);
    expect(dealLand(rec({}))).toEqual([]);
    expect(dealPlan(rec({ cp: "第１種住居地域", cr: 60, fr: 200, pu: "住宅" }))).toEqual(["第1種住居地域", "建ぺい率60%・容積率200%", "買ったあとの使い道：住宅"]);
    expect(dealPlan(rec({ cp: "商業地域", cr: 80 }))).toEqual(["商業地域", "建ぺい率80%"]);
    expect(dealPlan(rec({}))).toEqual([]);
  });
  it("取引の事情（相場と違う価格になりやすい）", () => {
    expect(dealCaveat(rec({ rm: "調停・競売等" }))).toBe("競売・調停など");
    expect(dealCaveat(rec({ rm: "関係者間取引" }))).toBe("身内・関係者の取引");
    expect(dealCaveat(rec({ rm: "私道を含む取引" }))).toBe("私道を含む");
    expect(dealCaveat(rec({ rm: "隣地の購入" }))).toBe("隣地の買い増し");
    expect(dealCaveat(rec({ rm: "その他事情有り" }))).toBe("その他事情有り");
    expect(dealCaveat(rec({}))).toBeUndefined();
  });
});
