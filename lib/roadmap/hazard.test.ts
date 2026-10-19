import { describe, expect, it } from "vitest";
import HAZARD_MAPS from "./data/hazard-maps.json";
import {
  analyzeWindow,
  classify,
  demValue,
  elevationAt,
  groundMaps,
  groupHazardMaps,
  HAZARD_ZOOM,
  HAZARDS,
  hazardAt,
  hazardChips,
  hazardMapsFor,
  hazardRows,
  metersPerPixel,
  readWindow,
  wagamachiUrl,
  worldPixel,
  type HazardMapIndex,
  type PixelWindow,
  type TileFetcher,
  type TileImage,
} from "./hazard";
import { MUNICIPALITIES } from "./municipalities";
import { tileOf } from "./parcel";

const rgba = (hex: string, a = 255): [number, number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a];

/** 1色で塗ったタイル（paint で一部だけ塗れる） */
function tile(paint: (x: number, y: number) => [number, number, number, number] | undefined): TileImage {
  const data = new Uint8ClampedArray(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) data.set(paint(x, y) ?? [0, 0, 0, 0], (y * 256 + x) * 4);
  return { width: 256, height: 256, data };
}

/** (2r+1)² の窓（中心が地点） */
function windowOf(r: number, paint: (dx: number, dy: number) => [number, number, number, number] | undefined): PixelWindow {
  const size = 2 * r + 1;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set(paint(x - r, y - r) ?? [0, 0, 0, 0], (y * size + x) * 4);
  return { r, size, data, tiles: 1 };
}

const FLOOD = HAZARDS.flood.layers[0];
const KYUKEI = HAZARDS.dosha.layers[0];
const HANRAN = HAZARDS.kaoku.layers[0];

describe("タイルの位置", () => {
  it("世界の画素の位置は、タイルの番号と合う", () => {
    const [px, py] = worldPixel(35.6838, 139.8641, HAZARD_ZOOM);
    expect([Math.floor(px / 256), Math.floor(py / 256)]).toEqual(tileOf(35.6838, 139.8641, HAZARD_ZOOM));
  });
  it("z17 の1画素は東京で約1m", () => {
    expect(metersPerPixel(35.68, 17)).toBeGreaterThan(0.95);
    expect(metersPerPixel(35.68, 17)).toBeLessThan(1);
  });
});

describe("色を凡例に当てる", () => {
  it("凡例の色そのもの", () => {
    expect(FLOOD.classes[classify(...rgba("#ffb7b7"), FLOOD.classes)].label).toBe("3〜5m");
    expect(FLOOD.classes[classify(...rgba("#ffffb3"), FLOOD.classes)].label).toBe("0.3m未満");
  });
  it("縁のにじんだ色は、近い凡例の色に当てる", () => {
    expect(KYUKEI.classes[classify(...rgba("#fae500"), KYUKEI.classes)].label).toBe("警戒区域");
    expect(KYUKEI.classes[classify(...rgba("#fa2c00"), KYUKEI.classes)].label).toBe("特別警戒区域");
  });
  it("透明・凡例に無い色は当てない", () => {
    expect(classify(...rgba("#ffb7b7", 40), FLOOD.classes)).toBe(-1);
    expect(classify(...rgba("#0000ff"), FLOOD.classes)).toBe(-1);
  });
  it("河岸侵食は半透明（127）で塗っている", () => {
    const kagan = HAZARDS.kaoku.layers[1];
    expect(classify(...rgba("#ff0000", 127), kagan.classes)).toBe(0);
  });
});

describe("地点の区分と、近くの区域", () => {
  it("地点が塗られていれば、その区分", () => {
    expect(analyzeWindow(windowOf(24, () => rgba("#ffd8c0")), FLOOD)).toEqual({ at: FLOOD.classes.findIndex((c) => c.color === "#ffd8c0") });
  });
  it("地点の外で、約6画素先から区域", () => {
    const r = analyzeWindow(windowOf(24, (dx) => (dx >= 6 ? rgba("#f7f5a9") : undefined)), FLOOD);
    expect(r.at).toBeUndefined();
    expect(r.near?.px).toBe(6);
    expect(FLOOD.classes[r.near!.index].label).toBe("0.5m未満");
  });
  it("遠い区域は近くとしない", () => {
    expect(analyzeWindow(windowOf(24, (dx) => (dx >= 15 ? rgba("#f7f5a9") : undefined)), FLOOD)).toEqual({});
  });
  it("警戒区域の中で、特別警戒区域が近い", () => {
    const r = analyzeWindow(windowOf(24, (dx) => (dx >= 4 ? rgba("#fa2800") : rgba("#fae600"))), KYUKEI);
    expect(KYUKEI.classes[r.at!].label).toBe("警戒区域");
    expect(KYUKEI.classes[r.near!.index].label).toBe("特別警戒区域");
    expect(r.near!.px).toBe(4);
  });
  it("区分の境目のにじんだ色の地点は、まわりで多い区分", () => {
    const r = analyzeWindow(windowOf(24, (dx, dy) => (dx === 0 && dy === 0 ? rgba("#ff8000") : rgba("#ffb7b7"))), FLOOD);
    expect(FLOOD.classes[r.at!].label).toBe("3〜5m");
  });
  it("氾濫流：丸の模様の中（透明）でも、まわりを模様に囲まれていれば区域の中", () => {
    // 直径 16 画素の丸を 16 画素おきに並べた模様（地点は丸の中心）
    const circles = (dx: number, dy: number) => {
      const x = ((dx % 16) + 16) % 16;
      const y = ((dy % 16) + 16) % 16;
      const d = Math.hypot(Math.min(x, 16 - x), Math.min(y, 16 - y));
      return Math.abs(d - 7.5) < 1 ? rgba("#ff0000") : undefined;
    };
    expect(analyzeWindow(windowOf(24, circles), HANRAN)).toEqual({ at: 0 });
    // 区域の外（左半分だけ模様）：近くとして出す
    const half = analyzeWindow(windowOf(24, (dx, dy) => (dx >= 5 ? circles(dx, dy) : undefined)), HANRAN);
    expect(half.at).toBeUndefined();
    expect(half.near?.px).toBeLessThanOrEqual(10);
  });
});

describe("地点のまわりの画素を読む", () => {
  it("タイルの角に近い地点は、4枚のタイルを読む（無いタイルは透明）", async () => {
    const urls: string[] = [];
    const fetchTile: TileFetcher = async (url) => {
      urls.push(url);
      if (url.endsWith("/10/20.png")) return null;
      return tile(() => rgba("#ffb7b7"));
    };
    // タイル (10, 20) の右下の角の近く
    const win = await readWindow("t/{z}/{x}/{y}.png", 17, 10 * 256 + 250, 20 * 256 + 252, 8, fetchTile);
    expect(urls.sort()).toEqual(["t/17/10/20.png", "t/17/10/21.png", "t/17/11/20.png", "t/17/11/21.png"]);
    expect(win.tiles).toBe(3);
    // 左上（無いタイル）は透明、右下は塗られている
    expect(win.data[3]).toBe(0);
    expect(win.data[win.data.length - 1]).toBe(255);
  });
});

/** URL で返すタイルを決める偽のタイル取得（無ければ 404） */
function fakeFetcher(map: Record<string, TileImage | "error">): TileFetcher & { urls: string[] } {
  const urls: string[] = [];
  const f = async (url: string) => {
    urls.push(url);
    const key = Object.keys(map).find((k) => url.includes(k));
    if (!key) return null;
    if (map[key] === "error") throw new Error("network");
    return map[key] as TileImage;
  };
  return Object.assign(f, { urls });
}

describe("地点の災害リスク", () => {
  // 江戸川区船堀（タイルの中ほど。窓は1枚に収まる）
  const LAT = 35.6838;
  const LNG = 139.8641;

  it("洪水の区域の中なら、浸水継続時間と家屋倒壊等氾濫想定区域も読む", async () => {
    const f = fakeFetcher({
      "01_flood_l2_shinsuishin_data": tile(() => rgba("#ffb7b7")),
      "01_flood_l2_keizoku_data": tile(() => rgba("#b40068")),
      "03_hightide_l2_shinsuishin_data": tile(() => rgba("#ffd8c0")),
    });
    const r = await hazardAt(LAT, LNG, f);
    expect(r.flood).toMatchObject({ status: "ok", hits: [{ at: { label: "3〜5m" } }] });
    expect(r.keizoku).toMatchObject({ status: "ok", hits: [{ at: { label: "2週間以上" } }] });
    expect(r.kaoku).toMatchObject({ status: "ok" });
    expect(r.takashio).toMatchObject({ status: "ok", hits: [{ at: { label: "0.5〜3m" } }] });
    const rows = hazardRows(r, { value: -0.8, source: "5mメッシュ（航空レーザ測量）" });
    expect(rows.map((x) => `${x.label}：${x.value}`)).toEqual([
      "洪水（想定最大規模）：浸水 3〜5m",
      "浸水継続時間（洪水・想定最大規模）：2週間以上",
      "家屋倒壊等氾濫想定区域：区域外",
      "内水（雨水出水）：国のデータなし",
      "高潮（想定最大規模）：浸水 0.5〜3m",
      "津波（想定最大規模）：区域外",
      "土砂災害警戒区域等：区域外",
      "地面の高さ（標高）：約-0.8m",
    ]);
    expect(rows.find((x) => x.kind === "elevation")?.warn).toBe(true);
    expect(hazardChips(r).map((c) => c.text)).toEqual(["洪水3〜5m", "高潮0.5〜3m"]);
  });

  it("区域の外では、浸水継続時間と家屋倒壊は読まない。内水は辺りにデータがあれば「区域外」", async () => {
    const f = fakeFetcher({ "02_naisui_data/10/": tile(() => undefined) });
    const r = await hazardAt(LAT, LNG, f);
    expect(r.keizoku).toBeUndefined();
    expect(r.kaoku).toBeUndefined();
    expect(f.urls.some((u) => u.includes("keizoku") || u.includes("kaokutoukai"))).toBe(false);
    expect(r.naisui).toEqual({ status: "ok", hits: [expect.objectContaining({ layer: HAZARDS.naisui.layers[0] })] });
    expect(hazardRows(r).map((x) => x.value)).toEqual(["区域外", "区域外", "区域外", "区域外", "区域外"]);
    expect(hazardChips(r)).toEqual([{ text: "国のデータで区域外", short: "区域外", warn: false }]);
  });

  it("土砂災害の区域と、読めなかった種類", async () => {
    const f = fakeFetcher({
      "05_kyukeishakeikaikuiki": tile(() => rgba("#fae600")),
      "05_dosekiryukeikaikuiki": tile(() => rgba("#a50021")),
      "04_tsunami_newlegend_data": "error",
    });
    const r = await hazardAt(LAT, LNG, f);
    expect(r.tsunami).toEqual({ status: "error" });
    const dosha = hazardRows(r).find((x) => x.kind === "dosha")!;
    expect(dosha.value).toBe("急傾斜地の崩壊の警戒区域／土石流の特別警戒区域");
    expect(dosha.warn).toBe(true);
    expect(hazardRows(r).find((x) => x.kind === "tsunami")?.value).toBe("読み込めませんでした");
    expect(hazardChips(r).map((c) => c.text)).toEqual(["土砂 特別警戒"]);
  });

  it("選んだ種類だけ読む（地図をクリックした地点）", async () => {
    const f = fakeFetcher({ "01_flood_l2_kaokutoukai_kagan_data": tile(() => rgba("#ff0000", 127)) });
    const r = await hazardAt(LAT, LNG, f, ["kaoku"]);
    expect(Object.keys(r)).toEqual(["kaoku"]);
    expect(hazardRows(r)[0]).toMatchObject({ value: "区域内（河岸侵食）", warn: true });
  });
});

describe("地面の高さ", () => {
  it("標高タイルの画素", () => {
    expect(demValue(0, 0, 0)).toBe(0);
    expect(demValue(0, 1, 44)).toBe(3);
    expect(demValue(128, 0, 0)).toBeNull();
    expect(demValue(255, 255, 176)).toBe(-0.8);
  });
  it("5m メッシュが無ければ 10m メッシュ", async () => {
    const f = fakeFetcher({ "/dem_png/14/": tile(() => [0, 4, 16, 255]) });
    expect(await elevationAt(35.64, 139.6, f)).toEqual({ value: 10.4, source: "10mメッシュ" });
    expect(f.urls.map((u) => u.split("/")[4])).toEqual(["dem5a_png", "dem5b_png", "dem5c_png", "dem_png"]);
  });
  it("どの標高タイルにも無ければ null", async () => {
    expect(await elevationAt(35.64, 139.6, fakeFetcher({}))).toBeNull();
  });
});

describe("市区町村のハザードマップ", () => {
  const index = HAZARD_MAPS as HazardMapIndex;
  it("政令市の区は、市のページ", () => {
    expect(hazardMapsFor(["14131"], index).flood).toBe(index.maps["14130"].flood);
    expect(hazardMapsFor(["11101"], index).flood).toBe(index.maps["11100"].flood);
  });
  it("同じページの種類はまとめる", () => {
    expect(groupHazardMaps({ flood: "a", naisui: "b", takashio: "a", dosha: "c" })).toEqual([
      { kinds: ["flood", "takashio"], url: "a" },
      { kinds: ["naisui"], url: "b" },
      { kinds: ["dosha"], url: "c" },
    ]);
  });
  it("わがまちハザードマップは市のコードで開く", () => {
    expect(wagamachiUrl("14104")).toBe("https://disaportal.gsi.go.jp/hazardmap/index.html?citycode=14100");
    expect(wagamachiUrl("13123")).toBe("https://disaportal.gsi.go.jp/hazardmap/index.html?citycode=13123");
  });
  it("一覧は関東1都6県の市区町村で、URL は http(s)", () => {
    expect(index.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const [code, maps] of Object.entries(index.maps)) {
      expect(code).toMatch(/^(0[89]|1[0-4])\d{3}$/);
      for (const url of Object.values(maps)) expect(url).toMatch(/^https?:\/\//);
    }
  });
  it("対応している市区町村のほとんどに、洪水のハザードマップのページがある", () => {
    const missing = MUNICIPALITIES.filter((m) => !hazardMapsFor(m.codes, index).flood).map((m) => m.name);
    expect(missing.length).toBeLessThan(MUNICIPALITIES.length * 0.1);
  });
});

describe("浸水継続時間のデータが無い地点", () => {
  it("洪水の区域の中なら「データなし」（区域外ではない）", async () => {
    const f = fakeFetcher({ "01_flood_l2_shinsuishin_data": tile(() => rgba("#ffd8c0")) });
    const r = await hazardAt(35.6838, 139.8641, f);
    expect(hazardRows(r).find((x) => x.kind === "keizoku")?.value).toBe("データなし");
  });
});

describe("大規模盛土造成地・液状化の発生傾向（国の地図で開く）", () => {
  it("重ねるハザードマップを物件の場所で、そのレイヤだけ重ねて開く", () => {
    const [zousei, ekijo] = groundMaps(35.525, 139.555);
    expect(zousei).toEqual({
      kind: "zousei",
      label: "大規模盛土造成地",
      url: "https://disaportal.gsi.go.jp/maps/?ll=35.525000,139.555000&z=16&base=pale&ls=daikiboumoritsuzouseichi_multi%2C0.8&disp=1&vs=c1j0l0u0t0h0z0",
    });
    expect(ekijo.label).toBe("液状化の発生傾向");
    expect(ekijo.url).toContain("&z=15&base=pale&ls=ekijouka_zenkoku%2C0.8&");
  });
});
