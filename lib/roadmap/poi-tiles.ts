// 周辺施設のタイル（PMTiles）の読み込み。物件のまわりのタイル（z14）だけを HTTP の範囲指定で読む
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import type { LngLat } from "./parcel";
import { POI_DATA, POI_KINDS, POI_ZOOM, type Poi, type PoiSource } from "./poi";

/** タイル (x, y)（z14）の施設。種類の分からない点・名前の無い点は入れない */
export function decodePoiTile(data: ArrayBuffer | Uint8Array, x: number, y: number): Poi[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[POI_DATA.layer];
  if (!layer) return [];
  const out: Poi[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const kind = Number(f.properties.c);
    const name = String(f.properties.n ?? "").trim();
    const g = f.toGeoJSON(x, y, POI_ZOOM).geometry;
    if (!POI_KINDS[kind] || !name || g.type !== "Point") continue;
    out.push({ kind, name, at: g.coordinates as LngLat });
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から施設のタイルを読む。読んだタイルは覚えておく */
export function poiTileSource(src: string | Source): PoiSource {
  const archive = new PMTiles(src);
  const cache = new Map<string, Promise<Poi[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        p = archive.getZxy(POI_ZOOM, x, y).then((res) => (res ? decodePoiTile(res.data, x, y) : null));
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
function poiUrl(): string {
  const { url } = POI_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

let site: PoiSource | undefined;
/** アプリが使う施設のタイル（置き場所は data/poi-source.json） */
export const pmtilesPoiSource: PoiSource = {
  tile: (x, y) => (site ??= poiTileSource(poiUrl())).tile(x, y),
};
