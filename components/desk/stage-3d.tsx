"use client";

// PC の「3D」の画面：Google の実写 3D（components/desk/google-3d.ts）か、出せないときの代わりの 3D（スマホの物件の画面と同じ、
// 地理院の建物・道路・筆・用途地域から作る街の模型。components/app/property-scene.tsx の PropertyBackdrop）。
// 規約：Google の 3D と地理院のデータ（地図・模型）は同じ画面に出さない。hidden のとき（地理院の地図のある画面を開いている間）は
// Google の 3D をはずして描かない。Google のロゴと出典は、Google の 3D を出している間いつも出す
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { googleFailText, googleLight, modelLight, SKY_OF, sessionUsable, ZOOM_DIST, type DeskTod, type GoogleFail } from "@/lib/app/desk";
import { lotShape } from "@/lib/app/lot-shape";
import { labelPoint } from "@/lib/app/scene-lots";
import { localOf, type XZ } from "@/lib/app/town-model";
import { isLotChiban, registryChiban, type Neighbor } from "@/lib/roadmap/parcel";
import { addressOffLot } from "../parcel-card";
import type { NeighborPlan } from "../app/neighbor-plan";
import type { PropertyScene, SceneTab } from "../app/property-3d";
import { PropertyBackdrop } from "../app/property-scene";
import type { FrontRoad, HazardPick } from "../app/types";
import type { Ok, PropertyData } from "../app/use-property";
import { acquireGoogle3D, GOOGLE_3D_CONFIGURED, googleFailed, onGoogleFail, sessionCreatedAt, type Frame, type GoogleLabel, type GoogleStatus, type GoogleView } from "./google-3d";

/** 3D の操作（右下のボタン・キーボード） */
export type StageControls = { zoomIn: () => void; zoomOut: () => void; rotate: (dir: 1 | -1) => void; northUp: () => void; recenter: () => void };

/** いま出している 3D（google：Google の実写、model：代わりの街の模型） */
export type Engine = "google" | "model";

type Props = {
  result: Ok;
  data: PropertyData;
  /** 代わりの 3D の見せ方（カルテで開いている項目・層のボタン） */
  view: SceneTab;
  neighbors: boolean;
  picked: Neighbor[];
  hazard: HazardPick;
  /** Google の 3D に重ねるもの */
  layers: { parcels: boolean; places: boolean };
  tod: DeskTod;
  /** 時計に合わせるときの今の太陽（度） */
  sun?: { az: number; alt: number };
  /** 3D を開いたときの距離（m） */
  dist: number;
  frame: Frame;
  /** 地理院の地図のある画面を開いている間（Google の 3D を出さない） */
  hidden: boolean;
  motion: boolean;
  reduced: boolean;
  plan: NeighborPlan;
  lot?: string;
  town: string;
  onEngine: (e: Engine, note?: string) => void;
  onFront: (roads: FrontRoad[]) => void;
  /** 代わりの 3D で、調べた土地・隣の土地をクリックした */
  onLot: () => void;
  onNeighbor: (key: string) => void;
  controlsRef: React.MutableRefObject<StageControls | null>;
  /** Google のロゴと出典を出す所（真ん中の左下。操作の案内と重ならないよう、同じ並びの中に置く） */
  creditSlot: HTMLElement | null;
};

/** Google の 3D が使えなくなったわけ（このページの中で） */
function useGoogleFail(): GoogleFail | null {
  const [f, setF] = useState<GoogleFail | null>(() => (GOOGLE_3D_CONFIGURED ? googleFailed() : "nokey"));
  useEffect(() => onGoogleFail(setF), []);
  return f;
}

export function Stage3D(props: Props) {
  const fail = useGoogleFail();
  const { onEngine } = props;
  // どちらの 3D を出しているか（出典・一言のため）。代わりの 3D に切り替えたわけを添える
  useEffect(() => {
    onEngine(fail ? "model" : "google", fail ? googleFailText(fail) : undefined);
  }, [fail, onEngine]);
  const sky = SKY_OF[props.tod];
  const style = { "--sky-top": sky[0], "--sky-horizon": sky[1] } as CSSProperties;
  return (
    <div className="desk-layer desk-3d" style={style}>
      {fail ? <ModelStage {...props} /> : <GoogleStage {...props} />}
    </div>
  );
}

/** Google の実写 3D */
function GoogleStage({ result, data, layers, tod, sun, dist, frame, hidden, reduced, plan, lot, town, controlsRef, creditSlot }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const [v, setV] = useState<GoogleView | null>(null);
  const [status, setStatus] = useState<GoogleStatus>({ loading: true, credit: "", tiles: 0 });
  // セッションを取り直す合図（2 時間 55 分を過ぎたら）
  const [renew, setRenew] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => {
      const at = sessionCreatedAt();
      if (at && !sessionUsable(at, Date.now())) setRenew((n) => n + 1);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // 出す（ここで初めてルートを要求する。同じページの 2 回目からは同じセッション）・はずす
  useEffect(() => {
    if (hidden) return;
    let alive = true;
    let attached: GoogleView | null = null;
    acquireGoogle3D().then((got) => {
      if (!alive || !got || !host.current || !labelHost.current) return;
      got.attach(host.current, labelHost.current);
      attached = got;
      setV(got);
    });
    return () => {
      alive = false;
      attached?.detach();
    };
  }, [hidden, renew]);

  // 状態（読み込み中・出典）
  useEffect(() => (v ? v.onStatus(setStatus) : undefined), [v]);
  // 物件（同じセッションのまま、カメラだけ動かす）
  useEffect(() => v?.setTarget(result.lat, result.lng, dist), [v, result.lat, result.lng, dist]);
  useEffect(() => v?.setReduced(reduced), [v, reduced]);
  const light = googleLight(tod, sun);
  const lightKey = JSON.stringify(light);
  useEffect(() => {
    if (v) v.setLight(JSON.parse(lightKey));
  }, [v, lightKey]);
  const frameKey = `${frame.left},${frame.right},${frame.top},${frame.bottom}`;
  useEffect(() => {
    if (!v) return;
    const [left, right, top, bottom] = frameKey.split(",").map(Number);
    v.setFrame({ left, right, top, bottom });
  }, [v, frameKey]);

  // 重ねるもの（MICHILU のデータ）：物件の筆の線と面、隣の筆の線
  const parcels = data.parcels;
  const parcel = parcels.status === "ok" && addressOffLot(parcels) === undefined ? parcels.parcel : undefined;
  const shape = useMemo(() => (parcel ? lotShape(parcel, { lat: result.lat, lng: result.lng }) : null), [parcel, result.lat, result.lng]);
  const nbEdges = useMemo(() => (plan.status === "ok" ? plan.lots.filter((l) => l.kind === "neighbor").flatMap((l) => l.shape.edges) : []), [plan]);
  useEffect(() => {
    if (!v) return;
    v.setOverlay(layers.parcels && shape ? { target: shape.edges, fills: shape.fills.map((f) => f.outer), neighbors: nbEdges } : shape ? { target: shape.edges, fills: [], neighbors: [] } : null);
  }, [v, shape, nbEdges, layers.parcels]);

  // 札：物件と、駅・学校（層のボタン）
  const { stations, schools } = data;
  const labels = useMemo<GoogleLabel[]>(() => {
    const toLocal = localOf({ lat: result.lat, lng: result.lng });
    const at = (shape && labelPoint(shape)) ?? ([0, 0] as XZ);
    const out: GoogleLabel[] = [{ key: "lot", title: lot ?? "調べた場所", sub: town, at, kind: "lot" }];
    if (layers.places) {
      if (stations.status === "ok")
        for (const s of stations.stations.slice(0, 3)) if (s.at) out.push({ key: `st:${s.name}`, title: `${s.name}駅`, sub: s.routed ? `徒歩${s.minutes}分` : undefined, at: toLocal(s.at[0], s.at[1]), kind: "place", color: "#2b5fa8" });
      if (schools.status === "ok")
        for (const sc of [schools.schools.elementary, schools.schools.junior]) if (sc?.point) out.push({ key: `sc:${sc.name}`, title: sc.name, sub: sc.walk ? `徒歩${sc.walk.minutes}分` : undefined, at: toLocal(sc.point[0], sc.point[1]), kind: "place", color: "#2e7d4f" });
    }
    return out;
  }, [result.lat, result.lng, shape, lot, town, layers.places, stations, schools]);
  useEffect(() => v?.setLabels(labels), [v, labels]);

  // 右下のボタン
  useEffect(() => {
    if (!v) return;
    controlsRef.current = {
      zoomIn: () => v.zoomBy(0.72),
      zoomOut: () => v.zoomBy(1.38),
      rotate: (d) => v.rotateBy(d * 0.4),
      northUp: () => v.northUp(),
      recenter: () => v.recenter(),
    };
    return () => {
      controlsRef.current = null;
    };
  }, [v, controlsRef]);

  if (hidden) return <p className="desk-note absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">地理院の地図を出している間は、Google の 3D を隠しています。</p>;
  return (
    <>
      <div ref={host} className="desk-3d-host" />
      <div ref={labelHost} className="desk-3d-labels" aria-hidden />
      {creditSlot &&
        createPortal(
          <>
            {status.loading && (
              <p className="desk-note flex items-center gap-2" role="status">
                <span className="desk-loading" aria-hidden />
                Google の 3D を読み込んでいます…
              </p>
            )}
            {/* Google の決まり：ロゴ（形を変えずにそのまま。忙しい背景用の縁取りの版）と、いま見えているタイルの出典 */}
            <div className="desk-gcredit">
              {/* eslint-disable-next-line @next/next/no-img-element -- Google の決まりのロゴ（形を変えずにそのまま出す） */}
              <img src="/home/google/google-maps-logo.svg" alt="Google Maps" width={76} height={16} style={{ width: 76, height: 16 }} />
              <span>{status.credit || "Google"}</span>
            </div>
          </>,
          creditSlot,
        )}
    </>
  );
}

/** 代わりの 3D（地理院のデータで作る街の模型）。マウスで回す・Shift で動かす・ホイールで寄る・土地をクリック */
function ModelStage({ result, data, view, neighbors, picked, hazard, tod, sun, dist, frame, motion, onFront, onLot, onNeighbor, controlsRef }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const scene = useRef<PropertyScene | null>(null);
  const [ready, setReady] = useState(0);
  const { part, az, alt } = modelLight(tod, sun);
  const desk = useMemo(() => ({ light: { part, az, alt } }), [part, az, alt]);

  // 割り付け：土地を、見えている所（左の列とカルテの間）の真ん中に。札は上の帯・左の列・カルテに重ねない
  const frameKey = `${frame.left},${frame.right},${frame.top},${frame.bottom}`;
  useEffect(() => {
    const s = scene.current;
    const el = wrap.current;
    if (!s || !el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const [left, right, top, bottom] = frameKey.split(",").map(Number);
      s.setLayout({
        centerX: (left + (r.width - right)) / 2,
        centerY: (top + (r.height - bottom)) / 2,
        sheetTop: r.height - bottom,
        topLimit: top,
        avoid: [
          { l: 0, t: 0, r: left, b: r.height },
          { l: r.width - right, t: 0, r: r.width, b: r.height },
        ],
        cover: 0,
      });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, frameKey]);

  // ホイールで寄る（ページはスクロールしない）
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scene.current?.wheel(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // 設定の「3D の初めの寄り」（「ふつう」を 1 として、タブごとの元の距離に掛ける）
  useEffect(() => {
    if (ready) scene.current?.setDistScale(dist / ZOOM_DIST.mid);
  }, [ready, dist]);

  useEffect(() => {
    if (!ready) return;
    controlsRef.current = {
      zoomIn: () => scene.current?.zoomBy(0.72),
      zoomOut: () => scene.current?.zoomBy(1.38),
      rotate: (d) => scene.current?.rotateBy(d * 0.4),
      northUp: () => scene.current?.northUp(),
      recenter: () => scene.current?.resetView(),
    };
    return () => {
      controlsRef.current = null;
    };
  }, [ready, controlsRef]);

  const pointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = scene.current;
    if (!s) return;
    const ev = e.nativeEvent;
    if (e.type === "pointerdown") {
      e.currentTarget.focus({ preventScroll: true });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 押さえ続けられなくても動かす
      }
      s.pointerDown(ev);
    } else if (e.type === "pointermove") s.pointerMove(ev);
    else if (e.type === "pointerup") s.pointerUp(ev);
    else s.pointerCancel(ev);
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const s = scene.current;
    if (!s) return;
    if (e.key === "ArrowLeft") s.rotateBy(0.3);
    else if (e.key === "ArrowRight") s.rotateBy(-0.3);
    else if (e.key === "+" || e.key === "=") s.zoomBy(0.75);
    else if (e.key === "-" || e.key === "_") s.zoomBy(1.33);
    else if (e.key === "0" || e.key === "Home") s.resetView();
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={wrap}
      className="absolute inset-0 outline-none"
      tabIndex={0}
      role="application"
      aria-label="街の模型（地理院のデータ）。左右の矢印キーで回す、＋と−で寄る・引く、0 で元の向き"
      onPointerDown={pointer}
      onPointerMove={pointer}
      onPointerUp={pointer}
      onPointerCancel={pointer}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKey}
      onClick={() => {
        const s = scene.current;
        if (!s) return;
        if (s.takeLotTap()) return onLot();
        const nb = s.takeNeighborTap();
        if (nb) onNeighbor(nb);
      }}
    >
      <PropertyBackdrop
        result={result}
        data={data}
        tab={view}
        motion={motion}
        hold={false}
        neighbors={neighbors}
        picked={picked}
        hazard={hazard}
        visible
        hazLayer={view === "hazard"}
        onReady={(api) => {
          scene.current = api;
          setReady((n) => n + 1);
        }}
        onFlat={() => {}}
        onFront={onFront}
        flatCenter={300}
        desk={desk}
      />
    </div>
  );
}

/** 代わりの 3D の出典（使っているものだけ。見せ方で変わる） */
export function modelCredit(view: SceneTab, parcel: boolean): string[] {
  return [
    "地図：国土地理院ベクトルタイル（建物の高さは目安）",
    parcel ? "筆：登記所備付地図データ（法務省）を加工" : "",
    view === "law" ? "用途地域：国土交通省 都市計画決定GISデータ" : "",
    view === "hazard" ? "ハザード：重ねるハザードマップ（国土地理院）" : "",
    view === "around" ? "施設・駅の出入口：© OpenStreetMap contributors・駅・学区：国土数値情報" : "",
    view === "price" ? "地価：国土数値情報（地価公示・地価調査）" : "",
  ].filter(Boolean);
}

/** 地番（登記の地番。地番の無い筆は undefined） */
export function lotNumberOf(data: PropertyData): string | undefined {
  const p = data.parcels;
  if (p.status !== "ok" || addressOffLot(p) !== undefined || !isLotChiban(p.parcel.chibanRaw)) return undefined;
  return registryChiban(p.parcel.chibanRaw);
}
