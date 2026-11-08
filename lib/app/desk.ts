// PC の「調査デスク」（components/desktop-shell.tsx）の、画面を持たない部分：設定（見た目・時間帯・地図の初期の寄り）の保存、
// 時間帯（朝・昼・夕・夜）から 3D の光を決める式、Google の実写 3D のセッション（1 回のルートの要求で 3 時間まで）の扱いと、
// 断られたときの一言。設定は端末の localStorage にだけ置く（住所は入れない）
import { histPart, type DayPart } from "./sun";

/** 板の色：端末に合わせる・明るい・暗い */
export type DeskTheme = "auto" | "light" | "dark";
/** 3D の光の時間帯 */
export type DeskTod = "morning" | "day" | "evening" | "night";
/** 時間帯の決め方：時計（物件の地点の太陽）か、上の帯で選んだもの */
export type DeskTodMode = "clock" | "manual";
/** 3D を開いたときの距離 */
export type DeskZoom = "near" | "mid" | "far";

export type DeskPrefs = { theme: DeskTheme; todMode: DeskTodMode; tod: DeskTod; zoom: DeskZoom };

export const DEFAULT_PREFS: DeskPrefs = { theme: "auto", todMode: "clock", tod: "day", zoom: "mid" };

export const TOD_LABEL: Record<DeskTod, string> = { morning: "朝", day: "昼", evening: "夕", night: "夜" };
export const TODS: DeskTod[] = ["morning", "day", "evening", "night"];

const KEY = "michilu:desk";

const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d);

/** 保存した設定（壊れた値・知らない値は既定に戻す） */
export function parsePrefs(raw: string | null): DeskPrefs {
  let v: Record<string, unknown> = {};
  try {
    const o: unknown = raw ? JSON.parse(raw) : {};
    if (o && typeof o === "object" && !Array.isArray(o)) v = o as Record<string, unknown>;
  } catch {
    // 読めなければ既定
  }
  return {
    theme: pick(v.theme, ["auto", "light", "dark"], DEFAULT_PREFS.theme),
    todMode: pick(v.todMode, ["clock", "manual"], DEFAULT_PREFS.todMode),
    tod: pick(v.tod, TODS, DEFAULT_PREFS.tod),
    zoom: pick(v.zoom, ["near", "mid", "far"], DEFAULT_PREFS.zoom),
  };
}

export function loadPrefs(): DeskPrefs {
  try {
    return parsePrefs(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

/** 保存できたか（保存できなくても、開いている間はその設定で動く） */
export function savePrefs(p: DeskPrefs): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** 時計で決める時間帯（物件の地点の太陽の高さ。朝・夕・夜の境目は履歴の写真と同じ lib/app/sun.ts の histPart） */
export function todOfSun(altitude: number, rising: boolean): DeskTod {
  return histPart(altitude, rising);
}

/** 3D を開いたときの距離（m。カメラから物件まで） */
export const ZOOM_DIST: Record<DeskZoom, number> = { near: 150, mid: 260, far: 520 };

/**
 * 街の模型（components/app/property-3d.ts）の光：模型の時間帯（昼・夕方・夜の3つ）と太陽の向き（度。方位は北0°の時計回り）。
 * 時計に合わせるときは今の太陽、選んだときはその時間帯らしい太陽（朝は東の低い日、昼は南の高い日、夕は西の低い日）
 */
export function modelLight(tod: DeskTod, sun?: { az: number; alt: number }): { part: DayPart; az: number; alt: number } {
  if (sun) {
    const part: DayPart = tod === "night" ? "night" : tod === "evening" ? "evening" : "day";
    return { part, az: sun.az, alt: sun.alt };
  }
  switch (tod) {
    case "morning":
      return { part: "day", az: 105, alt: 30 };
    case "evening":
      return { part: "evening", az: 250, alt: 8 };
    case "night":
      return { part: "night", az: 60, alt: 42 };
    default:
      return { part: "day", az: 170, alt: 55 };
  }
}

/**
 * Google の実写 3D の光（撮影した色に掛ける色合いと、面の向きによる明るさの差）。写真の色を大きく変えない控えめな量にする：
 * tint は色合い、ambient は向きに関係なく掛かる明るさ、sun は太陽を向いた面に足す明るさ、az・alt は太陽の向き（度）
 */
export type GoogleLight = { tint: [number, number, number]; ambient: number; sun: number; az: number; alt: number };

export function googleLight(tod: DeskTod, sun?: { az: number; alt: number }): GoogleLight {
  const base: Record<DeskTod, GoogleLight> = {
    morning: { tint: [1, 0.95, 0.88], ambient: 0.8, sun: 0.3, az: 105, alt: 22 },
    day: { tint: [1, 1, 1], ambient: 0.86, sun: 0.2, az: 170, alt: 55 },
    evening: { tint: [1, 0.8, 0.64], ambient: 0.62, sun: 0.48, az: 250, alt: 8 },
    night: { tint: [0.44, 0.52, 0.74], ambient: 0.62, sun: 0, az: 60, alt: 40 },
  };
  const l = base[tod];
  // 時計に合わせるときは、太陽の向きだけ今の太陽にする（地平線より下なら時間帯の向きのまま）
  return sun && sun.alt > 0 && tod !== "night" ? { ...l, az: sun.az, alt: Math.max(4, sun.alt) } : l;
}

/** 空の色（3D の後ろ。上・地平線） */
export const SKY_OF: Record<DeskTod, [string, string]> = {
  morning: ["#9cc0ea", "#f7e2c9"],
  day: ["#6ea1e8", "#e3edf6"],
  evening: ["#3b3f7a", "#f2a36c"],
  night: ["#05060f", "#1f2440"],
};

// ---- Google の実写 3D のセッション

/** 1 回のルートの要求で読める長さ（Google の決まり：3 時間） */
export const GOOGLE_SESSION_MS = 3 * 60 * 60 * 1000;
/** 取り直すまでの長さ（切れる少し前に取り直す） */
export const GOOGLE_RENEW_MS = GOOGLE_SESSION_MS - 5 * 60 * 1000;

/** いまのセッションをそのまま使えるか（作ってから 2 時間 55 分まで） */
export function sessionUsable(createdAt: number, now: number): boolean {
  return createdAt > 0 && now - createdAt >= 0 && now - createdAt < GOOGLE_RENEW_MS;
}

/** Google の 3D を出せないわけ */
export type GoogleFail = "nokey" | "quota" | "denied" | "failed" | "webgl";

/** 断られた・読めなかった（HTTP の状態）からわけを決める。429 は回数の上限、403 は鍵の制限・無効、ほかは読めなかった */
export function googleFailOf(status: number | undefined): GoogleFail {
  if (status === 429) return "quota";
  if (status === 403 || status === 401) return "denied";
  return "failed";
}

/** 代わりの 3D に切り替えたときの短い一言 */
export function googleFailText(f: GoogleFail): string {
  switch (f) {
    case "nokey":
      return "地理院のデータで作った街の模型を出しています";
    case "quota":
      return "Google の 3D は回数の上限に達したため、街の模型を出しています";
    case "denied":
      return "Google の 3D を使えない設定のため、街の模型を出しています";
    case "webgl":
      return "この端末では 3D を描けないため、平らな地図を出しています";
    default:
      return "Google の 3D を読み込めなかったため、街の模型を出しています";
  }
}
