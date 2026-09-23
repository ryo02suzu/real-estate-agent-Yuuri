import { afterEach, describe, expect, it, vi } from "vitest";
import { wgs84ToTokyo } from "./datum";
import { MUNICIPALITIES, buildLinks, findMunicipality, lookup } from "./index";

// 熊谷市役所（宮町二丁目47）。国土地理院の座標と、wagmap で市役所が中心に来た旧測地系座標
const KUMAGAYA_CITY_HALL = { lat: 36.147129, lng: 139.38858 };
const KUMAGAYA_CITY_HALL_TOKYO = { lat: 36.143959, lng: 139.39178 };

describe("wgs84ToTokyo", () => {
  it("熊谷市役所で実測と一致する", () => {
    const t = wgs84ToTokyo(KUMAGAYA_CITY_HALL.lat, KUMAGAYA_CITY_HALL.lng);
    expect(t.lat).toBeCloseTo(KUMAGAYA_CITY_HALL_TOKYO.lat, 5);
    expect(t.lng).toBeCloseTo(KUMAGAYA_CITY_HALL_TOKYO.lng, 5);
  });
});

describe("MUNICIPALITIES", () => {
  it("市区町村コードが重複していない", () => {
    const codes = MUNICIPALITIES.flatMap((m) => m.codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("どの地図リンクも URL を作れる", () => {
    for (const m of MUNICIPALITIES) {
      for (const link of m.maps) {
        expect(link.build !== null || typeof link.url === "string", `${m.name} ${link.label}`).toBe(true);
      }
    }
  });

  it("ネットで分からない市には問い合わせ先がある", () => {
    for (const m of MUNICIPALITIES.filter((m) => m.coverage === "none")) {
      expect(m.contact, m.name).toBeDefined();
    }
  });
});

describe("buildLinks", () => {
  it("wagmap は旧測地系の座標で URL を作る", () => {
    const [link] = buildLinks(findMunicipality("11202")!, KUMAGAYA_CITY_HALL.lat, KUMAGAYA_CITY_HALL.lng);
    expect(link.url).toBe("https://www2.wagmap.jp/kumagaya/Map?mid=170&mpx=139.391780&mpy=36.143959&mps=1000");
    expect(link.pinpoint).toBe(true);
  });

  it("wagmap でも世界測地系の自治体（朝霞）は変換しない", () => {
    // 朝霞市役所（本町一丁目1）。変換なしで市役所が中心に来ることを実測済み
    const [link] = buildLinks(findMunicipality("11227")!, 35.796852, 139.593796);
    expect(link.url).toBe("https://www2.wagmap.jp/asaka/Map?mid=120&mpx=139.593796&mpy=35.796852&mps=1000");
  });

  it("Sonicweb は世界測地系のまま URL を作る", () => {
    const [link] = buildLinks(findMunicipality("11103")!, 35.904289, 139.624069);
    expect(link.url).toBe("https://www.sonicweb-asp.jp/saitama/map?theme=th_45&pos=139.624069%2C35.904289&scale=1000");
  });

  it("座標で開けない地図は入口の URL を返す", () => {
    const [link] = buildLinks(findMunicipality("11208")!, 35.8, 139.47);
    expect(link.pinpoint).toBe(false);
    expect(link.url).toContain("tokorozawa");
  });
});

describe("lookup", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = (geo: unknown, rev: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (url.includes("AddressSearch") ? geo : rev),
      })),
    );

  it("住所が見つからなければ not_found", async () => {
    stubFetch([], {});
    expect(await lookup("存在しない住所")).toEqual({ status: "not_found" });
  });

  it("未対応の市町村なら unsupported", async () => {
    stubFetch(
      [{ geometry: { coordinates: [139.08, 35.99] }, properties: { title: "埼玉県秩父市熊木町" } }],
      { results: { muniCd: "11207", lv01Nm: "熊木町" } },
    );
    const r = await lookup("埼玉県秩父市熊木町8-15");
    expect(r.status).toBe("unsupported");
  });

  it("対応済みの市なら地図リンクと問い合わせ先を返す", async () => {
    stubFetch(
      [{ geometry: { coordinates: [KUMAGAYA_CITY_HALL.lng, KUMAGAYA_CITY_HALL.lat] }, properties: { title: "埼玉県熊谷市宮町二丁目４７番地" } }],
      { results: { muniCd: "11202", lv01Nm: "宮町二丁目" } },
    );
    const r = await lookup("埼玉県熊谷市宮町二丁目47");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.municipality.name).toBe("熊谷市");
    expect(r.town).toBe("宮町二丁目");
    expect(r.links[0].url).toContain("mpx=139.391780");
  });

  it("API がエラーなら例外を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(lookup("埼玉県熊谷市")).rejects.toThrow("503");
  });
});
