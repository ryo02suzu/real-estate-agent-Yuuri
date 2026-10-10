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
    // ALANDIS は同じパスで道路種別と市道の地図を u= で切り替えるので u= もキーに入れる
    expect(legendKey("https://webgis.alandis.jp/chiba12/webgis/index.php/autologin_jswebgis?ap=jsWebGIS&m=2&u=guest3&x=1&y=2&s=1000&rs=3857&li=3&si=0")).toBe(
      "webgis.alandis.jp/chiba12/webgis/index.php/autologin_jswebgis?u=guest3",
    );
    expect(legendKey("https://itabashi.machi-info.jp/?map_id=100034&lt=35.7&lg=139.7&z=18")).toBe("itabashi.machi-info.jp?map_id=100034");
  });

  it("市道（認定道路）の地図には道路種別の凡例を付けない", () => {
    const chiba = MUNICIPALITIES.find((m) => m.name === "千葉市")!;
    const links = buildLinks(chiba, 35.6074, 140.1065);
    expect(links.find((l) => l.kind === "road_type")?.legend?.[0].label).toBe("1項1号");
    expect(links.find((l) => l.kind === "public_road")?.legend).toBeUndefined();
  });

  it("PDF を図ごとに開く市も、案内ページの凡例を出す", () => {
    const minato = MUNICIPALITIES.find((m) => m.name === "港区")!;
    const [link] = buildLinks(minato, 35.6581, 139.7516);
    expect(link.sheet).toBeDefined();
    expect(link.legend?.map((e) => e.label)).toContain("道路扱いしない");
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
    expect(withLegend).toBeGreaterThan(205);
  });
});
