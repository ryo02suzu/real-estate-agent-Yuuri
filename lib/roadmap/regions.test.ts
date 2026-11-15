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
import { OKINAWA, OKINAWA_CITIES } from "./data/okinawa";
import { KAGOSHIMA, KAGOSHIMA_CITIES } from "./data/kagoshima";
import { MIYAZAKI, MIYAZAKI_CITIES } from "./data/miyazaki";
import { OITA, OITA_CITIES } from "./data/oita";
import { KUMAMOTO, KUMAMOTO_CITIES } from "./data/kumamoto";
import { NAGASAKI, NAGASAKI_CITIES } from "./data/nagasaki";
import { SAGA, SAGA_CITIES } from "./data/saga";
import { FUKUOKA, FUKUOKA_CITIES } from "./data/fukuoka";
import { KOCHI } from "./data/kochi";
import { TOKUSHIMA, TOKUSHIMA_CITIES } from "./data/tokushima";
import { EHIME, EHIME_CITIES } from "./data/ehime";
import { KAGAWA, KAGAWA_CITIES } from "./data/kagawa";
import { SHIMANE, SHIMANE_CITIES } from "./data/shimane";
import { TOTTORI, TOTTORI_CITIES } from "./data/tottori";
import { YAMAGUCHI, YAMAGUCHI_CITIES } from "./data/yamaguchi";
import { OKAYAMA, OKAYAMA_CITIES } from "./data/okayama";
import { HIROSHIMA, HIROSHIMA_CITIES } from "./data/hiroshima";
import { MUNI_CODES } from "./muni-codes";
import { buildLinks, findMunicipality, MUNICIPALITIES, noCityPlanning, type Municipality } from "./municipalities";
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
    ["chugoku", [...HIROSHIMA, ...OKAYAMA, ...YAMAGUCHI, ...TOTTORI, ...SHIMANE, ...HIROSHIMA_CITIES, ...OKAYAMA_CITIES, ...YAMAGUCHI_CITIES, ...TOTTORI_CITIES, ...SHIMANE_CITIES, ...CHUGOKU_PENDING], 107],
    ["shikoku", [...KAGAWA, ...EHIME, ...TOKUSHIMA, ...KOCHI, ...KAGAWA_CITIES, ...TOKUSHIMA_CITIES, ...EHIME_CITIES, ...SHIKOKU_PENDING], 95],
    ["kyushu", [...FUKUOKA, ...SAGA, ...NAGASAKI, ...KUMAMOTO, ...OITA, ...MIYAZAKI, ...KAGOSHIMA, ...OKINAWA, ...FUKUOKA_CITIES, ...KAGOSHIMA_CITIES, ...OITA_CITIES, ...MIYAZAKI_CITIES, ...OKINAWA_CITIES, ...NAGASAKI_CITIES, ...SAGA_CITIES, ...KUMAMOTO_CITIES, ...KYUSHU_PENDING], 274],
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
    // 市が扱う7市を全部登録したので、調査中の一覧に岡山県は残っていない
    expect(CHUGOKU_PENDING.filter((x) => x.pref === "岡山県")).toEqual([]);
    expect(OKAYAMA_CITIES.map((x) => x.name)).toEqual(["岡山市", "倉敷市", "津山市", "玉野市", "笠岡市", "総社市", "新見市"]);
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

  const city = (name: string) => OKAYAMA_CITIES.find((x) => x.name === name)!;

  it("津山・玉野・笠岡・総社・新見：道路種別の地図は市のページに見つからず none。窓口を出す（電話を断ると書いている市は無い）", () => {
    const codes: Record<string, string> = { 津山市: "33203", 玉野市: "33204", 笠岡市: "33205", 総社市: "33208", 新見市: "33210" };
    for (const [name, code] of Object.entries(codes)) {
      const m = city(name);
      expect(m.codes, name).toEqual([code]);
      expect(findMunicipality(code)?.name, name).toBe(name);
      expect(m.coverage, name).toBe("none");
      expect(m.note, name).toContain("道路種別の地図は、市のページに見つからなかった");
      expect(m.note, name).toContain("都市計画区域の外");
      expect(m.contact?.phone, name).toMatch(/^08\d{2}-\d{2}-\d{4}$/);
      expect(m.contact?.noPhoneInquiry, name).toBeUndefined();
      // 地図があっても、市道の図だけ（道路種別の図ではない、と道順に書く）
      for (const l of m.maps) {
        expect(l.kind, name).toBe("public_road");
        expect(l.build, name).toBeNull();
        expect(l.tip, name).toMatch(/種別を示す(地図|図)ではない/);
      }
    }
    expect(Object.keys(codes).filter((n) => city(n).maps.length === 0)).toEqual(["津山市", "新見市"]);
  });

  it("津山市：道路調査はメール・FAX で地図を送ると後日回答（先に必ず電話で相談）", () => {
    const m = city("津山市");
    expect(m.contact).toMatchObject({ phone: "0868-32-2099", fax: "0868-32-2155", email: "tokei@city.tsuyama.lg.jp" });
    expect(m.contact!.dept).toContain("都市計画課 建築指導審査係");
    expect(m.contact!.note).toContain("先に必ず電話で相談する");
  });

  it("玉野市：市道は玉野市統合型GIS の認定路線網図（岡山県の地図システムの上。中は確かめていない）", () => {
    const m = city("玉野市");
    expect(m.maps[0].url).toBe("http://www.gis.pref.okayama.jp/tamano/Portal");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("「玉野市マップ」→ マップ選択で「玉野市認定路線網図」");
    expect(m.maps[0].tip).toContain("自分で同意");
    expect(m.maps[0].tip).toContain("令和4年4月1日現在");
    expect(m.contact).toMatchObject({ phone: "0863-32-5538", fax: "0863-32-5519" });
  });

  it("笠岡市：市役所の開庁時間は 9:00〜16:30。市道は道路台帳閲覧システム（今の担当は建設管理課。古い資料の課名は使わない）", () => {
    const m = city("笠岡市");
    expect(m.contact!.phone).toBe("0865-69-2141");
    expect(m.contact!.hours).toContain("9:00〜16:30");
    expect(m.maps[0].url).toBe("https://webgis.alandis.jp/kasaoka33/portal/consent01.html");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("建設管理課 管理係（0865-69-2146）");
    // 日付の無い古い資料にあった課の名前（今の組織の一覧に無い）
    expect(JSON.stringify(m)).not.toContain("建設企画課");
    expect(m.note).toContain("島しょ部");
  });

  it("総社市：市道の道路台帳は市のページから（不動産取引などに使うときは現地などで確かめる、と市が書いている）", () => {
    const m = city("総社市");
    expect(m.maps[0].url).toBe("https://www.city.soja.okayama.jp/soshiki/29/3820.html");
    expect(m.maps[0].verified).toBe(true);
    expect(m.maps[0].tip).toContain("不動産取引や建築確認申請などに使うときは、必ず現地と土地の資料で確かめ");
    expect(m.maps[0].tip).toContain("権利関係を表すものではない");
    expect(m.contact).toMatchObject({ phone: "0866-92-8289", fax: "0866-92-8383" });
  });

  it("新見市：位置指定道路は建築係の台帳、市道は建設課の道路台帳で確かめる（市の建築設計用資料）", () => {
    const m = city("新見市");
    expect(m.contact!.phone).toBe("0867-72-6118");
    expect(m.contact!.dept).toContain("都市整備課 建築係");
    expect(m.contact!.note).toContain("建築係の台帳で位置を確かめる");
    expect(m.contact!.note).toContain("建設課 維持管理係 0867-72-6131");
    expect(m.contact!.note).toContain("必ず現地でも確かめる");
    // 市の説明の引用（MICHILU の判断ではない）
    expect(m.note).toContain("と説明している");
    expect(m.note).toContain("大佐・神郷・哲多町・哲西町は、全域が都市計画区域の外");
  });
});

describe("鳥取県の、市が扱う市（登録した市）", () => {
  const city = (name: string) => TOTTORI_CITIES.find((x) => x.name === name)!;

  it("鳥取・米子・倉吉・境港の4市を登録したので、調査中の一覧に鳥取県は残っていない", () => {
    expect(TOTTORI_CITIES.map((m) => m.name)).toEqual(["鳥取市", "米子市", "倉吉市", "境港市"]);
    expect(CHUGOKU_PENDING.filter((x) => x.pref === "鳥取県")).toEqual([]);
    const codes: Record<string, string> = { 鳥取市: "31201", 米子市: "31202", 倉吉市: "31203", 境港市: "31204" };
    for (const [name, code] of Object.entries(codes)) {
      expect(city(name).codes, name).toEqual([code]);
      expect(findMunicipality(code)?.name, name).toBe(name);
    }
    // 同意の画面の先を MICHILU で開いて確かめていない市は、そう書く
    for (const name of ["米子市", "倉吉市"]) {
      expect(city(name).coverage, name).toBe("partial");
      expect(city(name).maps[0].build, name).toBeNull();
      expect(city(name).maps[0].tip, name).toContain("どの種別まで載っているかも確かめられていない");
      expect(city(name).maps[0].tip, name).toContain("自分で同意して進");
    }
  });

  it("鳥取市：物件の場所で、市の指定道路図（7つのレイヤ）を表示した状態で開く。道路の疑問は電話では答えない", () => {
    const m = city("鳥取市");
    expect(m.coverage).toBe("full");
    expect(m.maps.map((l) => l.kind)).toEqual(["road_type"]);
    const [link] = buildLinks(m, 35.501, 134.233);
    // とっとりジオマップが自分でアドレスに書き出す形（center=経度/緯度・zoom・baseMap・layers・marker）。その場所が中心に開くことを画面で確かめた
    expect(link.url).toBe("https://city-tottori.tottori-geomap.jp/#/?center=134.233000%2F35.501000&zoom=17&baseMap=gsi&layers=3VfuA2koPS79lOIopD1cz&marker=on");
    expect(link.pinpoint).toBe(true);
    expect(link.verified).toBe(true);
    // 規約の画面は、利用者が自分で読んで同意する。レイヤが出ないときの選び方も書く
    expect(link.tip).toContain("自分で同意して進む");
    expect(link.tip).toContain("「都市計画・建築」→「指定道路図」");
    // 市が、窓口に問い合わせるよう求めている場合（幅員4m未満の1号〜5号・1.8m未満の2項・未判定道路など）
    expect(link.tip).toContain("幅員が4m未満");
    expect(link.tip).toContain("未判定道路");
    expect(link.tip).toContain("権利や義務にかかわる資料にはできない");
    expect(m.contact).toMatchObject({ phone: "0857-30-8361", fax: "0857-20-3956", noPhoneInquiry: true });
    expect(m.contact!.note).toContain("電話では答えない");
    // 市役所の窓口の時間は、市のページで確かめられなかったので入れていない
    expect(m.contact!.hours).toBeUndefined();
  });

  it("米子市：市の地図の「指定道路」（注意事項に同意して進む）。電話での問い合わせには応じていない", () => {
    const m = city("米子市");
    expect(m.maps[0].url).toBe("https://webgis.alandis.jp/yonago31/conf/conf.html");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("道路種別を確かめる目的のほかには使えない");
    expect(m.contact).toMatchObject({ phone: "0859-23-5236", fax: "0859-23-5394", email: "kenchikusoudan@city.yonago.lg.jp", noPhoneInquiry: true });
    // 糀町庁舎の開庁時間（市が 9:00〜17:00 に変えた）
    expect(m.contact!.hours).toContain("9:00〜17:00");
  });

  it("倉吉市：市のウェブサイトの「倉吉市指定道路の検索」。市の注意（営利などの目的には使えない）をそのまま道順に入れる", () => {
    const m = city("倉吉市");
    expect(m.maps[0].url).toBe("https://www.city.kurayoshi.lg.jp/s_road/");
    // 市のサイトの決まり：倉吉市のウェブサイトへのリンクだと分かるように書く
    expect(m.maps[0].label).toContain("倉吉市のウェブサイト");
    expect(m.maps[0].tip).toContain("本図を営利などの特定の目的で利用することはできません");
    expect(m.maps[0].tip).toContain("閲覧する目的のほかには使えない");
    expect(m.contact).toMatchObject({ phone: "0858-22-8175", fax: "0858-22-8140", email: "kenchikujutaku@city.kurayoshi.lg.jp" });
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
  });

  it("境港市：限定特定行政庁。道路種別の地図は見つからず、市の窓口と、市が扱わない建築物の県の窓口を出す。全域が都市計画区域", () => {
    const m = city("境港市");
    expect(m.coverage).toBe("none");
    expect(m.maps).toEqual([]);
    expect(m.contact).toMatchObject({ phone: "0859-47-1062", fax: "0859-47-1086" });
    expect(m.contact!.note).toContain("西部総合事務所 環境建築局 建築住宅課（0859-31-9753）");
    // 開庁時間の短縮の試行（2026年8月3日〜12月28日）も入れる
    expect(m.contact!.hours).toContain("9:00〜16:30");
    expect(m.note).toContain("境港市は全域が都市計画区域");
    // 「全域が都市計画区域外」と読まれる書き方にしない（区域の外の町村の印に使う言い回し）
    expect(m.note).not.toContain("都市計画区域外");
  });
});

describe("島根県の、市が扱う市（登録した市）", () => {
  const city = (name: string) => SHIMANE_CITIES.find((x) => x.name === name)!;
  const PREF_SYSTEM = "https://web-gis.pref.shimane.lg.jp/shimane/Agreement?IsPost=False&MapId=29&RequestPage=%2fshimane%2fPositionSelect%3fmid%3d29";

  it("8市を登録したので、調査中の一覧に島根県は残っていない（中国地方の調査中は 0）", () => {
    const codes: Record<string, string> = { 松江市: "32201", 浜田市: "32202", 出雲市: "32203", 益田市: "32204", 大田市: "32205", 安来市: "32206", 江津市: "32207", 雲南市: "32209" };
    expect(SHIMANE_CITIES.map((m) => m.name)).toEqual(Object.keys(codes));
    for (const [name, code] of Object.entries(codes)) {
      expect(city(name).codes, name).toEqual([code]);
      expect(findMunicipality(code)?.name, name).toBe(name);
      // 8市とも、都市計画区域は市の一部（国の都市別一覧）
      expect(city(name).note, name).toContain(`${name}の一部は都市計画区域の外`);
      // 電話を断ると書いている市は無い
      expect(city(name).contact?.noPhoneInquiry, name).toBeUndefined();
    }
    expect(CHUGOKU_PENDING.filter((x) => x.pref === "島根県")).toEqual([]);
    expect(CHUGOKU_PENDING).toEqual([]);
  });

  it("限定特定行政庁の6市：市が扱わない建築物の県の窓口（県土整備事務所）を、市ごとに正しく書く", () => {
    const office: Record<string, string> = {
      浜田市: "浜田県土整備事務所 建築部（0855-29-5668）",
      江津市: "浜田県土整備事務所 建築部（0855-29-5668）",
      益田市: "益田県土整備事務所 建築部（0856-31-9660）",
      大田市: "県央県土整備事務所 建築部（0855-72-9608）",
      安来市: "松江県土整備事務所 建築部（0852-32-5757）",
      雲南市: "雲南県土整備事務所 建築部（0854-42-9590）",
    };
    for (const [name, text] of Object.entries(office)) {
      expect(city(name).note, name).toContain("限定特定行政庁");
      expect(city(name).note, name).toContain(text);
    }
    // 特定行政庁の2市には、県の窓口を書かない
    for (const name of ["松江市", "出雲市"]) {
      expect(city(name).note, name).toContain("特定行政庁");
      expect(city(name).note, name).not.toContain("限定特定行政庁");
      expect(city(name).note, name).not.toContain("県土整備事務所");
    }
  });

  it("島根県の地図システムを開く5市：同意の画面を開き、中は確かめていないと書く。国の一覧の「公開済」「一部公開」をそのまま書く", () => {
    const status: Record<string, string> = { 浜田市: "一部公開", 大田市: "一部公開", 江津市: "公開済", 雲南市: "公開済" };
    for (const name of ["松江市", ...Object.keys(status)]) {
      const m = city(name);
      expect(m.coverage, name).toBe("partial");
      expect(m.maps[0].kind, name).toBe("designated_only");
      expect(m.maps[0].build, name).toBeNull();
      expect(m.maps[0].url, name).toBe(PREF_SYSTEM);
      expect(m.maps[0].label, name).toContain(`${name}の指定道路`);
      // 県のサイトの決まり：島根県のホームページへのリンクだと書く
      expect(m.maps[0].label, name).toContain("島根県の地図システムへのリンク");
      expect(m.maps[0].tip, name).toContain("MICHILU は同意の先を開いていない");
    }
    for (const [name, st] of Object.entries(status)) {
      expect(city(name).maps[0].tip, name).toContain(`${name}の指定道路図は「${st}」`);
      expect(city(name).maps[0].tip, name).toContain("MICHILU では確かめられていない");
    }
    // 松江市は、市のページが「4号・5号・2項に限ります」と書いている
    expect(city("松江市").maps[0].tip).toContain("4号・5号（位置指定道路）・2項道路に限られる");
    expect(city("松江市").contact).toMatchObject({ phone: "0852-55-5347", fax: "0852-55-5552", email: "ke-shidou@city.matsue.lg.jp" });
  });

  it("地図の無い3市（出雲・益田・安来）は none。出雲市は市道の路線図だけ", () => {
    for (const name of ["出雲市", "益田市", "安来市"]) expect(city(name).coverage, name).toBe("none");
    expect(city("益田市").maps).toEqual([]);
    expect(city("安来市").maps).toEqual([]);
    const izumo = city("出雲市");
    expect(izumo.maps.map((l) => l.kind)).toEqual(["public_road"]);
    expect(izumo.maps[0].url).toBe("https://gis4.city.izumo.shimane.jp/alandis/menu_gis/");
    expect(izumo.maps[0].tip).toContain("「道路・交通・安全・防災」→「市道認定路線図」");
    expect(izumo.maps[0].tip).toContain("種別を示す地図ではない");
    // 市の今の組織の一覧にある課の名前（地図の案内に残っている古い課の名前は使わない）
    expect(izumo.maps[0].tip).toContain("道路河川管理課（0853-21-6564）");
    expect(izumo.contact).toMatchObject({ phone: "0853-21-6150", fax: "0853-21-6594", email: "kenchiku@city.izumo.shimane.jp" });
    expect(city("益田市").contact).toMatchObject({ phone: "0856-31-0668", fax: "0856-31-0005" });
    expect(city("安来市").contact).toMatchObject({ phone: "0854-23-3325", fax: "0854-23-3381", email: "kenchiku@city.yasugi.shimane.jp" });
    expect(city("安来市").contact!.note).toContain("43条2項2号の許可は、どの建築物も島根県の扱い");
  });

  it("大田市：窓口へ行く前に電話。市道の図は閲覧のほかには使えないと市が書いている。浜田・江津・雲南の窓口", () => {
    const oda = city("大田市");
    expect(oda.maps.map((l) => l.kind)).toEqual(["designated_only", "public_road"]);
    expect(oda.maps[1].url).toBe("https://www.city.oda.lg.jp/ohda_city/city_organization/22/2379/9861");
    // 市のサイトの決まり：大田市のホームページへのリンクだと書く
    expect(oda.maps[1].label).toContain("大田市のホームページへのリンク");
    expect(oda.maps[1].tip).toContain("閲覧以外の目的で利用することはできません");
    expect(oda.contact!.phone).toBe("0854-83-8105");
    expect(oda.contact!.fax).toBeUndefined();
    expect(oda.contact!.note).toContain("窓口へ行く前に、電話で連絡する");
    expect(city("浜田市").contact).toMatchObject({ phone: "0855-25-9632", email: "kenchiku@city.hamada.lg.jp" });
    expect(city("江津市").contact).toMatchObject({ phone: "0855-52-7490", fax: "0855-52-1379" });
    expect(city("雲南市").contact).toMatchObject({ phone: "0854-40-1065", fax: "0854-40-1069", email: "kenchiku@city.unnan.shimane.jp" });
  });
});

describe("愛媛県の、市が扱う市（登録した市）", () => {
  const city = (name: string) => EHIME_CITIES.find((x) => x.name === name)!;

  it("今治・宇和島・新居浜・西条を登録。松山市だけ調査中に残る", () => {
    const codes: Record<string, string> = { 今治市: "38202", 宇和島市: "38203", 新居浜市: "38205", 西条市: "38206" };
    expect(EHIME_CITIES.map((m) => m.name)).toEqual(Object.keys(codes));
    for (const [name, code] of Object.entries(codes)) {
      expect(city(name).codes, name).toEqual([code]);
      expect(findMunicipality(code)?.name, name).toBe(name);
      expect(city(name).note, name).toContain(`${name}の一部は都市計画区域の外`);
    }
    expect(SHIKOKU_PENDING.filter((x) => x.pref === "愛媛県").map((x) => x.name)).toEqual(["松山市"]);
    expect(findMunicipality("38201")?.coverage).toBe("unknown");
  });

  it("新居浜市：指定道路図は全種別（指定道路のほかに1号・2号・3号も）。市の決まりに合わせてトップページから。電話・FAX・メールでは答えない", () => {
    const m = city("新居浜市");
    expect(m.coverage).toBe("full");
    expect(m.maps.map((l) => l.kind)).toEqual(["road_type"]);
    // 市は「トップページへのリンクは原則として自由」「新居浜市のサイトであることを明記」と書いている
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www.city.niihama.lg.jp/");
    expect(m.maps[0].label).toContain("新居浜市のサイトのトップページから進む");
    expect(m.maps[0].tip).toContain("「組織でさがす」→ 建設部の「建築指導課」→「建築基準法の道路（指定道路図）について」");
    expect(m.maps[0].tip).toContain("自分で同意して進む");
    expect(m.maps[0].tip).toContain("平成26年4月1日現在");
    // 市の注意：接道の判断・不動産取引のための資料には使えない
    expect(m.maps[0].tip).toContain("敷地が道路に2m以上接するかを判断する資料");
    expect(m.maps[0].tip).toContain("不動産取引のための資料には使えない");
    expect(m.contact).toMatchObject({ phone: "0897-65-1273", fax: "0897-65-1276", noPhoneInquiry: true });
  });

  it("今治市・西条市：道路種別の地図は見つからず none。市道の図への入口と、建築の窓口", () => {
    const imabari = city("今治市");
    expect(imabari.coverage).toBe("none");
    expect(imabari.maps.map((l) => l.kind)).toEqual(["public_road"]);
    expect(imabari.maps[0].url).toBe("https://www.sonicweb-asp.jp/imabari/");
    expect(imabari.maps[0].verified).toBe(false);
    expect(imabari.contact).toMatchObject({ phone: "0898-36-1566", email: "kenchiku@imabari-city.jp" });
    expect(imabari.note).toContain("該当地に接する道路の種類については建築課で確認してください");

    const saijo = city("西条市");
    expect(saijo.coverage).toBe("none");
    expect(saijo.maps[0].url).toBe("https://www.city.saijo.ehime.jp/soshiki/kensetsudoro/saijo-city-road-info.html");
    // 市が「建築基準法の道路は、このシステム上では検索できません」と書いている
    expect(saijo.maps[0].tip).toContain("このシステム上では検索できません");
    // 建築審査係の番号は、市のページに2つ出ている（課のページ・県の一覧は 1554、「建物を建てるときには」は 1558）
    expect(saijo.contact).toMatchObject({ phone: "0897-52-1554 0897-52-1558", fax: "0897-52-1260" });
    expect(saijo.note).toContain("と説明している");
  });

  it("宇和島市：限定特定行政庁。道路の窓口は建築指導係（代表番号の内線）。県の一覧の直通番号は別の係なので使わない", () => {
    const m = city("宇和島市");
    expect(m.coverage).toBe("none");
    expect(m.maps).toEqual([]);
    expect(m.contact).toMatchObject({ phone: "0895-24-1111（内線2619）", fax: "0895-25-3130" });
    // 0895-49-7028 は、市のページでは公共建築係の番号
    expect(JSON.stringify(m)).not.toContain("0895-49-7028");
    expect(m.note).toContain("限定特定行政庁");
    expect(m.note).toContain("南予地方局 建設部 建築指導課（0895-22-5211）");
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
    expect(KYUSHU_PENDING.filter((x) => x.pref === "鹿児島県").map((x) => x.name)).toEqual([]);
  });

  it("限定特定行政庁の3市（鹿屋・薩摩川内・霧島）を登録。市が扱わない建築物の県の窓口も書く", () => {
    const codes: Record<string, string> = { 鹿児島市: "46201", 鹿屋市: "46203", 薩摩川内市: "46215", 霧島市: "46218" };
    expect(KAGOSHIMA_CITIES.map((m) => m.name)).toEqual(Object.keys(codes));
    for (const [name, code] of Object.entries(codes)) {
      expect(KAGOSHIMA_CITIES.find((x) => x.name === name)!.codes, name).toEqual([code]);
      expect(findMunicipality(code)?.name, name).toBe(name);
    }
    const office: Record<string, string> = { 鹿屋市: "大隅地域振興局", 薩摩川内市: "北薩地域振興局", 霧島市: "姶良・伊佐地域振興局" };
    for (const [name, o] of Object.entries(office)) {
      const m = KAGOSHIMA_CITIES.find((x) => x.name === name)!;
      expect(m.note, name).toContain("限定特定行政庁");
      expect(m.contact?.note, name).toContain(o);
      expect(m.note, name).toContain(`${name}の一部は都市計画区域の外`);
    }
  });

  it("鹿屋市：「まっぷdeかのや」の道路情報マップ（どの種別まで載るかは確かめられていないので「一部」）。道路相談票はメールで", () => {
    const m = KAGOSHIMA_CITIES.find((x) => x.name === "鹿屋市")!;
    expect(m.coverage).toBe("partial");
    expect(m.maps[0].kind).toBe("road_type");
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www2.wagmap.jp/kanoya/Portal");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("どの種別まで載っているかも確かめられていない");
    expect(m.contact?.phone).toBe("0994-31-1161");
    expect(m.contact?.fax).toBe("0994-41-2936");
    expect(m.contact?.email).toBe("kentiku@city.kanoya.lg.jp");
    expect(m.contact?.note).toContain("道路相談票");
  });

  it("薩摩川内市：道路種別の地図はネットに無い（指定道路図は建築住宅課の閲覧所で）。道路のことは建物の大きさにかかわらず市", () => {
    const m = KAGOSHIMA_CITIES.find((x) => x.name === "薩摩川内市")!;
    expect(m.coverage).toBe("none");
    expect(m.maps).toEqual([]);
    expect(m.contact?.dept).toContain("建築指導グループ");
    expect(m.contact?.phone).toBe("0996-23-5111（代表）");
    expect(m.contact?.fax).toBe("0996-23-8389");
    expect(m.contact?.note).toContain("建物の大きさにかかわらず市が受け持つ");
    expect(m.contact?.note).toContain("閲覧所");
  });

  it("霧島市：市の地図情報システムの指定道路図（1項1号・2号・3号・5号・2項・法外道路）。問い合わせは原則メール・FAX・電子申請", () => {
    const m = KAGOSHIMA_CITIES.find((x) => x.name === "霧島市")!;
    expect(m.coverage).toBe("full");
    expect(m.maps[0].kind).toBe("road_type");
    expect(m.maps[0].build).toBeNull();
    // 市のページのリンク（http）と同じ地図の、https の入口
    expect(m.maps[0].url).toBe("https://www.sonicweb-asp.jp/kirishima/");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("1項1号・2号・3号・5号（位置指定道路）・2項と法外道路");
    expect(m.contact?.phone).toBe("0995-64-0954");
    expect(m.contact?.fax).toBe("0995-46-0566");
    expect(m.contact?.email).toBe("shido@city-kirishima.jp");
    // 電話は軽微なものなら受けるので、「電話では答えない」の印は付けない
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
    expect(m.contact?.note).toContain("軽微なものを除いて原則");
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
    expect(KYUSHU_PENDING.filter((x) => x.pref === "大分県").map((x) => x.name)).toEqual([]);
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

  it("日田市・佐伯市・宇佐市を登録。大分県の特定行政庁の6市が全部そろった（道路種別の地図は、3市とも市のページに無い）", () => {
    const codes: Record<string, string> = { 大分市: "44201", 別府市: "44202", 中津市: "44203", 日田市: "44204", 佐伯市: "44205", 宇佐市: "44211" };
    expect(OITA_CITIES.map((m) => m.name)).toEqual(Object.keys(codes));
    for (const [name, code] of Object.entries(codes)) {
      expect(OITA_CITIES.find((x) => x.name === name)!.codes, name).toEqual([code]);
      expect(findMunicipality(code)?.name, name).toBe(name);
    }
    for (const name of ["日田市", "佐伯市", "宇佐市"]) {
      const m = OITA_CITIES.find((x) => x.name === name)!;
      expect(m.coverage, name).toBe("none");
      expect(m.note, name).toContain("特定行政庁");
      expect(m.note, name).toContain(`${name}の一部は都市計画区域の外`);
    }
  });

  it("日田市：建築住宅課 指導審査係。市道の幅員などは「日田市Webマップ」の道路情報マップ。道路網図の利用の決まりを注記に", () => {
    const m = OITA_CITIES.find((x) => x.name === "日田市")!;
    expect(m.maps).toHaveLength(1);
    expect(m.maps[0].kind).toBe("public_road");
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www2.wagmap.jp/hita/");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("「道路情報マップ」を選び");
    expect(m.maps[0].tip).toContain("MICHILU は地図の中を開いて確かめていない");
    // 市のサイトへのリンクは置かない（市の決まりは、原則トップページだけ）
    expect(m.maps.every((l) => !(l.url ?? "").includes("city.hita.oita.jp"))).toBe(true);
    expect(m.contact?.dept).toContain("建築住宅課 指導審査係");
    expect(m.contact?.phone).toBe("0973-22-8226");
    expect(m.contact?.fax).toBe("0973-22-8247");
    expect(m.contact?.hours).toBe("平日 8:30〜17:00（市役所の開庁時間）");
    expect(m.contact?.note).toContain("2項道路協議書");
    expect(m.note).toContain("閲覧以外の目的で利用することを禁じ");
  });

  it("佐伯市：道路種別は市のページのお問い合わせフォームから（建築住宅課 建築指導係）", () => {
    const m = OITA_CITIES.find((x) => x.name === "佐伯市")!;
    expect(m.maps).toEqual([]);
    expect(m.contact?.dept).toContain("建築指導係");
    expect(m.contact?.phone).toBe("0972-22-3574");
    // 確認申請の窓口（建築審査係）の番号ではない
    expect(m.contact?.phone).not.toBe("0972-22-4223");
    expect(m.contact?.note).toContain("お問い合わせフォーム");
    expect(m.note).toContain("非線引き区域");
  });

  it("宇佐市：建設水道部 建築住宅課 指導審査室（建築基準法に関すること）", () => {
    const m = OITA_CITIES.find((x) => x.name === "宇佐市")!;
    expect(m.maps).toEqual([]);
    expect(m.contact?.dept).toContain("指導審査室");
    expect(m.contact?.phone).toBe("0978-27-8182");
    expect(m.contact?.fax).toBe("0978-27-8230");
    expect(m.contact?.hours).toBe("平日 8:30〜17:00（市役所の開庁時間）");
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

describe("宮崎県の、市が扱う市（登録した市）", () => {
  it("宮崎市：市の地図（建築基準法指定道路。2項・1項4号・1項5号）。照会はスマート申請で、来庁・電話などはできるだけ遠慮", () => {
    const m = MIYAZAKI_CITIES.find((x) => x.name === "宮崎市")!;
    expect(m.codes).toEqual(["45201"]);
    // 1項1号・2号は地図に載らない（市の確かめ方の順で確かめる）ので「一部の種別」
    expect(m.coverage).toBe("partial");
    expect(m.maps[0].kind).toBe("designated_only");
    // 市のページと同じ入口のリンク（地図の中は開いて確かめていない）
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://webgis.alandis.jp/miyazaki45/portal/");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("「建築基準法指定道路」を選び");
    expect(m.maps[0].tip).toContain("建築基準法の道路種別の照会");
    expect(m.contact?.phone).toBe("0985-21-1813");
    expect(m.contact?.fax).toBe("0985-21-1815");
    // 来庁も遠慮するよう求めているので、「電話では答えない（窓口へ）」の印は付けず、注意書きに書く
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
    expect(m.contact?.note).toContain("できるだけ遠慮するよう市が求めている");
    expect(KYUSHU_PENDING.filter((x) => x.pref === "宮崎県").map((x) => x.name)).toEqual(["日向市"]);
  });

  it("都城市：指定道路図（1項4号・5号・2項。令和3年3月15日現在）はあるが、市の決まりでリンクの前に連絡が要るので、まだリンクを置かない", () => {
    const m = MIYAZAKI_CITIES.find((x) => x.name === "都城市")!;
    expect(m.codes).toEqual(["45202"]);
    expect(findMunicipality("45202")?.name).toBe("都城市");
    // 指定道路だけの図がネットにある
    expect(m.coverage).toBe("partial");
    // 連絡が済むまで、市のページへのリンクは置かない（ページの名前を書く）
    expect(m.maps).toEqual([]);
    expect(m.note).toContain("「都城市指定道路図(令和3年3月15日現在)を紹介します」");
    expect(m.note).toContain("リンクする前に市への連絡が要る");
    expect(m.note).toContain("不動産取引のための資料");
    expect(m.contact?.dept).toContain("建築対策課 審査担当");
    expect(m.contact?.phone).toBe("0986-23-2584");
    expect(m.contact?.fax).toBe("0986-23-2154");
    expect(m.contact?.hours).toBe("平日 8:45〜16:30（市役所の窓口受付時間）");
    expect(m.note).toContain("都城市の一部は都市計画区域の外");
  });

  it("延岡市：道路種別の地図は無い。建築指導課 宅地審査係（建築基準法に規定する道路に関すること）", () => {
    const m = MIYAZAKI_CITIES.find((x) => x.name === "延岡市")!;
    expect(m.codes).toEqual(["45203"]);
    expect(findMunicipality("45203")?.name).toBe("延岡市");
    expect(m.coverage).toBe("none");
    expect(m.maps).toEqual([]);
    expect(m.contact?.dept).toContain("宅地審査係");
    expect(m.contact?.phone).toBe("0982-22-8540");
    // 建築審査係（確認申請）の番号ではない
    expect(m.contact?.phone).not.toBe("0982-22-7034");
    expect(m.contact?.fax).toBe("0982-31-3186");
    expect(m.contact?.hours).toBe("平日 8:30〜17:15（市役所の開庁時間）");
    expect(m.contact?.note).toContain("30日前までに相談");
    expect(m.note).toContain("延岡市の一部は都市計画区域の外");
  });
});

describe("沖縄県の、市が扱う市（登録した市）", () => {
  it("那覇市：市の地図「なはMAP」の道路種別マップ。どの種別まで色分けされるかは確かめられていないので「一部」。電話では受けない", () => {
    const m = OKINAWA_CITIES.find((x) => x.name === "那覇市")!;
    expect(m.codes).toEqual(["47201"]);
    expect(m.coverage).toBe("partial");
    expect(m.maps[0].kind).toBe("road_type");
    // 市のページと同じリンク（利用条件の同意の画面）。同意の先は開かない
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www.sonicweb-asp.jp/naha/agreement?theme=th_56");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("表示テーマを「道路種別マップ」に変えて");
    expect(m.maps[0].tip).toContain("どの種別まで色分けされているかは、MICHILU では確かめられていない");
    expect(m.contact?.phone).toBe("098-951-3244");
    expect(m.contact?.fax).toBe("098-951-3245");
    expect(m.contact?.noPhoneInquiry).toBe(true);
    expect(KYUSHU_PENDING.filter((x) => x.pref === "沖縄県").map((x) => x.name)).toEqual([]);
  });

  it("特定行政庁の5市が全部そろった（どこも全域が都市計画区域）", () => {
    const codes: Record<string, string> = { 那覇市: "47201", 宜野湾市: "47205", 浦添市: "47208", 沖縄市: "47211", うるま市: "47213" };
    expect(OKINAWA_CITIES.map((m) => m.name)).toEqual(Object.keys(codes));
    for (const [name, code] of Object.entries(codes)) {
      expect(OKINAWA_CITIES.find((x) => x.name === name)!.codes, name).toEqual([code]);
      expect(findMunicipality(code)?.name, name).toBe(name);
    }
    for (const name of ["宜野湾市", "浦添市", "沖縄市", "うるま市"]) {
      const m = OKINAWA_CITIES.find((x) => x.name === name)!;
      expect(m.note, name).toContain(`${name}は、全域が都市計画区域`);
      expect(noCityPlanning(m), name).toBe(false);
    }
  });

  it("宜野湾市：地図サービスのトップページ（リンクはトップページだけ自由）。規約は営利目的の利用を禁じている。電話は原則断る", () => {
    const m = OKINAWA_CITIES.find((x) => x.name === "宜野湾市")!;
    expect(m.coverage).toBe("partial");
    expect(m.maps).toHaveLength(1);
    expect(m.maps[0].kind).toBe("road_type");
    expect(m.maps[0].url).toBe("https://www.gis.city.ginowan.okinawa.jp/ginowan/Portal");
    expect(m.maps[0].label).toContain("宜野湾市地図情報システム");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("営利目的でサービスを利用することと、商用転用を禁じている");
    expect(m.maps[0].tip).toContain("令和8年1月時点");
    expect(m.contact?.phone).toBe("098-893-4123");
    expect(m.contact?.noPhoneInquiry).toBe(true);
    expect(m.contact?.note).toContain("2項道路後退誓約書");
  });

  it("浦添市：市のページの指定道路図（1項1号〜5号・2項。索引図の番号ごとの PDF）と、市道のうらそえマップ。電話では答えない", () => {
    const m = OKINAWA_CITIES.find((x) => x.name === "浦添市")!;
    expect(m.coverage).toBe("full");
    expect(m.maps.map((l) => l.kind)).toEqual(["road_type", "public_road"]);
    expect(m.maps[0].url).toBe("https://www.city.urasoe.lg.jp/doc/609e7c273d59ae2434bfead4/");
    expect(m.maps[0].verified).toBe(true);
    expect(m.maps[0].tip).toContain("法42条1項1号〜5号・2項道路");
    expect(m.maps[0].tip).toContain("まだ市道に認定されていない道路は載っていない");
    expect(m.maps[1].url).toBe("https://www2.wagmap.jp/urasoe/Portal");
    // 2つの地図のリンクは別のもの
    expect(new Set(m.maps.map((l) => l.url)).size).toBe(2);
    expect(m.contact?.phone).toBe("098-876-1252");
    expect(m.contact?.fax).toBe("098-876-7071");
    expect(m.contact?.noPhoneInquiry).toBe(true);
  });

  it("沖縄市：道路種別の地図は無い。窓口で判定（2週間以内が目安）", () => {
    const m = OKINAWA_CITIES.find((x) => x.name === "沖縄市")!;
    expect(m.coverage).toBe("none");
    expect(m.maps).toEqual([]);
    expect(m.contact?.phone).toBe("098-939-1212（代表）");
    expect(m.contact?.note).toContain("2週間以内に答えるよう努めている");
    expect(m.contact?.note).toContain("098-934-3846");
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
  });

  it("うるま市：うるマップ（道路台帳の確定している道路。中は確かめられていないので「一部」）。窓口は建築行政課", () => {
    const m = OKINAWA_CITIES.find((x) => x.name === "うるま市")!;
    expect(m.coverage).toBe("partial");
    expect(m.maps[0].kind).toBe("road_type");
    expect(m.maps[0].url).toBe("https://gis.city.uruma.lg.jp/uruma/Portal");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("どの種別まで載っているかも確かめられていない");
    expect(m.contact?.dept).toContain("建築行政課");
    expect(m.contact?.phone).toBe("098-923-7601");
    expect(m.contact?.fax).toBe("098-923-7642");
    // 前の「うるま市道路種別マップ」は公開をやめた
    expect(m.contact?.note).toContain("役目を終えた");
  });
});

describe("山口県の、市が扱う市（登録した市）", () => {
  it("下関市：市の地図「しものせき情報マップ」の指定道路図。非道路・色の無い路線・4m未満は建築指導課へ", () => {
    const m = YAMAGUCHI_CITIES.find((x) => x.name === "下関市")!;
    expect(m.codes).toEqual(["35201"]);
    expect(m.coverage).toBe("full");
    expect(m.maps[0].kind).toBe("road_type");
    // 市のページと同じ入口のリンク（地図の中は開いて確かめていない）
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www2.wagmap.jp/shimonoseki/Portal");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("「道路情報」→「指定道路」に印を付け");
    expect(m.maps[0].tip).toContain("「非道路」（破線）");
    expect(m.contact?.phone).toBe("083-231-2065");
    expect(m.contact?.fax).toBe("083-231-4798");
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
    expect(CHUGOKU_PENDING.filter((x) => x.pref === "山口県")).toEqual([]);
  });

  it("山口県の9市は全部登録した。地図のある7市は市のページと同じ入口のリンク（中は開けていないので verified は false）", () => {
    expect(YAMAGUCHI_CITIES.map((x) => x.name)).toEqual(["下関市", "宇部市", "山口市", "萩市", "防府市", "岩国市", "長門市", "周南市", "山陽小野田市"]);
    const of = (name: string) => YAMAGUCHI_CITIES.find((x) => x.name === name)!;
    // 道路種別の地図が市のページに見つからなかった市は「非公開」の扱い（地図なし）
    for (const name of ["萩市", "長門市"]) expect([of(name).coverage, of(name).maps.length], name).toEqual(["none", 0]);
    // 地図のリンクは、市のページに載っているもの
    expect(of("宇部市").maps.map((x) => x.url)).toEqual(["https://www.sonicweb-asp.jp/ube/agreement?theme=th_6", "https://www.sonicweb-asp.jp/ube/agreement?theme=th_5"]);
    expect(of("山口市").maps[0].url).toBe("https://www2.wagmap.jp/yamaguchi");
    expect(of("防府市").maps[0].url).toBe("https://www2.wagmap.jp/hofu/");
    expect(of("岩国市").maps[0].url).toBe("https://www2.wagmap.jp/iwakuni/Portal");
    expect(of("周南市").maps[0].url).toBe("https://webgis.alandis.jp/shunan35/portal/index.html");
    expect(of("山陽小野田市").maps[0].url).toBe("https://www.sonicweb-asp.jp/sanyo-onoda/");
    for (const m of YAMAGUCHI_CITIES) for (const link of m.maps) expect([link.build, link.verified], m.name).toEqual([null, false]);
    // 種別を確かめられていない地図は「一部」とし、そのことを道順に書く
    for (const name of ["宇部市", "山口市", "周南市", "山陽小野田市"]) {
      expect(of(name).coverage, name).toBe("partial");
      expect(of(name).maps[0].tip, name).toContain("確かめられていない");
    }
    // 市が、不動産取引の資料や43条の判断には使えないと書いている地図
    expect(of("岩国市").maps[0].tip).toContain("権利の発生する不動産取引などのための資料");
    expect(of("防府市").maps[0].tip).toContain("43条の敷地と道路の関係を判断する資料には使えない");
    // 窓口
    expect(of("宇部市").contact?.phone).toBe("0836-34-8436");
    expect(of("山口市").contact?.phone).toBe("083-934-2847");
    expect(of("萩市").contact?.fax).toBe("0838-26-6756");
    expect(of("岩国市").contact?.phone).toBe("0827-29-5165");
    expect(of("長門市").contact?.phone).toBe("0837-23-1149");
    expect(of("周南市").contact?.phone).toBe("0834-22-8423");
    expect(of("山陽小野田市").contact?.phone).toBe("0836-82-1215");
    // 山陽小野田市は全域が都市計画区域
    expect(of("山陽小野田市").note).toContain("全域が都市計画区域");
  });
});

describe("長崎県の、市が扱う市（登録した市）", () => {
  it("長崎市：市の地図「ながさきマップ」と、窓口のシステム。どの種別まで載るかは確かめられていないので「一部」", () => {
    const m = NAGASAKI_CITIES.find((x) => x.name === "長崎市")!;
    expect(m.codes).toEqual(["42201"]);
    expect(m.coverage).toBe("partial");
    expect(m.maps[0].kind).toBe("road_type");
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www.sonicweb-asp.jp/nagasakicity/");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("どの種別まで載っているかも確かめられていない");
    expect(m.maps[0].tip).toContain("長崎市指定道路情報案内システム");
    expect(m.contact?.phone).toBe("095-829-1174");
    expect(m.contact?.fax).toBe("095-829-1168");
  });

  it("佐世保市：指定道路図（1項5号・2項・3項）と市道網図。ほかの種別の確かめ方も書く。色の無い路線は電話などでは答えない", () => {
    const m = NAGASAKI_CITIES.find((x) => x.name === "佐世保市")!;
    expect(m.codes).toEqual(["42202"]);
    expect(m.coverage).toBe("partial");
    expect(m.maps.map((x) => x.kind)).toEqual(["designated_only", "public_road"]);
    // 市のページ（承認の画面の手前）を開く。2つの地図は別のページ
    expect(m.maps[0].url).toBe("https://www.city.sasebo.lg.jp/tosiseibi/kentiku/shiteidourozu_h25.html");
    expect(m.maps[1].url).toBe("https://www.city.sasebo.lg.jp/doboku/dokanri/doboku-johomap.html");
    expect(m.maps[0].tip).toContain("1項3号（市の調査が済んだ路線だけ）・1項4号は、あんしん建築課の窓口の端末で確かめる");
    expect(m.contact?.phone).toBe("0956-25-9629");
    expect(m.contact?.noPhoneInquiry).toBe(true);
  });

  it("大村市：市のページ「建築基準法指定道路図」（利用条件の画面）。同意の先は使わない", () => {
    const m = NAGASAKI_CITIES.find((x) => x.name === "大村市")!;
    expect(m.codes).toEqual(["42205"]);
    expect(m.coverage).toBe("partial");
    expect(m.maps[0].kind).toBe("designated_only");
    // 「同意する（閲覧ページへ）」の手前の画面
    expect(m.maps[0].url).toBe("https://www.city.omura.nagasaki.jp/kenchikushidou/machi/kenchiku/doro/teigi/siteidourozu.html");
    expect(m.maps[0].tip).toContain("自分で「同意する（閲覧ページへ）」を押して進む");
    expect(m.contact?.phone).toBe("0957-53-4111（内線482）");
    expect(KYUSHU_PENDING.filter((x) => x.pref === "長崎県")).toEqual([]);
  });
});

describe("徳島県の、市が扱う市（登録した市）", () => {
  it("徳島市：道路種別の地図は市のページに見つからない（非公開の扱い）。市道の図は、市の決まりに合わせてトップページから", () => {
    const m = TOKUSHIMA_CITIES.find((x) => x.name === "徳島市")!;
    expect(m.codes).toEqual(["36201"]);
    expect(m.coverage).toBe("none");
    expect(m.maps.map((x) => x.kind)).toEqual(["public_road"]);
    // 市は、原則としてトップページへリンクするよう求めている（「リンクについて」）
    expect(m.maps[0].url).toBe("https://www.city.tokushima.tokushima.jp/");
    expect(m.maps[0].label).toContain("徳島市ホームページ");
    expect(m.maps[0].tip).toContain("建築基準法の道路種別の図ではない");
    expect(m.contact?.phone).toBe("088-621-5272（指導担当） 088-621-5274（審査担当）");
    expect(m.contact?.fax).toBe("088-621-5273");
    expect(SHIKOKU_PENDING.filter((x) => x.pref === "徳島県")).toEqual([]);
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
    expect(KYUSHU_PENDING.filter((x) => x.pref === "福岡県").map((x) => x.name)).toEqual(["福岡市"]);
  });

  it("久留米市：市の公式ホームページの「指定道路図」（くるめMAP と、地区ごとの PDF）。道路種別の電話での問い合わせは断っている", () => {
    const m = FUKUOKA_CITIES.find((x) => x.name === "久留米市")!;
    expect(m.codes).toEqual(["40203"]);
    expect(m.coverage).toBe("full");
    expect(m.maps[0].kind).toBe("road_type");
    expect(m.maps[0].build).toBeNull();
    expect(m.maps[0].url).toBe("https://www.city.kurume.fukuoka.jp/1050kurashi/2080juutaku/3030taterutoki/2013-0924-1402-207.html");
    // 市の決まり：久留米市公式ホームページだと明記する
    expect(m.maps[0].label).toContain("久留米市公式ホームページ");
    expect(m.maps[0].tip).toContain("町名から地区（A-2〜C-3）を選んで PDF を開く");
    expect(m.maps[0].tip).toContain("指定道路の表示が無い道は、建築指導課の窓口で確かめる");
    expect(m.contact?.phone).toBe("0942-30-9089");
    expect(m.contact?.fax).toBe("0942-30-9743");
    expect(m.contact?.noPhoneInquiry).toBe(true);
  });

  it("大牟田市：道路種別の地図は無い（建築住宅課 指導担当へ。電話のときは地図を FAX かメールで）。市道かどうかは「おおむた地図ナビ」", () => {
    const m = FUKUOKA_CITIES.find((x) => x.name === "大牟田市")!;
    expect(m.codes).toEqual(["40202"]);
    expect(findMunicipality("40202")?.name).toBe("大牟田市");
    expect(m.coverage).toBe("none");
    expect(m.maps).toHaveLength(1);
    expect(m.maps[0].kind).toBe("public_road");
    expect(m.maps[0].build).toBeNull();
    // 市の「よくある質問」のリンク（http）と同じ地図の、https の入口
    expect(m.maps[0].url).toBe("https://www2.wagmap.jp/omuta/Portal");
    expect(m.maps[0].verified).toBe(false);
    expect(m.maps[0].tip).toContain("MICHILU は地図の中を開いて確かめていない");
    expect(m.contact?.dept).toContain("建築住宅課 指導担当");
    expect(m.contact?.phone).toBe("0944-41-2797");
    expect(m.contact?.fax).toBe("0944-41-2795");
    // 電話は断っていない（場所の地図を FAX かメールで送るようお願いしている）
    expect(m.contact?.noPhoneInquiry).toBeUndefined();
    expect(m.contact?.note).toContain("相談場所の地図を FAX かメールで送る");
    expect(m.contact?.note).toContain("道路調査依頼書");
    // 全域が都市計画区域（区域外ではない）
    expect(m.note).toContain("全域が都市計画区域（");
    expect(noCityPlanning(m)).toBe(false);
  });
});

describe("佐賀県の、市が扱う市（登録した市）", () => {
  it("佐賀市：道路種別の地図は無い。建築指導課 指導係（道路位置指定など建築基準法の道路に関すること）", () => {
    expect(SAGA_CITIES.map((m) => m.name)).toEqual(["佐賀市"]);
    const m = SAGA_CITIES[0];
    expect(m.codes).toEqual(["41201"]);
    expect(findMunicipality("41201")?.name).toBe("佐賀市");
    expect(m.coverage).toBe("none");
    expect(m.maps).toEqual([]);
    expect(m.contact?.dept).toBe("都市戦略部 建築指導課 指導係（栄町1番1号 本庁6階）");
    expect(m.contact?.phone).toBe("0952-40-7170");
    expect(m.contact?.fax).toBe("0952-40-7392");
    expect(m.contact?.note).toContain("協定道路制度");
    expect(m.note).toContain("佐賀市の一部は都市計画区域の外");
    expect(KYUSHU_PENDING.filter((x) => x.pref === "佐賀県")).toEqual([]);
  });
});

describe("熊本県の、市が扱う市（登録した市）", () => {
  it("天草市：道路種別の地図は無い。建築住宅課へ（道路判定事前協議書・位置指定道路の一覧）。熊本市・八代市は調査中に残る", () => {
    expect(KUMAMOTO_CITIES.map((m) => m.name)).toEqual(["天草市"]);
    const m = KUMAMOTO_CITIES[0];
    expect(m.codes).toEqual(["43215"]);
    expect(findMunicipality("43215")?.name).toBe("天草市");
    expect(m.coverage).toBe("none");
    expect(m.maps).toEqual([]);
    expect(m.contact?.phone).toBe("0969-32-6797");
    expect(m.contact?.fax).toBe("0969-24-4266");
    expect(m.contact?.hours).toBe("平日 8:30〜17:15（市役所の業務時間）");
    expect(m.contact?.note).toContain("道路判定事前協議書");
    expect(m.contact?.note).toContain("平成24年度以降に市が指定したもの");
    expect(m.note).toContain("天草市の一部は都市計画区域の外");
    expect(KYUSHU_PENDING.filter((x) => x.pref === "熊本県").map((x) => x.name)).toEqual(["熊本市", "八代市"]);
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
    // 特定行政庁の10市は全部登録した。残りは限定特定行政庁の29市町
    expect(HOKKAIDO_PENDING).toHaveLength(29);
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

  it("特定行政庁の残りの7市（小樽・室蘭・釧路・帯広・北見・苫小牧・江別）を登録。道路種別の地図は、どの市のページにも無い", () => {
    const codes: Record<string, string> = { 小樽市: "01203", 室蘭市: "01205", 釧路市: "01206", 帯広市: "01207", 北見市: "01208", 苫小牧市: "01213", 江別市: "01217" };
    for (const [name, code] of Object.entries(codes)) {
      const m = HOKKAIDO_CITIES.find((x) => x.name === name)!;
      expect(m.codes, name).toEqual([code]);
      expect(findMunicipality(code)?.name, name).toBe(name);
      expect(m.coverage, name).toBe("none");
      // 道路種別の地図は無い（市道の参考の地図だけは出すことがある）
      expect(m.maps.filter((l) => l.kind !== "public_road"), name).toEqual([]);
      expect(m.note, name).toContain("建築主事を置く市");
      expect(m.contact?.phone, name).toMatch(/^0\d+-\d+-\d{4}/);
    }
    // 江別市だけ全域が都市計画区域。ほかは一部が区域の外
    expect(HOKKAIDO_CITIES.find((x) => x.name === "江別市")!.note).toContain("江別市は、全域が都市計画区域");
    for (const name of ["小樽市", "室蘭市", "釧路市", "帯広市", "北見市", "苫小牧市"]) expect(HOKKAIDO_CITIES.find((x) => x.name === name)!.note, name).toContain(`${name}の一部は都市計画区域の外`);
    // 小樽市は市道の地図（でじ樽なび）
    const otaru = HOKKAIDO_CITIES.find((x) => x.name === "小樽市")!;
    expect(otaru.maps[0].kind).toBe("public_road");
    expect(otaru.maps[0].url).toBe("https://otaru.geocloud.jp/mp/40");
    expect(otaru.contact?.phone).toBe("0134-32-4111（代表）");
    // 苫小牧市は道路の位置の指定を受け持つ指導係（確認申請の建築確認係ではない）
    expect(HOKKAIDO_CITIES.find((x) => x.name === "苫小牧市")!.contact?.phone).toBe("0144-32-6527");
    // 江別市は、道路の確認を受け付ける建築確認係
    expect(HOKKAIDO_CITIES.find((x) => x.name === "江別市")!.contact?.dept).toContain("建築確認係");
  });
});

describe("広島県（県が扱う15市町と、市が扱う8市を登録）", () => {
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

  it("受け持ちの建設事務所：西部 10・東部 3・北部 2。市が扱う8市は登録したので、調査中の一覧に広島県は残っていない", () => {
    const by = (word: string) => HIROSHIMA.filter((m) => m.contact!.dept.includes(word)).map((m) => m.name);
    expect(by("西部建設事務所")).toHaveLength(10);
    expect(by("東部建設事務所").sort()).toEqual(["世羅町", "府中市", "神石高原町"].sort());
    expect(by("北部建設事務所").sort()).toEqual(["安芸高田市", "庄原市"].sort());
    expect(CHUGOKU_PENDING.filter((m) => m.pref === "広島県")).toEqual([]);
    expect(HIROSHIMA_CITIES.map((m) => m.name)).toEqual(["広島市", "呉市", "三原市", "尾道市", "福山市", "三次市", "東広島市", "廿日市市"]);
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

  const city = (name: string) => HIROSHIMA_CITIES.find((x) => x.name === name)!;

  it("7市とも：コードは1つで、都市計画区域が市の一部（国の都市別一覧）。地図サイトはここから開けないので、場所を指定して開く形は使わない", () => {
    const codes: Record<string, string> = { 呉市: "34202", 三原市: "34204", 尾道市: "34205", 福山市: "34207", 三次市: "34209", 東広島市: "34212", 廿日市市: "34213" };
    for (const [name, code] of Object.entries(codes)) {
      const m = city(name);
      expect(m.codes, name).toEqual([code]);
      expect(findMunicipality(code)?.name, name).toBe(name);
      expect(m.note, name).toContain(`${name}の一部は都市計画区域の外`);
      for (const l of m.maps) {
        expect(l.build, `${name} ${l.label}`).toBeNull();
        // 外の地図サイト（wagmap・sonicweb・alandis）は中を確かめていない。市のページそのものを開くリンクだけ確かめ済み
        expect(l.verified, `${name} ${l.label}`).toBe((l.url ?? "").includes(".hiroshima.jp/"));
        if (!l.verified) expect(l.tip, `${name} ${l.label}`).toContain("MICHILU は地図の中を開いて確かめていない");
      }
      // 同じ市の地図のリンクは、URL が重ならない（画面の並びのキーに使う）
      expect(new Set(m.maps.map((l) => l.url)).size, name).toBe(m.maps.length);
      // 電話を断ると書いている市は無い（遠慮を求める市は、注意書きに入れる）
      expect(m.contact?.noPhoneInquiry, name).toBeUndefined();
    }
  });

  it("呉市：市の地図に「建築基準法道路情報」（利用条件のページから）と「道路情報」。どの種別まで載るかは確かめられていないので partial", () => {
    const m = city("呉市");
    expect(m.coverage).toBe("partial");
    expect(m.maps.map((l) => l.kind)).toEqual(["road_type", "public_road"]);
    // 市「地図情報」のページが出しているリンク（利用条件に同意して進む形）
    expect(m.maps[0].url).toBe("https://www2.wagmap.jp/kurecity/Agreement?IsPost=False&MapId=9&RequestPage=%2fkurecity%2fPositionSelect%3fmid%3d9");
    expect(m.maps[0].tip).toContain("自分で同意");
    expect(m.maps[0].tip).toContain("どの種別まで載っているかも確かめられていない");
    expect(m.maps[1].url).toBe("https://www2.wagmap.jp/kurecity/Portal");
    expect(m.maps[1].tip).toContain("令和4年3月現在");
    expect(m.maps[1].tip).toContain("種別を示す地図ではない");
    // 市のページは「Tel：0823-25-3511,3512」と書いている
    expect(m.contact).toMatchObject({ phone: "0823-25-3511 0823-25-3512", fax: "0823-24-6831" });
    expect(m.contact!.dept).toContain("建築指導課 建築確認グループ");
    // 市が書いている2項道路の基準（MICHILU の判断ではなく、市の説明の引用）
    expect(m.note).toContain("1.8m");
    expect(m.note).toContain("市「敷地と道路について」");
  });

  it("三原市：道路種別の地図は見つからず none。建築基準法上の道路は、計画地の地図を FAX などで送ると答えてもらえる", () => {
    const m = city("三原市");
    expect(m.coverage).toBe("none");
    expect(m.maps.map((l) => l.kind)).toEqual(["public_road"]);
    expect(m.maps[0].url).toBe("https://www2.wagmap.jp/mihara/");
    expect(m.maps[0].tip).toContain("道路台帳図");
    expect(m.maps[0].tip).toContain("道路を証明するものではない");
    expect(m.maps[0].tip).toContain("種別を示す地図ではない");
    expect(m.contact).toMatchObject({ phone: "0848-67-6122", fax: "0848-64-6057" });
    expect(m.contact!.note).toContain("FAX");
  });

  it("尾道市：道路種別の地図は見つからず none。市の決まりに合わせて、市道の図は市のトップページから進む", () => {
    const m = city("尾道市");
    expect(m.coverage).toBe("none");
    expect(m.maps.map((l) => l.kind)).toEqual(["public_road"]);
    // 市は「リンク設定はトップページへお願いします。他のページへのリンクは…ご遠慮ください」と書いている（リンク・著作権・免責事項）
    expect(m.maps[0].url).toBe("https://www.city.onomichi.hiroshima.jp/");
    expect(m.maps[0].label).toContain("尾道市ホームページのトップページから進む");
    expect(m.maps[0].tip).toContain("「組織でさがす」→「用地課」→「尾道市道路台帳（路線網図）Web版」");
    expect(m.maps[0].tip).toContain("令和6年3月末時点");
    expect(m.contact).toMatchObject({ phone: "0848-38-9245", fax: "0848-38-9295", email: "k-shidou@city.onomichi.hiroshima.jp" });
    // 電話は断っていない（先に地図を FAX・メールで送ってほしい、という求め）
    expect(m.contact!.note).toContain("先に FAX やメールで地図を送る");
  });

  it("福山市：市の地図の「指定道路」に載っているのは位置指定道路（designated_only・partial）。調べられていない道は道路調査依頼書", () => {
    const m = city("福山市");
    expect(m.coverage).toBe("partial");
    expect(m.maps.map((l) => l.kind)).toEqual(["designated_only"]);
    expect(m.maps[0].url).toBe("https://www.sonicweb-asp.jp/fukuyama/");
    expect(m.maps[0].tip).toContain("位置指定道路（1項5号）");
    expect(m.maps[0].tip).toContain("参考図");
    expect(m.contact).toMatchObject({ phone: "084-928-1104", fax: "084-928-1735" });
    expect(m.contact!.note).toContain("道路調査依頼書");
    expect(m.contact!.note).toContain("3週間ほど");
  });

  it("三次市：市が建築確認を扱うのは小さい木造の建築物だけ。道路種別は市の都市建築課へ。市道の名称の図は営利目的に使えない", () => {
    const m = city("三次市");
    expect(m.coverage).toBe("none");
    expect(m.maps.map((l) => l.kind)).toEqual(["public_road"]);
    // 市のページ（注意事項が書いてある案内のページ）を開く。市のサイトはリンク自由（リンクしたら知らせる決まり）
    expect(m.maps[0].url).toBe("https://www.city.miyoshi.hiroshima.jp/soshiki/26/37056.html");
    expect(m.maps[0].tip).toContain("認定路線網図で得られた情報を営利目的で利用することはできません");
    expect(m.maps[0].tip).toContain("種別を示す地図ではない");
    expect(m.contact).toMatchObject({ phone: "0824-62-6385", fax: "0824-62-6166", email: "toshikenchiku@city.miyoshi.hiroshima.jp" });
    expect(m.contact!.hours).toContain("9:00〜17:00");
    // 県の表の注：木造の建築物のうち、3階以上・300㎡超・16m超を除く。それ以外は県の北部建設事務所
    expect(m.note).toContain("地上3階以上・延べ面積300㎡超・高さ16m超のどれにも当たらないもの");
    expect(m.note).toContain("北部建設事務所 建築課（0824-63-5209）");
  });

  it("東広島市：指定道路図を市の地図で公開。指定道路以外の道路も種別を色分けで出している（full）", () => {
    const m = city("東広島市");
    expect(m.coverage).toBe("full");
    expect(m.maps.map((l) => l.kind)).toEqual(["road_type"]);
    expect(m.maps[0].url).toBe("https://www.sonicweb-asp.jp/higashihiroshima/");
    expect(m.maps[0].tip).toContain("表示テーマ「指定道路」");
    expect(m.maps[0].tip).toContain("自分で同意");
    expect(m.maps[0].tip).toContain("証明書は出していない");
    expect(m.contact).toMatchObject({ phone: "082-420-0956", fax: "082-421-7220" });
    // 電話は「遠慮してほしい」（断ってはいない）。注意書きに入れる
    expect(m.contact!.note).toContain("電話での問い合わせは、聞き間違いなどのおそれがあるので遠慮してほしい");
  });

  it("廿日市市：市の地図情報システムに「建築基準法道路情報」。どの種別まで載るかは確かめられていないので partial", () => {
    const m = city("廿日市市");
    expect(m.coverage).toBe("partial");
    expect(m.maps.map((l) => l.kind)).toEqual(["road_type"]);
    expect(m.maps[0].url).toBe("https://webgis.alandis.jp/hatsukaichi34/webgis/");
    expect(m.maps[0].tip).toContain("どの種別まで載っているかも確かめられていない");
    expect(m.contact!.phone).toBe("0829-30-9191");
    expect(m.contact!.fax).toBeUndefined();
    expect(m.contact!.hours).toContain("受け付けは17:00まで");
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
      cities: [],
      offices: { 備前県民局: 5, 備中県民局: 6, 美作県民局: 9 },
    },
    {
      pref: "山口県",
      list: YAMAGUCHI,
      pending: CHUGOKU_PENDING,
      total: 10,
      outside: ["上関町", "阿武町"],
      // 特定行政庁の7市と、限定特定行政庁の長門市・山陽小野田市は、全部登録した（下の「山口県の、市が扱う市」）
      cities: [],
      offices: { 柳井土木建築事務所: 6, 周南土木建築事務所: 2, 宇部土木建築事務所: 2 },
    },
    {
      pref: "鳥取県",
      list: TOTTORI,
      pending: CHUGOKU_PENDING,
      total: 15,
      outside: ["大山町", "南部町", "伯耆町", "日南町", "日野町", "江府町"],
      // 鳥取市・米子市・倉吉市と、限定特定行政庁の境港市は、全部登録した（上の「鳥取県の、市が扱う市」）
      cities: [],
      offices: { 東部建築住宅事務所: 4, 中部総合事務所: 4, 西部総合事務所: 7 },
    },
    {
      pref: "島根県",
      list: SHIMANE,
      pending: CHUGOKU_PENDING,
      total: 11,
      outside: ["飯南町", "美郷町", "邑南町", "海士町", "西ノ島町", "知夫村"],
      // 特定行政庁の松江市・出雲市と、限定特定行政庁の6市は、全部登録した（上の「島根県の、市が扱う市」）
      cities: [],
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
      // 特定行政庁の今治市・新居浜市・西条市と、限定特定行政庁の宇和島市は登録した。松山市は、市のサイトがこの作業の環境から読めないので調査中のまま
      cities: ["松山市"],
      offices: { 東予地方局: 1, 四国中央土木事務所: 1, 中予地方局: 5, 八幡浜土木事務所: 4, 南予地方局: 4 },
    },
    {
      pref: "徳島県",
      list: TOKUSHIMA,
      pending: SHIKOKU_PENDING,
      total: 23,
      outside: ["阿波市", "勝浦町", "上勝町", "佐那河内村", "神山町", "那賀町", "海陽町", "板野町", "上板町", "東みよし町"],
      // 特定行政庁は徳島市だけ（登録した。下の「徳島県の、市が扱う市」）
      cities: [],
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
      // 市が扱う4市のうち、まだ調べている途中の市（北九州市・久留米市・大牟田市は登録した）
      cities: ["福岡市"],
      offices: { 福岡県土整備事務所: 9, 那珂県土整備事務所: 5, 朝倉県土整備事務所: 3, 久留米県土整備事務所: 3, 南筑後県土整備事務所: 4, 八女県土整備事務所: 3, 飯塚県土整備事務所: 3, 直方県土整備事務所: 4, 田川県土整備事務所: 8, 北九州県土整備事務所: 7, 京築県土整備事務所: 7 },
    },    {
      pref: "佐賀県",
      list: SAGA,
      pending: KYUSHU_PENDING,
      total: 19,
      // 江北町は準都市計画区域があるので区域外にしない
      outside: ["玄海町", "大町町", "太良町"],
      // 市が扱う佐賀市は登録した（下の「佐賀県の、市が扱う市」）
      cities: [],
      offices: { 佐賀土木事務所: 2, 東部土木事務所: 6, 唐津土木事務所: 2, 伊万里土木事務所: 2, 杵藤土木事務所: 7 },
    },    {
      pref: "長崎県",
      list: NAGASAKI,
      pending: KYUSHU_PENDING,
      total: 18,
      outside: ["小値賀町"],
      // 特定行政庁の長崎市・佐世保市と、限定特定行政庁の大村市は登録した（下の「長崎県の、市が扱う市」。五島市は、県のページに受け持ちの分かれ方があるので県の一覧に入れてある）
      cities: [],
      offices: { 長崎振興局: 2, 県央振興局: 1, 島原振興局: 3, 県北振興局: 8, "五島振興局 建設部": 1, 上五島支所: 1, 壱岐振興局: 1, 対馬振興局: 1 },
    },    {
      pref: "熊本県",
      list: KUMAMOTO,
      pending: KYUSHU_PENDING,
      total: 42,
      // 都市計画区域の無い25市町村のうち、準都市計画区域のある玉東町・西原村は区域外にしない
      outside: ["上天草市", "美里町", "南関町", "和水町", "南小国町", "小国町", "産山村", "高森町", "南阿蘇村", "甲佐町", "山都町", "氷川町", "津奈木町", "錦町", "多良木町", "湯前町", "水上村", "相良村", "五木村", "山江村", "球磨村", "あさぎり町", "苓北町"],
      // 市が扱う3市のうち、まだ調べている途中の市（天草市は登録した。下の「熊本県の、市が扱う市」）
      cities: ["熊本市", "八代市"],
      offices: { 県央広域本部: 10, 県北広域本部: 18, 県南広域本部: 14 },
    },    {
      pref: "大分県",
      list: OITA,
      pending: KYUSHU_PENDING,
      total: 12,
      outside: ["姫島村", "九重町"],
      // 特定行政庁の6市は、全部登録した（下の「大分県の、市が扱う市」）
      cities: [],
      offices: { 別府土木事務所: 4, 大分土木事務所: 1, 臼杵土木事務所: 2, 豊後大野土木事務所: 2, 日田土木事務所: 2, 中津土木事務所: 1 },
    },    {
      pref: "宮崎県",
      list: MIYAZAKI,
      pending: KYUSHU_PENDING,
      total: 22,
      outside: ["西米良村", "木城町", "諸塚村", "椎葉村", "美郷町", "日之影町", "五ヶ瀬町"],
      // 市が扱う4市のうち、まだ調べている途中の市（宮崎市・都城市・延岡市は登録した。下の「宮崎県の、市が扱う市」。
      // 日向市は、市のホームページがシステム障害で臨時のページになっていて、確かめられなかった）
      cities: ["日向市"],
      // 問い合わせ先は本務の事務所（国富町・綾町＝宮崎、西都市・西米良村＝高鍋、串間市＝日南）
      offices: { 宮崎土木事務所: 2, 高鍋土木事務所: 7, 日南土木事務所: 2, 都城土木事務所: 1, 小林土木事務所: 3, 日向土木事務所: 4, 西臼杵支庁: 3 },
    },    {
      pref: "鹿児島県",
      list: KAGOSHIMA,
      pending: KYUSHU_PENDING,
      total: 39,
      outside: ["三島村", "十島村", "長島町", "東串良町", "大和村", "宇検村", "伊仙町", "与論町"],
      // 市が扱う4市（特定行政庁の鹿児島市と、限定特定行政庁の鹿屋市・薩摩川内市・霧島市）は、全部登録した（下の「鹿児島県の、市が扱う市」）
      cities: [],
      offices: { 鹿児島地域振興局: 4, 南薩地域振興局: 4, 北薩地域振興局: 4, "姶良・伊佐地域振興局 建設部 土木建築課 建築係": 2, 伊佐市駐在: 1, 大隅地域振興局: 8, "熊毛支庁 建設部": 3, 屋久島事務所: 1, "大島支庁 建設部": 9, 徳之島事務所: 3 },
    },    {
      pref: "沖縄県",
      list: OKINAWA,
      pending: KYUSHU_PENDING,
      total: 36,
      outside: ["国頭村", "大宜味村", "東村", "今帰仁村", "恩納村", "宜野座村", "金武町", "伊江村", "伊平屋村", "伊是名村", "久米島町", "渡嘉敷村", "座間味村", "粟国村", "渡名喜村", "南大東村", "北大東村", "多良間村", "竹富町", "与那国町"],
      // 特定行政庁の5市は、全部登録した（下の「沖縄県の、市が扱う市」）
      cities: [],
      offices: { 北部土木事務所: 12, 中部土木事務所: 6, 南部土木事務所: 13, 宮古土木事務所: 2, 八重山土木事務所: 3 },
    },
    {
      pref: "北海道",
      list: HOKKAIDO,
      pending: HOKKAIDO_PENDING,
      total: 140,
      // 都市計画区域の無い80町村から、準都市計画区域のあるニセコ町を除いた79
      outside: ["上砂川町", "由仁町", "月形町", "浦臼町", "妹背牛町", "秩父別町", "雨竜町", "北竜町", "沼田町", "新篠津村", "島牧村", "寿都町", "黒松内町", "蘭越町", "真狩村", "留寿都村", "喜茂別町", "京極町", "泊村", "神恵内村", "積丹町", "仁木町", "赤井川村", "豊浦町", "平取町", "新冠町", "様似町", "えりも町", "松前町", "知内町", "鹿部町", "上ノ国町", "厚沢部町", "乙部町", "奥尻町", "当麻町", "比布町", "愛別町", "東川町", "中富良野町", "南富良野町", "占冠村", "和寒町", "剣淵町", "音威子府村", "中川町", "幌加内町", "小平町", "苫前町", "初山別村", "遠別町", "天塩町", "猿払村", "中頓別町", "豊富町", "礼文町", "利尻町", "利尻富士町", "幌延町", "津別町", "清里町", "小清水町", "訓子府町", "置戸町", "佐呂間町", "湧別町", "西興部村", "士幌町", "上士幌町", "鹿追町", "中札内村", "更別村", "豊頃町", "陸別町", "浜中町", "鶴居村", "別海町", "標津町", "羅臼町"],
      // 特定行政庁の10市は全部登録した（data/hokkaido-cities.ts）。限定特定行政庁の29市町は、まだ調べている途中
      cities: ["岩見沢市", "網走市", "留萌市", "稚内市", "紋別市", "士別市", "名寄市", "三笠市", "根室市", "千歳市", "砂川市", "深川市", "富良野市", "登別市", "恵庭市", "伊達市", "北広島市", "石狩市", "当別町", "森町", "長沼町", "東神楽町", "美幌町", "遠軽町", "白老町", "音更町", "芽室町", "幕別町", "中標津町"],
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

