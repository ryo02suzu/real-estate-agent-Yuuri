// 動く地図（MapLibre GL）の見た目。地理院タイル（淡色・標準・写真）を重ね、選んだものだけを表示する。
// PDF の分割図の市では、物件が載っている図の範囲（枠と 3×3 の目安線）を重ねる。
import type { FeatureCollection } from "geojson";
import type { ExpressionSpecification, FilterSpecification, LayerSpecification, StyleSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { BUILDING_ZOOM, USAGE_GROUPS, usageGroup, usageShort } from "./roadmap/building";
import { BUILDING_DATA, buildingUrl, hasBuildings } from "./roadmap/building-data";
import { HAZARD_LAYERS, HAZARD_ZOOM, hazardTileUrl, type HazardKind } from "./roadmap/hazard";
import { KOZU_DATA, hasKozu, kozuUrl } from "./roadmap/kozu-data";
import { LAND_PRICE_ZOOM, LAND_USAGE_COLORS } from "./roadmap/land-price";
import { LAND_PRICE_DATA, landPriceUrl } from "./roadmap/land-price-data";
import { PARCEL_DATA } from "./roadmap/parcel-data";
import { hasSanko, SANKO_ATTRIBUTION, SANKO_CITY_NAMES, SANKO_DATA, sankoUrl } from "./roadmap/sanko-data";
import type { SheetHit } from "./roadmap/sheets";
import { YOUTO_COLORS, ZONING_ZOOM } from "./roadmap/zoning";
import { ZONING_DATA, zoningUrl } from "./roadmap/zoning-data";

export type Basemap = "pale" | "std" | "photo";

export const BASEMAPS: Record<Basemap, { label: string; url: string; minzoom: number }> = {
  pale: { label: "淡色", url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", minzoom: 5 },
  std: { label: "標準", url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", minzoom: 5 },
  photo: { label: "写真", url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", minzoom: 2 },
};

/** 関東1都6県（伊豆・小笠原諸島を除く）の範囲 [[西, 南], [東, 北]] */
export const KANTO_BOUNDS: [[number, number], [number, number]] = [
  [138.4, 34.9],
  [140.9, 37.16],
];

const ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';
// 登記所備付地図データの利用規約どおり、出典と加工したことを書く
const PARCEL_ATTRIBUTION = `<a href="https://front.geospatial.jp/moj-chizu-xml-readme/" target="_blank" rel="noreferrer">「登記所備付地図データ」（法務省）</a>を加工して作成（${PARCEL_DATA.edition}）`;

// 公図（任意座標）を道路縁に合わせて推定の位置に置いた筆（登記所備付地図データの利用規約どおり、加工したことを書く）
const KOZU_ATTRIBUTION = `公図の推定位置：<a href="https://front.geospatial.jp/moj-chizu-xml-readme/" target="_blank" rel="noreferrer">「登記所備付地図データ」（法務省）</a>を基盤地図情報（国土地理院）に合わせて加工`;

/** 公図から推定した位置の筆の線の色（確かさが高い・低い） */
export const KOZU_COLORS = { high: "#7a4fb0", low: "#b9a2d8" };
/** 市町村の地番参考図の筆の線の色 */
export const SANKO_COLOR = "#2f7a6e";
// 市町村の地番参考図の筆（データの置き場所が決まるまでは無し）。法務省の地図データの筆と重ならない
const sankoOn = hasSanko();
// 市町村の地番参考図の出典（市町村ごとのライセンス：公共データ利用規約第1.0版か CC BY 4.0）
const SANKO_MAP_ATTRIBUTION = SANKO_ATTRIBUTION;
/** 筆のレイヤ（「筆・地番」で表示を切り替える）。参考図・推定の筆のデータがあれば、その筆も */
export const PARCEL_LAYERS = [
  "fude-fill",
  "fude-line",
  "fude-label",
  ...(sankoOn ? ["sanko-fill", "sanko-line", "sanko-label"] : []),
  ...(hasKozu() ? ["kozu-fill", "kozu-line", "kozu-label"] : []),
];
/** 地点の筆を拾うレイヤ */
export const PARCEL_PICK_LAYERS = ["fude-fill", ...(sankoOn ? ["sanko-fill"] : []), ...(hasKozu() ? ["kozu-fill"] : [])];
/** 地番で見つけた筆・地図で選んだ地点の筆を強調するレイヤ */
export const PARCEL_HIT_LAYERS = [
  "fude-hit",
  "fude-hit-line",
  ...(sankoOn ? ["sanko-hit", "sanko-hit-line"] : []),
  ...(hasKozu() ? ["kozu-hit", "kozu-hit-line"] : []),
];

/**
 * 推定の位置の筆のうち、参考図のある市町村の筆は描かない（市町村の図の筆を使う）。地番区域の先頭が市町村名
 * （町村は「比企郡小川町_…」のように郡の名前が前に付く。lib/roadmap/sanko-data.ts の sankoCovers と同じ判定）
 */
const KUIKI: ExpressionSpecification = ["to-string", ["get", "地番区域"]];
const KOZU_FILTER: FilterSpecification | undefined = sankoOn
  ? ([
      "!",
      [
        "any",
        ...[...SANKO_CITY_NAMES].flatMap((n): ExpressionSpecification[] => [
          ["==", ["index-of", `${n}_`, KUIKI], 0],
          [">", ["index-of", `郡${n}_`, KUIKI], 0],
        ]),
      ] as ExpressionSpecification,
    ] as FilterSpecification)
  : undefined;
const withKozuFilter = (f?: FilterSpecification): FilterSpecification | undefined =>
  KOZU_FILTER ? (f ? (["all", KOZU_FILTER, f] as unknown as FilterSpecification) : KOZU_FILTER) : f;

/** 筆を地図に描く最小のズーム（タイルは z14〜16。z16 より細かいときは z16 を拡大して描く） */
export const PARCEL_MIN_ZOOM = 15;
/** 筆の中に地番を書く最小のズーム（重なる地番は地図が間引く） */
export const PARCEL_LABEL_ZOOM = 17;
/** 地番を書く筆（道路・水路など地番の無い筆は書かない） */
const CHIBAN_LABEL_FILTER: FilterSpecification = ["!", ["in", ["slice", ["to-string", ["get", "地番"]], 0, 1], ["literal", ["道", "水", "無", "長"]]]];
const chibanLabelLayout = {
  visibility: "none" as const,
  "text-field": ["get", "地番"],
  "text-font": ["NotoSansCJKjp-Regular"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 17, 9.5, 19, 12.5],
  "text-padding": 1,
} satisfies SymbolLayerSpecification["layout"];

/** 用途地域を地図に塗る最小のズーム（タイルは z15 だけ） */
export const ZONING_MIN_ZOOM = ZONING_ZOOM;

const ZONING_ATTRIBUTION = `<a href="https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html" target="_blank" rel="noreferrer">都市計画決定GISデータ（国土交通省）</a>を加工して作成（${ZONING_DATA.edition}）`;

/** 用途地域の種類コード → 色（表から組み立てるので、型は組み立てたあとに付ける） */
const youtoColor = ["match", ["get", "code"], ...Object.entries(YOUTO_COLORS).flatMap(([k, v]) => [Number(k), v]), "#cccccc"] as unknown as ExpressionSpecification;

/** 用途地域・都市計画道路のレイヤ（「用途地域」で表示を切り替える） */
export const ZONING_LAYERS = ["zoning-youto-fill", "zoning-youto-line", "zoning-douro"];

/** 都市計画道路の線の色（地図と凡例） */
export const DOURO_COLOR = "#7a3fa0";

/** 道路種別（市の公開データ）を描く最小のズーム。引いた地図では読む量が多すぎるので、町の中を見ているときだけ */
export const ROAD_MIN_ZOOM = 16;

/** 道路種別のレイヤ（「道路種別」で表示を切り替える）。道路の区域の面と、線 */
export const ROAD_LAYERS = ["road-fill", "road-outline", "road-line"];

// 国の重ねるハザードマップ（オープンデータ。公共データ利用規約のとおり出典を書く）
const HAZARD_ATTRIBUTION = '<a href="https://disaportal.gsi.go.jp/" target="_blank" rel="noreferrer">ハザードマップポータルサイト</a>';

/** ハザードのレイヤ（タイルの置き場所ごとに1つ。「ハザード」で選んだ種類のものだけ表示する） */
export const hazardLayerId = (tileId: string) => `hz-${tileId}`;

// 3D都市モデル（PLATEAU）の建物（公共データ利用規約のとおり、加工したことを書く）
const BUILDING_ATTRIBUTION = `<a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noreferrer">「3D都市モデル（Project PLATEAU）」（国土交通省）</a>を加工して作成${
  BUILDING_DATA.edition ? `（${BUILDING_DATA.edition}）` : ""
}`;

/** 建物（「建物」で表示を切り替える）。代表点の点と、用途・階数の文字 */
export const BUILDING_LAYERS = ["bldg-dot", "bldg-label"];

/** 建物の点・文字を出す最小のズーム（タイルは z17 だけ） */
export const BUILDING_MIN_ZOOM = BUILDING_ZOOM;

// 用途（PLATEAU の bldg:usage の名前）→ 色・短い名前。地図の式は名前そのもので引くので、よく出る名前を並べる
const USAGES = [
  "住宅", "共同住宅", "店舗等併用住宅", "店舗等併用共同住宅", "作業所併用住宅", "業務施設", "商業施設", "宿泊施設", "商業系複合施設",
  "官公庁施設", "文教厚生施設", "運輸倉庫施設", "工場", "農林漁業用施設", "供給処理施設", "防衛施設",
];
const usageColor = ["match", ["get", "u"], ...USAGES.flatMap((u) => [u, USAGE_GROUPS[usageGroup(u)].color]), USAGE_GROUPS.other.color] as unknown as ExpressionSpecification;
const usageText = ["match", ["get", "u"], ...USAGES.flatMap((u) => [u, usageShort(u)]), ["coalesce", ["get", "u"], ""]] as unknown as ExpressionSpecification;
/** 地図の文字：名前があれば名前、無ければ「共同住宅 5F」 */
const buildingText = [
  "coalesce",
  ["get", "nm"],
  ["concat", usageText, ["case", ["has", "f"], ["concat", " ", ["to-string", ["get", "f"]], "F"], ""]],
] as unknown as ExpressionSpecification;

// 地価公示・都道府県地価調査（国土数値情報。CC BY 4.0 のとおり、加工したことを書く）
const LAND_PRICE_ATTRIBUTION = `<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer">「国土数値情報（地価公示・都道府県地価調査）」（国土交通省）</a>を加工して作成`;

/** 地価（「地価」で表示を切り替える）。引いた地図（z8〜12 の pt）と、寄った地図（z13 の lp）の点と価格の文字 */
export const LAND_PRICE_LAYERS = ["lpt-dot", "lpt-label", "lp-dot", "lp-label"];

/** 地価の点を出す最小のズーム（関東の全体を見ているときは出さない） */
export const LAND_PRICE_MIN_ZOOM = 9;

/** 用途の数字（標準地番号の数字）→ 点の色 */
const landUsageColor = [
  "match",
  ["get", "u"],
  "5",
  LAND_USAGE_COLORS.商業地,
  "9",
  LAND_USAGE_COLORS.工業地,
  "3",
  LAND_USAGE_COLORS.宅地見込地,
  LAND_USAGE_COLORS.住宅地,
] as unknown as ExpressionSpecification;
/** 価格の短い文字（「441万」「45.5万」「8350円」） */
const landPriceText = [
  "case",
  [">=", ["get", "p"], 1000000],
  ["concat", ["to-string", ["round", ["/", ["get", "p"], 10000]]], "万"],
  [">=", ["get", "p"], 10000],
  ["concat", ["to-string", ["/", ["round", ["/", ["get", "p"], 1000]], 10]], "万"],
  ["concat", ["to-string", ["get", "p"]], "円"],
] as unknown as ExpressionSpecification;

function landPriceLayers(): LayerSpecification[] {
  const dot = (id: string, layer: string, zoom: { minzoom?: number; maxzoom?: number }): LayerSpecification => ({
    id,
    type: "circle",
    source: "landprice",
    "source-layer": layer,
    ...zoom,
    layout: { visibility: "none" },
    paint: {
      "circle-color": landUsageColor,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 13, 5.5, 17, 7],
      // 地価調査（基準地）は縁を濃くして見分ける
      "circle-stroke-color": ["case", ["==", ["get", "k"], 1], "#3b3328", "#ffffff"],
      "circle-stroke-width": 1.5,
    },
  });
  const label = (id: string, layer: string, zoom: { minzoom?: number; maxzoom?: number }): LayerSpecification => ({
    id,
    type: "symbol",
    source: "landprice",
    "source-layer": layer,
    ...zoom,
    layout: {
      visibility: "none",
      "text-field": landPriceText,
      "text-font": ["NotoSansCJKjp-Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 16, 12.5],
      "text-anchor": "top",
      "text-offset": [0, 0.6],
    },
    paint: { "text-color": "#3b3328", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });
  return [
    dot("lpt-dot", LAND_PRICE_DATA.smallLayer, { minzoom: LAND_PRICE_MIN_ZOOM, maxzoom: LAND_PRICE_ZOOM }),
    label("lpt-label", LAND_PRICE_DATA.smallLayer, { minzoom: 11, maxzoom: LAND_PRICE_ZOOM }),
    dot("lp-dot", LAND_PRICE_DATA.layer, { minzoom: LAND_PRICE_ZOOM }),
    label("lp-label", LAND_PRICE_DATA.layer, { minzoom: LAND_PRICE_ZOOM }),
  ];
}

/** 地図で地価の地点を見せる（パネルの一覧の「地図」。地図は別に読み込むので、ページのイベントで伝える） */
export const LAND_PRICE_EVENT = "michilu:land-price";
export function showLandPriceOnMap(point: [number, number]) {
  window.dispatchEvent(new CustomEvent<[number, number]>(LAND_PRICE_EVENT, { detail: point }));
}

/** PC：パネルの「地図に重ねる」から、地図にハザードを重ねる（地図は別に読み込むので、ページのイベントで伝える） */
export const HAZARD_EVENT = "michilu:hazard";
export function showHazardOnMap(kind: HazardKind) {
  window.dispatchEvent(new CustomEvent<HazardKind>(HAZARD_EVENT, { detail: kind }));
}

/** 見つけた筆（地番区域と、データのままの地番。二重地番などで区画が分かれていれば、その全部） */
type HitParcel = { kuiki: string; chibanRaw: string; chibanRaws?: string[] };

/** 地番区域と地番で、ひとつの筆だけに絞る（見つけた筆を強調する）。何も無ければどれにも当たらない条件 */
export function parcelFilter(p?: HitParcel): FilterSpecification {
  return p
    ? ["all", ["==", ["get", "地番区域"], p.kuiki], ["in", ["get", "地番"], ["literal", p.chibanRaws ?? [p.chibanRaw]]]]
    : ["==", ["get", "地番"], "\u0000"];
}

/** 強調するレイヤ（id）ごとの絞り込み（推定の位置の筆は、参考図のある市町村の筆を除く） */
export function parcelHitFilter(id: string, p?: HitParcel): FilterSpecification {
  const f = parcelFilter(p);
  return id.startsWith("kozu") ? withKozuFilter(f)! : f;
}

/** 見つけた筆・図の範囲の色（PC は金色。スマホの紺の見た目では紺を渡す） */
export type Accent = { fill: string; line: string };
const GOLD: Accent = { fill: "#c49a5c", line: "#8a6632" };

export function gsiStyle(basemap: Basemap = "pale", accent: Accent = GOLD): StyleSpecification {
  const keys = Object.keys(BASEMAPS) as Basemap[];
  const buildings = hasBuildings();
  return {
    version: 8,
    // 建物の文字に使う（漢字・かなは端末の文字で描くので、ここから読むのは数字・英字の分だけ）
    glyphs: "https://maps.gsi.go.jp/xyz/noto-jp/{fontstack}/{range}.pbf",
    sources: {
      ...Object.fromEntries(
        keys.map((k) => [
          k,
          // 地理院タイルは z18 まで。それより拡大したときは z18 のタイルを引き伸ばす
          { type: "raster", tiles: [BASEMAPS[k].url], tileSize: 256, minzoom: BASEMAPS[k].minzoom, maxzoom: 18, attribution: ATTRIBUTION },
        ]),
      ),
      sheet: { type: "geojson", data: sheetFeatures() },
      // 筆（土地の区画）。PMTiles を pmtiles:// で読む（components/live-map.tsx で読み方を登録する）
      parcels: { type: "vector", url: `pmtiles://${PARCEL_DATA.url}`, attribution: PARCEL_ATTRIBUTION },
      // 用途地域など（アプリと同じサイトに置いた PMTiles）
      zoning: { type: "vector", url: `pmtiles://${zoningUrl()}`, attribution: ZONING_ATTRIBUTION },
      // 道路種別。市の公開データを見ている範囲の分だけ読んで入れる（components/live-map.tsx）
      roads: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      // 洪水・土砂災害などの想定区域（z17 まで。それより拡大したときは z17 のタイルを引き伸ばす）
      ...Object.fromEntries(
        HAZARD_LAYERS.map((l) => [
          hazardLayerId(l.id),
          { type: "raster" as const, tiles: [hazardTileUrl(l.id)], tileSize: 256, minzoom: l.minzoom, maxzoom: HAZARD_ZOOM, attribution: HAZARD_ATTRIBUTION },
        ]),
      ),
      // 建物（PLATEAU）。データの置き場所が決まるまでは無し
      ...(buildings ? { buildings: { type: "vector" as const, url: `pmtiles://${buildingUrl()}`, attribution: BUILDING_ATTRIBUTION } } : {}),
      // 公図の推定位置の筆（データの置き場所が決まるまでは無し）
      ...(hasKozu() ? { kozu: { type: "vector" as const, url: `pmtiles://${kozuUrl()}`, attribution: KOZU_ATTRIBUTION } } : {}),
      // 市町村の地番参考図の筆（データの置き場所が決まるまでは無し）
      ...(sankoOn ? { sanko: { type: "vector" as const, url: `pmtiles://${sankoUrl()}`, attribution: SANKO_MAP_ATTRIBUTION } } : {}),
      // 地価公示・地価調査（アプリと同じサイトに置いた PMTiles）
      landprice: { type: "vector", url: `pmtiles://${landPriceUrl()}`, attribution: LAND_PRICE_ATTRIBUTION },
    },
    layers: [
      // 淡色地図に無いところ（海など）が白く抜けないよう、下に標準地図の色を敷く
      { id: "bg", type: "background", paint: { "background-color": "#eef1ee" } },
      ...keys.map((k) => ({
        id: k,
        type: "raster" as const,
        source: k,
        layout: { visibility: k === basemap ? ("visible" as const) : ("none" as const) },
      })),
      // 洪水・土砂災害などの想定区域（「ハザード」で選んだ種類だけ表示）。背景の地図の上、ほかの重ねるものの下
      ...HAZARD_LAYERS.map(
        (l): LayerSpecification => ({
          id: hazardLayerId(l.id),
          type: "raster",
          source: hazardLayerId(l.id),
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.72 },
        }),
      ),
      // 用途地域の塗り分けと都市計画道路（「用途地域」で表示）
      {
        id: "zoning-youto-fill",
        type: "fill",
        source: "zoning",
        "source-layer": "youto",
        minzoom: ZONING_MIN_ZOOM,
        layout: { visibility: "none" },
        paint: { "fill-color": youtoColor, "fill-opacity": 0.32 },
      },
      {
        id: "zoning-youto-line",
        type: "line",
        source: "zoning",
        "source-layer": "youto",
        minzoom: ZONING_MIN_ZOOM,
        layout: { visibility: "none" },
        paint: { "line-color": youtoColor, "line-width": 1.6, "line-opacity": 0.9 },
      },
      {
        id: "zoning-douro",
        type: "line",
        source: "zoning",
        "source-layer": "douro",
        minzoom: ZONING_MIN_ZOOM,
        layout: { visibility: "none" },
        paint: { "line-color": DOURO_COLOR, "line-width": 2.5, "line-opacity": 0.8, "line-dasharray": [2, 1.5] },
      },
      { id: "sheet-fill", type: "fill", source: "sheet", filter: ["==", ["get", "kind"], "frame"], paint: { "fill-color": accent.fill, "fill-opacity": 0.06 } },
      {
        id: "sheet-grid",
        type: "line",
        source: "sheet",
        filter: ["==", ["get", "kind"], "grid"],
        paint: { "line-color": accent.line, "line-width": 1, "line-opacity": 0.6, "line-dasharray": [3, 3] },
      },
      { id: "sheet-line", type: "line", source: "sheet", filter: ["==", ["get", "kind"], "frame"], paint: { "line-color": accent.line, "line-width": 2.5 } },
      // 筆界（「筆・地番」で表示）。fude-fill は透明で、クリックした筆を拾うためのもの
      {
        id: "fude-fill",
        type: "fill",
        source: "parcels",
        "source-layer": PARCEL_DATA.layer,
        minzoom: PARCEL_MIN_ZOOM,
        layout: { visibility: "none" },
        paint: { "fill-color": "#000000", "fill-opacity": 0 },
      },
      {
        id: "fude-line",
        type: "line",
        source: "parcels",
        "source-layer": PARCEL_DATA.layer,
        minzoom: PARCEL_MIN_ZOOM,
        layout: { visibility: "none" },
        paint: { "line-color": "#b0472a", "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.4, 18, 1.2], "line-opacity": 0.75 },
      },
      // 筆の中の地番（ブルーマップのように。拡大したときだけ）
      {
        id: "fude-label",
        type: "symbol",
        source: "parcels",
        "source-layer": PARCEL_DATA.layer,
        minzoom: PARCEL_LABEL_ZOOM,
        filter: CHIBAN_LABEL_FILTER,
        layout: chibanLabelLayout,
        paint: { "text-color": "#8a3a22", "text-halo-color": "#ffffff", "text-halo-width": 1.3 },
      },
      // 市町村の地番参考図の筆（実線。課税用の参考図で、登記の筆と違うことがある）
      ...(sankoOn
        ? ([
            {
              id: "sanko-fill",
              type: "fill",
              source: "sanko",
              "source-layer": SANKO_DATA.layer,
              minzoom: PARCEL_MIN_ZOOM,
              layout: { visibility: "none" },
              paint: { "fill-color": "#000000", "fill-opacity": 0 },
            },
            {
              id: "sanko-line",
              type: "line",
              source: "sanko",
              "source-layer": SANKO_DATA.layer,
              minzoom: PARCEL_MIN_ZOOM,
              layout: { visibility: "none" },
              paint: { "line-color": SANKO_COLOR, "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.4, 18, 1.2], "line-opacity": 0.75 },
            },
            {
              id: "sanko-label",
              type: "symbol",
              source: "sanko",
              "source-layer": SANKO_DATA.layer,
              minzoom: PARCEL_LABEL_ZOOM,
              filter: CHIBAN_LABEL_FILTER,
              layout: chibanLabelLayout,
              paint: { "text-color": "#1f5c53", "text-halo-color": "#ffffff", "text-halo-width": 1.3 },
            },
          ] satisfies LayerSpecification[])
        : []),
      // 公図から推定した位置の筆（点線。数mずれることがある）。参考図のある市町村の筆は描かない
      ...(hasKozu()
        ? ([
            {
              id: "kozu-fill",
              type: "fill",
              source: "kozu",
              "source-layer": KOZU_DATA.layer,
              minzoom: PARCEL_MIN_ZOOM,
              ...(KOZU_FILTER ? { filter: KOZU_FILTER } : {}),
              layout: { visibility: "none" },
              paint: { "fill-color": "#000000", "fill-opacity": 0 },
            },
            {
              id: "kozu-line",
              type: "line",
              source: "kozu",
              "source-layer": KOZU_DATA.layer,
              minzoom: PARCEL_MIN_ZOOM,
              ...(KOZU_FILTER ? { filter: KOZU_FILTER } : {}),
              layout: { visibility: "none" },
              paint: {
                // 位置合わせの確かさ（q）が低いものは薄く
                "line-color": ["match", ["get", "q"], 2, KOZU_COLORS.low, KOZU_COLORS.high],
                "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.4, 18, 1.2],
                "line-opacity": 0.8,
                "line-dasharray": [3, 2],
              },
            },
            {
              id: "kozu-label",
              type: "symbol",
              source: "kozu",
              "source-layer": KOZU_DATA.layer,
              minzoom: PARCEL_LABEL_ZOOM,
              filter: withKozuFilter(CHIBAN_LABEL_FILTER),
              layout: chibanLabelLayout,
              paint: { "text-color": ["match", ["get", "q"], 2, "#8f78b8", "#5b3690"], "text-halo-color": "#ffffff", "text-halo-width": 1.3 },
            },
          ] satisfies LayerSpecification[])
        : []),
      // 道路種別（「道路種別」で表示）。面は薄く塗って縁取り、線は太めに。色は市の地図の凡例の色
      {
        id: "road-fill",
        type: "fill",
        source: "roads",
        filter: ["==", ["geometry-type"], "Polygon"],
        layout: { visibility: "none" },
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.45 },
      },
      {
        id: "road-outline",
        type: "line",
        source: "roads",
        filter: ["==", ["geometry-type"], "Polygon"],
        layout: { visibility: "none" },
        paint: { "line-color": ["get", "color"], "line-width": 1.2, "line-opacity": 0.9 },
      },
      {
        id: "road-line",
        type: "line",
        source: "roads",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 16, 3, 19, 6], "line-opacity": 0.9 },
      },
      // 建物（「建物」で表示）。代表点を用途の色の点で、z17.5 からは「共同住宅 5F」のような文字も
      ...(buildings
        ? ([
            {
              id: "bldg-dot",
              type: "circle",
              source: "buildings",
              "source-layer": BUILDING_DATA.layer,
              minzoom: BUILDING_MIN_ZOOM,
              layout: { visibility: "none" },
              paint: {
                "circle-color": usageColor,
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 17, 3.2, 19, 5],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
              },
            },
            {
              id: "bldg-label",
              type: "symbol",
              source: "buildings",
              "source-layer": BUILDING_DATA.layer,
              minzoom: BUILDING_MIN_ZOOM + 0.5,
              layout: {
                visibility: "none",
                "text-field": buildingText,
                "text-font": ["NotoSansCJKjp-Regular"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 17.5, 10, 19, 12],
                "text-anchor": "top",
                "text-offset": [0, 0.5],
                "text-max-width": 7,
              },
              paint: { "text-color": "#3b3328", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
            },
          ] satisfies LayerSpecification[])
        : []),
      // 地価公示・地価調査（「地価」で表示）。用途の色の点と価格
      ...landPriceLayers(),
      // 地番で見つけた筆・地図で選んだ地点の筆
      {
        id: "fude-hit",
        type: "fill",
        source: "parcels",
        "source-layer": PARCEL_DATA.layer,
        minzoom: 14,
        filter: parcelFilter(),
        layout: { visibility: "none" },
        paint: { "fill-color": accent.fill, "fill-opacity": 0.28 },
      },
      {
        id: "fude-hit-line",
        type: "line",
        source: "parcels",
        "source-layer": PARCEL_DATA.layer,
        minzoom: 14,
        filter: parcelFilter(),
        layout: { visibility: "none" },
        paint: { "line-color": accent.line, "line-width": 3 },
      },
      ...(sankoOn
        ? ([
            {
              id: "sanko-hit",
              type: "fill",
              source: "sanko",
              "source-layer": SANKO_DATA.layer,
              minzoom: 14,
              filter: parcelFilter(),
              layout: { visibility: "none" },
              paint: { "fill-color": accent.fill, "fill-opacity": 0.28 },
            },
            {
              id: "sanko-hit-line",
              type: "line",
              source: "sanko",
              "source-layer": SANKO_DATA.layer,
              minzoom: 14,
              filter: parcelFilter(),
              layout: { visibility: "none" },
              paint: { "line-color": accent.line, "line-width": 3 },
            },
          ] satisfies LayerSpecification[])
        : []),
      ...(hasKozu()
        ? ([
            {
              id: "kozu-hit",
              type: "fill",
              source: "kozu",
              "source-layer": KOZU_DATA.layer,
              minzoom: 14,
              filter: parcelFilter(),
              layout: { visibility: "none" },
              paint: { "fill-color": accent.fill, "fill-opacity": 0.28 },
            },
            {
              id: "kozu-hit-line",
              type: "line",
              source: "kozu",
              "source-layer": KOZU_DATA.layer,
              minzoom: 14,
              filter: parcelFilter(),
              layout: { visibility: "none" },
              paint: { "line-color": accent.line, "line-width": 3, "line-dasharray": [2, 1] },
            },
          ] satisfies LayerSpecification[])
        : []),
    ],
  };
}

/** 図の範囲の枠と、「左上」「中央」などの言い方に合わせた 3×3 の目安線 */
export function sheetFeatures(sheet?: SheetHit): FeatureCollection {
  if (!sheet) return { type: "FeatureCollection", features: [] };
  const [n, w, s, e] = sheet.bounds;
  const lng = (f: number) => w + (e - w) * f;
  const lat = (f: number) => n + (s - n) * f;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "frame" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [w, n],
              [e, n],
              [e, s],
              [w, s],
              [w, n],
            ],
          ],
        },
      },
      ...[1 / 3, 2 / 3].flatMap((f) => [
        { type: "Feature" as const, properties: { kind: "grid" }, geometry: { type: "LineString" as const, coordinates: [[lng(f), n], [lng(f), s]] } },
        { type: "Feature" as const, properties: { kind: "grid" }, geometry: { type: "LineString" as const, coordinates: [[w, lat(f)], [e, lat(f)]] } },
      ]),
    ],
  };
}

/** WebGL が使えるか（使えなければ動く地図の代わりに静的なプレビューを出す） */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
