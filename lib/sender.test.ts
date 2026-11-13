import { beforeEach, describe, expect, it } from "vitest";
import { buildInquiryText } from "./inquiry";
import { EMPTY_SENDER, hasSender, loadSender, saveSender, senderLines, senderShort } from "./sender";

// 端末の localStorage の代わり（テストの間だけ）
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    configurable: true,
  });
});

describe("書類の差出人", () => {
  it("保存して読み直す（前後の空白は外す）。全部空なら消す", () => {
    expect(loadSender()).toEqual(EMPTY_SENDER);
    expect(saveSender({ company: " 〇〇不動産 ", person: "営業部 〇〇", phone: "03-0000-0000", email: "" })).toBe(true);
    expect(loadSender()).toEqual({ company: "〇〇不動産", person: "営業部 〇〇", phone: "03-0000-0000", email: "" });
    saveSender(EMPTY_SENDER);
    expect(store.size).toBe(0);
    store.set("michilu:sender", "壊れた値");
    expect(loadSender()).toEqual(EMPTY_SENDER);
  });

  it("照会文の最後に入る（入っていない所は空欄のまま）", () => {
    const s = { company: "〇〇不動産", person: "〇〇", phone: "03-0000-0000", email: "info@example.co.jp" };
    expect(senderLines(undefined)).toEqual(["会社名：", "担当者：", "電話："]);
    expect(senderLines(s)).toEqual(["会社名：〇〇不動産", "担当者：〇〇", "電話：03-0000-0000", "メール：info@example.co.jp"]);
    expect(buildInquiryText("千葉県松戸市古ケ崎四丁目", "松戸市 建築指導課", "3556-1", s)).toMatch(/会社名：〇〇不動産\n担当者：〇〇\n電話：03-0000-0000\nメール：info@example\.co\.jp$/);
    expect(buildInquiryText("千葉県松戸市古ケ崎四丁目", "松戸市 建築指導課")).toMatch(/会社名：\n担当者：\n電話：$/);
  });

  it("書類の右上の短い差出人", () => {
    expect(hasSender(EMPTY_SENDER)).toBe(false);
    expect(senderShort(EMPTY_SENDER)).toEqual([]);
    expect(senderShort({ company: "〇〇不動産", person: "〇〇", phone: "03-0000-0000", email: "" })).toEqual(["〇〇不動産 担当 〇〇", "TEL 03-0000-0000"]);
    expect(senderShort({ company: "", person: "", phone: "", email: "a@example.jp" })).toEqual(["a@example.jp"]);
  });
});
