import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import KOZU_SOURCE from "./data/kozu-source.json";
import { lookup } from "./index";
import { mergeParcelSources, withoutCities } from "./parcel-tiles";
import { sankoCovers } from "./sanko-data";
import {
  chibanLabel,
  cityMatches,
  estimatedMark,
  parcelMark,
  estimatedNote,
  kuikiLabel,
  kuikiLabelFrom,
  adjacentParcels,
  neighborList,
  pickedChibanText,
  isLotChiban,
  registryChiban,
  chibanQueryOf,
  parcelAt,
  kuikiParts,
  normalizeChiban,
  searchParcel,
  splitChiban,
  tileBounds,
  tileOf,
  townFromAddress,
  townKey,
  type ParcelFeature,
  type ParcelSource,
  type Polygon,
} from "./parcel";

describe("地番の入力", () => {
  it("末尾の地番を取り出す（番地・番・の・ハイフン・全角）", () => {
    expect(splitChiban("埼玉県熊谷市下奈良391番地3")).toEqual({ body: "埼玉県熊谷市下奈良", chiban: "391-3", explicit: false });
    expect(splitChiban("熊谷市大字三ケ尻9999番")).toMatchObject({ body: "熊谷市大字三ケ尻", chiban: "9999" });
    expect(splitChiban("熊谷市下奈良１２３４番地の５")?.chiban).toBe("1234-5");
    expect(splitChiban("熊谷市下奈良391の3")?.chiban).toBe("391-3");
    expect(splitChiban("熊谷市下奈良391ー3")?.chiban).toBe("391-3");
    expect(splitChiban("川口市青木2丁目217-8")).toMatchObject({ body: "川口市青木2丁目", chiban: "217-8" });
  });

  it("地番の頭の甲乙丙・イロハ・番外は地番の一部（取手市白山３丁目乙987番1 など）", () => {
    expect(splitChiban("取手市白山3丁目乙987番1")).toMatchObject({ body: "取手市白山3丁目", chiban: "乙987-1" });
    expect(splitChiban("下妻市下妻字栗山乙283番6")).toMatchObject({ body: "下妻市下妻字栗山", chiban: "乙283-6" });
    expect(splitChiban("土浦市中村南4丁目番外26番203")).toMatchObject({ body: "土浦市中村南4丁目", chiban: "番外26-203" });
    // 半角カナは全角にそろえる（筆の地番も比べるときに同じにそろえる）
    expect(splitChiban("常総市大生郷町ｲ533")).toMatchObject({ body: "常総市大生郷町", chiban: "イ533" });
    expect(splitChiban("熊谷市下奈良391番地3")).toMatchObject({ body: "熊谷市下奈良", chiban: "391-3" });
  });

  it("地番のある筆か（甲乙丙・イロハ・番外つきも地番。道・水・無地番・長狭物・筆界未定地・白地・市道は違う）", () => {
    for (const c of ["391-3", "甲35-1", "乙1906", "丙993", "丁1146-2", "戊1342", "番外24-753", "ｲ533", "ﾛ9-10", "乙乙1412", "甲乙166-1", "51-3W1", "100V1"]) expect(isLotChiban(c), c).toBe(true);
    for (const c of ["道-1", "水-154", "無地番-2", "長狭物不明-18", "筆界未定地-152", "白地-06095", "市道-15-444", "河川-1", "県道-1", "道34", "官有地-1", "除外地-2023020914", ""]) expect(isLotChiban(c), c).toBe(false);
  });

  it("「地番」と書いてあれば explicit", () => {
    expect(splitChiban("地番 川口市青木2丁目217-8")).toEqual({ body: "川口市青木2丁目", chiban: "217-8", explicit: true });
    expect(splitChiban("川口市青木2丁目217番8（地番）")).toEqual({ body: "川口市青木2丁目", chiban: "217-8", explicit: true });
  });

  it("住居表示（1-2-3、○番○号）や建物名つきは地番とみなさない", () => {
    expect(splitChiban("渋谷区神南1-1-1")).toBeNull();
    expect(splitChiban("川口市青木2丁目1番1号")).toBeNull();
    expect(splitChiban("熊谷市宮町2-47-1 ○○ビル")).toBeNull();
    expect(splitChiban("1234")).toBeNull();
  });

  it("地番の書き方をそろえる", () => {
    expect(normalizeChiban("391番3")).toBe("391-3");
    expect(normalizeChiban("３９１－３")).toBe("391-3");
    expect(normalizeChiban("391番地")).toBe("391");
    expect(normalizeChiban("道-199")).toBe("道-199");
  });
});

describe("地番区域と町の名前", () => {
  it("大字・ケ・丁目の書き方をそろえる", () => {
    expect(townKey("大字南中丸")).toBe("南中丸");
    expect(townKey("青木二丁目")).toBe(townKey("青木２丁目"));
    expect(townKey("三ヶ尻")).toBe(townKey("三ケ尻"));
    expect(townKey("本町十二丁目")).toBe("本町12丁目");
    expect(kuikiParts("川口市_青木_２丁目__")).toEqual({ city: "川口市", town: "青木2丁目", koaza: "" });
    expect(kuikiParts("さいたま市見沼区_大字南中丸___").town).toBe("南中丸");
  });

  it("市区町村は郡・区の書き方の違いを吸収する", () => {
    expect(cityMatches("西多摩郡瑞穂町", "瑞穂町")).toBe(true);
    expect(cityMatches("さいたま市見沼区", "さいたま市 見沼区")).toBe(true);
    // 法務省のデータに残っている合併前の名前は、今の市として比べる
    expect(cityMatches("北埼玉郡騎西町", "加須市")).toBe(true);
    expect(cityMatches("勢多郡富士見村", "前橋市")).toBe(true);
    expect(cityMatches("北埼玉郡騎西町", "久喜市")).toBe(false);
    expect(cityMatches("熊谷市", "深谷市")).toBe(false);
  });

  it("国土地理院の住所から町の部分を取り出す", () => {
    expect(townFromAddress("埼玉県さいたま市見沼区大字南中丸", "さいたま市見沼区")).toBe("大字南中丸");
    expect(townFromAddress("東京都西多摩郡瑞穂町大字箱根ケ崎", "瑞穂町")).toBe("大字箱根ケ崎");
    expect(townFromAddress("埼玉県川口市青木二丁目１番１号", "川口市")).toBe("青木二丁目");
  });
});

// ---- タイルの作り物 ----------------------------------------------------------------
const START = { lat: 36.18, lng: 139.38 };
const [SX, SY] = tileOf(START.lat, START.lng);

/** タイル (x, y) の中の、左下 (fx, fy) から幅 fw・高さ fh（タイルに対する割合）の四角い筆 */
function box(x: number, y: number, fx: number, fy: number, fw: number, fh: number): Polygon {
  const [w, s, e, n] = tileBounds(x, y);
  const lng = (f: number) => w + (e - w) * f;
  const lat = (f: number) => s + (n - s) * f;
  return [
    [
      [lng(fx), lat(fy)],
      [lng(fx + fw), lat(fy)],
      [lng(fx + fw), lat(fy + fh)],
      [lng(fx), lat(fy + fh)],
      [lng(fx), lat(fy)],
    ],
  ];
}

function fakeSource(tiles: Record<string, { kuiki: string; chiban: string; polygon?: Polygon }[]>): ParcelSource & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async tile(x, y) {
      reads.push(`${x},${y}`);
      const fs = tiles[`${x},${y}`];
      if (!fs) return null;
      return fs.map((f): ParcelFeature => ({ kuiki: f.kuiki, chiban: f.chiban, polygons: () => [f.polygon ?? box(x, y, 0.4, 0.4, 0.1, 0.1)] }));
    },
  };
}

describe("筆の探索", () => {
  const K = "熊谷市_下奈良___";

  it("同じ地番区域・地番でも、離れた区画は1つの筆にまとめず別の候補にする（地番参考図の同じ地番の別の土地）", async () => {
    // 間に1タイルおいて離れた所に同じ「下奈良 391-3」。代表点に近い方を筆にし、遠い方は「ほかにもある」に数える
    const src = fakeSource({
      [`${SX},${SY}`]: [{ kuiki: K, chiban: "391-3", polygon: box(SX, SY, 0.2, 0.3, 0.3, 0.2) }],
      [`${SX + 2},${SY}`]: [{ kuiki: K, chiban: "391-3", polygon: box(SX + 2, SY, 0.2, 0.3, 0.3, 0.2) }],
    });
    const r = await searchParcel({ city: "熊谷市", town: "下奈良", chiban: "391-3" }, START, src, { batch: 20 });
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.parcel.kuiki).toBe(K);
    expect(r.parcel.pieces.map((p) => p.tile)).toEqual([[SX, SY]]);
    expect(r.others).toBe(1);
  });

  it("隣り合うタイルにまたがる1つの筆は、1つのまま（つながる区画はまとめる）", async () => {
    const src = fakeSource({
      [`${SX},${SY}`]: [{ kuiki: K, chiban: "391-3", polygon: box(SX, SY, 0.7, 0.3, 0.3, 0.2) }],
      [`${SX + 1},${SY}`]: [{ kuiki: K, chiban: "391-3", polygon: box(SX + 1, SY, 0, 0.3, 0.3, 0.2) }],
    });
    const r = await searchParcel({ city: "熊谷市", town: "下奈良", chiban: "391-3" }, START, src, { batch: 20 });
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.parcel.pieces).toHaveLength(2);
    expect(r.others).toBe(0);
  });

  it("近い地番の方へ広げて見つけ、筆の中の点を返す", async () => {
    const src = fakeSource({
      [`${SX},${SY}`]: [{ kuiki: K, chiban: "100" }],
      [`${SX + 1},${SY}`]: [{ kuiki: K, chiban: "380" }],
      [`${SX + 2},${SY}`]: [{ kuiki: K, chiban: "391-3", polygon: box(SX + 2, SY, 0.2, 0.3, 0.3, 0.2) }, { kuiki: "熊谷市_中奈良___", chiban: "391-3" }],
    });
    const r = await searchParcel({ city: "熊谷市", town: "下奈良", chiban: "391番3" }, START, src);
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.parcel.kuiki).toBe(K);
    expect(r.parcel.chiban).toBe("391-3");
    const [w, s, e, n] = tileBounds(SX + 2, SY);
    expect(r.parcel.point.lng).toBeGreaterThan(w + (e - w) * 0.2);
    expect(r.parcel.point.lng).toBeLessThan(w + (e - w) * 0.5);
    expect(r.parcel.point.lat).toBeGreaterThan(s + (n - s) * 0.3);
    expect(r.parcel.point.lat).toBeLessThan(s + (n - s) * 0.5);
  });

  it("筆がタイルの端にかかっていれば、隣のタイルの続きも集める", async () => {
    const src = fakeSource({
      [`${SX},${SY}`]: [{ kuiki: K, chiban: "5", polygon: box(SX, SY, 0.8, 0.4, 0.3, 0.1) }],
      [`${SX + 1},${SY}`]: [{ kuiki: K, chiban: "5", polygon: box(SX + 1, SY, -0.1, 0.4, 0.2, 0.1) }],
    });
    const r = await searchParcel({ city: "熊谷市", town: "大字下奈良", chiban: "5" }, START, src, { batch: 1 });
    expect(r.status === "found" && r.parcel.pieces.map((p) => p.tile)).toEqual([
      [SX, SY],
      [SX + 1, SY],
    ]);
  });

  it("町の筆はあるが地番が無ければ not_found（枝番違いを候補に）", async () => {
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: K, chiban: "391-2" }, { kuiki: K, chiban: "391-10" }, { kuiki: K, chiban: "391-1" }, { kuiki: K, chiban: "392" }] });
    const r = await searchParcel({ city: "熊谷市", town: "下奈良", chiban: "391" }, START, src, { maxTiles: 12 });
    expect(r).toEqual({ status: "not_found", similar: ["391-1", "391-2", "391-10"] });
  });

  it("代表点から3タイル（約1.5km）以内に町の筆が無ければ、地図データの無い地域（それ以上読まない）", async () => {
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "熊谷市_別の町___", chiban: "1" }] });
    expect(await searchParcel({ city: "熊谷市", town: "下奈良", chiban: "1" }, START, src)).toEqual({ status: "no_map" });
    expect(src.reads.length).toBeLessThanOrEqual(32);
  });

  it("代表点のまわりに地図が無くても、3枚離れた所の町の筆まで探しに行く", async () => {
    const src = fakeSource({ [`${SX + 3},${SY}`]: [{ kuiki: "熊谷市_三ケ尻___", chiban: "1877-1" }] });
    const r = await searchParcel({ city: "熊谷市", town: "三ヶ尻", chiban: "1877-1" }, START, src);
    expect(r.status === "found" && r.parcel.pieces[0].tile).toEqual([SX + 3, SY]);
  });
});

describe("地点の筆", () => {
  it("地点を含む筆と、その地番を返す（穴の中は含まない）", async () => {
    const [w, s, e, n] = tileBounds(SX, SY);
    const at = (fx: number, fy: number) => ({ lat: s + (n - s) * fy, lng: w + (e - w) * fx });
    const ring = (fx: number, fy: number, f: number) => box(SX, SY, fx, fy, f, f)[0];
    const src = fakeSource({
      [`${SX},${SY}`]: [
        { kuiki: "熊谷市_下奈良___", chiban: "10", polygon: [ring(0.1, 0.1, 0.5), ring(0.3, 0.3, 0.1)] },
        { kuiki: "熊谷市_下奈良___", chiban: "道-5", polygon: box(SX, SY, 0.7, 0.1, 0.1, 0.5) },
      ],
    });
    expect((await parcelAt(at(0.2, 0.2).lat, at(0.2, 0.2).lng, src))?.chiban).toBe("10");
    expect(await parcelAt(at(0.35, 0.35).lat, at(0.35, 0.35).lng, src)).toBeNull();
    expect((await parcelAt(at(0.75, 0.3).lat, at(0.75, 0.3).lng, src))?.chibanRaw).toBe("道-5");
  });

  it("地番の無い形（無地番・長狭物・道）がふつうの筆にかぶさっていれば、地番のある筆を出す", async () => {
    const [w, s, e, n] = tileBounds(SX, SY);
    const at = (fx: number, fy: number) => ({ lat: s + (n - s) * fy, lng: w + (e - w) * fx });
    const src = fakeSource({
      [`${SX},${SY}`]: [
        { kuiki: "福生市_武蔵野台_１丁目__", chiban: "無地番-2", polygon: box(SX, SY, 0.1, 0.1, 0.5, 0.5) },
        { kuiki: "福生市_武蔵野台_１丁目__", chiban: "33-8", polygon: box(SX, SY, 0.2, 0.2, 0.1, 0.1) },
        { kuiki: "羽村市_神明台_１丁目__", chiban: "長狭物不明-20", polygon: box(SX, SY, 0.7, 0.1, 0.2, 0.6) },
        { kuiki: "羽村市_神明台_１丁目__", chiban: "道-3", polygon: box(SX, SY, 0.7, 0.4, 0.25, 0.1) },
        { kuiki: "羽村市_神明台_１丁目__", chiban: "44", polygon: box(SX, SY, 0.75, 0.5, 0.2, 0.3) },
      ],
    });
    const chibanAt = async (fx: number, fy: number) => (await parcelAt(at(fx, fy).lat, at(fx, fy).lng, src))?.chibanRaw;
    expect(await chibanAt(0.25, 0.25)).toBe("33-8");
    expect(await chibanAt(0.8, 0.6)).toBe("44");
    // 甲乙つきの地番も地番のある筆（取手市白山３丁目乙987番1 のような所）
    const src2 = fakeSource({
      [`${SX},${SY}`]: [
        { kuiki: "取手市_白山_３丁目__", chiban: "無地番-1", polygon: box(SX, SY, 0.1, 0.1, 0.5, 0.5) },
        { kuiki: "取手市_白山_３丁目__", chiban: "乙987-1", polygon: box(SX, SY, 0.2, 0.2, 0.1, 0.1) },
      ],
    });
    expect((await parcelAt(at(0.25, 0.25).lat, at(0.25, 0.25).lng, src2))?.chibanRaw).toBe("乙987-1");
    // 地番のある筆の無い所は、地番の無い形のまま（並びが先の形）
    expect(await chibanAt(0.5, 0.5)).toBe("無地番-2");
    expect(await chibanAt(0.8, 0.2)).toBe("長狭物不明-20");
    expect(await chibanAt(0.8, 0.45)).toBe("長狭物不明-20");
  });

  it("同じデータの中で地番のある筆が重なっていれば、ほかの筆を候補（要確認）にする（二重地番の区画・地番の無い形は候補にしない）", async () => {
    const [w, s, e, n] = tileBounds(SX, SY);
    const at = (fx: number, fy: number) => ({ lat: s + (n - s) * fy, lng: w + (e - w) * fx });
    const src = fakeSource({
      [`${SX},${SY}`]: [
        // 古い地図の大きな筆の上に、新しい地図の筆が乗っている（小美玉市高崎のような所）
        { kuiki: "小美玉市_高崎___", chiban: "1234", polygon: box(SX, SY, 0.1, 0.1, 0.5, 0.5) },
        { kuiki: "小美玉市_高崎___", chiban: "2001-1", polygon: box(SX, SY, 0.2, 0.2, 0.2, 0.2) },
        { kuiki: "小美玉市_高崎___", chiban: "道-3", polygon: box(SX, SY, 0.1, 0.1, 0.5, 0.5) },
        { kuiki: "小美玉市_高崎___", chiban: "51W1", polygon: box(SX, SY, 0.7, 0.1, 0.2, 0.2) },
        { kuiki: "小美玉市_高崎___", chiban: "51W2", polygon: box(SX, SY, 0.7, 0.1, 0.2, 0.2) },
      ],
    });
    const a = await parcelAt(at(0.3, 0.3).lat, at(0.3, 0.3).lng, src);
    expect(a?.chibanRaw).toBe("1234");
    expect(a?.overlaps).toEqual([{ kuiki: "小美玉市_高崎___", chiban: "2001-1" }]);
    // 重なっていない所（1234 だけ）は候補なし
    expect((await parcelAt(at(0.5, 0.5).lat, at(0.5, 0.5).lng, src))?.overlaps).toBeUndefined();
    // 二重地番（同じ筆の区画）は候補にしない
    const c = await parcelAt(at(0.75, 0.15).lat, at(0.75, 0.15).lng, src);
    expect(c && registryChiban(c.chibanRaw)).toBe("51");
    expect(c?.overlaps).toBeUndefined();
  });

  it("公図から推定した位置の筆のタイルを合わせて読み、推定の印（確かさ）を付ける", async () => {
    const [w, s, e, n] = tileBounds(SX, SY);
    const at = (fx: number, fy: number) => ({ lat: s + (n - s) * fy, lng: w + (e - w) * fx });
    const pub = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "川口市_青木_２丁目__", chiban: "217-8", polygon: box(SX, SY, 0.1, 0.1, 0.3, 0.3) }] });
    const kozu: ParcelSource = {
      tile: async (x, y) =>
        x === SX && y === SY
          ? [
              { kuiki: "横浜市港北区_日吉_５丁目__", chiban: "1234", polygons: () => [box(SX, SY, 0.6, 0.6, 0.3, 0.3)], estimated: "high" },
              { kuiki: "横浜市港北区_日吉_５丁目__", chiban: "1240", polygons: () => [box(SX, SY, 0.6, 0.1, 0.3, 0.3)], estimated: "low" },
            ]
          : null,
    };
    const src = mergeParcelSources(pub, kozu);
    const a = await parcelAt(at(0.2, 0.2).lat, at(0.2, 0.2).lng, src);
    expect(a?.chibanRaw).toBe("217-8");
    expect(a?.estimated).toBeUndefined();
    expect(estimatedMark(a!)).toBe("");
    const b = await parcelAt(at(0.7, 0.7).lat, at(0.7, 0.7).lng, src);
    expect(b).toMatchObject({ chibanRaw: "1234", estimated: "high" });
    expect(estimatedMark(b!)).toBe("（推定）");
    const c = await parcelAt(at(0.7, 0.2).lat, at(0.7, 0.2).lng, src);
    expect(c).toMatchObject({ chibanRaw: "1240", estimated: "low" });
    expect(estimatedMark(c!)).toBe("（推定・確度低）");
    expect(estimatedNote("low")).toContain("5m");
    const r = await searchParcel({ city: "横浜市港北区", town: "日吉5丁目", chiban: "1234" }, START, src);
    expect(r.status === "found" && r.parcel.estimated).toBe("high");
    const r2 = await searchParcel({ city: "横浜市港北区", town: "日吉5丁目", chiban: "1240" }, START, src);
    expect(r2.status === "found" && r2.parcel.estimated).toBe("low");
    // どちらにもタイルが無ければ、地図データの無い地域
    expect(await mergeParcelSources({ tile: async () => null }, { tile: async () => null }).tile(0, 0)).toBeNull();
    // 推定の筆のタイルが読めなくても、登記所備付地図の筆は出す
    expect(await mergeParcelSources(pub, { tile: async () => Promise.reject(new Error("x")) }).tile(SX, SY)).toHaveLength(1);
  });

  it("市町村の地番参考図の筆を合わせ、法務省の地図データ → 参考図 → 推定の位置の順に使う", async () => {
    const [w, s, e, n] = tileBounds(SX, SY);
    const at = (fx: number, fy: number) => ({ lat: s + (n - s) * fy, lng: w + (e - w) * fx });
    const pub = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "市川市_国府台_１丁目__", chiban: "1-1", polygon: box(SX, SY, 0.1, 0.1, 0.3, 0.3) }] });
    const sanko: ParcelSource = {
      tile: async (x, y) =>
        x === SX && y === SY
          ? [
              // 法務省の地図データにもある筆（参考図の方は使わない）
              { kuiki: "市川市_国府台_１丁目__", chiban: "1-1", polygons: () => [box(SX, SY, 0.15, 0.15, 0.3, 0.3)], sanko: "12203" },
              { kuiki: "市川市_国府台_１丁目__", chiban: "2-1", polygons: () => [box(SX, SY, 0.6, 0.6, 0.3, 0.3)], sanko: "12203" },
            ]
          : null,
    };
    const kozu: ParcelSource = {
      tile: async (x, y) =>
        x === SX && y === SY
          ? [
              // 参考図のある市町村の推定の筆は使わない
              { kuiki: "市川市_国府台_１丁目__", chiban: "2-1", polygons: () => [box(SX, SY, 0.6, 0.1, 0.3, 0.3)], estimated: "high" },
              { kuiki: "松戸市_根本___", chiban: "5", polygons: () => [box(SX, SY, 0.1, 0.6, 0.3, 0.3)], estimated: "high" },
            ]
          : null,
    };
    const src = mergeParcelSources(pub, sanko, withoutCities(kozu, (c) => c === "市川市"));
    const tile = await src.tile(SX, SY);
    expect(tile?.map((f) => `${f.chiban}${parcelMark(f)}`)).toEqual(["1-1", "2-1（地番参考図）", "5（推定）"]);
    expect((await parcelAt(at(0.2, 0.2).lat, at(0.2, 0.2).lng, src))?.sanko).toBeUndefined();
    const b = await parcelAt(at(0.7, 0.7).lat, at(0.7, 0.7).lng, src);
    expect(b).toMatchObject({ chibanRaw: "2-1", sanko: "12203" });
    expect(b?.estimated).toBeUndefined();
    // 推定の位置（0.7, 0.2）には筆を出さない
    expect(await parcelAt(at(0.7, 0.2).lat, at(0.7, 0.2).lng, src)).toBeNull();
    const r = await searchParcel({ city: "市川市", town: "国府台1丁目", chiban: "2-1" }, START, src);
    expect(r.status === "found" && r.parcel.sanko).toBe("12203");
    // 同じ筆が別のタイルで推定の位置からも見つかっても、参考図の形だけを使う
    const mixed: ParcelSource = {
      tile: async (x, y) =>
        x === SX && y === SY
          ? [{ kuiki: "市川市_国府台_１丁目__", chiban: "3", polygons: () => [box(SX, SY, 0.6, 0.6, 0.3, 0.3)], sanko: "12203" }]
          : x === SX + 1 && y === SY
            ? [{ kuiki: "市川市_国府台_１丁目__", chiban: "3", polygons: () => [box(SX + 1, SY, 0.1, 0.1, 0.3, 0.3)], estimated: "low" }]
            : null,
    };
    const r2 = await searchParcel({ city: "市川市", town: "国府台1丁目", chiban: "3" }, START, mixed);
    expect(r2.status === "found" && r2.parcel.pieces.map((p) => p.tile)).toEqual([[SX, SY]]);
    expect(r2.status === "found" && r2.parcel).toMatchObject({ sanko: "12203" });
  });

  it("登記所の地図が筆界未定地の所は、地番参考図の地番の付いた筆を出す", async () => {
    const [w, s, e, n] = tileBounds(SX, SY);
    const at = (fx: number, fy: number) => ({ lat: s + (n - s) * fy, lng: w + (e - w) * fx });
    const pub = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "前橋市_小相木町___", chiban: "筆界未定地(704+645-2)", polygon: box(SX, SY, 0.1, 0.1, 0.6, 0.6) }] });
    const sanko: ParcelSource = {
      tile: async (x, y) =>
        x === SX && y === SY ? [{ kuiki: "前橋市_小相木町___", chiban: "704", polygons: () => [box(SX, SY, 0.2, 0.2, 0.2, 0.2)], sanko: "10201" }] : null,
    };
    const src = mergeParcelSources(pub, sanko);
    expect(await parcelAt(at(0.3, 0.3).lat, at(0.3, 0.3).lng, src)).toMatchObject({ chibanRaw: "704", sanko: "10201", undetermined: true });
    // 参考図の筆の無い所は、筆界未定地のまま
    const away = await parcelAt(at(0.6, 0.6).lat, at(0.6, 0.6).lng, src);
    expect(away?.chibanRaw).toBe("筆界未定地(704+645-2)");
    expect(away?.undetermined).toBeUndefined();
    expect(chibanLabel("無地番-1")).toBe("無地番の土地");
  });

  it("地番の呼び方", () => {
    expect(chibanLabel("391-3")).toBe("地番 391-3");
    expect(chibanLabel("道-5")).toBe("道路（地番なし）");
    expect(chibanLabel("水-154")).toBe("水路（地番なし）");
    expect(kuikiLabel("川口市_青木_２丁目__")).toBe("川口市青木２丁目");
  });

  it("地図データの「51-3W2」（二重地番）・「100V1」（めがね地番）・「1000X(1/2)」（分属管理地番）は、登記の地番で出す", () => {
    expect(registryChiban("51-3W2")).toBe("51-3");
    expect(registryChiban("28-1")).toBe("28-1");
    expect(chibanLabel("28-1W5")).toBe("地番 28-1");
    expect(registryChiban("100V1")).toBe("100");
    expect(registryChiban("1000X(1/2)")).toBe("1000");
    expect(chibanLabel("123X(3/4)")).toBe("地番 123");
  });

  it("住所の地点が道路の上だったときの、地番で探し直す文字（町に丁目があれば、すぐ後ろの番号を丁目に）", () => {
    expect(chibanQueryOf("千葉県松戸市古ヶ崎4-3556-1", true)).toBe("地番 千葉県松戸市古ヶ崎4丁目3556-1");
    expect(chibanQueryOf("千葉県松戸市古ヶ崎4-3556", true)).toBe("地番 千葉県松戸市古ヶ崎4丁目3556");
    expect(chibanQueryOf("千葉県松戸市古ヶ崎四丁目3556-1", true)).toBe("地番 千葉県松戸市古ヶ崎四丁目3556-1");
    expect(chibanQueryOf("埼玉県熊谷市下奈良391-3", false)).toBe("地番 埼玉県熊谷市下奈良391-3");
    // 丁目の無い町の「1-2-3」は地番にできない。もう地番で探したものはそのまま
    expect(chibanQueryOf("埼玉県熊谷市下奈良1-391-3", false)).toBeUndefined();
    expect(chibanQueryOf("地番 熊谷市下奈良391-3", false)).toBeUndefined();
  });

  it("選んだ隣地の地番：同じ地番区域は数字だけを「、」でつなぎ、違う町は町の名前を付ける", () => {
    const base = "松戸市_古ヶ崎_四丁目__";
    const picked = [
      { kuiki: base, chiban: "3557-4" },
      { kuiki: "松戸市_古ヶ崎_三丁目__", chiban: "100-1" },
      { kuiki: base, chiban: "3555-10" },
      { kuiki: base, chiban: "3555-2" },
      // 二重地番の区画は登記の地番にそろえて1つに。地番の無い道路は入れない
      { kuiki: base, chiban: "3555-2W1" },
      { kuiki: base, chiban: "道-12" },
      { kuiki: "流山市_西深井___", chiban: "5" },
    ];
    expect(pickedChibanText(picked, base)).toBe("3555-2、3555-10、3557-4、古ヶ崎三丁目 100-1、流山市西深井 5");
    expect(pickedChibanText([], base)).toBe("");
    expect(kuikiLabelFrom("松戸市_古ヶ崎_三丁目__", base)).toBe("古ヶ崎三丁目");
    expect(kuikiLabelFrom("流山市_西深井___", base)).toBe("流山市西深井");
    // 町の部分が無ければ市区町村から
    expect(kuikiLabelFrom("松戸市____", base)).toBe("松戸市");
  });

  it("隣地が多いとき（道路の筆など）は、先頭の20筆と「ほかN筆」", () => {
    const many = Array.from({ length: 23 }, (_, i) => `青木 ${i + 1}`);
    expect(neighborList(many.slice(0, 3))).toBe("青木 1、青木 2、青木 3");
    expect(neighborList(many.slice(0, 20)).split("、")).toHaveLength(20);
    expect(neighborList(many)).toBe(`${many.slice(0, 20).join("、")}、ほか3筆（公図で確認）`);
  });
});

describe("lookup で地番を探す", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("番地まで見つからない住所は、地番の筆を探してその場所を使う", async () => {
    const town = { lat: START.lat, lng: START.lng };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("AddressSearch")
            ? [{ geometry: { coordinates: [town.lng, town.lat] }, properties: { title: "埼玉県熊谷市下奈良" } }]
            : { results: { muniCd: "11202", lv01Nm: "下奈良" } },
      })),
    );
    const src = fakeSource({ [`${SX + 1},${SY}`]: [{ kuiki: "熊谷市_下奈良___", chiban: "391-3" }], [`${SX},${SY}`]: [{ kuiki: "熊谷市_下奈良___", chiban: "390" }] });
    const r = await lookup("埼玉県熊谷市下奈良391番地3", { parcels: src });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.parcel?.chiban).toBe("391-3");
    expect(r.approximate).toBe(false);
    expect(r.matchedAddress).toBe("埼玉県熊谷市下奈良");
    const [w, , e] = tileBounds(SX + 1, SY);
    expect(r.lng).toBeGreaterThan(w);
    expect(r.lng).toBeLessThan(e);
    expect(r.links[0].url).toContain(r.lng.toFixed(6));
  });

  it("国土地理院が番地まで見つけた住所は、筆が見つからなくても何も言わない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("AddressSearch")
            ? [{ geometry: { coordinates: [START.lng, START.lat] }, properties: { title: "埼玉県熊谷市下奈良８５番地" } }]
            : { results: { muniCd: "11202", lv01Nm: "下奈良" } },
      })),
    );
    const r = await lookup("埼玉県熊谷市下奈良85-3", { parcels: fakeSource({}) });
    expect(r.status === "ok" && [r.approximate, r.parcelMiss, r.parcel]).toEqual([false, undefined, undefined]);
  });

  it("見つからなければ町の代表点のまま、理由と近い地番を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("AddressSearch")
            ? [{ geometry: { coordinates: [START.lng, START.lat] }, properties: { title: "埼玉県熊谷市下奈良" } }]
            : { results: { muniCd: "11202", lv01Nm: "下奈良" } },
      })),
    );
    const r = await lookup("埼玉県熊谷市下奈良391番地", { parcels: fakeSource({ [`${SX},${SY}`]: [{ kuiki: "熊谷市_下奈良___", chiban: "391-1" }] }) });
    expect(r.status === "ok" && r.approximate).toBe(true);
    expect(r.status === "ok" && r.parcelMiss).toEqual({ chiban: "391", reason: "not_found", similar: ["391-1"] });
  });
});

describe("二重地番（W）などで分かれた区画", () => {
  const K = "渋谷区_神南_１丁目__";
  // 51-3 の区画：W1 と W2 は接し、W4 は隣のタイルで W2 に接する。W3 は離れている（別の土地のことがある）
  const src = () =>
    fakeSource({
      [`${SX},${SY}`]: [
        { kuiki: K, chiban: "51-3W1", polygon: box(SX, SY, 0.4, 0.4, 0.1, 0.1) },
        { kuiki: K, chiban: "51-3W2", polygon: box(SX, SY, 0.5, 0.4, 0.5, 0.1) },
        { kuiki: K, chiban: "51-3W3", polygon: box(SX, SY, 0.1, 0.8, 0.1, 0.1) },
        { kuiki: K, chiban: "52", polygon: box(SX, SY, 0.3, 0.4, 0.1, 0.1) },
      ],
      [`${SX + 1},${SY}`]: [
        { kuiki: K, chiban: "51-3W4", polygon: box(SX + 1, SY, 0, 0.4, 0.2, 0.1) },
        { kuiki: K, chiban: "60", polygon: box(SX + 1, SY, 0.2, 0.4, 0.1, 0.1) },
      ],
    });
  const [w, s, e, n] = tileBounds(SX, SY);

  it("地点の筆は、つながっている区画を合わせて1筆にする（面積・隣地・地図の強調に使う）", async () => {
    const source = src();
    const target = await parcelAt(s + (n - s) * 0.45, w + (e - w) * 0.45, source);
    expect(target?.chibanRaw).toBe("51-3W1");
    expect(target?.chibanRaws).toEqual(["51-3W1", "51-3W2", "51-3W4"]);
    expect(target?.pieces).toHaveLength(3);
    // 隣地は、合わせた区画のどれかに接する筆（自分の区画は入れない）
    const got = await adjacentParcels(target!, source);
    expect(got.map((g) => g.chiban)).toEqual(["52", "60"]);
  });

  it("地番で探したときも、同じ地番の区画をまとめる", async () => {
    const r = await searchParcel({ city: "渋谷区", town: "神南一丁目", chiban: "51-3" }, START, src());
    expect(r.status === "found" && r.parcel.chibanRaws).toEqual(["51-3W1", "51-3W2", "51-3W3", "51-3W4"]);
  });
});

describe("隣の筆", () => {
  it("境界が接する筆だけを、地番の順に返す（離れた筆・自分は入れない）", async () => {
    const K = "熊谷市_下奈良___";
    // 真ん中の筆 10 のまわり：右に接する 11、上に接する 9-2、角だけ接する 12、少し離れた 13、地番の無い道路
    const src = fakeSource({
      [`${SX},${SY}`]: [
        { kuiki: K, chiban: "10", polygon: box(SX, SY, 0.4, 0.4, 0.1, 0.1) },
        { kuiki: K, chiban: "11", polygon: box(SX, SY, 0.5, 0.4, 0.1, 0.1) },
        { kuiki: K, chiban: "9-2", polygon: box(SX, SY, 0.4, 0.5, 0.1, 0.05) },
        { kuiki: K, chiban: "12", polygon: box(SX, SY, 0.3, 0.3, 0.1, 0.1) },
        { kuiki: K, chiban: "13", polygon: box(SX, SY, 0.62, 0.4, 0.1, 0.1) },
        { kuiki: K, chiban: "道-5", polygon: box(SX, SY, 0.4, 0.35, 0.1, 0.05) },
      ],
    });
    const [w, s, e, n] = tileBounds(SX, SY);
    const target = await parcelAt(s + (n - s) * 0.45, w + (e - w) * 0.45, src);
    expect(target?.chiban).toBe("10");
    const got = await adjacentParcels(target!, src);
    expect(got.map((g) => g.chiban)).toEqual(["9-2", "11", "12", "道-5"]);
  });
});

describe("公図から推定した筆のデータの置き場所（data/kozu-source.json）", () => {
  it("置き場所は空（まだ作っていない）か R2 の PMTiles。データのある市区町村は5桁のコード", () => {
    expect(KOZU_SOURCE.url === "" || /^https:\/\/.+\.pmtiles$/.test(KOZU_SOURCE.url)).toBe(true);
    for (const c of KOZU_SOURCE.codes) expect(c).toMatch(/^(0[89]|1[0-4])\d{3}$/);
    if (KOZU_SOURCE.url) {
      expect(KOZU_SOURCE.edition).toMatch(/^\d{4}年\d{1,2}月公開版$/);
      // 1都3県の公図の地域の多く（置けた筆のある市区町村）
      expect(KOZU_SOURCE.codes.length).toBeGreaterThan(50);
    }
  });
});

describe("地番参考図のある市町村", () => {
  it("地番区域の市区町村の部分で判定する（町村は郡の名前が前に付く）", () => {
    expect(sankoCovers("市川市")).toBe(true);
    expect(sankoCovers("比企郡小川町")).toBe(true);
    expect(sankoCovers("児玉郡上里町")).toBe(true);
    expect(sankoCovers("小川町")).toBe(true);
    expect(sankoCovers("松戸市")).toBe(false);
    expect(sankoCovers("横浜市港北区")).toBe(false);
  });
});

describe("位置がずれた地図の一覧（scripts/parcel-tiles/misplaced-sheets.json）", () => {
  // タイルを作るとき（build_pref.py）に外す地図。書き方を間違えると何も外れないか、正しい地図まで外れる
  const data = JSON.parse(readFileSync(new URL("../../scripts/parcel-tiles/misplaced-sheets.json", import.meta.url), "utf8")) as {
    sheets: { code: string; sheet: string; town: string; parcels: number; reason: string; oaza?: string; chome?: string; chiban?: string[] }[];
  };
  it("どれも 1都6県の5桁の市区町村コード・地図名・町・筆の数・理由がある。同じ決まりは1回だけ（町・地番で絞るときも）", () => {
    expect(data.sheets.length).toBeGreaterThan(0);
    const keys = new Set<string>();
    for (const s of data.sheets) {
      expect(s.code).toMatch(/^(0[89]|1[0-4])\d{3}$/);
      expect(s.sheet.trim()).not.toBe("");
      expect(s.town.trim()).not.toBe("");
      expect(s.parcels).toBeGreaterThan(0);
      expect(s.reason.length).toBeGreaterThan(20);
      // 町・地番まで絞るとき：大字名・丁目名は空でない文字、地番は重ならない空でない一覧
      if (s.oaza !== undefined) expect(s.oaza.trim()).not.toBe("");
      if (s.chome !== undefined) expect(s.chome.trim()).not.toBe("");
      if (s.chiban !== undefined) {
        expect(s.chiban.length).toBeGreaterThan(0);
        expect(new Set(s.chiban).size).toBe(s.chiban.length);
        expect(s.chiban.length).toBe(s.parcels);
      }
      const key = `${s.code}|${s.sheet}|${s.oaza ?? ""}|${s.chome ?? ""}|${(s.chiban ?? []).join(",")}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });
  it("市区町村のデータ全部（*）を外すのは、合併前の古いデータだけ（今の市区町村のデータを丸ごと消さない）", () => {
    for (const s of data.sheets.filter((x) => x.sheet === "*")) expect(s.town).toMatch(/合併前/);
  });
});
