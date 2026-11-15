import { describe, expect, it } from "vitest";
import GSI_CODES from "./data/gsi-muni-codes.json";
import { CHUBU_PENDING } from "./data/chubu";
import { TOHOKU_PENDING } from "./data/tohoku";
import { KINKI_PENDING } from "./data/kinki";
import { CHUGOKU_PENDING } from "./data/chugoku";
import { SHIKOKU_PENDING } from "./data/shikoku";
import { KYUSHU_PENDING } from "./data/kyushu";
import { HOKKAIDO_PENDING } from "./data/hokkaido";
import { HOKKAIDO_CITIES } from "./data/hokkaido-cities";
import { HOKKAIDO } from "./data/hokkaido-pref";
import { OKINAWA } from "./data/okinawa";
import { KAGOSHIMA, KAGOSHIMA_CITIES } from "./data/kagoshima";
import { MIYAZAKI } from "./data/miyazaki";
import { OITA, OITA_CITIES } from "./data/oita";
import { KUMAMOTO } from "./data/kumamoto";
import { NAGASAKI } from "./data/nagasaki";
import { SAGA } from "./data/saga";
import { FUKUOKA, FUKUOKA_CITIES } from "./data/fukuoka";
import { KOCHI } from "./data/kochi";
import { TOKUSHIMA } from "./data/tokushima";
import { EHIME } from "./data/ehime";
import { KAGAWA, KAGAWA_CITIES } from "./data/kagawa";
import { SHIMANE } from "./data/shimane";
import { TOTTORI } from "./data/tottori";
import { YAMAGUCHI } from "./data/yamaguchi";
import { OKAYAMA, OKAYAMA_CITIES } from "./data/okayama";
import { HIROSHIMA, HIROSHIMA_CITIES } from "./data/hiroshima";
import { MUNI_CODES } from "./muni-codes";
import { buildLinks, findMunicipality, MUNICIPALITIES, type Municipality } from "./municipalities";
import { ROAD_READ_PERMITTED, roadReadPermission } from "./road-read-permission";
import { ALL_PREF_NAMES, ALL_REGIONS, AREA_LABEL, AREA_SHORT, PREF_NAME_RE, PREF_NAMES, REGION_ORDER, REGIONS, SUPPORTED_BOUNDS, isOpenRegion, isSupportedPref, regionOfMuni, regionOfPref, type RegionKey } from "./regions";

describe("対応している地方と都道府県", () => {
  it("全国の8地方・47都道府県（関東1都6県・中部9県・東北6県・近畿2府5県・中国5県・四国4県・九州沖縄8県・北海道）", () => {
    expect(REGION_ORDER).toEqual(["kanto", "chubu", "tohoku", "kinki", "chugoku", "shikoku", "kyushu", "hokkaido"]);
    expect(Object.keys(REGIONS.kanto.prefs)).toHaveLength(7);
    expect(Object.keys(REGIONS.chubu.prefs)).toHaveLength(9);
    expect(Object.keys(REGIONS.tohoku.prefs)).toHaveLength(6);
    expect(Object.keys(REGIONS.kinki.prefs)).toHaveLength(7);
    expect(Object.keys(REGIONS.chugoku.prefs)).toHaveLength(5);
    expect(Object.keys(REGIONS.shikoku.prefs)).toHaveLength(4);
    expect(Object.keys(REGIONS.kyushu.prefs)).toHaveLength(8);
    expect(Object.keys(REGIONS.hokkaido.prefs)).toHaveLength(1);
    expect(Object.keys(PREF_NAMES)).toHaveLength(47);
    expect(PREF_NAMES["22"]).toBe("静岡県");
    expect(PREF_NAMES["04"]).toBe("宮城県");
    expect(PREF_NAMES["27"]).toBe("大阪府");
    expect(PREF_NAMES["01"]).toBe("北海道");
    expect(PREF_NAMES["34"]).toBe("広島県");
    expect(PREF_NAMES["47"]).toBe("沖縄県");
    // 全部の都道府県に対応したので、対応エリアの言い方は「全国47都道府県」「全国」
    // （一部の地方だけのときは「関東1都6県・中部9県…」のように、都・府・県を名前の最後の字で数えて並べる）
    expect(AREA_LABEL).toBe("全国47都道府県");
    expect(AREA_SHORT).toBe("全国");
  });

  it("コードから地方を引く", () => {
    expect(regionOfPref("13")).toBe("kanto");
    expect(regionOfMuni("22101")).toBe("chubu");
    expect(regionOfMuni("04101")).toBe("tohoku");
    expect(regionOfMuni("27127")).toBe("kinki");
    expect(regionOfMuni("34101")).toBe("chugoku");
    expect(regionOfMuni("39201")).toBe("shikoku");
    expect(regionOfMuni("47201")).toBe("kyushu");
    expect(regionOfMuni("01101")).toBe("hokkaido");
    expect(regionOfMuni("99101")).toBeUndefined(); // 都道府県に無い番号
    expect(isSupportedPref("23101")).toBe(true);
    expect(isSupportedPref("01100")).toBe(true);
    expect(isSupportedPref("99101")).toBe(false);
  });

  it("住所の先頭が対応エリアか", () => {
    expect(PREF_NAME_RE.test("静岡県浜松市中央区")).toBe(true);
    expect(PREF_NAME_RE.test("東京都千代田区")).toBe(true);
    expect(PREF_NAME_RE.test("宮城県仙台市青葉区")).toBe(true);
    expect(PREF_NAME_RE.test("大阪府大阪市")).toBe(true);
    expect(PREF_NAME_RE.test("広島県広島市")).toBe(true);
    expect(PREF_NAME_RE.test("北海道札幌市中央区")).toBe(true);
    expect(PREF_NAME_RE.test("沖縄県那覇市")).toBe(true);
    // 都道府県から始まらない住所は当たらない
    expect(PREF_NAME_RE.test("広島市中区")).toBe(false);
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

  it("近畿の227市町村は全部登録済み（府県が扱う市町村・政令市と、市が道路を扱う38市）。調査中は 0", () => {
    const done: Record<string, number> = {};
    for (const m of MUNICIPALITIES) if (KINKI.includes(m.pref) && m.coverage !== "unknown") done[m.pref] = (done[m.pref] ?? 0) + 1;
    expect(done).toEqual({ 三重県: 29, 滋賀県: 19, 京都府: 26, 大阪府: 43, 兵庫県: 41, 奈良県: 39, 和歌山県: 30 });
    expect(KINKI_PENDING).toHaveLength(0);
    // 調査中に残るのは、市が道路を扱う市（特定行政庁など）だけ
    expect(KINKI_PENDING.every((m) => m.name.endsWith("市"))).toBe(true);
    expect([...new Set(KINKI_PENDING.map((m) => m.pref))]).toEqual([]);
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

  it("大阪府の15市：市が道路を扱う。市のサイトの個別のページへはつながず、市の公式ページに載っている地図のサービスの入口を開く", () => {
    const codes = ["27202", "27203", "27204", "27205", "27207", "27209", "27210", "27211", "27212", "27215", "27219", "27220", "27222", "27223", "27227"];
    const cities = codes.map((c) => findMunicipality(c)!);
    const by = Object.fromEntries(cities.map((m) => [m.name, m]));
    expect(cities.map((m) => m.name)).toEqual(["岸和田市", "豊中市", "池田市", "吹田市", "高槻市", "守口市", "枚方市", "茨木市", "八尾市", "寝屋川市", "和泉市", "箕面市", "羽曳野市", "門真市", "東大阪市"]);
    // 全種別：市のページ・手引きで載る種別を確かめられた3市。非公開：ネットに道路種別の地図が無い4市
    expect(cities.filter((m) => m.coverage === "full").map((m) => m.name)).toEqual(["吹田市", "守口市", "枚方市"]);
    expect(cities.filter((m) => m.coverage === "none").map((m) => m.name)).toEqual(["高槻市", "茨木市", "寝屋川市", "箕面市"]);
    expect(cities.filter((m) => m.coverage === "partial").map((m) => m.name)).toEqual(["岸和田市", "豊中市", "池田市", "八尾市", "和泉市", "羽曳野市", "門真市", "東大阪市"]);
    // 茨木市・寝屋川市は地図なし（窓口だけ）。高槻市・箕面市は市道の参考の地図だけ
    expect(by["茨木市"].maps).toEqual([]);
    expect(by["寝屋川市"].maps).toEqual([]);
    expect(by["高槻市"].maps.map((l) => l.kind)).toEqual(["public_road"]);
    expect(by["箕面市"].maps.map((l) => l.kind)).toEqual(["public_road"]);
    // 個別のページへのリンクを制限する市（枚方・守口・茨木・八尾・寝屋川・岸和田）のサイトへは、つながない
    const restricted = /city\.(hirakata|moriguchi|ibaraki|yao|neyagawa)\.osaka\.jp|city\.kishiwada\.lg\.jp/;
    for (const m of cities) for (const link of m.maps) expect(link.build ? link.build(34.7, 135.5) : link.url!, `${m.name} ${link.label}`).not.toMatch(restricted);
    // 地図のサービスの入口（wagmap・ALANDIS・Sonicweb・geocloud）。開いて確かめられていないので「確認済み」にしない
    const service = /^https:\/\/(www2\.wagmap\.jp|webgis\.alandis\.jp|www\.sonicweb-asp\.jp|gis\.city\.toyonaka\.osaka\.jp)\//;
    for (const m of cities) {
      for (const link of m.maps.filter((l) => l.kind === "road_type")) {
        expect(link.build ? link.build(34.7, 135.5) : link.url!, m.name).toMatch(service);
        expect(link.verified, m.name).toBe(false);
        expect(link.tip, m.name).toMatch(/MICHILU (の確認では|は中)/);
      }
    }
    expect(by["八尾市"].maps[0].url).toBe("https://www.sonicweb-asp.jp/yao/agreement?theme=th_16");
    expect(by["守口市"].maps[0].url).toBe("https://www.sonicweb-asp.jp/moriguchi/");
    // 豊中市だけは、市のページのリンクと同じ形に物件の位置を付けて開く
    expect(cities.flatMap((m) => m.maps.filter((l) => l.build).map(() => m.name))).toEqual(["豊中市"]);
    expect(by["豊中市"].maps[0].build?.(34.781545, 135.46976)).toBe("https://gis.city.toyonaka.osaka.jp/webgis/?mp=21&bg=BG0&vlf=-1&ar=1&z=18&ll=34.781545%2C135.469760");
    // 載る種別を、市のページ・手引きのとおりに書く
    expect(by["吹田市"].maps[0].tip).toMatch(/第42条第1項第1号〜第5号の道路と第2項の道路.*令和3年4月現在/);
    expect(by["守口市"].maps[0].tip).toMatch(/濃い緑＝42条1項1号、黄緑＝1項2号、緑＝1項3号、オレンジ＝1項4号、黄＝1項5号、水色＝42条2項/);
    expect(by["枚方市"].maps[0].tip).toMatch(/42条1項1号〜5号・2項.*最小幅員が4m.*1項1号の道路/);
    expect(by["八尾市"].maps[0].tip).toMatch(/42条1項5号の位置指定道路・42条2項の道路・43条2項の空地・道路扱いなし/);
    expect(by["門真市"].maps[0].tip).toMatch(/1号・2号・4号・5号道路と2項道路（3号道路は挙がっていない）/);
    expect(by["羽曳野市"].note).toMatch(/全部の道路種別の情報を出しているわけではない/);
    expect(by["岸和田市"].maps[0].tip).toContain("2026年3月26日");
    // 窓口：市の建築の課
    expect(cities.map((m) => m.contact?.phone)).toEqual(["072-423-9571", "06-6858-2860", "072-754-6339", "06-6384-1972", "072-674-7567", "06-6992-1736", "072-841-1432", "072-620-1661", "072-924-8544", "072-825-2765", "0725-99-8141", "072-724-6972", "072-958-1111", "06-6902-6346", "06-4309-3240"]);
    // 道路種別を電話などでは答えないと市のページに書かれている6市
    expect(cities.filter((m) => m.contact?.noPhoneInquiry).map((m) => m.name)).toEqual(["豊中市", "吹田市", "高槻市", "守口市", "門真市", "東大阪市"]);
    for (const c of codes) expect(MUNICIPALITIES.filter((m) => m.codes.includes(c)), c).toHaveLength(1);
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
    for (const code of ["27127", "27141", "27322", "26104", "26208", "25209", "24203", "30208", "29202", "29207", "29449", "25206", "25213", "26204", "28203", "28204", "28210", "28214", "27203", "27205", "27207", "27209", "27223", "27227"]) {
      expect(findMunicipality(code)?.contact?.noPhoneInquiry, code).toBe(true);
    }
    // 書かれていないところ（兵庫県の土木事務所・和歌山県の那賀のほかの窓口・奈良県の郡山と中和・市のページに書かれていない市）には付けない
    for (const code of ["28221", "30202", "30206", "29203", "29206", "25201", "25202", "25203", "25204", "25207", "29201", "29205", "29209", "30201", "28201", "28202", "28206", "28207", "28216", "28217", "28219", "27202", "27204", "27210", "27211", "27212", "27215", "27219", "27220", "27222"]) {
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

// 全国へ広げる土台（docs/features.md の 129）。残りの4地方は「準備中」（regions.json の preparing）で足し、国のデータを作って確かめ終えた
// 2026-11-15 に preparing を外して対応エリアに入れた（docs/features.md の 136）。準備中の地方を作る仕組み（preparing）は残してある
describe("全国対応で足した地方（中国・四国・九州沖縄・北海道）", () => {
  // 地方ごとの市町村：調査中の一覧（data/<地方>.ts）と、調べ終えて登録した道県（data/<道県>.ts）を合わせたもの
  const NEW: [RegionKey, typeof CHUGOKU_PENDING, number][] = [
    ["chugoku", [...HIROSHIMA, ...OKAYAMA, ...YAMAGUCHI, ...TOTTORI, ...SHIMANE, ...HIROSHIMA_CITIES, ...OKAYAMA_CITIES, ...CHUGOKU_PENDING], 107],
    ["shikoku", [...KAGAWA, ...EHIME, ...TOKUSHIMA, ...KOCHI, ...KAGAWA_CITIES, ...SHIKOKU_PENDING], 95],
    ["kyushu", [...FUKUOKA, ...SAGA, ...NAGASAKI, ...KUMAMOTO, ...OITA, ...MIYAZAKI, ...KAGOSHIMA, ...OKINAWA, ...FUKUOKA_CITIES, ...KAGOSHIMA_CITIES, ...OITA_CITIES, ...KYUSHU_PENDING], 274],
    ["hokkaido", [...HOKKAIDO, ...HOKKAIDO_CITIES, ...HOKKAIDO_PENDING], 179],
  ];
  const table = Object.assign({}, ...Object.values(GSI_CODES as Record<string, Record<string, string>>)) as Record<string, string>;

  it("地方の一覧（regions.json）は全国の8地方・47都道府県。データを作るスクリプトは準備中の地方も作る", () => {
    expect(Object.keys(ALL_REGIONS)).toEqual(["kanto", "chubu", "tohoku", "kinki", "chugoku", "shikoku", "kyushu", "hokkaido"]);
    expect(Object.keys(ALL_PREF_NAMES)).toHaveLength(47);
    expect(new Set(Object.keys(ALL_PREF_NAMES))).toEqual(new Set(Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"))));
    expect(ALL_PREF_NAMES["01"]).toBe("北海道");
    expect(ALL_PREF_NAMES["34"]).toBe("広島県");
    expect(ALL_PREF_NAMES["47"]).toBe("沖縄県");
    expect(ALL_REGIONS.kyushu.name).toBe("九州・沖縄");
    // 範囲：与那国島（西の端 122.93）・波照間島（南の端 24.04）・択捉島（東の端 148.9）・宗谷岬（北の端 45.52）が入る
    const b = Object.values(ALL_REGIONS).map((r) => r.bounds);
    expect(Math.min(...b.map((x) => x[0][0]))).toBeLessThan(122.93);
    expect(Math.min(...b.map((x) => x[0][1]))).toBeLessThan(24.04);
    expect(Math.max(...b.map((x) => x[1][0]))).toBeGreaterThan(148.9);
    expect(Math.max(...b.map((x) => x[1][1]))).toBeGreaterThan(45.53);
  });

  it("市町村の数：中国 107・四国 95・九州沖縄 274・北海道 179（政令市は区のコードをまとめて1つ。北方領土の6村は入れない）", () => {
    for (const [, list, n] of NEW) expect(list).toHaveLength(n);
    const count = (pref: string) => NEW.flatMap(([, l]) => l).filter((m) => m.pref === pref).length;
    expect(count("広島県")).toBe(23);
    expect(count("福岡県")).toBe(60);
    expect(count("沖縄県")).toBe(41);
    const find = (name: string) => NEW.flatMap(([, l]) => l).find((m) => m.name === name)!;
    expect(find("札幌市").codes).toHaveLength(10);
    expect(find("岡山市").codes).toHaveLength(4);
    expect(find("広島市").codes).toHaveLength(8);
    expect(find("北九州市").codes).toHaveLength(7);
    expect(find("福岡市").codes).toHaveLength(7);
    expect(find("熊本市").codes).toHaveLength(5);
    // 調査中の一覧の市町村は、調査中（coverage: unknown）で地図なし
    for (const m of [...CHUGOKU_PENDING, ...SHIKOKU_PENDING, ...KYUSHU_PENDING, ...HOKKAIDO_PENDING]) expect([m.coverage, m.maps.length], m.name).toEqual(["unknown", 0]);
    // コードは重ならず、国土地理院の市区町村表にある。政令市そのもののコードと北方領土の6村は表に入れていない
    const codes = NEW.flatMap(([, l]) => l).flatMap((m) => m.codes);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(table[c], c).toBeDefined();
    for (const c of ["01100", "33100", "34100", "40100", "40130", "43100", "01695", "01696", "01697", "01698", "01699", "01700"]) expect(table[c], c).toBeUndefined();
    expect(table["01101"]).toBe("札幌市 中央区");
    expect(table["40133"]).toBe("福岡市 中央区");
    expect(table["47201"]).toBe("那覇市");
  });

  it("準備中の地方は、アプリの対応エリアに入れない（市町村の一覧・コード表・地方の一覧とも）。準備を終えた地方は全部入る", () => {
    // 4地方とも公開した（準備中の地方はもう無い）
    expect(Object.values(ALL_REGIONS).filter((r) => r.preparing)).toEqual([]);
    for (const [key, list] of NEW) {
      const open = isOpenRegion(key);
      expect(open).toBe(!ALL_REGIONS[key].preparing);
      expect(REGION_ORDER.includes(key)).toBe(open);
      for (const [code, name] of Object.entries(ALL_REGIONS[key].prefs)) {
        expect(code in PREF_NAMES, name).toBe(open);
        expect(name in MUNI_CODES, name).toBe(open);
        expect(PREF_NAME_RE.test(`${name}のどこか`), name).toBe(open);
      }
      // 市町村は、地方を開いたら全部引ける（調査中の一覧の市町村も、調べ終えて登録した市町村も）
      for (const m of list) expect(findMunicipality(m.codes[0]) !== undefined, m.name).toBe(open);
    }
    // 対応している都道府県のコード表は、今までどおり全部使う
    for (const name of Object.values(PREF_NAMES)) expect(MUNI_CODES[name], name).toBeDefined();
    expect(Object.keys(MUNI_CODES)).toHaveLength(Object.keys(PREF_NAMES).length);
  });
});

describe("岡山県の、市が扱う市（登録した市）", () => {
  it("岡山市：市の地図情報の参考図（1項2号〜5号・2項）。電話・ファックス・メールでは答えない", () => {
    const m = OKAYAMA_CITIES.find((x) => x.name === "岡山市")!;
    expect(m.codes).toEqual(["33101", "33102", "33103", "33104"]);
    // 1項1号は載らないので「一部の種別」
    expect(m.coverage).toBe("partial");
    expect(m.maps[0].kind).toBe("designated_only");
    // 市のページと同じリンク（利用規約の同意の画面）。同意の先は開かない
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("http://www.gis.pref.okayama.jp/okayamacity/Agreement?IsPost=False&MapId=60000&RequestPage=%2fokayamacity%2fPositionSelect%3fmid%3d60000");
    expect(m.maps[0].tip).toContain("自分で同意して進み");
    expect(m.maps[0].tip).toContain("1項1号");
    expect(m.contact?.phone).toBe("086-803-1446");
    expect(m.contact?.noPhoneInquiry).toBe(true);
    expect(CHUGOKU_PENDING.filter((x) => x.pref === "岡山県").map((x) => x.name)).toEqual(["津山市", "玉野市", "笠岡市", "総社市", "新見市"]);
  });

  it("倉敷市：市の「倉敷市建築基準法指定道路図」（2025年10月から）。どの種別まで載るかは確かめられていないので「一部」。電話では答えない", () => {
    const m = OKAYAMA_CITIES.find((x) => x.name === "倉敷市")!;
    expect(m.codes).toEqual(["33202"]);
    expect(m.coverage).toBe("partial");
    expect(m.maps.map((x) => x.kind)).toEqual(["road_type", "public_road"]);
    // 市のページと同じリンク（利用規約の同意の画面）。同意の先は開かない
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("http://www.gis.pref.okayama.jp/kurashiki/Agreement?IsPost=False&MapId=70001&RequestPage=%2fkurashiki%2fPositionSelect%3fmid%3d70001");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("自分で同意して進み");
    // 確かめられていないことは、そう書く
    expect(m.maps[0].tip).toContain("どの種別まで載っているかは、MICHILU では確かめられていない");
    // 市道の地図は、市のページ「倉敷地理情報」から
    expect(m.maps[1].url).toBe("https://www.city.kurashiki.okayama.jp/cityinfo/digital/1011799/1002306.html");
    expect(m.contact?.phone).toBe("086-426-3501");
    expect(m.contact?.fax).toBe("086-427-3536");
    expect(m.contact?.noPhoneInquiry).toBe(true);
  });
});

describe("鹿児島県の、市が扱う市（登録した市）", () => {
  it("鹿児島市：市の地図（かごしまiマップ）の「市道網図・建築基準法道路」。市道は路線名で出るので、市の表で種別を読む", () => {
    const m = KAGOSHIMA_CITIES.find((x) => x.name === "鹿児島市")!;
    expect(m.codes).toEqual(["46201"]);
    expect(m.coverage).toBe("full");
    expect(m.maps[0].kind).toBe("road_type");
    // 市の資料「建築基準法第42条に基づく道路種別の確認について」に載っているリンク（利用条件の同意の先は開かない）
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www2.wagmap.jp/kagoshima/PositionSelect?mid=9");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("自分で「同意する」を押して進む");
    // 市道は路線名で出る。種別は市の表で読む。国道・県道は出ない
    expect(m.maps[0].tip).toContain("幅員4m以上は1項1号");
    expect(m.maps[0].tip).toContain("国道・県道は地図に出ない");
    expect(m.maps[0].tip).toContain("無印");
    // 審査係（位置指定道路は指導係）。電話を断ってはいないので、電話のボタンは普通に出す
    expect(m.contact?.phone).toBe("099-216-1359");
    expect(m.contact?.fax).toBe("099-216-1389");
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
    expect(m.contact?.note).toContain("できる限り来庁");
    expect(m.contact?.note).toContain("099-216-1516");
    expect(KYUSHU_PENDING.filter((x) => x.pref === "鹿児島県").map((x) => x.name)).toEqual(["鹿屋市", "薩摩川内市", "霧島市"]);
  });
});

describe("大分県の、市が扱う市（登録した市）", () => {
  it("大分市：市の地図（おおいたマップ地図情報）の「道路情報他」の指定道路図。指定道路調書の内容の問い合わせは来庁して", () => {
    const m = OITA_CITIES.find((x) => x.name === "大分市")!;
    expect(m.codes).toEqual(["44201"]);
    expect(m.coverage).toBe("full");
    expect(m.maps[0].kind).toBe("road_type");
    // 市のページと同じ入口のリンク（地図の中は開いて確かめていない）
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www2.wagmap.jp/oitacity/Portal");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("「道路情報他」の地図を選び");
    // 指定道路（1項2号〜5号・2項など）のほかは、参考の表示
    expect(m.maps[0].tip).toContain("そのほかの道路は、おおよその位置と種別を参考として表示");
    expect(m.maps[0].tip).toContain("整理番号（判定番号）");
    expect(m.contact?.phone).toBe("097-537-5635");
    expect(m.contact?.fax).toBe("097-534-6201");
    // 電話を断っているのは、指定道路調書の内容の問い合わせだけ
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
    expect(m.contact?.note).toContain("電話では受け付けていない");
    expect(KYUSHU_PENDING.filter((x) => x.pref === "大分県").map((x) => x.name)).toEqual(["日田市", "佐伯市", "宇佐市"]);
  });

  it("別府市：市のページ「建築基準法の道路種別」（利用上の注意の画面）。同意の先は開かない", () => {
    const m = OITA_CITIES.find((x) => x.name === "別府市")!;
    expect(m.codes).toEqual(["44202"]);
    expect(m.coverage).toBe("full");
    expect(m.maps[0].kind).toBe("road_type");
    expect(m.maps[0].build).toBeNull();
    // 「上記事項に同意しPDFを利用する」の手前の画面
    expect(m.maps[0].url).toBe("https://www.city.beppu.oita.jp/seikatu/sumai_tosi/sumai/kijunhou_douro.html");
    expect(m.maps[0].tip).toContain("自分で「上記事項に同意しPDFを利用する」を押して進む");
    // 紫色＝未調査、×＝建築基準法上の道路の取り扱いになっていない
    expect(m.maps[0].tip).toContain("紫色の道路は未調査");
    expect(m.maps[0].tip).toContain("×の道路は、建築基準法上の道路の取り扱いになっていない");
    expect(m.contact?.phone).toBe("0977-21-1487");
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
  });

  it("中津市：市ホームページの「道路種別の電子閲覧」（1項3号・1項5号・2項だけ）。不動産取引の資料には使えない・電話は断っている", () => {
    const m = OITA_CITIES.find((x) => x.name === "中津市")!;
    expect(m.codes).toEqual(["44203"]);
    // 国道・県道・市道などは表示していないので「一部の種別」
    expect(m.coverage).toBe("partial");
    expect(m.maps[0].kind).toBe("designated_only");
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www.city-nakatsu.jp/doc/2018020500071/");
    // 市の決まり：中津市のホームページだと明記する
    expect(m.maps[0].label).toContain("中津市ホームページ");
    expect(m.maps[0].tip).toContain("MICHILU はフォームの先を開いていない");
    expect(m.maps[0].tip).toContain("国道・県道・市道・農道・里道・管理道などは表示していない");
    expect(m.maps[0].tip).toContain("不動産取引のための資料");
    expect(m.contact?.phone).toBe("0979-62-9029");
    expect(m.contact?.noPhoneInquiry).toBe(true);
  });
});

describe("香川県の、市が扱う市（登録した市）", () => {
  it("高松市：市の地図「たかまっぷ」の道路種別マップ。規約に合わせてトップページを開く。営利目的の利用を禁じていることを書く", () => {
    const m = KAGAWA_CITIES.find((x) => x.name === "高松市")!;
    expect(m.codes).toEqual(["37201"]);
    expect(m.coverage).toBe("full");
    expect(m.maps).toHaveLength(1);
    expect(m.maps[0].kind).toBe("road_type");
    // 利用規約：「たかまっぷ」のトップページはリンクフリー（「たかまっぷ」へのリンクだと明記する）
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www.city.takamatsu.kagawa.jp/kurashi/takamap/index.html");
    expect(m.maps[0].label).toContain("たかまっぷ");
    expect(m.maps[0].tip).toContain("自分で「同意する」を押して進む");
    // 市のページの色の説明
    expect(m.maps[0].tip).toContain("緑色の両矢印線＝1項1号");
    expect(m.maps[0].tip).toContain("茶色の両矢印線＝法外道路");
    // 規約の禁止事項
    expect(m.maps[0].tip).toContain("営利目的でサービスを使うこと");
    expect(m.contact?.phone).toBe("087-839-2488");
    expect(m.contact?.fax).toBe("087-839-2452");
    expect(SHIKOKU_PENDING.filter((x) => x.pref === "香川県")).toEqual([]);
  });
});

describe("福岡県の、市が扱う市（登録した市）", () => {
  it("北九州市：市の「建築基準法道路種別地図」が物件の位置で開く。判定のくわしいことは電話では答えない", () => {
    const m = FUKUOKA_CITIES.find((x) => x.name === "北九州市")!;
    expect(m.codes).toEqual(["40101", "40103", "40105", "40106", "40107", "40108", "40109"]);
    expect(m.coverage).toBe("full");
    expect(m.maps[0].kind).toBe("road_type");
    // ArcGIS Experience の地図ウィジェット（widget_6）に、経度・緯度・縮尺を渡す（2026-11-15 に、その場所が中心に開くことを確かめた）
    expect(buildLinks(m, 33.8834, 130.8752)[0].url).toBe("https://experience.arcgis.com/experience/6e6a6058a22a4e998a5e5470fc429a8e/#widget_6=center:130.875200%2C33.883400%2C4326,scale:2500");
    expect(m.maps[0].tip).toContain("自分で「上記の利用条件に同意します」に印を付けて");
    expect(m.maps[0].tip).toContain("1号道路・2号道路は、原則マーキングされていない");
    expect(m.maps[0].tip).toContain("不動産取引など権利・義務が発生するものや建築確認申請の資料には使えない");
    expect(m.contact?.phone).toBe("093-582-2535");
    expect(m.contact?.noPhoneInquiry).toBe(true);
    expect(KYUSHU_PENDING.filter((x) => x.pref === "福岡県").map((x) => x.name)).toEqual(["福岡市", "大牟田市", "久留米市"]);
  });
});

describe("北海道の、市が扱う市（登録した市）", () => {
  it("札幌市：地図情報サービスの「道路」で全種別。市の決まりに合わせて、市のトップページから進む。電話では答えない", () => {
    const m = HOKKAIDO_CITIES.find((x) => x.name === "札幌市")!;
    expect(m.codes).toHaveLength(10);
    expect(m.coverage).toBe("full");
    expect(m.maps[0].kind).toBe("road_type");
    // 市は、トップページ以外へリンクするときは担当課へ問い合わせるよう求めている（「リンク・著作権・免責事項」）
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www.city.sapporo.jp/");
    expect(m.maps[0].label).toContain("札幌市公式ホームページのトップページから進む");
    expect(m.maps[0].tip).toContain("自分で同意して進む");
    expect(m.maps[0].tip).toContain("建築基準法の道路（最新情報）");
    expect(m.contact?.phone).toBe("011-211-2864");
    expect(m.contact?.noPhoneInquiry).toBe(true);
    // 登録した市は、調査中の一覧から外してある
    expect(HOKKAIDO_PENDING.map((x) => x.name)).not.toContain("札幌市");
    expect(HOKKAIDO_PENDING).toHaveLength(36);
  });

  it("旭川市：市ホームページの「旭川市建築行政地図情報システム」（指定道路図）。ユーザー登録と同意は使う人が自分でする", () => {
    const m = HOKKAIDO_CITIES.find((x) => x.name === "旭川市")!;
    expect(m.codes).toEqual(["01204"]);
    expect(m.coverage).toBe("full");
    expect(m.maps[0].kind).toBe("road_type");
    expect(m.maps[0].build).toBeNull();
    // 規約と条件のページ（「規約と条件に同意して利用する」の手前）
    expect(m.maps[0].url).toBe("https://www.city.asahikawa.hokkaido.jp/500/522/53901/5439004/d079307.html");
    // 市の決まり：旭川市ホームページへのリンクだと明記する
    expect(m.maps[0].label).toContain("旭川市ホームページ");
    expect(m.maps[0].tip).toContain("本名でのユーザー登録が要る");
    expect(m.maps[0].tip).toContain("国道・道道は表示していない");
    expect(m.maps[0].tip).toContain("取引の資料にするもの");
    expect(m.contact?.phone).toBe("0166-25-8597");
    expect(m.contact?.fax).toBe("0166-27-3466");
    // 電話は断っていない（位置が分かる資料を FAX・メールで示す）
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
    expect(m.contact?.note).toContain("FAX・メールなどで示す");
    expect(HOKKAIDO_PENDING.map((x) => x.name)).not.toContain("旭川市");
  });

  it("函館市：市の地図（ArcGIS）が、物件の位置で、道路種別の層を出して開く。市道の地図も位置で開く。電話での確認は原則しない", () => {
    const m = HOKKAIDO_CITIES.find((x) => x.name === "函館市")!;
    expect(m.codes).toEqual(["01202"]);
    expect(m.coverage).toBe("full");
    expect(m.maps.map((x) => x.kind)).toEqual(["road_type", "public_road"]);
    // 函館市役所のあたり。center=経度,緯度,4326 と scale、道路種別の4つの層（showLayers）を渡す（2026-11-15 に、その場所が画面に入ることを確かめた）
    const url = m.maps[0].build!(41.7687, 140.729);
    expect(url).toBe(
      "https://hakodate-tokei.maps.arcgis.com/apps/webappviewer/index.html?id=24f3abd1e4de4d649aee5ee73fbc6d10&center=140.729000,41.768700,4326&scale=2500&showLayers=" +
        encodeURIComponent("道路種別_建築基準法v2_503;道路種別_建築基準法v2_3271;道路種別_建築基準法v2_3427;道路種別_建築基準法v2_166"),
    );
    expect(m.maps[0].verified).toBe(true);
    expect(m.maps[0].tip).toContain("自分で「上記の利用条件に同意します」に印を付けて OK を押す");
    // 層が出ないときの手順と、規約の禁止事項も書く
    expect(m.maps[0].tip).toContain("レイヤーリスト");
    expect(m.maps[0].tip).toContain("営利目的での利用");
    // 市道の地図（ArcGIS Experience の地図ウィジェット widget_6）
    expect(m.maps[1].build!(41.7687, 140.729)).toBe("https://experience.arcgis.com/experience/63b98f8dd0cb41c49fef5f987a295e84/#widget_6=center:140.729000%2C41.768700%2C4326,scale:2500");
    expect(m.contact?.phone).toBe("0138-21-3394");
    expect(m.contact?.noPhoneInquiry).toBe(true);
    expect(HOKKAIDO_PENDING.map((x) => x.name)).not.toContain("函館市");
  });
});

describe("広島県（県が扱う15市町と広島市を登録。市が扱う残りの7市は調査中）", () => {
  it("県が扱う15市町：指定道路図（参考図）のある12市町と、都市計画区域の無い3町", () => {
    expect(HIROSHIMA).toHaveLength(15);
    const withMap = HIROSHIMA.filter((m) => m.maps.length > 0);
    expect(withMap.map((m) => m.name).sort()).toEqual(["世羅町", "北広島町", "坂町", "大竹市", "安芸高田市", "府中市", "府中町", "庄原市", "海田町", "熊野町", "竹原市", "江田島市"].sort());
    for (const m of withMap) {
      expect(m.coverage, m.name).toBe("partial");
      // 県はリンクを原則トップページへと求めている（県「このホームページについて」）ので、県のトップページを開き、市町のページまでの道順を書く
      expect(m.maps[0].kind).toBe("designated_only");
      expect(m.maps[0].build).toBeNull();
      expect(m.maps[0].url, m.name).toBe("https://www.pref.hiroshima.lg.jp/");
      expect(m.maps[0].label).toContain("広島県のトップページから進む");
      expect(m.maps[0].tip).toContain(`「${m.name}」の順に進む`);
      expect(m.maps[0].tip).toContain("自分で同意");
      expect(m.maps[0].tip).toContain("不動産取引のための資料には使えない");
    }
    expect(HIROSHIMA.filter((m) => m.coverage === "outside").map((m) => m.name).sort()).toEqual(["大崎上島町", "安芸太田町", "神石高原町"].sort());
    // 県の指定道路図のことは電話・FAX・メールでは答えない決まり（県の注意）
    for (const m of HIROSHIMA) expect(m.contact?.noPhoneInquiry, m.name).toBe(true);
  });

  it("受け持ちの建設事務所：西部 10・東部 3・北部 2。市が扱う市のうち、まだの7市は調査中の一覧に残る", () => {
    const by = (word: string) => HIROSHIMA.filter((m) => m.contact!.dept.includes(word)).map((m) => m.name);
    expect(by("西部建設事務所")).toHaveLength(10);
    expect(by("東部建設事務所").sort()).toEqual(["世羅町", "府中市", "神石高原町"].sort());
    expect(by("北部建設事務所").sort()).toEqual(["安芸高田市", "庄原市"].sort());
    expect(CHUGOKU_PENDING.filter((m) => m.pref === "広島県").map((m) => m.name)).toEqual(["呉市", "三原市", "尾道市", "福山市", "三次市", "東広島市", "廿日市市"]);
  });

  it("広島市：道路のことは区ごとの区役所 建築課。市の決まりに合わせて、地図は市のトップページから進む", () => {
    const m = HIROSHIMA_CITIES.find((x) => x.name === "広島市")!;
    expect(m.codes).toEqual(["34101", "34102", "34103", "34104", "34105", "34106", "34107", "34108"]);
    // 道路種別の地図はネットに見つからなかった（道路の幅と名称の地図だけ）
    expect(m.coverage).toBe("none");
    expect(m.maps.map((l) => l.kind)).toEqual(["public_road"]);
    // 市は「広島市ホームページのトップページに対してリンクをお願いします」と書いている（リンク・著作権・免責事項）
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www.city.hiroshima.lg.jp/");
    expect(m.maps[0].label).toContain("広島市ホームページのトップページから進む");
    expect(m.maps[0].tip).toContain("種別を示す地図ではない");
    // 8区とも、区役所の建築課（電話・FAX）。区の名前と所在地が合っている
    const wards = { "34101": "中区", "34102": "東区", "34103": "南区", "34104": "西区", "34105": "安佐南区", "34106": "安佐北区", "34107": "安芸区", "34108": "佐伯区" };
    expect(Object.keys(m.contactByCode!)).toEqual(Object.keys(wards));
    for (const [code, ward] of Object.entries(wards)) {
      const c = m.contactByCode![code];
      expect(c.dept, ward).toBe(`${ward}役所 建築課（${c.dept.match(/（(.+)）$/)![1]}）`);
      expect(c.dept.match(/（(.+)）$/)![1].startsWith(ward), ward).toBe(true);
      expect(c.phone, ward).toMatch(/^082-\d{3}-\d{4}$/);
      expect(c.fax, ward).toMatch(/^082-\d{3}-\d{4}$/);
    }
    expect(new Set(Object.values(m.contactByCode!).map((c) => c.phone)).size).toBe(8);
  });
});

// 全国対応で足した県のうち、決まった形（県の事務所が受け持つ市町村・都市計画区域の無い市町村・市が扱う市は調査中）で登録した県。
// 県ごとの出典は docs/<県>-research.md
describe("中国・四国・九州沖縄・北海道で登録した県（県が扱う市町村）", () => {
  /** offices は「窓口の名前に入っている言葉 → 市町村の数」。officeIn が note のときは、注に入っている言葉で数える */
  type Case = { pref: string; list: Municipality[]; pending: Municipality[]; total: number; outside: string[]; cities: string[]; offices: Record<string, number>; officeIn?: "note" };
  const CASES: Case[] = [
    {
      pref: "岡山県",
      list: OKAYAMA,
      pending: CHUGOKU_PENDING,
      total: 20,
      outside: ["瀬戸内市", "新庄村", "奈義町", "西粟倉村", "久米南町", "美咲町"],
      cities: ["津山市", "玉野市", "笠岡市", "総社市", "新見市"],
      offices: { 備前県民局: 5, 備中県民局: 6, 美作県民局: 9 },
    },
    {
      pref: "山口県",
      list: YAMAGUCHI,
      pending: CHUGOKU_PENDING,
      total: 10,
      outside: ["上関町", "阿武町"],
      // 特定行政庁の7市と、限定特定行政庁の長門市・山陽小野田市
      cities: ["下関市", "宇部市", "山口市", "萩市", "防府市", "岩国市", "長門市", "周南市", "山陽小野田市"],
      offices: { 柳井土木建築事務所: 6, 周南土木建築事務所: 2, 宇部土木建築事務所: 2 },
    },
    {
      pref: "鳥取県",
      list: TOTTORI,
      pending: CHUGOKU_PENDING,
      total: 15,
      outside: ["大山町", "南部町", "伯耆町", "日南町", "日野町", "江府町"],
      // 鳥取市・米子市・倉吉市と、限定特定行政庁の境港市
      cities: ["鳥取市", "米子市", "倉吉市", "境港市"],
      offices: { 東部建築住宅事務所: 4, 中部総合事務所: 4, 西部総合事務所: 7 },
    },
    {
      pref: "島根県",
      list: SHIMANE,
      pending: CHUGOKU_PENDING,
      total: 11,
      outside: ["飯南町", "美郷町", "邑南町", "海士町", "西ノ島町", "知夫村"],
      // 特定行政庁の松江市・出雲市と、限定特定行政庁の6市
      cities: ["松江市", "浜田市", "出雲市", "益田市", "大田市", "安来市", "江津市", "雲南市"],
      offices: { 雲南県土整備事務所: 2, 県央県土整備事務所: 3, 益田県土整備事務所: 2, 隠岐支庁: 4 },
    },
    {
      pref: "香川県",
      list: KAGAWA,
      pending: SHIKOKU_PENDING,
      total: 16,
      outside: ["直島町"],
      // 特定行政庁は高松市だけ（登録した。下の「香川県の、市が扱う市」）
      cities: [],
      offices: { 長尾土木事務所: 3, 中讃土木事務所: 8, 西讃土木事務所: 2, 小豆総合事務所: 2, 建築指導課: 1 },
    },
    {
      pref: "愛媛県",
      list: EHIME,
      pending: SHIKOKU_PENDING,
      total: 15,
      outside: ["上島町", "伊方町", "松野町"],
      // 特定行政庁の4市と、限定特定行政庁の宇和島市
      cities: ["松山市", "今治市", "宇和島市", "新居浜市", "西条市"],
      offices: { 東予地方局: 1, 四国中央土木事務所: 1, 中予地方局: 5, 八幡浜土木事務所: 4, 南予地方局: 4 },
    },
    {
      pref: "徳島県",
      list: TOKUSHIMA,
      pending: SHIKOKU_PENDING,
      total: 23,
      outside: ["阿波市", "勝浦町", "上勝町", "佐那河内村", "神山町", "那賀町", "海陽町", "板野町", "上板町", "東みよし町"],
      // 特定行政庁は徳島市だけ
      cities: ["徳島市"],
      offices: { 徳島県土整備事務所: 10, 吉野川県土整備事務所: 4, 阿南県土整備事務所: 5, 美馬県土整備事務所: 2, 三好県土整備事務所: 2 },
    },
    {
      pref: "高知県",
      list: KOCHI,
      pending: SHIKOKU_PENDING,
      total: 33,
      outside: ["奈半利町", "田野町", "安田町", "北川村", "馬路村", "芸西村", "大豊町", "大川村", "仁淀川町", "梼原町", "日高村", "津野町", "大月町", "三原村"],
      // 特定行政庁は高知市だけ
      cities: ["高知市"],
      // 高知県は道路の種別を市町村の担当課で確かめる決まりなので、問い合わせ先は市町村の課。県の受け持ちは注に書いている
      officeIn: "note",
      offices: { "県の受け持ち：建築指導課": 27, "県の受け持ち：幡多土木事務所": 6 },
    },
    {
      pref: "福岡県",
      list: FUKUOKA,
      pending: KYUSHU_PENDING,
      total: 56,
      // 都市計画区域も準都市計画区域も無い村だけ（準都市計画区域のある うきは市・大木町・香春町・糸田町・大任町・福智町・上毛町 は区域外にしない）
      outside: ["東峰村", "赤村"],
      cities: ["福岡市", "大牟田市", "久留米市"],
      offices: { 福岡県土整備事務所: 9, 那珂県土整備事務所: 5, 朝倉県土整備事務所: 3, 久留米県土整備事務所: 3, 南筑後県土整備事務所: 4, 八女県土整備事務所: 3, 飯塚県土整備事務所: 3, 直方県土整備事務所: 4, 田川県土整備事務所: 8, 北九州県土整備事務所: 7, 京築県土整備事務所: 7 },
    },    {
      pref: "佐賀県",
      list: SAGA,
      pending: KYUSHU_PENDING,
      total: 19,
      // 江北町は準都市計画区域があるので区域外にしない
      outside: ["玄海町", "大町町", "太良町"],
      cities: ["佐賀市"],
      offices: { 佐賀土木事務所: 2, 東部土木事務所: 6, 唐津土木事務所: 2, 伊万里土木事務所: 2, 杵藤土木事務所: 7 },
    },    {
      pref: "長崎県",
      list: NAGASAKI,
      pending: KYUSHU_PENDING,
      total: 18,
      outside: ["小値賀町"],
      // 特定行政庁の長崎市・佐世保市と、限定特定行政庁の大村市（同じ限定特定行政庁の五島市は、県のページに受け持ちの分かれ方があるので登録済み）
      cities: ["長崎市", "佐世保市", "大村市"],
      offices: { 長崎振興局: 2, 県央振興局: 1, 島原振興局: 3, 県北振興局: 8, "五島振興局 建設部": 1, 上五島支所: 1, 壱岐振興局: 1, 対馬振興局: 1 },
    },    {
      pref: "熊本県",
      list: KUMAMOTO,
      pending: KYUSHU_PENDING,
      total: 42,
      // 都市計画区域の無い25市町村のうち、準都市計画区域のある玉東町・西原村は区域外にしない
      outside: ["上天草市", "美里町", "南関町", "和水町", "南小国町", "小国町", "産山村", "高森町", "南阿蘇村", "甲佐町", "山都町", "氷川町", "津奈木町", "錦町", "多良木町", "湯前町", "水上村", "相良村", "五木村", "山江村", "球磨村", "あさぎり町", "苓北町"],
      cities: ["熊本市", "八代市", "天草市"],
      offices: { 県央広域本部: 10, 県北広域本部: 18, 県南広域本部: 14 },
    },    {
      pref: "大分県",
      list: OITA,
      pending: KYUSHU_PENDING,
      total: 12,
      outside: ["姫島村", "九重町"],
      // 特定行政庁の6市のうち、まだ調べている途中の市（大分市・別府市・中津市は登録した。下の「大分県の、市が扱う市」）
      cities: ["日田市", "佐伯市", "宇佐市"],
      offices: { 別府土木事務所: 4, 大分土木事務所: 1, 臼杵土木事務所: 2, 豊後大野土木事務所: 2, 日田土木事務所: 2, 中津土木事務所: 1 },
    },    {
      pref: "宮崎県",
      list: MIYAZAKI,
      pending: KYUSHU_PENDING,
      total: 22,
      outside: ["西米良村", "木城町", "諸塚村", "椎葉村", "美郷町", "日之影町", "五ヶ瀬町"],
      cities: ["宮崎市", "都城市", "延岡市", "日向市"],
      // 問い合わせ先は本務の事務所（国富町・綾町＝宮崎、西都市・西米良村＝高鍋、串間市＝日南）
      offices: { 宮崎土木事務所: 2, 高鍋土木事務所: 7, 日南土木事務所: 2, 都城土木事務所: 1, 小林土木事務所: 3, 日向土木事務所: 4, 西臼杵支庁: 3 },
    },    {
      pref: "鹿児島県",
      list: KAGOSHIMA,
      pending: KYUSHU_PENDING,
      total: 39,
      outside: ["三島村", "十島村", "長島町", "東串良町", "大和村", "宇検村", "伊仙町", "与論町"],
      // 限定特定行政庁の鹿屋市・薩摩川内市・霧島市（特定行政庁の鹿児島市は登録した。下の「鹿児島市」）
      cities: ["鹿屋市", "薩摩川内市", "霧島市"],
      offices: { 鹿児島地域振興局: 4, 南薩地域振興局: 4, 北薩地域振興局: 4, "姶良・伊佐地域振興局 建設部 土木建築課 建築係": 2, 伊佐市駐在: 1, 大隅地域振興局: 8, "熊毛支庁 建設部": 3, 屋久島事務所: 1, "大島支庁 建設部": 9, 徳之島事務所: 3 },
    },    {
      pref: "沖縄県",
      list: OKINAWA,
      pending: KYUSHU_PENDING,
      total: 36,
      outside: ["国頭村", "大宜味村", "東村", "今帰仁村", "恩納村", "宜野座村", "金武町", "伊江村", "伊平屋村", "伊是名村", "久米島町", "渡嘉敷村", "座間味村", "粟国村", "渡名喜村", "南大東村", "北大東村", "多良間村", "竹富町", "与那国町"],
      // 特定行政庁の5市
      cities: ["那覇市", "宜野湾市", "浦添市", "沖縄市", "うるま市"],
      offices: { 北部土木事務所: 12, 中部土木事務所: 6, 南部土木事務所: 13, 宮古土木事務所: 2, 八重山土木事務所: 3 },
    },
    {
      pref: "北海道",
      list: HOKKAIDO,
      pending: HOKKAIDO_PENDING,
      total: 140,
      // 都市計画区域の無い80町村から、準都市計画区域のあるニセコ町を除いた79
      outside: ["上砂川町", "由仁町", "月形町", "浦臼町", "妹背牛町", "秩父別町", "雨竜町", "北竜町", "沼田町", "新篠津村", "島牧村", "寿都町", "黒松内町", "蘭越町", "真狩村", "留寿都村", "喜茂別町", "京極町", "泊村", "神恵内村", "積丹町", "仁木町", "赤井川村", "豊浦町", "平取町", "新冠町", "様似町", "えりも町", "松前町", "知内町", "鹿部町", "上ノ国町", "厚沢部町", "乙部町", "奥尻町", "当麻町", "比布町", "愛別町", "東川町", "中富良野町", "南富良野町", "占冠村", "和寒町", "剣淵町", "音威子府村", "中川町", "幌加内町", "小平町", "苫前町", "初山別村", "遠別町", "天塩町", "猿払村", "中頓別町", "豊富町", "礼文町", "利尻町", "利尻富士町", "幌延町", "津別町", "清里町", "小清水町", "訓子府町", "置戸町", "佐呂間町", "湧別町", "西興部村", "士幌町", "上士幌町", "鹿追町", "中札内村", "更別村", "豊頃町", "陸別町", "浜中町", "鶴居村", "別海町", "標津町", "羅臼町"],
      // 特定行政庁の10市と、限定特定行政庁の29市町のうち、まだ調べている36市町（札幌市・旭川市・函館市は登録した。data/hokkaido-cities.ts）
      cities: ["小樽市", "室蘭市", "釧路市", "帯広市", "北見市", "岩見沢市", "網走市", "留萌市", "苫小牧市", "稚内市", "江別市", "紋別市", "士別市", "名寄市", "三笠市", "根室市", "千歳市", "砂川市", "深川市", "富良野市", "登別市", "恵庭市", "伊達市", "北広島市", "石狩市", "当別町", "森町", "長沼町", "東神楽町", "美幌町", "遠軽町", "白老町", "音更町", "芽室町", "幕別町", "中標津町"],
      offices: { 空知総合振興局: 19, 石狩振興局: 1, 後志総合振興局: 19, 胆振総合振興局: 6, 日高振興局: 7, 渡島総合振興局: 9, 檜山振興局: 7, 上川総合振興局: 18, 留萌振興局: 7, 宗谷総合振興局: 9, オホーツク総合振興局: 13, 十勝総合振興局: 15, 釧路総合振興局: 7, 根室振興局: 3 },
    },
  ];

  it.each(CASES)("$pref：県が扱う市町村の数・受け持ちの事務所・都市計画区域の無い市町村・調査中の市", ({ pref, list, pending, total, outside, cities, offices, officeIn }) => {
    expect(list).toHaveLength(total);
    for (const m of list) {
      expect(m.pref).toBe(pref);
      expect(m.contact?.phone, m.name).toMatch(/^0\d+-\d+-\d{4}$/);
      expect(m.note, m.name).toBeTruthy();
    }
    expect(list.filter((m) => m.coverage === "outside").map((m) => m.name).sort()).toEqual([...outside].sort());
    // 都市計画区域の無い市町村は地図を出さず、注に「全域が都市計画区域外」と書く
    for (const m of list.filter((x) => x.coverage === "outside")) expect([m.maps.length, /全域が都市計画区域外/.test(m.note ?? "")], m.name).toEqual([0, true]);
    for (const [word, n] of Object.entries(offices)) expect(list.filter((m) => (officeIn === "note" ? m.note! : m.contact!.dept).includes(word)), word).toHaveLength(n);
    expect(Object.values(offices).reduce((a, b) => a + b, 0)).toBe(total);
    // 市が扱う市は、まだ調査中の一覧にある
    expect(pending.filter((m) => m.pref === pref).map((m) => m.name)).toEqual(cities);
  });
});

