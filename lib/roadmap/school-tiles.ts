// 学校区のタイル（PMTiles）の読み込み。物件の地点のタイル（z14）だけを HTTP の範囲指定で読む
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import type { LngLat, Polygon } from "./parcel";
import { SCHOOL_ZOOM, type SchoolArea, type SchoolSource } from "./school";
import { SCHOOL_DATA, schoolUrl } from "./school-data";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function decode(data: ArrayBuffer, x: number, y: number): SchoolArea[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[SCHOOL_DATA.layer];
  if (!layer) return [];
  const out: SchoolArea[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const p = f.properties;
    const g = f.toGeoJSON(x, y, SCHOOL_ZOOM).geometry;
    const polygons = g.type === "Polygon" ? [g.coordinates as Polygon] : g.type === "MultiPolygon" ? (g.coordinates as Polygon[]) : [];
    if (!polygons.length || !str(p.n)) continue;
    out.push({
      kind: p.k === 1 ? "中学校" : "小学校",
      name: str(p.n)!,
      owner: str(p.o),
      address: str(p.a),
      city: str(p.c) ?? "",
      note: str(p.nt),
      point: typeof p.x === "number" && typeof p.y === "number" ? ([p.x, p.y] as LngLat) : undefined,
      polygons,
    });
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から学校区のタイルを読む。読んだタイルは覚えておく */
export function schoolTileSource(src: string | Source): SchoolSource {
  const archive = new PMTiles(src);
  const cache = new Map<string, Promise<SchoolArea[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        p = archive.getZxy(SCHOOL_ZOOM, x, y).then((res) => (res ? decode(res.data, x, y) : null));
        // 失敗したタイルは覚えない（通信が戻れば読み直す）
        p.catch(() => cache.delete(key));
        cache.set(key, p);
        if (cache.size > 30) cache.delete(cache.keys().next().value!);
      }
      return p;
    },
  };
}

let site: SchoolSource | undefined;
/** アプリが使う学校区のタイル（置き場所は school-data.ts） */
export const pmtilesSchoolSource: SchoolSource = {
  tile: (x, y) => (site ??= schoolTileSource(schoolUrl())).tile(x, y),
};
