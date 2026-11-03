import { describe, expect, it } from "vitest";
import { buildDraft } from "../draft";
import { buildLinks, findMunicipality } from "../roadmap";
import { HAZARDS } from "../roadmap/hazard";
import type { Zoning, ZoningStatus } from "../roadmap/zoning";
import { compactParcels, docText, half, jaDate, type Doc } from "./doc";
import { draftDoc, uniqueSentences } from "./draft-doc";
import { formalChiban, inquiryLetter, letterText } from "./inquiry-letter";
import { parcelDoc } from "./parcel-doc";
import { buildReport, todoDoc } from "./report";
import type { Triage } from "./triage";

const m = findMunicipality("13101")!;
const result = {
  status: "ok" as const,
  lat: 35.6895,
  lng: 139.7441,
  matchedAddress: "東京都千代田区三番町２－１",
  town: "三番町",
  approximate: false,
  municipality: m,
  links: buildLinks(m, 35.6895, 139.7441),
  parcel: { kuiki: "千代田区_三番町___", chiban: "2-1", chibanRaw: "2-1", pieces: [], point: { lat: 35.6895, lng: 139.7441 } },
};
const zoning: Zoning = {
  youto: [{ name: "第一種住居地域", code: 5, bcr: 60, far: 400 }],
  youtoNear: [],
  senbiki: "市街化区域",
  tokei: true,
  jyuntoshi: false,
  bouka: "準防火地域",
  koudoti: true,
  others: [],
};
const st: ZoningStatus = { city: "千代田区", asOf: "2024年", layers: { senbiki: 1, youto: 1, bouka: 1, koudoti: 1, chikukei: 1, tokei: 1 } };
const flood = HAZARDS.flood.layers[0];
const triage: Triage = {
  issues: [
    { id: "flood", level: "warn", topic: "hazard", title: "洪水の浸水想定区域（0.5〜3m）", detail: "", confirm: "市区町村のハザードマップで" },
    { id: "bcr", level: "check", topic: "zoning", title: "地区計画の内容", detail: "", confirm: "区の都市計画の担当で" },
  ],
  actions: [
    { id: "road", priority: 1, title: "前面道路の種別と幅員を確かめる", where: "千代田区 建築課", phone: "03-0000-0000", what: ["前面道路の建築基準法上の種別"] },
    { id: "legal", priority: 1, title: "謄本・公図を取る", where: "法務局", what: ["隣地の地番：千代田区三番町 2-2、千代田区三番町 3"] },
  ],
  pending: [],
  failed: [],
  headline: "要注意 1件・要確認 1件",
};
const input = {
  zoning: { zoning, st },
  parcels: { target: "千代田区三番町 ２－１", neighbors: ["千代田区三番町 2-2", "千代田区三番町 3", "千代田区一番町 5"], reference: false },
  hazard: {
    report: { flood: { status: "ok" as const, hits: [{ layer: flood, at: flood.classes.find((c) => c.label === "0.5〜3m") }] }, dosha: { status: "ok" as const, hits: [] } },
    elevation: { value: 25.3, source: "5mメッシュ" },
    maps: { flood: "https://example.jp/hm.html" },
    muniCd: "13101",
  },
  triage,
  done: new Set(["legal"]),
};
const day = new Date(2026, 10, 3, 10, 0);

describe("書類の文の形（lib/app/doc.ts）", () => {
  const doc: Doc = {
    title: "テスト",
    head: ["物件：どこか"],
    sections: [
      {
        title: "章1",
        items: [
          { text: "注意する所", tone: "warn" },
          { label: "建ぺい率", text: "60%", tone: "check" },
          { label: "容積率", text: "要確認", tone: "check" },
          { text: "やること", box: "todo", note: "電話で", sub: ["細かい点"] },
          { text: "済んだこと", box: "done" },
          { text: "地図", link: { label: "道路の地図", url: "https://example.jp/a" } },
          { text: "同じ地図", link: { label: "道路の地図", url: "https://example.jp/a" } },
        ],
      },
      { title: "空の章", items: [] },
    ],
    foot: ["※参考です。"],
  };
  const text = docText(doc);
  it("見出しは■、章の間は1行あけ、注意は▲、やることは□と☑", () => {
    expect(text.startsWith("【テスト】\n物件：どこか\n\n■ 章1\n")).toBe(true);
    expect(text).toContain("▲ 注意する所");
    expect(text).toContain("□ やること\n　※電話で\n　・細かい点");
    expect(text).toContain("☑ 済んだこと");
    // 中身の無い章は出さない
    expect(text).not.toContain("空の章");
  });
  it("要確認は札で付け、「要確認」と書いた行には重ねない", () => {
    expect(text).toContain("・建ぺい率：60%【要確認】");
    expect(text).toContain("・容積率：要確認\n");
  });
  it("URL は本文に混ぜず、最後に番号でまとめる（同じ URL は同じ番号）", () => {
    expect(text).toContain("・地図 → ［1］");
    expect(text).toContain("・同じ地図 → ［1］");
    expect(text).toContain("■ 確認先のリンク\n［1］道路の地図\n　https://example.jp/a");
    expect(text.split("https://example.jp/a").length).toBe(2);
    expect(text.trim().endsWith("※参考です。")).toBe(true);
  });
  it("筆の並びは同じ所在をまとめ、数字は半角にする", () => {
    expect(compactParcels(["松戸市古ケ崎４丁目 3555-1", "松戸市古ケ崎４丁目 3555-2", "松戸市栄町 9"])).toEqual(["松戸市古ケ崎4丁目 3555-1・3555-2", "松戸市栄町 9"]);
    expect(half("古ケ崎４丁目３５５６－１")).toBe("古ケ崎4丁目3556-1");
    // 日本語の約物は変えない
    expect(half("地番：（推定）、Ａ棟")).toBe("地番：（推定）、A棟");
    expect(jaDate(day)).toBe("2026年11月3日");
  });
});

describe("結果の文面（要点・詳しく）", () => {
  const short = docText(buildReport(result, input, { detail: "short", date: day, area: "約120㎡（約36.3坪）" }));
  const full = docText(buildReport(result, input, { detail: "full", date: day, area: "約120㎡（約36.3坪）" }));
  it("要点：結論（要注意点）を先に、物件の概要・災害・残りのやること。URL の章は出さない", () => {
    expect(short.startsWith("【物件調査の結果】\n物件：東京都千代田区三番町2-1")).toBe(true);
    expect(short).toContain("調べた日：2026年11月3日");
    expect(short.indexOf("■ 要点")).toBeLessThan(short.indexOf("■ 物件の概要"));
    expect(short).toContain("▲ 洪水の浸水想定区域（0.5〜3m）");
    expect(short).toContain("・地区計画の内容【要確認】");
    expect(short).toContain("・面積：約120㎡（約36.3坪）");
    expect(short).toContain("・用途地域：第一種住居地域（市街化区域）");
    expect(short).toContain("■ 次にやること（残り 1件／2件）");
    expect(short).toContain("□ 前面道路の種別と幅員を確かめる：千代田区 建築課 03-0000-0000");
    expect(short).toContain("☑ 謄本・公図を取る：法務局");
    expect(short).not.toContain("■ 確認先のリンク");
    expect(short).toContain("※出典：");
  });
  it("詳しく：法令・地番（所在をまとめた隣地）・確認先のリンク・出典まで", () => {
    expect(full).toContain("■ 法令上の制限（参考）");
    expect(full).toContain("■ 謄本・公図用の地番");
    expect(full).toContain("隣の筆（3筆）：千代田区三番町 2-2・3／千代田区一番町 5");
    expect(full).toContain("・物件の筆：千代田区三番町 2-1");
    expect(full).toContain("■ 確認先のリンク");
    expect(full).toContain("■ 出典");
    // やることの細かい点の隣地も、所在をまとめる
    expect(full).toContain("　・隣地の地番：千代田区三番町 2-2・3");
    expect(full.length).toBeGreaterThan(short.length);
  });
  it("章の間は必ず1行あく（文の塊にしない）", () => {
    for (const t of [short, full]) for (const m of t.matchAll(/\n■ /g)) expect(t[m.index! - 1]).toBe("\n");
  });
});

describe("道路種別の照会文（手紙の形）", () => {
  it("地番は書類の形（3556番1）にする", () => {
    expect(formalChiban("3556-1")).toBe("3556番1");
    expect(formalChiban("１２")).toBe("12番");
    expect(formalChiban("10-2-3")).toBe("10番2番3");
    expect(formalChiban("123番地")).toBe("123番地");
  });
  it("日付・宛先・記・以上・ご回答欄。差出人が無ければ記入欄", () => {
    const l = inquiryLetter({ address: "東京都千代田区三番町２－１", chiban: "2-1", dept: "千代田区 建築課", date: day });
    const t = letterText(l);
    expect(t.startsWith("道路種別のご照会\n\n2026年11月3日\n\n千代田区 建築課 御中")).toBe(true);
    expect(t).toContain("会社名：");
    expect(l.blankFrom).toBe(true);
    expect(t).toContain("\n記\n");
    expect(t).toContain("　東京都千代田区三番町2-1\n　地番：2番1");
    expect(t).toContain("(1) 前面道路の建築基準法上の種別");
    expect(t).toContain("\n以上\n");
    expect(t).toContain("ご回答欄");
    expect(t).toContain("道路の種別：□42条1項1号");
    expect(t).toContain("後退（セットバック）：□要");
  });
  it("差出人が入っていれば会社名・担当・連絡先を入れる。地番が分からなければ空欄", () => {
    const l = inquiryLetter({ address: "東京都千代田区三番町", dept: "千代田区 建築課", date: day, sender: { company: "株式会社テスト不動産", person: "山田", phone: "03-1111-2222", email: "" } });
    expect(l.from).toEqual(["株式会社テスト不動産", "担当：山田", "電話：03-1111-2222"]);
    expect(l.blankFrom).toBe(false);
    expect(letterText(l)).toContain("地番：（　　　　　　　）");
  });
});

describe("謄本・公図用の地番", () => {
  it("1筆ずつ□付き、請求するもの・請求のしかたを添える", () => {
    const t = docText(parcelDoc(result, { target: "千代田区三番町 2-1", neighbors: ["千代田区三番町 2-2", "千代田区三番町 3"], reference: false }, day));
    expect(t).toContain("■ 物件の筆\n□ 千代田区三番町 2-1");
    expect(t).toContain("■ 隣の筆（境界が接している筆・2筆）\n□ 千代田区三番町 2-2\n□ 千代田区三番町 3");
    expect(t).toContain("■ 請求するもの（目安）");
    expect(t).toContain("□ 登記事項証明書（土地・全部事項）");
    // 地番の書き方は、この物件の筆の地番で見せる
    expect(t).toContain("地番を「2-1」の形（枝番まで）で入れる");
    expect(t).toContain("地番は「2番1」の形で書く");
  });
  it("住所の地点の筆が道路などの可能性があるときは、隣地を並べない", () => {
    const t = docText(parcelDoc(result, { target: "千代田区三番町 9", neighbors: ["a 1", "a 2"], reference: true, offLot: true }, day));
    expect(t).toContain("省略（この筆に接する筆は2筆）");
    expect(t).not.toContain("□ a 1");
    expect(t).toContain("【要確認】");
    // 地番の形でない筆の名前なら、例の地番で書き方を見せる
    expect(docText(parcelDoc(result, { target: "千代田区三番町 9（参考）", neighbors: [], reference: true }, day))).toContain("「123-4」の形");
  });
  it("筆が見つからないときは確かめる先を書く", () => {
    const t = docText(parcelDoc(result, undefined, day));
    expect(t).toContain("見つかりませんでした");
  });
});

describe("重説の下書き（スマホの形）", () => {
  const sections = buildDraft(result, { zoning: { zoning, st }, parcels: { target: "千代田区三番町 2-1", neighbors: ["千代田区三番町 2-2", "千代田区三番町 3"], reference: false } });
  const t = docText(draftDoc(sections, day));
  it("欄の文の URL は最後のリンクにまとめ、隣地は所在をまとめる", () => {
    expect(t).toContain("・隣地の地番：千代田区三番町 2-2・3");
    expect(t).toContain("■ 確認先のリンク");
    // 本文の行に「（https://」が残らない
    expect(t.split("■ 確認先のリンク")[0]).not.toMatch(/（https?:\/\//);
    expect(t).toContain("要確認");
    expect(t.startsWith("【重説・物件概要の下書き】\n作成日：2026年11月3日")).toBe(true);
  });
});

describe("要注意点と次にやること（スマホの一覧のコピー）", () => {
  const t = docText(todoDoc(result, triage, new Set(["legal"]), day, (a) => (a.id === "road" ? ["42条2項", "幅員 3.6m"] : [])));
  it("ほかの書類と同じ形：題・物件・作成日、■ 要注意点、■ 次にやること（☑ 済み）、確かめた結果、注意", () => {
    expect(t.startsWith("【要注意点と次にやること】\n物件：東京都千代田区三番町2-1 地番 2-1\n作成日：2026年11月3日")).toBe(true);
    expect(t).toContain("■ 要注意点（要注意 1件・要確認 1件）\n▲ 洪水の浸水想定区域（0.5〜3m）\n　※市区町村のハザードマップで確認");
    expect(t).toContain("■ 次にやること（残り 1件／2件）");
    expect(t).toContain("□ 前面道路の種別と幅員を確かめる：千代田区 建築課 03-0000-0000\n　・前面道路の建築基準法上の種別\n　・確かめた結果：42条2項・幅員 3.6m");
    expect(t).toContain("☑ 謄本・公図を取る：法務局\n　・隣地の地番：千代田区三番町 2-2・3");
    expect(t.trim().endsWith("重要事項説明は役所・法務局・現地で確かめてください。")).toBe(true);
    for (const m of t.matchAll(/\n■ /g)) expect(t[m.index! - 1]).toBe("\n");
  });
});

describe("出典の文の重なり", () => {
  it("前の行・同じ行にもう出ている文は外す", () => {
    expect(uniqueSentences(["A。B。C", "D。B。E。", "B。"])).toEqual(["A。B。C", "D。E。"]);
  });
});
