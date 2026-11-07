import { afterEach, describe, expect, it, vi } from "vitest";
import GSI_CODES from "./data/gsi-muni-codes.json";
import { GeocoderUnavailable, MUNICIPALITIES, buildLinks, findMunicipality, lookup, lookupPoint, muniName, resolveContact } from "./index";

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
  it("静岡県の全市町を網羅している", () => covered("静岡県"));
  it("山梨県の全市町村を網羅している", () => covered("山梨県"));
  it("長野県の全市町村を網羅している", () => covered("長野県"));
  it("愛知県の全市町村を網羅している", () => covered("愛知県"));
  it("岐阜県の全市町村を網羅している", () => covered("岐阜県"));
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
    静岡県: ["053", "0537", "0538", "0539", "054", "0544", "0545", "0547", "0548", "055", "0550", "0557", "0558"],
    山梨県: ["055", "0551", "0553", "0554", "0555", "0556"],
    長野県: ["026", "0260", "0261", "0263", "0264", "0265", "0266", "0267", "0268", "0269"],
    愛知県: ["052", "0531", "0532", "0533", "0536", "0561", "0562", "0563", "0564", "0565", "0566", "0567", "0568", "0569", "0586", "0587"],
    岐阜県: ["058", "0572", "0573", "0574", "0575", "0576", "0577", "05769", "0581", "0584", "0585"],
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

  it("すべての市町村（政令市は全区）に問い合わせ先がある（道路図が調査中の市町村は地図も問い合わせ先もまだ無い）", () => {
    for (const m of MUNICIPALITIES) {
      if (m.coverage === "unknown") {
        expect(m.maps, m.name).toEqual([]);
        continue;
      }
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
  // 千葉6・東京5・群馬7・埼玉1。いずれも区域外に接道を求める条例（建築基準法68条の9）の適用も無い。
  // 静岡3は県「静岡県の土地利用」の市町別都市計画区域面積（令和4年3月31日現在）で区域が無い町。
  // 山梨7は県の都市計画区域マスタープラン（12区域）の市町村に無い市町村。
  // 長野33は県「長野県の都市計画 資料編」（2025年3月31日現在）の都市計画決定事項一覧表（39区域・44市町村）に無い町村。
  // 愛知3は県の6都市計画区域（51市町村）に無い北設楽郡の町村
  const OUTSIDE = {
    "12234": "南房総市", "12463": "鋸南町", "12342": "神崎町", "12422": "睦沢町", "12426": "長柄町", "12441": "大多喜町",
    "13307": "檜原村", "13308": "奥多摩町", "13362": "利島村", "13382": "御蔵島村", "13402": "青ヶ島村",
    "10366": "上野村", "10367": "神流町", "10383": "南牧村", "10428": "高山村", "10443": "片品村", "10444": "川場村", "10448": "昭和村",
    "11369": "東秩父村",
    "22305": "松崎町", "22306": "西伊豆町", "22429": "川根本町",
    "19209": "北杜市", "19364": "早川町", "19366": "南部町", "19422": "道志村", "19429": "鳴沢村", "19442": "小菅村", "19443": "丹波山村",
    "20304": "川上村", "20305": "南牧村", "20306": "南相木村", "20307": "北相木村", "20324": "立科町", "20349": "青木村", "20350": "長和町", "20363": "原村",
    "20404": "阿南町", "20407": "阿智村", "20409": "平谷村", "20410": "根羽村", "20411": "下條村", "20412": "売木村", "20413": "天龍村", "20414": "泰阜村",
    "20415": "喬木村", "20416": "豊丘村", "20417": "大鹿村", "20423": "南木曽町", "20425": "木祖村", "20429": "王滝村", "20430": "大桑村",
    "20446": "麻績村", "20448": "生坂村", "20450": "山形村", "20451": "朝日村", "20452": "筑北村", "20486": "小谷村", "20543": "高山村", "20588": "小川村",
    "20562": "木島平村", "20602": "栄村",
    "23561": "設楽町", "23562": "東栄町", "23563": "豊根村",
    "21504": "七宗町", "21506": "白川町", "21507": "東白川村", "21604": "白川村",
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

describe("静岡県の道路図", () => {
  // 静岡県庁（葵区追手町9-6）
  const KENCHO = { lat: 34.9768, lng: 138.3831 };

  it("県が扱う市町は県GIS（geocloud 旧版の形）を開き、土木事務所が問い合わせ先", () => {
    const m = findMunicipality("22325")!; // 函南町
    expect(m.coverage).toBe("partial");
    const [link] = buildLinks(m, KENCHO.lat, KENCHO.lng);
    expect(link.url).toBe("https://www.gis.pref.shizuoka.jp/?mc=02&mp=101&z=18&ll=34.976800%2C138.383100");
    expect(link.pinpoint && link.verified).toBe(true);
    expect(resolveContact(m, "22325")!.dept).toContain("沼津土木事務所");
  });

  it("静岡市はしずマップ（geocloud 新版）、浜松市は wagmap を開き、浜名区・天竜区は北部都市整備事務所", () => {
    const shizuoka = findMunicipality("22102")!; // 駿河区
    expect(buildLinks(shizuoka, KENCHO.lat, KENCHO.lng)[0].url).toBe("https://city.shizuoka.geocloud.jp/mp/500?z=18&ll=34.976800,138.383100");
    const hamamatsu = findMunicipality("22140")!; // 天竜区
    expect(buildLinks(hamamatsu, 34.71, 137.726)[0].url).toBe("https://www2.wagmap.jp/hamamatsu/Map?mid=65&mpx=137.726000&mpy=34.710000&mps=1000&gprj=2");
    expect(resolveContact(hamamatsu, "22140")!.dept).toContain("北部都市整備事務所");
    expect(resolveContact(hamamatsu, "22138")!.dept).toBe("都市整備部 建築行政課");
  });

  it("湖西市は ArcGIS の地図から道路種別を文字で読める", () => {
    const m = findMunicipality("22221")!;
    expect(m.coverage).toBe("full");
    const [link] = buildLinks(m, 34.718, 137.531);
    expect(link.url).toBe("https://experience.arcgis.com/experience/dd07e699e2ce41ac8a265a386f59f6f3/page/page_40/#widget_950=center:137.531000%2C34.718000%2C4326,scale:2500");
    expect(link.read?.field).toBe("a_type");
  });

  it("PDF で公開している市（沼津・三島・裾野・袋井）は一覧ページを開く", () => {
    for (const [code, name] of [["22203", "沼津市"], ["22206", "三島市"], ["22220", "裾野市"], ["22216", "袋井市"]] as const) {
      const m = findMunicipality(code)!;
      expect(m.name).toBe(name);
      const pdf = buildLinks(m, 35, 138.8).find((l) => !l.pinpoint)!;
      expect(pdf.url, name).toMatch(/^https:\/\/www\.city\./);
    }
  });

  it("菊川市は市の地図を先に、県GISも開く", () => {
    const links = buildLinks(findMunicipality("22224")!, 34.758, 138.084);
    expect(links.map((l) => l.kind)).toEqual(["road_type", "road_type", "public_road"]);
    expect(links[0].url).toContain("wagmap.jp/kikugawa/Map?mid=5&");
    expect(links[1].url).toContain("gis.pref.shizuoka.jp");
  });
});

describe("山梨県の道路図", () => {
  it("甲府市以外は建設事務所ごとの県GIS（まっぷDE山梨）を開き、建設事務所が問い合わせ先", () => {
    const kai = findMunicipality("19210")!; // 甲斐市
    expect(kai.coverage).toBe("partial");
    const [link] = buildLinks(kai, 35.6606, 138.5156);
    expect(link.url).toBe("https://gis.pref.yamanashi.jp/webgis/?mp=502-125&bt=0&z=18&ll=35.660600%2C138.515600");
    expect(link.kind).toBe("designated_only");
    expect(resolveContact(kai, "19210")!.dept).toContain("中北建設事務所");
    expect(buildLinks(findMunicipality("19202")!, 35.4876, 138.8078)[0].url).toContain("mp=503-67"); // 富士吉田市
    expect(buildLinks(findMunicipality("19205")!, 35.6935, 138.6872)[0].url).toContain("mp=500-61"); // 山梨市
    expect(buildLinks(findMunicipality("19365")!, 35.4661, 138.4421)[0].url).toContain("mp=501-31"); // 身延町
  });

  it("甲府市は道路種別が非公開で、こうふMAPの認定路線情報を開く", () => {
    const m = findMunicipality("19201")!;
    expect(m.coverage).toBe("none");
    const links = buildLinks(m, 35.6642, 138.5683);
    expect(links.map((l) => l.kind)).toEqual(["public_road", "public_road"]);
    expect(links[0].url).toBe("https://kofu.geocloud.jp/mp/329?z=18&ll=35.664200,138.568300");
    expect(resolveContact(m, "19201")).toMatchObject({ phone: "055-237-5824", noPhoneInquiry: true });
  });

  it("笛吹市は県の地図のあとに市道の路線網図を足す", () => {
    const links = buildLinks(findMunicipality("19211")!, 35.6475, 138.6399);
    expect(links.map((l) => l.kind)).toEqual(["designated_only", "public_road"]);
    expect(links[1].url).toContain("wagmap.jp/fuefuki/Map?mid=4&");
  });
});

describe("長野県の道路図", () => {
  it("長野市・松本市（特定行政庁）は市の wagmap の指定道路図を開く", () => {
    const nagano = findMunicipality("20201")!;
    expect(nagano.coverage).toBe("full");
    const links = buildLinks(nagano, 36.6513, 138.181);
    expect(links.map((l) => l.kind)).toEqual(["road_type", "public_road", "public_road"]);
    expect(links[0].url).toBe("https://www2.wagmap.jp/nagano/Map?mid=40&mpx=138.181000&mpy=36.651300&mps=1000&gprj=2");
    expect(resolveContact(nagano, "20201")).toMatchObject({ phone: "026-224-5048", noPhoneInquiry: true });
    const matsumoto = findMunicipality("20202")!;
    expect(matsumoto.coverage).toBe("full");
    expect(buildLinks(matsumoto, 36.2381, 137.9718)[0].url).toContain("wagmap.jp/matsumoto/Map?mid=2&");
  });

  it("上田市（特定行政庁）は道路図が非公開で地図が無く、建築指導課が問い合わせ先", () => {
    const m = findMunicipality("20203")!;
    expect(m.coverage).toBe("none");
    expect(m.maps).toEqual([]);
    expect(resolveContact(m, "20203")!.phone).toBe("0268-23-5430");
  });

  it("飯田市（限定特定行政庁）はいいだWebまっぷの位置指定道路の図と道路網図を開く", () => {
    const m = findMunicipality("20205")!;
    expect(m.coverage).toBe("partial");
    const links = buildLinks(m, 35.5148, 137.8216);
    expect(links.map((l) => l.kind)).toEqual(["designated_only", "public_road"]);
    expect(links[0].url).toBe("https://iida.geocloud.jp/mp/15?z=18&ll=35.514800,137.821600");
    expect(links[1].url).toBe("https://iida.geocloud.jp/mp/3?z=18&ll=35.514800,137.821600");
  });

  it("県が扱う市町村は道路種別の地図が無く、建設事務所が問い合わせ先。市の道路台帳があれば添える", () => {
    const suzaka = findMunicipality("20207")!;
    expect(suzaka.coverage).toBe("none");
    expect(resolveContact(suzaka, "20207")!.dept).toContain("長野建設事務所");
    const links = buildLinks(suzaka, 36.6512, 138.3072);
    expect(links.map((l) => l.kind)).toEqual(["public_road", "designated_only"]);
    expect(links[0].url).toBe("https://experience.arcgis.com/experience/596c785b14594ba4bcf4f079acaab484/#widget_6=center:138.307200%2C36.651200%2C4326,scale:2500");
    expect(links[1].url).toBe("https://www.pref.nagano.lg.jp/choken/kannai/renrakusaki/kenchikuka/index.html");
    const azumino = findMunicipality("20220")!;
    expect(buildLinks(azumino, 36.3039, 137.9057)[0].url).toBe(
      "https://azuminocity.maps.arcgis.com/apps/webappviewer/index.html?id=ff06b231e28949d889bd1182cddc9eb1&center=137.905700,36.303900,4326&scale=2500",
    );
    expect(resolveContact(azumino, "20220")!.dept).toContain("松本建設事務所");
    // 諏訪市は2026年9月末で限定特定行政庁を廃止し、県の諏訪建設事務所が扱う
    expect(resolveContact(findMunicipality("20206")!, "20206")!.phone).toBe("0266-57-2923");
    expect(findMunicipality("20214")!.maps).toEqual([]); // 茅野市
  });

  it("小諸市の路線網図（PDF）は URL だけで、位置から URL を作らない", () => {
    const m = findMunicipality("20208")!;
    const pdf = m.maps.find((l) => l.kind === "public_road")!;
    expect(pdf.build).toBeNull();
    expect(pdf.url).toContain("city.komoro.lg.jp");
    expect(buildLinks(m, 36.3271, 138.4262).map((l) => l.kind)).toEqual(["public_road", "designated_only"]);
  });
});

describe("愛知県の道路図", () => {
  it("名古屋市は市の指定道路図を #ズーム/緯度/経度 で開き、全区で同じ問い合わせ先", () => {
    const m = findMunicipality("23106")!; // 中区
    expect(m.name).toBe("名古屋市");
    expect(m.codes).toHaveLength(16);
    expect(m.coverage).toBe("full");
    const links = buildLinks(m, 35.1815, 136.9066);
    expect(links[0].url).toBe("https://www.shiteidourozu.city.nagoya.jp/nagoya/#17/35.181500/136.906600");
    expect(links[0].kind).toBe("road_type");
    expect(resolveContact(m, "23116")!.phone).toBe("052-972-2928");
  });

  it("豊橋・豊田・岡崎は wagmap の道路図、一宮・春日井は道路種別が非公開", () => {
    expect(buildLinks(findMunicipality("23201")!, 34.7692, 137.3915)[0].url).toBe("https://www2.wagmap.jp/toyohashi/Map?mid=30&mpx=137.391500&mpy=34.769200&mps=1000&gprj=2");
    expect(buildLinks(findMunicipality("23211")!, 35.0824, 137.1564)[0].url).toContain("wagmap.jp/toyotacity/Map?mid=13&");
    expect(buildLinks(findMunicipality("23202")!, 34.9545, 137.1744).map((l) => l.kind)).toEqual(["road_type", "public_road"]);
    expect(findMunicipality("23203")!.coverage).toBe("none"); // 一宮市
    expect(resolveContact(findMunicipality("23203")!, "23203")).toMatchObject({ phone: "0586-28-8645", noPhoneInquiry: true });
    expect(findMunicipality("23206")!.maps.map((l) => l.kind)).toEqual(["public_road"]); // 春日井市
  });

  it("限定特定行政庁の11市は市の建築課が問い合わせ先", () => {
    for (const [code, phone] of [["23204", "0561-88-2686"], ["23205", "0569-84-0671"], ["23207", "0533-89-2117"], ["23210", "0566-62-1021"], ["23212", "0566-71-2241"], ["23213", "0563-65-2381"], ["23217", "0587-54-1111"], ["23219", "0568-76-1142"], ["23220", "0587-32-1409"], ["23222", "0562-38-6404"], ["23223", "0562-45-6314"]] as const) {
      const m = findMunicipality(code)!;
      expect(m.coverage, m.name).toBe("none");
      expect(resolveContact(m, code)!.phone, m.name).toBe(phone);
      expect(m.note, m.name).toContain("限定特定行政庁");
    }
  });

  it("県が扱う市町村は建設事務所が問い合わせ先。cloudgis・wagmap の道路台帳があれば添える", () => {
    const nagakute = findMunicipality("23238")!;
    expect(resolveContact(nagakute, "23238")!.dept).toContain("尾張建設事務所");
    expect(buildLinks(nagakute, 35.1841, 137.0486)[0].url).toBe("https://nagakute.cloudgis.jp/road/?lon=137.048600&lat=35.184100&z=18");
    expect(buildLinks(findMunicipality("23214")!, 34.8264, 137.2197)[0].url).toBe("https://gamagori.cloudgis.jp/road/?lon=137.219700&lat=34.826400&z=18");
    expect(buildLinks(findMunicipality("23225")!, 35.0015, 137.0505).map((l) => l.kind)).toEqual(["public_road", "public_road"]); // 知立市
    expect(findMunicipality("23209")!.maps).toEqual([]); // 碧南市
    expect(resolveContact(findMunicipality("23231")!, "23231")!.phone).toBe("0532-52-1315"); // 田原市 → 東三河
  });
});

describe("岐阜県の道路図", () => {
  it("可児市は県域統合型GISぎふの道路種別（2号・2項・位置指定）と道路台帳図を 1/2500 で開く", () => {
    const m = findMunicipality("21214")!;
    expect(m.coverage).toBe("partial");
    const links = buildLinks(m, 35.425953, 137.061022);
    expect(links[0].kind).toBe("road_type");
    expect(links[0].url).toBe("https://gis-gifu.jp/gifu/Map?mid=11017&mpx=137.061022&mpy=35.425953&mps=2500&gprj=3");
    expect(links[1].url).toBe("https://gis-gifu.jp/gifu/Map?mid=20010&mpx=137.061022&mpy=35.425953&mps=2500&gprj=3");
    expect(resolveContact(m, "21214")!.phone).toBe("0574-62-1111");
  });

  it("特定行政庁の3市は道路種別が非公開で、県域統合型GISぎふの認定路線図・道路台帳を添える", () => {
    const gifu = findMunicipality("21201")!;
    expect(gifu.coverage).toBe("none");
    expect(buildLinks(gifu, 35.4232, 136.7606)[0].url).toBe("https://gis-gifu.jp/gifu/Map?mid=20008&mpx=136.760600&mpy=35.423200&mps=2500&gprj=3");
    expect(resolveContact(gifu, "21201")!.phone).toBe("058-214-2428");
    expect(buildLinks(findMunicipality("21202")!, 35.3594, 136.6179)[0].url).toContain("gis-gifu.jp/gifu/Map?mid=429&");
    expect(buildLinks(findMunicipality("21213")!, 35.3989, 136.8483)[0].url).toContain("mid=12105&");
    expect(resolveContact(findMunicipality("21213")!, "21213")!.phone).toBe("058-383-1482");
  });

  it("県が扱う市町村は市町村の建築担当課が問い合わせ先で、注記に県の建築事務所を書く。PDF や cloud-gis の道路図は座標なしの入口", () => {
    const seki = findMunicipality("21205")!;
    expect(resolveContact(seki, "21205")!.dept).toBe("都市計画課 開発建築係");
    expect(seki.note).toContain("中濃建築事務所");
    expect(buildLinks(seki, 35.4957, 136.9181)[0].url).toContain("mid=3000&");
    const mino = buildLinks(findMunicipality("21207")!, 35.5448, 136.9077);
    expect(mino[0].url).toBe("https://www.city.mino.gifu.jp/docs/952459.html");
    expect(mino[0].pinpoint).toBe(false);
    const hashima = findMunicipality("21209")!.maps[0];
    expect(hashima.verified).toBe(false);
    expect(hashima.url).toBe("https://www.cloud-gis.jp/HashimaMap/terms.html");
    expect(findMunicipality("21302")!.maps).toEqual([]); // 岐南町
    expect(resolveContact(findMunicipality("21302")!, "21302")!.phone).toBe("058-247-1360");
  });

  it("限定特定行政庁の高山・多治見は非公開、七宗町・白川町・東白川村・白川村は都市計画区域外", () => {
    expect(resolveContact(findMunicipality("21203")!, "21203")!.phone).toBe("0577-35-3159");
    expect(findMunicipality("21204")!.note).toContain("限定特定行政庁");
    for (const code of ["21504", "21506", "21507", "21604"]) expect(findMunicipality(code)!.coverage).toBe("outside");
  });
});

describe("buildLinks", () => {
  it("wagmap は世界測地系の座標に gprj=2 を付ける（自治体ごとの測地系の違いを吸収）", () => {
    const [link] = buildLinks(findMunicipality("11202")!, KUMAGAYA_CITY_HALL.lat, KUMAGAYA_CITY_HALL.lng);
    expect(link.url).toBe("https://www2.wagmap.jp/kumagaya/Map?mid=170&mpx=139.388580&mpy=36.147129&mps=1000&gprj=2");
    expect(link.pinpoint).toBe(true);
  });

  it("つくば市はつくミル「都市計画・規制」（道路種別のレイヤ）と認定道路マップを、地図ウィジェットの中心を指定して開く", () => {
    const m = findMunicipality("08220")!;
    expect(m.coverage).toBe("full");
    const [roadType, publicRoad] = buildLinks(m, 36.083321, 140.076492);
    expect(roadType.kind).toBe("road_type");
    expect(roadType.url).toBe(
      "https://experience.arcgis.com/experience/049cc90fad1d44eaac93e9731810bd12/#widget_124=center:140.076492%2C36.083321%2C4326,scale:2500",
    );
    expect(roadType.tip).toContain("建築基準法道路種別");
    expect(publicRoad.url).toBe(
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

describe("Sonicweb の道路台帳・認定路線網図", () => {
  /** Sonicweb の地図の「slug テーマ」（ほかの地図は undefined） */
  const theme = (url: string) => url.match(/sonicweb-asp\.jp\/([\w-]+)\/map\?theme=(\w+)/)?.slice(1).join(" ");

  it("足立区は指定道路図・細街路路線図（拡幅すべき幅員）と、区道の道路台帳現況平面図を開く", () => {
    const links = buildLinks(findMunicipality("13121")!, 35.779002, 139.801733);
    expect(links.map((l) => [l.kind, theme(l.url)])).toEqual([
      ["road_type", "adachi2 th_2"],
      ["road_type", "adachi2 th_3"],
      ["public_road", "adachi2 th_4"],
    ]);
    expect(links[2].url).toBe("https://www.sonicweb-asp.jp/adachi2/map?theme=th_4&pos=139.801733%2C35.779002&scale=1000");
    expect(links.every((l) => l.pinpoint && l.verified)).toBe(true);
  });

  it("県・都の道路種別の地図を開く町・市は、その地図の後に町・市の道路の地図を足す", () => {
    const after = (code: string) => {
      const [first, ...rest] = buildLinks(findMunicipality(code)!, 35.8, 139.5);
      return { first, rest: rest.map((l) => `${l.label} ${theme(l.url)}`) };
    };
    const kamisato = after("11385");
    expect(kamisato.first.label).toBe("埼玉県指定道路図（試行）");
    expect(kamisato.first.read).toBeDefined(); // 県の地図の道路種別は読めたまま
    expect(kamisato.rest).toEqual(["認定路線網図（町道） kamisato th_1"]);
    const tonosho = after("12349");
    expect(tonosho.first.url).toBe("https://ds.icba-info.jp/siteidouro/chiba/pref/");
    expect(tonosho.rest).toEqual(["認定路線網図（町道） tonosho th_34", "道路台帳図（町道） tonosho th_35"]);
    expect(after("14382").rest).toEqual(["町道網図（はこねMAP） hakone th_18"]); // 箱根町
    expect(after("13224").first.label).toBe("建築基準法 多摩地域道路種別情報（東京都）"); // 多摩市
    expect(after("13224").rest).toEqual(["認定路線網図（市道） tama th_19"]);
    expect(after("13221").rest).toEqual(["道路情報（市道の路線網図） kiyose th_60"]); // 清瀬市
    // 同じ都の地図の、ほかの市は変わらない
    expect(buildLinks(findMunicipality("13225")!, 35.638, 139.504)).toHaveLength(1); // 稲城市
  });

  it("道路台帳図と認定路線網図は、同じ地図の別のテーマを両方出す（柏市・小平市・松戸市・鹿沼市）", () => {
    const publicRoads = (code: string) => buildLinks(findMunicipality(code)!, 35.8, 139.9).filter((l) => l.kind === "public_road").map((l) => theme(l.url));
    expect(publicRoads("12217")).toEqual(["kashiwa th_15", "kashiwa th_16"]);
    expect(publicRoads("13211")).toEqual(["kodaira th_16", "kodaira th_17"]);
    expect(publicRoads("12207")).toEqual(["matsudo th_8", "matsudo th_60"]);
    expect(publicRoads("09205")).toEqual(["kanuma th_1", "kanuma th_2"]);
  });

  it("同じ地図（URL）を二重に載せない", () => {
    for (const m of MUNICIPALITIES) {
      const urls = buildLinks(m, 35.8, 139.6).map((l) => l.url);
      expect(new Set(urls).size, m.name).toBe(urls.length);
    }
  });

  it("公道（市道）の地図に、道路種別の凡例が付かない（同じテーマの道路種別の地図があると、凡例のキーが重なる）", () => {
    for (const m of MUNICIPALITIES) {
      for (const l of buildLinks(m, 35.8, 139.6)) if (l.kind === "public_road") expect(l.legend, `${m.name} ${l.label}`).toBeUndefined();
    }
  });

  it("狭山市は同じテーマの指定道路図と認定路線を開き、凡例は指定道路図だけに付く", () => {
    const [road, pub] = buildLinks(findMunicipality("11215")!, 35.852, 139.412);
    expect([road.kind, pub.kind]).toEqual(["road_type", "public_road"]);
    expect(pub.url).toBe("https://www.sonicweb-asp.jp/sayama/map?theme=th_3&pos=139.412000%2C35.852000&scale=1000&layers=dm%2Cth_4");
    expect(road.legend?.length).toBeGreaterThan(0);
    expect(pub.legend).toBeUndefined();
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        // 住所検索は動いている（県・市なら見つかる）
        json: async () => (decodeURIComponent(url).includes("東京都千代田区") ? [{ geometry: { coordinates: [139.75, 35.69] }, properties: { title: "東京都千代田区" } }] : []),
      })),
    );
    expect(await lookup("存在しない住所")).toEqual({ status: "not_found" });
  });

  it("住所検索がどの住所にも0件を返すとき（障害など）は、見つからないとは言わない", async () => {
    stubFetch([], {});
    await expect(lookup("東京都渋谷区神南1-19-11")).rejects.toBeInstanceOf(GeocoderUnavailable);
  });

  it("未対応の市町村なら unsupported", async () => {
    stubFetch(
      [{ geometry: { coordinates: [135.4959, 34.7024] }, properties: { title: "大阪府大阪市北区梅田一丁目" } }],
      { results: { muniCd: "27127", lv01Nm: "梅田一丁目" } },
    );
    const r = await lookup("大阪府大阪市北区梅田1-1-1");
    expect(r.status).toBe("unsupported");
  });

  it("中部の市町村は対応（道路図は調査中）", async () => {
    stubFetch(
      [{ geometry: { coordinates: [138.8512, 37.4463] }, properties: { title: "新潟県長岡市大手通" } }],
      { results: { muniCd: "15202", lv01Nm: "大手通" } },
    );
    const r = await lookup("新潟県長岡市大手通1-4-10");
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.municipality.name).toBe("長岡市");
      expect(r.municipality.coverage).toBe("unknown");
      expect(r.links).toEqual([]);
    }
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

describe("lookupPoint（地図で選んだ地点）", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubRev = (rev: unknown) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => rev })));

  it("市区町村と町名から住所を作り、その地点の地図リンクを返す（政令市は区まで）", async () => {
    stubRev({ results: { muniCd: "11103", lv01Nm: "大門町三丁目" } });
    const r = await lookupPoint(35.9063, 139.6239);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.picked).toBe(true);
    expect(r.approximate).toBe(false);
    expect(r.matchedAddress).toBe("埼玉県さいたま市大宮区大門町三丁目");
    expect(r.municipality.name).toBe("さいたま市");
    expect(r.links[0].url).toContain("139.6239");
  });

  it("対応エリアの外や海の上は unsupported", async () => {
    stubRev({ results: { muniCd: "27127", lv01Nm: "梅田一丁目" } });
    expect((await lookupPoint(34.7024, 135.4959)).status).toBe("unsupported");
    stubRev({});
    const sea = await lookupPoint(35.3, 139.9);
    expect(sea.status === "unsupported" && sea.matchedAddress).toBe("地図で選んだ地点");
  });

  it("市区町村コードの名前", () => {
    expect(muniName("13101")).toBe("東京都千代田区");
    expect(muniName("14131")).toBe("神奈川県川崎市川崎区");
    expect(muniName("19201")).toBe("山梨県甲府市");
    expect(muniName("22138")).toBe("静岡県浜松市中央区");
    expect(muniName("27127")).toBeUndefined();
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

describe("館林市の道路台帳図（800m×600m の格子）", () => {
  it("館林市役所（城町1-1）は K-9、館林駅は J-8 の左下の角（図葉割図の①）", () => {
    const m = findMunicipality("10207")!;
    const [hall] = buildLinks(m, 36.244713, 139.542114);
    expect(hall.sheet?.label).toBe("K-9");
    expect(hall.url).toBe("https://www.city.tatebayashi.gunma.jp/s066/kurashi/090/daityozu/K-9.pdf");
    const [station] = buildLinks(m, 36.246787, 139.527856);
    expect(station.sheet?.label).toBe("J-8");
    expect(station.sheet?.where).toBe("左下");
    expect(station.sheet?.neighbor).toBeDefined();
  });
});

describe("太田市の認定路線網図（1/5000 図郭）", () => {
  it("太田市役所（浜町2-35）は 17 番の図の右上", () => {
    const [link] = buildLinks(findMunicipality("10205")!, 36.291298, 139.37645);
    expect(link.sheet?.label).toBe("17");
    expect(link.sheet?.where).toBe("右上");
    expect(link.url).toBe("https://www.city.ota.gunma.jp/uploaded/attachment/26175.pdf");
  });
});

describe("富士見市の分割図", () => {
  it("富士見市役所（鶴馬1800-1）は 06 の図", () => {
    const [link] = buildLinks(findMunicipality("11235")!, 35.856644, 139.549149);
    expect(link.sheet?.label).toBe("06");
  });

  it("路線網図（市全体で1枚）は、物件が図のどのあたりかを出す（市役所は中央）", () => {
    const [, rosen] = buildLinks(findMunicipality("11235")!, 35.856644, 139.549149);
    expect(rosen.url).toMatch(/rosenmouzu_R7\.pdf$/);
    expect(rosen.sheet).toMatchObject({ whole: true, where: "中央" });
  });
});

describe("文京区の道路台帳平面図（500m×350m の格子）", () => {
  it("文京シビックセンター（春日1-16-21）は 44-36 の図の右の方（図に「文京区役所」とある）", () => {
    const [link] = buildLinks(findMunicipality("13105")!, 35.708336, 139.752411);
    expect(link.sheet?.label).toBe("44-36");
    expect(link.sheet?.where).toBe("右の方");
    expect(link.url).toBe("https://www.city.bunkyo.lg.jp/shared/library/sosiki_busyo/dokan/tikei/44036.pdf");
  });
});

describe("習志野市の市道認定網図（地区ごとの6枚）", () => {
  const m = () => findMunicipality("12216")!;
  it("地区の図は範囲が大きく重なるので、町名でその地区の図を選ぶ（市役所＝鷺沼二丁目）", () => {
    const [link] = buildLinks(m(), 35.681423, 140.026428, "鷺沼二丁目");
    expect(link.sheet?.label).toBe("袖ケ浦・鷺沼ほか");
    expect(link.url).toMatch(/\/sode\.pdf$/);
    // その地区の図なら端でも隣の図は出さない
    expect(link.sheet?.neighbor).toBeUndefined();
  });
  it("「袖ヶ浦」の表記ゆれでも同じ図。町名が無ければ位置で選ぶ", () => {
    expect(buildLinks(m(), 35.6713, 140.0136, "袖ヶ浦一丁目")[0].sheet?.label).toBe("袖ケ浦・鷺沼ほか");
    expect(buildLinks(m(), 35.681423, 140.026428)[0].sheet).toBeDefined();
  });
});

describe("ふじみ野市の道路網図（市全体で1枚）", () => {
  it("市役所（福岡1-1-1）は図の上の方（図は北が上）", () => {
    const [link] = buildLinks(findMunicipality("11245")!, 35.879875, 139.519592);
    expect(link.url).toMatch(/R8douromouzu\.pdf$/);
    expect(link.sheet).toMatchObject({ whole: true, where: "上の方" });
  });
});

describe("西東京市の道路種別図（市全体で1枚）", () => {
  it("田無駅は図の中央、ひばりヶ丘の北の方は上の方", () => {
    const m = findMunicipality("13229")!;
    const [tanashi] = buildLinks(m, 35.7272, 139.5398);
    expect(tanashi.url).toMatch(/douroshubetu\.pdf$/);
    expect(tanashi.sheet).toMatchObject({ whole: true, where: "中央" });
    expect(buildLinks(m, 35.7593, 139.5404)[0].sheet?.where).toBe("上の方");
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
