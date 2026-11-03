"use client";

// 街の模型の「大きく見る」（スマホ）。模型を画面いっぱいにして、指で自由に動かす：1本指でずらす・2本指で拡大と回転・2本指の上下で傾ける・
// 2回たたいて寄る（動きは components/app/property-3d.ts の setFree）。上に閉じる・物件の名前・方位（押すと北が上）、右に寄る・引く・
// 物件に戻る・平面⇄立体・MICHILU の地図、下に表示の切り替え（筆の線・隣の土地・用途地域・ハザード・前の道路）。
// 筆を押すと下からカードが出て、地番と物件からの向き（隣の土地は方角と接する長さ）。隣の土地は選べ、ほかの筆はその地番で調べられる。
// 開くと上・右・下の部品が順に入ってくる。初めて開いたときだけ、指の使い方を小さく出す。動きを減らす設定では動かさない
import { Box, Check, ChevronDown, Copy, Layers3, LocateFixed, Map as MapIcon, Minus, Plus, Search, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { bearingOf, dir8, sideText, type Side } from "@/lib/app/neighbor-plan";
import { kuikiLabel } from "@/lib/roadmap/parcel";
import type { ParcelPick } from "../parcel-card";
import { pickKey } from "../parcel-card";
import { useCopy } from "../use-copy";
import { ART_W, ZOOM } from "./frame";
import { DARK_GLASS } from "./home";
import type { CameraView, FreeLayers, FreeTap, PropertyScene } from "./property-3d";

const HINT_KEY = "michilu:hint:big";

/** 表示の切り替えの札 */
const LAYER_CHIPS: { key: keyof FreeLayers; label: string }[] = [
  { key: "nb", label: "隣の土地" },
  { key: "lots", label: "筆の線" },
  { key: "road", label: "前の道路" },
  { key: "zone", label: "用途地域" },
  { key: "haz", label: "ハザード" },
];

const meters = (d: number) => (d < 10 ? `${d.toFixed(1)}m` : `${Math.round(d)}m`);

export function BigModel({
  open,
  scene,
  lot,
  where,
  area,
  layers,
  onLayers,
  hazardName,
  pick,
  onClose,
  onMap,
  onParcel,
  onSearch,
  motion,
}: {
  open: boolean;
  scene: PropertyScene | null;
  /** 物件の筆の地番（無ければ住所） */
  lot?: string;
  where: string;
  /** 物件の筆の面積の文（「約770㎡（目安）」） */
  area?: string;
  layers: FreeLayers;
  onLayers: (l: FreeLayers) => void;
  /** ハザードの札の名前（いまの種類。「洪水」など） */
  hazardName: string;
  pick: ParcelPick;
  onClose: () => void;
  /** MICHILU の地図（平らな地図。道路種別・ハザードの図を重ねられる） */
  onMap: () => void;
  /** 物件の地番の詳しい画面 */
  onParcel: () => void;
  /** その地番で調べ直す */
  onSearch: (query: string) => void;
  motion: boolean;
}) {
  // 閉じる動きのあいだも残す
  const [shown, setShown] = useState(open);
  const [closing, setClosing] = useState(false);
  if (open && !shown) setShown(true);
  if (!open && shown && !closing) setClosing(true);
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => {
      setClosing(false);
      setShown(false);
    }, 220);
    return () => clearTimeout(t);
  }, [closing]);
  if (!shown || typeof document === "undefined") return null;
  return createPortal(
    <Overlay
      closing={closing}
      scene={scene}
      lot={lot}
      where={where}
      area={area}
      layers={layers}
      onLayers={onLayers}
      hazardName={hazardName}
      pick={pick}
      onClose={onClose}
      onMap={onMap}
      onParcel={onParcel}
      onSearch={onSearch}
      motion={motion}
    />,
    document.body,
  );
}

function Overlay({
  closing,
  scene,
  lot,
  where,
  area,
  layers,
  onLayers,
  hazardName,
  pick,
  onClose,
  onMap,
  onParcel,
  onSearch,
  motion,
}: Omit<Parameters<typeof BigModel>[0], "open"> & { closing: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLDivElement>(null);
  const needle = useRef<HTMLSpanElement>(null);
  const [plan, setPlan] = useState(false);
  const [away, setAway] = useState(false);
  const [sel, setSel] = useState<FreeTap | null>(null);
  const [selN, setSelN] = useState(0);
  const [hint, setHint] = useState(false);
  const copy = useCopy();

  // 上と下の部品の高さを模型に知らせる（土地をそのあいだの真ん中に置き、札をそこに出す）
  useLayoutEffect(() => {
    if (!scene) return;
    const measure = () => {
      const t = top.current?.getBoundingClientRect();
      const b = bottom.current?.getBoundingClientRect();
      const r = side.current?.getBoundingClientRect();
      if (!t || !b) return;
      // 右の操作の列には札を出さない
      scene.setFree(true, { top: t.bottom + 6, bottom: innerHeight - b.top + 6, avoid: r ? [{ l: r.left - 6, t: r.top - 6, r: innerWidth, b: r.bottom + 6 }] : [] });
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, [scene]);

  // 方位の針・平面か・物件から離れたか
  useEffect(() => {
    if (!scene) return;
    scene.onCamera((v: CameraView) => {
      if (needle.current) needle.current.style.transform = `rotate(${v.azim}rad)`;
      setPlan(v.polar < 0.12);
      setAway(v.away);
    });
    return () => scene.onCamera(null);
  }, [scene]);

  // 初めて開いたときだけ、指の使い方
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(HINT_KEY) === "1";
      if (!seen) localStorage.setItem(HINT_KEY, "1");
    } catch {
      // 残せなくても、案内は出さないでおく
    }
    if (seen) return;
    const a = window.setTimeout(() => setHint(true), 700);
    const b = window.setTimeout(() => setHint(false), 6200);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  // 指は模型へ渡す（部品の上は渡さない）。離したら、押した筆を受け取る
  const forward = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scene || closing) return;
    if ((e.target as Element).closest("[data-bm-ui]")) return;
    const ev = e.nativeEvent;
    if (e.type === "pointerdown") {
      setHint(false);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 押さえ続けられない端末でも、動きはそのまま渡す
      }
      scene.pointerDown(ev);
    } else if (e.type === "pointermove") scene.pointerMove(ev);
    else if (e.type === "pointerup" || e.type === "pointercancel") {
      if (e.type === "pointerup") scene.pointerUp(ev);
      else scene.pointerCancel(ev);
      const t = scene.takeTap();
      if (t) {
        setSel(t.kind === "ground" ? null : t);
        setSelN((n) => n + 1);
      }
    }
  };
  // トラックパッド・マウスのホイールで寄る
  useEffect(() => {
    const el = root.current;
    if (!el || !scene) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scene.wheel(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scene]);
  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const sides = pick.plan?.status === "ok" ? pick.plan.sides : undefined;
  const chosen = new Set(pick.list.map(pickKey));
  return (
    <div
      ref={root}
      className={`bm-root fixed inset-0 z-[45] ${motion ? "bm-motion" : ""} ${closing ? "bm-closing" : ""}`}
      style={{ touchAction: "none" }}
      role="dialog"
      aria-modal="true"
      aria-label="街の模型（大きく見る）"
      onPointerDown={forward}
      onPointerMove={forward}
      onPointerUp={forward}
      onPointerCancel={forward}
    >
      {/* 上：閉じる・物件・方位 */}
      <div ref={top} className="pointer-events-none absolute inset-x-0 top-0 flex justify-center" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="bm-top flex items-center gap-[8px] px-[12px] pt-[8px]" style={{ width: ART_W, zoom: ZOOM }}>
          <button data-bm-ui onClick={onClose} aria-label="閉じる（物件の画面へ戻る）" className="press pointer-events-auto flex h-[44px] shrink-0 items-center gap-[4px] rounded-full pl-[10px] pr-[14px] font-semibold text-white" style={{ ...DARK_GLASS, fontSize: 14 }}>
            <ChevronDown size={20} strokeWidth={2} absoluteStrokeWidth />
            閉じる
          </button>
          <button data-bm-ui onClick={onParcel} className="press pointer-events-auto min-w-0 flex-1 rounded-full px-[14px] py-[5px] text-left text-white" style={DARK_GLASS}>
            <span className="block truncate font-semibold leading-[1.25]" style={{ fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
              {lot ? (
                <>
                  <span className="mr-[5px] font-medium" style={{ fontSize: 11.5, color: "#ffe2a3", letterSpacing: 1 }}>
                    地番
                  </span>
                  {lot}
                </>
              ) : (
                where
              )}
            </span>
            <span className="block truncate leading-[1.3]" style={{ fontSize: 11, color: "rgba(255,255,255,0.66)" }}>
              {lot ? where : "調べた場所"}
              {area ? `・${area}` : ""}
            </span>
          </button>
          <button data-bm-ui onClick={() => scene?.northUp()} aria-label="北を上にする" className="press pointer-events-auto relative flex size-[44px] shrink-0 items-center justify-center rounded-full" style={DARK_GLASS}>
            <span ref={needle} className="bm-needle flex flex-col items-center leading-none">
              <svg width="10" height="20" viewBox="0 0 10 20" aria-hidden>
                <path d="M5 0 L9.5 10 L0.5 10 Z" fill="#ff6b5a" />
                <path d="M5 20 L9.5 10 L0.5 10 Z" fill="rgba(255,255,255,0.85)" />
              </svg>
            </span>
            <span className="absolute top-[2px] font-semibold text-white" style={{ fontSize: 8.5 }}>
              北
            </span>
          </button>
        </div>
      </div>

      {/* 右：寄る・引く・物件に戻る・平面⇄立体・MICHILU の地図 */}
      <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2" style={{ paddingRight: "env(safe-area-inset-right)" }}>
        <div ref={side} className="bm-side mr-[12px] flex flex-col items-center gap-[8px]" style={{ zoom: ZOOM }}>
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-full" style={DARK_GLASS} data-bm-ui>
            <SideButton label="寄る" onClick={() => scene?.zoomBy(0.62)}>
              <Plus size={20} strokeWidth={2} absoluteStrokeWidth />
            </SideButton>
            <span className="mx-[10px] h-px bg-white/15" />
            <SideButton label="引く" onClick={() => scene?.zoomBy(1.6)}>
              <Minus size={20} strokeWidth={2} absoluteStrokeWidth />
            </SideButton>
          </div>
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-full" style={DARK_GLASS} data-bm-ui>
            <SideButton label="物件に戻る" onClick={() => scene?.recenter()} active={away}>
              <LocateFixed size={19} strokeWidth={2} absoluteStrokeWidth />
            </SideButton>
            <span className="mx-[10px] h-px bg-white/15" />
            <SideButton label={plan ? "立体で見る" : "真上から見る（平面）"} onClick={() => scene?.setPlanView(!plan)}>
              {plan ? <Box size={19} strokeWidth={2} absoluteStrokeWidth /> : <Square size={18} strokeWidth={2} absoluteStrokeWidth />}
              <span className="mt-[2px] block leading-none" style={{ fontSize: 9 }}>
                {plan ? "立体" : "平面"}
              </span>
            </SideButton>
            <span className="mx-[10px] h-px bg-white/15" />
            <SideButton label="MICHILU の地図（道路種別・ハザードの図）" onClick={onMap}>
              <MapIcon size={18} strokeWidth={2} absoluteStrokeWidth />
              <span className="mt-[2px] block leading-none" style={{ fontSize: 9 }}>
                地図
              </span>
            </SideButton>
          </div>
        </div>
      </div>

      {/* 下：押した筆のカード・表示の切り替え */}
      <div ref={bottom} className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center" style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
        <div className="flex flex-col gap-[8px] px-[12px]" style={{ width: ART_W, zoom: ZOOM }}>
          {hint && (
            <p className="bm-hint pointer-events-none mx-auto rounded-full px-[14px] py-[8px] text-center leading-[1.4] text-white" style={{ ...DARK_GLASS, fontSize: 12.5 }}>
              1本指でずらす・2本指で拡大と回転
              <br />
              2本指を上下で傾ける・2回たたいて寄る
            </p>
          )}
          {sel && (
            <LotCard
              key={selN}
              tap={sel}
              lot={lot}
              area={area}
              side={sel.key ? sides?.get(sel.key) : undefined}
              picked={!!sel.key && chosen.has(sel.key)}
              onPick={() => {
                if (!sel.kuiki || !sel.chiban) return;
                const n = { kuiki: sel.kuiki, chiban: sel.chiban };
                pick.toggle(n);
              }}
              onCopy={() => sel.kuiki && sel.chiban && copy.copy(`${kuikiLabel(sel.kuiki)} ${sel.chiban}`)}
              copied={copy.done}
              onSearch={() => sel.kuiki && sel.chiban && onSearch(`地番 ${kuikiLabel(sel.kuiki)}${sel.chiban}`)}
              onParcel={onParcel}
              onClose={() => setSel(null)}
            />
          )}
          <div
            className="bm-bottom pointer-events-auto -mx-[12px] flex gap-[6px] overflow-x-auto px-[12px] pb-[2px]"
            data-bm-ui
            style={{ scrollbarWidth: "none", maskImage: "linear-gradient(90deg, #000 86%, transparent)", WebkitMaskImage: "linear-gradient(90deg, #000 86%, transparent)" }}
          >
            <span className="flex shrink-0 items-center gap-[4px] pr-[2px]" style={{ fontSize: 11.5, color: "rgba(255,255,255,0.8)", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
              <Layers3 size={14} strokeWidth={2} absoluteStrokeWidth />
              表示
            </span>
            {LAYER_CHIPS.map((c) => {
              const on = layers[c.key];
              return (
                <button
                  key={c.key}
                  onClick={() => onLayers({ ...layers, [c.key]: !on })}
                  aria-pressed={on}
                  className="press flex h-[36px] shrink-0 items-center gap-[5px] rounded-full px-[13px] font-semibold transition-colors duration-200"
                  style={{ ...(on ? {} : DARK_GLASS), fontSize: 12.5, color: on ? "#2a1a04" : "#fff", background: on ? "#ffd36b" : undefined, border: on ? "1px solid #ffd36b" : undefined }}
                >
                  {on && <Check size={13} strokeWidth={2.6} absoluteStrokeWidth />}
                  {c.key === "haz" ? `ハザード（${hazardName}）` : c.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SideButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="press flex size-[48px] flex-col items-center justify-center text-white transition-colors active:bg-white/15" style={{ color: active ? "#ffd36b" : "#fff" }}>
      {children}
    </button>
  );
}

/** 押した筆のカード */
function LotCard({
  tap,
  lot,
  area,
  side,
  picked,
  onPick,
  onCopy,
  copied,
  onSearch,
  onParcel,
  onClose,
}: {
  tap: FreeTap;
  lot?: string;
  area?: string;
  side?: Side;
  picked: boolean;
  onPick: () => void;
  onCopy: () => void;
  copied: boolean;
  onSearch: () => void;
  onParcel: () => void;
  onClose: () => void;
}) {
  const d = Math.hypot(tap.at[0] - tap.center[0], tap.at[1] - tap.center[1]);
  const dir = dir8(bearingOf(tap.center, tap.at));
  const road = tap.kind === "road" || tap.kind === "water";
  const eyebrow = tap.kind === "target" ? "物件の筆" : tap.kind === "neighbor" ? "隣の土地" : road ? (tap.kind === "road" ? "道路の筆（地番なし）" : "水路の筆（地番なし）") : "まわりの筆";
  const title = tap.kind === "target" ? (lot ? `地番 ${lot}` : "調べた場所") : road ? (tap.kind === "road" ? "道路" : "水路") : `地番 ${tap.chiban}`;
  const sub =
    tap.kind === "target"
      ? (area ?? "押すと地番の詳しい画面")
      : tap.kind === "neighbor"
        ? side
          ? sideText(side)
          : `物件の${dir}`
        : road
          ? "国・市町村の道路・水路など。道路の種別は道路のタブ・役所で"
          : `物件から${dir}へ 約${meters(d)}`;
  return (
    <div className="bm-card pointer-events-auto rounded-[22px] px-[14px] py-[12px] text-white" style={DARK_GLASS} data-bm-ui>
      <div className="flex items-start gap-[10px]">
        <div className="min-w-0 flex-1">
          <p className="leading-none" style={{ fontSize: 11.5, letterSpacing: 0.6, color: tap.kind === "neighbor" ? "#ffe2a3" : tap.kind === "target" ? "#a8d2ff" : "rgba(255,255,255,0.62)" }}>
            {eyebrow}
            {tap.kind !== "target" && !road && tap.kuiki ? `・${kuikiLabel(tap.kuiki).normalize("NFKC")}` : ""}
          </p>
          <p className="mt-[6px] truncate font-semibold leading-none" style={{ fontSize: 22, fontVariantNumeric: "tabular-nums" }}>
            {title}
          </p>
          <p className="mt-[6px] leading-[1.4]" style={{ fontSize: 12, color: "rgba(255,255,255,0.74)" }}>
            {sub}
            {(tap.kind === "neighbor" || tap.kind === "lot") && <span style={{ color: "rgba(255,255,255,0.5)" }}>（地図データの目安）</span>}
          </p>
        </div>
        <button onClick={onClose} aria-label="カードを閉じる" className="press -mr-[4px] -mt-[2px] flex size-[32px] shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80">
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
            ×
          </span>
        </button>
      </div>
      {!road && (
        <div className="mt-[10px] flex gap-[7px]">
          {tap.kind === "target" ? (
            <CardButton onClick={onParcel} primary>
              謄本・公図の地番を見る
            </CardButton>
          ) : tap.kind === "neighbor" ? (
            <CardButton onClick={onPick} primary on={picked}>
              {picked ? (
                <>
                  <Check size={15} strokeWidth={2.6} absoluteStrokeWidth />
                  選んでいます
                </>
              ) : (
                "コピーする地番に選ぶ"
              )}
            </CardButton>
          ) : (
            <CardButton onClick={onSearch} primary>
              <Search size={15} strokeWidth={2.2} absoluteStrokeWidth />
              この地番で調べる
            </CardButton>
          )}
          {tap.kind !== "target" && (
            <CardButton onClick={onCopy}>
              {copied ? <Check size={15} strokeWidth={2.4} absoluteStrokeWidth /> : <Copy size={14} strokeWidth={2} absoluteStrokeWidth />}
              {copied ? "コピーしました" : "所在と地番"}
            </CardButton>
          )}
        </div>
      )}
    </div>
  );
}

function CardButton({ onClick, primary, on, children }: { onClick: () => void; primary?: boolean; on?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="press flex h-[40px] min-w-0 flex-1 items-center justify-center gap-[5px] rounded-full px-[12px] font-semibold"
      style={{
        fontSize: 13,
        color: primary ? "#2a1a04" : "#fff",
        background: primary ? (on ? "#ffd36b" : "rgba(255,211,107,0.92)") : "rgba(255,255,255,0.12)",
        border: primary ? "1px solid #ffd36b" : "1px solid rgba(255,255,255,0.16)",
      }}
    >
      {children}
    </button>
  );
}
