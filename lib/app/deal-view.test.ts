import { describe, expect, it } from "vitest";
import type { DealRecord } from "../roadmap/deals";
import { builtText, dealFacts, dealRoad, dealTitle, dealWhen } from "./deal-view";

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
});
