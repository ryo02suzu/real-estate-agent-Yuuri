import { describe, expect, it } from "vitest";
import { buildHash, hashParams, readUrlState } from "./url";

describe("readUrlState（URL から物件を読む）", () => {
  it("ハッシュの q / ll を読む", () => {
    expect(readUrlState({ search: "", hash: "#q=%E6%B8%8B%E8%B0%B7%E5%8C%BA" })).toEqual({ q: "渋谷区", fromQuery: false });
    expect(readUrlState({ search: "", hash: "#ll=35.65858,139.74543&t=2026-06-21T18:30" })).toEqual({ ll: [35.65858, 139.74543], fromQuery: false });
  });
  it("古いクエリの形も読み、古い形だったと分かる", () => {
    expect(readUrlState({ search: "?q=%E6%9D%BE%E6%88%B8%E5%B8%82", hash: "" })).toEqual({ q: "松戸市", fromQuery: true });
    expect(readUrlState({ search: "?ll=35.1,139.2", hash: "#t=2026-01-01" })).toEqual({ ll: [35.1, 139.2], fromQuery: true });
  });
  it("ハッシュを優先する", () => {
    expect(readUrlState({ search: "?q=a", hash: "#q=b" })).toEqual({ q: "b", fromQuery: false });
  });
  it("何も無ければ空", () => {
    expect(readUrlState({ search: "", hash: "#t=2026-06-21" })).toEqual({ fromQuery: false });
  });
});

describe("buildHash（物件のハッシュを作る）", () => {
  it("住所・地点・無しの3通り", () => {
    expect(buildHash({ q: "渋谷区神南1-19-11" })).toBe("#q=%E6%B8%8B%E8%B0%B7%E5%8C%BA%E7%A5%9E%E5%8D%971-19-11");
    expect(buildHash({ ll: [35.658584, 139.745431] })).toBe("#ll=35.65858,139.74543");
    expect(buildHash({})).toBe("");
  });
  it("プレビューの日時（t）など、ほかの項目は残す", () => {
    expect(buildHash({ q: "a" }, "#q=old&t=2026-06-21T18:30")).toBe("#q=a&t=2026-06-21T18%3A30");
    expect(buildHash({}, "#ll=1,2&t=2026-06-21")).toBe("#t=2026-06-21");
    expect(hashParams(buildHash({ ll: [1, 2] }, "#t=x")).get("t")).toBe("x");
  });
});
