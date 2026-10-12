// 市の道路種別の地図データ（ArcGIS のフィーチャレイヤ。CORS で誰でも読める公開データ）を読み、
// 物件の地点のまわりにある道路の種別・方角・距離を文字で出す。地図の色を見比べなくても分かるように。
// 見ている範囲の道路の形も読み、MICHILU の地図に種別の色で描く（readRoadShapes）。
// 読むのは地図に載っている道路だけ。どれが前面道路か、幅員・接道の判断はしない（最終確認は窓口）
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon } from "geojson";
import type { LngLat } from "./parcel";

/**
 * レイヤ1つ。label があればそのレイヤの道路はすべてその種別（行田市・つくば市は種別ごとのレイヤ。color は地図の線の色）。
 * field は種別のコードの属性（レイヤごとに違うとき。無ければ RoadRead.field）
 */
export type RoadLayer = { url: string; label?: string; color?: string; field?: string };

export type RoadRead = {
  layers: RoadLayer[];
  /** 種別のコードの属性（埼玉県の指定道路図は SYUBETU）。コードはレイヤの凡例で種別名にする */
  field?: string;
  /** 幅員の属性（最小・最大。0 は記録なし） */
  width?: [string, string];
};

export type NearbyRoad = {
  /** 種別（地図の凡例のまま。例：法第42条第1項第1号道路） */
  label: string;
  /** 短い呼び方（例：1項1号） */
  short: string;
  /** 地図の線の色（#rrggbb） */
  color?: string;
  /** 地点からいちばん近い所までの距離（m） */
  distance: number;
  /** 地点から見た方角（北・北東…） */
  direction: string;
  /** 幅員（「4.0〜4.5m」） */
  width?: string;
};

/** 地点からこの距離（m）以内の道路を読む（奥行きのある土地の中の点からでも、前の道路に届くように） */
export const ROAD_RADIUS_M = 50;

type Legend = Map<string, { label: string; color?: string }>;
type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const legends = new Map<string, Promise<Legend & { simpleColor?: string }>>();

/** レイヤの凡例（コード → 種別名・色）。一度読んだら覚えておく */
function legendOf(url: string, fetchFn: Fetch): Promise<Legend & { simpleColor?: string }> {
  let p = legends.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetchFn(`${url}?f=json`);
      const info = (await res.json()) as {
        drawingInfo?: { renderer?: { type?: string; symbol?: { color?: number[] }; uniqueValueInfos?: { value: string | number; label?: string; symbol?: { color?: number[] } }[] } };
        fields?: { domain?: { codedValues?: { code: string | number; name: string }[] } }[];
      };
      const legend: Legend & { simpleColor?: string } = new Map();
      const r = info.drawingInfo?.renderer;
      for (const u of r?.uniqueValueInfos ?? []) legend.set(String(u.value), { label: u.label || String(u.value), color: rgb(u.symbol?.color) });
      for (const f of info.fields ?? []) for (const c of f.domain?.codedValues ?? []) if (!legend.has(String(c.code))) legend.set(String(c.code), { label: c.name });
      legend.simpleColor = rgb(r?.symbol?.color);
      return legend;
    })();
    p.catch(() => legends.delete(url));
    legends.set(url, p);
  }
  return p;
}

const rgb = (c?: number[]) => (c && c.length >= 3 ? `#${c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("")}` : undefined);

/** 地点のまわりの道路。近い順、同じ種別・同じ方角は1つにまとめる（最大 limit 件） */
export async function readRoads(read: RoadRead, lat: number, lng: number, { fetchFn = fetch as Fetch, limit = 5 } = {}): Promise<NearbyRoad[]> {
  const p: LngLat = [lng, lat];
  const found: NearbyRoad[] = [];
  await Promise.all(
    read.layers.map(async (layer) => {
      const legend = layer.label ? undefined : await legendOf(layer.url, fetchFn);
      const field = layer.field ?? read.field;
      const q = new URLSearchParams({
        f: "json",
        geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        distance: String(ROAD_RADIUS_M),
        units: "esriSRUnit_Meter",
        outFields: [field, ...(read.width ?? [])].filter(Boolean).join(",") || "*",
        returnGeometry: "true",
        outSR: "4326",
        resultRecordCount: "50",
      });
      const res = await fetchFn(`${layer.url}/query?${q}`);
      if (!res.ok) throw new Error(`road layer ${res.ok}`);
      const data = (await res.json()) as { error?: unknown; features?: { attributes: Record<string, unknown>; geometry?: { paths?: LngLat[][]; rings?: LngLat[][] } }[] };
      if (data.error) throw new Error("road layer error");
      for (const f of data.features ?? []) {
        const lines = f.geometry?.paths ?? f.geometry?.rings ?? [];
        if (!lines.length) continue;
        const near = nearest(p, lines);
        const code = field ? String(f.attributes[field] ?? "").trim() : "";
        const entry = legend?.get(code);
        // 凡例に無いコードの道路は、市の地図にも描かれないので出さない
        if (!layer.label && legend?.size && !entry) continue;
        const label = layer.label ?? entry?.label ?? code;
        if (!label) continue;
        const [w1, w2] = (read.width ?? []).map((k) => Number(f.attributes[k]) || 0);
        found.push({
          label,
          short: roadShort(label),
          color: layer.color ?? entry?.color ?? legend?.simpleColor,
          distance: near.distance,
          direction: near.distance < 1.5 ? "地点上" : compass(near.bearing),
          width: widthLabel(w1, w2),
        });
      }
    }),
  );
  found.sort((a, b) => a.distance - b.distance);
  const seen = new Set<string>();
  return found.filter((r) => !seen.has(`${r.label}|${r.direction}`) && seen.add(`${r.label}|${r.direction}`)).slice(0, limit);
}

/** 地図に描く道路の属性：種別（凡例の名前）・短い呼び方・色 */
export type RoadShapeProps = { label: string; short: string; color: string };

/** 1回に読む件数（ArcGIS の上限は 1000〜2000）と、読む回数の上限 */
const PAGE = 1000;
const MAX_PAGES = 4;
/** 描くときの形の間引き（度。約0.4m） */
const SIMPLIFY_DEG = 0.000004;

/** 読んだ道路の形。truncated は、件数の上限で読み切れなかったレイヤがあるとき（範囲の一部の道路が無い） */
export type RoadShapes = FeatureCollection<MultiLineString | MultiPolygon, RoadShapeProps> & { truncated: boolean };

/**
 * 範囲（[西, 南, 東, 北]）の中の道路を読み、地図に描ける形（GeoJSON）にする。線は線のまま、道路の区域の面は面のまま。
 * 種別・色の決め方は readRoads と同じ（レイヤの label・color か、凡例のコード）
 */
export async function readRoadShapes(read: RoadRead, bbox: [number, number, number, number], { fetchFn = fetch as Fetch } = {}): Promise<RoadShapes> {
  const features: Feature<MultiLineString | MultiPolygon, RoadShapeProps>[] = [];
  let truncated = false;
  await Promise.all(
    read.layers.map(async (layer) => {
      const legend = layer.label ? undefined : await legendOf(layer.url, fetchFn);
      const field = layer.field ?? read.field;
      for (let page = 0; page < MAX_PAGES; page++) {
        const q = new URLSearchParams({
          f: "json",
          geometry: bbox.join(","),
          geometryType: "esriGeometryEnvelope",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          outFields: field ?? "",
          returnGeometry: "true",
          outSR: "4326",
          geometryPrecision: "7",
          maxAllowableOffset: String(SIMPLIFY_DEG),
          resultOffset: String(page * PAGE),
          resultRecordCount: String(PAGE),
        });
        const res = await fetchFn(`${layer.url}/query?${q}`);
        if (!res.ok) throw new Error(`road layer ${res.ok}`);
        const data = (await res.json()) as {
          error?: unknown;
          exceededTransferLimit?: boolean;
          features?: { attributes?: Record<string, unknown>; geometry?: { paths?: LngLat[][]; rings?: LngLat[][] } }[];
        };
        if (data.error) throw new Error("road layer error");
        for (const f of data.features ?? []) {
          const code = field ? String(f.attributes?.[field] ?? "").trim() : "";
          const entry = legend?.get(code);
          if (!layer.label && legend?.size && !entry) continue;
          const label = layer.label ?? entry?.label ?? code;
          if (!label) continue;
          const props: RoadShapeProps = { label, short: roadShort(label), color: layer.color ?? entry?.color ?? legend?.simpleColor ?? "#8a6632" };
          const g = f.geometry;
          if (g?.paths?.length) features.push({ type: "Feature", properties: props, geometry: { type: "MultiLineString", coordinates: g.paths } });
          else if (g?.rings?.length) features.push({ type: "Feature", properties: props, geometry: { type: "MultiPolygon", coordinates: ringsToPolygons(g.rings) } });
        }
        if (!data.exceededTransferLimit || (data.features?.length ?? 0) < PAGE) break;
        if (page === MAX_PAGES - 1) truncated = true;
      }
    }),
  );
  return { type: "FeatureCollection", features, truncated };
}

/** ArcGIS の rings（外周は時計回り、穴は反時計回り）を、GeoJSON の多角形の並びにする */
export function ringsToPolygons(rings: LngLat[][]): LngLat[][][] {
  const polys: LngLat[][][] = [];
  for (const ring of rings) {
    // 辺ごとの (x2 - x1)(y2 + y1) の和が正なら時計回り（経度・緯度のまま、北が上）
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[i][0] - ring[j][0]) * (ring[i][1] + ring[j][1]);
    const clockwise = sum > 0;
    if (clockwise || polys.length === 0) polys.push([ring]);
    else polys[polys.length - 1].push(ring);
  }
  return polys;
}

function widthLabel(a: number, b: number): string | undefined {
  const lo = Math.min(a || b, b || a);
  const hi = Math.max(a, b);
  if (!hi) return undefined;
  return lo && lo !== hi ? `${lo.toFixed(1)}〜${hi.toFixed(1)}m` : `${hi.toFixed(1)}m`;
}

/** 「法第42条第1項第1号道路」→「1項1号」、「法第42条第2項道路」→「2項道路」のような短い呼び方 */
export function roadShort(label: string): string {
  const s = label.normalize("NFKC");
  if (/未判定/.test(s)) return "未判定";
  if (/予定道路/.test(s)) return "予定道路";
  if (/法定外|2項外/.test(s)) return "法定外";
  const m = s.match(/42条(?:第)?(\d)項(?:(?:第)?(\d)号)?/);
  if (m) return m[2] ? `${m[1]}項${m[2]}号` : `${m[1]}項道路`;
  return s.length > 10 ? `${s.slice(0, 10)}…` : s;
}

const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
const compass = (bearing: number) => DIRS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

/** 地点から折れ線（いくつか）のいちばん近い所までの距離（m）と方角（度。北が 0、時計回り） */
export function nearest(p: LngLat, lines: LngLat[][]): { distance: number; bearing: number } {
  const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110_950;
  let best = { distance: Infinity, bearing: 0 };
  for (const line of lines)
    for (let i = 0; i < line.length; i++) {
      const a = line[i];
      const b = line[Math.min(i + 1, line.length - 1)];
      const ax = (a[0] - p[0]) * kx;
      const ay = (a[1] - p[1]) * ky;
      const dx = (b[0] - a[0]) * kx;
      const dy = (b[1] - a[1]) * ky;
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
      const x = ax + t * dx;
      const y = ay + t * dy;
      const d = Math.hypot(x, y);
      if (d < best.distance) best = { distance: d, bearing: (Math.atan2(x, y) * 180) / Math.PI };
    }
  return best;
}
