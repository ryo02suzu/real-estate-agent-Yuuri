// PC のホームの背景（Blender で描いた真上から見た日本。scripts/pc-opening/home.py --extent --tod）の、時間帯の絵を選ぶ部分（画面を持たない）。
// 上の帯の時間帯（朝・昼・夕・夜。時計に合わせるときは物件の場所の今の太陽：lib/app/desk.ts の todOfSun）の絵を出し、変わったら
// 溶かして替える。地図への重ね方は lib/app/desk-cinema.ts。4枚は同じ構図・同じ四隅（desk-japan.json。scripts/pc-opening/home_webp.py が
// 書く）で、光だけが違う。夕と夜の絵には、夜の街の明かり（国勢調査と GHSL の人口から）が入っている
import type { DeskTod } from "./desk";
import desk from "./desk-japan.json";

/** 絵の名前（home.py の --tod と同じ。上の帯の「夕」は dusk） */
export type HomeImageKey = "morning" | "day" | "dusk" | "night";

export const HOME_IMAGE_OF: Record<DeskTod, HomeImageKey> = { morning: "morning", day: "day", evening: "dusk", night: "night" };

/** url：絵の場所。lights：夜の街の明かりが入っている絵（出している間だけ、明かりの出典を出す） */
export type HomeImage = { key: HomeImageKey; url: string; lights: boolean };

type Corners = [[number, number], [number, number], [number, number], [number, number]];

/** 4枚に共通の四隅（経度・緯度。左上から時計回り） */
export const HOME_CORNERS = desk.coordinates as Corners;

const IMAGES = desk.images as Record<HomeImageKey, { url: string; lights: boolean }>;

export function homeImageByKey(key: HomeImageKey): HomeImage {
  return { key, url: IMAGES[key].url, lights: IMAGES[key].lights };
}

/** 時間帯の絵 */
export function homeImage(tod: DeskTod): HomeImage {
  return homeImageByKey(HOME_IMAGE_OF[tod]);
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
