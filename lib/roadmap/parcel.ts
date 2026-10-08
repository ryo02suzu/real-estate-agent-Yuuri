// 地番から筆（登記上の土地の区画）の場所を探す。
// 法務省の登記所備付地図データをベクトルタイル（PMTiles、レイヤ fude、z16 で全件）にしたものを、
// 国土地理院で調べた町・大字の代表点のまわりから近い順に読み、地番区域と地番が一致する筆を探す。
// タイルの読み込みは ParcelSource に任せる（実物は parcel-tiles.ts、テストでは作り物を渡す）。

/** 筆を探すタイルのズーム（このズームのタイルに全ての筆が入っている） */
export const PARCEL_ZOOM = 16;

/** [経度, 緯度] */
export type LngLat = [number, number];
/** ポリゴン（外周と穴の輪の配列） */
export type Polygon = LngLat[][];

export type ParcelFeature = {
  /** 地番区域（「熊谷市_下奈良___」「川口市_青木_２丁目__」：市区町村_大字_丁目_小字） */
  kuiki: string;
  /** 地番（「391-3」。道路・水路は「道-199」「水-154」など） */
  chiban: string;
  /** 筆の形（必要になったときだけ作る） */
  polygons: () => Polygon[];
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
  pieces: ParcelPiece[];
  /** 筆の中の代表点（物件の場所として使う） */
  point: { lat: number; lng: number };
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
        const c = normalizeChiban(f.chiban);
        if (c === want) {
          hits.set(f.kuiki, [...(hits.get(f.kuiki) ?? []), { polygons: f.polygons(), tile: [x, y] }]);
          raw.set(f.kuiki, f.chiban);
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
  // 筆がタイルの端にかかっていれば、隣のタイルの続きも集める
  for (let round = 0; round < 3; round++) {
    const more = neighborsToComplete(pieces).filter(([x, y]) => !seen.has(`${x},${y}`));
    if (!more.length) break;
    const before = hits.get(kuiki)!.length;
    await visit(more);
    pieces.push(...hits.get(kuiki)!.slice(before));
  }
  return { status: "found", parcel: { kuiki, chiban: want, chibanRaw: raw.get(kuiki)!, pieces, point: interiorPoint(pieces) }, others: ranked.length - 1 };
}

/** 地点を含む筆（地図で選んだ地点の地番を出す）。地図データの無い地域や、筆の無い所なら null */
export async function parcelAt(lat: number, lng: number, source: ParcelSource): Promise<Parcel | null> {
  const [x, y] = tileOf(lat, lng);
  const p: LngLat = [lng, lat];
  for (const f of (await source.tile(x, y)) ?? []) {
    const polygons = f.polygons();
    if (!polygons.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)))) continue;
    const pieces: ParcelPiece[] = [{ polygons, tile: [x, y] }];
    for (const [nx, ny] of neighborsToComplete(pieces))
      for (const g of (await source.tile(nx, ny)) ?? []) if (g.kuiki === f.kuiki && g.chiban === f.chiban) pieces.push({ polygons: g.polygons(), tile: [nx, ny] });
    return { kuiki: f.kuiki, chiban: normalizeChiban(f.chiban), chibanRaw: f.chiban, pieces, point: { lat, lng } };
  }
  return null;
}

/** 画面での地番の呼び方。道路・水路など地番の無い所は「道路（地番なし）」など */
export function chibanLabel(chiban: string): string {
  if (/^道/.test(chiban)) return "道路（地番なし）";
  if (/^水/.test(chiban)) return "水路（地番なし）";
  if (/^筆界未定/.test(chiban)) return "筆界未定地";
  return `地番 ${chiban}`;
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
