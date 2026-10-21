// 物件の近くの指定緊急避難場所。市町村が災害の種類ごとに指定した場所を、国土地理院が集めた「指定緊急避難場所データ」
// （地理院タイルの GeoJSON。z10 だけ）から読み、近い順に出す。避難所（避難生活の場所）ではなく、命を守るために逃げる場所。
// 指定は見直されるので、画面では市町村の防災のページで確かめるよう添える。自前のサーバーは通さない（ブラウザから直接読む）
import type { LngLat } from "./parcel";

/** タイルのズーム（地理院タイルの指定緊急避難場所は z10 だけ。1枚が約40km四方） */
export const EVAC_ZOOM = 10;
/** 読むレイヤ（洪水・地震。どちらかに指定された場所でほとんどの場所が入る） */
export const EVAC_LAYERS = ["skhb01", "skhb04"] as const;
/** 災害の種類（データの disaster1〜8） */
export const EVAC_KINDS: Record<number, string> = { 1: "洪水", 2: "土砂災害", 3: "高潮", 4: "地震", 5: "津波", 6: "大規模な火事", 7: "内水氾濫", 8: "火山" };

export const evacTileUrl = (layer: string, x: number, y: number) => `https://cyberjapandata.gsi.go.jp/xyz/${layer}/${EVAC_ZOOM}/${x}/${y}.geojson`;

export const EVAC_CREDIT = "出典：国土地理院「指定緊急避難場所データ」を加工して作成（指定は市町村。最新の指定は市町村の防災のページで確認）";

export type EvacSite = {
  name: string;
  address?: string;
  at: LngLat;
  /** 指定されている災害の種類（EVAC_KINDS の番号） */
  kinds: number[];
  /** 物件からの直線距離（m） */
  straight: number;
};

/** URL の JSON。無い（404）ときは null。通信の失敗は例外 */
export type JsonFetcher = (url: string) => Promise<unknown>;

const M_LAT = 110_950;
const distanceM = ([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) => Math.hypot((lng2 - lng1) * 111_320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180), (lat2 - lat1) * M_LAT);

function tileOf(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

type Feature = { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };

/** 物件から maxM 以内の指定緊急避難場所を近い順に count まで。物件のタイルと、範囲がかかる隣のタイルを読む */
export async function evacSitesNear(lat: number, lng: number, fetchJson: JsonFetcher, { count = 3, maxM = 3000 } = {}): Promise<EvacSite[]> {
  const dLat = maxM / M_LAT;
  const dLng = maxM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const [x0, y0] = tileOf(lat + dLat, lng - dLng, EVAC_ZOOM);
  const [x1, y1] = tileOf(lat - dLat, lng + dLng, EVAC_ZOOM);
  const urls: string[] = [];
  for (const layer of EVAC_LAYERS) for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.push(evacTileUrl(layer, x, y));
  const got = await Promise.all(urls.map((u) => fetchJson(u)));
  const here: LngLat = [lng, lat];
  const seen = new Map<string, EvacSite>();
  for (const g of got) {
    const features = (g as { features?: Feature[] } | null)?.features ?? [];
    for (const f of features) {
      const c = f.geometry?.type === "Point" ? (f.geometry.coordinates as number[]) : undefined;
      const name = String(f.properties?.name ?? "").trim();
      if (!c || c.length < 2 || !name) continue;
      const at: LngLat = [Number(c[0]), Number(c[1])];
      const key = `${name}|${at[0].toFixed(5)}|${at[1].toFixed(5)}`;
      if (seen.has(key)) continue;
      const kinds = Object.keys(EVAC_KINDS)
        .map(Number)
        .filter((k) => Number(f.properties?.[`disaster${k}`]) === 1);
      const address = String(f.properties?.address ?? "").trim() || undefined;
      seen.set(key, { name, ...(address ? { address } : {}), at, kinds, straight: distanceM(here, at) });
    }
  }
  return [...seen.values()]
    .filter((s) => s.straight <= maxM)
    .sort((a, b) => a.straight - b.straight)
    .slice(0, count);
}

/** ブラウザで読む（無いタイルは null） */
export const browserJsonFetcher: JsonFetcher = async (url) => {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
