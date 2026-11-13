import { describe, expect, it } from "vitest";
import { branchUnmatched, addressNumbers, isApproximate, matchedNumbers, numbersAgree, partialMatch, subAreaDropped, withoutNumbers } from "./geocode";

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
