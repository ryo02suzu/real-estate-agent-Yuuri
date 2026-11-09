import { describe, expect, it, vi } from "vitest";
import { backgroundOf, createModalStack, trapStep } from "./modal-stack";

describe("重なった画面の順番", () => {
  it("いちばん上だけが top。上を閉じると下が top に戻る（ネストしたシートの Esc は上の1枚だけ）", () => {
    const s = createModalStack<string>();
    const a = s.push("menu", () => {});
    const b = s.push("guide", () => {});
    expect(s.isTop(b)).toBe(true);
    expect(s.isTop(a)).toBe(false);
    s.remove(b);
    expect(s.isTop(a)).toBe(true);
    expect(s.top()?.el).toBe("menu");
    s.remove(a);
    expect(s.size()).toBe(0);
    expect(s.top()).toBeUndefined();
  });

  it("下の画面が先に閉じても、上の画面は top のまま（順番が崩れない）", () => {
    const s = createModalStack<string>();
    const a = s.push("a", () => {});
    const b = s.push("b", () => {});
    s.remove(a);
    expect(s.isTop(b)).toBe(true);
    expect(s.size()).toBe(1);
  });

  it("変わったときだけ知らせる（同じものを2回外しても1回）", () => {
    const s = createModalStack<string>();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    const a = s.push("a", () => {});
    s.remove(a);
    s.remove(a);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    s.push("b", () => {});
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

type N = { name: string; parentElement: N | null; children: N[] };
function tree(): Record<string, N> {
  const make = (name: string, parent: N | null): N => {
    const n: N = { name, parentElement: parent, children: [] };
    parent?.children.push(n);
    return n;
  };
  const body = make("body", null);
  const app = make("app", body);
  const map = make("map", app);
  const panel = make("panel", app);
  const list = make("list", panel);
  const row = make("row", list);
  const sheet = make("sheet", row);
  const other = make("other-row", list);
  const header = make("header", panel);
  const printSheet = make("print-sheet", body);
  return { body, app, map, panel, list, row, sheet, other, header, printSheet };
}

describe("背景（触れなくする所）", () => {
  it("画面からページの一番外までの、祖先それぞれのほかの子。祖先そのものと画面は含めない", () => {
    const t = tree();
    const bg = backgroundOf(t.sheet, t.body).map((n) => n.name);
    expect(bg.sort()).toEqual(["header", "map", "other-row", "print-sheet"].sort());
    expect(bg).not.toContain("row");
    expect(bg).not.toContain("app");
  });

  it("画面がページの直下にあるときは、ほかの直下の要素だけ", () => {
    const t = tree();
    expect(backgroundOf(t.printSheet, t.body).map((n) => n.name)).toEqual(["app"]);
  });
});

describe("Tab の閉じ込め", () => {
  it("最後で Tab → 最初へ、最初で Shift+Tab → 最後へ。途中はブラウザに任せる", () => {
    expect(trapStep(3, 2, false)).toBe(0);
    expect(trapStep(3, 0, true)).toBe(2);
    expect(trapStep(3, 1, false)).toBeNull();
    expect(trapStep(3, 1, true)).toBeNull();
  });

  it("フォーカスが画面そのもの・外にあるときは、最初（Shift なら最後）へ", () => {
    expect(trapStep(3, -1, false)).toBe(0);
    expect(trapStep(3, -1, true)).toBe(2);
  });

  it("操作できる部品が無ければ、画面そのものに留める", () => {
    expect(trapStep(0, -1, false)).toBe(-1);
  });
});
