import { describe, expect, it } from "vitest";
import { findMunicipality } from "../roadmap";
import { CHIBAN_BLANK, inquiryLetter, letterText } from "./inquiry-letter";
import {
  FIELD_KEYS,
  STANDARD_TEMPLATE,
  cleanEmail,
  faxFormatProblem,
  faxMailTo,
  fieldToken,
  inquiryDeptOf,
  inquiryInputOf,
  inquiryValues,
  isEmail,
  mailtoUrl,
  mergeSubject,
  mergeTemplate,
  numberDigits,
  sampleInput,
  telUrl,
  unknownTokens,
  type InquiryInput,
} from "./inquiry-template";

const day = new Date(2026, 10, 7);
const sender = { company: "株式会社テスト不動産", person: "営業部 山田", phone: "03-1111-2222", email: "info@example.co.jp" };
const base: InquiryInput = { address: "千葉県松戸市古ケ崎四丁目３５５６－１", chiban: "3556-1", dept: "松戸市 建築指導課", city: "松戸市", sender, date: day };

describe("照会の文面：差し込み", () => {
  it("全部の項目に、物件の値が入る（複数行の項目は行の頭の字下げをそろえる）", () => {
    const { values } = inquiryValues(base);
    const body = FIELD_KEYS.map((k) => `${k}=${fieldToken(k)}`).join("\n");
    const m = mergeTemplate(body, values);
    expect(m.unknown).toEqual([]);
    expect(m.used).toEqual([...FIELD_KEYS]);
    const lines = m.text.split("\n");
    expect(lines.slice(0, 5)).toEqual(["日付=2026年11月7日", "宛先=松戸市 建築指導課", "所在地=千葉県松戸市古ケ崎四丁目3556-1", "地番=3556番1", "市区町村=松戸市"]);
    expect(m.text).toContain("差出人=株式会社テスト不動産\n担当：営業部 山田\n電話：03-1111-2222　メール：info@example.co.jp\n");
    expect(m.text).toContain("会社名=株式会社テスト不動産\n担当者=営業部 山田\n電話=03-1111-2222\nメール=info@example.co.jp\n");
    expect(m.text).toContain("聞くこと=(1) 前面道路の建築基準法上の種別");
    expect(m.text).toContain("\n(5) 公道（市道など）か私道か\n");
    expect(m.text).toMatch(/回答欄=道路の種別：□42条1項1号.*\n幅員：.*\n後退（セットバック）：.*\n位置指定道路：.*\n道路の別：.*\nご回答日：.*\nご担当者：$/);
    // 字下げした行に書くと、2行目からも同じ字下げ
    expect(mergeTemplate("　{{聞くこと}}", values).text.split("\n")).toEqual(values.聞くこと.split("\n").map((x) => `　${x}`));
    expect(mergeTemplate("  {{差出人}}", values).text).toBe("  株式会社テスト不動産\n  担当：営業部 山田\n  電話：03-1111-2222　メール：info@example.co.jp");
  });

  it("分からない項目は書いたまま残し、知らせる（全角の ｛｛ ｝｝・中の空白も項目として読む）", () => {
    const { values } = inquiryValues(base);
    const m = mergeTemplate("{{部署}}へ。{{ 日付 }}／｛｛宛先｝｝／{{部署}}／{{}}／{日付}", values);
    expect(m.text).toBe("{{部署}}へ。2026年11月7日／松戸市 建築指導課／{{部署}}／{{}}／{日付}");
    expect(m.unknown).toEqual(["{{部署}}"]);
    expect(unknownTokens("{{部署}} {{日付}}", "{{FAX番号}}", "{{部署}}")).toEqual(["{{部署}}", "{{FAX番号}}"]);
  });

  it("空の値は空のまま入る。地番が分からなければ（　）の欄、差出人が無ければ記入欄", () => {
    const { values, blank } = inquiryValues({ ...base, chiban: undefined, sender: undefined });
    expect(values.地番).toBe(CHIBAN_BLANK);
    expect(values.差出人).toBe("会社名：\n担当：\n電話：\nメール：");
    expect(mergeTemplate("会社名：{{会社名}}／メール：{{メール}}／", values).text).toBe("会社名：／メール：／");
    expect(blank).toEqual(["地番", "差出人", "会社名", "担当者", "電話", "メール"]);
    // メールだけ空の差出人
    const part = inquiryValues({ ...base, sender: { ...sender, email: "" } });
    expect(part.blank).toEqual(["メール"]);
    expect(part.values.差出人).toBe("株式会社テスト不動産\n担当：営業部 山田\n電話：03-1111-2222");
  });

  it("入れた値の中の {{…}} は読み直さない（住所や会社名に {{ があっても、そのまま）", () => {
    const { values } = inquiryValues({ ...base, sender: { ...sender, company: "{{日付}}商事" } });
    expect(mergeTemplate("{{会社名}}", values).text).toBe("{{日付}}商事");
  });

  it("件名は1行（複数行の項目は空白でつなぐ）", () => {
    const { values } = inquiryValues(base);
    expect(mergeSubject(STANDARD_TEMPLATE.subject, values).text).toBe("道路種別のご照会（千葉県松戸市古ケ崎四丁目3556-1）");
    expect(mergeSubject("照会 {{差出人}}", values).text).toBe("照会 株式会社テスト不動産 担当：営業部 山田 電話：03-1111-2222　メール：info@example.co.jp");
  });
});

describe("標準のひな形は、今の照会文（letterText）と同じ文", () => {
  const cases: [string, InquiryInput][] = [
    ["差出人も地番もある", base],
    ["差出人が無い（記入欄）", { ...base, sender: undefined }],
    ["地番が分からない", { ...base, chiban: undefined }],
    ["差出人の一部だけ（電話だけ）", { ...base, sender: { company: "", person: "", phone: "03-0000-0000", email: "" } }],
    ["差出人がメールだけ", { ...base, sender: { company: "", person: "", phone: "", email: "a@example.jp" } }],
    ["県の出先機関・全角の住所・枝番の無い地番", { address: "茨城県水戸市笠原町９７８－６", chiban: "１２", dept: "茨城県 水戸土木事務所", city: "水戸市", date: new Date(2027, 0, 31) }],
  ];
  for (const [name, input] of cases)
    it(name, () => {
      const merged = mergeTemplate(STANDARD_TEMPLATE.body, inquiryValues(input).values);
      expect(merged.unknown).toEqual([]);
      expect(merged.text).toBe(letterText(inquiryLetter(input)));
    });
});

describe("宛先の課と、物件の画面からの材料", () => {
  const m = findMunicipality("13101")!;
  it("窓口が分かれば市区町村名を頭に（県の出先機関はそのまま）、無ければ建築の担当課", () => {
    expect(inquiryDeptOf({ municipality: m, contact: { dept: "まちづくり推進部 建築指導課" } })).toBe(`${m.name} まちづくり推進部 建築指導課`);
    expect(inquiryDeptOf({ municipality: m, contact: { dept: "千葉県 柏土木事務所" } })).toBe("千葉県 柏土木事務所");
    expect(inquiryDeptOf({ municipality: m, contact: undefined })).toBe(`${m.name} 建築指導の担当課`);
  });
  it("地番は調べた筆の登記の地番（地図で選んだ地点の筆は入れない）", () => {
    const parcel = { chibanRaw: "2-1" } as never;
    const r = { matchedAddress: "東京都千代田区三番町2-1", municipality: m, contact: undefined, parcel };
    expect(inquiryInputOf(r, undefined, day)).toMatchObject({ address: "東京都千代田区三番町2-1", chiban: "2-1", city: m.name });
    expect(inquiryInputOf({ ...r, picked: true }, undefined, day).chiban).toBeUndefined();
    expect(sampleInput(undefined, day)).toMatchObject({ dept: "〇〇市 建築指導課", city: "〇〇市" });
  });
});

describe("メールのアプリを開く（mailto:）", () => {
  it("日本語・改行（%0D%0A）・& ? # % = + と空白を符号化する", () => {
    const url = mailtoUrl({ to: "kenchiku@city.example.lg.jp", subject: "道路種別のご照会（A&B?#1）", body: "1行目\n2行目 100%\r\n3=3+0 #x" })!;
    expect(url.startsWith("mailto:kenchiku@city.example.lg.jp?subject=")).toBe(true);
    const q = url.slice(url.indexOf("?") + 1);
    expect(q.split("&")).toHaveLength(2);
    expect(q).toContain("subject=%E9%81%93%E8%B7%AF");
    expect(q).toContain("%EF%BC%88A%26B%3F%231%EF%BC%89");
    expect(q).toContain("body=1%E8%A1%8C%E7%9B%AE%0D%0A2%E8%A1%8C%E7%9B%AE%20100%25%0D%0A3%3D3%2B0%20%23x");
    expect(q).not.toMatch(/[ \n\r#?]/);
    // 戻すと元の文（改行は CRLF）
    const params = new URLSearchParams(q.replace(/\+/g, "%2B"));
    expect(params.get("subject")).toBe("道路種別のご照会（A&B?#1）");
    expect(params.get("body")).toBe("1行目\r\n2行目 100%\r\n3=3+0 #x");
  });
  it("宛先が空なら宛先なしで開く。形の違う宛先は開かない。全角で入れた宛先は半角で読む", () => {
    expect(mailtoUrl({ subject: "a", body: "b" })).toBe("mailto:?subject=a&body=b");
    expect(mailtoUrl({ to: "not-an-address", subject: "a", body: "b" })).toBeNull();
    expect(mailtoUrl({ to: "ｋｅｎｃｈｉｋｕ＠ｃｉｔｙ．ｅｘａｍｐｌｅ．ｊｐ ", subject: "a", body: "b" })).toBe("mailto:kenchiku@city.example.jp?subject=a&body=b");
    expect(mailtoUrl({ to: "a+b&c@example.jp", subject: "", body: "" })).toBe("mailto:a%2Bb%26c@example.jp?subject=&body=");
    expect(cleanEmail("　x@example.jp　")).toBe("x@example.jp");
    expect(isEmail("x@localhost")).toBe(false);
  });
  it("標準の照会文（約900字）の本文も1つの mailto: に入る", () => {
    const text = letterText(inquiryLetter(base));
    const url = mailtoUrl({ to: "a@example.jp", subject: "s", body: text })!;
    expect(decodeURIComponent(url.slice(url.indexOf("&body=") + 6))).toBe(text.replace(/\n/g, "\r\n"));
  });
});

describe("電話・FAX の番号", () => {
  it("ハイフン・全角・長音の区切りを外し、最初の番号だけ読む", () => {
    expect(numberDigits("047-366-7111")).toBe("0473667111");
    expect(numberDigits("０４７－３６６－７１１１")).toBe("0473667111");
    expect(numberDigits("047ー366ー7111")).toBe("0473667111");
    expect(numberDigits("（047）366-7111")).toBe("0473667111");
    expect(numberDigits("029-224-1111（代表・内線3461）")).toBe("0292241111");
    expect(numberDigits("048-242-6344（第1係）/ 048-258-1199（第2係）")).toBe("0482426344");
    expect(numberDigits("なし")).toBe("");
    expect(telUrl("03-1234-5678")).toBe("tel:0312345678");
    expect(telUrl("1234")).toBeNull();
  });
  it("FAX をメールで送る宛先の形：{番号} に数字を入れる。{番号} の無い形・メールの形でないものは断る", () => {
    expect(faxFormatProblem("")).toBeNull();
    expect(faxFormatProblem("{番号}@fax.example.co.jp")).toBeNull();
    expect(faxFormatProblem("fax-{番号}@example.com")).toBeNull();
    expect(faxFormatProblem("｛番号｝＠ｆａｘ．ｅｘａｍｐｌｅ．ｃｏ．ｊｐ")).toBeNull();
    expect(faxFormatProblem("fax@example.co.jp")).toMatch(/\{番号\}/);
    expect(faxFormatProblem("{FAX番号}@example.co.jp")).toMatch(/\{番号\}/);
    expect(faxFormatProblem("{番号}")).toMatch(/メールアドレスの形/);
    expect(faxFormatProblem("{番号}@localhost")).toMatch(/メールアドレスの形/);
    expect(faxFormatProblem(" {番号}@fax.example.jp ")).toBeNull(); // 前後の空白は外して読む
    expect(faxFormatProblem("{番号}@fax example.jp")).toMatch(/メールアドレスの形/); // 途中の空白は断る
    expect(faxMailTo("{番号}@fax.example.co.jp", "０４７－３６６－７１１１")).toEqual({ ok: true, to: "0473667111@fax.example.co.jp" });
    expect(faxMailTo("{番号}@fax.example.co.jp", "047-366")).toMatchObject({ ok: false, reason: expect.stringMatching(/10〜11 桁/) });
    expect(faxMailTo("", "047-366-7111")).toMatchObject({ ok: false });
    expect(faxMailTo("fax@example.co.jp", "047-366-7111")).toMatchObject({ ok: false, reason: expect.stringMatching(/^宛先の形：/) });
  });
});
