// 街の模型（components/app/property-3d.ts）に載せる筆・用途地域の形。経度・緯度の多角形を、調べた地点を原点にしたメートルの座標
// （東が +x、南が +z。lib/app/town-model.ts と同じ）に直し、タイルの範囲で切り抜く。筆も用途地域もタイルの境で切れていて、
// 少しはみ出した分（のりしろ）があるので、切り抜かないと境で線が二重になり、色が重なって濃くなる。
// 境に乗る線（タイルの継ぎ目）は描かない（2D の地図と同じ。components/app/tile-map.tsx）
import { tileBounds, type Polygon } from "../roadmap/parcel";
import type { XZ } from "./town-model";

/** 原点からのメートルの四角（x0 < x1、z0 < z1） */
export type Rect = { x0: number; z0: number; x1: number; z1: number };
export type SceneFill = { outer: XZ[]; holes: XZ[][] };
/** 形：塗る面、輪郭の線分（継ぎ目を除く）、角の点（継ぎ目の上の点を除く） */
export type SceneShape = { fills: SceneFill[]; edges: [XZ, XZ][]; corners: XZ[] };

type ToLocal = (lng: number, lat: number) => XZ;

/** タイルの範囲（原点からのメートル） */
export function tileRect(tx: number, ty: number, z: number, toLocal: ToLocal): Rect {
  const [w, s, e, n] = tileBounds(tx, ty, z);
  const [x0, z0] = toLocal(w, n);
  const [x1, z1] = toLocal(e, s);
  return { x0, z0, x1, z1 };
}

/** 多角形の輪を四角で切り抜く（Sutherland–Hodgman。四角は凸なので、へこんだ輪でも正しく切れる） */
export function clipRing(ring: XZ[], r: Rect): XZ[] {
  type Side = { inside: (p: XZ) => boolean; cut: (a: XZ, b: XZ) => XZ };
  const at = (a: XZ, b: XZ, axis: 0 | 1, v: number): XZ => {
    const t = (v - a[axis]) / (b[axis] - a[axis]);
    return axis === 0 ? [v, a[1] + (b[1] - a[1]) * t] : [a[0] + (b[0] - a[0]) * t, v];
  };
  const sides: Side[] = [
    { inside: (p) => p[0] >= r.x0, cut: (a, b) => at(a, b, 0, r.x0) },
    { inside: (p) => p[0] <= r.x1, cut: (a, b) => at(a, b, 0, r.x1) },
    { inside: (p) => p[1] >= r.z0, cut: (a, b) => at(a, b, 1, r.z0) },
    { inside: (p) => p[1] <= r.z1, cut: (a, b) => at(a, b, 1, r.z1) },
  ];
  let out = ring;
  // 閉じた輪の最後の点（最初と同じ）は外して扱う
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out = out.slice(0, -1);
  for (const s of sides) {
    if (!out.length) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const ci = s.inside(cur);
      const pi = s.inside(prev);
      if (ci) {
        if (!pi) out.push(s.cut(prev, cur));
        out.push(cur);
      } else if (pi) out.push(s.cut(prev, cur));
    }
  }
  return out.length >= 3 ? out : [];
}

/** 線分を四角で切り抜く（Liang–Barsky）。外なら null */
export function clipSegment(a: XZ, b: XZ, r: Rect): [XZ, XZ] | null {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a[0] - r.x0],
    [dx, r.x1 - a[0]],
    [-dz, a[1] - r.z0],
    [dz, r.z1 - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [
    [a[0] + dx * t0, a[1] + dz * t0],
    [a[0] + dx * t1, a[1] + dz * t1],
  ];
}

/** 点が四角のどの辺の上にあるか（0 西・1 東・2 北・3 南。どれでもなければ -1） */
function sideOf(p: XZ, r: Rect, eps: number): number {
  if (Math.abs(p[0] - r.x0) < eps) return 0;
  if (Math.abs(p[0] - r.x1) < eps) return 1;
  if (Math.abs(p[1] - r.z0) < eps) return 2;
  if (Math.abs(p[1] - r.z1) < eps) return 3;
  return -1;
}

/** 継ぎ目とみなす近さ（m） */
const SEAM_EPS = 0.05;
/** 角とみなす曲がり（度）と、角どうしをまとめる近さ（m） */
const CORNER_DEG = 25;
const CORNER_MERGE = 0.8;

/**
 * 筆（タイルごとの部分）を模型の形にする。部分ごとに、そのタイルの範囲で切り抜き、範囲の辺に乗る線（継ぎ目）は外す。
 * 角の点は、曲がりのはっきりした所だけ（細かく折れた線の点は外す）
 */
export function shapeOf(pieces: { polygons: Polygon[]; rect: Rect }[], toLocal: ToLocal): SceneShape {
  const fills: SceneFill[] = [];
  const edges: [XZ, XZ][] = [];
  const corners: XZ[] = [];
  for (const { polygons, rect } of pieces) {
    for (const poly of polygons) {
      const rings = poly.map((ring) => ring.map(([lng, lat]) => toLocal(lng, lat)));
      if (!rings.length) continue;
      const outer = clipRing(rings[0], rect);
      if (!outer.length) continue;
      const holes = rings
        .slice(1)
        .map((h) => clipRing(h, rect))
        .filter((h) => h.length);
      fills.push({ outer, holes });
      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const seg = clipSegment(ring[i], ring[i + 1], rect);
          if (!seg) continue;
          const [p, q] = seg;
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01) continue;
          const s = sideOf(p, rect, SEAM_EPS);
          if (s >= 0 && s === sideOf(q, rect, SEAM_EPS)) continue;
          edges.push(seg);
        }
      }
      // 角（外周だけ。継ぎ目の上の点は切り抜きで生まれた点なので外す）
      const ring = rings[0];
      const n = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.length - 1 : ring.length;
      for (let i = 0; i < n; i++) {
        const p = ring[i];
        if (p[0] < rect.x0 || p[0] > rect.x1 || p[1] < rect.z0 || p[1] > rect.z1 || sideOf(p, rect, SEAM_EPS) >= 0) continue;
        const a = ring[(i + n - 1) % n];
        const b = ring[(i + 1) % n];
        const u = Math.atan2(p[1] - a[1], p[0] - a[0]);
        const v = Math.atan2(b[1] - p[1], b[0] - p[0]);
        let turn = Math.abs(((v - u) * 180) / Math.PI) % 360;
        if (turn > 180) turn = 360 - turn;
        if (turn < CORNER_DEG) continue;
        if (corners.some((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) < CORNER_MERGE)) continue;
        corners.push(p);
      }
    }
  }
  return { fills, edges, corners };
}

/** 輪の面積（㎡。向きは問わない） */
export function ringArea(ring: XZ[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}

/** 輪の中か（偶奇） */
function inside(p: XZ, ring: XZ[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/**
 * 形の中の代表点（札を置く所）。いちばん大きい面の重心が中にあればそれ、無ければ面の中を横に切った線のいちばん長い所の真ん中
 */
export function labelPoint(shape: SceneShape): XZ | null {
  const big = shape.fills.reduce<SceneFill | null>((m, f) => (!m || ringArea(f.outer) > ringArea(m.outer) ? f : m), null);
  if (!big) return null;
  const r = big.outer;
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, z0] = r[i];
    const [x1, z1] = r[(i + 1) % r.length];
    const k = x0 * z1 - x1 * z0;
    a += k;
    cx += (x0 + x1) * k;
    cz += (z0 + z1) * k;
  }
  if (Math.abs(a) > 1e-9) {
    const c: XZ = [cx / (3 * a), cz / (3 * a)];
    if (inside(c, r) && !big.holes.some((h) => inside(c, h))) return c;
  }
  // 重心が外（L 字・コの字の筆）：高さの真ん中で横に切って、中にある区間のいちばん長い所
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const [, z] of r) {
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  let best: XZ | null = null;
  let bestLen = 0;
  for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const z = zMin + (zMax - zMin) * t;
    const xs: number[] = [];
    for (let i = 0; i < r.length; i++) {
      const [x0, z0] = r[i];
      const [x1, z1] = r[(i + 1) % r.length];
      if (z0 > z !== z1 > z) xs.push(x0 + ((z - z0) / (z1 - z0)) * (x1 - x0));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2)
      if (xs[i + 1] - xs[i] > bestLen) {
        bestLen = xs[i + 1] - xs[i];
        best = [(xs[i] + xs[i + 1]) / 2, z];
      }
    if (best) break;
  }
  return best;
}

/** 形の範囲 [x0, z0, x1, z1] */
export function boundsOf(shape: SceneShape): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of shape.fills)
    for (const [x, z] of f.outer) {
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], z);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], z);
    }
  return b;
}

/** 範囲が、原点から radius（m）の円に掛かるか */
export function nearOrigin(b: [number, number, number, number], radius: number): boolean {
  const dx = Math.max(b[0], 0, -b[2]);
  const dz = Math.max(b[1], 0, -b[3]);
  return Math.hypot(dx, dz) <= radius;
}
