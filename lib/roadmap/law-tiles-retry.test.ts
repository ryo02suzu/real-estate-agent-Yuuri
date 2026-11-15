import { open } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import moridoData from "./data/morido-source.json";
import houreiData from "./data/hourei-source.json";
import tochiData from "./data/tochi-source.json";
import { moridoTileSource } from "./morido-tiles";
import { houreiTileSource } from "./hourei-tiles";
import { tochiTileSource } from "./tochi-tiles";
import { tileOf } from "./parcel";

// 東京都庁の公開所在地。実際の PMTiles を使い、通信層の一時障害だけを再現する。
const [x, y] = tileOf(35.6896, 139.6917, 14);
const families = [
  { name: "盛土", url: moridoData.url, create: moridoTileSource },
  { name: "土砂災害等", url: houreiData.url, create: houreiTileSource },
  { name: "自然公園等", url: tochiData.url, create: tochiTileSource },
];

describe("法令 PMTiles のヘッダー取得失敗からの復旧", () => {
  for (const family of families) {
    it(`${family.name}: 失敗を保持せず再度読み、成功したタイルは使い回す`, async () => {
      let offline = true;
      let requests = 0;
      const source: Source = {
        getKey: () => `recovery-${family.url}`,
        getBytes: async (offset, length) => {
          requests++;
          if (offline) throw new Error("503");
          const file = await open(`public${family.url}`, "r");
          try {
            const buffer = Buffer.alloc(length);
            const { bytesRead } = await file.read(buffer, 0, length, offset);
            return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead) };
          } finally {
            await file.close();
          }
        },
      };
      const tiles = family.create(source);
      await expect(tiles.tile(x, y)).rejects.toThrow("503");
      await expect(tiles.tile(x, y)).rejects.toThrow("503");
      // 同じエラーを返すだけではなく、再試行ごとに通信していることも確かめる。
      expect(requests).toBe(2);
      offline = false;
      const recovered = await tiles.tile(x, y);
      const afterRecovery = requests;
      expect(afterRecovery).toBeGreaterThan(2);
      expect(await tiles.tile(x, y)).toEqual(recovered);
      expect(requests).toBe(afterRecovery);
    });
  }
});
