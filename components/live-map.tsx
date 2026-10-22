"use client";

// 動く地図（MapLibre GL ＋ 地理院タイル）。重いので next/dynamic で必要になったときだけ読み込む（components/map-panel.tsx）。
//  - pin: 物件にピンを立てる。ピンをドラッグするか、地図をクリックして「ここで調べる」で場所を選び直せる（PC・スマホの「地図を拡大」）
//  - crosshair: 画面中央の印で場所を選ぶ（スマホの「地図で選ぶ」）
// 右上の道具で、筆・地番、用途地域、道路種別（市の公開データがある所だけ）、建物（PLATEAU）、地価（地価公示・地価調査）、
// ハザード（国の重ねるハザードマップ）を重ねられる。
// 重ねた色の凡例も出す
import "maplibre-gl/dist/maplibre-gl.css";
import { addProtocol, getVersion, MapLibreMap, Marker, NavigationControl, Popup, ScaleControl, setWorkerUrl, type GeoJSONSource, type PointLike } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BASEMAPS,
  BUILDING_LAYERS,
  BUILDING_MIN_ZOOM,
  DOURO_COLOR,
  HAZARD_EVENT,
  hazardLayerId,
  KANTO_BOUNDS,
  KOZU_COLORS,
  SANKO_COLOR,
  LAND_PRICE_EVENT,
  LAND_PRICE_LAYERS,
  LAND_PRICE_MIN_ZOOM,
  PARCEL_HIT_LAYERS,
  PARCEL_LAYERS,
  PARCEL_MIN_ZOOM,
  PARCEL_PICK_LAYERS,
  ROAD_LAYERS,
  ROAD_MIN_ZOOM,
  ZONING_LAYERS,
  ZONING_MIN_ZOOM,
  gsiStyle,
  parcelHitFilter,
  sheetFeatures,
  type Basemap,
} from "@/lib/map-style";
import { buildingAt, buildingSummary, USAGE_GROUPS } from "@/lib/roadmap/building";
import { BUILDING_DATA, hasBuildings } from "@/lib/roadmap/building-data";
import { hasKozu } from "@/lib/roadmap/kozu-data";
import { hasSanko } from "@/lib/roadmap/sanko-data";
import { pmtilesBuildingSource } from "@/lib/roadmap/building-tiles";
import { HAZARD_KINDS, HAZARD_LAYERS, hazardAt, hazardPointLabel, HAZARDS, type HazardKind } from "@/lib/roadmap/hazard";
import { browserTileFetcher } from "@/lib/roadmap/hazard-tiles";
import { LAND_USAGE_COLORS, landPriceSummary, usageFromCode } from "@/lib/roadmap/land-price";
import { chibanLabel, kuikiLabel } from "@/lib/roadmap/parcel";
import { readRoadShapes, type RoadRead } from "@/lib/roadmap/road-read";
import { sheetName, type SheetHit } from "@/lib/roadmap/sheets";
import { YOUTO_COLORS, youtoShort } from "@/lib/roadmap/zoning";
import { BuildingIcon, ChevronRightIcon, FrameIcon, HazardIcon, InfoIcon, LandPriceIcon, LocateIcon, ParcelIcon, PinIcon, RoadIcon, ZoningIcon } from "./icons";
import { MapLegend, type LegendItem } from "./map-legend";

// 描画のワーカーは public/maplibre/<版>/ に置いてある（scripts/copy-maplibre-worker.mjs）
setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);
// 筆・都市計画のタイル（PMTiles）を pmtiles:// で読めるようにする
addProtocol("pmtiles", new Protocol().tile);

const LOCALE = {
  "AttributionControl.ToggleAttribution": "出典",
  "Map.Title": "地図",
  "Marker.Title": "物件の場所",
  "NavigationControl.ZoomIn": "拡大",
  "NavigationControl.ZoomOut": "縮小",
  "NavigationControl.ResetBearing": "北を上に",
  "Popup.Close": "閉じる",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
};

// 物件のピン（components/icons.tsx の PinIcon と同じ形）。色は brand（PC は金色、スマホの紺の見た目では紺）
const PIN_SVG =
  '<svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path fill="currentColor" stroke="#fff" stroke-width="1.2" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/></svg>';

type Point = { lat: number; lng: number };
type Padding = { top: number; bottom: number; left: number; right: number };

/**
 * 「筆・地番」「用途地域」「道路種別」で重ねるデータ。表示しても地図に何も出ないときは、その理由を地図の上に出す
 * （PC は道具の下、スマホは左上）。筆の地図データは公共座標の図面だけで、公図しか無い所は抜けている。
 * 用途地域は調整区域などに無い。道路種別は市の地図に色の付いた道路だけ
 */
const OVERLAYS = {
  parcels: {
    label: "筆・地番",
    source: "parcels",
    /** 表示を切り替えるレイヤ */
    show: PARCEL_LAYERS,
    /** 何か描かれているかを調べるレイヤ */
    layers: PARCEL_PICK_LAYERS,
    minZoom: PARCEL_MIN_ZOOM,
    /** 押したとき、これより引いていれば zoomTo まで寄る */
    zoomBelow: PARCEL_MIN_ZOOM + 1,
    zoomTo: PARCEL_MIN_ZOOM + 1.5,
    none: [
      "この辺りはデータがありません",
      hasSanko() || hasKozu()
        ? `公図（任意座標）の地域は、${[hasSanko() && "市町村の地番参考図がある所", hasKozu() && "推定の位置に置けた所"].filter(Boolean).join("と、")}だけ出ます`
        : "公図（任意座標）の地域は載っていません",
    ],
  },
  zoning: {
    label: "用途地域",
    source: "zoning",
    show: ZONING_LAYERS,
    layers: ["zoning-youto-fill", "zoning-douro"],
    minZoom: ZONING_MIN_ZOOM,
    // タイルは z15 だけなので、それより引いていれば寄る
    zoomBelow: ZONING_MIN_ZOOM + 0.5,
    zoomTo: ZONING_MIN_ZOOM + 1.5,
    none: ["この辺りは色分けがありません", "市街化調整区域・都市計画区域外か、データの無い地域です"],
  },
  roads: {
    label: "道路種別",
    source: "roads",
    show: ROAD_LAYERS,
    layers: ["road-fill", "road-line"],
    minZoom: ROAD_MIN_ZOOM,
    zoomBelow: ROAD_MIN_ZOOM + 0.5,
    zoomTo: ROAD_MIN_ZOOM + 1,
    none: ["この辺りは色の付いた道路がありません", "色の無い道の種別は、窓口で確認してください"],
  },
  buildings: {
    label: "建物",
    source: "buildings",
    show: BUILDING_LAYERS,
    layers: ["bldg-dot"],
    minZoom: BUILDING_MIN_ZOOM,
    zoomBelow: BUILDING_MIN_ZOOM + 0.5,
    zoomTo: BUILDING_MIN_ZOOM + 1,
    none: ["この辺りは PLATEAU の建物データがありません", "PLATEAU のある市区町村だけ出ます"],
  },
  landPrice: {
    label: "地価",
    source: "landprice",
    show: LAND_PRICE_LAYERS,
    layers: ["lpt-dot", "lp-dot"],
    minZoom: LAND_PRICE_MIN_ZOOM,
    // 地点は町の中にまばらなので、押しても寄らない
    zoomBelow: 0,
    zoomTo: 0,
    none: ["この辺りは地価公示・地価調査の地点がありません", "少し引くと、近くの地点が出ます"],
  },
} as const;
type Overlay = keyof typeof OVERLAYS;
const OVERLAY_KEYS = Object.keys(OVERLAYS) as Overlay[];
/** 何も出ていない理由：引きすぎ・読み込み中・データの無い地域・読み込みの失敗。partial は道路種別を一部しか読めなかったとき */
type OverlayNote = "zoom" | "loading" | "none" | "error" | "partial";

/** これより引いて（関東全体などを）見ているときは、筆・用途地域を表示しても寄らない（寄った先が物件の辺りとは限らない） */
const AUTO_ZOOM_FROM = 12;

/** 道路種別を読む範囲は、見ている範囲より縦横それぞれこの割合だけ広く（少し動かしただけで読み直さない） */
const ROAD_MARGIN = 0.5;

type Bbox = [number, number, number, number];
const within = (a: Bbox, b: Bbox) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const grow = ([w, s, e, n]: Bbox, f: number): Bbox => [w - (e - w) * f, s - (n - s) * f, e + (e - w) * f, n + (n - s) * f];

/** 何か描かれているかを先に調べる点（見ている範囲の中での位置。中央と4か所） */
const SAMPLE_POINTS = [
  [0.5, 0.5],
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
] as const;

/** ハザードの凡例。土砂災害は種類ごとに特別警戒区域・警戒区域（指定予定の薄い色は凡例の注記で） */
function hazardLegend(kind: HazardKind): LegendItem[] {
  const layers = HAZARDS[kind].layers;
  // 家屋倒壊は同じ赤で、氾濫流は丸の模様、河岸侵食は塗り
  if (kind === "kaoku")
    return [
      { label: "氾濫流（赤い丸の模様）", short: "氾濫流（丸の模様）", color: "#ff0000", kind: "line" },
      { label: "河岸侵食（赤い塗り）", short: "河岸侵食（塗り）", color: "#ff0000", kind: "area" },
    ];
  if (kind === "dosha")
    return layers.flatMap((l) =>
      l.classes
        .filter((c) => !c.sub)
        .map((c) => ({ label: `${l.name}：${c.label}`, short: `${l.name.replace(/地の崩壊$/, "")}・${c.short}`, color: c.color, kind: "area" as const })),
    );
  return layers.flatMap((l) => l.classes.map((c) => ({ label: c.label, short: c.short, color: c.color, kind: "area" as const })));
}

/** ハザードの凡例の注記 */
const HAZARD_FOOT: Partial<Record<HazardKind, string>> = {
  dosha: "薄い色は指定予定の区域。",
  keizoku: "「2週間以上」の色でも4週間以上のことがあります。",
};

export type LiveMapProps = {
  /** 物件の位置。無ければ関東全体を表示する */
  point?: Point;
  /** PDF の分割図の市で、物件が載っている図（範囲の枠を重ねる） */
  sheet?: SheetHit;
  /** 地番で見つけた筆・地図で選んだ地点の筆（強調する） */
  parcel?: { kuiki: string; chibanRaw: string; chibanRaws?: string[] };
  mode?: "pin" | "crosshair";
  /** pin: ピンを動かした・クリックした地点で調べる */
  onPick?: (lat: number, lng: number) => void;
  /** crosshair: 地図を動かし終えたときの中央の地点とズーム（「筆・地番」を表示していれば、中央の筆の地番も） */
  onCenter?: (lat: number, lng: number, zoom: number, parcel?: string) => void;
  /** 地図の上に重なるパネルの分だけ、中心をずらす */
  padding?: Partial<Padding>;
  /** 右上の道具（背景の切り替えなど）の位置 */
  toolsClassName?: string;
  /** 地図を作れなかったとき（WebGL が使えないなど） */
  onFail?: () => void;
  /** 道路種別を読める市の公開データ（「道路種別」で地図に描く）。city は凡例に添える市の名前 */
  roads?: { read: RoadRead; city: string };
  /** 住所で調べるたびに変わる値。変わったら物件の場所へ戻る（同じ住所で調べ直したときも） */
  focusKey?: number;
  /** スマホの全画面の地図。理由と凡例を左上に出す（右の道具・中央のピンと重ならないよう）。crosshair はいつもこの形 */
  compact?: boolean;
  /** 最初から重ねておくもの（「近くの道路」から開いたときの道路種別など） */
  initial?: Partial<Record<"parcels" | "zoning" | "roads" | "buildings" | "landPrice", boolean>>;
  /** 凡例を地図の外（この要素の中）に出す。スマホの全画面の地図で、凡例が地図とピンを隠さないように */
  legendTarget?: HTMLElement | null;
  /** 最初から重ねておくハザードの種類（スマホの災害リスクの一覧から「地図」で開いたとき） */
  initialHazard?: HazardKind;
  /** 最初に見せる地価の地点（[経度, 緯度]。スマホの地価の一覧から「地図」で開いたとき）。物件と両方が見える範囲にする */
  initialLandPrice?: [number, number];
};

/** 地価の地点と物件が両方見える範囲へ（物件が無ければ地点へ寄る） */
function fitLandPrice(map: MapLibreMap, [plng, plat]: [number, number], point?: Point) {
  if (!point) {
    map.flyTo({ center: [plng, plat], zoom: 15, duration: 900 });
    return;
  }
  const cam = map.cameraForBounds(
    [
      [Math.min(point.lng, plng), Math.min(point.lat, plat)],
      [Math.max(point.lng, plng), Math.max(point.lat, plat)],
    ],
    { padding: 80, maxZoom: 16 },
  );
  // 地理院タイルの文字が引き伸ばされてぼやけないよう、ズームは整数に（少し引く側へ）
  if (cam) map.flyTo({ ...cam, zoom: Math.floor(cam.zoom ?? 15), duration: 900 });
}

export default function LiveMap({
  point,
  sheet,
  parcel,
  mode = "pin",
  onPick,
  onCenter,
  padding,
  toolsClassName = "right-3 top-3",
  onFail,
  roads,
  focusKey,
  compact = mode === "crosshair",
  initial,
  legendTarget,
  initialHazard,
  initialLandPrice,
}: LiveMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pinRef = useRef<Marker | null>(null);
  const labelRef = useRef<Marker | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("pale");
  const [locating, setLocating] = useState(false);
  // 筆界と地番（登記所備付地図）・用途地域の塗り分けと都市計画道路・道路種別を表示するか（道路種別は読める市だけ）
  const [shown, setShown] = useState<Record<Overlay, boolean>>(() => ({ parcels: false, zoning: false, roads: false, buildings: false, landPrice: false, ...initial }));
  // 道路種別は読める市だけ、建物は PLATEAU のタイルがあるときだけ
  const on: Record<Overlay, boolean> = { ...shown, roads: shown.roads && !!roads, buildings: shown.buildings && hasBuildings() };
  const onRef = useRef(on);
  useEffect(() => {
    onRef.current = on;
  });
  // 表示しているのに何も出ていないときの理由
  const [notes, setNotes] = useState<Partial<Record<Overlay, OverlayNote>>>(() =>
    Object.fromEntries(OVERLAY_KEYS.filter((k) => initial?.[k]).map((k) => [k, "loading" as const])),
  );
  const setNote = (k: Overlay, v?: OverlayNote) => setNotes((s) => (s[k] === v ? s : { ...s, [k]: v }));
  // 凡例（見ている辺りの用途地域・道路種別の色）
  const [legend, setLegend] = useState<{ zoning?: LegendItem[]; roads?: LegendItem[] }>({});
  const setLegendOf = (k: "zoning" | "roads", items?: LegendItem[]) =>
    setLegend((s) => (JSON.stringify(s[k]) === JSON.stringify(items) ? s : { ...s, [k]: items }));
  // 読み込みに失敗したデータ（地図のエラーと、道路種別の読み込み）
  const failed = useRef<Record<Overlay, boolean>>({ parcels: false, zoning: false, roads: false, buildings: false, landPrice: false });
  // 道路種別を読んでいる最中か（読み終えるまで「読み込んでいます」のまま）。件数の上限で読み切れなかったか
  const roadsLoading = useRef(false);
  const roadsTruncated = useRef(false);
  // 重ねているハザードの種類（null は重ねていない）。「ハザード」を押し直したときは前の種類に戻す
  const [hazard, setHazard] = useState<HazardKind | null>(initialHazard ?? null);
  const lastHazard = useRef<HazardKind>(initialHazard ?? "flood");
  // 種類を選ぶ欄（選ぶときだけ開く。開いたままだと、地図をタップした地点の吹き出しに重なる）
  const [hazardMenu, setHazardMenu] = useState(false);
  const hazardRef = useRef(hazard);
  useEffect(() => {
    hazardRef.current = hazard;
  });
  // 地図のイベントからは最新の関数を呼ぶ
  const cb = useRef({ onPick, onCenter, onFail });
  useEffect(() => {
    cb.current = { onPick, onCenter, onFail };
  });
  const pad: Padding = { top: 0, bottom: 0, left: 0, right: 0, ...padding };
  const padKey = `${pad.top},${pad.bottom},${pad.left},${pad.right}`;

  // 地図を作る（最初の1回）
  useEffect(() => {
    if (!container.current) return;
    let map: MapLibreMap;
    // 見つけた筆・図の範囲の色は、画面の brand の色（PC は金色、スマホの紺の見た目では紺）
    const css = getComputedStyle(container.current);
    const fill = css.getPropertyValue("--color-brand-light").trim();
    const line = css.getPropertyValue("--color-brand").trim();
    try {
      map = new MapLibreMap({
        container: container.current,
        style: gsiStyle("pale", fill && line ? { fill, line } : undefined),
        ...(point ? { center: [point.lng, point.lat] as [number, number], zoom: 17 } : { bounds: KANTO_BOUNDS, fitBoundsOptions: { padding: pad } }),
        minZoom: 5,
        maxZoom: 19.5,
        // 道路図と見比べるので、いつも北が上（回転・傾きなし）
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxBounds: [
          [122, 20],
          [154, 46.5],
        ],
        attributionControl: { compact: true },
        locale: LOCALE,
      });
    } catch {
      cb.current.onFail?.();
      return;
    }
    // パネルの分だけ中心をずらす（最初の位置にも効かせる）
    map.setPadding(pad);
    if (point) map.jumpTo({ center: [point.lng, point.lat] });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new ScaleControl({ maxWidth: 110 }), "bottom-right");
    map.on("load", () => setLoaded(true));
    // スマホの狭い地図では、出典（地理院タイル・PLATEAU・登記所備付地図など）の帯を最初から畳んでおく（ⓘ で開ける）。
    // 開いたままだと地図の下の方を大きく隠す。MapLibre は地図を動かすと畳むが、最初は開いている
    if (compact) map.once("idle", () => map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    // 地図を触ったら、ハザードの種類を選ぶ欄は閉じる
    map.on("dragstart", () => setHazardMenu(false));
    map.on("click", () => setHazardMenu(false));
    mapRef.current = map;

    /** 画面上の点にある筆の「地番 354（熊谷市下奈良）」（筆界を表示しているときだけ） */
    const parcelLabelAt = (pt: { x: number; y: number }) => {
      if (!onRef.current.parcels || map.getZoom() < PARCEL_MIN_ZOOM) return undefined;
      const f = map.queryRenderedFeatures([pt.x, pt.y], { layers: PARCEL_PICK_LAYERS })[0];
      const p = f?.properties as { 地番?: string; 地番区域?: string } | undefined;
      const est =
        f?.layer.id === "kozu-fill" ? (Number(f.properties?.q) === 2 ? "・公図から推定・確度低" : "・公図から推定") : f?.layer.id === "sanko-fill" ? "・地番参考図" : "";
      return p?.地番 ? `${chibanLabel(String(p.地番))}（${kuikiLabel(String(p.地番区域 ?? ""))}${est}）` : undefined;
    };
    /** 画面上の点の用途地域「第１種低層住居専用地域 50/100」（用途地域を表示しているときだけ） */
    const youtoLabelAt = (pt: { x: number; y: number }) => {
      if (!onRef.current.zoning || map.getZoom() < ZONING_MIN_ZOOM) return undefined;
      const p = map.queryRenderedFeatures([pt.x, pt.y], { layers: ["zoning-youto-fill"] })[0]?.properties as { name?: string; bcr?: number; far?: number } | undefined;
      return p?.name ? `${p.name}${p.bcr && p.far ? ` ${p.bcr}/${p.far}` : ""}` : undefined;
    };
    /** 画面上の点の道路種別「道路：42条2項」（道路種別を表示しているときだけ。線は少し太めに拾う） */
    const roadLabelAt = (pt: { x: number; y: number }) => {
      if (!onRef.current.roads || map.getZoom() < ROAD_MIN_ZOOM) return undefined;
      const p = map.queryRenderedFeatures(
        [
          [pt.x - 4, pt.y - 4],
          [pt.x + 4, pt.y + 4],
        ],
        { layers: ["road-line", "road-fill"] },
      )[0]?.properties as { label?: string } | undefined;
      return p?.label ? `道路：${p.label}` : undefined;
    };
    /** 画面上の点の地価の地点「地価公示 千代田-1（住宅地）441万円/m²（+11.4%）」（地価を表示しているときだけ。点なので広めに拾う） */
    const landPriceLabelAt = (pt: { x: number; y: number }) => {
      if (!onRef.current.landPrice || map.getZoom() < LAND_PRICE_MIN_ZOOM) return undefined;
      const p = map.queryRenderedFeatures(
        [
          [pt.x - 8, pt.y - 8],
          [pt.x + 8, pt.y + 8],
        ],
        { layers: ["lp-dot", "lpt-dot"] },
      )[0]?.properties as { k?: number; no?: string; p?: number; c?: number; u?: string } | undefined;
      if (!p?.no || !p.p) return undefined;
      return landPriceSummary({ kind: p.k === 1 ? "調査" : "公示", no: p.no, usage: usageFromCode(String(p.u ?? "0")), price: p.p, change: p.c });
    };

    // 表示しているのに地図に何も描かれていなければ、地図が落ち着いたところで理由を出す。描かれていれば凡例を出す
    const overlayOf = (sourceId?: string) => OVERLAY_KEYS.find((k) => OVERLAYS[k].source === sourceId);
    map.on("error", (e) => {
      const k = overlayOf((e as { sourceId?: string }).sourceId);
      if (k) failed.current[k] = true;
      // 聞き手がいると MapLibre は自分ではエラーを出さなくなるので、これまでどおり出す
      console.error(e.error);
    });
    map.on("sourcedata", (e) => {
      const k = e.tile ? overlayOf(e.sourceId) : undefined;
      if (k) failed.current[k] = false;
    });
    map.on("idle", () => {
      // パネルに隠れていない範囲だけを見る
      const { top = 0, bottom = 0, left = 0, right = 0 } = map.getPadding();
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const [x0, y0, x1, y1] = [left, top, Math.max(left, w - right), Math.max(top, h - bottom)];
      const box: [PointLike, PointLike] = [
        [x0, y0],
        [x1, y1],
      ];
      /** 見ている範囲に何か描かれているか。筆の多い所で範囲全体を調べると重いので、先に中央と4か所の点で調べる */
      const drawn = (layers: string[]) =>
        SAMPLE_POINTS.some(([fx, fy]) => map.queryRenderedFeatures([x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy], { layers }).length > 0) ||
        map.queryRenderedFeatures(box, { layers }).length > 0;
      for (const k of OVERLAY_KEYS) {
        if (!onRef.current[k] || (k === "roads" && roadsLoading.current)) continue;
        const o = OVERLAYS[k];
        if (map.getZoom() < o.minZoom) setNote(k, "zoom");
        else if (drawn([...o.layers])) setNote(k, k === "roads" && roadsTruncated.current ? "partial" : undefined);
        else setNote(k, failed.current[k] ? "error" : "none");
      }
      // 用途地域の凡例：見ている範囲の用途地域（種類の番号の順）と、都市計画道路
      if (onRef.current.zoning && map.getZoom() >= ZONING_MIN_ZOOM) {
        const youto = new Map<number, string>();
        for (const f of map.queryRenderedFeatures(box, { layers: ["zoning-youto-fill"] })) {
          const p = f.properties as { code?: number; name?: string };
          if (p.code && p.name && !youto.has(Number(p.code))) youto.set(Number(p.code), String(p.name));
        }
        const items: LegendItem[] = [...youto]
          .sort(([a], [b]) => a - b)
          .map(([code, name]) => ({ label: name, short: youtoShort(name), color: YOUTO_COLORS[code] ?? "#cccccc", kind: "area" }));
        if (map.queryRenderedFeatures(box, { layers: ["zoning-douro"] }).length) items.push({ label: "都市計画道路（計画線）", short: "計画道路", color: DOURO_COLOR, kind: "dash" });
        setLegendOf("zoning", items.length ? items : undefined);
      } else setLegendOf("zoning", undefined);
      // 道路種別の凡例：見ている範囲の種別（読んだ順ではなく名前の順）
      if (onRef.current.roads && map.getZoom() >= ROAD_MIN_ZOOM) {
        const kinds = new Map<string, LegendItem>();
        for (const f of map.queryRenderedFeatures(box, { layers: ["road-line", "road-fill"] })) {
          const p = f.properties as { label?: string; short?: string; color?: string };
          if (!p.label || !p.color || kinds.has(`${p.label}|${p.color}`)) continue;
          kinds.set(`${p.label}|${p.color}`, { label: p.label, short: p.short ?? p.label, color: p.color, kind: f.layer.id === "road-fill" ? "area" : "line" });
        }
        const items = [...kinds.values()].sort((a, b) => a.label.localeCompare(b.label, "ja", { numeric: true }));
        setLegendOf("roads", items.length ? items : undefined);
      } else setLegendOf("roads", undefined);
    });

    if (mode === "crosshair") {
      const report = () => {
        const c = map.getCenter();
        cb.current.onCenter?.(c.lat, c.lng, map.getZoom(), parcelLabelAt(map.project(c)));
      };
      map.on("moveend", report);
      // 筆のタイルを読み終えたら、中央の地番を出し直す
      map.on("idle", report);
      map.once("load", report);
    } else {
      // クリックした地点に「ここで調べる」を出す（誤って選ばないよう、すぐには調べない）
      const popup = new Popup({ closeButton: true, closeOnClick: true, offset: 8, className: "michilu-popup" });
      map.on("click", (e) => {
        if (!cb.current.onPick) return;
        const box = document.createElement("div");
        box.className = "flex flex-col items-center gap-1.5 px-1 pt-1";
        const note = document.createElement("p");
        note.className = "text-[11px] text-muted";
        note.textContent = "この地点の道路図を調べますか？";
        for (const label of [parcelLabelAt(e.point), youtoLabelAt(e.point), roadLabelAt(e.point), landPriceLabelAt(e.point)]) {
          if (!label) continue;
          const l = document.createElement("p");
          l.className = "max-w-[17em] text-center text-[12px] font-semibold text-ink";
          l.textContent = label;
          box.append(l);
        }
        // 建物を表示していれば、その地点の建物（PLATEAU。タイルを読むので、あとから入れる）
        if (onRef.current.buildings && map.getZoom() >= BUILDING_MIN_ZOOM) {
          const l = document.createElement("p");
          l.className = "max-w-[16em] text-center text-[12px] font-semibold text-ink";
          l.textContent = "建物：確認中…";
          box.append(l);
          buildingAt(e.lngLat.lat, e.lngLat.lng, pmtilesBuildingSource)
            .then((r) => (l.textContent = r?.hit ? `建物：${buildingSummary(r.hit.building)}` : "建物：この地点には無し"))
            .catch(() => (l.textContent = "建物：読み込めませんでした"));
        }
        // 重ねているハザードの、その地点の区分（タイルの色を読むので、あとから入れる）
        const hk = hazardRef.current;
        if (hk) {
          const l = document.createElement("p");
          l.className = "text-[12px] font-semibold text-ink";
          l.textContent = `${HAZARDS[hk].short}：確認中…`;
          box.append(l);
          hazardAt(e.lngLat.lat, e.lngLat.lng, browserTileFetcher, [hk])
            .then((r) => (l.textContent = hazardPointLabel(hk, r[hk]) ?? ""))
            .catch(() => (l.textContent = `${HAZARDS[hk].short}：読み込めませんでした`));
        }
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bg-gold rounded-full px-4 py-1.5 text-[13px] font-semibold text-white";
        btn.textContent = "ここで調べる";
        btn.onclick = () => {
          popup.remove();
          cb.current.onPick?.(e.lngLat.lat, e.lngLat.lng);
        };
        box.append(note, btn);
        popup.setLngLat(e.lngLat).setDOMContent(box).addTo(map);
      });
    }
    return () => {
      map.remove();
      mapRef.current = null;
      pinRef.current = null;
      labelRef.current = null;
    };
    // 地図は1回だけ作り、位置や図の変化は下の effect で反映する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // パネルの分だけ中心をずらす
  useEffect(() => {
    mapRef.current?.setPadding(pad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padKey]);

  // 物件のピン。新しい場所なら、そこへ移動する
  const lat = point?.lat;
  const lng = point?.lng;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== "pin") return;
    if (lat === undefined || lng === undefined) {
      pinRef.current?.remove();
      pinRef.current = null;
      map.fitBounds(KANTO_BOUNDS, { duration: 800 });
      return;
    }
    if (!pinRef.current) {
      const el = document.createElement("div");
      el.innerHTML = PIN_SVG;
      el.className = "cursor-grab text-brand drop-shadow-md active:cursor-grabbing";
      el.title = "ドラッグして物件の場所を直せます";
      const pin = new Marker({ element: el, anchor: "bottom", draggable: true }).setLngLat([lng, lat]).addTo(map);
      pin.on("dragend", () => {
        const p = pin.getLngLat();
        cb.current.onPick?.(p.lat, p.lng);
      });
      pinRef.current = pin;
    } else pinRef.current.setLngLat([lng, lat]);
    // ピンを動かして選び直したときは、地図はそのまま。別の場所を調べたときだけ移動する
    if (map.getZoom() < 15 || !map.getBounds().contains([lng, lat])) map.flyTo({ center: [lng, lat], zoom: 17, duration: 1200 });
  }, [lat, lng, mode]);

  // 住所で調べ直したら（同じ住所でも）、地図を動かしていても物件の場所へ戻る
  const lastFocus = useRef(focusKey);
  useEffect(() => {
    if (focusKey === lastFocus.current) return;
    lastFocus.current = focusKey;
    if (lat !== undefined && lng !== undefined) mapRef.current?.flyTo({ center: [lng, lat], zoom: 17, duration: 900 });
  }, [focusKey, lat, lng]);

  // 図の範囲の枠と、図の名前の札
  const sheetKey = sheet ? `${sheet.label}|${sheet.bounds.join(",")}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource("sheet") as GeoJSONSource | undefined)?.setData(sheetFeatures(sheet));
    labelRef.current?.remove();
    labelRef.current = null;
    if (sheet) {
      const el = document.createElement("div");
      el.className = "rounded-md bg-brand px-2 py-0.5 text-[11px] font-semibold text-white shadow";
      el.textContent = sheet.whole ? "市全体の図" : `図 ${sheet.label}`;
      labelRef.current = new Marker({ element: el, anchor: "bottom-left" }).setLngLat([sheet.bounds[1], sheet.bounds[0]]).addTo(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetKey, loaded]);

  // 見つけた筆の強調
  const parcelKey = parcel ? `${parcel.kuiki}|${(parcel.chibanRaws ?? [parcel.chibanRaw]).join(",")}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    for (const id of PARCEL_HIT_LAYERS) {
      map.setFilter(id, parcelHitFilter(id, parcel));
      map.setLayoutProperty(id, "visibility", parcel ? "visible" : "none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelKey, loaded]);

  // 筆界と地番・用途地域・道路種別の表示
  const onKey = OVERLAY_KEYS.map((k) => (on[k] ? 1 : 0)).join("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    // 建物のレイヤは、PLATEAU のタイルがあるときだけ地図にある
    for (const k of OVERLAY_KEYS) for (const id of OVERLAYS[k].show) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on[k] ? "visible" : "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onKey, loaded]);

  // ハザード：選んだ種類のタイルだけ表示する
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const shown = new Set(hazard ? HAZARDS[hazard].layers.map((l) => l.id) : []);
    for (const l of HAZARD_LAYERS) map.setLayoutProperty(hazardLayerId(l.id), "visibility", shown.has(l.id) ? "visible" : "none");
  }, [hazard, loaded]);

  // PC：パネルの「地図に重ねる」。その種類を重ね、物件の辺り（町が見える大きさ）を見せる
  useEffect(() => {
    const onShow = (e: Event) => {
      const kind = (e as CustomEvent<HazardKind>).detail;
      if (!HAZARDS[kind]) return;
      lastHazard.current = kind;
      setHazard(kind);
      const map = mapRef.current;
      if (!map || lat === undefined || lng === undefined) return;
      if (map.getZoom() > 16 || map.getZoom() < 14 || !map.getBounds().contains([lng, lat])) map.flyTo({ center: [lng, lat], zoom: 16, duration: 900 });
    };
    window.addEventListener(HAZARD_EVENT, onShow);
    return () => window.removeEventListener(HAZARD_EVENT, onShow);
  }, [lat, lng]);

  // パネルの地価の一覧の「地図」。地価を重ね、物件とその地点が両方見えるようにする
  useEffect(() => {
    const onShow = (e: Event) => {
      setShown((s) => ({ ...s, landPrice: true }));
      if (mapRef.current) fitLandPrice(mapRef.current, (e as CustomEvent<[number, number]>).detail, point);
    };
    window.addEventListener(LAND_PRICE_EVENT, onShow);
    return () => window.removeEventListener(LAND_PRICE_EVENT, onShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  // スマホの地価の一覧から開いたときは、地図を読み終えたところで同じようにする（1回だけ）
  const firstLandPrice = useRef(initialLandPrice);
  useEffect(() => {
    const p = firstLandPrice.current;
    if (!mapRef.current || !loaded || !p) return;
    firstLandPrice.current = undefined;
    fitLandPrice(mapRef.current, p, point);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  /** 「ハザード」：重ねていなければ前の種類（最初は洪水）を重ねて種類の欄を開く。重ねていれば欄を開け閉めする */
  const toggleHazard = () => {
    if (hazard) return setHazardMenu((o) => !o);
    setHazard(lastHazard.current);
    setHazardMenu(true);
  };
  /** 種類を選ぶ（null は重ねない） */
  const pickHazard = (k: HazardKind | null) => {
    if (k) lastHazard.current = k;
    setHazard(k);
    setHazardMenu(false);
  };

  // 道路種別：見ている範囲（少し広め）の道路を市の公開データから読んで描く。読んだ範囲の中を動くあいだは読み直さない
  const roadsKey = roads ? roads.read.layers.map((l) => l.url).join(",") : "";
  const roadsRead = useRef<{ key: string; bbox?: Bbox }>({ key: "" });
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    // 別の市を調べたら、前の市の道路は消す
    if (roadsRead.current.key !== roadsKey) {
      roadsRead.current = { key: roadsKey };
      roadsTruncated.current = false;
      (map.getSource("roads") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
    }
    if (!on.roads || !roads) return;
    let ctrl: AbortController | undefined;
    const load = () => {
      if (map.getZoom() < ROAD_MIN_ZOOM) return;
      const b = map.getBounds();
      const view: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const done = roadsRead.current.bbox;
      if (done && within(view, done)) return;
      const area = grow(view, ROAD_MARGIN);
      ctrl?.abort();
      const c = (ctrl = new AbortController());
      roadsLoading.current = true;
      setNote("roads", "loading");
      readRoadShapes(roads.read, area, { fetchFn: (u) => fetch(u, { signal: c.signal }) })
        .then((fc) => {
          if (c.signal.aborted) return;
          // 読み切れなかったときは範囲を覚えない（拡大・移動したら読み直す）
          roadsRead.current = { key: roadsKey, bbox: fc.truncated ? undefined : area };
          failed.current.roads = false;
          roadsTruncated.current = fc.truncated;
          (map.getSource("roads") as GeoJSONSource | undefined)?.setData(fc);
        })
        .catch(() => {
          if (!c.signal.aborted) failed.current.roads = true;
        })
        .finally(() => {
          if (c.signal.aborted) return;
          roadsLoading.current = false;
          // 描き終えたところ（idle）で、理由と凡例を出し直す
          map.triggerRepaint();
        });
    };
    load();
    map.on("moveend", load);
    return () => {
      map.off("moveend", load);
      ctrl?.abort();
      roadsLoading.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on.roads, roadsKey, loaded]);

  /** 「筆・地番」などを押したとき。町を見ているくらいなら、描ける大きさまで寄る。すぐに「読み込んでいます」などを出し、地図が落ち着いたら中身を見て出し直す */
  const toggleOverlay = (k: Overlay) => {
    const next = !on[k];
    setShown((s) => ({ ...s, [k]: next }));
    const map = mapRef.current;
    const z = map?.getZoom() ?? 0;
    // 関東全体のように引いた地図では寄らない（寄った先が物件の辺りとは限らない）
    if (next && z >= AUTO_ZOOM_FROM && z < OVERLAYS[k].zoomBelow) map?.easeTo({ zoom: OVERLAYS[k].zoomTo, duration: 700 });
    setNote(k, !next ? undefined : z < AUTO_ZOOM_FROM ? "zoom" : "loading");
    if (!next && (k === "zoning" || k === "roads")) setLegendOf(k, undefined);
  };

  // 背景（淡色・標準・写真）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    for (const k of Object.keys(BASEMAPS) as Basemap[]) map.setLayoutProperty(k, "visibility", k === basemap ? "visible" : "none");
  }, [basemap, loaded]);

  const fitSheet = () => {
    if (!sheet) return;
    const [n, w, s, e] = sheet.bounds;
    mapRef.current?.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 28, duration: 900 },
    );
  };
  const toPoint = () => point && mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 17, duration: 900 });
  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        mapRef.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 18, duration: 900 });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  // 表示しているのに何も出ていないときの理由
  const overlayNotes = OVERLAY_KEYS.map((k) => {
    const note = on[k] ? notes[k] : undefined;
    if (!note) return null;
    const o = OVERLAYS[k];
    const [text, sub] =
      note === "zoom"
        ? ["地図を拡大すると表示されます"]
        : note === "loading"
          ? ["読み込んでいます…"]
          : note === "error"
            ? ["読み込めませんでした", "通信の状態を確かめてください"]
            : note === "partial"
              ? ["道路が多いので一部だけ表示しています", "地図を拡大すると全部表示されます"]
              : o.none;
    return (
      <p key={k} className={`flex ${compact ? "" : "max-w-[248px]"} items-start gap-1.5 rounded-xl bg-white/95 px-3 py-1.5 text-[11px] leading-[1.5] text-ink shadow-soft`}>
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0 text-brand" />
        <span>
          <b className="font-semibold">{o.label}</b>：{text}
          {sub && <span className="block text-muted">{sub}</span>}
        </span>
      </p>
    );
  });

  // 凡例（用途地域・道路種別・ハザード）。道路種別は、どの市のデータかと「参考」であることを添える。
  // ハザードは国のデータで、重要事項説明には市区町村のハザードマップを使うことを添える
  const legends = [
    hazard && (
      <MapLegend
        key="hazard"
        title={HAZARDS[hazard].legend}
        items={hazardLegend(hazard)}
        compact={compact}
        foot={`${HAZARD_FOOT[hazard] ?? ""}国の重ねるハザードマップ（参考）。色の無い所は区域外かデータ無し。重要事項説明は市区町村のハザードマップで`}
      />
    ),
    on.parcels && (hasKozu() || hasSanko()) && (
      <MapLegend
        key="parcels"
        title="筆界"
        items={[
          { label: "登記所備付地図", short: "登記所の地図", color: "#b0472a", kind: "line" as const },
          ...(hasSanko() ? [{ label: "市町村の地番参考図", short: "地番参考図", color: SANKO_COLOR, kind: "line" as const }] : []),
          ...(hasKozu()
            ? [
                { label: "公図から推定した位置", short: "公図（推定）", color: KOZU_COLORS.high, kind: "dash" as const },
                { label: "推定（確度低）", short: "推定・確度低", color: KOZU_COLORS.low, kind: "dash" as const },
              ]
            : []),
        ]}
        compact={compact}
        foot={[
          hasSanko() && "緑の線は、市町村が公開している課税用の地番参考図の筆で、登記の地番・筆の形と違うことがあります。",
          hasKozu() && "点線は、公図（任意座標）の形を道路の縁に合わせて置いた推定の位置です。数m（薄い点線は5m前後）ずれることがあります。",
          "謄本・公図で確かめてください",
        ]
          .filter(Boolean)
          .join("")}
      />
    ),
    on.zoning && legend.zoning && <MapLegend key="zoning" title="用途地域の色" items={legend.zoning} compact={compact} />,
    on.buildings && (
      <MapLegend
        key="buildings"
        title="建物の用途（PLATEAU）"
        items={Object.values(USAGE_GROUPS).map((g) => ({ label: g.label, short: g.label.replace(/・.*$/, ""), color: g.color, kind: "dot" as const }))}
        compact={compact}
        foot={`点は建物の代表点。拡大すると用途と階数（名前のある建物は名前）が出ます。国土交通省 PLATEAU の3D都市モデル（参考${BUILDING_DATA.edition ? `・${BUILDING_DATA.edition}` : ""}）`}
      />
    ),
    on.roads && legend.roads && roads && (
      <MapLegend key="roads" title="道路種別の色" items={legend.roads} compact={compact} foot={`${roads.city}の地図データ（参考）。最終確認は窓口で`} />
    ),
    on.landPrice && (
      <MapLegend
        key="landPrice"
        title="地価（円/m²）"
        items={Object.entries(LAND_USAGE_COLORS).map(([label, color]) => ({ label, short: label.replace(/地$/, ""), color, kind: "dot" as const }))}
        compact={compact}
        foot="地価公示（1月1日時点）と、縁の濃い点は都道府県地価調査（7月1日時点）。その地域の標準的な土地の価格で、物件の価格ではありません"
      />
    ),
  ];

  const toolBase = "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] shadow-soft";
  const tool = `${toolBase} bg-white/95 text-ink hover:bg-mint`;
  return (
    <div className="absolute inset-0">
      {/* MapLibre の CSS が地図の箱を position: relative にするので、絶対配置ではなく大きさで広げる */}
      <div ref={container} className="h-full w-full" />
      {mode === "crosshair" && (
        // 地図の中央が選ぶ地点（ピンの先が中央）
        <PinIcon className="pointer-events-none absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-full text-brand drop-shadow-md" />
      )}
      <div className={`absolute flex flex-col items-end gap-2 ${toolsClassName}`}>
        <div className="flex rounded-full bg-white/95 p-0.5 shadow-soft" role="group" aria-label="背景の地図">
          {(Object.keys(BASEMAPS) as Basemap[]).map((k) => (
            <button
              key={k}
              onClick={() => setBasemap(k)}
              aria-pressed={basemap === k}
              className={`rounded-full px-3 py-1 text-[12px] ${basemap === k ? "bg-gold text-white" : "text-ink hover:bg-mint"}`}
            >
              {BASEMAPS[k].label}
            </button>
          ))}
        </div>
        <button onClick={() => toggleOverlay("parcels")} aria-pressed={on.parcels} className={on.parcels ? `${toolBase} bg-gold text-white` : tool}>
          <ParcelIcon className={`h-4 w-4 ${on.parcels ? "" : "text-brand"}`} />
          筆・地番
        </button>
        <button
          onClick={() => toggleOverlay("zoning")}
          aria-pressed={on.zoning}
          className={on.zoning ? `${toolBase} bg-gold text-white` : tool}
          title="用途地域の色分けと都市計画道路（点線）を表示"
        >
          <ZoningIcon className={`h-4 w-4 ${on.zoning ? "" : "text-brand"}`} />
          用途地域
        </button>
        {roads && (
          <button
            onClick={() => toggleOverlay("roads")}
            aria-pressed={on.roads}
            className={on.roads ? `${toolBase} bg-gold text-white` : tool}
            title={`${roads.city}の道路種別の地図データを、この地図に描く`}
          >
            <RoadIcon className={`h-4 w-4 ${on.roads ? "" : "text-brand"}`} />
            道路種別
          </button>
        )}
        {hasBuildings() && (
          <button
            onClick={() => toggleOverlay("buildings")}
            aria-pressed={on.buildings}
            className={on.buildings ? `${toolBase} bg-gold text-white` : tool}
            title="建物の用途・階数（国土交通省 PLATEAU の3D都市モデル）を表示"
          >
            <BuildingIcon className={`h-4 w-4 ${on.buildings ? "" : "text-brand"}`} />
            建物
          </button>
        )}
        <button
          onClick={() => toggleOverlay("landPrice")}
          aria-pressed={on.landPrice}
          className={on.landPrice ? `${toolBase} bg-gold text-white` : tool}
          title="地価公示・都道府県地価調査の地点と価格（円/m²）を表示"
        >
          <LandPriceIcon className={`h-4 w-4 ${on.landPrice ? "" : "text-brand"}`} />
          地価
        </button>
        <button
          onClick={toggleHazard}
          aria-pressed={!!hazard}
          aria-expanded={hazardMenu}
          className={hazard ? `${toolBase} bg-gold text-white` : tool}
          title="洪水・土砂災害などの想定区域（国の重ねるハザードマップ）を表示"
        >
          <HazardIcon className={`h-4 w-4 ${hazard ? "" : "text-brand"}`} />
          {hazard ? `ハザード：${HAZARDS[hazard].short}` : "ハザード"}
          {hazard && <ChevronRightIcon className={`-mr-1 h-3.5 w-3.5 transition-transform ${hazardMenu ? "-rotate-90" : "rotate-90"}`} />}
        </button>
        {hazardMenu && (
          // 種類を選ぶ（iPhone で拡大されないよう、選択欄ではなくボタンを並べる）
          <div role="group" aria-label="ハザードの種類" className="grid grid-cols-2 gap-0.5 rounded-2xl bg-white/95 p-1 shadow-soft">
            {HAZARD_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => pickHazard(k)}
                aria-pressed={hazard === k}
                title={HAZARDS[k].label}
                className={`rounded-full px-2.5 py-1 text-[11.5px] leading-tight ${hazard === k ? "bg-gold text-white" : "text-ink hover:bg-mint"}`}
              >
                {HAZARDS[k].short}
              </button>
            ))}
            <button onClick={() => pickHazard(null)} className="rounded-full px-2.5 py-1 text-[11.5px] leading-tight text-muted hover:bg-mint">
              重ねない
            </button>
          </div>
        )}
        {mode === "pin" && point && (
          <button onClick={toPoint} className={tool}>
            <PinIcon className="h-4 w-4 text-brand" />
            物件の場所へ
          </button>
        )}
        {mode === "pin" && sheet && (
          <button onClick={fitSheet} className={tool} title={`${sheetName(sheet)}と同じ範囲を表示`}>
            <FrameIcon className="h-4 w-4 text-brand" />
            図の範囲
          </button>
        )}
        {mode === "crosshair" && (
          <button onClick={locate} className={tool} disabled={locating}>
            <LocateIcon className={`h-4 w-4 text-brand ${locating ? "animate-pulse" : ""}`} />
            現在地
          </button>
        )}
        {/* 何も出ていないときの理由（ボタンの並びが動かないよう、いちばん下に出す） */}
        {!compact && (
          <div role="status" className="pointer-events-none flex flex-col items-end gap-2">
            {overlayNotes}
          </div>
        )}
      </div>
      {!compact && !legendTarget && (
        // PC の凡例は地図の左下（パネルの右隣）。右上の道具や右下の拡大・縮小、下の出典の帯と重ならない
        <div className="absolute bottom-11 flex flex-col items-start gap-2" style={{ left: pad.left + 12 }}>
          {legends}
        </div>
      )}
      {compact && (
        // スマホでは、中央の印・ピンに重ならないよう地図の左上（右の道具の手前まで）に出す
        <div className="pointer-events-none absolute left-3 right-44 top-3 flex flex-col items-start gap-2">
          <div role="status" className="flex flex-col items-start gap-2">
            {overlayNotes}
          </div>
          {!legendTarget && legends}
        </div>
      )}
      {legendTarget && legends.some(Boolean) && createPortal(<div className="flex flex-col gap-1.5">{legends}</div>, legendTarget)}
    </div>
  );
}
