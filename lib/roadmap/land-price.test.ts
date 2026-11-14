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
  stationText,
  tsuboText,
  type LandPricePoint,
  type LandPriceSource,
} from "./land-price";
import { decodeLandPrice, landPriceTileSource } from "./land-price-tiles";
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

describe("駅のすぐ近くの地点・地価調査の番号（国と府の公式の書き方）", () => {
  // 国土数値情報の説明：地価調査の「最寄り駅迄の道路距離」は「駅接面の場合は 0・駅近接の場合は 1」。地価公示は「交通施設との近接状況」
  // （近接・接面・駅前広場接面）。1 を距離として「約1m」と出していた（140地点）
  it("駅の区分があれば、距離ではなく区分で出す", () => {
    expect(stationText({ station: "京橋", stationNear: "近接" })).toBe("京橋（近接）");
    expect(stationText({ station: "高円寺", stationNear: "接面" })).toBe("高円寺（接面）");
    expect(stationText({ station: "東京", stationNear: "駅前広場接面" })).toBe("東京（駅前広場接面）");
    // 最寄りが駅ではない地点（鉄道の無い所のバス停・国道）もあるので、「駅に」とは書かない
    expect(stationText({ station: "清水バス停", stationNear: "近接" })).toBe("清水バス停（近接）");
    expect(stationText({ station: "国道13号", stationNear: "接面" })).toBe("国道13号（接面）");
    expect(stationText({ station: "半蔵門", stationM: 500 })).toBe("半蔵門（約500m）");
    expect(stationText({ station: "半蔵門", stationM: 1500 })).toBe("半蔵門（約1,500m）");
    // 一覧の1行
    expect(stationText({ station: "京橋", stationNear: "近接" }, true)).toBe("京橋 近接");
    expect(stationText({ station: "半蔵門", stationM: 500 }, true)).toBe("半蔵門 500m");
    // 区分の入っていない前の版のタイルの、距離 0 の地価公示
    expect(stationText({ station: "東京", stationM: 0 })).toBe("東京（すぐ近く）");
    expect(stationText({ station: "東京", stationM: 0 }, true)).toBe("東京");
    expect(stationText({})).toBe("");
  });

  it("タイルの読み込み：新しいタイルは sn、前の版のタイルは地価調査の距離の印（0・1）から区分を読む", () => {
    const at: [number, number] = [139.7, 35.7];
    // 新しいタイル（sn があり、距離は入っていない）
    expect(decodeLandPrice({ k: 0, no: "千代田5-2", sta: "東京", sn: "駅前広場接面", y: 2026 }, at)).toMatchObject({ stationNear: "駅前広場接面", stationM: undefined });
    expect(decodeLandPrice({ k: 1, no: "中央(都)5-1", sta: "馬喰町", sn: "近接", y: 2026 }, at)).toMatchObject({ stationNear: "近接", stationM: undefined });
    // 前の版のタイル：地価調査の 1 は「近接」、0 は「接面」。距離としては出さない
    expect(decodeLandPrice({ k: 1, no: "中央(都)5-1", sta: "馬喰町", sd: 1, y: 2026 }, at)).toMatchObject({ stationNear: "近接", stationM: undefined });
    expect(decodeLandPrice({ k: 1, no: "杉並(都)5-1", sta: "高円寺", sd: 0, y: 2026 }, at)).toMatchObject({ stationNear: "接面", stationM: undefined });
    expect(decodeLandPrice({ k: 1, no: "杉並(都)-3", sta: "荻窪", sd: 350, y: 2026 }, at)).toMatchObject({ stationNear: undefined, stationM: 350 });
    // 地価公示は、前の版のタイルでは区分が分からない（距離 0 のまま）。1m は本当の距離ではありえないが、印ではないので変えない
    expect(decodeLandPrice({ k: 0, no: "千代田5-2", sta: "東京", sd: 0, y: 2026 }, at)).toMatchObject({ stationNear: undefined, stationM: 0 });
    // 駅名の無い地点、知らない区分
    expect(decodeLandPrice({ k: 1, no: "檜原(都)-1", sd: 0, y: 2026 }, at).stationNear).toBeUndefined();
    expect(decodeLandPrice({ k: 0, no: "千代田-1", sta: "半蔵門", sn: "？", sd: 500, y: 2026 }, at)).toMatchObject({ stationNear: undefined, stationM: 500 });
  });

  it("地価調査の番号は、大阪府・京都府では「(府)」（前の版のタイルの「(県)」を読み替える）", () => {
    const at: [number, number] = [135.5, 34.7];
    expect(decodeLandPrice({ k: 1, no: "都島(県)-1", a: "大阪府 大阪市都島区友渕町1丁目4番", y: 2026 }, at).no).toBe("都島(府)-1");
    expect(decodeLandPrice({ k: 1, no: "上京(県)-3", a: "京都府 京都市上京区室町通", y: 2026 }, at).no).toBe("上京(府)-3");
    expect(decodeLandPrice({ k: 1, no: "岸和田(府)-8", a: "大阪府 岸和田市", y: 2026 }, at).no).toBe("岸和田(府)-8");
    // ほかの県・東京都はそのまま。地価公示には付かない
    expect(decodeLandPrice({ k: 1, no: "神戸中央(県)5-1", a: "兵庫県 神戸市中央区", y: 2026 }, at).no).toBe("神戸中央(県)5-1");
    expect(decodeLandPrice({ k: 1, no: "千代田(都)5-1", a: "東京都 千代田区", y: 2026 }, at).no).toBe("千代田(都)5-1");
    expect(decodeLandPrice({ k: 0, no: "大阪北5-1", a: "大阪府 大阪市北区", y: 2026 }, at).no).toBe("大阪北5-1");
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

  it("land-price-source.json のファイルがあり、関東1都6県の地点が入っている（中部9県・東北6県も入る）", async () => {
    expect(SRC.url).toMatch(/^\/data\/land-price-\d{4}-\d{4}\.pmtiles$/);
    expect(SRC.edition).toMatch(/^地価公示 令和\d+年（\d{4}年1月1日時点）・地価調査 令和\d+年（\d{4}年7月1日時点）$/);
    expect((await stat(PATH)).size).toBeGreaterThan(1_000_000);
    const points = SRC.points as Record<string, number>;
    for (const k of ["L01", "L02"]) for (const p of ["08", "09", "10", "11", "12", "13", "14"]) expect(points[`${k}-${p}`]).toBeGreaterThan(200);
    // 入っている都道府県は 関東1都6県・中部9県・東北6県・近畿2府5県（02〜30）だけで、どれも地点がある
    for (const [key, n] of Object.entries(points)) {
      expect(key, key).toMatch(/^L0[12]-(0[2-9]|1[0-9]|2[0-9]|30)$/);
      expect(n, key).toBeGreaterThan(0);
    }
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

  it("実物のタイル：大阪府・京都府の地価調査は「(府)」、駅の区分（近接・駅前広場接面）は距離ではなく区分で読める", async () => {
    const points = SRC.points as Record<string, number>;
    if (points["L02-27"]) {
      // 大阪市都島区都島中通（府の一覧表では「都島(府)-1」）、京都市上京区（「上京(府)-3」）
      const osaka = await nearestLandPrices(34.7040116, 135.5329549, src, { count: 10 });
      expect(osaka.filter((h) => h.kind === "調査").length).toBeGreaterThan(0);
      expect(osaka.some((h) => h.no === "都島(府)-1")).toBe(true);
      const kyoto = await nearestLandPrices(35.0208152, 135.757885, src, { count: 10 });
      expect(kyoto.some((h) => h.no === "上京(府)-3")).toBe(true);
      for (const h of [...osaka, ...kyoto]) expect(h.no).not.toContain("(県)");
    }
    // 千代田区大手町（地価調査「千代田(都)5-24」・国のデータの距離の欄は「1」＝駅近接）
    const ote = (await nearestLandPrices(35.6877664, 139.7643971, src, { count: 10 })).find((h) => h.no === "千代田(都)5-24");
    expect(ote?.station).toBe("大手町");
    expect(ote?.stationNear).toBe("近接");
    expect(ote?.stationM).toBeUndefined();
    expect(landPriceRows(ote!).find((r) => r.label === "最寄り駅")?.value).toBe("大手町（近接）");
    // 丸の内（地価公示「千代田5-2」・国のデータは「駅前広場接面」）。区分の入ったタイルなら区分で、前の版なら「（すぐ近く）」
    const maru = (await nearestLandPrices(35.6810911, 139.7639358, src, { count: 10 })).find((h) => h.no === "千代田5-2");
    expect(maru?.station).toBe("東京");
    expect(landPriceRows(maru!).find((r) => r.label === "最寄り駅")?.value).toMatch(/^東京（(駅前広場接面|すぐ近く)）$/);
    // 「約1m」「約0m」とは出ない
    for (const h of [ote!, maru!]) expect(stationText(h)).not.toMatch(/約[01]m/);
  });

  it("横浜市・千葉市・さいたま市でも見つかり、対応エリアの外（広島市）は空", async () => {
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
    // 静岡市（中部）は、中部込みで作り直したデータなら見つかり、関東だけのデータなら空
    const shizuoka = await nearestLandPrices(34.9756, 138.3828, src);
    if ((SRC.points as Record<string, number>)["L01-22"]) {
      expect(shizuoka.length).toBeGreaterThan(0);
      expect(shizuoka[0].address).toContain("静岡市");
    } else {
      expect(shizuoka).toEqual([]);
    }
    expect(await nearestLandPrices(34.3853, 132.4553, src)).toEqual([]); // 広島市（中国地方はまだ）
  });
});
