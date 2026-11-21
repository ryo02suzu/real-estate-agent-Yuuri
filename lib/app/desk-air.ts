// PC のホームの「空気の層」（日本の上空のまばらな積雲・薄い巻雲と、地面に落ちる雲の影）の決まりごと（画面を持たない。テストできる
// ように）。画面の上の動きは lib/app/desk-air-layer.ts。雲の絵は Blender（Cycles の体積）で、背景の日本の絵と同じ光で描いたもの
// （scripts/pc-opening の air_clouds.py・air_render.py）。上下・左右につなぎ目なくくり返せる 1 枚（1 画素 = ズーム 5 の地図の 1 画素）。
//  - 雲は地図と一緒に動く。影は絵の中で太陽と反対の向きにずれて地面に落ちている（朝は西へ長く、昼は北へ短く、夕は東へ長い）
//  - 寄っていくと雲の層に近づいて大きくなり、通り抜けて消える（ズーム 7.4〜8.8 で、背景の絵と一緒に）。検索して降りるときは、
//    降り始めに雲が手前へ大きくなりながら流れて消える（雲の層を通り抜ける）
//  - ホームで見えている間だけ、風で東へごくゆっくり流れる（動きを減らす設定・物件を見ている間・タブが裏の間・オープニングの間は止める）
//  - オープニングの最後の白い雲から、雲が晴れて日本が見えてくる（約 2.4 秒）
import type { DeskTod } from "./desk";
import { HOME_IMAGE_OF, type HomeImageKey } from "./desk-home";
import air from "./desk-air.json";

/**
 * 空気の層を出すか。雲の絵を作り直している間は false（層を作らず、雲の絵も読まない。ホーム・オープニングのあと・検索して
 * 降りるときの見た目は今までどおり）。本番の雲の絵が入ったら true にする
 */
export const AIR_READY: boolean = false;

/** その地図に空気の層を出すか（PC の地図＝skin "desk" で、AIR_READY のときだけ） */
export function airLayerOn(skin: string | undefined): boolean {
  return AIR_READY && skin === "desk";
}

/** 雲の絵のくり返しの幅（地図の画素。絵がこれより小さければ、のばして使う） */
export const AIR_TILE: number = air.tile;
/** 雲の絵の 1 周期のうち 1 画素 = このズームの地図の 1 画素 */
export const AIR_ZOOM = 5;

/** 時間帯ごとの絵：積雲・巻雲・地面に落ちる影・オープニングから晴れていくところの厚い雲 2 枚 */
export type AirImages = { cumulus: string; cirrus: string; shadow: string; deckA: string; deckB: string };
const IMAGES = air.images as Record<HomeImageKey, AirImages>;

/** 時間帯の雲の絵（背景の日本の絵と同じ 4 つの光。上の帯の「夕」は dusk） */
export function airImages(tod: DeskTod): AirImages & { key: HomeImageKey } {
  const key = HOME_IMAGE_OF[tod];
  return { key, ...IMAGES[key] };
}

/**
 * 時間帯ごとの濃さ（絵の透明度に掛ける）。日本が主役なので控えめに。夜はほとんど見えない月明かりの灰（街の明かりを
 * 邪魔しない）で、影は出さない
 */
export type AirLook = { cumulus: number; cirrus: number; shadow: number };
export const AIR_LOOK: Record<HomeImageKey, AirLook> = {
  morning: { cumulus: 0.82, cirrus: 0.55, shadow: 0.42 },
  day: { cumulus: 0.78, cirrus: 0.42, shadow: 0.45 },
  dusk: { cumulus: 0.82, cirrus: 0.6, shadow: 0.36 },
  night: { cumulus: 0.2, cirrus: 0.12, shadow: 0 },
};

/** 雲の層の高さ（地図のズームで表す：寄ってこのズームに近づくと、その層を通り抜ける）。巻雲が上、積雲が下 */
export const AIR_PLANE = { cirrus: 8.75, cumulus: 9.0 } as const;

/**
 * 高さのある層が、地面より何倍に大きく見えるか。カメラの高さとの比 r が 1 に近づくと大きくなる（1 / (1 - r)）。
 * 影は絵の中で決まった向きにずれているので、ホームの高さ（ズーム 5〜7）ではほとんど 1 にする（雲と影がずれない。
 * r = 2^(3 × (ズーム - 層のズーム))）。通り抜けるところ（r → 1）は大きな数にする（濃さはもう 0）
 */
export function airParallax(zoom: number, plane: number): number {
  const r = 2 ** (3 * (zoom - plane));
  return r >= 0.95 ? 20 : 1 / (1 - r);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 層に近づいて大きく見えるほど薄くなり、通り抜ける前に消える（巻雲はズーム 8.15〜8.55、積雲は 8.4〜8.8 で消える） */
export function airNearFade(m: number): number {
  return 1 - smoothstep(1.4, 3.0, m);
}

/** 背景の絵と同じく、ズーム 7.4 より寄ると薄くなり 8.8 で消える（影と、動きを減らす設定の雲） */
export const AIR_FADE = [7.4, 8.8] as const;
export function airZoomFade(zoom: number): number {
  return 1 - clamp01((zoom - AIR_FADE[0]) / (AIR_FADE[1] - AIR_FADE[0]));
}

/** 層ごとの見え方：大きく見える割合 m と濃さ。動きを減らす設定では高さの差を付けず（地図に貼り付けたまま）、背景の絵と一緒に消す */
export function airPlaneLook(kind: "cirrus" | "cumulus" | "shadow", zoom: number, motion: boolean): { m: number; opacity: number } {
  if (kind === "shadow" || !motion) return { m: 1, opacity: airZoomFade(zoom) };
  const m = airParallax(zoom, AIR_PLANE[kind]);
  return { m, opacity: airNearFade(m) };
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * 層の置き方。地図の中心（メルカトルの 0〜1）・ズーム・画面の上の中心の点（画素。地図の余白の分ずれる）と、大きく見える割合 m から、
 * 層の要素（左上を原点に scale 倍）の位置。絵はくり返すので、画面の左上が絵の 1 周期目に入るように置く（要素は小さくて済む）
 */
export function airPlaneTransform(o: { cx: number; cy: number; zoom: number; px: number; py: number; m: number; tile?: number }): {
  x: number;
  y: number;
  scale: number;
} {
  const tile = o.tile ?? AIR_TILE;
  const scale = 2 ** (o.zoom - AIR_ZOOM) * o.m;
  const k = 512 * 2 ** AIR_ZOOM;
  const ux = mod(o.cx * k - o.px / scale, tile);
  const uy = mod(o.cy * k - o.py / scale, tile);
  return { x: -ux * scale, y: -uy * scale, scale };
}

/** 風で流れる速さ（地図の画素/秒。東へ）。積雲はごくゆっくり、高い巻雲は少し速い */
export const AIR_DRIFT = { cumulus: 3.2, cirrus: 4.8 } as const;

/** 流すか：動きを出す設定で、タブが表にあり、物件を見ておらず、オープニングの間でなく、雲が見えている間だけ */
export function airRunning(s: { motion: boolean; hidden: boolean; property: boolean; intro: AirIntro; visible: boolean }): boolean {
  return s.motion && !s.hidden && !s.property && s.intro !== "hold" && s.visible;
}

/** オープニングとのつなぎ：hold（流している間。白い雲で覆って待つ）・reveal（最後の白から晴れていく）・none（ふだん） */
export type AirIntro = "hold" | "reveal" | "none";

/** 晴れていく長さ（ms） */
export const AIR_REVEAL_MS = 2400;

const ease = (t: number, a: number, b: number) => {
  const u = clamp01((t - a) / (b - a));
  return u * u * u * (u * (u * 6 - 15) + 10);
};

/**
 * オープニングの映像が白い雲に溶け始めてから t 秒の、空気の層の様子。fill：白い幕（映像の最後の白と同じ色）、
 * deckA：ほとんどを覆う厚い雲、deckB：群れの所だけ残る雲、scaleA・scaleB：その大きさ（雲の層の中を降りて抜けるので、
 * 近い雲ほど大きくなりながら画面の外へ流れ、すき間が広がる）。白い幕は早めに消し（一様に薄めると灰色の霧に見えるので、
 * 明るい雲のかたまりとすき間で見せる）、厚い雲 → 群れ → ふだんの薄い雲の順に晴れる
 */
export function airReveal(t: number): { fill: number; deckA: number; deckB: number; scaleA: number; scaleB: number } {
  const end = AIR_REVEAL_MS / 1000;
  const u = clamp01(t / end);
  return {
    fill: 1 - ease(t, 0.12, 0.7),
    deckA: 1 - ease(t, 0.35, 1.55),
    deckB: 1 - ease(t, 0.65, end),
    scaleA: 1 + 0.75 * u * u,
    scaleB: 1 + 0.3 * u * u,
  };
}

/** 検索して降りるときに雲を通り抜ける長さ（ms。降り始めから） */
export const AIR_PASS_MS = 1300;

/**
 * 検索して降り始めてから t 秒の、雲の層の大きさ（画面の真ん中を中心に、地図に合わせた大きさにさらに掛ける）と濃さ。
 * 近い（高い）巻雲が先に、積雲があとから、手前へ大きくなりながら画面の外へ流れて消える
 */
export function airPass(kind: "cirrus" | "cumulus", t: number): { scale: number; opacity: number } {
  const [end, grow, fade0] = kind === "cirrus" ? [0.9, 2.0, 0.3] : [AIR_PASS_MS / 1000, 1.5, 0.45];
  const u = clamp01(t / end);
  return { scale: 1 + grow * u * u, opacity: 1 - ease(t, fade0, end) };
}

/** 時間帯が変わったときに溶かして替える長さ（背景の絵と同じ） */
export const AIR_FADE_MS = 1200;
