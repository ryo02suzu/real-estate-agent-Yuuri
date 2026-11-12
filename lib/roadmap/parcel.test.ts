import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import KOZU_SOURCE from "./data/kozu-source.json";
import { lookup, registryStyle } from "./index";
import { loadParcelIndex } from "./parcel-index";
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
  townMatches,
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

  it("イロハが地番区域の小字の欄にある所（「白尾ハ6番1」→ 地番区域「白尾」＋「ハ」の 6-1）も見つける。同じ番号のほかの小字の筆は出さない", async () => {
    const src = fakeSource({
      [`${SX},${SY}`]: [
        { kuiki: "かほく市_白尾__イ_", chiban: "6-1" },
        { kuiki: "かほく市_白尾__ハ_", chiban: "6-2" },
      ],
      [`${SX + 1},${SY}`]: [{ kuiki: "かほく市_白尾__ハ_", chiban: "6-1", polygon: box(SX + 1, SY, 0.2, 0.3, 0.3, 0.2) }],
    });
    for (const town of ["白尾", "白尾ハ"]) {
      const r = await searchParcel({ city: "かほく市", town, chiban: "ハ6-1" }, START, src);
      expect(r.status).toBe("found");
      if (r.status !== "found") continue;
      expect(r.parcel.kuiki).toBe("かほく市_白尾__ハ_");
      expect(r.parcel.chiban).toBe("6-1");
    }
    // 無ければ、同じ小字の近い地番だけを候補に（入力と同じ「ハ」付きの書き方で）
    const none = await searchParcel({ city: "かほく市", town: "白尾", chiban: "ハ6-9" }, START, src, { maxTiles: 12 });
    expect(none).toEqual({ status: "not_found", similar: ["ハ6-1", "ハ6-2"] });
  });

  it("甲乙の付いた地番は、頭の文字まで同じ筆だけ（「乙987-1」を探して「甲987-1」は出さない）", async () => {
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "取手市_白山_３丁目__", chiban: "甲987-1" }, { kuiki: "取手市_白山_３丁目__", chiban: "乙987-2" }] });
    expect(await searchParcel({ city: "取手市", town: "白山３丁目", chiban: "乙987-1" }, START, src, { maxTiles: 12 })).toEqual({ status: "not_found", similar: ["乙987-2"] });
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

  /** 国土地理院の住所検索が title の住所を返す fetch（逆ジオコーダは世田谷区弦巻） */
  const stubGsi = (title: string, muniCd = "13112", town = "弦巻三丁目") =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("AddressSearch") ? [{ geometry: { coordinates: [START.lng, START.lat] }, properties: { title } }] : { results: { muniCd, lv01Nm: town } },
      })),
    );
  const YUMI = (c: string) => fakeSource({ [`${SX},${SY}`]: [{ kuiki: "世田谷区_弦巻_３丁目__", chiban: c }] });

  // 2026-11-08 の総当たり（地価公示・地価調査の所在 400地点）：所在の「弦巻3丁目14番1」を国土地理院が住居表示の「14番1号」として当て、
  // 地番の筆を探さずに住居表示の地点を出していた（筆のデータがある 164地点のうち 32地点。うち 30地点は入力と同じ地番の筆がその場所にあった）
  it("登記の書き方（「14番1」号なし）は、国土地理院が住居表示（14番1号）に当てても地番の筆を出し、住居表示の住所を添える", async () => {
    stubGsi("東京都世田谷区弦巻三丁目１４番１号");
    const r = await lookup("東京都世田谷区弦巻3丁目14番1", { parcels: YUMI("14-1") });
    expect(r.status === "ok" && [r.parcel?.chiban, r.jukyoAlt]).toEqual(["14-1", "東京都世田谷区弦巻三丁目１４番１号"]);
  });

  it("住居表示が街区（「22番」）までしか合わず枝番が残る「22-39」も、地番の筆を先に探す", async () => {
    stubGsi("東京都世田谷区弦巻三丁目２２番");
    const r = await lookup("東京都世田谷区弦巻3丁目22-39", { parcels: YUMI("22-39") });
    expect(r.status === "ok" && r.parcel?.chiban).toBe("22-39");
  });

  it("住居表示の書き方（「14-1」で号まで合う・「14番1号」）は、今までどおり住居表示の地点（地番を探さない）", async () => {
    stubGsi("東京都世田谷区弦巻三丁目１４番１号");
    const a = await lookup("東京都世田谷区弦巻3丁目14-1", { parcels: YUMI("14-1") });
    expect(a.status === "ok" && [a.parcel, a.jukyoAlt]).toEqual([undefined, undefined]);
    const b = await lookup("東京都世田谷区弦巻3丁目14番1号", { parcels: YUMI("14-1") });
    expect(b.status === "ok" && b.parcel).toBe(undefined);
  });

  it("地番として探して筆が無ければ、住居表示の地点のまま（何も言わない）", async () => {
    stubGsi("東京都世田谷区弦巻三丁目１４番１号");
    const r = await lookup("東京都世田谷区弦巻3丁目14番1", { parcels: YUMI("99-9") });
    expect(r.status === "ok" && [r.parcel, r.parcelMiss, r.jukyoAlt, r.matchedAddress]).toEqual([undefined, undefined, undefined, "東京都世田谷区弦巻三丁目１４番１号"]);
  });

  it("登記の書き方かどうか（registryStyle）", () => {
    for (const s of ["弦巻3丁目14番1", "中希望が丘22番39", "高勢町2丁目150番地", "下奈良391番地3", "下奈良1234番地の5", "地番 青木2丁目217番8"]) expect(registryStyle(s)).toBe(true);
    for (const s of ["弦巻3丁目14番1号", "弦巻3丁目14-1", "弦巻3丁目14番", "神南1-19-11"]) expect(registryStyle(s)).toBe(false);
  });
});

describe("地番の索引（町の代表点から遠い筆）", () => {
  // 2026-11-08 の総当たり：大桑村大字長野2922番2・東吾妻町大字岩井1015番3 など、広い大字で国土地理院の町の代表点から遠い所の筆は、
  // 代表点のまわり 3 タイルに同じ町の筆が無く「地図データがない地域」、または探し切れず「見つかりません」になっていた
  const FAR = { [`${SX + 9},${SY + 6}`]: [{ kuiki: "木曽郡大桑村_大字長野___", chiban: "2922-2" }, { kuiki: "木曽郡大桑村_大字長野___", chiban: "2921" }] };
  it("索引が無ければ今までどおり（代表点のまわりに町の筆が無いので地図データのない地域）", async () => {
    const r = await searchParcel({ city: "大桑村", town: "長野", chiban: "2922-2" }, START, fakeSource(FAR));
    expect(r.status).toBe("no_map");
  });
  it("索引に番号の入ったタイルがあれば、そのタイルを先に開いて見つける（遠くても）", async () => {
    const src = fakeSource(FAR);
    const index = { k: { "木曽郡大桑村_大字長野___": [[SX + 9, SY + 6, 2900, 2930] as [number, number, number, number], [SX + 1, SY, 10, 50] as [number, number, number, number]] } };
    const r = await searchParcel({ city: "大桑村", town: "長野", chiban: "2922番2" }, START, src, { index });
    expect(r.status === "found" && r.parcel.chiban).toBe("2922-2");
    // 番号の入っていないタイル（10〜50 番）は開かない
    expect(src.reads[0]).toBe(`${SX + 9},${SY + 6}`);
    expect(src.reads).not.toContain(`${SX + 1},${SY}`);
  });
  it("索引の町が合わない・番号が入っていなければ、今までの探し方に続ける", async () => {
    const near = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "熊谷市_下奈良___", chiban: "391-3" }] });
    const index = { k: { "熊谷市_上奈良___": [[SX + 9, SY + 6, 1, 999] as [number, number, number, number]] } };
    const r = await searchParcel({ city: "熊谷市", town: "下奈良", chiban: "391-3" }, START, near, { index });
    expect(r.status === "found" && r.parcel.chiban).toBe("391-3");
  });
});

describe("地番の索引の読み込み（loadParcelIndex）", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("置き場所が無い・市区町村コードの形でない・404・形が違うときは null。正しい形は返し、同じ URL は1回だけ読む", async () => {
    expect(await loadParcelIndex("20406", "")).toBeNull();
    expect(await loadParcelIndex("abc", "https://x.test/i/{code}.json")).toBeNull();
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("404") ? { ok: false, json: async () => null } : url.includes("bad") ? { ok: true, json: async () => ({ v: 2 }) } : { ok: true, json: async () => ({ v: 1, z: 16, k: { "木曽郡大桑村_大字長野___": [[1, 2, 3, 4]] } }) },
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadParcelIndex("20406", "https://x.test/404/{code}.json")).toBeNull();
    expect(await loadParcelIndex("20406", "https://x.test/bad/{code}.json")).toBeNull();
    const ok = await loadParcelIndex("20406", "https://x.test/ok/{code}.json");
    expect(ok?.k["木曽郡大桑村_大字長野___"]).toEqual([[1, 2, 3, 4]]);
    await loadParcelIndex("20406", "https://x.test/ok/{code}.json");
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/ok/20406.json"))).toHaveLength(1);
  });
});

describe("地番区域の町の名前の合わせ方（townMatches）", () => {
  // 2026-11-08 の総当たりで見つけた書き方：小字の欄に町の続き（豊明市・かほく市・西尾市・白山市）、大字の欄が空（阿南町）
  it("大字＋丁目のほか、小字の欄に町の続き・丁目を入れる地番区域、大字の欄が空の地番区域にも当たる", () => {
    expect(townMatches("豊明市_栄町__上姥子_", townKey("栄町上姥子"))).toBe(true);
    expect(townMatches("かほく市_白尾__ハ_", townKey("白尾ハ"))).toBe(true);
    expect(townMatches("下伊那郡阿南町___字新野_", townKey("新野"))).toBe(true);
    expect(townMatches("名古屋市中区_栄__三丁目_", townKey("栄三丁目"))).toBe(true);
    expect(townMatches("川口市_青木_２丁目__", townKey("青木二丁目"))).toBe(true);
    expect(townMatches("さいたま市見沼区_大字南中丸___", townKey("大字南中丸"))).toBe(true);
  });
  it("丁目の書き方だけ違うもの：地番区域が大字だけ（住所の丁目は地番の区域でない）、入力に丁目が無い", () => {
    expect(townMatches("松戸市_古ケ崎___", townKey("古ヶ崎四丁目"))).toBe(true);
    expect(townMatches("松戸市_古ケ崎_４丁目__", townKey("古ヶ崎"))).toBe(true);
  });
  it("別の町には当たらない（名前の一部・別の丁目・別の大字）", () => {
    expect(townMatches("川口市_青木_２丁目__", townKey("青木三丁目"))).toBe(false);
    expect(townMatches("豊明市_栄町__上姥子_", townKey("栄町下姥子"))).toBe(false);
    expect(townMatches("刈谷市_小山町___", townKey("小山"))).toBe(false);
    expect(townMatches("刈谷市_一ツ木町_６丁目__", townKey("一ツ木町五丁目"))).toBe(false);
    expect(townMatches("熊谷市_下奈良___", "")).toBe(false);
  });
  it("小字のある地番区域は、住所の丁目を外して当てない（尾張旭市「桜ケ丘町」＋「西」と「桜ケ丘町一丁目」は別の区域。2026-11-08 の総当たりで、同じ地番の 608m 離れた別の土地を出していた）", () => {
    expect(townMatches("尾張旭市_桜ケ丘町__西_", townKey("桜ケ丘町一丁目"))).toBe(false);
    expect(townMatches("尾張旭市_桜ケ丘町__西_", townKey("桜ケ丘町西"))).toBe(true);
    expect(townMatches("尾張旭市_桜ケ丘町___", townKey("桜ケ丘町一丁目"))).toBe(true);
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
    sheets: { code: string; sheet: string; town: string; parcels: number; reason: string; oaza?: string; chome?: string; chiban?: string[]; shift?: { kind: "T1" | "T2"; east: number; north: number } }[];
  };
  it("測地系の取り違えで動かす地図（shift）は、地図ごと・向きと量が日本測地系と世界測地系の差（関東・中部・近畿で西または東へ約245〜300m・北または南へ約325〜370m）", () => {
    for (const s of data.sheets.filter((x) => x.shift)) {
      const { kind, east, north } = s.shift!;
      expect(["T1", "T2"]).toContain(kind);
      // T1：日本測地系の数字→世界測地系（北西へ動かす。今は南東へずれている）。T2：その逆（南東へ動かす）。
      // 差は場所で変わる（国土地理院の TKY2JGD.par：福井県の西で東西 約256m、新潟県の北で南北 約326m、銚子で東西 約301m、館山で南北 約371m。
      // 兵庫県（平面直角座標の V 系）は東西 約245〜248m）
      expect(east).toBeGreaterThanOrEqual(kind === "T1" ? -320 : 240);
      expect(east).toBeLessThanOrEqual(kind === "T1" ? -240 : 320);
      expect(north).toBeGreaterThanOrEqual(kind === "T1" ? 315 : -400);
      expect(north).toBeLessThanOrEqual(kind === "T1" ? 400 : -315);
      // 理由の向き（「地図全体が南東へ…ずれている」）が動かす向きの逆になっている
      expect(s.reason).not.toMatch(kind === "T1" ? /地図全体が北西へ/ : /地図全体が南東へ/);
      expect(s.oaza).toBeUndefined();
      expect(s.chome).toBeUndefined();
      expect(s.chiban).toBeUndefined();
      expect(s.sheet).not.toBe("*");
      expect(s.reason).toMatch(/測地系/);
    }
  });
  it("動かす量は、平面直角座標の数字の取り違えとして計算した値（同じ座標系の中ではほぼ同じ量で、T1 と T2 は向きが逆）", () => {
    // 平面直角座標の系：関東（茨城〜神奈川）IX、新潟・山梨・長野・静岡 VIII、富山・石川・岐阜・愛知 VII、福井と近畿（兵庫を除く）VI、兵庫 V。
    // 緯度経度の変換量（TKY2JGD.par）をそのまま使うと場所ごとに 3〜12m 違い、最初の関東の決まりは同じ系の中で最大 11.9m ばらついていた。
    // 数字の取り違えとして計算すると、同じ系の中では原点からの距離の分しか変わらない（2026-11-08 の作り直しで最大 2.7m）
    const zone = (code: string) => {
      const p = Number(code.slice(0, 2));
      return p <= 14 ? "IX" : [15, 19, 20, 22].includes(p) ? "VIII" : [18, 24, 25, 26, 27, 29, 30].includes(p) ? "VI" : p === 28 ? "V" : "VII";
    };
    const groups = new Map<string, [number, number][]>();
    for (const s of data.sheets.filter((x) => x.shift)) {
      // T2 は向きを逆にして T1 とまとめる
      const sign = s.shift!.kind === "T1" ? 1 : -1;
      const g = groups.get(zone(s.code)) ?? [];
      g.push([sign * s.shift!.east, sign * s.shift!.north]);
      groups.set(zone(s.code), g);
    }
    expect(groups.get("IX")?.length).toBeGreaterThan(10);
    const mean = (vs: [number, number][]) => [vs.reduce((a, v) => a + v[0], 0) / vs.length, vs.reduce((a, v) => a + v[1], 0) / vs.length];
    for (const [z, vs] of groups) {
      const [me, mn] = mean(vs);
      for (const [e, n] of vs) expect(Math.hypot(e - me, n - mn), `系 ${z}`).toBeLessThan(4);
    }
    // 関東（IX）は T1 で西へ約 293m・北へ約 356m。富山・岐阜・愛知（VII）は西へ約 271m・北へ約 349m
    const [ixE, ixN] = mean(groups.get("IX")!);
    expect(ixE).toBeGreaterThan(-296);
    expect(ixE).toBeLessThan(-290);
    expect(ixN).toBeGreaterThan(353);
    expect(ixN).toBeLessThan(359);
    if (groups.has("VII")) {
      const [e7, n7] = mean(groups.get("VII")!);
      expect(e7).toBeGreaterThan(-275);
      expect(e7).toBeLessThan(-267);
      expect(n7).toBeGreaterThan(346);
      expect(n7).toBeLessThan(352);
    }
    // 近畿（VI 系：滋賀・京都・大阪・奈良）は西へ約 262m・北へ約 347m。兵庫（V 系）は西へ約 247m・北へ約 344m
    const [e6, n6] = mean(groups.get("VI")!);
    expect(e6).toBeGreaterThan(-266);
    expect(e6).toBeLessThan(-258);
    expect(n6).toBeGreaterThan(344);
    expect(n6).toBeLessThan(350);
    const [e5, n5] = mean(groups.get("V")!);
    expect(e5).toBeGreaterThan(-250);
    expect(e5).toBeLessThan(-244);
    expect(n5).toBeGreaterThan(341);
    expect(n5).toBeLessThan(348);
  });
  it("近畿（2026-11-12）：三田市のニュータウンの4枚は、道路縁と隣の地図で確かめた同じ量（西へ3.0m・南へ3.3m）を計算した量に足している", () => {
    const kinki = data.sheets.filter((s) => /^(2[4-9]|30)/.test(s.code) && s.shift);
    expect(kinki).toHaveLength(14);
    const sanda = kinki.filter((s) => s.code === "28219");
    expect(sanda.map((s) => s.sheet).sort()).toEqual(["あかしあ台１～５丁目", "すずかけ台１～４丁目", "ゆりのき台１～６丁目（修正後）", "北摂三田ニュータウン南地区"].sort());
    for (const s of sanda) {
      // 計算した量（東へ約 -245.0m・北へ約 346.4m）に、4枚とも同じ量を足した
      expect(s.shift!.east).toBeGreaterThanOrEqual(-248.2);
      expect(s.shift!.east).toBeLessThanOrEqual(-247.9);
      expect(s.shift!.north).toBeGreaterThanOrEqual(342.9);
      expect(s.shift!.north).toBeLessThanOrEqual(343.2);
      expect(s.reason).toMatch(/4枚に同じ量（西へ 3\.0m・南へ 3\.3m）を足して/);
    }
  });
  it("どれも対応エリア（関東1都6県・中部9県・東北6県・近畿2府5県）の5桁の市区町村コード・地図名・町・筆の数・理由がある。同じ決まりは1回だけ（町・地番で絞るときも）", () => {
    expect(data.sheets.length).toBeGreaterThan(0);
    const keys = new Set<string>();
    for (const s of data.sheets) {
      expect(s.code).toMatch(/^(0[2-9]|1\d|2\d|30)\d{3}$/);
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
