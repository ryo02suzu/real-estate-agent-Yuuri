import { describe, expect, it } from "vitest";
import type { Zoning } from "../roadmap/zoning";
import { buildingNotes, roadWidthOf, shadeRule, slopeRule, zoneGroup } from "./legal";

const zoning = (over: Partial<Zoning> = {}): Zoning => ({ youto: [], youtoNear: [], tokei: true, jyuntoshi: false, koudoti: false, others: [], ...over });

describe("法令・規制の一般的なルールの目安", () => {
  it("用途地域のまとまり（全角・半角の数字や第1種の書き方も）", () => {
    expect(zoneGroup("第１種低層住居専用地域")).toBe("low");
    expect(zoneGroup("田園住居地域")).toBe("low");
    expect(zoneGroup("第二種中高層住居専用地域")).toBe("midHigh");
    expect(zoneGroup("準住居地域")).toBe("res");
    expect(zoneGroup("近隣商業地域")).toBe("nearCom");
    expect(zoneGroup("商業地域")).toBe("com");
    expect(zoneGroup("準工業地域")).toBe("semiInd");
    expect(zoneGroup("工業専用地域")).toBe("indOnly");
    expect(zoneGroup("工業地域")).toBe("ind");
    expect(zoneGroup(undefined)).toBe("none");
  });

  it("斜線：低層は隣地斜線なし・北側斜線あり、商業は北側斜線なし", () => {
    expect(slopeRule("low", false).value).toBe("道路斜線・北側斜線");
    expect(slopeRule("com", false)).toEqual({ value: "道路斜線・隣地斜線", sub: "北側斜線はかかりません" });
    expect(slopeRule("midHigh", true).sub).toContain("高度地区");
  });

  it("日影：商業・工業・工業専用は対象外、近隣商業・準工業は高さ10m超が対象、低層は7m・3階", () => {
    expect(shadeRule("com").value).toBe("対象外");
    expect(shadeRule("ind").value).toBe("対象外");
    expect(shadeRule("nearCom").sub).toContain("高さ10m超");
    expect(shadeRule("semiInd").sub).toContain("高さ10m超");
    expect(shadeRule("low").sub).toContain("7m");
  });

  it("道路の幅は小さい方の数値", () => {
    expect(roadWidthOf("4.0〜4.5m")).toBe(4);
    expect(roadWidthOf("６ｍ")).toBe(6);
    expect(roadWidthOf(undefined)).toBeUndefined();
  });

  it("商業地域・防火地域・建ぺい率80%：耐火なら建ぺい率の制限なし。前面道路4mなら容積率240%の目安", () => {
    const notes = buildingNotes({
      zoning: zoning({ youto: [{ name: "商業地域", code: 10, bcr: 80, far: 500 }], senbiki: "市街化区域", bouka: "防火地域" }),
      roads: [{ label: "法第42条第1項第1号道路", short: "1項1号", distance: 3, direction: "北", width: "4.0〜4.5m" }],
    });
    const by = Object.fromEntries(notes.map((n) => [n.title, n.body]));
    expect(by["防火地域での建築制限"]).toContain("耐火建築物等");
    expect(by["容積率の上限"]).toContain("幅×0.6");
    expect(by["容積率の上限"]).toContain("近くの道路の幅4mなら240%と500%の小さい方");
    expect(by["建ぺい率の緩和"]).toContain("建ぺい率の制限がかかりません");
    expect(by["高さの制限"]).toContain("日影規制：対象外");
  });

  it("注意が要るもの（調整区域・計画道路・境目・地区計画・旧耐震）を先に並べる", () => {
    const notes = buildingNotes({
      zoning: zoning({
        youto: [{ name: "第一種低層住居専用地域", code: 1, bcr: 50, far: 100 }],
        senbiki: "市街化調整区域",
        road: 12.4,
        youtoNear: [{ name: "第一種住居地域", code: 5, distance: 8, bcr: 60, far: 200 }],
        others: [{ layer: "chikukei", label: "地区計画", name: "〇〇地区" }],
      }),
      buildingYear: 1978,
    });
    expect(notes.slice(0, 5).map((n) => n.title)).toEqual(["市街化調整区域", "都市計画道路が近い", "用途地域の境目", "地区計画の区域", "建物の建築年"]);
    expect(notes.find((n) => n.title === "容積率の上限")!.body).toContain("幅×0.4（住居系）");
    expect(notes.find((n) => n.title === "防火の指定")!.body).toContain("法22条区域");
  });
});
