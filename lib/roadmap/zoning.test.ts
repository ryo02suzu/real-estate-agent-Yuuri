import { describe, expect, it } from "vitest";
import type { LngLat, Polygon } from "./parcel";
import STATUS from "./data/zoning-status.json";
import {
  ratioLabel,
  statusFor,
  youtoShort,
  zoningChips,
  zoningFrom,
  zoningRows,
  type ZoningFeature,
  type ZoningLayer,
  type ZoningStatus,
} from "./zoning";

// 地点のまわり（経度 139.5、緯度 35.9 付近）。1m ≒ 経度 0.0000111・緯度 0.000009
const X = 139.5;
const Y = 35.9;
const M = 0.000009;
const square = (w: number, s: number, e: number, n: number): Polygon => [
  [
    [X + w * M * 1.23, Y + s * M],
    [X + e * M * 1.23, Y + s * M],
    [X + e * M * 1.23, Y + n * M],
    [X + w * M * 1.23, Y + n * M],
    [X + w * M * 1.23, Y + s * M],
  ],
];
const area = (layer: ZoningLayer, poly: Polygon, props: ZoningFeature["props"] = {}): ZoningFeature => ({
  layer,
  props,
  geometry: () => ({ polygons: [poly], lines: [] }),
});
const line = (coords: LngLat[]): ZoningFeature => ({ layer: "douro", props: {}, geometry: () => ({ polygons: [], lines: [coords] }) });
const P: LngLat = [X, Y];
const BIG = square(-500, -500, 500, 500);

const STATUS_ALL: ZoningStatus = {
  city: "テスト市",
  asOf: "2024年3月29日",
  layers: { tokei: 1, senbiki: 1, youto: 1, bouka: 1, koudoti: 1, chikukei: 1, douro: 1 },
};

describe("地点の都市計画", () => {
  it("用途地域・建ぺい率・容積率・防火・高度地区・地区計画を拾う", () => {
    const z = zoningFrom(
      [
        area("tokei", BIG),
        area("senbiki", BIG, { name: "市街化区域" }),
        area("youto", square(-100, -100, 100, 100), { name: "第１種低層住居専用地域", code: 1, bcr: 50, far: 100 }),
        area("youto", square(100, -100, 300, 100), { name: "近隣商業地域", code: 9, bcr: 80, far: 200 }),
        area("bouka", BIG, { name: "準防火地域" }),
        area("koudoti", BIG),
        area("chikukei", square(-50, -50, 50, 50), { name: "○○地区地区計画" }),
        area("chikukei", square(-50, -50, 50, 50), { name: "○○地区地区計画" }),
      ],
      P,
    );
    expect(z.youto).toEqual([{ name: "第１種低層住居専用地域", code: 1, bcr: 50, far: 100 }]);
    expect(z.senbiki).toBe("市街化区域");
    expect(z.tokei).toBe(true);
    expect(z.bouka).toBe("準防火地域");
    expect(z.koudoti).toBe(true);
    expect(z.others).toEqual([{ layer: "chikukei", label: "地区計画", name: "○○地区地区計画" }]);
    // 隣の近隣商業は 100m 先なので「境目が近い」とは言わない
    expect(z.youtoNear).toEqual([]);
    expect(zoningChips(z)).toEqual(["1種低層 50/100", "準防火", "高度地区", "地区計画"]);
  });

  it("用途地域の境目が近いと、隣の用途地域を出す（同じ用途地域の隣の区画は出さない）", () => {
    const z = zoningFrom(
      [
        area("tokei", BIG),
        area("youto", square(-100, -100, 8, 100), { name: "第１種住居地域", code: 5, bcr: 60, far: 200 }),
        area("youto", square(-300, -100, -100, 100), { name: "第１種住居地域", code: 5, bcr: 60, far: 200 }),
        area("youto", square(8, -100, 300, 100), { name: "近隣商業地域", code: 9, bcr: 80, far: 300 }),
      ],
      P,
    );
    expect(z.youto.map((y) => y.name)).toEqual(["第１種住居地域"]);
    expect(z.youtoNear).toHaveLength(1);
    expect(z.youtoNear[0]).toMatchObject({ name: "近隣商業地域", far: 300 });
    expect(z.youtoNear[0].distance).toBeGreaterThan(6);
    expect(z.youtoNear[0].distance).toBeLessThan(10);
    const rows = zoningRows(z, STATUS_ALL);
    expect(rows.find((r) => r.label === "用途地域の境目")?.value).toMatch(/^約\dm先は近隣商業地域（80%・300%）$/);
  });

  it("都市計画道路の中心線が近ければ距離を出す", () => {
    const z = zoningFrom([area("tokei", BIG), line([[X - 0.01, Y + 12 * M], [X + 0.01, Y + 12 * M]]), line([[X - 0.01, Y + 200 * M], [X + 0.01, Y + 200 * M]])], P);
    expect(z.road).toBeGreaterThan(11);
    expect(z.road).toBeLessThan(13);
    expect(zoningRows(z, STATUS_ALL).find((r) => r.label === "都市計画道路")?.value).toBe("中心線まで約12m");
    expect(zoningFrom([area("tokei", BIG), line([[X - 0.01, Y + 60 * M], [X + 0.01, Y + 60 * M]])], P).road).toBeUndefined();
  });

  it("穴のある区域（穴の中は区域外）", () => {
    const withHole: Polygon = [square(-100, -100, 100, 100)[0], square(-10, -10, 10, 10)[0]];
    expect(zoningFrom([area("bouka", withHole, { name: "防火地域" })], P).bouka).toBeUndefined();
    expect(zoningFrom([area("bouka", withHole, { name: "防火地域" })], [X + 50 * M * 1.23, Y]).bouka).toBe("防火地域");
  });

  it("市街化調整区域・用途地域なし", () => {
    const z = zoningFrom([area("tokei", BIG), area("senbiki", BIG, { name: "市街化調整区域" })], P);
    const rows = zoningRows(z, STATUS_ALL);
    expect(rows[0]).toMatchObject({ label: "区域", value: "市街化調整区域", warn: true });
    expect(rows.find((r) => r.label === "用途地域")?.value).toBe("指定なし（市街化調整区域）");
    expect(rows.find((r) => r.label === "防火・準防火")?.value).toBe("指定なし");
    expect(zoningChips(z)[0]).toBe("調整区域");
  });

  it("データが無い都市計画は「指定なし」ではなく「データなし」", () => {
    const z = zoningFrom([area("tokei", BIG), area("youto", BIG, { name: "商業地域", code: 10 })], P);
    const st: ZoningStatus = { city: "テスト町", asOf: null, layers: { tokei: 1, senbiki: -1, youto: 1, bouka: 0, koudoti: -1, chikukei: 0 } };
    const rows = Object.fromEntries(zoningRows(z, st).map((r) => [r.label, r.value]));
    expect(rows["区域"]).toBe("都市計画区域（区域区分なし）");
    expect(rows["建ぺい率・容積率"]).toBe("データなし");
    expect(rows["防火・準防火"]).toBe("データなし");
    expect(rows["高度地区"]).toBe("指定なし");
    expect(rows["地区計画"]).toBe("データなし");
  });

  it("都市計画区域の外", () => {
    const z = zoningFrom([], P);
    expect(zoningRows(z, STATUS_ALL)).toEqual([{ label: "区域", value: "都市計画区域外", warn: false }]);
    expect(zoningRows(z, undefined)[0].value).toBe("データなし");
    expect(zoningChips(z)).toEqual(["都市計画区域外"]);
  });
});

describe("表示の言い方", () => {
  it("用途地域の短い名前", () => {
    expect(youtoShort("第１種低層住居専用地域")).toBe("1種低層");
    expect(youtoShort("第二種中高層住居専用地域")).toBe("2種中高層");
    expect(youtoShort("第1種住居地域")).toBe("1種住居");
    expect(youtoShort("準住居地域")).toBe("準住居");
    expect(youtoShort("近隣商業地域")).toBe("近隣商業");
    expect(youtoShort("田園住居地域")).toBe("田園住居");
  });

  it("建ぺい率・容積率", () => {
    expect(ratioLabel({ name: "", code: 1, bcr: 50, far: 100 })).toBe("建ぺい率50%・容積率100%");
    expect(ratioLabel({ name: "", code: 1 })).toBeUndefined();
  });
});

describe("市区町村のデータの有無", () => {
  const all = STATUS as Record<string, ZoningStatus>;
  it("政令市は区のコードから市のデータを引く", () => {
    expect(statusFor(["11101"], all)?.city).toBe("さいたま市");
    expect(statusFor(["14118"], all)?.city).toBe("横浜市");
    expect(statusFor(["14131"], all)?.city).toBe("川崎市");
    expect(statusFor(["14153"], all)?.city).toBe("相模原市");
    expect(statusFor(["12106"], all)?.city).toBe("千葉市");
  });
  it("一般の市区町村と、一覧に無い市区町村", () => {
    expect(statusFor(["13101"], all)?.city).toBe("千代田区");
    expect(statusFor(["11201"], all)?.city).toBe("川越市");
    expect(statusFor(["99999"], all)).toBeUndefined();
  });
  it("関東1都6県の市区町村の大半が載っている", () => {
    expect(Object.keys(all).length).toBeGreaterThan(280);
    expect(Object.keys(all).every((k) => /^(08|09|10|11|12|13|14)\d{3}$/.test(k))).toBe(true);
  });
});
