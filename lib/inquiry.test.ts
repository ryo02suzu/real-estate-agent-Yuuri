import { describe, expect, it } from "vitest";
import { ASK, BRING, buildInquiryText } from "./inquiry";

describe("道路種別の照会文（FAX・メール）", () => {
  it("宛先・所在地・聞くことを入れ、会社名などは書き足す欄にする", () => {
    const text = buildInquiryText("東京都渋谷区神南一丁目19番11号", "渋谷区 都市整備部 建築課");
    const lines = text.split("\n");
    expect(lines[0]).toBe("渋谷区 都市整備部 建築課 御中");
    expect(text).toContain("所在地：東京都渋谷区神南一丁目19番11号\n地番：\n");
    for (const a of ASK) expect(text).toContain(a);
    expect(text).toMatch(/会社名：\n担当者：\n電話：$/);
    expect(BRING.length).toBeGreaterThan(0);
  });

  it("物件の筆の地番が分かっていれば入れる", () => {
    expect(buildInquiryText("千葉県松戸市古ケ崎四丁目", "松戸市 建築指導課", "3556-1")).toContain("所在地：千葉県松戸市古ケ崎四丁目\n地番：3556-1\n");
  });
});
