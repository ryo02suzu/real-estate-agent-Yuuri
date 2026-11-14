import { open, stat } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/school-source.json";
import { SCHOOL_ZOOM, schoolCredit, schoolDistanceText, schoolGaps, schoolGapShort, schoolGapText, schoolLabel, schoolLine, schoolNotes, schoolShort, schoolsAt, withSchoolWalks, type SchoolArea } from "./school";
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

  it("住所で決まる指定校ではない学校（学びの多様化学校・入学者選考のある学校）は、指定校として出さない", async () => {
    // 白石市：白石南小学校・白石南中学校は学びの多様化学校（不登校特例校）。国のデータでは市の全域が区域になっている
    const cover = [square(LAT, LNG, 0.05)];
    const south = area({ name: "白石南小学校", city: "04206", polygons: cover });
    const obara = area({ name: "小原小学校", city: "04206", polygons: cover });
    for (const order of [
      [south, obara],
      [obara, south],
    ]) {
      const r = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? order : []) });
      // ほかの学校の区域と重なっていれば、ほかの学校を出す（知らせも要らない）
      expect(r?.elementary?.name).toBe("小原小学校");
      expect(r?.elementary?.overlaps).toBeUndefined();
      expect(r?.unassigned).toBeUndefined();
      expect(schoolNotes(r!)).toEqual([]);
    }
    // その学校の区域しか無い地点（白石市の福岡深谷・福岡八宮のあたりの小学校区）は、指定校を出さずに知らせる
    const fukuoka = area({ kind: "中学校", name: "福岡中学校", city: "04206", polygons: cover });
    const southJh = area({ kind: "中学校", name: "白石南中学校", city: "04206", polygons: cover });
    const hole = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? [southJh, fukuoka, south] : []) });
    expect(hole?.elementary).toBeUndefined();
    expect(hole?.junior?.name).toBe("福岡中学校");
    expect(hole?.unassigned).toEqual([{ kind: "小学校", name: "白石南小学校", what: "学びの多様化学校（不登校の児童生徒のための学校）で、住所で決まる指定校ではありません" }]);
    expect(schoolNotes(hole!)).toEqual([
      "国のデータでは、この地点の小学校区は白石南小学校の区域だけです。白石南小学校は学びの多様化学校（不登校の児童生徒のための学校）で、住所で決まる指定校ではありません。指定校は教育委員会で確かめてください。",
    ]);
    expect(schoolGaps("04206", hole)).toEqual([{ key: "es", label: "小学校区", why: "outside" }]);
    // 道のりを足しても、知らせは残る
    expect((await withSchoolWalks(LAT, LNG, hole!, async () => new Map()))?.unassigned).toHaveLength(1);
    // 川口市：川口市立高等学校附属中学校は入学者選考のある中高一貫校
    const fuzoku = area({ kind: "中学校", name: "川口市立高等学校附属中学校", city: "11203", polygons: cover });
    const aoki = area({ kind: "中学校", name: "青木中学校", city: "11203", polygons: cover });
    const k = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? [fuzoku, aoki] : []) });
    expect(k?.junior?.name).toBe("青木中学校");
    expect(k?.junior?.overlaps).toBeUndefined();
    // 同じ名前でも、ほかの市の学校はふつうに出す
    const other = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? [area({ name: "白石南小学校", city: "99999" })] : []) });
    expect(other?.elementary?.name).toBe("白石南小学校");
  });

  it("データの無い所（タイルが無い）は null", async () => {
    expect(await schoolsAt(LAT, LNG, { tile: async () => null })).toBeNull();
  });

  it("学校区が重なっている所は、いちばん狭い区域の学校を出し、ほかの学校は知らせる（データの順に左右されない）", async () => {
    // 国のデータには、市内のどこからでも通える学校・入学者の選考のある学校の区域が、市の全域に重ねてある所がある
    // （川口市立高等学校附属中学校・白石市の白石南小中学校）。先に出た1つを出していたので、地点によって近所の学校と入れ替わっていた
    const wide = area({ kind: "中学校", name: "市立高等学校附属中学校", owner: "川口市立", city: "11203", polygons: [square(LAT, LNG, 0.01)] });
    const local = area({ kind: "中学校", name: "青木中学校", owner: "川口市", city: "11203", polygons: [square(LAT, LNG, 0.002)], point: [LNG + 0.001, LAT] });
    for (const order of [
      [wide, local],
      [local, wide],
    ]) {
      const r = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? order : []) });
      expect(r?.junior?.name).toBe("青木中学校");
      expect(r?.junior?.overlaps).toEqual(["市立高等学校附属中学校"]);
      expect(r?.elementary).toBeUndefined();
      expect(schoolNotes(r!)).toEqual([
        "国のデータでは、この地点はほかの学校の区域にも入っています（中学校は市立高等学校附属中学校）。選べる区域・分校・統合の前後の学校・市内のどこからでも通える学校のことがあり、どちらが指定校かは、このデータでは決められません。指定校は教育委員会で確かめてください。",
      ]);
    }
    // 広さが同じ区域どうし（どちらとも言えない）は、データの順のまま出し、もう一方を知らせる
    const a = area({ name: "東小学校", polygons: [square(LAT, LNG, 0.002)] });
    const b = area({ name: "西小学校", polygons: [square(LAT, LNG, 0.002)] });
    const same = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? [a, b] : []) });
    expect(same?.elementary?.name).toBe("東小学校");
    expect(same?.elementary?.overlaps).toEqual(["西小学校"]);
    // タイルに区域の広さ（ha）が入っていれば、それで比べる。タイルは区域を切って入れてあるので、どちらの区域もタイルを覆っている所
    // （山あいの広い学校区）は、タイルの中の形では同じ広さに見える
    const cover = [square(LAT, LNG, 0.05)];
    const main = area({ name: "本校小学校", city: "07204", polygons: cover, area: 28601 });
    const branch = area({ name: "分校小学校", city: "07204", polygons: cover, area: 8023 });
    for (const order of [
      [main, branch],
      [branch, main],
    ]) {
      const r = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? order : []) });
      expect(r?.elementary?.name).toBe("分校小学校");
      expect(r?.elementary?.overlaps).toEqual(["本校小学校"]);
    }
    // 広さの入っていない区域が混じっていれば（前の版のタイル）、タイルの中の形で比べる
    const mixed = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? [main, area({ name: "分校小学校", city: "07204", polygons: [square(LAT, LNG, 0.01)] })] : []) });
    expect(mixed?.elementary?.name).toBe("分校小学校");
    // 重なっていなければ overlaps は無く、注意も無い
    const one = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? [a] : []) });
    expect(one?.elementary?.overlaps).toBeUndefined();
    expect(schoolNotes(one!)).toEqual([]);
    // 穴のある区域（穴の中の広さは引く）
    const ring = area({ name: "まわり小学校", polygons: [[square(LAT, LNG + 0.004, 0.006)[0], square(LAT, LNG + 0.004, 0.0005)[0]]] });
    const small = area({ name: "まんなか小学校", polygons: [square(LAT, LNG, 0.001)] });
    expect((await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? [ring, small] : []) }))?.elementary?.name).toBe("まんなか小学校");
  });

  it("通学区域の指定が無い千代田区の中学校は、国のデータの学校名（九段中等教育学校）を出さず、選べる学校と決まりを出す", async () => {
    // 区の公式「区立中学校の通学区域と学校選択」：通学区域を設けず、麹町中学校・神田一橋中学校から選ぶ。九段中等教育学校は受検で合格した人だけ
    const r = await schoolsAt(LAT, LNG, {
      tile: async (x, y) =>
        x === TX && y === TY
          ? [area({ kind: "中学校", name: "九段中等教育学校", owner: "千代田区", city: "13101", point: [LNG, LAT + 0.001] }), area({ name: "富士見小学校", owner: "千代田区立", city: "13101" })]
          : [],
    });
    expect(r?.junior).toMatchObject({ name: "麹町中学校・神田一橋中学校から選択", owner: "千代田区", choice: true });
    expect(r?.junior?.point).toBeUndefined();
    expect(r?.junior?.distance).toBeUndefined();
    expect(schoolNotes(r!)).toEqual(["千代田区の区立中学校は通学区域が無く、麹町中学校・神田一橋中学校から選びます（学校選択制）。九段中等教育学校は、受検で合格した人が入る学校です。"]);
    expect(schoolShort(r!.junior!.name)).toBe("麹町中・神田一橋中から選択");
    expect(schoolLine(r!.junior!)).toBe("麹町中学校・神田一橋中学校から選択（千代田区）");
    expect(r?.elementary?.name).toBe("富士見小学校");
    // ほかの市区町村の同じ名前の学校は、そのまま
    const other = await schoolsAt(LAT, LNG, { tile: async (x, y) => (x === TX && y === TY ? [area({ kind: "中学校", name: "九段中等教育学校", city: "13104" })] : []) });
    expect(other?.junior?.name).toBe("九段中等教育学校");
  });

  it("文字", () => {
    expect(schoolDistanceText(316)).toBe("約320m");
    expect(schoolDistanceText(1141)).toBe("約1.1km");
    expect(schoolDistanceText(undefined)).toBeUndefined();
    expect(schoolLine({ kind: "小学校", name: "九段小学校", owner: "千代田区立", city: "13101", distance: 316 })).toBe("九段小学校（千代田区立・直線約320m）");
    expect(schoolLine({ kind: "中学校", name: "青木中学校", city: "11203" })).toBe("青木中学校");
    expect(schoolShort("戸塚第二小学校")).toBe("戸塚第二小");
    // 国のデータで学校区が重なっている所は、見出しは「〜ほか」、書類の1行にもほかの学校を書く
    expect(schoolLabel({ name: "山田小学校" })).toBe("山田小");
    expect(schoolLabel({ name: "山田小学校", overlaps: ["谷上小学校"] })).toBe("山田小ほか");
    expect(schoolLine({ kind: "小学校", name: "山田小学校", owner: "神戸市立", city: "28100", distance: 316, overlaps: ["谷上小学校"] })).toBe(
      "山田小学校（神戸市立・直線約320m）。国のデータでは谷上小学校の区域にも入っています",
    );
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

  it("実物のタイル：千代田区は中学校を選ぶ区、川口市・白石市は重なる区域でも近所の学校が出る", async () => {
    // 千代田区九段南・神田（国のデータは区の全域が九段中等教育学校の区域）
    for (const [lat, lng] of [
      [35.694, 139.7536],
      [35.6952, 139.7672],
    ]) {
      const r = await schoolsAt(lat, lng, src);
      expect(r?.junior?.name).toBe("麹町中学校・神田一橋中学校から選択");
      expect(r?.elementary?.name).toMatch(/小学校$/);
    }
    // 川口市役所・東川口（市の全域に「川口市立高等学校附属中学校」＝入学者選考のある中高一貫校の区域が重なる）
    const k1 = await schoolsAt(35.8077, 139.7241, src);
    expect(k1?.junior?.name).toBe("青木中学校");
    const k2 = await schoolsAt(35.8752, 139.744, src);
    expect(k2?.junior?.name).toBe("戸塚西中学校");
    for (const k of [k1, k2]) expect(k?.junior?.overlaps).toBeUndefined();
    // 白石市役所（市の全域に「白石南小学校」「白石南中学校」＝学びの多様化学校の区域が重なる）
    const s1 = await schoolsAt(38.0025, 140.6198, src);
    expect(s1?.elementary?.name).toBe("白石第一小学校");
    expect(s1?.junior?.name).toBe("白石中学校");
    expect(schoolNotes(s1!)).toEqual([]);
    // 白石市小原（郊外。小原小学校の区域も白石南小学校の区域も、タイルを覆っていて、タイルの中の形では広さを比べられない所）
    const s2 = await schoolsAt(37.9529, 140.4822, src);
    expect(s2?.elementary?.name).toBe("小原小学校");
    expect(s2?.junior?.name).toBe("小原中学校");
    // 白石市福岡深谷（国のデータの小学校区が、白石南小学校の区域しか無い所）。指定校は出さず、知らせる
    const s3 = await schoolsAt(38.055, 140.56375, src);
    expect(s3?.elementary).toBeUndefined();
    expect(s3?.junior?.name).toBe("福岡中学校");
    expect(schoolNotes(s3!)[0]).toContain("この地点の小学校区は白石南小学校の区域だけです");
    // 重なりの無い所は今までどおり
    const n = await schoolsAt(35.7128, 139.7046, src);
    expect(n?.elementary?.overlaps).toBeUndefined();
    expect(schoolNotes(n!)).toEqual([]);
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
