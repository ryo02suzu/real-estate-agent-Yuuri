"use client";

// スマホ用の「日本全体 → 確定した実地点」の地図。ひとつの地図カメラのまま、日本全体から物件の場所へ動く。
// PC の動く地図（components/live-map.tsx。関東の初期表示）とは別。ここで関東の設定は変えない。
// 背景は地理院タイルの淡色地図。低いズームのタイルを配信しているかは実行時に確かめ、無ければ標準地図、
// それも無ければ北海道〜九州だけを z5 以上のタイルで見せる（lib/japan-basemap.ts）。白い地図のままにしない
import "maplibre-gl/dist/maplibre-gl.css";
import { getVersion, MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { StyleSpecification } from "maplibre-gl";
import {
  cameraMove,
  distanceM,
  GSI_ATTRIBUTION,
  GSI_PALE_URL,
  GSI_STD_URL,
  imageLoads,
  JAPAN_BOUNDS,
  JAPAN_MAIN_BOUNDS,
  MAIN_ONLY_MIN_ZOOM,
  MAP_MIN_ZOOM,
  planBase,
  POINT_ZOOM,
  probeLowZoom,
  PROBE_ZOOM,
  TILE_MAX_ZOOM,
  type BasePlan,
} from "@/lib/japan-basemap";

setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);

/** 上の操作帯（ロゴ・メニュー）に隠れない余白 */
const TOP = 70;
const SIDE = 10;
/** 日本全体 → 地点のカメラの動き（仕様の目安 900〜1400ms） */
const MOVE_MS = 1300;
/** パネルの高さが変わったとき、地図の中心を追従させる動き */
const SETTLE_MS = 200;
/** 低ズームの下敷き（標準地図）を出すのは、淡色が z5 以上になる手前のズームまで */
const LOW_ZOOM_LAYER_MAX = 4;

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    // 淡色地図。読むタイルは z4 以上（地図の最小ズームが3なので、z3 以下は読まない）。z18 を超えたら z18 を引き伸ばす
    pale: { type: "raster", tiles: [GSI_PALE_URL], tileSize: 256, minzoom: PROBE_ZOOM, maxzoom: TILE_MAX_ZOOM, attribution: GSI_ATTRIBUTION },
  },
  layers: [
    // タイルが無い所（海・読み込み前）が白く抜けないよう、薄い青緑の面を敷く
    { id: "bg", type: "background", paint: { "background-color": "#e6f2f2" } },
    { id: "pale", type: "raster", source: "pale" },
  ],
};

const PIN_SVG = `<svg viewBox="0 0 28 38" width="28" height="38" aria-hidden="true"><path d="M14 0C6.3 0 0 6.2 0 13.8 0 24 14 38 14 38s14-14 14-24.2C28 6.2 21.7 0 14 0Z" fill="#0f766e"/><circle cx="14" cy="13.5" r="5" fill="#fff"/></svg>`;

const pad = (bottom: number, side = 0) => ({ top: TOP, bottom, left: side, right: side });

export type JapanMapProps = {
  /** 確定した実地点。null なら日本全体 */
  point: { lat: number; lng: number } | null;
  /** 同じ地点を調べ直したときに増える（カメラを寄せ直す） */
  focus: number;
  /** 下から重なるパネルの高さ(px)の見込み。ピンがパネルに隠れないよう中心をずらす */
  bottomInset: number;
  reducedMotion: boolean;
  onFail?: () => void;
};

export default function JapanMap({ point, focus, bottomInset, reducedMotion, onFail }: JapanMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pin = useRef<Marker | null>(null);
  /** 背景の決め方（低ズームのタイルの確認結果） */
  const base = useRef<BasePlan>("pale");
  /** 日本全体 → 地点などの長いカメラの動きの最中か（その間は、パネルの高さの追従で動きを止めない） */
  const moving = useRef(false);
  /** 最後にカメラへ反映した、パネルの高さの見込み */
  const applied = useRef(bottomInset);
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
        fitBoundsOptions: { padding: pad(latest.current.bottomInset + 8, SIDE) },
        minZoom: MAP_MIN_ZOOM,
        maxZoom: 19.5,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        // 出典（地理院タイル）はたたまずに常に見せる。位置は下から重なるパネルの上（globals.css の .mui-japan-map）
        attributionControl: { compact: false },
        locale: { "AttributionControl.ToggleAttribution": "出典", "Map.Title": "地図" },
      });
    } catch {
      latest.current.onFail?.();
      return;
    }
    let disposed = false;
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();

    // タイルが読めなくても住所入力は使える。1枚も読めないまま通信エラーが続いたときだけ通知する
    // （地理院のタイルが無い場所の 404 は MapLibre がエラーにしない。途中の一時的な失敗では地図を消さない）
    let errors = 0;
    let loaded = false;
    m.on("sourcedata", (e) => {
      if (e.tile) loaded = true;
    });
    m.on("error", () => {
      if (!loaded && ++errors === 8) latest.current.onFail?.();
    });

    // 長いカメラの動きが終わったら、動いている間に変わったパネルの高さへ中心を合わせる
    m.on("moveend", () => {
      moving.current = false;
      const want = latest.current.bottomInset;
      if (Math.abs(want - applied.current) <= 4) return;
      applied.current = want;
      settle(m, latest.current.point, want, latest.current.reducedMotion, base.current);
    });

    // 低ズームの背景が配信されているかを確かめ、無ければ代わりを使う
    const whenStyleReady = (fn: () => void) => {
      if (m.isStyleLoaded()) fn();
      else m.once("load", fn);
    };
    void probeLowZoom((url) => imageLoads(url)).then((available) => {
      if (disposed) return;
      const plan = planBase(available);
      if (plan === "pale") return;
      base.current = plan;
      if (plan === "std") {
        whenStyleReady(() => {
          if (disposed || m.getSource("std-low")) return;
          m.addSource("std-low", { type: "raster", tiles: [GSI_STD_URL], tileSize: 256, minzoom: PROBE_ZOOM, maxzoom: PROBE_ZOOM, attribution: GSI_ATTRIBUTION });
          m.addLayer({ id: "std-low", type: "raster", source: "std-low", maxzoom: LOW_ZOOM_LAYER_MAX }, "pale");
        });
      } else {
        // どちらも無い：読むタイルが z5 以上になる範囲（北海道〜九州）だけを見せる
        m.setMinZoom(MAIN_ONLY_MIN_ZOOM);
        if (!latest.current.point) m.fitBounds(JAPAN_MAIN_BOUNDS, { padding: pad(latest.current.bottomInset + 8, SIDE), duration: 0 });
      }
    });

    map.current = m;
    return () => {
      disposed = true;
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
    const duration = rm ? 0 : MOVE_MS;
    applied.current = inset;
    m.stop();
    moving.current = !rm;
    if (point) {
      if (!pin.current) {
        const el = document.createElement("div");
        el.innerHTML = PIN_SVG;
        el.title = "物件の場所";
        pin.current = new Marker({ element: el, anchor: "bottom" }).setLngLat([point.lng, point.lat]).addTo(m);
      } else pin.current.setLngLat([point.lng, point.lat]);
      const c = m.getCenter();
      const options = { center: [point.lng, point.lat] as [number, number], zoom: POINT_ZOOM, padding: pad(inset), duration, essential: false };
      // 遠い場所へは、いったん引いてから寄る（通り道のタイルを全部読まない）
      if (cameraMove(m.getZoom(), distanceM({ lat: c.lat, lng: c.lng }, point)) === "fly") m.flyTo(options);
      else m.easeTo(options);
    } else {
      pin.current?.remove();
      pin.current = null;
      m.fitBounds(base.current === "main-only" ? JAPAN_MAIN_BOUNDS : JAPAN_BOUNDS, { padding: pad(inset + 8, SIDE), duration, essential: false });
    }
  }, [point, focus]);

  // パネルの高さの見込みが変わったとき（段階の切り替え・ホームの内容の変化）、ピンや日本全体が隠れないよう中心を追従させる。
  // 長いカメラの動きの最中なら止めず、その動きが終わってから合わせる（上の moveend）
  useEffect(() => {
    const m = map.current;
    if (!m || moving.current || Math.abs(bottomInset - applied.current) <= 4) return;
    applied.current = bottomInset;
    settle(m, latest.current.point, bottomInset, latest.current.reducedMotion, base.current);
  }, [bottomInset]);

  return (
    <div
      ref={box}
      className="mui-japan-map absolute inset-0"
      style={{ "--mui-map-bottom": `${bottomInset}px` } as React.CSSProperties}
      role="group"
      aria-label="日本地図"
    />
  );
}

/** パネルの高さに合わせて、地点（または日本全体）の位置だけを短く追従させる */
function settle(m: MapLibreMap, point: { lat: number; lng: number } | null, inset: number, reduced: boolean, plan: BasePlan) {
  const duration = reduced ? 0 : SETTLE_MS;
  if (point) m.easeTo({ padding: pad(inset), duration, essential: false });
  else m.fitBounds(plan === "main-only" ? JAPAN_MAIN_BOUNDS : JAPAN_BOUNDS, { padding: pad(inset + 8, SIDE), duration, essential: false });
}
