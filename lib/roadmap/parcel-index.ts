// 地番の索引の読み込み。市区町村コードごとの JSON（scripts/parcel-tiles/build_pref.py の write_index。R2 の parcels/<年>/index/<code>.json）に、
// 地番区域 → [z16 のタイル x, y, そのタイルの地番の番号（枝番の前）の最小, 最大] が入っている。地番検索は、まずこの索引で番号が入っている
// タイルを開く（広い大字で、国土地理院の町の代表点から遠い所にある筆も探せる）。読めなければ null（今までの探し方だけを使う）
import { PARCEL_DATA } from "./parcel-data";

export type ParcelIndex = {
  v: 1;
  z: number;
  /** 地番区域 → [x, y, 最小, 最大][] */
  k: Record<string, [number, number, number, number][]>;
};

const cache = new Map<string, Promise<ParcelIndex | null>>();

/** 市区町村コード（5桁）の索引。置き場所が設定されていない・無い（404）・形が違うときは null */
export function loadParcelIndex(code: string, template: string = PARCEL_DATA.index): Promise<ParcelIndex | null> {
  if (!template || !/^\d{5}$/.test(code)) return Promise.resolve(null);
  const url = template.replace("{code}", code);
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then(async (r) => {
        if (!r.ok) return null;
        const j = (await r.json()) as Partial<ParcelIndex> | null;
        return j && j.v === 1 && j.z === 16 && j.k && typeof j.k === "object" ? (j as ParcelIndex) : null;
      })
      .catch(() => {
        // 通信の失敗は覚えない（戻れば読み直す）
        cache.delete(url);
        return null;
      });
    cache.set(url, p);
  }
  return p;
}
