// 「次にやること」の済んだ印。物件（地点）ごとに端末の localStorage にだけ置く（顧客物件なのでサーバーには送らない）。
// プライベートブラウズ等で localStorage が使えなければ、印は残らないが画面は動く
const KEY = "michilu:checklist";
/** 覚えておく物件の数（古いものから消す） */
const MAX = 100;

type Stored = Record<string, { done: string[]; at: number }>;

/** 物件の鍵（地点。同じ物件を住所と地図で調べても同じになるよう、緯度・経度を5桁で） */
export const checklistKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Stored) : {};
  } catch {
    return {};
  }
}

function save(all: Stored): void {
  // 古い物件から消して、覚える数を抑える
  const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
  const kept: Stored = {};
  for (const k of keys.slice(0, MAX)) kept[k] = all[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // 保存できなくても画面は続ける
  }
}

/** 書き出し用：全部 */
export function exportChecklist(): Stored {
  return load();
}

/** 読み込み（書き出したファイルから）：足すだけ。同じ物件は印を合わせる。足した物件の数を返す */
export function mergeChecklist(incoming: Stored): number {
  const all = load();
  let added = 0;
  for (const [k, v] of Object.entries(incoming ?? {})) {
    if (!v || !Array.isArray(v.done)) continue;
    const mine = all[k];
    const done = new Set([...(mine?.done ?? []), ...v.done.filter((d) => typeof d === "string")]);
    if (!mine || done.size > mine.done.length) added++;
    all[k] = { done: [...done], at: Math.max(mine?.at ?? 0, typeof v.at === "number" ? v.at : 0) };
  }
  save(all);
  return added;
}

/** 済んだやることの印（id の集まり） */
export function loadDone(key: string): Set<string> {
  return new Set(load()[key]?.done ?? []);
}

/** 済・未済を入れ替えて、保存後の印を返す */
export function toggleDone(key: string, id: string): Set<string> {
  const all = load();
  const done = new Set(all[key]?.done ?? []);
  if (done.has(id)) done.delete(id);
  else done.add(id);
  if (done.size) all[key] = { done: [...done], at: Date.now() };
  else delete all[key];
  save(all);
  return done;
}
