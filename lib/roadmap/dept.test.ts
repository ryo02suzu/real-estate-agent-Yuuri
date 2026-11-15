import { describe, expect, it } from "vitest";
import { deptLabel, PREF_HEAD, prefUnit } from "./dept";
import { ALL_MUNICIPALITIES } from "./municipalities";

describe("窓口の名前（都道府県の窓口はそのまま、市区町村の窓口は市区町村の名前を前に付ける）", () => {
  it("都・道・府・県の窓口は、前に市区町村の名前を付けない", () => {
    expect(deptLabel("川越市", "埼玉県 川越建築安全センター")).toBe("埼玉県 川越建築安全センター");
    expect(deptLabel("檜原村", "東京都 多摩建築指導事務所 建築指導第三課")).toBe("東京都 多摩建築指導事務所 建築指導第三課");
    // 前は「東京都」と「◯◯県」だけを見ていて、府と道の窓口に市町村の名前が付いていた（「綾部市 京都府 中丹東土木事務所 …」）
    expect(deptLabel("綾部市", "京都府 中丹東土木事務所 建築住宅課")).toBe("京都府 中丹東土木事務所 建築住宅課");
    expect(deptLabel("泉南市", "大阪府 都市整備部 住宅建築局 建築指導室 審査指導課 確認・検査グループ（咲洲庁舎27階）")).toBe("大阪府 都市整備部 住宅建築局 建築指導室 審査指導課 確認・検査グループ（咲洲庁舎27階）");
    expect(deptLabel("夕張市", "北海道 空知総合振興局 札幌建設管理部 建設行政室 建設指導課 建築住宅係（岩見沢市8条西5丁目）")).toMatch(/^北海道 空知総合振興局/);
    expect(deptLabel("和歌山市", "和歌山県 県土整備部 都市住宅局 建築住宅課")).toMatch(/^和歌山県 /);
    expect(deptLabel("鹿児島市", "鹿児島県 鹿児島地域振興局 建設部 土木建築課 建築係")).toMatch(/^鹿児島県 /);
  });

  it("市区町村の窓口は、市区町村の名前を前に付ける", () => {
    expect(deptLabel("さいたま市", "建築指導課")).toBe("さいたま市 建築指導課");
    expect(deptLabel("京都市", "都市計画局 建築指導部 建築審査課")).toBe("京都市 都市計画局 建築指導部 建築審査課");
    // 都道府県の名前で始まっても、あとに空白の無いものは市区町村の窓口（「北海道庁」のような名前を都道府県の窓口と取り違えない）
    expect(deptLabel("大阪市", "大阪府庁前の窓口")).toBe("大阪市 大阪府庁前の窓口");
  });

  it("登録してある窓口：都道府県の名前で始まるものは「◯◯県 」の形で、そのまま出る。ほかは市区町村の名前が付く", () => {
    const contacts = ALL_MUNICIPALITIES.flatMap((m) => [m.contact, ...Object.values(m.contactByCode ?? {})].filter((c) => c).map((c) => ({ m, dept: c!.dept })));
    expect(contacts.length).toBeGreaterThan(1500);
    for (const { m, dept } of contacts) {
      const label = deptLabel(m.name, dept);
      if (dept.startsWith(m.pref)) {
        // 「北海道 …」「大阪府 …」のように、都道府県の名前のあとに空白を入れて書いてある
        expect(dept.startsWith(`${m.pref} `), `${m.name}：${dept}`).toBe(true);
        expect(label, m.name).toBe(dept);
      } else {
        expect(label, m.name).toBe(`${m.name} ${dept}`);
      }
    }
    // 府・道の窓口が実際にある（京都府・大阪府・北海道）
    for (const pref of ["京都府", "大阪府", "北海道"]) expect(contacts.some(({ dept }) => dept.startsWith(`${pref} `)), pref).toBe(true);
  });

  it("住所の先頭の都道府県の名前", () => {
    for (const a of ["東京都千代田区", "北海道札幌市中央区", "京都府京都市", "大阪府大阪市", "神奈川県横浜市", "広島県広島市", "和歌山県和歌山市"]) expect(PREF_HEAD.test(a), a).toBe(true);
    expect("大阪府大阪市北区梅田".replace(PREF_HEAD, "")).toBe("大阪市北区梅田");
    expect("北海道夕張市本町".replace(PREF_HEAD, "")).toBe("夕張市本町");
    expect("鹿児島県鹿児島市山下町".replace(PREF_HEAD, "")).toBe("鹿児島市山下町");
  });

  it("都道府県の出している地図は、その呼び方（県・府・道・都）で案内する。市区町村の地図は市区町村の名前で", () => {
    expect(prefUnit("広島県 指定道路図（参考図。府中市。県が調べ終えた4号・5号・2項）※広島県のトップページから進む", "広島県")).toBe("県");
    expect(prefUnit("兵庫県指定道路情報（GIS）（神戸市など12市を除く）", "兵庫県")).toBe("県");
    expect(prefUnit("建築基準法上の道路種別図（青森県・PDF、2025年）", "青森県")).toBe("県");
    expect(prefUnit("京都府指定道路図（GIS）（府が指定した4号・5号・2項）", "京都府")).toBe("府");
    expect(prefUnit("北海道 指定道路図", "北海道")).toBe("道");
    expect(prefUnit("東京都 道路の種別の図", "東京都")).toBe("都");
    // 「県」の字があるだけの、市の地図（前は「県の図」と案内していた）
    expect(prefUnit("道路網図（いいだWebまっぷ・国道/県道/市道の路線）", "長野県")).toBeUndefined();
    expect(prefUnit("岐阜市道路台帳図（県域統合型GISぎふ・市道の路線番号）", "岐阜県")).toBeUndefined();
    expect(prefUnit("大仙市 指定道路図（全種別）", "秋田県")).toBeUndefined();
  });
});
