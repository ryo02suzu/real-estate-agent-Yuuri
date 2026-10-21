// 土砂災害などに関わる法令の区域のタイル（PMTiles）の読み込み。物件の地点のタイル（z14）だけを HTTP の範囲指定で読む
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import { HOUREI_DATA, HOUREI_KINDS, HOUREI_ZOOM, houreiName, type HoureiArea, type HoureiSource } from "./hourei";
import type { Polygon } from "./parcel";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function decode(data: ArrayBuffer, x: number, y: number): HoureiArea[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[HOUREI_DATA.layer];
  if (!layer) return [];
  const out: HoureiArea[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const p = f.properties;
    const kind = HOUREI_KINDS[Number(p.t)];
    const g = f.toGeoJSON(x, y, HOUREI_ZOOM).geometry;
    const polygons = g.type === "Polygon" ? [g.coordinates as Polygon] : g.type === "MultiPolygon" ? (g.coordinates as Polygon[]) : [];
    if (!kind || !polygons.length) continue;
    out.push({
      kind,
      name: houreiName(str(p.n)),
      city: str(p.c),
      cityName: str(p.m),
      pref: str(p.p) ?? "",
      notice: str(p.g),
      since: str(p.d),
      reason: str(p.r),
      rule: kind === "災害危険区域" ? str(p.o) : undefined,
      office: kind === "地すべり防止区域" ? str(p.o) : undefined,
      byCity: p.a === 2,
      polygons,
    });
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から区域のタイルを読む。読んだタイルは覚えておく */
export function houreiTileSource(src: string | Source): HoureiSource {
  const archive = new PMTiles(src);
  const cache = new Map<string, Promise<HoureiArea[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        p = archive.getZxy(HOUREI_ZOOM, x, y).then((res) => (res ? decode(res.data, x, y) : null));
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
function houreiUrl(): string {
  const { url } = HOUREI_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

let site: HoureiSource | undefined;
/** アプリが使う区域のタイル（置き場所は data/hourei-source.json） */
export const pmtilesHoureiSource: HoureiSource = {
  tile: (x, y) => (site ??= houreiTileSource(houreiUrl())).tile(x, y),
};
