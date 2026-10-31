// スマホUIの動きの共通ルール（時間・カメラの動き）。CSS 側の値は app/globals.css の --dur-* / --ease-* と揃える。
// 住所・座標はブラウザの中だけで使い、ここから外へは送らない。

/** 押したときの反応（ms）。わずかな縮小と色の変化 */
export const DUR_PRESS = 100;
/** 選択・切替（ms） */
export const DUR_SELECT = 180;
/** パネルの開閉（ms） */
export const DUR_PANEL = 300;
/** 日本地図 → 物件のズーム（ms）の下限・上限 */
export const ZOOM_MIN_MS = 700;
export const ZOOM_MAX_MS = 1100;

/** 日本全体を見せるカメラ（本州〜九州が入る）。[経度, 緯度] */
export const JAPAN_VIEW = { center: [137.5, 37.2] as [number, number], zoom: 4.3 };
/** 物件へ寄ったときのズーム（筆・建物が見える） */
export const PROPERTY_ZOOM = 16;

/** 2点間の距離（km。球面の近似） */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ズームにかける時間。遠いほど長く、700〜1100ms に収める。動きを減らす設定なら 0 */
export function zoomDuration(km: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const ms = ZOOM_MIN_MS + Math.min(1, km / 1000) * (ZOOM_MAX_MS - ZOOM_MIN_MS);
  return Math.round(Math.min(ZOOM_MAX_MS, Math.max(ZOOM_MIN_MS, ms)));
}

/** すでにほぼその地点（約30m以内）に寄っていれば、動かさずにそのまま進む（同じ地点の再検索） */
export function alreadyThere(current: { center: [number, number]; zoom: number }, target: [number, number]): boolean {
  return current.zoom >= PROPERTY_ZOOM - 0.5 && distanceKm(current.center, target) < 0.03;
}

/** 日本全体の表示に戻っているか（戻るときに無駄に動かさない判定） */
export function atJapanView(current: { zoom: number }): boolean {
  return current.zoom <= JAPAN_VIEW.zoom + 1;
}

/** 検索のたびに番号を進め、古い検索の動きや結果を捨てる（連打・ズーム中の再検索） */
export function createRunToken() {
  let n = 0;
  return {
    next: () => ++n,
    isCurrent: (id: number) => id === n,
  };
}
