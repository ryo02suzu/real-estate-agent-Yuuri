import { describe, expect, it } from "vitest";
import { parcelListText } from "./parcel-list";
import { buildLinks, findMunicipality } from "./roadmap";

const m = findMunicipality("13101")!;
const result = {
  status: "ok" as const,
  lat: 35.6895,
  lng: 139.7441,
  matchedAddress: "東京都千代田区三番町２番",
  town: "三番町",
  approximate: false,
  municipality: m,
  links: buildLinks(m, 35.6895, 139.7441),
};

describe("謄本・公図を取るときの地番の一覧", () => {
  it("物件の筆と隣の筆を1行に1筆で並べ、指定の仕方と出典を添える（住所の数字は半角）", () => {
    const text = parcelListText(result, { target: "千代田区三番町 2-1", neighbors: ["千代田区三番町 2-2", "千代田区三番町 3"], reference: false });
    expect(text.split("\n")).toEqual([
      "【謄本・公図を取るときの地番】東京都千代田区三番町2番",
      "",
      "■ 物件の筆",
      "千代田区三番町 2-1",
      "",
      "■ 隣の筆（境界が接している筆・2筆）",
      "千代田区三番町 2-2",
      "千代田区三番町 3",
      "",
      "※法務局の窓口・登記情報提供サービスでは、所在（市区町村・町名）と地番を1筆ずつ指定します。地番は「2-1」のように枝番まで。",
      expect.stringMatching(/^※筆の出典：「登記所備付地図データ」（法務省）.+法務局の証明ではありません。$/),
    ]);
  });

  it("住所の地点の筆は参考である旨を、道路などの可能性があれば隣の筆を省略する旨を書く", () => {
    const ref = parcelListText(result, { target: "千代田区三番町 2-1", neighbors: ["千代田区三番町 2-2"], reference: true });
    expect(ref).toContain("※住所の地点にある筆（参考）。住居表示と地番は別のものなので、公図で物件の筆を確かめてください");
    expect(ref).toContain("■ 隣の筆（境界が接している筆・1筆）\n千代田区三番町 2-2");
    const off = parcelListText(result, { target: "千代田区三番町 100", neighbors: Array.from({ length: 40 }, (_, i) => `千代田区三番町 ${i + 1}`), reference: true, offLot: true });
    expect(off).toContain("※住所の地点にある筆（参考）。隣地がとても多く、道路など物件の外の土地の可能性があるので、公図で物件の筆を確かめてください");
    expect(off).toContain("■ 隣の筆：省略（この筆に接する筆は40筆。公図で物件の筆を確かめてから、隣地を調べてください）");
    expect(off).not.toContain("千代田区三番町 1\n");
  });

  it("推定の位置・地番参考図の筆は、その印と注意を添える。筆が無ければ確かめる先を書く", () => {
    const est = parcelListText(result, { target: "千代田区三番町 2-1", neighbors: [], reference: false, estimated: "low" });
    expect(est).toContain("千代田区三番町 2-1（推定の位置）");
    expect(est).toContain("※筆の位置は公図から推定したもの（確度が低く、5m前後ずれることあり）。");
    const sanko = parcelListText(result, { target: "市川市国府台１丁目 2-1", neighbors: [], reference: false, sanko: "12203" });
    expect(sanko).toContain("市川市国府台１丁目 2-1（地番参考図）");
    expect(sanko).toContain("※市町村の課税用の参考図で、登記の地番・筆の形と違うことがあります。");
    const none = parcelListText(result, undefined);
    expect(none).toBe("【謄本・公図を取るときの地番】東京都千代田区三番町2番\nこの場所の筆は、地図データの中に見つかりませんでした。市町村の地番図（参考図）か法務局の窓口で、地番を確かめてください。");
    expect(parcelListText(result, { neighbors: ["千代田区三番町 2-2"], reference: false })).toContain("■ 物件の筆\n地番なし（道路・水路など）");
  });
});
