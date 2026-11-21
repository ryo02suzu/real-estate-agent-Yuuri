// PC のホームと検索の動き（PC の地図＝skin "desk" だけ。スマホの地図には使わない）。
//  - ホーム：Blender で描いた真上から見た日本（scripts/pc-opening の home.py --extent。PC の地図と同じメルカトル図法・
//    ズーム 5 の2倍の細かさ）を、四隅の経度・緯度で地図に重ねる。画面の大きさによらず海岸線が地図と重なる。
//    ズーム 7.4 より寄ると薄くなり、8.8 で消える（その先は今の地図）。絵は上の帯の時間帯（朝・昼・夕・夜。時計に合わせるときは
//    今の太陽）の1枚（lib/app/desk-home.ts）。開いたときは今の時間帯の絵だけを読み、時間帯が変わったら、その絵を読んで約 1.2 秒で
//    溶かして替える（動きを減らす設定では、届いたらすぐ替える）
//  - 検索：物件の場所へ、真上から降りる。降り始めに、ホームの上空の雲（空気の層。lib/app/desk-air-layer.ts）を通り抜ける。
//    途中は国土地理院の写真（ズーム 2〜8 は世界衛星モザイク、9〜13 はランドサット、
//    14〜18 は航空写真）を、高い所ではホームの絵の色（暗め・彩度控えめ）に寄せて見せ、着いたら調査用の地図（選んでいる地図）に
//    溶けて変わる。着いた所に金の光の輪が1回広がる。地図を押す・キーを押すと、すぐ着く。動きを減らす設定では、今までどおり
// 出典：写真の出典（国土地理院の地理院タイル一覧の「写真」の備考のとおり、ランドサット・世界衛星モザイクの出所も）と、
// 背景の日本の出典（加工して作成）と、夕・夜の絵を出している間は夜の街の明かりの出典を、地図の出典の欄に出す。
import type { ExpressionSpecification, GeoJSONSource, LayerSpecification, MapSourceDataEvent, Map as MapLibreMap } from "maplibre-gl";
import type { DeskTod } from "./desk";
import { HOME_CORNERS, HOME_IMAGE_OF, homeFadeMs, homeImage, homeImageByKey, homeLightsCredit, nextHomeStep, type HomeFade, type HomeImageKey } from "./desk-home";
import { deskAirPass } from "./desk-air-layer";

import { PHOTO_ATTRIBUTION } from "../map-style";

const ICHIRAN = "https://maps.gsi.go.jp/development/ichiran.html";
/** 検索の途中に見せる写真（国土地理院「写真」）の出典（「写真」の地図と同じ） */
export const FLIGHT_PHOTO_ATTRIBUTION = PHOTO_ATTRIBUTION;
/** ホームの背景（Blender で描いた日本）の出典 */
export const DESK_JAPAN_ATTRIBUTION = `背景の日本：<a href="${ICHIRAN}" target="_blank" rel="noreferrer">地理院タイル</a>（全国ランドサットモザイク画像・世界衛星モザイク画像）と AWS Terrain Tiles（ETOPO1（NOAA）・SRTM・GMTED2010（USGS）など）を加工して作成（Blender）`;

const ESTAT = "https://www.e-stat.go.jp/";
const GHS_POP = "https://doi.org/10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE";
const CC_BY = "https://creativecommons.org/licenses/by/4.0/deed.ja";
/**
 * 夜の街の明かり（夕・夜の絵）の出典（scripts/pc-opening の night_lights.py・ghsl.py）。国勢調査は e-Stat の利用規約どおり出典と
 * 加工したことを、その範囲の外（日本のまわりの国など）の GHSL の人口は、CC BY 4.0（配布元の copyright.txt）どおり作った所・
 * 著作権の表示・ライセンスへのリンクと加工したことを書く。2026-11-21 に原文で確かめた
 */
export const NIGHT_LIGHTS_ATTRIBUTION =
  `夜の街の明かり：政府統計の総合窓口（e-Stat）（<a href="${ESTAT}" target="_blank" rel="noreferrer">https://www.e-stat.go.jp/</a>）の「令和2年国勢調査に関する地域メッシュ統計」（総務省）の500mメッシュの人口と、` +
  `国勢調査の範囲の外（日本のまわりの国など）は欧州委員会 共同研究センター（JRC）の「<a href="${GHS_POP}" target="_blank" rel="noreferrer">GHS-POP R2023A</a>」` +
  `（© European Union, 1995-2026、<a href="${CC_BY}" target="_blank" rel="noreferrer">CC BY 4.0</a>）の2020年の人口を加工して作成`;

const PHOTO = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg";
const GOLD = "#c9a15a";
const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** ホームの背景・検索の途中の写真・着いた所の輪を、背景の地図のすぐ上（重ねるものの下）に足す */
const BASES = new WeakMap<MapLibreMap, string[]>();

export function addDeskCinema(map: MapLibreMap, baseIds: string[], tod: DeskTod = "day"): void {
  if (map.getSource("flight-photo")) return;
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
  // ホームの背景：いまの時間帯の絵だけを読む（ほかの時間帯の絵は、その時間帯になったときに読む）
  const first = homeImage(tod);
  addHome(map, first.key, before, 1);
  const run: HomeRun = { shown: first.key, want: first.key, motion: !reduceMotion(), dead: false };
  HOMES.set(map, run);
  map.once("remove", () => {
    run.dead = true;
    run.stop?.();
  });
  // 背景の日本の出典（画像の重ねものには出典を付けられないので、空の入れ物に付ける。絵が見える高さだけ使い、出典の欄に出す）
  map.addSource("desk-credit", { type: "geojson", data: EMPTY, attribution: DESK_JAPAN_ATTRIBUTION });
  map.addLayer({ id: "desk-credit", type: "circle", source: "desk-credit", maxzoom: HOME_MAX_ZOOM, paint: { "circle-radius": 0 } });
  // 夜の街の明かりの出典（明かりの入った絵（夕・夜）が見えている間だけ）
  map.addSource("desk-credit-lights", { type: "geojson", data: EMPTY, attribution: NIGHT_LIGHTS_ATTRIBUTION });
  map.addLayer({
    id: "desk-credit-lights",
    type: "circle",
    source: "desk-credit-lights",
    maxzoom: HOME_MAX_ZOOM,
    layout: { visibility: first.lights ? "visible" : "none" },
    paint: { "circle-radius": 0 },
  });
  // 着いた所の光の輪
  map.addSource("arrive", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "arrive-ring",
    type: "circle",
    source: "arrive",
    paint: { "circle-radius": 0, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": GOLD, "circle-stroke-width": 2, "circle-stroke-opacity": 0 },
  });
}

// ---- ホームの背景の時間帯

/** 背景の絵が消える高さ（ズーム）。7.4 より寄ると薄くなる */
const HOME_MAX_ZOOM = 8.8;
/** 絵の濃さ（k は溶かす途中の割合。寄ると薄くなるのは同じ） */
const homeOpacity = (k: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 7.4, k, HOME_MAX_ZOOM, 0];
const homeId = (key: HomeImageKey) => `desk-japan-${key}`;

/** 溶かして替える様子（desk-home.ts の HomeFade）と、出したい絵・溶かすか・読み込みをやめる関数・外している途中の下の絵 */
type HomeRun = HomeFade & { want: HomeImageKey; motion: boolean; dead: boolean; stop?: () => void; removing?: HomeImageKey };
const HOMES = new WeakMap<MapLibreMap, HomeRun>();

function addHome(map: MapLibreMap, key: HomeImageKey, before: string | undefined, opacity: number): void {
  const id = homeId(key);
  map.addSource(id, { type: "image", url: homeImageByKey(key).url, coordinates: HOME_CORNERS });
  // 濃さは溶かす動き（下の loadHome）でコマごとに決めるので、地図の決まりの 0.3 秒の移り変わりは付けない
  map.addLayer(
    {
      id,
      type: "raster",
      source: id,
      maxzoom: HOME_MAX_ZOOM,
      paint: { "raster-opacity": homeOpacity(opacity), "raster-opacity-transition": { duration: 0, delay: 0 }, "raster-fade-duration": 0 },
    },
    before,
  );
}

function removeHome(map: MapLibreMap, key: HomeImageKey): void {
  const id = homeId(key);
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
}

function showLightsCredit(map: MapLibreMap, run: HomeRun): void {
  if (map.getLayer("desk-credit-lights")) map.setLayoutProperty("desk-credit-lights", "visibility", homeLightsCredit(run) ? "visible" : "none");
}

/**
 * ホームの背景を、時間帯（上の帯の朝・昼・夕・夜）の絵にする。新しい絵はこのときに初めて読み、届いて GPU に載ったら、今の絵の
 * 上で約 1.2 秒で溶かして替える。motion が false（動きを減らす設定）なら、届いたらすぐ替える。寄っていて背景が見えない間も、すぐ替える
 */
export function setDeskTod(map: MapLibreMap, tod: DeskTod, motion: boolean): void {
  const run = HOMES.get(map);
  if (!run || run.dead) return;
  run.want = HOME_IMAGE_OF[tod];
  run.motion = motion && !reduceMotion();
  pumpHome(map, run);
}

function pumpHome(map: MapLibreMap, run: HomeRun): void {
  // 下の絵を外し終えるまでは次へ進まない（外し終えたら、もう一度ここへ来る）
  if (run.dead || run.removing) return;
  for (;;) {
    const step = nextHomeStep(run, run.want);
    if (step === "cancel" && run.incoming) {
      run.stop?.();
      removeHome(map, run.incoming.key);
      run.incoming = run.stop = undefined;
      continue;
    }
    if (typeof step === "object") loadHome(map, run, step.load);
    return;
  }
}

function loadHome(map: MapLibreMap, run: HomeRun, key: HomeImageKey): void {
  const id = homeId(key);
  // 今の絵のすぐ上に、透明で重ねて読む
  const order = map.getLayersOrder();
  addHome(map, key, order[order.indexOf(homeId(run.shown)) + 1], 0);
  run.incoming = { key, fading: false };
  let timer = 0;
  let frame = 0;
  const current = () => !run.dead && run.incoming?.key === key;
  const onData = (e: MapSourceDataEvent) => {
    if (e.sourceId !== id || !current() || run.incoming?.fading) return;
    if (e.sourceDataType === "metadata") {
      // 絵が届いた。寄っていて背景が見えなければすぐ替える。見えていれば GPU に載る（idle）のを待つ（念のため 1.5 秒まで）
      if (map.getZoom() >= HOME_MAX_ZOOM) fade(0);
      else timer = window.setTimeout(() => fade(homeFadeMs(run.motion)), 1500);
    } else if (e.sourceDataType === "idle") fade(homeFadeMs(run.motion));
  };
  // 読めなかったら、今の絵のまま（次に時間帯が変わったときに、また読む）
  const onError = (e: { error?: unknown; sourceId?: string }) => {
    if (e.sourceId !== id || !current() || run.incoming?.fading) return;
    run.stop?.();
    removeHome(map, key);
    run.incoming = run.stop = undefined;
    run.want = run.shown;
  };
  const stop = () => {
    map.off("sourcedata", onData);
    map.off("error", onError);
    clearTimeout(timer);
    cancelAnimationFrame(frame);
  };
  const fade = (ms: number) => {
    if (!current() || run.incoming?.fading) return;
    map.off("sourcedata", onData);
    map.off("error", onError);
    clearTimeout(timer);
    run.incoming = { key, fading: true };
    showLightsCredit(map, run);
    let t0 = 0;
    // 地図を描いている途中（GPU に載った知らせの中）では変えず、次のコマから動かす
    const step = (now: number) => {
      if (!current() || !map.getLayer(id)) return;
      t0 ||= now;
      const u = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      map.setPaintProperty(id, "raster-opacity", homeOpacity(smooth(u)));
      if (u < 1) {
        frame = requestAnimationFrame(step);
        return;
      }
      // 溶かし終えた。下の絵は、新しい絵がすっかり描かれたあとで外す（同じコマで外すと、一瞬だけ下の地図が見える）。
      // 外すと GPU の分も空く。まだ別の時間帯を待っていれば、続けて替える
      const old = run.shown;
      run.shown = key;
      run.incoming = run.stop = undefined;
      run.removing = old;
      showLightsCredit(map, run);
      map.once("render", () => {
        run.removing = undefined;
        if (run.dead) return;
        removeHome(map, old);
        pumpHome(map, run);
      });
    };
    frame = requestAnimationFrame(step);
  };
  run.stop = stop;
  map.on("sourcedata", onData);
  map.on("error", onError);
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
  // 空気の層の雲を通り抜ける（雲が手前へ大きくなりながら流れて消える。lib/app/desk-air-layer.ts）
  deskAirPass(map);
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
