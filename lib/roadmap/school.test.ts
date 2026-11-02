import { open, stat } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/school-source.json";
import { SCHOOL_ZOOM, schoolCredit, schoolDistanceText, schoolGaps, schoolGapShort, schoolGapText, schoolLine, schoolShort, schoolsAt, withSchoolWalks, type SchoolArea } from "./school";
import { schoolGap, schoolSearchUrl } from "./school-data";
import { schoolTileSource } from "./school-tiles";
import { tileOf } from "./parcel";
import type { LngLat } from "./parcel";

/** 地点 (lat, lng) のまわり d 度四方の正方形 */
const square = (lat: number, lng: number, d: number): LngLat[][] => [
  [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ],
];

describe("地点の学区", () => {
  const LAT = 35.7;
  const LNG = 139.7;
  const [TX, TY] = tileOf(LAT, LNG, SCHOOL_ZOOM);
  const area = (props: Partial<SchoolArea>): SchoolArea => ({ kind: "小学校", name: "テスト小学校", city: "13104", polygons: [square(LAT, LNG, 0.001)], ...props });

  it("地点を含む小学校区・中学校区。学校までの直線距離", async () => {
    const r = await schoolsAt(LAT, LNG, {
      tile: async (x, y) =>
        x === TX && y === TY
          ? [
              area({ name: "となり小学校", polygons: [square(LAT + 0.003, LNG, 0.001)] }),
              area({ name: "戸塚第二小学校", owner: "新宿区立", point: [LNG + 0.003, LAT] }),
              area({ kind: "中学校", name: "西早稲田中学校", owner: "新宿区", polygons: [square(LAT, LNG, 0.01)] }),
            ]
          : [],
    });
    expect(r?.elementary?.name).toBe("戸塚第二小学校");
    expect(r?.elementary?.distance).toBeCloseTo(270, -1);
    expect(r?.junior?.name).toBe("西早稲田中学校");
    expect(r?.junior?.distance).toBeUndefined();
  });

  it("データの無い所（タイルが無い）は null", async () => {
    expect(await schoolsAt(LAT, LNG, { tile: async () => null })).toBeNull();
  });

  it("文字", () => {
    expect(schoolDistanceText(316)).toBe("約320m");
    expect(schoolDistanceText(1141)).toBe("約1.1km");
    expect(schoolDistanceText(undefined)).toBeUndefined();
    expect(schoolLine({ kind: "小学校", name: "九段小学校", owner: "千代田区立", city: "13101", distance: 316 })).toBe("九段小学校（千代田区立・直線約320m）");
    expect(schoolLine({ kind: "中学校", name: "青木中学校", city: "11203" })).toBe("青木中学校");
    expect(schoolShort("戸塚第二小学校")).toBe("戸塚第二小");
    expect(schoolShort("九段中等教育学校")).toBe("九段中等教育学校");
    expect(schoolLine({ kind: "小学校", name: "九段小学校", owner: "千代田区立", city: "13101", distance: 316, walk: { meters: 452, minutes: 6 } })).toBe(
      "九段小学校（千代田区立・徒歩約6分・約450m）",
    );
  });

  it("学校までの道のり：道路でたどれた学校は徒歩の目安、遠回りすぎる・たどれない学校は直線のまま", async () => {
    const schools = {
      elementary: { kind: "小学校" as const, name: "九段小学校", city: "13101", point: [139.75, 35.69] as LngLat, distance: 300 },
      junior: { kind: "中学校" as const, name: "麹町中学校", city: "13101", point: [139.74, 35.68] as LngLat, distance: 500 },
    };
    // 小学校は 450m の道のり、中学校は直線の3倍を超える（川の向こうなど）
    const w = await withSchoolWalks(35.69, 139.745, schools, async (_lat, _lng, targets) => {
      expect(targets.map((t) => t.id)).toEqual([0, 1]);
      return new Map([
        [0, 450],
        [1, 1600],
      ]);
    });
    expect(w.elementary?.walk).toEqual({ meters: 450, minutes: 6 });
    expect(w.junior?.walk).toBeUndefined();
    expect(schoolCredit(w)).toContain("道のりは地理院地図Vector（国土地理院）の道路中心線から求めた目安");
    expect(schoolCredit(schools)).not.toContain("道のり");
    // 道路のタイルが読めなくても学区はそのまま
    const failed = await withSchoolWalks(35.69, 139.745, schools, async () => {
      throw new Error("road tile 503");
    });
    expect(failed).toEqual(schools);
    // 学校の位置が分からなければ、道のりは調べない
    const nopoint = { elementary: { kind: "小学校" as const, name: "青木小学校", city: "11203" } };
    expect(await withSchoolWalks(35.8, 139.7, nopoint, async () => Promise.reject(new Error("呼ばない")))).toBe(nopoint);
  });
});

// アプリに入っている学区のタイル（public/data/）を実際に読む
const PATH = `public${SRC.url}`;
const fileSource = (path: string): Source => ({
  getKey: () => path,
  getBytes: async (offset, length) => {
    const fh = await open(path, "r");
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) };
    } finally {
      await fh.close();
    }
  },
});

describe("アプリに入っている学区のタイル", () => {
  const src = schoolTileSource(fileSource(PATH));

  it("school-source.json のファイルがあり、商用で使えない市区町村は入れていない", async () => {
    expect(SRC.url).toMatch(/^\/data\/school-\d{4}\.pmtiles$/);
    expect(SRC.edition).toMatch(/^令和\d+年度（\d{4}年度）$/);
    expect((await stat(PATH)).size).toBeGreaterThan(2_000_000);
    expect(SRC.counts.es).toBeGreaterThan(3000);
    expect(SRC.counts.jh).toBeGreaterThan(1500);
    // 商用利用・再配布ができない（2023年度の利用条件）
    for (const c of ["11202 熊谷市", "11208 所沢市", "11214 春日部市", "11221 草加市"]) expect(SRC.excluded).toContain(c);
  });

  it("新宿区高田馬場：戸塚第二小学校・西早稲田中学校。学校の位置が分かる", async () => {
    const r = await schoolsAt(35.7128, 139.7046, src);
    expect(r?.elementary).toMatchObject({ name: "戸塚第二小学校", owner: "新宿区立" });
    expect(r?.elementary?.distance).toBeLessThan(300);
    expect(r?.junior?.name).toBe("西早稲田中学校");
  });

  it("川口市・横浜市でも見つかる。熊谷市（利用条件で入れていない）は null", async () => {
    expect((await schoolsAt(35.8115, 139.7225, src))?.elementary?.name).toBe("青木中央小学校");
    expect((await schoolsAt(35.4437, 139.638, src))?.junior?.name).toBe("横浜吉田中学校");
    expect(await schoolsAt(36.1473, 139.3886, src)).toBeNull();
  });

  it("日光市は、旧今市市・旧藤原町は教育委員会に確かめるよう添える", async () => {
    expect((await schoolsAt(36.7199, 139.6982, src))?.elementary?.note).toContain("日光市教育委員会");
  });

  it("桐生市は小学校区が国のデータに無い（市が公開していない）ので、中学校区だけ。「学区なし」ではなく、わけを返す", async () => {
    const r = await schoolsAt(36.413, 139.327, src);
    expect(r?.elementary).toBeUndefined();
    expect(r?.junior?.name).toBe("中央中学校");
    expect(schoolGaps("10203", r)).toEqual([{ key: "es", label: "小学校区", why: "absent" }]);
  });
});

describe("学区のデータが無い市区町村", () => {
  it("小学校区・中学校区それぞれ、利用条件で出せない市（terms）と国のデータに無い市（absent）を見分ける", () => {
    // 熊谷市は小・中とも利用条件（商用利用・再配布不可）で出せない。小田原市は使う前に市の確認が要る
    expect([schoolGap("11202", "es"), schoolGap("11202", "jh")]).toEqual(["terms", "terms"]);
    expect(schoolGap("14206", "jh")).toBe("terms");
    // 桐生市の小学校区（市が公開していない）・上三川町の中学校区（作っていない）は国のデータに無い
    expect([schoolGap("10203", "es"), schoolGap("10203", "jh")]).toEqual(["absent", null]);
    expect([schoolGap("09301", "es"), schoolGap("09301", "jh")]).toEqual([null, "absent"]);
    // 船橋市・品川区は国のデータに無い
    expect(schoolGap("12204", "es")).toBe("absent");
    expect(schoolGap("13109", "jh")).toBe("absent");
    // 政令市は区のコードでも市で見る（横浜市鶴見区・川崎市川崎区）
    expect(schoolGap("14101", "es")).toBeNull();
    expect(schoolGap("14131", "jh")).toBeNull();
    // 利用条件で出せない市区町村は、入れていない市区町村の一覧に入っている
    for (const c of [...SRC.excludedBy.es, ...SRC.excludedBy.jh]) expect(SRC.excluded).toContain(c);
  });

  it("地点で出せなかった学校区と、わけの文", () => {
    expect(schoolGaps("12204", null).map((g) => g.why)).toEqual(["absent", "absent"]);
    // データのある市で、地点を含む区域が無い
    expect(schoolGaps("13104", {})).toEqual([
      { key: "es", label: "小学校区", why: "outside" },
      { key: "jh", label: "中学校区", why: "outside" },
    ]);
    expect(schoolGapText(schoolGaps("11202", null), "熊谷市")).toBe(
      "熊谷市の小学校区・中学校区は、国のデータ（国土数値情報）の利用条件で、このアプリには出せません。指定校は熊谷市の教育委員会で確かめてください。",
    );
    expect(schoolGapText([{ key: "es", label: "小学校区", why: "absent" }], "桐生市")).toBe(
      "桐生市の小学校区は、国のデータ（国土数値情報）にありません。指定校は桐生市の教育委員会で確かめてください。",
    );
    expect(schoolGapText(schoolGaps("12204", null), "船橋市")).toBe("船橋市の小学校区・中学校区は、国のデータ（国土数値情報）にありません。指定校は船橋市の教育委員会で確かめてください。");
    expect([schoolGapShort("terms", "青ヶ島村"), schoolGapShort("absent", "品川区"), schoolGapShort("outside", "新宿区")]).toEqual([
      "利用条件で出せない村",
      "国のデータに無い区",
      "この地点の区域がデータに無い",
    ]);
    // 探すリンクは市区町村の名前だけ（住所は入れない）
    expect(schoolSearchUrl("桐生市")).toBe(`https://www.google.com/search?q=${encodeURIComponent("桐生市 通学区域 教育委員会")}`);
  });
});
