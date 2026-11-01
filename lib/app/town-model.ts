// 物件の画面の「街の模型」の材料。国土地理院の最適化ベクトルタイル（z16。建物の面・道路中心線・水域）を、調べた地点を原点にした
// メートルの座標（東が +x、南が +z）に直し、建物の高さの目安を付ける（地図データに高さは無いので、建物の種類と大きさから決めた目安）。
// タイルの継ぎ目で2つに切れた建物は、継ぎ目に乗る辺どうしが重なるものを同じ建物として、同じ高さにする（模型で段差が出ないように）。
// 物件の筆に接する道路（地図のデータ上の前の道路）も選ぶ。建築基準法の道路かどうかは判断しない（市の図と窓口で確かめる）。
// 読むのは国土地理院のタイルだけで、住所はどこにも送らない（タイルの番号から分かるのは、約500m 四方の範囲だけ）
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { toWorldPixel } from "../tiles";

/** 模型のタイルのズーム（最適化ベクトルタイルの建物はこのズームまで） */
export const TOWN_ZOOM = 16;
/** 地理院の最適化ベクトルタイル */
export const townTileUrl = (x: number, y: number) => `https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/${TOWN_ZOOM}/${x}/${y}.pbf`;
/** 模型に入れる建物の範囲（m。原点からの距離） */
export const TOWN_RADIUS = 280;

export type Origin = { lat: number; lng: number };
/** 原点からのメートル（東が +x、南が +z） */
export type XZ = [number, number];
export type BuildingKind = "house" | "solid" | "tall" | "shed";
export type TownBuilding = { ring: XZ[]; height: number; kind: BuildingKind };
/** rank は地図の幅員の区分（「3m-5.5m未満」など） */
export type TownRoad = { line: XZ[]; width: number; major: boolean; rank?: string };
export type TownModel = { buildings: TownBuilding[]; roads: TownRoad[]; water: XZ[][] };

/** タイルから読んだままの形（メートルの座標。高さはまだ無い） */
export type RawTown = { buildings: { ring: XZ[]; code: number }[]; roads: { line: XZ[]; rank: string; category: string }[]; water: XZ[][] };

/** ズーム z の世界ピクセル1つが何メートルか（その緯度で） */
export function metersPerPixel(lat: number, z: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** z);
}

/** 緯度経度 → 原点からのメートル */
export function localOf(origin: Origin): (lng: number, lat: number) => XZ {
  const o = toWorldPixel(origin.lat, origin.lng, TOWN_ZOOM);
  const k = metersPerPixel(origin.lat, TOWN_ZOOM);
  return (lng, lat) => {
    const p = toWorldPixel(lat, lng, TOWN_ZOOM);
    return [(p.x - o.x) * k, (p.y - o.y) * k];
  };
}

/** 原点のまわりを覆う 2×2 枚のタイル（原点に近い方の継ぎ目をはさむ） */
export function townTiles(origin: Origin): [number, number][] {
  const p = toWorldPixel(origin.lat, origin.lng, TOWN_ZOOM);
  const tx = Math.floor(p.x / 256 - 0.5), ty = Math.floor(p.y / 256 - 0.5);
  return [
    [tx, ty],
    [tx + 1, ty],
    [tx, ty + 1],
    [tx + 1, ty + 1],
  ];
}

/** 2×2 枚の継ぎ目の位置（m。縦の継ぎ目の x と、横の継ぎ目の z） */
export function townSeams(origin: Origin): { x: number; z: number } {
  const [[tx, ty]] = townTiles(origin);
  const o = toWorldPixel(origin.lat, origin.lng, TOWN_ZOOM);
  const k = metersPerPixel(origin.lat, TOWN_ZOOM);
  return { x: ((tx + 1) * 256 - o.x) * k, z: ((ty + 1) * 256 - o.y) * k };
}

/** 輪の面積（符号つき。タイルの座標＝下向きの y では、外周が正） */
export function signedArea(ring: XZ[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const centroid = (ring: XZ[]): XZ => {
  let x = 0, z = 0;
  for (const p of ring) {
    x += p[0];
    z += p[1];
  }
  return [x / ring.length, z / ring.length];
};

/** 1枚のタイル（pbf）を、原点からのメートルの形にする */
export function decodeTownTile(buf: ArrayBuffer, tx: number, ty: number, origin: Origin): RawTown {
  const tile = new VectorTile(new PbfReader(new Uint8Array(buf)));
  const o = toWorldPixel(origin.lat, origin.lng, TOWN_ZOOM);
  const k = metersPerPixel(origin.lat, TOWN_ZOOM);
  const out: RawTown = { buildings: [], roads: [], water: [] };
  const read = (name: string, fn: (rings: XZ[][], props: Record<string, unknown>, type: number) => void) => {
    const layer = tile.layers[name];
    if (!layer) return;
    const ext = layer.extent || 4096;
    const to = (x: number, y: number): XZ => [((tx + x / ext) * 256 - o.x) * k, ((ty + y / ext) * 256 - o.y) * k];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      fn(f.loadGeometry().map((r) => r.map((p) => to(p.x, p.y))), f.properties as Record<string, unknown>, f.type);
    }
  };
  // 建物：外周の輪だけ（中庭の穴は小さいので、模型では埋める）
  read("BldA", (rings, props, type) => {
    if (type !== 3) return;
    for (const r of rings) if (r.length >= 4 && signedArea(r) > 0) out.buildings.push({ ring: dropClosing(r), code: Number(props.vt_code) || 3101 });
  });
  read("RdCL", (rings, props, type) => {
    if (type !== 2) return;
    for (const l of rings) if (l.length >= 2) out.roads.push({ line: l, rank: String(props.vt_rnkwidth ?? ""), category: String(props.vt_rdctg ?? "") });
  });
  read("WA", (rings, _props, type) => {
    if (type !== 3) return;
    for (const r of rings) if (r.length >= 4 && signedArea(r) > 0) out.water.push(dropClosing(r));
  });
  return out;
}

const dropClosing = (r: XZ[]): XZ[] => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);

/** 道路の幅（地図の幅員の区分の真ん中くらい。m） */
export function roadWidth(rank: string): number {
  if (/19\.5m以上/.test(rank)) return 22;
  if (/13m-19\.5m/.test(rank)) return 15;
  if (/5\.5m-13m/.test(rank)) return 8;
  if (/3m-5\.5m/.test(rank)) return 4.3;
  if (/3m未満/.test(rank)) return 2.6;
  return 4;
}

/** 建物の種類（地図の分類コード） */
export function buildingKind(code: number): BuildingKind {
  if (code === 3103) return "tall";
  if (code === 3102) return "solid";
  if (code === 3111 || code === 3112) return "shed";
  return "house";
}

/** 建物の高さの目安（m）。普通の建物は2〜3階、堅ろうな建物は3〜5階、高層は10階くらい、屋根だけの建物は1階 */
export function buildingHeight(kind: BuildingKind, area: number): number {
  if (kind === "tall") return area < 800 ? 30 : 40;
  if (kind === "solid") return area < 300 ? 10.5 : area < 1200 ? 13.5 : 16;
  if (kind === "shed") return 3.2;
  return area < 90 ? 6.2 : area < 220 ? 7.4 : 9;
}

/** 継ぎ目に乗っている頂点の範囲（継ぎ目の上の座標の最小・最大。乗っていなければ undefined） */
function onSeam(ring: XZ[], axis: 0 | 1, at: number): [number, number] | undefined {
  let lo = Infinity, hi = -Infinity;
  for (const p of ring)
    if (Math.abs(p[axis] - at) < 0.06) {
      const v = p[1 - axis];
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  return hi - lo > 0.2 ? [lo, hi] : undefined;
}

/**
 * 建物に高さを付けて、原点から radius 以内に絞る。タイルの継ぎ目で切れた建物は、継ぎ目に乗る辺が重なる相手と同じ建物とみなし、
 * 合わせた面積で同じ高さにする
 */
export function buildTown(raw: RawTown, seams: { x: number; z: number }, radius = TOWN_RADIUS): TownModel {
  const items = raw.buildings.map((b) => ({ ...b, area: Math.abs(signedArea(b.ring)), c: centroid(b.ring) }));
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [axis, at] of [
    [0, seams.x],
    [1, seams.z],
  ] as const) {
    const touching = items.map((b, i) => ({ i, span: onSeam(b.ring, axis, at), side: b.c[axis] < at })).filter((t) => t.span);
    for (const a of touching)
      for (const b of touching) {
        if (a.i >= b.i || a.side === b.side) continue;
        const overlap = Math.min(a.span![1], b.span![1]) - Math.max(a.span![0], b.span![0]);
        if (overlap > 0.3) parent[find(a.i)] = find(b.i);
      }
  }
  const groupArea = new Map<number, number>();
  for (let i = 0; i < items.length; i++) groupArea.set(find(i), (groupArea.get(find(i)) ?? 0) + items[i].area);
  const buildings: TownBuilding[] = [];
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    if (b.area < 6 || Math.hypot(b.c[0], b.c[1]) > radius) continue;
    const kind = buildingKind(b.code);
    buildings.push({ ring: b.ring, kind, height: buildingHeight(kind, groupArea.get(find(i)) ?? b.area) });
  }
  const roads: TownRoad[] = [];
  for (const r of raw.roads) {
    const line = r.line.filter((p, i) => i === 0 || p[0] !== r.line[i - 1][0] || p[1] !== r.line[i - 1][1]);
    if (line.length < 2 || !line.some((p) => Math.hypot(p[0], p[1]) < radius + 60)) continue;
    roads.push({ line, width: roadWidth(r.rank), major: /国道|都道府県道|高速/.test(r.category), rank: r.rank });
  }
  const water = raw.water.filter((r) => r.some((p) => Math.hypot(p[0], p[1]) < radius + 80));
  return { buildings, roads, water };
}

/** 点と線分の距離 */
function segDist(p: XZ, a: XZ, b: XZ): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** 2本の線分の距離（交わっていれば 0） */
function segSeg(a: XZ, b: XZ, c: XZ, d: XZ): number {
  const cross = (o: XZ, p: XZ, q: XZ) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}

/** 道路の中心線と筆の輪の、いちばん近い所の距離（m） */
export function lineRingDistance(line: XZ[], ring: XZ[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++)
    for (let j = 0; j < ring.length; j++) best = Math.min(best, segSeg(line[i], line[i + 1], ring[j], ring[(j + 1) % ring.length]));
  return best;
}

/**
 * 筆に接する道路（地図のデータ上の前の道路）：中心線が、道路の幅の半分＋2.5m 以内まで筆に近づく道路の番号。
 * 地図のデータの位置と筆の位置（とくに公図から推定した筆）は数mずれることがあるので、ゆとりを持たせる
 */
export function frontRoads(roads: TownRoad[], ring: XZ[]): number[] {
  const out: number[] = [];
  roads.forEach((r, i) => {
    if (lineRingDistance(r.line, ring) <= r.width / 2 + 2.5) out.push(i);
  });
  return out;
}

/** 地図の幅員の区分を短く（「3m-5.5m未満」→「3〜5.5m」、「3m未満」はそのまま）。分からなければ空 */
export function rankText(rank: string | undefined): string {
  if (!rank) return "";
  const m = rank.match(/^([\d.]+)m-([\d.]+)m未満$/);
  if (m) return `${m[1]}〜${m[2]}m`;
  return /^[\d.]+m(未満|以上)$/.test(rank) ? rank : "";
}

const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
/** 原点から見た向き（8方位。x は東、z は南） */
export function directionOf(dx: number, dz: number): string {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return DIRS[Math.round(deg / 45) % 8];
}

/** 線のいちばん近い点 */
export function nearestOnLine(p: XZ, line: XZ[]): XZ {
  let best: XZ = line[0];
  let d = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = dx * dx + dz * dz;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0;
    const q: XZ = [a[0] + t * dx, a[1] + t * dz];
    const e = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (e < d) {
      d = e;
      best = q;
    }
  }
  return best;
}

/** 輪の中に点があるか */
export function inRing(p: XZ, ring: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** 浸水深の区分の下限（m）。「5〜10m」→ 5、「0.5m未満」→ 0.3、「20m以上」→ 20。読めなければ 0 */
export function depthFloor(label: string | undefined): number {
  if (!label) return 0;
  const n = label.normalize("NFKC");
  const range = n.match(/([\d.]+)\s*[〜~-]\s*([\d.]+)\s*m/);
  if (range) return Number(range[1]);
  const over = n.match(/([\d.]+)\s*m以上/);
  if (over) return Number(over[1]);
  const under = n.match(/([\d.]+)\s*m未満/);
  if (under) return Math.min(0.3, Number(under[1]) * 0.6);
  return 0;
}
