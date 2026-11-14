// 地価公示・地価調査のタイル（PMTiles）の読み込み。物件のまわりのタイル（z13）だけを HTTP の範囲指定で読む
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";
import { LAND_PRICE_ZOOM, usageFromCode, type LandPricePoint, type LandPriceSource, type StationNear } from "./land-price";
import { LAND_PRICE_DATA, landPriceUrl } from "./land-price-data";
import type { LngLat } from "./parcel";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

const NEAR: readonly string[] = ["近接", "接面", "駅前広場接面"];

/** 駅のすぐ近くの地点の区分。新しいタイルは sn に入っている。前の版のタイルは、地価調査だけ距離の欄の印から読む
 *  （国土数値情報の説明：最寄り駅迄の道路距離は「駅接面の場合は 0・駅近接の場合は 1」。1 は距離ではない） */
function stationNear(p: Record<string, unknown>): StationNear | undefined {
  const sn = str(p.sn);
  if (sn && NEAR.includes(sn)) return sn as StationNear;
  if (p.k !== 1 || !str(p.sta)) return undefined;
  return p.sd === 0 ? "接面" : p.sd === 1 ? "近接" : undefined;
}

/** 地価調査の基準地番号の「(県)」を、大阪府・京都府では「(府)」にする（府の公式の一覧表の書き方。前の版のタイルは全部「(県)」で入っている） */
function officialNo(no: string, address: string | undefined): string {
  return /^(大阪府|京都府)/.test(address ?? "") ? no.replace("(県)", "(府)") : no;
}

/** タイルの1地点（属性の短い名前は scripts/land-price/build.py） */
export function decodeLandPrice(p: Record<string, unknown>, point: LngLat): LandPricePoint {
  const near = stationNear(p);
  const year = num(p.y) ?? 0;
  const from = num(p.hy) ?? year;
  const history = String(p.h ?? "")
    .split(",")
    .map((v, i) => ({ year: from + i, price: Number(v) || 0 }))
    .filter((h) => h.price > 0);
  return {
    kind: p.k === 1 ? "調査" : "公示",
    no: officialNo(str(p.no) ?? "", str(p.a)),
    point,
    price: num(p.p) ?? 0,
    change: num(p.c),
    usage: usageFromCode(String(p.u ?? "0")),
    year,
    address: str(p.a),
    jukyo: str(p.j),
    area: num(p.s),
    use: str(p.now),
    structure: str(p.st),
    above: num(p.fa),
    below: num(p.fb),
    roadType: str(p.rt),
    roadDir: str(p.rd),
    roadWidth: num(p.rw),
    env: str(p.env),
    station: str(p.sta),
    stationM: near ? undefined : num(p.sd),
    stationNear: near,
    zone: str(p.zn),
    fire: str(p.fi),
    plan: str(p.pl),
    bcr: num(p.bc),
    far: num(p.fr),
    history,
  };
}

function decode(data: ArrayBuffer, x: number, y: number): LandPricePoint[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(data))).layers[LAND_PRICE_DATA.layer];
  if (!layer) return [];
  const out: LandPricePoint[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const g = f.toGeoJSON(x, y, LAND_PRICE_ZOOM).geometry;
    if (g.type === "Point") out.push(decodeLandPrice(f.properties, g.coordinates as LngLat));
  }
  return out;
}

/** PMTiles（URL かファイルの読み方）から地点のタイルを読む。読んだタイルは覚えておく */
export function landPriceTileSource(src: string | Source): LandPriceSource {
  const archive = new PMTiles(src);
  const cache = new Map<string, Promise<LandPricePoint[] | null>>();
  return {
    tile(x, y) {
      const key = `${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        p = archive.getZxy(LAND_PRICE_ZOOM, x, y).then((res) => (res ? decode(res.data, x, y) : null));
        // 失敗したタイルは覚えない（通信が戻れば読み直す）
        p.catch(() => cache.delete(key));
        cache.set(key, p);
        if (cache.size > 60) cache.delete(cache.keys().next().value!);
      }
      return p;
    },
  };
}

let site: LandPriceSource | undefined;
/** アプリが使う地価のタイル（置き場所は land-price-data.ts） */
export const pmtilesLandPriceSource: LandPriceSource = {
  tile: (x, y) => (site ??= landPriceTileSource(landPriceUrl())).tile(x, y),
};
