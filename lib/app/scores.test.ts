import { describe, expect, it } from "vitest";
import type { PoiWalk } from "../roadmap/poi";
import type { StationWalk } from "../roadmap/walk";
import { countScore, livingScores, minuteScore, totalComment, totalScore } from "./scores";

const station = (name: string, minutes: number, lines: [string, string][], routed = true): StationWalk => ({ name, lines, meters: minutes * 80, minutes, straight: minutes * 60, routed });
const poi = (kind: number, label: string, name: string, minutes: number, routed = true): PoiWalk => ({ kind, label, name, meters: minutes * 80, minutes, straight: minutes * 60, routed, at: [139.7, 35.66] });

describe("周辺環境の目安", () => {
  it("分数の点：3分以内は5点、10分で4点、30分以上で1点、間は比例", () => {
    expect(minuteScore(1)).toBe(5);
    expect(minuteScore(10)).toBe(4);
    expect(minuteScore(12.5)).toBeCloseTo(3.5);
    expect(minuteScore(45)).toBe(1);
    expect(minuteScore(undefined)).toBe(1);
  });

  it("飲食店の数の点：0軒で1点、30軒以上で5点", () => {
    expect(countScore(0)).toBe(1);
    expect(countScore(30)).toBe(5);
    expect(countScore(60)).toBe(5);
    expect(countScore(8)).toBe(3);
  });

  it("駅・お店・病院・保育園が近いと高く、根拠に施設と分数が入る", () => {
    const scores = livingScores({
      stations: [station("渋谷", 6, [["山手線", "JR東日本"], ["銀座線", "東京地下鉄"]]), station("明治神宮前", 12, [["千代田線", "東京地下鉄"]])],
      pois: [poi(1, "スーパー", "東急ストア", 5), poi(2, "コンビニ", "セブン-イレブン", 2), poi(3, "ドラッグストア", "マツモトキヨシ", 3), poi(5, "診療所", "神南クリニック", 4), poi(9, "幼稚園・保育園", "神南保育園", 6), poi(6, "公園", "宮下公園", 4)],
      diningCount: 40,
      schools: { elementary: { kind: "小学校", name: "神南小学校", city: "13113", walk: { meters: 620, minutes: 8 } } },
    });
    const by = Object.fromEntries(scores.map((s) => [s.key, s]));
    expect(by.transport.value).toBeGreaterThan(4.5);
    expect(by.transport.basis[0]).toBe("渋谷駅 徒歩約6分");
    expect(by.transport.basis[1]).toBe("徒歩15分以内の駅の路線：3路線");
    expect(by.shopping.value).toBeGreaterThan(4.5);
    expect(by.dining.value).toBe(5);
    expect(by.medical.basis[0]).toBe("診療所：神南クリニック 徒歩約4分");
    expect(by.childcare.basis).toContain("学区の小学校：神南小学校 徒歩約8分");
    expect(by.safety.value).toBeNull();
    expect(totalScore(scores)).toBeGreaterThan(4.5);
  });

  it("施設が無いと1点、データが届く前は null（総合の目安は点のある項目だけの平均）", () => {
    const scores = livingScores({ stations: [], pois: [] });
    const by = Object.fromEntries(scores.map((s) => [s.key, s]));
    expect(by.transport.value).toBe(1);
    expect(by.shopping.value).toBe(1);
    expect(by.dining.value).toBeNull();
    expect(totalScore(scores)).toBe(1);
    expect(totalComment(1)).toContain("少ない");
    expect(totalScore(livingScores({}))).toBeNull();
  });

  it("道のりが分からない施設は「直線」と書き、直線距離から分数を見積もる", () => {
    const scores = livingScores({ stations: [station("熊谷", 25, [["高崎線", "JR東日本"]], false)], pois: [] });
    expect(scores[0].basis[0]).toMatch(/^熊谷駅 直線約/);
  });
});
