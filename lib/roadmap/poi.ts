// 周辺施設（販売図面の「生活環境」）。OpenStreetMap（© OpenStreetMap contributors、ODbL）の施設（scripts/poi/build.py。z14 の点のタイル）
// から、物件のまわりの種類ごとに近い施設を選び、国土地理院の道路中心線（lib/roadmap/walk.ts）で徒歩の目安を出す（道路距離 80m を1分）。
// 施設の入口ではなく施設の位置（面の施設は面の中ほど）までの目安で、OpenStreetMap に載っていない施設もあるので、広告に書くときは
// 実際の道路距離と、施設が今もあるかを確かめる旨を添える
import SOURCE from "./data/poi-source.json";
import type { LngLat } from "./parcel";
import { ROAD_CREDIT, routedOk, walkMinutes, walkTo } from "./walk";

/** 施設のタイルのズーム（z14 だけ。1枚が約2km四方） */
export const POI_ZOOM = 14;

export const POI_DATA = { url: process.env.NEXT_PUBLIC_POI_PMTILES_URL || SOURCE.url, date: SOURCE.date, layer: "poi" };

/** 種類の番号（タイルの c）→ 名前。番号は scripts/poi/build.py の KINDS と同じ */
export const POI_KINDS: Record<number, string> = {
  1: "スーパー",
  2: "コンビニ",
  3: "ドラッグストア",
  4: "病院",
  5: "診療所",
  6: "公園",
  7: "郵便局",
  8: "銀行",
  9: "幼稚園・保育園",
  10: "役所",
  11: "図書館",
  12: "商業施設",
};

/** 画面・下書き・共有に出す順（販売図面の生活環境によく書く順） */
export const POI_ORDER = [1, 2, 3, 12, 4, 5, 9, 6, 7, 8, 11, 10];

export type Poi = { kind: number; name: string; at: LngLat };

/** タイル (x, y)（z14）の施設。タイルが無ければ null（施設の無い所） */
export type PoiSource = { tile(x: number, y: number): Promise<Poi[] | null> };

export type PoiWalk = {
  kind: number;
  /** 「スーパー」 */
  label: string;
  name: string;
  /** 道路距離（m）。道のりが見つからなければ直線距離 */
  meters: number;
  /** 徒歩の分数（80m を1分、切り上げ） */
  minutes: number;
  /** 直線距離（m） */
  straight: number;
  /** 道路の道のりで求めたか（false は直線距離の目安） */
  routed: boolean;
};

/** 探す範囲（直線距離）。これより遠い施設は出さない（徒歩15分くらい） */
export const POI_MAX_M = 1200;
/** 種類ごとに道のりを測る候補の数（直線で近い順。道のりでは順番が入れ替わることがある） */
const CANDIDATES = 3;

const M_LAT = 110_950;
const distanceM = ([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) => {
  const kx = 111_320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot((lng2 - lng1) * kx, (lat2 - lat1) * M_LAT);
};

function tileOf(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

/** 物件のまわり（POI_MAX_M 以内）の施設。物件のタイルと、範囲がかかる隣のタイルを読む */
export async function nearbyPois(lat: number, lng: number, source: PoiSource, maxM = POI_MAX_M): Promise<(Poi & { straight: number })[]> {
  const dLat = maxM / M_LAT;
  const dLng = maxM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const [x0, y0] = tileOf(lat + dLat, lng - dLng, POI_ZOOM);
  const [x1, y1] = tileOf(lat - dLat, lng + dLng, POI_ZOOM);
  const tiles: [number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([x, y]);
  const got = await Promise.all(tiles.map(([x, y]) => source.tile(x, y)));
  const here: LngLat = [lng, lat];
  return got
    .flatMap((t) => t ?? [])
    .map((p) => ({ ...p, straight: distanceM(here, p.at) }))
    .filter((p) => p.straight <= maxM)
    .sort((a, b) => a.straight - b.straight);
}

/**
 * 種類ごとの最寄りの施設と徒歩の目安（POI_ORDER の順。近くに無い種類は入れない）。
 * 種類ごとに直線で近い3つまでの道のりを測り、いちばん近いものを選ぶ。道がつながらない・遠回りすぎるものは直線距離の目安
 */
export async function nearestPois(lat: number, lng: number, source: PoiSource, walk = walkTo): Promise<PoiWalk[]> {
  const pois = await nearbyPois(lat, lng, source);
  const byKind = new Map<number, (Poi & { straight: number })[]>();
  for (const p of pois) {
    const list = byKind.get(p.kind) ?? [];
    // 同じ名前の施設（チェーン店の別の点・同じ施設の点と面）は近い方だけ
    if (list.length < CANDIDATES && !list.some((q) => q.name === p.name)) list.push(p);
    byKind.set(p.kind, list);
  }
  const candidates = [...byKind.values()].flat();
  if (!candidates.length) return [];
  const dist = await walk(
    lat,
    lng,
    candidates.map((c, id) => ({ id, points: [c.at] })),
  ).catch(() => new Map<number, number>());
  const out: PoiWalk[] = [];
  for (const kind of POI_ORDER) {
    const list = byKind.get(kind);
    if (!list?.length) continue;
    const walks = list.map((c) => {
      const d = dist.get(candidates.indexOf(c));
      const routed = routedOk(d, c.straight);
      const meters = routed ? d : c.straight;
      return { kind, label: POI_KINDS[kind], name: c.name, meters, minutes: walkMinutes(meters), straight: c.straight, routed };
    });
    walks.sort((a, b) => Number(b.routed) - Number(a.routed) || a.meters - b.meters);
    out.push(walks[0]);
  }
  return out;
}

// ---- 画面・共有・下書きの文字 ----

/** 「約450m」 */
const metersText = (m: number) => (m < 1000 ? `約${Math.max(10, Math.round(m / 10) * 10)}m` : `約${(Math.round(m / 100) / 10).toFixed(1)}km`);

/** 「徒歩約6分（約450m）」。道のりが見つからなければ「直線約450m」 */
export function poiWalkText(w: PoiWalk): string {
  return w.routed ? `徒歩約${w.minutes}分（${metersText(w.meters)}）` : `直線${metersText(w.straight)}`;
}

/** 「スーパー：〇〇 本町店 徒歩約6分（約450m）」 */
export function poiLine(w: PoiWalk): string {
  return `${w.label}：${w.name} ${poiWalkText(w)}`;
}

/** 広告に書くときの注意 */
export const POI_NOTE = "施設の位置までの道路距離の目安（80m を1分）。広告には実際の道路距離と、施設が今もあるかを確かめて書いてください";

/** OpenStreetMap の出典とライセンス（ODbL は「© OpenStreetMap contributors」とライセンスを示すよう求めている） */
export const POI_SOURCE = "© OpenStreetMap contributors（ODbL）";

/** 画面の出典（データの時点と道のりの出典も） */
export const POI_CREDIT = `出典：© OpenStreetMap contributors（ODbL・${SOURCE.date}時点）を加工して作成。${ROAD_CREDIT}`;

/** 下書き・共有の出典。道のりの出典は、駅の出典に入っていれば（withRoad=false）付けない */
export const poiCredit = (withRoad: boolean) => `周辺施設：${POI_SOURCE}を加工して作成${withRoad ? `。${ROAD_CREDIT}` : ""}`;
