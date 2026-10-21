// 実際の取引事例（国土交通省「不動産情報ライブラリ」の取引価格・成約価格）。scripts/deals/build.py が API で市区町村ごとの JSON を作り、
// R2 に置く（.github/workflows/deals.yml。API キーは GitHub の Secrets）。アプリは物件の市区町村のファイルだけを読み、
// 同じ町の事例を出す。事例には番地が無く、町（地区）までの場所なので、物件との距離は分からない
import SOURCE from "./data/deals-source.json";

export const DEALS_DATA = {
  /** 市区町村ごとの JSON を置いた場所（空ならまだデータが無い。API キーの登録待ち） */
  url: process.env.NEXT_PUBLIC_DEALS_URL || SOURCE.url,
  /** データを取った日（「20261021」） */
  asOf: SOURCE.asOf,
  /** 事例の取引時点の範囲（「2024年第3四半期〜2026年第2四半期」） */
  periods: SOURCE.periods,
  /** データのある市区町村（コード → 「東京都渋谷区」） */
  cities: SOURCE.cities as Record<string, string>,
};

/** API の利用約款で、サービスに表示するよう求められている文 */
export const DEALS_NOTE = "このサービスは、国土交通省不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません";
export const DEALS_CREDIT = "出典：国土交通省「不動産情報ライブラリ」（不動産取引価格情報・成約価格情報）を加工して作成";

/** 1件の事例（scripts/deals/build.py の短い形。空の項目は無い） */
export type DealRecord = {
  /** 取引価格（アンケートによる不動産取引価格情報）か成約価格（指定流通機構の成約価格情報）か */
  k: "取引" | "成約";
  /** 種類（「宅地(土地)」「宅地(土地と建物)」「中古マンション等」「農地」「林地」） */
  t: string;
  r?: string;
  /** 市区町村コード */
  c: string;
  m?: string;
  /** 地区名（町名。丁目は付かないことが多い） */
  d?: string;
  dc?: string;
  /** 取引価格（総額・円） */
  p: number;
  /** 面積（m²）。「2000㎡以上」などは as に文字のまま */
  a?: number;
  as?: string;
  /** m² 単価（土地の取引だけ入っていることが多い） */
  u?: number;
  fp?: string;
  /** 延床面積（m²） */
  fa?: number;
  /** 建築年（「1972年」「戦前」） */
  by?: string;
  s?: string;
  us?: string;
  pu?: string;
  dir?: string;
  /** 前面道路の種類・幅員 */
  rc?: string;
  br?: number;
  cp?: string;
  cr?: number;
  fr?: number;
  /** 取引時点（「2024年第3四半期」） */
  pe?: string;
  rn?: string;
  rm?: string;
  sh?: string;
  fg?: string;
};

export type DealFile = { asOf: string; records: DealRecord[] };

/** 物件の市区町村のコード（政令市は住所の区で選ぶ）。データの無い市区町村は undefined */
export function dealCity(codes: string[], address: string, cities = DEALS_DATA.cities): string | undefined {
  const a = address.normalize("NFKC").replace(/\s/g, "");
  const hits = codes.filter((c) => cities[c]);
  return hits.find((c) => a.startsWith(cities[c].normalize("NFKC").replace(/\s/g, ""))) ?? (hits.length === 1 ? hits[0] : undefined);
}

const KANJI: Record<string, string> = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };

/** 「神南一丁目」「神南１丁目」→「神南」（地区名と比べる形） */
export function townKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[0-9一二三四五六七八九十]+丁目$/, "")
    .replace(/[一二三四五六七八九十]/g, (c) => KANJI[c] ?? c)
    .replace(/\s/g, "");
}

/** 同じ町（地区）の事例。町名が無い・合わなければ空 */
export function dealsInTown(records: DealRecord[], town: string): DealRecord[] {
  const key = townKey(town);
  if (!key) return [];
  return records.filter((r) => r.d && townKey(r.d) === key);
}

/** m² 単価。土地は単価の欄、無ければ総額 ÷ 面積（中古マンションは専有面積あたり） */
export function unitPrice(r: DealRecord): number | undefined {
  if (r.u) return r.u;
  if (r.a && (r.t.includes("土地") && !r.t.includes("建物") ? true : r.t.includes("マンション"))) return Math.round(r.p / r.a);
  return undefined;
}

export function median(v: number[]): number | undefined {
  if (!v.length) return undefined;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export type DealKind = "land" | "house" | "mansion" | "other";

/** 種類のまとまり（土地・土地と建物・マンション・そのほか） */
export function dealKind(t: string): DealKind {
  if (t.includes("マンション")) return "mansion";
  if (t.includes("土地と建物")) return "house";
  if (t.includes("土地")) return "land";
  return "other";
}

export const DEAL_KIND_LABEL: Record<DealKind, string> = { land: "土地", house: "土地と建物", mansion: "マンション", other: "そのほか" };

/** 件数と、土地・マンションの m² 単価の中央値 */
export function dealSummary(records: DealRecord[]): { count: number; land?: number; mansion?: number } {
  const of = (k: DealKind) => median(records.filter((r) => dealKind(r.t) === k).map(unitPrice).filter((v): v is number => v !== undefined));
  return { count: records.length, land: of("land"), mansion: of("mansion") };
}

/** 「6,800万円」「1.25億円」 */
export function totalText(yen: number): string {
  if (yen >= 1e8) return `${(Math.round(yen / 1e6) / 100).toFixed(2).replace(/\.?0+$/, "")}億円`;
  return `${Math.round(yen / 1e4).toLocaleString("ja-JP")}万円`;
}

/** ブラウザで市区町村のファイルを読む（無ければ null） */
export async function loadDeals(code: string, base = DEALS_DATA.url): Promise<DealFile | null> {
  if (!base) return null;
  const res = await fetch(`${base.replace(/\/$/, "")}/${code}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DealFile;
}
