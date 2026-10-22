// 最近の検索のカードに出す町の写真（public/home/scenes/）と、カードの見出し・日時。
// その土地の本当の写真は出せないので、町の種類に合う写真を出す。町の種類を国・自治体のデータ（用途地域・地形・人口・駅など）から
// 決める仕組みは、写真の種類がそろってから作る（docs/scene-photos.md）。それまでは仮に、住宅地の4枚から物件ごとに1枚を出す
import { historyKey, type HistoryItem } from "../history";

/** 写真の種類。y は横長に切り抜くときの縦の位置（%。写真の見せたい所） */
export const SCENES = {
  rural: { label: "田舎の住宅地", y: 64 },
  mountain: { label: "山あいの住宅地", y: 58 },
  coast: { label: "海沿いの住宅地", y: 48 },
  suburb: { label: "郊外の戸建て街", y: 52 },
  upscale: { label: "高級住宅街", y: 46 },
  newtown: { label: "新興住宅街", y: 58 },
  urban: { label: "都会の住宅地", y: 50 },
  station: { label: "駅前の街中", y: 62 },
  office: { label: "オフィス街", y: 42 },
  bay: { label: "湾岸エリア", y: 60 },
} as const;
export type SceneKey = keyof typeof SCENES;

export const sceneSrc = (k: SceneKey) => `/home/scenes/${k}.webp`;

/** 仮の写真に使う住宅地の4枚 */
const PLACEHOLDER: readonly SceneKey[] = ["suburb", "newtown", "upscale", "urban"];

function hash(s: string): number {
  let n = 0;
  for (const c of s) n = (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0;
  return n;
}

/**
 * 並んだカードの仮の写真。物件ごとに決まった1枚（住所・座標から）で、並んだカードで同じ写真が続くときは次の写真にする
 */
export function placeholderScenes(items: readonly HistoryItem[]): SceneKey[] {
  const used = new Set<SceneKey>();
  return items.map((h) => {
    const start = hash(historyKey(h)) % PLACEHOLDER.length;
    for (let i = 0; i < PLACEHOLDER.length; i++) {
      const k = PLACEHOLDER[(start + i) % PLACEHOLDER.length];
      if (!used.has(k) || used.size >= PLACEHOLDER.length) {
        used.add(k);
        return k;
      }
    }
    return PLACEHOLDER[start];
  });
}

const PREF = /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/;

/** 町名まで（丁目まで。番地・号・地番・建物名は外す）。「上野毛3丁目1-2」→「上野毛3丁目」、「大宮区桜木町1-7-5」→「大宮区桜木町」 */
function townOf(s: string): string {
  const chome = s.match(/^(.*?(?:\d+|[一二三四五六七八九十]+)丁目)/);
  if (chome) return chome[1];
  return s.replace(/\s*\d.*$/, "").trim() || s;
}

/**
 * カードの見出し。デザインの絵と同じく、市区町村と町名（丁目まで）にする（「世田谷区 上野毛3丁目」）。番地まで入れた住所は full。
 * 地番で調べたものは先頭の「地番」を外して chiban を立てる
 */
export function placeTitle(h: HistoryItem): { title: string; full: string; chiban: boolean } {
  const raw = h.address.normalize("NFKC").replace(/\s+/g, " ").trim();
  const chiban = /^地番/.test(raw);
  const rest = raw.replace(/^地番\s*/, "").replace(PREF, "").trim();
  const city = h.city;
  if (!city) return { title: townOf(rest), full: rest, chiban };
  // 市区町村を書かずに調べたもの（「神南1-19-11」）は、前に市区町村を付ける
  const town = rest.startsWith(city) ? rest.slice(city.length).trim() : rest.includes(city) ? "" : rest;
  if (!town) return { title: rest.includes(city) && !rest.startsWith(city) ? townOf(rest) : city, full: rest || city, chiban };
  return { title: `${city} ${townOf(town)}`, full: `${city} ${town}`, chiban };
}

/** 「2026/04/26 14:32」 */
export function stamp(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
