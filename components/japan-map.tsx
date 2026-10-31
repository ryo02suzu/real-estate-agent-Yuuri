"use client";

// スマホのホームの背景になる日本地図（MapLibre GL ＋ 地理院タイル）。
// 住所検索で確定した実際の座標へ、同じ地図のままカメラを寄せる（見かけだけの固定座標ではない）。
// 重いので components/stage-map.tsx から next/dynamic で読み込む。
import "maplibre-gl/dist/maplibre-gl.css";
import { getVersion, MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { alreadyThere, atJapanView, distanceKm, JAPAN_VIEW, PROPERTY_ZOOM, zoomDuration } from "@/lib/motion";

setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);

/** 地図を動かす操作。検索側（app/page.tsx）が使う */
export type StageApi = {
  /** 座標へ寄る。寄り終えたら true。途中で別の動きに置き換わったら false */
  flyTo: (lat: number, lng: number, animate?: boolean) => Promise<boolean>;
  /** 日本全体に戻る（寄っているときだけ動く） */
  home: () => void;
};

const ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function JapanMap({ onReady, onFail }: { onReady: (api: StageApi | null) => void; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!box.current) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: box.current,
        style: {
          version: 8,
          sources: {
            // 淡色地図は z2 から（日本全体の高さでも描く）。z18 より拡大したときは z18 を引き伸ばす
            pale: { type: "raster", tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"], tileSize: 256, minzoom: 2, maxzoom: 18, attribution: ATTRIBUTION },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": "#f6f0e5" } },
            { id: "pale", type: "raster", source: "pale" },
          ],
        },
        center: JAPAN_VIEW.center,
        zoom: JAPAN_VIEW.zoom,
        // ホームでは背景。指でのスクロールを奪わない（動かすのは検索のときだけ）
        interactive: false,
        attributionControl: { compact: true },
        fadeDuration: 150,
      });
    } catch {
      onFail();
      return;
    }
    map.on("error", (e) => {
      // WebGL の作成に失敗したときだけ代替表示へ（タイル1枚の失敗では落とさない）
      if (/webgl/i.test(String(e.error?.message))) onFail();
    });

    let pending: ((done: boolean) => void) | null = null;
    const settle = (done: boolean) => {
      pending?.(done);
      pending = null;
    };
    const current = () => {
      const c = map.getCenter();
      return { center: [c.lng, c.lat] as [number, number], zoom: map.getZoom() };
    };

    onReady({
      flyTo: (lat, lng, animate = true) => {
        settle(false); // ズーム中の再検索：前の動きは捨てる
        const target: [number, number] = [lng, lat];
        const cur = current();
        if (alreadyThere(cur, target)) return Promise.resolve(true); // 同じ地点の再検索
        const ms = animate ? zoomDuration(distanceKm(cur.center, target), reduced()) : 0;
        return new Promise<boolean>((resolve) => {
          pending = resolve;
          if (ms === 0) {
            map.jumpTo({ center: target, zoom: PROPERTY_ZOOM });
            settle(true);
            return;
          }
          map.once("moveend", () => settle(true));
          map.flyTo({ center: target, zoom: PROPERTY_ZOOM, duration: ms, essential: false });
        });
      },
      home: () => {
        settle(false);
        if (atJapanView(current())) return;
        if (reduced()) map.jumpTo(JAPAN_VIEW);
        else map.flyTo({ ...JAPAN_VIEW, duration: 700, essential: false });
      },
    });

    return () => {
      settle(false);
      onReady(null);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 地図は一度だけ作る
  }, []);

  return <div ref={box} className="absolute inset-0" role="img" aria-label="日本地図" />;
}
