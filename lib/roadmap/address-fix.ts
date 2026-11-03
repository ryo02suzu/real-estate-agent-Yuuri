// 住所の書き間違いを直して、その土地を出す（Google の「次の検索結果を表示しています」と同じ考え方）。
// 国土地理院の住所検索は名前を文字どおりに照合するため、「宇都宮南大通り」（市が抜け）・「南大道り」（漢字の誤字）・
// 「髙田馬場」（旧字）・「横浜市中区みなとみらい」（区の違い）・「大宮市」（合併前の市の名前）・「宇津宮市」（市の名前の誤字）では、
// 町・市の中心や、別の県の似た名前に当たる。関東の市区町村の名前と、国土地理院が返した正式な町名に合わせて探し直し
// （最大4回）、入れた住所をより細かく説明できたときだけ使う。何をどう直したか（「南大道り」→「南大通り」）を返して画面に小さく出す。
// 直しきれずに別の町に当たったときも、そのことを返す（黙って別の町を出さない）。住所は国土地理院の API にだけ送る
import GSI_CODES from "./data/gsi-muni-codes.json";
import { addressNumbers, geocodeCandidates, type GeocodeResult } from "./geocode";

type Muni = { pref: string; name: string; city: string; ward?: string };

/** 国土地理院の住所を、都道府県・市区町村・町名・番地に分けたもの */
export type Official = { pref: string; muni: string; city: string; ward?: string; town: string; num: string };

/** 直して出したことの説明（「南大道り」→「南大通り」）。query は直して探した住所（無ければ国土地理院が自分で読み替えた） */
export type AddressFix = { input: string; query?: string; from: string; to: string };

/** 入れた町名が見つからず、別の町（kind: town）か市区町村の中心（kind: city）を出している */
export type AddressMiss = { typed: string; found: string; kind: "town" | "city" };

const PREF = /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/;
/** 番地の始まり（数字か「一丁目」） */
const NUM = /[0-9]|[一二三四五六七八九十]+丁目/;

/** 関東の市区町村（政令市は「横浜市西区」と「横浜市」の両方）。長い名前から順に */
const MUNIS: Muni[] = (() => {
  const out: Muni[] = [];
  const cities = new Set<string>();
  for (const [pref, codes] of Object.entries(GSI_CODES as Record<string, Record<string, string>>)) {
    for (const raw of Object.values(codes)) {
      const [city, ward] = raw.trim().split(/\s+/);
      out.push(ward ? { pref, name: city + ward, city, ward } : { pref, name: city, city });
      if (ward && !cities.has(pref + city)) {
        cities.add(pref + city);
        out.push({ pref, name: city, city });
      }
    }
  }
  return out.sort((a, b) => b.name.length - a.name.length);
})();

/** 地名によく出る旧字・異体字 → いまの字（国土地理院は「髙」などを読み替えない） */
const OLD: Record<string, string> = {
  髙: "高", 﨑: "崎", 嵜: "崎", 邊: "辺", 邉: "辺", 澤: "沢", 濱: "浜", 冨: "富", 德: "徳", 國: "国", 櫻: "桜", 廣: "広",
  舊: "旧", 學: "学", 驛: "駅", 圓: "円", 關: "関", 鐵: "鉄", 黑: "黒", 條: "条", 齋: "斎", 齊: "斉", 藏: "蔵", 萬: "万",
  澁: "渋", 淺: "浅", 榮: "栄", 惠: "恵", 眞: "真", 實: "実", 壽: "寿", 龜: "亀", 嶋: "島", 嶌: "島", 峯: "峰", 曻: "昇",
  兒: "児", 縣: "県", 塲: "場", 舩: "船", 增: "増", 槗: "橋",
};
const OLD_RE = new RegExp(`[${Object.keys(OLD).join("")}]`, "g");
/** 旧字をいまの字に */
export const newForm = (s: string) => s.replace(OLD_RE, (c) => OLD[c] ?? c);
/** 名前を比べるときの形：ヶ・ケ・ヵ・が、竜・龍を同じに（1字ずつの置き換えなので、長さは変わらない） */
const vary = (s: string) => newForm(s).replace(/[ヶヵケが]/g, "ケ").replace(/竜/g, "龍");
/** 町名の書き方の揺れ（送り仮名の「り」、「ノ」「ヶ」「ッ」など）を除いた形。「南大通」と「南大通り」を同じと見る */
const loose = (s: string) => vary(s.normalize("NFKC")).replace(/[りリのノケ之ッツ]/g, "");

/** 2つの文字列の違いの数（1字の足す・消す・置き換えを1と数える） */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** 町名の違いをいくつまで「書き間違い」と見るか（2字の町は同じでないとだめ。3〜5字は1字、6字以上は2字まで） */
function allowance(a: string, b: string): number {
  const n = Math.min([...loose(a)].length, [...loose(b)].length);
  return n >= 6 ? 2 : n >= 3 ? 1 : 0;
}

/** 入れた町名と正式な町名が、書き間違い・書き方違いの範囲で同じか（途中まで入れた「南大」→「南大通り」も同じと見る） */
export function similarTown(typed: string, official: string): boolean {
  const a = loose(typed);
  const b = loose(official);
  if (a === b) return true;
  if ([...a].length >= 2 && b.startsWith(a)) return true;
  return editDistance(a, b) <= allowance(typed, official);
}

/** 入れた住所を、都道府県・場所（市区町村と町名。空白・郡・大字を除く）・番地に分ける */
export function typedParts(input: string): { pref: string; place: string; num: string } {
  let s = input.normalize("NFKC").replace(/^〒?\s*\d{3}-?\d{4}\s*/, "").trim();
  const pref = s.match(PREF)?.[1] ?? "";
  s = s.slice(pref.length);
  const at = s.search(NUM);
  let place = (at < 0 ? s : s.slice(0, at)).replace(/\s+/g, "").replace(/大字/g, "");
  // 「西多摩郡瑞穂町」の郡（国土地理院の住所に郡は無い）
  const county = place.match(/^(.{1,4}?郡)(.+)$/);
  if (county && MUNIS.some((m) => county[2].startsWith(m.name))) place = county[2];
  return { pref, place, num: at < 0 ? "" : s.slice(at).trim() };
}

/** 国土地理院の住所（「栃木県宇都宮市南大通り一丁目２番３号」）を分ける。都道府県で始まらない（施設の名前など）なら null */
export function splitOfficial(address: string): Official | null {
  const s = address.normalize("NFKC").replace(/\s+/g, "");
  const pref = s.match(PREF)?.[1];
  if (!pref) return null;
  const rest = s.slice(pref.length);
  const m = MUNIS.find((x) => x.pref === pref && rest.startsWith(x.name));
  // 関東の外は名前の表が無いので、最初の「市・区・町・村」まで
  const muni = m?.name ?? rest.match(/^.+?[市区町村]/)?.[0] ?? "";
  const after = rest.slice(muni.length);
  const at = after.search(NUM);
  return { pref, muni, city: m?.city ?? muni, ward: m?.ward, town: at < 0 ? after : after.slice(0, at), num: at < 0 ? "" : after.slice(at) };
}

/** head で始まるなら、その後ろ（ヶ・ケ、旧字の違いは同じと見る） */
const after = (s: string, head: string) => (head && vary(s).startsWith(vary(head)) ? s.slice(head.length) : null);

/**
 * 入れた場所から、市区町村を外した町名。市区町村の書き方が分からなければ null。
 * 「宇都宮市南大通り」「宇都宮南大通り」（市が抜け）「横浜市中区みなとみらい」（政令市の別の区）「大宮区桜木町」（市を省いた）
 * 「日野本町」（市を書かずに町名だけ。町名が市の名前で始まる）。読み方が2つ以上あれば、正式な町名にいちばん近い読み方
 */
function townOf(place: string, off: Official): string | null {
  const wards = MUNIS.filter((m) => m.pref === off.pref && m.city === off.city && m.ward).map((m) => m.ward!);
  const dropWard = (r: string) => {
    const w = wards.find((x) => after(r, x) !== null);
    return w ? r.slice(w.length) : r;
  };
  const options: string[] = [];
  const full = after(place, off.muni);
  if (full !== null) options.push(full);
  if (off.ward) {
    const city = after(place, off.city);
    if (city !== null) options.push(dropWard(city));
    const ward = after(place, off.ward);
    if (ward !== null) options.push(ward);
  }
  const stem = off.city.slice(0, -1);
  if ([...stem].length >= 2) {
    const r = after(place, stem);
    if (r && !/^[市区町村]/.test(r)) options.push(dropWard(r));
  }
  // 市区町村を書かずに町名から（「市」「区」が無い）
  if (!/[市区]/.test(place)) options.push(place);
  if (!options.length) return null;
  if (!off.town) return options[0];
  const gap = (x: string) => editDistance(loose(x), loose(off.town));
  return options.reduce((a, b) => (gap(b) < gap(a) ? b : a));
}

/** 入れた市区町村（関東の名前で、はっきり書いてあるとき）。分からなければ空 */
function typedMunis(query: string): Muni[] {
  const t = typedParts(query);
  const hit = MUNIS.filter((m) => (!t.pref || m.pref === t.pref) && t.place.startsWith(m.name));
  return hit.length ? hit.filter((m) => m.name.length === hit[0].name.length) : [];
}

/**
 * 市区町村の名前の書き間違いを直した住所（直す所が無ければ null）：
 * 「市・区」が抜けた（宇都宮南大通り → 宇都宮市南大通り、横浜西区 → 横浜市西区）、合併前の市の名前（大宮市 → さいたま市大宮区）、
 * 1字違い（宇津宮市 → 宇都宮市）。どれも関東の市区町村の名前で1つに決まるときだけ
 */
export function fixMunicipality(query: string): string | null {
  const t = typedParts(query);
  if (!t.place) return null;
  const pool = t.pref ? MUNIS.filter((m) => m.pref === t.pref) : MUNIS;
  if (pool.some((m) => t.place.startsWith(m.name))) return null;
  const out = new Set<string>();
  for (const m of pool) {
    const stem = m.city.slice(0, -1);
    if ([...stem].length < 2 || !t.place.startsWith(stem)) continue;
    const rest = t.place.slice(stem.length);
    // 「中央区」と「中央市」のように、続く字が別の名前の終わりなら別の市区町村
    if (rest && !/^[市区町村郡]/.test(rest)) out.add(m.city + rest);
  }
  const old = t.place.match(/^(.{2,4}?)市(.+)$/);
  if (!out.size && old) for (const m of pool) if (m.ward && m.ward.slice(0, -1) === old[1]) out.add(m.name + old[2]);
  const tok = t.place.match(/^(.{2,5}?[市区町村])(.+)$/);
  if (!out.size && tok && [...tok[1]].length >= 3) {
    for (const m of pool) if (!m.ward && m.city.length === tok[1].length && editDistance(newForm(tok[1]), m.city) === 1) out.add(m.city + tok[2]);
  }
  return out.size === 1 ? `${t.pref}${[...out][0]}${t.num}` : null;
}

/**
 * 町名の書き間違いを直した住所。国土地理院が町までしか一致しなかったとき、返した町名の候補（入れた町名と頭がそろう町）から、
 * 書き間違いの範囲で近いものを選ぶ。近さが同じ町が2つ以上なら、選んでもらう（choices）
 */
export function fixTown(query: string, cands: GeocodeResult[]): { query: string } | { choices: GeocodeResult[] } | null {
  const off = cands[0] && splitOfficial(cands[0].matchedAddress);
  if (!off || !off.town || off.num) return null;
  const t = typedParts(query);
  const typed = townOf(t.place, off);
  if (!typed || typed === off.town) return null;
  const towns = new Map<string, GeocodeResult>();
  for (const c of cands) {
    const o = splitOfficial(c.matchedAddress);
    if (o && o.pref === off.pref && o.muni === off.muni && o.town && !o.num && !towns.has(o.town)) towns.set(o.town, c);
  }
  const near = [...towns.keys()]
    .map((town) => ({ town, d: editDistance(loose(typed), loose(town)) }))
    .filter((x) => x.d <= allowance(typed, x.town));
  if (!near.length) return null;
  const best = Math.min(...near.map((x) => x.d));
  const top = near.filter((x) => x.d === best);
  const q = (town: string) => `${off.pref}${off.muni}${town}${t.num}`;
  if (top.length > 1) return { choices: top.map((x) => ({ ...towns.get(x.town)!, matchedAddress: q(x.town) })) };
  return { query: q(top[0].town) };
}

/**
 * 政令市で、入れた区に町が無く区（市）までしか一致しなかったとき、町名だけで探して同じ市の中の区を選ぶ
 * （「横浜市中区みなとみらい」→ 西区。区が2つ以上に分かれるなら直さない）
 */
async function fixWard(query: string, cands: GeocodeResult[], search: (q: string) => Promise<GeocodeResult[]>) {
  const off = cands[0] && splitOfficial(cands[0].matchedAddress);
  if (!off || off.town || !MUNIS.some((m) => m.pref === off.pref && m.city === off.city && m.ward)) return null;
  const t = typedParts(query);
  const town = townOf(t.place, off);
  if (!town) return null;
  const got = (await search(`${town}${t.num}`)).filter((g) => {
    const o = splitOfficial(g.matchedAddress);
    return !!o && o.pref === off.pref && o.city === off.city && !!o.ward && !!o.town;
  });
  const wards = new Set(got.map((g) => splitOfficial(g.matchedAddress)!.muni));
  if (wards.size !== 1) return null;
  const o = splitOfficial(got[0].matchedAddress)!;
  return { query: `${o.pref}${o.muni}${town}${t.num}`, candidates: got };
}

/**
 * 結果が入れた住所をどこまで説明できているか：0 = 別の市区町村・住所でない、1 = 市区町村まで（町が見つからない）、
 * 2 = 別の町、3 = 入れた町（書き方違いを含む）、そのあと番地の数が1つ合うごとに +2
 */
function quality(query: string, r: GeocodeResult | undefined, intended: Muni[]): number {
  const off = r && splitOfficial(r.matchedAddress);
  if (!off) return 0;
  if (intended.length && !intended.some((m) => off.muni === m.name || (!m.ward && off.city === m.city))) return 0;
  const t = typedParts(query);
  const town = townOf(t.place, off);
  if (!off.town) return town ? 1 : 3;
  if (town && !similarTown(town, off.town)) return 2;
  const want = addressNumbers(t.num).slice(0, 3);
  const got = addressNumbers(off.num);
  let k = 0;
  while (k < want.length && got[k] === want[k]) k++;
  return 3 + 2 * k;
}

/**
 * 書き間違いを直して探し直す。直さなくてよい（番地まで合っている・直す所が無い）なら null。
 * query：直して探した住所、candidates：その結果。choices：近い名前の町が2つ以上あって決められない（選んでもらう）
 */
export async function correctAddress(
  input: string,
  first: GeocodeResult[],
  search: (q: string) => Promise<GeocodeResult[]> = geocodeCandidates,
  maxCalls = 4,
): Promise<{ query: string; candidates: GeocodeResult[] } | { choices: GeocodeResult[] } | null> {
  const q0 = input.normalize("NFKC").replace(/\s+/g, " ").trim();
  // 施設の名前などに当たった（住所の形でない）ときは触らない
  if (first[0] && !splitOfficial(first[0].matchedAddress)) return null;
  const muniFix = fixMunicipality(q0);
  const full = 3 + 2 * Math.min(addressNumbers(typedParts(q0).num).length, 3);
  let cur = { q: q0, cands: first, score: quality(q0, first[0], typedMunis(muniFix ?? q0)) };
  const tried = new Set([q0]);
  let calls = 0;
  const take = (q: string, cands: GeocodeResult[]) => {
    const score = quality(q, cands[0], typedMunis(q));
    // 入れた町まで説明できて、前より細かいときだけ使う（市区町村の中心だけ・別の町なら使わない）
    if (score >= 3 && score > cur.score) cur = { q, cands, score };
  };
  const attempt = async (q: string | null) => {
    if (!q || tried.has(q) || calls >= maxCalls || cur.score >= full) return;
    tried.add(q);
    calls++;
    // 探し直しが通信で失敗しても、最初の結果は出す（直せなかっただけ）
    take(q, await search(q).catch(() => []));
  };
  await attempt(muniFix);
  const old = newForm(cur.q);
  await attempt(old === cur.q ? null : old);
  if (cur.score < full) {
    const t = fixTown(cur.q, cur.cands);
    if (t && "choices" in t) return { choices: t.choices };
    await attempt(t?.query ?? null);
  }
  if (cur.score < full && calls < maxCalls) {
    calls++;
    const w = await fixWard(cur.q, cur.cands, search).catch(() => null);
    if (w) take(w.query, w.candidates);
  }
  return cur.q === q0 ? null : { query: cur.q, candidates: cur.cands };
}

/** 直したことを短く：同じ市区町村の名前は外す（「宇都宮市南大道り」→「南大道り」と「南大通り」） */
function fixLabel(place: string, off: Official): { from: string; to: string } {
  const full = after(place, off.muni);
  if (full !== null) return { from: full, to: off.town };
  if (off.ward) {
    const city = after(place, off.city);
    if (city !== null) return { from: city, to: off.ward + off.town };
    const ward = after(place, off.ward);
    if (ward !== null) return { from: ward, to: off.town };
  }
  return { from: place, to: off.muni + off.town };
}

/**
 * 入れた住所と、出す住所の違いを説明する。直して出したなら fix（「南大道り」→「南大通り」）、
 * 入れた町名が見つからず別の町・市区町村の中心なら miss。同じ（都道府県・市を省いただけ、大字・小字の有り無し）なら null。
 * used は直して探した住所（このときは必ず fix を返す）
 */
export function describeMatch(input: string, matched: string, used?: string): { fix?: { from: string; to: string }; miss?: AddressMiss } | null {
  const off = splitOfficial(matched);
  if (!off) return null;
  const t = typedParts(input);
  // 小字（「下奈良字東原」の「字東原」）は国土地理院の住所に無いので外して比べる
  const place = off.town.includes("字") ? t.place : t.place.replace(/(.)字[^字]+$/, "$1");
  if (!place) return null;
  const official = off.muni + off.town;
  if (!used && vary(official).endsWith(vary(place))) return null;
  if (used) return { fix: fixLabel(place, off) };
  const town = townOf(place, off);
  if (!off.town) return town ? { miss: { typed: town, found: off.muni, kind: "city" } } : null;
  if (town === null) return null;
  if (!similarTown(town, off.town)) {
    // 「南大通り○○マンション」のように、正式な町名のあとに建物名などが続くだけなら言わない
    if (vary(town).startsWith(vary(off.town)) && !t.num) return null;
    return { miss: { typed: town, found: off.town, kind: "town" } };
  }
  return { fix: fixLabel(place, off) };
}

/** to の1字ずつが、from から変わった字か（直した字を目立たせる。共通の並び（LCS）に無い字が変わった字） */
export function changedMarks(from: string, to: string): boolean[] {
  const a = [...from];
  const b = [...to];
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const marks = new Array<boolean>(b.length).fill(true);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      marks[j] = false;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return marks;
}
