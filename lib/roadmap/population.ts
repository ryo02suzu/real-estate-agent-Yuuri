// 将来推計人口。国土数値情報の 250m メッシュ別将来推計人口（令和6年国政局推計。2020年の国勢調査が基準）から、物件のまわり
// （250m メッシュの 5×5。約1.25km四方）の人口の移り変わりと、子ども（0〜14歳）・高齢者（65歳以上）の割合を出す。
// 合計はパイプライン（scripts/reinfolib/build.py の pop）で済ませてあり、物件のメッシュの値を読むだけ。推計なので目安として出す
import { mesh250 } from "./mesh";
import { browserJson, cachedJson, NATIONAL_DATA, nationalUrl, type JsonLoader } from "./reinfolib";

/** 推計の年（2020 は国勢調査の人口） */
export const POP_YEARS: number[] = (NATIONAL_DATA.pop?.years as number[] | undefined) ?? [2020, 2025, 2030, 2035, 2040, 2045, 2050];

/** 2次メッシュのファイル：250m メッシュのコードの下4桁 → [年ごとの人口…, 0〜14歳の割合 2025, 65歳以上 2025, 0〜14歳 2050, 65歳以上 2050]（割合は千分率） */
export type PopFile = { m: Record<string, (number | null)[]> };

export type PopulationOutlook = {
  mesh: string;
  /** まわり（約1.25km四方）の人口（POP_YEARS の年ごと） */
  series: { year: number; people: number }[];
  /** 2020年からの増減の割合（%。2035・2050） */
  change2035?: number;
  change2050?: number;
  /** 0〜14歳・65歳以上の割合（%。2025年と2050年） */
  children?: { now: number; future: number };
  elderly?: { now: number; future: number };
};

/** まわりとみなす範囲（画面の言い方） */
export const POP_AREA = "まわり約1.25km四方";

const load = cachedJson(browserJson);

const pct = (v: number | null | undefined) => (typeof v === "number" ? v / 10 : undefined);

/** 地点のまわりの将来推計人口。データが無い（取り込み前・人の住んでいない山や海）ときは null */
export async function populationAt(lat: number, lng: number, loader: JsonLoader = load): Promise<PopulationOutlook | null> {
  const mesh = mesh250(lat, lng);
  const url = mesh && nationalUrl("pop", `pop/${mesh.slice(0, 6)}.json`);
  if (!mesh || !url) return null;
  const file = (await loader(url)) as PopFile | null;
  const v = file?.m?.[mesh.slice(6)];
  if (!v) return null;
  const n = POP_YEARS.length;
  const series = POP_YEARS.map((year, i) => ({ year, people: Number(v[i] ?? 0) }));
  const base = series[0].people;
  const change = (year: number) => {
    const s = series.find((p) => p.year === year);
    return s && base > 0 ? Math.round(((s.people - base) / base) * 1000) / 10 : undefined;
  };
  const [c25, o25, c50, o50] = [pct(v[n]), pct(v[n + 1]), pct(v[n + 2]), pct(v[n + 3])];
  return {
    mesh,
    series,
    change2035: change(2035),
    change2050: change(2050),
    children: c25 !== undefined && c50 !== undefined ? { now: c25, future: c50 } : undefined,
    elderly: o25 !== undefined && o50 !== undefined ? { now: o25, future: o50 } : undefined,
  };
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(/\.0$/, "")}%`;

/** 「まわり約1.25km四方の人口 2020年 8,198人 → 2050年 8,430人（+2.8%）」 */
export function populationText(p: PopulationOutlook): string {
  const first = p.series[0];
  const last = p.series[p.series.length - 1];
  const change = p.change2050 !== undefined ? `（${signed(p.change2050)}）` : "";
  return `${POP_AREA}の人口 ${first.year}年 ${first.people.toLocaleString("ja-JP")}人 → ${last.year}年 ${last.people.toLocaleString("ja-JP")}人${change}`;
}

/** 「65歳以上の割合 22.9% → 26.9%（2025年→2050年）」 */
export function agingText(p: PopulationOutlook): string | undefined {
  if (!p.elderly) return undefined;
  return `65歳以上の割合 ${p.elderly.now}% → ${p.elderly.future}%（2025年→2050年）`;
}

export const POP_CAUTIONS = [
  "国の推計（令和6年国政局推計。2020年の国勢調査が基準）による目安で、これからの開発などは入っていません",
  "物件の場所の 250m 四方と、そのまわりの 24 区画を合わせた人口です",
];

export const POP_CREDIT = "出典：「国土数値情報（250mメッシュ別将来推計人口データ（R6国政局推計））」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成";
