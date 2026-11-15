// 都市計画のタイルを実際に読んで、よく知られた地点の結果を確かめる（タイルを作り直したとき、壊れたファイルや読み方の違いに気づけるように）。
// タイルの置き場は、アプリの中（public/data/）か Cloudflare R2（全国の分は 100MB を超えて GitHub に入らないため。.github/workflows/zoning-tiles.yml）。
// R2 に置いたあとは手元にファイルが無いので、ファイルを読むテストは、作り直しのワークフローが作ったファイル（ZONING_PMTILES_FILE）で動かす
import { open, stat } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/zoning-source.json";
import STATUS from "./data/zoning-status.json";
import { statusFor, zoningAt, type ZoningStatus } from "./zoning";
import { zoningTileSource } from "./zoning-tiles";

/** 読むファイル：作り直しのワークフローが作ったファイルか、アプリの中のファイル。R2 に置いてあって手元に無ければ空 */
const PATH = process.env.ZONING_PMTILES_FILE || (SRC.url.startsWith("/") ? `public${SRC.url}` : "");
/** その市区町村の用途地域のデータが、国のデータにあるか（データの有無の一覧 zoning-status.json） */
const hasYouto = (code: string) => statusFor([code], STATUS as Record<string, ZoningStatus>)?.layers.youto === 1;

describe("都市計画のタイルの置き場所（zoning-source.json）", () => {
  it("アプリの中（/data/）か、R2 の zoning/ の下の PMTiles。版と元データの更新日時がある", () => {
    // R2 の名前は「zoning-<元データの日付>.pmtiles」か、作った日時を足した「zoning-<元データの日付>-<作った日時>.pmtiles」
    expect(SRC.url).toMatch(/^(\/data\/zoning-\d{8}|https:\/\/[a-z0-9.-]+\.r2\.dev\/zoning\/zoning-\d{8}(-\d{12})?)\.pmtiles$/);
    expect(SRC.edition).toMatch(/\d+年/);
    expect(SRC.sourceModified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

const fileSource = (path: string): Source => ({
  getKey: () => path,
  getBytes: async (offset, length) => {
    const fh = await open(path, "r");
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) };
    } finally {
      await fh.close();
    }
  },
});

describe.skipIf(!PATH)("都市計画のタイル（ファイルを読む）", () => {
  const src = zoningTileSource(fileSource(PATH));

  it("ファイルがある", async () => {
    expect((await stat(PATH)).size).toBeGreaterThan(5_000_000);
  });

  it("東京駅：商業地域・防火地域・市街化区域", async () => {
    const z = await zoningAt(35.6812, 139.7671, src);
    expect(z?.youto[0]?.name).toBe("商業地域");
    expect(z?.youto[0]?.far).toBeGreaterThanOrEqual(800);
    expect(z?.bouka).toBe("防火地域");
    expect(z?.senbiki).toBe("市街化区域");
    expect(z?.tokei).toBe(true);
  });

  it("住宅地：第一種低層住居専用地域・準防火地域・高度地区", async () => {
    const z = await zoningAt(35.72068, 139.70262, src);
    expect(z?.youto[0]).toMatchObject({ name: "第１種低層住居専用地域", bcr: 60, far: 150 });
    expect(z?.bouka).toBe("準防火地域");
    expect(z?.koudoti).toBe(true);
  });

  it("市街化調整区域（用途地域なし）", async () => {
    const z = await zoningAt(36.09056, 139.54606, src);
    expect(z?.senbiki).toBe("市街化調整区域");
    expect(z?.youto).toEqual([]);
  });

  it("海の上：都市計画区域外", async () => {
    const z = await zoningAt(35.0, 140.5, src);
    expect(z?.tokei).toBe(false);
    expect(z?.youto).toEqual([]);
  });

  // 地方を足したとき（準備中の地方も、タイルには入れる）、その地方の分が本当に入ったかを、大きな駅の前の商業地域で確かめる。
  // 国のデータにその市の用途地域が無いとき（データの有無の一覧で「あり」でないとき）は確かめない
  it.each([
    ["大阪駅（大阪市北区）", "27127", 34.7025, 135.4959],
    ["広島駅（広島市南区）", "34103", 34.3976, 132.4753],
    ["高松駅（高松市）", "37201", 34.3506, 134.0469],
    ["博多駅（福岡市博多区）", "40132", 33.5897, 130.4207],
    ["沖縄県庁の前（那覇市）", "47201", 26.2124, 127.6792],
    ["札幌駅（札幌市北区）", "01102", 43.0687, 141.3508],
  ])("%s：用途地域が入っている（国のデータにあるとき）", async (_name, code, lat, lng) => {
    if (!hasYouto(code)) return;
    const z = await zoningAt(lat, lng, src);
    expect(z?.tokei).toBe(true);
    expect(z?.youto[0]?.name).toBe("商業地域");
  });
});
