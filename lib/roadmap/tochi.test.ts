import { open } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/tochi-source.json";
import { tileOf, type LngLat } from "./parcel";
import { tochiAgriText, tochiAt, tochiCheck, tochiLine, tochiParkText, type TochiArea } from "./tochi";
import { tochiTileSource } from "./tochi-tiles";

const square = (lat: number, lng: number, d: number): LngLat[][] => [
  [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ],
];

describe("自然公園地域・農業地域", () => {
  const LAT = 35.2;
  const LNG = 139.0;
  const [x, y] = tileOf(LAT, LNG, 14);
  const area = (kind: TochiArea["kind"], d = 0.001): TochiArea => ({ kind, pref: "14", polygons: [square(LAT, LNG, d)] });
  const fake = (areas: TochiArea[]) => ({ tile: async (tx: number, ty: number) => (tx === x && ty === y ? areas : null) });

  it("自然公園は一番細かい地種区分、農業振興地域は農用地区域かどうか", async () => {
    const t = await tochiAt(LAT, LNG, "14382", fake([area("自然公園地域", 0.01), area("特別地域"), area("農業地域", 0.01), area("農用地区域")]));
    expect(t).toMatchObject({ park: "特別地域", agri: "農用地区域" });
    expect(tochiLine(t!)).toBe("自然公園の特別地域・農用地区域");
    expect(tochiCheck(t!, "箱根町")).toBe("自然公園は都県の担当、農用地区域かは箱根町の農業委員会で確認");
    // 特別地域の外は普通地域、農用地区域の外は農業振興地域（いわゆる白地）
    const away: TochiArea = { kind: "特別地域", pref: "14", polygons: [square(LAT + 0.01, LNG, 0.001)] };
    const outer = await tochiAt(LAT, LNG, "14382", fake([area("自然公園地域"), away, area("農業地域")]));
    expect(outer).toMatchObject({ park: "普通地域", agri: "農業振興地域" });
    expect(tochiParkText(outer!)).toBe("自然公園の普通地域");
    expect(tochiAgriText(outer!)).toBe("農業振興地域（農用地区域の外）");
  });

  it("どちらの区域にも入らない・関東の外", async () => {
    const none = await tochiAt(LAT, LNG, "13101", fake([]));
    expect(none).toMatchObject({ park: undefined, agri: undefined });
    expect(tochiLine(none!)).toBe("自然公園・農業振興地域の外");
    expect(tochiCheck(none!, "千代田区")).toBeUndefined();
    expect(await tochiAt(LAT, LNG, "19201", fake([]))).toBeNull();
  });
});

// アプリに入っている区域のタイル（public/data/）を実際に読む
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

describe("アプリに入っている自然公園地域・農業地域のタイル", () => {
  const src = tochiTileSource(fileSource(PATH));
  it("日光東照宮・高尾山・熊谷市の田んぼ・千代田区", async () => {
    expect((await tochiAt(36.7579, 139.5989, "09206", src))?.park).toBe("特別保護地区");
    expect((await tochiAt(35.6252, 139.2437, "13201", src))?.park).toBe("特別地域");
    expect((await tochiAt(36.1876, 139.3242, "11202", src))?.agri).toBe("農用地区域");
    expect(await tochiAt(35.6895, 139.7441, "13101", src)).toMatchObject({ park: undefined, agri: undefined, year: 2015 });
    expect(SRC.counts.A12).toBeGreaterThan(10000);
  });
});
