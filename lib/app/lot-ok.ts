// 「この筆で進める」を押した筆を、端末に覚える。
// 地図で選んだ地点の筆が、隣地のとても多い筆（道路など物件の外の土地の可能性）のときは、面積・隣地を物件のものとして出さない
// （lib/roadmap/parcel.ts の roadLikeLot）。学校・工場・団地のように、本当に大きな土地を調べているときは、営業の方が
// 「この筆で進める」を押すと、その筆だけ物件の筆として扱う。覚えるのは筆（地番区域と登記の地番）で、MICHILU のサーバーには送らず、
// 端末の localStorage にだけ置く。使えない端末（プライベートブラウズなど）では、開いている間だけ覚える。
import { registryChiban } from "../roadmap/parcel";

export const LOT_OK_KEY = "michilu:lot-ok";
/** 覚えた筆が変わったときの合図（同じ画面のほかの部品が読み直す） */
export const LOT_OK_EVENT = "michilu:lot-ok";
/** 覚えておく数（古いものから消える） */
export const LOT_OK_MAX = 100;

/** 筆の鍵（地番区域と登記の地番。地図データの印の付いた区画「51-3W1」「51-3W2」は同じ筆） */
export const lotOkKey = (p: { kuiki: string; chibanRaw: string }): string => `${p.kuiki}|${registryChiban(p.chibanRaw)}`;

/** localStorage が使えない端末で、開いている間だけ覚えておく分 */
let memory: string[] = [];

function parse(raw: string): string[] {
  try {
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

/** 覚えている筆の写し（文字のまま。useSyncExternalStore で比べられるよう、同じ中身なら同じ値） */
export function lotOkSnapshot(): string {
  try {
    return localStorage.getItem(LOT_OK_KEY) ?? JSON.stringify(memory);
  } catch {
    return JSON.stringify(memory);
  }
}

/** 写し（lotOkSnapshot）の中に、その筆があるか */
export const lotOkIn = (snapshot: string, key: string): boolean => parse(snapshot).includes(key);

function save(list: string[]): void {
  memory = list.slice(0, LOT_OK_MAX);
  try {
    if (memory.length) localStorage.setItem(LOT_OK_KEY, JSON.stringify(memory));
    else localStorage.removeItem(LOT_OK_KEY);
  } catch {
    // 保存できない端末では、開いている間だけ覚える
  }
  if (typeof dispatchEvent === "function") dispatchEvent(new Event(LOT_OK_EVENT));
}

/** この筆で進める（物件の筆として扱う）／取り消す */
export function setLotOk(key: string, ok: boolean): void {
  const rest = parse(lotOkSnapshot()).filter((k) => k !== key);
  save(ok ? [key, ...rest] : rest);
}

/** 覚えた筆を全部消す（PC の「履歴を全部消す」で、履歴・覚えた場所と一緒に消す） */
export function clearLotOk(): void {
  save([]);
}

/** 変わったら知らせる（ほかのタブで変えたときも） */
export function subscribeLotOk(onChange: () => void): () => void {
  addEventListener(LOT_OK_EVENT, onChange);
  addEventListener("storage", onChange);
  return () => {
    removeEventListener(LOT_OK_EVENT, onChange);
    removeEventListener("storage", onChange);
  };
}
