// 物件の地点の小学校区・中学校区（通学区域）。国土数値情報の学校区（scripts/school-districts/build.py。z14 のタイル）から、
// 地点を含む区域の学校名・設置者・所在地と、学校までの直線距離を出す。区域は市区町村の教育委員会の資料をもとにした令和5年度の
// データで、見直されることがある。指定校は教育委員会で確かめるよう添える（市区町村によってはデータの利用条件でもそう求めている）
import type { LngLat, Polygon } from "./parcel";
import { inPolygon } from "./zoning";

/** 学校区のタイルのズーム（z14 だけ） */
export const SCHOOL_ZOOM = 14;

export type SchoolKind = "小学校" | "中学校";

export type School = {
  kind: SchoolKind;
  name: string;
  /** 設置者（「新宿区立」） */
  owner?: string;
  /** 所在地 */
  address?: string;
  /** 市区町村コード（政令市は市） */
  city: string;
  /** 市区町村ごとの一言（日光市の旧今市市など） */
  note?: string;
  /** 学校の位置（国土数値情報の学校データで分かったものだけ） */
  point?: LngLat;
};

export type SchoolArea = School & { polygons: Polygon[] };

/** タイル (x, y)（z14）の学校区。タイルが無ければ null（データの無い所） */
export type SchoolSource = { tile(x: number, y: number): Promise<SchoolArea[] | null> };

export type SchoolHit = School & {
  /** 物件から学校までの直線距離（m）。学校の位置が分からなければ無し */
  distance?: number;
};

export type Schools = { elementary?: SchoolHit; junior?: SchoolHit };

const M_PER_DEG_LAT = 110_950;

function distance(a: LngLat, b: LngLat): number {
  return Math.hypot((b[0] - a[0]) * M_PER_DEG_LAT * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * M_PER_DEG_LAT);
}

function tileOf(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [Math.floor(((lng + 180) / 360) * n), Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n)];
}

/** 地点の小学校区・中学校区。データの無い所（タイルが無い）は null、区域に入っていなければ空 */
export async function schoolsAt(lat: number, lng: number, source: SchoolSource): Promise<Schools | null> {
  const areas = await source.tile(...tileOf(lat, lng, SCHOOL_ZOOM));
  if (!areas) return null;
  const p: LngLat = [lng, lat];
  const out: Schools = {};
  for (const a of areas) {
    if (!a.polygons.some((poly) => inPolygon(p, poly))) continue;
    const hit: SchoolHit = {
      kind: a.kind,
      name: a.name,
      owner: a.owner,
      address: a.address,
      city: a.city,
      note: a.note,
      point: a.point,
      distance: a.point ? distance(p, a.point) : undefined,
    };
    if (a.kind === "小学校") out.elementary ??= hit;
    else out.junior ??= hit;
  }
  return out;
}

// ---- 画面に出す文字 ----

/** 「約450m」「約1.2km」（直線） */
export function schoolDistanceText(m?: number): string | undefined {
  if (m === undefined) return undefined;
  return m < 1000 ? `約${Math.max(10, Math.round(m / 10) * 10)}m` : `約${(Math.round(m / 100) / 10).toFixed(1)}km`;
}

/** 1行（「戸塚第二小学校（新宿区立・直線約450m）」） */
export function schoolLine(s: SchoolHit): string {
  const extra = [s.owner, s.distance !== undefined ? `直線${schoolDistanceText(s.distance)}` : undefined].filter(Boolean).join("・");
  return extra ? `${s.name}（${extra}）` : s.name;
}

/** 短い名前（「戸塚第二小」）。スマホの狭い所に */
export function schoolShort(name: string): string {
  return name.replace(/小学校$/, "小").replace(/中学校$/, "中");
}
