// 災害履歴。国土調査の土地履歴調査（不動産情報ライブラリの API。scripts/reinfolib/build.py の rireki。z14 の PMTiles）から、
// 物件の地点が過去の浸水域・土砂災害・液状化などの範囲に入っていたか、近くに堤防の決壊などの記録があるかを出す。
// 土地履歴調査は調べた地域だけのデータなので、記録が無くても災害が無かったとは言えない（画面でも添える）
import type { VectorTileFeature } from "@mapbox/vector-tile";
import type { LngLat, Polygon } from "./parcel";
import { NATIONAL_ZOOM, sitePmtiles, tilesAround, type TileSource } from "./reinfolib";
import { distToLine, distToRings, inPolygon } from "./zoning";

/** 災害の種類（国のデータの災害分類コード） */
export const RIREKI_KINDS: Record<string, string> = {
  "11": "浸水域",
  "12": "堤防決壊箇所",
  "13": "高潮浸水域",
  "14": "高潮破堤箇所",
  "21": "がけ崩れ",
  "22": "地すべり",
  "23": "河道閉塞箇所",
  "24": "土石流",
  "33": "液状化",
  "34": "地震による土砂災害",
  "37": "津波高",
  "38": "津波浸水域",
};

export type RirekiFeature = {
  /** 災害分類コード（「11」） */
  type: string;
  /** 災害の名前（国のデータのまま。「浸水域等」） */
  name: string;
  /** 発生日（YYYYMMDD。分からない所は 0） */
  date?: string;
  /** 出典の資料（「昭和33年9月台風第22号の水害(東京都)」） */
  source?: string;
  polygons: Polygon[];
  /** 点・線の記録（堤防決壊箇所・津波高など） */
  lines: LngLat[][];
};

export type RirekiRecord = Omit<RirekiFeature, "polygons" | "lines"> & {
  /** 「浸水域」 */
  label: string;
  /** 「1958年9月」 */
  when: string;
  /** 物件の地点が範囲の中か（点・線の記録は false） */
  inside: boolean;
  /** 範囲の縁・記録の点までの距離（m。中なら 0） */
  distance: number;
};

/** 点・線の記録（堤防の決壊箇所など）を「近く」とみなす距離（m） */
export const RIREKI_NEAR_M = 300;
/** 範囲（浸水域など）のすぐ外を「近く」とみなす距離（m）。住所の位置の誤差と、敷地の広さを見込む */
export const RIREKI_AREA_NEAR_M = 50;

export function decodeRireki(f: VectorTileFeature, x: number, y: number): RirekiFeature | null {
  const g = f.toGeoJSON(x, y, NATIONAL_ZOOM).geometry;
  const p = f.properties;
  const s = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(v));
  const type = s(p.t);
  if (!type) return null;
  const polygons = g.type === "Polygon" ? [g.coordinates as Polygon] : g.type === "MultiPolygon" ? (g.coordinates as Polygon[]) : [];
  const lines =
    g.type === "Point"
      ? [[g.coordinates as LngLat]]
      : g.type === "MultiPoint"
        ? (g.coordinates as LngLat[]).map((c) => [c])
        : g.type === "LineString"
          ? [g.coordinates as LngLat[]]
          : g.type === "MultiLineString"
            ? (g.coordinates as LngLat[][])
            : [];
  if (!polygons.length && !lines.length) return null;
  return { type, name: s(p.n) ?? RIREKI_KINDS[type] ?? "災害", date: s(p.d), source: s(p.s), polygons, lines };
}

/** アプリが使う災害履歴のタイル */
export const rirekiSource: TileSource<RirekiFeature> = sitePmtiles("rireki", "rireki.pmtiles", "dh", decodeRireki);

/** 「19580900」→「1958年9月」、「19230901」→「1923年9月1日」、「00000000」→「時期不明」 */
export function rirekiWhen(date?: string): string {
  const m = date?.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m || m[1] === "0000") return "時期不明";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return `${y}年${mo ? `${mo}月` : ""}${mo && d ? `${d}日` : ""}`;
}

/**
 * 地点の災害履歴：地点を含む範囲（浸水域など。すぐ外も）と、近く（RIREKI_NEAR_M 以内）の点・線の記録。範囲の中を先に、新しい順。
 * 同じ災害（種類・時期・資料が同じ）は1つにする。データそのものがあるかは hasNational("rireki") で見る
 */
export async function rirekiAt(lat: number, lng: number, source: TileSource<RirekiFeature> = rirekiSource): Promise<RirekiRecord[]> {
  const got = await Promise.all(tilesAround(lat, lng, RIREKI_NEAR_M).map(([x, y]) => source.tile(x, y)));
  const p: LngLat = [lng, lat];
  const byKey = new Map<string, RirekiRecord>();
  for (const f of got.flat()) {
    if (!f) continue;
    const inside = f.polygons.some((poly) => inPolygon(p, poly));
    const toArea = inside ? 0 : f.polygons.length ? Math.min(...f.polygons.map((poly) => distToRings(p, poly))) : Infinity;
    const toLine = f.lines.length ? Math.min(...f.lines.map((l) => distToLine(p, l))) : Infinity;
    if (!inside && toArea > RIREKI_AREA_NEAR_M && toLine > RIREKI_NEAR_M) continue;
    const distance = Math.min(toArea, toLine);
    const key = `${f.type}|${f.date}|${f.source}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.inside ||= inside;
      prev.distance = Math.min(prev.distance, distance);
      continue;
    }
    byKey.set(key, { type: f.type, name: f.name, date: f.date, source: f.source, label: RIREKI_KINDS[f.type] ?? f.name, when: rirekiWhen(f.date), inside, distance });
  }
  return [...byKey.values()].sort((a, b) => Number(b.inside) - Number(a.inside) || (b.date ?? "").localeCompare(a.date ?? ""));
}

/** 「1958年9月 浸水域（昭和33年9月台風第22号の水害(東京都)）」 */
export function rirekiLine(r: RirekiRecord): string {
  const where = r.inside ? "" : `（約${Math.max(1, Math.round(r.distance))}m先）`;
  return `${r.when} ${r.label}${where}${r.source ? `：${r.source}` : ""}`;
}

export const RIREKI_CAUTIONS = [
  "国土調査（土地履歴調査）で集めた過去の災害の記録で、調べた地域だけのデータです。記録が無くても災害が無かったとは言えません",
  "範囲は当時の資料からおおよそを写したものです。市区町村の浸水実績図・ハザードマップもあわせて確かめてください",
];

export const RIREKI_CREDIT = "出典：国土交通省 不動産情報ライブラリ（国土調査 土地履歴調査の災害履歴）を加工して作成";
