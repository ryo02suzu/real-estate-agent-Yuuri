// 動きの演出（検索したときの「地球から土地までズーム」・ホームの写真のゆっくりした動き）のオン・オフ。端末に覚える（はじめはオン）。
// ホームの右上のメニュー（≡）の「動きの演出」で切り替える。iPhone の「視差効果を減らす」（prefers-reduced-motion。tokens.ts の
// reducedMotion）がオンのときは、ここがオンでも出さない
import { useSyncExternalStore } from "react";

const KEY = "michilu:motion";
const EVENT = "michilu:motion";

/** 動きの演出がオンか（端末に「off」と覚えていなければオン） */
export function motionSetting(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setMotionSetting(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    // 覚えられない（プライベートブラウズなど）ときは、この画面の間だけ
  }
  dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  addEventListener(EVENT, cb);
  addEventListener("storage", cb);
  return () => {
    removeEventListener(EVENT, cb);
    removeEventListener("storage", cb);
  };
}

export function useMotionSetting(): boolean {
  return useSyncExternalStore(subscribe, motionSetting, () => true);
}
