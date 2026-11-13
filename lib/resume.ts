// 調査の再開：物件ごとに、開いていたタブ・開いていたシート・スクロール位置を端末の localStorage に残す（サーバーには送らない）。
// 公式道路図や電話から戻ったとき、履歴から開いたときに、前回見ていた所から続けられる。ホームの「続きから」は直近7日の物件
const KEY = "michilu:resume";
/** 覚えておく物件の数 */
const MAX = 50;
/** 「続きから」に出す期限（日） */
export const RESUME_DAYS = 7;

export type Resume = {
  /** 物件の鍵（lib/property-id.ts） */
  pid: string;
  /** 画面に出す名前（住所） */
  label: string;
  /** 履歴の行と結びつける鍵（住所、地図で選んだ地点は座標） */
  historyKey: string;
  /** 地図で選んだ地点（座標で調べ直す） */
  ll?: [number, number];
  /** 開いていたタブ（basic / around / price / law / hazard / deals） */
  tab: string;
  /** 開いていたシート（無ければ空） */
  sheet?: string;
  scroll: number;
  at: number;
};

type Stored = Record<string, Resume>;

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
  const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
  const kept: Stored = {};
  for (const k of keys.slice(0, MAX)) kept[k] = all[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // 保存できなくても画面は続ける
  }
}

/** 物件の再開の記録（RESUME_DAYS 日より前のものは返さない） */
export function loadResume(pid: string, now = Date.now()): Resume | undefined {
  const r = pid ? load()[pid] : undefined;
  return r && now - r.at <= RESUME_DAYS * 86400e3 ? r : undefined;
}

export function saveResume(r: Omit<Resume, "at">): void {
  if (!r.pid) return;
  const all = load();
  all[r.pid] = { ...r, at: Date.now() };
  save(all);
}

/** 直近（RESUME_DAYS 日以内）に開いていた物件（無ければ undefined） */
export function latestResume(now = Date.now()): Resume | undefined {
  const list = Object.values(load()).sort((a, b) => b.at - a.at);
  const r = list[0];
  return r && now - r.at <= RESUME_DAYS * 86400e3 ? r : undefined;
}

export function clearResume(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
