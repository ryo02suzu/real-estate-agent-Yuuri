// スマホの日本地図（components/japan-map.tsx）の背景タイルの選び方と、日本全体の見せ方。
//
// 国土地理院の淡色地図・標準地図が低いズーム（z4 など）を配信しているかは、開発環境から常に確かめられるとは限らない。
// 確かめられないまま「配信されている」と決めて白い地図になるのを避けるため、実行時に東京付近のタイルを1枚だけ確かめて、
// 使える背景を決める。この確認は公的なタイルの配信元への通常のタイル取得で、住所や座標を自前のサーバーへ送ることはない
// （確認に使う座標は固定の東京駅付近）。
import { TILE, toWorldPixel } from "./tiles";

/** 地理院タイル（淡色・標準）。利用条件：出典「地理院タイル」の表示（https://maps.gsi.go.jp/development/ichiran.html） */
export const GSI_PALE_URL = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
export const GSI_STD_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
export const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';

type Bounds = [[number, number], [number, number]];

/** 日本全体（北方領土・南西諸島を含む）[[西, 南], [東, 北]] */
export const JAPAN_BOUNDS: Bounds = [
  [122.5, 24],
  [146, 45.8],
];
/** 北海道・本州・四国・九州。低いズームのタイルが無いとき、z5 以上のタイルだけで見せる範囲 */
export const JAPAN_MAIN_BOUNDS: Bounds = [
  [129, 30.5],
  [146, 45.6],
];

/**
 * 地図の最小ズーム。MapLibre のズームは 512px 基準で、256px のラスタタイルは round(ズーム＋1) の段を読む
 * （node_modules/maplibre-gl/src/geo/projection/covering_tiles.ts の coveringZoomLevel・raster は roundZoom）。
 * 2.5 なら読む段は round(3.5)=4 で、z4 以上だけを読む（z3 以下は読まない）。背の低い画面（375×667 で履歴あり）でも日本全体が入る
 */
export const MAP_MIN_ZOOM = 2.5;
/** 低ズームの背景が配信されているかを確かめるタイルの段（日本全体を出すときに読む一番低い段） */
export const PROBE_ZOOM = 4;
/** タイルを読む段の上限。これ以上に拡大したときは z18 のタイルを引き伸ばす */
export const TILE_MAX_ZOOM = 18;
// 物件の場所まで寄るズームは、位置の目安ごとに決める（lib/position-accuracy.ts の pointView）
/** 低ズームの背景が使えないとき、日本の主な島をこのズーム以上で見せる（読む段は round(4.5)=5 以上。375px 幅にも主な島が入る） */
export const MAIN_ONLY_MIN_ZOOM = 3.5;

/** 上の操作帯（ロゴ・メニュー）に隠れない余白(px) */
export const MAP_TOP = 70;
/** 左右の余白(px) */
export const MAP_SIDE = 10;
/**
 * 横向きの背の低い画面（パネルを左に寄せる。lib/mobile-layout.ts）で、地図の側の上の余白(px)。
 * ロゴ・メニューは左の列（パネルの上）にあるので、地図の側は少しだけ空ける
 */
export const SIDE_MAP_TOP = 12;
/** 地点を見せるとき、パネルの外に最低限残す地図の大きさ(px)（余白が画面より大きくならないように） */
export const POINT_MIN_VISIBLE = 48;

/** 読むタイルの段（MapLibre の 256px ラスタと同じ計算） */
export const tileZoomAt = (mapZoom: number) => Math.round(mapZoom + 1);

/** 範囲の、そのズームでの大きさ(px。512px 基準のメルカトル) */
export function boundsPx([[w, s], [e, n]]: Bounds, zoom: number): { w: number; h: number } {
  const world = 512 * 2 ** zoom;
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return { w: ((e - w) / 360) * world, h: ((y(n) - y(s)) / (2 * Math.PI)) * world };
}

export type Padding = { top: number; bottom: number; left: number; right: number };

/**
 * 日本全体（または主な島）を見せるときの余白。下は、下から重なるパネルの高さ（inset）＋8px。
 * ただし、最小ズームで範囲が入る高さを必ず残す（パネルが画面の高さのほとんどを覆うときは、下の余白を減らす）。
 * 入らない余白を渡すと MapLibre は動かず（警告だけ）、地図が [0,0] や画面の外に残るため。
 * left は、横向きで左に寄せたパネルの右端(px。0 なら縦向き＝下のパネル)。そのときは地図の側（右）に収め、上の余白は少しだけ。
 * 横も、最小ズームで範囲が入る幅は必ず残す
 */
export function overviewPadding(view: { w: number; h: number }, inset: number, bounds: Bounds = JAPAN_BOUNDS, minZoom = MAP_MIN_ZOOM, left = 0): Padding {
  const need = boundsPx(bounds, minZoom);
  const top = left > 0 ? SIDE_MAP_TOP : MAP_TOP;
  const bottom = Math.max(0, Math.min(inset + 8, view.h - top - Math.ceil(need.h) - 1));
  const l = left > 0 ? Math.max(MAP_SIDE, Math.min(left + MAP_SIDE, view.w - MAP_SIDE - Math.ceil(need.w) - 1)) : MAP_SIDE;
  return { top, bottom, left: l, right: MAP_SIDE };
}

/**
 * 地点を見せるときの余白。上は操作帯、下はパネルの高さの見込み（inset）。横向き（left>0）は左のパネルの右端より右に寄せる。
 * どちらも、パネルの外に地図を最低 POINT_MIN_VISIBLE(px) は残す（余白が画面より大きいと MapLibre が動かないため）
 */
export function pointPadding(view: { w: number; h: number }, inset: number, left = 0): Padding {
  const top = left > 0 ? SIDE_MAP_TOP : MAP_TOP;
  return {
    top,
    bottom: Math.max(0, Math.min(inset, view.h - top - POINT_MIN_VISIBLE)),
    left: left > 0 ? Math.max(0, Math.min(left + MAP_SIDE, view.w - POINT_MIN_VISIBLE)) : 0,
    right: 0,
  };
}

/** fitBounds が選ぶズーム（余白の内側に範囲が入る一番大きいズーム。最小ズーム未満なら最小ズームに切り上げられる） */
export function fitZoom(view: { w: number; h: number }, p: Padding, bounds: Bounds = JAPAN_BOUNDS): number {
  const one = boundsPx(bounds, 0);
  return Math.log2(Math.min((view.w - p.left - p.right) / one.w, (view.h - p.top - p.bottom) / one.h));
}

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

/** タイル1枚の確認の結果。ok：読めた／missing：読めない（404・通信エラー）／unknown：時間内に返事が無かった（遅い回線） */
export type TileProbe = "ok" | "missing" | "unknown";
export type LowZoomAvailability = { pale: TileProbe; std?: TileProbe };

/**
 * 低ズームの淡色（読めなければ標準）のタイルが読めるかを確かめる。load は「そのURLの画像が読めたか」を返す（例外は missing として扱う）。
 * 標準地図は、淡色が読めないと分かったときだけ問い合わせる
 */
export async function probeLowZoom(load: (url: string) => Promise<TileProbe>): Promise<LowZoomAvailability> {
  const t = probeTile(PROBE_ZOOM);
  const ask = async (template: string): Promise<TileProbe> => {
    try {
      return await load(tileUrl(template, t));
    } catch {
      return "missing";
    }
  };
  const pale = await ask(GSI_PALE_URL);
  if (pale !== "missing") return { pale };
  return { pale, std: await ask(GSI_STD_URL) };
}

/**
 * 背景の決め方。pale：淡色を低ズームから使う（そのまま）／ std：淡色は無いので標準地図を低ズームの下敷きにする／
 * main-only：どちらも無いので、z5 以上のタイルだけで見える範囲（北海道〜九州）に絞る。
 * 遅くて分からない（unknown）ときは「無い」と決めつけず、淡色のまま（タイルが届けば出る。届かない所は薄い青緑の面）
 */
export type BasePlan = "pale" | "std" | "main-only";

export function planBase(a: LowZoomAvailability): BasePlan {
  if (a.pale !== "missing") return "pale";
  if (a.std === "ok") return "std";
  return "main-only";
}

/** 代わりの背景にしたことを、画面で正直に伝える文（日本全体を見せられていないときだけ） */
export function noticeFor(plan: BasePlan): string | null {
  return plan === "main-only" ? "広域の地図を読み込めないため、北海道〜九州を表示しています" : null;
}

/** タイルの画像が読めるか（ブラウザ用）。timeoutMs を過ぎたら unknown（遅いだけかもしれないので、無いとは決めない） */
export function imageLoads(url: string, timeoutMs = 6000): Promise<TileProbe> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (v: TileProbe) => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(v);
    };
    const timer = setTimeout(() => done("unknown"), timeoutMs);
    img.onload = () => done("ok");
    img.onerror = () => done("missing");
    img.src = url;
  });
}
