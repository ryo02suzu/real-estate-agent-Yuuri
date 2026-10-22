// 地番から筆（登記上の土地の区画）の場所を探す。
// 法務省の登記所備付地図データをベクトルタイル（PMTiles、レイヤ fude、z16 で全件）にしたものを、
// 国土地理院で調べた町・大字の代表点のまわりから近い順に読み、地番区域と地番が一致する筆を探す。
// タイルの読み込みは ParcelSource に任せる（実物は parcel-tiles.ts、テストでは作り物を渡す）。
import { SANKO_MARK } from "./sanko-data";

/** 筆を探すタイルのズーム（このズームのタイルに全ての筆が入っている） */
export const PARCEL_ZOOM = 16;

/** [経度, 緯度] */
export type LngLat = [number, number];
/** ポリゴン（外周と穴の輪の配列） */
export type Polygon = LngLat[][];

/**
 * 公図（任意座標）を道路縁に合わせて置いた、推定の位置の筆の確かさ（lib/roadmap/kozu-data.ts）。
 * "high"：道路縁によく合い、ほかの置き方とはっきり差がある（港北区で 9 割が 1.5m 以内）。"low"：それより確かさが低い（2〜5m ずれることが多い）
 */
export type Estimated = "high" | "low";

export type ParcelFeature = {
  /** 地番区域（「熊谷市_下奈良___」「川口市_青木_２丁目__」：市区町村_大字_丁目_小字） */
  kuiki: string;
  /** 地番（「391-3」。道路・水路は「道-199」「水-154」など） */
  chiban: string;
  /** 筆の形（必要になったときだけ作る） */
  polygons: () => Polygon[];
  /** 公図（任意座標）を道路縁に合わせて置いた、推定の位置の筆とその確かさ */
  estimated?: Estimated;
  /** 市町村の地番参考図の筆（その市区町村コード。lib/roadmap/sanko-data.ts） */
  sanko?: string;
};

export type ParcelSource = {
  /** z16 のタイル（x, y）の筆。タイルが無ければ null（地図データの無い地域） */
  tile(x: number, y: number): Promise<ParcelFeature[] | null>;
};

/** 筆の一部（タイルごとに切り分けられている。表示するときはタイルの範囲で切り抜く） */
export type ParcelPiece = { polygons: Polygon[]; tile: [number, number] };

export type Parcel = {
  kuiki: string;
  /** そろえた地番（「391-3」） */
  chiban: string;
  /** データのままの地番（地図の絞り込みに使う） */
  chibanRaw: string;
  /** 地番の後ろに印のある筆（二重地番など）で、同じ筆として合わせた区画の、データのままの地番（「51-3W1」「51-3W2」） */
  chibanRaws?: string[];
  pieces: ParcelPiece[];
  /** 筆の中の代表点（物件の場所として使う） */
  point: { lat: number; lng: number };
  /** 公図から推定した位置の筆（数mずれることがある）とその確かさ */
  estimated?: Estimated;
  /** 市町村の地番参考図の筆（その市区町村コード） */
  sanko?: string;
  /** 登記所の地図では筆界未定地の所の、地番参考図の筆 */
  undetermined?: boolean;
};

export type ParcelSearch =
  | { status: "found"; parcel: Parcel; /** 同じ町に同じ地番の別の筆（小字違いなど）がいくつあったか */ others: number }
  | { status: "not_found"; /** 枝番違いなど、近い地番 */ similar: string[] }
  | { status: "no_map" };

/** 地番の「の」に当たる区切り（ハイフンのいろいろな書き方。「-」は文字クラスの最後に置く） */
const DASH = "[‐‑–—―−ー－-]";

/**
 * 入力の末尾の地番を取り出す（「熊谷市下奈良391番地3」→ 本体「熊谷市下奈良」と地番「391-3」）。
 * 「1-2-3」「2番3号」のような住居表示は地番とみなさない。「地番」と書いてあれば explicit
 */
export function splitChiban(input: string): { body: string; chiban: string; explicit: boolean } | null {
  let s = input.normalize("NFKC").replace(/\s+/g, " ").trim();
  const explicit = /地番/.test(s);
  s = s.replace(/[(（]?\s*地番\s*[)）]?\s*[:：]?/g, " ").replace(/\s+/g, " ").trim();
  if (/号$/.test(s)) return null;
  const m = s.match(new RegExp(`^(.*?)(\\d+)(?:\\s*(?:番地の?|番の?|の|${DASH})\\s*(\\d+))?\\s*(?:番地?)?$`));
  if (!m) return null;
  const body = m[1].trim();
  // 前にも番号が続く（「1-2-3」「1丁目2番3」）のは住居表示
  if (!body || new RegExp(`(\\d|${DASH}|番)$`).test(body)) return null;
  return { body, chiban: m[3] ? `${m[2]}-${m[3]}` : m[2], explicit };
}

/**
 * 住所として調べた文字を、地番で探す文字にする（住所の地点が道路・水路の上だったときの探し直し）。番地が地番の地域では
 * 「古ヶ崎4-3556-1」は「四丁目3556番1」なので、町に丁目があって（chome）丁目と書いていなければ、町の名前のすぐ後ろの番号を
 * 丁目にする。作れなければ undefined
 */
export function chibanQueryOf(query: string, chome: boolean): string | undefined {
  const q = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!q || /地番/.test(q)) return undefined;
  const m = chome && !/丁目/.test(q) ? q.match(new RegExp(`^(.*[^\\d${DASH.slice(1, -1)}])(\\d+)${DASH}(\\d+(?:${DASH}\\d+)?)$`)) : null;
  const out = m ? `地番 ${m[1]}${m[2]}丁目${m[3]}` : `地番 ${q}`;
  return splitChiban(out) ? out : undefined;
}

/** 地番をそろえる（「391番3」「391の3」「３９１－３」→「391-3」） */
export function normalizeChiban(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s/g, "")
    .replace(/番地?の?|の/g, "-")
    .replace(new RegExp(DASH, "g"), "-")
    .replace(/-$/, "");
}

const KANJI_DIGIT: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiToInt(k: string): number {
  let n = 0;
  let cur = 0;
  for (const ch of k) {
    if (ch === "十") {
      n += (cur || 1) * 10;
      cur = 0;
    } else cur = KANJI_DIGIT[ch] ?? 0;
  }
  return n + cur;
}

/** 町・大字の名前をそろえる（「大字」を外す、「ヶ」と「ケ」、「二丁目」と「２丁目」） */
export function townKey(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s/g, "")
    .replace(/[ヶヵケ]/g, "ケ")
    .replace(/^大字/, "")
    .replace(/^字/, "")
    .replace(/([一二三四五六七八九十]+)丁目/g, (_, k: string) => `${kanjiToInt(k)}丁目`);
}

const cityKey = (s: string) => s.normalize("NFKC").replace(/\s/g, "").replace(/[ヶヵケ]/g, "ケ");

/** 地番区域を市区町村・町（大字＋丁目）・小字に分ける */
export function kuikiParts(kuiki: string): { city: string; town: string; koaza: string } {
  const [city = "", oaza = "", chome = "", koaza = ""] = kuiki.split("_");
  return { city: cityKey(city), town: townKey(oaza + chome), koaza };
}

/** 地番区域の市区町村（「西多摩郡瑞穂町」）が、国土地理院の名前（「瑞穂町」「さいたま市 見沼区」）と同じか */
export function cityMatches(kuikiCity: string, city: string): boolean {
  const k = cityKey(kuikiCity);
  const c = cityKey(city);
  return !!c && (k === c || k.endsWith(c));
}

/** 国土地理院の住所（「埼玉県さいたま市見沼区大字南中丸」）から、市区町村より後ろの町の部分（番地は外す） */
export function townFromAddress(address: string, city: string): string {
  const a = address.normalize("NFKC").replace(/\s/g, "");
  const c = city.normalize("NFKC").replace(/\s/g, "");
  const i = c ? a.indexOf(c) : -1;
  const rest = i >= 0 ? a.slice(i + c.length) : a.replace(/^.+?[都道府県]/, "").replace(/^.+?郡/, "").replace(/^.+?[市区町村]/, "");
  // 番地・地番（数字から後ろ）を外す
  return rest.replace(/[0-9][0-9番地号の‐‑–—―−－-]*$/, "");
}

const baseNumber = (chiban: string) => Number.parseInt(chiban, 10);

/** 緯度経度 → z のタイル番号 */
export function tileOf(lat: number, lng: number, z = PARCEL_ZOOM): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

/** タイルの範囲 [西, 南, 東, 北] */
export function tileBounds(x: number, y: number, z = PARCEL_ZOOM): [number, number, number, number] {
  const n = 2 ** z;
  const lat = (t: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) * 180) / Math.PI;
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

/**
 * 地番の筆を探す。町の代表点のタイルから始め、同じ町で地番の数字が近い筆の方へ広げていく（最大 maxTiles 枚）。
 * 代表点から3タイル（約1.5km）以内を読んでも同じ町の筆が1つも無ければ、地図データの無い地域とみなす。
 * 広い大字では、代表点のまわりに地図が無く、少し離れた所にだけ地図があることがある（熊谷市三ケ尻など）
 */
export async function searchParcel(
  q: { city: string; town: string; chiban: string },
  start: { lat: number; lng: number },
  source: ParcelSource,
  { maxTiles = 40, radius = 4, batch = 4 }: { maxTiles?: number; radius?: number; batch?: number } = {},
): Promise<ParcelSearch> {
  const [sx, sy] = tileOf(start.lat, start.lng);
  const town = townKey(q.town);
  const want = normalizeChiban(q.chiban);
  const wantBase = baseNumber(want);
  const seen = new Set<string>();
  const hits = new Map<string, ParcelPiece[]>();
  const raw = new Map<string, string>();
  // 地番区域ごとの、合わせた区画のデータのままの地番（二重地番の「51-3W1」「51-3W2」など）
  const raws = new Map<string, Set<string>>();
  const estimated = new Map<string, Estimated>();
  const sanko = new Map<string, string>();
  const rank = new Map<string, number>();
  const similar = new Set<string>();
  let focus: [number, number] = [sx, sy];
  let closest = Number.POSITIVE_INFINITY;
  let townSeen = false;
  // 町の筆を見つけてから、地番の数字が近づかないまま読んだ回数（3回続いたら、この先には無いとみなす）
  let stale = 0;

  const visit = async (tiles: [number, number][]) => {
    const got = await Promise.all(tiles.map(([x, y]) => source.tile(x, y)));
    tiles.forEach(([x, y], i) => {
      seen.add(`${x},${y}`);
      for (const f of got[i] ?? []) {
        if (kuikiParts(f.kuiki).town !== town) continue;
        townSeen = true;
        // 地図データの「51-3W2」（同じ地番の土地の分かれた区画）も「51-3」として探す
        const c = registryChiban(normalizeChiban(f.chiban));
        if (c === want) {
          // 同じ筆が別のデータにもあれば（法務省の地図データ → 地番参考図 → 推定の位置の順に使う）、形を混ぜない
          const r = sourceRank(f);
          const had = rank.get(f.kuiki);
          if (had !== undefined && had < r) continue;
          if (had !== undefined && had > r) {
            hits.delete(f.kuiki);
            raws.delete(f.kuiki);
            estimated.delete(f.kuiki);
            sanko.delete(f.kuiki);
          }
          rank.set(f.kuiki, r);
          hits.set(f.kuiki, [...(hits.get(f.kuiki) ?? []), { polygons: f.polygons(), tile: [x, y] }]);
          raw.set(f.kuiki, f.chiban);
          raws.set(f.kuiki, (raws.get(f.kuiki) ?? new Set<string>()).add(f.chiban));
          if (f.estimated) estimated.set(f.kuiki, f.estimated);
          if (f.sanko) sanko.set(f.kuiki, f.sanko);
          continue;
        }
        const b = baseNumber(c);
        if (Number.isNaN(b)) continue;
        if (b === wantBase && similar.size < 8) similar.add(c);
        // 地番の数字が近い筆のあたりを次に探す（地番は近い番号が近くに並ぶことが多い）
        if (Math.abs(b - wantBase) < closest) {
          closest = Math.abs(b - wantBase);
          focus = [x, y];
        }
      }
    });
  };

  while (seen.size < maxTiles && !hits.size) {
    const next: [number, number][] = [];
    for (let dx = -radius; dx <= radius; dx++)
      for (let dy = -radius; dy <= radius; dy++) if (!seen.has(`${sx + dx},${sy + dy}`)) next.push([sx + dx, sy + dy]);
    if (!next.length) break;
    const d = ([x, y]: [number, number]) => (x - focus[0]) ** 2 + (y - focus[1]) ** 2;
    next.sort((a, b) => d(a) - d(b));
    // 町の筆がまだ無ければ focus は代表点のまま。3タイル以内を読み終えたら打ち切る
    if (!townSeen && d(next[0]) > 9) return { status: "no_map" };
    const before = closest;
    await visit(next.slice(0, Math.min(batch, maxTiles - seen.size)));
    if (townSeen && !hits.size) {
      stale = closest < before ? 0 : stale + 1;
      if (stale >= 3) break;
    }
  }
  if (!hits.size) return townSeen ? { status: "not_found", similar: [...similar].sort(compareChiban) } : { status: "no_map" };

  // 同じ地番が複数の地番区域にあれば（小字違いなど）、市区町村が合うもの、次に代表点に近いものを選ぶ
  const ranked = [...hits.entries()].sort(
    ([ka, pa], [kb, pb]) =>
      Number(cityMatches(kuikiParts(kb).city, q.city)) - Number(cityMatches(kuikiParts(ka).city, q.city)) ||
      tileDist(pa, sx, sy) - tileDist(pb, sx, sy),
  );
  const [kuiki, pieces] = ranked[0];
  // 筆がタイルの端にかかっていれば、隣のタイルの続きも集める。地番の後ろに印のある筆（二重地番など）は、まわりのタイルの同じ筆の区画も
  for (let round = 0; round < 3; round++) {
    const marked = [...raws.get(kuiki)!].some(hasPieceMark);
    const more = [...neighborsToComplete(pieces), ...(marked ? aroundTiles(pieces) : [])].filter(([x, y]) => !seen.has(`${x},${y}`));
    if (!more.length) break;
    const before = hits.get(kuiki)!.length;
    await visit(more);
    pieces.push(...hits.get(kuiki)!.slice(before));
  }
  return {
    status: "found",
    parcel: {
      kuiki,
      chiban: want,
      chibanRaw: raw.get(kuiki)!,
      ...(raws.get(kuiki)!.size > 1 ? { chibanRaws: [...raws.get(kuiki)!].sort(byPieceMark) } : {}),
      pieces,
      point: interiorPoint(pieces),
      ...(estimated.has(kuiki) ? { estimated: estimated.get(kuiki) } : {}),
      ...(sanko.has(kuiki) ? { sanko: sanko.get(kuiki) } : {}),
    },
    others: ranked.length - 1,
  };
}

/** 筆のデータの順（小さいほど先に使う）：法務省の地図データ、市町村の地番参考図、公図から推定した位置 */
const sourceRank = (f: ParcelFeature) => (f.sanko ? 1 : f.estimated ? 2 : 0);

/** 地点を含む筆（地図で選んだ地点の地番を出す）。地図データの無い地域や、筆の無い所なら null */
export async function parcelAt(lat: number, lng: number, source: ParcelSource): Promise<Parcel | null> {
  const [x, y] = tileOf(lat, lng);
  const p: LngLat = [lng, lat];
  const hits = ((await source.tile(x, y)) ?? [])
    .map((f) => ({ f, polygons: f.polygons() }))
    .filter(({ polygons }) => polygons.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h))));
  if (!hits.length) return null;
  // 登記所の地図が筆界未定地の所に、市町村の地番参考図の地番の付いた筆があれば、そちらを出す（筆界未定地だったことも添える）
  let hit = hits[0];
  const undetermined = /^筆界未定/.test(hit.f.chiban) && !hit.f.sanko && !hit.f.estimated;
  const ref = undetermined ? hits.find(({ f }) => f.sanko && /^\d/.test(f.chiban)) : undefined;
  if (ref) hit = ref;
  const { f, polygons } = hit;
  const pieces: ParcelPiece[] = [{ polygons, tile: [x, y] }];
  for (const [nx, ny] of neighborsToComplete(pieces))
    for (const g of (await source.tile(nx, ny)) ?? []) if (g.kuiki === f.kuiki && g.chiban === f.chiban) pieces.push({ polygons: g.polygons(), tile: [nx, ny] });
  const raws = hasPieceMark(f.chiban) ? await addSiblings(f, pieces, source) : [];
  return {
    kuiki: f.kuiki,
    chiban: normalizeChiban(f.chiban),
    chibanRaw: f.chiban,
    ...(raws.length > 1 ? { chibanRaws: raws } : {}),
    pieces,
    point: { lat, lng },
    ...(f.estimated ? { estimated: f.estimated } : {}),
    ...(f.sanko ? { sanko: f.sanko } : {}),
    ...(ref ? { undetermined: true } : {}),
  };
}

/**
 * 地番の後ろに印のある筆（W・V・X）に、同じ筆の区画を足す（筆のまわりのタイルの中）。二重地番（W）は、つながっている区画だけ
 * （離れた所の同じ地番は別の土地のことがある）。めがね地番（V）・分属管理地番（X）は同じ地番の区画すべて。合わせた区画の地図データの地番を返す
 */
async function addSiblings(f: ParcelFeature, pieces: ParcelPiece[], source: ParcelSource): Promise<string[]> {
  const same = (g: ParcelFeature) => g.kuiki === f.kuiki && registryChiban(g.chiban) === registryChiban(f.chiban) && sourceRank(g) === sourceRank(f);
  const read = new Set<string>();
  const cand = new Map<string, ParcelPiece[]>();
  const gather = async (tiles: [number, number][]) => {
    for (const [x, y] of tiles) {
      if (read.has(`${x},${y}`)) continue;
      read.add(`${x},${y}`);
      for (const g of (await source.tile(x, y)) ?? []) if (g.chiban !== f.chiban && same(g)) cand.set(g.chiban, [...(cand.get(g.chiban) ?? []), { polygons: g.polygons(), tile: [x, y] }]);
    }
  };
  await gather(aroundTiles(pieces));
  const lat0 = pieces[0].polygons[0]?.[0]?.[0]?.[1] ?? 35;
  const rings = (ps: ParcelPiece[]) => ps.flatMap((p) => p.polygons.flat());
  const linked = /W\d+$/.test(f.chiban);
  const raws = [f.chiban];
  for (let grew = true; grew; ) {
    grew = false;
    for (const [raw, ps] of cand) {
      if (linked && !ringsWithin(rings(ps), rings(pieces), 0.5, lat0)) continue;
      pieces.push(...ps);
      raws.push(raw);
      cand.delete(raw);
      grew = true;
      // 足した区画が、まだ読んでいないタイルへ続いていれば読む
      await gather(neighborsToComplete(ps));
      const more = cand.get(raw);
      if (more) {
        pieces.push(...more);
        cand.delete(raw);
      }
    }
  }
  return raws.sort(byPieceMark);
}

/** 同じ地番の区画の並び（「51-3W1」「51-3W2」…「51-3W10」） */
const byPieceMark = (a: string, b: string) => a.localeCompare(b, "ja", { numeric: true });

/** 画面での地番の呼び方。道路・水路など地番の無い所は「道路（地番なし）」など */
export function chibanLabel(chiban: string): string {
  if (/^道/.test(chiban)) return "道路（地番なし）";
  if (/^水/.test(chiban)) return "水路（地番なし）";
  if (/^筆界未定/.test(chiban)) return "筆界未定地";
  if (/^無地番/.test(chiban)) return "無地番の土地";
  return `地番 ${registryChiban(chiban)}`;
}

/**
 * 地図XML（法務省）で地番の後ろに付く印。二重地番「51-3W1」（同じ地番が地図に2つ以上ある。合筆や図面の分け方で1つの土地が
 * 分かれて描かれたものが多い）・めがね地番「100V1」（離れた土地を1筆として扱う）・分属管理地番「100X(1/2)」（1つの土地が
 * 図郭で分かれている）
 */
const PIECE_MARK = /(?:W\d+|V\d+|X\(\d+\/\d+\))$/;

/**
 * 登記の地番。地図データの地番の後ろの印（W・V・X）は登記の地番には付かないので外す
 * （謄本の請求・画面・コピーはこちら。地図の上で筆を選ぶときは元の地番のまま）
 */
export function registryChiban(chiban: string): string {
  return chiban.replace(PIECE_MARK, "");
}

/** 地図データの地番に、登記の地番には無い印（W・V・X）が付いているか */
export const hasPieceMark = (chiban: string) => PIECE_MARK.test(chiban);

/** 下書き・コピー・印刷に並べる隣地の数（道路や大きな筆は、まわりの何十筆にも接する） */
export const NEIGHBOR_LIST_MAX = 20;

/** 隣地の地番を「、」でつなぐ。多いときは先頭の max 筆と「ほかN筆」 */
export function neighborList(neighbors: string[], max = NEIGHBOR_LIST_MAX): string {
  if (neighbors.length <= max) return neighbors.join("、");
  return `${neighbors.slice(0, max).join("、")}、ほか${neighbors.length - max}筆（公図で確認）`;
}

/** 公図から推定した位置の筆に添える印 */
export function estimatedMark(p: { estimated?: Estimated }): string {
  return p.estimated === "low" ? "（推定・確度低）" : p.estimated ? "（推定）" : "";
}

/** 筆に添える印（公図から推定した位置の筆、市町村の地番参考図の筆。法務省の地図データの筆には付けない） */
export function parcelMark(p: { estimated?: Estimated; sanko?: string }): string {
  return p.sanko ? SANKO_MARK : estimatedMark(p);
}

/** 公図から推定した位置の筆の、ずれの目安（見出しや注記に添える） */
export function estimatedNote(e: Estimated): string {
  return e === "low" ? "確度が低く、5m前後ずれることあり" : "数mずれることあり";
}

/** 地番区域を「熊谷市下奈良」「川口市青木２丁目」のように読める形に */
export function kuikiLabel(kuiki: string): string {
  return kuiki.split("_").filter(Boolean).join("");
}

/** 地番の並べ替え（「391」「391-1」「391-2」「391-10」の順） */
function compareChiban(a: string, b: string): number {
  const pa = a.split("-").map((v) => Number.parseInt(v, 10) || 0);
  const pb = b.split("-").map((v) => Number.parseInt(v, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? -1) !== (pb[i] ?? -1)) return (pa[i] ?? -1) - (pb[i] ?? -1);
  return 0;
}

const tileDist = (pieces: ParcelPiece[], sx: number, sy: number) => Math.min(...pieces.map(({ tile: [x, y] }) => (x - sx) ** 2 + (y - sy) ** 2));

/** 筆のあるタイルと、そのまわり8枚 */
function aroundTiles(pieces: ParcelPiece[]): [number, number][] {
  const out = new Map<string, [number, number]>();
  for (const { tile: [x, y] } of pieces) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.set(`${x + dx},${y + dy}`, [x + dx, y + dy]);
  return [...out.values()];
}

/** 筆の形がタイルの外（のりしろ）にはみ出している方向の、隣のタイル */
function neighborsToComplete(pieces: ParcelPiece[]): [number, number][] {
  const out = new Map<string, [number, number]>();
  for (const { polygons, tile: [x, y] } of pieces) {
    const [w, s, e, n] = tileBounds(x, y);
    for (const ring of polygons.flat())
      for (const [lng, lat] of ring) {
        const dx = lng < w ? -1 : lng > e ? 1 : 0;
        const dy = lat > n ? -1 : lat < s ? 1 : 0;
        if (dx || dy) out.set(`${x + dx},${y + dy}`, [x + dx, y + dy]);
      }
  }
  return [...out.values()];
}

/** 輪の面積（経緯度のまま。比べるだけなので単位は気にしない） */
function ringArea(ring: LngLat[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return Math.abs(a / 2);
}

function inRing([x, y]: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 筆の中に必ず入る代表点。いちばん大きい部分の重心、外れたら（L字の土地など）重心の高さで横に切った区間の真ん中 */
export function interiorPoint(pieces: ParcelPiece[]): { lat: number; lng: number } {
  const polygons = pieces.flatMap((p) => p.polygons);
  const outer = polygons.map((p) => p[0]).sort((a, b) => ringArea(b) - ringArea(a))[0];
  let cx = 0;
  let cy = 0;
  for (const [x, y] of outer) {
    cx += x;
    cy += y;
  }
  const c: LngLat = [cx / outer.length, cy / outer.length];
  if (inRing(c, outer)) return { lng: c[0], lat: c[1] };
  const xs: number[] = [];
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [xi, yi] = outer[i];
    const [xj, yj] = outer[j];
    if (yi > c[1] !== yj > c[1]) xs.push(((xj - xi) * (c[1] - yi)) / (yj - yi) + xi);
  }
  xs.sort((a, b) => a - b);
  let best: [number, number] = [xs[0] ?? c[0], xs[1] ?? c[0]];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  return { lng: (best[0] + best[1]) / 2, lat: c[1] };
}

/** 隣の筆（境界が接している筆）。地番の無い道路・水路（「道-199」など）も含む */
export type Neighbor = { kuiki: string; chiban: string };

/**
 * 筆に接している筆（謄本・公図を取るときの隣地の地番）。筆のあるタイルの中で、境界どうしが tolerance（m）以内に近づく筆を集める。
 * 地番の順に返す（地番の無い道路・水路は最後）
 */
export async function adjacentParcels(target: Parcel, source: ParcelSource, toleranceM = 0.5): Promise<Neighbor[]> {
  const rings = target.pieces.flatMap((p) => p.polygons.flat());
  const lat0 = target.point.lat;
  const pad = [toleranceM / (111_320 * Math.cos((lat0 * Math.PI) / 180)), toleranceM / 110_950];
  const tb = bboxOf(rings);
  const near = (b: [number, number, number, number]) => b[0] <= tb[2] + pad[0] && b[2] >= tb[0] - pad[0] && b[1] <= tb[3] + pad[1] && b[3] >= tb[1] - pad[1];
  // 物件の筆（二重地番などで分かれた区画も）は隣地に入れない
  const seen = new Set((target.chibanRaws ?? [target.chibanRaw]).map((c) => `${target.kuiki}|${c}`));
  const out: Neighbor[] = [];
  const tiles = new Map(target.pieces.map((p) => [p.tile.join(","), p.tile]));
  for (const [x, y] of tiles.values()) {
    for (const f of (await source.tile(x, y)) ?? []) {
      const key = `${f.kuiki}|${f.chiban}`;
      if (seen.has(key)) continue;
      const fr = f.polygons().flat();
      if (!fr.length || !near(bboxOf(fr)) || !ringsWithin(fr, rings, toleranceM, lat0)) continue;
      seen.add(key);
      out.push({ kuiki: f.kuiki, chiban: f.chiban });
    }
  }
  // 地番のある筆が先、地番の無い道路・水路はあと
  const numbered = (n: Neighbor) => (/^\d/.test(n.chiban) ? 0 : 1);
  return out.sort((a, b) => numbered(a) - numbered(b) || a.kuiki.localeCompare(b.kuiki) || compareChiban(a.chiban, b.chiban));
}

/** 輪の集まりの範囲 [西, 南, 東, 北] */
function bboxOf(rings: LngLat[][]): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  return b;
}

/** 2つの輪の集まりの縁が、どこかで tolerance（m）以内に近づくか（頂点から相手の辺までの距離を両方向に見る） */
function ringsWithin(a: LngLat[][], b: LngLat[][], toleranceM: number, lat0: number): boolean {
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_950;
  const close = (from: LngLat[][], to: LngLat[][]) => {
    for (const ring of from)
      for (const [px, py] of ring)
        for (const r of to)
          for (let i = 0; i + 1 < r.length; i++) {
            const ax = (r[i][0] - px) * kx;
            const ay = (r[i][1] - py) * ky;
            const dx = (r[i + 1][0] - r[i][0]) * kx;
            const dy = (r[i + 1][1] - r[i][1]) * ky;
            const len = dx * dx + dy * dy;
            const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
            if (Math.hypot(ax + t * dx, ay + t * dy) <= toleranceM) return true;
          }
    return false;
  };
  return close(a, b) || close(b, a);
}
