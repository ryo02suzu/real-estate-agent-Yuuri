// 太陽の計算（天体の部分）。時間連動ヘッダー（components/app/sky.tsx）の土台。
// 東京駅を基準地点にして、今の日時から太陽の高度・方位・日の出入りを出す（SunCalc 2。角度は度、方位は北0°の時計回り、
// 高度は大気差込み。日の出入りは utcOffset=540 で「日本の暦の日」で切る）。
// 天体の位置は演出の都合で変えない。空の色・街の写真の混ぜ方（blend・light）は見た目の調整で、ここで一元管理する。
// 太陽本体を画面のどこに描くか（projectSun）は、写真のカメラの向き・画角が設定されるまで null（描かない）
import * as SunCalc from "suncalc";

/** 基準地点（東京駅）。全ページで同じ地点を使う。将来は設定で変えられるようにする */
export const BASE = { lat: 35.6812, lng: 139.7671, utcOffset: 540 } as const;
export type Base = { lat: number; lng: number; utcOffset: number };

export type SunTimes = {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** 市民薄明の始まり・終わり（−6°） */
  dawn: Date | null;
  dusk: Date | null;
  /** 天文薄明の終わり・始まり（−18°） */
  nightEnd: Date | null;
  night: Date | null;
  /** ゴールデンアワー（6°） */
  goldenHourEnd: Date | null;
  goldenHour: Date | null;
};

export type Solar = {
  at: Date;
  /** 高度（度。地平線 0、天頂 90。大気差込み） */
  altitude: number;
  /** 方位（度。北 0、東 90、南 180、西 270） */
  azimuth: number;
  /** 高度が上がっている（朝）か */
  rising: boolean;
  times: SunTimes;
};

/** 今の日時の太陽 */
export function solar(at: Date, base: Base = BASE): Solar {
  const p = SunCalc.getPosition(at, base.lat, base.lng);
  const next = SunCalc.getPosition(new Date(at.getTime() + 60_000), base.lat, base.lng);
  const t = SunCalc.getTimes(at, base.lat, base.lng, 0, base.utcOffset);
  const d = (v: Date | boolean | null | undefined) => (v instanceof Date ? v : null);
  return {
    at,
    altitude: p.altitude,
    azimuth: p.azimuth,
    rising: next.altitude > p.altitude,
    times: {
      sunrise: d(t.sunrise),
      sunset: d(t.sunset),
      solarNoon: t.solarNoon,
      dawn: d(t.dawn),
      dusk: d(t.dusk),
      nightEnd: d(t.nightEnd),
      night: d(t.night),
      goldenHourEnd: d(t.goldenHourEnd),
      goldenHour: d(t.goldenHour),
    },
  };
}

/** 0→1 に滑らかに（境界で急に変わらないように） */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 街の写真4枚の混ぜ方（合計 1）。昼・夕方・薄暮・夜 */
export type Blend = { day: number; golden: number; twilight: number; dawn: number; night: number };

/**
 * 太陽の高度と「昇っているか」から、写真の混ぜ方を決める（時刻では決めない）。
 * 夕方（沈む）：+10°以上 昼 → 0° 夕方 → −6° 薄暮 → −12° 夜。
 * 朝（昇る）：−6°以下 夜 → 0° 夜明け（dawn：薄暮の空に、光の消えた街） → +10° 昼。
 * 夕方の絵（街に明かりが点いている薄暮・夕焼け）は夜明けには使わない（朝と夕方で同じ高度でも色が違う）
 */
export function blend(altitude: number, rising: boolean): Blend {
  const b: Blend = { day: 0, golden: 0, twilight: 0, dawn: 0, night: 0 };
  if (!rising) {
    if (altitude >= 0) {
      b.day = smoothstep(0, 10, altitude);
      b.golden = 1 - b.day;
    } else if (altitude >= -6) {
      b.golden = smoothstep(-6, 0, altitude);
      b.twilight = 1 - b.golden;
    } else {
      b.twilight = smoothstep(-12, -6, altitude);
      b.night = 1 - b.twilight;
    }
  } else if (altitude >= 0) {
    b.day = smoothstep(0, 10, altitude);
    b.dawn = 1 - b.day;
  } else if (altitude >= -6) {
    b.dawn = smoothstep(-6, 0, altitude);
    b.night = 1 - b.dawn;
  } else {
    b.night = 1;
  }
  return b;
}

/** 写真の重ね順（下から上）。components/app/sky.tsx はこの順に重ねる */
export const PHOTO_ORDER = ["night", "twilight", "dawn", "golden", "day"] as const;

/**
 * 重ねた写真それぞれの不透明度。混ぜ方（合計 1）をそのまま不透明度にすると、重なった所で下の地が透けて薄くなるので、
 * 下から k 枚目は「k 枚目までの重みの合計に対する自分の重み」にする（下の1枚は 1）。こうすると合成の色が重みどおりの混色になる
 */
export function layerOpacity(b: Blend): Record<keyof Blend, number> {
  const out = { day: 0, golden: 0, twilight: 0, dawn: 0, night: 0 };
  let sum = 0;
  for (const k of PHOTO_ORDER) {
    sum += b[k];
    out[k] = sum > 0 ? b[k] / sum : 0;
  }
  return out;
}

export type RGB = [number, number, number];
/** 写真の上端（時刻・電池の帯につなぐ）の色。届いた4枚の帯の切り抜き（public/home/sky）の上端を測った値 */
export const SKY_TOP: Record<keyof Blend, RGB> = {
  day: [123, 185, 232],
  golden: [150, 154, 183],
  twilight: [116, 116, 153],
  dawn: [116, 116, 153],
  night: [24, 38, 79],
};
/** 空の中ほど（見出しの後ろ）と地平線の近くの色。各ページの帯のグラデーションに使う */
export const SKY_MID: Record<keyof Blend, RGB> = {
  day: [176, 215, 239],
  golden: [212, 170, 162],
  twilight: [173, 135, 151],
  dawn: [173, 135, 151],
  night: [41, 50, 91],
};
export const SKY_HORIZON: Record<keyof Blend, RGB> = {
  day: [191, 204, 218],
  golden: [202, 160, 137],
  twilight: [174, 128, 132],
  dawn: [175, 130, 137],
  night: [67, 65, 90],
};

const mix = (cols: Record<keyof Blend, RGB>, b: Blend): RGB => {
  const out: RGB = [0, 0, 0];
  for (const k of Object.keys(b) as (keyof Blend)[]) for (let i = 0; i < 3; i++) out[i] += cols[k][i] * b[k];
  return out;
};
const hex = (c: RGB) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
/** 相対輝度（0〜1） */
const luminance = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/** コードで描く光の指示（空のグロー・ガラスのハイライト・文字の色） */
export type Light = {
  /** 写真の上端の色（時刻・電池の帯をこの色に） */
  top: string;
  /** 空の中ほどと地平線の近くの色（各ページの帯のグラデーション） */
  mid: string;
  horizon: string;
  /** 地平線の光（色と強さ 0〜1）。空のマスクの中にだけ乗せる */
  glow: { color: string; strength: number };
  /** ガラスのカードの縁のハイライトの色 */
  highlight: string;
  /** 空が暗く、ロゴ・見出しを白にするか */
  dark: boolean;
  /** 夜らしさ 0〜1（下のぼかしの色などに使う） */
  nightness: number;
};

/**
 * 光の差す向き（画面の左 0 〜 右 100）。東（方位 60°）から昇って西（300°）に沈む太陽を、画面の左から右へ当てはめる
 * （書類・出力の帯の差し込む光などに使う。写真の中の位置ではない）
 */
export function lightX(azimuth: number): number {
  return Math.round(Math.min(100, Math.max(0, ((azimuth - 60) / 240) * 100)));
}

export function light(altitude: number, rising: boolean, b: Blend = blend(altitude, rising), colors?: { top: RGB; mid: RGB; horizon: RGB }): Light {
  // 空の色は、大気の式（lib/app/atmosphere.ts）から渡されればそれ。無ければ写真の帯を測った値を混ぜる
  const top = colors?.top ?? mix(SKY_TOP, b);
  const mid = colors?.mid ?? mix(SKY_MID, b);
  const horizon = colors?.horizon ?? mix(SKY_HORIZON, b);
  // 地平線の光：太陽が地平線の近く（−8°〜+6°）で強い。朝は桃色、夕方は橙
  const near = Math.exp(-((altitude + 1) * (altitude + 1)) / (2 * 4.5 * 4.5));
  const glowColor: RGB = rising ? [255, 214, 170] : [255, 178, 120];
  // ガラスの縁：昼は白、夕方・朝は金、夜は青み
  const warm = altitude < 8 && altitude > -8 ? smoothstep(8, 0, altitude) * (1 - smoothstep(-2, -8, altitude)) : 0;
  const nightness = b.night + 0.5 * (b.twilight + b.dawn);
  const white: RGB = [255, 255, 255];
  const gold: RGB = [255, 222, 160];
  const blue: RGB = [190, 208, 245];
  const hl: RGB = [0, 1, 2].map((i) => white[i] * (1 - warm) * (1 - nightness) + gold[i] * warm * (1 - nightness) + blue[i] * nightness) as RGB;
  return {
    top: hex(top),
    mid: hex(mid),
    horizon: hex(horizon),
    glow: { color: hex(glowColor), strength: Math.round(near * 100) / 100 },
    highlight: hex(hl),
    dark: luminance(top) < 0.42,
    nightness: Math.round(nightness * 100) / 100,
  };
}

/** 写真のカメラ（撮影の向き・画角・地平線の位置）。設定するまで太陽本体は描かない（README の指示のとおり） */
export type Camera = {
  /** 方位・画角を実際に測って入れたら true。生成画像は撮影方位が不明なので最初は false */
  calibrated: boolean;
  /** カメラが向いている方位（度。北 0） */
  bearing: number;
  /** 水平画角（度） */
  hfov: number;
  /** 画像の中の地平線の位置（上から 0〜1） */
  horizon: number;
  /** 幅 ÷ 高さ */
  aspect: number;
};

/**
 * ホームの帯のカメラ。地平線は上から 55%（帯の切り抜きで決めた）。向きは西（方位 262°。生成画像なので実測の向きは無く、
 * 一年を通して夕日が画面の中に沈むように決めた。6月の日の入（方位 300°）だけ右の端のすぐ外）。画角は 62°
 */
export const HOME_CAMERA: Camera = { calibrated: true, bearing: 262, hfov: 62, horizon: 0.55, aspect: 393 / 275 };

const R = Math.PI / 180;

/**
 * 太陽を画面のどこに描くか（直線投影。0〜1 の割合）。カメラが未設定なら null。
 * カメラの後ろにあるときも null。画角の外は inside=false（本体は描かず、光だけ）
 */
export function projectSun(sun: { altitude: number; azimuth: number }, cam: Camera): { x: number; y: number; inside: boolean } | null {
  if (!cam.calibrated) return null;
  const tanH = Math.tan((cam.hfov / 2) * R);
  const tanV = tanH / cam.aspect;
  // 地平線を上から horizon の位置に置くための上向きの傾き
  const pitch = Math.atan((2 * cam.horizon - 1) * tanV);
  const y0 = cam.bearing * R;
  const alt = sun.altitude * R;
  const az = sun.azimuth * R;
  const d = [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
  const f = [Math.sin(y0) * Math.cos(pitch), Math.cos(y0) * Math.cos(pitch), Math.sin(pitch)];
  const r = [Math.cos(y0), -Math.sin(y0), 0];
  const u = [-Math.sin(y0) * Math.sin(pitch), -Math.cos(y0) * Math.sin(pitch), Math.cos(pitch)];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = dot(d, f);
  if (z <= 0) return null;
  const sx = dot(d, r) / z / tanH;
  const sy = dot(d, u) / z / tanV;
  return { x: (sx + 1) / 2, y: (1 - sy) / 2, inside: Math.abs(sx) <= 1 && Math.abs(sy) <= 1 };
}

/**
 * プレビュー用の日時の固定（URL の #t=2026-06-21T18:30。時差が無ければ日本時間）。無ければ null。
 * 本番でも使えるが、表示が変わるだけで保存や通信には使わない
 */
export function overrideTime(hash: string): Date | null {
  const m = hash.replace(/^#/, "").match(/(?:^|&)t=([^&]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}${v.length <= 10 ? "T12:00" : ""}+09:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 日本時間の「時:分」 */
export function jstTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}
