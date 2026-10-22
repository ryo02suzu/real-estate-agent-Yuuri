// 国のデータの医療機関と幼稚園。国土数値情報の医療機関データ（2020年度。病院・診療所・歯科診療所）と学校データ（2023年度。幼稚園・
// 幼保連携型認定こども園）を z14 の PMTiles（scripts/reinfolib/build.py の fac）にしたものから、物件のまわりの施設と、種類ごとの最寄りの
// 徒歩の目安（国土地理院の道路中心線。lib/roadmap/walk.ts）を出す。病院は病床数・救急告示・災害拠点病院、診療所は診療科目も持つ。
// 保育所（福祉施設データ）は、神奈川県・横浜市が保育関係の商用利用・公開を認めていないので入れていない（保育園は OpenStreetMap のまま）
import type { VectorTileFeature } from "@mapbox/vector-tile";
import type { LngLat } from "./parcel";
import { NATIONAL_DATA, NATIONAL_ZOOM, sitePmtiles, tilesAround, type TileSource } from "./reinfolib";
import { routedOk, walkMinutes, walkTo } from "./walk";

/** 施設の種類（タイルの k） */
export const FACILITY_KINDS: Record<number, string> = { 1: "病院", 2: "診療所", 3: "歯科診療所", 4: "幼稚園", 5: "認定こども園" };

export type Facility = {
  kind: number;
  name: string;
  address?: string;
  /** 診療科目（「内科」「小児科」） */
  departments?: string[];
  /** 病床数（病院） */
  beds?: number;
  /** 救急告示病院 */
  emergency?: boolean;
  /** 災害拠点病院（基幹・地域） */
  disasterBase?: "基幹" | "地域";
  /** 幼稚園・こども園の設置者（国立・公立・私立） */
  owner?: string;
  at: LngLat;
};

export type FacilityWalk = Facility & {
  /** 「病院」 */
  label: string;
  /** 道路距離（m）。道のりが見つからなければ直線距離 */
  meters: number;
  minutes: number;
  straight: number;
  routed: boolean;
};

/**
 * 一般の人がかかれない医療機関（会社の社員向けの診療所・医務室、保健所、刑務所・自衛隊の中など）。
 * 会社（株式会社など）は医療法で社員向けの診療所しか開けないので、会社の名前の付いた医療機関も入れる
 */
export const notForPublic = (name: string) => /株式会社|有限会社|\(株\)|（株）|健康管理|医務室|保健所|保健センター|刑務所|拘置所|少年院|自衛隊|駐屯地/.test(name);

/** 休日・夜間だけの診療所（ふだんの最寄りには選ばない） */
export const offHours = (name: string) => /休日|夜間|応急/.test(name);

export function decodeFacility(f: VectorTileFeature, x: number, y: number): Facility | null {
  const g = f.toGeoJSON(x, y, NATIONAL_ZOOM).geometry;
  const p = f.properties;
  const kind = Number(p.k);
  const name = String(p.n ?? "").trim();
  if (g.type !== "Point" || !FACILITY_KINDS[kind] || !name) return null;
  if (kind <= 3 && notForPublic(name)) return null;
  const out: Facility = { kind, name, at: g.coordinates as LngLat };
  if (p.a) out.address = String(p.a);
  if (p.d) out.departments = String(p.d).split("・");
  if (p.b) out.beds = Number(p.b);
  if (Number(p.e) === 1) out.emergency = true;
  if (Number(p.s) === 1 || Number(p.s) === 2) out.disasterBase = Number(p.s) === 1 ? "基幹" : "地域";
  if (p.o) out.owner = String(p.o);
  return out;
}

/** アプリが使う施設のタイル */
export const facilitySource: TileSource<Facility> = sitePmtiles("fac", "facilities.pmtiles", "fac", decodeFacility);

/** 探す範囲（直線距離。周辺施設と同じ徒歩15分くらい） */
export const FACILITY_MAX_M = 1200;

const M_LAT = 110_950;
const distanceM = ([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) => Math.hypot((lng2 - lng1) * 111_320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180), (lat2 - lat1) * M_LAT);

/** 同じ施設とみなす距離（m）：タイルの境目の近くの施設は、隣のタイルにも入っている */
const SAME_PLACE_M = 15;

/** 物件のまわり（maxM 以内）の施設（近い順） */
export async function nearbyFacilities(lat: number, lng: number, source: TileSource<Facility> = facilitySource, maxM = FACILITY_MAX_M): Promise<(Facility & { straight: number })[]> {
  const got = await Promise.all(tilesAround(lat, lng, maxM).map(([x, y]) => source.tile(x, y)));
  const here: LngLat = [lng, lat];
  const out: (Facility & { straight: number })[] = [];
  const byName = new Map<string, Facility[]>();
  for (const f of got.flatMap((t) => t ?? [])) {
    const straight = distanceM(here, f.at);
    if (straight > maxM) continue;
    const key = `${f.kind}|${f.name}`;
    const same = byName.get(key) ?? [];
    if (same.some((g) => distanceM(g.at, f.at) <= SAME_PLACE_M)) continue;
    same.push(f);
    byName.set(key, same);
    out.push({ ...f, straight });
  }
  return out.sort((a, b) => a.straight - b.straight);
}

/** 探すもの：施設の種類と、診療科目（「小児科」のある医療機関など） */
export type FacilityQuery = { key: string; label: string; kinds: number[]; department?: string };

/** よく使う探し方（販売図面の「病院」「小児科」「幼稚園」など） */
export const FACILITY_QUERIES: FacilityQuery[] = [
  { key: "hospital", label: "病院", kinds: [1] },
  { key: "clinic", label: "診療所", kinds: [2] },
  { key: "pediatrics", label: "小児科", kinds: [1, 2], department: "小児科" },
  { key: "internal", label: "内科", kinds: [1, 2], department: "内科" },
  { key: "dental", label: "歯科", kinds: [3] },
  { key: "emergency", label: "救急病院", kinds: [1] },
  { key: "kindergarten", label: "幼稚園・こども園", kinds: [4, 5] },
];

const matches = (f: Facility, q: FacilityQuery) =>
  q.kinds.includes(f.kind) && !offHours(f.name) && (!q.department || (f.departments ?? []).includes(q.department)) && (q.key !== "emergency" || f.emergency === true);

/** 探し方ごとに直線で近い候補の数（道のりでは順番が入れ替わることがある） */
const CANDIDATES = 3;

/**
 * 探し方ごとの最寄りの施設と徒歩の目安（queries の順。近くに無いものは入れない）。
 * 直線で近い3つまでの道のりを測り、いちばん近いものを選ぶ。道がつながらない・遠回りすぎるものは直線距離の目安
 */
export async function nearestFacilities(
  lat: number,
  lng: number,
  facilities: (Facility & { straight: number })[],
  queries: FacilityQuery[] = FACILITY_QUERIES,
  walk = walkTo,
): Promise<(FacilityWalk & { query: string })[]> {
  const picks = queries.map((q) => facilities.filter((f) => matches(f, q)).slice(0, CANDIDATES));
  const candidates = [...new Set(picks.flat())];
  if (!candidates.length) return [];
  const dist = await walk(
    lat,
    lng,
    candidates.map((c, id) => ({ id, points: [c.at] })),
  ).catch(() => new Map<number, number>());
  const out: (FacilityWalk & { query: string })[] = [];
  queries.forEach((q, i) => {
    const walks = picks[i].map((c) => {
      const d = dist.get(candidates.indexOf(c));
      const routed = routedOk(d, c.straight);
      const meters = routed ? d : c.straight;
      return { ...c, label: q.label, meters, minutes: walkMinutes(meters), routed, query: q.key };
    });
    walks.sort((a, b) => Number(b.routed) - Number(a.routed) || a.meters - b.meters);
    if (walks[0]) out.push(walks[0]);
  });
  return out;
}

/** まわりの施設の数（種類ごと。「診療所 48」） */
export function facilityCounts(facilities: Facility[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const f of facilities) out[f.kind] = (out[f.kind] ?? 0) + 1;
  return out;
}

const years = NATIONAL_DATA.fac as { medicalYear?: number; kinderYear?: number } | undefined;

export const FACILITY_CAUTION = `国のデータ（医療機関は${years?.medicalYear ?? 2020}年度、幼稚園は${years?.kinderYear ?? 2023}年度）なので、今も開いているか・診療科目は施設に確かめてください`;

export const FACILITY_CREDIT = "出典：「国土数値情報（医療機関データ・学校データ）」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成";
