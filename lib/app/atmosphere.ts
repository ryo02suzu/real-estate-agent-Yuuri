// 空をコードで描くための大気の計算（太陽の光が空気で散らばる様子＝単一散乱）。時間連動ヘッダーの空（components/app/sky-canvas.tsx の
// シェーダー）と、CSS の色（lib/app/sky-vars.ts）の両方がこの式を使う。写真は使わない。
//  - 地球を半径 6371km の球、大気を 80km の厚さとして、見る方向の光線に沿って 12 点で「太陽の光がそこまで届く量 × 散らばって目に向かう量」を足す
//  - レイリー散乱（空の青・夕焼けの赤）、ミー散乱（太陽のまわりの白いにじみ、霞）、オゾンの吸収（薄明の深い青紫）
//  - 日没後も、高い所の空気にはまだ日が当たるので、薄明の光が自然に出る。夜は街の明かりの照り返しと星・月（コードで描く）
// 値は km。色は線形 RGB（露出とガンマは tone() で）
export type Vec3 = [number, number, number];

export const ATMOS = {
  /** 地球の半径と大気の上端（km）、見る人の高さ（高いビルから） */
  Re: 6371,
  Ra: 6371 + 80,
  h0: 0.25,
  /** レイリー散乱の係数（R,G,B。/km）とスケールハイト（km） */
  betaR: [5.8e-3, 13.5e-3, 33.1e-3] as Vec3,
  HR: 8,
  /** ミー散乱（霞）。都市の空気なので少し濃い。g は前方への偏り */
  betaM: 4.0e-3,
  HM: 1.2,
  g: 0.76,
  mieExt: 1.1,
  /** オゾンの吸収（R,G,B。/km。高さ 25km を中心に ±15km の山形） */
  betaO: [0.65e-3, 1.881e-3, 0.085e-3] as Vec3,
  /** 太陽の明るさ（露出の単位） */
  sun: 20,
  /**
   * 露出（カメラの自動露出・目の順応に相当）。太陽の高度ごとの節で、間は対数で補間する。
   * 昼は空が飛ばないように低く、薄明・夜は暗い空が見えるように高く
   */
  exposureKnots: [
    [10, 1.1],
    [0, 2.4],
    [-6, 8],
    [-12, 24],
  ] as [number, number][],
  /**
   * 何度も散らばった光（単一散乱では足りない分）の近似：見る方向の空気が厚いほど、空の平均の色で薄く光る。
   * 色は太陽の光が低い層（6km）と高い層（18km）に届く色を混ぜる（夕方は橙〜桃色の霞、夜明けの反対側はうすい桃色）
   */
  msColor: [0.3, 0.5, 1.0] as Vec3,
  msStrength: 0.2,
  msLow: 6,
  msHigh: 18,
  msLowWeight: 0.65,
  /** 光線上の点の数と、各点から太陽へ向かう光の点の数 */
  samples: 12,
  lightSamples: 5,
  /** 太陽と月の見かけの半径（度）。月は小さすぎて点になるので少し大きく描く */
  sunRadius: 0.27,
  moonRadius: 0.26 * 3.0,
  /** 夜の空の地（空気の微かな光と街の明かりの照り返し。露出をかけた後の線形の明るさ） */
  nightZenith: [0.012, 0.018, 0.045] as Vec3,
  nightHorizon: [0.095, 0.052, 0.028] as Vec3,
  nightHorizonFalloff: 6,
} as const;

const R = Math.PI / 180;

/** 高度・方位（度）→ 向き（x 東、y 北、z 上） */
export function dirFromAltAz(altitude: number, azimuth: number): Vec3 {
  const a = altitude * R;
  const z = azimuth * R;
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 原点 o から向き d の光線と、中心が原点の球（半径 r）との交点までの距離（遠い方）。交わらなければ -1 */
function hitFar(o: Vec3, d: Vec3, r: number): number {
  const b = dot(o, d);
  const c = dot(o, o) - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  return -b + Math.sqrt(disc);
}
/** 同じく近い方（手前。無ければ -1） */
function hitNear(o: Vec3, d: Vec3, r: number): number {
  const b = dot(o, d);
  const c = dot(o, o) - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}

/** 高さ h（km）での空気・霞・オゾンの密度（地上を 1 とする） */
function densities(h: number): Vec3 {
  return [Math.exp(-h / ATMOS.HR), Math.exp(-h / ATMOS.HM), Math.max(0, 1 - Math.abs(h - 25) / 15)];
}

/** 点 p から太陽の向き s へ、大気の上端までの光学的厚さ（R,G,B の吸収・散乱の合計）。地面にさえぎられたら null */
function depthToSun(p: Vec3, s: Vec3): Vec3 | null {
  if (hitNear(p, s, ATMOS.Re) > 0) return null;
  const t = hitFar(p, s, ATMOS.Ra);
  const n = ATMOS.lightSamples;
  const step = t / n;
  let dR = 0;
  let dM = 0;
  let dO = 0;
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) * step;
    const q: Vec3 = [p[0] + s[0] * k, p[1] + s[1] * k, p[2] + s[2] * k];
    const h = Math.sqrt(dot(q, q)) - ATMOS.Re;
    const [a, b, c] = densities(h);
    dR += a * step;
    dM += b * step;
    dO += c * step;
  }
  return [0, 1, 2].map((i) => ATMOS.betaR[i] * dR + ATMOS.betaM * ATMOS.mieExt * dM + ATMOS.betaO[i] * dO) as Vec3;
}

/**
 * 見る向き v（単位ベクトル）の空の放射輝度（線形 RGB。太陽本体・月・星は含まない）。
 * 太陽の向き s。地面に向かう光線は、地面までの空気の散乱だけ
 */
export function radiance(v: Vec3, s: Vec3): Vec3 {
  const o: Vec3 = [0, 0, ATMOS.Re + ATMOS.h0];
  const ground = hitNear(o, v, ATMOS.Re);
  const far = ground > 0 ? ground : hitFar(o, v, ATMOS.Ra);
  const n = ATMOS.samples;
  const step = far / n;
  const mu = dot(v, s);
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const g = ATMOS.g;
  const pM = ((3 / (8 * Math.PI)) * ((1 - g * g) * (1 + mu * mu))) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  let tR = 0;
  let tM = 0;
  let tO = 0;
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) * step;
    const p: Vec3 = [o[0] + v[0] * k, o[1] + v[1] * k, o[2] + v[2] * k];
    const h = Math.sqrt(dot(p, p)) - ATMOS.Re;
    const [a, b, c] = densities(h);
    tR += a * step;
    tM += b * step;
    tO += c * step;
    const ds = depthToSun(p, s);
    if (!ds) continue;
    for (let j = 0; j < 3; j++) {
      const tau = ds[j] + ATMOS.betaR[j] * tR + ATMOS.betaM * ATMOS.mieExt * tM + ATMOS.betaO[j] * tO;
      const tr = Math.exp(-tau);
      out[j] += tr * (ATMOS.betaR[j] * a * pR + ATMOS.betaM * b * pM) * step;
    }
  }
  // 何度も散らばった光の近似：見る方向の空気の厚さに応じて、空の平均の色で光る。色は低い層と高い層に届く太陽の光
  const lit = msLight(s);
  for (let j = 0; j < 3; j++) {
    const thick = 1 - Math.exp(-ATMOS.betaR[j] * tR - ATMOS.betaM * ATMOS.mieExt * tM);
    out[j] += ATMOS.msStrength * ATMOS.msColor[j] * thick * lit[j];
  }
  return out.map((x) => x * ATMOS.sun) as Vec3;
}

/** 太陽の高度（度）ごとの露出（節の間は対数で補間） */
export function exposureFor(sunAltitude: number): number {
  const k = ATMOS.exposureKnots;
  if (sunAltitude >= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) {
    const [a0, e0] = k[i];
    const [a1, e1] = k[i + 1];
    if (sunAltitude <= a0 && sunAltitude >= a1) {
      const t = (a0 - sunAltitude) / (a0 - a1);
      return Math.exp(Math.log(e0) * (1 - t) + Math.log(e1) * t);
    }
  }
  return k[k.length - 1][1];
}

/** 何度も散らばった光の色のもと：低い層（msLow）と高い層（msHigh）に届く太陽の光（0〜1） */
function msLight(s: Vec3): Vec3 {
  const lo = depthToSun([0, 0, ATMOS.Re + ATMOS.msLow], s);
  const hi = depthToSun([0, 0, ATMOS.Re + ATMOS.msHigh], s);
  const w = ATMOS.msLowWeight;
  return [0, 1, 2].map((j) => w * (lo ? Math.exp(-lo[j]) : 0) + (1 - w) * (hi ? Math.exp(-hi[j]) : 0)) as Vec3;
}

/** 太陽の光が、見る人の所までどれだけ届くか（0〜1。R,G,B）。太陽本体の色と、街に当たる光の色に */
export function sunTransmittance(s: Vec3): Vec3 {
  const o: Vec3 = [0, 0, ATMOS.Re + ATMOS.h0];
  const d = depthToSun(o, s);
  return d ? (d.map((x) => Math.exp(-x)) as Vec3) : [0, 0, 0];
}

/** 夜の空の地（街の明かりの照り返しは地平線の近くで強い）。線形の放射輝度 */
export function nightBase(elevationDeg: number): Vec3 {
  const f = Math.exp(-Math.max(0, elevationDeg) / ATMOS.nightHorizonFalloff);
  return [0, 1, 2].map((i) => ATMOS.nightZenith[i] + ATMOS.nightHorizon[i] * f) as Vec3;
}

/** 露出をかけた後の線形の明るさ → 画面の 0〜255（ガンマ 2.2） */
export function tone(c: Vec3): Vec3 {
  return c.map((x) => Math.round(255 * Math.pow(1 - Math.exp(-Math.max(0, x)), 1 / 2.2))) as Vec3;
}

/** 露出をかけた後の線形の明るさ（太陽本体・月・星は含まない）。見る向き・太陽の向き・太陽の高度（露出の決定に） */
export function skyLinear(v: Vec3, s: Vec3, sunAltitude: number): Vec3 {
  const L = radiance(v, s);
  const e = exposureFor(sunAltitude);
  const elev = Math.asin(Math.max(-1, Math.min(1, v[2]))) / R;
  const nb = nightBase(elev);
  return [L[0] * e + nb[0], L[1] * e + nb[1], L[2] * e + nb[2]];
}

/** 空の色（太陽本体・月・星は含まない）。画面の 0〜255 */
export function skyColor(v: Vec3, s: Vec3, sunAltitude: number): Vec3 {
  return tone(skyLinear(v, s, sunAltitude));
}

/** 画面に描く光（0〜1。露出・ガンマ前）の相対輝度 */
export const luminanceLinear = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
