import { afterEach, describe, expect, it, vi } from "vitest";
import GSI_CODES from "./data/gsi-muni-codes.json";
import { MUNICIPALITIES, buildLinks, findMunicipality, lookup, resolveContact } from "./index";

// 熊谷市役所（宮町二丁目47）の国土地理院の座標
const KUMAGAYA_CITY_HALL = { lat: 36.147129, lng: 139.38858 };

describe("カバー率（国土地理院の市区町村コード表と照合）", () => {
  const covered = (pref: keyof typeof GSI_CODES) => {
    for (const [code, gsiName] of Object.entries(GSI_CODES[pref])) {
      const m = findMunicipality(code);
      expect(m, `${gsiName}(${code}) が未登録`).toBeDefined();
      // 政令市の区は「さいたま市 大宮区」のように市名で始まる
      expect(gsiName.startsWith(m!.name), `${code}: ${gsiName} に ${m!.name} が割り当てられている`).toBe(true);
      expect(m!.pref).toBe(pref);
    }
    const known = new Set(Object.keys(GSI_CODES[pref]));
    for (const m of MUNICIPALITIES.filter((m) => m.pref === pref)) {
      for (const c of m.codes) expect(known.has(c), `${m.name} のコード ${c} は国土地理院の表に無い`).toBe(true);
    }
  };

  it("埼玉県の全市町村を網羅している", () => covered("埼玉県"));
  it("千葉県の全市町村を網羅している", () => covered("千葉県"));
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

  it("すべての市町村（政令市は全区）に問い合わせ先がある", () => {
    for (const m of MUNICIPALITIES) {
      for (const c of m.codes) expect(resolveContact(m, c), `${m.name}(${c})`).toBeDefined();
    }
  });

  it("さいたま市は区ごとに北部／南部建設事務所へ振り分ける", () => {
    const m = findMunicipality("11103")!; // 大宮区
    expect(resolveContact(m, "11103")!.dept).toContain("北部");
    expect(resolveContact(m, "11107")!.dept).toContain("南部"); // 浦和区
  });
});

describe("buildLinks", () => {
  it("wagmap は世界測地系の座標に gprj=3 を付ける（自治体ごとの測地系の違いを吸収）", () => {
    const [link] = buildLinks(findMunicipality("11202")!, KUMAGAYA_CITY_HALL.lat, KUMAGAYA_CITY_HALL.lng);
    expect(link.url).toBe("https://www2.wagmap.jp/kumagaya/Map?mid=170&mpx=139.388580&mpy=36.147129&mps=1000&gprj=3");
    expect(link.pinpoint).toBe(true);
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
      [{ geometry: { coordinates: [139.7528, 35.694] }, properties: { title: "東京都千代田区九段南一丁目" } }],
      { results: { muniCd: "13101", lv01Nm: "九段南一丁目" } },
    );
    const r = await lookup("東京都千代田区九段南1-2-1");
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
    expect(r.links[0].url).toContain("mpx=139.388580");
  });

  it("API がエラーなら例外を投げる", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(lookup("埼玉県熊谷市")).rejects.toThrow("503");
  });
});

describe("vendors", () => {
  it("alandis は Webメルカトルのメートル座標で URL を作る", async () => {
    const { alandis } = await import("./vendors");
    // 飯能市役所。地図の地図URL機能が出す値と一致することを実測済み
    expect(alandis("https://webgis.alandis.jp/hanno11/210/webgis", "shitei")(35.857018, 139.327576)).toBe(
      "https://webgis.alandis.jp/hanno11/210/webgis/index.php/autologin_jswebgis?ap=jsWebGIS&m=2&u=shitei&x=15509874.814&y=4280965.063&s=1000&rs=3857",
    );
  });

  it("open-map はレイヤ名を URL エンコードして hash に入れる", async () => {
    const { openMap } = await import("./vendors");
    expect(openMap("saitama-yashio", "建築基準法道路種別")(35.822598, 139.839203)).toBe(
      "https://open-map.jp/saitama-yashio/index.html#lat=35.822598&lng=139.839203&z=18&layers=%E5%BB%BA%E7%AF%89%E5%9F%BA%E6%BA%96%E6%B3%95%E9%81%93%E8%B7%AF%E7%A8%AE%E5%88%A5",
    );
  });
});
