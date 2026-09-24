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
  it("神奈川県の全市町村を網羅している", () => covered("神奈川県"));
});

describe("電話番号の区切り（市外局番の桁数）", () => {
  // 総務省の市外局番表のうち埼玉・千葉で使われるもの。「04」は 04-29xx（所沢・狭山・入間）と 04-7xxx（柏・流山・野田・我孫子・鴨川）だけ
  const AREA: Partial<Record<string, string[]>> = {
    埼玉県: ["04", "042", "048", "0480", "049", "0493", "0494", "0495"],
    千葉県: ["04", "043", "0436", "0438", "0439", "047", "0470", "0475", "0476", "0478", "0479"],
    神奈川県: ["042", "044", "045", "046", "0463", "0465", "0466", "0467"],
    東京都: ["03", "042", "0422", "0428", "04992", "04994", "04996", "04998"],
  };
  const contacts = MUNICIPALITIES.flatMap((m) =>
    [m.contact, ...Object.values(m.contactByCode ?? {})].filter((c) => c?.phone).map((c) => ({ m, phone: c!.phone! })),
  );

  it.each(contacts.map(({ m, phone }) => [`${m.pref}${m.name}`, m.pref, phone] as const))("%s %s %s", (_, pref, phone) => {
    const numbers = phone.match(/[\d-]+-[\d-]+/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) {
      const [area, local, sub] = n.split("-");
      expect(n, "固定電話は 10 桁").toMatch(/^\d+-\d+-\d{4}$/);
      expect(area + local + sub).toHaveLength(10);
      expect(AREA[pref], `${n}: ${pref}の市外局番ではない`).toContain(area);
      // 市外局番＋市内局番はどの地域でも 6 桁（03-xxxx / 047-xxx / 0476-xx）
      expect((area + local).length, `${n}: 市外局番と市内局番の区切り位置が違う`).toBe(6);
      if (area === "04") expect(local[0], `${n}: 04 の後は 2（埼玉）か 7（千葉）`).toBe(pref === "埼玉県" ? "2" : "7");
    }
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
  it("wagmap は世界測地系の座標に gprj=2 を付ける（自治体ごとの測地系の違いを吸収）", () => {
    const [link] = buildLinks(findMunicipality("11202")!, KUMAGAYA_CITY_HALL.lat, KUMAGAYA_CITY_HALL.lng);
    expect(link.url).toBe("https://www2.wagmap.jp/kumagaya/Map?mid=170&mpx=139.388580&mpy=36.147129&mps=1000&gprj=2");
    expect(link.pinpoint).toBe(true);
  });

  it("Sonicweb は世界測地系のまま URL を作る", () => {
    const [link] = buildLinks(findMunicipality("11103")!, 35.904289, 139.624069);
    expect(link.url).toBe("https://www.sonicweb-asp.jp/saitama/map?theme=th_45&pos=139.624069%2C35.904289&scale=1000");
  });

  it("横浜市は iマッピーの建築基準法道路種別レイヤ（mcl）を付けて開く", () => {
    const [link] = buildLinks(findMunicipality("14104")!, 35.450195, 139.634903);
    expect(link.url).toBe(
      "https://wwwm.city.yokohama.lg.jp/yokohama/Map?mid=2&mpx=139.634903&mpy=35.450195&mps=1000&gprj=2&mcl=100%2C70%2C70%2C70",
    );
  });

  it("大和市は machi-info の同意ページに座標を渡す", () => {
    const [link] = buildLinks(findMunicipality("14213")!, 35.487579, 139.458206);
    expect(link.url).toBe("https://www.machi-info.jp/machikado/yamato_city/consentpage/gis-road.html?lon=139.458206&lat=35.487579&scale=1000");
  });

  it("川崎市は区ごとに建築審査課の担当が変わる", () => {
    const m = findMunicipality("14135")!;
    expect(resolveContact(m, "14131")?.phone).toBe("044-200-3016");
    expect(resolveContact(m, "14137")?.phone).toBe("044-200-3045");
  });

  it("Sonicweb は表示レイヤを付けられる（狭山市は道路種別レイヤを最初から表示）", () => {
    const [link] = buildLinks(findMunicipality("11215")!, 35.852903, 139.412314);
    expect(link.url).toBe("https://www.sonicweb-asp.jp/sayama/map?theme=th_3&pos=139.412314%2C35.852903&scale=1000&layers=dm%2Cth_5");
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
