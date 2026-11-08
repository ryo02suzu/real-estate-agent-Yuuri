import { beforeEach, describe, expect, it } from "vitest";
import { STANDARD_ID, STANDARD_TEMPLATE } from "./app/inquiry-template";
import {
  BOOK_MAX,
  EMPTY_SETTINGS,
  NAME_MAX,
  TEMPLATE_MAX,
  copyName,
  duplicateTemplate,
  forgetInquiryTo,
  loadInquirySettings,
  loadInquiryTo,
  officeKey,
  removeTemplate,
  restoreTemplate,
  saveInquirySettings,
  saveInquiryTo,
  templateOf,
  updateTemplate,
  type InquirySettings,
} from "./inquiry-store";

// 端末の localStorage の代わり（テストの間だけ）。broken のときは、保存も読み込みも例外を投げる（プライベートブラウズ・容量いっぱいなど）
const store = new Map<string, string>();
let broken = false;
beforeEach(() => {
  store.clear();
  broken = false;
  const fail = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => (broken ? fail() : (store.get(k) ?? null)),
      setItem: (k: string, v: string) => (broken ? fail() : void store.set(k, v)),
      removeItem: (k: string) => (broken ? fail() : void store.delete(k)),
    },
    configurable: true,
  });
});

const mine = (id: string, name = id) => ({ id, name, subject: `件名 ${name}`, body: `本文 ${name}` });

describe("照会の文面（自分のひな形）の保存", () => {
  it("保存して読み直す。全部初めの状態なら消す", () => {
    expect(loadInquirySettings()).toEqual(EMPTY_SETTINGS);
    const s: InquirySettings = { list: [mine("t-1", "A")], fax: "{番号}@fax.example.co.jp", pick: "t-1" };
    expect(saveInquirySettings(s)).toBe(true);
    expect(loadInquirySettings()).toEqual(s);
    expect(templateOf(loadInquirySettings(), "t-1").name).toBe("A");
    expect(templateOf(loadInquirySettings(), "nai")).toBe(STANDARD_TEMPLATE);
    expect(saveInquirySettings(EMPTY_SETTINGS)).toBe(true);
    expect(store.size).toBe(0);
  });

  it("壊れた値・形の違う値は捨てる（標準と同じ id・重なる id・無いひな形を選んだ印）", () => {
    store.set("michilu:inquiry-templates", "壊れた値");
    expect(loadInquirySettings()).toEqual(EMPTY_SETTINGS);
    store.set(
      "michilu:inquiry-templates",
      JSON.stringify({ list: [mine(STANDARD_ID), mine("a"), mine("a", "二つ目"), null, { id: 3 }, { id: "b", name: "x".repeat(99), subject: 1, body: "本文" }], fax: 5, pick: "消えた" }),
    );
    const s = loadInquirySettings();
    expect(s.list.map((t) => t.id)).toEqual(["a", "b"]);
    expect(s.list[1]).toEqual({ id: "b", name: "x".repeat(NAME_MAX), subject: "", body: "本文" });
    expect(s.fax).toBe("");
    expect(s.pick).toBe(STANDARD_ID);
  });

  it("保存できない端末では false（読み込みは初めの状態）", () => {
    broken = true;
    expect(saveInquirySettings({ list: [mine("t-1")], fax: "", pick: STANDARD_ID })).toBe(false);
    expect(loadInquirySettings()).toEqual(EMPTY_SETTINGS);
  });

  it("複製は元のすぐ後ろ（標準は先頭）に「〇〇のコピー」で入る。上限の数なら作らない", () => {
    const s0: InquirySettings = { list: [mine("a", "A"), mine("b", "B")], fax: "", pick: STANDARD_ID };
    const d1 = duplicateTemplate(s0, STANDARD_TEMPLATE)!;
    expect(d1.copy).toMatchObject({ name: "標準のコピー", subject: STANDARD_TEMPLATE.subject, body: STANDARD_TEMPLATE.body });
    expect(d1.copy.id).not.toBe(STANDARD_ID);
    expect(d1.settings.list.map((t) => t.name)).toEqual(["標準のコピー", "A", "B"]);
    const d2 = duplicateTemplate(d1.settings, s0.list[0])!;
    expect(d2.settings.list.map((t) => t.name)).toEqual(["標準のコピー", "A", "Aのコピー", "B"]);
    expect(copyName("標準", d2.settings.list)).toBe("標準のコピー 2");
    const full: InquirySettings = { ...s0, list: Array.from({ length: TEMPLATE_MAX }, (_, i) => mine(`t${i}`)) };
    expect(duplicateTemplate(full, STANDARD_TEMPLATE)).toBeNull();
  });

  it("直す・消す・元に戻す（同じ場所へ。選んでいたら選び直す）", () => {
    const s0: InquirySettings = { list: [mine("a", "A"), mine("b", "B"), mine("c", "C")], fax: "", pick: "b" };
    const s1 = updateTemplate(s0, "b", { name: "B2", body: "新しい本文" });
    expect(s1.list[1]).toEqual({ id: "b", name: "B2", subject: "件名 B", body: "新しい本文" });
    const r = removeTemplate(s1, "b")!;
    expect(r.settings.list.map((t) => t.id)).toEqual(["a", "c"]);
    expect(r.settings.pick).toBe(STANDARD_ID);
    const back = restoreTemplate(r.settings, r.removed);
    expect(back.list.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(back.pick).toBe("b");
    expect(restoreTemplate(back, r.removed)).toBe(back);
    expect(removeTemplate(s0, "nai")).toBeNull();
  });
});

describe("照会の宛先帳（市区町村＋窓口ごと）", () => {
  const key = officeKey("千葉県", "松戸市", "松戸市 建築指導課");
  it("窓口ごとに覚えて、次から入る（前後の空白は外す）。忘れると窓口のデータに戻る", () => {
    expect(key).toBe("千葉県松戸市|松戸市 建築指導課");
    expect(loadInquiryTo(key)).toBeNull();
    expect(saveInquiryTo(key, { email: " kenchiku@city.example.jp ", fax: "047-000-0000", phone: "" })).toBe(true);
    expect(loadInquiryTo(key)).toEqual({ email: "kenchiku@city.example.jp", fax: "047-000-0000", phone: "" });
    // 同じ名前の町村でも、県が違えば別の窓口
    expect(loadInquiryTo(officeKey("長野県", "松戸市", "松戸市 建築指導課"))).toBeNull();
    expect(forgetInquiryTo(key)).toBe(true);
    expect(loadInquiryTo(key)).toBeNull();
    expect(store.size).toBe(0);
  });

  it("窓口が多くなったら古いものから消す。壊れた値は読み飛ばして書き直す", () => {
    store.set("michilu:inquiry-to", "壊れた値");
    expect(loadInquiryTo(key)).toBeNull();
    for (let i = 0; i < BOOK_MAX + 3; i++) expect(saveInquiryTo(`k${i}`, { email: "", fax: String(i), phone: "" }, 1000 + i)).toBe(true);
    const book = JSON.parse(store.get("michilu:inquiry-to")!);
    expect(Object.keys(book)).toHaveLength(BOOK_MAX);
    expect(loadInquiryTo("k0")).toBeNull();
    expect(loadInquiryTo(`k${BOOK_MAX + 2}`)?.fax).toBe(String(BOOK_MAX + 2));
  });

  it("保存できない端末では false（読めないときは null）", () => {
    broken = true;
    expect(saveInquiryTo(key, { email: "", fax: "1", phone: "" })).toBe(false);
    expect(loadInquiryTo(key)).toBeNull();
    expect(forgetInquiryTo(key)).toBe(false);
  });
});
