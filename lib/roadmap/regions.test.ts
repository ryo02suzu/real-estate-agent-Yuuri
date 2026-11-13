import { describe, expect, it } from "vitest";
import GSI_CODES from "./data/gsi-muni-codes.json";
import { CHUBU_PENDING } from "./data/chubu";
import { TOHOKU_PENDING } from "./data/tohoku";
import { KINKI_PENDING } from "./data/kinki";
import { buildLinks, findMunicipality, MUNICIPALITIES } from "./municipalities";
import { ROAD_READ_PERMITTED, roadReadPermission } from "./road-read-permission";
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

  it("府県が扱う市町村・政令市・三重県の8市・奈良県の3市・滋賀県の7市・宇治市・和歌山市・兵庫県の11市は登録済み（212）。残りの15（大阪府の、市が道路を扱う市）は調査中", () => {
    const done: Record<string, number> = {};
    for (const m of MUNICIPALITIES) if (KINKI.includes(m.pref) && m.coverage !== "unknown") done[m.pref] = (done[m.pref] ?? 0) + 1;
    expect(done).toEqual({ 三重県: 29, 滋賀県: 19, 京都府: 26, 大阪府: 28, 兵庫県: 41, 奈良県: 39, 和歌山県: 30 });
    expect(KINKI_PENDING).toHaveLength(15);
    // 調査中に残るのは、市が道路を扱う市（特定行政庁など）だけ
    expect(KINKI_PENDING.every((m) => m.name.endsWith("市"))).toBe(true);
    expect([...new Set(KINKI_PENDING.map((m) => m.pref))]).toEqual(["大阪府"]);
    // 政令市：京都市・大阪市・神戸市は全種別の図、堺市は載る種別を確かめられていないので一部
    expect(findMunicipality("26104")?.coverage).toBe("full");
    expect(findMunicipality("27127")?.coverage).toBe("full");
    expect(findMunicipality("27141")?.coverage).toBe("partial");
    expect(findMunicipality("28110")?.coverage).toBe("full");
  });

  it("登録済みの市町村は、窓口の電話があり、都市計画区域の無い28町村には地図を出さない", () => {
    const done = MUNICIPALITIES.filter((m) => KINKI.includes(m.pref) && m.coverage !== "unknown");
    for (const m of done) expect(m.contact?.phone, `${m.pref}${m.name}`).toMatch(/^0\d+-\d+-\d{4}$/);
    const outside = done.filter((m) => m.coverage === "outside");
    expect(outside.map((m) => m.name).sort()).toEqual(
      ["大台町", "度会町", "大紀町", "紀宝町", "笠置町", "和束町", "南山城村", "伊根町", "市川町", "神河町", "紀美野町", "広川町", "日高町", "印南町", "日高川町", "古座川町", "北山村"]
        .concat(["山添村", "曽爾村", "御杖村", "黒滝村", "天川村", "野迫川村", "十津川村", "下北山村", "上北山村", "川上村", "東吉野村"])
        .sort(),
    );
    for (const m of outside) expect(m.maps, m.name).toEqual([]);
    // 道路種別の地図が無い（ネットに出ていない）市町村は none で、道路種別の地図は出さない（市町村道の参考の地図だけは出すことがある）
    for (const m of done.filter((x) => x.coverage === "none")) expect(m.maps.filter((l) => l.kind !== "public_road"), m.name).toEqual([]);
    // 一部・全部の市町村には、開ける地図が1つ以上ある
    for (const m of done.filter((x) => x.coverage === "full" || x.coverage === "partial")) expect(m.maps.length, m.name).toBeGreaterThan(0);
  });

  it("同意の画面がある地図は「確認済み」にせず、同意は自分でする案内を付ける。入口だけの地図は入口の URL を持つ", () => {
    const done = MUNICIPALITIES.filter((m) => KINKI.includes(m.pref) && m.coverage !== "unknown");
    for (const m of done) {
      for (const link of m.maps) {
        if (link.build) {
          // 近畿で物件の位置で開く地図は、利用規約・利用条件への同意の先（MICHILU は同意の先を開いていない。近江八幡市の ArcGIS の地図も）か、
          // 海外の回線から開けない地図（Sonicweb）。どれも位置で開くことを確かめていないので「確認済み」にしない
          expect(link.verified, `${m.name} ${link.label}`).toBe(false);
          expect(link.tip, `${m.name} ${link.label}`).toMatch(/自分で(「同意する」を押す|同意する)|海外の回線から開けない/);
          expect(link.build(34.7, 135.5)).toMatch(/^https:\/\//);
        } else {
          expect(link.url, `${m.name} ${link.label}`).toMatch(/^https:\/\//);
        }
      }
    }
    // 県のページのリンクと同じ形（和歌山県地理情報システム）
    expect(findMunicipality("30202")?.maps[0].build?.(34.15, 135.2)).toBe("https://wakayamaken.geocloud.jp/webgis/?t=gsi&mp=31&op=100&vlf=-1&z=18&ll=34.150000%2C135.200000");
    // 三重県・滋賀県・京都府・奈良県の府県の地図と大阪市は、注意事項・利用条件のあるページ（入口）を開く
    expect(findMunicipality("24203")?.maps[0]).toMatchObject({ build: null, url: "https://www.pref.mie.lg.jp/JUTAKU/HP/84478031368.htm" });
    expect(findMunicipality("25209")?.maps[0]).toMatchObject({ build: null, url: "https://www.pref.shiga.lg.jp/re00/888.html" });
    expect(findMunicipality("26208")?.maps[0]).toMatchObject({ build: null, url: "https://www.pref.kyoto.jp/kenchiku/1291697604560.html" });
    expect(findMunicipality("27127")?.maps[0]).toMatchObject({ build: null, url: "https://www.city.osaka.lg.jp/toshikeikaku/page/0000012045.html" });
    expect(findMunicipality("29203")?.maps[0]).toMatchObject({ build: null, url: "https://www.pref.nara.lg.jp/n155/33833.html" });
  });

  it("三重県の8市：ネットの図は一部の種別だけ（松阪市は窓口だけ）。リンクを制限している市のページへは直接つながない", () => {
    const cities = ["24201", "24202", "24204", "24205", "24207", "24208", "24210", "24216"].map((c) => findMunicipality(c)!);
    expect(cities.map((m) => m.name)).toEqual(["津市", "四日市市", "松阪市", "桑名市", "鈴鹿市", "名張市", "亀山市", "伊賀市"]);
    expect(cities.map((m) => m.coverage)).toEqual(["partial", "partial", "none", "partial", "partial", "partial", "partial", "partial"]);
    // 亀山市（トップページ以外へのリンクは原則禁止）・伊賀市（リンクの前に知らせる）のページへは直接つながず、三重県のページを開く
    for (const code of ["24210", "24216"]) {
      for (const link of findMunicipality(code)!.maps) {
        const url = link.build ? link.build(34.85, 136.45) : link.url!;
        expect(url, link.label).not.toMatch(/city\.kameyama\.mie\.jp|city\.iga\.lg\.jp/);
      }
      expect(findMunicipality(code)!.maps[0]).toMatchObject({ build: null, url: "https://www.pref.mie.lg.jp/KENCHIKU/HP/m0168200177.htm" });
    }
    // 四日市市は GIS の各地点への直接のリンクを認めていないので、市のページ（入口）だけ
    for (const link of findMunicipality("24202")!.maps) expect(link.build).toBeNull();
    // 鈴鹿市の地図は、市「地理情報」のページのリンクと同じ形
    expect(findMunicipality("24207")!.maps[0].build?.(34.881943, 136.584429)).toBe(
      "https://www.sonicweb-asp.jp/city_suzuka/map?theme=th_34&layers=th_24,dm#layers=dm%2Cth_24&scale=3750&pos=136.584429%2C34.881943",
    );
    expect(findMunicipality("24207")!.maps[2].build?.(34.881688, 136.585062)).toBe("https://www.sonicweb-asp.jp/city_suzuka/map?theme=th_12#scale=3750&pos=136.585062%2C34.881688");
    // 亀山市は電話での問い合わせを原則受け付けない
    expect(findMunicipality("24210")?.contact?.noPhoneInquiry).toBe(true);
    for (const code of ["24201", "24202", "24204", "24205", "24207", "24208", "24216"]) expect(findMunicipality(code)?.contact?.noPhoneInquiry, code).toBeUndefined();
  });

  it("奈良県：県の道路システムに載る18市町村は一部（1項1号は載らない）、準備中の7市町は非公開、窓口は3つの土木事務所", () => {
    // 市が道路を扱う3市（奈良市・橿原市・生駒市）は下の別のテストで見る
    const nara = MUNICIPALITIES.filter((m) => m.pref === "奈良県" && m.coverage !== "unknown" && !["29201", "29205", "29209"].includes(m.codes[0]));
    expect(nara.filter((m) => m.coverage === "partial").map((m) => m.name).sort()).toEqual(
      ["大和高田市", "大和郡山市", "桜井市", "五條市", "御所市", "香芝市", "葛城市", "宇陀市", "平群町", "三郷町", "斑鳩町", "安堵町", "川西町", "三宅町", "田原本町", "高取町", "明日香村", "大淀町"].sort(),
    );
    expect(nara.filter((m) => m.coverage === "none").map((m) => m.name).sort()).toEqual(["天理市", "上牧町", "王寺町", "広陵町", "河合町", "吉野町", "下市町"].sort());
    for (const m of nara.filter((x) => x.coverage === "partial")) expect(m.maps[0].tip, m.name).toMatch(/1項1号.*載らず/);
    // 窓口：郡山 7・高田 11・中和 18（県のチラシの所管地域）
    const byPhone: Record<string, number> = {};
    for (const m of nara) byPhone[m.contact!.phone!] = (byPhone[m.contact!.phone!] ?? 0) + 1;
    expect(byPhone).toEqual({ "0743-51-0209": 7, "0745-44-3877": 11, "0744-48-3079": 18 });
    // 県が管理する道路の事務所は、建築の窓口と分け方が違う（天理市は建築が郡山、道路が奈良）
    expect(findMunicipality("29204")?.contact?.note).toContain("奈良土木事務所");
    expect(findMunicipality("29207")?.contact?.note).toContain("五條土木事務所");
  });

  it("滋賀県の7市：市が道路を扱う。開けなかった地図は市のページ（入口）から、近江八幡市の地図は物件の位置で開く（同意は自分で）", () => {
    const codes = ["25201", "25202", "25203", "25204", "25206", "25207", "25213"];
    const cities = codes.map((c) => findMunicipality(c)!);
    expect(cities.map((m) => m.name)).toEqual(["大津市", "彦根市", "長浜市", "近江八幡市", "草津市", "守山市", "東近江市"]);
    // 凡例を公式の資料で確かめられた大津市・東近江市は全種別、凡例を確かめられていない・載っていない道がある市は一部、守山市は道路種別の地図が見つからない
    expect(cities.map((m) => m.coverage)).toEqual(["full", "partial", "partial", "partial", "partial", "none", "full"]);
    const [otsu, hikone, nagahama, omihachiman, kusatsu, moriyama, higashiomi] = cities;
    // 地図のサイトを開いて確かめられていない6市は、市のページ（入口）だけ
    for (const m of [otsu, hikone, nagahama, kusatsu, moriyama, higashiomi]) for (const link of m.maps) expect(link.build, `${m.name} ${link.label}`).toBeNull();
    expect(otsu.maps[0]).toMatchObject({ kind: "road_type", url: "https://www.city.otsu.lg.jp/soshiki/035/1309/g/douro/67087.html" });
    expect(otsu.maps[0].tip).toMatch(/緑＝1項1号.*水色＝2項.*色なし＝未判定/);
    expect(higashiomi.maps[0]).toMatchObject({ kind: "road_type", url: "https://www.city.higashiomi.shiga.jp/machizukuri_kankyou/kenchiku/1003563/1003572.html" });
    expect(higashiomi.maps[0].tip).toMatch(/自分で同意してから使う決まり/);
    // 守山市はリンク先をトップページにするよう求めているので、トップページを開く（市道の参考の地図だけ）
    expect(moriyama.maps).toHaveLength(1);
    expect(moriyama.maps[0]).toMatchObject({ kind: "public_road", url: "https://www.city.moriyama.lg.jp/" });
    for (const m of cities) for (const link of m.maps) if (m !== moriyama) expect(link.build ? link.build(35.1, 136.1) : link.url!, link.label).not.toMatch(/city\.moriyama\.lg\.jp/);
    // 近江八幡市：ArcGIS の地図を物件の位置で開く形（地図の部品の ID は公開の設定から）
    expect(omihachiman.maps.map((l) => l.kind)).toEqual(["road_type", "public_road", "public_road"]);
    expect(omihachiman.maps[0].build?.(35.128, 136.098)).toBe("https://experience.arcgis.com/experience/cb6aedeac97e4198abc4c187f4dc7a2d/#widget_5=center:136.098000%2C35.128000%2C4326,scale:2500");
    expect(omihachiman.maps[1].build?.(35.128, 136.098)).toBe("https://experience.arcgis.com/experience/7d34b331a7f54e188d87ba5e7e6cde19/#widget_14=center:136.098000%2C35.128000%2C4326,scale:2500");
    expect(omihachiman.maps[2].build?.(35.128, 136.098)).toBe("https://experience.arcgis.com/experience/01a226fb775e4377a715d12754341278/#widget_15=center:136.098000%2C35.128000%2C4326,scale:2500");
    for (const link of omihachiman.maps) expect(link.verified, link.label).toBe(false);
    // 窓口：市の建築の課
    expect(cities.map((m) => m.contact?.phone)).toEqual(["077-528-2774", "0749-30-6125", "0749-65-6543", "0748-36-5544", "077-561-2378", "077-582-1139", "0748-24-5656"]);
    expect(cities.map((m) => m.contact?.fax)).toEqual(["077-523-1505", "0749-24-8517", "0749-65-6760", "0748-36-5595", "077-561-2486", "077-582-6947", "0748-24-1249"]);
    // 草津市・東近江市は、道路種別を電話などでは答えない
    expect(cities.filter((m) => m.contact?.noPhoneInquiry).map((m) => m.name)).toEqual(["草津市", "東近江市"]);
    // 都市計画区域の外がある市は、そう書く
    expect(otsu.note).toContain("葛川地区");
    expect(nagahama.note).toContain("旧余呉町・旧西浅井町");
    expect(higashiomi.note).toContain("旧永源寺町");
  });

  it("宇治市・和歌山市：市が道路を扱う。宇治市は市のお願いに合わせてトップページから、和歌山市は市のページから地図へ進む", () => {
    const uji = findMunicipality("26204")!;
    const wakayama = findMunicipality("30201")!;
    expect([uji.name, wakayama.name]).toEqual(["宇治市", "和歌山市"]);
    // 宇治市：参考の道路種別（凡例を確かめられていないので一部）。リンクはトップページ（市「リンク・著作権・免責事項」）。電話では答えない
    expect(uji.coverage).toBe("partial");
    expect(uji.maps).toHaveLength(1);
    expect(uji.maps[0]).toMatchObject({ kind: "road_type", build: null, url: "https://www.city.uji.kyoto.jp/" });
    expect(uji.maps[0].tip).toMatch(/確認申請の手続きについて.*京都府統合型GIS.*自分で同意する/);
    expect(uji.contact).toMatchObject({ phone: "0774-20-8794", fax: "0774-21-0409", noPhoneInquiry: true });
    // 和歌山市：指定道路図（道路参考図）は全種別（市のチラシの凡例）。市のページ（入口）から開く
    expect(wakayama.coverage).toBe("full");
    expect(wakayama.maps.map((l) => l.kind)).toEqual(["road_type", "public_road"]);
    for (const link of wakayama.maps) expect(link.build, link.label).toBeNull();
    expect(wakayama.maps[0].url).toBe("https://www.city.wakayama.wakayama.jp/kurashi/sumai_jyougesuidou/1001110/1010370/1036252.html");
    expect(wakayama.maps[0].tip).toMatch(/1項1号・1項2号・1項3号・1項4号・1項5号・2項/);
    // 和歌山市のリンクの決まり：和歌山市のページへのリンクだと分かるように書く
    for (const link of wakayama.maps) expect(link.label).toContain("和歌山市のページから開く");
    expect(wakayama.contact).toMatchObject({ phone: "073-435-1100", fax: "073-435-1175", email: "kenchikushido@city.wakayama.lg.jp" });
    expect(wakayama.contact?.noPhoneInquiry).toBeUndefined();
  });

  it("兵庫県の11市：市が道路を扱い、地図は市のページ（入口）から開く。凡例を確かめられた西宮市と、市が全部の道路を出すと書く三田市だけ全種別", () => {
    const codes = ["28201", "28202", "28203", "28204", "28206", "28207", "28210", "28214", "28216", "28217", "28219"];
    const cities = codes.map((c) => findMunicipality(c)!);
    const [himeji, amagasaki, akashi, nishinomiya, ashiya, itami, kakogawa, takarazuka, takasago, kawanishi, sanda] = cities;
    expect(cities.map((m) => m.name)).toEqual(["姫路市", "尼崎市", "明石市", "西宮市", "芦屋市", "伊丹市", "加古川市", "宝塚市", "高砂市", "川西市", "三田市"]);
    expect(cities.map((m) => m.coverage)).toEqual(["partial", "partial", "partial", "full", "partial", "partial", "partial", "partial", "partial", "partial", "full"]);
    // どの市にも、道路種別の地図への入口が先頭にある（市のページか、市の地図の入口）
    for (const m of cities) expect(m.maps[0], m.name).toMatchObject({ kind: "road_type", build: null, verified: true });
    for (const m of cities) expect(m.maps[0].url, m.name).toMatch(/^https:\/\/(www\.city\.[a-z]+\.(lg|hyogo)\.jp|www\.nishi\.or\.jp)\//);
    // 物件の位置で開くのは尼崎市の市道の地図だけ（市のページのリンクと同じ形。開いて確かめられていないので「確認済み」にしない）
    const built = cities.flatMap((m) => m.maps.filter((l) => l.build).map((l) => `${m.name} ${l.kind}`));
    expect(built).toEqual(["尼崎市 public_road"]);
    expect(amagasaki.maps[1].build?.(34.73354, 135.40649)).toBe("https://amagasaki.geocloud.jp/webgis/?t=DMgray&mp=8&op=100&vlf=000010&z=18&ll=34.733540%2C135.406490");
    expect(amagasaki.maps[1].verified).toBe(false);
    expect(amagasaki.maps[1].tip).toMatch(/読んで自分で同意する.*建築基準法の道路種別は載らない/);
    // 西宮市：凡例（市の PDF）で全種別。台帳についての電話・メールは断っている
    expect(nishinomiya.maps[0].url).toBe("https://www.nishi.or.jp/jigyoshajoho/kenchiku/kenchikukijyunhou/dorodaicho.html");
    expect(nishinomiya.maps[0].tip).toMatch(/42条1項1号〜5号・2項・3項・非道路・未判断道路/);
    expect(nishinomiya.maps[1].tip).toMatch(/営利目的に使うことはできない決まり/);
    // 三田市：指定道路（4号・5号・2項）のほかの道路も出る。ネットのデータは最新とは限らない
    expect(sanda.maps[0].tip).toMatch(/指定道路（4号・5号・2項）のほかの道路も含めて出る.*最新の道路種別は審査指導課の窓口で確かめる/);
    // 宝塚市：同意のページ（今の住所）を開く。同意は自分で。南部だけ
    expect(takarazuka.maps).toHaveLength(1);
    expect(takarazuka.maps[0].url).toBe("https://www.city.takarazuka.hyogo.jp/1060685/1060715/1061613/1061615/kaihatsu/1027219/1046062.html");
    expect(takarazuka.maps[0].tip).toMatch(/自分で「すべてに同意した上で閲覧する」を押す.*北部の道路種別は、ネットに出ていない/);
    // 姫路市のリンクの決まり：姫路市へのリンクだと分かるように書く。都市計画区域の外（夢前町・安富町）を書く
    for (const link of himeji.maps) expect(link.label).toContain("姫路市");
    expect(himeji.note).toContain("夢前町・安富町");
    expect(himeji.maps[0].tip).toMatch(/色塗りが無い所は、道路調査をしていない「未判定道路」/);
    // 伊丹市：地図の住所が変わる予定なので、市のページから開く
    expect(itami.maps[0].tip).toContain("2026年12月1日");
    // 高砂市：市のページに調べ方が無く、国の一覧が根拠
    expect(takasago.maps[0].tip).toMatch(/国の「指定道路図・指定道路調書のインターネット公開状況」（令和5年4月1日現在）/);
    expect(kakogawa.maps[0].tip).toContain("最新の情報ではない");
    expect(akashi.maps[0].tip).toMatch(/自分で同意する/);
    expect(ashiya.maps[0].tip).toContain("建築基準法指定道路情報");
    expect(kawanishi.maps[0].url).toBe("https://www.city.kawanishi.hyogo.jp/business/kaihatu/1004316/1009638/index.html");
    // 窓口：市の建築の課（県の土木事務所ではない）
    expect(cities.map((m) => m.contact?.phone)).toEqual(["079-221-2579", "06-6489-6650", "078-918-5046", "0798-35-3704", "0797-38-2114", "072-784-8065", "079-427-9260", "0797-77-2082", "079-443-9035", "072-740-1204", "079-559-5115"]);
    expect(cities.map((m) => m.contact?.fax)).toEqual(["079-221-2548", "06-6489-6597", "078-918-5109", "0798-36-3795", "0797-38-2722", "072-784-8048", "079-441-7101", "0797-74-8997", undefined, undefined, "079-559-7400"]);
    // 明石市・西宮市・加古川市・宝塚市は、道路種別を電話などでは答えない
    expect(cities.filter((m) => m.contact?.noPhoneInquiry).map((m) => m.name)).toEqual(["明石市", "西宮市", "加古川市", "宝塚市"]);
    // 県のデータ（HYOGO）と重なっていない
    for (const c of codes) expect(MUNICIPALITIES.filter((m) => m.codes.includes(c)), c).toHaveLength(1);
  });

  it("奈良県の3市（奈良・橿原・生駒）：市が道路を扱い、地図は市のページ（入口）から開く。道路種別の案内があるのは橿原市だけ", () => {
    const [nara, kashihara, ikoma] = ["29201", "29205", "29209"].map((c) => findMunicipality(c)!);
    expect([nara, kashihara, ikoma].map((m) => m.name)).toEqual(["奈良市", "橿原市", "生駒市"]);
    expect([nara, kashihara, ikoma].map((m) => m.coverage)).toEqual(["none", "partial", "none"]);
    // 地図のサイトを開いて確かめられていないので、物件の位置では開かず、市のページ（入口）だけ
    for (const m of [nara, kashihara, ikoma]) for (const link of m.maps) expect(link.build, `${m.name} ${link.label}`).toBeNull();
    expect(kashihara.maps.map((l) => l.kind)).toEqual(["road_type", "public_road"]);
    expect(kashihara.maps[0].url).toBe("https://www.city.kashihara.nara.jp/soshiki/1010/gyomu/1/2/956.html");
    expect(kashihara.maps[0].tip).toContain("凡例");
    // 奈良市・生駒市は市道の参考の地図だけ（道路種別は建築の課で確かめる）
    expect(nara.maps.map((l) => l.kind)).toEqual(["public_road"]);
    expect(ikoma.maps.map((l) => l.kind)).toEqual(["public_road"]);
    expect(ikoma.maps[0].tip).toMatch(/自分で「同意する」を押す/);
    // 窓口：市の建築の課（県の土木事務所ではない）
    expect([nara, kashihara, ikoma].map((m) => m.contact?.phone)).toEqual(["0742-34-4750", "0744-47-3517", "0743-74-1111"]);
    expect([nara, kashihara, ikoma].map((m) => m.contact?.fax)).toEqual(["0742-32-5057", "0744-24-9718", "0743-74-1221"]);
    // 生駒市は代表番号なので、内線を課の名前に添える
    expect(ikoma.contact?.dept).toContain("内線 3460");
    // 奈良市の都市計画区域は一部（月ヶ瀬・都祁を除く）
    expect(nara.note).toContain("月ヶ瀬地区・都祁地区を除いた区域");
  });

  it("道路種別を電話で答えない窓口は、電話のボタンを控えめにする印が付く", () => {
    // 府県・市のページに、電話などでは答えないと書かれているところ
    for (const code of ["27127", "27141", "27322", "26104", "26208", "25209", "24203", "30208", "29202", "29207", "29449", "25206", "25213", "26204", "28203", "28204", "28210", "28214"]) {
      expect(findMunicipality(code)?.contact?.noPhoneInquiry, code).toBe(true);
    }
    // 書かれていないところ（兵庫県の土木事務所・和歌山県の那賀のほかの窓口・奈良県の郡山と中和・市のページに書かれていない市）には付けない
    for (const code of ["28221", "30202", "30206", "29203", "29206", "25201", "25202", "25203", "25204", "25207", "29201", "29205", "29209", "30201", "28201", "28202", "28206", "28207", "28216", "28217", "28219"]) {
      const m = findMunicipality(code);
      if (m && m.coverage !== "unknown") expect(m.contact?.noPhoneInquiry, code).toBeUndefined();
    }
  });

  it("コードは国土地理院の市区町村表にあり、政令市そのもののコード（26100・27100・27140・28100）は使わない", () => {
    const table = Object.assign({}, ...Object.values(GSI_CODES as Record<string, Record<string, string>>)) as Record<string, string>;
    for (const m of MUNICIPALITIES) if (KINKI.includes(m.pref)) for (const c of m.codes) expect(table[c], `${m.name} ${c}`).toBeDefined();
    for (const c of ["26100", "27100", "27140", "28100"]) expect(table[c]).toBeUndefined();
    expect(table["27127"]).toBe("大阪市 北区");
    expect(table["28221"]).toBe("丹波篠山市");
  });
});

describe("市の道路種別のデータをアプリの中に表示するのは、使ってよいと確かめた市だけ", () => {
  const withRead = MUNICIPALITIES.filter((m) => m.maps.some((l) => l.read));

  it("読み方の設定がある市区町村のうち、許可の一覧（road-read-permission.ts）にある市だけ、結果のリンクに読み方が付く", () => {
    expect(withRead.length).toBe(27);
    for (const m of withRead) {
      const links = buildLinks(m, 36, 139);
      const permitted = !!roadReadPermission(m.codes);
      expect(links.some((l) => l.read), m.name).toBe(permitted);
    }
    // 利用規約で営利目的の利用・無断の複製や転載を禁じている所（埼玉県指定道路図の町・つくば市・行田市・日野市など）は入っていない
    expect(withRead.filter((m) => roadReadPermission(m.codes)).map((m) => m.name)).toEqual(["柏崎市"]);
  });

  it("許可の一覧は、実在の市区町村コードで、根拠・出典・確かめた日がある。その市には読み方の設定がある", () => {
    for (const [code, p] of Object.entries(ROAD_READ_PERMITTED)) {
      const m = findMunicipality(code);
      expect(m, code).toBeDefined();
      expect(m!.maps.some((l) => l.read), m!.name).toBe(true);
      expect(p.basis.length, code).toBeGreaterThan(10);
      expect(p.credit, code).toMatch(/^出典：/);
      expect(p.date, code).toMatch(/^20\d\d-\d\d-\d\d$/);
    }
  });

  it("柏崎市（CC BY 2.1 JP）は、位置指定道路と2項道路を読み、出典を添える", () => {
    const m = findMunicipality("15205")!;
    const link = buildLinks(m, 37.37, 138.56).find((l) => l.read)!;
    expect(link.read!.layers.map((l) => l.label)).toEqual(["位置指定道路（法第42条第1項第5号。2020年3月30日時点）", "法第42条第2項道路（2020年5月7日時点）"]);
    expect(link.read!.credit).toContain("CC BY 2.1 JP");
  });
});

