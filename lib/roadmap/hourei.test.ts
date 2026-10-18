import { open } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/hourei-source.json";
import { houreiAt, houreiAuthority, houreiCaution, houreiCautionAll, houreiDetail, houreiGroups, houreiLine, houreiName, houreiNote, houreiNotice, type HoureiArea } from "./hourei";
import { houreiTileSource } from "./hourei-tiles";
import { tileOf, type LngLat } from "./parcel";

const square = (lat: number, lng: number, d: number): LngLat[][] => [
  [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ],
];

describe("土砂災害などの法令の区域", () => {
  const LAT = 35.32;
  const LNG = 139.62;
  const [x, y] = tileOf(LAT, LNG, 14);
  const area = (a: Partial<HoureiArea>): HoureiArea => ({ kind: "急傾斜地崩壊危険区域", pref: "14", polygons: [square(LAT, LNG, 0.001)], ...a });
  const fake = (areas: HoureiArea[]) => ({ tile: async (tx: number, ty: number) => (tx === x && ty === y ? areas : null) });

  it("地点を含む区域を、急傾斜地 → 地すべり → 砂防 → 災害危険区域の順に。同じ区域が分かれていても1つ", async () => {
    const h = await houreiAt(
      LAT,
      LNG,
      "14201",
      fake([
        area({ kind: "災害危険区域", name: "鷹取町1丁目A", byCity: true, cityName: "横須賀市", reason: "急傾斜地崩壊", rule: "横須賀市建築基準条例", notice: "第154号(急傾斜)", since: "2013-03-19" }),
        area({ name: "鷹取町1丁目", notice: "第100号" }),
        area({ name: "鷹取町1丁目", notice: "第100号" }),
        area({ kind: "砂防指定地", name: "遠くの川", polygons: [square(LAT + 0.01, LNG, 0.001)] }),
      ]),
    );
    expect(h?.hits.map((a) => a.kind)).toEqual(["急傾斜地崩壊危険区域", "災害危険区域"]);
    expect(houreiAuthority(h!.hits[1])).toBe("横須賀市");
    expect(houreiDetail(h!.hits[1])).toBe("鷹取町1丁目A（第154号・2013年3月19日）（急傾斜地崩壊・横須賀市建築基準条例）");
    expect(houreiLine(h!)).toBe("急傾斜地崩壊危険区域・災害危険区域（国のデータ・参考）");
  });

  it("区域の外・関東の外・国のデータに無い種類", async () => {
    const out = await houreiAt(LAT, LNG, "14201", fake([]));
    expect(out?.hits).toEqual([]);
    expect(houreiLine(out!)).toBe("砂防指定地・地すべり防止区域・急傾斜地崩壊危険区域・災害危険区域の外（国のデータ・参考）");
    expect(await houreiAt(35, 138, "19201", fake([]))).toBeNull();
    // 群馬県の砂防指定地、埼玉県の災害危険区域は国のデータに無い
    expect((await houreiAt(LAT, LNG, "10202", fake([])))?.missing).toEqual(["砂防指定地"]);
    expect((await houreiAt(LAT, LNG, "11201", fake([])))?.missing).toEqual(["災害危険区域"]);
  });

  it("都県が求める特記事項と、確かめる先", () => {
    expect(houreiNote("急傾斜地崩壊危険区域", "14")).toContain("神奈川県の各土木事務所等で確認");
    expect(houreiNote("地すべり防止区域", "13")).toContain("平成29年5月19日現在");
    expect(houreiNote("砂防指定地", "14")).toBeUndefined();
    expect(houreiCaution({ kind: "急傾斜地崩壊危険区域", pref: "14" })).toBe("国のデータ（2021年度）の概略の区域。重要事項説明には神奈川県（砂防の担当）の資料で確認");
    expect(houreiCaution({ kind: "砂防指定地", pref: "13" })).toBe("国のデータ（平成30年3月末時点）の概略の区域。重要事項説明には東京都（砂防の担当）の資料で確認");
    // 地すべり防止区域は所管で担当が分かれる
    expect(houreiCaution({ kind: "地すべり防止区域", pref: "10", office: "林野庁" })).toContain("群馬県（治山の担当）");
    expect(houreiCaution({ kind: "地すべり防止区域", pref: "10", office: "農林水産省（農村振興局）" })).toContain("群馬県（農地の担当）");
  });

  it("データの書き方のばらつきをそろえる（告示番号・告示日・名前・またがる市）", () => {
    expect(houreiNotice({ notice: "417", since: "1981-09-21" })).toBe("第417号・1981年9月21日");
    expect(houreiNotice({ notice: "733号" })).toBe("第733号");
    expect(houreiNotice({ notice: "千第903号(急傾斜)", since: "1985-03-30" })).toBe("千第903号・1985年3月30日");
    expect(houreiNotice({ notice: "(急傾斜)" })).toBe("");
    expect(houreiNotice({ notice: "建設省告示82号,建設省告示1867号,国土交通省告示0285号", since: "昭和49年3月30日,昭和57年09月17日,昭和62年01月26日" })).toBe(
      "建設省告示82号・昭和49年3月30日／建設省告示1867号・昭和57年9月17日／国土交通省告示285号・昭和62年1月26日",
    );
    expect(houreiNotice({ notice: "建1732,建805", since: "平成1年1月21日" })).toBe("建1732、建805・平成1年1月21日");
    expect(houreiNotice({ notice: "内務省告示24号,内務省告示24号,内務省告示447号", since: "昭和8年1月30日,昭和8年1月30日,昭和8年12月19日" })).toBe(
      "内務省告示24号・昭和8年1月30日／内務省告示447号・昭和8年12月19日",
    );
    expect(houreiName("会瀬 *R3確認済(不明)")).toBe("会瀬");
    expect(houreiName("芹田(追加) *R3確認済(不明)")).toBe("芹田(追加)");
    expect(houreiName("鷹取町1丁目A")).toBe("鷹取町1丁目A");
    // 市の境にまたがる災害危険区域は、指定した条例の市
    expect(houreiAuthority({ kind: "災害危険区域", pref: "14", byCity: true, cityName: "横浜市,横須賀市", rule: "横須賀市建築基準条例" })).toBe("横須賀市");
    expect(houreiAuthority({ kind: "災害危険区域", pref: "14", byCity: true, cityName: "厚木市,愛川町" })).toBe("厚木市");
  });

  it("同じ告示で指定した区域は名前をつなぐ（頭が同じなら頭は1回）", () => {
    const sabo = (name: string, notice: string, since: string) => ({ kind: "砂防指定地" as const, pref: "14", name, notice, since });
    const g = houreiGroups([
      sabo("早川水系須雲川 前榎沢", "第173号", "昭和6年7月24日"),
      sabo("早川水系須雲川 須雲川", "第173号,第415号", "昭和6年7月24日,昭和12年6月11日"),
      sabo("早川水系須雲川 丸山沢", "第173号", "昭和6年7月24日"),
      sabo("早川水系須雲川 中清水沢", "第173号", "昭和6年7月24日"),
    ]);
    expect(g[0].text).toBe("早川水系須雲川 前榎沢・丸山沢・中清水沢（第173号・昭和6年7月24日）、早川水系須雲川 須雲川（第173号・昭和6年7月24日／第415号・昭和12年6月11日）");
    expect(houreiGroups([sabo("鈴川", "第127号", "大正14年7月20日"), sabo("大山川", "第127号", "大正14年7月20日")])[0].text).toBe("鈴川・大山川（第127号・大正14年7月20日）");
    // 急傾斜地崩壊危険区域と同じ区域と、それ以外の災害危険区域（津波など）が重なるとき
    const steep = { kind: "急傾斜地崩壊危険区域" as const, pref: "08", name: "東-2", since: "1980-07-24" };
    const saigai = { kind: "災害危険区域" as const, pref: "08", byCity: true, cityName: "北茨城市", rule: "北茨城市建築基準条例" };
    const kita = houreiGroups([steep, { ...saigai, name: "東-2", reason: "急傾斜地崩壊" }, { ...saigai, name: "平潟地区災害危険区域", notice: "北茨城市告示第103号", since: "2014-01-06", reason: "津波" }]);
    expect(kita[1].text).toBe("急傾斜地崩壊危険区域と同じ区域（北茨城市建築基準条例）、平潟地区災害危険区域（北茨城市告示第103号・2014年1月6日）（津波・北茨城市建築基準条例）");
  });

  it("同じ都県・市の担当は1つにまとめる", () => {
    const steep = { kind: "急傾斜地崩壊危険区域" as const, pref: "14", name: "富岡東5丁目北" };
    const both = { pref: "14", hits: [steep, { kind: "災害危険区域" as const, pref: "14", name: "富岡東5丁目北" }], missing: [] };
    expect(houreiCautionAll(both)).toBe("国のデータ（2021年度）の概略の区域。重要事項説明には神奈川県（砂防・建築の担当）の資料で確認");
    const city = { pref: "14", hits: [steep, { kind: "災害危険区域" as const, pref: "14", byCity: true, cityName: "横須賀市" }], missing: [] };
    expect(houreiCautionAll(city)).toBe("国のデータ（2021年度）の概略の区域。重要事項説明には神奈川県（砂防の担当）・横須賀市（建築の担当）の資料で確認");
  });
});

// アプリに入っている区域のタイル（public/data/）を実際に読む
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

describe("アプリに入っている法令の区域のタイル", () => {
  const src = houreiTileSource(fileSource(PATH));
  it("金沢区の急傾斜地・横須賀市の災害危険区域・三宅村の砂防指定地・南牧村の地すべり防止区域・千代田区（区域外）", async () => {
    const kanazawa = await houreiAt(35.371063, 139.62945, "14108", src);
    expect(kanazawa?.hits[0]).toMatchObject({ kind: "急傾斜地崩壊危険区域", name: "富岡東5丁目北", notice: "第220号", since: "1994-03-25", pref: "14" });
    const yokosuka = await houreiAt(35.317733, 139.620229, "14201", src);
    const saigai = yokosuka?.hits.find((h) => h.kind === "災害危険区域");
    expect(saigai).toMatchObject({ name: "鷹取町1丁目A", byCity: true, cityName: "横須賀市", reason: "急傾斜地崩壊", rule: "横須賀市建築基準条例" });
    expect(houreiAuthority(saigai!)).toBe("横須賀市");
    const miyake = await houreiAt(34.079257, 139.48561, "13381", src);
    expect(miyake?.hits.find((h) => h.kind === "砂防指定地")?.name).toBe("鉄砲沢・夕景沢");
    const nanmoku = await houreiAt(36.146946, 138.737417, "10383", src);
    expect(nanmoku?.hits.find((h) => h.kind === "地すべり防止区域")).toMatchObject({ name: "根草", office: "国土交通省", since: "1990-03-31" });
    const chiyoda = await houreiAt(35.6895, 139.7441, "13101", src);
    expect(chiyoda?.hits).toEqual([]);
    expect(SRC.counts.A47).toBeGreaterThan(3000);
  });
});
