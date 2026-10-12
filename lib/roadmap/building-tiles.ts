// 建物（PLATEAU）のタイル（PMTiles）の読み込み。地番の筆と同じく、ブラウザから HTTP の範囲指定で地点のタイルだけを読む
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import { BUILDING_ZOOM, type Building, type BuildingSource } from "./building";
import { BUILDING_DATA, buildingUrl } from "./building-data";
import type { LngLat } from "./parcel";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function decode(data: ArrayBuffer, x: number, y: number): Building[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[BUILDING_DATA.layer];
  if (!layer) return [];
  const out: Building[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const g = f.toGeoJSON(x, y, BUILDING_ZOOM).geometry;
    if (g.type !== "Point") continue;
    const p = f.properties;
    out.push({
      point: g.coordinates as LngLat,
      box: [num(p.x0) ?? 0, num(p.y0) ?? 0, num(p.x1) ?? 0, num(p.y1) ?? 0],
      name: str(p.nm),
      usage: str(p.u),
      detail: str(p.d),
      above: num(p.f),
      below: num(p.b),
      height: num(p.h),
      structure: str(p.k),
      area: num(p.a),
      floorArea: num(p.t),
      year: num(p.y),
      survey: num(p.sv),
    });
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から建物のタイルを読む。読んだタイルは覚えておく */
export function buildingTileSource(src: string | Source): BuildingSource {
  const archive = new PMTiles(src);
  const cache = new Map<string, Promise<Building[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        // タイルが無い所は、PLATEAU の建物が無い（データの無い市区町村か、建物の無い所）
        p = archive.getZxy(BUILDING_ZOOM, x, y).then((res) => (res ? decode(res.data, x, y) : null));
        // 失敗したタイルは覚えない（通信が戻れば読み直す）
        p.catch(() => cache.delete(key));
        cache.set(key, p);
        if (cache.size > 60) cache.delete(cache.keys().next().value!);
      }
      return p;
    },
  };
}

let site: BuildingSource | undefined;
/** アプリが使う建物のタイル（置き場所は building-data.ts） */
export const pmtilesBuildingSource: BuildingSource = {
  tile: (x, y) => (site ??= buildingTileSource(buildingUrl())).tile(x, y),
};
