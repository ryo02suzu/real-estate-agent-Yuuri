// ホームの街を照らす光（WebGL のシェーダーに渡す値）。空の色と同じ大気の式（lib/app/atmosphere.ts）から：
//  太陽の直射（届く光の色 × 露出）と、空からの光（向きごとの強さを 1 次の球面調和で近似。夕方は西を向いた壁が橙に、昼は屋根が明るい）。
//  曇りは空からの光を灰色の一様な光に寄せる（直射は雲の影でさえぎる）。夜は街明かりの照り返し（ほのかな橙）を足す
import { ATMOS, CLEAN_AIR, exposureFor, nightBase, nightExposureRatio, radiance, sunTransmittance, twilightTint, type AirParams, type Vec3 } from "./atmosphere";
import { smoothstep } from "./sun";

export type SH = [Vec3, Vec3, Vec3, Vec3];

/** 街の地面と建物の照り返しの反射率（アスファルト・コンクリート・タイル。少し暖かい灰色） */
const GROUND: Vec3 = [0.17, 0.16, 0.145];

/** 球の上にほぼ均等に置いた向き（フィボナッチ格子） */
function sphere(n: number): Vec3[] {
  const out: Vec3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    out.push([Math.cos(ga * i) * r, Math.sin(ga * i) * r, z]);
  }
  return out;
}
const DIRS = sphere(64);

/**
 * 面の向き n が受ける空からの光（露出をかけた放射照度）を E(n) = c0 + c1·n.x + c2·n.y + c3·n.z で近似した係数。
 * 地面からの照り返し（反射率 0.16 ほどの暖かい灰色）も含む。cloud（0〜1）が大きいほど灰色の一様な光に寄せる
 */
export function skyIrradianceSH(sun: Vec3, sunAltitude: number, cloud: number, air: AirParams = CLEAN_AIR): SH {
  const e = exposureFor(sunAltitude);
  const glow = air.glow * nightExposureRatio(sunAltitude);
  const L: Vec3[] = [];
  let upSum: Vec3 = [0, 0, 0];
  let upN = 0;
  for (const d of DIRS) {
    if (d[2] > 0.02) {
      const r = radiance(d, sun, air.aero);
      const el = (Math.asin(d[2]) * 180) / Math.PI;
      const t = twilightTint([r[0] * e, r[1] * e, r[2] * e], el, sunAltitude);
      const nb = nightBase(el, glow);
      const v: Vec3 = [t[0] + nb[0], t[1] + nb[1], t[2] + nb[2]];
      L.push(v);
      upSum = [upSum[0] + v[0] * d[2], upSum[1] + v[1] * d[2], upSum[2] + v[2] * d[2]];
      upN += d[2];
    } else L.push([0, 0, 0]);
  }
  // 上向きの面への空の放射照度 ≒ 2π × 平均（cos の重み）
  const Eup: Vec3 = upSum.map((x) => (x / Math.max(upN, 1e-6)) * Math.PI) as Vec3;
  const T = sunTransmittance(sun, air.aero);
  const Esun: Vec3 = T.map((t) => t * ATMOS.sun * e * Math.max(0, sun[2])) as Vec3;
  const ground: Vec3 = [0, 1, 2].map((j) => (GROUND[j] * (Eup[j] + Esun[j])) / Math.PI) as Vec3;
  // 曇り：上からの灰色の光（晴れの日の上向きの光の 4 割ほど）
  const ocLum = 0.42 * (0.2126 * (Eup[0] + Esun[0]) + 0.7152 * (Eup[1] + Esun[1]) + 0.0722 * (Eup[2] + Esun[2])) / Math.PI;
  const c = Math.pow(Math.max(0, Math.min(1, cloud)), 1.3);
  const Y0 = 0.282095, Y1 = 0.488603;
  const dw = (4 * Math.PI) / DIRS.length;
  const acc: SH = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  DIRS.forEach((d, i) => {
    const clear = d[2] > 0.02 ? L[i] : ground;
    const oc = d[2] > 0.02 ? ocLum * (0.6 + 0.8 * d[2]) : ocLum * 0.25;
    for (let j = 0; j < 3; j++) {
      const v = clear[j] * (1 - c) + oc * [0.95, 0.98, 1.03][j] * c;
      acc[0][j] += v * Y0 * dw;
      acc[1][j] += v * Y1 * d[0] * dw;
      acc[2][j] += v * Y1 * d[1] * dw;
      acc[3][j] += v * Y1 * d[2] * dw;
    }
  });
  const k0 = Math.PI * Y0, k1 = ((2 * Math.PI) / 3) * Y1;
  const r3 = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k].map((x) => Math.round(x * 1e5) / 1e5) as Vec3;
  return [r3(acc[0], k0), r3(acc[1], k1), r3(acc[2], k1), r3(acc[3], k1)];
}

export const irradiance = (sh: SH, n: Vec3): Vec3 => [0, 1, 2].map((j) => sh[0][j] + sh[1][j] * n[0] + sh[2][j] * n[1] + sh[3][j] * n[2]) as Vec3;

/** 太陽の直射（露出をかけた放射照度。太陽に向いた面）。沈んでいれば 0 */
export function sunIrradiance(sun: Vec3, sunAltitude: number, aero = 1): Vec3 {
  const e = exposureFor(sunAltitude);
  return sunTransmittance(sun, aero).map((t) => Math.round(t * ATMOS.sun * e * 1e4) / 1e4) as Vec3;
}

/** 窓・街灯・タワーの明かりが見える度合い（日没前から、朝は日の出の後に消える） */
export const artificialVisibility = (sunAltitude: number) => smoothstep(6, -4, sunAltitude);

/** 人工の明かりの露出の比（夜を 1。lib/app/atmosphere.ts の nightExposureRatio と同じ） */
export const artificialExposure = nightExposureRatio;

/** 窓・街灯の明かりの強さ（点いている度合い × 露出の比） */
export const artificialLevel = (sunAltitude: number) => artificialVisibility(sunAltitude) * artificialExposure(sunAltitude);

/** 夜の街の照り返し（露出をかけた放射照度。建物の壁や地面をほのかに照らす橙） */
export function cityAmbient(sunAltitude: number): Vec3 {
  const k = artificialLevel(sunAltitude);
  return [0.05 * k, 0.038 * k, 0.026 * k];
}
