// アプリに入っている都市計画のタイル（public/data/）を実際に読んで、よく知られた地点の結果を確かめる
// （タイルを作り直したとき、壊れたファイルや読み方の違いに気づけるように）
import { open, stat } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/zoning-source.json";
import { zoningAt } from "./zoning";
import { zoningTileSource } from "./zoning-tiles";

const PATH = `public${SRC.url}`;

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

describe("アプリに入っている都市計画のタイル", () => {
  const src = zoningTileSource(fileSource(PATH));

  it("zoning-source.json のファイルがある", async () => {
    expect(SRC.url).toMatch(/^\/data\/zoning-\d{8}\.pmtiles$/);
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
});
