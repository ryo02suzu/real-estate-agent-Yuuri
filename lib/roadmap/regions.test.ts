import { describe, expect, it } from "vitest";
import GSI_CODES from "./data/gsi-muni-codes.json";
import { CHUBU_PENDING } from "./data/chubu";
import { findMunicipality, MUNICIPALITIES } from "./municipalities";
import { AREA_LABEL, PREF_NAME_RE, PREF_NAMES, REGION_ORDER, REGIONS, SUPPORTED_BOUNDS, isSupportedPref, regionOfMuni, regionOfPref } from "./regions";

describe("対応している地方と都道府県", () => {
  it("関東1都6県と中部9県", () => {
    expect(REGION_ORDER).toEqual(["kanto", "chubu"]);
    expect(Object.keys(REGIONS.kanto.prefs)).toHaveLength(7);
    expect(Object.keys(REGIONS.chubu.prefs)).toHaveLength(9);
    expect(Object.keys(PREF_NAMES)).toHaveLength(16);
    expect(PREF_NAMES["22"]).toBe("静岡県");
    expect(AREA_LABEL).toBe("関東7都県・中部9県");
  });

  it("コードから地方を引く", () => {
    expect(regionOfPref("13")).toBe("kanto");
    expect(regionOfMuni("22101")).toBe("chubu");
    expect(regionOfMuni("27127")).toBeUndefined();
    expect(isSupportedPref("23101")).toBe(true);
    expect(isSupportedPref("01100")).toBe(false);
  });

  it("住所の先頭が対応エリアか", () => {
    expect(PREF_NAME_RE.test("静岡県浜松市中央区")).toBe(true);
    expect(PREF_NAME_RE.test("東京都千代田区")).toBe(true);
    expect(PREF_NAME_RE.test("大阪府大阪市")).toBe(false);
  });

  it("範囲は関東と中部を含む", () => {
    const [[w, s], [e, n]] = SUPPORTED_BOUNDS;
    expect(w).toBeLessThan(136); // 福井県
    expect(e).toBeGreaterThan(140.5); // 千葉県
    expect(s).toBeLessThan(34.7); // 静岡県
    expect(n).toBeGreaterThan(38.4); // 新潟県
  });
});

describe("中部9県の市町村（静岡県・山梨県・長野県・愛知県以外は調査中）", () => {
  it("調査中は123市町村。政令市は区のコードをまとめて1つ", () => {
    expect(CHUBU_PENDING).toHaveLength(123);
    const byPref: Record<string, number> = {};
    for (const m of CHUBU_PENDING) byPref[m.pref] = (byPref[m.pref] ?? 0) + 1;
    expect(byPref).toEqual({ 新潟県: 30, 富山県: 15, 石川県: 19, 福井県: 17, 岐阜県: 42 });
    expect(findMunicipality("23101")?.name).toBe("名古屋市");
    expect(findMunicipality("22138")?.name).toBe("浜松市"); // 静岡県は調査済み（data/shizuoka.ts）
    expect(findMunicipality("15108")?.codes).toHaveLength(8);
    expect(CHUBU_PENDING.every((m) => m.coverage === "unknown" && m.maps.length === 0)).toBe(true);
  });

  it("コードは全体で重複せず、国土地理院の市区町村表にある", () => {
    const seen = new Set<string>();
    for (const m of MUNICIPALITIES) for (const c of m.codes) {
      expect(seen.has(c), `重複 ${c}`).toBe(false);
      seen.add(c);
    }
    const table = Object.assign({}, ...Object.values(GSI_CODES as Record<string, Record<string, string>>)) as Record<string, string>;
    for (const m of CHUBU_PENDING) for (const c of m.codes) expect(table[c], `${m.name} ${c}`).toBeDefined();
    // 区のある市は、市そのもののコード（22130 浜松市）を持たない（逆ジオコーダは区のコードを返す）
    expect(table["22130"]).toBeUndefined();
    expect(table["22138"]).toBe("浜松市 中央区");
  });
});
