// 動きの演出（検索したときの「地球から土地までズーム」・ホームの写真のゆっくりした動き）のオン・オフ。端末に覚える（はじめはオン）。
// ホームの右上のメニュー（≡）の「動きの演出」で切り替える。iPhone の「視差効果を減らす」（prefers-reduced-motion。tokens.ts の
// reducedMotion）がオンのときは、ここがオンでも出さない
import { useSyncExternalStore } from "react";

const KEY = "michilu:motion";
const EVENT = "michilu:motion";

// 保存が拒否されても、このページで選んだ値は失わない。読むだけできる場合も古い保存値より優先する。
let lastKnown = true;
let pageOnly = false;

/** 動きの演出がオンか。保存できない間はこのページの選択、未設定ならオン。 */
export function motionSetting(): boolean {
  if (pageOnly) return lastKnown;
  try {
    lastKnown = localStorage.getItem(KEY) !== "off";
  } catch {
    // 途中で読み取れなくなっても、最後に読めた設定を保つ。
  }
  return lastKnown;
}

export function setMotionSetting(on: boolean): void {
  lastKnown = on;
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
    pageOnly = false;
  } catch {
    pageOnly = true;
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
