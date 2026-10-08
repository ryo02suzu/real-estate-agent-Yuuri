// 地番検索を本物のデータ（国土地理院と、登記所備付地図のタイル）で確かめる。ネットにつなぐので PARCEL_LIVE=1 のときだけ
import { describe, expect, it } from "vitest";
import { lookup } from "./index";

const CASES: [string, string, string][] = [
  // [入力, 見つかるはずの地番区域, 地番]
  ["埼玉県熊谷市下奈良354", "熊谷市_下奈良___", "354"],
  ["地番 埼玉県川口市青木2丁目217-8", "川口市_青木_２丁目__", "217-8"],
  ["東京都西多摩郡瑞穂町大字箱根ケ崎1680番1", "西多摩郡瑞穂町_大字箱根ケ崎___", "1680-1"],
  ["埼玉県さいたま市見沼区大字南中丸1552番地", "さいたま市見沼区_大字南中丸___", "1552"],
  // 大字の代表点から3タイル（約1.5km）離れた筆。地番の近い筆の方へ探しに行けるか
  ["地番 埼玉県熊谷市三ケ尻1877-1", "熊谷市_三ケ尻___", "1877-1"],
];

describe.skipIf(!process.env.PARCEL_LIVE)("地番検索（本物のデータ）", () => {
  for (const [input, kuiki, chiban] of CASES)
    it(input, { timeout: 120_000 }, async () => {
      const t = Date.now();
      const r = await lookup(input);
      console.log(input, `${Date.now() - t}ms`, r.status === "ok" ? (r.parcel ? `${r.parcel.kuiki} ${r.parcel.chiban} ${r.lat.toFixed(6)},${r.lng.toFixed(6)} pieces=${r.parcel.pieces.length}` : JSON.stringify(r.parcelMiss)) : r.status);
      expect(r.status === "ok" && r.parcel && [r.parcel.kuiki, r.parcel.chiban]).toEqual([kuiki, chiban]);
    });

  it("地図データの無い地域（さいたま市大宮区の中心部）は no_map", { timeout: 120_000 }, async () => {
    const r = await lookup("地番 埼玉県さいたま市大宮区大門町3丁目1");
    expect(r.status === "ok" && r.parcelMiss?.reason).toBe("no_map");
  });
});
