import { describe, expect, it } from "vitest";
import { buildLinks, findMunicipality, MUNICIPALITIES, resolveContact } from "../roadmap";
import type { HazardReport } from "../roadmap/hazard";
import { HAZARDS } from "../roadmap/hazard";
import type { Parcel } from "../roadmap/parcel";
import type { Zoning, ZoningStatus } from "../roadmap/zoning";
import { triageLines, triageOf, type TriageInput } from "./triage";

const m = findMunicipality("13113")!; // 渋谷区
const base = {
  status: "ok" as const,
  lat: 35.6629,
  lng: 139.6994,
  matchedAddress: "東京都渋谷区神南一丁目１９番１１号",
  town: "神南一丁目",
  approximate: false,
  municipality: m,
  links: buildLinks(m, 35.6629, 139.6994),
  contact: resolveContact(m, "13113"),
};
const zoning: Zoning = { youto: [{ name: "商業地域", code: 9, bcr: 80, far: 500 }], youtoNear: [], senbiki: "市街化区域", tokei: true, jyuntoshi: false, bouka: "防火地域", koudoti: true, others: [{ layer: "chikukei", label: "地区計画", name: "神南地区地区計画" }] };
const st: ZoningStatus = { city: "渋谷区", asOf: "2024年", layers: { senbiki: 1, youto: 1, bouka: 1, koudoti: 1, chikukei: 1, tokei: 1 } };
const parcel: Parcel = { kuiki: "渋谷区_神南_１丁目__", chiban: "51-3", chibanRaw: "51-3", pieces: [], point: { lat: 35.6629, lng: 139.6994 } };

const flood = HAZARDS.flood.layers[0];
const depth = (rank: number) => flood.classes.find((c) => c.rank === rank)!;
const report: HazardReport = {
  flood: { status: "ok", hits: [{ layer: flood, at: depth(4) }] },
  naisui: { status: "ok", hits: [], noData: true },
  takashio: { status: "ok", hits: [] },
  tsunami: { status: "ok", hits: [{ layer: HAZARDS.tsunami.layers[0], near: { cls: depth(2), distance: 6 } }] },
  dosha: { status: "ok", hits: [] },
  kaoku: { status: "ok", hits: [] },
  keizoku: { status: "ok", hits: [] },
};

const loaded = (over: Partial<TriageInput> = {}): TriageInput => ({
  result: base,
  zoning: { status: "ok", zoning, st },
  parcels: { status: "ok", parcel, kind: "chiban", neighbors: ["渋谷区神南１丁目 51-2", "渋谷区神南１丁目 52"] },
  roads: { status: "ok", roads: [{ label: "法第42条第2項道路", short: "2項道路", distance: 3, direction: "南", width: "3.6〜4.0m" }] },
  hazard: { status: "ok", report, maps: { flood: "https://example.com/flood" }, muniCd: "13113" },
  building: { status: "ok", result: { hit: { building: { year: 1975, usage: "事務所", above: 5 }, distance: 0 }, others: [] } as never },
  liq: { status: "ok", value: { level: 2, label: "液状化しやすい", tone: "high", landform: "三角州・海岸低地", landformCode: 15, mesh: "5339" } },
  zousei: { status: "ok", value: { inside: false, areas: [] } },
  rireki: { status: "ok", value: [] },
  ...over,
});

describe("要注意点（問題になりそうな所）", () => {
  it("データで見つかった制限・危険を要注意、確かめないと分からない所を要確認にして、要注意を先に並べる", () => {
    const t = triageOf(loaded());
    const ids = t.issues.map((i) => `${i.level}:${i.id}`);
    expect(ids).toEqual([
      "warn:road-2kou",
      "warn:chikukei",
      "warn:bouka",
      "warn:hazard-flood",
      "warn:liq",
      "warn:old-building",
      "check:koudoti",
      "check:hazard-naisui-nodata",
      "check:hazard-tsunami-near",
    ]);
    expect(t.headline).toBe("要注意 6件・要確認 3件");
    expect(t.pending).toEqual([]);
    expect(t.issues[0].detail).toContain("セットバック");
    expect(t.issues.find((i) => i.id === "hazard-flood")!.title).toBe("洪水の浸水想定区域（0.5〜3m）");
  });

  it("読んでいる途中は「確認中」と言い、問題なしとは言わない", () => {
    const t = triageOf(loaded({ zoning: { status: "loading" }, hazard: { status: "loading" }, roads: { status: "loading" }, parcels: { status: "loading" }, building: { status: "loading" }, liq: { status: "loading" }, rireki: undefined, zousei: undefined }));
    expect(t.pending).toEqual(["都市計画・法令", "地番", "道路種別", "ハザード", "建物", "液状化"]);
    expect(t.issues).toEqual([]);
    expect(t.headline).toBe("確認中");
    expect(triageLines(t)[1]).toBe("・都市計画・法令・地番・道路種別・ハザード・建物・液状化を確認中");
  });

  it("読めなかったデータは要確認にし、読めなかったデータの一覧にも入れる", () => {
    const t = triageOf(loaded({ zoning: { status: "error" }, hazard: { status: "error" } }));
    expect(t.issues.map((i) => i.id)).toContain("zoning-error");
    expect(t.issues.map((i) => i.id)).toContain("hazard-error");
    expect(t.failed).toEqual(["都市計画・法令", "ハザード"]);
  });

  it("住所の地点の筆：道路の上・隣地の多い筆・ふつうの筆をそれぞれ要確認に", () => {
    const at = (chibanRaw: string, n = 2) => triageOf(loaded({ parcels: { status: "ok", parcel: { ...parcel, chibanRaw }, kind: "address", neighbors: Array.from({ length: n }, (_, i) => `渋谷区神南１丁目 ${i + 1}`) } })).issues.map((i) => i.id);
    expect(at("道-5")).toContain("on-road");
    expect(at("51-3", 40)).toContain("off-lot");
    expect(at("51-3")).toContain("address-parcel");
    // 町の中心（筆を探していない）
    const town = triageOf(loaded({ result: { ...base, approximate: true }, parcels: { status: "none", approximate: true } }));
    expect(town.issues.map((i) => i.id)).toContain("approximate");
    expect(town.issues.map((i) => i.id)).not.toContain("no-parcel");
  });

  it("市街化調整区域・農用地区域・盛土規制区域は要注意で、確かめる先を添える", () => {
    const t = triageOf(
      loaded({
        zoning: {
          status: "ok",
          zoning: { ...zoning, senbiki: "市街化調整区域", youto: [], bouka: undefined, koudoti: false, others: [] },
          st,
          morido: { area: { kind: "宅地造成等工事規制区域", pref: "13" } as never, authority: "東京都" },
          tochi: { agri: "農用地区域", year: 2015 },
        },
      }),
    );
    const by = Object.fromEntries(t.issues.map((i) => [i.id, i]));
    expect(by.senbiki.level).toBe("warn");
    expect(by.senbiki.confirm).toContain("開発許可");
    expect(by.morido.title).toBe("宅地造成等工事規制区域");
    expect(by.agri.confirm).toBe("渋谷区の農業委員会で");
  });
});

describe("次にやること", () => {
  it("道路・謄本・ハザード・上下水道・現地は必ず入り、優先の順に並ぶ。物件の注意に合わせて聞くことが増える", () => {
    const t = triageOf(loaded());
    const ids = t.actions.map((a) => `${a.priority}:${a.id}`);
    expect(ids.slice(0, 7)).toEqual(["1:road", "1:touki", "1:hazard", "1:utility", "1:building", "1:site", "2:toshi"]);
    const road = t.actions.find((a) => a.id === "road")!;
    expect(road.what[0]).toContain("セットバック");
    expect(road.where).toBe("渋谷区 都市整備部 建築課 調査係");
    expect(road.phone).toBe("03-3463-2734");
    expect(road.how).toContain("電話・FAX・メールでは答えてもらえない");
    expect(road.links?.length).toBeGreaterThan(0);
    const touki = t.actions.find((a) => a.id === "touki")!;
    expect(touki.what[0]).toBe("登記事項証明書（土地）：渋谷区神南１丁目 51-3。所有者・地目・地積・抵当権");
    expect(touki.what.at(-1)).toContain("隣地の地番");
    const toshi = t.actions.find((a) => a.id === "toshi")!;
    expect(toshi.what).toEqual(["高度地区の種類と高さの制限", "地区計画の内容（用途・高さ・壁面の位置・最低敷地面積・届出）"]);
    const hazard = t.actions.find((a) => a.id === "hazard")!;
    expect(hazard.links?.[0].url).toBe("https://example.com/flood");
    expect(hazard.what.at(-1)).toContain("洪水の浸水想定区域（0.5〜3m）");
    const b = t.actions.find((a) => a.id === "building")!;
    expect(b.what.at(-1)).toContain("耐震診断");
  });

  it("市街化調整区域なら「建てられるか」を先に確かめる項目が入る", () => {
    const t = triageOf(loaded({ zoning: { status: "ok", zoning: { ...zoning, senbiki: "市街化調整区域" }, st } }));
    const a = t.actions.find((x) => x.id === "chosei")!;
    expect(a.priority).toBe(1);
    expect(a.where).toBe("渋谷区の開発許可（都市計画）の担当課");
  });

  it("道路種別がネット非公開の市は、窓口で確かめる前提の案内になる", () => {
    const none = MUNICIPALITIES.find((x) => x.coverage === "none" && x.contact)!;
    const r = { ...base, municipality: none, links: buildLinks(none, 35.7, 139.98), contact: resolveContact(none, none.codes[0]) };
    const t = triageOf(loaded({ result: r, roads: { status: "none" } }));
    expect(t.issues.map((i) => i.id)).toContain("coverage-none");
    expect(t.actions.find((a) => a.id === "road")!.how).toContain("ネットでは非公開");
  });

  it("共有・印刷の行：要注意は▲、要確認は・、やることは済んだものに☑", () => {
    const t = triageOf(loaded());
    const lines = triageLines(t, new Set(["touki"]));
    expect(lines[0]).toBe("【要注意点】要注意 6件・要確認 3件");
    expect(lines[1]).toBe("▲前面道路が2項道路（幅4m未満）の可能性（セットバックの位置・距離と中心線の確定を窓口で）");
    expect(lines).toContain("□前面道路の種別と幅員を確かめる：渋谷区 都市整備部 建築課 調査係 03-3463-2734");
    expect(lines).toContain("☑謄本・公図を取る：法務局（登記情報提供サービスでも可）");
  });
});
