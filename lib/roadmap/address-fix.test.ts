import { describe, expect, it } from "vitest";
import { changedMarks, correctAddress, describeMatch, fixMunicipality, placeNotFound, similarTown, typedParts } from "./address-fix";
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

  it("地割の住所（岩手県など）：番地まで合っていれば探し直さない。別の地割には直さない", async () => {
    expect(await correctAddress("岩手県紫波郡矢巾町大字南矢幅第13地割123番地", at("岩手県矢巾町大字南矢幅第十三地割１２３番地"), never)).toBeNull();
    // 町までの一致で候補に別の地割（第十二）と入れた地割（第十三）があれば、入れた地割を選ぶ（1字違いの第十二には直さない）
    const g = fakeGsi({ "岩手県矢巾町大字南矢幅第十三地割123番地": ["岩手県矢巾町大字南矢幅第十三地割１２３番地"] });
    const r = await correctAddress("矢巾町南矢幅第13地割123番地", at("岩手県矢巾町大字南矢幅第十二地割", "岩手県矢巾町大字南矢幅第十三地割"), g.search);
    expect(r && "query" in r && r.query).toBe("岩手県矢巾町大字南矢幅第十三地割123番地");
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

// 総点検で見つけた弱点：「東京都渋谷2-6-12」のように区を書かない住所が、渋谷区の中心（区役所のあたり）になり、
// 「東京都丸の内1-9-1」は東京都の代表の地点（都庁のあたり）、「東京都日本橋1-4-1」は30km先の日の出町になっていた。
// 下の表は、国土地理院の住所検索が実際に返した結果（2026-11-13）
describe("市区町村を書かずに町名から入れた住所を、同じ都道府県の中で探す（correctAddress）", () => {
  it("区の名前と同じ町（渋谷区渋谷）：当たった区の中の同じ名前の町にする", async () => {
    const g = fakeGsi({
      "東京都渋谷区渋谷2-6-12": ["東京都渋谷区渋谷二丁目６番１２号"],
      "渋谷2-6-12": ["東京都渋谷区渋谷二丁目６番１２号", "大阪府池田市渋谷二丁目６番１２号"],
    });
    const r = await correctAddress("東京都渋谷2-6-12", at("東京都渋谷区"), g.search);
    expect(r && "query" in r && r.query).toBe("東京都渋谷区渋谷2-6-12");
    expect(r && "candidates" in r && r.candidates[0].matchedAddress).toBe("東京都渋谷区渋谷二丁目６番１２号");
    expect(g.asked).toEqual(["東京都渋谷区渋谷2-6-12", "渋谷2-6-12"]);
    expect(describeMatch("東京都渋谷2-6-12", "東京都渋谷区渋谷二丁目６番１２号", "東京都渋谷区渋谷2-6-12")).toEqual({ fix: { from: "渋谷", to: "渋谷区渋谷" } });
  });

  it("市の名前と同じ町（柏市柏・市川市市川）。「市」の字が入る町名も探す。号が無ければ番までの一致", async () => {
    const kashiwa = fakeGsi({ "千葉県柏市柏1-1-1": ["千葉県柏市柏一丁目１番"], "柏1-1-1": ["千葉県柏市柏一丁目１番"], "柏1-1": ["千葉県柏市柏一丁目１番"] });
    const a = await correctAddress("千葉県柏1-1-1", at("千葉県柏市"), kashiwa.search);
    expect(a && "query" in a && a.query).toBe("千葉県柏市柏1-1-1");
    const ichikawa = fakeGsi({ "千葉県市川市市川1-1-1": ["千葉県市川市市川一丁目１番"], "市川1-1-1": ["千葉県市川市市川一丁目１番"], "市川1-1": ["千葉県市川市市川一丁目１番"] });
    const b = await correctAddress("千葉県市川1-1-1", at("千葉県市川市"), ichikawa.search);
    expect(b && "query" in b && b.query).toBe("千葉県市川市市川1-1-1");
    expect(b && "candidates" in b && b.candidates[0].matchedAddress).toBe("千葉県市川市市川一丁目１番");
  });

  it("都道府県にしか当たらなかった町（丸の内）：号まで持つ町しか返らないので、最後の番号を外してもう一度探す", async () => {
    const g = fakeGsi({
      "丸の内1-9-1": ["山形県米沢市丸の内一丁目９番１号", "山梨県甲府市丸の内一丁目９番１号", "愛知県名古屋市中区丸の内一丁目９番１号", "岡山県岡山市北区丸の内一丁目９番１号"],
      "丸の内1-9": ["東京都千代田区丸の内一丁目９番", "愛知県名古屋市中区丸の内一丁目９番"],
    });
    const r = await correctAddress("東京都丸の内1-9-1", at("東京都"), g.search);
    expect(r && "query" in r && r.query).toBe("東京都千代田区丸の内1-9-1");
    expect(r && "candidates" in r && r.candidates[0].matchedAddress).toBe("東京都千代田区丸の内一丁目９番");
    expect(g.asked).toEqual(["丸の内1-9-1", "丸の内1-9"]);
  });

  it("当たった区にその町が無ければ、同じ都道府県のほかの市区町村の町（豊島区ではなく北区豊島）。別の県の同じ町名は使わない", async () => {
    const g = fakeGsi({ "東京都豊島区豊島1-1-1": ["東京都豊島区"], "豊島1-1-1": ["東京都北区豊島一丁目１番１号", "福井県福井市豊島一丁目１番１号"] });
    const r = await correctAddress("東京都豊島1-1-1", at("東京都豊島区"), g.search);
    expect(r && "query" in r && r.query).toBe("東京都北区豊島1-1-1");
    expect(g.asked).toHaveLength(2);
    // 名前の頭が似ているだけの別の町村（日の出町を指す「東京都日の出」）に当たったとき
    const n = fakeGsi({ "日本橋1-4-1": ["東京都中央区日本橋一丁目４番１号", "大阪府大阪市中央区日本橋一丁目４番１号"] });
    const b = await correctAddress("東京都日本橋1-4-1", at("東京都日の出"), n.search);
    expect(b && "query" in b && b.query).toBe("東京都中央区日本橋1-4-1");
  });

  it("同じ町名が2つ以上の市区町村にあれば、決めずに選んでもらう（新宿区新宿と葛飾区新宿）", async () => {
    const g = fakeGsi({
      "東京都新宿区新宿3-1-1": ["東京都新宿区新宿三丁目１番１号"],
      "新宿3-1-1": ["群馬県桐生市新宿三丁目１番１号", "東京都葛飾区新宿三丁目１番１号", "東京都新宿区新宿三丁目１番１号", "神奈川県逗子市新宿三丁目１番１号"],
    });
    const r = await correctAddress("東京都新宿3-1-1", at("東京都新宿区"), g.search);
    expect(r && "choices" in r && r.omitted).toBe(true);
    expect(r && "choices" in r && r.choices.map((c) => c.matchedAddress)).toEqual(["東京都新宿区新宿3-1-1", "東京都葛飾区新宿3-1-1"]);
  });

  it("番号の食い違う町・名前の違う町・番地の無い町は使わない。見つからなければ直さない", async () => {
    const g = fakeGsi({
      // 丁目が違う（3丁目）・名前が違う（西渋谷）・町まで（番号なし）
      "渋谷2-6-12": ["東京都大田区渋谷三丁目６番", "東京都世田谷区西渋谷二丁目６番１２号", "東京都町田市渋谷"],
      "渋谷2-6": [],
    });
    expect(await correctAddress("東京都渋谷2-6-12", at("東京都"), g.search)).toBeNull();
    expect(g.asked).toEqual(["渋谷2-6-12", "渋谷2-6"]);
    // 町が無い区（大田区に「大田」は無い）
    const none = fakeGsi({ "東京都大田区大田5-1-1": ["東京都大田区"] });
    expect(await correctAddress("東京都大田5-1-1", at("東京都大田区"), none.search)).toBeNull();
  });

  it("番地を書かずに市区町村の名前だけを入れたときは探さない（「東京都渋谷」は渋谷区、「千葉県市川」は市川市、「東京都日の出」は日の出町）", async () => {
    expect(await correctAddress("東京都渋谷", at("東京都渋谷区"), never)).toBeNull();
    expect(await correctAddress("千葉県市川", at("千葉県市川市"), never)).toBeNull();
    expect(await correctAddress("東京都日の出", at("東京都日の出", "東京都日の出町"), never)).toBeNull();
    // 市区町村をはっきり書いてあれば、町が無くてもほかの市区町村は探さない
    expect(await correctAddress("東京都杉並区杉並1-1", at("東京都杉並区"), never)).toBeNull();
    // 番地が無くても、都道府県にしか当たらなかった町は探す
    const g = fakeGsi({ 丸の内: ["東京都千代田区丸の内", "愛知県名古屋市中区丸の内"] });
    const r = await correctAddress("東京都丸の内", at("東京都"), g.search);
    expect(r && "query" in r && r.query).toBe("東京都千代田区丸の内");
  });

  it("国土地理院への問い合わせは、ほかの直しと合わせて4回まで", async () => {
    const g = fakeGsi({});
    await correctAddress("東京都髙輪1-2-3", at("東京都"), g.search);
    expect(g.asked.length).toBeLessThanOrEqual(4);
    expect(g.asked).toEqual(["東京都高輪1-2-3", "高輪1-2-3", "高輪1-2"]);
  });
});

describe("入れた場所が見つかっていないか（placeNotFound）", () => {
  it("都道府県にしか当たらない・頭が似ているだけの別の町村に当たったときだけ", () => {
    expect(placeNotFound("東京都丸の内1-9-1", "東京都")).toBe(true);
    expect(placeNotFound("東京都存在しない町", "東京都")).toBe(true);
    expect(placeNotFound("東京都日本橋1-4-1", "東京都日の出")).toBe(true);
    // 入れたとおりの場所
    expect(placeNotFound("東京都", "東京都")).toBe(false);
    expect(placeNotFound("東京都日の出", "東京都日の出")).toBe(false);
    expect(placeNotFound("東京都日の出1-1", "東京都日の出")).toBe(false);
    // 都道府県を書いていない入力・市区町村まで当たった結果は、今までどおり
    expect(placeNotFound("東京", "東京都")).toBe(false);
    expect(placeNotFound("東京都千代田区存在しない町1-1", "東京都千代田区")).toBe(false);
    expect(placeNotFound("東京都渋谷区神南1-19-11", "東京都渋谷区神南一丁目１９番１１号")).toBe(false);
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

  it("1字の名前の市（堺市）は、続きがその市の区のときだけ「市」を足す（町名と区別できないので）", () => {
    expect(fixMunicipality("大阪府堺堺区南瓦町3-1")).toBe("大阪府堺市堺区南瓦町3-1");
    expect(fixMunicipality("堺北区百舌鳥赤畑町1-3-1")).toBe("堺市北区百舌鳥赤畑町1-3-1");
    expect(fixMunicipality("大阪府堺1-1")).toBeNull();
    expect(fixMunicipality("三重県津栄町1-1")).toBeNull();
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

  it("岩手県などの地割（「第13地割」）は町名の一部。国土地理院の「大字…第十三地割」（大字つき・漢数字）と同じと見る", () => {
    // 国土地理院の住所検索の答え（2026-11-09）
    expect(describeMatch("岩手県紫波郡矢巾町大字南矢幅第13地割123番地", "岩手県矢巾町大字南矢幅第十三地割１２３番地")).toBeNull();
    expect(describeMatch("矢巾町南矢幅第13地割123", "岩手県矢巾町大字南矢幅第十三地割１２３番地")).toBeNull();
    expect(describeMatch("岩手県九戸郡野田村大字野田第20地割14番地", "岩手県野田村大字野田第二十地割１４番地")).toBeNull();
    expect(describeMatch("岩手県岩手郡岩手町大字五日市第10地割44番地", "岩手県岩手町大字五日市第十地割４４番地")).toBeNull();
    // 違う地割に当たったら言う
    expect(describeMatch("岩手県紫波郡矢巾町大字南矢幅第13地割123番地", "岩手県矢巾町大字南矢幅第十二地割")?.miss).toEqual({
      typed: "南矢幅第13地割",
      found: "大字南矢幅第十二地割",
      kind: "town",
    });
  });

  // 総点検で見つけたもの：京都府の「大字植田小字堂ケ島」「字伊佐津小字ミゾクロ西」で、合っているのに「別の町を出しています」と出ていた
  it("京都府などの「小字」「字」の印の有り無しだけの違いは、同じ町（miss と言わない）", () => {
    expect(describeMatch("京都府相楽郡精華町大字植田小字堂ケ島14番", "京都府精華町大字植田堂ケ島１４番地")).toBeNull();
    expect(describeMatch("京都府相楽郡精華町大字下狛小字上新庄73番19", "京都府精華町大字下狛上新庄７３番地")).toBeNull();
    expect(describeMatch("京都府舞鶴市字伊佐津小字ミゾクロ西112番3", "京都府舞鶴市伊佐津")).toBeNull();
    // 本当に別の町なら、今までどおり知らせる
    expect(describeMatch("京都府舞鶴市字伊佐津小字ミゾクロ西112番3", "京都府舞鶴市引土")?.miss).toMatchObject({ found: "引土", kind: "town" });
  });

  it("小字の「字」を国土地理院が書かずに名前を残したとき（「高善寺字大川鉢」→「高善寺大川鉢」）は何も言わない", () => {
    expect(describeMatch("岩手県二戸郡一戸町高善寺字大川鉢24番地9", "岩手県一戸町高善寺大川鉢２４番地")).toBeNull();
  });
});

describe("部品", () => {
  it("町名の近さ：送り仮名・1字違いは同じ、2字の町は同じでないとだめ", () => {
    expect(similarTown("南大通", "南大通り")).toBe(true);
    expect(similarTown("南大道り", "南大通り")).toBe(true);
    expect(similarTown("本町", "元町")).toBe(false);
    expect(similarTown("千住朝日町", "千住旭町")).toBe(false);
  });
  it("地割の番号は番地ではなく町名に入れる", () => {
    expect(typedParts("岩手県紫波郡矢巾町大字南矢幅第13地割123番地")).toEqual({ pref: "岩手県", place: "矢巾町南矢幅第13地割", num: "123番地" });
    expect(typedParts("矢巾町南矢幅第１３地割１２３")).toEqual({ pref: "", place: "矢巾町南矢幅第13地割", num: "123" });
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
