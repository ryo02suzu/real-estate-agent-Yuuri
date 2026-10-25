// 天気（ホームの空と街に反映する）。気象庁のアメダス（東京＝千代田区大手町、観測所 44132）の 10 分ごとの観測と、
// 天気予報（東京地方）を、ブラウザから直接読む（JSON は access-control-allow-origin: * で公開されている）。
// 送るのは観測所の番号と地域の番号だけで、物件や端末の情報は送らない。読めなければ前回の値（端末に 30 分だけ覚える）か「晴れ」。
// 判定は演出のためのおおまかなもの（雨量・日照・気温・湿度から雲量・降水・雪・霧を決める）で、天気の案内には使わない。
// プレビューは #w=rain / #w=snow:0.7 / #w=cloudy / #w=partly / #w=clear / #w=fog で固定できる
import { smoothstep } from "./sun";

export type WeatherKind = "clear" | "partly" | "cloudy" | "rain" | "snow";

export type Weather = {
  kind: WeatherKind;
  /** 雲量 0〜1 */
  cloud: number;
  /** 降水の強さ 0〜1（10 分雨量 3mm で 1） */
  precip: number;
  /** 霧・もや 0〜1 */
  fog: number;
  temp: number | null;
  humidity: number | null;
  /** 風速 m/s */
  wind: number | null;
  /** 観測の時刻（ISO）。固定・不明なら空 */
  at: string;
  source: "jma" | "override" | "none";
};

export const NO_WEATHER: Weather = { kind: "clear", cloud: 0.08, precip: 0, fog: 0, temp: null, humidity: null, wind: null, at: "", source: "none" };

/** アメダス 東京（大手町）と、天気予報の東京都（最初の区域が東京地方） */
export const JMA = {
  base: "https://www.jma.go.jp/bosai",
  station: "44132",
  area: "130000",
} as const;

/** アメダスの 10 分値（使う項目だけ。[値, 品質] の形） */
export type JmaPoint = Partial<Record<"temp" | "humidity" | "sun10m" | "precipitation10m" | "wind", [number, number]>>;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 天気予報のコード（100 晴、200 曇、300 雨、400 雪 …）→ 雲量の目安。「のち」（2桁目が 1）は 15 時以降に後半の天気へ */
export function cloudFromCode(code: string | null, hourJst: number): number | null {
  if (!code || !/^\d{3}$/.test(code)) return null;
  const d1 = code[0];
  const d2 = code[1];
  const d3 = code[2];
  let cloud = d1 === "1" ? 0.2 : d1 === "2" ? 0.75 : 0.95;
  if (d2 === "0" && d3 === "1") cloud = d1 === "1" ? 0.42 : d1 === "2" ? 0.55 : cloud;
  if (d2 === "1" && hourJst >= 15) cloud = d1 === "1" ? 0.7 : d1 === "2" ? 0.35 : d1 === "3" || d1 === "4" ? (d3 === "1" ? 0.35 : 0.8) : cloud;
  return cloud;
}

/** 観測と予報から今の天気を決める（sunAltitude は日照から雲量を読めるか＝昼かの判断に） */
export function fromJma(obs: JmaPoint | null, forecastCode: string | null, at: Date, sunAltitude: number): Weather {
  const hour = jstHours(at);
  const codeCloud = cloudFromCode(forecastCode, hour);
  const temp = obs?.temp?.[0] ?? null;
  const humidity = obs?.humidity?.[0] ?? null;
  const wind = obs?.wind?.[0] ?? null;
  const mm = obs?.precipitation10m?.[0] ?? 0;
  const sun10 = obs?.sun10m?.[0];
  const precip = clamp01(mm / 3);
  let cloud = codeCloud ?? NO_WEATHER.cloud;
  if (sunAltitude > 2 && typeof sun10 === "number") {
    const obsCloud = 1 - clamp01(sun10 / 10);
    cloud = codeCloud === null ? obsCloud : 0.65 * obsCloud + 0.35 * codeCloud;
  }
  if (precip > 0) cloud = Math.max(cloud, 0.9);
  const snow = precip > 0 && ((temp !== null && temp <= 1.5) || forecastCode?.[0] === "4");
  const fog = humidity === null ? 0 : clamp01((humidity - 92) / 10) * 0.7 * (precip > 0 ? 0.6 : 1);
  const kind: WeatherKind = precip > 0 ? (snow ? "snow" : "rain") : cloud >= 0.85 ? "cloudy" : cloud >= 0.4 ? "partly" : "clear";
  return { kind, cloud: Math.round(cloud * 100) / 100, precip: Math.round(precip * 100) / 100, fog: Math.round(fog * 100) / 100, temp, humidity, wind, at: at.toISOString(), source: obs || forecastCode ? "jma" : "none" };
}

/** 日本時間の時（小数） */
export function jstHours(at: Date): number {
  return (((at.getTime() + 9 * 3600e3) % 86400e3) + 86400e3) % 86400e3 / 3600e3;
}

/** #w=rain / #w=snow:0.7 / #w=cloudy / #w=partly / #w=clear / #w=fog（プレビュー用） */
export function parseWeatherOverride(hash: string): Weather | null {
  const m = hash.replace(/^#/, "").match(/(?:^|&)w=([^&]+)/);
  if (!m) return null;
  const [kind, numRaw] = decodeURIComponent(m[1]).split(":");
  const n = numRaw === undefined ? NaN : Number(numRaw);
  const amount = Number.isFinite(n) ? clamp01(n) : 0.5;
  const base = { ...NO_WEATHER, source: "override" as const, at: "" };
  switch (kind) {
    case "clear":
      return { ...base, kind: "clear", cloud: 0.05 };
    case "partly":
      return { ...base, kind: "partly", cloud: Number.isFinite(n) ? amount : 0.5 };
    case "cloudy":
      return { ...base, kind: "cloudy", cloud: Number.isFinite(n) ? Math.max(0.85, amount) : 0.97 };
    case "rain":
      return { ...base, kind: "rain", cloud: 0.97, precip: amount, fog: 0.25 };
    case "snow":
      return { ...base, kind: "snow", cloud: 0.95, precip: amount, fog: 0.3, temp: 0 };
    case "fog":
      return { ...base, kind: "cloudy", cloud: 0.9, fog: Number.isFinite(n) ? amount : 0.7, humidity: 99 };
    default:
      return null;
  }
}

const CACHE_KEY = "michilu:weather";
const CACHE_MS = 30 * 60e3;

export function loadCachedWeather(now = Date.now()): Weather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { w?: Weather; t?: number };
    return v && v.w && typeof v.t === "number" && now - v.t <= CACHE_MS ? v.w : null;
  } catch {
    return null;
  }
}

export function saveCachedWeather(w: Weather, now = Date.now()): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ w, t: now }));
  } catch {
    // 保存できなくてもよい
  }
}

/** アメダスの点のファイル名（3 時間ごと）。latest_time.txt の時刻から */
export function pointFile(latest: string): { file: string; prev: string } | null {
  const m = latest.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h] = m;
  const block = Math.floor(Number(h) / 3) * 3;
  const file = `${y}${mo}${d}_${String(block).padStart(2, "0")}.json`;
  // 区切りの直後はまだ無いことがあるので、ひとつ前の 3 時間も
  const prevDate = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), block - 3));
  const prev = `${prevDate.getUTCFullYear()}${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}${String(prevDate.getUTCDate()).padStart(2, "0")}_${String(prevDate.getUTCHours()).padStart(2, "0")}.json`;
  return { file, prev };
}

/** 点のファイル（{ "20261026031000": {...}, ... }）から、最新の観測 */
export function latestPoint(data: Record<string, JmaPoint>): JmaPoint | null {
  const keys = Object.keys(data).sort();
  return keys.length ? data[keys[keys.length - 1]] : null;
}

/** 天気予報の JSON から、at の日の東京地方の天気コード */
export function forecastCodeFor(data: unknown, at: Date): string | null {
  try {
    const first = (data as { timeSeries: { timeDefines: string[]; areas: { weatherCodes: string[] }[] }[] }[])[0];
    const ts = first.timeSeries[0];
    const day = new Date(at.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
    let idx = ts.timeDefines.findIndex((t) => t.slice(0, 10) === day);
    if (idx < 0) idx = 0;
    return ts.areas[0].weatherCodes[idx] ?? null;
  } catch {
    return null;
  }
}

/** 気象庁から今の天気を読む（失敗したら null） */
export async function fetchWeather(at: Date, sunAltitude: number, fetchFn: typeof fetch = fetch): Promise<Weather | null> {
  const get = async (url: string) => {
    const r = await fetchFn(url, { cache: "no-store", signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8000) : undefined });
    if (!r.ok) throw new Error(String(r.status));
    return r;
  };
  try {
    const latest = (await (await get(`${JMA.base}/amedas/data/latest_time.txt`)).text()).trim();
    const names = pointFile(latest);
    let obs: JmaPoint | null = null;
    if (names) {
      for (const f of [names.file, names.prev]) {
        try {
          obs = latestPoint((await (await get(`${JMA.base}/amedas/data/point/${JMA.station}/${f}`)).json()) as Record<string, JmaPoint>);
          if (obs) break;
        } catch {
          // 次の候補
        }
      }
    }
    let code: string | null = null;
    try {
      code = forecastCodeFor(await (await get(`${JMA.base}/forecast/data/forecast/${JMA.area}.json`)).json(), at);
    } catch {
      // 予報が読めなくても観測だけで決める
    }
    if (!obs && !code) return null;
    return fromJma(obs, code, at, sunAltitude);
  } catch {
    return null;
  }
}

/** 窓の明かり：時刻ごとに点いている割合（日本時間の時。夕方〜21時は全部、深夜は 3 割ほど、朝は増える） */
export function occupancy(hourJst: number): number {
  const pts: [number, number][] = [
    [0, 0.55],
    [1, 0.42],
    [2, 0.32],
    [3, 0.28],
    [4, 0.28],
    [5, 0.36],
    [6, 0.5],
    [7, 0.62],
    [8, 0.75],
    [9, 0.8],
    [16, 0.8],
    [17, 0.9],
    [18, 1],
    [21, 1],
    [22, 0.92],
    [23, 0.75],
    [24, 0.55],
  ];
  const h = ((hourJst % 24) + 24) % 24;
  for (let i = 0; i < pts.length - 1; i++) {
    const [h0, v0] = pts[i];
    const [h1, v1] = pts[i + 1];
    if (h >= h0 && h <= h1) return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
  }
  return 0.55;
}

/** 窓の明かりが見える度合い（太陽の高度。明るい昼は点いていても見えない） */
export function lightsVisibility(sunAltitude: number): number {
  return smoothstep(4, -6, sunAltitude);
}

/** 東京タワーのライトアップ（日没〜24 時。0 時に消え、次の日没まで点かない。昼は見えないので「午後かどうか」で足りる） */
export function towerLit(at: Date): boolean {
  return jstHours(at) >= 12;
}

/** 画面の窓の明かりの強さ（見える度合い × 点いている割合） */
export function lightsLevel(at: Date, sunAltitude: number): number {
  return lightsVisibility(sunAltitude) * occupancy(jstHours(at));
}

/** 今の天気（固定 → 直近に読めた値 → 端末に覚えた値 → 晴れ） */
let live: Weather | null = null;
export function currentWeather(hash = typeof location === "undefined" ? "" : location.hash): Weather {
  return parseWeatherOverride(hash) ?? live ?? (typeof localStorage === "undefined" ? null : loadCachedWeather()) ?? NO_WEATHER;
}
export function setLiveWeather(w: Weather | null): void {
  live = w;
  if (w) saveCachedWeather(w);
}
