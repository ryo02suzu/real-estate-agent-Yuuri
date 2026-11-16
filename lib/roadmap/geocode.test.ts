import { describe, expect, it } from "vitest";
import { branchUnmatched, addressNumbers, isApproximate, kyotoChoices, kyotoStreet, kyotoTown, matchedNumbers, numbersAgree, partialMatch, streetSide, subAreaDropped, withoutNumbers } from "./geocode";

describe("住所の一致の深さ", () => {
  it("番地がまったく無い一致は、町の中心（isApproximate）", () => {
    expect(isApproximate("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目")).toBe(true);
    expect(isApproximate("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目９番")).toBe(false);
  });

  it("号などが見つからず、その手前までの一致を見分ける（漢数字の丁目・全角の数字も数える）", () => {
    expect(partialMatch("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目９番")).toBe(true);
    expect(partialMatch("東京都千代田区丸の内一丁目9番1号", "東京都千代田区丸の内一丁目９番")).toBe(true);
    expect(partialMatch("渋谷区神南1-19-11", "東京都渋谷区神南一丁目１９番１１号")).toBe(false);
    // 建物名・部屋番号の数字は数えない（丁目・番地・号の3つまで）
    expect(partialMatch("渋谷区神南1-19-11 ビル301", "東京都渋谷区神南一丁目１９番１１号")).toBe(false);
    // 郵便番号は数えない
    expect(partialMatch("〒150-0041 渋谷区神南1-19-11", "東京都渋谷区神南一丁目１９番１１号")).toBe(false);
    // 町の中心だけの一致は isApproximate の側
    expect(partialMatch("千代田区丸の内1-9-1", "東京都千代田区丸の内")).toBe(false);
  });

  // 北海道の「北1条西2丁目」の「1条」は町名の一部（国土地理院は「北一条西二丁目」と漢数字で返す。2026-11-15 に実際に返った形）
  it("北海道の条（「北1条西」「7条通」）の番号は町名の一部：番地として数えない", () => {
    expect(addressNumbers("北海道札幌市中央区北1条西2丁目1-1")).toEqual([2, 1, 1]);
    expect(addressNumbers("北海道札幌市中央区北一条西二丁目１番地")).toEqual([2, 1]);
    expect(addressNumbers("北海道札幌市北区北２４条西６丁目１−１")).toEqual([6, 1, 1]);
    // 丁目・番まで入れて、番まで合っている → 一部だけの一致ではない
    expect(partialMatch("北海道帯広市西5条南7丁目1", "北海道帯広市西五条南七丁目１番地")).toBe(false);
    expect(partialMatch("北海道虻田郡倶知安町北1条東3丁目3", "北海道倶知安町北一条東三丁目３番地")).toBe(false);
    // 号まで入れて、番までの一致 → 一部だけの一致
    expect(partialMatch("北海道札幌市中央区北1条西2丁目1-1", "北海道札幌市中央区北一条西二丁目１番地")).toBe(true);
    expect(partialMatch("札幌市北区北24条西6丁目1-1", "北海道札幌市北区北二十四条西六丁目１番１号")).toBe(false);
    // 条までしか書いていない → 番地を書いていないので、町の中心とは言わない
    expect(isApproximate("北海道札幌市中央区北1条西", "北海道札幌市中央区北一条西")).toBe(false);
    // 番地を書いたのに丁目までしか合わない → 町の中心
    expect(isApproximate("北海道旭川市7条通9丁目48", "北海道旭川市七条通九丁目")).toBe(true);
    expect(isApproximate("北海道帯広市西5条南7丁目1", "北海道帯広市西五条南七丁目１番地")).toBe(false);
    expect(matchedNumbers("北海道札幌市北区北二十四条西六丁目１番１号")).toEqual([1, 1]);
    expect(numbersAgree("北海道札幌市中央区北1条西2丁目1-1", "北海道札幌市中央区北一条西二丁目１番地")).toBe(true);
    expect(numbersAgree("北海道帯広市西5条南7丁目1", "北海道帯広市西五条南七丁目１番地")).toBe(true);
    // 条の番号と同じ数の、別の番地に当たったら食い違い（「1条」の 1 を番地の 1 と数えない）
    expect(numbersAgree("北海道札幌市中央区北1条西2丁目5-3", "北海道札幌市中央区北一条西二丁目１番地")).toBe(false);
    // 京都の通り名の「四条」（漢数字）は、今までどおり数えない
    expect(addressNumbers("京都府京都市下京区四条通烏丸東入長刀鉾町20")).toEqual([20]);
  });
  it("地割（「第13地割」）の番号は町名の一部：番地として数えず、国土地理院の漢数字（第十三地割）と同じに数える", () => {
    expect(partialMatch("矢巾町大字南矢幅第13地割123番地", "岩手県矢巾町大字南矢幅第十三地割１２３番地")).toBe(false);
    expect(isApproximate("矢巾町大字南矢幅第13地割123番地", "岩手県矢巾町大字南矢幅第十三地割１２３番地")).toBe(false);
    // 番地を書かずに地割まで → 町の中心ではない（入れたとおり）
    expect(isApproximate("矢巾町大字南矢幅第13地割", "岩手県矢巾町大字南矢幅第十三地割")).toBe(false);
    // 番地を書いたのに地割までしか合わない → 町の中心
    expect(isApproximate("矢巾町大字南矢幅第13地割123番地", "岩手県矢巾町大字南矢幅第十三地割")).toBe(true);
    expect(addressNumbers("岩手県野田村大字野田第二十地割１４番地")).toEqual([20, 14]);
  });
});

describe("見つかった番地が、入れた番地と食い違わないか", () => {
  it("見つかった住所の終わりの番地・号を読む", () => {
    expect(matchedNumbers("千葉県松戸市松戸３番地")).toEqual([3]);
    expect(matchedNumbers("大阪府豊中市寺内二丁目１３番５７号")).toEqual([13, 57]);
    expect(matchedNumbers("東京都千代田区丸の内一丁目")).toEqual([]);
    // 地割の番号は町名の一部
    expect(matchedNumbers("岩手県花巻市石鳥谷町好地第十六地割２４番地")).toEqual([24]);
    expect(matchedNumbers("岩手県花巻市石鳥谷町好地第１６地割")).toEqual([]);
    expect(withoutNumbers("千葉県松戸市松戸３番地")).toBe("千葉県松戸市松戸");
    expect(withoutNumbers("東京都世田谷区弦巻三丁目１４番１号")).toBe("東京都世田谷区弦巻三丁目");
    expect(withoutNumbers("千葉県松戸市松戸")).toBe("千葉県松戸市松戸");
  });

  // 2026-11-13 の総当たり（地価公示・地価調査の所在）：国土地理院が小字の漢数字を番地と読み、1km 以上離れた別の番地を返していた
  it("小字の名前の漢数字を番地と読んだ一致は、食い違い（松戸字三丁目・東長沼字五号・内谷字八反田）", () => {
    expect(numbersAgree("千葉県松戸市松戸字三丁目1791番1", "千葉県松戸市松戸３番地")).toBe(false);
    expect(numbersAgree("東京都稲城市大字東長沼字五号1719番7", "東京都稲城市東長沼５番地")).toBe(false);
    expect(numbersAgree("静岡県藤枝市岡部町内谷字八反田623番1", "静岡県藤枝市岡部町内谷８番地")).toBe(false);
    expect(numbersAgree("千葉県松戸市松戸字三丁目1791番1", "千葉県松戸市松戸１７９１番地")).toBe(true);
    expect(numbersAgree("地番 千葉県松戸市松戸字三丁目1791-1", "千葉県松戸市松戸３番地")).toBe(false);
    // 「49号」を番地と読んだ一致も食い違い
    expect(numbersAgree("福井県三方上中郡若狭町鳥浜49号村上31番4", "福井県若狭町鳥浜４９番地")).toBe(false);
    // 丁目が違う
    expect(numbersAgree("川口市青木2丁目217-8", "埼玉県川口市青木三丁目２１７番")).toBe(false);
  });

  it("枝番・号が無いだけの一致、町までの一致は食い違いではない", () => {
    expect(numbersAgree("愛知県豊橋市明海町2番23", "愛知県豊橋市明海町２番地")).toBe(true);
    expect(numbersAgree("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目９番")).toBe(true);
    expect(numbersAgree("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目")).toBe(true);
    expect(numbersAgree("東京都世田谷区弦巻3丁目14番1", "東京都世田谷区弦巻三丁目１４番１号")).toBe(true);
    expect(numbersAgree("岩手県花巻市石鳥谷町好地第16地割24番2", "岩手県花巻市石鳥谷町好地第十六地割２４番地")).toBe(true);
    expect(numbersAgree("取手市白山3丁目乙987番1", "茨城県取手市白山三丁目９８７番地")).toBe(true);
    expect(numbersAgree("福井県三方上中郡若狭町鳥浜49号村上31番4", "福井県若狭町鳥浜３１番地")).toBe(true);
    expect(numbersAgree("大阪府堺市北区東上野芝町2丁182番", "大阪府堺市北区東上野芝町二丁１８２番地")).toBe(true);
    // 丁目を書かない入力（番号が2つまで）は、見つかった丁目を確かめられないので通す
    expect(numbersAgree("川口市青木217-8", "埼玉県川口市青木二丁目２１７番")).toBe(true);
  });

  it("住居表示の書き方も、見つかった番・号が入力と違えば食い違い", () => {
    expect(numbersAgree("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目５番")).toBe(false);
    expect(numbersAgree("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目９番２号")).toBe(false);
    expect(numbersAgree("千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目１番")).toBe(false);
    expect(numbersAgree("山形県米沢市花沢町1-2-11-11", "山形県米沢市花沢町一丁目２番１１号")).toBe(true);
    expect(numbersAgree("渋谷区神南1-19-11 ビル301", "東京都渋谷区神南一丁目１９番１１号")).toBe(true);
    // 町名に数字を書いた入力（1番町）でも、見つかった番号が続きで入っていれば合う
    expect(numbersAgree("仙台市青葉区1番町1-2-3", "宮城県仙台市青葉区一番町一丁目２番３号")).toBe(true);
    // 入力の番号を読み取れない（漢数字だけ）ときは、食い違いとしない
    expect(numbersAgree("千代田区丸の内一丁目九番一号", "東京都千代田区丸の内一丁目９番１号")).toBe(true);
  });
});

describe("入力の番号の区分が、見つかった住所に無いか（subAreaDropped）", () => {
  it("「10字」「第16地割」を飛ばして番地だけで当てたもの", () => {
    expect(subAreaDropped("福井県越前市横市町10字四ノ縄1番4", "福井県越前市横市町１番地")).toBe(true);
    expect(subAreaDropped("岩手県花巻市石鳥谷町好地第16地割24番2", "岩手県花巻市石鳥谷町好地２４番地")).toBe(true);
  });
  it("区分まで合っている・区分を書いていない・小字の名前だけ（番号が無い）は当てはまらない", () => {
    expect(subAreaDropped("岩手県花巻市石鳥谷町好地第16地割24番2", "岩手県花巻市石鳥谷町好地第十六地割２４番地")).toBe(false);
    expect(subAreaDropped("埼玉県熊谷市下奈良391番地3", "埼玉県熊谷市下奈良３９１番地")).toBe(false);
    expect(subAreaDropped("山形県鶴岡市羽黒町手向字手向147番1", "山形県鶴岡市羽黒町手向１４７番地")).toBe(false);
  });
});

// 総点検：地番の書き方の住所の約3割は、国土地理院が「〇〇番地」までしか持たない。枝番の違う土地は離れていることがある（最大 1.3km）
describe("地番の枝番が合っていない一致（branchUnmatched）", () => {
  it("見つかった住所が「番地」までで、入力に枝番がある", () => {
    expect(branchUnmatched("青森県青森市大字新城字山田587番255", "青森県青森市大字新城山田５８７番地")).toBe(true);
    expect(branchUnmatched("東京都八王子市片倉町939番92", "東京都八王子市片倉町９３９番地")).toBe(true);
    expect(branchUnmatched("京都府宇治市羽戸山3丁目1番135", "京都府宇治市羽戸山三丁目１番地")).toBe(true);
  });
  it("番地まで合っている・住居表示の号が無いだけ・町までの一致は当てはまらない", () => {
    expect(branchUnmatched("群馬県伊勢崎市昭和町3913番", "群馬県伊勢崎市昭和町３９１３番地")).toBe(false);
    expect(branchUnmatched("東京都千代田区丸の内1-9-1", "東京都千代田区丸の内一丁目９番")).toBe(false);
    expect(branchUnmatched("神奈川県大和市つきみ野4丁目4番8", "神奈川県大和市つきみ野四丁目４番")).toBe(false);
    expect(branchUnmatched("埼玉県熊谷市大字三ケ尻9999番1", "埼玉県熊谷市三ケ尻")).toBe(false);
  });
});

describe("通りの北・南に分かれた丁目を、丁目を書かずに書いた住所（streetSide）", () => {
  it("「本通14北5-35」を「本通14丁目北5-35」にする（国土地理院は「十四丁目南」と「十四丁目北」の両方を返し、南を当てると道の反対側の町になる）", () => {
    expect(streetSide("北海道札幌市白石区本通14北5-35")).toBe("北海道札幌市白石区本通14丁目北5-35");
    expect(streetSide("札幌市白石区平和通16北3-15")).toBe("札幌市白石区平和通16丁目北3-15");
    expect(streetSide("札幌市白石区南郷通7南1-13")).toBe("札幌市白石区南郷通7丁目南1-13");
  });
  it("丁目を書いた住所・条の住所・ほかの地方の住所は変えない", () => {
    for (const a of ["北海道札幌市白石区本通14丁目北5-35", "北海道札幌市中央区南1条西2丁目", "北海道札幌市北区北28条西13-1-13", "札幌市中央区南1西2", "東京都千代田区神田神保町1-2-3", "愛知県名古屋市中区栄3-15-33"])
      expect(streetSide(a)).toBe(a);
  });
});

describe("京都市の通り名の住所（kyotoStreet）", () => {
  it("通り名と向き（上る・下る・西入・東入）を外して、町名から始まる形にする（国土地理院は通り名の住所を別の町に当てることがある）", () => {
    // 国の地価の地点の所在。通り名のままだと国土地理院は「下之町」「松原中之町」「新シ町」に当て、町名からだとその町の番地に当たる（2026-11-16 に確かめた）
    expect(kyotoStreet("京都府京都市上京区下長者町通七本松西入鳳瑞町233番10")).toBe("京都府京都市上京区鳳瑞町233番10");
    expect(kyotoStreet("京都府京都市下京区松原通新町東入中野之町172番")).toBe("京都府京都市下京区中野之町172番");
    expect(kyotoStreet("京都府京都市下京区新町通綾小路下る船鉾町388番")).toBe("京都府京都市下京区船鉾町388番");
    expect(kyotoStreet("京都市中京区烏丸通御池下る虎屋町566-1")).toBe("京都市中京区虎屋町566-1");
  });
  it("向きが2つ続く住所・向きの後ろの「2丁目」「西側」も外す", () => {
    expect(kyotoStreet("京都府京都市上京区今出川通出町西入上る三芳町157番")).toBe("京都府京都市上京区三芳町157番");
    expect(kyotoStreet("京都府京都市下京区四条通寺町東入2丁目御旅町51番")).toBe("京都府京都市下京区御旅町51番");
    expect(kyotoStreet("京都府京都市下京区大宮通松原下る西側上五条町399番2")).toBe("京都府京都市下京区上五条町399番2");
    expect(kyotoStreet("京都市下京区猪熊通綾小路下ル瀬戸屋町307番1")).toBe("京都市下京区瀬戸屋町307番1");
  });
  it("通り名の無い住所・向きの後ろに町名の無い住所・京都市の外の住所は変えない", () => {
    for (const a of [
      "京都府京都市右京区御室小松野町30番15",
      "京都府京都市伏見区深草西浦町4丁目11",
      "京都府京都市中京区烏丸通御池下る",
      "京都府京都市中京区烏丸通御池下る2-1",
      "京都府宇治市宇治又振17",
      "北海道札幌市白石区本通14丁目北5-35",
      "大阪府大阪市北区梅田1-1-1",
    ])
      expect(kyotoStreet(a)).toBe(a);
  });
  it("同じ区に同じ名前の町がある住所：括弧の中の通り名（法務省の地番区域「鍛冶屋町（西洞院通正面）」）が住所の通り名にある町に決め、その町の位置を返す", () => {
    // 国の地価の地点の所在（2026-11-16）。国土地理院は「下京区鍛冶屋町」を1つの点にしか当てない
    expect(kyotoTown("京都府京都市下京区西洞院通正面下る鍛冶屋町446番1")).toEqual({ base: "鍛冶屋町", town: "鍛冶屋町（西洞院通正面）", lat: 34.990862, lng: 135.755241 });
    expect(kyotoStreet("京都府京都市下京区西洞院通正面下る鍛冶屋町446番1")).toBe("京都府京都市下京区鍛冶屋町446番1");
    expect(kyotoTown("京都府京都市中京区河原町通二条下る下丸屋町400")?.town).toBe("下丸屋町（河原町通二条）");
    expect(kyotoTown("京都府京都市上京区大宮通寺之内半丁下る東入西北小路町445番")?.town).toBe("西北小路町（大宮通寺之内）");
    // 括弧なしの町と括弧付きの町がある名前（下京区の「上之町」と「上之町（大宮通木津屋橋）」）
    expect(kyotoTown("京都府京都市下京区大宮通木津屋橋上る上之町417番1")?.town).toBe("上之町（大宮通木津屋橋）");
    // 通り名を逆に書いたもの（「千本通中立売」の町を「中立売通千本」で書く）
    expect(kyotoTown("京都府京都市上京区中立売通千本東入玉屋町41番1")?.town).toBe("玉屋町（千本通中立売）");
  });
  it("同じ区に同じ名前の町があって町を決められない住所（括弧の中の通り名が無い・位置が分からない・通り名が無い）は、通り名を付けたまま探す", () => {
    for (const a of [
      // 材木町（七条通高倉）の地価の地点。所在は別の交わり（間之町）で書かれている
      "京都府京都市下京区七条通間之町東入材木町481番",
      "京都府京都市中京区東洞院通二条下る壺屋町1",
      "京都府京都市中京区下丸屋町400",
    ]) {
      expect(kyotoTown(a)).toBeNull();
      expect(kyotoStreet(a)).toBe(a);
    }
    // 同じ名前の町でなければ決めない（通り名は外す）
    expect(kyotoTown("京都府京都市上京区下長者町通七本松西入鳳瑞町233番10")).toBeNull();
  });
  it("町名に括弧で通り名を付けた住所（候補から選んだ住所「下丸屋町（河原町通二条）400」）は、その町に決め、国土地理院には括弧を外して聞く", () => {
    expect(kyotoTown("京都府京都市中京区下丸屋町（河原町通二条）400")?.town).toBe("下丸屋町（河原町通二条）");
    expect(kyotoTown("京都府京都市中京区下丸屋町(小川通竹屋町)400")?.town).toBe("下丸屋町（小川通竹屋町）");
    expect(kyotoStreet("京都府京都市中京区下丸屋町（河原町通二条）400")).toBe("京都府京都市中京区下丸屋町400");
    // 括弧の中が地番区域に無い名前なら決めない
    expect(kyotoTown("京都府京都市中京区下丸屋町（烏丸通二条）400")).toBeNull();
  });
  it("どちらの町か決められない住所は、地番区域の町名にした候補（位置付き）を返す", () => {
    expect(kyotoChoices("京都府京都市中京区下丸屋町400")).toEqual([
      { matchedAddress: "京都府京都市中京区下丸屋町（小川通竹屋町）400", lat: 35.015533, lng: 135.754222 },
      { matchedAddress: "京都府京都市中京区下丸屋町（河原町通二条）400", lat: 35.010296, lng: 135.769704 },
    ]);
    // 通り名が別の交わりで書かれた住所（材木町（七条通高倉）の地価の地点）
    expect(kyotoChoices("京都府京都市下京区七条通間之町東入材木町481番")?.map((c) => c.matchedAddress)).toEqual([
      "京都府京都市下京区材木町（七条通高倉）481番",
      "京都府京都市下京区材木町（新町通五条）481番",
      "京都府京都市下京区材木町（木屋町通松原）481番",
    ]);
    // 決められる住所・同じ名前の町でない住所は候補にしない
    expect(kyotoChoices("京都府京都市中京区河原町通二条下る下丸屋町400")).toBeNull();
    expect(kyotoChoices("京都府京都市中京区下丸屋町（河原町通二条）400")).toBeNull();
    expect(kyotoChoices("京都府京都市上京区下長者町通七本松西入鳳瑞町233番10")).toBeNull();
    expect(kyotoChoices("京都府京都市右京区御室小松野町30番15")).toBeNull();
    // 括弧の付かない町がある名前（下京区の上之町）・位置の分からない町がある名前（中京区の壺屋町）は候補にできない
    expect(kyotoChoices("京都府京都市下京区上之町417番1")).toBeNull();
    expect(kyotoChoices("京都府京都市中京区壺屋町1")).toBeNull();
  });
});
