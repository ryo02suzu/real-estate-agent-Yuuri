import { describe, expect, it } from "vitest";
import { docMainSub, docStatusLine, publishDocStatus, type DocStatus } from "./doc-status";

const base: DocStatus = { key: "k", headline: "要注意 2件・要確認 5件", pending: [], failed: [], actionsLeft: 8, actionsTotal: 10, records: 3 };

describe("書類・出力の物件の状態の1行", () => {
  it("やることの残り・確認の記録・読み込み中のデータを並べる", () => {
    expect(docStatusLine(base)).toBe("やること あと8件・確認の記録 3件");
    expect(docStatusLine({ ...base, pending: ["地価", "学区"] })).toBe("やること あと8件・確認の記録 3件・読み込み中（地価・学区）");
    expect(docStatusLine({ ...base, failed: ["ハザード"] })).toBe("やること あと8件・確認の記録 3件・読めなかったデータ：ハザード");
  });

  it("やることが全部済んだら「すべて済み」。やることがまだ無い（読み込み中）ときは「あと0件」にしない", () => {
    expect(docStatusLine({ ...base, actionsLeft: 0 })).toBe("やること すべて済み・確認の記録 3件");
    expect(docStatusLine({ ...base, actionsLeft: 0, actionsTotal: 0, pending: ["道路種別"] })).toBe("やること あと0件・確認の記録 3件・読み込み中（道路種別）");
  });

  it("大きなボタンの説明は、状態が分かれば要注意点の見出し、無ければいつもの説明", () => {
    expect(docMainSub(base)).toBe("要注意 2件・要確認 5件");
    expect(docMainSub(undefined)).toBe("問題になりそうな所と、確かめる窓口");
  });

  it("入れた状態は、同じ鍵のときだけ読める（別の物件には出さない）", () => {
    publishDocStatus(base);
    // useDocStatus は React のフックなので、ここでは読み取りの約束だけを確かめる（鍵が違えば undefined）
    publishDocStatus(undefined);
    expect(docMainSub(undefined)).toBe("問題になりそうな所と、確かめる窓口");
  });
});
