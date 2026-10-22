// 国の地点データ（液状化・大規模盛土造成地・災害履歴・駅別乗降客数・将来推計人口・医療機関と幼稚園・鑑定評価書）の読み方のテスト。
// 置き場所（data/reinfolib-source.json）はテスト用に差し替え、ファイル・タイルの中身はテストの中で作る（通信しない）
import { describe, expect, it, vi } from "vitest";
import { appraisalFor, methodRows, type AppraisalFile } from "./appraisal";
import { facilityCounts, nearestFacilities, nearbyFacilities, notForPublic, type Facility } from "./facilities";
import { liquefactionAt, liquefactionText } from "./liquefaction";
import { meshBounds, meshCenter } from "./mesh";
import type { LngLat, Polygon } from "./parcel";
import { agingText, populationAt, populationText } from "./population";
import { asOfText, hasNational, tileOf, type TileSource } from "./reinfolib";
import { peopleText, ridershipOf, ridershipText, type RidershipFile } from "./ridership";
import { rirekiAt, rirekiLine, rirekiWhen, type RirekiFeature } from "./rireki";
import { zouseiAt, zouseiText, type ZouseiArea } from "./zousei";

vi.mock("./data/reinfolib-source.json", () => ({
  default: {
    liq: { url: "https://r2.test/reinfolib/20261022", asOf: "20261022", levels: { "2": "液状化しやすい", "5": "液状化しにくい" }, landforms: { "15": "三角州・海岸低地", "9": "ローム台地" } },
    pop: { url: "https://r2.test/reinfolib/20261022", asOf: "20261022", years: [2020, 2025, 2030, 2035, 2040, 2045, 2050] },
    appraisal: { url: "https://r2.test/reinfolib/20261022", asOf: "20261022", zoom: 13 },
    ridership: { url: "https://r2.test/reinfolib/20261022", asOf: "20261022" },
  },
}));

// 東京駅のあたり（250m メッシュ 5339461132）
const TOKYO: [number, number] = [35.681236, 139.767125];

/** 地点を中心にした四角形（m） */
function square([lng, lat]: LngLat, half: number): Polygon {
  const dLat = half / 110_950;
  const dLng = half / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [
    [
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
      [lng - dLng, lat - dLat],
    ],
  ];
}
/** 地点から東へ m ずらした点 */
const east = ([lng, lat]: LngLat, m: number): LngLat => [lng + m / (111_320 * Math.cos((lat * Math.PI) / 180)), lat];

/** どのタイルにも同じ地物を返すタイル */
const allTiles = <T>(items: T[]): TileSource<T> => ({ tile: async () => items });

describe("置き場所", () => {
  it("データごとにあるか・時点", () => {
    expect(hasNational("liq")).toBe(true);
    expect(hasNational("zousei")).toBe(false);
    expect(asOfText("liq")).toBe("2026年10月22日");
    expect(asOfText("fac")).toBe("");
  });
});

describe("液状化の発生傾向", () => {
  it("物件の 250m メッシュの区分と微地形。2次メッシュのファイルを読む", async () => {
    const asked: string[] = [];
    const loader = async (url: string) => {
      asked.push(url);
      return url.endsWith("/liq/533946.json") ? { m: { "1132": [2, 15] } } : null;
    };
    const l = await liquefactionAt(...TOKYO, loader);
    expect(asked).toEqual(["https://r2.test/reinfolib/20261022/liq/533946.json"]);
    expect(l).toMatchObject({ level: 2, label: "液状化しやすい", tone: "high", landform: "三角州・海岸低地", mesh: "5339461132" });
    expect(liquefactionText(l!)).toBe("液状化しやすい（三角州・海岸低地）");
  });

  it("データの無いメッシュ・ファイルは null", async () => {
    expect(await liquefactionAt(...TOKYO, async () => ({ m: {} }))).toBeNull();
    expect(await liquefactionAt(...TOKYO, async () => null)).toBeNull();
  });
});

describe("大規模盛土造成地", () => {
  const here: LngLat = [TOKYO[1], TOKYO[0]];
  const area = (o: Partial<ZouseiArea>): ZouseiArea => ({ kind: "谷埋め型", city: "14109", cityName: "横浜市港北区", number: "港北-12", polygons: [square(here, 40)], ...o });

  it("造成地の中", async () => {
    const z = await zouseiAt(...TOKYO, allTiles([area({})]));
    expect(z.inside).toBe(true);
    expect(z.areas).toHaveLength(1);
    expect(zouseiText(z)).toBe("谷埋め型の大規模盛土造成地の中（横浜市港北区 港北-12）");
  });

  it("50m 以内の造成地は「近く」、それより遠いものは入れない。タイルの境目で分かれたものは1つに", async () => {
    const near = area({ polygons: [square(east(here, 70), 40)] });
    const far = area({ number: "港北-99", polygons: [square(east(here, 300), 40)] });
    const z = await zouseiAt(...TOKYO, allTiles([near, { ...near }, far]));
    expect(z.inside).toBe(false);
    expect(z.areas).toHaveLength(1);
    expect(Math.round(z.areas[0].distance)).toBe(30);
    expect(zouseiText(z)).toBe("約30m先に谷埋め型の大規模盛土造成地（横浜市港北区 港北-12）");
  });

  it("盛土番号に市の名前が入っていれば重ねない", async () => {
    const z = await zouseiAt(...TOKYO, allTiles([area({ city: "14100", cityName: "横浜市", number: "横浜市0523" })]));
    expect(zouseiText(z)).toBe("谷埋め型の大規模盛土造成地の中（横浜市0523）");
  });

  it("造成地が無ければ「あたらない」", async () => {
    const z = await zouseiAt(...TOKYO, { tile: async () => null });
    expect(z).toEqual({ inside: false, areas: [] });
    expect(zouseiText(z)).toBe("大規模盛土造成地にはあたりません（国のデータ）");
  });
});

describe("災害履歴", () => {
  const here: LngLat = [TOKYO[1], TOKYO[0]];
  const flood: RirekiFeature = { type: "11", name: "浸水域等", date: "19580900", source: "昭和33年9月台風第22号の水害(東京都)", polygons: [square(here, 500)], lines: [] };
  const older: RirekiFeature = { ...flood, date: "19470900", source: "カスリーン台風浸水区域" };
  const levee: RirekiFeature = { type: "12", name: "堤防決壊箇所等", date: "19470916", polygons: [], lines: [[east(here, 120)]] };
  const farLevee: RirekiFeature = { ...levee, date: "19100800", lines: [[east(here, 900)]] };

  it("範囲の中の記録を先に、新しい順。近くの点の記録は距離つき。同じ災害は1つに", async () => {
    const rs = await rirekiAt(...TOKYO, allTiles([older, flood, { ...flood }, levee, farLevee]));
    expect(rs.map((r) => [r.label, r.when, r.inside])).toEqual([
      ["浸水域", "1958年9月", true],
      ["浸水域", "1947年9月", true],
      ["堤防決壊箇所", "1947年9月16日", false],
    ]);
    expect(Math.round(rs[2].distance)).toBe(120);
    expect(rirekiLine(rs[0])).toBe("1958年9月 浸水域：昭和33年9月台風第22号の水害(東京都)");
    expect(rirekiLine(rs[2])).toBe("1947年9月16日 堤防決壊箇所（約120m先）");
  });

  it("時期の書き方", () => {
    expect(rirekiWhen("19820700")).toBe("1982年7月");
    expect(rirekiWhen("19810000")).toBe("1981年");
    expect(rirekiWhen("00000000")).toBe("時期不明");
    expect(rirekiWhen(undefined)).toBe("時期不明");
  });
});

describe("駅別乗降客数", () => {
  const data: RidershipFile = {
    years: [2011, 2023],
    stations: [
      {
        n: "渋谷",
        at: [139.7016, 35.6581],
        o: [
          { op: "東急", l: ["東横線"], c: { "2019": 1_120_000, "2023": 1_036_352 }, r: "田園都市線、東京地下鉄・11号線半蔵門線、東京地下鉄・13号線副都心線を含む" },
          { op: "JR東日本", l: ["山手線"], c: { "2023": 628_118 } },
          { op: "京王", l: ["井の頭線"], c: { "2023": 285_759 } },
          { op: "東京メトロ", l: ["銀座線"], c: { "2023": 179_645 } },
        ],
      },
      // 同じ名前でも遠い駅（別の駅）
      { n: "渋谷", at: [140.5, 36.5], o: [{ op: "どこか", l: ["線"], c: { "2023": 100 } }] },
      { n: "押上（スカイツリー前）", at: [139.8125, 35.7101], o: [{ op: "京成", l: ["押上線"], c: { "2023": 80_000 } }] },
    ],
  };

  it("同じ名前で近い駅の事業者をまとめ、合計を出す", () => {
    const r = ridershipOf(data, "渋谷", [139.7017, 35.6585])!;
    expect(r.total).toBe(2_129_874);
    expect(r.year).toBe(2023);
    expect(r.operators.map((o) => o.operator)).toEqual(["東急", "JR東日本", "京王", "東京メトロ"]);
    expect(r.operators[0].series).toEqual([
      { year: 2019, count: 1_120_000 },
      { year: 2023, count: 1_036_352 },
    ]);
    expect(ridershipText(r)).toBe("1日の乗降客数 約213万人（2023年度・4事業者の合計）");
  });

  it("かっこ書きの駅名もそろえる。見つからなければ null", () => {
    expect(ridershipOf(data, "押上", [139.8127, 35.7105])?.total).toBe(80_000);
    expect(ridershipOf(data, "新宿", [139.7, 35.69])).toBeNull();
  });

  it("人数の書き方", () => {
    expect(peopleText(2_129_874)).toBe("約213万人");
    expect(peopleText(40_962)).toBe("約4.1万人");
    expect(peopleText(8_500)).toBe("8,500人");
  });
});

describe("将来推計人口", () => {
  it("物件のメッシュのまわりの人口の移り変わりと、子ども・高齢者の割合", async () => {
    const loader = async (url: string) => (url.endsWith("/pop/533946.json") ? { m: { "1132": [8198, 8120, 8237, 8391, 8498, 8509, 8430, 88, 229, 89, 269] } } : null);
    const p = (await populationAt(...TOKYO, loader))!;
    expect(p.series[0]).toEqual({ year: 2020, people: 8198 });
    expect(p.series[6]).toEqual({ year: 2050, people: 8430 });
    expect(p.change2050).toBe(2.8);
    expect(p.children).toEqual({ now: 8.8, future: 8.9 });
    expect(p.elderly).toEqual({ now: 22.9, future: 26.9 });
    expect(populationText(p)).toBe("まわり約1.25km四方の人口 2020年 8,198人 → 2050年 8,430人（+2.8%）");
    expect(agingText(p)).toBe("65歳以上の割合 22.9% → 26.9%（2025年→2050年）");
  });

  it("人の住んでいない所は null", async () => {
    expect(await populationAt(...TOKYO, async () => ({ m: {} }))).toBeNull();
  });
});

describe("医療機関と幼稚園", () => {
  const here: LngLat = [TOKYO[1], TOKYO[0]];
  const f = (o: Partial<Facility> & { at: LngLat }): Facility => ({ kind: 2, name: "クリニック", ...o });
  const list: Facility[] = [
    f({ name: "内科クリニック", departments: ["内科"], at: east(here, 100) }),
    f({ name: "こどもクリニック", departments: ["小児科", "内科"], at: east(here, 300) }),
    f({ kind: 1, name: "総合病院", departments: ["内科", "小児科"], beds: 300, emergency: true, at: east(here, 780) }),
    f({ kind: 3, name: "歯科", at: east(here, 200) }),
    f({ kind: 4, name: "幼稚園", owner: "私立", at: east(here, 500) }),
    f({ kind: 1, name: "遠い病院", at: east(here, 3000) }),
  ];

  it("一般の人がかかれない医療機関は入れず、休日・夜間だけの診療所は最寄りに選ばない", async () => {
    expect(notForPublic("日本電気株式会社 本社健康管理センター 新木場健康管理室")).toBe(true);
    expect(notForPublic("渋谷区保健所中央保健相談所")).toBe(true);
    expect(notForPublic("医療法人社団 直和会 平成立石病院")).toBe(false);
    const withHoliday = [f({ name: "立石休日応急診療所", departments: ["内科", "小児科"], at: east(here, 50) }), ...list];
    const near = await nearbyFacilities(...TOKYO, allTiles(withHoliday));
    const got = await nearestFacilities(...TOKYO, near, undefined, async (_a, _b, t) => new Map(t.map((x) => [x.id, 1000])));
    expect(got.find((g) => g.query === "internal")?.name).not.toBe("立石休日応急診療所");
  });

  it("まわり（1.2km）の施設を近い順に", async () => {
    const near = await nearbyFacilities(...TOKYO, allTiles(list));
    expect(near.map((x) => x.name)).toEqual(["内科クリニック", "歯科", "こどもクリニック", "幼稚園", "総合病院"]);
    expect(facilityCounts(near)).toEqual({ 1: 1, 2: 2, 3: 1, 4: 1 });
  });

  it("探し方ごとの最寄り（小児科のある所・救急病院も）と徒歩の目安", async () => {
    const near = await nearbyFacilities(...TOKYO, allTiles(list));
    // 道のりは直線の 1.1 倍とする
    const walk = async (_lat: number, _lng: number, targets: { id: number; points: LngLat[] }[]) =>
      new Map(targets.map((t) => [t.id, near.find((x) => x.at === t.points[0])!.straight * 1.1]));
    const got = await nearestFacilities(...TOKYO, near, undefined, walk);
    const by = Object.fromEntries(got.map((g) => [g.query, `${g.name} ${g.minutes}分`]));
    expect(by).toEqual({
      hospital: "総合病院 11分",
      clinic: "内科クリニック 2分",
      pediatrics: "こどもクリニック 5分",
      internal: "内科クリニック 2分",
      dental: "歯科 3分",
      emergency: "総合病院 11分",
      kindergarten: "幼稚園 7分",
    });
  });
});

describe("地価公示の鑑定評価書", () => {
  const at: LngLat = [139.75981, 35.69081];
  const file: AppraisalFile = {
    points: [
      {
        no: "千代田5-1",
        at,
        y: 2026,
        p: 14_900_000,
        city: "13101",
        reports: [
          { compare: 15_900_000, income: 14_100_000, cases: [{ trade: 31_530_804, val: 16_200_000 }], incomeDetail: { rate: 2.5 } },
          { compare: 15_500_000, income: 14_300_000 },
        ],
      },
      { no: "千代田-1", at: [139.751, 35.689], y: 2026, p: 3_000_000, city: "13101", reports: [] },
    ],
  };

  it("標準地番号と位置で、その地点の z13 タイルのファイルから選ぶ", async () => {
    const [x, y] = tileOf(at[1], at[0], 13);
    const loader = async (url: string) => (url === `https://r2.test/reinfolib/20261022/appraisal/${x}/${y}.json` ? file : null);
    const a = (await appraisalFor("千代田5-1", at, loader))!;
    expect(a.p).toBe(14_900_000);
    expect(methodRows(a)).toEqual([
      { label: "比準価格（取引事例比較法）", values: [15_900_000, 15_500_000] },
      { label: "収益価格（収益還元法）", values: [14_100_000, 14_300_000] },
    ]);
    expect(await appraisalFor("千代田5-99", at, loader)).toBeNull();
  });
});

describe("メッシュの中心で読める", () => {
  it("中心はメッシュの中", () => {
    const [[w, s], [e, n]] = meshBounds("5339461132");
    const [lng, lat] = meshCenter("5339461132");
    expect(lng > w && lng < e && lat > s && lat < n).toBe(true);
  });
});
