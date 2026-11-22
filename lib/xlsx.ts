// Excel のファイル（.xlsx）を、ブラウザの中で作る小さな部品（外の部品は使わない）。.xlsx は、決まった名前の XML の
// ファイルを ZIP にまとめたもの（Office Open XML）。ここでは圧縮しない ZIP（格納だけ）で作る（Excel・Numbers・
// LibreOffice・Google スプレッドシートが開ける）。文字は文字列として入れる（式・数の書式は使わない）。
// 物件の情報は端末の中で作るだけで、どこにも送らない。

/** セルの見た目（styles.xml の並びと同じ番号）。字の大きさは、A4 縦 1 枚に収める表に合わせた（表題 14pt・内容 9.5pt・確認先 8.5pt） */
export const XLSX_STYLE = {
  plain: 0,
  /** 表題（太字・大きめ） */
  title: 1,
  /** 小さな灰色の字（作成日・注意） */
  small: 2,
  /** 表の見出し（太字・薄い色の地・枠） */
  head: 3,
  /** 欄の見出し（白い太字・濃い色の地） */
  section: 4,
  /** 項目の名前（太字・ごく薄い地・枠・折り返し） */
  label: 5,
  /** 内容（枠・折り返し） */
  value: 6,
  /** 要確認（茶色の太字・枠・真ん中） */
  check: 7,
  /** 確認済み（緑の太字・枠・真ん中） */
  done: 8,
  /** 確認先・備考（小さめの字・枠・折り返し） */
  note: 9,
  /** 出典・注意（小さめの灰色の字・折り返し） */
  fine: 10,
  /** 欄の中の小見出し（土地・建物。紺の太字・薄い色の地・枠） */
  sub: 11,
  /** 面積を書き込む欄（数を入れると「123.45㎡」と出る。左寄せ・枠） */
  area: 12,
  /** 写真を貼る枠（枠だけ） */
  photo: 13,
} as const;
export type XlsxStyle = (typeof XLSX_STYLE)[keyof typeof XLSX_STYLE];

export type XlsxCell = { v: string; s?: XlsxStyle } | null;
export type XlsxSheet = {
  /** シートの名前（31 文字まで。 \ / ? * [ ] : は使えない） */
  name: string;
  /** 列の幅（文字数） */
  cols: number[];
  rows: XlsxCell[][];
  /** つなげるセル（"A1:D1" の形） */
  merges?: string[];
  /** 行の高さ（ポイント。書かない行は Excel が中身に合わせる） */
  heights?: Record<number, number>;
  /** この行の下で、上を止めて表示する（1 から数える。見出しを止める） */
  freezeBelow?: number;
  /** 印刷のたびに上に付ける行（1 から数える） */
  printTitleRow?: number;
  /** 印刷（A4 縦）：width は横を 1 ページの幅に合わせる（縦は何ページでも）、page は 1 ページに収める（横の真ん中に置き、余白を少し狭く） */
  print?: "width" | "page";
  /** 画面の枠線（セルの境の薄い線）を出さない（書類の見た目にする。印刷には元から出ない） */
  hideGrid?: boolean;
};
export type XlsxBook = { sheets: XlsxSheet[]; title?: string; creator?: string; created?: Date };

// ---------------------------------------------------------------- XML

/** XML に入れられない文字（タブ・改行以外の制御文字など）を外し、記号を書き換える */
export function xmlText(s: string): string {
  return (
    s
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

/** 列の番号（0 から）→ A, B, …, Z, AA */
export function colName(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** シートの名前を、Excel が受け付ける形に（使えない文字を外し、31 文字まで） */
export function sheetName(s: string): string {
  const t = s.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return t || "Sheet1";
}

const FONT_JA = '<name val="游ゴシック"/><family val="3"/><charset val="128"/><scheme val="minor"/>';
const BORDER = '<color rgb="FFC9D3E0"/>';
/** 面積の欄の数の書き方（123.45 と入れると「123.45㎡」） */
export const AREA_FORMAT = '#,##0.00"㎡"';
// 字の大きさ：0 は標準の字（列の幅の目盛りになる。11pt のまま）。表は A4 縦 1 枚に収まる大きさ（内容 9.5pt・確認先 8.5pt）
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="${xmlText(AREA_FORMAT)}"/></numFmts>
<fonts count="11">
<font><sz val="11"/><color theme="1"/>${FONT_JA}</font>
<font><b/><sz val="14"/><color rgb="FF133664"/>${FONT_JA}</font>
<font><sz val="8"/><color rgb="FF5F6B7A"/>${FONT_JA}</font>
<font><b/><sz val="9"/><color rgb="FF22314A"/>${FONT_JA}</font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/>${FONT_JA}</font>
<font><b/><sz val="9"/><color rgb="FF8A5A00"/>${FONT_JA}</font>
<font><b/><sz val="9"/><color rgb="FF1F8F5A"/>${FONT_JA}</font>
<font><sz val="8.5"/><color rgb="FF3D4A5C"/>${FONT_JA}</font>
<font><sz val="9.5"/><color theme="1"/>${FONT_JA}</font>
<font><b/><sz val="9.5"/><color rgb="FF133664"/>${FONT_JA}</font>
<font><sz val="7.5"/><color rgb="FF5F6B7A"/>${FONT_JA}</font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE3EBF6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF133664"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FB"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF0F8"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin">${BORDER}</left><right style="thin">${BORDER}</right><top style="thin">${BORDER}</top><bottom style="thin">${BORDER}</bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="8" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="10" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="9" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="164" fontId="8" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sh: XlsxSheet): string {
  const out: string[] = [];
  const page = sh.print === "page";
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  out.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
  out.push('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
  const grid = sh.hideGrid ? ' showGridLines="0"' : "";
  if (sh.freezeBelow) {
    const top = `A${sh.freezeBelow + 1}`;
    out.push(`<sheetViews><sheetView${grid} workbookViewId="0" zoomScale="100"><pane ySplit="${sh.freezeBelow}" topLeftCell="${top}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${top}" sqref="${top}"/></sheetView></sheetViews>`);
  } else out.push(`<sheetViews><sheetView${grid} workbookViewId="0"/></sheetViews>`);
  out.push('<sheetFormatPr defaultRowHeight="18.75"/>');
  out.push(`<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`);
  out.push("<sheetData>");
  sh.rows.forEach((row, ri) => {
    const r = ri + 1;
    const h = sh.heights?.[r];
    const cells = row
      .map((c, ci) => {
        if (!c) return "";
        const ref = `${colName(ci)}${r}`;
        const style = c.s ? ` s="${c.s}"` : "";
        if (c.v === "") return `<c r="${ref}"${style}/>`;
        return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlText(c.v)}</t></is></c>`;
      })
      .join("");
    out.push(`<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ""}>${cells}</row>`);
  });
  out.push("</sheetData>");
  if (sh.merges?.length) out.push(`<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`);
  // 1 ページに収めるときは、横の真ん中に置き、余白を少し狭くする（インチ。左右 1cm・上下 1.1cm ほど）
  if (page) out.push('<printOptions horizontalCentered="1"/>');
  out.push(page ? '<pageMargins left="0.4" right="0.4" top="0.45" bottom="0.45" header="0.2" footer="0.2"/>' : '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>');
  out.push(`<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="${page ? 1 : 0}"/>`);
  out.push("</worksheet>");
  return out.join("");
}

function isoDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** ブックの XML ファイル（名前と中身） */
export function xlsxFiles(book: XlsxBook): [string, string][] {
  const sheets = book.sheets.map((s) => ({ ...s, name: sheetName(s.name) }));
  const created = book.created ?? new Date();
  const files: [string, string][] = [];
  files.push([
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  ]);
  files.push([
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
  ]);
  files.push([
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(book.title ?? "")}</dc:title><dc:creator>${xmlText(book.creator ?? "MICHILU")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${isoDate(created)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${isoDate(created)}</dcterms:modified></cp:coreProperties>`,
  ]);
  files.push([
    "docProps/app.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MICHILU</Application></Properties>',
  ]);
  const defined = sheets
    .map((s, i) => (s.printTitleRow ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${s.name.replace(/'/g, "''")}'!$${s.printTitleRow}:$${s.printTitleRow}</definedName>` : ""))
    .join("");
  files.push([
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xmlText(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ""}</workbook>`,
  ]);
  files.push([
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  ]);
  files.push(["xl/styles.xml", STYLES_XML]);
  sheets.forEach((s, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]));
  return files;
}

// ---------------------------------------------------------------- ZIP（圧縮しない）

let CRC_TABLE: Uint32Array | null = null;
/** ZIP の CRC-32 */
export function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS の日時（ZIP の中のファイルの時刻） */
function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** ファイルを、圧縮せずに ZIP にまとめる（名前は UTF-8） */
export function zipStore(files: [string, Uint8Array][], at: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosTime(at);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // 名前は UTF-8
    lv.setUint16(8, 0, true); // 圧縮しない
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    parts.push(local, data);
    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + cenSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of [...parts, ...central, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/** ブックを .xlsx のバイト列に */
export function xlsxBytes(book: XlsxBook): Uint8Array {
  const enc = new TextEncoder();
  return zipStore(
    xlsxFiles(book).map(([n, s]) => [n, enc.encode(s)]),
    book.created,
  );
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
