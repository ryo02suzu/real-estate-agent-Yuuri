import { open } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import SRC from "./data/morido-source.json";
import { MORIDO_ZOOM, moridoAt, moridoAuthority, moridoDate, moridoDetail, moridoLine, moridoLink, moridoValue, type MoridoArea } from "./morido";
import { moridoTileSource } from "./morido-tiles";
import { tileOf, type LngLat } from "./parcel";

const square = (lat: number, lng: number, d: number): LngLat[][] => [
  [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ],
];

describe("盛土規制法の区域", () => {
  const LAT = 35.44;
  const LNG = 139.36;
  const [TX, TY] = tileOf(LAT, LNG, MORIDO_ZOOM);
  const area = (props: Partial<MoridoArea>): MoridoArea => ({
    kind: "宅地造成等工事規制区域",
    city: "14212",
    cityName: "厚木市",
    level: "A",
    notice: "神奈川県告示第212号",
    since: "2025-04-01",
    polygons: [square(LAT, LNG, 0.001)],
    ...props,
  });

  it("地点を含む区域と、指定した都県・市", async () => {
    const r = await moridoAt(LAT, LNG, "14212", { tile: async (x, y) => (x === TX && y === TY ? [area({ kind: "特定盛土等規制区域", polygons: [square(LAT + 0.01, LNG, 0.001)] }), area({})] : []) });
    expect(r?.area?.kind).toBe("宅地造成等工事規制区域");
    expect(r?.authority).toBe("神奈川県");
    expect(moridoValue(r!)).toBe("宅地造成等工事規制区域");
    expect(moridoDetail(r!)).toBe("神奈川県が指定（神奈川県告示第212号・2025年4月1日から）");
    expect(moridoLine(r!)).toBe("宅地造成等工事規制区域（神奈川県が指定・参考）");
    expect(r?.link?.url).toBe("https://www.pref.kanagawa.jp/docs/jy2/morido/moridokiseikuiki_gaiyou.html");
  });

  it("指定都市・中核市は市が指定。区域外の地点は、市区町村から確かめ先を決める", async () => {
    const r = await moridoAt(LAT, LNG, "14109", { tile: async () => [area({ city: "14109", cityName: "横浜市港北区", level: "B", notice: "横浜市告示第113号" })] });
    expect(r?.authority).toBe("横浜市");
    const out = await moridoAt(LAT, LNG, "08201", { tile: async () => [area({ polygons: [square(LAT + 0.01, LNG, 0.001)] })] });
    expect(out?.area).toBeUndefined();
    expect(out?.authority).toBe("水戸市");
    expect(moridoValue(out!)).toBe("区域外（国のデータ）");
    // 区域の無い所はタイルが無い（区域外）。関東の外は null
    expect((await moridoAt(LAT, LNG, "14212", { tile: async () => null }))?.authority).toBe("神奈川県");
    expect(await moridoAt(LAT, LNG, "22100", { tile: async () => [area({})] })).toBeNull();
    expect([moridoAuthority("13101"), moridoAuthority("13201"), moridoAuthority("12204"), moridoAuthority("10202")]).toEqual(["東京都", "八王子市", "船橋市", "高崎市"]);
    expect(moridoDate("2024-07-31")).toBe("2024年7月31日");
  });

  it("東京都・茨城県・群馬県は地図を物件の場所で開く", () => {
    const link = moridoLink("東京都", 35.6895, 139.7441);
    expect(link?.url).toBe("https://www2.wagmap.jp/tokyo_tokeizu/Map?mid=4&mpx=139.744100&mpy=35.689500&mps=2500&gprj=2");
    expect(moridoLink("川崎市", 35.5, 139.7)).toBeUndefined();
  });
});

// アプリに入っている規制区域のタイル（public/data/）を実際に読む
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

describe("アプリに入っている盛土規制法の区域のタイル", () => {
  const src = moridoTileSource(fileSource(PATH));
  it("横浜市港北区・千代田区・秩父の山の中・水戸市", async () => {
    const kohoku = await moridoAt(35.5146, 139.6218, "14109", src);
    expect(kohoku?.area?.kind).toBe("宅地造成等工事規制区域");
    expect(kohoku?.authority).toBe("横浜市");
    expect(kohoku?.area?.notice).toBe("横浜市告示第113号");
    const chiyoda = await moridoAt(35.6895, 139.7441, "13101", src);
    expect(chiyoda?.area?.kind).toBe("宅地造成等工事規制区域");
    expect(chiyoda?.authority).toBe("東京都");
    // 秩父の西の山の中は特定盛土等規制区域（埼玉県）
    const yama = await moridoAt(35.95, 138.95, "11207", src);
    expect(yama?.area?.kind).toBe("特定盛土等規制区域");
    expect(yama?.authority).toBe("埼玉県");
    // 水戸市は国のデータの時点で区域が無い
    const mito = await moridoAt(36.3658, 140.4712, "08201", src);
    expect(mito?.area).toBeUndefined();
    expect(mito?.authority).toBe("水戸市");
    expect(SRC.counts.areas).toBeGreaterThan(1000);
  });
});
