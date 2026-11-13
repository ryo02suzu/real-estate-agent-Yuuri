// ホームの背景の写真（時間帯で 5 枚。場所と色は lib/app/home-photos.ts）を、いま出すための手伝い。
// どれを出すかは太陽の高さで決める（lib/app/sun.ts の homePart）。最初に描く前は <head> の SKY_HEAD_SCRIPT（lib/app/sky-vars.ts）が
// html の data-home に入れ、写真・暗いぼかし・読み込むまでの色・オープニングの太陽と月の光の位置は app/globals.css が data-home を見て出す
// （サーバーで作った HTML には時間帯が入らないので、夜に開いても昼の写真が一瞬出ない）。表示中に時間帯が変わったときの入れ替えは
// components/app/home.tsx の HomeBackdrop
import { HOME_TOP } from "@/lib/app/home-photos";
import { homePart, type HomePart } from "@/lib/app/sun";
import { partNow } from "./day-photo";

export { HOME_PARTS, homePhoto, HOME_TOP } from "@/lib/app/home-photos";

/** 出している写真が入れ替わったときに window に出す合図（時刻・電池の帯の色を、写真に合わせて変える。components/app/mobile-app.tsx） */
export const HOME_PHOTO_EVENT = "michilu:home-photo";

/** いまの時間帯 */
export function homePartNow(): HomePart {
  return partNow(homePart);
}

/** いま出している写真の時間帯（html の data-home。入れ替わりの途中は前の写真。まだ無ければ、いまの時間帯） */
export function homeShown(): HomePart {
  const p = document.documentElement.dataset.home;
  return p && p in HOME_TOP ? (p as HomePart) : homePartNow();
}

/** ホームの時刻・電池の帯の色（いま出している写真の上の空の色） */
export function homeTop(): string {
  return HOME_TOP[homeShown()];
}
