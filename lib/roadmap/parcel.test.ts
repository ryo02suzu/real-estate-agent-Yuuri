import { afterEach, describe, expect, it, vi } from "vitest";
import { lookup } from "./index";
import {
  chibanLabel,
  cityMatches,
  kuikiLabel,
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

  it("地番の呼び方", () => {
    expect(chibanLabel("391-3")).toBe("地番 391-3");
    expect(chibanLabel("道-5")).toBe("道路（地番なし）");
    expect(chibanLabel("水-154")).toBe("水路（地番なし）");
    expect(kuikiLabel("川口市_青木_２丁目__")).toBe("川口市青木２丁目");
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
