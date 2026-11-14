import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import KOZU_SOURCE from "./data/kozu-source.json";
import { lookup, registryStyle } from "./index";
import { loadParcelIndex } from "./parcel-index";
import { mergeParcelSources, withoutCities } from "./parcel-tiles";
import { sankoCovers } from "./sanko-data";
import { addressSub } from "./parcel-sub";
import {
  chibanLabel,
  cityMatches,
  estimatedMark,
  parcelMark,
  estimatedNote,
  estimatedSentence,
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

  it("入力に小字が書いてあれば、同じ地番でも小字の違う筆は当てない（鶴岡市羽黒町手向の字手向と字羽黒山）", async () => {
    const sub = addressSub("山形県鶴岡市羽黒町手向字手向", "羽黒町手向", "鶴岡市");
    // 代表点に近い方に、小字の違う同じ地番。入力の小字の筆は1枚先
    const src = fakeSource({
      [`${SX},${SY}`]: [{ kuiki: "鶴岡市_羽黒町手向__字羽黒山_", chiban: "147-1" }],
      [`${SX + 1},${SY}`]: [{ kuiki: "鶴岡市_羽黒町手向__字手向_", chiban: "147-1" }],
    });
    const r = await searchParcel({ city: "鶴岡市", town: "羽黒町手向", chiban: "147-1", sub }, START, src);
    expect(r.status === "found" && r.parcel.kuiki).toBe("鶴岡市_羽黒町手向__字手向_");
    expect(r.status === "found" && r.others).toBe(0);
    // 小字を書かなければ今までどおり（代表点に近い方を出し、ほかにもあることを数える）
    const plain = await searchParcel({ city: "鶴岡市", town: "羽黒町手向", chiban: "147-1" }, START, src, { batch: 20 });
    expect(plain.status === "found" && plain.parcel.kuiki).toBe("鶴岡市_羽黒町手向__字羽黒山_");
    expect(plain.status === "found" && plain.others).toBe(1);
  });

  it("入力の小字・地割の筆が地図データに無ければ「見つからない」にして、同じ地番のある別の区分を知らせる", async () => {
    const src = fakeSource({
      [`${SX},${SY}`]: [
        { kuiki: "花巻市_石鳥谷町好地_第９地割__", chiban: "24-2" },
        { kuiki: "花巻市_石鳥谷町好地_第９地割__", chiban: "24-5" },
        { kuiki: "花巻市_石鳥谷町好地_第１６地割__", chiban: "24-7" },
      ],
    });
    const sub = addressSub("岩手県花巻市石鳥谷町好地第16地割", "石鳥谷町好地", "花巻市");
    const r = await searchParcel({ city: "花巻市", town: "石鳥谷町好地", chiban: "24-2", sub }, START, src, { maxTiles: 12 });
    // 枝番ちがいの候補も、入力と同じ地割のものだけ（第9地割の 24-5 は出さない）
    expect(r).toEqual({ status: "not_found", similar: ["24-7"], elsewhere: ["第9地割"] });
  });

  // 2026-11-13 の地価公示・地価調査の所在での確かめ：丁目を書いた所在を、丁目の無い地番区域の同じ地番に当てた 29件はすべて別の土地だった
  it("入力に丁目があれば、丁目の無い地番区域・別の丁目の同じ地番は当てず、別の土地として知らせる（川崎市麻生区上麻生1丁目5番3：丁目の無い「上麻生」の 5-3 は 2.6km 先）", async () => {
    const src = fakeSource({
      [`${SX},${SY}`]: [
        { kuiki: "川崎市麻生区_上麻生___", chiban: "5-3" },
        { kuiki: "川崎市麻生区_上麻生_５丁目__", chiban: "5-3" },
        { kuiki: "川崎市麻生区_上麻生_５丁目__", chiban: "5-4" },
      ],
    });
    // 国土地理院の町が丁目まで合わなかったとき（町は「上麻生」）も、入力の丁目で絞る
    const r = await searchParcel({ city: "川崎市麻生区", town: "上麻生", chiban: "5-3", chome: 1 }, START, src, { maxTiles: 12 });
    expect(r).toEqual({ status: "not_found", similar: [], elsewhere: ["", "5丁目"] });
    // 丁目が合う地番区域なら当てる
    const five = await searchParcel({ city: "川崎市麻生区", town: "上麻生五丁目", chiban: "5-3", chome: 5 }, START, src, { maxTiles: 12 });
    expect(five.status === "found" && five.parcel.kuiki).toBe("川崎市麻生区_上麻生_５丁目__");
  });

  it("丁目を書かない入力で、同じ地番が丁目の無い地番区域と丁目のある地番区域にあれば、丁目の無い方を先にする（東金市田間字新町12番1）", async () => {
    const src = fakeSource({
      [`${SX},${SY}`]: [{ kuiki: "東金市_田間_３丁目__", chiban: "12-1" }],
      [`${SX + 2},${SY}`]: [{ kuiki: "東金市_田間___", chiban: "12-1" }],
    });
    const sub = addressSub("千葉県東金市田間字新町", "田間", "東金市");
    const r = await searchParcel({ city: "東金市", town: "田間", chiban: "12-1", sub, chome: null }, START, src, { batch: 20 });
    expect(r.status === "found" && [r.parcel.kuiki, r.others]).toEqual(["東金市_田間___", 1]);
  });

  it("入力の小字が町の地番区域にあれば、小字の書かれていない地番区域の同じ地番は当てない（富山市大町字当後割17番1）。町の地番区域に無い小字なら当てる", async () => {
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "富山市_大町___", chiban: "17-1" }] });
    const index: { k: Record<string, [number, number, number, number][]> } = {
      k: { "富山市_大町___": [[SX, SY, 1, 99]], "富山市_大町__字当後割_": [[SX + 3, SY, 1, 99]], "富山市_大町__字下田割_": [[SX + 4, SY, 1, 99]] },
    };
    const sub = addressSub("富山県富山市大町字当後割", "大町", "富山市");
    const r = await searchParcel({ city: "富山市", town: "大町", chiban: "17-1", sub }, START, src, { maxTiles: 12, index });
    expect(r.status === "not_found" && r.elsewhere).toEqual([""]);
    // 町の地番区域に無い小字（磐梯町大字磐梯の「字金上壇」のような所）は、小字の無い地番区域の筆を当てる
    const other = addressSub("富山県富山市大町字天神", "大町", "富山市");
    const ok = await searchParcel({ city: "富山市", town: "大町", chiban: "17-1", sub: other }, START, src, { maxTiles: 12, index });
    expect(ok.status === "found" && ok.parcel.kuiki).toBe("富山市_大町___");
  });

  it("町の地番区域が番号の区分（字・地割・号）で分かれていれば、入力の番号が書かれていない地番区域の同じ地番は当てない（越前市横市町10字四ノ縄1番4）", async () => {
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "越前市_横市町___", chiban: "1-4" }, { kuiki: "越前市_横市町_１字__", chiban: "1-4" }] });
    const index: { k: Record<string, [number, number, number, number][]> } = {
      k: { "越前市_横市町___": [[SX, SY, 1, 9]], "越前市_横市町_１字__": [[SX, SY, 1, 9]], "越前市_横市町_７字__": [[SX + 5, SY, 1, 9]] },
    };
    const sub = addressSub("福井県越前市横市町10字四ノ縄", "横市町", "越前市");
    const r = await searchParcel({ city: "越前市", town: "横市町", chiban: "1-4", sub }, START, src, { maxTiles: 12, index });
    expect(r).toEqual({ status: "not_found", similar: [], elsewhere: ["", "1字"] });
    // 町の地番区域が番号の区分で分かれていなければ、今までどおり（比べられないので当てる）
    const plain = await searchParcel({ city: "越前市", town: "横市町", chiban: "1-4", sub }, START, fakeSource({ [`${SX},${SY}`]: [{ kuiki: "越前市_横市町___", chiban: "1-4" }] }), { maxTiles: 12 });
    expect(plain.status === "found" && plain.parcel.kuiki).toBe("越前市_横市町___");
  });

  it("地番区域に小字が書かれていなければ、入力に小字があっても当てる（比べられない）", async () => {
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: K, chiban: "391-3" }] });
    const sub = addressSub("埼玉県熊谷市下奈良字東原", "下奈良", "熊谷市");
    const r = await searchParcel({ city: "熊谷市", town: "下奈良", chiban: "391-3", sub }, START, src);
    expect(r.status === "found" && r.parcel.kuiki).toBe(K);
  });

  // 平川市碇ヶ関：小字ごとに同じ地番があるが、法務省のデータの地番区域は大字だけ（小字が書かれていない）
  it("地番区域に小字が無く同じ地番が2か所あれば、入力に小字があっても決められない：その印と、もう一方の場所を返す", async () => {
    const H = "平川市_碇ヶ関___";
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: H, chiban: "69-2" }], [`${SX + 2},${SY}`]: [{ kuiki: H, chiban: "69-2" }] });
    const sub = addressSub("青森県平川市碇ヶ関鯨森", "碇ヶ関", "平川市");
    const r = await searchParcel({ city: "平川市", town: "碇ヶ関", chiban: "69-2", sub }, START, src, { batch: 20 });
    expect(r.status === "found" && [r.others, r.unverified, r.alts?.length]).toEqual([1, true, 1]);
    // もう一方の場所は、間に1枚おいた先のタイルの中
    const [w, , e] = tileBounds(SX + 2, SY);
    expect(r.status === "found" && r.alts![0].point.lng > w && r.alts![0].point.lng < e).toBe(true);
    // 小字を書かなければ「ほかに1件」だけ（決められない印は付けない）
    const plain = await searchParcel({ city: "平川市", town: "碇ヶ関", chiban: "69-2" }, START, src, { batch: 20 });
    expect(plain.status === "found" && [plain.others, plain.unverified, plain.alts?.length]).toEqual([1, undefined, 1]);
  });

  it("入力の小字を確かめられないときは、索引で番号の入っているタイルを最後まで開いて、同じ地番の筆をすべて数える", async () => {
    const H = "平川市_碇ヶ関___";
    // 索引では 10枚のタイルに 60〜80 番台がある。近い1枚目と、9枚目（最初の8枚の外）に同じ 69-2
    const tiles: [number, number, number, number][] = Array.from({ length: 10 }, (_, i) => [SX + i * 2, SY, 60, 80]);
    const data: Record<string, { kuiki: string; chiban: string }[]> = {};
    tiles.forEach(([x, y], i) => (data[`${x},${y}`] = [{ kuiki: H, chiban: i === 0 || i === 8 ? "69-2" : "70" }]));
    const index = { k: { [H]: tiles } };
    const sub = addressSub("青森県平川市碇ヶ関鯨森", "碇ヶ関", "平川市");
    const r = await searchParcel({ city: "平川市", town: "碇ヶ関", chiban: "69-2", sub }, START, fakeSource(data), { index });
    expect(r.status === "found" && [r.others, r.unverified]).toEqual([1, true]);
    // 小字を書かなければ、最初に見つかった所で止める（今までどおり）
    const plain = await searchParcel({ city: "平川市", town: "碇ヶ関", chiban: "69-2" }, START, fakeSource(data), { index });
    expect(plain.status === "found" && plain.others).toBe(0);
  });

  it("小字の合う地番区域の筆は、確かめられた筆（ほかに同じ地番があっても決められない印は付けない）", async () => {
    const src = fakeSource({
      [`${SX},${SY}`]: [{ kuiki: "鶴岡市_羽黒町手向__字手向_", chiban: "147-1" }],
      [`${SX + 2},${SY}`]: [{ kuiki: "鶴岡市_羽黒町手向___", chiban: "147-1" }],
    });
    const sub = addressSub("山形県鶴岡市羽黒町手向字手向", "羽黒町手向", "鶴岡市");
    const r = await searchParcel({ city: "鶴岡市", town: "羽黒町手向", chiban: "147-1", sub }, START, src, { batch: 20 });
    expect(r.status === "found" && [r.parcel.kuiki, r.others, r.unverified]).toEqual(["鶴岡市_羽黒町手向__字手向_", 1, undefined]);
  });

  it("小字の合うと確かめられた筆を、小字の書かれていない地番区域の近い筆より先に選ぶ", async () => {
    const src = fakeSource({
      [`${SX},${SY}`]: [{ kuiki: "鶴岡市_羽黒町手向___", chiban: "147-1" }],
      [`${SX + 2},${SY}`]: [{ kuiki: "鶴岡市_羽黒町手向__字手向_", chiban: "147-1" }],
    });
    const sub = addressSub("山形県鶴岡市羽黒町手向字手向", "羽黒町手向", "鶴岡市");
    const r = await searchParcel({ city: "鶴岡市", town: "羽黒町手向", chiban: "147-1", sub }, START, src, { batch: 20 });
    expect(r.status === "found" && [r.parcel.kuiki, r.others, r.unverified]).toEqual(["鶴岡市_羽黒町手向__字手向_", 1, undefined]);
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
    // 物件の上の帯の文も、確度の低い推定は測った結果どおり（「数mずれることがあります」のままだった）
    expect(estimatedSentence("high")).toBe("数mずれることがあります。");
    expect(estimatedSentence("low")).toBe("5m前後ずれることがあり、1割弱は30m以上離れた別の場所に置かれています。");
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

  it("丁目を書いた住所で、同じ地番が丁目の無い地番区域にしか無ければ、当てずに知らせ、丁目を外して探し直せるようにする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("AddressSearch")
            ? [{ geometry: { coordinates: [START.lng, START.lat] }, properties: { title: "神奈川県川崎市麻生区上麻生一丁目" } }]
            : { results: { muniCd: "14137", lv01Nm: "上麻生一丁目" } },
      })),
    );
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "川崎市麻生区_上麻生___", chiban: "5-3" }, { kuiki: "川崎市麻生区_上麻生_５丁目__", chiban: "5-4" }] });
    const r = await lookup("神奈川県川崎市麻生区上麻生1丁目5番3", { parcels: src, loadIndex: async () => null });
    expect(r.status === "ok" && r.parcel).toBe(undefined);
    expect(r.status === "ok" && r.parcelMiss?.elsewhere).toEqual([{ label: "丁目の付かない区域", query: "神奈川県川崎市麻生区上麻生5-3" }]);
  });

  it("見つけた筆が入れた町から遠い別の町にあれば（図面ごとの置き間違いのおそれ）、物件の場所としては出さず、そのことと場所を返す", async () => {
    const far = tileBounds(SX + 30, SY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const lat = Number(new URL(url, "https://x").searchParams.get("lat"));
        const lon = Number(new URL(url, "https://x").searchParams.get("lon"));
        return {
          ok: true,
          json: async () =>
            url.includes("AddressSearch")
              ? [{ geometry: { coordinates: [START.lng, START.lat] }, properties: { title: "福島県いわき市中央台高久一丁目" } }]
              : { results: { muniCd: "07204", lv01Nm: lon > far[0] && lat > 0 ? "平絹谷" : "中央台高久一丁目" } },
        };
      }),
    );
    const K = "いわき市_中央台高久_１丁目__";
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: K, chiban: "17-11" }], [`${SX + 30},${SY}`]: [{ kuiki: K, chiban: "17-12" }] });
    const index = { v: 1, k: { [K]: [[SX, SY, 17, 17], [SX + 30, SY, 17, 17]] } } as unknown as Awaited<ReturnType<typeof loadParcelIndex>>;
    const r = await lookup("福島県いわき市中央台高久1丁目17番12", { parcels: src, loadIndex: async () => index });
    expect(r.status === "ok" && r.parcel).toBe(undefined);
    expect(r.status === "ok" && r.parcelMiss?.away?.town).toBe("平絹谷");
    expect(r.status === "ok" && r.parcelMiss!.away!.km).toBeGreaterThan(3);
    // 同じ町なら（広い大字で代表点から遠いだけ）今までどおり出す
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("AddressSearch")
            ? [{ geometry: { coordinates: [START.lng, START.lat] }, properties: { title: "福島県いわき市中央台高久一丁目" } }]
            : { results: { muniCd: "07204", lv01Nm: "中央台高久一丁目" } },
      })),
    );
    const same = await lookup("福島県いわき市中央台高久1丁目17番12", { parcels: src, loadIndex: async () => index });
    expect(same.status === "ok" && same.parcel?.chiban).toBe("17-12");
  });

  it("地割の住所で、国土地理院の住所に地割が無くても、地番の地図で同じ地割の筆を見つけたら「町名が見つからない」とは言わない", async () => {
    // 花巻市石鳥谷町好地第16地割24番2：国土地理院は「石鳥谷町好地」までしか返さない。筆は「第16地割」の地番区域で見つかる
    const stub = (title: string) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => ({
          ok: true,
          json: async () =>
            url.includes("AddressSearch")
              ? [{ geometry: { coordinates: [START.lng, START.lat] }, properties: { title } }]
              : { results: { muniCd: "03205", lv01Nm: "石鳥谷町好地" } },
        })),
      );
    stub("岩手県花巻市石鳥谷町好地");
    const src = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "花巻市_石鳥谷町好地_第１６地割__", chiban: "24-2" }, { kuiki: "花巻市_石鳥谷町好地_第９地割__", chiban: "24-2" }] });
    const r = await lookup("岩手県花巻市石鳥谷町好地第16地割24番2", { parcels: src, loadIndex: async () => null });
    expect(r.status === "ok" && r.parcel?.kuiki).toBe("花巻市_石鳥谷町好地_第１６地割__");
    expect(r.status === "ok" && r.miss).toBeUndefined();
    // 地番区域に地割が書かれていない（区分を確かめられない）筆しか無ければ、今までどおり知らせる
    const plain = fakeSource({ [`${SX},${SY}`]: [{ kuiki: "花巻市_石鳥谷町好地___", chiban: "24-2" }] });
    const r2 = await lookup("岩手県花巻市石鳥谷町好地第16地割24番2", { parcels: plain, loadIndex: async () => null });
    expect(r2.status === "ok" && r2.parcel?.chiban).toBe("24-2");
    expect(r2.status === "ok" && r2.miss).toEqual({ typed: "石鳥谷町好地第16地割", found: "石鳥谷町好地", kind: "town" });
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

  /** 聞いた住所ごとに違う答えを返す住所検索（answers の鍵を含む問い合わせに、その住所と位置を返す。長い鍵を先に見る） */
  const stubGsiBy = (answers: Record<string, { title: string; lat: number; lng: number } | null>, muniCd: string, town: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => {
          if (!url.includes("AddressSearch")) return { results: { muniCd, lv01Nm: town } };
          const q = decodeURIComponent(url.split("q=")[1]);
          const key = Object.keys(answers)
            .sort((a, b) => b.length - a.length)
            .find((k) => q.includes(k));
          const a = key ? answers[key] : null;
          return a ? [{ geometry: { coordinates: [a.lng, a.lat] }, properties: { title: a.title } }] : [];
        },
      })),
    );

  // 2026-11-13 の総当たり：国土地理院が小字の「三丁目」を番地と読み「松戸3番地」（1.5km 先）を返し、それを一致として出していた
  it("見つかった番地が入れた地番と食い違えば、小字を外して聞き直し、番地の合う所を出す（松戸字三丁目1791番1）", async () => {
    stubGsiBy(
      {
        字三丁目: { title: "千葉県松戸市松戸３番地", lat: START.lat + 0.01, lng: START.lng + 0.01 },
        "千葉県松戸市松戸1791番1": { title: "千葉県松戸市松戸１７９１番地", lat: START.lat, lng: START.lng },
      },
      "12207",
      "松戸",
    );
    const r = await lookup("千葉県松戸市松戸字三丁目1791番1", { parcels: fakeSource({}), loadIndex: async () => null });
    expect(r.status === "ok" && [r.matchedAddress, r.lat, r.lng, r.approximate]).toEqual(["千葉県松戸市松戸１７９１番地", START.lat, START.lng, false]);
  });

  it("聞き直しても番地の合う所が無ければ、番地は当てずに町の代表点にする（別の番地を出さない）", async () => {
    stubGsiBy(
      {
        字八反田: { title: "静岡県藤枝市岡部町内谷８番地", lat: START.lat + 0.01, lng: START.lng + 0.01 },
        "静岡県藤枝市岡部町内谷623番1": null,
        "静岡県藤枝市岡部町内谷": { title: "静岡県藤枝市岡部町内谷", lat: START.lat, lng: START.lng },
      },
      "22214",
      "岡部町内谷",
    );
    const r = await lookup("静岡県藤枝市岡部町内谷字八反田623番1", { parcels: fakeSource({}), loadIndex: async () => null });
    expect(r.status === "ok" && [r.matchedAddress, r.lat, r.lng, r.approximate]).toEqual(["静岡県藤枝市岡部町内谷", START.lat, START.lng, true]);
    expect(r.status === "ok" && r.parcelMiss?.reason).toBe("no_map");
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
  it("置き場所は空（まだ作っていない）か R2 の PMTiles。データのある市区町村は、対応している都府県（02〜30）の5桁のコード", () => {
    expect(KOZU_SOURCE.url === "" || /^https:\/\/.+\.pmtiles$/.test(KOZU_SOURCE.url)).toBe(true);
    for (const c of KOZU_SOURCE.codes) expect(c).toMatch(/^(0[2-9]|[12]\d|30)\d{3}$/);
    expect(new Set(KOZU_SOURCE.codes).size).toBe(KOZU_SOURCE.codes.length);
    if (KOZU_SOURCE.url) {
      expect(KOZU_SOURCE.edition).toMatch(/^\d{4}年\d{1,2}月公開版$/);
      // 1都3県の公図の地域の多く（置けた筆のある市区町村）
      expect(KOZU_SOURCE.codes.length).toBeGreaterThan(50);
    }
  });

  // 関東のほかの地方を足すと、地方（まとまり）ごとのタイルを1つにまとめて置く（scripts/kozu-tiles/sets.py）。sets はその内訳
  it("まとまりごとの内訳（sets）があれば、ファイル名は R2 の kozu/ の下の PMTiles で、市区町村は全体の一覧と同じ", () => {
    const sets = (KOZU_SOURCE as { sets?: Record<string, { file: string; codes: string[]; edition: string; high_only?: boolean }> }).sets;
    if (!sets) return;
    const all: string[] = [];
    for (const [name, s] of Object.entries(sets)) {
      expect(name).toMatch(/^[a-z][a-z0-9]{1,15}$/);
      expect(s.file).toMatch(/^[a-z0-9-]+\.pmtiles$/);
      expect(s.edition).toMatch(/^\d{4}年\d{1,2}月公開版$/);
      // 関東の外のまとまりは、確度の高い推定だけ（確度の低い推定は、大阪府で測って3割が別の場所だった。docs/features.md の 126）
      if (name !== "kanto") expect(s.high_only).toBe(true);
      all.push(...s.codes);
    }
    expect(all.sort()).toEqual([...KOZU_SOURCE.codes].sort());
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
    sheets: { code: string; sheet: string; town: string; parcels: number; reason: string; oaza?: string; chome?: string; chiban?: string[]; shift?: { kind: "T1" | "T2" | "数字の誤り" | "照合" | "縮尺"; east: number; north: number; scale?: { k: number; rotate: number; origin: [number, number] } } }[];
  };
  it("測地系の取り違えで動かす地図（shift）は、地図ごと・向きと量が日本測地系と世界測地系の差（西または東へ約245〜300m・北または南へ、関東・中部・近畿で約325〜370m、東北の X 系で約300〜315m）", () => {
    for (const s of data.sheets.filter((x) => x.shift && (x.shift.kind === "T1" || x.shift.kind === "T2"))) {
      const { kind, east, north } = s.shift!;
      expect(["T1", "T2"]).toContain(kind);
      // T1：日本測地系の数字→世界測地系（北西へ動かす。今は南東へずれている）。T2：その逆（南東へ動かす）。
      // 差は場所で変わる（国土地理院の TKY2JGD.par：福井県の西で東西 約256m、新潟県の北で南北 約326m、銚子で東西 約301m、館山で南北 約371m。
      // 兵庫県（平面直角座標の V 系）は東西 約245〜248m。東北（青森〜山形の X 系）は北へ短く、花巻市で南北 約310m）
      expect(east).toBeGreaterThanOrEqual(kind === "T1" ? -320 : 240);
      expect(east).toBeLessThanOrEqual(kind === "T1" ? -240 : 320);
      expect(north).toBeGreaterThanOrEqual(kind === "T1" ? 290 : -400);
      expect(north).toBeLessThanOrEqual(kind === "T1" ? 400 : -290);
      // 理由の向き（「地図全体が南東へ…ずれている」）が動かす向きの逆になっている
      expect(s.reason).not.toMatch(kind === "T1" ? /地図全体が北西へ/ : /地図全体が南東へ/);
      expect(s.reason).not.toMatch(kind === "T1" ? /北西へ約\d+mずれている/ : /南東へ約\d+mずれている/);
      if (s.chiban) {
        // 地図の一部だけがずれていた所（生駒市北新町の地図。20筆だけ）は、大字と地番の一覧で絞って動かし、残りは動かさないと理由に書く
        expect(s.oaza).toBeDefined();
        expect(s.reason).toMatch(/残りの.*動かさない/);
      } else {
        expect(s.oaza).toBeUndefined();
        expect(s.chome).toBeUndefined();
      }
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
      return p <= 6 ? "X" : p <= 14 ? "IX" : [15, 19, 20, 22].includes(p) ? "VIII" : [18, 24, 25, 26, 27, 29, 30].includes(p) ? "VI" : p === 28 ? "V" : "VII";
    };
    const groups = new Map<string, [number, number][]>();
    // 計算した量に残りを足した地図は、ここでは比べない（会津若松市北会津町水季の里の1枚だけ。計算した量から約9m。理由に書いてある）
    const adjusted = (x: { code: string; sheet: string }) => x.code === "07202" && x.sheet === "12391_hosei_20121019092001";
    for (const s of data.sheets.filter((x) => x.shift && (x.shift.kind === "T1" || x.shift.kind === "T2") && !adjusted(x))) {
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
  it("東北の全部の図面の点検で足した8枚（2026-11-14）は、写真・地図で確かめた根拠が理由にあり、戸沢村だけ逆向き（T1）", () => {
    // 道路縁の少ない所（区画整理の新しい街区・田・山林）は、道路縁で比べる機械の判定が保留になる。
    // 保留の図面は、タイルを作るのと同じ動かし方で国土地理院の航空写真・地図に重ねて確かめたものだけを足した（docs/features.md の 119）
    const want: [string, string, "T1" | "T2", number][] = [
      ["05361", "10384_hosei_20121106102829", "T2", 287],
      ["07461", "10028_hosei_20121029101450", "T2", 40],
      ["06207", "11365_hosei_20121114121715", "T2", 877],
      ["07445", "12354_hosei_20121019090152", "T2", 425],
      ["05201", "11042_hosei_20121108090642", "T2", 439],
      ["07402", "11529_hosei_20121015133545", "T2", 97],
      ["07402", "11528_hosei_20121015133528", "T2", 26],
      ["06367", "10816_hosei_20121122125744", "T1", 155],
    ];
    for (const [code, sheet, kind, parcels] of want) {
      const s = data.sheets.find((x) => x.code === code && x.sheet === sheet);
      expect(s, `${code} ${sheet}`).toBeDefined();
      expect(s!.shift?.kind).toBe(kind);
      expect(s!.parcels).toBe(parcels);
      expect(s!.reason).toMatch(/国土地理院の(地図|航空写真)/);
      expect(s!.reason).toMatch(/東北の全部の図面の点検/);
    }
    expect(want.reduce((a, w) => a + w[3], 0)).toBe(2346);
    // 同じ図面の決まりが2つ無い（2回動かさない）
    const keys = data.sheets.filter((x) => x.shift && !x.chiban).map((x) => `${x.code}|${x.sheet}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("大仙市の11枚（2026-11-14）は、同じ日に変換された図面で、10枚は南東へ・角間川町の1枚だけ北西へ動かす", () => {
    // 大仙市では、2012-11-27 に変換された図面（地図名 10688〜10714_hosei_20121127…）のうち 11枚が測地系の取り違えでずれていた。
    // 角間川町の 2,227筆だけは逆向き（日本測地系の数字がそのまま入っている）。航空写真で、道の両側の縁に筆の境が沿うことを確かめた
    const xs = data.sheets.filter((s) => s.code === "05212");
    expect(xs).toHaveLength(11);
    expect(xs.reduce((a, s) => a + s.parcels, 0)).toBe(5753);
    for (const s of xs) {
      expect(s.sheet).toMatch(/^10(6|7)\d\d_hosei_20121127\d{6}$/);
      expect(s.shift?.kind).toBe(s.sheet.startsWith("10695_") ? "T1" : "T2");
      expect(s.reason).toMatch(/国土地理院の航空写真/);
      expect(s.reason).toMatch(/11枚を一緒に動かしたときの重なり/);
    }
    expect(new Set(xs.map((s) => s.sheet)).size).toBe(11);
  });
  it("座標の数字の誤り（kind「数字の誤り」）で動かす地図は、平面直角座標の 1,000m の倍数だけずれていて、理由に確かめた根拠がある", () => {
    // いわき市中央台高久１丁目の図面（62筆）は、平面直角座標の北向きの数字が 1万m 大きく、約10km 北の平絹谷の上にあった。
    // 緯度経度で動かす量は、座標の北と真北の向きの差・縮尺のため、1万m ちょうどにはならない（東へ -114.8m・北へ -10,029.9m）
    const xs = data.sheets.filter((s) => s.shift?.kind === "数字の誤り");
    expect(xs.map((s) => [s.code, s.sheet])).toContainEqual(["07204", "10548_hosei_20121015090204"]);
    for (const s of xs) {
      const d = Math.hypot(s.shift!.east, s.shift!.north);
      const k = Math.round(d / 1000);
      expect(k).toBeGreaterThan(0);
      expect(Math.abs(d - k * 1000)).toBeLessThan(k * 10 + 5);
      expect(s.reason).toMatch(/平面直角座標/);
      expect(s.reason).toMatch(/地価公示|地価調査/);
      expect(s.chiban).toBeUndefined();
      expect(s.sheet).not.toBe("*");
    }
  });
  it("ほかの公的なデータとの照合で量を求めて動かす地図（kind「照合」）は、道路縁と、市の地番図か地価の地点の根拠が理由にある", () => {
    // 越谷市伊原２丁目の図面（569筆）は、市の地番図データの同じ地番 558筆とそろって 約390m ずれていた（測地系の取り違えとも数字の誤りとも量が合わない）。
    // 富士市増川新町の図面は、測地系の取り違えに近い向きだが、計算した量では道路縁・地価の地点から約32m ずれる（地価の地点から逆算した量と道路縁の量が 1.3m で合う）。
    // 津市あのつ台１丁目の図面は、2026-11-14 に計算どおりの量（T1）に直した（道路縁で量を探すと、約25m 離れた所に同じくらい合う所が2つあり、取り違えていた）
    const xs = data.sheets.filter((s) => s.shift?.kind === "照合");
    expect(xs.map((s) => [s.code, s.sheet])).toContainEqual(["11222", "10236_hosei_20121129092003"]);
    for (const s of xs) {
      expect(Math.hypot(s.shift!.east, s.shift!.north)).toBeLessThan(2000);
      // 道路縁のほかに、市の地番図との照合か地価の地点の、別の根拠がある（地価の地点が無い所は、市の地番図の同じ地番の筆とそろってずれていること）
      expect(s.reason).toMatch(/道路縁/);
      expect(s.reason).toMatch(/地番図|地番参考図|地籍図|地価公示|地価調査/);
      if (!/地価公示|地価調査/.test(s.reason.replace(/地価の地点は無い/, ""))) expect(s.reason).toMatch(/(地番図|地番参考図|地籍図).*同じ地番の筆/);
      if (s.chiban) {
        // 図面の図郭（区切り）ごとに量が違う所（横浜市港南区日野８・９丁目の図面）だけ、大字・丁目・地番の一覧で絞って、まとまりごとに動かす
        expect(s.oaza).toBeDefined();
        expect(s.chome).toBeDefined();
        expect(s.reason).toMatch(/図郭/);
        expect(s.reason).toMatch(/まとまり/);
      }
      expect(s.sheet).not.toBe("*");
    }
  });
  it("横浜市港南区日野８・９丁目の図面（980筆）は、図郭ごとの5つのまとまりを、それぞれ道路縁で求めた量で動かす（量の差は 40m 未満・筆は1回ずつ）", () => {
    // 図面全体は東へ約640m・南へ約100m ずれていた（地価調査「日野9丁目6071番29」の筆が国の地点から 625m 離れていた）。
    // 1つの量で動かすと、まとまりによって道路縁から最大 36m ずれ、図郭をまたいで切れた筆の切れ端が 13m 離れる
    const hino = data.sheets.filter((s) => s.code === "14111" && s.sheet === "10160_hosei_20121129095439");
    expect(hino).toHaveLength(7);
    expect(hino.reduce((a, s) => a + s.parcels, 0)).toBe(980);
    const seen = new Set<string>();
    for (const s of hino) {
      expect(s.shift?.kind).toBe("照合");
      expect(s.oaza).toBe("日野");
      expect(["８丁目", "９丁目"]).toContain(s.chome);
      for (const l of s.chiban!) {
        const key = `${s.chome}|${l}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      // 西へ約620〜665m・北へ約90〜115m
      expect(s.shift!.east).toBeGreaterThan(-665);
      expect(s.shift!.east).toBeLessThan(-620);
      expect(s.shift!.north).toBeGreaterThan(90);
      expect(s.shift!.north).toBeLessThan(115);
    }
    for (const a of hino) for (const b of hino) expect(Math.hypot(a.shift!.east - b.shift!.east, a.shift!.north - b.shift!.north)).toBeLessThan(40);
    // 地価調査の地点の筆（6071-29）があるまとまりは、その量で地点が筆の中に入る
    const withLp = hino.filter((s) => s.chiban!.includes("6071-29"));
    expect(withLp).toHaveLength(1);
    expect(withLp[0].reason).toMatch(/地価調査の地点「日野9丁目6071番29」は、この量で動かすとその筆（150㎡）の中に入る/);
  });
  it("縮尺を間違えて入った地図（kind「縮尺」）は、倍率・回転・中心があり、理由に登記の地積・道路縁・地価の地点の根拠がある", () => {
    // 神戸市北区若葉台の図面（1,081筆）は、約2.5分の1の大きさで入っていた（筆の面積が登記の地積の約6分の1）。
    // 本体（991筆）は倍率・回転・平行移動で直し、本体から離れた2つのかたまり（90筆）は位置が決められないので外す
    const xs = data.sheets.filter((s) => s.shift?.kind === "縮尺");
    expect(xs.length).toBeGreaterThan(0);
    for (const s of xs) {
      const sc = s.shift!.scale!;
      expect(sc).toBeDefined();
      expect(sc.k).toBeGreaterThan(0.2);
      expect(sc.k).toBeLessThan(5);
      expect(Math.abs(sc.rotate)).toBeLessThan(10);
      // 中心は日本の中（経度・緯度）
      expect(sc.origin[0]).toBeGreaterThan(122);
      expect(sc.origin[0]).toBeLessThan(154);
      expect(sc.origin[1]).toBeGreaterThan(20);
      expect(sc.origin[1]).toBeLessThan(46);
      expect(s.reason).toMatch(/縮尺/);
      expect(s.reason).toMatch(/地積/);
      expect(s.reason).toMatch(/道路縁/);
      expect(s.reason).toMatch(/地価公示|地価調査/);
      expect(s.sheet).not.toBe("*");
    }
    // 縮尺の決まりのほかの種類は、倍率を持たない（平行移動だけ）
    for (const s of data.sheets.filter((x) => x.shift && x.shift.kind !== "縮尺")) expect(s.shift!.scale).toBeUndefined();
  });
  it("神戸市北区若葉台の図面：本体 991筆は同じ倍率（約2.54倍）で直し、離れた 90筆は外す。筆は1回ずつ", () => {
    const w = data.sheets.filter((s) => s.code === "28109" && s.sheet === "若葉台１～４丁目");
    const moved = w.filter((s) => s.shift);
    const dropped = w.filter((s) => !s.shift);
    expect(moved.reduce((a, s) => a + s.parcels, 0)).toBe(991);
    expect(dropped.reduce((a, s) => a + s.parcels, 0)).toBe(90);
    const k = moved[0].shift!.scale!.k;
    expect(k).toBeGreaterThan(2.4);
    expect(k).toBeLessThan(2.7);
    for (const s of moved) {
      expect(s.shift!.kind).toBe("縮尺");
      expect(s.shift).toEqual(moved[0].shift);
    }
    for (const s of dropped) expect(s.reason).toMatch(/外す/);
    const seen = new Set<string>();
    for (const s of w)
      for (const l of s.chiban!) {
        const key = `${s.oaza}|${s.chome ?? ""}|${l}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    // 地価の地点の筆は本体にあり、理由に地点がその筆の中に入ることを書く
    expect(moved.find((s) => s.chome === "２丁目")!.chiban).toContain("3-608");
    expect(moved.find((s) => s.chome === "４丁目")!.chiban).toContain("22-56");
    expect(moved[0].reason).toMatch(/若葉台2丁目3番608.*中に入る/);
  });
  it("近畿：三田市のニュータウンの4枚は、計算どおりの量で動かす（2026-11-12 に足した「西へ3.0m・南へ3.3m」は、確かめの道具の見かけの差だったので外した）", () => {
    const kinki = data.sheets.filter((s) => /^(2[4-9]|30)/.test(s.code) && s.shift);
    // 11-12 の14枚と、11-13 に地価の地点で見つけた東員町（2枚）・木津川市（1枚）・生駒市北新町（1枚の一部・大字ごとに2つ）・松阪市飯南町（1枚）・津市あのつ台１丁目（1枚）・
    // 神戸市北区若葉台（1枚の本体を縮尺ごと直す。大字・丁目ごとに6つ）、11-14 に拾い直した津市（みのりヶ丘・あのつ台三丁目・五丁目）と松阪市（清生町・垣鼻町・田原町）の4枚
    expect(kinki).toHaveLength(31);
    const sanda = kinki.filter((s) => s.code === "28219");
    expect(sanda.map((s) => s.sheet).sort()).toEqual(["あかしあ台１～５丁目", "すずかけ台１～４丁目", "ゆりのき台１～６丁目（修正後）", "北摂三田ニュータウン南地区"].sort());
    expect(sanda.reduce((a, s) => a + s.parcels, 0)).toBe(11320);
    for (const s of sanda) {
      // 計算した量（東へ約 -245.0m・北へ約 346.4m）そのまま。動かす量は真東・真北の m で、タイルを作る仕組み（build_pref.shifted_geometry）もそのとおりに動かす。
      // 確かめの道具は、その量を図面の座標（平面直角座標）の東・北として当てて測っていたので、三田市（2つの向きの差が 0.49度）では約3.7m の見かけの差が出た
      expect(s.shift!.kind).toBe("T1");
      expect(s.shift!.east).toBeGreaterThanOrEqual(-245.15);
      expect(s.shift!.east).toBeLessThanOrEqual(-244.95);
      expect(s.shift!.north).toBeGreaterThanOrEqual(346.25);
      expect(s.shift!.north).toBeLessThanOrEqual(346.45);
      expect(s.reason).toMatch(/確かめの道具の見かけの差/);
      expect(s.reason).toMatch(/タイルを作る仕組みと同じ動かし方で測り直す/);
      expect(s.reason).toMatch(/一番合う所は動かした位置そのもの/);
    }
  });
  it("2026-11-14 の仕上げ：東北の4枚・花巻市の4枚・三重県の4枚を足し、津市あのつ台１丁目は計算どおりの量に直す", () => {
    const want: [string, string, "T1" | "T2", number][] = [
      ["04207", "10211_hosei_20121019113909", "T2", 577],
      ["07202", "12391_hosei_20121019092001", "T2", 174],
      ["07205", "10347_hosei_20121031084806", "T2", 582],
      ["03206", "20979_hosei_20121116105005", "T2", 220],
      ["03205", "10570_hosei_20121114120327", "T2", 1645],
      ["03205", "10335_hosei_20121112122908", "T2", 670],
      ["03205", "10337_hosei_20121112123144", "T2", 379],
      ["03205", "10338_hosei_20121112123201", "T2", 657],
      ["24201", "H30190024201005", "T1", 47],
      ["24201", "津市あのつ台三丁目", "T1", 15],
      ["24201", "津市あのつ台五丁目地区", "T1", 26],
      ["24204", "清生町・垣鼻町・田原町地区", "T1", 208],
    ];
    for (const [code, sheet, kind, parcels] of want) {
      const s = data.sheets.find((x) => x.code === code && x.sheet === sheet);
      expect(s, `${code} ${sheet}`).toBeDefined();
      expect(s!.shift?.kind).toBe(kind);
      expect(s!.parcels).toBe(parcels);
      // 写真・地図か、隣の地図との位置合わせの、道路縁のほかの根拠が理由にある
      expect(s!.reason).toMatch(/国土地理院の航空写真/);
      expect(s!.reason).toMatch(/重な/);
      expect(s!.chiban).toBeUndefined();
    }
    expect(want.reduce((a, w) => a + w[3], 0)).toBe(5200);
    // 花巻市大迫町亀ケ森の4枚は、4枚いっしょに動かす（1枚だけ動かすと、動かしていない相手と重なる）
    for (const s of data.sheets.filter((x) => x.code === "03205" && /^(10570|10335|10337|10338)_/.test(x.sheet))) expect(s.reason).toMatch(/4枚を一緒に動か/);
    // 会津若松市北会津町水季の里だけ、計算した量（東へ 291.8m・北へ -354.6m）に残り（東へ 8m・北へ 4m）を足している。道路縁・隣の地図・重なりの3つがそろう所
    const aizu = data.sheets.find((x) => x.code === "07202" && x.sheet === "12391_hosei_20121019092001")!;
    expect(aizu.shift).toEqual({ kind: "T2", east: 299.8, north: -350.6 });
    expect(aizu.reason).toMatch(/計算した量は東へ 291\.8m・北へ -354\.6m/);
    expect(aizu.reason).toMatch(/道路縁と、隣の地図の筆の境と、ほかの地図との重なりの3つがそろって/);
    expect(aizu.reason).toMatch(/測り方の見かけの差ではない/);
    // 津市あのつ台１丁目：照合で決めた量（東へ -241.5m・北へ 331.9m）は約25m ずれていた。同じ団地の三丁目・五丁目と同じ、計算どおりの量に
    const ano = data.sheets.filter((x) => x.code === "24201" && /あのつ台/.test(x.sheet));
    expect(ano.map((x) => x.sheet).sort()).toEqual(["津市あのつ台１丁目", "津市あのつ台三丁目", "津市あのつ台五丁目地区"].sort());
    for (const s of ano) {
      expect(s.shift!.kind).toBe("T1");
      expect(Math.abs(s.shift!.east - -260.4)).toBeLessThan(0.11);
      expect(Math.abs(s.shift!.north - 348.55)).toBeLessThan(0.11);
    }
    expect(ano.find((x) => x.sheet === "津市あのつ台１丁目")!.reason).toMatch(/同じくらい合う所が2つあり/);
    // 測地系の取り違え（T1・T2）で足した量があるのは、この1枚だけ（三田市の4枚に足していた量は外した）
    const added = data.sheets.filter((x) => (x.shift?.kind === "T1" || x.shift?.kind === "T2") && /その量を足して|同じ量（西へ/.test(x.reason));
    expect(added.map((x) => `${x.code}|${x.sheet}`)).toEqual(["07202|12391_hosei_20121019092001"]);
  });
  it("地価の地点で見つけたずれ（2026-11-13）：渋川市の地図 10109 は地図ごと動かす決まり1つだけ、生駒市北新町の地図はずれた20筆だけを動かす", () => {
    // 渋川市：前は「ほかの地図の筆と重なる部分だけ外す」決まり3つ（531筆）だった。重なりは地図全体のずれのせいで、動かすと重なりは 0.2%
    const shibukawa = data.sheets.filter((s) => s.code === "10208" && s.sheet === "10109_hosei_20121211082249");
    expect(shibukawa).toHaveLength(1);
    expect(shibukawa[0].shift?.kind).toBe("T2");
    expect(shibukawa[0].chiban).toBeUndefined();
    expect(shibukawa[0].reason).toMatch(/渋川字梅ノ木2062番37/);
    // 生駒市北新町：同じ地図の 2000〜2007番などは今の位置で正しい（動かすと東旭ケ丘の筆とほぼ全部重なる）ので動かさない
    const ikoma = data.sheets.filter((s) => s.code === "29209" && s.sheet === "XF2kitasinmati17A01");
    expect(ikoma.map((s) => [s.oaza, s.chiban?.length])).toEqual([
      ["北新町", 14],
      ["谷田町", 6],
    ]);
    for (const s of ikoma) {
      expect(s.shift?.kind).toBe("T2");
      expect(s.chiban).not.toContain("2001");
      expect(s.chiban!.every((l) => /^(20(1[1-9]|2[0-2])(-\d)?|161[0-5])$/.test(l))).toBe(true);
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
