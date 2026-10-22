// 駅別乗降客数。国土数値情報の駅別乗降客数データ（不動産情報ライブラリの API。scripts/reinfolib/build.py の ridership）から、
// 最寄り駅の1日あたりの乗降客数を事業者ごとに出す。数は各社が独自に数えたもので、統一の基準ではない（国の注意書き）。
// 同じ駅の複数の路線は、国のデータで数が付いている路線（いちばん中心に近い路線。備考に含む路線が書いてある）にまとめて入っている
import type { LngLat } from "./parcel";
import { browserJson, cachedJson, nationalUrl, type JsonLoader } from "./reinfolib";

/** ridership.json：駅（名前・位置）と、事業者ごとの路線と年度ごとの乗降客数（人/日） */
export type RidershipFile = {
  years: [number, number];
  stations: { n: string; at: LngLat; o: { op: string; l: string[]; c: Record<string, number>; r?: string }[] }[];
};

export type RidershipOperator = {
  /** 「東急」（アプリの駅のデータと同じ短い呼び方） */
  operator: string;
  /** 数が付いている路線（「東横線」） */
  lines: string[];
  /** いちばん新しい年度の1日あたりの乗降客数 */
  count: number;
  year: number;
  /** 年度ごとの数（古い順） */
  series: { year: number; count: number }[];
  /** 国のデータの備考（「田園都市線、東京地下鉄・11号線半蔵門線…を含む」） */
  note?: string;
};

export type Ridership = {
  name: string;
  /** 事業者の合計（いちばん新しい年度の数を足したもの。乗り換えの客は事業者ごとに数えられる） */
  total: number;
  /** 合計の年度（事業者ごとに年度が違えば、いちばん新しい年度） */
  year: number;
  operators: RidershipOperator[];
};

/** 同じ駅とみなす距離（m）：駅の位置（ホームの線の中ほど）どうし */
const SAME_STATION_M = 1000;

const M_LAT = 110_950;
const distanceM = ([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) => Math.hypot((lng2 - lng1) * 111_320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180), (lat2 - lat1) * M_LAT);

/** 駅の名前の比べ方：かっこ書きと「駅」を外す（「押上（スカイツリー前）」→「押上」） */
const nameKey = (n: string) => n.normalize("NFKC").replace(/\(.*?\)/g, "").replace(/駅$/, "").trim();

let file: Promise<RidershipFile | null> | undefined;
const load = cachedJson(browserJson);

/** ridership.json を1回だけ読む（無ければ null） */
export function loadRidership(loader: JsonLoader = load): Promise<RidershipFile | null> {
  const url = nationalUrl("ridership", "ridership.json");
  if (!url) return Promise.resolve(null);
  if (loader !== load) return loader(url) as Promise<RidershipFile | null>;
  file ??= (loader(url) as Promise<RidershipFile | null>).catch((e) => {
    file = undefined;
    throw e;
  });
  return file;
}

/** 駅（名前と位置）の乗降客数。同じ名前で近い（1km 以内）駅の事業者をまとめる。見つからなければ null */
export function ridershipOf(data: RidershipFile, name: string, at: LngLat): Ridership | null {
  const key = nameKey(name);
  const ops = new Map<string, RidershipOperator>();
  for (const s of data.stations) {
    if (nameKey(s.n) !== key || distanceM(s.at, at) > SAME_STATION_M) continue;
    for (const o of s.o) {
      const series = Object.entries(o.c)
        .map(([y, c]) => ({ year: Number(y), count: c }))
        .sort((a, b) => a.year - b.year);
      if (!series.length) continue;
      const last = series[series.length - 1];
      const prev = ops.get(o.op);
      if (prev) {
        // 同じ事業者の別の行（別の路線に数が付いている）は足す
        for (const p of series) {
          const q = prev.series.find((s) => s.year === p.year);
          if (q) q.count += p.count;
          else prev.series.push({ ...p });
        }
        prev.series.sort((a, b) => a.year - b.year);
        prev.lines.push(...o.l.filter((l) => !prev.lines.includes(l)));
        const top = prev.series[prev.series.length - 1];
        prev.count = top.count;
        prev.year = top.year;
        if (o.r && !prev.note) prev.note = o.r;
      } else {
        ops.set(o.op, { operator: o.op, lines: [...o.l], count: last.count, year: last.year, series, note: o.r });
      }
    }
  }
  if (!ops.size) return null;
  const operators = [...ops.values()].sort((a, b) => b.count - a.count);
  const year = Math.max(...operators.map((o) => o.year));
  return { name, total: operators.reduce((s, o) => s + o.count, 0), year, operators };
}

/** 「約213万人」「約4.1万人」「8,500人」 */
export function peopleText(n: number): string {
  if (n >= 1_000_000) return `約${(Math.round(n / 10_000)).toLocaleString("ja-JP")}万人`;
  if (n >= 10_000) return `約${(Math.round(n / 1000) / 10).toFixed(1).replace(/\.0$/, "")}万人`;
  return `${n.toLocaleString("ja-JP")}人`;
}

/** 「1日の乗降客数 約213万人（2023年度・4事業者の合計）」 */
export function ridershipText(r: Ridership): string {
  const who = r.operators.length > 1 ? `・${r.operators.length}事業者の合計` : "";
  return `1日の乗降客数 ${peopleText(r.total)}（${r.year}年度${who}）`;
}

export const RIDERSHIP_CAUTION = "乗降客数は各社が独自に数えたもので、統一の基準ではありません。乗り換えの客は事業者ごとに数えられます";
export const RIDERSHIP_CREDIT = "出典：国土交通省 不動産情報ライブラリ（国土数値情報 駅別乗降客数データ）を加工して作成";
