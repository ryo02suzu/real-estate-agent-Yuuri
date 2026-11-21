import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TODS } from "./desk";
import {
  AIR_READY,
  airLayerOn,
  AIR_FADE,
  AIR_LOOK,
  AIR_PASS_MS,
  AIR_PLANE,
  AIR_REVEAL_MS,
  AIR_TILE,
  AIR_ZOOM,
  airImages,
  airNearFade,
  airParallax,
  airPass,
  airPlaneLook,
  airPlaneTransform,
  airReveal,
  airRunning,
  airZoomFade,
} from "./desk-air";

/** WebP の大きさ（RIFF の見出しから。VP8・VP8L・VP8X） */
function webpSize(buf: Buffer): [number, number] {
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12)).toBe("WEBP");
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === "VP8L") {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >>> 14) & 0x3fff)];
  }
  if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  throw new Error(`知らない WebP：${kind}`);
}

const between = (x: number, a: number, b: number) => x >= a && x <= b;

describe("PC のホームの空気の層：出すか", () => {
  it("PC の地図で、雲の絵ができている（AIR_READY）ときだけ出す。スマホの地図には出さない", () => {
    expect(airLayerOn("desk")).toBe(AIR_READY);
    expect(airLayerOn(undefined)).toBe(false);
  });
});

describe("PC のホームの空気の層：絵", () => {
  it("上の帯の時間帯ごとに、背景の日本と同じ光の絵（「夕」は dusk）", () => {
    expect(TODS.map((t) => airImages(t).key)).toEqual(["morning", "day", "dusk", "night"]);
  });

  // 層を出す（AIR_READY）ときは、絵が public/home/air にそろっていること
  it.runIf(AIR_READY)("積雲・巻雲・影・厚い雲 2 枚が、くり返して敷ける正方形の絵でそろう", () => {
    for (const t of TODS) {
      const img = airImages(t);
      for (const url of [img.cumulus, img.cirrus, img.shadow, img.deckA, img.deckB]) {
        expect(url).toMatch(/^\/home\/air\/(cumulus|cirrus|shadow|deck-a|deck-b)-(morning|day|dusk|night)\.webp$/);
        const file = join(process.cwd(), "public", url);
        expect(existsSync(file), url).toBe(true);
        // くり返して敷くので正方形（のばして 1 周期の大きさにする）
        const [w, h] = webpSize(readFileSync(file));
        expect(w, url).toBe(h);
        expect(w, url).toBeLessThanOrEqual(AIR_TILE);
      }
    }
  });

  it("日本が主役なので控えめ。夜はほとんど見えない月明かりの灰で、影は出さない（街の明かりを邪魔しない）", () => {
    for (const k of ["morning", "day", "dusk"] as const) {
      expect(AIR_LOOK[k].cumulus).toBeLessThan(0.9);
      expect(AIR_LOOK[k].cirrus).toBeLessThan(AIR_LOOK[k].cumulus);
      expect(AIR_LOOK[k].shadow).toBeGreaterThan(0);
    }
    expect(AIR_LOOK.night.cumulus).toBeLessThan(0.3);
    expect(AIR_LOOK.night.shadow).toBe(0);
  });
});

describe("PC のホームの空気の層：地図に合わせる", () => {
  it("ホームの高さ（ズーム 5〜7）では、雲は地面とほとんど同じ大きさで動く（絵の中の影とずれない）", () => {
    for (const z of [5, 6, 7]) {
      expect(airParallax(z, AIR_PLANE.cumulus)).toBeLessThan(1.02);
      expect(airParallax(z, AIR_PLANE.cirrus)).toBeLessThan(1.04);
    }
    // 寄るほど大きく見える（雲の層に近づく）
    expect(airParallax(8.5, AIR_PLANE.cumulus)).toBeGreaterThan(airParallax(8, AIR_PLANE.cumulus));
    expect(airParallax(8.5, AIR_PLANE.cirrus)).toBeGreaterThan(airParallax(8.5, AIR_PLANE.cumulus));
  });

  it("寄ると雲の層を通り抜けて消える：巻雲が先、積雲があと。どちらも背景の絵が消えるズーム 8.8 までに消える", () => {
    const op = (k: "cirrus" | "cumulus", z: number) => airPlaneLook(k, z, true).opacity;
    expect(op("cumulus", 5)).toBe(1);
    expect(op("cirrus", 7.4)).toBe(1);
    expect(op("cumulus", 8)).toBe(1);
    expect(op("cirrus", 8.6)).toBe(0);
    expect(op("cumulus", 8.8)).toBeLessThan(0.02);
    expect(op("cumulus", 9.5)).toBe(0);
    expect(op("cirrus", 8.35)).toBeLessThan(op("cumulus", 8.35));
    expect(airNearFade(1)).toBe(1);
  });

  it("影は地面にあるので、背景の絵と同じくズーム 7.4〜8.8 で消える。動きを減らす設定では雲も高さの差を付けず、同じように消える", () => {
    expect(AIR_FADE).toEqual([7.4, 8.8]);
    expect(airPlaneLook("shadow", 6, true)).toEqual({ m: 1, opacity: 1 });
    expect(airPlaneLook("shadow", 8.1, true).opacity).toBeCloseTo(0.5, 5);
    expect(airPlaneLook("shadow", 8.8, true).opacity).toBe(0);
    expect(airPlaneLook("cumulus", 8.5, false)).toEqual({ m: 1, opacity: airZoomFade(8.5) });
    expect(airPlaneLook("cirrus", 6, false)).toEqual({ m: 1, opacity: 1 });
  });

  it("層の置き方：画面の中心の点には、地図の中心の真上の雲が来る。画面の左上は絵の 1 周期目に入る", () => {
    const k = 512 * 2 ** AIR_ZOOM;
    for (const o of [
      { cx: 0.88, cy: 0.395, zoom: 5, px: 764, py: 484, m: 1 },
      { cx: 0.9012, cy: 0.4011, zoom: 6.37, px: 620, py: 470, m: 1.04 },
      { cx: 0.5, cy: 0.5, zoom: 8.2, px: 100, py: 900, m: 2.2 },
    ]) {
      const t = airPlaneTransform(o);
      expect(t.scale).toBeCloseTo(2 ** (o.zoom - AIR_ZOOM) * o.m, 10);
      // 画面の点 → 層の中の位置（絵の画素）
      const u = (o.px - t.x) / t.scale;
      const d = (((u - o.cx * k) % AIR_TILE) + AIR_TILE) % AIR_TILE;
      expect(Math.min(d, AIR_TILE - d)).toBeLessThan(1e-6);
      expect(between(-t.x / t.scale, 0, AIR_TILE)).toBe(true);
      expect(between(-t.y / t.scale, 0, AIR_TILE)).toBe(true);
    }
  });

  it("地図を動かすと、雲も同じだけ動く（地図の 1 画素 = 画面の 1 画素の動き）", () => {
    const k = 512 * 2 ** 6;
    const a = airPlaneTransform({ cx: 0.88, cy: 0.4, zoom: 6, px: 700, py: 450, m: 1 });
    const b = airPlaneTransform({ cx: 0.88 + 37 / k, cy: 0.4, zoom: 6, px: 700, py: 450, m: 1 });
    // 中心が東へ 37 画素動くと、雲は画面の上で西へ 37 画素（くり返しの 1 周期ぶんの飛びは除く）
    const dx = (((b.x - a.x) % (AIR_TILE * 2)) + AIR_TILE * 2) % (AIR_TILE * 2);
    expect(Math.min(Math.abs(dx - (AIR_TILE * 2 - 37)), Math.abs(dx + 37))).toBeLessThan(1e-6);
  });
});

describe("PC のホームの空気の層：流す・止める", () => {
  const base = { motion: true, hidden: false, property: false, intro: "none" as const, visible: true };
  it("ホームで見えている間だけ流す", () => {
    expect(airRunning(base)).toBe(true);
    expect(airRunning({ ...base, motion: false })).toBe(false);
    expect(airRunning({ ...base, hidden: true })).toBe(false);
    expect(airRunning({ ...base, property: true })).toBe(false);
    expect(airRunning({ ...base, visible: false })).toBe(false);
    expect(airRunning({ ...base, intro: "hold" })).toBe(false);
    expect(airRunning({ ...base, intro: "reveal" })).toBe(true);
  });
});

describe("PC のホームの空気の層：オープニングの白い雲から晴れる・検索して降りるときに通り抜ける", () => {
  it("オープニングの最後の白から始まり、白い幕 → 厚い雲 → 群れの順に晴れて、約 2.4 秒でふだんの雲に", () => {
    const s = airReveal(0);
    expect(s).toMatchObject({ fill: 1, deckA: 1, deckB: 1 });
    const e = airReveal(AIR_REVEAL_MS / 1000);
    expect(e).toMatchObject({ fill: 0, deckA: 0, deckB: 0 });
    // 白い幕が先に消え、厚い雲、群れの順
    expect(airReveal(0.8).fill).toBe(0);
    expect(airReveal(0.8).deckA).toBeGreaterThan(0);
    expect(airReveal(1.6).deckA).toBe(0);
    expect(airReveal(1.6).deckB).toBeGreaterThan(0);
    // だんだん晴れる（戻らない）。近い雲は大きくなりながら外へ流れる
    let prev = airReveal(0);
    for (let t = 0.05; t <= AIR_REVEAL_MS / 1000; t += 0.05) {
      const f = airReveal(t);
      expect(f.fill).toBeLessThanOrEqual(prev.fill);
      expect(f.deckA).toBeLessThanOrEqual(prev.deckA);
      expect(f.deckB).toBeLessThanOrEqual(prev.deckB);
      expect(f.scaleA).toBeGreaterThanOrEqual(prev.scaleA);
      expect(f.scaleA).toBeGreaterThanOrEqual(f.scaleB);
      prev = f;
    }
  });

  it("降り始めに、巻雲が先、積雲があとから、手前へ大きくなりながら消える", () => {
    for (const k of ["cirrus", "cumulus"] as const) {
      expect(airPass(k, 0)).toEqual({ scale: 1, opacity: 1 });
      expect(airPass(k, AIR_PASS_MS / 1000).opacity).toBe(0);
      expect(airPass(k, AIR_PASS_MS / 1000).scale).toBeGreaterThan(2);
    }
    expect(airPass("cirrus", 0.9).opacity).toBe(0);
    expect(airPass("cumulus", 0.9).opacity).toBeGreaterThan(0);
    expect(airPass("cirrus", 0.5).scale).toBeGreaterThan(airPass("cumulus", 0.5).scale);
  });
});
