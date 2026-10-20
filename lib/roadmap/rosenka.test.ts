import { describe, expect, it } from "vitest";
import CHIKAMAP from "./data/chikamap.json";
import { chikamapUrl, rosenkaLinks } from "./rosenka";

describe("路線価（全国地価マップ）", () => {
  it("相続税・固定資産税の最新の地図を、物件の地点を中心に開く", () => {
    const [souzoku, kotei] = rosenkaLinks(35.50735, 139.64163);
    expect(souzoku).toEqual({
      kind: "souzoku",
      name: CHIKAMAP.maps.souzoku.name,
      url: `https://www.chikamap.jp/chikamap/Map?mid=${CHIKAMAP.maps.souzoku.mid}&mpx=139.641630&mpy=35.507350&mps=1500&gprj=2`,
    });
    expect(kotei.name).toMatch(/^固定資産税路線価等（令和\d+年度）$/);
    expect(souzoku.name).toMatch(/^相続税路線価等（令和\d+年分）$/);
    expect(chikamapUrl(226, 35.68, 139.76, 1000)).toBe("https://www.chikamap.jp/chikamap/Map?mid=226&mpx=139.760000&mpy=35.680000&mps=1000&gprj=2");
  });

  it("地図の番号は種類ごとの範囲（固定資産税 2xx・相続税 3xx・地価公示 1xx）", () => {
    expect(Math.floor(CHIKAMAP.maps.kotei.mid / 100)).toBe(2);
    expect(Math.floor(CHIKAMAP.maps.souzoku.mid / 100)).toBe(3);
    expect(Math.floor(CHIKAMAP.maps.koji.mid / 100)).toBe(1);
  });
});
