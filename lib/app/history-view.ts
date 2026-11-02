// 履歴のページ（components/app/history.tsx）の、画面を持たない部分：絞り込み・同じ物件のまとめ・章（日付ごと・市区町村ごと）・
// 消す範囲（過去1時間・今日・今日と昨日・すべて）・コピーする文・日時の書き方・絞り込みの文字に合う所。
// お気に入り・書類・出力の一覧も、絞り込みと日時はここを使う（components/app/tab-pages.tsx から同じものを出している）
import type { HistoryItem } from "../history";
import { placeParts } from "./scene";

/** 調べ方の種類（住所・地番・地図で選んだ場所） */
export type Kind = "address" | "chiban" | "map";
export const KIND_LABEL: Record<Kind, string> = { address: "住所", chiban: "地番", map: "地図" };
export const kindOf = (h: HistoryItem): Kind => (h.ll ? "map" : placeParts(h).chiban ? "chiban" : "address");

const norm = (s: string) => s.normalize("NFKC");

/** 絞り込みの文字に合うか（町名・市区町村・住所のどこかに含む。全角・半角は同じに） */
export function matches(h: HistoryItem, q: string): boolean {
  const n = norm(q).trim();
  if (!n) return true;
  return `${h.city ?? ""} ${norm(h.address)}`.includes(n);
}

/**
 * 文字の中の、絞り込みの文字に合う所（最初の1か所）を [前・合う所・後] で返す（全角・半角は同じに見て探し、返す字は元の字のまま）。
 * 合わなければ null
 */
export function markOf(text: string, q: string): [string, string, string] | null {
  const n = norm(q).trim();
  if (!n) return null;
  // 1字ずつそろえた字をつなぎ、それぞれの字がどこから始まるかを覚えておく（そろえると字の数が変わることがあるので）
  const chars = Array.from(text);
  const starts: number[] = [];
  let joined = "";
  for (const c of chars) {
    starts.push(joined.length);
    joined += norm(c);
  }
  const i = joined.indexOf(n);
  if (i < 0) return null;
  const j = i + n.length;
  let a = 0;
  while (a + 1 < chars.length && starts[a + 1] <= i) a++;
  let b = a;
  while (b < chars.length && starts[b] < j) b++;
  return [chars.slice(0, a).join(""), chars.slice(a, b).join(""), chars.slice(b).join("")];
}

/** その日の0時（端末の時刻） */
function dayStart(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 何日前か（暦の日で数える。今日は 0） */
function daysAgo(t: number, now: number): number {
  return Math.round((dayStart(now) - dayStart(t)) / 86400000);
}

/** 日付ごとの章：「今日」「昨日」「1週間以内」「1か月以内」「それより前」 */
export function dayGroup(t: number, now: number): string {
  const diff = daysAgo(t, now);
  if (diff <= 0) return "今日";
  if (diff === 1) return "昨日";
  if (diff < 7) return "1週間以内";
  if (diff < 31) return "1か月以内";
  return "それより前";
}

const pad = (v: number) => String(v).padStart(2, "0");
const WEEK = "日月火水木金土";
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 行に出す日時（お気に入り・書類・出力の一覧も同じ）：今日・昨日は時刻だけ、それ以外は月日（年が違えば年も） */
export function when(t: number, now: number): string {
  const d = new Date(t);
  const diff = daysAgo(t, now);
  if (diff <= 1) return hm(d);
  return d.getFullYear() === new Date(now).getFullYear() ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 履歴の行の日時。日付ごとの章の中では、今日・昨日は時刻だけ、それより前は月日と曜日（年が違えば年も）。
 * 市区町村ごとの章の中では日付が分からないので、「今日 14:32」「昨日 9:05」と日も付ける
 */
export function stamp(t: number, now: number, withDay: boolean): string {
  const d = new Date(t);
  const diff = daysAgo(t, now);
  if (diff <= 1) return withDay ? `${diff <= 0 ? "今日" : "昨日"} ${hm(d)}` : hm(d);
  if (d.getFullYear() !== new Date(now).getFullYear()) return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
}

/** くわしい日時「2026年11月1日（日）14:32」 */
export function fullDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）${hm(d)}`;
}

/** 同じ物件（信頼できる識別情報が同じ。lib/property-id.ts）をひとつの行にまとめたもの。item はいちばん新しい検索 */
export type Grouped = { item: HistoryItem; kinds: Kind[]; members: HistoryItem[] };

/** 新しい順のまま、同じ物件をひとつの行にまとめる */
export function groupByProperty(list: readonly HistoryItem[]): Grouped[] {
  const out: Grouped[] = [];
  const byPid = new Map<string, Grouped>();
  for (const h of list) {
    const k = kindOf(h);
    const g = h.pid ? byPid.get(h.pid) : undefined;
    if (g) {
      if (!g.kinds.includes(k)) g.kinds.push(k);
      g.members.push(h);
      continue;
    }
    const n: Grouped = { item: h, kinds: [k], members: [h] };
    out.push(n);
    if (h.pid) byPid.set(h.pid, n);
  }
  return out;
}

/** 一覧の章（見出しと行） */
export type Section = { label: string; rows: Grouped[] };

/** 対応エリアの外（市区町村が分からない）の章の名前 */
export const OUTSIDE = "対応エリアの外";

/**
 * 章に分ける。日付ごと（新しい順のまま、今日・昨日・1週間以内…）か、市区町村ごと（最近調べた市区町村から。章の中は新しい順）
 */
export function sections(rows: readonly Grouped[], byCity: boolean, now: number): Section[] {
  const out: Section[] = [];
  if (byCity) {
    const map = new Map<string, Section>();
    for (const g of rows) {
      const label = g.item.city || OUTSIDE;
      const s = map.get(label);
      if (s) s.rows.push(g);
      else {
        const n = { label, rows: [g] };
        map.set(label, n);
        out.push(n);
      }
    }
    return out;
  }
  for (const g of rows) {
    const label = dayGroup(g.item.at, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.rows.push(g);
    else out.push({ label, rows: [g] });
  }
  return out;
}

/** まとめて消す範囲 */
export type Range = "hour" | "today" | "twoDays" | "all";
export const RANGES: { key: Range; label: string }[] = [
  { key: "hour", label: "過去1時間" },
  { key: "today", label: "今日" },
  { key: "twoDays", label: "今日と昨日" },
  { key: "all", label: "すべて" },
];

/** その範囲に入る検索か（過去1時間は今から60分、今日・今日と昨日は暦の日で数える） */
export function inRange(h: HistoryItem, range: Range, now: number): boolean {
  if (range === "all") return true;
  if (range === "hour") return now - h.at <= 3600000;
  return daysAgo(h.at, now) <= (range === "today" ? 0 : 1);
}

/** 範囲ごとの件数 */
export function rangeCounts(list: readonly HistoryItem[], now: number): Record<Range, number> {
  const c: Record<Range, number> = { hour: 0, today: 0, twoDays: 0, all: 0 };
  for (const h of list) for (const r of RANGES) if (inRange(h, r.key, now)) c[r.key]++;
  return c;
}

/** コピーするものの名前（地番・住所・地図で選んだ場所） */
export function copyLabel(h: HistoryItem): "地番" | "住所" | "場所" {
  const k = kindOf(h);
  return k === "chiban" ? "地番" : k === "map" ? "場所" : "住所";
}

/**
 * コピーする文。地番・住所は調べた文字のまま（先頭の「地番」は外す。市区町村を書かずに調べたものは市区町村を前に付ける）。
 * 地図で選んだ場所は、町名と緯度・経度（地図のアプリに貼れる）
 */
export function copyText(h: HistoryItem): string {
  const raw = norm(h.address).replace(/^地番\s*/, "").replace(/\s+/g, " ").trim();
  if (h.ll) return `${raw}（${h.ll[0].toFixed(5)}, ${h.ll[1].toFixed(5)}）`;
  const city = h.city ? norm(h.city) : "";
  return city && !raw.includes(city) ? `${city}${raw}` : raw;
}

/**
 * あなたの確認の記録の札の文（「確認済み：道路・一部：ハザード」「一部確認：ハザード」。3項目より多いときは数で）。記録が無ければ空
 */
export function recordsText(t: { all: string[]; partial: string[] }): string {
  const names = (a: string[]) => (a.length <= 2 ? a.join("・") : `${a.length}項目`);
  if (!t.all.length) return t.partial.length ? `一部確認：${names(t.partial)}` : "";
  return `確認済み：${names(t.all)}${t.partial.length ? `・一部：${names(t.partial)}` : ""}`;
}

/** 消したあとの「元に戻す」の文 */
export function removedText(items: readonly HistoryItem[]): string {
  if (items.length !== 1) return `${items.length}件を消しました`;
  const { town, full } = placeParts(items[0]);
  return `「${town || full}」を消しました`;
}
