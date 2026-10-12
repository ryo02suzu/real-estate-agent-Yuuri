import { open, stat } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/land-price-source.json";
import {
  LAND_PRICE_ZOOM,
  asOfText,
  changeText,
  distanceText,
  landPriceRows,
  landPriceSummary,
  nearestLandPrices,
  priceText,
  tsuboText,
  type LandPricePoint,
  type LandPriceSource,
} from "./land-price";
import { landPriceTileSource } from "./land-price-tiles";
import { tileOf } from "./parcel";

const pt = (lng: number, lat: number, props: Partial<LandPricePoint> = {}): LandPricePoint => ({
  kind: "公示",
  no: "テスト-1",
  point: [lng, lat],
  price: 300_000,
  usage: "住宅地",
  year: 2026,
  history: [],
  ...props,
});

describe("地価の文字", () => {
  it("価格・坪単価・前年比・距離・時点", () => {
    expect(priceText(4_410_000)).toBe("441万円/m²");
    expect(priceText(455_000)).toBe("45.5万円/m²");
    expect(priceText(450_000)).toBe("45万円/m²");
    expect(priceText(12_340_000)).toBe("1,234万円/m²");
    expect(priceText(8_350)).toBe("8,350円/m²");
    // 1坪 = 400/121 m²
    expect(tsuboText(300_000)).toBe("99.2万円/坪");
    expect(changeText(11.4)).toBe("+11.4%");
    expect(changeText(-1)).toBe("-1.0%");
    expect(changeText(0)).toBe("±0%");
    expect(changeText(undefined)).toBe("新規");
    expect(distanceText(3)).toBe("約10m");
    expect(distanceText(324)).toBe("約320m");
    expect(distanceText(1249)).toBe("約1.2km");
    expect(asOfText({ kind: "公示", year: 2026 })).toBe("2026年1月1日時点");
    expect(asOfText({ kind: "調査", year: 2026 })).toBe("2026年7月1日時点");
  });

  it("要約と詳しい行", () => {
    const p = pt(139.7, 35.7, {
      no: "千代田-1",
      price: 4_410_000,
      change: 11.4,
      address: "東京都 千代田区三番町6番25",
      area: 969,
      use: "共同住宅",
      structure: "SRC",
      above: 10,
      roadType: "区道",
      roadDir: "南",
      roadWidth: 11,
      station: "半蔵門",
      stationM: 500,
      zone: "2住居",
      bcr: 60,
      far: 400,
      fire: "防火",
      plan: "市街化",
      history: [
        { year: 2025, price: 3_960_000 },
        { year: 2026, price: 4_410_000 },
      ],
    });
    expect(landPriceSummary(p)).toBe("地価公示 千代田-1（住宅地）441万円/m²（+11.4%）");
    expect(landPriceRows(p).map((r) => `${r.label}：${r.value}`)).toEqual([
      "所在及び地番：東京都 千代田区三番町6番25",
      "地積：969m²",
      "利用の現況：共同住宅（鉄骨鉄筋コンクリート造 地上10階）",
      "前面道路：南側・幅員11m・区道",
      "最寄り駅：半蔵門（約500m）",
      "法令上の制限：第二種住居地域・建蔽率60%・容積率400%・防火地域",
      "価格の推移：2025年 396万円→2026年 441万円",
    ]);
  });
});

describe("物件の近くの地点", () => {
  it("まわりのタイルも読み、近い順に。遠すぎる地点は外す", async () => {
    const LAT = 35.7;
    const LNG = 139.7;
    const [tx, ty] = tileOf(LAT, LNG, LAND_PRICE_ZOOM);
    const near = pt(LNG + 0.003, LAT, { no: "近い" }); // 東へ約270m
    const north = pt(LNG, LAT + 0.009, { no: "北", kind: "調査" }); // 北へ約1km（上のタイルかもしれない）
    const far = pt(LNG + 0.05, LAT, { no: "遠い" }); // 約4.5km
    const tiles = new Map<string, LandPricePoint[]>();
    for (const p of [near, north, far]) {
      const [x, y] = tileOf(p.point[1], p.point[0], LAND_PRICE_ZOOM);
      tiles.set(`${x}/${y}`, [...(tiles.get(`${x}/${y}`) ?? []), p]);
    }
    const src: LandPriceSource = { tile: async (x, y) => (Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1 ? (tiles.get(`${x}/${y}`) ?? []) : null) };
    // タイルの縁の余白で、同じ地点が隣のタイルにも入っていることがある
    const twice: LandPriceSource = { tile: async (x, y) => [...((await src.tile(x, y)) ?? []), ...(x === tx + 1 && y === ty ? [near] : [])] };
    const r = await nearestLandPrices(LAT, LNG, twice);
    expect(r.map((h) => h.no)).toEqual(["近い", "北"]);
    expect(r[0].bearing).toBe("東");
    expect(r[0].distance).toBeCloseTo(271, -1);
    expect(r[1].bearing).toBe("北");
    expect(await nearestLandPrices(LAT, LNG, { tile: async () => null })).toEqual([]);
  });
});

// アプリに入っている地価のタイル（public/data/）を実際に読む
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

describe("アプリに入っている地価のタイル", () => {
  const src = landPriceTileSource(fileSource(PATH));

  it("land-price-source.json のファイルがあり、関東1都6県の地点が入っている", async () => {
    expect(SRC.url).toMatch(/^\/data\/land-price-\d{4}-\d{4}\.pmtiles$/);
    expect(SRC.edition).toMatch(/^地価公示 令和\d+年（\d{4}年1月1日時点）・地価調査 令和\d+年（\d{4}年7月1日時点）$/);
    expect((await stat(PATH)).size).toBeGreaterThan(1_000_000);
    for (const k of ["L01", "L02"]) for (const p of ["08", "09", "10", "11", "12", "13", "14"]) expect((SRC.points as Record<string, number>)[`${k}-${p}`]).toBeGreaterThan(200);
  });

  it("千代田区三番町：近くに地価公示の標準地があり、価格・前年比・駅・用途地域が読める", async () => {
    const r = await nearestLandPrices(35.69014, 139.744815, src, { count: 10 });
    expect(r.length).toBe(10);
    const k = r.find((h) => h.kind === "公示");
    expect(k?.no).toMatch(/^千代田\d*-\d+$/);
    expect(k?.price).toBeGreaterThan(1_000_000);
    expect(k?.station).toBeTruthy();
    expect(k?.zone).toBeTruthy();
    expect(k?.history.length).toBeGreaterThanOrEqual(2);
    expect(r.some((h) => h.kind === "調査" && /^千代田\(都\)\d*-\d+$/.test(h.no))).toBe(true);
    // 同じ地点は1回だけ
    expect(new Set(r.map((h) => `${h.kind}|${h.no}`)).size).toBe(r.length);
  });

  it("横浜市・千葉市・さいたま市でも見つかり、関東の外（静岡県）は空", async () => {
    // 地価調査の基準地番号は、県の中で重ならない地名（千葉市中央区は「中央(県)」）
    for (const [lat, lng, city] of [
      [35.4437, 139.638, "横浜市"],
      [35.6074, 140.1065, "千葉市"],
      [35.8617, 139.6455, "さいたま市"],
    ] as const) {
      const r = await nearestLandPrices(lat, lng, src);
      expect(r.length).toBeGreaterThan(0);
      expect(r[0].address).toContain(city);
    }
    expect(await nearestLandPrices(34.9756, 138.3828, src)).toEqual([]);
  });
});
