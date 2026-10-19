// 自然公園地域・農業地域のタイル（PMTiles）の読み込み。物件の地点のタイル（z14）だけを HTTP の範囲指定で読む
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import type { Polygon } from "./parcel";
import { TOCHI_DATA, TOCHI_KINDS, TOCHI_ZOOM, type TochiArea, type TochiSource } from "./tochi";

function decode(data: ArrayBuffer, x: number, y: number): TochiArea[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[TOCHI_DATA.layer];
  if (!layer) return [];
  const out: TochiArea[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const kind = TOCHI_KINDS[Number(f.properties.t)];
    const g = f.toGeoJSON(x, y, TOCHI_ZOOM).geometry;
    const polygons = g.type === "Polygon" ? [g.coordinates as Polygon] : g.type === "MultiPolygon" ? (g.coordinates as Polygon[]) : [];
    if (!kind || !polygons.length) continue;
    out.push({ kind, pref: String(f.properties.p ?? ""), polygons });
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から区域のタイルを読む。読んだタイルは覚えておく */
export function tochiTileSource(src: string | Source): TochiSource {
  const archive = new PMTiles(src);
  const cache = new Map<string, Promise<TochiArea[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        p = archive.getZxy(TOCHI_ZOOM, x, y).then((res) => (res ? decode(res.data, x, y) : null));
        // 失敗したタイルは覚えない（通信が戻れば読み直す）
        p.catch(() => cache.delete(key));
        cache.set(key, p);
        if (cache.size > 30) cache.delete(cache.keys().next().value!);
      }
      return p;
    },
  };
}

/** 読みに行く URL（サイト内のパスは、開いているサイトの URL にする） */
function tochiUrl(): string {
  const { url } = TOCHI_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

let site: TochiSource | undefined;
/** アプリが使う区域のタイル（置き場所は data/tochi-source.json） */
export const pmtilesTochiSource: TochiSource = {
  tile: (x, y) => (site ??= tochiTileSource(tochiUrl())).tile(x, y),
};
