// 地球から降りる演出（components/app/globe-flight.tsx）と、物件の画面の街の模型（components/app/property-3d.ts）のつなぎ。
// 物件の画面が模型の「着地の最初の見え方」を出す関数を置き、演出は降りきる前にそれを読んで、最後の見え方をそろえる
// （土地の位置・大きさ・向きが同じなので、写真から模型へ溶けるように入れ替わる）。画面の中だけのやりとり
export type LandingFrame = { x: number; y: number; mpp: number; bearing: number };

let source: (() => LandingFrame | null) | null = null;

/** 模型の着地の見え方を出す関数を置く（外すときに呼ぶ関数を返す） */
export function setLandingSource(fn: () => LandingFrame | null): () => void {
  source = fn;
  return () => {
    if (source === fn) source = null;
  };
}

/** 模型の着地の見え方（模型がまだ無ければ null） */
export function landingFrame(): LandingFrame | null {
  try {
    return source?.() ?? null;
  } catch {
    return null;
  }
}

/** 1px の長さ（m）から、地図のズーム（その緯度で） */
export function zoomForMpp(mpp: number, lat: number): number {
  return Math.log2((40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * mpp));
}

/** 2点の方位（度。北が 0、時計回り） */
export function bearingTo(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const east = (to.lng - from.lng) * Math.cos((((from.lat + to.lat) / 2) * Math.PI) / 180);
  const north = to.lat - from.lat;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/** 2点の距離（km。近いところの目安） */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const east = (b.lng - a.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180) * 111.32;
  const north = (b.lat - a.lat) * 110.95;
  return Math.hypot(east, north);
}

/**
 * 真上から見るとき、土地（target）が画面の中心から (dx, dy) px（右・下が正）の所に来る、地図の中心。bearing は地図の向き（度。画面の上が
 * その方位）、zoom は地図のズーム（1 枚 512px の世界）。地図の部品の offset は、斜めから起き上がる途中で使うとずれるので、自分で出す
 */
export function centerFor(target: { lat: number; lng: number }, dx: number, dy: number, bearing: number, zoom: number): { lat: number; lng: number } {
  const world = 512 * 2 ** zoom;
  const b = (bearing * Math.PI) / 180;
  // 画面の向き（右・下）を、地図の向き（東・南）に直す
  const east = dx * Math.cos(b) - dy * Math.sin(b);
  const south = dx * Math.sin(b) + dy * Math.cos(b);
  const r = (target.lat * Math.PI) / 180;
  const mx = (target.lng + 180) / 360 - east / world;
  const my = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 - south / world;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI, lng: mx * 360 - 180 };
}
