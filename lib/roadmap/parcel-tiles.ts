// 地番の筆のタイル（PMTiles）の読み込み。ブラウザから直接、HTTP の範囲指定で必要なタイルだけを読む（置き場所は parcel-data.ts）。
// 公図（任意座標）の地域は、市町村の地番参考図の筆のタイル（sanko-data.ts）と、道路縁に合わせて推定の位置に置いた筆のタイル
// （kozu-data.ts）も合わせて読む。法務省の地図データ（公共座標）と推定の筆は地域が重ならない（1つの図面は公共座標か任意座標のどちらか）。
// 参考図は公共座標の筆の所を除いてあるが、同じ筆が両方にあれば法務省の地図データを使う。参考図のある市町村では推定の筆を使わない
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import { KOZU_DATA, hasKozu, kozuUrl } from "./kozu-data";
import { kuikiParts, PARCEL_ZOOM, type ParcelFeature, type ParcelSource, type Polygon } from "./parcel";
import { PARCEL_DATA } from "./parcel-data";
import { hasSanko, SANKO_DATA, sankoCovers, sankoUrl } from "./sanko-data";

/** タイルの筆の種類：法務省の地図データ（公共座標）、公図から推定した位置（kozu）、市町村の地番参考図（sanko） */
type Kind = "public" | "kozu" | "sanko";

function decode(data: ArrayBuffer, x: number, y: number, layerName: string, kind: Kind): ParcelFeature[] {
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
      ...(kind === "kozu" ? { estimated: Number(f.properties["q"]) === 2 ? ("low" as const) : ("high" as const) } : {}),
      // m：参考図の市区町村コード（scripts/sanko/build.py）
      ...(kind === "sanko" ? { sanko: String(f.properties["m"] ?? "") } : {}),
    });
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から筆のタイルを読む。読んだタイルは覚えておく（同じ町で地番を選び直したときに読み直さない） */
export function parcelTileSource(src: () => string | Source, layer: string, kind: Kind = "public"): ParcelSource {
  let archive: PMTiles | undefined;
  const cache = new Map<string, Promise<ParcelFeature[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        archive ??= new PMTiles(src());
        p = archive.getZxy(PARCEL_ZOOM, x, y).then((res) => (res ? decode(res.data, x, y, layer, kind) : null));
        // 失敗したタイルは覚えない（通信が戻れば読み直す）
        p.catch(() => cache.delete(key));
        cache.set(key, p);
        if (cache.size > 120) cache.delete(cache.keys().next().value!);
      }
      return p;
    },
  };
}

/**
 * 筆のタイルを合わせる（どれも無ければ null＝地図データの無い地域）。最初のタイル（法務省の地図データ）が読めなければ失敗にし、
 * あとのタイル（参考図・推定の筆）は読めなくても、読めた分で続ける。同じタイルに同じ筆（地番区域と地番）があれば、前のタイルのものを使う
 */
export function mergeParcelSources(first: ParcelSource, ...rest: ParcelSource[]): ParcelSource {
  return {
    async tile(x, y) {
      const tiles = await Promise.all([first.tile(x, y), ...rest.map((s) => s.tile(x, y).catch(() => null))]);
      if (tiles.every((t) => !t)) return null;
      const seen = new Set<string>();
      const out: ParcelFeature[] = [];
      for (const t of tiles) {
        const here: string[] = [];
        for (const f of t ?? []) {
          const key = `${f.kuiki}|${f.chiban}`;
          if (seen.has(key)) continue;
          here.push(key);
          out.push(f);
        }
        // 1つのタイルの中では、同じ筆が切れ端で何度も出ることがある（タイルの境目）。次のタイルの分からだけ外す
        for (const k of here) seen.add(k);
      }
      return out;
    },
  };
}

/** 参考図のある市町村の筆を除く（推定の位置の筆は、市町村の図があればそちらを使う）。covers は地番区域の市区町村の部分で判定する */
export function withoutCities(source: ParcelSource, covers: (city: string) => boolean): ParcelSource {
  return {
    async tile(x, y) {
      const t = await source.tile(x, y);
      return t && t.filter((f) => !covers(kuikiParts(f.kuiki).city));
    },
  };
}

const publicSource = parcelTileSource(() => PARCEL_DATA.url, PARCEL_DATA.layer);
const sankoSource = hasSanko() ? parcelTileSource(sankoUrl, SANKO_DATA.layer, "sanko") : undefined;
const kozuSource = hasKozu() ? parcelTileSource(kozuUrl, KOZU_DATA.layer, "kozu") : undefined;

/** アプリが使う筆のタイル（登記所備付地図データ。地番参考図・推定の筆のデータがあれば、それも合わせる） */
export const pmtilesParcelSource: ParcelSource = mergeParcelSources(
  publicSource,
  ...(sankoSource ? [sankoSource] : []),
  ...(kozuSource ? [sankoSource ? withoutCities(kozuSource, sankoCovers) : kozuSource] : []),
);
