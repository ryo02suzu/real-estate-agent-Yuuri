import { open, stat } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/school-source.json";
import { SCHOOL_ZOOM, schoolCredit, schoolDistanceText, schoolLine, schoolShort, schoolsAt, withSchoolWalks, type SchoolArea } from "./school";
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
});
