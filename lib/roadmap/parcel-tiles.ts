// 地番の筆のタイル（PMTiles）の読み込み。ブラウザから直接、HTTP の範囲指定で必要なタイルだけを読む（置き場所は parcel-data.ts）。
// 公図（任意座標）の地域は、道路縁に合わせて推定の位置に置いた筆のタイル（kozu-data.ts）も合わせて読む。
// 2つは地域が重ならない（登記所備付地図データの1つの図面は、公共座標か任意座標のどちらか）ので、同じタイルの筆を並べるだけでよい
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import { KOZU_DATA, hasKozu, kozuUrl } from "./kozu-data";
import { PARCEL_ZOOM, type ParcelFeature, type ParcelSource, type Polygon } from "./parcel";
import { PARCEL_DATA } from "./parcel-data";

function decode(data: ArrayBuffer, x: number, y: number, layerName: string, estimated: boolean): ParcelFeature[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[layerName];
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
      // q：位置合わせの確かさ（1 が高い、2 が低い。scripts/kozu-tiles/kozu.py）
      ...(estimated ? { estimated: Number(f.properties["q"]) === 2 ? ("low" as const) : ("high" as const) } : {}),
    });
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から筆のタイルを読む。読んだタイルは覚えておく（同じ町で地番を選び直したときに読み直さない） */
export function parcelTileSource(src: () => string | Source, layer: string, estimated = false): ParcelSource {
  let archive: PMTiles | undefined;
  const cache = new Map<string, Promise<ParcelFeature[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        archive ??= new PMTiles(src());
        p = archive.getZxy(PARCEL_ZOOM, x, y).then((res) => (res ? decode(res.data, x, y, layer, estimated) : null));
        // 失敗したタイルは覚えない（通信が戻れば読み直す）
        p.catch(() => cache.delete(key));
        cache.set(key, p);
        if (cache.size > 120) cache.delete(cache.keys().next().value!);
      }
      return p;
    },
  };
}

/** 2つの筆のタイルを合わせる（どちらも無ければ null＝地図データの無い地域） */
export function mergeParcelSources(a: ParcelSource, b: ParcelSource): ParcelSource {
  return {
    async tile(x, y) {
      const [ta, tb] = await Promise.all([a.tile(x, y), b.tile(x, y).catch(() => null)]);
      if (!ta && !tb) return null;
      return [...(ta ?? []), ...(tb ?? [])];
    },
  };
}

const publicSource = parcelTileSource(() => PARCEL_DATA.url, PARCEL_DATA.layer);

/** アプリが使う筆のタイル（登記所備付地図データ。推定の筆のデータがあれば、それも合わせる） */
export const pmtilesParcelSource: ParcelSource = hasKozu() ? mergeParcelSources(publicSource, parcelTileSource(kozuUrl, KOZU_DATA.layer, true)) : publicSource;
