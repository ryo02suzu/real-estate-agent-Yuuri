import { describe, expect, it } from "vitest";
import type { DraftSection } from "./draft";
import { buildDraft, DRAFT_NOTE } from "./draft";
import { AREA_ROWS, OVERVIEW_COLS, OVERVIEW_HEAD, overviewFileName, overviewName, overviewParts, overviewSheet, overviewXlsx, PHOTO_HEIGHT, type OverviewItem } from "./overview-xlsx";
import { buildLinks, findMunicipality } from "./roadmap";
import { HAZARDS } from "./roadmap/hazard";
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

/** 下書きの欄（buildDraft と同じ形。物件概要書に載せない欄・載せない行も入れてある） */
const SECTIONS: DraftSection[] = [
  {
    title: "物件の表示",
    rows: [
      { label: "所在（住所）", value: "東京都千代田区丸の内1丁目9-1" },
      { label: "所在（地番）", value: "丸の内一丁目 1番1", note: "公図から推定した位置", check: true, src: "parcel" },
      { label: "隣地の地番", value: "丸の内一丁目 1番2" },
      { label: "地番の参考図", value: "千代田区の地番参考図（https://example.jp/chiban）", note: "課税用の参考図" },
      { label: "緯度・経度", value: "35.681236, 139.767125" },
    ],
  },
  {
    title: "都市計画法・建築基準法に基づく制限（参考）",
    rows: [
      { label: "用途地域", value: "商業地域", src: "zoning" },
      { label: "建ぺい率", value: "80%（指定）", src: "zoning" },
      { label: "データの時点", value: "千代田区：2024年" },
      { label: "建築基準法39条（災害危険区域）", value: "区域外（国のデータ・参考）", check: true, area: "out", src: "hourei" },
    ],
  },
  {
    title: "その他の法令に基づく制限（参考）",
    rows: [
      { label: "砂防・急傾斜地などの区域", value: "区域内", note: "確認済み 11/3・窓口", confirmed: true },
      { label: "宅地造成及び特定盛土等規制法", value: "宅地造成等工事規制区域（国のデータ・参考）", note: "東京都が指定 <告示> & 地図", check: true, area: "in", src: "morido" },
      { label: "盛土規制法の確認先", value: "東京都の盛土規制法の地図", note: "https://example.jp/morido" },
      { label: "急傾斜地法（急傾斜地崩壊危険区域）", value: "区域外（国のデータ・参考）", check: true, area: "out", src: "hourei" },
      { label: "自然公園法・農業振興地域の整備に関する法律・森林法", value: "要確認", note: "都道府県で確認", check: true },
      { label: "文化財保護法（埋蔵文化財包蔵地）", value: "包蔵地ではない", note: "確認済み 11/3・電話", confirmed: true },
    ],
  },
  { title: "敷地と道路との関係（参考）", rows: [{ label: "道路の種別・幅員", value: "要確認", note: "市の道路種別の地図・窓口で確認", check: true }] },
  {
    title: "飲用水・ガス・排水施設（参考）",
    rows: [
      { label: "飲用水（上水道）", value: "要確認", note: "東京都水道局で確認", check: true },
      { label: "水道の照会先", value: "東京都水道局", note: "https://example.jp/water" },
    ],
  },
  { title: "ハザードマップ（重要事項説明で所在地を示す市区町村の地図）", rows: [{ label: "洪水", value: "千代田区のハザードマップ", note: "https://example.jp/hm" }] },
  {
    title: "災害リスク（国のデータ・参考）",
    rows: [
      { label: "洪水（想定最大規模）", value: "浸水 0.5〜3m", check: true },
      { label: "土砂災害警戒区域等", value: "急傾斜地の崩壊の特別警戒区域", check: true, area: "in", src: "hazard" },
    ],
  },
  { title: "販売図面（物件概要）向け（参考）", rows: [{ label: "交通", value: "「東京」駅 徒歩約1分", check: true }] },
  { title: "周辺環境（販売図面の生活環境・参考）", rows: [{ label: "コンビニ", value: "コンビニ 徒歩約1分" }] },
  {
    title: "出典",
    rows: [
      { label: "", value: "筆の出典：登記所備付地図データ（法務省）を加工して作成", src: "parcel" },
      { label: "", value: "都市計画の出典：都市計画決定GISデータ（国土交通省）を加工して作成", src: "zoning" },
      { label: "", value: "災害リスクの出典：ハザードマップポータルサイトのデータを加工して作成", src: "hazard" },
      { label: "", value: "建物の出典：3D都市モデル（Project PLATEAU）を加工して作成", src: "building" },
      { label: "", value: "国土数値情報の出典：（盛土規制法・駅・地価）", src: "ksj" },
      { label: "", value: "周辺施設：© OpenStreetMap contributors（ODbL）", src: "poi" },
      { label: "", value: "東京都の区域のデータについて：（急傾斜地）…", src: "notes" },
    ],
  },
];

const labels = (items: OverviewItem[]) => items.map((it) => ("row" in it ? it.row.label : "sub" in it ? `[${it.sub}]` : `{${it.area}}`));

describe("物件概要書に載せる欄（持ち主の指示 2026-11-22）", () => {
  const { parts, credits } = overviewParts(SECTIONS);
  const part = (re: RegExp) => parts.find((p) => re.test(p.title))!;

  it("物件の表示・都市計画・その他の法令・上下水道だけ。道路・ハザード・災害リスク・販売図面・周辺環境・出典の欄は載せない", () => {
    expect(parts.map((p) => p.title)).toEqual(["物件の表示", "都市計画法・建築基準法に基づく制限（参考）", "その他の法令に基づく制限（参考）", "飲用水・ガス・排水施設（参考）"]);
  });

  it("物件の表示は、所在のあとに土地と建物に分け、登記簿の地積・床面積を書き込む欄を置く（緯度経度・隣地・地番の参考図は載せない）", () => {
    expect(labels(part(/^物件の表示/).items)).toEqual(["所在（住所）", "[土地]", "所在（地番）", `{${AREA_ROWS.land}}`, "[建物]", `{${AREA_ROWS.building}}`]);
  });

  it("都市計画：データの時点と、区域に入らない建築基準法39条は載せない", () => {
    expect(labels(part(/^都市計画法/).items)).toEqual(["用途地域", "建ぺい率"]);
  });

  it("その他の法令：国のデータで区域に入るもの・確かめて当てはまったもの・土砂災害の区域だけ（区域外・要確認・確認先の地図・当てはまらなかった確認は載せない）", () => {
    const items = part(/^その他の法令/).items;
    expect(labels(items)).toEqual(["砂防・急傾斜地などの区域", "宅地造成及び特定盛土等規制法", "土砂災害防止法（土砂災害警戒区域等）"]);
    const dosha = items.find((it) => "row" in it && it.row.label.startsWith("土砂災害防止法"));
    expect(dosha && "row" in dosha && dosha.row).toMatchObject({ value: "急傾斜地の崩壊の特別警戒区域（国のデータ・参考）", check: true });
  });

  it("上下水道：照会先・台帳のページ（URL だけの欄）は載せない", () => {
    expect(labels(part(/^飲用水/).items)).toEqual(["飲用水（上水道）"]);
  });

  it("出典は、載せた欄のデータの分だけ（建物・駅・周辺施設などの出典は入れない）", () => {
    expect(credits).toHaveLength(4);
    expect(credits[0]).toBe("筆の出典：登記所備付地図データ（法務省）を加工して作成");
    expect(credits[1]).toBe("都市計画の出典：都市計画決定GISデータ（国土交通省）を加工して作成");
    expect(credits[2]).toMatch(/^盛土規制法の出典：「国土数値情報（宅地造成等工事規制区域・特定盛土等規制区域データ）」（国土交通省、https:\/\/nlftp\.mlit\.go\.jp\/ksj\/）を加工して作成/);
    expect(credits[3]).toBe("災害リスクの出典：ハザードマップポータルサイトのデータを加工して作成");
  });

  it("建築基準法39条は、国のデータで災害危険区域に入るときは載せる（その出典と、都県の特記事項も）", () => {
    const inside = SECTIONS.map((s) => ({ ...s, rows: s.rows.map((r) => (r.label.startsWith("建築基準法39条") ? { ...r, value: "区域内（国のデータ・参考）", area: "in" as const } : r)) }));
    const got = overviewParts(inside);
    expect(labels(got.parts.find((p) => /^都市計画法/.test(p.title))!.items)).toContain("建築基準法39条（災害危険区域）");
    expect(got.credits.some((c) => c.startsWith("国土数値情報の出典：") && c.includes("砂防指定地など：") && c.includes("盛土規制法："))).toBe(true);
    expect(got.credits).toContain("東京都の区域のデータについて：（急傾斜地）…");
  });

  it("区域に入る法令が無ければ、その他の法令の欄ごと載せない", () => {
    const none = SECTIONS.map((s) => ({ ...s, rows: s.rows.filter((r) => r.area !== "in" && !r.confirmed) }));
    expect(overviewParts(none).parts.map((p) => p.title)).not.toContain("その他の法令に基づく制限（参考）");
  });
});

describe("下書き（buildDraft）からの通し", () => {
  const m = findMunicipality("13101")!;
  const base = {
    status: "ok" as const,
    lat: 35.6895,
    lng: 139.7441,
    matchedAddress: "東京都千代田区三番町",
    town: "三番町",
    approximate: false,
    municipality: m,
    links: buildLinks(m, 35.6895, 139.7441),
  };
  const dosha = HAZARDS.dosha.layers[0];
  const draft = buildDraft(base, {
    zoning: {
      zoning: {
        youto: [{ name: "第一種住居地域", code: 5, bcr: 60, far: 400 }],
        youtoNear: [],
        senbiki: "市街化区域",
        tokei: true,
        jyuntoshi: false,
        bouka: "準防火地域",
        koudoti: true,
        others: [{ layer: "chikukei", label: "地区計画", name: "番町地区地区計画" }],
      },
      st: { city: "千代田区", asOf: "2024年", layers: { senbiki: 1, youto: 1, bouka: 1, koudoti: 1, chikukei: 1, tokei: 1 } },
      morido: {
        area: { kind: "宅地造成等工事規制区域", city: "13101", level: "A", notice: "東京都告示第852号", since: "2024-07-31" },
        authority: "東京都",
        link: { label: "東京都の盛土規制法の地図", url: "https://www2.wagmap.jp/tokyo_tokeizu/Map?mid=4" },
      },
      hourei: { pref: "13", hits: [{ kind: "急傾斜地崩壊危険区域", name: "三番町1丁目", pref: "13", notice: "第605号", since: "2005-04-06" }], missing: [] },
      tochi: { park: "特別地域", year: 2015 },
    },
    parcels: { target: "千代田区三番町 2-1", neighbors: ["千代田区三番町 2-2"], reference: false },
    roads: [{ label: "法第42条第1項第1号道路", short: "1項1号", direction: "北", distance: 4.2, width: "6.0m" } as never],
    hazard: {
      report: { dosha: { status: "ok", hits: [{ layer: dosha, at: dosha.classes[0] }] } },
      elevation: null,
      maps: {},
      muniCd: "13101",
    },
  });
  const { parts, credits } = overviewParts(draft);
  const part = (re: RegExp) => parts.find((p) => re.test(p.title))!;

  it("下書きの欄に付けた区域の印（area）と、何のデータか（src）で選ぶ", () => {
    expect(labels(part(/^物件の表示/).items)).toEqual(["所在（住所）", "[土地]", "所在（地番）", `{${AREA_ROWS.land}}`, "[建物]", `{${AREA_ROWS.building}}`]);
    const law = labels(part(/^都市計画法/).items);
    expect(law).toContain("地区計画");
    expect(law).not.toContain("データの時点");
    expect(law.some((l) => l.startsWith("建築基準法39条"))).toBe(false);
    expect(labels(part(/^その他の法令/).items)).toEqual(["宅地造成及び特定盛土等規制法", "急傾斜地法（急傾斜地崩壊危険区域）", "自然公園法", "土砂災害防止法（土砂災害警戒区域等）"]);
    expect(parts.some((p) => /^(敷地と道路|ハザードマップ|災害リスク|出典)/.test(p.title))).toBe(false);
  });

  it("出典は筆・都市計画・国土数値情報（盛土・砂防など・自然公園など）・東京都の特記事項・土砂災害（災害リスク）", () => {
    expect(credits[0]).toMatch(/^筆の出典：「登記所備付地図データ」（法務省）/);
    expect(credits[1]).toMatch(/^都市計画の出典：都市計画決定GISデータ（国土交通省）/);
    expect(credits[2]).toMatch(/^国土数値情報の出典：「国土数値情報」（国土交通省、https:\/\/nlftp\.mlit\.go\.jp\/ksj\/）を加工して作成（盛土規制法：.+／砂防指定地など：.+／自然公園・農振・森林：.+）$/);
    expect(credits[2]).not.toMatch(/地価|駅|学区/);
    expect(credits[3]).toMatch(/^東京都の区域のデータについて：/);
    expect(credits[4]).toMatch(/^災害リスクの出典：「ハザードマップポータルサイト」/);
    expect(credits).toHaveLength(5);
  });
});

describe("Excel のファイル（.xlsx）の作り", () => {
  it("圧縮しない ZIP に、決まった名前のファイルがそろい、CRC が中身と合う。A4 縦 1 ページに収めて印刷し、画面の枠線は出さない", () => {
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
    const text = (name: string) => new TextDecoder().decode(files.find((f) => f.name === name)!.data);
    const sheet = text("xl/worksheets/sheet1.xml");
    // 記号は書き換え、文字はそのまま
    expect(sheet).toContain("東京都が指定 &lt;告示&gt; &amp; 地図");
    expect(sheet).toContain("商業地域");
    expect(sheet).toContain('<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/>');
    expect(sheet).toContain('<printOptions horizontalCentered="1"/>');
    expect(sheet).toContain('<sheetView showGridLines="0" workbookViewId="0"/>');
    expect(sheet).not.toContain("<pane");
    // 面積の欄は、数を入れると「123.45㎡」と出る
    expect(text("xl/styles.xml")).toContain('<numFmt numFmtId="164" formatCode="#,##0.00&quot;㎡&quot;"/>');
    const book = text("xl/workbook.xml");
    expect(book).toContain('<sheet name="物件概要書"');
    expect(book).not.toContain("definedName");
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

describe("物件概要書の表（A4 縦 1 枚）", () => {
  const sheet = overviewSheet(SECTIONS, "丸の内一丁目 1番1", new Date(2026, 10, 22));
  const text = (r: number, c: number) => sheet.rows[r]?.[c]?.v ?? "";
  const at = (label: string) => sheet.rows.findIndex((r) => r[0]?.v === label);

  it("表題・作成日・列の見出しのあとに、欄ごとの見出しと項目を並べる", () => {
    expect(text(0, 0)).toBe("物件概要書（下書き）　丸の内一丁目 1番1");
    expect(text(1, 0)).toContain("作成 2026年11月22日");
    expect(text(1, 0)).toContain("法令上の判断はしていません");
    expect(sheet.rows[2].map((c) => c?.v)).toEqual([...OVERVIEW_HEAD]);
    expect(text(3, 0)).toBe("物件の表示");
    expect(sheet.rows[3][0]?.s).toBe(XLSX_STYLE.section);
    expect(sheet.rows[4].map((c) => c?.v)).toEqual(["所在（住所）", "東京都千代田区丸の内1丁目9-1", "", ""]);
    expect(sheet.print).toBe("page");
    expect(sheet.hideGrid).toBe(true);
    expect(sheet.freezeBelow).toBeUndefined();
  });

  it("土地・建物は小見出しの行。地積・床面積は空けて、数を入れる欄の見た目（㎡）にする", () => {
    for (const sub of ["土地", "建物"]) expect(sheet.rows[at(sub)][0]?.s).toBe(XLSX_STYLE.sub);
    expect(at("土地")).toBeLessThan(at("所在（地番）"));
    expect(at("所在（地番）")).toBeLessThan(at(AREA_ROWS.land));
    expect(at(AREA_ROWS.land)).toBeLessThan(at("建物"));
    expect(at("建物")).toBeLessThan(at(AREA_ROWS.building));
    for (const label of [AREA_ROWS.land, AREA_ROWS.building]) expect(sheet.rows[at(label)][1]).toEqual({ v: "", s: XLSX_STYLE.area });
  });

  it("確かめる必要のある欄は「要確認」、あなたが確かめた欄は「確認済み」。確かめる先は右の列", () => {
    const row = (label: string) => sheet.rows[at(label)];
    expect(row("所在（地番）")[2]).toEqual({ v: "要確認", s: XLSX_STYLE.check });
    expect(row("所在（地番）")[3]?.v).toBe("公図から推定した位置");
    expect(row("砂防・急傾斜地などの区域")[2]).toEqual({ v: "確認済み", s: XLSX_STYLE.done });
    expect(row("用途地域")[2]?.v).toBe("");
  });

  it("いちばん下に写真を貼る枠（左右 2 つ。同じ幅）、その下に注意と出典（小さな字）", () => {
    const head = at("写真");
    expect(sheet.rows[head][0]?.s).toBe(XLSX_STYLE.section);
    const n = head + 2; // 写真の枠の行（1 から数える）
    expect(sheet.rows[head + 1].map((c) => c?.s)).toEqual(Array(4).fill(XLSX_STYLE.photo));
    expect(sheet.merges).toContain(`A${n}:B${n}`);
    expect(sheet.merges).toContain(`C${n}:D${n}`);
    expect(OVERVIEW_COLS[0] + OVERVIEW_COLS[1]).toBe(OVERVIEW_COLS[2] + OVERVIEW_COLS[3]);
    expect(sheet.heights![n]).toBeGreaterThanOrEqual(PHOTO_HEIGHT.min);
    expect(sheet.heights![n]).toBeLessThanOrEqual(PHOTO_HEIGHT.max);
    const last = sheet.rows[sheet.rows.length - 1];
    expect(last[0]?.s).toBe(XLSX_STYLE.fine);
    expect(last[0]?.v.startsWith(DRAFT_NOTE)).toBe(true);
    expect(last[0]?.v).toContain("都市計画の出典：");
    expect(last[0]?.v).not.toContain("建物の出典");
    expect(sheet.heights![sheet.rows.length]).toBeGreaterThanOrEqual(40);
  });

  it("セルをつなぐのは、表題・作成日・欄の見出し・小見出し・注意の行と写真の枠だけ（長い文は折り返して、Excel が高さを合わせる）", () => {
    for (const m of sheet.merges!) {
      const r = Number(m.match(/^[A-D](\d+):/)![1]) - 1;
      expect([XLSX_STYLE.title, XLSX_STYLE.small, XLSX_STYLE.section, XLSX_STYLE.sub, XLSX_STYLE.fine, XLSX_STYLE.photo]).toContain(sheet.rows[r][0]?.s);
    }
  });

  it("載せない欄の言葉は表に出ない（いちばん下の出典の行は除く）", () => {
    const all = sheet.rows
      .slice(0, -1)
      .flatMap((r) => r.map((c) => c?.v ?? ""))
      .join("\n");
    for (const w of ["緯度・経度", "隣地の地番", "データの時点", "建築基準法39条", "敷地と道路", "ハザードマップ", "販売図面", "周辺環境", "コンビニ", "https://", "包蔵地ではない"]) expect(all).not.toContain(w);
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
