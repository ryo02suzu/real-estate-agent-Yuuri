// 物件の地点で使う国のデータ（液状化の発生傾向・大規模盛土造成地・災害履歴・駅別乗降客数・地価公示の鑑定評価書・将来推計人口・
// 医療機関と幼稚園）の置き場所と読み方。scripts/reinfolib/build.py が国土交通省「不動産情報ライブラリ」の API と国土数値情報から作り、
// R2 に置く（.github/workflows/reinfolib.yml。API キーは GitHub の Secrets）。データごとの置き場所・時点は data/reinfolib-source.json。
// ブラウザから R2 を直接読み、物件の住所を自前のサーバーに送らない
import { VectorTile, type VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import SOURCE from "./data/reinfolib-source.json";

export type NationalKey = "liq" | "zousei" | "rireki" | "ridership" | "appraisal" | "pop" | "fac";

/** データごとの置き場所（url）と、データを取った日（asOf。「20261022」）。まだ作っていないデータは無い */
type Entry = { url: string; asOf: string } & Record<string, unknown>;
const SRC = SOURCE as unknown as Partial<Record<NationalKey, Entry>>;

export const NATIONAL_DATA: Partial<Record<NationalKey, Entry>> = SRC;

/** そのデータがあるか（API キーの登録前・取り込み前は無い） */
export const hasNational = (k: NationalKey) => Boolean(SRC[k]?.url);

/** API の利用約款で、サービスに表示するよう求められている文（取引事例と同じ） */
export const REINFOLIB_NOTE = "このサービスは、国土交通省不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません";

/** 「20261022」→「2026年10月22日」 */
export function asOfText(k: NationalKey): string {
  const m = SRC[k]?.asOf?.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : "";
}

/** データのファイルの URL（無ければ undefined） */
export function nationalUrl(k: NationalKey, path: string): string | undefined {
  const base = SRC[k]?.url;
  return base ? `${base.replace(/\/$/, "")}/${path}` : undefined;
}

/** URL の JSON。無い（404）ときは null。通信の失敗は例外 */
export type JsonLoader = (url: string) => Promise<unknown>;

/** ブラウザで JSON を読む（R2 は gzip で置いてあり、ブラウザが戻す） */
export const browserJson: JsonLoader = async (url) => {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/** 同じファイルを何度も読まない（失敗したものは覚えない） */
export function cachedJson(load: JsonLoader = browserJson, max = 40): JsonLoader {
  const cache = new Map<string, Promise<unknown>>();
  return (url) => {
    let p = cache.get(url);
    if (!p) {
      p = load(url);
      p.catch(() => cache.delete(url));
      cache.set(url, p);
      if (cache.size > max) cache.delete(cache.keys().next().value!);
    }
    return p;
  };
}

/** タイルのズーム（大規模盛土造成地・災害履歴・医療機関と幼稚園の PMTiles は z14 だけ。1枚が約2km四方） */
export const NATIONAL_ZOOM = 14;

/** タイル (x, y)（z14）の地物。タイルが無ければ null（データの無い所） */
export type TileSource<T> = { tile(x: number, y: number): Promise<T[] | null> };

/** PMTiles（URL かファイルの読み方）のレイヤ layer を、decode で地物にして読む。読んだタイルは覚えておく */
export function pmtilesSource<T>(src: string | Source, layer: string, decode: (f: VectorTileFeature, x: number, y: number) => T | null): TileSource<T> {
  const archive = new PMTiles(src);
  const cache = new Map<string, Promise<T[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        p = archive.getZxy(NATIONAL_ZOOM, x, y).then((res) => {
          if (!res) return null;
          const l = new VectorTile(new PbfReader(new Uint8Array(res.data))).layers[layer];
          const out: T[] = [];
          for (let i = 0; l && i < l.length; i++) {
            const v = decode(l.feature(i), x, y);
            if (v) out.push(v);
          }
          return out;
        });
        // 失敗したタイルは覚えない（通信が戻れば読み直す）
        p.catch(() => cache.delete(key));
        cache.set(key, p);
        if (cache.size > 30) cache.delete(cache.keys().next().value!);
      }
      return p;
    },
  };
}

/** アプリが使う PMTiles（置き場所は data/reinfolib-source.json。データが無ければ、どのタイルも null） */
export function sitePmtiles<T>(k: NationalKey, file: string, layer: string, decode: (f: VectorTileFeature, x: number, y: number) => T | null): TileSource<T> {
  let site: TileSource<T> | undefined;
  return {
    tile(x, y) {
      const url = nationalUrl(k, file);
      if (!url) return Promise.resolve(null);
      return (site ??= pmtilesSource(url, layer, decode)).tile(x, y);
    },
  };
}

/** 地点の z14 のタイル */
export function tileOf(lat: number, lng: number, z = NATIONAL_ZOOM): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

/** 地点から半径 m の範囲にかかる z14 のタイル */
export function tilesAround(lat: number, lng: number, m: number): [number, number][] {
  const dLat = m / 110_950;
  const dLng = m / (111_320 * Math.cos((lat * Math.PI) / 180));
  const [x0, y0] = tileOf(lat + dLat, lng - dLng);
  const [x1, y1] = tileOf(lat - dLat, lng + dLng);
  const out: [number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
}
