import { describe, expect, it } from "vitest";
import { kuikiAllows, kuikiChome, kuikiSubLabel, townCounters } from "./parcel";
import { addressSub, altsNote, awayLabel, awayNote, elsewhereLabel, elsewhereNote, kanjiNumber, sameTownName, subCompatible, subNorm, subParse, typedChome } from "./parcel-sub";

describe("町より細かい区分（丁目・地割・号・字・区・部・小字）の読み取り", () => {
  it("漢数字を数にする（位の字が無ければ並べて読む）", () => {
    expect(kanjiNumber("十六")).toBe(16);
    expect(kanjiNumber("二十")).toBe(20);
    expect(kanjiNumber("百一")).toBe(101);
    expect(kanjiNumber("千二百三")).toBe(1203);
    expect(kanjiNumber("二七")).toBe(27);
    expect(kanjiNumber("九")).toBe(9);
  });

  it("書き方の違いをそろえる（全角・旧字・壱弐参・ひらがな・ヶ・ノ・ッ）", () => {
    expect(subNorm("字杉の実")).toBe(subNorm("字杉ノ実"));
    expect(subNorm("清水が丘")).toBe(subNorm("清水ヶ丘"));
    expect(subNorm("字澤田")).toBe(subNorm("字沢田"));
    expect(subNorm("弐七部")).toBe("27部");
    expect(subNorm("第１６地割")).toBe(subNorm("第十六地割"));
    expect(subNorm("へ")).toBe("ヘ");
  });

  it("番号と名前に分ける", () => {
    expect(subParse("第16地割")).toEqual({ nums: { 地割: [16] }, name: "" });
    expect(subParse("第十六地割")).toEqual({ nums: { 地割: [16] }, name: "" });
    expect(subParse("字杉ノ実")).toEqual({ nums: {}, name: "杉ノ実" });
    expect(subParse("小字仲ノ谷")).toEqual({ nums: {}, name: "仲ノ谷" });
    expect(subParse("49号村上")).toEqual({ nums: { 号: [49] }, name: "村上" });
    expect(subParse("99字北土亀橋")).toEqual({ nums: { 字: [99] }, name: "北土亀橋" });
    expect(subParse("3丁目字東")).toEqual({ nums: { 丁目: [3] }, name: "東" });
    // 堺市の「2丁」は丁目と同じ
    expect(subParse("二丁")).toEqual({ nums: { 丁目: [2] }, name: "" });
    expect(subParse("ソ")).toEqual({ nums: {}, name: "ソ" });
    expect(subParse("字一丁目塩越")).toEqual({ nums: { 丁目: [1] }, name: "塩越" });
    expect(subParse("字大佛二番")).toEqual({ nums: { 番: [2] }, name: "大佛" });
    expect(subParse("")).toBeNull();
    expect(subParse("字")).toBeNull();
  });

  it("食い違うのは、同じ数え方の番号が違う・名前が違うときだけ", () => {
    const p = (s: string) => subParse(s);
    expect(subCompatible(p("第16地割"), p("第９地割"))).toBe(false);
    expect(subCompatible(p("第16地割"), p("第１６地割"))).toBe(true);
    expect(subCompatible(p("字杉ノ実"), p("字追回"))).toBe(false);
    expect(subCompatible(p("字杉の実"), p("字杉ノ実"))).toBe(true);
    expect(subCompatible(p("49号村上"), p("１０号"))).toBe(false);
    expect(subCompatible(p("49号村上"), p("４９号"))).toBe(true);
    expect(subCompatible(p("49号村上"), p("村上"))).toBe(true);
    // 片方にしか無い区分は比べられない（通す）
    expect(subCompatible(p("字一町田"), null)).toBe(true);
    expect(subCompatible(p("3丁目"), p("字東"))).toBe(true);
    expect(subCompatible(null, p("字東"))).toBe(true);
  });
});

describe("入力の住所から区分を取り出す", () => {
  it("見つかった町の名前より後ろを読む", () => {
    expect(addressSub("秋田県南秋田郡井川町浜井川字杉ノ実", "浜井川", "井川町")).toEqual({ nums: {}, name: "杉ノ実" });
    expect(addressSub("岩手県花巻市石鳥谷町好地第16地割", "石鳥谷町好地", "花巻市")).toEqual({ nums: { 地割: [16] }, name: "" });
    expect(addressSub("山形県鶴岡市羽黒町手向字手向", "羽黒町手向", "鶴岡市")).toEqual({ nums: {}, name: "手向" });
    expect(addressSub("石川県羽咋郡志賀町貝田ソ", "貝田", "志賀町")).toEqual({ nums: {}, name: "ソ" });
    expect(addressSub("福井県三方上中郡若狭町鳥浜49号村上", "鳥浜", "若狭町")).toEqual({ nums: { 号: [49] }, name: "村上" });
    expect(addressSub("石川県河北郡津幡町字能瀬へ", "字能瀬", "津幡町")).toEqual({ nums: {}, name: "ヘ" });
    expect(addressSub("川口市青木2丁目", "青木", "川口市")).toEqual({ nums: { 丁目: [2] }, name: "" });
  });

  it("町の名前までしか書いていなければ null（照らし合わせない）", () => {
    expect(addressSub("埼玉県熊谷市下奈良", "下奈良", "熊谷市")).toBeNull();
    expect(addressSub("熊谷市大字三ケ尻", "三ヶ尻", "熊谷市")).toBeNull();
    // 丁目の書き方（2丁目と二丁目）が違っても同じ町
    expect(addressSub("川口市青木2丁目", "青木二丁目", "川口市")).toBeNull();
    // 地割の書き方（第16地割と第十六地割）が違っても同じ町
    expect(addressSub("花巻市石鳥谷町好地第16地割", "石鳥谷町好地第十六地割", "花巻市")).toBeNull();
  });

  it("市区町村の名前の中の同じ文字には当てない（「中央区中央」「手向字手向」）", () => {
    expect(addressSub("千葉県千葉市中央区中央", "中央", "千葉市中央区")).toBeNull();
    expect(addressSub("千葉市中央区中央", "中央")).toBeNull();
    expect(addressSub("山形県鶴岡市羽黒町手向字手向", "手向", "鶴岡市")).toEqual({ nums: {}, name: "手向" });
    expect(addressSub("東京都町田市原町田", "原町田", "町田市")).toBeNull();
  });

  it("町の名前のすぐ後ろの「町」「村」だけは区分にしない。「町屋」のような小字は残す", () => {
    expect(addressSub("熊谷市下奈良町", "下奈良", "熊谷市")).toBeNull();
    expect(addressSub("熊谷市下奈良町字東原", "下奈良", "熊谷市")).toEqual({ nums: {}, name: "東原" });
    expect(addressSub("大野市大野町屋", "大野", "大野市")).toEqual({ nums: {}, name: "町屋" });
  });

  it("町の名前が入力に無ければ null（書き間違いを直して別の名前で見つけたとき）", () => {
    expect(addressSub("宇都宮市南大道り", "南大通り", "宇都宮市")).toBeNull();
    expect(addressSub("熊谷市下奈良", "", "熊谷市")).toBeNull();
  });
});

describe("地番区域が入力の区分と食い違わないか", () => {
  const sub = (body: string, town: string, city = "") => addressSub(body, town, city);

  it("小字が違う筆は当てない（鶴岡市羽黒町手向・井川町浜井川・志賀町貝田）", () => {
    const s = sub("南秋田郡井川町浜井川字杉ノ実", "浜井川", "井川町");
    expect(kuikiAllows("南秋田郡井川町_浜井川__字追回_", s, "浜井川")).toBe(false);
    expect(kuikiAllows("南秋田郡井川町_浜井川__字杉ノ実_", s, "浜井川")).toBe(true);
    // 小字の書いていない地番区域は比べられない
    expect(kuikiAllows("南秋田郡井川町_浜井川___", s, "浜井川")).toBe(true);

    const t = sub("鶴岡市羽黒町手向字手向", "羽黒町手向", "鶴岡市");
    expect(kuikiAllows("鶴岡市_羽黒町手向__字羽黒山_", t, "羽黒町手向")).toBe(false);
    expect(kuikiAllows("鶴岡市_羽黒町手向__字手向_", t, "羽黒町手向")).toBe(true);
    // 小字の名前が大字の終わりと同じでも、入力の小字が違えば当てない
    const u = sub("鶴岡市羽黒町手向字羽黒山", "羽黒町手向", "鶴岡市");
    expect(kuikiAllows("鶴岡市_羽黒町手向__字手向_", u, "羽黒町手向")).toBe(false);

    const k = sub("羽咋郡志賀町貝田ソ", "貝田", "志賀町");
    expect(kuikiAllows("羽咋郡志賀町_貝田__丙_", k, "貝田")).toBe(false);
    expect(kuikiAllows("羽咋郡志賀町_貝田__ソ_", k, "貝田")).toBe(true);
  });

  it("地割・号・字・丁目の番号が違う筆は当てない（花巻市・若狭町・越前市・堺市）", () => {
    const s = sub("花巻市石鳥谷町好地第16地割", "石鳥谷町好地", "花巻市");
    expect(kuikiAllows("花巻市_石鳥谷町好地_第９地割__", s, "石鳥谷町好地")).toBe(false);
    expect(kuikiAllows("花巻市_石鳥谷町好地_第１６地割__", s, "石鳥谷町好地")).toBe(true);
    expect(kuikiAllows("花巻市_石鳥谷町好地_１６地割__", s, "石鳥谷町好地")).toBe(true);

    const w = sub("三方上中郡若狭町鳥浜49号村上", "鳥浜", "若狭町");
    expect(kuikiAllows("三方上中郡若狭町_鳥浜_１０号__", w, "鳥浜")).toBe(false);
    expect(kuikiAllows("三方上中郡若狭町_鳥浜_４９号__", w, "鳥浜")).toBe(true);

    const e = sub("越前市広瀬町99字北土亀橋", "広瀬町", "越前市");
    expect(kuikiAllows("越前市_広瀬町_９８字__", e, "広瀬町")).toBe(false);
    expect(kuikiAllows("越前市_広瀬町_９９字__", e, "広瀬町")).toBe(true);

    const o = sub("堺市北区中百舌鳥町2丁", "中百舌鳥町", "堺市北区");
    expect(kuikiAllows("堺市北区_中百舌鳥町_二丁__", o, "中百舌鳥町")).toBe(true);
    expect(kuikiAllows("堺市北区_中百舌鳥町_三丁__", o, "中百舌鳥町")).toBe(false);

    const c = sub("川口市青木2丁目", "青木", "川口市");
    expect(kuikiAllows("川口市_青木_２丁目__", c, "青木")).toBe(true);
    expect(kuikiAllows("川口市_青木_３丁目__", c, "青木")).toBe(false);
  });

  it("小字を丁目の欄に入れている地番区域（柴田町）も同じに比べる", () => {
    const s = sub("柴田郡柴田町大字槻木字舘前", "槻木", "柴田町");
    expect(kuikiAllows("柴田郡柴田町_大字槻木_字舘前__", s, "槻木")).toBe(true);
    expect(kuikiAllows("柴田郡柴田町_大字槻木_字東__", s, "槻木")).toBe(false);
  });

  it("小字の欄が町の名前の続きの所（豊明市「栄町」＋「上姥子」）は、区分として比べない", () => {
    const s = sub("豊明市栄町上姥子字南山", "栄町上姥子", "豊明市");
    expect(s).toEqual({ nums: {}, name: "南山" });
    expect(kuikiAllows("豊明市_栄町__上姥子_", s, "栄町上姥子")).toBe(true);
  });

  it("入力に区分が無ければ、どの地番区域も通す", () => {
    expect(kuikiAllows("南秋田郡井川町_浜井川__字追回_", null, "浜井川")).toBe(true);
    expect(kuikiAllows("南秋田郡井川町_浜井川__字追回_", undefined)).toBe(true);
  });

  it("地番区域の丁目（丁目の欄・小字の欄・大字の欄。「字五丁目」は小字の名前）", () => {
    expect(kuikiChome("川口市_青木_２丁目__")).toBe(2);
    expect(kuikiChome("名古屋市中区_栄__三丁目_")).toBe(3);
    expect(kuikiChome("飯田市_白山町三丁目東___")).toBe(3);
    expect(kuikiChome("下野市_薬師寺__字五丁目_")).toBeNull();
    expect(kuikiChome("熊谷市_下奈良___")).toBeNull();
  });

  it("町の地番区域が分かれている番号の区分（索引から。丁目は除く）", () => {
    const index = { k: { "越前市_横市町___": [], "越前市_横市町_１字__": [], "越前市_横市町_７字__": [], "越前市_別の町_３丁目__": [] } };
    expect([...townCounters(index, "横市町")]).toEqual(["字"]);
    expect([...townCounters(index, "別の町三丁目")]).toEqual([]);
    expect([...townCounters(null, "横市町")]).toEqual([]);
  });

  it("案内に出す区分の名前", () => {
    expect(kuikiSubLabel("花巻市_石鳥谷町好地_第９地割__")).toBe("第9地割");
    expect(kuikiSubLabel("鶴岡市_羽黒町手向__字羽黒山_")).toBe("字羽黒山");
    expect(kuikiSubLabel("熊谷市_下奈良___")).toBe("");
  });
});

describe("案内の文", () => {
  it("同じ地番が別の区分にあったとき", () => {
    expect(elsewhereNote([{ label: "字羽黒山" }])).toBe("同じ地番は「字羽黒山」にあります（入れた丁目・小字・地割などとは別の土地なので、出していません）。");
    expect(elsewhereNote(["第9地割", "第18地割", "第20地割", "第21地割"].map((label) => ({ label })))).toContain("「第9地割」「第18地割」「第20地割」など");
    expect(elsewhereNote(undefined)).toBe("");
    expect(elsewhereNote([])).toBe("");
  });

  it("区分の付かない地番区域の言い方（入れた住所に丁目があったかで言い分ける）", () => {
    expect(elsewhereLabel("字羽黒山")).toBe("字羽黒山");
    expect(elsewhereLabel("", true)).toBe("丁目の付かない区域");
    expect(elsewhereLabel("")).toBe("字・地割などの付かない区域");
  });

  it("同じ地番の筆がほかにもあるとき（どれか決められないときは、そう言う）", () => {
    expect(altsNote("69-2", 1, true)).toContain("この町に2か所あります");
    expect(altsNote("69-2", 1, true)).toContain("どれが入れた土地かは決められません");
    expect(altsNote("147-1", 2, false)).toBe("同じ地番 147-1 の土地が、この町にほかに2か所あります（小字ちがいなど）。");
  });

  it("もう一方の筆の向きと距離", () => {
    const from = { lat: 40.4788554, lng: 140.6287122 };
    expect(awayLabel(from, { lat: 40.4725725, lng: 140.6292972 })).toBe("南へ 700m");
    expect(awayLabel(from, { lat: from.lat + 0.02, lng: from.lng + 0.026 })).toBe("北東へ 3.1km");
    expect(awayLabel(from, { lat: from.lat, lng: from.lng - 0.001 })).toBe("西へ 80m");
  });
});

describe("入力の住所の丁目（typedChome）", () => {
  it("町の名前のすぐ後ろの丁目", () => {
    expect(typedChome("神奈川県川崎市麻生区上麻生1丁目", "上麻生一丁目", "川崎市麻生区")).toBe(1);
    expect(typedChome("神奈川県川崎市麻生区上麻生一丁目", "上麻生", "川崎市麻生区")).toBe(1);
    expect(typedChome("石川県加賀市小菅波町2丁目", "小菅波町", "加賀市")).toBe(2);
    expect(typedChome("群馬県伊勢崎市赤堀今井町一丁目", "赤堀今井町一丁目", "伊勢崎市")).toBe(1);
  });

  it("「字五丁目」は小字の名前なので丁目にしない。丁目が無ければ null", () => {
    expect(typedChome("栃木県下野市薬師寺字五丁目", "薬師寺", "下野市")).toBeNull();
    expect(typedChome("兵庫県南あわじ市福良字弐丁目", "福良", "南あわじ市")).toBeNull();
    expect(typedChome("埼玉県熊谷市下奈良", "下奈良", "熊谷市")).toBeNull();
    expect(typedChome("千葉県東金市田間字新町", "田間", "東金市")).toBeNull();
  });

  it("市区町村の名前の中の町の名前には当てない（「中央区中央」）", () => {
    expect(typedChome("千葉県千葉市中央区中央3丁目", "中央三丁目", "千葉市中央区")).toBe(3);
  });
});

describe("離れた町で見つかった筆", () => {
  it("同じ町の名前か（丁目・大字・字の書き方の違いは同じ）", () => {
    expect(sameTownName("中央台高久一丁目", "中央台高久１丁目")).toBe(true);
    expect(sameTownName("大字下奈良", "下奈良")).toBe(true);
    expect(sameTownName("平絹谷", "中央台高久一丁目")).toBe(false);
    expect(sameTownName("", "下奈良")).toBe(false);
  });

  it("案内の文", () => {
    expect(awayNote("17-12", { km: 10.1, town: "平絹谷" })).toBe(
      "地番 17-12 の筆は、入れた町から約10km 離れた「平絹谷」で見つかりました。地図データの置き間違いのおそれがあるため、物件の場所としては出していません。",
    );
    expect(awayNote("5-3", { km: 3.4, town: "西長岡町" })).toContain("約3.4km");
  });
});
