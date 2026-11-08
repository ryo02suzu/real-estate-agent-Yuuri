import { describe, expect, it } from "vitest";
import { changedMarks, correctAddress, describeMatch, fixMunicipality, similarTown, typedParts } from "./address-fix";
import type { GeocodeResult } from "./geocode";

/** 国土地理院の住所検索の代わり（実際に返った住所の形をまねる）。表に無い住所を引いたら空 */
function fakeGsi(table: Record<string, string[]>) {
  const asked: string[] = [];
  const search = async (q: string): Promise<GeocodeResult[]> => {
    asked.push(q);
    return (table[q] ?? []).map((matchedAddress, i) => ({ lat: 36 + i / 100, lng: 139.9, matchedAddress }));
  };
  return { search, asked };
}
const at = (...titles: string[]): GeocodeResult[] => titles.map((matchedAddress, i) => ({ lat: 36 + i / 100, lng: 139.9, matchedAddress }));
const never = async (): Promise<GeocodeResult[]> => {
  throw new Error("探し直さない");
};

describe("住所の書き間違いを直して探し直す（correctAddress）", () => {
  it("市が抜けて、町名の漢字も違う：市を足し、町名を直して番地まで", async () => {
    const g = fakeGsi({
      "宇都宮市南大道り1-2-3": ["栃木県宇都宮市南大通り"],
      "栃木県宇都宮市南大通り1-2-3": ["栃木県宇都宮市南大通り一丁目２番３号"],
    });
    const r = await correctAddress("宇都宮南大道り1-2-3", at("栃木県宇都宮市"), g.search);
    expect(r && "query" in r && r.query).toBe("栃木県宇都宮市南大通り1-2-3");
    expect(r && "candidates" in r && r.candidates[0].matchedAddress).toBe("栃木県宇都宮市南大通り一丁目２番３号");
    expect(g.asked).toEqual(["宇都宮市南大道り1-2-3", "栃木県宇都宮市南大通り1-2-3"]);
  });

  it("町名の送り仮名・1字違い（南大通 / 三軒茶家 / 桜木長）", async () => {
    for (const [input, town, fixed, exact] of [
      ["宇都宮市南大通1-2-3", "栃木県宇都宮市南大通り", "栃木県宇都宮市南大通り1-2-3", "栃木県宇都宮市南大通り一丁目２番３号"],
      ["世田谷区三軒茶家1-1-1", "東京都世田谷区三軒茶屋", "東京都世田谷区三軒茶屋1-1-1", "東京都世田谷区三軒茶屋一丁目１番１号"],
      ["さいたま市大宮区桜木長1-7-5", "埼玉県さいたま市大宮区桜木町", "埼玉県さいたま市大宮区桜木町1-7-5", "埼玉県さいたま市大宮区桜木町一丁目７番地"],
    ]) {
      const g = fakeGsi({ [fixed]: [exact] });
      const r = await correctAddress(input, at(town), g.search);
      expect(r && "query" in r && r.query).toBe(fixed);
    }
  });

  it("市の名前が抜けて別の県に当たった・合併前の市の名前・市の名前の1字違い", async () => {
    const cases: [string, string, string, string][] = [
      ["横浜西区みなとみらい2-2-1", "広島県坂町横浜西", "横浜市西区みなとみらい2-2-1", "神奈川県横浜市西区みなとみらい二丁目２番"],
      ["大宮市桜木町1-7-5", "愛知県新城市大宮市木", "さいたま市大宮区桜木町1-7-5", "埼玉県さいたま市大宮区桜木町一丁目７番地"],
      ["宇津宮市南大通り1-2-3", "北海道興部町宇津", "宇都宮市南大通り1-2-3", "栃木県宇都宮市南大通り一丁目２番３号"],
      // 東北の「仙台青葉区」（同じ頭の町村が無くても、区の名前まで合う）
      ["仙台青葉区国分町3-7-1", "宮城県仙台市", "仙台市青葉区国分町3-7-1", "宮城県仙台市青葉区国分町三丁目７番"],
    ];
    for (const [input, wrong, fixed, exact] of cases) {
      const g = fakeGsi({ [fixed]: [exact] });
      const r = await correctAddress(input, at(wrong), g.search);
      expect(r && "query" in r && r.query).toBe(fixed);
    }
  });

  it("旧字（髙田馬場）を今の字にする", async () => {
    const g = fakeGsi({ "新宿区高田馬場1-1": ["東京都新宿区高田馬場一丁目１番"] });
    const r = await correctAddress("新宿区髙田馬場1-1", at("東京都新宿区"), g.search);
    expect(r && "query" in r && r.query).toBe("新宿区高田馬場1-1");
  });

  it("政令市の区の違い：町名だけで探して、同じ市の中の区にする", async () => {
    const g = fakeGsi({ "みなとみらい2-2-1": ["神奈川県横浜市西区みなとみらい二丁目２番"] });
    const r = await correctAddress("横浜市中区みなとみらい2-2-1", at("神奈川県横浜市中区"), g.search);
    expect(r && "query" in r && r.query).toBe("神奈川県横浜市西区みなとみらい2-2-1");
  });

  it("近い名前の町が2つあれば、決めずに選んでもらう", async () => {
    const r = await correctAddress("さいたま市大宮区桜木丁1-7-5", at("埼玉県さいたま市大宮区桜木町", "埼玉県さいたま市大宮区桜木台"), never);
    expect(r && "choices" in r && r.choices.map((c) => c.matchedAddress)).toEqual(["埼玉県さいたま市大宮区桜木町1-7-5", "埼玉県さいたま市大宮区桜木台1-7-5"]);
  });

  it("番地まで合っている・直す所が無いときは探し直さない", async () => {
    expect(await correctAddress("宇都宮市南大通り1-2-3", at("栃木県宇都宮市南大通り一丁目２番３号"), never)).toBeNull();
    expect(await correctAddress("日野本町1-1", at("東京都日野市日野本町一丁目１番"), never)).toBeNull();
    // 号が住所のデータに無いだけ（丁目・番まで合っている）
    expect(await correctAddress("千代田区丸の内1-9-1", at("東京都千代田区丸の内一丁目９番"), never)).toBeNull();
    // 町名は合っていて、番地が住所のデータに無い（地番の地域）
    expect(await correctAddress("熊谷市宮町2丁目999", at("埼玉県熊谷市宮町二丁目"), never)).toBeNull();
    // 施設の名前に当たった
    expect(await correctAddress("宇都宮市南消防署", at("宇都宮市南消防署"), never)).toBeNull();
  });

  it("探し直しが通信で失敗しても、最初の結果のまま（エラーにしない）", async () => {
    const down = async (): Promise<GeocodeResult[]> => {
      throw new Error("住所検索に失敗しました (503)");
    };
    expect(await correctAddress("宇都宮南大道り1-2-3", at("栃木県宇都宮市"), down)).toBeNull();
    expect(await correctAddress("横浜市中区みなとみらい2-2-1", at("神奈川県横浜市中区"), down)).toBeNull();
  });

  it("直しても市区町村の中心にしか当たらないなら使わない（別の場所を「直した」と言わない）", async () => {
    const g = fakeGsi({ "那珂市湊1-1": ["茨城県那珂市"] });
    expect(await correctAddress("那珂湊1-1", at("茨城県那珂郡", "福岡県福岡市博多区那珂"), g.search)).toBeNull();
  });
});

describe("市区町村の名前を直す（fixMunicipality）", () => {
  it("市・区の抜け、合併前の市、1字違い。はっきり書いてあれば直さない", () => {
    expect(fixMunicipality("宇都宮南大通り1-2-3")).toBe("宇都宮市南大通り1-2-3");
    expect(fixMunicipality("さいたま大宮区桜木町1-7-5")).toBe("さいたま市大宮区桜木町1-7-5");
    expect(fixMunicipality("岩槻市本町1-1")).toBe("さいたま市岩槻区本町1-1");
    expect(fixMunicipality("栃木県宇津宮市南大通り1-2-3")).toBe("栃木県宇都宮市南大通り1-2-3");
    expect(fixMunicipality("宇都宮市南大通り1-2-3")).toBeNull();
    expect(fixMunicipality("中央区銀座1-1")).toBeNull();
    expect(fixMunicipality("西多摩郡瑞穂町箱根ケ崎2335")).toBeNull();
  });
});

describe("入れた住所と出す住所の違いの説明（describeMatch）", () => {
  it("直したときは、同じ市区町村の名前を外して「入れた → 正式」", () => {
    expect(describeMatch("宇都宮南大道り1-2-3", "栃木県宇都宮市南大通り一丁目２番３号", "栃木県宇都宮市南大通り1-2-3")?.fix).toEqual({ from: "宇都宮南大道り", to: "宇都宮市南大通り" });
    expect(describeMatch("宇都宮市南大道り1-2-3", "栃木県宇都宮市南大通り一丁目２番３号", "栃木県宇都宮市南大通り1-2-3")?.fix).toEqual({ from: "南大道り", to: "南大通り" });
    expect(describeMatch("横浜市中区みなとみらい2-2-1", "神奈川県横浜市西区みなとみらい二丁目２番", "神奈川県横浜市西区みなとみらい2-2-1")?.fix).toEqual({ from: "中区みなとみらい", to: "西区みなとみらい" });
    expect(describeMatch("新宿区髙田馬場1-1", "東京都新宿区高田馬場一丁目１番", "新宿区高田馬場1-1")?.fix).toEqual({ from: "髙田馬場", to: "高田馬場" });
  });

  it("国土地理院が自分で近い町名に読み替えたときも、直したと言う", () => {
    expect(describeMatch("宇都宮市南大道り", "栃木県宇都宮市南大通り")?.fix).toEqual({ from: "南大道り", to: "南大通り" });
  });

  it("入れた町名が見つからず、別の町・市の中心に当たったら miss", () => {
    expect(describeMatch("宇都宮市みなみ大通り1-2-3", "栃木県宇都宮市みどり野町")?.miss).toEqual({ typed: "みなみ大通り", found: "みどり野町", kind: "town" });
    expect(describeMatch("足立区千住朝日町1-1", "東京都足立区千住")?.miss).toEqual({ typed: "千住朝日町", found: "千住", kind: "town" });
    expect(describeMatch("宇都宮市ほげ町1-2", "栃木県宇都宮市")?.miss).toEqual({ typed: "ほげ町", found: "宇都宮市", kind: "city" });
  });

  it("同じ住所（県・市の省略、大字・小字、ヶとが、建物名）なら何も言わない", () => {
    expect(describeMatch("大宮区桜木町1-7-5", "埼玉県さいたま市大宮区桜木町一丁目７番地")).toBeNull();
    expect(describeMatch("熊谷市大字下奈良字東原391", "埼玉県熊谷市下奈良３９１番地")).toBeNull();
    expect(describeMatch("千代田区霞ケ関1-2", "東京都千代田区霞が関一丁目２番")).toBeNull();
    expect(describeMatch("茅ケ崎市元町1-1", "神奈川県茅ヶ崎市元町１番")).toBeNull();
    expect(describeMatch("宇都宮市南大通り○○マンション", "栃木県宇都宮市南大通り")).toBeNull();
    expect(describeMatch("〒320-0811 宇都宮市南大通り1-2-3", "栃木県宇都宮市南大通り一丁目２番３号")).toBeNull();
  });
});

describe("部品", () => {
  it("町名の近さ：送り仮名・1字違いは同じ、2字の町は同じでないとだめ", () => {
    expect(similarTown("南大通", "南大通り")).toBe(true);
    expect(similarTown("南大道り", "南大通り")).toBe(true);
    expect(similarTown("本町", "元町")).toBe(false);
    expect(similarTown("千住朝日町", "千住旭町")).toBe(false);
  });
  it("郵便番号と郡を外して分ける", () => {
    expect(typedParts("〒190-1201 西多摩郡瑞穂町箱根ケ崎2335")).toEqual({ pref: "", place: "瑞穂町箱根ケ崎", num: "2335" });
    expect(typedParts("栃木県 宇都宮市 南大通り 1丁目2-3 ○○ビル")).toEqual({ pref: "栃木県", place: "宇都宮市南大通り", num: "1丁目2-3 ○○ビル" });
  });
  it("直した字の印", () => {
    expect(changedMarks("南大道り", "南大通り")).toEqual([false, false, true, false]);
    expect(changedMarks("宇都宮南大道り", "宇都宮市南大通り")).toEqual([false, false, false, true, false, false, true, false]);
  });
});
