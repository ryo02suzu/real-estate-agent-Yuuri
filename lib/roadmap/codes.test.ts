import { describe, expect, it } from "vitest";
import { cityCode } from "./codes";
import GSI_CODES from "./data/gsi-muni-codes.json";
import HAZARD_MAPS from "./data/hazard-maps.json";
import ZONING_STATUS from "./data/zoning-status.json";
import { hazardMapsFor, wagamachiUrl, type HazardMapIndex } from "./hazard";
import { ALL_MUNICIPALITIES } from "./municipalities";
import { schoolGap } from "./school-data";
import { statusFor, type ZoningStatus } from "./zoning";

// 政令市は、国土地理院の逆ジオコーダが区のコードを返す。国の一覧（わがまちハザードマップ・都市計画のデータの時点・学校区）は市のコードで
// 1つにまとめているので、区のコードから市のコードを引く。前は関東の5市しか表に無く、仙台・新潟・静岡・浜松・名古屋・京都・大阪・堺・神戸で
// 市のハザードマップのページと都市計画のデータの時点が出ていなかった
describe("政令市の区のコード → 市のコード", () => {
  /** 市のコード → 区のコードの最初と最後 */
  const CITIES: Record<string, [string, string, string]> = {
    "01100": ["札幌市", "01101", "01110"],
    "04100": ["仙台市", "04101", "04105"],
    "11100": ["さいたま市", "11101", "11110"],
    "12100": ["千葉市", "12101", "12106"],
    "14100": ["横浜市", "14101", "14118"],
    "14130": ["川崎市", "14131", "14137"],
    "14150": ["相模原市", "14151", "14153"],
    "15100": ["新潟市", "15101", "15108"],
    "22100": ["静岡市", "22101", "22103"],
    "22130": ["浜松市", "22138", "22140"],
    "23100": ["名古屋市", "23101", "23116"],
    "26100": ["京都市", "26101", "26111"],
    "27100": ["大阪市", "27102", "27128"],
    "27140": ["堺市", "27141", "27147"],
    "28100": ["神戸市", "28101", "28111"],
    "33100": ["岡山市", "33101", "33104"],
    "34100": ["広島市", "34101", "34108"],
    "40100": ["北九州市", "40101", "40109"],
    "40130": ["福岡市", "40131", "40137"],
    "43100": ["熊本市", "43101", "43105"],
  };

  it("20の政令市とも、区のコードから市のコードが引ける", () => {
    for (const [city, [name, first, last]] of Object.entries(CITIES)) {
      expect(cityCode(first), name).toBe(city);
      expect(cityCode(last), name).toBe(city);
      expect(cityCode(city), name).toBe(city);
    }
  });

  it("市区町村の一覧にある政令市の区は、全部その市のコードになる（国土地理院の表の名前が「◯◯市 ◯◯区」）", () => {
    const table = Object.assign({}, ...Object.values(GSI_CODES as Record<string, Record<string, string>>)) as Record<string, string>;
    const wards = ALL_MUNICIPALITIES.filter((m) => m.codes.length > 1 && m.pref !== "東京都");
    expect(wards.map((m) => m.name).sort()).toEqual(Object.values(CITIES).map(([n]) => n).sort());
    for (const m of wards) {
      const city = Object.entries(CITIES).find(([, [n]]) => n === m.name)![0];
      for (const c of m.codes) {
        expect(table[c], c).toMatch(new RegExp(`^${m.name} .+区$`));
        expect(cityCode(c), `${m.name} ${c}`).toBe(city);
      }
    }
  });

  it("政令市でない市区町村と、東京の特別区はそのまま", () => {
    for (const c of ["13101", "13123", "11201", "27202", "40202", "01202", "22203", "47201"]) expect(cityCode(c), c).toBe(c);
  });

  it("政令市の区でも、市のハザードマップのページと、わがまちハザードマップの市のページが引ける", () => {
    const index = HAZARD_MAPS as HazardMapIndex;
    for (const [city, [name, first, last]] of Object.entries(CITIES)) {
      for (const c of [first, last]) {
        expect(hazardMapsFor([c], index).flood, name).toBe(index.maps[city].flood);
        expect(hazardMapsFor([c], index).flood, name).toMatch(/^https?:\/\//);
        expect(wagamachiUrl(c), name).toBe(`https://disaportal.gsi.go.jp/hazardmap/index.html?citycode=${city}`);
      }
    }
  });

  it("政令市の区でも、都市計画のデータの有無と時点（市で1つ）が引ける", () => {
    const all = ZONING_STATUS as Record<string, ZoningStatus>;
    for (const [city, [name, first, last]] of Object.entries(CITIES)) {
      expect(all[city], name).toBeDefined();
      expect(statusFor([first], all), name).toBe(all[city]);
      expect(statusFor([last], all), name).toBe(all[city]);
    }
  });

  it("学校区のデータが無いわけも、市のコードで引く（名古屋市は利用条件で入れていない）", () => {
    expect(schoolGap("23101", "es")).toBe("terms");
    expect(schoolGap("23116", "jh")).toBe("terms");
  });
});
