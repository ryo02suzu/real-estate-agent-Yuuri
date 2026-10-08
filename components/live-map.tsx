"use client";

// 動く地図（MapLibre GL ＋ 地理院タイル）。重いので next/dynamic で必要になったときだけ読み込む（components/map-panel.tsx）。
//  - pin: 物件にピンを立てる。ピンをドラッグするか、地図をクリックして「ここで調べる」で場所を選び直せる（PC）
//  - crosshair: 画面中央の印で場所を選ぶ（スマホの「地図で選ぶ」）
import "maplibre-gl/dist/maplibre-gl.css";
import { addProtocol, getVersion, MapLibreMap, Marker, NavigationControl, Popup, ScaleControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";
import { BASEMAPS, KANTO_BOUNDS, PARCEL_MIN_ZOOM, gsiStyle, parcelFilter, sheetFeatures, type Basemap } from "@/lib/map-style";
import { chibanLabel, kuikiLabel } from "@/lib/roadmap/parcel";
import { sheetName, type SheetHit } from "@/lib/roadmap/sheets";
import { FrameIcon, LocateIcon, ParcelIcon, PinIcon } from "./icons";

// 描画のワーカーは public/maplibre/<版>/ に置いてある（scripts/copy-maplibre-worker.mjs）
setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);
// 筆のタイル（PMTiles）を pmtiles:// で読めるようにする
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

// 物件のピン（components/icons.tsx の PinIcon と同じ形）
const PIN_SVG =
  '<svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path fill="#8a6632" stroke="#fff" stroke-width="1.2" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/></svg>';

type Point = { lat: number; lng: number };
type Padding = { top: number; bottom: number; left: number; right: number };

export type LiveMapProps = {
  /** 物件の位置。無ければ関東全体を表示する */
  point?: Point;
  /** PDF の分割図の市で、物件が載っている図（範囲の枠を重ねる） */
  sheet?: SheetHit;
  /** 地番で見つけた筆・地図で選んだ地点の筆（強調する） */
  parcel?: { kuiki: string; chibanRaw: string };
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
};

export default function LiveMap({ point, sheet, parcel, mode = "pin", onPick, onCenter, padding, toolsClassName = "right-3 top-3", onFail }: LiveMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pinRef = useRef<Marker | null>(null);
  const labelRef = useRef<Marker | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("pale");
  const [locating, setLocating] = useState(false);
  // 筆界と地番（登記所備付地図）を表示するか
  const [parcels, setParcels] = useState(false);
  const parcelsRef = useRef(false);
  useEffect(() => {
    parcelsRef.current = parcels;
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
    try {
      map = new MapLibreMap({
        container: container.current,
        style: gsiStyle(),
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
    mapRef.current = map;

    /** 画面上の点にある筆の「地番 354（熊谷市下奈良）」（筆界を表示しているときだけ） */
    const parcelLabelAt = (pt: { x: number; y: number }) => {
      if (!parcelsRef.current || map.getZoom() < PARCEL_MIN_ZOOM) return undefined;
      const f = map.queryRenderedFeatures([pt.x, pt.y], { layers: ["fude-fill"] })[0];
      const p = f?.properties as { 地番?: string; 地番区域?: string } | undefined;
      return p?.地番 ? `${chibanLabel(String(p.地番))}（${kuikiLabel(String(p.地番区域 ?? ""))}）` : undefined;
    };

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
        const label = parcelLabelAt(e.point);
        const note = document.createElement("p");
        note.className = "text-[11px] text-muted";
        note.textContent = "この地点の道路図を調べますか？";
        if (label) {
          const l = document.createElement("p");
          l.className = "text-[12px] font-semibold text-ink";
          l.textContent = label;
          box.append(l);
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
      el.className = "cursor-grab drop-shadow-md active:cursor-grabbing";
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
      el.className = "rounded-md bg-[#8a6632] px-2 py-0.5 text-[11px] font-semibold text-white shadow";
      el.textContent = sheet.whole ? "市全体の図" : `図 ${sheet.label}`;
      labelRef.current = new Marker({ element: el, anchor: "bottom-left" }).setLngLat([sheet.bounds[1], sheet.bounds[0]]).addTo(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetKey, loaded]);

  // 見つけた筆の強調
  const parcelKey = parcel ? `${parcel.kuiki}|${parcel.chibanRaw}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    for (const id of ["fude-hit", "fude-hit-line"]) {
      map.setFilter(id, parcelFilter(parcel));
      map.setLayoutProperty(id, "visibility", parcel ? "visible" : "none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelKey, loaded]);

  // 筆界と地番の表示
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    for (const id of ["fude-fill", "fude-line"]) map.setLayoutProperty(id, "visibility", parcels ? "visible" : "none");
    // 拡大していなければ、筆界が見える大きさまで寄る
    if (parcels && map.getZoom() < PARCEL_MIN_ZOOM + 1) map.easeTo({ zoom: PARCEL_MIN_ZOOM + 1.5, duration: 700 });
  }, [parcels, loaded]);

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
        <button onClick={() => setParcels((v) => !v)} aria-pressed={parcels} className={parcels ? `${toolBase} bg-gold text-white` : tool}>
          <ParcelIcon className={`h-4 w-4 ${parcels ? "" : "text-brand"}`} />
          筆・地番
        </button>
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
      </div>
    </div>
  );
}
