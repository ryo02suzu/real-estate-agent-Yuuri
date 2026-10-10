// 都市計画のタイル（PMTiles）の読み込み。地番の筆と同じく、ブラウザから HTTP の範囲指定で地点のタイルだけを読む
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import type { LngLat, Polygon } from "./parcel";
import { ZONING_ZOOM, type ZoningFeature, type ZoningLayer, type ZoningSource } from "./zoning";
import { zoningUrl } from "./zoning-data";

function decode(data: ArrayBuffer, x: number, y: number): ZoningFeature[] {
  const tile = new VectorTile(new PbfReader(new Uint8Array(data)));
  const out: ZoningFeature[] = [];
  for (const [name, layer] of Object.entries(tile.layers)) {
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const p = f.properties;
      out.push({
        layer: name as ZoningLayer,
        props: {
          name: typeof p.name === "string" ? p.name : undefined,
          code: typeof p.code === "number" ? p.code : undefined,
          far: typeof p.far === "number" ? p.far : undefined,
          bcr: typeof p.bcr === "number" ? p.bcr : undefined,
        },
        geometry: () => {
          const g = f.toGeoJSON(x, y, ZONING_ZOOM).geometry;
          switch (g.type) {
            case "Polygon":
              return { polygons: [g.coordinates as Polygon], lines: [] };
            case "MultiPolygon":
              return { polygons: g.coordinates as Polygon[], lines: [] };
            case "LineString":
              return { polygons: [], lines: [g.coordinates as LngLat[]] };
            case "MultiLineString":
              return { polygons: [], lines: g.coordinates as LngLat[][] };
            default:
              return { polygons: [], lines: [] };
          }
        },
      });
    }
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から地点のタイルを読む。読んだタイルは覚えておく */
export function zoningTileSource(src: string | Source): ZoningSource {
  const archive = new PMTiles(src);
  const cache = new Map<string, Promise<ZoningFeature[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        // タイルが無い所は、都市計画のデータが何も無い（都市計画区域外など）
        p = archive.getZxy(ZONING_ZOOM, x, y).then((res) => (res ? decode(res.data, x, y) : []));
        // 失敗したタイルは覚えない（通信が戻れば読み直す）
        p.catch(() => cache.delete(key));
        cache.set(key, p);
        if (cache.size > 40) cache.delete(cache.keys().next().value!);
      }
      return p;
    },
  };
}

let site: ZoningSource | undefined;
/** アプリが使う都市計画のタイル（置き場所は zoning-data.ts） */
export const pmtilesZoningSource: ZoningSource = {
  tile: (x, y) => (site ??= zoningTileSource(zoningUrl())).tile(x, y),
};
