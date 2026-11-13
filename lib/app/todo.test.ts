import { describe, expect, it } from "vitest";
import { actionOfIssue, buildTodo, dataHints, defaultMethod, fieldValue, groupOf, mergeNote, RESULT_FIELDS, resultChip, resultChips, withUnit } from "./todo";
import type { Action, Issue, Triage } from "./triage";
import { RECORD_ITEMS, type PropertyRecords } from "../records";

const act = (id: string, priority: 1 | 2 | 3 = 1): Action => ({ id, priority, title: id, where: "w", what: [] });
const iss = (id: string, topic: Issue["topic"], level: Issue["level"] = "warn"): Issue => ({ id, level, topic, title: id, detail: "" });

describe("次にやることの行き先", () => {
  it("法務局・市区町村の窓口・ハザードマップ・県などの担当・水道ガス・現地に分ける", () => {
    expect(groupOf("touki")).toBe("houmu");
    expect(groupOf("road")).toBe("city");
    expect(groupOf("toshi")).toBe("city");
    expect(groupOf("iseki")).toBe("city");
    expect(groupOf("hazard")).toBe("map");
    expect(groupOf("morido")).toBe("pref");
    expect(groupOf("hourei")).toBe("pref");
    expect(groupOf("utility")).toBe("life");
    expect(groupOf("site")).toBe("site");
  });

  it("問題になりそうな所を、確かめるやることへつなぐ", () => {
    expect(actionOfIssue(iss("road-2kou", "road"))).toBe("road");
    expect(actionOfIssue(iss("senbiki", "zoning"))).toBe("chosei");
    expect(actionOfIssue(iss("plan-road", "zoning"))).toBe("toshi");
    expect(actionOfIssue(iss("morido", "law"))).toBe("morido");
    expect(actionOfIssue(iss("hourei-missing", "law", "check"))).toBe("hourei");
    expect(actionOfIssue(iss("park", "law"))).toBe("tochi");
    expect(actionOfIssue(iss("hazard-dosha", "hazard"))).toBe("hazard");
    expect(actionOfIssue(iss("off-lot", "place", "check"))).toBe("touki");
  });

  it("まとまりは回る順（法務局が先・現地が最後）。つながる問題のあるやることは「この物件で特に」で先頭", () => {
    const t: Triage = {
      issues: [iss("plan-road", "zoning"), iss("morido", "law"), iss("hourei-missing", "law", "check")],
      actions: [act("road"), act("touki"), act("morido"), act("hazard"), act("utility"), act("site"), act("toshi", 2), act("hourei", 2), act("iseki", 2)],
      pending: [],
      failed: [],
      headline: "",
    };
    const { groups, linked } = buildTodo(t, "桐生市", "群馬県");
    expect(groups.map((g) => g.title)).toEqual(["法務局", "桐生市の窓口", "桐生市のハザードマップ", "群馬県などの担当", "水道・下水道・ガス", "現地"]);
    const city = groups[1];
    expect(city.items.map((i) => i.action.id)).toEqual(["toshi", "road", "iseki"]);
    expect(city.items[0].special).toBe(true);
    expect(city.items[0].issues.map((i) => i.id)).toEqual(["plan-road"]);
    expect(groups[3].items.map((i) => i.action.id)).toEqual(["morido", "hourei"]);
    expect(linked.get("hourei-missing")).toBe("hourei");
  });

  it("確かめた結果の欄は、確認の記録の確認事項に入る（無い確認事項は使わない）", () => {
    for (const fields of Object.values(RESULT_FIELDS))
      for (const f of fields) expect(RECORD_ITEMS[f.topic].subs.some((s) => s.id === f.sub)).toBe(true);
    expect(defaultMethod("site")).toBe("現地");
    expect(defaultMethod("hazard")).toBe("公式サイト");
    expect(defaultMethod("road")).toBe("窓口");
  });
});

describe("確かめた結果の欄", () => {
  const road = RESULT_FIELDS.road;
  const width = road.find((f) => f.sub === "width")!;
  const morido = RESULT_FIELDS.morido[0];
  const hourei = RESULT_FIELDS.hourei[0];

  it("ほかのやることと分けない欄は、メモがそのまま値", () => {
    expect(fieldValue("42条2項", road[0])).toBe("42条2項");
    expect(mergeNote("42条2項", road[0], " 42条1項1号 ")).toBe("42条1項1号");
    expect(mergeNote("42条2項", road[0], "")).toBeUndefined();
  });

  it("盛土・砂防のように同じ確認事項に書く欄は、見出しの所だけ入れ替える（ほかの所・自由に書いたメモは残す）", () => {
    let note = mergeNote(undefined, morido, "区域外");
    expect(note).toBe("盛土規制法の区域：区域外");
    note = mergeNote(note, hourei, "区域内");
    expect(note).toBe("盛土規制法の区域：区域外／砂防・急傾斜地などの区域：区域内");
    expect(fieldValue(note, morido)).toBe("区域外");
    expect(fieldValue(note, hourei)).toBe("区域内");
    note = mergeNote(note, morido, "特定盛土等規制区域");
    expect(fieldValue(note, morido)).toBe("特定盛土等規制区域");
    expect(fieldValue(note, hourei)).toBe("区域内");
    expect(mergeNote("窓口で聞いた", morido, "区域外")).toBe("窓口で聞いた／盛土規制法の区域：区域外");
    expect(fieldValue("窓口で聞いた", morido)).toBe("");
    expect(mergeNote("盛土規制法の区域：区域外", morido, "")).toBeUndefined();
  });

  it("数字だけ書いたら単位を足す。札は頭を付けて見せる", () => {
    expect(withUnit(width, "4.5")).toBe("4.5m");
    expect(withUnit(width, "４．５")).toBe("4.5m");
    expect(withUnit(width, "4m未満")).toBe("4m未満");
    expect(resultChip(width, "4.5m")).toBe("幅員 4.5m");
    expect(resultChip(road[0], "42条2項")).toBe("42条2項");
  });

  it("書いた結果の札は、確認済みの記録だけ", () => {
    const records: PropertyRecords = {
      key: "k",
      label: "",
      updatedAt: 1,
      items: { road: { kind: { done: true, note: "42条2項", at: 1 }, width: { done: false, note: "3.6m", at: 1 }, setback: { done: true, note: "要", at: 1 } } },
    };
    expect(resultChips("road", records)).toEqual(["42条2項", "セットバック 要"]);
    expect(resultChips("site", records)).toEqual([]);
  });

  it("データで読んだ値は、用途地域・建ぺい率と容積率・防火と高度地区・いちばん近い道路の種別と幅員", () => {
    const zoning = { youto: [{ name: "第一種住居地域", code: 5, bcr: 60, far: 200 }], youtoNear: [], tokei: true, jyuntoshi: false, bouka: "準防火地域", koudoti: true, others: [] };
    const roads = [
      { label: "法第42条第1項第1号道路", short: "1項1号", distance: 12, direction: "北" },
      { label: "法第42条第2項道路", short: "2項道路", distance: 3, direction: "南", width: "2.7〜4.0m" },
    ];
    expect(dataHints(zoning, roads)).toEqual({ "zoning.youto": "第一種住居地域", "zoning.ratio": "60%・200%", "zoning.koudo": "準防火地域・高度地区", "road.kind": "42条2項", "road.width": "2.7〜4.0m" });
    expect(dataHints(undefined, [])).toEqual({});
  });
});
