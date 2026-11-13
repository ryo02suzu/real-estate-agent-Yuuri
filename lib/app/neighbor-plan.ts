// 隣の土地の「どこか」：物件の筆から見た隣の筆の方角と、境界を接している長さ、配置図（北が上の平面図）に描く範囲。
// 形は街の模型と同じ座標（調べた地点を原点にしたメートル。東が +x、南が +z。lib/app/town-model.ts）。
// 筆の線はタイルの範囲で切り抜かれていて、タイルの継ぎ目の線は SceneShape.edges に入っていない（継ぎ目を境界と見ない）。
// どれも地図データ（登記所備付地図）からの目安で、公図・現地の境界の確認の代わりにはならない
import { clipRing, clipSegment, labelPoint, type Rect, type SceneFill, type SceneShape } from "./scene-lots";
import type { XZ } from "./town-model";

/** 8つの方角（北から時計回り） */
export const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"] as const;
export type Dir8 = (typeof DIRS)[number];

/** from から to への方位角（度。北が 0°、時計回り。x は東、z は南） */
export function bearingOf(from: XZ, to: XZ): number {
  const deg = (Math.atan2(to[0] - from[0], -(to[1] - from[1])) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** 方位角を8つの方角に（北は 337.5°〜22.5°） */
export function dir8(bearing: number): Dir8 {
  const b = ((bearing % 360) + 360) % 360;
  return DIRS[Math.round(b / 45) % 8];
}

/** 点から線分までの距離（m） */
function segDist(p: XZ, a: XZ, b: XZ): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** 点から線分への垂線の長さ（垂線の足が線分の上に無ければ Infinity。線分の延長の先は数えない） */
function footDist(p: XZ, a: XZ, b: XZ): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = dx * dx + dz * dz;
  if (len === 0) return Infinity;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len;
  if (t < 0 || t > 1) return Infinity;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/**
 * 物件の筆の線のうち、相手の筆の線から tol（m）以内にある部分の長さと、その真ん中の点（境界を接している所）。
 * 物件の線を step（m）ごとに区切って、区切りの真ん中が、向きのそろった（30°以内）相手の線に近いかで数える
 * （角で直角に曲がる相手の線は数えない。数えると、角のまわりで接する長さが少し長く出る）
 */
export function sharedEdge(
  target: [XZ, XZ][],
  other: [XZ, XZ][],
  tol = 0.6,
  step = 0.5,
  inside?: (p: XZ) => boolean,
): { length: number; mid: XZ | null; normal: XZ | null } {
  if (!target.length || !other.length) return { length: 0, mid: null, normal: null };
  // 相手の範囲（tol だけ広げる）の外の点は、線ごとに測らずに外す
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [a, b] of other)
    for (const p of [a, b]) {
      x0 = Math.min(x0, p[0]);
      z0 = Math.min(z0, p[1]);
      x1 = Math.max(x1, p[0]);
      z1 = Math.max(z1, p[1]);
    }
  let length = 0;
  let sx = 0;
  let sz = 0;
  let w = 0;
  // 接している線の外向きの向き（長さで重み付け）。方角はこれで決める（細長い筆でも、東の辺で接すれば「東」）
  let nx = 0;
  let nz = 0;
  for (const [a, b] of target) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const ux = (b[0] - a[0]) / L;
    const uz = (b[1] - a[1]) / L;
    // 線の外向き：線の真ん中から少し出た所が物件の筆の中なら逆向き
    let ox = -uz;
    let oz = ux;
    if (inside) {
      const m: XZ = [(a[0] + b[0]) / 2 + ox * 0.3, (a[1] + b[1]) / 2 + oz * 0.3];
      if (inside(m)) {
        ox = -ox;
        oz = -oz;
      }
    }
    // 向きのそろった相手の線だけ（sin 30° = 0.5）
    const near = other.filter(([c, d]) => {
      const M = Math.hypot(d[0] - c[0], d[1] - c[1]);
      return M > 1e-6 && Math.abs(ux * (d[1] - c[1]) - uz * (d[0] - c[0])) / M <= 0.5;
    });
    if (!near.length) continue;
    const k = Math.max(1, Math.ceil(L / step));
    const ds = L / k;
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k;
      const p: XZ = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (p[0] < x0 - tol || p[0] > x1 + tol || p[1] < z0 - tol || p[1] > z1 + tol) continue;
      if (!near.some(([c, d]) => footDist(p, c, d) <= tol)) continue;
      length += ds;
      sx += p[0] * ds;
      sz += p[1] * ds;
      nx += ox * ds;
      nz += oz * ds;
      w += ds;
    }
  }
  if (w) return { length, mid: [sx / w, sz / w], normal: inside && Math.hypot(nx, nz) > 1e-6 ? [nx, nz] : null };
  // 角だけで接する筆（線どうしは重ならない）：いちばん近い所（tol の2倍まで）を、接している所にする
  let best = Infinity;
  let at: XZ | null = null;
  for (const [a, b] of target)
    for (const [c, d] of other)
      for (const [p, q, r] of [
        [c, a, b],
        [d, a, b],
        [a, c, d],
        [b, c, d],
      ] as [XZ, XZ, XZ][]) {
        const dist = segDist(p, q, r);
        if (dist < best) {
          best = dist;
          at = p;
        }
      }
  return best <= tol * 2 && at ? { length: 0, mid: at, normal: null } : { length: 0, mid: null, normal: null };
}

/** 点が形の面の中か（穴は外） */
function inShape(shape: SceneShape, p: XZ): boolean {
  const inRing = (ring: XZ[]) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i];
      const [xj, zj] = ring[j];
      if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  return shape.fills.some((f) => inRing(f.outer) && !f.holes.some(inRing));
}

/** 隣の筆がどちら側で、どれだけ接しているか（m は地図データからの目安） */
export type Side = { dir: Dir8; bearing: number; length: number; mid: XZ };

/** 物件の筆（center はその代表点）から見た、相手の筆の方角と接する長さ。接している所が無ければ null */
export function sideOf(target: SceneShape, center: XZ, other: SceneShape, tol = 0.6): Side | null {
  const { length, mid, normal } = sharedEdge(target.edges, other.edges, tol, 0.5, (p) => inShape(target, p));
  if (!mid) return null;
  // 線で接していれば、その線の外向きの向き。角だけなら、物件の真ん中からその角への向き
  const bearing = normal && length >= 1.2 ? bearingOf([0, 0], normal) : bearingOf(center, mid);
  return { dir: dir8(bearing), bearing, length, mid };
}

/** 方角の並び（北から時計回り）。同じ方角は接する長さの長い順 */
export function bySide<T extends { side?: Side | null }>(list: T[]): T[] {
  const order = (s?: Side | null) => (s ? DIRS.indexOf(s.dir) : 99);
  return [...list].sort((a, b) => order(a.side) - order(b.side) || (b.side?.length ?? 0) - (a.side?.length ?? 0));
}

/** 「北側・境界 約12m」（角だけで接する筆は「北東の角で接する」） */
export function sideText(s: Side): string {
  if (s.length < 1.2) return `${s.dir}の角で接する`;
  return `${s.dir}側・境界 約${s.length < 10 ? s.length.toFixed(1) : Math.round(s.length)}m`;
}

/**
 * 配置図に描く範囲：物件の筆が真ん中に来て、まわりに隣の筆が見える広さ。aspect は幅÷高さ。
 * 余白は筆の大きさの 0.35 倍（8m 以上）。幅は min〜max m（物件の筆がそれより大きければ筆が入る広さ）
 */
export function planWindow(target: SceneShape, aspect: number, min = 26, max = 140): Rect {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const f of target.fills)
    for (const [x, z] of f.outer) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
  if (!Number.isFinite(x0)) return { x0: -min / 2, z0: -min / 2 / aspect, x1: min / 2, z1: min / 2 / aspect };
  const w = x1 - x0;
  const h = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const margin = Math.max(8, 0.35 * Math.max(w, h));
  let hw = w / 2 + margin;
  let hh = h / 2 + margin;
  if (hw / hh < aspect) hw = hh * aspect;
  else hh = hw / aspect;
  // 狭すぎ・広すぎを抑える（物件の筆より狭くはしない）
  const need = Math.max(w / 2 + 3, (h / 2 + 3) * aspect);
  hw = Math.max(Math.min(Math.max(hw, min / 2), Math.max(max / 2, need)), need);
  hh = hw / aspect;
  return { x0: cx - hw, z0: cz - hh, x1: cx + hw, z1: cz + hh };
}

/** 形を描く範囲で切り抜く（面と線。範囲の外なら空） */
export function clipShape(shape: SceneShape, r: Rect): SceneShape {
  const fills: SceneFill[] = [];
  for (const f of shape.fills) {
    const outer = clipRing(f.outer, r);
    if (!outer.length) continue;
    fills.push({ outer, holes: f.holes.map((h) => clipRing(h, r)).filter((h) => h.length) });
  }
  const edges: [XZ, XZ][] = [];
  for (const [a, b] of shape.edges) {
    const s = clipSegment(a, b, r);
    if (s) edges.push(s);
  }
  return { fills, edges, corners: [] };
}

/** 切り抜いた形の札の位置（無ければ null） */
export function planLabelAt(shape: SceneShape): XZ | null {
  return shape.fills.length ? labelPoint(shape) : null;
}

/** 面を SVG の path の d に（輪ごとに閉じる。穴も同じ path に入れて evenodd で抜く） */
export function fillPath(fills: SceneFill[]): string {
  const ring = (r: XZ[]) => `M${r.map(([x, z]) => `${x.toFixed(2)} ${z.toFixed(2)}`).join("L")}Z`;
  return fills.map((f) => [f.outer, ...f.holes].map(ring).join("")).join("");
}

/** 線分を SVG の path の d に */
export function edgePath(edges: [XZ, XZ][]): string {
  return edges.map(([a, b]) => `M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`).join("");
}

/** 縮尺の棒の長さ（m）：描く幅の 1/5 くらいの切りのいい数 */
export function scaleBar(widthM: number): number {
  const want = widthM / 5;
  for (const v of [2, 5, 10, 20, 25, 50, 100]) if (v >= want * 0.7) return v;
  return 100;
}
