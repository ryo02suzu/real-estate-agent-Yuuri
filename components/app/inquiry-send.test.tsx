import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_TEMPLATE } from "@/lib/app/inquiry-template";
import { FaxCover, SendPanel, TemplateChips } from "./inquiry-send";

const noop = () => {};
const base: Parameters<typeof SendPanel>[0] = {
  dept: "松戸市 建築指導課",
  templateName: "標準",
  subject: "道路種別のご照会（A&B）",
  body: "1行目\n2行目",
  ready: true,
  to: { email: "kenchiku@city.example.lg.jp", fax: "", phone: "047-000-0000" },
  onTo: noop,
  saved: null,
  canReset: false,
  onReset: noop,
  faxFormat: "",
  pages: 2,
  onPages: noop,
  onPrintFax: noop,
};
const render = (p: Partial<Parameters<typeof SendPanel>[0]> = {}) => renderToStaticMarkup(<SendPanel {...base} {...p} />);
/** リンクの href（HTML の &amp; を戻す） */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

describe("照会文のシートの「送る」（components/app/inquiry-send.tsx）", () => {
  it("送るのは利用者のアプリで、サーバーには送らず、自動でも送らないと書く", () => {
    const html = render();
    expect(html).toContain("送信はお使いのメール・FAX のアプリやサービスから行います（MICHILU のサーバーには送りません）。");
    expect(html).toContain("自動では送りません。送る前に内容を確かめてください。");
    expect(html).toContain("宛先：松戸市 建築指導課");
  });

  it("メールは mailto:（件名・本文を符号化、改行は %0D%0A）、電話は tel:", () => {
    const links = hrefs(render());
    expect(links).toContain("mailto:kenchiku@city.example.lg.jp?subject=%E9%81%93%E8%B7%AF%E7%A8%AE%E5%88%A5%E3%81%AE%E3%81%94%E7%85%A7%E4%BC%9A%EF%BC%88A%26B%EF%BC%89&body=1%E8%A1%8C%E7%9B%AE%0D%0A2%E8%A1%8C%E7%9B%AE");
    expect(links).toContain("tel:0470000000");
  });

  it("FAX は、サービスの宛先の形が無ければ印刷・共有を開くボタン、あればその宛先への mailto:", () => {
    const off = render({ to: { ...base.to, fax: "047-111-2222" } });
    expect(off).toContain('aria-controls="iq-fax-ways"');
    expect(off).toContain("印刷して FAX（A4・FAX 送付状つき）");
    expect(hrefs(off).filter((h) => h.startsWith("mailto:"))).toHaveLength(1);
    const on = render({ to: { ...base.to, fax: "０４７－１１１－２２２２" }, faxFormat: "{番号}@fax.example.co.jp" });
    expect(on).toContain("FAX のメール宛先：0471112222@fax.example.co.jp");
    expect(hrefs(on).some((h) => h.startsWith("mailto:0471112222@fax.example.co.jp?subject="))).toBe(true);
  });

  it("本文が空のひな形・形の違うメールの宛先は、リンクにしない（押すと理由を出す）", () => {
    expect(hrefs(render({ ready: false })).filter((h) => h.startsWith("mailto:"))).toEqual([]);
    expect(hrefs(render({ to: { ...base.to, email: "kenchiku@" } })).filter((h) => h.startsWith("mailto:"))).toEqual([]);
    // 宛先が空なら、宛先なしでメールのアプリを開く
    expect(hrefs(render({ to: { ...base.to, email: "" } })).some((h) => h.startsWith("mailto:?subject="))).toBe(true);
  });

  it("窓口の注意・受付時間・電話で答えない窓口を、窓口のデータのとおりに出す", () => {
    const html = render({ contact: { dept: "建築指導課", phone: "047-000-0000（代表・内線123）", hours: "8:30〜17:00", note: "道路種別は窓口のみ（電話・FAX・メール不可）", noPhoneInquiry: true } });
    expect(html).toContain("窓口の注意（MICHILU の窓口のデータ）：道路種別は窓口のみ（電話・FAX・メール不可）");
    expect(html).toContain("窓口のデータ：047-000-0000（代表・内線123）");
    expect(html).toContain("受付時間：8:30〜17:00");
    expect(html).toContain("道路種別は電話では答えてもらえません");
  });

  it("入らない項目があれば、書いたまま送られることを知らせる", () => {
    expect(render({ unknown: ["{{部署}}"] })).toContain("入らない項目：{{部署}}（書いたまま送られます）");
  });
});

describe("使うひな形のチップと、FAX 送付状", () => {
  it("標準と自分のひな形を並べ、選んだものに印（名前の無いものは「名前なし」）", () => {
    const html = renderToStaticMarkup(<TemplateChips list={[{ id: "t-1", name: " ", subject: "", body: "" }]} pick={STANDARD_TEMPLATE.id} onPick={noop} onEdit={noop} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*標準/);
    expect(html).toContain("名前なし");
    expect(html).toContain("ひな形を作る・直す");
  });

  it("送付状：宛先・FAX 番号・日付・送付枚数・差出人・件名（FAX 番号が無ければ書き込む欄）", () => {
    const html = renderToStaticMarkup(<FaxCover to="松戸市 建築指導課" fax="" date="2026年11月8日" pages={3} from={["会社名：", "担当："]} blankFrom subject="道路種別のご照会" />);
    for (const s of ["FAX 送付状", "松戸市 建築指導課 御中", "2026年11月8日", "3枚（この送付状を含む）", "会社名：", "道路種別のご照会"]) expect(html).toContain(s);
    expect(html).toContain("print-fax-cover");
  });
});
