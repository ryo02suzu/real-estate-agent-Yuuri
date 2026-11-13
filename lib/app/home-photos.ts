// ホームの背景の写真（時間帯で 5 枚）の場所と色。届いた街の絵：同じ街を同じ場所から写した 朝・昼・夕方・夕方と夜のあいだ・夜
// （public/home/{morning,day,evening,dusk,night}.webp。941×1672 の webp で、写真の情報は消してある）。
// どれを出すかは太陽の高さで決める（./sun.ts の homePart）。出し方は components/app/home-photo.ts・home.tsx と app/globals.css
import type { HomePart } from "./sun";

/** 時間帯の並び（朝から夜へ） */
export const HOME_PARTS: HomePart[] = ["morning", "day", "evening", "dusk", "night"];

/** 時間帯の写真の場所（<head> の SKY_HEAD_SCRIPT・app/globals.css も同じ場所） */
export function homePhoto(part: HomePart): string {
  return `/home/${part}.webp`;
}

/**
 * 時刻・電池の帯の色（写真のいちばん上の空に、上の暗いぼかしを重ねた色。写真の上の端は、この色から写真へなじませる）。
 * app/globals.css の、読み込みの途中の body の色と同じ（lib/app/home-photos.test.ts で確かめる）
 */
export const HOME_TOP: Record<HomePart, string> = {
  morning: "#466995",
  day: "#37619a",
  evening: "#486183",
  dusk: "#0f162c",
  night: "#0c1322",
};
