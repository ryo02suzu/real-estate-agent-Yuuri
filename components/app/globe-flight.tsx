"use client";

// 検索したときの演出：宇宙から見た地球 → 日本の上空 → 山並みの上 → 調べた土地（components/app/mobile-app.tsx が、スマホのホームから
// 調べたときだけ、宇宙の背景（components/app/flight-space.ts）の上に重ねる。動きの演出がオフ・端末の「視差効果を減らす」がオン・
// WebGL が無いときは出さない）。
// 地図は MapLibre GL の地球儀の表示。見た目（components/app/flight-look.ts）は時間帯で変わる：朝・昼・夕方・夕方と夜のあいだ・夜
// （ホームの写真と同じ分け方。#t= で時刻を決められる）。遠くは NASA の Blue Marble と夜の街明かり（GIBS）、近くは国土地理院の
// 全国最新写真・標高（山の立体と陰影）・道路（夜は街灯の光の筋）。雲は MICHILU で作った模様（components/app/flight-clouds.ts）。
// 読むのは地図の絵だけで、住所はどこにも送らない（降りる場所は、調べ終わった結果の座標）。
// 流れ：地球が現れる（絵がそろうまで最大 1 秒待ち、そろったらふわっと出す）→ 日本へ回る（1.6 秒。この間に描く速さを数え、遅い端末は
// 軽い版にする：山の立体・雲・山の陰影なし。#fx=lite／#fx=full で決められる）→ 調べている間は日本の上空でゆっくり近づく
// → 場所が分かったら、雲を抜けて山並みの上へ斜めに降りる（2.1 秒。富士山が近い所では富士山の方を向く）
// → 真上から見る向きに起きながら土地へ降りる（1.7 秒。物件の画面の模型の最初の見え方に、位置・大きさ・向きをそろえる。
// components/app/flight-handoff.ts）→ 写真がそろうのを最大 0.9 秒待つ → 印が光る（0.8 秒）→ ふわっと消えるのと同時に、
// 模型が建物を立ち上げる。見つからない・候補から選ぶ・調べられなかったときは、すぐ消える。
// 画面に触れる・スキップボタン・Esc で飛ばす。途中で動きを減らす設定にしたときも止める。
// 14 秒たっても場所が分からないときも消える（結果の画面がそのまま出る）
import "maplibre-gl/dist/maplibre-gl.css";
import { addProtocol, getVersion, Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cloudPainter, type CloudPainter } from "./flight-clouds";
import { bearingTo, centerFor, distanceKm, landingFrame, zoomForMpp } from "./flight-handoff";
import { DEM_PROTOCOL, flightMood, flightStyle, GSI_PHOTO, gsiToTerrarium, hazeBackground, LOOKS, terrainExaggeration, type FlightMood } from "./flight-look";

// 描画のワーカーは public/maplibre/<版>/ に置いてある（scripts/copy-maplibre-worker.mjs）
export const MAPLIBRE_VERSION = getVersion();
setWorkerUrl(`/maplibre/${MAPLIBRE_VERSION}/maplibre-gl-worker.mjs`);

/** 降りる先。null はまだ分からない（調べている）、"none" は降りない（見つからない・調べられなかった） */
export type FlightTarget = { lat: number; lng: number } | "none" | null;

/** 日本の上空（調べている間に待つ所） */
const JAPAN: [number, number] = [137.6, 36.0];
/** 富士山（関東・山梨・静岡の近くに降りるときは、富士山の方を向いて山並みの上を降りる） */
const FUJI = { lat: 35.3606, lng: 138.7274 };
/**
 * 動きの長さ（ミリ秒）。descend は日本の上空から山並みの上まで（雲を抜ける）、settle は真上から土地を見るまで（模型の着地の見え方に
 * そろえる）、sharpen は写真がそろうのを待つ長さの上限、ring は印が光る間
 */
const T = { firstTiles: 1000, turn: 1600, descend: 2100, settle: 1700, sharpen: 900, ring: 800, fade: 450, giveUp: 14000 };

/**
 * 重さの選び方。#fx=lite／#fx=full で決められる（確かめる用）。決めていなければ、地球が日本へ回る間の描く速さで決める
 * （遅い端末では、山の立体・雲・山の陰影を出さない）
 */
function forcedQuality(): "lite" | "full" | null {
  const m = typeof location !== "undefined" ? location.hash.match(/(?:^#|&)fx=(lite|full)/) : null;
  return m ? (m[1] as "lite" | "full") : null;
}

let flatDem: Promise<ArrayBuffer> | null = null;
/** 海など標高の無い所の、高さ 0m のタイル（terrarium） */
function flatTile(): Promise<ArrayBuffer> {
  flatDem ??= (async () => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const x = c.getContext("2d")!;
    const img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 128;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    return blob ? blob.arrayBuffer() : new ArrayBuffer(0);
  })();
  return flatDem;
}

/** 直した標高タイル（山の陰影と山の立体が同じタイルを読むので、2回目は直さずに渡す。古いものから捨てる） */
const demMemo = new Map<string, Blob>();

let demReady = false;
/** 国土地理院の標高タイルを、地図の部品が読める形（terrarium）に直して渡す（読み込みは国土地理院へ直接。1回だけ登録） */
function registerDem(): void {
  if (demReady) return;
  demReady = true;
  addProtocol(DEM_PROTOCOL, async (params, abort) => {
    const url = params.url.replace(`${DEM_PROTOCOL}://`, "https://");
    const memo = demMemo.get(url);
    if (memo) return { data: await memo.arrayBuffer() };
    const res = await fetch(url, { signal: abort.signal });
    if (!res.ok) return { data: await flatTile() };
    const bmp = await createImageBitmap(await res.blob());
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0);
    bmp.close();
    const img = x.getImageData(0, 0, c.width, c.height);
    gsiToTerrarium(img.data);
    x.putImageData(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (!blob) return { data: await flatTile() };
    demMemo.set(url, blob);
    if (demMemo.size > 160) demMemo.delete(demMemo.keys().next().value!);
    return { data: await blob.arrayBuffer() };
  });
}

/**
 * 降りきったところの航空写真を先に読んでおく（着いたときに写真がそろっているように）。降りる途中で使う粗い写真も
 * 読んでおくので、細かい写真が届く前の所も、色の面ではなくぼやけた写真になる。読む先は国土地理院だけ
 */
function warmPhotos(lat: number, lng: number, zoom: number): void {
  const r = (lat * Math.PI) / 180;
  const at = (z: number) => {
    const n = 2 ** z;
    return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
  };
  const get = (z: number, x: number, y: number) => {
    const url = GSI_PHOTO.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
    void fetch(url, { mode: "cors" }).catch(() => {});
  };
  // 粗い写真：土地にいちばん近い 2×2 枚（ズーム 11・13・15。1 枚 20KB ほど）
  for (const z of [11, 13, 15]) {
    const p = at(z);
    const x0 = Math.round(p.x) - 1;
    const y0 = Math.round(p.y) - 1;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) get(z, x0 + dx, y0 + dy);
  }
  // 降りきったところ：地図は 256px の写真を 1 つ上のズームで読む。画面が回っても足りるよう、まわり 5×5 枚
  const z = Math.min(18, Math.round(zoom) + 1);
  const p = at(z);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) get(z, Math.floor(p.x) + dx, Math.floor(p.y) + dy);
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** 山並みの上までの降り方（はじめはゆっくり、途中で速く、最後は滑るように止まる。真ん中で速さが途切れない） */
const glide = (t: number) => (t < 0.5 ? 2 ** 1.4 * t ** 2.4 : 1 - (2 - 2 * t) ** 2.4 / 2);

/** 山並みの上（1つめの降り方の終わり）：ズーム・見下ろす角度（山の上に空が見える角度） */
const OVER = { zoom: 9.6, pitch: 70 };
/** 模型の見え方が分からないときの降りきったところ（真上から、北を上に） */
const FALLBACK = { zoom: 16.2, bearing: 0, y: 0.42 };
/** 遅い端末とみなす描く速さ（1秒あたりの枚数。地球が日本へ回る間に数える） */
const SLOW_FPS = 26;

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
  const dialog = useRef<HTMLDialogElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const cloudCanvas = useRef<HTMLCanvasElement>(null);
  const clouds = useRef<CloudPainter | null>(null);
  const haze = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const timers = useRef<number[]>([]);
  const done = useRef(false);
  const descending = useRef(false);
  /** 軽い版（山の立体・雲・山の陰影を出さない） */
  const lite = useRef(forcedQuality() === "lite");
  const calls = useRef({ onLeave, onDone });
  useEffect(() => {
    calls.current = { onLeave, onDone };
  });
  /** 時間帯（開いたときに決めて、演出の間は変えない） */
  const [mood] = useState<FlightMood>(() => flightMood());
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
      timers.current.splice(0).forEach(clearTimeout);
      // stop() が moveend を発火しても、done の確認で次の演出へ進まない。
      map.current?.stop();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setStage("out");
      calls.current.onLeave(landed && !reduce);
      later(reduce ? 0 : T.fade, () => {
        dialog.current?.close();
        calls.current.onDone();
      });
    },
    [later],
  );

  // ネイティブのモーダルで背後の操作を止め、演出中もスキップをキーボードで選べるようにする。
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    skip.current?.focus({ preventScroll: true });
    return () => el.close();
  }, []);

  // 開始時だけでなく、演出中に端末の設定が変わった場合も直ちに止める。
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stopForPreference = () => {
      if (media.matches) finish(false);
    };
    if (media.matches) queueMicrotask(stopForPreference);
    media.addEventListener("change", stopForPreference);
    return () => media.removeEventListener("change", stopForPreference);
  }, [finish]);

  // 地球を出して、絵がそろったら日本へ回る（回る間に描く速さを数えて、遅い端末は軽い版にする）
  useEffect(() => {
    if (!box.current) return;
    registerDem();
    let m: MapLibreMap;
    try {
      m = new MapLibreMap({
        container: box.current,
        style: flightStyle(mood, { terrain: true }),
        center: [104, 12],
        zoom: 0.9,
        maxPitch: 75,
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
    const onResize = () => clouds.current?.resize();
    window.addEventListener("resize", onResize);
    // 雲は地図を描くたびに、いまのズームと向きで描き直す。地平線の霞は、見下ろす角度が 50° を超えたら濃くする
    const onRender = () => {
      clouds.current?.draw(m.getZoom(), m.getBearing());
      if (haze.current) haze.current.style.opacity = String(Math.min(1, Math.max(0, (m.getPitch() - 50) / 18)));
    };
    m.on("render", onRender);
    let turned = false;
    let frames = 0;
    let counting = false;
    const count = () => {
      if (!counting) return;
      frames++;
      requestAnimationFrame(count);
    };
    const turn = () => {
      if (turned || done.current) return;
      turned = true;
      setVisible(true);
      m.easeTo({ center: JAPAN, zoom: 3.4, duration: T.turn, easing: easeInOut });
      const t0 = performance.now();
      counting = true;
      requestAnimationFrame(count);
      later(T.turn, () => {
        counting = false;
        const fps = (frames * 1000) / Math.max(1, performance.now() - t0);
        const forced = forcedQuality();
        const cores = navigator.hardwareConcurrency || 4;
        lite.current = forced ? forced === "lite" : fps < SLOW_FPS || cores <= 2;
        if (lite.current) {
          // 山の陰影をやめる（標高のタイルを読まない）
          if (m.getLayer("shade")) m.removeLayer("shade");
        } else if (cloudCanvas.current) {
          clouds.current = cloudPainter(cloudCanvas.current, mood);
        }
        setOverJapan(true);
      });
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
      counting = false;
      ts.forEach(clearTimeout);
      window.removeEventListener("resize", onResize);
      clouds.current?.dispose();
      clouds.current = null;
      m.remove();
      map.current = null;
    };
  }, [finish, later, mood]);

  // 調べている間は、日本の上空でゆっくり近づく
  useEffect(() => {
    const m = map.current;
    if (!m || done.current || !overJapan || target !== null || stage !== "space") return;
    m.easeTo({ zoom: 4.4, bearing: -8, duration: 8000, easing: (t) => t });
  }, [overJapan, target, stage]);

  // 場所が分かったら降りる（見つからないときは、すぐ消える）。
  // ① 山並みの上へ：斜めに見下ろしながら、雲を抜けて土地の上空へ（富士山が近い所では富士山の方を向く。山は立体）
  // ② 土地の上へ：真上から見下ろす向きに起きながら降りて、物件の画面の模型の最初の見え方（位置・大きさ・向き）にぴったり合わせる
  // ③ 写真がそろうのを少し待って、印を光らせる → 消えると同時に模型が建物を立ち上げる
  useEffect(() => {
    const m = map.current;
    if (target === "none") {
      queueMicrotask(() => finish(false));
      return;
    }
    if (!m || done.current || !target || !overJapan || descending.current) return;
    descending.current = true;
    queueMicrotask(() => setStage("descend"));
    const here: [number, number] = [target.lng, target.lat];
    const first = landingFrame();
    const fuji = distanceKm(target, FUJI);
    const facing = fuji > 6 && fuji < 190 ? bearingTo(target, FUJI) : (first?.bearing ?? 340);
    warmPhotos(target.lat, target.lng, first ? zoomForMpp(first.mpp, target.lat) : FALLBACK.zoom);
    // 山の立体は、山並みが見えてくるところ（ズーム 6）から入れて、山並みの上を過ぎたら外す（真上から降りるときは要らない。
    // 細かい標高が届くまで地図が描けない所が出るのを避ける）
    let terrainOn = false;
    const onMove = () => {
      if (terrainOn || lite.current || m.getZoom() < 6) return;
      terrainOn = true;
      try {
        m.setTerrain({ source: "dem", exaggeration: terrainExaggeration(OVER.zoom) });
      } catch {
        // 立体にできないときは、平らなまま降りる
      }
    };
    m.on("move", onMove);
    m.flyTo({ center: here, zoom: OVER.zoom, pitch: OVER.pitch, bearing: facing, duration: T.descend, curve: 1.5, easing: glide, essential: true });
    m.once("moveend", () => {
      m.off("move", onMove);
      if (done.current) return;
      if (terrainOn) m.setTerrain(null);
      const frame = landingFrame();
      const box = m.getContainer().getBoundingClientRect();
      const end = frame
        ? { zoom: zoomForMpp(frame.mpp, target.lat), bearing: frame.bearing, x: frame.x - box.left, y: frame.y - box.top }
        : { zoom: FALLBACK.zoom, bearing: FALLBACK.bearing, x: box.width / 2, y: box.height * FALLBACK.y };
      const c = centerFor(target, end.x - box.width / 2, end.y - box.height / 2, end.bearing, end.zoom);
      m.easeTo({ center: [c.lng, c.lat], zoom: end.zoom, pitch: 0, bearing: end.bearing, duration: T.settle, easing: easeInOut, essential: true });
      m.once("moveend", () => {
        if (done.current) return;
        // 写真がそろうのを少し待ってから、印を光らせる（模型と重なるので、地図はもう動かさない）
        let shown = false;
        const land = () => {
          if (shown || done.current) return;
          shown = true;
          const p = m.project(here);
          setRing({ x: p.x, y: p.y });
          setStage("land");
          later(T.ring, () => finish(true));
        };
        m.once("idle", land);
        later(T.sharpen, land);
      });
    });
  }, [target, overJapan, finish, later]);

  const known = !!target && target !== "none";
  const lights = LOOKS[mood].lights;
  const credit = `画像：NASA GIBS（Blue Marble${lights > 0 ? "・夜の街明かり" : ""}）・地理院タイル（写真・標高${lights > 0.5 ? "・道路" : ""}）を加工`;
  return (
    <dialog
      ref={dialog}
      className={`app-touch fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-transparent ${stage === "out" ? "flight-out" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={known ? `${label}へ移動しています` : "調べています"}
      onPointerDown={() => finish(known)}
      onCancel={(event) => {
        event.preventDefault();
        finish(known);
      }}
      onKeyDown={(event) => {
        // 操作はスキップだけ。Tab / Shift+Tab で背後やブラウザのツールバーへ移らないようにする。
        if (event.key === "Tab") {
          event.preventDefault();
          skip.current?.focus({ preventScroll: true });
        }
      }}
    >
      {/* 地図の部品は自分の箱を position: relative にするので、画面いっぱいの箱の中に置く。後ろは宇宙の背景（透けて見える）。
          地平線の霞は色の帯、雲は地図の上の透明な板に描く */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
        <div ref={box} className="h-full w-full" />
        <div ref={haze} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[40%] opacity-0" style={{ background: hazeBackground(mood) }} />
        <canvas ref={cloudCanvas} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
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
        <button
          ref={skip}
          type="button"
          onClick={() => finish(known)}
          className="pointer-events-auto mt-[8px] min-h-[44px] min-w-[88px] rounded-full border border-white/40 bg-black/60 px-[20px] text-[14px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          スキップ
        </button>
        <p className="mt-[6px] max-w-[92%] text-center text-white/45" style={{ fontSize: 9.5 }}>
          {credit}
        </p>
      </div>
    </dialog>
  );
}
