// PC の「並べて比較」：調べた物件の要点を、端末の中だけに残して横に並べる（顧客物件の住所なので、サーバーには送らない）。
// 比べる値は、物件の画面が読んだデータから作った「その時点の写し」（面積・坪・隣地・辺の数・道路の筆と接する長さ・用途地域・駅・
// 地価の地点・ハザード・調査の進み具合）。良し悪しは決めない（色で「良い値」を示さない。数は地図データからの目安）
import { historyKey, type HistoryItem } from "../history";

/** 並べられる数（PC の画面の幅で読める数） */
export const COMPARE_MAX = 4;
/** 中身が変わったら window に出すイベント（左の列の数と、比較の画面を出し直す） */
export const COMPARE_EVENT = "michilu:compare";
const KEY = "michilu:compare";

export type CompareItem = {
  /** 同じ物件の見分け（検索履歴と同じ。地図で選んだ地点は座標） */
  key: string;
  /** 開き直すときに調べる住所・地点 */
  item: HistoryItem;
  /** 大きく出す名前（地番か町名） */
  title: string;
  /** 市区町村と町名 */
  place: string;
  /** 筆の面積（㎡。地図データの形から） */
  area?: number;
  /** 推定の位置・地番参考図の筆（面積は 10㎡ 単位の目安） */
  rough?: boolean;
  neighbors?: number;
  corners?: number;
  /** 道路の筆と接する所（「南西 約12.3m」。地図データの目安） */
  road?: string;
  zoning?: string;
  station?: string;
  price?: string;
  hazard?: string;
  /** 次にやることの済んだ数と全部の数 */
  done?: number;
  total?: number;
  at: number;
};

const isItem = (v: unknown): v is CompareItem => !!v && typeof v === "object" && typeof (v as CompareItem).key === "string" && typeof (v as CompareItem).title === "string" && !!(v as CompareItem).item;

export function loadCompare(): CompareItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter(isItem).slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

/** 保存できたか（保存できなくても、開いている間は並べられる） */
function store(list: CompareItem[]): boolean {
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    ok = false;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPARE_EVENT));
  return ok;
}

/**
 * 加える（同じ物件はその場で新しい値に入れ替える）。いっぱいなら、いちばん古く加えたものを外す。
 * 加えた後の一覧と、外したもの（あれば）を返す
 */
export function addCompare(list: readonly CompareItem[], item: CompareItem): { list: CompareItem[]; dropped?: CompareItem; saved: boolean } {
  const i = list.findIndex((x) => x.key === item.key);
  if (i >= 0) {
    const next = list.map((x, j) => (j === i ? item : x));
    return { list: next, saved: store(next) };
  }
  const next = [...list, item];
  const dropped = next.length > COMPARE_MAX ? next.shift() : undefined;
  return { list: next, dropped, saved: store(next) };
}

export function removeCompare(list: readonly CompareItem[], key: string): CompareItem[] {
  const next = list.filter((x) => x.key !== key);
  store(next);
  return next;
}

export function clearCompare(): CompareItem[] {
  store([]);
  return [];
}

export const compareKey = (h: HistoryItem) => historyKey(h);

const TSUBO_M2 = 400 / 121;

/** 面積の字（目安の筆は 10㎡ 単位） */
export function areaCell(c: CompareItem): string | undefined {
  if (!c.area) return undefined;
  return c.rough ? `約${Math.round(c.area / 10) * 10}㎡` : `約${c.area.toFixed(1)}㎡`;
}

export function tsuboCell(c: CompareItem): string | undefined {
  if (!c.area) return undefined;
  return c.rough ? `約${Math.round(c.area / TSUBO_M2)}坪` : `${(c.area / TSUBO_M2).toFixed(1)}坪`;
}

/** 比較の表の行（左の見出しと、物件ごとの字。分からない所は「—」） */
export const COMPARE_ROWS: { label: string; note?: string; cell: (c: CompareItem) => string | undefined }[] = [
  { label: "面積", note: "地図データの筆の形から", cell: areaCell },
  { label: "坪", cell: tsuboCell },
  { label: "隣地", cell: (c) => (c.neighbors !== undefined ? `${c.neighbors}筆` : undefined) },
  { label: "辺の数", note: "形の目安", cell: (c) => (c.corners ? `${c.corners}` : undefined) },
  { label: "道路の筆と接する所", note: "地図データの目安", cell: (c) => c.road },
  { label: "用途地域", cell: (c) => c.zoning },
  { label: "最寄り駅", cell: (c) => c.station },
  { label: "近くの地価", cell: (c) => c.price },
  { label: "ハザード（目安）", cell: (c) => c.hazard },
  { label: "次にやること", cell: (c) => (c.total ? `${c.done ?? 0} / ${c.total} 済み` : undefined) },
];

/** 表の中身（行ごとに、物件の数だけの字） */
export function compareTable(items: readonly CompareItem[]): { label: string; note?: string; cells: string[] }[] {
  return COMPARE_ROWS.map((r) => ({ label: r.label, note: r.note, cells: items.map((c) => r.cell(c) ?? "—") }));
}
