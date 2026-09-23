// 世界測地系(WGS84/JGD2011) → 旧日本測地系(Tokyo Datum) の近似変換。
// wagmap 系の自治体GISは URL の mpx/mpy を旧日本測地系として解釈するため、
// 変換せずに渡すと北西に約450mずれる（熊谷・越谷・上尾で確認済み）。
// 誤差は数m程度で、地図の中心合わせには十分。
export function wgs84ToTokyo(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: lat + 0.00010696 * lat - 0.000017467 * lng - 0.004602,
    lng: lng + 0.000046047 * lat + 0.000083049 * lng - 0.010041,
  };
}
