import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCompare, compareTable, COMPARE_MAX, loadCompare, removeCompare, type CompareItem } from "./compare";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const item = (key: string, extra: Partial<CompareItem> = {}): CompareItem => ({ key, item: { address: key, at: 1 }, title: key, place: "横浜市港南区 日限山4丁目", at: 1, ...extra });

describe("並べて比較", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("window", { dispatchEvent: () => true });
  });

  it("加えた順に並べ、端末に残す", () => {
    let list = addCompare([], item("A")).list;
    list = addCompare(list, item("B")).list;
    expect(list.map((x) => x.key)).toEqual(["A", "B"]);
    expect(loadCompare().map((x) => x.key)).toEqual(["A", "B"]);
  });

  it("同じ物件は、その場で新しい値に入れ替える（数は増やさない）", () => {
    let list = addCompare([], item("A", { neighbors: 3 })).list;
    list = addCompare(list, item("B")).list;
    list = addCompare(list, item("A", { neighbors: 5 })).list;
    expect(list.map((x) => x.key)).toEqual(["A", "B"]);
    expect(list[0].neighbors).toBe(5);
  });

  it(`${COMPARE_MAX}件を超えたら、いちばん古く加えたものを外して知らせる`, () => {
    let list: CompareItem[] = [];
    for (const k of ["A", "B", "C", "D"]) list = addCompare(list, item(k)).list;
    const r = addCompare(list, item("E"));
    expect(r.list.map((x) => x.key)).toEqual(["B", "C", "D", "E"]);
    expect(r.dropped?.key).toBe("A");
  });

  it("外す", () => {
    let list = addCompare([], item("A")).list;
    list = addCompare(list, item("B")).list;
    expect(removeCompare(list, "A").map((x) => x.key)).toEqual(["B"]);
    expect(loadCompare().map((x) => x.key)).toEqual(["B"]);
  });

  it("壊れた保存は読まない", () => {
    localStorage.setItem("michilu:compare", "{oops");
    expect(loadCompare()).toEqual([]);
    localStorage.setItem("michilu:compare", JSON.stringify([{ key: 1 }, item("A")]));
    expect(loadCompare().map((x) => x.key)).toEqual(["A"]);
  });

  it("表：分からない所は「—」、目安の筆は面積を丸める。良し悪しの印は付けない", () => {
    const rows = compareTable([item("A", { area: 226.04, neighbors: 6, corners: 4, done: 2, total: 5 }), item("B", { area: 221.4, rough: true })]);
    const row = (label: string) => rows.find((r) => r.label === label)!.cells;
    expect(row("面積")).toEqual(["約226.0㎡", "約220㎡"]);
    expect(row("坪")).toEqual(["68.4坪", "約67坪"]);
    expect(row("隣地")).toEqual(["6筆", "—"]);
    expect(row("辺の数")).toEqual(["4", "—"]);
    expect(row("次にやること")).toEqual(["2 / 5 済み", "—"]);
    expect(JSON.stringify(rows)).not.toMatch(/良い|おすすめ|best/);
  });
});
