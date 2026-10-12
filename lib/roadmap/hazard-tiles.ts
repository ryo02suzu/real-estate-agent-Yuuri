// ブラウザで PNG のタイル（重ねるハザードマップ・標高）を読み、画素（RGBA）にする。どちらのサイトも CORS で読める。
// 同じタイルを何度も読まないよう、読んだタイルを少しだけ覚えておく（読み込みの失敗は覚えない）
import type { TileFetcher, TileImage } from "./hazard";

const MAX_TILES = 96;
const cache = new Map<string, Promise<TileImage | null>>();

/** 画素を読む 2D の描画先。OffscreenCanvas の 2D が無い Safari（16.3 まで）は、ふつうの canvas */
function context(width: number, height: number): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  if (typeof OffscreenCanvas !== "undefined") {
    const ctx = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
    if (ctx) return ctx;
  }
  const ctx = Object.assign(document.createElement("canvas"), { width, height }).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  return ctx;
}

/** PNG を画像にする。createImageBitmap の無いブラウザは img 要素で */
async function decode(blob: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    // 色を凡例の色と比べるので、色空間の変換や透明度の掛け合わせをせずに読む
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    return { image: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

async function load(url: string): Promise<TileImage | null> {
  const res = await fetch(url);
  // タイルの無い所（区域の無い所・データの無い所）は 404
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { image, width, height, done } = await decode(await res.blob());
  try {
    const ctx = context(width, height);
    ctx.drawImage(image, 0, 0);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  } finally {
    done();
  }
}

export const browserTileFetcher: TileFetcher = (url) => {
  let p = cache.get(url);
  if (!p) {
    p = load(url);
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    if (cache.size > MAX_TILES) cache.delete(cache.keys().next().value!);
  }
  return p;
};
