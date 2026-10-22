// 大規模盛土造成地。国土数値情報の大規模盛土造成地データ（不動産情報ライブラリの API。scripts/reinfolib/build.py の zousei。z14 の PMTiles）
// から、物件の地点が造成地に入るか、近くに造成地があるかを出す。国の注意書きのとおり、安全性の確認が必要な盛土を示したもので、
// 直ちに危険というものではなく、重要事項説明の根拠にも使えない（市区町村の大規模盛土造成地マップで確かめる）
import type { VectorTileFeature } from "@mapbox/vector-tile";
import type { LngLat, Polygon } from "./parcel";
import { NATIONAL_ZOOM, sitePmtiles, tilesAround, type TileSource } from "./reinfolib";
import { distToRings, inPolygon } from "./zoning";

export type ZouseiArea = {
  /** 盛土の区分（「谷埋め型」「腹付け型」。区分していないものは「区分なし」） */
  kind: string;
  /** 市区町村コード・名前 */
  city?: string;
  cityName?: string;
  /** 盛土の番号（市区町村の大規模盛土造成地マップの番号） */
  number?: string;
  polygons: Polygon[];
};

export type ZouseiHit = Omit<ZouseiArea, "polygons"> & {
  /** 物件の地点が造成地の中か */
  inside: boolean;
  /** 造成地の縁までの距離（m。中なら 0） */
  distance: number;
};

/** 地点の大規模盛土造成地：入っている造成地と、近く（NEAR_M 以内）の造成地（近い順） */
export type Zousei = { inside: boolean; areas: ZouseiHit[] };

/** 「近く」とみなす距離（m）。住所の位置の誤差と、敷地の広さを見込む */
export const ZOUSEI_NEAR_M = 50;

export function decodeZousei(f: VectorTileFeature, x: number, y: number): ZouseiArea | null {
  const g = f.toGeoJSON(x, y, NATIONAL_ZOOM).geometry;
  const polygons = g.type === "Polygon" ? [g.coordinates as Polygon] : g.type === "MultiPolygon" ? (g.coordinates as Polygon[]) : [];
  if (!polygons.length) return null;
  const p = f.properties;
  const s = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return { kind: s(p.k) ?? "区分なし", city: s(p.c), cityName: s(p.m), number: s(p.n), polygons };
}

/** アプリが使う造成地のタイル */
export const zouseiSource: TileSource<ZouseiArea> = sitePmtiles("zousei", "zousei.pmtiles", "zs", decodeZousei);

/**
 * 地点の大規模盛土造成地（造成地の無い所にはタイルが無いので、データがあれば「無し」になる）。
 * データそのものがあるかは hasNational("zousei") で見る
 */
export async function zouseiAt(lat: number, lng: number, source: TileSource<ZouseiArea> = zouseiSource): Promise<Zousei> {
  const got = await Promise.all(tilesAround(lat, lng, ZOUSEI_NEAR_M).map(([x, y]) => source.tile(x, y)));
  const p: LngLat = [lng, lat];
  const byKey = new Map<string, ZouseiHit>();
  for (const a of got.flat()) {
    if (!a) continue;
    const inside = a.polygons.some((poly) => inPolygon(p, poly));
    const distance = inside ? 0 : Math.min(...a.polygons.map((poly) => distToRings(p, poly)));
    if (distance > ZOUSEI_NEAR_M) continue;
    // タイルの境目で分かれた同じ造成地は1つに
    const key = `${a.city}|${a.number}|${a.kind}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.inside ||= inside;
      prev.distance = Math.min(prev.distance, distance);
    } else {
      byKey.set(key, { kind: a.kind, city: a.city, cityName: a.cityName, number: a.number, inside, distance });
    }
  }
  const areas = [...byKey.values()].sort((a, b) => a.distance - b.distance);
  return { inside: areas.some((a) => a.inside), areas };
}

/** 「谷埋め型の大規模盛土造成地の中（横浜市港北区 港北-12）」 */
export function zouseiText(z: Zousei): string {
  const a = z.areas[0];
  if (!a) return "大規模盛土造成地にはあたりません（国のデータ）";
  const where = [a.cityName, a.number].filter(Boolean).join(" ");
  const kind = a.kind === "区分なし" ? "" : `${a.kind}の`;
  return a.inside ? `${kind}大規模盛土造成地の中${where ? `（${where}）` : ""}` : `約${Math.max(1, Math.round(a.distance))}m先に${kind}大規模盛土造成地${where ? `（${where}）` : ""}`;
}

/** 国の注意書き（国土数値情報 大規模盛土造成地データの案内から） */
export const ZOUSEI_CAUTIONS = [
  "安全性の確認が必要な盛土造成地を示したもので、直ちに危険というものではありません",
  "すべての盛土造成地が載っているわけではありません。重要事項説明の根拠には使えないので、市区町村の大規模盛土造成地マップで確かめてください",
];

export const ZOUSEI_CREDIT = "出典：国土交通省 不動産情報ライブラリ（国土数値情報 大規模盛土造成地データ）を加工して作成";
