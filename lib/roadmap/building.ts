// 物件の地点の建物（国土交通省 PLATEAU の3D都市モデル）。建物ごとの代表点・範囲・属性だけのタイル
// （scripts/building-tiles/build.py。z17）を読み、地点を範囲に含む建物から、物件の筆の中に代表点があるもの・
// 代表点が近いものを選ぶ。建物の形は持たないので、地点の建物は「推定」として出す。
// 属性は都市計画基礎調査などをもとにしたもので、市区町村によって入っている項目が違う（横浜市・千葉市は用途・階数が無いことが多い）
import { inPolygon } from "./zoning";
import type { LngLat, Polygon } from "./parcel";

/** 建物のタイルのズーム（z17 だけ。地図の文字もこのズームから出す） */
export const BUILDING_ZOOM = 17;

export type Building = {
  /** 代表点 */
  point: LngLat;
  /** 建物の範囲 [西, 南, 東, 北]（代表点からの m） */
  box: [number, number, number, number];
  name?: string;
  /** 用途（住宅・共同住宅・店舗等併用住宅・業務施設 など） */
  usage?: string;
  /** 詳しい用途（独立住宅 など） */
  detail?: string;
  above?: number;
  below?: number;
  /** 高さ（m） */
  height?: number;
  /** 構造（耐火造・準耐火造・防火造・準防火造・木造 など。防火上の区分） */
  structure?: string;
  /** 建築面積の目安（m²。建物の外形・屋根の外周の面積） */
  area?: number;
  /** 延べ面積（m²。入っている市区町村だけ） */
  floorArea?: number;
  /** 建築年（入っている市区町村だけ） */
  year?: number;
  /** 調査年（都市計画基礎調査） */
  survey?: number;
};

/** タイル (x, y) の建物。タイルが無ければ null（PLATEAU の無い市区町村） */
export type BuildingSource = { tile(x: number, y: number): Promise<Building[] | null> };

export type BuildingHit = {
  building: Building;
  /** 地点から代表点までの距離（m） */
  distance: number;
  /** 物件の筆の中に代表点がある */
  onParcel: boolean;
};

export type BuildingResult = {
  /** 地点の建物（推定）。地点に建物が無ければ無し */
  hit?: BuildingHit;
  /** 同じ筆の中に代表点があるほかの建物（筆が分かるときだけ） */
  others: BuildingHit[];
};

const M_PER_DEG_LAT = 110_950;

/** 地点 p から見た q の東西・南北のずれ（m） */
function offset(p: LngLat, q: LngLat): [number, number] {
  return [(q[0] - p[0]) * M_PER_DEG_LAT * Math.cos((p[1] * Math.PI) / 180), (q[1] - p[1]) * M_PER_DEG_LAT];
}

/** 緯度経度 → タイル番号（小数）。端からの距離を見るのに使う */
function tileXY(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

/** 地点のタイルと、地点が端から近ければ隣のタイルも（大きな建物の代表点が隣のタイルにあることがある） */
export function tilesNear(lat: number, lng: number, marginM = 60): [number, number][] {
  const [fx, fy] = tileXY(lat, lng, BUILDING_ZOOM);
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  // z17 のタイルの幅（m）
  const size = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** BUILDING_ZOOM;
  const m = marginM / size;
  const dx = [fx - x < m ? -1 : 0, 0, x + 1 - fx < m ? 1 : 0];
  const dy = [fy - y < m ? -1 : 0, 0, y + 1 - fy < m ? 1 : 0];
  const out = new Map<string, [number, number]>();
  for (const a of dx) for (const b of dy) out.set(`${x + a}/${y + b}`, [x + a, y + b]);
  return [...out.values()];
}

/**
 * 地点の建物。地点を範囲に含む建物（範囲を 1m 広げて見る）のうち、物件の筆の中に代表点があるものを先に、
 * 次に地点が範囲の内側の深い所にあるもの（代表点から範囲の端までのうち、地点がどれだけ寄っているかの割合が小さいもの）を選ぶ。
 * 隣の建物の範囲が地点にかかっていても、地点はその範囲の端のほうにある。豊島区・江戸川区・さいたま市大宮区の建物で、
 * 代表点から範囲の角へ 25% 寄った地点の 99.5%、45% 寄った地点の 93% でその建物を選ぶ（範囲の小ささで選ぶと 82〜83%）。
 * 筆が分かれば、同じ筆の中のほかの建物も返す。PLATEAU の無い市区町村は null
 */
export async function buildingAt(lat: number, lng: number, source: BuildingSource, parcel?: Polygon[]): Promise<BuildingResult | null> {
  const tiles = await Promise.all(tilesNear(lat, lng).map(([x, y]) => source.tile(x, y)));
  if (tiles.every((t) => t === null)) return null;
  const p: LngLat = [lng, lat];
  const seen = new Set<string>();
  const hits: BuildingHit[] = [];
  const onLot: BuildingHit[] = [];
  // 地点が範囲のどれだけ端に寄っているか（0 は代表点、1 は範囲の端）
  const depth = new Map<BuildingHit, number>();
  for (const b of tiles.flatMap((t) => t ?? [])) {
    const key = `${b.point[0]},${b.point[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // 地点は、代表点から見てどこにあるか（m）
    const [ex, ny] = offset(b.point, p);
    const inside = ex >= b.box[0] - 1 && ex <= b.box[2] + 1 && ny >= b.box[1] - 1 && ny <= b.box[3] + 1;
    const onParcel = !!parcel?.some((poly) => inPolygon(b.point, poly));
    const hit = { building: b, distance: Math.hypot(ex, ny), onParcel };
    if (inside) hits.push(hit);
    else if (onParcel) onLot.push(hit);
    depth.set(hit, Math.max(ex >= 0 ? ex / Math.max(1, b.box[2]) : ex / Math.min(-1, b.box[0]), ny >= 0 ? ny / Math.max(1, b.box[3]) : ny / Math.min(-1, b.box[1])));
  }
  hits.sort((a, b) => Number(b.onParcel) - Number(a.onParcel) || depth.get(a)! - depth.get(b)! || a.distance - b.distance);
  const hit = hits[0];
  const others = [...hits.slice(1).filter((h) => h.onParcel), ...onLot].sort((a, b) => a.distance - b.distance);
  return { hit, others: parcel ? others : [] };
}

// ---- 画面に出す文字 ----

/** 用途の短い名前（地図の文字・スマホの印） */
export function usageShort(usage?: string): string {
  if (!usage) return "";
  const u = usage.normalize("NFKC");
  const table: [RegExp, string][] = [
    [/^店舗等併用共同住宅/, "店舗併用共同"],
    [/^店舗等併用住宅/, "店舗併用"],
    [/^作業所併用住宅/, "作業所併用"],
    [/^共同住宅/, "共同住宅"],
    [/^住宅/, "住宅"],
    [/^商業系複合施設/, "商業複合"],
    [/^(業務|商業|宿泊|文教厚生|官公庁|運輸倉庫|供給処理|農林漁業用|防衛)施設/, "$1"],
  ];
  for (const [re, s] of table) if (re.test(u)) return u.replace(re, s).replace(/^(.+?)[（(].*$/, "$1").slice(0, 8);
  return u.replace(/施設$/, "").slice(0, 8);
}

/** 用途の区分（地図の点の色と凡例） */
export type UsageGroup = "house" | "apartment" | "mixed" | "commercial" | "office" | "public" | "industry" | "other";

export const USAGE_GROUPS: Record<UsageGroup, { label: string; color: string }> = {
  house: { label: "住宅", color: "#3f9b5f" },
  apartment: { label: "共同住宅", color: "#2f78c4" },
  mixed: { label: "店舗・作業所併用住宅", color: "#d9932b" },
  commercial: { label: "商業・宿泊", color: "#d4553f" },
  office: { label: "業務", color: "#8a5fbf" },
  public: { label: "官公庁・文教厚生", color: "#3aa6a6" },
  industry: { label: "工場・倉庫・供給処理", color: "#7d7466" },
  other: { label: "そのほか・不明", color: "#a9a39a" },
};

export function usageGroup(usage?: string): UsageGroup {
  const u = (usage ?? "").normalize("NFKC");
  if (/併用/.test(u)) return "mixed";
  if (/^共同住宅/.test(u)) return "apartment";
  if (/^住宅/.test(u)) return "house";
  if (/商業|宿泊|店舗/.test(u)) return "commercial";
  if (/業務/.test(u)) return "office";
  if (/官公庁|文教|厚生|医療|福祉/.test(u)) return "public";
  if (/工場|倉庫|運輸|供給処理|農林漁業/.test(u)) return "industry";
  return "other";
}

/** 「地上5階・地下1階」 */
export function storeysLabel(b: Building): string | undefined {
  if (!b.above && !b.below) return undefined;
  return [b.above ? `地上${b.above}階` : "", b.below ? `地下${b.below}階` : ""].filter(Boolean).join("・");
}

/** 地図の文字（名前があれば名前、無ければ「共同住宅 5F」） */
export function buildingLabel(b: Pick<Building, "name" | "usage" | "above">): string {
  if (b.name) return b.name;
  return [usageShort(b.usage), b.above ? `${b.above}F` : ""].filter(Boolean).join(" ");
}

/** 1行の要約（「共同住宅・地上5階・耐火造」） */
export function buildingSummary(b: Building): string {
  return [b.name, b.usage, storeysLabel(b), b.structure].filter(Boolean).join("・") || "建物（属性なし）";
}

export type BuildingRow = { label: string; value: string };

/** 画面・印刷に出す行（入っている項目だけ） */
export function buildingRows(b: Building): BuildingRow[] {
  const rows: BuildingRow[] = [];
  if (b.name) rows.push({ label: "名称", value: b.name });
  if (b.usage) rows.push({ label: "用途", value: b.detail && b.detail !== b.usage ? `${b.usage}（${b.detail}）` : b.usage });
  const st = storeysLabel(b);
  if (st) rows.push({ label: "階数", value: st });
  if (b.structure) rows.push({ label: "構造（防火）", value: b.structure });
  if (b.height) rows.push({ label: "高さ", value: `約${b.height.toFixed(1)}m` });
  if (b.area) rows.push({ label: "建築面積の目安", value: `約${b.area.toLocaleString("ja-JP")}m²` });
  if (b.floorArea) rows.push({ label: "延べ面積", value: `約${b.floorArea.toLocaleString("ja-JP")}m²` });
  if (b.year) rows.push({ label: "建築年", value: `${b.year}年` });
  if (b.survey) rows.push({ label: "調査年", value: `${b.survey}年` });
  return rows;
}
