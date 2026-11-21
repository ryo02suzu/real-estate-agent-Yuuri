import { describe, expect, it } from "vitest";
import { linkTexts } from "./link-texts";
import { buildLinks, findMunicipality } from "./municipalities";
import { centeredPdfUrl, PDF_TEMPLATES, pdfLayout, pdfView, pdfViewerOf, pointOnPage, toUserSpace, VIEW_M, type PdfLayout } from "./sheet-pdf";

// ふつうの PC の窓（CSS px）
const SIZE = { width: 1440, height: 900 };
const PX = 96 / 72;

describe("図の範囲の中の位置 → PDF の頁の上の点", () => {
  const layout: PdfLayout = { page: [1000, 800], rotate: 0, frame: [100, 50, 900, 650] };
  it("四隅と真ん中", () => {
    expect(pointOnPage(layout, [0, 0])).toEqual([100, 50]);
    expect(pointOnPage(layout, [1, 0])).toEqual([900, 50]);
    expect(pointOnPage(layout, [0, 1])).toEqual([100, 650]);
    expect(pointOnPage(layout, [1, 1])).toEqual([900, 650]);
    expect(pointOnPage(layout, [0.5, 0.5])).toEqual([500, 350]);
  });
});

describe("画面に出る向きの点 → Firefox（pdf.js）の座標（回転の前の向き・左下が原点で上向き）", () => {
  // 回転の前の頁：幅 1000 × 高さ 600
  const at = (rotate: PdfLayout["rotate"]) => {
    const page: [number, number] = rotate % 180 === 0 ? [1000, 600] : [600, 1000];
    return (p: [number, number]) => toUserSpace({ page, rotate, frame: [0, 0, 1, 1] }, p);
  };
  it("回転なし：上下が逆になる", () => {
    const f = at(0);
    expect(f([0, 0])).toEqual([0, 600]); // 画面の左上 = 頁の左上
    expect(f([1000, 600])).toEqual([1000, 0]); // 画面の右下 = 頁の右下
    expect(f([250, 100])).toEqual([250, 500]);
  });
  it("90° 回して表示（時計回り）：画面の左上は頁の左下、画面の右上は頁の左上", () => {
    const f = at(90);
    expect(f([0, 0])).toEqual([0, 0]);
    expect(f([600, 0])).toEqual([0, 600]);
    expect(f([600, 1000])).toEqual([1000, 600]);
    expect(f([100, 250])).toEqual([250, 100]);
  });
  it("180° 回して表示：画面の左上は頁の右下", () => {
    const f = at(180);
    expect(f([0, 0])).toEqual([1000, 0]);
    expect(f([1000, 600])).toEqual([0, 600]);
  });
  it("270° 回して表示：画面の左上は頁の右上、画面の左下は頁の左上", () => {
    const f = at(270);
    expect(f([0, 0])).toEqual([1000, 600]);
    expect(f([0, 1000])).toEqual([0, 600]);
    expect(f([600, 1000])).toEqual([0, 0]);
  });
});

describe("見える範囲（倍率と左上）", () => {
  // 1/2500 の図郭（2000m を 2267.7pt）を A0 の頁に置いた形
  const layout: PdfLayout = { page: [2835, 2004], rotate: 0, frame: [128.2, 124.8, 2395.8, 1825.4] };
  it("見える幅が約 300m の倍率。物件が見える範囲の真ん中に来る（Chrome は道具の帯 56px、Firefox は 32px を除く）", () => {
    const c = pdfView(layout, [0.5, 0.5], 2000, "chromium", SIZE);
    expect(c.zoom).toBe(318);
    const z = c.zoom / 100;
    const mPerPt = 2000 / (2395.8 - 128.2);
    expect((SIZE.width / (PX * z)) * mPerPt).toBeCloseTo(VIEW_M, -1);
    expect(c.center[0] - c.topLeft[0]).toBeCloseTo(SIZE.width / (2 * PX * z), 6);
    expect(c.center[1] - c.topLeft[1]).toBeCloseTo((SIZE.height - 56) / (2 * PX * z), 6);
    const f = pdfView(layout, [0.5, 0.5], 2000, "pdfjs", SIZE);
    expect(f.center[1] - f.topLeft[1]).toBeCloseTo((SIZE.height - 32) / (2 * PX * z), 6);
  });
  it("図の端の物件は、頁からはみ出さないよう頁の中に寄せる（左上の角・右下の角）", () => {
    // 図の左上の角：左は頁の端に寄せ、上は頁の余白の中に収まるのでそのまま
    const tl = pdfView(layout, [0, 0], 2000, "chromium", SIZE);
    expect(tl.topLeft[0]).toBe(0);
    expect(tl.topLeft[1]).toBeCloseTo(124.8 - (SIZE.height - 56) / (2 * PX * (tl.zoom / 100)), 6);
    // 図の外（隣の図から見た物件）は、上も左も頁の端に寄せる
    expect(pdfView(layout, [-0.1, -0.1], 2000, "chromium", SIZE).topLeft).toEqual([0, 0]);
    // 右下の角は、頁の右と下に凡例などの余白があるので、真ん中のまま
    const br = pdfView(layout, [1, 1], 2000, "chromium", SIZE);
    expect(br.center[0] - br.topLeft[0]).toBeCloseTo(SIZE.width / (2 * PX * (br.zoom / 100)), 6);
    // 頁の右下の角より外は、頁の右下の端に寄せる
    const v = pdfView(layout, [1.2, 1.2], 2000, "chromium", SIZE);
    const z = v.zoom / 100;
    expect(v.topLeft[0]).toBeCloseTo(2835 - SIZE.width / (PX * z), 6);
    expect(v.topLeft[1]).toBeCloseTo(2004 - (SIZE.height - 56) / (PX * z), 6);
  });
  it("倍率は 25%〜500% に収める（小さい縮尺の図は 500%、大きい縮尺の図は下限まで）", () => {
    expect(pdfView(layout, [0.5, 0.5], 20000, "chromium", SIZE).zoom).toBe(500);
    expect(pdfView(layout, [0.5, 0.5], 50, "chromium", SIZE).zoom).toBe(25);
    // 1/500 の図郭（400m）は 64%
    expect(pdfView(layout, [0.5, 0.5], 400, "chromium", SIZE).zoom).toBe(64);
  });
});

describe("ブラウザの PDF ビューア", () => {
  it("PC の Chrome は Chromium の読み方、Firefox は pdf.js の読み方。Edge・Safari・スマホには付けない", () => {
    expect(pdfViewerOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36")).toBe("chromium");
    expect(pdfViewerOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36")).toBe("chromium");
    expect(pdfViewerOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0")).toBe("pdfjs");
    expect(pdfViewerOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0")).toBeUndefined();
    expect(pdfViewerOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15")).toBeUndefined();
    expect(pdfViewerOf("Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1")).toBeUndefined();
    expect(pdfViewerOf("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36")).toBeUndefined();
  });
});

describe("図の作りの表", () => {
  it("どの作りも、図の範囲が頁の中にあり、URL の頭は https", () => {
    for (const t of PDF_TEMPLATES)
      for (const l of [t, ...(t.variants ?? []).map((v) => v.layout)]) {
        const [x0, y0, x1, y1] = l.frame;
        expect(x0 >= 0 && y0 >= 0 && x1 <= l.page[0] + 1 && y1 <= l.page[1] + 1 && x1 > x0 && y1 > y0, t.name).toBe(true);
        expect(t.prefix, t.name).toMatch(/^https:\/\//);
      }
  });
  it("作りの違う図は名前で選ぶ（大仙市の A4 の6枚・習志野市の袖ケ浦・鷺沼ほか）", () => {
    const daisen = "https://www.city.daisen.lg.jp/uploads/public/archive_0000000485_01/";
    expect(pdfLayout("10MD021", `${daisen}62_10MD021.pdf`)?.rotate).toBe(90);
    expect(pdfLayout("10LD723", `${daisen}27_10LD723.pdf`)?.page).toEqual([3370.39, 2383.94]);
    const nara = "https://www.city.narashino.lg.jp/material/files/group/38/";
    expect(pdfLayout("袖ケ浦・鷺沼ほか", `${nara}sode.pdf`)?.rotate).toBe(0);
    expect(pdfLayout("谷津・津田沼ほか", `${nara}yatsu.pdf`)?.rotate).toBe(270);
  });
  it("市全体で1枚の図は、測った図の URL だけ（作り直された図に差し替わったら付けない）", () => {
    expect(pdfLayout("市全体", "https://www.city.fujimino.saitama.jp/material/files/group/31/R8douromouzu.pdf")).toBeDefined();
    expect(pdfLayout("市全体", "https://www.city.fujimino.saitama.jp/material/files/group/31/R9douromouzu.pdf")).toBeUndefined();
  });
});

describe("本物の市で作る URL", () => {
  const link = (code: string, lat: number, lng: number, i = 0) => buildLinks(findMunicipality(code)!, lat, lng)[i];

  it("草加市役所（13-24 の右下）：Chrome は 63%・Firefox は PDF の座標で、物件を真ん中に", () => {
    const l = link("11221", 35.825054, 139.805649);
    const s = l.sheet!;
    expect(s.at).toEqual([0.74667, 0.69749]);
    expect(centeredPdfUrl(s, s.bounds, "chromium", SIZE)).toBe(`${l.url}#page=1&zoom=63,1839,1391&navpanes=0`);
    expect(centeredPdfUrl(s, s.bounds, "pdfjs", SIZE)).toBe(`${l.url}#page=1&zoom=63,1375,1357&pagemode=none`);
    expect(centeredPdfUrl(s, s.bounds, undefined, SIZE)).toBeUndefined();
  });

  it("福島県の指定道路図（白河合同庁舎の FE881）は 318%", () => {
    const s = link("07205", 37.131145, 140.199081).sheet!;
    expect(centeredPdfUrl(s, s.bounds, "chromium", SIZE)).toBe(`${s.url}#page=1&zoom=318,704,682&navpanes=0`);
  });

  it("北区の10枚綴りの PDF は、もとの頁（#page=2）のまま", () => {
    const s = link("13117", 35.752802, 139.733743).sheet!;
    expect(s.url).toMatch(/#page=2$/);
    expect(centeredPdfUrl(s, s.bounds, "chromium", SIZE)).toBe(`${s.url.split("#")[0]}#page=2&zoom=317,555,377&navpanes=0`);
  });

  it("大仙市役所（10MD021。縦の A4 を 90° 回して表示）は、Firefox では回転の前の向きの座標にする", () => {
    const s = link("05212", 39.452633, 140.476227).sheet!;
    expect(centeredPdfUrl(s, s.bounds, "chromium", SIZE)).toBe(`${s.url}#page=1&zoom=500,502,294&navpanes=0`);
    expect(centeredPdfUrl(s, s.bounds, "pdfjs", SIZE)).toBe(`${s.url}#page=1&zoom=500,217,373&pagemode=none`);
  });

  it("隣の図も、物件のいる側（図の外）を真ん中にして開く（桐生市役所：L023L の左の端、隣は K023R）", () => {
    const s = link("10203", 36.405319, 139.330597).sheet!;
    expect(s.neighbor).toBeDefined();
    const [u] = s.neighbor!.at;
    expect(u > 0.9 || u < 0.1).toBe(true);
    expect(centeredPdfUrl(s.neighbor!, s.bounds, "chromium", SIZE)).toMatch(/\.pdf#page=1&zoom=\d+,\d+,\d+&navpanes=0$/);
  });

  it("測っていない図（青森県の ZIP・日光市の画像・四街道市の地図システム）は付けない", () => {
    for (const s of [link("02301", 40.926051, 140.955937).sheet!, link("09206", 36.719971, 139.698029).sheet!, link("12228", 35.6697, 140.1679).sheet!])
      expect(centeredPdfUrl(s, s.bounds, "chromium", SIZE)).toBeUndefined();
  });

  it("PC の地図ボタンの説明：拡大して開くときだけ言い方を変え、「図の右下あたり」は残す（スマホは今までどおり）", () => {
    const l = link("11221", 35.825054, 139.805649);
    expect(linkTexts(l, false, undefined, true)).toEqual({ sub: "図（13-24）を物件のあたりで拡大して開きます", tip: "物件は図の右下あたりです。" });
    expect(linkTexts(l)).toEqual({ sub: "物件が載っている図（13-24）が開きます", tip: "物件は図の右下あたりです。" });
    const whole = link("11245", 35.879875, 139.519592);
    expect(linkTexts(whole, false, undefined, true).sub).toBe("市全体の図を物件のあたりで拡大して開きます");
  });
});
