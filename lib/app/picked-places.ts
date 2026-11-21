// 地図で選び直した物件の場所を、端末に覚える。
// 住所・地番で調べて「町の中心」「街区の代表点」「地番が見つからない」「住所が見つからない」になったとき、営業の方が
// その画面から地図で場所を選んだら、入れた住所・地番とその場所を覚えておき、次に同じ住所・地番を入れたら、すぐその場所を出す
// （配達の記録と同じ考え方）。顧客物件の住所なので、MICHILU のサーバーには送らず、端末の localStorage にだけ置く。
// 使えない端末（プライベートブラウズなど）では、覚えずに今までどおり動く。
import { placeSuffix } from "../roadmap/geocode";
import type { LookupResult } from "../roadmap";

export type PickedPlace = {
  /** 入れた住所・地番（覚えたときの書き方。画面に出す） */
  q: string;
  lat: number;
  lng: number;
  /** 覚えた時刻（ミリ秒） */
  at: number;
};

export const PICKED_KEY = "michilu:picked-places";
/** 覚えておく数（古いものから消える）。1件 100 バイトほど */
export const PICKED_MAX = 300;

/**
 * 同じ住所・地番かどうかを比べるための形。全角・半角、空白、ハイフンのような記号の違いをそろえる
 * （長音「ー」は町名にも使うのでそろえない）
 */
export function placeKey(q: string): string {
  return q
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[‐-―−﹣－]/g, "-")
    .trim();
}

function load(): PickedPlace[] {
  try {
    const raw = localStorage.getItem(PICKED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((p): p is PickedPlace => !!p && typeof p.q === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.at))
      : [];
  } catch {
    return [];
  }
}

function save(list: PickedPlace[]): void {
  try {
    if (list.length) localStorage.setItem(PICKED_KEY, JSON.stringify(list.slice(0, PICKED_MAX)));
    else localStorage.removeItem(PICKED_KEY);
  } catch {
    // 保存できない端末では覚えない
  }
}

/** 前に地図で選んだ場所（無ければ undefined） */
export function recallPlace(q: string): PickedPlace | undefined {
  const k = placeKey(q);
  return k ? load().find((p) => placeKey(p.q) === k) : undefined;
}

/** 入れた住所・地番の場所として覚える（同じ住所・地番は新しい場所に置き換え、先頭に置く） */
export function rememberPlace(q: string, lat: number, lng: number, at: number = Date.now()): PickedPlace | undefined {
  const k = placeKey(q);
  if (!k || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const item = { q, lat, lng, at };
  save([item, ...load().filter((p) => placeKey(p.q) !== k)]);
  return item;
}

/** 覚えた場所を消す */
export function forgetPlace(q: string): void {
  const k = placeKey(q);
  save(load().filter((p) => placeKey(p.q) !== k));
}

/**
 * 調べた結果が、物件の場所としては確かでないか（ここから地図で選んだら覚える）：
 * 住所が見つからない・町の中心・番や番地の代表点・地番で探して筆が見つからない
 */
export function needsPick(result: LookupResult, query: string): boolean {
  if (result.status === "not_found") return true;
  if (result.status !== "ok" || result.picked) return false;
  if (result.parcel) return false;
  if (result.parcelMiss) return true;
  return placeSuffix(result, query) !== "";
}

/** 画面の短い日付（「11月21日」） */
export const placeDate = (at: number) => {
  const d = new Date(at);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

/** 覚えた場所を全部消す（PC の「履歴を全部消す」で一緒に消す） */
export function clearPlaces(): void {
  try {
    localStorage.removeItem(PICKED_KEY);
  } catch {
    // 消せない端末では何もしない
  }
}
