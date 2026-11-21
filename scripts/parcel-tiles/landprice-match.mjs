// 地価公示・地価調査の地点（アプリのタイル public/data/land-price-*.pmtiles の lp。所在及び地番が書いてある）と、筆のタイル
// （地番の筆 fude・公図から推定した筆 kozu）を、手元の PMTiles のファイルから読んで突き合わせる道具。
// scripts/parcel-tiles/check_landprice.mjs（地番の筆の点検）と scripts/kozu-tiles/check_accuracy.mjs（推定の筆の確かさ）が使う。
// 地点を含む筆の選び方（地番のある筆を先に）と、筆の中かどうかの判定（偶奇）は、アプリ（lib/roadmap/parcel.ts）と同じにする。
import fs from "node:fs";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { VectorTile } = require("@mapbox/vector-tile");
const Pbf = require("pbf");
const PbfReader = Pbf.PbfReader ?? Pbf.default ?? Pbf;
const { tileIdToZxy } = require("pmtiles");

/** PMTiles（v3）をファイルから読む：z/x/y のタイルを取り出す・あるタイルを全部たどる */
export function openPmtiles(file) {
  const fd = fs.openSync(file, "r");
  const read = (off, len) => {
    const b = Buffer.alloc(len);
    fs.readSync(fd, b, 0, len, off);
    return b;
  };
  const h = read(0, 127);
  const u64 = (o) => Number(h.readBigUInt64LE(o));
  const H = { rootOff: u64(8), rootLen: u64(16), leafOff: u64(40), tileOff: u64(56), internal: h[97], tileComp: h[98] };
  const unz = (b, c) => (c === 2 ? zlib.gunzipSync(b) : b);
  const dirCache = new Map();
  function dir(off, len) {
    const k = `${off}:${len}`;
    if (dirCache.has(k)) return dirCache.get(k);
    const buf = unz(read(off, len), H.internal);
    let p = 0;
    const v = () => {
      let r = 0, s = 0, x;
      do {
        x = buf[p++];
        r += (x & 0x7f) * 2 ** s;
        s += 7;
      } while (x & 0x80);
      return r;
    };
    const nn = v();
    const e = Array.from({ length: nn }, () => ({}));
    let id = 0;
    for (const x of e) {
      id += v();
      x.id = id;
    }
    for (const x of e) x.run = v();
    for (const x of e) x.len = v();
    for (let i = 0; i < nn; i++) {
      const o = v();
      e[i].off = o === 0 && i > 0 ? e[i - 1].off + e[i - 1].len : o - 1;
    }
    dirCache.set(k, e);
    return e;
  }
  const toId = (z, x, y) => {
    let acc = 0;
    for (let i = 0; i < z; i++) acc += 4 ** i;
    let d = 0;
    const n = 2 ** z;
    let xx = x, yy = y;
    for (let s = n / 2; s >= 1; s /= 2) {
      const rx = (xx & s) > 0 ? 1 : 0, ry = (yy & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) {
          xx = s - 1 - xx;
          yy = s - 1 - yy;
        }
        [xx, yy] = [yy, xx];
      }
    }
    return acc + d;
  };
  function find(id, off, len) {
    for (const e of dir(off, len)) {
      if (e.run === 0) {
        if (id >= e.id) {
          const r = find(id, H.leafOff + e.off, e.len);
          if (r) return r;
        }
      } else if (id >= e.id && id < e.id + e.run) return e;
    }
    return null;
  }
  const tileCache = new Map();
  return {
    tile(z, x, y) {
      const k = `${z}/${x}/${y}`;
      if (tileCache.has(k)) return tileCache.get(k);
      const t = find(toId(z, x, y), H.rootOff, H.rootLen);
      const out = t ? new VectorTile(new PbfReader(new Uint8Array(unz(read(H.tileOff + t.off, t.len), H.tileComp)))) : null;
      if (tileCache.size > 4000) tileCache.clear();
      tileCache.set(k, out);
      return out;
    },
    /** ズーム z のタイルの [x, y] を全部（x の小さい順、同じ x は y の小さい順） */
    tiles(z) {
      const out = [];
      const walk = (off, len) => {
        for (const e of dir(off, len)) {
          if (e.run === 0) walk(H.leafOff + e.off, e.len);
          else
            for (let i = 0; i < e.run; i++) {
              const [tz, x, y] = tileIdToZxy(e.id + i);
              if (tz === z) out.push([x, y]);
            }
        }
      };
      walk(H.rootOff, H.rootLen);
      return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    },
  };
}

export const tileXY = (z, lng, lat) => [
  Math.floor(((lng + 180) / 360) * 2 ** z),
  Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z),
];
/** アプリ（lib/roadmap/parcel.ts の inRing）と同じ偶奇の判定 */
export const inRing = ([x, y], ring) => {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};
const KANJI = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const kanjiNum = (s) => s.replace(/([一二三四五六七八九]?)(十?)([一二三四五六七八九]?)(?=丁目)/g, (m, a, t, b) => (m ? String((a ? KANJI[a] : t ? 1 : 0) * (t ? 10 : 1) + (b ? KANJI[b] : 0)) : m));
export const townKey = (s) => kanjiNum(s.normalize("NFKC")).replace(/^大字/, "").replace(/[ヶケが]/g, "ケ").replace(/ノ/g, "の").replace(/\s/g, "");
const PIECE = /(?:W\d+|V\d+|X\(\d+\/\d+\))$/;
export const registry = (c) => c.replace(PIECE, "");
/** 所在及び地番から地番を取り出す（「3928番12」→ 3928-12、「203番6外」→ 203-6、「983番」→ 983） */
export function parseChiban(a) {
  const m = a.normalize("NFKC").match(/(\d+)番(?:地)?(?:の)?(\d+)?/);
  return m ? (m[2] ? `${m[1]}-${m[2]}` : m[1]) : null;
}
export const isLot = (c) => /^(?:番外|[甲乙丙丁戊己庚辛壬癸]{1,2}|[ｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙｦイロハニホヘトチリヌルヲ]|仮)?-?\d/.test(c);

/** 地価の地点のタイルのズーム（属性を全部持つ lp は z13 だけ） */
const LZ = 13;

/**
 * 地価公示・地価調査の地点（z13 のタイルの lp）。inTile(x, y) で読む z13 のタイルを絞れる（省略すると全部）。
 * 地点は { no：標準地・基準地の番号、a：所在及び地番（「三重県 いなべ市北勢町…49番3」）、k：0 地価公示・1 地価調査、lng、lat }。
 * タイルの縁の外（となりのタイルの地点の写し）は読まない。地点はどれも自分のタイルに1つだけある
 * （前は番号で同じ地点を1つにしていたが、地価公示の番号には都道府県が付かないので、府中市（東京都・広島県）のように
 * 名前の同じ市の地点が1つに数えられて抜けていた）
 */
export function landPricePoints(lp, inTile = () => true) {
  const points = [];
  for (const [x, y] of lp.tiles(LZ)) {
    if (!inTile(x, y)) continue;
    const layer = lp.tile(LZ, x, y)?.layers["lp"];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i), p = f.properties;
      const [pt] = f.loadGeometry()[0];
      if (pt.x < 0 || pt.y < 0 || pt.x >= layer.extent || pt.y >= layer.extent) continue;
      const gx = x + pt.x / layer.extent, gy = y + pt.y / layer.extent;
      points.push({ no: p.no, a: String(p.a ?? ""), k: p.k, lng: (gx / 2 ** LZ) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / 2 ** LZ))) * 180) / Math.PI });
    }
  }
  return points;
}

/**
 * 筆のタイル pm（レイヤ layerName、z16 に全ての筆）で、地価の地点を含む筆を選び、所在の地番と比べる関数を作る。
 * 返す関数は地点ごとに { cat：分類、pick：選んだ筆（地番区域 kuiki・地番 chiban・確かさ q）、want：所在の地番、
 * near：近く（3×3 のタイル）の同じ地番の筆までの最短距離 d（m）と地番区域、none：タイルが無い、hits：地点を含む筆 } を返す
 */
export function parcelMatcher(pm, layerName, Z = 16) {
  function hitsAt(lng, lat) {
    const [x, y] = tileXY(Z, lng, lat);
    const layer = pm.tile(Z, x, y)?.layers[layerName];
    if (!layer) return { none: true, hits: [] };
    const hits = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i), g = f.toGeoJSON(x, y, Z).geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      if (polys.some(([outer, ...holes]) => inRing([lng, lat], outer) && !holes.some((h) => inRing([lng, lat], h))))
        hits.push({ kuiki: String(f.properties["地番区域"] ?? ""), chiban: String(f.properties["地番"] ?? ""), q: f.properties.q });
    }
    return { none: false, hits };
  }
  /** 近くのタイル（3×3）で同じ地番の筆を探し、地点からの最短距離（m）を返す */
  function nearest(lng, lat, want) {
    const [x0, y0] = tileXY(Z, lng, lat);
    const mLat = 111320, mLng = 111320 * Math.cos((lat * Math.PI) / 180);
    let best = null;
    const dist = (ring) => {
      let d = Infinity;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j], [bx, by] = ring[i];
        const px = (lng - ax) * mLng, py = (lat - ay) * mLat, vx = (bx - ax) * mLng, vy = (by - ay) * mLat;
        const l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, (px * vx + py * vy) / l2)) : 0;
        d = Math.min(d, Math.hypot(px - t * vx, py - t * vy));
      }
      return d;
    };
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = x0 + dx, y = y0 + dy, layer = pm.tile(Z, x, y)?.layers[layerName];
        if (!layer) continue;
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i), ch = String(f.properties["地番"] ?? "");
          if (registry(ch) !== want) continue;
          const g = f.toGeoJSON(x, y, Z).geometry, kuiki = String(f.properties["地番区域"] ?? "");
          const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
          for (const [outer] of polys) {
            const d = dist(outer);
            if (!best || d < best.d) best = { d, kuiki };
          }
        }
      }
    return best;
  }
  return (p) => {
    const want = parseChiban(p.a);
    const { none, hits } = hitsAt(p.lng, p.lat);
    const numbered = hits.filter((h) => isLot(h.chiban));
    const pick = numbered[0] ?? hits[0] ?? null;
    const addr = townKey(p.a);
    const townOk = (k) => {
      const [, oaza = "", chome = ""] = k.split("_");
      const key = townKey(oaza + chome);
      return key ? addr.includes(key) || addr.includes(townKey(oaza)) : false;
    };
    let cat, near = null;
    const main = (c) => c.replace(/^\D+/, "").split("-")[0];
    if (none) cat = "タイルなし";
    else if (!hits.length) cat = "筆なし";
    else if (!want) cat = "所在に地番なし";
    else if (!pick || !isLot(pick.chiban)) cat = "地番の無い筆（道など）";
    else if (registry(pick.chiban).replace(/^\D+/, "") === want && townOk(pick.kuiki)) cat = "一致";
    else if (registry(pick.chiban).replace(/^\D+/, "") === want) cat = "地番一致・町の名前が違う";
    else if (numbered.some((h) => registry(h.chiban).replace(/^\D+/, "") === want)) cat = "重なる別の筆が一致（選ばれない）";
    else {
      near = nearest(p.lng, p.lat, want);
      if (!townOk(pick.kuiki)) cat = near && near.d <= 30 ? "町の名前が違う・近くに一致あり" : "町の名前が違う";
      else if (main(registry(pick.chiban)) === main(want)) cat = near ? (near.d <= 30 ? "枝番違い・近くに一致" : "枝番違い・一致は遠い") : "枝番違い・近くに一致なし";
      else cat = near ? (near.d <= 30 ? "別の地番・近くに一致" : "別の地番・一致は遠い") : "別の地番・近くに一致なし";
    }
    return { cat, pick, want, near, none, hits };
  };
}
