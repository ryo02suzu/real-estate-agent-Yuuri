// 地番タイルの点検：地価公示・地価調査の全地点（アプリのタイル public/data/land-price-*.pmtiles。所在及び地番が書いてある）で、
// その地点を含む筆の地番（アプリと同じ選び方）が所在の地番と合うかを総当たりで比べる。ずれた地図・古い地図・形の誤りの見落としを探すのに使う。
//
//   node scripts/parcel-tiles/check_landprice.mjs <地番タイル kanto-2026.pmtiles の置き場所> [結果の TSV]
//
// 地番タイルは R2 の公開 URL（lib/roadmap/data/parcel-source.json）から手元に取っておく（約1.2GB。範囲指定で分けて取る）。
// 結果：分類ごとの数（一致／枝番違い・近くに一致／別の地番・一致は遠い／町の名前が違う …）と、地点ごとの TSV。
// 「一致は遠い」「町の名前が違う」「近くに一致なし」の地点は、その地図が測地系の取り違え（約460m）や古い地図でないかを調べる
// （scripts/parcel-tiles/misplaced-sheets.json の決まりの作り方は docs/features.md 99）。
import fs from "node:fs";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { VectorTile } = require("@mapbox/vector-tile");
const Pbf = require("pbf");
const PbfReader = Pbf.PbfReader ?? Pbf.default ?? Pbf;

/** PMTiles（v3）をファイルから読む：z/x/y のタイルを取り出す */
function openPmtiles(file) {
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
  };
}

const tileXY = (z, lng, lat) => [
  Math.floor(((lng + 180) / 360) * 2 ** z),
  Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z),
];
/** アプリ（lib/roadmap/parcel.ts の inRing）と同じ偶奇の判定 */
const inRing = ([x, y], ring) => {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};
const KANJI = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const kanjiNum = (s) => s.replace(/([一二三四五六七八九]?)(十?)([一二三四五六七八九]?)(?=丁目)/g, (m, a, t, b) => (m ? String((a ? KANJI[a] : t ? 1 : 0) * (t ? 10 : 1) + (b ? KANJI[b] : 0)) : m));
const townKey = (s) => kanjiNum(s.normalize("NFKC")).replace(/^大字/, "").replace(/[ヶケが]/g, "ケ").replace(/ノ/g, "の").replace(/\s/g, "");
const PIECE = /(?:W\d+|V\d+|X\(\d+\/\d+\))$/;
const registry = (c) => c.replace(PIECE, "");
/** 所在及び地番から地番を取り出す（「3928番12」→ 3928-12、「203番6外」→ 203-6、「983番」→ 983） */
function parseChiban(a) {
  const m = a.normalize("NFKC").match(/(\d+)番(?:地)?(?:の)?(\d+)?/);
  return m ? (m[2] ? `${m[1]}-${m[2]}` : m[1]) : null;
}

const [parcelFile, outFile = "landprice-check.tsv"] = process.argv.slice(2);
if (!parcelFile) {
  console.error("使い方: node scripts/parcel-tiles/check_landprice.mjs <kanto-2026.pmtiles> [結果の TSV]");
  process.exit(1);
}
const lpFile = fs.readdirSync("public/data").filter((f) => /^land-price-.*\.pmtiles$/.test(f)).sort().pop();
const lp = openPmtiles(`public/data/${lpFile}`);
const pm = openPmtiles(parcelFile);
const Z = 16, LZ = 13;

// 地価公示・地価調査の全地点（z13 のタイルを関東の範囲で読む）
const points = [];
const seen = new Set();
const [x0, y1] = tileXY(LZ, 138.5, 26.6), [x1, y0] = tileXY(LZ, 142.21, 37.1);
for (let x = x0; x <= x1; x++)
  for (let y = y0; y <= y1; y++) {
    const t = lp.tile(LZ, x, y);
    const layer = t?.layers["lp"];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i), p = f.properties, key = `${p.k}:${p.no}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const [pt] = f.loadGeometry()[0];
      const gx = x + pt.x / layer.extent, gy = y + pt.y / layer.extent;
      points.push({ no: p.no, a: String(p.a ?? ""), k: p.k, lng: (gx / 2 ** LZ) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / 2 ** LZ))) * 180) / Math.PI });
    }
  }

function hitsAt(lng, lat) {
  const [x, y] = tileXY(Z, lng, lat);
  const layer = pm.tile(Z, x, y)?.layers["fude"];
  if (!layer) return { none: true, hits: [] };
  const hits = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i), g = f.toGeoJSON(x, y, Z).geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    if (polys.some(([outer, ...holes]) => inRing([lng, lat], outer) && !holes.some((h) => inRing([lng, lat], h))))
      hits.push({ kuiki: String(f.properties["地番区域"] ?? ""), chiban: String(f.properties["地番"] ?? "") });
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
      const x = x0 + dx, y = y0 + dy, layer = pm.tile(Z, x, y)?.layers["fude"];
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

const isLot = (c) => /^(?:番外|[甲乙丙丁戊己庚辛壬癸]{1,2}|[ｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙｦイロハニホヘトチリヌルヲ]|仮)?-?\d/.test(c);
const out = fs.createWriteStream(outFile);
const count = {};
for (const p of points) {
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
  count[cat] = (count[cat] ?? 0) + 1;
  out.write([p.no, p.k, p.a, p.lng.toFixed(7), p.lat.toFixed(7), cat, pick?.kuiki ?? "", pick?.chiban ?? "", want ?? "", near ? near.d.toFixed(1) : "", near?.kuiki ?? ""].join("\t") + "\n");
}
out.end();
console.log(`地点 ${points.length}（${lpFile}）`);
for (const [k, v] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log(`地点ごとの結果: ${outFile}`);
