// 地球の座標の変換（地心直交座標 ECEF と、その場の東・北・上 ENU）と、帯のカメラ。
// 帯の街は、焼き込み（scripts/city-bake/geo.py）も 3D タイル（components/app/city-3d.ts）も、同じカメラ・同じ式で描く。
// そうすると、焼いた層（窓の明かり・東京タワー・航空障害灯）と 3D タイルの街が画素の単位で重なる
export type V3 = [number, number, number];

/** GRS80（世界測地系。WGS84 とは 0.1mm しか違わない）。焼き込みと同じ値 */
const A = 6378137.0;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const R = Math.PI / 180;

/**
 * 帯のカメラ（scripts/city-bake/geo.py の CAM と同じ）：汐留の上空（東京タワーの東北東 約 1.6km）、標高 260m（楕円体高はジオイド高 36.7m を足す）、
 * 西南西（方位 246°）を 0.25° 見上げ、横の画角 62°、縦横比 393:275
 */
export const CITY_CAMERA = { lat: 35.664, lon: 139.7616, h: 260 + 36.7, heading: 246, pitch: 0.25, hfov: 62, aspect: 393 / 275 } as const;

/** 緯度・経度（度）・楕円体高（m）→ ECEF（m） */
export function ecef(lat: number, lon: number, h: number): V3 {
  const la = lat * R;
  const lo = lon * R;
  const n = A / Math.sqrt(1 - E2 * Math.sin(la) ** 2);
  return [(n + h) * Math.cos(la) * Math.cos(lo), (n + h) * Math.cos(la) * Math.sin(lo), (n * (1 - E2) + h) * Math.sin(la)];
}

/** その場の東・北・上の向き（ECEF の単位ベクトル） */
export function enuBasis(lat: number, lon: number): [V3, V3, V3] {
  const la = lat * R;
  const lo = lon * R;
  return [
    [-Math.sin(lo), Math.cos(lo), 0],
    [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)],
    [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)],
  ];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * ECEF → カメラを原点にした ENU（東 x・北 y・上 z）の 4×4 行列。行ごとに並べた 16 個（three.js の Matrix4.set に渡す順）。
 * 3D タイルの全体（ECEF）にこれを掛けると、カメラのまわりが原点の近くに来る（大きな座標のまま GPU に送らない）
 */
export function ecefToEnuRows(lat: number, lon: number, h: number): number[] {
  const o = ecef(lat, lon, h);
  const [e, n, u] = enuBasis(lat, lon);
  return [...e, -dot(e, o), ...n, -dot(n, o), ...u, -dot(u, o), 0, 0, 0, 1];
}

/** カメラの向き（ENU の単位ベクトル。方位は北から時計回り、見上げは上が正） */
export function viewDir(heading: number, pitch: number): V3 {
  const hh = heading * R;
  const p = pitch * R;
  return [Math.sin(hh) * Math.cos(p), Math.cos(hh) * Math.cos(p), Math.sin(p)];
}

/** 縦の画角（度） */
export const vfovOf = (hfov: number, aspect: number) => (2 * Math.atan(Math.tan((hfov / 2) * R) / aspect)) / R;

/** 距離の絵：距離（m）を 0〜400km の 24 ビットで RGB に入れる（1 段 2.4cm） */
export const DIST_MAX = 400000;
const STEPS = 16777215;

export function encodeDist(d: number): [number, number, number] {
  const q = Math.round(Math.min(1, Math.max(0, d / DIST_MAX)) * STEPS);
  return [Math.floor(q / 65536), Math.floor(q / 256) % 256, q % 256];
}

export const decodeDist = (r: number, g: number, b: number) => ((r * 65536 + g * 256 + b) * DIST_MAX) / STEPS;
