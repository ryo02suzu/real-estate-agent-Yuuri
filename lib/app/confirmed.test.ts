import { describe, expect, it } from "vitest";
import { buildDraft, draftText } from "../draft";
import type { PropertyRecords } from "../records";
import { buildLinks, findMunicipality } from "../roadmap";
import type { Zoning } from "../roadmap/zoning";
import { confirmedItems } from "./confirmed";

const at = new Date(2026, 10, 3, 10, 0).getTime();
const records: PropertyRecords = {
  key: "k",
  label: "",
  updatedAt: at,
  items: {
    road: {
      kind: { done: true, method: "窓口", source: "千代田区 建築指導課", note: "42条2項", at },
      width: { done: true, method: "窓口", source: "千代田区 建築指導課", note: "3.6m", at },
      setback: { done: false, note: "要", at },
    },
    zoning: { ratio: { done: true, method: "公式サイト", note: "60%・300%", at }, youto: { done: true, note: "第一種住居地域", at } },
    law: {
      kuiki: { done: true, method: "窓口", note: "盛土規制法の区域：区域外／砂防・急傾斜地などの区域：区域内", at },
      iseki: { done: true, method: "電話", source: "教育委員会", note: "包蔵地ではない", at },
    },
    around: { site: { done: true, method: "現地", note: "境界標あり", at } },
    parcel: { touki: { done: true, note: "2-1・宅地・120.50㎡", at } },
    hazard: { flood: { done: true, method: "公式サイト", note: "0.5m未満", at } },
  },
};

describe("確かめた結果を書類に入れる", () => {
  it("確認済みで答えのある記録だけを、見出しごとに取り出す（盛土・砂防のように1つに2つ書いたものは分ける）", () => {
    const items = confirmedItems(records);
    expect(items.map((i) => `${i.label}=${i.value}`)).toEqual([
      "道路種別=42条2項",
      "幅員=3.6m",
      "用途地域=第一種住居地域",
      "建ぺい率・容積率=60%・300%",
      "盛土規制法の区域=区域外",
      "砂防・急傾斜地などの区域=区域内",
      "埋蔵文化財=包蔵地ではない",
      "洪水・内水=0.5m未満",
      "現地で見たこと=境界標あり",
      "登記の地番・面積=2-1・宅地・120.50㎡",
    ]);
    expect(items[0].detail).toBe("確認済み 11/3・窓口・千代田区 建築指導課");
    expect(confirmedItems(undefined)).toEqual([]);
  });

  it("重説の下書き：同じことを書く欄は確認済みに書き換えて要確認を外し、無い欄は節の先頭に足す", () => {
    const m = findMunicipality("13101")!;
    const result = { status: "ok" as const, lat: 35.6895, lng: 139.7441, matchedAddress: "東京都千代田区三番町", town: "三番町", approximate: false, municipality: m, links: buildLinks(m, 35.6895, 139.7441) };
    const zoning: Zoning = { youto: [{ name: "第一種住居地域", code: 5 }], youtoNear: [], senbiki: "市街化区域", tokei: true, jyuntoshi: false, koudoti: false, others: [] };
    const plain = buildDraft(result, { zoning: { zoning } });
    const draft = buildDraft(result, { zoning: { zoning }, confirmed: confirmedItems(records) });
    const sec = (re: RegExp) => draft.find((s) => re.test(s.title))!;
    const row = (re: RegExp, label: string) => sec(re).rows.find((r) => r.label === label)!;
    // 建ぺい率・容積率はデータに無い（要確認）→ 確かめた値に
    expect(plain.find((s) => /^都市計画法/.test(s.title))!.rows.find((r) => r.label === "建ぺい率")!.check).toBe(true);
    expect(row(/^都市計画法/, "建ぺい率")).toMatchObject({ value: "60%", confirmed: true });
    expect(row(/^都市計画法/, "建ぺい率").check).toBeFalsy();
    expect(row(/^都市計画法/, "容積率")).toMatchObject({ value: "300%", confirmed: true });
    // 用途地域はデータの値を注に残す
    expect(row(/^都市計画法/, "用途地域").note).toBe("確認済み 11/3。データ：第一種住居地域");
    // 盛土規制法・埋蔵文化財は書き換え、砂防は足す
    expect(row(/^その他の法令/, "宅地造成及び特定盛土等規制法")).toMatchObject({ value: "区域外", confirmed: true });
    expect(row(/^その他の法令/, "文化財保護法（埋蔵文化財包蔵地）")).toMatchObject({ value: "包蔵地ではない", confirmed: true });
    expect(sec(/^その他の法令/).rows[0]).toMatchObject({ label: "砂防・急傾斜地などの区域", value: "区域内" });
    // 道路：データが無いときの「道路の種別・幅員（要確認）」の代わりに、道路種別・幅員を先頭に。済んでいないセットバックは入れない
    expect(sec(/^敷地と道路/).rows.slice(0, 2).map((r) => `${r.label}=${r.value}`)).toEqual(["道路種別=42条2項", "幅員=3.6m"]);
    expect(sec(/^敷地と道路/).rows.some((r) => r.label === "道路の種別・幅員")).toBe(false);
    expect(sec(/^敷地と道路/).rows.some((r) => r.label === "セットバックの要否")).toBe(false);
    // 物件の表示：地番が要確認なら登記の地番で書き換え（地番が分かっているときは所在の下に足す）。現地で確かめたことは出典の前の節
    expect(row(/^物件の表示/, "所在（地番）")).toMatchObject({ value: "2-1・宅地・120.50㎡", confirmed: true });
    const found = buildDraft(
      { ...result, parcel: { kuiki: "千代田区_三番町___", chiban: "2-1", chibanRaw: "2-1", pieces: [], point: { lat: 35.6895, lng: 139.7441 } } },
      { confirmed: confirmedItems(records) },
    ).find((s) => /^物件の表示/.test(s.title))!.rows.map((r) => r.label);
    expect(found.slice(0, 3)).toEqual(["所在（住所）", "所在（地番）", "登記の地番・面積"]);
    const titles = draft.map((s) => s.title);
    expect(titles.indexOf("現地で確かめたこと")).toBeGreaterThan(-1);
    expect(titles.indexOf("現地で確かめたこと")).toBeLessThan(titles.indexOf("出典"));
    expect(sec(/^ハザードマップ/).rows[0]).toMatchObject({ label: "洪水・内水", value: "0.5m未満" });
    // コピーした文にも確認済みが入る
    expect(draftText(draft)).toContain("建ぺい率：60%（確認済み 11/3・公式サイト）");
    expect(draftText(draft)).toContain("文化財保護法（埋蔵文化財包蔵地）：包蔵地ではない（確認済み 11/3・電話・教育委員会）");
  });
});
