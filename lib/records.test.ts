import { beforeEach, describe, expect, it } from "vitest";
import { normalizeAddress, propertyId, propertyIdOf } from "./property-id";
import { allRecords, loadRecords, mergeRecords, recordsSummary, removeRecord, topicProgress, writeRecord } from "./records";

// localStorage の代わり（vitest は node で動く）
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

describe("propertyId（同じ物件の見分け方）", () => {
  it("筆が分かれば市区町村コードと地番、無ければ住所、無ければ地点", () => {
    expect(propertyId({ muniCd: "12207", town: "古ヶ崎", chiban: "3556-1", address: "松戸市古ヶ崎四丁目3556-1" })).toBe("p:12207:古ヶ崎:3556-1");
    expect(propertyId({ address: "渋谷区神南一丁目19番11号" })).toBe("a:渋谷区神南1丁目19-11");
    expect(propertyId({ ll: [35.658584, 139.745431] })).toBe("ll:35.65858,139.74543");
    expect(propertyId({})).toBe("");
  });
  it("住所の表記ゆれをそろえる（全角・丁目の漢数字・番号）", () => {
    expect(normalizeAddress("東京都渋谷区神南１丁目１９番１１号")).toBe("東京都渋谷区神南1丁目19-11");
    expect(normalizeAddress("東京都渋谷区神南一丁目19-11")).toBe("東京都渋谷区神南1丁目19-11");
    expect(normalizeAddress("地番 松戸市古ヶ崎四丁目3556-1")).toBe("松戸市古ヶ崎4丁目3556-1");
    expect(normalizeAddress("上野毛十二丁目1番地2")).toBe("上野毛12丁目1-2");
  });
  it("調べた結果から：筆があれば筆、地図で選んだ地点は座標、それ以外は入力の住所", () => {
    const m = { codes: ["12207"] };
    expect(propertyIdOf("地番 松戸市古ヶ崎四丁目3556-1", { town: "古ヶ崎四丁目", lat: 35.8, lng: 139.9, parcel: { chibanRaw: "3556-1" }, municipality: m })).toBe("p:12207:古ヶ崎四丁目:3556-1");
    // 地図で選んだ地点で同じ筆に当たれば、同じ物件
    expect(propertyIdOf("", { town: "古ヶ崎四丁目", lat: 35.80001, lng: 139.90002, picked: true, parcel: { chibanRaw: "3556-1" }, municipality: m })).toBe("p:12207:古ヶ崎四丁目:3556-1");
    expect(propertyIdOf("", { town: "古ヶ崎四丁目", lat: 35.8, lng: 139.9, picked: true, municipality: m })).toBe("ll:35.80000,139.90000");
    expect(propertyIdOf("松戸市古ヶ崎4-1-2", { town: "古ヶ崎四丁目", lat: 35.8, lng: 139.9, municipality: m })).toBe("a:松戸市古ヶ崎4-1-2");
  });
  it("地点が近いだけでは同じにならない", () => {
    expect(propertyId({ ll: [35.65858, 139.74543] })).not.toBe(propertyId({ ll: [35.65859, 139.74543] }));
  });
});

describe("records（確認の記録）", () => {
  it("確認事項を1つずつ記録し、項目の状態は未確認→一部→確認済み", () => {
    const key = "p:13113:19-11";
    expect(topicProgress(loadRecords(key), "road").status).toBe("none");
    const r1 = writeRecord(key, "渋谷区神南一丁目19番11号", "road", "kind", { done: true, method: "公式サイト", source: "渋谷区 指定道路図", note: "42条1項1号" });
    expect(r1.saved).toBe(true);
    expect(topicProgress(r1.records, "road")).toMatchObject({ done: 1, total: 4, status: "partial" });
    for (const sub of ["width", "frontage", "setback"]) writeRecord(key, "", "road", sub, { done: true, method: "現地" });
    expect(topicProgress(loadRecords(key), "road").status).toBe("all");
    expect(loadRecords(key).label).toBe("渋谷区神南一丁目19番11号");
  });
  it("確認済みを外すとメモは残り、状態は下がる。消すと無くなる", () => {
    const key = "a:x";
    writeRecord(key, "x", "hazard", "flood", { done: true, note: "市の地図で浸水なし" });
    writeRecord(key, "x", "hazard", "flood", { done: false, note: "市の地図で浸水なし" });
    expect(loadRecords(key).items.hazard?.flood).toMatchObject({ done: false, note: "市の地図で浸水なし" });
    expect(topicProgress(loadRecords(key), "hazard").status).toBe("none");
    removeRecord(key, "hazard", "flood");
    expect(loadRecords(key).items.hazard).toBeUndefined();
    expect(allRecords()).toHaveLength(0);
  });
  it("要約：確認済みの項目数と一部の項目数", () => {
    const key = "a:y";
    writeRecord(key, "y", "around", "site", { done: true });
    writeRecord(key, "y", "road", "kind", { done: true });
    expect(recordsSummary(loadRecords(key))).toMatchObject({ all: 1, partial: 1 });
    expect(recordsSummary(undefined)).toEqual({ all: 0, partial: 0, latest: undefined });
  });
  it("読み込みは足すだけで、同じ確認事項は新しい方を残す", () => {
    const key = "a:z";
    writeRecord(key, "z", "road", "kind", { done: true, note: "古い" });
    const old = loadRecords(key);
    const newer = { ...old, items: { road: { kind: { done: true, note: "新しい", at: old.items.road!.kind.at + 1000 }, width: { done: true, at: 1 } } }, updatedAt: old.updatedAt + 1000 };
    const r = mergeRecords([newer, { key: "a:w", label: "w", items: { parcel: { touki: { done: true, at: 1 } } }, updatedAt: 1 }]);
    expect(r).toMatchObject({ added: 3, saved: true });
    expect(loadRecords(key).items.road?.kind.note).toBe("新しい");
    expect(loadRecords("a:w").items.parcel?.touki.done).toBe(true);
    // 古い方は上書きしない
    expect(mergeRecords([{ ...old, updatedAt: 0 }]).added).toBe(0);
    expect(loadRecords(key).items.road?.kind.note).toBe("新しい");
  });
});
