import { describe, expect, it } from "vitest";
import { panelHazardChips, zoningNoData } from "./panel-status";
import { hazardChips, type HazardReport } from "./roadmap/hazard";
import { zoningChips, zoningRows, type Zoning, type ZoningStatus } from "./roadmap/zoning";

/** 詳細（zoningRows）の「区域」の値 */
const zoningRowsFor = (z: Zoning, s: ZoningStatus | undefined) => ({ area: zoningRows(z, s).find((r) => r.label === "区域")?.value });

const OUT = { status: "ok" as const, hits: [] };

describe("災害リスクの行の印（スマホ）：調べられないことを「区域外」と言い切らない", () => {
  it("全部読めて、どこにもかからない：「国のデータで区域外」（PC と同じ）", () => {
    const r: HazardReport = { flood: OUT, naisui: OUT, takashio: OUT, tsunami: OUT, dosha: OUT };
    expect(panelHazardChips(r).map((c) => c.text)).toEqual(["国のデータで区域外"]);
    expect(panelHazardChips(r)).toEqual(hazardChips(r));
  });

  it("一部が読めなかった：「国のデータで区域外」と言わず「一部読み込めず」（PC の印は区域外のまま）", () => {
    const r: HazardReport = { flood: OUT, naisui: OUT, takashio: OUT, tsunami: { status: "error" }, dosha: OUT };
    expect(hazardChips(r).map((c) => c.text)).toEqual(["国のデータで区域外"]);
    const chips = panelHazardChips(r);
    expect(chips.map((c) => c.text)).toEqual(["一部読み込めず"]);
    expect(chips[0].state).toBe("fail");
  });

  it("区域にかかる種類があっても、読めなかった種類があれば「一部読み込めず」を添える", () => {
    const r = hazardWithFlood({ tsunami: { status: "error" } });
    const chips = panelHazardChips(r).map((c) => c.text);
    expect(chips[0]).toMatch(/^洪水/);
    expect(chips).toContain("一部読み込めず");
    expect(chips).not.toContain("国のデータで区域外");
  });

  it("内水の国のデータがこの辺りに無い：「内水はデータなし」を添える（区域外とは言わない）", () => {
    const r: HazardReport = { flood: OUT, naisui: { status: "ok", hits: [], noData: true }, takashio: OUT, tsunami: OUT, dosha: OUT };
    const chips = panelHazardChips(r);
    expect(chips.map((c) => c.text)).toEqual(["国のデータで区域外", "内水はデータなし"]);
    expect(chips[1].state).toBe("none");
  });
});

/** 洪水の区域にかかる報告（ほかの種類は上書きできる） */
function hazardWithFlood(extra: HazardReport): HazardReport {
  const at = { label: "3〜5m", short: "3〜5m", rank: 4, color: "#ff9191" };
  const layer = { id: "x", name: "洪水", classes: [at] } as unknown as never;
  return { flood: { status: "ok", hits: [{ layer, at } as never] }, naisui: OUT, takashio: OUT, tsunami: OUT, dosha: OUT, ...extra };
}

const NO_ZONE: Zoning = { youto: [], youtoNear: [], tokei: false, jyuntoshi: false, koudoti: false, others: [] };
const TOKEI_NO_YOUTO: Zoning = { ...NO_ZONE, tokei: true };
const st = (layers: ZoningStatus["layers"]): ZoningStatus => ({ city: "テスト市", asOf: "2024", layers });

describe("都市計画の行の先頭の印（スマホ）：詳細と同じ判定で「データなし」を言い分ける", () => {
  it("市のデータが無い（zoning-status に無い）：「都市計画区域外」ではなく「都市計画データなし」（詳細も「データなし」）", () => {
    expect(zoningChips(NO_ZONE)[0]).toBe("都市計画区域外");
    expect(zoningNoData(NO_ZONE, undefined, zoningChips(NO_ZONE)[0])).toBe("都市計画データなし");
    expect(zoningRowsFor(NO_ZONE, undefined).area).toBe("データなし");
  });

  it("市の都市計画区域のデータがある：「都市計画区域外」のまま（詳細も「都市計画区域外」）", () => {
    const s = st({ tokei: 1 });
    expect(zoningNoData(NO_ZONE, s, "都市計画区域外")).toBeUndefined();
    expect(zoningRowsFor(NO_ZONE, s).area).toBe("都市計画区域外");
  });

  it("用途地域のデータが無い市の都市計画区域：「用途地域なし」ではなく「用途地域データなし」", () => {
    const s = st({ tokei: 1, youto: 0 });
    expect(zoningChips(TOKEI_NO_YOUTO)[0]).toBe("用途地域なし");
    expect(zoningNoData(TOKEI_NO_YOUTO, s, "用途地域なし")).toBe("用途地域データなし");
    expect(zoningRows(TOKEI_NO_YOUTO, s).find((r) => r.label === "用途地域")?.value).toBe("データなし");
  });

  it("用途地域のデータがあって指定が無い：「用途地域なし」のまま", () => {
    const s = st({ tokei: 1, youto: 1 });
    expect(zoningNoData(TOKEI_NO_YOUTO, s, "用途地域なし")).toBeUndefined();
    expect(zoningRows(TOKEI_NO_YOUTO, s).find((r) => r.label === "用途地域")?.value).toBe("指定なし");
  });

  it("用途地域の印（「1種低層 50/100」など）は言い直さない", () => {
    expect(zoningNoData(TOKEI_NO_YOUTO, undefined, "1種低層 50/100")).toBeUndefined();
  });
});
