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
  it("東京都の全区市町村を網羅している", () => covered("東京都"));
  it("群馬県の全市町村を網羅している", () => covered("群馬県"));
  it("栃木県の全市町を網羅している", () => covered("栃木県"));
  it("茨城県の全市町村を網羅している", () => covered("茨城県"));
});

describe("電話番号の区切り（市外局番の桁数）", () => {
  // 総務省の市外局番表のうち埼玉・千葉で使われるもの。「04」は 04-29xx（所沢・狭山・入間）と 04-7xxx（柏・流山・野田・我孫子・鴨川）だけ
  const AREA: Partial<Record<string, string[]>> = {
    埼玉県: ["04", "042", "048", "0480", "049", "0493", "0494", "0495"],
    千葉県: ["04", "043", "0436", "0438", "0439", "047", "0470", "0475", "0476", "0478", "0479"],
    神奈川県: ["042", "044", "045", "046", "0463", "0465", "0466", "0467"],
    東京都: ["03", "042", "0422", "0428", "04992", "04994", "04996", "04998"],
    群馬県: ["027", "0270", "0274", "0276", "0277", "0278", "0279"],
    栃木県: ["028", "0282", "0283", "0284", "0285", "0287", "0288", "0289"],
    茨城県: ["029", "0280", "0291", "0293", "0294", "0296", "0297", "0299"],
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

  it("さいたま市の道路種別は窓口のみ（電話の発信ボタンを出さない）", () => {
    const m = findMunicipality("11103")!;
    expect(resolveContact(m, "11103")).toMatchObject({ phone: "048-646-3237", noPhoneInquiry: true });
    expect(resolveContact(m, "11107")).toMatchObject({ phone: "048-840-6237", noPhoneInquiry: true });
  });
});

describe("都市計画区域外（国交省 令和6年都市計画現況調査の都市別一覧に無い市町村）", () => {
  // 千葉6・東京5・群馬7・埼玉1。いずれも区域外に接道を求める条例（建築基準法68条の9）の適用も無い
  const OUTSIDE = {
    "12234": "南房総市", "12463": "鋸南町", "12342": "神崎町", "12422": "睦沢町", "12426": "長柄町", "12441": "大多喜町",
    "13307": "檜原村", "13308": "奥多摩町", "13362": "利島村", "13382": "御蔵島村", "13402": "青ヶ島村",
    "10366": "上野村", "10367": "神流町", "10383": "南牧村", "10428": "高山村", "10443": "片品村", "10444": "川場村", "10448": "昭和村",
    "11369": "東秩父村",
  };

  it("区域外の町村は「都市計画区域外」で、道路種別の地図を出さない", () => {
    for (const [code, name] of Object.entries(OUTSIDE)) {
      const m = findMunicipality(code)!;
      expect(m.name).toBe(name);
      expect(m.coverage, name).toBe("outside");
      expect(m.maps.filter((l) => l.kind !== "public_road"), name).toEqual([]);
    }
  });

  it("区域外でも条例で接道義務がかかる町村（長瀞町・清川村・嬬恋村）は区域外にしない", () => {
    for (const code of ["11363", "14402", "10425"]) {
      const m = findMunicipality(code)!;
      expect(m.coverage, m.name).not.toBe("outside");
      expect(m.note, m.name).toContain("都市計画区域外");
    }
  });
});

describe("buildLinks", () => {
  it("wagmap は世界測地系の座標に gprj=2 を付ける（自治体ごとの測地系の違いを吸収）", () => {
    const [link] = buildLinks(findMunicipality("11202")!, KUMAGAYA_CITY_HALL.lat, KUMAGAYA_CITY_HALL.lng);
    expect(link.url).toBe("https://www2.wagmap.jp/kumagaya/Map?mid=170&mpx=139.388580&mpy=36.147129&mps=1000&gprj=2");
    expect(link.pinpoint).toBe(true);
  });

  it("つくば市の認定道路マップ（ArcGIS Experience）は地図ウィジェットの中心を指定して開く", () => {
    const [link] = buildLinks(findMunicipality("08220")!, 36.083321, 140.076492);
    expect(link.url).toBe(
      "https://experience.arcgis.com/experience/1644185d62274db8aae9dca9574337ac/#widget_124=center:140.076492%2C36.083321%2C4326,scale:2500",
    );
  });

  it("千代田区は区のアプリと同じ公開 Web マップを Map Viewer で開き、物件にピンを立てる", () => {
    const [link] = buildLinks(findMunicipality("13101")!, 35.694003, 139.753594);
    expect(link.url).toBe(
      "https://tokei-gis2.chiyodatoshikei.jp/toshikei/apps/mapviewer/index.html?webmap=50d1206ec8bb4d43bf915ce299485351&center=139.753594,35.694003&scale=2500&marker=139.753594,35.694003",
    );
    expect(link.pinpoint).toBe(true);
  });

  it("渋川市は位置指定道路と市道の路線網を、しぶかわ情報マップで物件の位置に開く", () => {
    const links = buildLinks(findMunicipality("10208")!, 36.489445, 139.000565);
    expect(links.map((l) => l.url.match(/mid=(\d+)/)?.[1])).toEqual(["175", "155", "421"]);
    expect(links.every((l) => l.pinpoint)).toBe(true);
  });

  it("宇都宮市の地図（machi-info 旧版）は日本測地系に換算した座標で開く", () => {
    const [road, rosen] = buildLinks(findMunicipality("09201")!, 36.555946, 139.882828);
    // 宇都宮市役所（旭1-1-5）。世界測地系のまま渡すと北西に約450mずれた西1丁目が開く
    expect(road.url).toBe(
      "https://www.machi-info.jp/machikado/utsunomiya_city/city_road/gis-road.html?mode=36&lon=139.886087&lat=36.552811&scale=2500",
    );
    expect(rosen.url).toContain("rosen.html?mode=54&lon=139.886087&lat=36.552811");
  });

  it("高崎市はまっぷdeたかさきの指定道路情報マップ（1項4号・5号）を物件の位置で開く", () => {
    const m = findMunicipality("10202")!;
    expect(m.coverage).toBe("partial");
    const [link] = buildLinks(m, 36.321316, 139.003265);
    expect(link.url).toBe("https://www.sonicweb-asp.jp/takasaki2/map?theme=th_57&pos=139.003265%2C36.321316&scale=1000");
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

  it("ArcGIS Experience Builder は「/#」の後に center の区切りを %2C で渡す（埼玉県の町の地図）", () => {
    const [link] = buildLinks(findMunicipality("11408")!, 36.118332, 139.193054); // 寄居町
    expect(link.url).toBe(
      "https://experience.arcgis.com/experience/a810ee78463c4ba9b5cbcbd3fe680416/#widget_34=center:139.193054%2C36.118332%2C4326,scale:2500",
    );
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

  it("座標で開けない地図は入口の URL を返す（千葉県の指定道路情報地図）", () => {
    const [link] = buildLinks(findMunicipality("12236")!, 35.897, 140.499); // 香取市
    expect(link.pinpoint).toBe(false);
    expect(link.url).toBe("https://ds.icba-info.jp/siteidouro/chiba/pref/");
    expect(link.tip).toContain("住所コピー");
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
      [{ geometry: { coordinates: [138.568449, 35.662257] }, properties: { title: "山梨県甲府市丸の内一丁目" } }],
      { results: { muniCd: "19201", lv01Nm: "丸の内一丁目" } },
    );
    const r = await lookup("山梨県甲府市丸の内1-18-1");
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

  it("都道府県なしで全国に同名の場所があれば、候補から選ばせる", async () => {
    stubFetch(
      [
        { geometry: { coordinates: [141.1, 43.0] }, properties: { title: "北海道七飯町本町一丁目１番" } },
        { geometry: { coordinates: [139.63, 35.45] }, properties: { title: "神奈川県横浜市中区本町一丁目１番" } },
      ],
      {},
    );
    const r = await lookup("本町1-1");
    expect(r.status).toBe("choose");
    if (r.status !== "choose") return;
    // 関東の候補を先に並べる
    expect(r.candidates[0].matchedAddress).toContain("横浜市");
  });

  it("番地を入れたのに町までしか一致しなければ approximate", async () => {
    stubFetch(
      [{ geometry: { coordinates: [139.38, 36.18] }, properties: { title: "埼玉県熊谷市三ケ尻" } }],
      { results: { muniCd: "11202", lv01Nm: "三ケ尻" } },
    );
    const r = await lookup("埼玉県熊谷市大字三ケ尻9999番");
    expect(r.status === "ok" && r.approximate).toBe(true);
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

describe("分割図（PDF）の市", () => {
  it("桐生市役所は K023R と L023L の境目にあるので、隣の図も出す", () => {
    const [link] = buildLinks(findMunicipality("10203")!, 36.405319, 139.330597);
    expect([link.sheet?.label, link.sheet?.neighbor?.label].sort()).toEqual(["K023R", "L023L"]);
    expect(link.url).toMatch(/(k023r|l023l)\.pdf$/);
  });

  it("索引図の区域の外なら一覧ページを開く", () => {
    const [link] = buildLinks(findMunicipality("10203")!, 36.7, 139.1);
    expect(link.sheet).toBeUndefined();
    expect(link.url).toContain("1013857/index.html");
  });
});

describe("港区の分割図", () => {
  it("六本木6-10-1（六本木ヒルズ）は 28 番の図", () => {
    const [link] = buildLinks(findMunicipality("13103")!, 35.660464, 139.729249);
    expect(link.sheet?.label).toBe("28");
    expect(link.url).toMatch(/_?28\.pdf$/);
  });
});

describe("北区の分割図", () => {
  it("北区役所（王子本町1-15-22）は 152 番の図（10枚綴りのPDFのページ指定つき）", () => {
    const [link] = buildLinks(findMunicipality("13117")!, 35.752802, 139.733743);
    expect(link.sheet?.label).toBe("152");
    expect(link.url).toMatch(/151-160\.pdf#page=2$/);
  });
});

describe("佐倉市の分割図", () => {
  it("海隣寺町（佐倉城址の東）は D5 の図", () => {
    const [link] = buildLinks(findMunicipality("12212")!, 35.72374, 140.22406);
    expect(link.sheet?.label).toBe("D5");
  });
});

describe("みどり市の分割図", () => {
  it("笠懸町鹿の図 135 の中心は 135 番", () => {
    const [cityMap] = buildLinks(findMunicipality("10212")!, 36.391248, 139.274078);
    expect(cityMap.sheet?.label).toBe("135");
  });
});

describe("八千代市の分割図", () => {
  it("八千代市役所（大和田新田）は No.19 の図", () => {
    const [link] = buildLinks(findMunicipality("12221")!, 35.7224, 140.0997);
    expect(link.sheet?.label).toBe("No.19");
    expect(link.url).toMatch(/46100\.pdf$/);
  });
});

describe("安中市の分割図", () => {
  it("安中市役所は 46 番の図", () => {
    const [link] = buildLinks(findMunicipality("10211")!, 36.326653, 138.88797);
    expect(link.sheet?.label).toBe("46");
  });
});

describe("藤岡市の分割図", () => {
  it("藤岡市役所（中栗須327）は No.11 の図", () => {
    const [link] = buildLinks(findMunicipality("10209")!, 36.258377, 139.074493);
    expect(link.sheet?.label).toBe("No.11");
  });

  it("鬼石の中心部は No.34 の図", () => {
    const [link] = buildLinks(findMunicipality("10209")!, 36.1545, 139.0585);
    expect(link.sheet?.label).toBe("No.34");
  });
});

describe("沼田市の分割図", () => {
  it("沼田市役所（下之町888）は 9 番の図", () => {
    const [link] = buildLinks(findMunicipality("10206")!, 36.644066, 139.043106);
    expect(link.sheet?.label).toBe("9");
    expect(link.url).toMatch(/826\/9\.pdf$/);
  });
});

describe("鹿沼市の分割図", () => {
  it("鹿沼市役所（今宮町1688-1）は 18 番の図", () => {
    const [link] = buildLinks(findMunicipality("09205")!, 36.566959, 139.743912);
    expect(link.sheet?.label).toBe("18");
    expect(link.url).toMatch(/shiteidourozu\/18\.pdf$/);
  });
});

describe("富岡市の分割図", () => {
  it("富岡市役所（富岡1460-1）は No.20 の図", () => {
    const [link] = buildLinks(findMunicipality("10210")!, 36.25943, 138.889542);
    expect(link.sheet?.label).toBe("No.20");
    expect(link.url).toMatch(/files\/20\.pdf$/);
  });
});

describe("富士見市の分割図", () => {
  it("富士見市役所（鶴馬1800-1）は 06 の図", () => {
    const [link] = buildLinks(findMunicipality("11235")!, 35.856644, 139.549149);
    expect(link.sheet?.label).toBe("06");
  });
});

describe("新座市・所沢市", () => {
  it("新座市はにいざマップの建築基準法指定道路図（全種別）を物件の位置で開く", () => {
    const m = findMunicipality("11230")!;
    expect(m.coverage).toBe("full");
    const [link] = buildLinks(m, 35.79324, 139.56575);
    expect(link.url).toBe("https://www2.wagmap.jp/niiza/Map?mid=25&mpx=139.565750&mpy=35.793240&mps=1000&gprj=2");
  });

  it("所沢市の認定路線網図は alandis の座標指定で 1/2500 で開く", () => {
    const [link] = buildLinks(findMunicipality("11208")!, 35.799072, 139.467957);
    expect(link.url).toMatch(/^https:\/\/webgis\.alandis\.jp\/tokorozawa11\/alandis\/webgis\/index\.php\/autologin_jswebgis\?ap=jsWebGIS&m=2&u=guest&x=15525501\.\d{3}&y=4273009\.\d{3}&s=2500&rs=3857&li=3&si=0$/);
    expect(link.pinpoint).toBe(true);
  });
});

describe("行田市", () => {
  it("建築基準法道路マップ（全種別）と道路台帳マップを物件の位置で開き、道路種別は窓口のみと示す", () => {
    const m = findMunicipality("11206")!;
    expect(m.coverage).toBe("full");
    const [road, daicho] = buildLinks(m, 36.138775, 139.455521);
    expect(road.url).toBe(
      "https://experience.arcgis.com/experience/6c4876ec5f2f415c81f100bdc02a5b2f/#widget_124=center:139.455521%2C36.138775%2C4326,scale:2500",
    );
    expect(daicho.url).toContain("/experience/e762b56d64564657894f2a0e52c0f719/#widget_124=center:139.455521%2C36.138775");
    expect([road.pinpoint, daicho.pinpoint]).toEqual([true, true]);
    expect(m.contact?.noPhoneInquiry).toBe(true);
  });
});

describe("図の範囲（図と同じ範囲の地図を描くため）", () => {
  it("物件は図の範囲の中にあり、港区の図は約750m×500m", () => {
    const lat = 35.660464;
    const lng = 139.729249;
    const [link] = buildLinks(findMunicipality("13103")!, lat, lng);
    const [n, w, s, e] = link.sheet!.bounds;
    expect(lat).toBeLessThanOrEqual(n);
    expect(lat).toBeGreaterThanOrEqual(s);
    expect(lng).toBeGreaterThanOrEqual(w);
    expect(lng).toBeLessThanOrEqual(e);
    expect((e - w) * 111320 * Math.cos((lat * Math.PI) / 180)).toBeCloseTo(750, -2);
    expect((n - s) * 110960).toBeCloseTo(500, -2);
  });

  it("索引図の座標で持つ桐生市でも、範囲が物件を囲む", () => {
    const [link] = buildLinks(findMunicipality("10203")!, 36.405319, 139.330597);
    const [n, w, s, e] = link.sheet!.bounds;
    expect(n).toBeGreaterThan(36.405319);
    expect(s).toBeLessThan(36.405319);
    expect(w).toBeLessThan(139.330597);
    expect(e).toBeGreaterThan(139.330597);
  });
});

describe("志木市の分割図", () => {
  it("志木市役所（中宗岡1-1-1）は 6 番の図（白図ベース）で、上端に近いので 3 番も出す", () => {
    const [link] = buildLinks(findMunicipality("11228")!, 35.836521, 139.580322);
    expect(link.sheet?.label).toBe("6");
    expect(link.url).toMatch(/10253\.pdf$/);
    expect(link.sheet?.neighbor?.label).toBe("3");
  });
});

describe("草加市の道路台帳図（1/500 図郭）", () => {
  it("草加市役所（高砂1-1-1）は 13-24、獨協大学前駅は 10-13、新田駅前は 06-22 の図", () => {
    const m = findMunicipality("11221")!;
    expect(buildLinks(m, 35.825054, 139.805649)[0].sheet?.label).toBe("13-24");
    const [dokkyo] = buildLinks(m, 35.843204, 139.800823);
    expect(dokkyo.sheet?.label).toBe("10-13");
    expect(dokkyo.url).toBe("https://www.city.soka.saitama.jp/cont/s1901/daicho/pdf/10-13.pdf");
    // 駅は図の下端から約5mなので、下の図も出す
    expect(dokkyo.sheet?.neighbor?.label).toBe("10-18");
    expect(buildLinks(m, 35.8539, 139.796219)[0].sheet?.label).toBe("06-22");
  });

  it("北西の端の 01 は図郭が東に3枚ずれている（01-23 の真下が 05-01）", () => {
    const m = findMunicipality("11221")!;
    const cell = (label: string) => (m.maps[0].sheets!.cells.find((c) => c[0] === label) as number[]).slice(2);
    const [x1, y1] = cell("01-23");
    const [x2, y2, , h] = cell("05-01");
    expect(Math.abs(x1 - x2)).toBeLessThan(1e-5);
    expect(y2 - y1).toBeCloseTo(h, 5);
  });
});

describe("和光市の分割図", () => {
  it("広沢1-5（市役所付近）は 35R の図（町名番地索引の和29・30・35・36の1つ）", () => {
    const [link] = buildLinks(findMunicipality("11229")!, 35.779507, 139.604248);
    expect(link.sheet?.label).toBe("35R");
  });

  it("和光市駅前は 25R の図", () => {
    const [link] = buildLinks(findMunicipality("11229")!, 35.7878, 139.6125);
    expect(link.sheet?.label).toBe("25R");
  });
});

describe("四街道市の指定道路図（地図システムで図を開く）", () => {
  it("市役所付近は図面 13-1。地図はその図の中心で開き、図面番号の手順を出す", () => {
    const [link] = buildLinks(findMunicipality("12228")!, 35.6697, 140.1679);
    expect(link.sheet?.label).toBe("13-1");
    expect(link.url).toContain("yotsukaido12/webgis181/index.php/autologin_jswebgis");
    expect(link.sheet?.howto).toContain("13-1.pdf");
  });
});

describe("日光市の指定道路図（画像）", () => {
  it("市役所（今市本町1）は 図面10。図の端なので隣の 図面9 も出す", () => {
    const [link] = buildLinks(findMunicipality("09206")!, 36.719971, 139.698029);
    expect(link.sheet?.label).toBe("図面10");
    expect(link.url).toMatch(/36\/10\.png$/);
    expect(link.sheet?.neighbor?.label).toBe("図面9");
  });

  it("湯元は 図面3", () => {
    const [link] = buildLinks(findMunicipality("09206")!, 36.812618, 139.42041);
    expect(link.sheet?.label).toBe("図面3");
  });

  it("図の無い足尾は一覧ページを開く", () => {
    const [link] = buildLinks(findMunicipality("09206")!, 36.645, 139.45);
    expect(link.sheet).toBeUndefined();
    expect(link.url).toContain("8377.html");
    expect(link.tip).toContain("問い合わせ先");
  });
});

describe("日光市の図の境目", () => {
  it("東照宮（山内2301）は図面5と6の境目。どちらかを開き、隣の図も出す", () => {
    const [link] = buildLinks(findMunicipality("09206")!, 36.759941, 139.597214);
    expect(["図面5", "図面6"]).toContain(link.sheet?.label);
    expect(link.sheet?.neighbor).toBeDefined();
  });
});
