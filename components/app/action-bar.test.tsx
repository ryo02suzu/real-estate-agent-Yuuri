import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionBar } from "./action-bar";

const primary = { label: "レポートを作成", onClick: () => {} };
const secondary = [
  { label: "", title: "お気に入りに保存", onClick: () => {} },
  { label: "共有", onClick: () => {} },
];

/**
 * 物件の下の操作バーは、ほかのページを見ている間・文字を入れている間は、下へ滑って隠れる（下のメニューに重なる位置）。
 * 隠れている間に指を受けると、見えないボタンが押される（下のメニューの「検索」の所で「レポートを作成」のシートが開き、
 * 「履歴」の所で★が切り替わり、以後ほかのページへ移れなくなっていた）。隠れている間は、中の箱も指を受けない
 */
describe("物件の下の操作バー（components/app/action-bar.tsx）", () => {
  it("隠れている間は、指を受ける箱が無い（pointer-events-auto を付けない）", () => {
    const hidden = renderToStaticMarkup(<ActionBar primary={primary} secondary={secondary} hidden />);
    expect(hidden).toContain('data-hidden="1"');
    expect(hidden).toContain('aria-hidden="true"');
    expect(hidden).not.toContain("pointer-events-auto");
    expect(hidden).toContain("pointer-events-none");
  });

  it("見えている間は、中の箱だけが指を受ける（外の箱は受けない）", () => {
    const shown = renderToStaticMarkup(<ActionBar primary={primary} secondary={secondary} />);
    expect(shown).toContain('data-hidden="0"');
    expect(shown).toContain("pointer-events-auto");
    expect(shown).toMatch(/action-bar pointer-events-none/);
    // 主役と脇役（★・共有）がそろっている
    expect(shown).toContain("レポートを作成");
    expect(shown).toContain('aria-label="お気に入りに保存"');
    expect(shown).toContain("共有");
  });

  it("CSS でも、隠れたら見えない扱い（visibility: hidden）にして、中の箱の指を止める", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const rule = css.match(/\.action-bar\[data-hidden="1"\] \{([^}]*)\}/);
    expect(rule).toBeTruthy();
    expect(rule![1]).toContain("visibility: hidden");
    expect(rule![1]).toContain("pointer-events: none");
    expect(css).toMatch(/\.action-bar\[data-hidden="1"\] > \* \{\s*pointer-events: none;/);
  });
});
