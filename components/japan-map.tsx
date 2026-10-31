"use client";

// スマホ用の「日本全体 → 確定した実地点」の地図。ひとつの地図カメラのまま、日本全体から物件の場所へ動く。
// PC の動く地図（components/live-map.tsx。関東の初期表示）とは別。ここで関東の設定は変えない。
import "maplibre-gl/dist/maplibre-gl.css";
import { getVersion, MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { StyleSpecification } from "maplibre-gl";

setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);

/** 日本全体（北方領土・南西諸島を含む）[[西, 南], [東, 北]] */
export const JAPAN_BOUNDS: [[number, number], [number, number]] = [
  [122.5, 24],
  [146, 45.8],
];
/**
 * 地理院タイル（淡色）の対応ズーム。国土地理院の一覧では淡色地図は z2〜z18。
 * 対応外のズームのタイルは要求しない（minzoom 未満は描かず、背景色の面を出す。maxzoom 超は z18 を引き伸ばす）。
 */
export const PALE_ZOOM = { min: 2, max: 18 } as const;
/** 物件の場所まで寄るズーム */
export const POINT_ZOOM = 16;

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    pale: {
      type: "raster",
      tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
      tileSize: 256,
      minzoom: PALE_ZOOM.min,
      maxzoom: PALE_ZOOM.max,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>',
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#e6f2f2" } },
    { id: "pale", type: "raster", source: "pale" },
  ],
};

const PIN_SVG = `<svg viewBox="0 0 28 38" width="28" height="38" aria-hidden="true"><path d="M14 0C6.3 0 0 6.2 0 13.8 0 24 14 38 14 38s14-14 14-24.2C28 6.2 21.7 0 14 0Z" fill="#0f766e"/><circle cx="14" cy="13.5" r="5" fill="#fff"/></svg>`;

export type JapanMapProps = {
  /** 確定した実地点。null なら日本全体 */
  point: { lat: number; lng: number } | null;
  /** 同じ地点を調べ直したときに増える（カメラを寄せ直す） */
  focus: number;
  /** 下から重なるパネルの高さ(px)。ピンがパネルに隠れないよう中心をずらす */
  bottomInset: number;
  reducedMotion: boolean;
  onFail?: () => void;
};

export default function JapanMap({ point, focus, bottomInset, reducedMotion, onFail }: JapanMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pin = useRef<Marker | null>(null);
  const latest = useRef({ point, bottomInset, reducedMotion, onFail });
  useEffect(() => {
    latest.current = { point, bottomInset, reducedMotion, onFail };
  });

  useEffect(() => {
    if (!box.current) return;
    let m: MapLibreMap;
    try {
      m = new MapLibreMap({
        container: box.current,
        style: STYLE,
        bounds: JAPAN_BOUNDS,
        fitBoundsOptions: { padding: { top: 70, bottom: 150, left: 10, right: 10 } },
        minZoom: PALE_ZOOM.min,
        maxZoom: 19.5,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
        locale: { "AttributionControl.ToggleAttribution": "出典", "Map.Title": "地図" },
      });
    } catch {
      latest.current.onFail?.();
      return;
    }
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    // タイルが読めなくても住所入力は使える。失敗は通知だけして画面は止めない
    let errors = 0;
    m.on("error", () => {
      if (++errors === 8) latest.current.onFail?.();
    });
    map.current = m;
    return () => {
      pin.current?.remove();
      pin.current = null;
      m.remove();
      map.current = null;
    };
  }, []);

  // 地点が決まったら実地点へ、無ければ日本全体へ、同じカメラで動く（演出の完了は待たない）
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const { bottomInset: inset, reducedMotion: rm } = latest.current;
    const duration = rm ? 0 : 1300;
    if (point) {
      if (!pin.current) {
        const el = document.createElement("div");
        el.innerHTML = PIN_SVG;
        el.title = "物件の場所";
        pin.current = new Marker({ element: el, anchor: "bottom" }).setLngLat([point.lng, point.lat]).addTo(m);
      } else pin.current.setLngLat([point.lng, point.lat]);
      m.stop();
      m.easeTo({ center: [point.lng, point.lat], zoom: POINT_ZOOM, padding: { top: 70, bottom: inset, left: 0, right: 0 }, duration, essential: false });
    } else {
      pin.current?.remove();
      pin.current = null;
      m.stop();
      m.fitBounds(JAPAN_BOUNDS, { padding: { top: 70, bottom: 150, left: 10, right: 10 }, duration, essential: false });
    }
  }, [point, focus]);

  // パネルの高さが変わったら、ピンが隠れないよう中心を追従させる（短く）
  useEffect(() => {
    const m = map.current;
    if (!m || !latest.current.point) return;
    m.easeTo({ padding: { top: 70, bottom: bottomInset, left: 0, right: 0 }, duration: latest.current.reducedMotion ? 0 : 200 });
  }, [bottomInset]);

  return <div ref={box} className="absolute inset-0" role="img" aria-label="日本地図" />;
}
