import { describe, expect, it } from "vitest";
import { HAZARDS, type HazardReport, type KindReport } from "../roadmap/hazard";
import { hazardCards, hazardTotal } from "./hazard-level";

const layer = (k: keyof typeof HAZARDS, i = 0) => HAZARDS[k].layers[i];
const at = (k: keyof typeof HAZARDS, label: string): KindReport => {
  const l = layer(k);
  return { status: "ok", hits: [{ layer: l, at: l.classes.find((c) => c.label === label)! }] };
};
const out = (k: keyof typeof HAZARDS): KindReport => ({ status: "ok", hits: HAZARDS[k].layers.map((l) => ({ layer: l })) });

describe("ハザードのカードと総合の目安", () => {
  it("区域外は緑の「区域外」、内水のデータが無ければ「データなし」", () => {
    const r: HazardReport = { flood: out("flood"), naisui: { status: "ok", hits: [{ layer: layer("naisui") }], noData: true }, takashio: out("takashio"), tsunami: out("tsunami"), dosha: out("dosha") };
    const cards = hazardCards(r);
    expect(cards.map((c) => c.chip)).toEqual(["区域外", "データなし", "区域外", "区域外", "区域外"]);
    expect(hazardTotal(r)).toMatchObject({ level: "低い", tone: "out" });
  });

  it("洪水 0.5〜3m はやや高い、3〜5m は高い。総合は一番強い印で、区域にかかる種類を書く", () => {
    const r: HazardReport = { flood: at("flood", "0.5〜3m"), naisui: at("naisui", "0.1〜0.5m"), takashio: out("takashio"), tsunami: out("tsunami"), dosha: out("dosha") };
    const cards = hazardCards(r);
    expect(cards[0]).toMatchObject({ chip: "やや高い", tone: "mid" });
    expect(cards[0].lines[0]).toBe("想定最大規模で0.5〜3mの浸水が想定されています。");
    expect(cards[1]).toMatchObject({ chip: "注意", tone: "caution" });
    const total = hazardTotal(r)!;
    expect(total.level).toBe("やや高い");
    expect(total.comment).toContain("洪水・内水");
    expect(hazardCards({ ...r, flood: at("flood", "3〜5m") })[0].chip).toBe("高い");
  });

  it("土砂災害：特別警戒区域は高い、警戒区域はやや高い。家屋倒壊等氾濫想定区域にかかると総合は高い", () => {
    const red = at("dosha", "特別警戒区域");
    expect(hazardCards({ dosha: red })[4]).toMatchObject({ chip: "特別警戒", tone: "high" });
    expect(hazardCards({ dosha: at("dosha", "警戒区域") })[4]).toMatchObject({ chip: "警戒区域", tone: "mid" });
    const r: HazardReport = { flood: at("flood", "0.5m未満"), naisui: out("naisui"), takashio: out("takashio"), tsunami: out("tsunami"), dosha: out("dosha"), kaoku: at("kaoku", "氾濫流") };
    expect(hazardTotal(r)).toMatchObject({ level: "高い", tone: "high" });
  });

  it("区域の外でも、近くに区域があれば「注意」と距離を書く。読み込み中は総合を出さない", () => {
    const l = layer("flood");
    const r: HazardReport = { flood: { status: "ok", hits: [{ layer: l, near: { cls: l.classes[4], distance: 6.2 } }] } };
    expect(hazardCards(r)[0]).toMatchObject({ chip: "注意", lines: ["想定区域の外ですが、約6m先に0.5〜3mの区域があります。"] });
    expect(hazardTotal(r)).toBeNull();
  });
});
