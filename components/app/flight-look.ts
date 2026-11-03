// 「地球から土地へ降りる」演出（components/app/globe-flight.tsx）の見た目：時間帯ごとの色（宇宙の地球・航空写真・空・雲）、
// 地図の作り（NASA の昼の地球／夜の街明かり・国土地理院の航空写真と標高・山の陰影）、国土地理院の標高タイルを地図の部品が読める形に
// 直す計算、雲の模様。どれも画面の外の計算だけで、地図の部品（MapLibre）にはつながない（演出の部品が使う）。
// 読むのは公開の絵だけ（NASA GIBS・国土地理院）。住所はどこにも送らない
import type { StyleSpecification } from "maplibre-gl";
import { homePart, overrideTime, solar } from "@/lib/app/sun";

/** 演出の時間帯（ホームの写真と同じ分け方。lib/app/sun.ts の homePart） */
export type FlightMood = "morning" | "day" | "evening" | "dusk" | "night";

/** いまの時間帯（ホームの写真と同じ分け方。URL の #t= で時刻を決めたときはその時刻） */
export function flightMood(at?: Date): FlightMood {
  const when = at ?? (typeof location !== "undefined" ? overrideTime(location.hash) : null) ?? new Date();
  const s = solar(when);
  return homePart(s.altitude, s.rising);
}

/** NASA GIBS：昼の地球（地形と海底の陰影つき）と、夜の街明かり（2012年の VIIRS）。どちらもズーム 8 まで */
export const NASA_DAY = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
export const NASA_NIGHT = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
/** 国土地理院：全国最新写真（シームレス）と標高タイル（PNG。ズーム 14 まで） */
export const GSI_PHOTO = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg";
export const GSI_DEM = "https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png";
/** 国土地理院の最適化ベクトルタイル（道路の中心線。夜は街灯の光の筋として描く） */
export const GSI_VECTOR = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf";
/** 標高タイルを読み替える呼び名（maplibre の addProtocol。gsidem://… → https://…） */
export const DEM_PROTOCOL = "gsidem";

type Look = {
  /** 夜の街明かりの濃さ（0 は昼の地球だけ） */
  lights: number;
  /** 昼の地球の色の整え方 */
  earth: { brightness: number; saturation: number; contrast: number; hue: number };
  /** 近づいたとき、写真の届かない遠く（地平線の近く）に残る地球の絵を、霞のように明るく淡くする量（0〜1） */
  far: number;
  /** 航空写真の色の整え方 */
  photo: { brightness: number; saturation: number; contrast: number; hue: number };
  /** 全体に薄くかける色（夕日の色・夜の青） */
  tint: { color: string; opacity: number };
  /** 斜めに見たときの空と霞 */
  sky: { sky: string; horizon: string; fog: string };
  /** 山の陰影（光の向きは方位。影と光の色） */
  shade: { dir: number; shadow: string; highlight: string; accent: string; strength: number };
  /** 雲の明るい所・影の所の色と濃さ */
  cloud: { light: [number, number, number]; shade: [number, number, number]; alpha: number };
};

export const LOOKS: Record<FlightMood, Look> = {
  morning: {
    lights: 0,
    earth: { brightness: 0.96, saturation: 0.05, contrast: 0.05, hue: 0 },
    far: 0.36,
    photo: { brightness: 0.98, saturation: 0.02, contrast: 0.06, hue: 0 },
    tint: { color: "#ffc896", opacity: 0.1 },
    sky: { sky: "#6d93cc", horizon: "#ffd6b0", fog: "#f3dccb" },
    shade: { dir: 110, shadow: "#3b3350", highlight: "rgba(255,241,220,0.35)", accent: "rgba(90,74,106,0.4)", strength: 0.22 },
    cloud: { light: [255, 244, 232], shade: [176, 166, 190], alpha: 0.92 },
  },
  day: {
    lights: 0,
    earth: { brightness: 1, saturation: 0.12, contrast: 0.08, hue: 0 },
    far: 0.4,
    photo: { brightness: 1, saturation: 0.08, contrast: 0.1, hue: 0 },
    tint: { color: "#ffffff", opacity: 0 },
    sky: { sky: "#4c86d4", horizon: "#cfe3f6", fog: "#dde8f3" },
    shade: { dir: 200, shadow: "#2c3a55", highlight: "rgba(255,255,255,0.3)", accent: "rgba(65,80,106,0.4)", strength: 0.2 },
    cloud: { light: [255, 255, 255], shade: [190, 202, 218], alpha: 0.95 },
  },
  evening: {
    lights: 0.12,
    earth: { brightness: 0.9, saturation: 0.1, contrast: 0.1, hue: -6 },
    far: 0.3,
    photo: { brightness: 0.88, saturation: 0, contrast: 0.12, hue: -4 },
    tint: { color: "#ff9a52", opacity: 0.17 },
    sky: { sky: "#3a4c84", horizon: "#ffab6a", fog: "#f0b48e" },
    shade: { dir: 250, shadow: "#3a2440", highlight: "rgba(255,210,160,0.45)", accent: "rgba(93,58,74,0.4)", strength: 0.28 },
    cloud: { light: [255, 214, 178], shade: [176, 128, 140], alpha: 0.92 },
  },
  dusk: {
    lights: 0.82,
    earth: { brightness: 0.5, saturation: -0.1, contrast: 0.05, hue: 0 },
    far: 0.12,
    photo: { brightness: 0.42, saturation: -0.3, contrast: 0.1, hue: 0 },
    tint: { color: "#33478f", opacity: 0.22 },
    sky: { sky: "#1c2953", horizon: "#d8877a", fog: "#7d6c93" },
    shade: { dir: 260, shadow: "#141a33", highlight: "rgba(201,168,200,0.3)", accent: "rgba(42,40,80,0.4)", strength: 0.24 },
    cloud: { light: [190, 170, 205], shade: [86, 84, 124], alpha: 0.7 },
  },
  night: {
    lights: 1,
    earth: { brightness: 0.25, saturation: -0.2, contrast: 0, hue: 0 },
    far: 0,
    photo: { brightness: 0.22, saturation: -0.5, contrast: 0.1, hue: 0 },
    tint: { color: "#0b1a40", opacity: 0.3 },
    sky: { sky: "#050b1c", horizon: "#1c2c52", fog: "#101d38" },
    shade: { dir: 150, shadow: "#03060f", highlight: "rgba(74,90,132,0.3)", accent: "rgba(10,16,36,0.4)", strength: 0.22 },
    cloud: { light: [96, 110, 140], shade: [30, 38, 58], alpha: 0.55 },
  },
};

/** 地図の作り。terrain：山を立体にする（標高の部品を入れる） */
export function flightStyle(mood: FlightMood, opts: { terrain: boolean }): StyleSpecification {
  const L = LOOKS[mood];
  const rasterPaint = (c: Look["earth"]) => ({
    "raster-brightness-max": c.brightness,
    "raster-saturation": c.saturation,
    "raster-contrast": c.contrast,
    "raster-hue-rotate": c.hue,
  });
  const style: StyleSpecification = {
    version: 8,
    projection: { type: "globe" },
    sources: {
      earth: { type: "raster", tiles: [NASA_DAY], tileSize: 256, maxzoom: 8 },
      lights: { type: "raster", tiles: [NASA_NIGHT], tileSize: 256, maxzoom: 8 },
      photo: { type: "raster", tiles: [GSI_PHOTO], tileSize: 256, minzoom: 8, maxzoom: 18 },
      shade: { type: "raster-dem", tiles: [`${DEM_PROTOCOL}://${GSI_DEM.replace(/^https:\/\//, "")}`], tileSize: 256, maxzoom: 14, encoding: "terrarium" },
      town: { type: "vector", tiles: [GSI_VECTOR], minzoom: 8, maxzoom: 16 },
      world: {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } },
      },
    },
    layers: [
      {
        id: "earth",
        type: "raster",
        source: "earth",
        paint: {
          ...rasterPaint(L.earth),
          // 宇宙から見る間はそのまま。近づいたら、写真の届かない遠く（地平線の近く）が霞んで見えるよう、明るく淡くする
          "raster-brightness-min": ["interpolate", ["linear"], ["zoom"], 7, 0, 9, L.far] as unknown as number,
          "raster-saturation": ["interpolate", ["linear"], ["zoom"], 7, L.earth.saturation, 9, -0.55] as unknown as number,
          "raster-contrast": ["interpolate", ["linear"], ["zoom"], 7, L.earth.contrast, 9, -0.3] as unknown as number,
          "raster-fade-duration": 250,
        },
      },
      // 夜の街明かり：遠くでは地球をおおい、写真に替わるところ（ズーム 9〜13）では光のにじみとして残してから消える（夜の地面は暗いので、
      // 明かりの絵を濃いめに重ねても街の明かりが浮かぶ）
      ...(L.lights > 0
        ? [
            {
              id: "lights",
              type: "raster" as const,
              source: "lights",
              paint: {
                "raster-opacity": ["interpolate", ["linear"], ["zoom"], 8, L.lights, 9.3, L.lights * 0.82, 11.5, L.lights * 0.45, 13.5, 0] as unknown as number,
                "raster-contrast": 0.22,
                "raster-saturation": 0.15,
                "raster-fade-duration": 250,
                "raster-resampling": "linear" as const,
              },
            },
          ]
        : []),
      {
        id: "photo",
        type: "raster",
        source: "photo",
        minzoom: 8,
        paint: { ...rasterPaint(L.photo), "raster-opacity": ["interpolate", ["linear"], ["zoom"], 8.2, 0, 9.3, 1], "raster-fade-duration": 200 },
      },
      // 夜は写真の上にも街明かりのにじみを薄く重ねる（NASA の絵は粗いので濃くすると街が大きなしみになる。街の光は道路の光で出す）
      ...(L.lights > 0.5
        ? [
            {
              id: "glow",
              type: "raster" as const,
              source: "lights",
              minzoom: 9,
              paint: {
                "raster-opacity": ["interpolate", ["linear"], ["zoom"], 8.5, 0, 9.4, 0.18 * L.lights, 11.5, 0.14 * L.lights, 13.5, 0.06 * L.lights, 14.8, 0] as unknown as number,
                "raster-resampling": "linear" as const,
                "raster-fade-duration": 200,
              },
            },
          ]
        : []),
      // 山の陰影（関東に降りていく間だけ。写真の上に光と影を足して、山並みを立体に見せる）
      {
        id: "shade",
        type: "hillshade",
        source: "shade",
        minzoom: 6,
        maxzoom: 15,
        paint: {
          "hillshade-illumination-direction": L.shade.dir,
          "hillshade-shadow-color": L.shade.shadow,
          "hillshade-highlight-color": L.shade.highlight,
          "hillshade-accent-color": L.shade.accent,
          "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 6, 0, 7.5, L.shade.strength, 11, L.shade.strength * 0.7, 13.5, 0] as unknown as number,
        },
      },
      // 夜・日の暮れたあと：道路に沿った街灯の光（ぼかした太い筋と、細い明るい筋）。ズーム 8〜10 の道路は国道・県道・高速などの太い道だけ
      // なので、山並みの上からは光の網に、土地に近づくと細い道まで光る
      ...(L.lights > 0.5
        ? [
            {
              id: "road-glow",
              type: "line" as const,
              source: "town",
              "source-layer": "RdCL",
              minzoom: 8,
              layout: { "line-cap": "round" as const, "line-join": "round" as const },
              paint: {
                "line-color": "#ff9f45",
                "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 8, 2, 10, 3.4, 13, 6, 15, 8.5, 17, 14] as unknown as number,
                "line-blur": ["interpolate", ["linear"], ["zoom"], 8, 1, 17, 10] as unknown as number,
                "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 8.8, 0.5 * L.lights, 12, 0.55 * L.lights, 16, 0.38 * L.lights] as unknown as number,
              },
            },
            {
              id: "road-light",
              type: "line" as const,
              source: "town",
              "source-layer": "RdCL",
              minzoom: 8,
              layout: { "line-cap": "round" as const, "line-join": "round" as const },
              paint: {
                "line-color": "#ffd894",
                "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 8, 0.55, 10, 0.8, 13, 1.3, 15, 2, 17, 3.4] as unknown as number,
                "line-blur": 0.6,
                "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 8.8, 0.9 * L.lights, 12, 0.95 * L.lights, 16, 0.72 * L.lights] as unknown as number,
              },
            },
          ]
        : []),
      // 時間帯の色（宇宙から見た地球にはかけず、近づいてからかける）
      ...(L.tint.opacity > 0
        ? [
            {
              id: "tint",
              type: "fill" as const,
              source: "world",
              paint: { "fill-color": L.tint.color, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0, 6.5, L.tint.opacity] as unknown as number, "fill-antialias": false },
            },
          ]
        : []),
    ],
    sky: {
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0],
      "sky-color": L.sky.sky,
      "horizon-color": L.sky.horizon,
      "fog-color": L.sky.fog,
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.08,
    },
  };
  if (opts.terrain) {
    style.sources.dem = { type: "raster-dem", tiles: [`${DEM_PROTOCOL}://${GSI_DEM.replace(/^https:\/\//, "")}`], tileSize: 256, maxzoom: 14, encoding: "terrarium" };
  }
  return style;
}

/**
 * 国土地理院の標高タイル（PNG）を、地図の部品が読める形（terrarium）に直す。rgba は 4 バイトずつの画素（そのまま書き換える）。
 * 国土地理院の値：x = R×65536 + G×256 + B。x が 2^23 なら値なし（海など。0m とする）、2^23 より大きければ負の高さ（x − 2^24）×0.01m、
 * それ以外は x×0.01m。terrarium：高さ + 32768 = R×256 + G + B/256
 */
export function gsiToTerrarium(rgba: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const x = rgba[i] * 65536 + rgba[i + 1] * 256 + rgba[i + 2];
    const h = x === 8388608 || rgba[i + 3] === 0 ? 0 : x > 8388608 ? (x - 16777216) * 0.01 : x * 0.01;
    const v = Math.min(65535.99, Math.max(0, h + 32768));
    const r = Math.floor(v / 256);
    const g = Math.floor(v) % 256;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = Math.floor((v - Math.floor(v)) * 256);
    rgba[i + 3] = 255;
  }
}

/** terrarium の値から高さ（m）。テストと確かめ用 */
export const terrariumHeight = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

/** 山の立体の強さ（ズームで変える。遠くでは強めにして山並みを見せ、土地の近くでは本物の高さに戻す） */
export function terrainExaggeration(zoom: number): number {
  if (zoom <= 9) return 1.9;
  if (zoom >= 14.5) return 1;
  return 1.9 - ((zoom - 9) / 5.5) * 0.9;
}

/**
 * 雲の模様（size × size。0〜1 の濃さ）。決まった種から作るので毎回同じ形。ふんわりした塊になるよう、値の高い所だけを残して
 * なめらかにつなぐ。端は左右・上下でつながる（並べて敷いても継ぎ目が出ない）
 */
export function cloudField(size: number, seed = 11): Float32Array {
  // 格子の上の乱数（周期 = 格子の数。端がつながる）
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const octave = (cells: number) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return (x: number, y: number) => {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const layers = [4, 8, 16, 32, 64].map((c) => octave(c));
  const weights = [0.5, 0.25, 0.13, 0.07, 0.05];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (let k = 0; k < layers.length; k++) v += layers[k](x, y) * weights[k];
      // 0.5 より上を雲にして、ふちはなめらかに
      const t = Math.min(1, Math.max(0, (v - 0.5) / 0.22));
      out[y * size + x] = t * t * (3 - 2 * t);
    }
  return out;
}

/**
 * 地平線の霞（斜めに見下ろしている間だけ、画面の上の方に重ねる色の帯。CSS の背景）。地図の部品の霞は地球儀の表示では効かないので、
 * 遠くの山並みと地平線の境を、時間帯の霞の色でやわらげる。帯は画面の高さの 40%、いちばん濃い所は画面の上から約 12%（地平線のあたり）
 */
export function hazeBackground(mood: FlightMood): string {
  const hex = LOOKS[mood].sky.fog.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const c = (a: number) => `rgba(${r},${g},${b},${a})`;
  return `linear-gradient(to bottom, ${c(0)} 0%, ${c(0.45)} 18%, ${c(0.6)} 30%, ${c(0.28)} 50%, ${c(0.08)} 75%, ${c(0)} 100%)`;
}
