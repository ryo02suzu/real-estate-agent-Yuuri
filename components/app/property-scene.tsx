"use client";

// 物件の画面のいちばん奥：街の模型（components/app/property-3d.ts）と、時間帯の空（昼・夕方・夜。夜は星）、上の字を読みやすくする影。
// 物件の画面（components/app/mobile-app.tsx の PropertyView）が、拡大・縮小する枠の外の置き場に出す（ホーム・お気に入りの写真と同じ）。
// 材料はブラウザから直接、公的なデータを読む（住所は送らない）：国土地理院の最適化ベクトルタイル（建物・道路・水。約500m 四方のタイル4枚）、
// 筆（法務省の登記所備付地図データ。地番の検索で読んだものと同じタイル）、用途地域（国土交通省の都市計画データ）、ハザードマップの色
// （重ねるハザードマップのタイル。ハザードのタブを開いたときだけ）、駅・施設・地価の地点（物件の画面がもう読んだもの）。
// 届いた順に模型に足す：建物と土地 → まわりの筆の線 → 用途地域の色 → 施設の印・札。
// WebGL が使えない端末では、模型の代わりに平らな地図（地理院タイル）に筆の形を重ねて出す
import { useEffect, useRef, useState, type RefObject } from "react";
import { classAt, hazardCards } from "@/lib/app/hazard-level";
import { boundsOf, labelPoint, nearOrigin, ringArea, shapeOf, tileRect, type SceneShape } from "@/lib/app/scene-lots";
import { dayPart, overrideTime, solar } from "@/lib/app/sun";
import { buildTown, decodeTownTile, depthFloor, directionOf, frontRoads, localOf, metersPerPixel, nearestOnLine, rankText, townSeams, townTiles, townTileUrl, type Origin, type RawTown, type TownModel, type XZ } from "@/lib/app/town-model";
import { webglAvailable } from "@/lib/map-style";
import { HAZARDS, hazardTileUrl } from "@/lib/roadmap/hazard";
import { PARCEL_ZOOM, registryChiban, type Neighbor, type Parcel } from "@/lib/roadmap/parcel";
import { pmtilesParcelSource } from "@/lib/roadmap/parcel-tiles";
import { YOUTO_COLORS, youtoShort, ZONING_ZOOM } from "@/lib/roadmap/zoning";
import { pmtilesZoningSource } from "@/lib/roadmap/zoning-tiles";
import { toWorldPixel } from "@/lib/tiles";
import { addressOffLot } from "../parcel-card";
import { createPropertyScene, SHADE, SKY, type PropertyScene, type SceneLabel, type SceneLot, type ScenePart, type ScenePin, type SceneTab, type SceneZone } from "./property-3d";
import { shortName } from "./r-around";
import { KIND_STYLE, metersText } from "./shared";
import { SKY_EVENT } from "./sky-event";
import { TileMap } from "./tile-map";
import { reducedMotion } from "./tokens";
import type { FrontRoad, HazardPick } from "./types";
import type { Ok, PropertyData } from "./use-property";

/** 日本の時差（分） */
const JST = 540;

/** 物件の地点の今の時間帯（URL の #t= で日時を固定していればその時刻） */
export function propertyPartNow(lat: number, lng: number): ScenePart {
  const s = solar(overrideTime(location.hash) ?? new Date(), { lat, lng, utcOffset: JST });
  return dayPart(s.altitude, s.rising);
}

/** 物件の地点の太陽と時間帯（空を入れ直すたびに見直す。components/app/sky.tsx の useSkyClock） */
export function usePropertySun(lat: number, lng: number): { part: ScenePart; az: number; alt: number } {
  const [sun, setSun] = useState<{ part: ScenePart; az: number; alt: number }>(() => {
    if (typeof window === "undefined") return { part: "day", az: 160, alt: 40 };
    const s = solar(overrideTime(location.hash) ?? new Date(), { lat, lng, utcOffset: JST });
    return { part: dayPart(s.altitude, s.rising), az: s.azimuth, alt: s.altitude };
  });
  useEffect(() => {
    const read = () => {
      const s = solar(overrideTime(location.hash) ?? new Date(), { lat, lng, utcOffset: JST });
      const next = { part: dayPart(s.altitude, s.rising), az: Math.round(s.azimuth), alt: Math.round(s.altitude) };
      setSun((cur) => (cur.part === next.part && cur.az === next.az && cur.alt === next.alt ? cur : next));
    };
    read();
    addEventListener(SKY_EVENT, read);
    return () => removeEventListener(SKY_EVENT, read);
  }, [lat, lng]);
  return sun;
}

// ---- 材料を読む（タイルは覚えておく。同じ町を調べ直したときに読み直さない）
const townCache = new Map<string, Promise<ArrayBuffer | null>>();
function townBuffer(x: number, y: number): Promise<ArrayBuffer | null> {
  const key = `${x}/${y}`;
  let p = townCache.get(key);
  if (!p) {
    p = fetch(townTileUrl(x, y))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => {
        // 通信できなかったタイルは覚えない（戻れば読み直す）
        townCache.delete(key);
        return null;
      });
    townCache.set(key, p);
    if (townCache.size > 24) townCache.delete(townCache.keys().next().value!);
  }
  return p;
}

/** 建物・道路・水（4枚のタイル。1枚も読めなければ null） */
async function loadTown(origin: Origin): Promise<TownModel | null> {
  const tiles = townTiles(origin);
  const bufs = await Promise.all(tiles.map(([x, y]) => townBuffer(x, y)));
  if (bufs.every((b) => !b)) return null;
  const raw: RawTown = { buildings: [], roads: [], water: [] };
  bufs.forEach((b, i) => {
    if (!b) return;
    const r = decodeTownTile(b, tiles[i][0], tiles[i][1], origin);
    raw.buildings.push(...r.buildings);
    raw.roads.push(...r.roads);
    raw.water.push(...r.water);
  });
  return buildTown(raw, townSeams(origin));
}

/** ひと息つく（重い計算のあいだに、画面の動きを止めない） */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

/** 調べた土地の形 */
function targetShape(parcel: Parcel, toLocal: (lng: number, lat: number) => XZ): SceneShape {
  return shapeOf(
    parcel.pieces.map((p) => ({ polygons: p.polygons, rect: tileRect(p.tile[0], p.tile[1], PARCEL_ZOOM, toLocal) })),
    toLocal,
  );
}

/** まわりの筆（原点から約330m まで）と、隣の土地の札の位置 */
async function loadLots(origin: Origin, target: Parcel | undefined, neighborKeys: Set<string>): Promise<{ lots: SceneLot[]; nb: { key: string; chiban: string; at: XZ }[] }> {
  const toLocal = localOf(origin);
  const self = new Set(target ? (target.chibanRaws ?? [target.chibanRaw]).map((c) => `${target.kuiki}|${c}`) : []);
  const lots: SceneLot[] = [];
  const nb = new Map<string, { chiban: string; at: XZ; area: number }>();
  for (const [x, y] of townTiles(origin)) {
    const feats = await pmtilesParcelSource.tile(x, y).catch(() => null);
    if (!feats) continue;
    const rect = tileRect(x, y, PARCEL_ZOOM, toLocal);
    for (const f of feats) {
      const key = `${f.kuiki}|${f.chiban}`;
      if (self.has(key)) continue;
      const shape = shapeOf([{ polygons: f.polygons(), rect }], toLocal);
      if (!shape.fills.length || !nearOrigin(boundsOf(shape), 330)) continue;
      const neighbor = neighborKeys.has(key) && /^\d/.test(f.chiban);
      const reg = `${f.kuiki}|${registryChiban(f.chiban)}`;
      // 地番は登記の地番（道路・水路は「道-12」のまま）。全画面で筆を押したときに出す
      lots.push({ ...shape, neighbor, ...(neighbor ? { key: reg } : {}), kuiki: f.kuiki, chiban: /^\d/.test(f.chiban) ? registryChiban(f.chiban) : f.chiban });
      if (neighbor) {
        const at = labelPoint(shape);
        const area = shape.fills.reduce((s, fl) => s + ringArea(fl.outer), 0);
        const prev = nb.get(reg);
        if (at && (!prev || area > prev.area)) nb.set(reg, { chiban: registryChiban(f.chiban), at, area });
      }
    }
    await breathe();
  }
  return { lots, nb: [...nb.entries()].map(([key, v]) => ({ key, chiban: v.chiban, at: v.at })) };
}

/** 用途地域の色（原点から約700m まで） */
async function loadZones(origin: Origin): Promise<SceneZone[]> {
  const toLocal = localOf(origin);
  const p = toWorldPixel(origin.lat, origin.lng, ZONING_ZOOM);
  const r = 500 / metersPerPixel(origin.lat, ZONING_ZOOM);
  const out: SceneZone[] = [];
  for (let x = Math.floor((p.x - r) / 256); x <= Math.floor((p.x + r) / 256); x++)
    for (let y = Math.floor((p.y - r) / 256); y <= Math.floor((p.y + r) / 256); y++) {
      const feats = await pmtilesZoningSource.tile(x, y).catch(() => null);
      if (!feats) continue;
      const rect = tileRect(x, y, ZONING_ZOOM, toLocal);
      for (const f of feats) {
        if (f.layer !== "youto" || f.props.code === undefined) continue;
        const color = YOUTO_COLORS[f.props.code];
        if (!color) continue;
        const shape = shapeOf([{ polygons: f.geometry().polygons, rect }], toLocal);
        for (const fill of shape.fills) if (nearOrigin(boundsOf({ fills: [fill], edges: [], corners: [] }), 700)) out.push({ fill, color });
      }
      await breathe();
    }
  return out;
}

/** 画像を読む（読めなければ null。ハザードの区域の無い所はタイルが無い） */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** ハザードマップの色（模型と同じ4枚のタイルの範囲を1枚の絵に） */
async function loadHazard(kind: HazardPick, origin: Origin): Promise<{ canvas: HTMLCanvasElement | null; bounds: { x0: number; z0: number; x1: number; z1: number } }> {
  const toLocal = localOf(origin);
  const tiles = townTiles(origin);
  const tx0 = Math.min(...tiles.map((t) => t[0]));
  const ty0 = Math.min(...tiles.map((t) => t[1]));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const g = canvas.getContext("2d")!;
  let any = false;
  for (const layer of HAZARDS[kind].layers) {
    const imgs = await Promise.all(tiles.map(([x, y]) => loadImage(hazardTileUrl(layer.id).replace("{z}", String(PARCEL_ZOOM)).replace("{x}", String(x)).replace("{y}", String(y)))));
    imgs.forEach((img, i) => {
      if (!img) return;
      g.drawImage(img, (tiles[i][0] - tx0) * 256, (tiles[i][1] - ty0) * 256);
      any = true;
    });
  }
  const a = tileRect(tx0, ty0, PARCEL_ZOOM, toLocal);
  const b = tileRect(tx0 + 1, ty0 + 1, PARCEL_ZOOM, toLocal);
  return { canvas: any ? canvas : null, bounds: { x0: a.x0, z0: a.z0, x1: b.x1, z1: b.z1 } };
}

/** 夜空の星（一度だけ描く。上の45%に） */
function Stars({ on }: { on: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = (c.width = 390);
    const h = (c.height = 380);
    const g = c.getContext("2d")!;
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 90; i++) {
      const y = rnd() ** 1.6 * h;
      g.globalAlpha = 0.25 + rnd() * 0.6 * (1 - y / h);
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(rnd() * w, y, rnd() < 0.08 ? 1.3 : 0.7, 0, Math.PI * 2);
      g.fill();
    }
  }, []);
  return <canvas ref={ref} aria-hidden className="absolute inset-x-0 top-0 h-[48%] w-full transition-opacity duration-[1200ms]" style={{ opacity: on ? 1 : 0 }} />;
}

/** 札の位置を、原点から max（m）までに収める（遠い駅・地価の地点は、その向きの先に札を置く） */
function within(p: XZ, from: XZ, max: number): XZ {
  const dx = p[0] - from[0];
  const dz = p[1] - from[1];
  const d = Math.hypot(dx, dz);
  return d <= max ? p : [from[0] + (dx / d) * max, from[1] + (dz / d) * max];
}

export type BackdropProps = {
  result: Ok;
  data: PropertyData;
  tab: SceneTab;
  motion: boolean;
  /** 地球からのズームの演出が出ている間は、着地を待つ */
  hold: boolean;
  neighbors: boolean;
  /** 選んだ隣の土地（地番区域と登記の地番）。模型では濃い金色にしてチェックを付ける */
  picked: Neighbor[];
  hazard: HazardPick;
  /** 見えているか（ほかのページを見ている間・シートが模型を覆いきった間は描かない） */
  visible: boolean;
  /** 全画面でハザードマップの色を出している（ハザードのタブを開いていなくても読む） */
  hazLayer?: boolean;
  /** 模型ができた（null は作れなかった・消えた）。物件の画面が指の操作と割り付けを渡す */
  onReady: (api: PropertyScene | null) => void;
  /** 模型が出せない（平らな地図にした） */
  onFlat: () => void;
  /** 土地に接する道路（道路のタブに出す） */
  onFront: (roads: FrontRoad[]) => void;
  /** 平らな地図にしたときの、土地を置く高さ（px） */
  flatCenter: number;
  /** 割り付けを測るための、模型の箱 */
  boxRef?: RefObject<HTMLDivElement | null>;
};

/** 物件の画面のいちばん奥（空・街の模型・札・影） */
export function PropertyBackdrop({ result, data, tab, motion, hold, neighbors, picked, hazard, visible, hazLayer, onReady, onFlat, onFront, flatCenter, boxRef }: BackdropProps) {
  const host = useRef<HTMLDivElement>(null);
  const labelBox = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<PropertyScene | null>(null);
  const [flat, setFlat] = useState(false);
  const [size, setSize] = useState({ w: 393, h: 800 });
  const sun = usePropertySun(result.lat, result.lng);
  const origin = { lat: result.lat, lng: result.lng };
  const key = `${origin.lat},${origin.lng}`;
  // 呼び返しは最新のものを使う（模型を作り直さない）
  const cb = useRef({ onReady, onFlat, onFront });
  useEffect(() => {
    cb.current = { onReady, onFlat, onFront };
  });

  // 模型を作る（1回。WebGL が使えなければ平らな地図）
  useEffect(() => {
    if (!host.current || !labelBox.current) return;
    if (!webglAvailable()) {
      queueMicrotask(() => {
        setFlat(true);
        cb.current.onFlat();
      });
      return;
    }
    let alive = true;
    let made: PropertyScene | null = null;
    createPropertyScene(host.current, labelBox.current, { reduced: reducedMotion() })
      .then((s) => {
        if (!alive) {
          s?.dispose();
          return;
        }
        if (!s) {
          setFlat(true);
          cb.current.onFlat();
          return;
        }
        made = s;
        setApi(s);
        cb.current.onReady(s);
      })
      .catch(() => {
        if (!alive) return;
        setFlat(true);
        cb.current.onFlat();
      });
    return () => {
      alive = false;
      made?.dispose();
      cb.current.onReady(null);
    };
  }, []);

  // 大きさ
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      api?.resize();
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [api]);

  // 時間帯・太陽・動き・タブ・隣の土地
  useEffect(() => api?.setPart(sun.part), [api, sun.part]);
  useEffect(() => api?.setSun({ az: sun.az, alt: sun.alt }), [api, sun.az, sun.alt]);
  useEffect(() => api?.setMotion(motion), [api, motion]);
  useEffect(() => api?.setTab(tab), [api, tab]);
  useEffect(() => api?.setNeighbors(neighbors), [api, neighbors]);
  const pickedKeys = picked.map((n) => `${n.kuiki}|${registryChiban(n.chiban)}`).join(",");
  useEffect(() => api?.setPicked(pickedKeys ? pickedKeys.split(",") : []), [api, pickedKeys]);
  // 見えているか（画面が裏に回ったときも止める）
  useEffect(() => {
    if (!api) return;
    const apply = () => api.setVisible(visible && document.visibilityState !== "hidden");
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [api, visible]);

  // 建物・道路・水
  const [town, setTown] = useState<{ key: string; model: TownModel | null } | null>(null);
  useEffect(() => {
    if (!api) return;
    let alive = true;
    loadTown({ lat: result.lat, lng: result.lng })
      .then((model) => alive && setTown({ key, model }))
      .catch(() => alive && setTown({ key, model: null }));
    return () => {
      alive = false;
    };
  }, [api, key, result.lat, result.lng]);

  // 調べた土地（筆を探し終わるまで、6秒までは待つ。そのあとは筆が分かりしだい描き足す）
  const parcels = data.parcels;
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 6000);
    return () => clearTimeout(t);
  }, []);
  const parcel = parcels.status === "ok" && addressOffLot(parcels) === undefined ? parcels.parcel : undefined;
  const settled = parcels.status !== "loading" || waited;
  const parcelKey = parcel ? `${parcel.kuiki}|${parcel.chibanRaw}` : parcels.status;
  const [base, setBase] = useState<{ center: XZ; front: number[]; ring: XZ[] | null } | null>(null);
  useEffect(() => {
    if (!api || hold || !town || town.key !== key || !town.model || !settled) return;
    const toLocal = localOf({ lat: result.lat, lng: result.lng });
    const target = parcel ? targetShape(parcel, toLocal) : null;
    const big = target?.fills.reduce<XZ[] | null>((m, f) => (!m || ringArea(f.outer) > ringArea(m) ? f.outer : m), null) ?? null;
    const center: XZ = target ? (labelPoint(target) ?? [0, 0]) : [0, 0];
    const front = big ? [...new Set(target!.fills.flatMap((f) => frontRoads(town.model!.roads, f.outer)))] : [];
    api.setBase({ town: town.model, target: target && target.edges.length ? target : null, center, front });
    queueMicrotask(() => setBase({ center, front, ring: big }));
    // 土地に接する道路（向きと幅の区分。同じ向きは1つに）
    const seen = new Set<string>();
    const roads: FrontRoad[] = [];
    for (const i of front) {
      const r = town.model.roads[i];
      const p = nearestOnLine(center, r.line);
      const direction = directionOf(p[0] - center[0], p[1] - center[1]);
      if (seen.has(direction)) continue;
      seen.add(direction);
      roads.push({ direction, width: rankText(r.rank), major: r.major });
    }
    cb.current.onFront(roads);
    // parcel は parcelKey で見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, hold, town, key, settled, parcelKey, result.lat, result.lng]);

  // まわりの筆と隣の土地（建物のあと、手が空いたら）
  const nbKeys = parcel && parcels.status === "ok" ? parcels.neighbors.map((n) => `${n.kuiki}|${n.chiban}`).join(",") : "";
  const [nbLabels, setNbLabels] = useState<{ key: string; chiban: string; at: XZ }[]>([]);
  useEffect(() => {
    if (!api || !base) return;
    let alive = true;
    const t = window.setTimeout(() => {
      loadLots({ lat: result.lat, lng: result.lng }, parcel, new Set(nbKeys ? nbKeys.split(",") : []))
        .then(({ lots, nb }) => {
          if (!alive) return;
          api.setLots(lots);
          setNbLabels(nb);
        })
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, base, nbKeys]);

  // 用途地域の色
  useEffect(() => {
    if (!api || !base) return;
    let alive = true;
    const t = window.setTimeout(() => {
      loadZones({ lat: result.lat, lng: result.lng })
        .then((zones) => alive && api.setZones(zones))
        .catch(() => {});
    }, 900);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [api, base, result.lat, result.lng]);

  // ハザードマップの色と水の高さ（ハザードのタブを開いてから読む）
  const [hazOpened, setHazOpened] = useState(tab === "hazard");
  if ((tab === "hazard" || hazLayer) && !hazOpened) setHazOpened(true);
  const hazReport = data.hazard.status === "ok" ? data.hazard.report : undefined;
  const depthLabel = hazReport && hazard !== "dosha" ? classAt(hazReport, hazard)?.label : undefined;
  useEffect(() => {
    if (!api || !base || !hazOpened) return;
    let alive = true;
    loadHazard(hazard, { lat: result.lat, lng: result.lng })
      .then((h) => alive && api.setHazard(h.canvas, h.bounds, depthFloor(depthLabel)))
      .catch(() => alive && api.setHazard(null, null, depthFloor(depthLabel)));
    return () => {
      alive = false;
    };
  }, [api, base, hazOpened, hazard, depthLabel, result.lat, result.lng]);

  // 駅・地価の地点・施設の印と札
  const { stations, landPrice, around, evac, schools, zoning } = data;
  const marksKey = JSON.stringify([stations.status, landPrice.status, around.status, evac.status, schools.status, zoning.status, data.roads.status, data.hazard.status, base?.center, base?.front, hazard, depthLabel, nbLabels.length, parcelKey]);
  useEffect(() => {
    if (!api || !base) return;
    const toLocal = localOf({ lat: result.lat, lng: result.lng });
    const c = base.center;
    const st = stations.status === "ok" ? stations.stations[0] : undefined;
    const stAt = st?.at ? toLocal(st.at[0], st.at[1]) : null;
    const hits = landPrice.status === "ok" ? landPrice.hits : [];
    const top = hits[0];
    const topAt = top && top.distance < 3000 ? toLocal(top.point[0], top.point[1]) : null;
    const pins: ScenePin[] = [];
    const labels: SceneLabel[] = [];
    // 前の道路（道路のタブ）
    const official = data.roads.status === "ok" ? data.roads.roads : [];
    const seen = new Set<string>();
    if (town?.model)
      for (const i of base.front) {
        const r = town.model.roads[i];
        const p = nearestOnLine(c, r.line);
        const dir = directionOf(p[0] - c[0], p[1] - c[1]);
        if (seen.has(dir) || seen.size >= 3) continue;
        seen.add(dir);
        const o = official.find((x) => x.direction === dir);
        const w = rankText(r.rank);
        labels.push({ key: `road:${dir}`, title: o ? `${dir}側・${o.short}` : `${dir}側の道路`, sub: o?.width ? `幅員 ${o.width}` : w ? `幅の区分 ${w}` : undefined, color: o?.color ?? "#ffd27a", at: [p[0], 1.2, p[1]], tabs: ["road"] });
      }
    // 用途地域（法令のタブ）
    const y = zoning.status === "ok" ? zoning.zoning.youto[0] : undefined;
    if (y) {
      const name = y.name.normalize("NFKC");
      labels.push({ key: "zone", title: name.length <= 9 ? name : youtoShort(name), sub: y.bcr && y.far ? `建ぺい${y.bcr}%・容積${y.far}%` : undefined, color: YOUTO_COLORS[y.code], at: [c[0], 10, c[1]], tabs: ["law"] });
    }
    // ハザード（ハザードのタブ）。区分が無いときは、カードと同じ言い方（区域外・データなし・近くに区域）
    if (hazReport) {
      const at = classAt(hazReport, hazard);
      const card = hazardCards(hazReport).find((x) => x.kind === hazard);
      const none = card?.tone === "none";
      const state = at ? at.label : card?.chip === "区域外" ? "想定区域の外" : (card?.chip ?? "確認中");
      labels.push({
        key: "haz",
        title: `${HAZARDS[hazard].short}　${state}`,
        sub: at ? (hazard === "dosha" ? "国のデータ" : hazard === "naisui" ? "国のデータ" : "想定最大規模・国のデータ") : none ? "市区町村のハザードマップで確認" : "国のデータ",
        color: at?.color ?? (none ? "#c9d3e0" : "#8ff0c8"),
        at: [c[0], Math.max(4, depthFloor(at?.label) + 3), c[1]],
        tabs: ["hazard"],
      });
    }
    if (evac.status === "ok")
      evac.sites.slice(0, 3).forEach((s, i) => {
        const p = toLocal(s.at[0], s.at[1]);
        if (Math.hypot(p[0] - c[0], p[1] - c[1]) > 1500) return;
        pins.push({ at: p, color: "#45d39e", tabs: ["hazard"], size: 14 });
        if (i === 0) {
          const w = within(p, c, 420);
          labels.push({ key: "evac", title: "避難場所", sub: s.walk ? `徒歩${s.walk.minutes}分` : `直線${metersText(s.straight)}`, color: "#45d39e", at: [w[0], 4, w[1]], tabs: ["hazard"] });
        }
      });
    // 駅・施設（周辺のタブ）
    if (st && stAt) {
      // 駅が近ければ駅の上に、遠ければ土地のそばに「駅の方向」の札（光の道の先に駅がある）
      const far = Math.hypot(stAt[0] - c[0], stAt[1] - c[1]) > 220;
      const at = far ? within(stAt, c, 95) : stAt;
      pins.push({ at: stAt, color: "#74bbff", tabs: ["around"], size: 18 });
      labels.push({ key: "st", title: far ? `${st.name}駅の方向` : `${st.name}駅`, sub: st.routed ? `徒歩${st.minutes}分` : `直線${metersText(st.straight)}`, color: "#74bbff", kind: "big", at: [at[0], 6, at[1]], tabs: ["around"] });
    }
    const e = schools.status === "ok" ? schools.schools.elementary : undefined;
    if (e?.point) {
      const p = toLocal(e.point[0], e.point[1]);
      if (Math.hypot(p[0] - c[0], p[1] - c[1]) < 1200) pins.push({ at: p, color: "#9fd0ff", tabs: ["around"], size: 13 });
    }
    if (around.status === "ok") {
      const shown = new Set<number>();
      for (const poi of around.nearest) {
        if (poi.straight > 800) continue;
        const p = toLocal(poi.at[0], poi.at[1]);
        const color = KIND_STYLE[poi.kind]?.color ?? "#ffffff";
        pins.push({ at: p, color, tabs: ["around"], size: 12 });
        if ([1, 2, 6, 4].includes(poi.kind) && !shown.has(poi.kind) && poi.straight < 500) {
          shown.add(poi.kind);
          const name = shortName(poi.name);
          labels.push({ key: `poi:${poi.kind}`, title: name.length > 10 ? `${name.slice(0, 10)}…` : name, sub: poi.routed && poi.minutes !== undefined ? `徒歩${poi.minutes}分` : `直線${metersText(poi.straight)}`, color, at: [p[0], 3, p[1]], tabs: ["around"] });
        }
      }
    }
    // 地価の地点（相場のタブ）
    const near = hits.filter((h) => h.distance <= 2000);
    const max = Math.max(1, ...near.map((h) => h.price));
    const bars = near.map((h) => ({ at: toLocal(h.point[0], h.point[1]), height: 8 + (52 * h.price) / max }));
    if (top && topAt) {
      // 地点が近ければ柱の上に、遠ければ土地のそばに「地点の方向」の札
      const far = top.distance > 200;
      const at = far ? within(topAt, c, 90) : topAt;
      labels.push({ key: "lp", title: `${top.kind === "公示" ? "公示地価" : "基準地価"} ${top.price.toLocaleString("ja-JP")}円/㎡`, sub: `${top.bearing}へ${metersText(top.distance)}`, color: "#ffd27a", kind: "big", at: [at[0], far ? 6 : 8 + (52 * top.price) / max + 4, at[1]], tabs: ["price"] });
    }
    // 調べた土地の札と隣の土地の札は最後に（重なったら、タブの札を先に出す）
    const lot = parcel && /^\d/.test(parcel.chibanRaw) ? registryChiban(parcel.chibanRaw) : null;
    labels.push({ key: "lot", title: lot ?? (result.picked ? "選んだ地点" : "調べた場所"), kind: "lot", at: [c[0], 3, c[1]], tabs: "all" });
    for (const n of nbLabels) labels.push({ key: `nb:${n.key}`, title: n.chiban, kind: "nb", at: [n.at[0], 0.6, n.at[1]], tabs: "nb" });
    api.setMarks({ station: stAt, price: topAt, pins, bars });
    api.setLabels(labels);
    // 材料の変わり目は marksKey で見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, marksKey, town]);

  return (
    <div ref={boxRef} className="pv-backdrop absolute inset-0 overflow-hidden" aria-hidden>
      {/* 空（時間帯で入れ替わる。地平線の色は模型のかすみとそろえる） */}
      {(Object.keys(SKY) as ScenePart[]).map((p) => (
        <div key={p} className="absolute inset-0 transition-opacity duration-[1200ms]" style={{ opacity: p === sun.part ? 1 : 0, background: `linear-gradient(180deg, ${SKY[p][0]} 0%, ${SKY[p][1]} 46%, ${SKY[p][2]} 72%)` }} />
      ))}
      <Stars on={sun.part === "night"} />
      {/* 模型（WebGL が使えなければ平らな地図） */}
      <div ref={host} className="absolute inset-0" />
      {flat && (
        <div className="absolute inset-x-0 overflow-hidden" style={{ top: 0, height: size.h }}>
          <div className="absolute left-0" style={{ top: flatCenter - size.h / 2 }}>
            <TileMap lat={result.lat} lng={result.lng} width={Math.round(size.w)} height={Math.round(size.h)} z={parcel ? 18 : 17} layer="pale" parcel={parcel} />
          </div>
        </div>
      )}
      {/* 上の字を読みやすくする影 */}
      <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: "56%", background: `linear-gradient(180deg, rgba(${SHADE.rgb.join(",")},${SHADE.alpha}) 0%, rgba(${SHADE.rgb.join(",")},0.34) 52%, rgba(${SHADE.rgb.join(",")},0.12) 78%, rgba(${SHADE.rgb.join(",")},0) 100%)` }} />
      {/* 模型の札 */}
      <div ref={labelBox} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
