import { describe, expect, it } from "vitest";
import { legendFor, legendKey } from "./legends";
import { MUNICIPALITIES, buildLinks } from "./municipalities";

describe("地図の凡例", () => {
  it("地図の URL から凡例のキーを作る", () => {
    expect(legendKey("https://www2.wagmap.jp/narita/Map?mid=4&mpx=140.3&mpy=35.7&mps=1000&gprj=2")).toBe("www2.wagmap.jp/narita/4");
    expect(legendKey("https://mapping-gunma.pref.gunma.jp/pref-gunma/Map?mid=155&mpx=1&mpy=2")).toBe("mapping-gunma.pref.gunma.jp/pref-gunma/155");
    expect(legendKey("https://ds.icba-info.jp/siteidouro/chiba/pref/")).toBe("ds.icba-info.jp/siteidouro/chiba/pref");
    expect(legendKey("https://www.sonicweb-asp.jp/setagaya/map?theme=shiteidouro&pos=139.6%2C35.6&scale=1000")).toBe("www.sonicweb-asp.jp/setagaya/map?theme=shiteidouro");
    expect(legendKey("not a url")).toBeUndefined();
  });

  it("地図ごと・市町村ごとの凡例を引く", () => {
    expect(legendFor("https://www2.wagmap.jp/narita/Map?mid=4&mpx=1&mpy=2", "成田市")?.[0]).toEqual({ label: "国道・県道(幅員が4m以上の場合は1項1号)", color: "#267300" });
    // 茨城県の共同の地図は市町村ごと
    expect(legendFor("https://www2.wagmap.jp/ibaraki/Map?mid=30&mpx=1&mpy=2", "古河市")?.map((e) => e.label)).toContain("3号道路");
    expect(legendFor("https://www2.wagmap.jp/ibaraki/Map?mid=30&mpx=1&mpy=2", "存在しない町")).toBeUndefined();
    expect(legendFor("https://www.sonicweb-asp.jp/setagaya/map?theme=shiteidouro&pos=1%2C2&scale=1000", "世田谷区")?.map((e) => e.label)).toContain("非常用通路");
    expect(legendFor("https://example.com/map", "成田市")).toBeUndefined();
  });

  it("凡例の色は #rrggbb", () => {
    for (const m of MUNICIPALITIES)
      for (const l of buildLinks(m, 36, 139.5)) for (const e of legendFor(l.url, m.name) ?? []) expect(e.color, `${m.name} ${e.label}`).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("道路種別の地図の多くに凡例がある", () => {
    let withLegend = 0;
    for (const m of MUNICIPALITIES) if (buildLinks(m, 36, 139.5).some((l) => l.kind !== "public_road" && legendFor(l.url, m.name))) withLegend++;
    expect(withLegend).toBeGreaterThan(175);
  });
});
