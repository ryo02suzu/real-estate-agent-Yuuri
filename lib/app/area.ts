// 筆の形から求める面積（図面上の面積）。登記所備付地図の筆は数mずれることがあり、公簿（登記簿）の地積とも違うので、
// 画面では「図面上の面積・参考」と書き、公簿の地積は登記事項証明書で確かめるよう添える
import { tileBounds, type LngLat, type Parcel } from "../roadmap/parcel";

/** 1坪（m²）＝ 400/121 */
export const TSUBO_M2 = 400 / 121;

/** 輪を四角（経緯度 [西, 南, 東, 北]）で切り抜く（タイルののりしろで重なった部分を数えないため） */
export function clipRing(ring: LngLat[], [w, s, e, n]: [number, number, number, number]): LngLat[] {
  const edges: ((p: LngLat) => boolean)[] = [([x]) => x >= w, ([x]) => x <= e, ([, y]) => y >= s, ([, y]) => y <= n];
  const cross = (a: LngLat, b: LngLat, i: number): LngLat => {
    const v = [w, e, s, n][i];
    if (i < 2) {
      const t = (v - a[0]) / (b[0] - a[0]);
      return [v, a[1] + (b[1] - a[1]) * t];
    }
    const t = (v - a[1]) / (b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) * t, v];
  };
  let out = ring;
  edges.forEach((inside, i) => {
    const src = out;
    out = [];
    for (let k = 0; k < src.length; k++) {
      const cur = src[k];
      const prev = src[(k + src.length - 1) % src.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur, i));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur, i));
    }
  });
  return out;
}

/** 輪の面積（m²）。最初の点からのずれ（m）で測る（大きな数どうしの引き算で桁が落ちないように） */
export function ringAreaM2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const [lng0, lat0] = ring[0];
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_950;
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += (x1 - lng0) * kx * (y2 - lat0) * ky - (x2 - lng0) * kx * (y1 - lat0) * ky;
  }
  return Math.abs(s) / 2;
}

/** 筆の面積（m²）。タイルごとの部分をそのタイルの範囲で切り抜いて足す。穴（内側の輪）は引く */
export function parcelAreaM2(parcel: Parcel): number | undefined {
  let total = 0;
  for (const piece of parcel.pieces) {
    const bounds = tileBounds(piece.tile[0], piece.tile[1]);
    for (const poly of piece.polygons) poly.forEach((ring, i) => (total += (i === 0 ? 1 : -1) * ringAreaM2(clipRing(ring, bounds))));
  }
  return total > 0 ? total : undefined;
}

/** 「約123.45㎡（約37.34坪）」 */
export function areaText(m2: number): string {
  const f = (v: number) => v.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `約${f(m2)}㎡（約${f(m2 / TSUBO_M2)}坪）`;
}
