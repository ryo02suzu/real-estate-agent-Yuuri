// 地理院タイル（Webメルカトル、256px）で、座標を中心にしたプレビューを描くための計算

export const TILE = 256;

/** 緯度経度 → ズーム z での世界ピクセル座標（タイル画像 256px 基準） */
export function toWorldPixel(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z * TILE;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

type Options = {
  /** 1枚を何CSSピクセルで描くか。128 にすると高精細画面でくっきり表示される */
  size?: number;
  /** 中心タイルの周り何枚ぶん並べるか（1 なら 3x3、2 なら 5x5） */
  radius?: number;
  layer?: "std" | "pale";
};

/**
 * 中心点の周りのタイルと、中心点がタイル群の左上から何px（CSS）にあるかを返す。
 * 表示側はタイル群を (-offsetX, -offsetY) ずらして、コンテナ中央に置けばよい。
 */
export function tilesAround(lat: number, lng: number, z: number, { size = TILE, radius = 1, layer = "std" }: Options = {}) {
  const p = toWorldPixel(lat, lng, z);
  const cx = Math.floor(p.x / TILE);
  const cy = Math.floor(p.y / TILE);
  const scale = size / TILE;
  const tiles: { x: number; y: number; left: number; top: number; url: string }[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      tiles.push({
        x,
        y,
        left: (dx + radius) * size,
        top: (dy + radius) * size,
        url: `https://cyberjapandata.gsi.go.jp/xyz/${layer}/${z}/${x}/${y}.png`,
      });
    }
  }
  return {
    tiles,
    size,
    offsetX: (p.x - (cx - radius) * TILE) * scale,
    offsetY: (p.y - (cy - radius) * TILE) * scale,
  };
}
