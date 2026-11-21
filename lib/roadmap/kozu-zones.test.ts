// 公図の推定を作る仕組み（scripts/kozu-tiles/kozu.py）が使う都道府県の表のテスト。
//   法務省の地図XMLの組織（G空間情報センター。scripts/moj_orgs.py。地番の筆のタイルと同じ表）
//   平面直角座標系の系（scripts/kozu-tiles/zones.json。平成十四年国土交通省告示第九号の適用区域。kozu.py の zone_of が引く）
// kozu.py --self-test も同じ表を確かめる。こちらは、国土地理院の市区町村の表（data/gsi-muni-codes.json）が変わったときに
// 系の表の足し忘れが分かるように、アプリのテストでも見る。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ZONE_TABLE from "../../scripts/kozu-tiles/zones.json";
import GSI_CODES from "./data/gsi-muni-codes.json";
import KOZU_SOURCE from "./data/kozu-source.json";
import { ALL_PREF_NAMES } from "./regions";

const PREFS = Object.keys(ALL_PREF_NAMES).sort();
const ONE = ZONE_TABLE.prefs as Record<string, number>;
const SPLIT = ZONE_TABLE.split as Record<string, Record<string, string[]>>;
const OLD = ZONE_TABLE.old as Record<string, string>;

/** kozu.py の zone_of と同じ引き方：系が1つの都府県はそのまま、県の中で系が分かれる道県は市区町村コードで。無ければ undefined */
function zoneOf(code: string): number | undefined {
  const pref = code.slice(0, 2);
  if (pref in ONE) return ONE[pref];
  for (const [zone, codes] of Object.entries(SPLIT[pref] ?? {})) if (codes.includes(code)) return Number(zone);
  return undefined;
}

describe("公図の推定を作る仕組みの都道府県の表（法務省の組織・平面直角座標系の系）", () => {
  it("法務省の地図XMLの組織は47都道府県のすべてにあり、公図の推定と地番の筆のタイルは同じ表を使う", () => {
    const py = readFileSync(new URL("../../scripts/moj_orgs.py", import.meta.url), "utf8");
    const orgs = Object.fromEntries([...py.matchAll(/"(\d{2})": "(moj-\d{2}[a-z]+)"/g)].map((m) => [m[1], m[2]]));
    expect(Object.keys(orgs).sort()).toEqual(PREFS);
    for (const [code, org] of Object.entries(orgs)) expect(org.slice(4, 6), org).toBe(code);
    for (const f of ["../../scripts/kozu-tiles/kozu.py", "../../scripts/parcel-tiles/build_pref.py"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).toContain("from moj_orgs import ORGS");
      expect(src, f).not.toMatch(/^ORGS = \{/m);
    }
  });

  it("系は47都道府県のすべてにあり、県の中で系が分かれる道県は国土地理院の市区町村の表の全部を持つ", () => {
    // 都道府県ごとの系か、市区町村ごとの系のどちらか一方
    expect([...Object.keys(ONE), ...Object.keys(SPLIT)].sort()).toEqual(PREFS);
    expect(Object.keys(SPLIT).sort()).toEqual(["01", "13", "46", "47"]);
    const gsi = GSI_CODES as Record<string, Record<string, string>>;
    for (const [pref, zones] of Object.entries(SPLIT)) {
      const listed = Object.values(zones).flat();
      // 1つの市区町村は1つの系
      expect(new Set(listed).size, pref).toBe(listed.length);
      // 国土地理院の表の市区町村の全部と、法務省の地図XMLにだけある古いコード（old）
      const want = [...Object.keys(gsi[ALL_PREF_NAMES[pref]]), ...Object.keys(OLD).filter((c) => c.startsWith(pref))];
      expect([...listed].sort(), pref).toEqual(want.sort());
    }
    for (const z of [...Object.values(ONE), ...Object.values(SPLIT).flatMap((zs) => Object.keys(zs).map(Number))]) expect(z >= 1 && z <= 19).toBe(true);
    // 古いコードは、今の市区町村の表に無いものだけ
    for (const c of Object.keys(OLD)) expect(gsi[ALL_PREF_NAMES[c.slice(0, 2)]][c], c).toBeUndefined();
  });

  it("系の例（告示の適用区域のとおり。政令市は区のコード）", () => {
    // 北海道：XI 系・XIII 系は告示に名前のある市と振興局の町村、残りは XII 系
    expect(zoneOf("01101")).toBe(12); // 札幌市中央区
    expect(zoneOf("01202")).toBe(11); // 函館市
    expect(zoneOf("01206")).toBe(13); // 釧路市
    expect(zoneOf("01584")).toBe(11); // 洞爺湖町（胆振のうち XI 系の町）
    expect(zoneOf("01213")).toBe(12); // 苫小牧市（胆振の市で、告示に名前が無い）
    expect(zoneOf("01543")).toBe(13); // 美幌町（オホーツクのうち XIII 系の町）
    // 沖縄県：東経126度より西は XVI 系、130度より東は XVII 系、そのあいだは XV 系
    expect(zoneOf("47201")).toBe(15); // 那覇市
    expect(zoneOf("47207")).toBe(16); // 石垣市
    expect(zoneOf("47214")).toBe(16); // 宮古島市
    expect(zoneOf("47358")).toBe(17); // 北大東村
    // 鹿児島県：奄美群島・十島村は I 系、ほかは II 系
    expect(zoneOf("46222")).toBe(1); // 奄美市
    expect(zoneOf("46304")).toBe(1); // 十島村
    expect(zoneOf("46201")).toBe(2); // 鹿児島市
    // 東京都：小笠原村は XIV 系、ほかは IX 系
    expect(zoneOf("13421")).toBe(14);
    expect(zoneOf("13101")).toBe(9);
    // 系が1つの県
    expect(zoneOf("40131")).toBe(2); // 福岡市東区
    expect(zoneOf("42201")).toBe(1); // 長崎市
    expect(zoneOf("34101")).toBe(3); // 広島市中区
    expect(zoneOf("37201")).toBe(4); // 高松市
    expect(zoneOf("33101")).toBe(5); // 岡山市北区
    // 表に無いコードは決めない（kozu.py は止める）
    expect(zoneOf("01999")).toBeUndefined();
    expect(zoneOf("48001")).toBeUndefined();
  });

  it("公図から推定した筆のデータのある市区町村（kozu-source.json）は、どれも系が決まる", () => {
    for (const c of KOZU_SOURCE.codes) expect(zoneOf(c), c).toBeDefined();
  });
});
