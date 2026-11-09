import { describe, expect, it } from "vitest";
import GSI_CODES from "./data/gsi-muni-codes.json";
import { CHUBU_PENDING } from "./data/chubu";
import { TOHOKU_PENDING } from "./data/tohoku";
import { findMunicipality, MUNICIPALITIES } from "./municipalities";
import { AREA_LABEL, PREF_NAME_RE, PREF_NAMES, REGION_ORDER, REGIONS, SUPPORTED_BOUNDS, isSupportedPref, regionOfMuni, regionOfPref } from "./regions";

describe("対応している地方と都道府県", () => {
  it("関東1都6県・中部9県・東北6県", () => {
    expect(REGION_ORDER).toEqual(["kanto", "chubu", "tohoku"]);
    expect(Object.keys(REGIONS.kanto.prefs)).toHaveLength(7);
    expect(Object.keys(REGIONS.chubu.prefs)).toHaveLength(9);
    expect(Object.keys(REGIONS.tohoku.prefs)).toHaveLength(6);
    expect(Object.keys(PREF_NAMES)).toHaveLength(22);
    expect(PREF_NAMES["22"]).toBe("静岡県");
    expect(PREF_NAMES["04"]).toBe("宮城県");
    expect(AREA_LABEL).toBe("関東1都6県・中部9県・東北6県");
  });

  it("コードから地方を引く", () => {
    expect(regionOfPref("13")).toBe("kanto");
    expect(regionOfMuni("22101")).toBe("chubu");
    expect(regionOfMuni("04101")).toBe("tohoku");
    expect(regionOfMuni("27127")).toBeUndefined();
    expect(isSupportedPref("23101")).toBe(true);
    expect(isSupportedPref("01100")).toBe(false);
  });

  it("住所の先頭が対応エリアか", () => {
    expect(PREF_NAME_RE.test("静岡県浜松市中央区")).toBe(true);
    expect(PREF_NAME_RE.test("東京都千代田区")).toBe(true);
    expect(PREF_NAME_RE.test("宮城県仙台市青葉区")).toBe(true);
    expect(PREF_NAME_RE.test("大阪府大阪市")).toBe(false);
  });

  it("範囲は関東・中部・東北を含む", () => {
    const [[w, s], [e, n]] = SUPPORTED_BOUNDS;
    expect(w).toBeLessThan(136); // 福井県
    expect(e).toBeGreaterThan(142); // 岩手県の東の端（宮古市 魹ヶ崎 142.07）
    expect(s).toBeLessThan(34.7); // 静岡県
    expect(n).toBeGreaterThan(41.5); // 青森県の北の端（大間町 41.55）
  });
});

describe("中部9県の市町村（9県すべて調べ終えた）", () => {
  const CHUBU = Object.values(REGIONS.chubu.prefs);

  it("中部は316市町村（政令市は区のコードをまとめて1つ）で、調査中は残っていない", () => {
    expect(CHUBU_PENDING).toHaveLength(0);
    const byPref: Record<string, number> = {};
    for (const m of MUNICIPALITIES) if (CHUBU.includes(m.pref)) byPref[m.pref] = (byPref[m.pref] ?? 0) + 1;
    expect(byPref).toEqual({ 静岡県: 35, 山梨県: 27, 長野県: 77, 愛知県: 54, 岐阜県: 42, 新潟県: 30, 富山県: 15, 石川県: 19, 福井県: 17 });
    expect(MUNICIPALITIES.filter((m) => CHUBU.includes(m.pref) && m.coverage === "unknown")).toEqual([]);
    expect(findMunicipality("23101")?.name).toBe("名古屋市");
    expect(findMunicipality("22138")?.name).toBe("浜松市");
    expect(findMunicipality("15108")?.codes).toHaveLength(8);
  });

  it("コードは全体で重複せず、国土地理院の市区町村表にある", () => {
    const seen = new Set<string>();
    for (const m of MUNICIPALITIES) for (const c of m.codes) {
      expect(seen.has(c), `重複 ${c}`).toBe(false);
      seen.add(c);
    }
    const table = Object.assign({}, ...Object.values(GSI_CODES as Record<string, Record<string, string>>)) as Record<string, string>;
    for (const m of MUNICIPALITIES) if (CHUBU.includes(m.pref)) for (const c of m.codes) expect(table[c], `${m.name} ${c}`).toBeDefined();
    // 区のある市は、市そのもののコード（22130 浜松市）を持たない（逆ジオコーダは区のコードを返す）
    expect(table["22130"]).toBeUndefined();
    expect(table["22138"]).toBe("浜松市 中央区");
  });
});

describe("東北6県の市町村（6県すべて調べ終えた）", () => {
  const TOHOKU = Object.values(REGIONS.tohoku.prefs);

  it("東北は227市町村（仙台市は区のコードをまとめて1つ）で、調査中は残っていない", () => {
    expect(TOHOKU_PENDING).toHaveLength(0);
    const byPref: Record<string, number> = {};
    for (const m of MUNICIPALITIES) if (TOHOKU.includes(m.pref)) byPref[m.pref] = (byPref[m.pref] ?? 0) + 1;
    expect(byPref).toEqual({ 青森県: 40, 岩手県: 33, 宮城県: 35, 秋田県: 25, 山形県: 35, 福島県: 59 });
    expect(findMunicipality("04101")?.name).toBe("仙台市");
    expect(findMunicipality("04105")?.codes).toHaveLength(5);
    expect(MUNICIPALITIES.filter((m) => TOHOKU.includes(m.pref) && m.coverage === "unknown")).toEqual([]);
  });

  it("コードは国土地理院の市区町村表にあり、仙台市そのもの（04100）・富谷町の古いコード（04423）は使わない", () => {
    const table = Object.assign({}, ...Object.values(GSI_CODES as Record<string, Record<string, string>>)) as Record<string, string>;
    for (const m of MUNICIPALITIES) if (TOHOKU.includes(m.pref)) for (const c of m.codes) expect(table[c], `${m.name} ${c}`).toBeDefined();
    expect(table["04100"]).toBeUndefined();
    expect(table["04423"]).toBeUndefined();
    expect(table["04216"]).toBe("富谷市");
    expect(table["04101"]).toBe("仙台市 青葉区");
  });
});
