// 本物の雲と雨：気象庁のひまわり画像（可視 B03・赤外 B13。日本域は 2.5 分ごと、公開は約 8 分遅れ）と
// 高解像度降水ナウキャスト（雨雲レーダー。5 分ごと）、雷ナウキャスト（10 分ごと）を、ブラウザから直接読む（CORS 公開）。
//  - 雲の場：東京のまわり（経度 135〜140.6°、緯度 32〜36.6° ＝ ひまわりの z6 タイル 1 枚、約 2km/画素）の
//    低い雲（R）・高い雲（G）・明るさ（B）。昼は可視の反射率で濃さ、赤外の温度で高さ。夜は赤外だけ（地面より冷たい所が雲）
//  - 雨の場：東京の西〜南西 180km（ナウキャストの z8 タイル 2×2、約 0.6km/画素）の雨の強さ（mm/h）
//  - 雷：発雷の可能性がある所の、カメラから見た向きと距離
// 送るのはタイルの番号だけ。失敗したら前の値（無ければ、雲量だけの作り物の雲に戻る）
import type { Weather } from "./weather";

export const HIMAWARI = { base: "https://www.jma.go.jp/bosai/himawari/data/satimg", area: "jp", z: 6, x: 56, y: 25, stepSec: 150, lagMin: 8 } as const;
export const NOWCAST = { base: "https://www.jma.go.jp/bosai/jmatile/data/nowc", z: 8, x0: 226, y0: 100, n: 2 } as const;
/** カメラ（汐留の上空。lib/app/sun.ts の HOME_CAMERA の視点） */
export const CAM_LL: { lat: number; lon: number } = { lat: 35.664, lon: 139.7616 };

export type Bounds = { lonW: number; lonE: number; latN: number; latS: number; mercN: number; mercS: number };
/** 緯度（度）→ メルカトルの y（ラジアン） */
export const mercY = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360));
const R = Math.PI / 180;

/** Web メルカトルのタイル（z, x, y。n 枚分）の範囲 */
export function tileBounds(z: number, x: number, y: number, n = 1): Bounds {
  const N = 2 ** z;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / N))) * 180) / Math.PI;
  return { lonW: (x / N) * 360 - 180, lonE: ((x + n) / N) * 360 - 180, latN: lat(y), latS: lat(y + n), mercN: mercY(lat(y)), mercS: mercY(lat(y + n)) };
}

/** 経度・緯度 → タイル画像の画素（0〜size） */
export function toPixel(b: Bounds, size: number, lon: number, lat: number): [number, number] {
  return [((lon - b.lonW) / (b.lonE - b.lonW)) * size, ((mercY(lat) - b.mercN) / (b.mercS - b.mercN)) * size];
}

/** UTC の "YYYYMMDDhhmmss" */
export function fmtTime(d: Date): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/** ひまわりの候補の時刻（新しい順）。公開の遅れを見込んで「今 − 8 分」から 2.5 分刻みでさかのぼる。#sat=YYYYMMDDhhmmss（UTC）で固定できる */
export function satTimes(now: Date, tries = 6, hash = typeof location === "undefined" ? "" : location.hash): string[] {
  const m = hash.replace(/^#/, "").match(/(?:^|&)sat=(\d{14})/);
  if (m) return [m[1]];
  const step = HIMAWARI.stepSec * 1000;
  const start = Math.floor((now.getTime() - HIMAWARI.lagMin * 60e3) / step) * step;
  return Array.from({ length: tries }, (_, i) => fmtTime(new Date(start - i * step)));
}

/** "YYYYMMDDhhmmss"（UTC）→ Date */
export function parseTime(t: string): Date {
  return new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12), +t.slice(12, 14)));
}

export type Flash = { k: number; dir: [number, number] };
/** 稲光：発雷域があるとき、22 秒に 1 回ほど、その向きで 2 回ちらつく（距離が遠いほど弱い。150km より遠くは出さない） */
export function flashAt(sec: number, th: Thunder | null): Flash {
  if (!th || !th.on || th.distKm > 150) return { k: 0, dir: [0, 1] };
  const period = 22;
  const idx = Math.floor(sec / period);
  const h = ((Math.sin(idx * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
  const t = sec - idx * period - h * (period - 2);
  let k = 0;
  if (t >= 0 && t < 0.9) k = t < 0.07 ? 1 : t < 0.14 ? 0.35 : t < 0.2 ? 0.8 : 0.5 * Math.exp(-(t - 0.2) / 0.12);
  const b = (th.bearing * Math.PI) / 180;
  return { k: Math.round(k * Math.max(0.25, 1 - th.distKm / 150) * 1000) / 1000, dir: [Math.sin(b), Math.cos(b)] };
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export type CloudField = {
  /** RGBA（size×size）：R 低い雲の濃さ、G 高い雲の濃さ、B 明るさ（可視の反射率。夜は赤外） */
  data: Uint8ClampedArray;
  size: number;
  bounds: Bounds;
  /** カメラのまわり約 25km の雲量（0〜1） */
  fraction: number;
  /** 夜は赤外だけなので、低い雲を見落とすことがある（予報の雲量で補う） */
  night: boolean;
  /** 観測の時刻（UTC の文字列）と、読んだ時刻 */
  time: string;
  fetchedAt: number;
};

/**
 * 可視（alb。夜は null）と赤外（ir。明るいほど冷たい＝高い）の画素値（0〜255、size×size）から雲の場を作る。
 * 昼：濃さ＝可視の反射率、高さ＝赤外。夜：地面（いちばん暖かい 1 割）より冷たい所を雲とし、さらに冷たい所を高い雲とする
 */
export function cloudField(ir: Uint8ClampedArray | Uint8Array, alb: Uint8ClampedArray | Uint8Array | null, size: number, bounds: Bounds, time: string, camera = CAM_LL): CloudField {
  const n = size * size;
  const out = new Uint8ClampedArray(n * 4);
  let base = 0;
  if (!alb) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[ir[i]]++;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= n * 0.1) {
        base = v;
        break;
      }
    }
  }
  const [cx, cy] = toPixel(bounds, size, camera.lon, camera.lat);
  let fsum = 0;
  let fcnt = 0;
  for (let i = 0; i < n; i++) {
    const t = ir[i];
    let dens: number;
    let high: number;
    if (alb) {
      dens = smooth(85, 185, alb[i]);
      high = smooth(130, 175, t);
    } else {
      dens = smooth(base + 10, base + 40, t);
      high = smooth(base + 45, base + 85, t);
    }
    const low = dens * (1 - high);
    const hi = dens * high;
    out[i * 4] = Math.round(low * 255);
    out[i * 4 + 1] = Math.round(hi * 255);
    out[i * 4 + 2] = alb ? alb[i] : Math.min(255, Math.round(80 + dens * 160));
    out[i * 4 + 3] = 255;
    const px = i % size;
    const py = (i - px) / size;
    if ((px - cx) ** 2 + (py - cy) ** 2 <= 12 * 12) {
      fsum += dens;
      fcnt++;
    }
  }
  return { data: out, size, bounds, fraction: fcnt ? Math.round((fsum / fcnt) * 100) / 100 : 0, night: !alb, time, fetchedAt: Date.now() };
}

/** 高解像度降水ナウキャストの色 → mm/h（透明は 0） */
export const RAIN_PALETTE: [[number, number, number], number][] = [
  [[242, 242, 255], 0.5],
  [[160, 210, 255], 3],
  [[33, 140, 255], 7.5],
  [[0, 65, 255], 15],
  [[250, 245, 0], 25],
  [[255, 153, 0], 40],
  [[255, 40, 0], 65],
  [[180, 0, 104], 90],
];
export function rainMmh(r: number, g: number, b: number, a: number): number {
  if (a < 128) return 0;
  let best = 0;
  let bd = Infinity;
  for (const [[pr, pg, pb], mm] of RAIN_PALETTE) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bd) {
      bd = d;
      best = mm;
    }
  }
  return bd < 60 * 60 ? best : 0;
}

export type RainField = {
  /** R = mm/h × 2.5（0〜250）、size×size */
  data: Uint8ClampedArray;
  size: number;
  bounds: Bounds;
  /** カメラの位置の雨（mm/h。3×3 画素の平均） */
  mmhAtCamera: number;
  /** 画面に入る範囲（西〜南西 100km）に雨があるか */
  any: boolean;
  time: string;
  fetchedAt: number;
};

/** ナウキャストのタイル（RGBA、256×256）を n×n 枚並べて雨の場にする。tiles は [x, y, rgba] */
export function rainField(tiles: { dx: number; dy: number; rgba: Uint8ClampedArray | Uint8Array }[], n: number, bounds: Bounds, time: string, camera = CAM_LL): RainField {
  const size = 256 * n;
  const out = new Uint8ClampedArray(size * size * 4);
  let any = false;
  for (const t of tiles) {
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const mm = rainMmh(t.rgba[i], t.rgba[i + 1], t.rgba[i + 2], t.rgba[i + 3]);
        const o = ((t.dy * 256 + y) * size + t.dx * 256 + x) * 4;
        out[o] = Math.min(250, Math.round(mm * 2.5));
        out[o + 3] = 255;
        if (mm > 0) any = true;
      }
    }
  }
  const [cx, cy] = toPixel(bounds, size, camera.lon, camera.lat);
  let s = 0;
  let c = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.round(cx) + dx;
      const y = Math.round(cy) + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) {
        s += out[(y * size + x) * 4] / 2.5;
        c++;
      }
    }
  return { data: out, size, bounds, mmhAtCamera: c ? Math.round((s / c) * 10) / 10 : 0, any, time, fetchedAt: Date.now() };
}

export type Thunder = { on: boolean; /** いちばん近い発雷域の向き（方位、度）と距離（km） */ bearing: number; distKm: number; time: string; fetchedAt: number };

/** 雷ナウキャストのタイル（透明でない画素＝発雷の可能性）から、いちばん近い発雷域 */
export function thunderInfo(tiles: { dx: number; dy: number; rgba: Uint8ClampedArray | Uint8Array }[], n: number, bounds: Bounds, time: string, camera = CAM_LL): Thunder {
  const size = 256 * n;
  const [cx, cy] = toPixel(bounds, size, camera.lon, camera.lat);
  const kmPerPxX = ((bounds.lonE - bounds.lonW) * 111.32 * Math.cos(camera.lat * R)) / size;
  const kmPerPxY = ((bounds.latN - bounds.latS) * 111.32) / size;
  let best: [number, number, number] | null = null;
  for (const t of tiles) {
    for (let y = 0; y < 256; y += 2) {
      for (let x = 0; x < 256; x += 2) {
        if (t.rgba[(y * 256 + x) * 4 + 3] < 128) continue;
        const px = t.dx * 256 + x;
        const py = t.dy * 256 + y;
        const ex = (px - cx) * kmPerPxX;
        const ny = (cy - py) * kmPerPxY;
        const d = Math.hypot(ex, ny);
        if (!best || d < best[0]) best = [d, ex, ny];
      }
    }
  }
  if (!best) return { on: false, bearing: 0, distKm: 0, time, fetchedAt: Date.now() };
  return { on: true, bearing: Math.round(((Math.atan2(best[1], best[2]) * 180) / Math.PI + 360) % 360), distKm: Math.round(best[0]), time, fetchedAt: Date.now() };
}

/** 雲が風で流れる分（km）。地上の風の 2 倍を雲の高さの風とみなす。風向は 16 方位の番号（1 北北東 … 16 北） */
export function cloudDrift(w: Weather, elapsedSec: number): [number, number] {
  if (w.wind === null || w.windDir === null || w.windDir === undefined || w.windDir === 0) return [0, 0];
  const to = (w.windDir * 22.5 + 180) * R;
  const v = (w.wind * 2 * elapsedSec) / 1000;
  return [Math.round(Math.sin(to) * v * 1000) / 1000, Math.round(Math.cos(to) * v * 1000) / 1000];
}

// ---- ブラウザで読む ----
type Rgba = { rgba: Uint8ClampedArray; w: number; h: number };
async function loadRgba(url: string): Promise<Rgba | null> {
  const r = await fetch(url, { cache: "no-store", signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(10000) : undefined });
  if (!r.ok) return null;
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement("canvas");
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  return { rgba: img.data, w: img.width, h: img.height };
}
const channel = (p: Rgba) => {
  const out = new Uint8ClampedArray(p.w * p.h);
  for (let i = 0; i < out.length; i++) out[i] = p.rgba[i * 4];
  return out;
};

/** ひまわりの雲の場（最新の時刻を探す）。sunAltitude が 3° より上なら可視も使う */
export async function fetchCloudField(now: Date, sunAltitude: number): Promise<CloudField | null> {
  const { base, area, z, x, y } = HIMAWARI;
  const bounds = tileBounds(z, x, y);
  for (const t of satTimes(now, 6)) {
    try {
      const ir = await loadRgba(`${base}/${t}/${area}/${t}/B13/TBB/${z}/${x}/${y}.jpg`);
      if (!ir) continue;
      let alb: Rgba | null = null;
      if (sunAltitude > 3) alb = await loadRgba(`${base}/${t}/${area}/${t}/B03/ALBD/${z}/${x}/${y}.jpg`);
      return cloudField(channel(ir), alb ? channel(alb) : null, ir.w, bounds, t);
    } catch {
      // 次の候補
    }
  }
  return null;
}

async function latestBase(index: string, element: string): Promise<string | null> {
  try {
    const r = await fetch(`${NOWCAST.base}/${index}`, { cache: "no-store", signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8000) : undefined });
    if (!r.ok) return null;
    const list = (await r.json()) as { basetime: string; validtime: string; elements?: string[] }[];
    // 最新の実況（basetime == validtime で、その要素があるもの）
    const now = list.find((e) => e.basetime === e.validtime && (!e.elements || e.elements.includes(element)));
    return now?.basetime ?? null;
  } catch {
    return null;
  }
}

async function loadTiles(path: (t: string) => string, t: string) {
  const { x0, y0, n } = NOWCAST;
  const tiles: { dx: number; dy: number; rgba: Uint8ClampedArray }[] = [];
  await Promise.all(
    Array.from({ length: n * n }, async (_, i) => {
      const dx = i % n;
      const dy = (i - dx) / n;
      const p = await loadRgba(path(`${x0 + dx}/${y0 + dy}`).split("{t}").join(t));
      if (p) tiles.push({ dx, dy, rgba: p.rgba });
    }),
  );
  return tiles;
}

/** 雨雲レーダー（高解像度降水ナウキャストの実況） */
export async function fetchRainField(): Promise<RainField | null> {
  const t = await latestBase("targetTimes_N1.json", "hrpns");
  if (!t) return null;
  try {
    const tiles = await loadTiles((xy) => `${NOWCAST.base}/{t}/none/{t}/surf/hrpns/${NOWCAST.z}/${xy}.png`, t);
    if (!tiles.length) return null;
    return rainField(tiles, NOWCAST.n, tileBounds(NOWCAST.z, NOWCAST.x0, NOWCAST.y0, NOWCAST.n), t);
  } catch {
    return null;
  }
}

/** 雷ナウキャスト（実況） */
export async function fetchThunder(): Promise<Thunder | null> {
  const t = await latestBase("targetTimes_N3.json", "thns");
  if (!t) return null;
  try {
    const tiles = await loadTiles((xy) => `${NOWCAST.base}/{t}/none/{t}/surf/thns/${NOWCAST.z}/${xy}.png`, t);
    return thunderInfo(tiles, NOWCAST.n, tileBounds(NOWCAST.z, NOWCAST.x0, NOWCAST.y0, NOWCAST.n), t);
  } catch {
    return null;
  }
}

/** 今の雲・雨・雷（読めたもの。古いものは捨てる） */
export type LiveSky = { cloud: CloudField | null; rain: RainField | null; thunder: Thunder | null };
const live: LiveSky = { cloud: null, rain: null, thunder: null };
export function currentSky(now = Date.now()): LiveSky {
  return {
    cloud: live.cloud && now - live.cloud.fetchedAt < 40 * 60e3 ? live.cloud : null,
    rain: live.rain && now - live.rain.fetchedAt < 30 * 60e3 ? live.rain : null,
    thunder: live.thunder && now - live.thunder.fetchedAt < 30 * 60e3 ? live.thunder : null,
  };
}
export function setLiveSky(v: Partial<LiveSky>): void {
  if (v.cloud !== undefined && v.cloud) live.cloud = v.cloud;
  if (v.rain !== undefined && v.rain) live.rain = v.rain;
  if (v.thunder !== undefined && v.thunder) live.thunder = v.thunder;
}

/** 見る向き v が高さ h（km）の層に当たるまでの距離（km。地球の丸み込み。シェーダーの layerDist と同じ） */
export function layerDist(v: [number, number, number], h: number, h0 = 0.26): number {
  const Re = 6371;
  const oz = Re + h0;
  const b = oz * v[2];
  const c = oz * oz - (Re + h) * (Re + h);
  const q = b * b - c;
  if (q < 0) return 1e5;
  return -b + Math.sqrt(q);
}

/** 雲の場の画素をなめらかに読む（0〜1）。ch: 0 低い雲、1 高い雲 */
export function sampleField(field: CloudField, x: number, y: number, ch: 0 | 1 | 2, camera = CAM_LL): number {
  const lat = camera.lat + y / 111.32;
  const lon = camera.lon + x / (111.32 * Math.cos(camera.lat * R));
  const [px, py] = toPixel(field.bounds, field.size, lon, lat);
  const n = field.size;
  const fx = Math.min(n - 1.001, Math.max(0, px - 0.5));
  const fy = Math.min(n - 1.001, Math.max(0, py - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const ax = fx - x0;
  const ay = fy - y0;
  const at = (xx: number, yy: number) => field.data[(yy * n + xx) * 4 + ch] / 255;
  return at(x0, y0) * (1 - ax) * (1 - ay) + at(x0 + 1, y0) * ax * (1 - ay) + at(x0, y0 + 1) * (1 - ax) * ay + at(x0 + 1, y0 + 1) * ax * ay;
}

/**
 * 太陽が雲にどれだけ隠れているか（0 隠れる〜1 見える）。太陽の向きへ低い層・高い層をたどって雲の場を読む
 * （シェーダーの clouds() と同じ式。模様は平均値で）。衛星が無いときは雲量だけから
 */
export function sunVisibility(field: CloudField | null, sun: [number, number, number], cloud: number, heights: [number, number], drift: [number, number] = [0, 0], extra = 0, camera = CAM_LL): number {
  if (sun[2] <= 0.004) return 1;
  if (!field) return Math.round((1 - 0.75 * cloud) * 1000) / 1000;
  const dens = (h: number, ch: 0 | 1, add: number) => {
    const t = layerDist(sun, h);
    const v = sampleField(field, sun[0] * t - drift[0], sun[1] * t - drift[1], ch, camera) + add;
    return smooth(0.1, 0.55, v);
  };
  return Math.round((1 - dens(heights[0], 0, extra)) * (1 - dens(heights[1], 1, 0)) * 1000) / 1000;
}

/** 衛星の雲量と予報の雲量を合わせる（昼は衛星、夜は赤外で見落とす低い雲を予報で補う） */
export function mergeCloud(forecastCloud: number, field: CloudField | null): number {
  if (!field) return forecastCloud;
  if (!field.night) return Math.round(field.fraction * 100) / 100;
  return Math.round(Math.max(field.fraction, forecastCloud * 0.85) * 100) / 100;
}

