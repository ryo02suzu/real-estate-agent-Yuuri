import { describe, expect, it } from "vitest";
import DATA from "./data/utilities.json";
import { MUNICIPALITIES } from "./index";
import { contactName, NO_CITY_GAS, NO_SEWER, noContactText, utilitiesFor, UTILITIES_CHECKED } from "./utilities";

describe("上下水道・ガスの照会先", () => {
  it("1都3県の市区町村の名前がアプリの市区町村とそろっている", () => {
    const names = new Set(MUNICIPALITIES.map((m) => `${m.pref}${m.name}`));
    const keys = Object.keys(DATA.cities);
    expect(keys).toHaveLength(212);
    expect(keys.filter((k) => !names.has(k))).toEqual([]);
    expect(UTILITIES_CHECKED).toBe("2026年10月");
  });

  it("どの市区町村の照会先も、事業者の一覧に公式のページがある", () => {
    const providers = DATA.providers as Record<string, { url: string }>;
    for (const [city, c] of Object.entries(DATA.cities) as [string, { water?: string[][]; sewer?: string[][] }][]) {
      expect(c.water?.length, city).toBeGreaterThan(0);
      for (const [name] of [...(c.water ?? []), ...(c.sewer ?? [])]) expect(providers[name]?.url, `${city} ${name}`).toMatch(/^https?:\/\//);
    }
  });

  it("千代田区は東京都水道局と東京都下水道局", () => {
    const u = utilitiesFor({ pref: "東京都", name: "千代田区" })!;
    expect(u.water.map((c) => c.name)).toEqual(["東京都水道局"]);
    expect(u.sewer.map((c) => c.name)).toEqual(["東京都下水道局"]);
    // 都市ガスはまだ調べていない（行を出さない）
    expect(u.gas).toBeUndefined();
  });

  it("市の一部だけを受け持つ事業者は、受け持つ地域を添える", () => {
    const u = utilitiesFor({ pref: "千葉県", name: "千葉市" })!;
    expect(u.water.length).toBeGreaterThan(1);
    expect(contactName(u.water[0])).toMatch(/^千葉県企業局（.+）$/);
  });

  it("公共下水道の無い町村は、下水道を空にして浄化槽などの一言を出す", () => {
    const u = utilitiesFor({ pref: "埼玉県", name: "ときがわ町" })!;
    expect(u.sewer).toEqual([]);
    expect(noContactText("下水道")).toBe(NO_SEWER);
    expect(noContactText("ガス")).toBe(NO_CITY_GAS);
  });

  it("調べていない市町村（北関東）は出さない", () => {
    expect(utilitiesFor({ pref: "茨城県", name: "水戸市" })).toBeUndefined();
  });
});
