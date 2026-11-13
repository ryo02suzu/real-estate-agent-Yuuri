// 地価公示の鑑定評価書。不動産情報ライブラリの鑑定評価書情報 API（scripts/reinfolib/build.py の appraisal。標準地の z13 タイルごとの JSON）
// から、標準地（地価公示の地点）の鑑定評価の中身（路線価、土地・道路・法令の状況、取引事例比較法・収益還元法などの価格と内訳）を読む。
// 1つの標準地を2人の不動産鑑定士が評価するので、評価は2つある（reports）。地価公示の地点（lib/roadmap/land-price.ts の「公示」）で使う
import type { LngLat } from "./parcel";
import { browserJson, cachedJson, NATIONAL_DATA, nationalUrl, tileOf, type JsonLoader } from "./reinfolib";

export type AppraisalReport = {
  /** 取引事例比較法による比準価格（円/m²） */
  compare?: number;
  /** 控除法による控除後価格 */
  deduct?: number;
  /** 収益還元法による収益価格 */
  income?: number;
  /** 原価法による積算価格 */
  cost?: number;
  /** 開発法による価格 */
  develop?: number;
  /** 比準価格の算定に使った取引事例（取引価格・推定価格・標準価格・査定価格。円/m²） */
  cases?: { trade?: number; est?: number; std?: number; val?: number }[];
  costDetail?: { land?: number; work?: number; total?: number };
  /** 収益価格の内訳（総収益・総費用・純収益は円、還元利回りは%） */
  incomeDetail?: { gross?: number; expense?: number; net?: number; building?: number; land?: number; adjusted?: number; rate?: number };
  devDetail?: { revenue?: number; expense?: number; roi?: number; unitPrice?: number; saleable?: number; construction?: number; floor?: number };
};

export type AppraisalPoint = {
  /** 標準地番号（「千代田5-1」。地価公示の地点の no と同じ形） */
  no: string;
  at: LngLat;
  /** 価格時点の年（1月1日） */
  y: number;
  /** 1m² あたりの価格（公示価格） */
  p: number;
  /** 変動率（%） */
  ch?: number;
  /** 用途区分（「住宅地」「商業地」） */
  use?: string;
  /** 市区町村コード */
  city: string;
  /** 路線価（相続税路線価・倍率） */
  rosen?: { y?: number; p?: number; rate?: number; rateKind?: string };
  addr?: string;
  jukyo?: string;
  kari?: string;
  /** 地積・うち私道（m²） */
  area?: number;
  privateRoad?: number;
  /** 形状（「長方形」）と間口・奥行の比、傾斜度 */
  shape?: string;
  frontage?: number;
  depth?: number;
  slope?: number;
  /** 土地の利用の現況（「住宅」「事務所」）と建物の階数 */
  current?: string;
  floors?: number;
  basements?: number;
  /** 周辺の土地の利用の状況 */
  env?: string;
  /** 前面道路（方位・幅員 m・種類・舗装・高低・駅前区分）と側道 */
  road?: { dir?: string; width?: number; kind?: string; paved?: string; level?: string; station?: string; sideDir?: string; sides?: string };
  /** 交通施設（駅など）と距離（m） */
  access?: { name?: string; m?: number; near?: string };
  /** 法令上の規制（区域区分・用途地域・指定と基準の建ぺい率・容積率・防火・その他の地域地区・高度地区） */
  law?: {
    plan?: string;
    zone?: string;
    bcr?: number;
    far?: number;
    bcrStd?: number;
    farStd?: number;
    fire?: string;
    forest?: string;
    park?: string;
    other?: string[];
    height?: { kind?: string; class?: string; m?: number }[];
    nature?: string;
  };
  /** 2人の鑑定評価員の評価 */
  reports: AppraisalReport[];
};

export type AppraisalFile = { points: AppraisalPoint[] };

/** ファイルのタイルのズーム */
export const APPRAISAL_ZOOM = Number(NATIONAL_DATA.appraisal?.zoom ?? 13);

const load = cachedJson(browserJson);

const M_LAT = 110_950;
const distanceM = ([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) => Math.hypot((lng2 - lng1) * 111_320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180), (lat2 - lat1) * M_LAT);

/**
 * 地価公示の地点（標準地番号と位置）の鑑定評価書。同じ標準地番号の地点（同じ番号が別の市にあれば、近い方）を選ぶ。
 * データが無い（取り込み前・地価調査の地点）ときは null
 */
export async function appraisalFor(no: string, at: LngLat, loader: JsonLoader = load): Promise<AppraisalPoint | null> {
  const [x, y] = tileOf(at[1], at[0], APPRAISAL_ZOOM);
  const url = nationalUrl("appraisal", `appraisal/${x}/${y}.json`);
  if (!url) return null;
  const file = (await loader(url)) as AppraisalFile | null;
  const same = (file?.points ?? []).filter((p) => p.no === no);
  if (!same.length) return null;
  return same.sort((a, b) => distanceM(a.at, at) - distanceM(b.at, at))[0];
}

/** 「1,234,000円/m²」 */
export const yenPerM2 = (v: number) => `${Math.round(v).toLocaleString("ja-JP")}円/m²`;

/** 鑑定評価の手法ごとの価格（2人分。手法の名前と価格。適用していない手法は入れない） */
export function methodRows(point: AppraisalPoint): { label: string; values: (number | undefined)[] }[] {
  const rows: [keyof AppraisalReport, string][] = [
    ["compare", "比準価格（取引事例比較法）"],
    ["income", "収益価格（収益還元法）"],
    ["cost", "積算価格（原価法）"],
    ["deduct", "控除後価格（控除法）"],
    ["develop", "開発法による価格"],
  ];
  return rows
    .map(([k, label]) => ({ label, values: point.reports.map((r) => r[k] as number | undefined) }))
    .filter((r) => r.values.some((v) => typeof v === "number"));
}

export const APPRAISAL_CAUTION = "地価公示の標準地の評価で、物件そのものの価格ではありません";
export const APPRAISAL_CREDIT = "出典：国土交通省 不動産情報ライブラリ（地価公示 鑑定評価書情報）を加工して作成";
