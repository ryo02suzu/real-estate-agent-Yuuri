// 実際の重ねるハザードマップ・標高のタイルを読んで、地点の災害リスクを確かめる（ネットが要るので、HAZARD_LIVE=1 のときだけ）。
// ブラウザでは canvas で PNG を画素にするが、ここでは sharp（next の依存）で画素にする
import { describe, expect, it } from "vitest";
import { elevationAt, hazardAt, hazardRows, type TileFetcher } from "./hazard";

const live = describe.runIf(process.env.HAZARD_LIVE === "1");

const nodeFetcher: TileFetcher = async (url) => {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
};

const value = async (lat: number, lng: number) => {
  const r = await hazardAt(lat, lng, nodeFetcher);
  return Object.fromEntries(hazardRows(r).map((x) => [x.kind, x.value]));
};

live("重ねるハザードマップ（実データ）", () => {
  it("江戸川区船堀：洪水・高潮とも 3〜5m、浸水継続時間も出る", async () => {
    const v = await value(35.6838, 139.8641);
    expect(v.flood).toBe("浸水 3〜5m");
    expect(v.takashio).toBe("浸水 3〜5m");
    expect(v.keizoku).toMatch(/週間|日/);
    expect(v.dosha).toBe("区域外");
  }, 60_000);

  it("藤沢市鵠沼海岸：津波の浸水想定区域", async () => {
    const v = await value(35.3155, 139.4728);
    expect(v.tsunami).toBe("浸水 0.5〜3m");
  }, 60_000);

  it("さいたま市大宮駅：洪水の区域外（浸水継続時間・家屋倒壊は読まない）", async () => {
    const v = await value(35.9064, 139.6237);
    expect(v.flood).toBe("区域外");
    expect(v.keizoku).toBeUndefined();
    expect(v.kaoku).toBeUndefined();
  }, 60_000);

  it("横須賀市：急傾斜地の崩壊の警戒区域・特別警戒区域", async () => {
    expect((await value(35.276964, 139.67376)).dosha).toBe("急傾斜地の崩壊の警戒区域");
    expect((await value(35.276613, 139.673502)).dosha).toBe("急傾斜地の崩壊の特別警戒区域");
  }, 60_000);

  it("北区（荒川沿い）：家屋倒壊等氾濫想定区域（氾濫流）の丸の模様の中", async () => {
    const v = await value(35.78567, 139.720838);
    expect(v.kaoku).toMatch(/^区域内（氾濫流/);
  }, 60_000);

  it("地面の高さ：江東区はほぼ海面の高さ、世田谷区成城は 40m ほど", async () => {
    const koto = await elevationAt(35.6696, 139.817, nodeFetcher);
    expect(koto!.value).toBeLessThan(1);
    const seijo = await elevationAt(35.6406, 139.6005, nodeFetcher);
    expect(seijo!.value).toBeGreaterThan(35);
    expect(seijo!.source).toBe("5mメッシュ（航空レーザ測量）");
  }, 60_000);
});
