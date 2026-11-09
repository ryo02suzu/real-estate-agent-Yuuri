import { describe, expect, it } from "vitest";
import GSI_CODES from "./data/gsi-muni-codes.json";
import { CHUBU_PENDING } from "./data/chubu";
import { TOHOKU_PENDING } from "./data/tohoku";
import { KINKI_PENDING } from "./data/kinki";
import { findMunicipality, MUNICIPALITIES } from "./municipalities";
import { AREA_LABEL, PREF_NAME_RE, PREF_NAMES, REGION_ORDER, REGIONS, SUPPORTED_BOUNDS, isSupportedPref, regionOfMuni, regionOfPref } from "./regions";

describe("対応している地方と都道府県", () => {
  it("関東1都6県・中部9県・東北6県・近畿2府5県", () => {
    expect(REGION_ORDER).toEqual(["kanto", "chubu", "tohoku", "kinki"]);
    expect(Object.keys(REGIONS.kanto.prefs)).toHaveLength(7);
    expect(Object.keys(REGIONS.chubu.prefs)).toHaveLength(9);
    expect(Object.keys(REGIONS.tohoku.prefs)).toHaveLength(6);
    expect(Object.keys(REGIONS.kinki.prefs)).toHaveLength(7);
    expect(Object.keys(PREF_NAMES)).toHaveLength(29);
    expect(PREF_NAMES["22"]).toBe("静岡県");
    expect(PREF_NAMES["04"]).toBe("宮城県");
    expect(PREF_NAMES["27"]).toBe("大阪府");
    // 都・府・県は名前の最後の字で数える（関東は東京都を含むので「1都6県」、近畿は京都府・大阪府を含むので「2府5県」）
    expect(AREA_LABEL).toBe("関東1都6県・中部9県・東北6県・近畿2府5県");
  });

  it("コードから地方を引く", () => {
    expect(regionOfPref("13")).toBe("kanto");
    expect(regionOfMuni("22101")).toBe("chubu");
    expect(regionOfMuni("04101")).toBe("tohoku");
    expect(regionOfMuni("27127")).toBe("kinki");
    expect(regionOfMuni("34101")).toBeUndefined(); // 広島市（中国地方はまだ）
    expect(isSupportedPref("23101")).toBe(true);
    expect(isSupportedPref("01100")).toBe(false);
  });

  it("住所の先頭が対応エリアか", () => {
    expect(PREF_NAME_RE.test("静岡県浜松市中央区")).toBe(true);
    expect(PREF_NAME_RE.test("東京都千代田区")).toBe(true);
    expect(PREF_NAME_RE.test("宮城県仙台市青葉区")).toBe(true);
    expect(PREF_NAME_RE.test("大阪府大阪市")).toBe(true);
    expect(PREF_NAME_RE.test("広島県広島市")).toBe(false);
  });

  it("範囲は関東・中部・東北・近畿を含む", () => {
    const [[w, s], [e, n]] = SUPPORTED_BOUNDS;
    expect(w).toBeLessThan(134.3); // 兵庫県の西の端（赤穂市・佐用町 134.25 のあたり）
    expect(e).toBeGreaterThan(142); // 岩手県の東の端（宮古市 魹ヶ崎 142.07）
    expect(s).toBeLessThan(33.44); // 和歌山県の南の端（串本町 潮岬 33.43）
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

describe("近畿2府5県の市町村（調査中から始める）", () => {
  const KINKI = Object.values(REGIONS.kinki.prefs);

  it("近畿は227市町村（京都市・大阪市・堺市・神戸市は区のコードをまとめて1つ）", () => {
    const byPref: Record<string, number> = {};
    for (const m of MUNICIPALITIES) if (KINKI.includes(m.pref)) byPref[m.pref] = (byPref[m.pref] ?? 0) + 1;
    expect(byPref).toEqual({ 三重県: 29, 滋賀県: 19, 京都府: 26, 大阪府: 43, 兵庫県: 41, 奈良県: 39, 和歌山県: 30 });
    expect(findMunicipality("26104")?.name).toBe("京都市");
    expect(findMunicipality("26104")?.codes).toHaveLength(11);
    expect(findMunicipality("27127")?.codes).toHaveLength(24);
    expect(findMunicipality("27141")?.name).toBe("堺市");
    expect(findMunicipality("28110")?.codes).toHaveLength(9);
    // 調べ終えていない市町村は、調査中（道路図は府県か市の建築指導課へ）
    for (const m of KINKI_PENDING) expect(m.coverage).toBe("unknown");
  });

  it("コードは国土地理院の市区町村表にあり、政令市そのもののコード（26100・27100・27140・28100）は使わない", () => {
    const table = Object.assign({}, ...Object.values(GSI_CODES as Record<string, Record<string, string>>)) as Record<string, string>;
    for (const m of MUNICIPALITIES) if (KINKI.includes(m.pref)) for (const c of m.codes) expect(table[c], `${m.name} ${c}`).toBeDefined();
    for (const c of ["26100", "27100", "27140", "28100"]) expect(table[c]).toBeUndefined();
    expect(table["27127"]).toBe("大阪市 北区");
    expect(table["28221"]).toBe("丹波篠山市");
  });
});
