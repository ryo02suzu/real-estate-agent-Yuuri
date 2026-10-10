// 動く地図（MapLibre GL）の見た目。地理院タイル（淡色・標準・写真）を重ね、選んだものだけを表示する。
// PDF の分割図の市では、物件が載っている図の範囲（枠と 3×3 の目安線）を重ねる。
import type { FeatureCollection } from "geojson";
import type { ExpressionSpecification, FilterSpecification, StyleSpecification } from "maplibre-gl";
import { PARCEL_DATA } from "./roadmap/parcel-data";
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

/** 筆を地図に描く最小のズーム（タイルは z14〜16。z16 より細かいときは z16 を拡大して描く） */
export const PARCEL_MIN_ZOOM = 15;

/** 用途地域を地図に塗る最小のズーム（タイルは z15 だけ） */
export const ZONING_MIN_ZOOM = ZONING_ZOOM;

const ZONING_ATTRIBUTION = `<a href="https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html" target="_blank" rel="noreferrer">都市計画決定GISデータ（国土交通省）</a>を加工して作成（${ZONING_DATA.edition}）`;

/** 用途地域の種類コード → 色（表から組み立てるので、型は組み立てたあとに付ける） */
const youtoColor = ["match", ["get", "code"], ...Object.entries(YOUTO_COLORS).flatMap(([k, v]) => [Number(k), v]), "#cccccc"] as unknown as ExpressionSpecification;

/** 用途地域・都市計画道路のレイヤ（「用途地域」で表示を切り替える） */
export const ZONING_LAYERS = ["zoning-youto-fill", "zoning-youto-line", "zoning-douro"];

/** 地番区域と地番で、ひとつの筆だけに絞る（見つけた筆を強調する）。何も無ければどれにも当たらない条件 */
export function parcelFilter(p?: { kuiki: string; chibanRaw: string }): FilterSpecification {
  return p
    ? ["all", ["==", ["get", "地番区域"], p.kuiki], ["==", ["get", "地番"], p.chibanRaw]]
    : ["==", ["get", "地番"], "\u0000"];
}

export function gsiStyle(basemap: Basemap = "pale"): StyleSpecification {
  const keys = Object.keys(BASEMAPS) as Basemap[];
  return {
    version: 8,
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
        paint: { "line-color": "#7a3fa0", "line-width": 2.5, "line-opacity": 0.8, "line-dasharray": [2, 1.5] },
      },
      { id: "sheet-fill", type: "fill", source: "sheet", filter: ["==", ["get", "kind"], "frame"], paint: { "fill-color": "#c49a5c", "fill-opacity": 0.06 } },
      {
        id: "sheet-grid",
        type: "line",
        source: "sheet",
        filter: ["==", ["get", "kind"], "grid"],
        paint: { "line-color": "#8a6632", "line-width": 1, "line-opacity": 0.6, "line-dasharray": [3, 3] },
      },
      { id: "sheet-line", type: "line", source: "sheet", filter: ["==", ["get", "kind"], "frame"], paint: { "line-color": "#8a6632", "line-width": 2.5 } },
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
      // 地番で見つけた筆・地図で選んだ地点の筆
      {
        id: "fude-hit",
        type: "fill",
        source: "parcels",
        "source-layer": PARCEL_DATA.layer,
        minzoom: 14,
        filter: parcelFilter(),
        layout: { visibility: "none" },
        paint: { "fill-color": "#c49a5c", "fill-opacity": 0.28 },
      },
      {
        id: "fude-hit-line",
        type: "line",
        source: "parcels",
        "source-layer": PARCEL_DATA.layer,
        minzoom: 14,
        filter: parcelFilter(),
        layout: { visibility: "none" },
        paint: { "line-color": "#8a6632", "line-width": 3 },
      },
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
