import { describe, expect, it } from "vitest";
import { extractFileLinks, findReplacements, normalizeLinkText } from "./page-links";

describe("一覧ページの図のリンク", () => {
  it("相対パス・// で始まるURL・http を絶対URL（https）にし、図のファイル以外は除く", () => {
    const html = `
      <a href="./daityozu/A-12.pdf">A-12</a>
      <a href="//www.city.example.lg.jp/files/zentai.pdf">全体図 (PDFファイル: 6.3MB)</a>
      <a href="http://www.city.example.lg.jp/img/map.PNG" target="_blank"><img alt=""> 図 &amp; 凡例</a>
      <a href="index.html">一覧へ</a>
      <a href="../x.pdf#page=3">3ページ</a>`;
    expect(extractFileLinks(html, "https://www.city.example.lg.jp/s066/kurashi/090/daityozu.html")).toEqual([
      { href: "https://www.city.example.lg.jp/s066/kurashi/090/daityozu/A-12.pdf", text: "A-12" },
      { href: "https://www.city.example.lg.jp/files/zentai.pdf", text: "全体図 (PDFファイル: 6.3MB)" },
      { href: "https://www.city.example.lg.jp/img/map.PNG", text: "図 & 凡例" },
      { href: "https://www.city.example.lg.jp/s066/kurashi/x.pdf", text: "3ページ" },
    ]);
  });

  it("リンクの文字は、ファイルの大きさや PDF の注記を外して比べる", () => {
    expect(normalizeLinkText("1 [PDFファイル／1.58MB]")).toBe("1");
    expect(normalizeLinkText("西東京市道路種別図（PDF：6.5MB）")).toBe(normalizeLinkText("西東京市道路種別図 (PDF:6.6MB)"));
    expect(normalizeLinkText("藤崎・大久保・泉町 (PDFファイル: 2.2MB)（別ウィンドウで開きます）")).toBe("藤崎大久保泉町");
    // 年度の入った図は、ゆるく比べるときだけ年度を外す
    expect(normalizeLinkText("令和8年度道路網図", true)).toBe(normalizeLinkText("令和9年度道路網図", true));
    expect(normalizeLinkText("令和8年度道路網図")).not.toBe(normalizeLinkText("令和9年度道路網図"));
    // 図の名前の「H-2」などは年号と取り違えない
    expect(normalizeLinkText("H-2", true)).toBe("h-2");
  });
});

describe("図の差し替えの検出", () => {
  const page = (links: [string, string][]) => links.map(([href, text]) => ({ href, text }));

  it("前回と同じ文字のリンクが別のファイルになっていれば差し替え（大きさの注記が変わっても同じ図）", () => {
    const r = findReplacements(
      [{ label: "市全体", url: "https://c.jp/f/20260701douroshubetu.pdf" }],
      page([
        ["https://c.jp/f/20270101douroshubetu.pdf", "西東京市道路種別図（PDF：6.6MB）"],
        ["https://c.jp/f/hanrei.pdf", "凡例（PDF：0.1MB）"],
      ]),
      { "https://c.jp/f/20260701douroshubetu.pdf": "西東京市道路種別図（PDF：6.5MB）", "https://c.jp/f/hanrei.pdf": "凡例（PDF：0.1MB）" },
    );
    expect(r.replaced).toEqual([
      { label: "市全体", from: "https://c.jp/f/20260701douroshubetu.pdf", to: "https://c.jp/f/20270101douroshubetu.pdf", text: "西東京市道路種別図（PDF：6.6MB）" },
    ]);
    expect(r.unresolved).toEqual([]);
  });

  it("年度が変わっただけの図も追う（ふじみ野市の「令和8年度道路網図」→「令和9年度道路網図」）", () => {
    const r = findReplacements(
      [{ label: "市全体", url: "https://c.jp/R8douromouzu.pdf" }],
      page([["https://c.jp/R9douromouzu.pdf", "令和9年度道路網図 (PDFファイル: 2.0MB)"]]),
      { "https://c.jp/R8douromouzu.pdf": "令和8年度道路網図 (PDFファイル: 1.9MB)" },
    );
    expect(r.replaced.map((x) => x.to)).toEqual(["https://c.jp/R9douromouzu.pdf"]);
  });

  it("前回の記録が無ければ、図の名前とリンクの文字で探す（太田市の「1 [PDFファイル／1.58MB]」）", () => {
    const r = findReplacements(
      [
        { label: "1", url: "https://c.jp/a/26156.pdf" },
        { label: "2", url: "https://c.jp/a/26157.pdf" },
      ],
      page([
        ["https://c.jp/a/30001.pdf", "1 [PDFファイル／1.60MB]"],
        ["https://c.jp/a/26157.pdf", "2 [PDFファイル／8.86MB]"],
      ]),
    );
    expect(r.replaced).toEqual([{ label: "1", from: "https://c.jp/a/26156.pdf", to: "https://c.jp/a/30001.pdf", text: "1 [PDFファイル／1.60MB]" }]);
  });

  it("候補が2つ以上・0個なら追わずに人の確認に回す", () => {
    const r = findReplacements(
      [{ label: "A-12", url: "https://c.jp/A-12.pdf" }],
      page([
        ["https://c.jp/new1/A-12.pdf", "A-12"],
        ["https://c.jp/new2/A-12.pdf", "A-12"],
      ]),
    );
    expect(r.replaced).toEqual([]);
    expect(r.unresolved.map((u) => u.label)).toEqual(["A-12"]);
  });

  it("同じ PDF を複数の図が使う（10枚綴り）ときは、まとめて1回差し替える", () => {
    const r = findReplacements(
      [
        { label: "1", url: "https://c.jp/kita01.pdf" },
        { label: "2", url: "https://c.jp/kita01.pdf" },
      ],
      page([["https://c.jp/kita01_r8.pdf", "指定道路図 その1"]]),
      { "https://c.jp/kita01.pdf": "指定道路図 その1" },
    );
    expect(r.replaced).toEqual([{ label: "1・2", from: "https://c.jp/kita01.pdf", to: "https://c.jp/kita01_r8.pdf", text: "指定道路図 その1" }]);
  });
});
