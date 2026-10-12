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
