// 盛土規制法の規制区域のタイル（PMTiles）の読み込み。物件の地点のタイル（z14）だけを HTTP の範囲指定で読む
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import { MORIDO_DATA, MORIDO_ZOOM, type MoridoArea, type MoridoSource } from "./morido";
import type { Polygon } from "./parcel";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function decode(data: ArrayBuffer, x: number, y: number): MoridoArea[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[MORIDO_DATA.layer];
  if (!layer) return [];
  const out: MoridoArea[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const p = f.properties;
    const g = f.toGeoJSON(x, y, MORIDO_ZOOM).geometry;
    const polygons = g.type === "Polygon" ? [g.coordinates as Polygon] : g.type === "MultiPolygon" ? (g.coordinates as Polygon[]) : [];
    if (!polygons.length || (p.k !== 1 && p.k !== 2)) continue;
    const level = str(p.a);
    out.push({
      kind: p.k === 2 ? "特定盛土等規制区域" : "宅地造成等工事規制区域",
      city: str(p.c) ?? "",
      cityName: str(p.m),
      level: level === "A" || level === "B" || level === "C" ? level : undefined,
      notice: str(p.n),
      since: str(p.d),
      polygons,
    });
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から規制区域のタイルを読む。読んだタイルは覚えておく */
export function moridoTileSource(src: string | Source): MoridoSource {
  const archive = new PMTiles(src);
  const cache = new Map<string, Promise<MoridoArea[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        p = archive.getZxy(MORIDO_ZOOM, x, y).then((res) => (res ? decode(res.data, x, y) : null));
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
function moridoUrl(): string {
  const { url } = MORIDO_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

let site: MoridoSource | undefined;
/** アプリが使う規制区域のタイル（置き場所は data/morido-source.json） */
export const pmtilesMoridoSource: MoridoSource = {
  tile: (x, y) => (site ??= moridoTileSource(moridoUrl())).tile(x, y),
};
