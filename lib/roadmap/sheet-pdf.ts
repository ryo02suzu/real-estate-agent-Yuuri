// PDF の分割図を、物件の場所を真ん中にして拡大して開く（PC の Chrome・Firefox）。
//
// PDF の URL の後ろに「#page=頁&zoom=倍率,左,上」を付けると、開いたときの倍率と見える位置を指定できる
// （Adobe「PDF Open Parameters」。RFC 8118 の 3章）。ただし「左,上」の読み方がブラウザで違う（2026-11-21 にソースで確かめた）：
//  - Chrome（Chromium の PDF ビューア）：頁の左上からの、倍率 100% のときの画面の画素（1/96 インチ＝pt の 4/3 倍。下向きが正）。
//    その点を見える範囲の左上に合わせる。chrome/browser/resources/pdf の open_pdf_params_parser.ts（parseZoomParam_）と
//    viewport.ts（goToPageAndXy）。頁の大きさは pt × 96/72 の画素（pdf/pdfium/pdfium_engine.cc の GetPageSizeForLayout）で、
//    頁のまわりに 上 3・左 5 画素の余白がある（pdf/document_layout.h の kSingleViewInsets）。倍率は 25%〜500% に収められる
//    （third_party/blink/common/page/page_zoom.cc の kPresetBrowserZoomFactors）。「navpanes=0」で左のサムネイルを閉じて開く。
//  - Firefox（pdf.js）：PDF の座標（pt。頁の左下が原点で上向きが正、頁の回転の前の向き）。その点を見える範囲の左上に合わせる。
//    値は整数に切り捨てる。mozilla/pdf.js の web/pdf_link_service.js（setHash）と web/pdf_viewer.js（scrollPageIntoView の XYZ）。
//    「pagemode=none」で左の欄を閉じて開く。
//  - Safari（WebKit）：「#」の後ろの最初の1つ（page= か nameddest=）しか読まない（Source/WebKit/WebProcess/Plugins/PDF/UnifiedPDF/
//    UnifiedPDFPlugin.mm の revealFragmentIfNeeded）。→ Safari・スマホには付けない（今までどおり図の全体が開く）。
//  - Edge：Microsoft が作り替えた PDF ビューアで、この作業の環境では動かして確かめられなかった。→ 付けない（pdfViewerOf）。
// そこで PC の画面で、そのブラウザの読み方で URL を作る（components/result-view.tsx の MapButton）。
// 本物の Chrome 153（Xvfb の画面あり）と Firefox 155（pdf.js）で開き、物件が真ん中に来ることを確かめた（2026-11-21）。
//
// 図の範囲（データの図の四隅）が PDF の頁のどこに来るかは、図の作り（市ごとの図の様式）ごとに、本物の PDF で測った（docs/pdf-sheets.md）。
// 測っていない作りの図（青森県の ZIP の中の図・四街道市の地図システム・日光市の画像・久留米市など）は、今までどおり何も付けない。

/** 図の作り（PDF の頁の大きさと、図の範囲が頁の上で来る所） */
export type PdfLayout = {
  /** 頁の幅・高さ（pt。回転したあとの、画面に出る向き） */
  page: [number, number];
  /** 頁の回転（PDF の /Rotate）。Firefox の座標（回転の前の向き）に直すのに使う */
  rotate: 0 | 90 | 180 | 270;
  /** データの図の範囲の四隅が頁の上で来る所 [左, 上, 右, 下]（pt。画面に出る向きで、頁の左上が原点・下向きが正） */
  frame: [number, number, number, number];
};

type Template = PdfLayout & {
  /** 市と図の名前（確かめるときの目印） */
  name: string;
  /**
   * この作りの図の URL の頭。市全体で1枚の図は、測った図の URL そのもの（作り直された図に差し替わったら、測り直すまで付けない）。
   * データ（lib/roadmap/data）の外に置くので、図の差し替えの自動追従（sheet-watch）では書き換わらない
   */
  prefix: string;
  /** 同じ市の中で作りの違う図（図の名前で選ぶ） */
  variants?: { labels: string[]; layout: PdfLayout }[];
};

// 測り方：PDF の中の図の枠（線・矩形）の位置を読み、図の範囲の大きさ・縦横比と比べた。地理院地図（標準地図）を同じ範囲に並べ直して重ね、
// 目印（市役所など）と図の中の4か所で道路の線がどれだけずれるかを確かめた（docs/pdf-sheets.md の表。多くは 10m 以内）
const TEMPLATES: Template[] = [
  // 国土基本図 1/500 の図郭（400m×300m）。図の内枠がそのまま図郭（13-24・01-22 で同じ）
  { name: "草加市 道路台帳図", prefix: "https://www.city.soka.saitama.jp/cont/s1901/daicho/pdf/", page: [3370.39, 2383.93], rotate: 0, frame: [539.18, 356.85, 2806.98, 2057.65] },
  // 市全体で1枚（A0 を 90° 回して表示）。枠の線（4本）の内側
  {
    name: "ふじみ野市 道路網図",
    prefix: "https://www.city.fujimino.saitama.jp/material/files/group/31/R8douromouzu.pdf",
    page: [3370, 2384],
    rotate: 90,
    frame: [42.48, 45.36, 3296.4, 2313.12],
  },
  // 2000m×1500m の格子。図の枠（06・04 で 2pt 以内）
  {
    name: "富士見市 指定道路図",
    prefix: "https://www.city.fujimi.saitama.jp/kurashi_tetsuzuki/sumai/jyuutaku/shiteidouro-etsuran/shitei-douro-etsuran.files/",
    page: [2721.12, 1984.08],
    rotate: 0,
    frame: [102.88, 143.2, 2370.6, 1843.93],
  },
  // 市全体で1枚のスキャン画像（1/10,000）。図の範囲は縮尺の大きさで、位置は地理院地図との照合で合わせた
  {
    name: "富士見市 路線網図",
    prefix: "https://www.city.fujimi.saitama.jp/kurashi_tetsuzuki/05douro/doro_kotsu/douromouzu.files/rosenmouzu_R7.pdf",
    page: [2817.64, 2228.03],
    rotate: 0,
    frame: [138.66, 127.54, 2688.96, 2112.94],
  },
  // 国土基本図 1/2500 の図郭。3重の枠のいちばん内側（6・2 で同じ）
  { name: "志木市 指定道路図", prefix: "https://www.city.shiki.lg.jp/uploaded/attachment/", page: [2551.18, 2040.95], rotate: 0, frame: [141.6, 169.93, 2409.36, 1870.81] },
  // 東西375m×南北500m の格子。図の枠の内側の灰色の細い矩形（地図はその外にも重なって描かれている。35R・12R で同じ）
  {
    name: "和光市 指定道路図",
    prefix: "https://www.city.wako.lg.jp/_res/projects/default_project/_page_/001/005/867/",
    page: [841.92, 1190.52],
    rotate: 0,
    frame: [143.58, 239.94, 675.06, 948.54],
  },
  // 1/6000 の格子。図の枠（D5・K7 で 0.3pt 以内）
  { name: "佐倉市 指定道路図", prefix: "https://www.city.sakura.lg.jp/material/files/group/45/", page: [1190.52, 841.92], rotate: 0, frame: [93.48, 64.98, 1040.1, 776.04] },
  // 図郭（800mm×600mm の格子の真ん中の1つ。No.19・No.7 で同じ）
  { name: "八千代市 指定道路図", prefix: "https://www.city.yachiyo.lg.jp/uploaded/attachment/", page: [3370.44, 2383.92], rotate: 0, frame: [273.6, 337.32, 2541.12, 2037.96] },
  // 地区ごとの6枚。5枚は縦の A3 を 270° 回して表示、「袖ケ浦・鷺沼ほか」だけ横の A3（6枚とも確かめた）
  {
    name: "習志野市 市道認定網図",
    prefix: "https://www.city.narashino.lg.jp/material/files/group/38/",
    page: [1191, 842],
    rotate: 270,
    frame: [28.92, 76.76, 1162.68, 813.68],
    variants: [{ labels: ["袖ケ浦・鷺沼ほか"], layout: { page: [1191, 842], rotate: 0, frame: [28.2, 72.08, 1161.96, 809.12] } }],
  },
  // 図の枠（28・45・73 で同じ）。データの図の位置は「数十 m」の精度（28 では東へ約 35m ずれる）
  { name: "港区 指定道路図", prefix: "https://www.city.minato.tokyo.jp/documents/118481/", page: [1190.24, 842.26], rotate: 0, frame: [15.6, 65.53, 1106.96, 802.42] },
  // 1/500 の図郭（500m×350m）。90° 回して表示。図郭の線（44-36・43-10 で同じ）
  {
    name: "文京区 道路台帳平面図",
    prefix: "https://www.city.bunkyo.lg.jp/shared/library/sosiki_busyo/dokan/tikei/",
    page: [3370, 2384],
    rotate: 90,
    frame: [267.72, 199.32, 3102.18, 2183.46],
  },
  // 10枚綴りの PDF（頁は URL の #page=）。どの頁も同じ枠（151-160 の2頁目・001-010 の1頁目と8頁目）
  {
    name: "北区 指定道路図",
    prefix: "https://www.city.kita.lg.jp/_res/projects/default_project/_page_/001/009/491/",
    page: [1190.55, 839.06],
    rotate: 0,
    frame: [21.36, 94.12, 1155.33, 732.02],
  },
  // 市全体で1枚（A0）。図の枠
  {
    name: "西東京市 道路種別図",
    prefix: "https://www.city.nishitokyo.lg.jp/siseizyoho/matidukuri/kentikusidou/dourosyubetu.files/20261001douroshubetu.pdf",
    page: [2384.25, 3369.74],
    rotate: 0,
    frame: [60.48, 72.72, 2323.96, 3210.44],
  },
  // 図の中の赤い細い線の矩形（索引図の区画。地図はその外にも約20m 重なって描かれている）。5つのフォルダの7枚のうち6枚が同じ位置
  // （A009L だけ左上へ約 13m ずれている）
  {
    name: "桐生市 指定道路図",
    prefix: "https://www.city.kiryu.lg.jp/_res/projects/default_project/_page_/001/013/",
    page: [842, 1191],
    rotate: 0,
    frame: [58.6, 86.9, 738.5, 1149.6],
  },
  // 国土基本図 1/5000 の図郭（4km×3km）。図の内枠（17・2 で同じ）
  { name: "太田市 認定路線網図", prefix: "https://www.city.ota.gunma.jp/uploaded/attachment/", page: [3370.45, 2383.91], rotate: 0, frame: [426.11, 371.29, 2693.84, 2072.2] },
  // 800m×600m の格子。図の内枠（K-9・V-7 で 0.3pt 以内）
  {
    name: "館林市 道路台帳図",
    prefix: "https://www.city.tatebayashi.gunma.jp/s066/kurashi/090/daityozu/",
    page: [3370.31, 2383.91],
    rotate: 0,
    frame: [425.16, 371.38, 2692.95, 2072.15],
  },
  // 図の画像の枠（9・4 で同じ）
  {
    name: "沼田市 指定道路図",
    prefix: "https://www.city.numata.gunma.jp/_res/projects/default_project/_page_/001/008/826/",
    page: [1191, 842],
    rotate: 0,
    frame: [34, 34, 1145, 719],
  },
  // 図の画像の枠（No.11・No.34 で同じ）
  { name: "藤岡市 指定道路図", prefix: "https://www.city.fujioka.gunma.jp/material/files/group/26/", page: [1191, 842], rotate: 0, frame: [38.16, 38.64, 1150.32, 742.56] },
  // 国土基本図 1/2500 の図郭。内側の細い枠（20・10 で同じ）
  {
    name: "富岡市 指定道路図",
    prefix: "https://www.city.tomioka.lg.jp/www/contents/1585534668687/files/",
    page: [2580.01, 1955.99],
    rotate: 0,
    frame: [73.32, 116.51, 2341.05, 1816.77],
  },
  // 国土基本図 1/2500 の図郭。枠の線（46・16 で 6pt＝約 11m の違いがあり、間を取った）
  { name: "安中市 指定道路図", prefix: "https://www.city.annaka.lg.jp/uploaded/attachment/", page: [1190.52, 841.92], rotate: 0, frame: [98.46, 38.58, 1100.52, 790.08] },
  // 図の内枠（135・088 で同じ）
  {
    name: "みどり市 指定道路図",
    prefix: "https://www.city.midori.gunma.jp/_res/projects/default_project/_page_/001/002/814/",
    page: [1190.24, 842.26],
    rotate: 0,
    frame: [63.36, 53.05, 1112.19, 761.6],
  },
  // 頁いっぱいの枠（図どうしが大きく重なる。18・52 で同じ）
  { name: "鹿沼市 指定道路図", prefix: "https://www.city.kanuma.tochigi.jp/koukai/shiteidourozu/", page: [1190.55, 841.89], rotate: 0, frame: [0.96, 15.97, 1189.59, 824.23] },
  // 国土基本図 1/2500 の図郭。96枚のうち90枚は A0、6枚（大曲の中心部）は縦の A4 を 90° 回して表示（PDF の頭を全部読んで分けた）
  {
    name: "大仙市 指定道路図",
    prefix: "https://www.city.daisen.lg.jp/uploads/public/",
    page: [3370.39, 2383.94],
    rotate: 0,
    frame: [83.27, 101.66, 2994.11, 2284.82],
    variants: [{ labels: ["10LD912", "10LD922", "10LD923", "10MD021", "10MD023", "10MD024"], layout: { page: [842, 595], rotate: 90, frame: [21.28, 25.4, 747.69, 570.2] } }],
  },
  // 国土基本図 1/2500 の図郭（県の指定道路図・38市町村）。内枠の位置は図によって 2通り（6pt・13pt の違い。約 5m・11m）あり、間を取った
  {
    name: "福島県 指定道路図",
    prefix: "https://www.pref.fukushima.lg.jp/uploaded/attachment/",
    page: [2835, 2004],
    rotate: 0,
    frame: [128.23, 124.78, 2395.77, 1825.43],
  },
];

/** 図の作りの表（テストで中身を確かめる用） */
export const PDF_TEMPLATES: readonly Readonly<Template>[] = TEMPLATES;

/** その図の作り。測っていない作りの図は undefined */
export function pdfLayout(label: string, url: string): PdfLayout | undefined {
  const base = url.split("#")[0];
  const t = TEMPLATES.find((x) => (x.prefix.endsWith(".pdf") ? base === x.prefix : base.startsWith(x.prefix)));
  if (!t) return undefined;
  return t.variants?.find((v) => v.labels.includes(label))?.layout ?? t;
}

/** PDF のビューア：Chromium（Chrome・Edge など）か pdf.js（Firefox） */
export type PdfViewer = "chromium" | "pdfjs";

/**
 * ブラウザ（userAgent）の PDF ビューア。PC の Chrome（Chromium の仲間）と Firefox のほかは undefined（Safari・スマホ・タブレットには付けない）。
 * Edge は Microsoft が作り替えた PDF ビューアで、「左,上」の読み方をまだ確かめていないので付けない（確かめたらここで "chromium" にする）
 */
export function pdfViewerOf(ua: string): PdfViewer | undefined {
  if (/Android|iPhone|iPad|iPod|Mobile/.test(ua)) return undefined;
  if (/Firefox\//.test(ua)) return "pdfjs";
  if (/Edg\//.test(ua)) return undefined;
  if (/Chrome\/|Chromium\//.test(ua)) return "chromium";
  return undefined;
}

/** ブラウザの窓の中の大きさ（CSS px）。新しいタブで開くので、いまの窓と同じ大きさで見える */
export type ViewSize = { width: number; height: number };

/** 見える範囲の幅（m）。ふつうの PC の画面で、物件のまわり約 300m（縦は約 150〜200m）が見える */
export const VIEW_M = 300;
/** 倍率 100% のとき 1pt が何 CSS px か（Chromium も pdf.js も 96/72） */
const PX = 96 / 72;
/** 倍率の範囲（Chromium が 25%〜500% に収める。pdf.js も同じ範囲にそろえる） */
const ZOOM = [0.25, 5] as const;
/** ビューアの上の道具の帯の高さ（px）。Chromium は 56（elements/viewer_toolbar.css）、pdf.js は 32（web/viewer.css） */
const TOOLBAR: Record<PdfViewer, number> = { chromium: 56, pdfjs: 32 };
/** Chromium の頁のまわりの余白（px。上 3・左 5） */
const INSET = { left: 5, top: 3 };

/** 物件の場所（図の範囲の中の割合 at）→ 頁の上の点（pt。画面に出る向き） */
export function pointOnPage(layout: PdfLayout, at: readonly [number, number]): [number, number] {
  const [l, t, r, b] = layout.frame;
  return [l + at[0] * (r - l), t + at[1] * (b - t)];
}

/** 画面に出る向きの頁の点（pt、左上が原点・下向き）→ PDF の座標（pt、回転の前の向きで左下が原点・上向き）。頁の原点は (0, 0) とする */
export function toUserSpace(layout: PdfLayout, [x, y]: readonly [number, number]): [number, number] {
  const [w, h] = layout.page;
  // 回転の前の頁の幅・高さ
  const [uw, uh] = layout.rotate % 180 === 0 ? [w, h] : [h, w];
  switch (layout.rotate) {
    case 90:
      return [y, x];
    case 180:
      return [uw - x, y];
    case 270:
      return [uw - y, uh - x];
    default:
      return [x, uh - y];
  }
}

/** 見える範囲（左上の点と倍率）。物件を真ん中にし、頁からはみ出すときは頁の中に寄せる */
export function pdfView(
  layout: PdfLayout,
  at: readonly [number, number],
  /** 図の範囲の幅（m） */
  sheetWidthM: number,
  viewer: PdfViewer,
  size: ViewSize,
): { zoom: number; topLeft: [number, number]; center: [number, number] } {
  const [l, , r] = layout.frame;
  const mPerPt = sheetWidthM / (r - l);
  const vw = Math.max(320, size.width);
  const vh = Math.max(240, size.height - TOOLBAR[viewer]);
  // 見える幅が VIEW_M になる倍率（%。整数）
  const pct = Math.round(Math.min(ZOOM[1], Math.max(ZOOM[0], (vw * mPerPt) / (PX * VIEW_M))) * 100);
  const z = pct / 100;
  const hw = vw / (2 * PX * z);
  const hh = vh / (2 * PX * z);
  const center = pointOnPage(layout, at);
  const [pw, ph] = layout.page;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
  return { zoom: pct, topLeft: [clamp(center[0] - hw, pw - 2 * hw), clamp(center[1] - hh, ph - 2 * hh)], center };
}

/** 図の範囲の幅（m）。bounds は [北, 西, 南, 東] */
export function sheetWidthM([n, w, s, e]: readonly [number, number, number, number]): number {
  return (e - w) * 111320 * Math.cos((((n + s) / 2) * Math.PI) / 180);
}

/**
 * 物件の場所を真ん中にして開く PDF の URL。測っていない作りの図・ビューアが分からないときは undefined（今までの URL を使う）。
 * 複数頁の PDF（北区）は、URL の #page= の頁を開く
 */
export function centeredPdfUrl(
  sheet: { label: string; url: string; at: readonly [number, number] },
  bounds: readonly [number, number, number, number],
  viewer: PdfViewer | undefined,
  size: ViewSize,
): string | undefined {
  if (!viewer) return undefined;
  const layout = pdfLayout(sheet.label, sheet.url);
  if (!layout) return undefined;
  const [base, hash = ""] = sheet.url.split("#");
  const page = Number(new URLSearchParams(hash).get("page")) || 1;
  const { zoom, topLeft } = pdfView(layout, sheet.at, sheetWidthM(bounds), viewer, size);
  if (viewer === "chromium") {
    const left = Math.round(topLeft[0] * PX + INSET.left);
    const top = Math.round(topLeft[1] * PX + INSET.top);
    return `${base}#page=${page}&zoom=${zoom},${left},${top}&navpanes=0`;
  }
  const [x, y] = toUserSpace(layout, topLeft).map(Math.round);
  return `${base}#page=${page}&zoom=${zoom},${x},${y}&pagemode=none`;
}
