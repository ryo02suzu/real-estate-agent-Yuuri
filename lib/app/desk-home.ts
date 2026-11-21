// PC のホームの背景（Blender で描いた真上から見た日本。scripts/pc-opening の home.py --extent --tod と、陸を4倍の細かさで描き直した
// home_hd.py）の、時間帯の絵を選ぶ部分（画面を持たない）。上の帯の時間帯（朝・昼・夕・夜。時計に合わせるときは物件の場所の今の太陽：
// lib/app/desk.ts の todOfSun）の絵を出し、変わったら溶かして替える。地図への重ね方は lib/app/desk-cinema.ts。
// 絵は拡大の段階ごとのタイル（scripts/pc-opening/home_tiles.py が public/home/tiles/{時間帯}/ と desk-japan.json に書く）。
// 4つの時間帯は同じ構図・同じ範囲で、光だけが違う。夕と夜の絵には、夜の街の明かり（国勢調査と GHSL の人口から）が入っている
import type { DeskTod } from "./desk";
import desk from "./desk-japan.json";

/** 絵の名前（home.py の --tod と同じ。上の帯の「夕」は dusk） */
export type HomeImageKey = "morning" | "day" | "dusk" | "night";

export const HOME_IMAGE_OF: Record<DeskTod, HomeImageKey> = { morning: "morning", day: "day", evening: "dusk", night: "night" };

/** tiles：タイルの場所（{z}/{x}/{y} を地図が埋める）。lights：夜の街の明かりが入っている絵（出している間だけ、明かりの出典を出す） */
export type HomeImage = { key: HomeImageKey; tiles: string; lights: boolean };

type Corners = [[number, number], [number, number], [number, number], [number, number]];

/** 4つの時間帯に共通の四隅（経度・緯度。左上から時計回り） */
export const HOME_CORNERS = desk.coordinates as Corners;

/** タイルのある範囲（西・南・東・北）。この外のタイルは読みに行かない */
export const HOME_BOUNDS: [number, number, number, number] = [HOME_CORNERS[0][0], HOME_CORNERS[2][1], HOME_CORNERS[2][0], HOME_CORNERS[0][1]];

/**
 * タイルの段（ズーム）。1枚 512 画素の絵を 256 画素のタイルとして出すので、いちばん細かい段（maxzoom）のとき、地図のズーム
 * maxzoom で絵の 1 画素が画面の 1 画素（CSS の画素）になる
 */
export const HOME_TILE_ZOOMS = { minzoom: desk.minzoom, maxzoom: desk.maxzoom };

const IMAGES = desk.images as Record<HomeImageKey, { lights: boolean }>;

export function homeImageByKey(key: HomeImageKey): HomeImage {
  return { key, tiles: desk.tiles.replace("{tod}", key), lights: IMAGES[key].lights };
}

/** 時間帯の絵 */
export function homeImage(tod: DeskTod): HomeImage {
  return homeImageByKey(HOME_IMAGE_OF[tod]);
}

/**
 * 背景の絵がくっきり見える一番寄った高さ（地図のズーム）。いちばん細かい段のタイルでは、画面の細かさ（devicePixelRatio）が
 * 1 なら maxzoom（8）、2（Mac・iPad などの細かい画面）なら 1 つ手前（7）。それより寄ると、絵が引き伸ばされてぼやける
 */
export function homeCrispZoom(dpr: number): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? Math.min(3, Math.max(1, dpr)) : 1;
  return HOME_TILE_ZOOMS.maxzoom - Math.log2(d);
}

/**
 * 背景の絵を薄くし始める高さと、消える高さ。くっきり見える一番寄った高さから薄くし始め、ぼやけが目立つ前に今の地図へ溶けて
 * 替わる（暗い絵と明るい地図が混ざる間は白っぽく見えるので、短めに）
 */
export function homeFadeZooms(dpr: number): [number, number] {
  const c = homeCrispZoom(dpr);
  return [c, c + 0.8];
}

/** 時間帯が変わったときに溶かして替える長さ（ms） */
export const HOME_FADE_MS = 1200;

/** 動きを減らす設定（端末の設定か、MICHILU の「動き」）では溶かさず、絵が届いたらすぐ替える */
export const homeFadeMs = (motion: boolean): number => (motion ? HOME_FADE_MS : 0);

/**
 * 溶かして替える途中の様子。shown：いま見えている絵。incoming：その上に重ねて読み込んでいる絵（fading なら溶かしている途中）
 */
export type HomeFade = { shown: HomeImageKey; incoming?: { key: HomeImageKey; fading: boolean } };

/** 次にすること：何もしない・待つ（読み込み・溶かすのが終わるまで）・読み込み中の絵をやめる・この絵を読み込む */
export type HomeFadeStep = "none" | "wait" | "cancel" | { load: HomeImageKey };

/**
 * 出したい絵（want）に向けて、次にすることを決める。溶かしている途中に別の時間帯になったら、溶かし終えてから次へ（途中で
 * 飛ばない）。読み込み中（まだ見えていない）なら、その絵はやめて出したい絵を読む
 */
export function nextHomeStep(s: HomeFade, want: HomeImageKey): HomeFadeStep {
  if (s.incoming) return s.incoming.fading || s.incoming.key === want ? "wait" : "cancel";
  return s.shown === want ? "none" : { load: want };
}

/** 明かりの出典を出すか（明かりの入った絵が見えている間。溶かしている途中は、どちらかに入っていれば） */
export function homeLightsCredit(s: HomeFade): boolean {
  return homeImageByKey(s.shown).lights || (!!s.incoming?.fading && homeImageByKey(s.incoming.key).lights);
}
