// スマホの新UI（app/globals.css・components/japan-map.tsx）の、画面を見ないと気づきにくい決まりを、ソースを読んで確かめる。
// （この環境のテストは DOM を使わないので、実際の見た目・操作は実機で確かめる）
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const japanMap = readFileSync(join(root, "components/japan-map.tsx"), "utf8");

/** 「@media screen and (max-width: 1023.98px) { ... }」の中身（スマホの新UIだけに効く規則） */
function phoneBlock(): string {
  const start = css.indexOf("@media screen and (max-width: 1023.98px)");
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error("閉じかっこが無い");
}

/** セレクタに続く規則の中身 */
function rule(selector: string, from = css): string {
  const i = from.indexOf(selector);
  expect(i, selector).toBeGreaterThan(-1);
  return from.slice(from.indexOf("{", i) + 1, from.indexOf("}", i));
}

describe("押した反応（仕様：縮みは最大2%、行は面の色だけ）", () => {
  it("丸いボタンの縮みは 0.98 以上", () => {
    const scale = Number(css.match(/--mui-press-scale:\s*([\d.]+)/)?.[1]);
    expect(scale).toBeGreaterThanOrEqual(0.98);
    expect(rule(".mui-press:active:not(:disabled)")).toContain("var(--mui-press-scale)");
  });

  it("行（結果パネルの項目）は押しても縮めない（transform を使わない）", () => {
    const active = rule(".mui-rows button:not(.mui-row-link):active:not(:disabled)");
    expect(active).not.toMatch(/transform|scale/);
    expect(rule(".mui-rows button:not(.mui-row-link),")).not.toMatch(/transform/);
  });

  it("既存の部品の active:scale（Tailwind v4 は scale プロパティ）は、スマホの新UIの中だけで打ち消す", () => {
    const phone = phoneBlock();
    expect(rule('body[data-mui] [class*="active:scale"]:active', phone)).toContain("scale: none");
    // スマホの外（PC）に打ち消しを書かない
    expect(css.replace(phone, "")).not.toContain('[class*="active:scale"]');
  });

  it("reduced-motion では縮めない", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced.slice(0, reduced.indexOf("}\n}"))).toMatch(/--mui-press-scale:\s*1;/);
  });
});

describe("押せる範囲（44px 以上。見た目は変えない）", () => {
  it(".mui-hit・.mui-hit-y の広げ方は、スマホの新UIの中だけ（PC には効かない）", () => {
    const phone = phoneBlock();
    expect(phone).toContain("body[data-mui] .mui-hit::after");
    expect(phone).toContain("body[data-mui] .mui-hit-y::after");
    expect(css.replace(phone, "")).not.toMatch(/\.mui-hit(-y)?::after/);
    expect(css).toMatch(/--mui-hit:\s*44px/);
  });

  it("タブを広げるのは1行に並ぶものだけ（折り返すタブは上下で重なるので除く）", () => {
    expect(phoneBlock()).toContain('[role="tablist"]:not(.flex-wrap) > [role="tab"]::after');
    expect(css).not.toMatch(/body\[data-mui\] \[role="tab"\]::after/);
  });
});

describe("文字の大きさ（スマホの新UIの結果パネル・詳細だけ。PC・印刷は変えない）", () => {
  const SELECTOR_SMALL = "body[data-mui] :is(.mui-scope, .mui-detail) :is(.text-\\[9px\\]";
  const SELECTOR_12 = "body[data-mui] :is(.mui-scope, .mui-detail) :is(.text-\\[12px\\], .text-\\[12\\.5px\\]):not(.absolute)";

  it("11px 以下は 12px、12〜12.5px は 13px に。どちらもスマホの新UIの中だけ", () => {
    const phone = phoneBlock();
    expect(rule(SELECTOR_SMALL, phone)).toMatch(/font-size:\s*12px/);
    expect(rule(SELECTOR_12, phone)).toMatch(/font-size:\s*13px/);
    // スマホの外（PC・印刷）には書かない
    expect(css.replace(phone, "")).not.toContain(":is(.mui-scope, .mui-detail)");
  });

  it("地図の上に重ねた小さな札（absolute）は大きくしない", () => {
    const phone = phoneBlock();
    const i = phone.indexOf(SELECTOR_SMALL);
    expect(phone.slice(i, phone.indexOf("{", i))).toContain(":not(.absolute)");
  });

  it("詳細の置き場所に .mui-detail が付いている（結果パネルの .mui-scope と同じ扱い）", () => {
    const shell = readFileSync(join(root, "components/mobile-shell.tsx"), "utf8");
    expect(shell).toMatch(/data-testid="panel-detail"\s+className="mui-detail /);
    const view = readFileSync(join(root, "components/result-view.tsx"), "utf8");
    expect(view).toContain('className="mui-scope ');
  });
});

/** 地図の箱（ref={box} の要素）の開きタグ。地図の箱そのものを absolute にしていないか（外側の箱で広げているか） */
function mapBoxOk(src: string): boolean {
  const box = src.match(/<div\s+ref=\{box\}[^>]*>/)?.[0] ?? "";
  return box.includes("h-full w-full") && !/\babsolute\b/.test(box) && /<div className="absolute inset-0">\s*<div\s+ref=\{box\}/.test(src);
}

describe("日本地図の箱（MapLibre の CSS が箱を position: relative にする）", () => {
  it("地図の箱そのものを absolute にしない（高さが0になって地図が見えない）。外側の箱で広げ、地図の箱は h-full w-full", () => {
    expect(mapBoxOk(japanMap)).toBe(true);
    // 以前の形（箱そのものに absolute inset-0）は見逃さない
    expect(mapBoxOk(`<div\n      ref={box}\n      className="mui-japan-map absolute inset-0"\n      role="group"\n    />`)).toBe(false);
  });

  it("出典（地理院タイル）は、パネルの実際の高さ＋キーボードの分だけ持ち上げる", () => {
    expect(rule(".mui-japan-map .maplibregl-ctrl-bottom-left")).toContain("calc(var(--mui-panel-h, 0px) + var(--mui-kbd, 0px))");
  });
});
