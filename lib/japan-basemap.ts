// スマホの日本地図（components/japan-map.tsx）の背景タイルの選び方。
//
// 国土地理院の淡色地図・標準地図が低いズーム（z4 など）を配信しているかは、この開発環境から確かめられなかった
// （ネットへの接続が使えない）。確かめられないまま「配信されている」と決めて白い地図になるのを避けるため、
// 実行時に東京付近のタイルを1枚だけ確かめて、使える背景を決める。この確認は公的なタイルの配信元への通常のタイル取得で、
// 住所や座標を自前のサーバーへ送ることはない（確認に使う座標は固定の東京駅付近）。
import { TILE, toWorldPixel } from "./tiles";

/** 地理院タイル（淡色・標準）。利用条件：出典「地理院タイル」の表示（https://maps.gsi.go.jp/development/ichiran.html） */
export const GSI_PALE_URL = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
export const GSI_STD_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
export const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';

/** 日本全体（北方領土・南西諸島を含む）[[西, 南], [東, 北]] */
export const JAPAN_BOUNDS: [[number, number], [number, number]] = [
  [122.5, 24],
  [146, 45.8],
];
/** 北海道・本州・四国・九州。低いズームのタイルが無いとき、z5 以上のタイルだけで見せる範囲 */
export const JAPAN_MAIN_BOUNDS: [[number, number], [number, number]] = [
  [129, 30.5],
  [146, 45.6],
];

/**
 * 地図の最小ズーム。MapLibre のズームは 512px 基準で、256px のラスタタイルは「ズーム＋1」の段を読む。
 * 最小ズーム3なら、読むタイルは z4 以上だけ（z3 以下は読まない）
 */
export const MAP_MIN_ZOOM = 3;
/** 低ズームの背景が配信されているかを確かめるタイルの段（日本全体を出すときに読む段） */
export const PROBE_ZOOM = 4;
/** タイルを読む段の上限。これ以上に拡大したときは z18 のタイルを引き伸ばす */
export const TILE_MAX_ZOOM = 18;
/** 物件の場所まで寄るズーム */
export const POINT_ZOOM = 16;
/** 低ズームの背景が使えないとき、日本の主な島をこのズーム以上で見せる（読むタイルは z5 以上） */
export const MAIN_ONLY_MIN_ZOOM = 4;

export type TileCoord = { z: number; x: number; y: number };

/** 東京駅付近を含むタイル（どの段でも日本の陸地に当たるので、無ければその段は配信されていない） */
export function probeTile(z: number): TileCoord {
  const p = toWorldPixel(35.681, 139.767, z);
  return { z, x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
}

export const tileUrl = (template: string, t: TileCoord): string =>
  template.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));

/** 2点間の距離(m)。地球を球とみなした近似（カメラの動かし方を選ぶだけなので十分） */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 地点へカメラを動かす方法。引いた地図（ズーム8未満。日本全体など）からは、そのまま寄る（ease）。
 * 寄った地図から遠い場所（1.5km超）へ移るときは、いったん引いてから寄る（fly）。通り道のタイルを全部読まずに済む。近ければそのまま滑らせる
 */
export function cameraMove(fromZoom: number, meters: number): "ease" | "fly" {
  if (fromZoom < 8) return "ease";
  return meters > 1500 ? "fly" : "ease";
}

export type LowZoomAvailability = { pale: boolean; std: boolean };

/**
 * 低ズームの淡色・標準のタイルが読めるかを確かめる。load は「そのURLの画像が読めたか」を返す
 * （読めない・遅すぎる・通信エラーは false。例外にしない）
 */
export async function probeLowZoom(load: (url: string) => Promise<boolean>): Promise<LowZoomAvailability> {
  const t = probeTile(PROBE_ZOOM);
  const ok = async (template: string) => {
    try {
      return await load(tileUrl(template, t));
    } catch {
      return false;
    }
  };
  const [pale, std] = await Promise.all([ok(GSI_PALE_URL), ok(GSI_STD_URL)]);
  return { pale, std };
}

/**
 * 背景の決め方。pale：淡色を低ズームから使う（そのまま）／ std：淡色は無いので標準地図を低ズームの下敷きにする／
 * main-only：どちらも無いので、z5 以上のタイルだけで見える範囲（北海道〜九州）に絞る
 */
export type BasePlan = "pale" | "std" | "main-only";

export function planBase(a: LowZoomAvailability): BasePlan {
  if (a.pale) return "pale";
  if (a.std) return "std";
  return "main-only";
}

/** タイルの画像が読めるか（ブラウザ用）。timeoutMs を過ぎたら読めなかったことにする */
export function imageLoads(url: string, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (v: boolean) => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(v);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url;
  });
}
