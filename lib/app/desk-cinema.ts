// PC のホームと検索の動き（PC の地図＝skin "desk" だけ。スマホの地図には使わない）。
//  - ホーム：Blender で描いた真上から見た日本（scripts/pc-opening の home.py --extent。PC の地図と同じメルカトル図法・
//    ズーム 5 の2倍の細かさ）を、四隅の経度・緯度で地図に重ねる。画面の大きさによらず海岸線が地図と重なる。
//    ズーム 7.4 より寄ると薄くなり、8.8 で消える（その先は今の地図）
//  - 検索：物件の場所へ、真上から降りる。途中は国土地理院の写真（ズーム 2〜8 は世界衛星モザイク、9〜13 はランドサット、
//    14〜18 は航空写真）を、高い所ではホームの絵の色（暗め・彩度控えめ）に寄せて見せ、着いたら調査用の地図（選んでいる地図）に
//    溶けて変わる。着いた所に金の光の輪が1回広がる。地図を押す・キーを押すと、すぐ着く。動きを減らす設定では、今までどおり
// 出典：写真の出典（国土地理院の地理院タイル一覧の「写真」の備考のとおり、ランドサット・世界衛星モザイクの出所も）と、
// 背景の日本の出典（加工して作成）を、地図の出典の欄に出す。
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import desk from "./desk-japan.json";

import { PHOTO_ATTRIBUTION } from "../map-style";

const ICHIRAN = "https://maps.gsi.go.jp/development/ichiran.html";
/** 検索の途中に見せる写真（国土地理院「写真」）の出典（「写真」の地図と同じ） */
export const FLIGHT_PHOTO_ATTRIBUTION = PHOTO_ATTRIBUTION;
/** ホームの背景（Blender で描いた日本）の出典 */
export const DESK_JAPAN_ATTRIBUTION = `背景の日本：<a href="${ICHIRAN}" target="_blank" rel="noreferrer">地理院タイル</a>（全国ランドサットモザイク画像・世界衛星モザイク画像）と AWS Terrain Tiles（ETOPO1（NOAA）・SRTM・GMTED2010（USGS）など）を加工して作成（Blender）`;

const PHOTO = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg";
const GOLD = "#c9a15a";

type Corners = [[number, number], [number, number], [number, number], [number, number]];

/** ホームの背景・検索の途中の写真・着いた所の輪を、背景の地図のすぐ上（重ねるものの下）に足す */
const BASES = new WeakMap<MapLibreMap, string[]>();

export function addDeskCinema(map: MapLibreMap, baseIds: string[]): void {
  if (map.getSource("desk-japan")) return;
  BASES.set(map, baseIds);
  const layers = map.getStyle().layers ?? [];
  const last = Math.max(...baseIds.map((id) => layers.findIndex((l) => l.id === id)));
  const before = layers[last + 1]?.id;
  map.addSource("flight-photo", { type: "raster", tiles: [PHOTO], tileSize: 256, minzoom: 2, maxzoom: 18, attribution: FLIGHT_PHOTO_ATTRIBUTION });
  const photo: LayerSpecification = {
    id: "flight-photo",
    type: "raster",
    source: "flight-photo",
    layout: { visibility: "none" },
    paint: {
      "raster-opacity": 1,
      "raster-fade-duration": 0,
      // 高い所ではホームの絵の色（暗め・彩度控えめ）に寄せ、降りるにつれて写真の自然な色に戻す
      "raster-saturation": ["interpolate", ["linear"], ["zoom"], 8, -0.3, 12, -0.12, 15, -0.06],
      "raster-contrast": ["interpolate", ["linear"], ["zoom"], 8, -0.04, 14, 0.08],
      "raster-brightness-max": ["interpolate", ["linear"], ["zoom"], 8, 0.74, 11, 0.86, 14, 0.96],
    },
  };
  map.addLayer(photo, before);
  map.addSource("desk-japan", { type: "image", url: desk.url, coordinates: desk.coordinates as Corners });
  map.addLayer(
    {
      id: "desk-japan",
      type: "raster",
      source: "desk-japan",
      paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 7.4, 1, 8.8, 0], "raster-fade-duration": 0 },
    },
    before,
  );
  // 背景の日本の出典（画像の重ねものには出典を付けられないので、空の入れ物に付ける。絵が見える高さだけ使い、出典の欄に出す）
  map.addSource("desk-credit", { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: DESK_JAPAN_ATTRIBUTION });
  map.addLayer({ id: "desk-credit", type: "circle", source: "desk-credit", maxzoom: 8.8, paint: { "circle-radius": 0 } });
  // 着いた所の光の輪
  map.addSource("arrive", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "arrive-ring",
    type: "circle",
    source: "arrive",
    paint: { "circle-radius": 0, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": GOLD, "circle-stroke-width": 2, "circle-stroke-opacity": 0 },
  });
}

const smooth = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);

function ring(map: MapLibreMap, at: [number, number]): void {
  const src = map.getSource("arrive") as GeoJSONSource | undefined;
  if (!src) return;
  src.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: at } }] });
  const t0 = performance.now();
  const step = () => {
    const u = Math.min(1, (performance.now() - t0) / 1300);
    if (!map.getLayer("arrive-ring")) return;
    map.setPaintProperty("arrive-ring", "circle-radius", 8 + 64 * smooth(u));
    map.setPaintProperty("arrive-ring", "circle-stroke-opacity", 0.95 * (1 - u) ** 1.6);
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 動きを減らす設定か（端末の設定） */
export const reduceMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * 物件の場所へ降りる。遠くから（ズーム 9 より引いた所・30km より離れた所）は写真を見せながら真上から降り、着いたら輪を広げて
 * 調査用の地図に溶けて変わる（写真の地図を選んでいれば写真のまま）。近いときと動きを減らす設定では、今までどおり短く寄る
 */
let flightId = 0;
let flying: [number, number] | null = null;

export function flyToProperty(map: MapLibreMap, at: [number, number], o: { keepPhoto: boolean }): void {
  // 同じ行き先へ降りている途中なら、もう一度は始めない（物件が決まったときと、見出しの「物件の場所へ」の両方から呼ばれる）
  if (flying && Math.abs(flying[0] - at[0]) < 1e-7 && Math.abs(flying[1] - at[1]) < 1e-7) return;
  void flyToPropertyAsync(map, at, o);
}

async function flyToPropertyAsync(map: MapLibreMap, at: [number, number], o: { keepPhoto: boolean }): Promise<void> {
  const from = map.getCenter();
  const far = map.getZoom() < 9 || Math.hypot((from.lng - at[0]) * Math.cos((at[1] * Math.PI) / 180), from.lat - at[1]) * 111 > 30;
  if (!far || reduceMotion() || !map.getLayer("flight-photo")) {
    map.flyTo({ center: at, zoom: 17, duration: 1200 });
    return;
  }
  const id = ++flightId;
  flying = at;
  map.stop();
  map.setPaintProperty("flight-photo", "raster-opacity-transition", { duration: 0, delay: 0 });
  map.setPaintProperty("flight-photo", "raster-opacity", 1);
  map.setLayoutProperty("flight-photo", "visibility", "visible");
  // 降りているあいだは背景の地図を隠す（読み込みも止める）。写真がまだ届かない所は夜の海の色にする
  const bases = (BASES.get(map) ?? []).filter((b) => map.getLayer(b));
  const shown = bases.filter((b) => map.getLayoutProperty(b, "visibility") !== "none");
  for (const b of shown) map.setLayoutProperty(b, "visibility", "none");
  if (map.getLayer("bg")) map.setPaintProperty("bg", "background-color", "#0b1a2e");

  // 降り方：高さ（ズーム）はゆっくり始まりゆっくり止まる。行き先は前半で画面の真ん中へ寄せる。
  // 写真が届いていないあいだは速さを 1/4 に落とす（届いたら戻す）。7 秒を過ぎたら待たない
  const z0 = map.getZoom();
  const c0 = map.getCenter();
  const mx = (lng: number) => (lng + 180) / 360;
  const my = (lat: number) => (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;
  const tx = mx(at[0]), ty = my(at[1]);
  const w0 = 512 * 2 ** z0;
  const sx0 = (tx - mx(c0.lng)) * w0, sy0 = (ty - my(c0.lat)) * w0;
  let u = 0;
  let last = performance.now();
  const began = last;
  let skipped = false;
  const container = map.getContainer();
  const skip = () => {
    skipped = true;
  };
  container.addEventListener("pointerdown", skip, true);
  window.addEventListener("keydown", skip, true);

  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      if (id !== flightId) return resolve(); // 途中で別の場所を調べた
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const ready = map.getZoom() < 8.4 || map.isSourceLoaded("flight-photo") || now - began > 7000;
      u = skipped ? 1 : Math.min(1, u + dt * (ready ? 1 / 3.0 : 1 / 12));
      const z = z0 + (17 - z0) * smooth(u);
      const s = 1 - smooth(Math.min(1, u / 0.6));
      const w = 512 * 2 ** z;
      const cx = tx - (sx0 * s) / w, cy = ty - (sy0 * s) / w;
      map.jumpTo({ center: [cx * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180) / Math.PI], zoom: z });
      if (u < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  container.removeEventListener("pointerdown", skip, true);
  window.removeEventListener("keydown", skip, true);
  if (id !== flightId) return;
  flying = null;
  map.jumpTo({ center: at, zoom: 17 });
  ring(map, at);
  // 背景の地図を戻し、写真から溶けて変わる（写真の地図を選んでいれば写真のまま）
  for (const b of shown) {
    map.setPaintProperty(b, "raster-opacity-transition", { duration: 0, delay: 0 });
    map.setPaintProperty(b, "raster-opacity", 1);
    map.setLayoutProperty(b, "visibility", "visible");
  }
  if (map.getLayer("bg")) map.setPaintProperty("bg", "background-color", "#eef1ee");
  if (o.keepPhoto) {
    map.setLayoutProperty("flight-photo", "visibility", "none");
    return;
  }
  map.setPaintProperty("flight-photo", "raster-opacity-transition", { duration: 1000, delay: 350 });
  map.setPaintProperty("flight-photo", "raster-opacity", 0);
  setTimeout(() => id === flightId && map.getLayer("flight-photo") && map.setLayoutProperty("flight-photo", "visibility", "none"), 1500);
}

/** 調べている間（場所が分かる前）に、入れた住所の都道府県の上へ、ゆっくり向かう（ホームから） */
export function headToward(map: MapLibreMap, view: { center: [number, number]; zoom: number }): void {
  if (reduceMotion() || map.getZoom() >= 7 || map.isMoving()) return;
  map.easeTo({ center: view.center, zoom: Math.min(view.zoom, 6.4), duration: 2200, easing: smooth });
}
