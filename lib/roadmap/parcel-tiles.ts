// 地番の筆のタイル（PMTiles）の読み込み。ブラウザから直接、HTTP の範囲指定で必要なタイルだけを読む（置き場所は parcel-data.ts）。
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { PARCEL_ZOOM, type ParcelFeature, type ParcelSource, type Polygon } from "./parcel";
import { PARCEL_DATA } from "./parcel-data";

let archive: PMTiles | undefined;
// 読んだタイルは覚えておく（同じ町で地番を選び直したときに読み直さない）
const cache = new Map<string, Promise<ParcelFeature[] | null>>();

async function readTile(x: number, y: number): Promise<ParcelFeature[] | null> {
  archive ??= new PMTiles(PARCEL_DATA.url);
  const res = await archive.getZxy(PARCEL_ZOOM, x, y);
  if (!res) return null;
  const layer = new VectorTile(new PbfReader(new Uint8Array(res.data))).layers[PARCEL_DATA.layer];
  if (!layer) return [];
  const out: ParcelFeature[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    out.push({
      kuiki: String(f.properties["地番区域"] ?? ""),
      chiban: String(f.properties["地番"] ?? ""),
      polygons: () => {
        const g = f.toGeoJSON(x, y, PARCEL_ZOOM).geometry;
        if (g.type === "Polygon") return [g.coordinates as Polygon];
        if (g.type === "MultiPolygon") return g.coordinates as Polygon[];
        return [];
      },
    });
  }
  return out;
}

export const pmtilesParcelSource: ParcelSource = {
  tile(x, y) {
    const key = `${x}/${y}`;
    let p = cache.get(key);
    if (!p) {
      p = readTile(x, y);
      // 失敗したタイルは覚えない（通信が戻れば読み直す）
      p.catch(() => cache.delete(key));
      cache.set(key, p);
      if (cache.size > 120) cache.delete(cache.keys().next().value!);
    }
    return p;
  },
};
