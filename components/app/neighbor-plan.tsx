"use client";

// 隣の土地の配置図（スマホ）：北が上の平面図に、物件の筆（青）、隣の筆（金色の線。押して選ぶ）、道路・水路の筆、まわりの筆の線を描き、
// 隣の筆の方角と境界を接する長さ（lib/app/neighbor-plan.ts）を出す。形は街の模型と同じ座標（調べた地点が原点のメートル）。
// 材料は、街の模型と同じ筆のタイル（法務省の登記所備付地図データ。ブラウザから直接読み、読んだタイルは覚えておく）。
// 開いたときは、物件の筆が光り、隣の筆が北から時計回りに現れる。押した筆は光って知らせる（動きを減らす設定では動かさない）
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { bySide, clipShape, edgePath, fillPath, planLabelAt, planWindow, scaleBar, sideOf, type Side } from "@/lib/app/neighbor-plan";
import { labelPoint, shapeOf, tileRect, type Rect, type SceneShape } from "@/lib/app/scene-lots";
import { localOf, townTiles, type XZ } from "@/lib/app/town-model";
import { isLotChiban, PARCEL_ZOOM, registryChiban, type Neighbor, type ParcelPiece } from "@/lib/roadmap/parcel";
import { pmtilesParcelSource } from "@/lib/roadmap/parcel-tiles";
import { addressOffLot, pickKey, type ParcelInfo } from "../parcel-card";

/** 配置図の幅÷高さ（カードの中の横長の図） */
export const PLAN_ASPECT = 1.75;

export type PlanLot = {
  /** pickKey と同じ「地番区域|登記の地番」 */
  key: string;
  kuiki: string;
  chiban: string;
  kind: "neighbor" | "road" | "water" | "lot";
  /** 描く範囲で切り抜いた形 */
  shape: SceneShape;
  label: XZ | null;
  /** 隣の筆・接する道路と水路：方角と接する長さ */
  side: Side | null;
};

export type NeighborPlan =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ok"; window: Rect; target: SceneShape; targetLabel: XZ | null; lots: PlanLot[]; sides: ReadonlyMap<string, Side>; roads: PlanLot[] };

/** 筆の部分（タイルごと）を形に */
function pieceShape(pieces: ParcelPiece[], toLocal: (lng: number, lat: number) => XZ): SceneShape {
  return shapeOf(
    pieces.map((p) => ({ polygons: p.polygons, rect: tileRect(p.tile[0], p.tile[1], PARCEL_ZOOM, toLocal) })),
    toLocal,
  );
}

/** 2つの形を1つに（同じ地番の区画・タイルで分かれた部分） */
const merge = (a: SceneShape, b: SceneShape): SceneShape => ({ fills: [...a.fills, ...b.fills], edges: [...a.edges, ...b.edges], corners: [...a.corners, ...b.corners] });

/**
 * 配置図の材料を読む（物件の画面で1回。読めなければ none）。隣の筆の方角は、地図データの形から計算した目安
 */
export function useNeighborPlan(lat: number, lng: number, info: ParcelInfo): NeighborPlan {
  const ok = info.status === "ok" && isLotChiban(info.parcel.chibanRaw) && addressOffLot(info) === undefined ? info : undefined;
  const key = ok ? `${lat},${lng}|${ok.parcel.kuiki}|${ok.parcel.chibanRaw}|${ok.neighbors.length}` : "";
  const [state, setState] = useState<{ key: string; plan: NeighborPlan } | null>(null);
  useEffect(() => {
    if (!ok) return;
    let alive = true;
    // 模型と見出しの動きが落ち着いてから計算する
    const t = window.setTimeout(() => {
      build(lat, lng, ok)
        .then((plan) => alive && setState({ key, plan }))
        .catch(() => alive && setState({ key, plan: { status: "none" } }));
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // ok は key で見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!ok) return { status: info.status === "loading" ? "loading" : "none" };
  return state?.key === key ? state.plan : { status: "loading" };
}

async function build(lat: number, lng: number, info: Extract<ParcelInfo, { status: "ok" }>): Promise<NeighborPlan> {
  const origin = { lat, lng };
  const toLocal = localOf(origin);
  const target = pieceShape(info.parcel.pieces, toLocal);
  if (!target.fills.length) return { status: "none" };
  const center = labelPoint(target) ?? [0, 0];
  const win = planWindow(target, PLAN_ASPECT);
  // 形を作る前に外す範囲（描く範囲より 60m 広く。大きな筆の一部が範囲に掛かるため）
  const far = { x0: win.x0 - 60, z0: win.z0 - 60, x1: win.x1 + 60, z1: win.z1 + 60 };
  const self = new Set((info.parcel.chibanRaws ?? [info.parcel.chibanRaw]).map((c) => `${info.parcel.kuiki}|${c}`));
  const near = new Set(info.neighbors.map((n) => `${n.kuiki}|${n.chiban}`));
  const tiles = new Map<string, [number, number]>();
  for (const t of townTiles(origin)) tiles.set(t.join(","), t);
  for (const p of info.parcel.pieces) tiles.set(p.tile.join(","), p.tile);
  const whole = new Map<string, { kuiki: string; chiban: string; kind: PlanLot["kind"]; shape: SceneShape }>();
  for (const [x, y] of tiles.values()) {
    const feats = await pmtilesParcelSource.tile(x, y).catch(() => null);
    if (!feats) continue;
    const rect = tileRect(x, y, PARCEL_ZOOM, toLocal);
    for (const f of feats) {
      const raw = `${f.kuiki}|${f.chiban}`;
      if (self.has(raw)) continue;
      const polys = f.polygons();
      // 1点だけ見て、遠い筆は形を作らない（タイルの中の筆の部分は大きくても数百m。隣の筆・道路はいつも作る）
      const p0 = polys[0]?.[0]?.[0];
      if (!p0) continue;
      if (!near.has(raw)) {
        const [px, pz] = toLocal(p0[0], p0[1]);
        if (px < far.x0 - 300 || px > far.x1 + 300 || pz < far.z0 - 300 || pz > far.z1 + 300) continue;
      }
      const shape = shapeOf([{ polygons: polys, rect }], toLocal);
      if (!shape.fills.length) continue;
      const kind: PlanLot["kind"] = /^道/.test(f.chiban) ? "road" : /^水/.test(f.chiban) ? "water" : near.has(raw) ? "neighbor" : "lot";
      const reg = kind === "road" || kind === "water" ? raw : `${f.kuiki}|${registryChiban(f.chiban)}`;
      const prev = whole.get(reg);
      whole.set(reg, prev ? { ...prev, shape: merge(prev.shape, shape) } : { kuiki: f.kuiki, chiban: kind === "road" || kind === "water" ? f.chiban : registryChiban(f.chiban), kind, shape });
    }
    // 画面の動きを止めない
    await new Promise((r) => setTimeout(r, 0));
  }
  const lots: PlanLot[] = [];
  const sides = new Map<string, Side>();
  for (const [k, v] of whole) {
    const clipped = clipShape(v.shape, win);
    // 隣の筆・道路・水路は、接しているかを測る（道路と水路は、隣の筆に入っているものだけ）
    const touching = v.kind === "neighbor" || ((v.kind === "road" || v.kind === "water") && near.has(k));
    const side = touching ? sideOf(target, center, v.shape) : null;
    if (side && v.kind === "neighbor") sides.set(k, side);
    if (!clipped.fills.length) continue;
    lots.push({ key: k, kuiki: v.kuiki, chiban: v.chiban, kind: v.kind, shape: clipped, label: v.kind === "lot" ? null : planLabelAt(clipped), side });
  }
  const roads = bySide(lots.filter((l) => (l.kind === "road" || l.kind === "water") && l.side));
  return { status: "ok", window: win, target: clipShape(target, win), targetLabel: planLabelAt(clipShape(target, win)), lots, sides, roads };
}

/** 色（暗いすりガラスの上・白いシートの上） */
const TONES = {
  dark: {
    bg: "rgba(6,12,26,0.38)",
    border: "rgba(255,255,255,0.1)",
    lot: "rgba(255,255,255,0.16)",
    road: "rgba(255,255,255,0.1)",
    roadText: "rgba(255,255,255,0.5)",
    water: "rgba(110,170,240,0.24)",
    nb: "rgba(255,201,74,0.1)",
    nbLine: "rgba(255,201,74,0.62)",
    pick: "rgba(255,211,107,0.5)",
    pickLine: "#ffd36b",
    nbText: "#ffe2a3",
    pickText: "#fff6dc",
    target: "rgba(110,175,255,0.34)",
    targetLine: "#a8d2ff",
    targetText: "#ffffff",
    halo: "rgba(0,0,0,0.65)",
    ui: "rgba(255,255,255,0.78)",
  },
  light: {
    bg: "#f3f6fb",
    border: "#e3e9f2",
    lot: "#ccd5e3",
    road: "#e4e9f1",
    roadText: "#8792a6",
    water: "#d5e5fa",
    nb: "rgba(240,176,48,0.12)",
    nbLine: "#dca23a",
    pick: "rgba(255,196,64,0.62)",
    pickLine: "#c98a10",
    nbText: "#7a5410",
    pickText: "#3d2a04",
    target: "rgba(42,120,228,0.2)",
    targetLine: "#2a78e4",
    targetText: "#133664",
    halo: "rgba(255,255,255,0.9)",
    ui: "#5f6f86",
  },
} as const;

/** 図の名目の幅（px。字の大きさをメートルに直すのに使う。カードの中の幅とほぼ同じ） */
const NOMINAL_W = 330;

/**
 * 配置図。picked は選んだ筆（pickKey）、flash は光らせる筆。隣の筆を押すと onTap。
 * 字は図の幅に合わせて大きさを決める（どの機種でも同じ見た目）
 */
export function NeighborPlanView({
  plan,
  picked,
  flash,
  onTap,
  tone = "dark",
  height,
  motion = true,
}: {
  plan: Extract<NeighborPlan, { status: "ok" }>;
  picked: ReadonlySet<string>;
  flash?: { key: string; n: number } | null;
  onTap: (lot: PlanLot) => void;
  tone?: keyof typeof TONES;
  height?: number;
  motion?: boolean;
}) {
  const c = TONES[tone];
  const w = plan.window;
  const W = w.x1 - w.x0;
  const H = w.z1 - w.z0;
  const k = NOMINAL_W / W;
  const fs = (px: number) => px / k;
  const bar = scaleBar(W);
  // 字が重ならないように置く（物件 → 選んだ筆 → 大きい筆の順。重なる札は出さない）
  const labels = useMemo(() => {
    const placed: { l: number; t: number; r: number; b: number }[] = [];
    const out: { key: string; at: XZ; text: string; kind: "target" | "nb" | "road" }[] = [];
    const tryPlace = (key: string, at: XZ | null, text: string, kind: "target" | "nb" | "road", size: number, force = false) => {
      if (!at) return;
      const hw = (text.length * size * 0.56) / 2 / k + 1;
      const hh = (size * 0.62) / k + 0.6;
      const box = { l: at[0] - hw, t: at[1] - hh, r: at[0] + hw, b: at[1] + hh };
      if (!force && placed.some((p) => p.l < box.r && p.r > box.l && p.t < box.b && p.b > box.t)) return;
      if (box.l < w.x0 || box.r > w.x1 || box.t < w.z0 || box.b > w.z1) {
        if (!force) return;
      }
      placed.push(box);
      out.push({ key, at, text, kind });
    };
    tryPlace("target", plan.targetLabel, "物件", "target", 12, true);
    const nb = plan.lots.filter((l) => l.kind === "neighbor");
    const area = (l: PlanLot) => l.shape.fills.reduce((s, f) => s + Math.abs(f.outer.reduce((a, p, i) => a + p[0] * f.outer[(i + 1) % f.outer.length][1] - f.outer[(i + 1) % f.outer.length][0] * p[1], 0)) / 2, 0);
    for (const l of [...nb.filter((l) => picked.has(l.key)), ...nb.filter((l) => !picked.has(l.key)).sort((a, b) => area(b) - area(a))]) tryPlace(l.key, l.label, l.chiban, "nb", 10.5, picked.has(l.key));
    for (const l of plan.lots.filter((l) => (l.kind === "road" || l.kind === "water") && l.side)) tryPlace(l.key, l.label, l.kind === "road" ? "道路" : "水路", "road", 9.5);
    return out;
    // k・w は plan から決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, picked]);
  const flashKey = flash?.key;
  const flashN = flash?.n ?? 0;
  return (
    <div className="np-box relative overflow-hidden rounded-[14px]" style={{ background: c.bg, border: `1px solid ${c.border}`, height, aspectRatio: height ? undefined : `${PLAN_ASPECT}` }}>
      <svg viewBox={`${w.x0} ${w.z0} ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className={`np-svg absolute inset-0 h-full w-full ${motion ? "np-motion" : ""}`} role="img" aria-label="隣の土地の配置図（北が上）">
        {/* まわりの筆・道路・水路 */}
        {plan.lots
          .filter((l) => l.kind !== "neighbor")
          .map((l) => (
            <path
              key={l.key}
              d={fillPath(l.shape.fills)}
              fillRule="evenodd"
              fill={l.kind === "road" ? c.road : l.kind === "water" ? c.water : "none"}
              stroke={l.kind === "lot" ? c.lot : "none"}
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {/* 隣の筆（北から時計回りに現れる。押すと選ぶ） */}
        {plan.lots
          .filter((l) => l.kind === "neighbor")
          .map((l) => {
            const on = picked.has(l.key);
            const lit = flashKey === l.key;
            return (
              <path
                key={lit ? `${l.key}#${flashN}` : l.key}
                d={fillPath(l.shape.fills)}
                fillRule="evenodd"
                className={`np-nb ${lit ? "np-flash" : ""}`}
                style={{ "--np-d": `${Math.round(((l.side?.bearing ?? 360) / 360) * 520)}ms`, cursor: "pointer" } as CSSProperties}
                fill={on ? c.pick : c.nb}
                stroke={on ? c.pickLine : c.nbLine}
                strokeWidth={on ? 2 : 1.2}
                vectorEffect="non-scaling-stroke"
                onClick={() => onTap(l)}
              />
            );
          })}
        {/* 物件の筆 */}
        <path d={fillPath(plan.target.fills)} fillRule="evenodd" className="np-target" fill={c.target} stroke={c.targetLine} strokeWidth={2.2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <path d={edgePath(plan.target.edges)} className="np-target-glow" fill="none" stroke={c.targetLine} strokeWidth={6} strokeOpacity={0.22} strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        {/* 字（地番・物件・道路） */}
        {labels.map((l) => {
          const on = l.kind === "nb" && picked.has(l.key);
          const size = l.kind === "target" ? 12 : l.kind === "road" ? 9.5 : 10.5;
          return (
            <text
              key={`t:${l.key}`}
              x={l.at[0]}
              y={l.at[1]}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fs(size)}
              fontWeight={l.kind === "road" ? 500 : 700}
              fill={l.kind === "target" ? c.targetText : l.kind === "road" ? c.roadText : on ? c.pickText : c.nbText}
              stroke={c.halo}
              strokeWidth={fs(l.kind === "road" ? 2 : 2.6)}
              paintOrder="stroke"
              className={l.kind === "nb" ? "np-label" : undefined}
              style={{ fontVariantNumeric: "tabular-nums", "--np-d": `${l.kind === "nb" ? Math.round(((plan.sides.get(l.key)?.bearing ?? 360) / 360) * 520) + 160 : 0}ms` } as CSSProperties}
              pointerEvents="none"
            >
              {l.text}
            </text>
          );
        })}
      </svg>
      {/* 方位（北が上）と縮尺 */}
      <div className="pointer-events-none absolute right-[8px] top-[7px] flex flex-col items-center leading-none" style={{ color: c.ui }}>
        <svg width="12" height="13" viewBox="0 0 12 13" aria-hidden>
          <path d="M6 0.5 L10.5 12 L6 9.2 L1.5 12 Z" fill="currentColor" />
        </svg>
        <span className="mt-[2px] font-semibold" style={{ fontSize: 9.5, letterSpacing: 0.5 }}>
          北
        </span>
      </div>
      {/* 縮尺（図の幅に対する割合で長さを決める。図は横いっぱいに描くので、箱の幅＝描く範囲の幅） */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[7px] flex flex-col items-start px-[9px] leading-none" style={{ color: c.ui }}>
        <span className="block" style={{ width: `${(bar / W) * 100}%`, height: 4, borderLeft: `1.5px solid ${c.ui}`, borderRight: `1.5px solid ${c.ui}`, borderBottom: `1.5px solid ${c.ui}` }} />
        <span className="mt-[2px]" style={{ fontSize: 9.5 }}>
          {bar}m
        </span>
      </div>
    </div>
  );
}

/** 配置図の読み込み中（同じ大きさの、ゆっくり光る板） */
export function NeighborPlanSkeleton({ tone = "dark", height }: { tone?: keyof typeof TONES; height?: number }) {
  const c = TONES[tone];
  return <div className="np-skel rounded-[14px]" style={{ background: c.bg, border: `1px solid ${c.border}`, height, aspectRatio: height ? undefined : `${PLAN_ASPECT}` }} aria-label="配置図を読み込んでいます" />;
}

/** 隣の筆の方角（pickKey ごと）。押した筆の札の頭に付ける */
export function sideOfPick(plan: NeighborPlan, n: Neighbor): Side | undefined {
  return plan.status === "ok" ? plan.sides.get(pickKey(n)) : undefined;
}
