// 最寄り駅と徒歩の目安。物件の近くの駅（国土数値情報の鉄道データ。scripts/stations/build.py で public/data/ に置く）を選び、
// 国土地理院のベクトルタイル（地理院地図Vector・z15）の道路中心線を道のりにして、物件から駅のホームの線までの道路距離を求める。
// 徒歩の分数は不動産広告の決まり（道路距離 80m を1分、1分未満は切り上げ）で出すが、駅の出入口ではなく駅（ホーム）までの
// 目安なので、広告に書くときは実際の道路距離で確かめる旨を添える。自前のサーバーは通さない（ブラウザから直接読む）
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import SOURCE from "./data/station-source.json";
import type { LngLat } from "./parcel";

/** 駅：名前、路線（[路線, 事業者]）、ホームの線の点 */
export type Station = { n: string; l: [string, string][]; p: LngLat[] };
export type StationWalk = {
  name: string;
  lines: [string, string][];
  /** 道路距離（m）。道のりが見つからなければ直線距離 */
  meters: number;
  /** 徒歩の分数（80m を1分、切り上げ） */
  minutes: number;
  /** 直線距離（m） */
  straight: number;
  /** 道路の道のりで求めたか（false は直線距離の目安） */
  routed: boolean;
};

export const STATION_DATA = { url: SOURCE.url, year: SOURCE.year };
/** 道のりの出典（駅・学校までの徒歩の目安） */
export const ROAD_CREDIT = "道のりは地理院地図Vector（国土地理院）の道路中心線から求めた目安";
/** 出典（CC BY 4.0 と国土地理院の出典表示のとおり、加工したことを書く） */
export const STATION_CREDIT = `出典：「国土数値情報（鉄道データ）」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成（${SOURCE.year}年）。${ROAD_CREDIT}`;

/** 調べる駅：直線でこの距離（m）までの駅を、近い順にこの数まで */
const MAX_STRAIGHT = 2000;
const MAX_STATIONS = 6;
/** 道路のタイル（地理院地図Vector の最適化ベクトルタイル）。z15 で z16 とほぼ同じ道路が入っていて、枚数は 1/4 */
const ROAD_ZOOM = 15;
const ROAD_TILE = (x: number, y: number) => `https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/${ROAD_ZOOM}/${x}/${y}.pbf`;

/** 道路距離から徒歩の分数（不動産広告の決まり：80m を1分、1分未満は1分に切り上げ） */
export const walkMinutes = (meters: number) => Math.max(1, Math.ceil(meters / 80));

/** 道のりを使うか：直線の 3 倍（近い所は直線＋600m）を超える道のりは、道がつながっていない（川・線路の向こうなど）とみなす */
export const routedOk = (meters: number | undefined, straight: number): meters is number => meters !== undefined && meters <= Math.max(straight * 3, straight + 600);

/** 「東急東横線」「JR横浜線」「都営新宿線」（事業者の名前が路線名の頭にあれば重ねない） */
export function lineLabel([line, op]: [string, string]): string {
  const company = op.startsWith("JR") ? "JR" : op;
  if (line === company || line.startsWith(company) || line.startsWith(op)) return line;
  return `${company}${line}`;
}

/** 「菊名駅（東急東横線・JR横浜線）徒歩約8分（約610m）」 */
export function stationLine(s: StationWalk): string {
  const dist = s.meters >= 1000 ? `${(s.meters / 1000).toFixed(1)}km` : `${Math.round(s.meters / 10) * 10}m`;
  return `${s.name}駅（${s.lines.map(lineLabel).join("・")}）${s.routed ? `徒歩約${s.minutes}分（約${dist}）` : `直線約${dist}`}`;
}

// ---- 平面の座標（物件のまわり。経緯度をそのまま m にする） ----

type XY = [number, number];
const M_LAT = 110_950;
function projector(lat0: number, lng0: number) {
  const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  return ([lng, lat]: LngLat): XY => [(lng - lng0) * mx, (lat - lat0) * M_LAT];
}

/** 近い駅（直線距離が MAX_STRAIGHT まで、近い順に MAX_STATIONS まで）。その中に無ければ、いちばん近い駅（20km まで）を1つ */
export function nearbyStations(lat: number, lng: number, stations: Station[], max = MAX_STRAIGHT): { station: Station; straight: number }[] {
  const xy = projector(lat, lng);
  const all: { station: Station; straight: number }[] = [];
  for (const s of stations) {
    let d = Infinity;
    for (const p of s.p) {
      const [x, y] = xy(p);
      d = Math.min(d, Math.hypot(x, y));
    }
    all.push({ station: s, straight: d });
  }
  all.sort((a, b) => a.straight - b.straight);
  const near = all.filter((n) => n.straight <= max).slice(0, MAX_STATIONS);
  return near.length ? near : all.slice(0, 1).filter((n) => n.straight <= 20_000);
}

// ---- 道のり（道路中心線のグラフで、物件から駅の点までの最短の道） ----

/**
 * 道路の線（経緯度の折れ線）で、物件から各駅のいちばん近い点までの道路距離（m）。道路に出るまで・道路から駅までの直線の分も足す。
 * 線はタイルの境で切れているので、端の点は 2m 以内の点につなぐ。道のりが無い駅は入れない
 */
export function walkDistances(lines: LngLat[][], from: LngLat, targets: { id: number; points: LngLat[] }[], cutoff = 5000): Map<number, number> {
  const xy = projector(from[1], from[0]);
  // 点（0.5m の格子でまとめる）と辺
  const ids = new Map<string, number>();
  const pos: XY[] = [];
  const adj: [number, number][][] = [];
  const node = (p: XY) => {
    const k = `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
    let i = ids.get(k);
    if (i === undefined) {
      i = pos.length;
      ids.set(k, i);
      pos.push(p);
      adj.push([]);
    }
    return i;
  };
  const link = (a: number, b: number, w: number) => {
    adj[a].push([b, w]);
    adj[b].push([a, w]);
  };
  const segs: [number, number][] = [];
  for (const ln of lines) {
    let prev = -1;
    for (const q of ln) {
      const i = node(xy(q));
      if (prev >= 0 && prev !== i) {
        link(prev, i, Math.hypot(pos[i][0] - pos[prev][0], pos[i][1] - pos[prev][1]));
        segs.push([prev, i]);
      }
      prev = i;
    }
  }
  // 格子（20m）で辺を引けるようにする
  const CELL = 20;
  const grid = new Map<string, number[]>();
  const cellKey = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  segs.forEach(([a, b], si) => {
    const [x0, y0] = pos[a];
    const [x1, y1] = pos[b];
    for (let gx = Math.floor(Math.min(x0, x1) / CELL); gx <= Math.floor(Math.max(x0, x1) / CELL); gx++)
      for (let gy = Math.floor(Math.min(y0, y1) / CELL); gy <= Math.floor(Math.max(y0, y1) / CELL); gy++) {
        const k = `${gx},${gy}`;
        const list = grid.get(k);
        if (list) list.push(si);
        else grid.set(k, [si]);
      }
  });
  // タイルの境で切れた線の端どうし（つながる点が1つだけの点）を、2m 以内の点につなぐ
  const near = new Map<string, number[]>();
  pos.forEach(([x, y], i) => {
    const k = cellKey(x, y);
    const list = near.get(k);
    if (list) list.push(i);
    else near.set(k, [i]);
  });
  pos.forEach(([x, y], i) => {
    if (adj[i].length !== 1) return;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++)
        for (const j of near.get(`${gx},${gy}`) ?? []) {
          if (j === i) continue;
          const d = Math.hypot(pos[j][0] - x, pos[j][1] - y);
          if (d <= 2 && !adj[i].some(([k]) => k === j)) link(i, j, d);
        }
  });
  type Near = { d: number; si: number; t: number; foot: XY };
  /** 格子の r0〜r1 周り目（0 は点のある格子）の辺と、点からの距離・辺の上のいちばん近い点（近い順） */
  const scan = (p: XY, r0: number, r1: number): Near[] => {
    const out: Near[] = [];
    const seen = new Set<number>();
    const cx = Math.floor(p[0] / CELL);
    const cy = Math.floor(p[1] / CELL);
    for (let gx = cx - r1; gx <= cx + r1; gx++)
      for (let gy = cy - r1; gy <= cy + r1; gy++) {
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) < r0) continue;
        for (const si of grid.get(`${gx},${gy}`) ?? []) {
          if (seen.has(si)) continue;
          seen.add(si);
          const [a, b] = segs[si];
          const [x0, y0] = pos[a];
          const [x1, y1] = pos[b];
          const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
          const t = L2 ? Math.max(0, Math.min(1, ((p[0] - x0) * (x1 - x0) + (p[1] - y0) * (y1 - y0)) / L2)) : 0;
          const foot: XY = [x0 + t * (x1 - x0), y0 + t * (y1 - y0)];
          out.push({ d: Math.hypot(foot[0] - p[0], foot[1] - p[1]), si, t, foot });
        }
      }
    return out.sort((a, b) => a.d - b.d);
  };
  /**
   * 点を近くの道路に下ろし、そこに新しい点を作って辺の両端とつなぐ（道路に出るまでの直線も足す）。いちばん近い道路が行き止まりや
   * 敷地の中の通路で遠回りになることがあるので、いちばん近い辺より 30m 遠いまでの道路（4か所まで）にもつなぐ。300m 以内に道が無ければ undefined
   */
  const attach = (p: XY): number | undefined => {
    let first: Near[] = [];
    for (let r = 0; r <= 15 && !first.length; r++) first = scan(p, r, r);
    if (!first.length) return undefined;
    // 見つかった周りの外側に、もっと近い辺があることがある
    const all = scan(p, 0, Math.ceil((first[0].d + 30) / CELL) + 1);
    if (all[0].d > 300) return undefined;
    const picked: Near[] = [];
    for (const c of all) {
      if (c.d > all[0].d + 30 || picked.length >= 4) break;
      // 同じ道路の続きの辺（下ろした点が近い）は1つでよい
      if (picked.some((q) => Math.hypot(q.foot[0] - c.foot[0], q.foot[1] - c.foot[1]) < 15)) continue;
      picked.push(c);
    }
    const s = pos.length;
    pos.push(p);
    adj.push([]);
    for (const c of picked) {
      const [a, b] = segs[c.si];
      const f = pos.length;
      pos.push(c.foot);
      adj.push([]);
      link(f, a, Math.hypot(c.foot[0] - pos[a][0], c.foot[1] - pos[a][1]));
      link(f, b, Math.hypot(c.foot[0] - pos[b][0], c.foot[1] - pos[b][1]));
      link(s, f, c.d);
    }
    return s;
  };

  const start = attach([0, 0]);
  const out = new Map<number, number>();
  if (start === undefined) return out;
  const goal = new Map<number, number>();
  for (const t of targets) for (const q of t.points) {
    const g = attach(xy(q));
    if (g !== undefined) goal.set(g, t.id);
  }
  // ダイクストラ法（二分ヒープ）
  const dist = new Float64Array(pos.length).fill(Infinity);
  dist[start] = 0;
  const heap: [number, number][] = [[0, start]];
  const push = (e: [number, number]) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u] || d > cutoff) continue;
    const id = goal.get(u);
    if (id !== undefined && !out.has(id)) out.set(id, d);
    for (const [v, w] of adj[u]) {
      const nd = d + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        push([nd, v]);
      }
    }
  }
  return out;
}

// ---- ブラウザで読む ----

let stationsPromise: Promise<Station[]> | undefined;
function loadStations(): Promise<Station[]> {
  stationsPromise ??= fetch(STATION_DATA.url)
    .then((r) => {
      if (!r.ok) throw new Error(`stations ${r.status}`);
      return r.json() as Promise<{ stations: Station[] }>;
    })
    .then((d) => d.stations)
    .catch((e) => {
      stationsPromise = undefined;
      throw e;
    });
  return stationsPromise;
}

const tileCache = new Map<string, Promise<LngLat[][]>>();
/** 道路中心線（歩けない高速道路・自動車専用道路・有料道路は外す）。経緯度の折れ線 */
function roadTile(x: number, y: number): Promise<LngLat[][]> {
  const key = `${x}/${y}`;
  let p = tileCache.get(key);
  if (!p) {
    p = fetch(ROAD_TILE(x, y))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`road tile ${r.status}`))))
      .then((buf) => {
        const layer = new VectorTile(new PbfReader(new Uint8Array(buf))).layers["RdCL"];
        const out: LngLat[][] = [];
        if (!layer) return out;
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          const pr = f.properties;
          if (pr.vt_rdctg === "高速自動車国道等" || pr.vt_motorway === 1 || pr.vt_tollsect === "有料") continue;
          const g = f.toGeoJSON(x, y, ROAD_ZOOM).geometry;
          if (g.type === "LineString") out.push(g.coordinates as LngLat[]);
          else if (g.type === "MultiLineString") out.push(...(g.coordinates as LngLat[][]));
        }
        return out;
      });
    p.catch(() => tileCache.delete(key));
    tileCache.set(key, p);
    if (tileCache.size > 80) tileCache.delete(tileCache.keys().next().value!);
  }
  return p;
}

function tileOfZ(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

/** 点を囲む範囲（+250m）の道路のタイル。多すぎる（25枚を超える。4km 四方くらい）ときは読まない */
function roadTiles(pts: LngLat[]): [number, number][] {
  const pad = 0.003;
  const west = Math.min(...pts.map((p) => p[0])) - pad;
  const east = Math.max(...pts.map((p) => p[0])) + pad;
  const south = Math.min(...pts.map((p) => p[1])) - pad;
  const north = Math.max(...pts.map((p) => p[1])) + pad;
  const [x0, y0] = tileOfZ(north, west, ROAD_ZOOM);
  const [x1, y1] = tileOfZ(south, east, ROAD_ZOOM);
  const tiles: [number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([x, y]);
  return tiles.length <= 25 ? tiles : [];
}

/**
 * 物件から目的地（駅のホームの点・学校など）までの道路距離（m）。国土地理院の道路のタイルを読む（読んだタイルは駅と学校で使い回す）。
 * タイルが読めない・遠すぎる・道がつながらない目的地は入れない
 */
export async function walkTo(lat: number, lng: number, targets: { id: number; points: LngLat[] }[]): Promise<Map<number, number>> {
  const tiles = roadTiles([[lng, lat], ...targets.flatMap((t) => t.points)]);
  const got = await Promise.allSettled(tiles.map(([x, y]) => roadTile(x, y)));
  const lines = got.flatMap((g) => (g.status === "fulfilled" ? g.value : []));
  return lines.length ? walkDistances(lines, [lng, lat], targets) : new Map();
}

/**
 * 物件の近くの駅と徒歩の目安（近い順に3つまで）。道路のタイルが読めない・道がつながらない駅は直線距離の目安（routed: false）。
 * 2km 以内に駅が無ければ、いちばん近い駅（20km まで）の直線距離だけ。それも無ければ空
 */
export async function nearestStations(lat: number, lng: number): Promise<StationWalk[]> {
  const stations = await loadStations();
  const near = nearbyStations(lat, lng, stations);
  if (!near.length) return [];
  // 歩いて行ける範囲に駅が無い（いちばん近い駅でも遠い）ときは、直線距離だけ
  if (near[0].straight > MAX_STRAIGHT) return [{ name: near[0].station.n, lines: near[0].station.l, meters: near[0].straight, minutes: walkMinutes(near[0].straight), straight: near[0].straight, routed: false }];
  const dist = await walkTo(lat, lng, near.map((n, id) => ({ id, points: n.station.p })));
  return near
    .map((n, id) => {
      const d = dist.get(id);
      const routed = routedOk(d, n.straight);
      const meters = routed ? d : n.straight;
      return { name: n.station.n, lines: n.station.l, meters, minutes: walkMinutes(meters), straight: n.straight, routed };
    })
    .sort((a, b) => Number(b.routed) - Number(a.routed) || a.meters - b.meters)
    .slice(0, 3);
}
