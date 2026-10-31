"use client";

// 検索したときの演出：宇宙から見た地球 → 日本の上空 → 調べた土地へ降りる（components/app/mobile-app.tsx が、スマホのホームから
// 調べたときだけ、宇宙の背景（components/app/flight-space.ts）の上に重ねる。動きの演出がオフ・端末の「視差効果を減らす」がオン・
// WebGL が無いときは出さない）。
// 地図は MapLibre GL の地球儀の表示。遠くは NASA の Blue Marble（GIBS。地形と海底の陰影つき。ズーム 8 まで。謝辞を出す）、
// 近くは国土地理院の全国最新写真（シームレス。ズーム 9〜11 で切り替える。低いズームは海に欠けがあるので使わない）。
// 読むのは地図の絵だけで、住所はどこにも送らない（降りる場所は、調べ終わった結果の座標）。
// 流れ：地球が現れる（絵がそろうまで最大 1 秒待ち、そろったらふわっと出す）→ 日本へ回る（1.6 秒）→ 調べている間は日本の上空でゆっくり近づく
// → 場所が分かったら斜めから降りる（2.6 秒）→ 写真がそろうのを最大 1.2 秒待つ → 印が光る（1 秒。ゆっくり回り込む）
// → ふわっと消えて物件の画面。見つからない・候補から選ぶ・調べられなかったときは、すぐ消える。
// 画面に触れると飛ばす。14 秒たっても場所が分からないときも消える（結果の画面がそのまま出る）
import "maplibre-gl/dist/maplibre-gl.css";
import { getVersion, Map as MapLibreMap, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NASA_TILES } from "./flight-space";

// 描画のワーカーは public/maplibre/<版>/ に置いてある（scripts/copy-maplibre-worker.mjs）
export const MAPLIBRE_VERSION = getVersion();
setWorkerUrl(`/maplibre/${MAPLIBRE_VERSION}/maplibre-gl-worker.mjs`);

/** 降りる先。null はまだ分からない（調べている）、"none" は降りない（見つからない・調べられなかった） */
export type FlightTarget = { lat: number; lng: number } | "none" | null;

const GSI_PHOTO = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg";
/** 日本の上空（調べている間に待つ所） */
const JAPAN: [number, number] = [137.6, 36.0];
/** 動きの長さ（ミリ秒） */
const T = { firstTiles: 1000, turn: 1600, descend: 2600, sharpen: 1200, ring: 1000, fade: 450, giveUp: 14000 };

const STYLE: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sources: {
    earth: { type: "raster", tiles: [NASA_TILES], tileSize: 256, maxzoom: 8 },
    photo: { type: "raster", tiles: [GSI_PHOTO], tileSize: 256, minzoom: 9, maxzoom: 18 },
  },
  layers: [
    { id: "earth", type: "raster", source: "earth", paint: { "raster-fade-duration": 250 } },
    {
      id: "photo",
      type: "raster",
      source: "photo",
      minzoom: 9,
      paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0, 11, 1], "raster-fade-duration": 200 },
    },
  ],
  // 地球のまわりの大気の光（近づくと消える）。斜めから見たときの空の色
  sky: {
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0],
    "sky-color": "#14305e",
    "horizon-color": "#7ea6dc",
    "fog-color": "#cfdcef",
  },
};

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function GlobeFlight({
  label,
  target,
  onLeave,
  onDone,
}: {
  label: string;
  target: FlightTarget;
  /** 消え始めた（宇宙の背景も一緒に消す）。landed は土地まで降りたか（降りたときは、消えるのと同時に物件の画面をふわっと出す） */
  onLeave: (landed: boolean) => void;
  /** 消え終わった */
  onDone: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const timers = useRef<number[]>([]);
  const done = useRef(false);
  const descending = useRef(false);
  const calls = useRef({ onLeave, onDone });
  useEffect(() => {
    calls.current = { onLeave, onDone };
  });
  /** 地球が日本の上に来た（ここから降りられる） */
  const [overJapan, setOverJapan] = useState(false);
  const [stage, setStage] = useState<"space" | "descend" | "land" | "out">("space");
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  /** 地球の絵がそろった（それまでは地図を見せない。絵の無い黒い地球を出さない） */
  const [visible, setVisible] = useState(false);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  /** ふわっと消して、物件の画面へ */
  const finish = useCallback(
    (landed: boolean) => {
      if (done.current) return;
      done.current = true;
      setStage("out");
      calls.current.onLeave(landed);
      later(T.fade, () => calls.current.onDone());
    },
    [later],
  );

  // 地球を出して、絵がそろったら日本へ回る
  useEffect(() => {
    if (!box.current) return;
    let m: MapLibreMap;
    try {
      m = new MapLibreMap({
        container: box.current,
        style: STYLE,
        center: [104, 12],
        zoom: 0.9,
        interactive: false,
        attributionControl: false,
        renderWorldCopies: false,
        fadeDuration: 250,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      queueMicrotask(() => finish(false));
      return;
    }
    map.current = m;
    let turned = false;
    const turn = () => {
      if (turned || done.current) return;
      turned = true;
      setVisible(true);
      m.easeTo({ center: JAPAN, zoom: 3.4, duration: T.turn, easing: easeInOut });
      later(T.turn, () => setOverJapan(true));
    };
    m.once("load", () => {
      m.once("idle", turn);
      later(T.firstTiles, turn);
    });
    // 描けない（WebGL が使えない・地図が開けない）まま 4 秒たったら、演出をやめる
    later(4000, () => {
      if (!turned) finish(false);
    });
    // 場所が分からないまま 14 秒たったら消える
    later(T.giveUp, () => {
      if (!descending.current) finish(false);
    });
    const ts = timers.current;
    return () => {
      ts.forEach(clearTimeout);
      m.remove();
      map.current = null;
    };
  }, [finish, later]);

  // 調べている間は、日本の上空でゆっくり近づく
  useEffect(() => {
    const m = map.current;
    if (!m || !overJapan || target !== null || stage !== "space") return;
    m.easeTo({ zoom: 4.4, bearing: -8, duration: 8000, easing: (t) => t });
  }, [overJapan, target, stage]);

  // 場所が分かったら降りる（見つからないときは、すぐ消える）
  useEffect(() => {
    const m = map.current;
    if (target === "none") {
      queueMicrotask(() => finish(false));
      return;
    }
    if (!m || !target || !overJapan || descending.current) return;
    descending.current = true;
    queueMicrotask(() => setStage("descend"));
    m.flyTo({ center: [target.lng, target.lat], zoom: 16.4, pitch: 50, bearing: -20, duration: T.descend, curve: 1.6, essential: true });
    m.once("moveend", () => {
      if (done.current) return;
      // 写真がそろうのを少し待ってから、印を光らせる
      let shown = false;
      const land = () => {
        if (shown || done.current) return;
        shown = true;
        const p = m.project([target.lng, target.lat]);
        setRing({ x: p.x, y: p.y });
        setStage("land");
        // 印が光る間、ゆっくり回り込む（中心のまわりなので印は動かない）
        m.easeTo({ bearing: -32, duration: T.ring + T.fade, easing: (t) => t });
        later(T.ring, () => finish(true));
      };
      m.once("idle", land);
      later(T.sharpen, land);
    });
  }, [target, overJapan, finish, later]);

  const known = !!target && target !== "none";
  return (
    <div
      className={`app-touch fixed inset-0 z-[80] overflow-hidden ${stage === "out" ? "flight-out" : ""}`}
      role="dialog"
      aria-label={known ? `${label}へ移動しています` : "調べています"}
      onPointerDown={() => finish(known)}
    >
      {/* 地図の部品は自分の箱を position: relative にするので、画面いっぱいの箱の中に置く。後ろは宇宙の背景（透けて見える） */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
        <div ref={box} className="h-full w-full" />
      </div>
      {ring && (
        <div aria-hidden className="pointer-events-none absolute" style={{ left: ring.x, top: ring.y }}>
          <span className="flight-ring absolute block rounded-full border-2 border-white" style={{ width: 90, height: 90, left: 0, top: 0 }} />
          <span className="flight-ring absolute block rounded-full border-2 border-[#8cc8ff]" style={{ width: 90, height: 90, left: 0, top: 0, animationDelay: "0.35s" }} />
          <span className="absolute block rounded-full bg-white" style={{ width: 12, height: 12, left: -6, top: -6, boxShadow: "0 0 0 3px rgba(61,123,255,0.9), 0 0 18px 6px rgba(140,200,255,0.8)" }} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ bottom: "calc(env(safe-area-inset-bottom) + 26px)" }}>
        <div
          className="flex max-w-[86%] items-center gap-[8px] rounded-full px-[16px] py-[9px] text-white"
          style={{ background: "rgba(10,16,30,0.55)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", fontSize: 15 }}
        >
          {known ? (
            <span className="truncate font-semibold">{label}</span>
          ) : (
            <>
              <LoaderCircle size={16} strokeWidth={2} absoluteStrokeWidth className="shrink-0 animate-spin" />
              <span className="truncate">調べています…</span>
            </>
          )}
        </div>
        <p className="mt-[8px] text-white/60" style={{ fontSize: 11.5 }}>
          画面に触れると飛ばせます
        </p>
        <p className="mt-[6px] text-white/45" style={{ fontSize: 9.5 }}>
          画像：NASA GIBS（Blue Marble）・地理院タイル
        </p>
      </div>
    </div>
  );
}
