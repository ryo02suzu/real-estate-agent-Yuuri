import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import SRC from "./data/station-source.json";
import type { LngLat } from "./parcel";
import { lineLabel, nearbyStations, nearestStations, stationLine, walkDistances, walkMinutes, type Station } from "./walk";

// 緯度 35.5・経度 139.6 のあたり。1m ≒ 経度 0.0000110・緯度 0.0000090
const X = 139.6;
const Y = 35.5;
const mx = 1 / (111_320 * Math.cos((Y * Math.PI) / 180));
const my = 1 / 110_950;
const at = (e: number, n: number): LngLat => [X + e * mx, Y + n * my];

describe("徒歩の道のり", () => {
  it("道路に沿った距離（道路に出るまで・道路から駅までの直線も足す）", () => {
    // 東西の道（北 0m）と、東 300m で北へ曲がる道。駅は東 300m・北 200m の道の脇（東 10m）
    const lines = [
      [at(-50, 0), at(300, 0)],
      [at(300, 0), at(300, 250)],
    ];
    const d = walkDistances(lines, at(0, -20), [{ id: 1, points: [at(310, 200)] }]);
    // 20（道路へ）+ 300 + 200 + 10（駅へ）
    expect(d.get(1)).toBeCloseTo(530, -1);
  });

  it("タイルの境で切れた線の端は、2m 以内ならつなぐ。つながらない駅は入れない", () => {
    const lines = [
      [at(0, 0), at(100, 0)],
      [at(101.5, 0), at(200, 0)],
      // 離れた所の道（つながっていない）
      [at(0, 500), at(100, 500)],
    ];
    const d = walkDistances(lines, at(0, 0), [
      { id: 1, points: [at(200, 0)] },
      { id: 2, points: [at(50, 500)] },
    ]);
    expect(d.get(1)).toBeCloseTo(200, -1);
    expect(d.has(2)).toBe(false);
  });

  it("駅の点が複数あれば、いちばん近い点まで", () => {
    const lines = [[at(0, 0), at(1000, 0)]];
    const d = walkDistances(lines, at(0, 0), [{ id: 1, points: [at(900, 0), at(400, 0)] }]);
    expect(d.get(1)).toBeCloseTo(400, -1);
  });

  it("徒歩の分数は 80m を1分・切り上げ。路線の呼び方", () => {
    expect([walkMinutes(0), walkMinutes(80), walkMinutes(81), walkMinutes(640), walkMinutes(641)]).toEqual([1, 1, 2, 8, 9]);
    expect(lineLabel(["東横線", "東急"])).toBe("東急東横線");
    expect(lineLabel(["横浜線", "JR東日本"])).toBe("JR横浜線");
    expect(lineLabel(["京王線", "京王"])).toBe("京王線");
    expect(lineLabel(["相鉄新横浜線", "相鉄"])).toBe("相鉄新横浜線");
    expect(lineLabel(["つくばエクスプレス", "つくばエクスプレス"])).toBe("つくばエクスプレス");
    expect(lineLabel(["ブルーライン", "横浜市営"])).toBe("横浜市営ブルーライン");
    expect(
      stationLine({ name: "菊名", lines: [["東横線", "東急"], ["横浜線", "JR東日本"]], meters: 612, minutes: 8, straight: 480, routed: true }),
    ).toBe("菊名駅（東急東横線・JR横浜線）徒歩約8分（約610m）");
    expect(stationLine({ name: "菊名", lines: [["東横線", "東急"]], meters: 1480, minutes: 19, straight: 1480, routed: false })).toBe("菊名駅（東急東横線）直線約1.5km");
  });
});

// アプリに入っている駅のデータ（public/data/）
const STATIONS = (JSON.parse(readFileSync(`public${SRC.url}`, "utf-8")) as { stations: Station[] }).stations;

describe("アプリに入っている駅のデータ", () => {
  it("station-source.json のファイルがあり、関東の駅が入っている", () => {
    expect(SRC.url).toMatch(/^\/data\/stations-\d{4}\.json$/);
    expect(SRC.count).toBeGreaterThan(2000);
    const names = new Set(STATIONS.map((s) => s.n));
    for (const n of ["新宿", "大宮", "千葉", "横浜", "菊名", "水戸", "宇都宮", "高崎"]) expect(names.has(n)).toBe(true);
    // 新幹線は路線に入れない
    expect(STATIONS.some((s) => s.l.some(([l]) => l.includes("新幹線")))).toBe(false);
  });

  it("横浜市港北区大豆戸町の近くの駅（直線）に菊名・大倉山・新横浜", () => {
    const near = nearbyStations(35.5146, 139.6218, STATIONS).map((n) => n.station.n);
    for (const n of ["菊名", "大倉山", "新横浜"]) expect(near).toContain(n);
  });
});

// 国土地理院のタイルで実際に道のりを求める（ネットにつなぐので WALK_LIVE=1 のときだけ）
describe.skipIf(!process.env.WALK_LIVE)("最寄り駅（国土地理院の道路で）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("横浜市港北区大豆戸町・新宿区西新宿（都庁）", { timeout: 120_000 }, async () => {
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      url.startsWith("/data/") ? Promise.resolve(new Response(readFileSync(`public${url}`))) : real(url, init),
    );
    for (const [name, lat, lng] of [
      ["大豆戸町", 35.5146, 139.6218],
      ["都庁", 35.68948, 139.69172],
    ] as const) {
      const r = await nearestStations(lat, lng);
      console.log(name, r.map((s) => `${stationLine(s)}（直線${Math.round(s.straight)}m）`).join(" / "));
      expect(r.length).toBeGreaterThan(0);
      expect(r[0].routed).toBe(true);
      // 道のりは直線より長く、直線の2倍よりは短いのがふつう
      expect(r[0].meters).toBeGreaterThanOrEqual(r[0].straight);
      expect(r[0].meters).toBeLessThan(r[0].straight * 2 + 200);
    }
  });
});
