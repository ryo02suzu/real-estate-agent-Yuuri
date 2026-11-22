import { describe, expect, it } from "vitest";
import type { DraftSection } from "./draft";
import { DRAFT_NOTE } from "./draft";
import { OVERVIEW_HEAD, overviewFileName, overviewName, overviewSheet, overviewXlsx } from "./overview-xlsx";
import { colName, crc32, sheetName, XLSX_STYLE, xmlText } from "./xlsx";

/** 圧縮しない ZIP を読む（テスト用）：中央の目録から、名前・CRC・中身 */
function readZip(buf: Uint8Array): { name: string; crc: number; data: Uint8Array }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const end = buf.length - 22;
  expect(dv.getUint32(end, true)).toBe(0x06054b50);
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const out: { name: string; crc: number; data: Uint8Array }[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50);
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    expect(dv.getUint32(local, true)).toBe(0x04034b50);
    const localName = dv.getUint16(local + 26, true);
    const data = buf.subarray(local + 30 + localName, local + 30 + localName + size);
    out.push({ name, crc, data });
    p += 46 + nameLen;
  }
  return out;
}

const SECTIONS: DraftSection[] = [
  {
    title: "物件の表示",
    rows: [
      { label: "所在（住所）", value: "東京都千代田区丸の内1丁目9-1" },
      { label: "所在（地番）", value: "丸の内一丁目 1番1", note: "公図から推定した位置", check: true },
    ],
  },
  {
    title: "都市計画法・建築基準法に基づく制限（参考）",
    rows: [
      { label: "用途地域", value: "商業地域" },
      { label: "建ぺい率", value: "80%（指定）" },
      { label: "道路の種別", value: "要確認", note: "建築指導課 <窓口> & 地図", check: true },
      { label: "防火指定", value: "防火地域", note: "確認済み 窓口で聞いた", confirmed: true },
    ],
  },
  { title: "出典", rows: [{ label: "", value: "都市計画の出典：国土交通省 都市計画決定GISデータ" }] },
];

describe("Excel のファイル（.xlsx）の作り", () => {
  it("圧縮しない ZIP に、決まった名前のファイルがそろい、CRC が中身と合う", () => {
    const bytes = overviewXlsx(SECTIONS, "丸の内一丁目 1番1", new Date(2026, 10, 22, 9, 30));
    const files = readZip(bytes);
    expect(files.map((f) => f.name)).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/core.xml",
      "docProps/app.xml",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    for (const f of files) expect(f.crc).toBe(crc32(f.data));
    const sheet = new TextDecoder().decode(files.find((f) => f.name === "xl/worksheets/sheet1.xml")!.data);
    // 記号は書き換え、文字はそのまま
    expect(sheet).toContain("建築指導課 &lt;窓口&gt; &amp; 地図");
    expect(sheet).toContain("商業地域");
    // 見出しの行で表示を止め、印刷の各ページにも付ける
    expect(sheet).toContain('<pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>');
    const book = new TextDecoder().decode(files.find((f) => f.name === "xl/workbook.xml")!.data);
    expect(book).toContain('<sheet name="物件概要書"');
    expect(book).toContain("'物件概要書'!$3:$3");
  });

  it("CRC-32 は決まった値（\"123456789\" → CBF43926）", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });

  it("XML に入れられない制御文字を外し、記号を書き換える。列の名前・シートの名前", () => {
    expect(xmlText('a\u0001b<c>&"d"')).toBe("ab&lt;c&gt;&amp;&quot;d&quot;");
    expect(xmlText("1行目\n2行目\tタブ")).toBe("1行目\n2行目\tタブ");
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(sheetName("a/b:c?[d]*e")).toBe("a b c  d  e");
    expect(sheetName("あ".repeat(40))).toHaveLength(31);
  });
});

describe("物件概要書の表", () => {
  const sheet = overviewSheet(SECTIONS, "丸の内一丁目 1番1", new Date(2026, 10, 22));
  const text = (r: number, c: number) => sheet.rows[r]?.[c]?.v ?? "";

  it("表題・作成日・列の見出しのあとに、欄ごとの見出しと項目を並べる", () => {
    expect(text(0, 0)).toBe("物件概要書（下書き）　丸の内一丁目 1番1");
    expect(text(1, 0)).toContain("作成 2026年11月22日");
    expect(text(1, 0)).toContain("法令上の判断はしていません");
    expect(sheet.rows[2].map((c) => c?.v)).toEqual([...OVERVIEW_HEAD]);
    expect(text(3, 0)).toBe("物件の表示");
    expect(sheet.rows[3][0]?.s).toBe(XLSX_STYLE.section);
    expect(sheet.rows[4].map((c) => c?.v)).toEqual(["所在（住所）", "東京都千代田区丸の内1丁目9-1", "", ""]);
  });

  it("確かめる必要のある欄は「要確認」、あなたが確かめた欄は「確認済み」。確かめる先は右の列", () => {
    const row = (label: string) => sheet.rows.find((r) => r[0]?.v === label)!;
    expect(row("所在（地番）")[2]).toEqual({ v: "要確認", s: XLSX_STYLE.check });
    expect(row("所在（地番）")[3]?.v).toBe("公図から推定した位置");
    expect(row("道路の種別").map((c) => c?.v)).toEqual(["道路の種別", "要確認", "要確認", "建築指導課 <窓口> & 地図"]);
    expect(row("防火指定")[2]).toEqual({ v: "確認済み", s: XLSX_STYLE.done });
    expect(row("用途地域")[2]?.v).toBe("");
  });

  it("出典は最後にまとめ、いちばん下に注意（法令上の判断はしない）", () => {
    const i = sheet.rows.findIndex((r) => r[0]?.v === "出典" && r[0]?.s === XLSX_STYLE.section);
    expect(i).toBeGreaterThan(0);
    expect(text(i + 1, 1)).toBe("都市計画の出典：国土交通省 都市計画決定GISデータ");
    const last = sheet.rows[sheet.rows.length - 1];
    expect(last.map((c) => c?.v)).toEqual(["注意", DRAFT_NOTE, "", ""]);
  });

  it("セルをつなぐのは、表題・作成日・欄の見出しの行だけ（長い文は折り返して、Excel が高さを合わせる）", () => {
    const merged = sheet.merges!.map((m) => Number(m.match(/^A(\d+):/)![1]) - 1);
    for (const r of merged) expect([XLSX_STYLE.title, XLSX_STYLE.small, XLSX_STYLE.section]).toContain(sheet.rows[r][0]?.s);
  });
});

describe("ファイルの名前と物件の名前", () => {
  it("地番があれば地番、無ければ住所。ファイル名に使えない記号と空白を外す", () => {
    expect(overviewName(SECTIONS)).toBe("丸の内一丁目 1番1");
    expect(overviewName([{ title: "物件の表示", rows: [{ label: "所在（住所）", value: "大阪市北区梅田1" }, { label: "所在（地番）", value: "要確認" }] }])).toBe("大阪市北区梅田1");
    expect(overviewFileName("丸の内一丁目 1番1", new Date(2026, 10, 2))).toBe("物件概要書_丸の内一丁目1番1_20261102.xlsx");
    expect(overviewFileName('a/b:c*?"<>|', new Date(2026, 0, 9))).toBe("物件概要書_abc_20260109.xlsx");
    expect(overviewFileName("", new Date(2026, 0, 9))).toBe("物件概要書_物件_20260109.xlsx");
  });
});
