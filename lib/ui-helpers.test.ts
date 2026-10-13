import { describe, expect, it } from "vitest";
import { parsePhones } from "./phone";
import { buildLinks, findMunicipality, resolveContact } from "./roadmap";
import { HAZARDS } from "./roadmap/hazard";
import { buildSummary } from "./summary";
import { TILE, tilesAround, toWorldPixel } from "./tiles";

describe("parsePhones", () => {
  it("複数番号とラベルを分ける", () => {
    expect(parsePhones("048-242-6344（第1係）/ 048-258-1199（第2係）")).toEqual([
      { number: "048-242-6344", label: "第1係" },
      { number: "048-258-1199", label: "第2係" },
    ]);
  });

  it("ラベルなしの番号", () => {
    expect(parsePhones("049-224-5987")).toEqual([{ number: "049-224-5987", label: undefined }]);
  });

  it("番号がなければ空", () => {
    expect(parsePhones("窓口のみ")).toEqual([]);
  });
});

describe("tiles", () => {
  it("経度0・緯度0はズーム0で世界の中心", () => {
    expect(toWorldPixel(0, 0, 0)).toEqual({ x: 128, y: 128 });
  });

  it("中心点は必ず真ん中のタイルの中に入る", () => {
    const { tiles, offsetX, offsetY } = tilesAround(35.892464, 139.789764, 17);
    expect(tiles).toHaveLength(9);
    expect(offsetX).toBeGreaterThanOrEqual(TILE);
    expect(offsetX).toBeLessThan(TILE * 2);
    expect(offsetY).toBeGreaterThanOrEqual(TILE);
    expect(offsetY).toBeLessThan(TILE * 2);
    expect(tiles[4].url).toMatch(/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/std\/17\/\d+\/\d+\.png$/);
  });

  it("縮小表示(128px・5x5)でも中心点は真ん中のタイルの中", () => {
    const { tiles, offsetX, offsetY } = tilesAround(35.892464, 139.789764, 18, { size: 128, radius: 2, layer: "pale" });
    expect(tiles).toHaveLength(25);
    expect(offsetX).toBeGreaterThanOrEqual(128 * 2);
    expect(offsetX).toBeLessThan(128 * 3);
    expect(offsetY).toBeGreaterThanOrEqual(128 * 2);
    expect(offsetY).toBeLessThan(128 * 3);
    expect(tiles[12].url).toContain("/pale/18/");
  });
});

describe("buildSummary", () => {
  it("住所・対応状況・地図URL・窓口を1つの文章にまとめる", () => {
    const m = findMunicipality("11202")!;
    const text = buildSummary({
      status: "ok",
      lat: 36.147129,
      lng: 139.38858,
      matchedAddress: "埼玉県熊谷市宮町二丁目",
      town: "宮町二丁目",
      approximate: false,
      municipality: m,
      links: buildLinks(m, 36.147129, 139.38858),
      contact: resolveContact(m, "11202"),
    });
    expect(text).toContain("埼玉県熊谷市宮町二丁目 付近");
    expect(text).toContain("埼玉県熊谷市：ネットで分かるのは一部");
    expect(text).toContain("https://www2.wagmap.jp/kumagaya/Map?mid=170");
    expect(text).toContain("窓口：熊谷市 建築審査課 0493-39-4809");
    expect(text).not.toContain("地図で選んだ地点");
  });

  it("地図で選んだ地点は、その地点を地理院地図で開く URL を添える", () => {
    const m = findMunicipality("11202")!;
    const text = buildSummary({
      status: "ok",
      lat: 36.147129,
      lng: 139.38858,
      matchedAddress: "埼玉県熊谷市宮町二丁目",
      town: "宮町二丁目",
      approximate: false,
      picked: true,
      municipality: m,
      links: buildLinks(m, 36.147129, 139.38858),
    });
    expect(text.split("\n")[1]).toBe("地図で選んだ地点：https://maps.gsi.go.jp/#18/36.147129/139.388580/");
  });

  it("災害リスク（国のデータ）と、市区町村のハザードマップのページを添える", () => {
    const m = findMunicipality("13123")!;
    const flood = HAZARDS.flood.layers[0];
    const text = buildSummary(
      {
        status: "ok",
        lat: 35.6838,
        lng: 139.8641,
        matchedAddress: "東京都江戸川区船堀四丁目1番1号",
        town: "船堀四丁目",
        approximate: false,
        municipality: m,
        links: buildLinks(m, 35.6838, 139.8641),
      },
      {
        hazard: {
          report: { flood: { status: "ok", hits: [{ layer: flood, at: flood.classes.find((c) => c.label === "3〜5m") }] }, dosha: { status: "ok", hits: [] } },
          elevation: { value: -1, source: "5mメッシュ（航空レーザ測量）" },
          maps: { flood: "https://example.jp/hm.html", takashio: "https://example.jp/hm.html", naisui: "https://example.jp/naisui.html" },
          muniCd: "13123",
        },
      },
    );
    expect(text).toContain("【災害リスク（国のデータ・参考）】\n・洪水（想定最大規模）：浸水 3〜5m\n・土砂災害警戒区域等：区域外\n・地面の高さ（標高）：約-1.0m");
    expect(text).toContain("・江戸川区の洪水・高潮のハザードマップ\n  https://example.jp/hm.html");
    expect(text).toContain("・江戸川区の内水のハザードマップ\n  https://example.jp/naisui.html");
    expect(text).toContain("※災害リスクの出典：「ハザードマップポータルサイト」");
    expect(text).toContain("重要事項説明には使えません");
  });

  it("地点の建物（PLATEAU）を1行で添える", () => {
    const m = findMunicipality("13116")!;
    const text = buildSummary(
      {
        status: "ok",
        lat: 35.73135,
        lng: 139.71985,
        matchedAddress: "東京都豊島区東池袋四丁目",
        town: "東池袋四丁目",
        approximate: false,
        municipality: m,
        links: buildLinks(m, 35.73135, 139.71985),
      },
      {
        building: {
          hit: {
            building: { point: [139.71995, 35.73142], box: [-26, -25, 26, 25], name: "ヴァンガードタワー", usage: "共同住宅", above: 38, below: 3, structure: "耐火構造", height: 105.9 },
            distance: 12,
            onParcel: true,
          },
          others: [],
        },
      },
    );
    expect(text).toContain("【建物（PLATEAU・参考）】ヴァンガードタワー・共同住宅・地上38階・地下3階・耐火構造・高さ約105.9m");
    expect(text).toContain("※建物の出典：「3D都市モデル（Project PLATEAU）」（国土交通省");
  });

  it("近くの地価（地価公示・地価調査）を3地点まで添える", () => {
    const m = findMunicipality("13101")!;
    const hit = (no: string, kind: "公示" | "調査", price: number, distance: number, change?: number) => ({
      kind,
      no,
      point: [139.7448, 35.6901] as [number, number],
      price,
      change,
      usage: "住宅地" as const,
      year: 2026,
      history: [],
      distance,
      bearing: "北東",
    });
    const text = buildSummary(
      {
        status: "ok",
        lat: 35.6895,
        lng: 139.7441,
        matchedAddress: "東京都千代田区三番町",
        town: "三番町",
        approximate: false,
        municipality: m,
        links: buildLinks(m, 35.6895, 139.7441),
      },
      { landPrice: [hit("千代田-1", "公示", 4_410_000, 92, 11.4), hit("千代田(都)-1", "調査", 5_700_000, 640, 11.8), hit("千代田-5", "公示", 3_000_000, 900), hit("千代田-9", "公示", 2_000_000, 1500)] },
    );
    expect(text).toContain(
      "【近くの地価（標準地・基準地の価格・参考）】\n・地価公示 千代田-1（住宅地・北東へ約90m）：441万円/m²（前年比 +11.4%、2026年1月1日時点）\n" +
        "・地価調査 千代田(都)-1（住宅地・北東へ約640m）：570万円/m²（前年比 +11.8%、2026年7月1日時点）\n" +
        "・地価公示 千代田-5（住宅地・北東へ約900m）：300万円/m²（前年比 新規、2026年1月1日時点）\n",
    );
    expect(text).not.toContain("千代田-9");
    // 学区は渡していないので出さない
    expect(text).not.toContain("【学区");
    expect(text).toContain("※地価の出典：「国土数値情報（地価公示データ・都道府県地価調査データ）」（国土交通省");
    expect(text).toContain("物件そのものの価格ではありません");
  });
});

describe("buildSummary の最寄り駅", () => {
  it("徒歩の目安（道路距離 80m を1分）と、直線の目安・出典を添える", () => {
    const m = findMunicipality("14109")!;
    const text = buildSummary(
      {
        status: "ok",
        lat: 35.5146,
        lng: 139.6218,
        matchedAddress: "神奈川県横浜市港北区大豆戸町",
        town: "大豆戸町",
        approximate: false,
        municipality: m,
        links: buildLinks(m, 35.5146, 139.6218),
      },
      {
        stations: [
          { name: "新横浜", lines: [["ブルーライン", "横浜市営"], ["横浜線", "JR東日本"]], meters: 838, minutes: 11, straight: 750, routed: true },
          { name: "菊名", lines: [["東横線", "東急"]], meters: 2380, minutes: 30, straight: 2380, routed: false },
        ],
      },
    );
    expect(text).toContain("【最寄り駅（徒歩の目安・道路距離 80m を1分）】\n・新横浜駅（横浜市営ブルーライン・JR横浜線）徒歩約11分（約840m）\n・菊名駅（東急東横線）直線約2.4km");
    expect(text).toContain("※駅の出典：「国土数値情報（鉄道データ）」（国土交通省");
    expect(text).toContain("広告には実際の道路距離で");
  });
});

describe("buildSummary の地番", () => {
  it("公図から推定した筆は、確かさに合わせてずれの目安を添え、出典も付ける", () => {
    const m = findMunicipality("14109")!;
    const result = {
      status: "ok" as const,
      lat: 35.5536,
      lng: 139.6467,
      matchedAddress: "神奈川県横浜市港北区日吉五丁目",
      town: "日吉五丁目",
      approximate: false,
      municipality: m,
      links: buildLinks(m, 35.5536, 139.6467),
    };
    const parcels = (estimated?: "high" | "low") => ({ parcels: { target: "横浜市港北区日吉５丁目 1234", neighbors: ["1233"], reference: false, estimated } });
    const low = buildSummary(result, parcels("low"));
    expect(low).toContain("【謄本・公図用の地番（公図から推定した位置・確度が低く、5m前後ずれることあり）】\n・物件：横浜市港北区日吉５丁目 1234");
    expect(low).toContain("国土地理院の基盤地図情報（道路縁）に合わせて MICHILU が推定の位置に置いたもの");
    expect(buildSummary(result, parcels("high"))).toContain("【謄本・公図用の地番（公図から推定した位置・数mずれることあり）】");
    const plain = buildSummary(result, parcels());
    expect(plain).toContain("【謄本・公図用の地番】");
    expect(plain).not.toContain("基盤地図情報");
  });
});

describe("buildSummary の学区", () => {
  it("小学校区・中学校区を添える（データの年と、教育委員会で確かめる旨も）", () => {
    const m = findMunicipality("13104")!;
    const text = buildSummary(
      {
        status: "ok",
        lat: 35.7128,
        lng: 139.7046,
        matchedAddress: "東京都新宿区高田馬場一丁目",
        town: "高田馬場一丁目",
        approximate: false,
        municipality: m,
        links: buildLinks(m, 35.7128, 139.7046),
      },
      {
        schools: {
          elementary: { kind: "小学校", name: "戸塚第二小学校", owner: "新宿区立", city: "13104", distance: 120 },
          junior: { kind: "中学校", name: "西早稲田中学校", owner: "新宿区", city: "13104", distance: 739 },
        },
      },
    );
    expect(text).toContain("【学区（参考・令和5年度（2023年度）のデータ）】\n・小学校：戸塚第二小学校（新宿区立・直線約120m）\n・中学校：西早稲田中学校（新宿区・直線約740m）");
    expect(text).toContain("※学区の出典：「国土数値情報（小学校区データ・中学校区データ・学校データ）」（国土交通省");
    expect(text).toContain("指定校は教育委員会で確認を");
  });
});

describe("buildInquiryText", () => {
  it("宛先・所在地・聞くことを入れた依頼文を作る", async () => {
    const { buildInquiryText, ASK } = await import("./inquiry");
    const t = buildInquiryText("埼玉県熊谷市宮町二丁目47番地", "熊谷市 建築審査課");
    expect(t.startsWith("熊谷市 建築審査課 御中")).toBe(true);
    expect(t).toContain("所在地：埼玉県熊谷市宮町二丁目47番地");
    expect(t).toContain(`1. ${ASK[0]}`);
  });
});
