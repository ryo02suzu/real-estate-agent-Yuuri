import { describe, expect, it } from "vitest";
import { chibanHowto, chibanHowtoLines, HOUMUKYOKU_URL, TOUKI_URL } from "./chiban-howto";

describe("地番の確かめ方（地番が確定しないときに出す公式の手段）", () => {
  it("交渉の前に自分で調べられる順（地番検索サービス・法務局への地番照会）に並べ、持ち主の書類は最後（交渉が始まってから）", () => {
    const s = chibanHowto();
    expect(s.map((x) => x.title)).toEqual(["登記情報提供サービスの「地番検索サービス」", "法務局に聞く（地番照会）", "持ち主の書類（交渉が始まってから）"]);
    expect(s[0].link?.url).toBe(TOUKI_URL);
    expect(s[1].link?.url).toBe(HOUMUKYOKU_URL);
    expect(s[2].link).toBeUndefined();
    // 公式の案内で確かめられなかった料金・提供エリアの一覧は書かない（「おおよその地番」「提供エリアの中」だけ）
    expect(s[0].text).toContain("おおよその地番");
    expect(s[0].text).toContain("提供エリアの中");
    expect(s.map((x) => x.text).join("")).not.toMatch(/無料|全国で/);
  });
  it("市町村が地番図を公開していれば、いちばん先に並べる（場所から見られる。参考図である注意も添える）", () => {
    const s = chibanHowto({ name: "熊谷市の地番図", url: "https://example.jp/map" });
    expect(s.map((x) => x.title)).toEqual(["熊谷市の地番図", "登記情報提供サービスの「地番検索サービス」", "法務局に聞く（地番照会）", "持ち主の書類（交渉が始まってから）"]);
    expect(s[0].text).toContain("謄本・公図で確認");
  });
  it("文面用は1行ずつ、見出し・説明・URL を入れる（箇条書きの印は付けない）", () => {
    const lines = chibanHowtoLines();
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^登記情報提供サービスの「地番検索サービス」：.+（https:\/\/www1\.touki\.or\.jp\/）$/);
    expect(lines[2]).toMatch(/^持ち主の書類（交渉が始まってから）：/);
    expect(lines.every((l) => !l.startsWith("・"))).toBe(true);
  });
});
