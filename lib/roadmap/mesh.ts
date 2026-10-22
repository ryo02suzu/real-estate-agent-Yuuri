// 地域メッシュ（JIS X 0410）。緯度経度から、国のデータが使う区画のコードを求める。
// 1次（約80km・4桁）→ 2次（約10km・6桁）→ 3次（約1km・8桁）→ 2分の1（約500m・9桁）→ 4分の1（約250m・10桁）。
// 液状化の発生傾向・将来推計人口は 250m の区画ごと、アプリが読むファイルは 2次メッシュ（約10km）ごと
import type { LngLat } from "./parcel";

// 区画の大きさ（秒）。緯度・経度の順
const SIZES: [number, number][] = [
  [2400, 3600], // 1次：緯度40分・経度1度
  [300, 450], // 2次：緯度5分・経度7分30秒
  [30, 45], // 3次：緯度30秒・経度45秒
  [15, 22.5], // 2分の1
  [7.5, 11.25], // 4分の1
];

/** 地点の 250m メッシュ（4分の1地域メッシュ）のコード（10桁）。日本の範囲の外は undefined */
export function mesh250(lat: number, lng: number): string | undefined {
  if (!(lat >= 20 && lat < 46 && lng >= 122 && lng < 154)) return undefined;
  // 秒に直して区画の大きさで割る。境界の上の点は北・東の区画（小数の誤差で南・西にずれないよう、わずかに足して切り捨てる）
  let y = lat * 3600;
  let x = (lng - 100) * 3600;
  let code = "";
  for (let i = 0; i < SIZES.length; i++) {
    const [h, w] = SIZES[i];
    const r = Math.floor(y / h + 1e-9);
    const c = Math.floor(x / w + 1e-9);
    y -= r * h;
    x -= c * w;
    // 1〜3次は緯度・経度の番号を並べ、2分の1・4分の1は南西 1・南東 2・北西 3・北東 4
    code += i < 3 ? `${r}${c}` : String(r * 2 + c + 1);
  }
  return code;
}

/** 2次メッシュのコード（6桁）。メッシュのコードの頭 */
export const mesh2Of = (code: string) => code.slice(0, 6);

/** メッシュ（1次〜4分の1。4・6・8・9・10桁）の南西の角と北東の角（経度・緯度） */
export function meshBounds(code: string): [LngLat, LngLat] {
  let lat = Number(code.slice(0, 2)) * SIZES[0][0];
  let lng = Number(code.slice(2, 4)) * SIZES[0][1];
  let level = 0;
  for (let i = 4; i + 1 < code.length && i < 8; i += 2) {
    level++;
    lat += Number(code[i]) * SIZES[level][0];
    lng += Number(code[i + 1]) * SIZES[level][1];
  }
  for (let i = 8; i < code.length; i++) {
    level++;
    const d = Number(code[i]) - 1;
    lat += Math.floor(d / 2) * SIZES[level][0];
    lng += (d % 2) * SIZES[level][1];
  }
  const [h, w] = SIZES[level];
  const s = lat / 3600;
  const west = lng / 3600 + 100;
  return [
    [west, s],
    [west + w / 3600, s + h / 3600],
  ];
}

/** 250m メッシュの中心（経度・緯度） */
export function meshCenter(code: string): LngLat {
  const [[w, s], [e, n]] = meshBounds(code);
  return [(w + e) / 2, (s + n) / 2];
}

/** 地点から半径 m の円にかかる 2次メッシュ（約10km）のコード。ふつうは1つ、境目の近くでは2〜4つ */
export function mesh2Around(lat: number, lng: number, m: number): string[] {
  const dLat = m / 110_950;
  const dLng = m / (111_320 * Math.cos((lat * Math.PI) / 180));
  const out = new Set<string>();
  for (const [a, b] of [
    [lat - dLat, lng - dLng],
    [lat - dLat, lng + dLng],
    [lat + dLat, lng - dLng],
    [lat + dLat, lng + dLng],
  ]) {
    const c = mesh250(a, b);
    if (c) out.add(mesh2Of(c));
  }
  return [...out];
}
