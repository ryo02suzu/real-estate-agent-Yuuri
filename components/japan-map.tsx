"use client";

// スマホ用の「日本全体 → 確定した実地点」の地図。ひとつの地図カメラのまま、日本全体から物件の場所へ動く。
// PC の動く地図（components/live-map.tsx。関東の初期表示）とは別。ここで関東の設定は変えない。
// 背景は地理院タイルの淡色地図。低いズームのタイルを配信しているかは実行時に確かめ、無ければ標準地図、
// それも無ければ北海道〜九州だけを z5 以上のタイルで見せ、そう表示していることを画面に書く（lib/japan-basemap.ts）。白い地図のままにしない
import "maplibre-gl/dist/maplibre-gl.css";
import { getVersion, MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { StyleSpecification } from "maplibre-gl";
import {
  cameraMove,
  distanceM,
  GSI_ATTRIBUTION,
  GSI_PALE_URL,
  GSI_STD_URL,
  imageLoads,
  JAPAN_BOUNDS,
  JAPAN_MAIN_BOUNDS,
  MAIN_ONLY_MIN_ZOOM,
  MAP_MIN_ZOOM,
  noticeFor,
  overviewPadding,
  planBase,
  pointPadding,
  probeLowZoom,
  PROBE_ZOOM,
  TILE_MAX_ZOOM,
  type BasePlan,
  type Padding,
} from "@/lib/japan-basemap";
import { CAMERA_MS, easeOut, PANEL_MS } from "@/lib/motion";
import type { PointView } from "@/lib/position-accuracy";

setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);

/** 低ズームの下敷き（標準地図）を出すのは、淡色が z5 以上になる手前のズームまで */
const LOW_ZOOM_LAYER_MAX = 4;

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    // 淡色地図。読むタイルは z4 以上（地図の最小ズーム 2.5 で読む段は round(3.5)=4）。z18 を超えたら z18 を引き伸ばす
    pale: { type: "raster", tiles: [GSI_PALE_URL], tileSize: 256, minzoom: PROBE_ZOOM, maxzoom: TILE_MAX_ZOOM, attribution: GSI_ATTRIBUTION },
  },
  layers: [
    // タイルが無い所（海・読み込み前）が白く抜けないよう、薄い青緑の面を敷く
    { id: "bg", type: "background", paint: { "background-color": "#e6f2f2" } },
    { id: "pale", type: "raster", source: "pale" },
  ],
};

/** 確かな位置（住所の一致・地番で探した筆・地図で選んだ地点）のピン（自作の SVG） */
const PIN_SOLID = `<svg viewBox="0 0 28 38" width="28" height="38" aria-hidden="true"><path d="M14 0C6.3 0 0 6.2 0 13.8 0 24 14 38 14 38s14-14 14-24.2C28 6.2 21.7 0 14 0Z" fill="#0f766e"/><circle cx="14" cy="13.5" r="5" fill="#fff"/></svg>`;
/**
 * 目安の位置（町の中心・公図から推定した筆）のピン：中抜き・点線の縁、色はパネルの「位置の目安」の注意と同じ赤茶（自作の SVG）。
 * 誤差の円や範囲は描かない（データに無いので作らない）
 */
const PIN_HOLLOW = `<svg viewBox="0 0 28 38" width="28" height="38" aria-hidden="true"><path d="M14 1.6C7.2 1.6 1.6 7.1 1.6 13.8 1.6 23.1 14 35.6 14 35.6S26.4 23.1 26.4 13.8C26.4 7.1 20.8 1.6 14 1.6Z" fill="#fff" stroke="#8a3d28" stroke-width="2.6" stroke-dasharray="4.2 2.8"/><circle cx="14" cy="13.5" r="3.6" fill="#8a3d28"/></svg>`;

/** ピンの形・札・説明を、位置の目安に合わせる（札と説明は固定の文言だけ。住所などの入力は入れない） */
function lookPin(el: HTMLElement, v: PointView) {
  el.innerHTML = (v.pin === "hollow" ? PIN_HOLLOW : PIN_SOLID) + (v.tag ? `<span class="mui-pin-tag">${v.tag}</span>` : "");
  el.title = v.title;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", v.title);
}

/** 地図の箱の大きさ */
const viewOf = (m: MapLibreMap | HTMLElement) => {
  const el = m instanceof HTMLElement ? m : m.getContainer();
  return { w: el.clientWidth, h: el.clientHeight };
};

/** 日本全体（主な島だけのときはその範囲）と、必ず入る余白（lib/japan-basemap.ts の overviewPadding） */
function overview(m: MapLibreMap | HTMLElement, inset: Inset, plan: BasePlan) {
  const view = viewOf(m);
  return plan === "main-only"
    ? { bounds: JAPAN_MAIN_BOUNDS, padding: overviewPadding(view, inset.b, JAPAN_MAIN_BOUNDS, MAIN_ONLY_MIN_ZOOM, inset.l) }
    : { bounds: JAPAN_BOUNDS, padding: overviewPadding(view, inset.b, JAPAN_BOUNDS, MAP_MIN_ZOOM, inset.l) };
}

/** パネルが地図を覆う量(px)。b：下から重なるパネルの高さ（縦向き）／l：左に寄せたパネルの右端（横向き。縦向きは 0） */
type Inset = { b: number; l: number };
/** パネルの覆う量の変化が、地図を動かすほどか（4px 以下の揺れでは動かさない） */
const insetChanged = (a: Inset, b: Inset) => Math.abs(a.b - b.b) > 4 || Math.abs(a.l - b.l) > 4;

export type JapanMapProps = {
  /** 確定した実地点と、位置の目安に合わせた寄り具合・ピン（lib/position-accuracy.ts の pointView）。null なら日本全体 */
  point: { lat: number; lng: number; view: PointView } | null;
  /** 確定した結果が出るたびに増える（同じ地点を調べ直したときもカメラを寄せ直す。候補待ち・見つからないでは増えない） */
  focus: number;
  /** 下から重なるパネルの高さ(px)の見込み。ピンがパネルに隠れないよう中心をずらす（カメラ用。上限あり） */
  bottomInset: number;
  /** 横向き（パネルを左に寄せる）のときの、パネルの右端(px)。ピン・日本全体をその右に見せる。縦向きは 0 */
  leftInset?: number;
  reducedMotion: boolean;
  onFail?: () => void;
};

// 出典（地理院タイル）は、下から重なるパネルの実際の高さ（CSS の --mui-panel-h。components/mobile-shell.tsx が書く）の上に出す（globals.css）
export default function JapanMap({ point, focus, bottomInset, leftInset = 0, reducedMotion, onFail }: JapanMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pin = useRef<Marker | null>(null);
  /** 背景の決め方（低ズームのタイルの確認結果） */
  const base = useRef<BasePlan>("pale");
  /** 代わりの背景にしたことの知らせ（日本全体を見せられていないとき） */
  const [notice, setNotice] = useState<string | null>(null);
  /** カメラが動いている最中か（movestart〜moveend。その間は、パネルの高さの追従で動きを止めない） */
  const moving = useRef(false);
  /** 最初の実行か（最初に地点が無いときは、地図を作ったときの日本全体のまま） */
  const first = useRef(true);
  /** 最後にカメラへ反映した、パネルの覆う量 */
  const applied = useRef<Inset>({ b: bottomInset, l: leftInset });
  const latest = useRef({ point, inset: { b: bottomInset, l: leftInset } as Inset, reducedMotion, onFail });
  useEffect(() => {
    latest.current = { point, inset: { b: bottomInset, l: leftInset }, reducedMotion, onFail };
  });

  useEffect(() => {
    if (!box.current) return;
    let m: MapLibreMap;
    try {
      const start = overview(box.current, latest.current.inset, "pale");
      m = new MapLibreMap({
        container: box.current,
        style: STYLE,
        bounds: start.bounds,
        fitBoundsOptions: { padding: start.padding },
        minZoom: MAP_MIN_ZOOM,
        maxZoom: 19.5,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        // 出典（地理院タイル）はたたまずに常に見せる。位置は下から重なるパネルの上（globals.css の .mui-japan-map）
        attributionControl: { compact: false },
        locale: { "AttributionControl.ToggleAttribution": "出典", "Map.Title": "地図" },
      });
    } catch {
      latest.current.onFail?.();
      return;
    }
    let disposed = false;
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();

    // タイルが読めなくても住所入力は使える。1枚も読めないまま通信エラーが続いたときだけ通知する
    // （地理院のタイルが無い場所の 404 は MapLibre がエラーにしない。途中の一時的な失敗では地図を消さない）
    let errors = 0;
    let loaded = false;
    m.on("sourcedata", (e) => {
      if (e.tile) loaded = true;
    });
    m.on("error", () => {
      if (!loaded && ++errors === 8) latest.current.onFail?.();
    });

    // カメラが動いている間（自動の動きも、指で動かしているときも）は、パネルの高さの追従で動きを止めない。動きが終わったら、
    // 動いている間に変わったパネルの高さへ中心を合わせる
    m.on("movestart", () => {
      moving.current = true;
    });
    m.on("moveend", () => {
      moving.current = false;
      const want = latest.current.inset;
      if (!insetChanged(want, applied.current)) return;
      applied.current = want;
      settle(m, latest.current.point, want, latest.current.reducedMotion, base.current);
    });

    // 低ズームの背景が配信されているかを確かめ、無ければ代わりを使う
    // （地図の読み込みやタイルの取得の途中でも、スタイルが読めていれば足せる）
    const whenStyleReady = (fn: () => void) => {
      if (m.getSource("pale")) fn();
      else m.once("styledata", fn);
    };
    void probeLowZoom((url) => imageLoads(url)).then((available) => {
      if (disposed) return;
      const plan = planBase(available);
      if (plan === "pale") return;
      base.current = plan;
      setNotice(noticeFor(plan));
      if (plan === "std") {
        whenStyleReady(() => {
          if (disposed || m.getSource("std-low")) return;
          m.addSource("std-low", { type: "raster", tiles: [GSI_STD_URL], tileSize: 256, minzoom: PROBE_ZOOM, maxzoom: PROBE_ZOOM, attribution: GSI_ATTRIBUTION });
          m.addLayer({ id: "std-low", type: "raster", source: "std-low", maxzoom: LOW_ZOOM_LAYER_MAX }, "pale");
        });
      } else {
        // どちらも無い：読むタイルが z5 以上になる範囲（北海道〜九州）だけを見せる。カメラが動いている最中なら、終わってから
        const mainOnly = () => {
          if (disposed) return;
          m.setMinZoom(MAIN_ONLY_MIN_ZOOM);
          if (!latest.current.point) {
            const o = overview(m, latest.current.inset, "main-only");
            fitWith(m, o.bounds, o.padding, 0);
          }
        };
        if (moving.current) m.once("moveend", mainOnly);
        else mainOnly();
      }
    });

    map.current = m;
    return () => {
      disposed = true;
      pin.current?.remove();
      pin.current = null;
      m.remove();
      map.current = null;
    };
  }, []);

  // 地点が決まったら実地点へ、無ければ日本全体へ、同じカメラで動く（演出の完了は待たない）
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    // 最初の表示で地点が無いときは、地図を作ったときの日本全体のまま（もう一度合わせ直さない）
    if (first.current) {
      first.current = false;
      if (!point) return;
    }
    const { inset, reducedMotion: rm } = latest.current;
    const duration = rm ? 0 : CAMERA_MS;
    applied.current = inset;
    m.stop();
    if (point) {
      if (!pin.current) {
        const el = document.createElement("div");
        pin.current = new Marker({ element: el, anchor: "bottom" }).setLngLat([point.lng, point.lat]).addTo(m);
      } else pin.current.setLngLat([point.lng, point.lat]);
      lookPin(pin.current.getElement(), point.view);
      const c = m.getCenter();
      // 寄り具合は位置の目安に合わせる（町の中心は引いて町の広がりを見せ、筆は少し寄る）
      const options = { center: [point.lng, point.lat] as [number, number], zoom: point.view.zoom, padding: pointPadding(viewOf(m), inset.b, inset.l), duration, essential: false };
      // 遠い場所へは、いったん引いてから寄る（通り道のタイルを全部読まない）
      if (cameraMove(m.getZoom(), distanceM({ lat: c.lat, lng: c.lng }, point)) === "fly") m.flyTo(options);
      else m.easeTo(options);
    } else {
      pin.current?.remove();
      pin.current = null;
      const o = overview(m, inset, base.current);
      fitWith(m, o.bounds, o.padding, duration);
    }
  }, [point, focus]);

  // パネルの覆う量が変わったとき（段階の切り替え・ホームの内容の変化・画面の向き）、ピンや日本全体が隠れないよう中心を追従させる。
  // 長いカメラの動きの最中なら止めず、その動きが終わってから合わせる（上の moveend）
  useEffect(() => {
    const m = map.current;
    const want = { b: bottomInset, l: leftInset };
    if (!m || moving.current || !insetChanged(want, applied.current)) return;
    applied.current = want;
    settle(m, latest.current.point, want, latest.current.reducedMotion, base.current);
  }, [bottomInset, leftInset]);

  return (
    // MapLibre の CSS（層の外）が地図の箱を position: relative にし、Tailwind の absolute（層の中）より強いので、箱そのものを
    // 絶対配置にすると高さが0になって地図が見えない。外側の箱で画面いっぱいにし、地図の箱は大きさで広げる（components/live-map.tsx と同じ）
    <div className="absolute inset-0">
      <div ref={box} className="mui-japan-map h-full w-full" role="group" aria-label="日本地図" />
      {/* 代わりの背景（北海道〜九州だけ）のとき、日本全体を見せられていないことを書く（ホームの日本全体のときだけ） */}
      {notice && !point && (
        <p role="status" className="mui-map-notice">
          {notice}
        </p>
      )}
    </div>
  );
}

/**
 * 範囲に合わせて動かす。fitBounds の余白は、地図がすでに持っている余白（easeTo の padding で付く）に足されるので、
 * 欲しい余白と今の余白の差で渡す（そのまま渡すと二重になり、余白が画面より大きいと何もせず警告だけ出して止まる）
 */
function fitWith(m: MapLibreMap, bounds: [[number, number], [number, number]], want: Padding, duration: number, easing?: (t: number) => number) {
  const cur = m.getPadding();
  m.fitBounds(bounds, {
    padding: { top: want.top - (cur.top ?? 0), bottom: want.bottom - (cur.bottom ?? 0), left: want.left - (cur.left ?? 0), right: want.right - (cur.right ?? 0) },
    duration,
    easing,
    essential: false,
  });
}

/**
 * パネルの高さ・位置に合わせて、地点（または日本全体）の位置だけを追従させる。パネル（CSS の transition）と同じ長さ・同じ減速
 * （lib/motion.ts）で動かし、パネルの縁と地図の注目地点が別々の速さで動いて「ずれて見える」ことを無くす
 */
function settle(m: MapLibreMap, point: { lat: number; lng: number } | null, inset: Inset, reduced: boolean, plan: BasePlan) {
  const duration = reduced ? 0 : PANEL_MS;
  if (point) m.easeTo({ padding: pointPadding(viewOf(m), inset.b, inset.l), duration, easing: easeOut, essential: false });
  else {
    const o = overview(m, inset, plan);
    fitWith(m, o.bounds, o.padding, duration, easeOut);
  }
}
