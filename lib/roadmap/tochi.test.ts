import { open } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/tochi-source.json";
import { tileOf, type LngLat } from "./parcel";
import { TOCHI_ZOOM, tochiAgriText, tochiAt, tochiCheck, tochiForestText, tochiLine, tochiParkText, type TochiArea } from "./tochi";
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

describe("自然公園地域・農業地域・森林地域", () => {
  const LAT = 35.2;
  const LNG = 139.0;
  const [x, y] = tileOf(LAT, LNG, TOCHI_ZOOM);
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

  it("森林は保安林・地域森林計画対象民有林・国有林の順に細かいもの", async () => {
    const hoan = await tochiAt(LAT, LNG, "14382", fake([area("地域森林計画対象民有林", 0.01), area("保安林")]));
    expect(hoan?.forest).toBe("保安林");
    expect(tochiLine(hoan!)).toBe("保安林");
    expect(tochiCheck(hoan!, "箱根町")).toBe("保安林は都県の担当で確認");
    const min = await tochiAt(LAT, LNG, "14382", fake([area("地域森林計画対象民有林"), area("自然公園地域")]));
    expect(tochiLine(min!)).toBe("自然公園の普通地域・地域森林計画対象民有林");
    expect(tochiCheck(min!, "箱根町")).toBe("自然公園は都県の担当、民有林は箱根町の林務の担当で確認");
    const koku = await tochiAt(LAT, LNG, "14382", fake([area("国有林")]));
    expect(tochiForestText(koku!)).toBe("国有林");
    expect(tochiCheck(koku!, "箱根町")).toBe("国有林は森林管理署で確認");
  });

  it("どの区域にも入らない・関東の外", async () => {
    const none = await tochiAt(LAT, LNG, "13101", fake([]));
    expect(none).toMatchObject({ park: undefined, agri: undefined, forest: undefined });
    expect(tochiLine(none!)).toBe("自然公園・農業振興地域・森林地域の外");
    expect(tochiForestText(none!)).toBe("森林地域の外");
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

describe("アプリに入っている自然公園地域・農業地域・森林地域のタイル", () => {
  const src = tochiTileSource(fileSource(PATH));
  it("日光東照宮・高尾山・熊谷市の田んぼ・千代田区", async () => {
    expect((await tochiAt(36.7579, 139.5989, "09206", src))?.park).toBe("特別保護地区");
    expect((await tochiAt(35.6252, 139.2437, "13201", src))?.park).toBe("特別地域");
    expect((await tochiAt(36.1876, 139.3242, "11202", src))?.agri).toBe("農用地区域");
    expect(await tochiAt(35.6895, 139.7441, "13101", src)).toMatchObject({ park: undefined, agri: undefined, year: 2015 });
    expect(SRC.counts.A12).toBeGreaterThan(10000);
  });

  it("湘南海岸の砂防林（保安林）・鎌倉の山（民有林）・高尾山（国有林）", async () => {
    expect((await tochiAt(35.318, 139.458, "14205", src))?.forest).toBe("保安林");
    expect((await tochiAt(35.3335, 139.5652, "14204", src))?.forest).toBe("地域森林計画対象民有林");
    expect(await tochiAt(35.6252, 139.2437, "13201", src)).toMatchObject({ park: "特別地域", forest: "国有林" });
    expect(SRC.counts.A13).toBeGreaterThan(20000);
  });
});
