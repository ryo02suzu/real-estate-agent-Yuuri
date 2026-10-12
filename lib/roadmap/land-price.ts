// 物件の近くの地価公示（標準地・1月1日時点）と都道府県地価調査（基準地・7月1日時点）。
// 国土数値情報の地点をタイル（scripts/land-price/build.py。z13 で全地点）にしたものから、物件のまわりのタイルだけを読み、近い順に並べる。
// 標準地・基準地は「その地域で標準的な土地」の価格で、物件そのものの価格ではない（画面・共有の文面でもそう添える）
import type { LngLat } from "./parcel";

/** 地点を全部持つタイルのズーム */
export const LAND_PRICE_ZOOM = 13;

export type LandPriceKind = "公示" | "調査";
export type LandUsage = "住宅地" | "商業地" | "工業地" | "宅地見込地";

export type LandPricePoint = {
  /** 地価公示（標準地）か都道府県地価調査（基準地）か */
  kind: LandPriceKind;
  /** 標準地番号・基準地番号（「千代田5-1」「千代田(都)-3」） */
  no: string;
  point: LngLat;
  /** 円/m² */
  price: number;
  /** 対前年変動率（%）。新しく選ばれた地点などは無し */
  change?: number;
  usage: LandUsage;
  /** 価格の年（地価公示は1月1日、地価調査は7月1日の時点） */
  year: number;
  /** 所在及び地番 */
  address?: string;
  /** 住居表示（町名から） */
  jukyo?: string;
  /** 地積（m²） */
  area?: number;
  /** 利用の現況（「住宅」「店舗、事務所」） */
  use?: string;
  /** 建物の構造（SRC・RC・S・W など） */
  structure?: string;
  above?: number;
  below?: number;
  /** 前面道路（種類・方位・幅員 m） */
  roadType?: string;
  roadDir?: string;
  roadWidth?: number;
  /** 周辺の土地の利用の状況 */
  env?: string;
  station?: string;
  /** 最寄り駅までの道路距離（m） */
  stationM?: number;
  /** 用途地域（「1低専」「商業」）・防火・区域区分・建蔽率・容積率 */
  zone?: string;
  fire?: string;
  plan?: string;
  bcr?: number;
  far?: number;
  /** 価格の推移（古い順。調べていない年は無し） */
  history: { year: number; price: number }[];
};

/** タイル (x, y)（z13）の地点。タイルが無ければ null（関東の外） */
export type LandPriceSource = { tile(x: number, y: number): Promise<LandPricePoint[] | null> };

export type LandPriceHit = LandPricePoint & {
  /** 物件からの距離（m） */
  distance: number;
  /** 物件から見た向き（「北東」） */
  bearing: string;
};

const M_PER_DEG_LAT = 110_950;
const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];

/** 地点 a から b への距離（m）と8方位 */
function offset(a: LngLat, b: LngLat): { distance: number; bearing: string } {
  const ex = (b[0] - a[0]) * M_PER_DEG_LAT * Math.cos((a[1] * Math.PI) / 180);
  const ny = (b[1] - a[1]) * M_PER_DEG_LAT;
  const deg = ((Math.atan2(ex, ny) * 180) / Math.PI + 360) % 360;
  return { distance: Math.hypot(ex, ny), bearing: DIRS[Math.round(deg / 45) % 8] };
}

function tileOf(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [Math.floor(((lng + 180) / 360) * n), Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n)];
}

/**
 * 物件の近くの地点を近い順に。物件のタイルとまわりの8枚（z13。1枚が約4km 四方）を読む。
 * 地価公示と地価調査が同じ地点（共通地点）は両方出す（時点が半年違う）。関東の外は空
 */
export async function nearestLandPrices(
  lat: number,
  lng: number,
  source: LandPriceSource,
  { count = 5, maxM = 3000 }: { count?: number; maxM?: number } = {},
): Promise<LandPriceHit[]> {
  const [x, y] = tileOf(lat, lng, LAND_PRICE_ZOOM);
  const jobs: Promise<LandPricePoint[] | null>[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) jobs.push(source.tile(x + dx, y + dy));
  // タイルの境目の近くの地点は、隣のタイルにも入っている（タイルの縁の余白）。同じ地点は1つに
  const points = new Map<string, LandPricePoint>();
  for (const p of (await Promise.all(jobs)).flatMap((t) => t ?? [])) points.set(`${p.kind}|${p.no}`, p);
  return [...points.values()]
    .map((p) => ({ ...p, ...offset([lng, lat], p.point) }))
    .filter((h) => h.distance <= maxM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

// ---- 画面に出す文字 ----

/** 「441万円/m²」「45.5万円/m²」「8,350円/m²」 */
export function priceText(yen: number, unit = "m²"): string {
  if (yen < 10_000) return `${yen.toLocaleString("ja-JP")}円/${unit}`;
  const man = yen / 10_000;
  const s = man >= 100 ? Math.round(man).toLocaleString("ja-JP") : (Math.round(man * 10) / 10).toFixed(1).replace(/\.0$/, "");
  return `${s}万円/${unit}`;
}

/** 坪あたり（1坪 = 400/121 m²）。「坪 150万円」 */
export function tsuboText(yen: number): string {
  return priceText(Math.round((yen * 400) / 121), "坪");
}

/** 「+3.2%」「-1.0%」「±0%」。前年の価格が無い地点は「新規」 */
export function changeText(change?: number): string {
  if (change === undefined) return "新規";
  if (change === 0) return "±0%";
  return `${change > 0 ? "+" : "-"}${Math.abs(change).toFixed(1)}%`;
}

/** 「地価公示」「地価調査」 */
export function kindText(kind: LandPriceKind): string {
  return kind === "公示" ? "地価公示" : "地価調査";
}

/** 価格の時点（「2026年1月1日時点」） */
export function asOfText(p: Pick<LandPricePoint, "kind" | "year">): string {
  return `${p.year}年${p.kind === "公示" ? 1 : 7}月1日時点`;
}

/** 「約320m」「約1.2km」 */
export function distanceText(m: number): string {
  if (m < 1000) return `約${Math.max(10, Math.round(m / 10) * 10)}m`;
  return `約${(Math.round(m / 100) / 10).toFixed(1)}km`;
}

const STRUCTURES: Record<string, string> = { SRC: "鉄骨鉄筋コンクリート造", RC: "鉄筋コンクリート造", S: "鉄骨造", W: "木造", LS: "軽量鉄骨造", B: "ブロック造" };
const ZONES: Record<string, string> = {
  "1低専": "第一種低層住居専用地域",
  "2低専": "第二種低層住居専用地域",
  "1中専": "第一種中高層住居専用地域",
  "2中専": "第二種中高層住居専用地域",
  "1住居": "第一種住居地域",
  "2住居": "第二種住居地域",
  準住居: "準住居地域",
  田園住: "田園住居地域",
  近商: "近隣商業地域",
  商業: "商業地域",
  準工: "準工業地域",
  工業: "工業地域",
  工専: "工業専用地域",
};
const PLANS: Record<string, string> = { 市街化: "市街化区域", 調区: "市街化調整区域", 非線引: "非線引き都市計画区域", 都計外: "都市計画区域外", 準都計: "準都市計画区域" };

/** 一覧の見出しの1行（「地価公示 千代田-1・住宅地」） */
export function landPriceTitle(p: Pick<LandPricePoint, "kind" | "no" | "usage">): string {
  return `${kindText(p.kind)} ${p.no}・${p.usage}`;
}

/** 1行の要約（共有の文面・地図の吹き出し）。「地価公示 千代田-1（住宅地）441万円/m²（+11.4%）」 */
export function landPriceSummary(p: Pick<LandPricePoint, "kind" | "no" | "usage" | "price" | "change">): string {
  return `${kindText(p.kind)} ${p.no}（${p.usage}）${priceText(p.price)}（${changeText(p.change)}）`;
}

export type LandPriceRow = { label: string; value: string };

/** 地点の詳しい行（入っている項目だけ） */
export function landPriceRows(p: LandPricePoint): LandPriceRow[] {
  const rows: LandPriceRow[] = [];
  if (p.address) rows.push({ label: "所在及び地番", value: p.address });
  if (p.jukyo) rows.push({ label: "住居表示", value: p.jukyo });
  if (p.area) rows.push({ label: "地積", value: `${p.area.toLocaleString("ja-JP")}m²` });
  const floors = [p.above ? `地上${p.above}階` : "", p.below ? `地下${p.below}階` : ""].filter(Boolean).join("・");
  const building = [p.structure && (STRUCTURES[p.structure] ?? p.structure), floors].filter(Boolean).join(" ");
  if (p.use) rows.push({ label: "利用の現況", value: building ? `${p.use}（${building}）` : p.use });
  if (p.roadType || p.roadWidth) rows.push({ label: "前面道路", value: [p.roadDir && `${p.roadDir}側`, p.roadWidth && `幅員${p.roadWidth}m`, p.roadType].filter(Boolean).join("・") });
  if (p.station) rows.push({ label: "最寄り駅", value: p.stationM ? `${p.station}（約${p.stationM.toLocaleString("ja-JP")}m）` : `${p.station}（駅前）` });
  const plan = [p.zone && (ZONES[p.zone] ?? p.zone), p.bcr && p.far ? `建蔽率${p.bcr}%・容積率${p.far}%` : "", p.fire && (p.fire === "準防" ? "準防火地域" : `${p.fire}地域`), p.plan && PLANS[p.plan] !== "市街化区域" ? (PLANS[p.plan] ?? p.plan) : ""]
    .filter(Boolean)
    .join("・");
  if (plan) rows.push({ label: "法令上の制限", value: plan });
  if (p.env) rows.push({ label: "周辺の状況", value: p.env });
  const hist = p.history.filter((h) => h.price > 0);
  if (hist.length >= 2) rows.push({ label: "価格の推移", value: hist.map((h) => `${h.year}年 ${priceText(h.price).replace("/m²", "")}`).join("→") });
  return rows;
}

/** 用途ごとの地図の点の色（凡例と同じ） */
export const LAND_USAGE_COLORS: Record<LandUsage, string> = {
  住宅地: "#3f9b5f",
  商業地: "#d4553f",
  工業地: "#7d7466",
  宅地見込地: "#b08a3e",
};

/** タイルの用途の数字（標準地番号の数字。住宅地は 0）→ 用途 */
export function usageFromCode(u: string): LandUsage {
  return u === "5" ? "商業地" : u === "9" ? "工業地" : u === "3" ? "宅地見込地" : "住宅地";
}
