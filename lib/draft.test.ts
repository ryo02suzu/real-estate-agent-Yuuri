import { describe, expect, it } from "vitest";
import { buildDraft, draftText, DRAFT_NOTE } from "./draft";
import { buildLinks, findMunicipality } from "./roadmap";
import { HAZARDS } from "./roadmap/hazard";
import type { Zoning, ZoningStatus } from "./roadmap/zoning";

const m = findMunicipality("13101")!;
const base = {
  status: "ok" as const,
  lat: 35.6895,
  lng: 139.7441,
  matchedAddress: "東京都千代田区三番町",
  town: "三番町",
  approximate: false,
  municipality: m,
  links: buildLinks(m, 35.6895, 139.7441),
};
const zoning: Zoning = {
  youto: [{ name: "第一種住居地域", code: 5, bcr: 60, far: 400 }],
  youtoNear: [],
  senbiki: "市街化区域",
  tokei: true,
  jyuntoshi: false,
  bouka: "準防火地域",
  koudoti: true,
  others: [{ layer: "chikukei", label: "地区計画", name: "番町地区地区計画" }],
};
const st: ZoningStatus = { city: "千代田区", asOf: "2024年", layers: { senbiki: 1, youto: 1, bouka: 1, koudoti: 1, chikukei: 1, tokei: 1 } };

describe("重説・物件概要の下書き", () => {
  it("都市計画・道路・災害を書類の欄の並びにし、要確認の印と出典を付ける", () => {
    const flood = HAZARDS.flood.layers[0];
    const draft = buildDraft(
      {
        ...base,
        parcel: { kuiki: "千代田区_三番町___", chiban: "2-1", chibanRaw: "2-1", pieces: [], point: { lat: 35.6895, lng: 139.7441 } },
      },
      {
        zoning: { zoning, st },
        parcels: { target: "千代田区三番町 2-1", neighbors: ["千代田区三番町 2-2", "千代田区三番町 3"], reference: false },
        roads: [{ label: "法第42条第1項第1号道路", short: "1項1号", direction: "北", distance: 4.2, width: "6.0m" } as never],
        hazard: {
          report: { flood: { status: "ok", hits: [{ layer: flood, at: flood.classes.find((c) => c.label === "0.5〜3m") }] }, dosha: { status: "ok", hits: [] } },
          elevation: { value: 25.3, source: "5mメッシュ（航空レーザ測量）" },
          maps: { flood: "https://example.jp/hm.html", naisui: "https://example.jp/hm.html" },
          muniCd: "13101",
        },
      },
    );
    const titles = draft.map((s) => s.title);
    expect(titles[0]).toBe("物件の表示");
    expect(titles).toContain("都市計画法・建築基準法に基づく制限（参考）");
    const text = draftText(draft, new Date(2026, 9, 12));
    expect(text.startsWith("【重説・物件概要の下書き（MICHILU・2026年10月12日）】")).toBe(true);
    expect(text).toContain("所在（地番）：千代田区三番町 2-1");
    expect(text).toContain("隣地の地番：千代田区三番町 2-2、千代田区三番町 3");
    expect(text).toContain("区域区分：市街化区域");
    expect(text).toContain("用途地域：第一種住居地域");
    expect(text).toContain("建ぺい率：60%（指定）");
    expect(text).toContain("容積率：400%（指定）（前面道路の幅による制限・角地の緩和は含まない）");
    expect(text).toContain("防火・準防火：準防火地域");
    expect(text).toContain("地区計画：番町地区地区計画");
    expect(text).toContain("北の道路（約4m）：法第42条第1項第1号道路・幅員 6.0m【要確認】");
    expect(text).toContain("■ハザードマップ（重要事項説明で所在地を示す市区町村の地図）\n洪水・内水：千代田区のハザードマップ（https://example.jp/hm.html）");
    expect(text).toContain("■災害リスク（国のデータ・参考）\n洪水（想定最大規模）：浸水 0.5〜3m");
    expect(text).toContain("用途地域・建ぺい率・容積率：第一種住居地域／建ぺい率60%／容積率400%");
    expect(text).toContain("■出典");
    expect(text.endsWith(DRAFT_NOTE)).toBe(true);
    // 判断の言葉は出さない
    expect(text).not.toMatch(/再建築(可|不可)|建築可能|接道義務を満たす/);
  });

  it("データの無い欄は「要確認」と確かめる先", () => {
    const text = draftText(buildDraft({ ...base, approximate: true }));
    expect(text).toContain("所在（住所）：東京都千代田区三番町 付近（番地まで見つからず、町の中心の位置）【要確認】");
    expect(text).toContain("所在（地番）：要確認（登記・公図で確認）");
    expect(text).toContain("用途地域など：要確認");
    expect(text).toContain("道路の種別・幅員：要確認（市の道路種別の地図・窓口で確認）");
    expect(text).toContain("ハザードマップ：要確認");
    expect(text).not.toContain("■出典");
  });

  it("公図から推定した筆は、推定の印とずれの目安を添える", () => {
    const text = draftText(
      buildDraft({
        ...base,
        parcel: { kuiki: "横浜市港北区_大豆戸町___", chiban: "589-1", chibanRaw: "589-1", pieces: [], point: { lat: 35.51, lng: 139.62 }, estimated: "low" },
      }),
    );
    expect(text).toContain("所在（地番）：横浜市港北区大豆戸町 589-1（推定・確度低）（公図から推定した位置（確度が低く、5m前後ずれることあり））【要確認】");
    expect(text).toContain("国土地理院の基盤地図情報（道路縁）に合わせて MICHILU が推定の位置に置いたもの");
    expect(text).toContain("■出典\n筆の出典：「登記所備付地図データ」（法務省）");
  });
});
