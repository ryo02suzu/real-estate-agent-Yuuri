import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { publishDocStatus } from "@/lib/app/doc-status";
import { favoriteKey } from "@/lib/favorites";
import type { HistoryItem } from "@/lib/history";
import { DOC_GROUPS, DOCS, MAIN_DOC, docOf } from "./doc-kinds";
import { DocsPage } from "./docs";

const noop = () => {};
const now = Date.now();
const current: HistoryItem = { address: "東京都渋谷区神南1-19-11", city: "渋谷区", coverage: "full", at: now };
const older: HistoryItem[] = [
  { address: "千葉県松戸市古ケ崎4-3556-1", city: "松戸市", coverage: "full", at: now - 3600e3 },
  { address: "茨城県古河市本町1-1", city: "古河市", coverage: "full", at: now - 7200e3 },
];

function render(props: Partial<Parameters<typeof DocsPage>[0]> = {}) {
  return renderToStaticMarkup(
    <DocsPage current={current} history={[current, ...older]} onMake={noop} onReport={noop} onPick={noop} onHistory={noop} onHome={noop} onMenu={noop} unread={false} motion={false} {...props} />,
  );
}

afterEach(() => publishDocStatus(undefined));

describe("作れる書類の一覧（components/app/doc-kinds.tsx）", () => {
  it("調査の流れの順に3つの組（役所・法務局で → 現地で → 書類にする）、全部で6つ。名前は重ならない", () => {
    expect(DOC_GROUPS.map((g) => g.title)).toEqual(["役所・法務局で", "現地で", "書類にする"]);
    expect(DOCS.map((d) => d.kind)).toEqual(["inquiry", "parcels", "guide", "memo", "draft", "copy"]);
    expect(new Set(DOCS.map((d) => d.title)).size).toBe(6);
    // タイルの2行目は幅（約105pt）に収まる長さ（8文字まで）
    for (const d of DOCS) expect(d.short.length).toBeLessThanOrEqual(8);
    expect(docOf("triage")).toBe(MAIN_DOC);
    expect(docOf("memo").action).toBe("調査メモを印刷・PDF保存");
  });
});

describe("書類・出力のページ（components/app/docs.tsx）", () => {
  it("開いている物件のカードに、大きな「要注意点と次にやること」と、流れの順の6つの書類を出す", () => {
    const html = render();
    expect(html).toContain("いま開いている物件");
    expect(html).toContain("渋谷区神南 1-19-11");
    expect(html).toContain("要注意点と次にやること");
    expect(html).toContain("問題になりそうな所と、確かめる窓口");
    const labels = [...html.matchAll(/aria-label="([^"]+（[^"]+）)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["窓口の照会文（FAX・メール用）", "地番の一覧（謄本・公図用）", "案内図（A4・PDF）", "調査メモ（A4・PDF）", "重説の下書き（物件概要つき）", "結果の文面（コピー・共有）"]);
    // ほかの物件から作る
    expect(html).toContain("ほかの物件から作る");
    expect(html).toContain("松戸市古ケ崎");
    expect(html).toContain("番地：4-3556-1");
  });

  it("物件の画面が入れた調査の状態を、名前の下と大きなボタンに出す（別の物件の状態は出さない）", () => {
    publishDocStatus({ key: favoriteKey(current), headline: "要注意 2件・要確認 5件", pending: ["地価"], failed: [], actionsLeft: 8, actionsTotal: 10, records: 3 });
    const html = render();
    expect(html).toContain("やること あと8件・確認の記録 3件・読み込み中（地価）");
    expect(html).toContain("要注意 2件・要確認 5件");
    expect(html).not.toContain("問題になりそうな所と、確かめる窓口");
    publishDocStatus({ key: "other", headline: "要注意 9件", pending: [], failed: [], actionsLeft: 1, actionsTotal: 1, records: 0 });
    const other = render();
    expect(other).not.toContain("要注意 9件");
    expect(other).toContain("問題になりそうな所と、確かめる窓口");
  });

  it("物件が無ければ「まだありません」と「ホームで調べる」、書類のボタンは薄く", () => {
    const html = render({ current: undefined, history: [] });
    expect(html).toContain("まだありません");
    expect(html).toContain("ホームで調べる");
    expect(html).toContain("opacity:0.55");
    expect(html).not.toContain("ほかの物件から作る");
  });
});
