import { describe, expect, it } from "vitest";
import type { HistoryItem } from "../history";
import { placeholderScenes, placeParts, placeTitle, SCENES, stamp } from "./scene";

const item = (address: string, city?: string, ll?: [number, number]): HistoryItem => ({ address, city, at: 0, ...(ll ? { ll } : {}) });

describe("最近の検索のカード", () => {
  it("見出しは絵と同じく市区町村と町名（丁目まで）。番地まで入れた住所は full に残す", () => {
    expect(placeTitle(item("東京都世田谷区上野毛3丁目1-2", "世田谷区"))).toEqual({ title: "世田谷区 上野毛3丁目", full: "世田谷区 上野毛3丁目1-2", chiban: false });
    expect(placeTitle(item("埼玉県さいたま市大宮区桜木町1-7-5", "さいたま市"))).toEqual({ title: "さいたま市 大宮区桜木町", full: "さいたま市 大宮区桜木町1-7-5", chiban: false });
    expect(placeTitle(item("渋谷区神南１－１９－１１", "渋谷区"))).toEqual({ title: "渋谷区 神南", full: "渋谷区 神南1-19-11", chiban: false });
    expect(placeTitle(item("東京都新宿区西新宿二丁目8番1号", "新宿区")).title).toBe("新宿区 西新宿二丁目");
    expect(placeTitle(item("千葉県松戸市本町7-1 松戸ビル", "松戸市")).title).toBe("松戸市 本町");
    // 地図で選んだ地点（町まで）・市区町村を書かずに調べたもの・未対応の市
    expect(placeTitle(item("東京都渋谷区神南一丁目", "渋谷区", [35.66, 139.7])).title).toBe("渋谷区 神南一丁目");
    expect(placeTitle(item("神南1-19-11", "渋谷区"))).toMatchObject({ title: "渋谷区 神南", full: "渋谷区 神南1-19-11" });
    expect(placeTitle(item("大阪府大阪市北区梅田3-1-1"))).toMatchObject({ title: "大阪市北区梅田", full: "大阪市北区梅田3-1-1" });
    // 番地だけ・市区町村だけでも空にしない
    expect(placeTitle(item("1-19-11")).title).toBe("1-19-11");
    expect(placeTitle(item("東京都渋谷区", "渋谷区")).title).toBe("渋谷区");
  });

  it("カードの2行：市区町村を小さく上に、町名を大きく。市区町村が分からないときは空", () => {
    expect(placeParts(item("東京都世田谷区上野毛3丁目1-2", "世田谷区"))).toEqual({ city: "世田谷区", town: "上野毛3丁目", full: "世田谷区 上野毛3丁目1-2", chiban: false });
    expect(placeParts(item("神南1-19-11", "渋谷区"))).toEqual({ city: "渋谷区", town: "神南", full: "渋谷区 神南1-19-11", chiban: false });
    expect(placeParts(item("大阪府大阪市北区梅田3-1-1"))).toEqual({ city: "", town: "大阪市北区梅田", full: "大阪市北区梅田3-1-1", chiban: false });
    expect(placeParts(item("東京都渋谷区", "渋谷区"))).toEqual({ city: "渋谷区", town: "", full: "渋谷区", chiban: false });
  });

  it("地番で調べたものは「地番」を外して印を立てる", () => {
    expect(placeTitle(item("地番 松戸市古ヶ崎四丁目3556-1", "松戸市"))).toEqual({ title: "松戸市 古ヶ崎四丁目", full: "松戸市 古ヶ崎四丁目3556-1", chiban: true });
    expect(placeTitle(item("地番　千葉県松戸市古ヶ崎四丁目3556-1", "松戸市"))).toMatchObject({ title: "松戸市 古ヶ崎四丁目", chiban: true });
  });

  it("日時は「2026/04/26 14:32」の形", () => {
    expect(stamp(new Date(2026, 3, 26, 14, 32).getTime())).toBe("2026/04/26 14:32");
    expect(stamp(new Date(2026, 9, 2, 9, 5).getTime())).toBe("2026/10/02 09:05");
  });

  it("仮の写真は住宅地の4枚から。同じ物件には同じ写真で、並んだ3枚は別の写真にする", () => {
    const list = [item("東京都渋谷区神南1-19-11", "渋谷区"), item("埼玉県さいたま市大宮区桜木町1-7-5", "さいたま市"), item("地番 松戸市古ヶ崎四丁目3556-1", "松戸市")];
    const a = placeholderScenes(list);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    for (const k of a) expect(["suburb", "newtown", "upscale", "urban"]).toContain(k);
    expect(placeholderScenes(list)).toEqual(a);
    // 先頭のカードは、ほかに何が並んでいても同じ写真
    expect(placeholderScenes([list[0]])[0]).toBe(a[0]);
    // 5件以上でも落ちない
    expect(placeholderScenes([...list, ...list.map((h) => ({ ...h, address: `${h.address}2` }))])).toHaveLength(6);
    expect(Object.keys(SCENES)).toHaveLength(10);
  });
});
