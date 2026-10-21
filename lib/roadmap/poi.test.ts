import { open } from "node:fs/promises";
import type { Source } from "pmtiles";
import { describe, expect, it } from "vitest";
import { buildDraft, draftText } from "../draft";
import { buildSummary } from "../summary";
import { buildLinks, findMunicipality } from "./index";
import type { LngLat } from "./parcel";
import { nearbyPois, nearestPois, poiCredit, poiLine, poiWalkText, POI_EXTRA, POI_KINDS, POI_ORDER, POI_ZOOM, type Poi, type PoiSource, type PoiWalk } from "./poi";
import SRC from "./data/poi-source.json";
import { decodePoiTile, poiTileSource } from "./poi-tiles";
import { ROAD_CREDIT } from "./walk";

// 緯度 35.5・経度 139.6 のあたり。1m ≒ 経度 0.0000110・緯度 0.0000090
const X = 139.6;
const Y = 35.5;
const mx = 1 / (111_320 * Math.cos((Y * Math.PI) / 180));
const my = 1 / 110_950;
const at = (e: number, n: number): LngLat => [X + e * mx, Y + n * my];

function tileOf(lng: number, lat: number): string {
  const n = 2 ** POI_ZOOM;
  const r = (lat * Math.PI) / 180;
  return `${Math.floor(((lng + 180) / 360) * n)}/${Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)}`;
}

/** 施設をタイルに振り分ける偽のデータ（読んだタイルを覚える） */
function fakeSource(pois: Poi[]): PoiSource & { read: string[] } {
  const byTile = new Map<string, Poi[]>();
  for (const p of pois) {
    const k = tileOf(...p.at);
    byTile.set(k, [...(byTile.get(k) ?? []), p]);
  }
  const read: string[] = [];
  return {
    read,
    tile: async (x, y) => {
      read.push(`${x}/${y}`);
      return byTile.get(`${x}/${y}`) ?? null;
    },
  };
}

/** 道のりは直線の factor 倍（id ごとに変えられる） */
const fakeWalk =
  (factor: (id: number) => number | undefined = () => 1.3) =>
  async (lat: number, lng: number, targets: { id: number; points: LngLat[] }[]) => {
    const out = new Map<number, number>();
    for (const t of targets) {
      const f = factor(t.id);
      if (f === undefined) continue;
      const [lng2, lat2] = t.points[0];
      out.set(t.id, Math.hypot((lng2 - lng) / mx, (lat2 - lat) / my) * f);
    }
    return out;
  };

describe("周辺施設", () => {
  it("物件のまわりのタイル（範囲がかかる隣のタイルも）を読み、1.2km より遠い施設は入れない", async () => {
    const src = fakeSource([
      { kind: 1, name: "近いスーパー", at: at(300, 0) },
      { kind: 1, name: "遠いスーパー", at: at(1500, 0) },
      { kind: 2, name: "隣のタイルのコンビニ", at: at(0, 1100) },
    ]);
    const got = await nearbyPois(Y, X, src);
    expect(got.map((p) => p.name)).toEqual(["近いスーパー", "隣のタイルのコンビニ"]);
    expect(got[0].straight).toBeCloseTo(300, -1);
    // z14 のタイルは約2km四方なので、1.2km の範囲は 2×2〜3×3 枚
    expect(src.read.length).toBeGreaterThanOrEqual(4);
    expect(src.read.length).toBeLessThanOrEqual(9);
  });

  it("種類ごとにいちばん近い施設（道のり）を、販売図面に書く順に並べる", async () => {
    const src = fakeSource([
      { kind: 6, name: "中央公園", at: at(0, 200) },
      { kind: 2, name: "コンビニ 駅前店", at: at(400, 0) },
      { kind: 1, name: "スーパー 本町店", at: at(-300, 0) },
      { kind: 2, name: "コンビニ 本町店", at: at(0, -250) },
    ]);
    const pois = await nearestPois(Y, X, src, fakeWalk());
    expect(pois.map((w) => `${w.label} ${w.name}`)).toEqual(["スーパー スーパー 本町店", "コンビニ コンビニ 本町店", "公園 中央公園"]);
    expect(pois[0]).toMatchObject({ kind: 1, routed: true, minutes: 5 });
    expect(pois[0].meters).toBeCloseTo(390, -1); // 300m × 1.3
    expect(pois.map((w) => w.kind)).toEqual(POI_ORDER.filter((k) => [1, 2, 6].includes(k)));
  });

  it("直線では近くても道のりで遠回りなら、道のりの近い方を選ぶ", async () => {
    const src = fakeSource([
      { kind: 1, name: "川の向こうのスーパー", at: at(200, 0) },
      { kind: 1, name: "道沿いのスーパー", at: at(0, 350) },
    ]);
    // 川の向こう（id 0）は道のりが直線の 2.5 倍
    const pois = await nearestPois(Y, X, src, fakeWalk((id) => (id === 0 ? 2.5 : 1.2)));
    expect(pois[0].name).toBe("道沿いのスーパー");
  });

  it("道がつながらない（遠回りすぎる・道のりが無い）ときは直線距離の目安にする", async () => {
    const src = fakeSource([{ kind: 4, name: "市民病院", at: at(500, 0) }]);
    const none = await nearestPois(Y, X, src, fakeWalk(() => undefined));
    expect(none[0]).toMatchObject({ routed: false, name: "市民病院" });
    expect(poiWalkText(none[0])).toBe("直線約500m");
    const far = await nearestPois(Y, X, src, fakeWalk(() => 4));
    expect(far[0].routed).toBe(false);
    // 道路のタイルが読めないときも
    const failed = await nearestPois(Y, X, src, async () => Promise.reject(new Error("offline")));
    expect(failed[0].routed).toBe(false);
  });

  it("同じ名前の施設（チェーン店の点と面など）は近い方だけを候補にする", async () => {
    const src = fakeSource([
      { kind: 2, name: "コンビニ", at: at(100, 0) },
      { kind: 2, name: "コンビニ", at: at(110, 0) },
      { kind: 2, name: "別のコンビニ", at: at(0, 150) },
    ]);
    const seen: number[] = [];
    await nearestPois(Y, X, src, async (lat, lng, targets) => {
      seen.push(targets.length);
      return fakeWalk()(lat, lng, targets);
    });
    expect(seen).toEqual([2]);
  });

  it("近くに施設が無ければ空（道のりは調べない）", async () => {
    let called = false;
    const pois = await nearestPois(Y, X, fakeSource([]), async () => {
      called = true;
      return new Map();
    });
    expect(pois).toEqual([]);
    expect(called).toBe(false);
  });

  it("徒歩の文字（80m を1分・切り上げ。10m 単位、1km からは 0.1km 単位）", () => {
    const w = (meters: number, routed = true): PoiWalk => ({ kind: 1, label: "スーパー", name: "〇〇ストア", meters, minutes: Math.max(1, Math.ceil(meters / 80)), straight: meters, routed });
    expect(poiWalkText(w(452))).toBe("徒歩約6分（約450m）");
    expect(poiWalkText(w(3))).toBe("徒歩約1分（約10m）");
    expect(poiWalkText(w(1234))).toBe("徒歩約16分（約1.2km）");
    expect(poiLine(w(452))).toBe("スーパー：〇〇ストア 徒歩約6分（約450m）");
  });

  it("種類の番号はタイルを作るスクリプトと同じ（生活環境の12種類と飲食店・順番にすべて入る）", () => {
    expect(Object.keys(POI_KINDS).map(Number).sort((a, b) => a - b)).toEqual([...POI_ORDER, ...POI_EXTRA].sort((a, b) => a - b));
    expect(POI_ORDER).toHaveLength(12);
    expect(POI_EXTRA).toEqual([13]);
  });
});

describe("周辺施設のタイル", () => {
  it("点の地物を経度・緯度に戻し、種類（c）と名前（n）を読む。名前の無い・種類の分からない点は入れない", () => {
    // z14 の (14552, 6451) のタイル。extent 4096 の真ん中の点と、左上の点
    const tile = encodeTile([
      { c: 1, n: "〇〇ストア", x: 2048, y: 2048 },
      { c: 2, n: "△△マート", x: 0, y: 0 },
      { c: 99, n: "知らない種類", x: 10, y: 10 },
      { c: 3, n: "", x: 20, y: 20 },
    ]);
    const pois = decodePoiTile(tile, 14552, 6451);
    expect(pois.map((p) => [p.kind, p.name])).toEqual([
      [1, "〇〇ストア"],
      [2, "△△マート"],
    ]);
    const n = 2 ** POI_ZOOM;
    const lng0 = (14552 / n) * 360 - 180;
    const lat0 = (Math.atan(Math.sinh(Math.PI * (1 - (2 * 6451) / n))) * 180) / Math.PI;
    expect(pois[1].at[0]).toBeCloseTo(lng0, 6);
    expect(pois[1].at[1]).toBeCloseTo(lat0, 6);
    expect(pois[0].at[0]).toBeCloseTo(lng0 + 360 / n / 2, 6);
  });
});

describe("周辺施設を下書き・共有に書く", () => {
  const m = findMunicipality("14109")!; // 横浜市港北区
  const result = {
    status: "ok" as const,
    lat: 35.5,
    lng: 139.6,
    matchedAddress: "神奈川県横浜市港北区大豆戸町",
    town: "大豆戸町",
    approximate: false,
    municipality: m,
    links: buildLinks(m, 35.5, 139.6),
  };
  const pois: PoiWalk[] = [
    { kind: 1, label: "スーパー", name: "〇〇ストア 菊名店", meters: 452, minutes: 6, straight: 380, routed: true },
    { kind: 6, label: "公園", name: "大豆戸公園", meters: 900, minutes: 12, straight: 900, routed: false },
  ];

  it("下書きに「周辺環境」の欄を足し、確かめる旨を1行（要確認）と OpenStreetMap の出典を付ける", () => {
    const draft = buildDraft(result, { pois });
    const env = draft.find((s) => s.title.startsWith("周辺環境"))!;
    expect(env.rows.map((r) => `${r.label}：${r.value}`)).toEqual([
      "スーパー：〇〇ストア 菊名店 徒歩約6分（約450m）",
      "公園：大豆戸公園 直線約900m",
      expect.stringMatching(/^注意：施設の位置までの道路距離の目安/),
    ]);
    expect(env.rows.filter((r) => r.check)).toHaveLength(1);
    const credits = draft.find((s) => s.title === "出典")!.rows.map((r) => r.value);
    expect(credits).toContain(poiCredit(true));
    expect(poiCredit(true)).toBe(`周辺施設：© OpenStreetMap contributors（ODbL）を加工して作成。${ROAD_CREDIT}`);
    expect(draftText(draft)).toContain("■周辺環境（販売図面の生活環境・参考）\nスーパー：〇〇ストア 菊名店 徒歩約6分（約450m）");
  });

  it("駅の出典に道のりの出典があれば、周辺施設の出典では繰り返さない", () => {
    const station = { name: "菊名", lines: [["東横線", "東急電鉄"]] as [string, string][], meters: 640, minutes: 8, straight: 500, routed: true };
    const credits = buildDraft(result, { pois, stations: [station] })
      .find((s) => s.title === "出典")!
      .rows.map((r) => r.value);
    expect(credits).toContain(poiCredit(false));
    expect(credits.filter((c) => c.includes(ROAD_CREDIT))).toHaveLength(1);
  });

  it("共有の文に施設の一覧と出典・注意を入れる。施設が無ければ何も足さない", () => {
    const text = buildSummary(result, { pois });
    expect(text).toContain("【周辺施設（徒歩の目安・道路距離 80m を1分）】\n・スーパー：〇〇ストア 菊名店 徒歩約6分（約450m）\n・公園：大豆戸公園 直線約900m");
    expect(text).toContain(`※周辺施設は© OpenStreetMap contributors（ODbL）を加工して作成。${ROAD_CREDIT}。`);
    expect(buildSummary(result, { pois: [] })).not.toContain("周辺施設");
    expect(buildDraft(result, { pois: [] }).some((s) => s.title.startsWith("周辺環境"))).toBe(false);
  });
});

// アプリに入っている施設のタイル（public/data/）を実際に読む（作り直したデータが壊れていないか）
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

describe.skipIf(!SRC.url)("アプリに入っている周辺施設のタイル", () => {
  const src = () => poiTileSource(fileSource(`public${SRC.url}`));
  it("渋谷区役所・熊谷市役所のまわりに、役所・コンビニ・郵便局がある（種類の番号と名前が読める）", async () => {
    const shibuya = await nearbyPois(35.6618, 139.6981, src(), 800); // 渋谷区役所
    expect(shibuya.some((p) => p.kind === 10 && p.name.includes("渋谷区役所"))).toBe(true);
    expect(shibuya.some((p) => p.kind === 2)).toBe(true);
    const kumagaya = await nearbyPois(36.1473, 139.3886, src(), 600); // 熊谷市役所
    expect(kumagaya.some((p) => p.kind === 10 && p.name.includes("熊谷市役所"))).toBe(true);
    expect(kumagaya.some((p) => p.kind === 7)).toBe(true);
  });

  it("どの種類も入っていて、名前の付け違い（動物病院・整骨院・政策金融公庫）は入っていない", async () => {
    for (const k of POI_ORDER) expect(SRC.counts[String(k) as keyof typeof SRC.counts], POI_KINDS[k]).toBeGreaterThan(500);
    // 飲食店は、タイルを作り直したデータから入る（作り直す前のデータには無い）
    const counts = SRC.counts as Record<string, number>;
    for (const k of POI_EXTRA) if (counts[String(k)] !== undefined) expect(counts[String(k)], POI_KINDS[k]).toBeGreaterThan(500);
    const around = await nearbyPois(35.6618, 139.6981, src(), 1200);
    expect(around.filter((p) => (p.kind === 4 || p.kind === 5) && /動物|整骨|接骨/.test(p.name))).toEqual([]);
    expect(around.filter((p) => p.kind === 8 && /公庫/.test(p.name))).toEqual([]);
  });
});

/** テスト用に、点の地物のベクトルタイル（MVT）を作る（レイヤ poi、extent 4096、属性 c・n） */
function encodeTile(points: { c: number; n: string; x: number; y: number }[]): Uint8Array {
  const out: number[] = [];
  const varint = (buf: number[], v: number) => {
    while (v > 127) {
      buf.push((v & 127) | 128);
      v = Math.floor(v / 128);
    }
    buf.push(v);
  };
  const key = (buf: number[], field: number, wire: number) => varint(buf, (field << 3) | wire);
  const bytes = (buf: number[], field: number, data: number[]) => {
    key(buf, field, 2);
    varint(buf, data.length);
    buf.push(...data);
  };
  const str = (s: string) => [...new TextEncoder().encode(s)];
  const zz = (v: number) => (v << 1) ^ (v >> 31);
  const layer: number[] = [];
  bytes(layer, 1, str("poi"));
  // 値の表：c の値（整数）と n の値（文字）を順に並べる
  const values: number[][] = [];
  const features: number[][] = [];
  for (const p of points) {
    const f: number[] = [];
    const cIdx = values.length;
    const cv: number[] = [];
    key(cv, 4, 0); // int_value
    varint(cv, p.c);
    values.push(cv);
    const nIdx = values.length;
    const nv: number[] = [];
    bytes(nv, 1, str(p.n)); // string_value
    values.push(nv);
    const tags: number[] = [];
    varint(tags, 0);
    varint(tags, cIdx);
    varint(tags, 1);
    varint(tags, nIdx);
    bytes(f, 2, tags);
    key(f, 3, 0);
    varint(f, 1); // POINT
    const geom: number[] = [];
    varint(geom, (1 << 3) | 1); // MoveTo ×1
    varint(geom, zz(p.x));
    varint(geom, zz(p.y));
    bytes(f, 4, geom);
    features.push(f);
  }
  for (const f of features) bytes(layer, 2, f);
  bytes(layer, 3, str("c"));
  bytes(layer, 3, str("n"));
  for (const v of values) bytes(layer, 4, v);
  key(layer, 5, 0);
  varint(layer, 4096);
  key(layer, 15, 0);
  varint(layer, 2);
  bytes(out, 3, layer);
  return new Uint8Array(out);
}
