// 土地利用基本計画の区域のうち、重説の「その他の法令」に関わる自然公園地域（自然公園法）・農業地域（農業振興地域の整備に関する法律）・
// 森林地域（森林法）。国土数値情報のデータ（scripts/tochi/build.py。z13 のタイル）から、物件の地点がどの区域に入るかを出す。都県の土地利用基本計画図
// （縮尺約5万分の1）から作った概略の区域で、最新が2015年度版と古いので、参考として出し、都県・市町村の資料で確かめる旨を添える
import SOURCE from "./data/tochi-source.json";
import type { LngLat, Polygon } from "./parcel";
import { tileOf } from "./parcel";
import { inPolygon } from "./zoning";

/** 区域のタイルのズーム（z13 だけ） */
export const TOCHI_ZOOM = 13;

export const TOCHI_DATA = { url: process.env.NEXT_PUBLIC_TOCHI_PMTILES_URL || SOURCE.url, layer: "tc" };

export type TochiKind = "自然公園地域" | "特別地域" | "特別保護地区" | "農業地域" | "農用地区域" | "国有林" | "地域森林計画対象民有林" | "保安林";

/**
 * タイルの種類の番号（t）→ 区域の種類（自然公園地域の細区分が特別地域・特別保護地区、農業地域の細区分が農用地区域。
 * 森林地域は国有林と地域森林計画対象民有林に分かれ、そのどちらかの中に保安林がある）
 */
export const TOCHI_KINDS: Record<number, TochiKind> = {
  1: "自然公園地域",
  2: "特別地域",
  3: "特別保護地区",
  4: "農業地域",
  5: "農用地区域",
  6: "国有林",
  7: "地域森林計画対象民有林",
  8: "保安林",
};

export type TochiArea = { kind: TochiKind; pref: string; polygons: Polygon[] };

/** タイル (x, y)（z14）の区域。タイルが無ければ null（区域の無い所） */
export type TochiSource = { tile(x: number, y: number): Promise<TochiArea[] | null> };

/**
 * 地点の区域。park：自然公園の地種区分（特別地域の外は普通地域。区域外は無し）、agri：農用地区域か、その外の農業振興地域（区域外は無し）、
 * forest：保安林か、地域森林計画対象民有林・国有林か（森林地域の外は無し）。year はデータの年度
 */
export type Tochi = {
  park?: "特別保護地区" | "特別地域" | "普通地域";
  agri?: "農用地区域" | "農業振興地域";
  forest?: "保安林" | "地域森林計画対象民有林" | "国有林";
  year: number;
};

const PREFS = new Set(["08", "09", "10", "11", "12", "13", "14"]);

/** データの年度（都県で一番新しいもの） */
export const TOCHI_YEAR = Math.max(...Object.values(SOURCE.years).flatMap((by) => Object.values(by)));

/** 出典（CC BY 4.0 のとおり、加工したことを書く） */
export const TOCHI_CREDIT = `出典：「国土数値情報（自然公園地域データ・農業地域データ・森林地域データ）」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成（${TOCHI_YEAR}年度）`;

/** 地点の自然公園・農業振興地域・森林地域の区域（関東の外は null） */
export async function tochiAt(lat: number, lng: number, city: string, source: TochiSource): Promise<Tochi | null> {
  if (!PREFS.has(city.slice(0, 2))) return null;
  const areas = (await source.tile(...tileOf(lat, lng, TOCHI_ZOOM))) ?? [];
  const p: LngLat = [lng, lat];
  const kinds = new Set(areas.filter((a) => a.polygons.some((poly) => inPolygon(p, poly))).map((a) => a.kind));
  const park = kinds.has("特別保護地区") ? "特別保護地区" : kinds.has("特別地域") ? "特別地域" : kinds.has("自然公園地域") ? "普通地域" : undefined;
  const agri = kinds.has("農用地区域") ? "農用地区域" : kinds.has("農業地域") ? "農業振興地域" : undefined;
  const forest = (["保安林", "地域森林計画対象民有林", "国有林"] as const).find((k) => kinds.has(k));
  return { park, agri, forest, year: TOCHI_YEAR };
}

// ---- 画面・共有・下書きの文字 ----

/** 自然公園の値（「自然公園の特別地域」。区域外は「自然公園の区域外」） */
export function tochiParkText(t: Tochi): string {
  return t.park ? `自然公園の${t.park}` : "自然公園の区域外";
}

/** 農業振興地域の値（「農用地区域」「農業振興地域（農用地区域の外）」。区域外は「農業振興地域の外」） */
export function tochiAgriText(t: Tochi): string {
  if (t.agri === "農用地区域") return "農業振興地域の農用地区域";
  return t.agri ? "農業振興地域（農用地区域の外）" : "農業振興地域の外";
}

/** 森林の値（「保安林」「地域森林計画対象民有林」「国有林」。区域外は「森林地域の外」） */
export function tochiForestText(t: Tochi): string {
  return t.forest ?? "森林地域の外";
}

/** 画面の1行（「自然公園の特別地域・農用地区域・保安林」。どれも外なら「自然公園・農業振興地域・森林地域の外」） */
export function tochiLine(t: Tochi): string {
  const parts = [t.park && `自然公園の${t.park}`, t.agri && (t.agri === "農用地区域" ? "農用地区域" : "農業振興地域"), t.forest].filter(Boolean);
  return parts.length ? parts.join("・") : "自然公園・農業振興地域・森林地域の外";
}

/** 確かめる先（区域に入っているものだけ。どれも外なら undefined） */
export function tochiCheck(t: Tochi, city: string): string | undefined {
  // 自然公園と保安林は都県（国定公園・国有林の保安林も、まずは都県の担当に聞く）、農用地区域は農業委員会、民有林は市町村の林務、国有林は森林管理署
  const pref = [t.park && "自然公園", t.forest === "保安林" && "保安林"].filter(Boolean);
  const where = [
    pref.length && `${pref.join("・")}は都県の担当`,
    t.agri && `農用地区域かは${city}の農業委員会`,
    t.forest === "地域森林計画対象民有林" && `民有林は${city}の林務の担当`,
    t.forest === "国有林" && "国有林は森林管理署",
  ].filter(Boolean);
  return where.length ? `${where.join("、")}で確認` : undefined;
}
