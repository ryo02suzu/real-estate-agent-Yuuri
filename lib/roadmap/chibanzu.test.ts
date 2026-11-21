import { describe, expect, it } from "vitest";
import { CHIBANZU_CITIES, chibanzuFor } from "./chibanzu";
import { MUNICIPALITIES } from "./municipalities";

describe("市町村の地番図", () => {
  it("公開している市町村は、地番図を物件の場所で開く", () => {
    expect(chibanzuFor({ pref: "埼玉県", name: "熊谷市" }, 36.153221, 139.392611)).toEqual({
      name: "熊谷市の地番情報",
      url: "https://www2.wagmap.jp/kumagaya/Map?mid=260&mpx=139.392611&mpy=36.153221&mps=1000&gprj=2",
      opens: "place",
    });
    expect(chibanzuFor({ pref: "群馬県", name: "高崎市" }, 36.327316, 139.007265)?.url).toBe(
      "https://www.sonicweb-asp.jp/takasaki2/map?theme=th_66&pos=139.007265%2C36.327316&scale=1000",
    );
    expect(chibanzuFor({ pref: "神奈川県", name: "相模原市" }, 35.577388, 139.377337)?.url).toBe(
      "https://sagamihara.geocloud.jp/webgis/?mp=101&z=18&ll=35.577388%2C139.377337",
    );
    expect(chibanzuFor({ pref: "埼玉県", name: "上里町" }, 36.255698, 139.147852)).toEqual({
      name: "上里町の参考地番図",
      url: "https://www.sonicweb-asp.jp/kamisato/map?theme=th_2&pos=139.147852%2C36.255698&scale=1000",
      opens: "place",
    });
  });

  it("見るだけで公開している市：開いて確かめた地図は物件の場所で開く（八王子市・高松市）", () => {
    const hachioji = chibanzuFor({ pref: "東京都", name: "八王子市" }, 35.6137, 139.3797);
    expect(hachioji).toMatchObject({
      name: "八王子市の地番現況図",
      url: "https://experience.arcgis.com/experience/61d5eb7d071644cc85c944d737dcdcdf/#widget_124=center:139.379700%2C35.613700%2C4326,scale:2000",
      opens: "place",
    });
    // 利用規約の同意は利用者が自分でする。規約の主な決まりを添える
    expect(hachioji?.tip).toContain("自分で同意");
    expect(hachioji?.tip).toContain("営業活動");
    expect(chibanzuFor({ pref: "香川県", name: "高松市" }, 34.277, 134.045)).toMatchObject({
      name: "高松市の地番現況図",
      url: "https://maps.takamatsu-fact.com/?center=134.045000%2F34.277000&zoom=18&baseMap=gsi-base#layers=cGz",
      opens: "place",
    });
  });

  it("その場所で開くことを確かめられなかった地図は、物件の場所を指定して開く（aim）", () => {
    expect(chibanzuFor({ pref: "兵庫県", name: "神戸市" }, 34.7, 135.15)).toMatchObject({
      name: "神戸市の地番参考図",
      url: "https://www2.wagmap.jp/kobecity/Map?mid=105&mpx=135.150000&mpy=34.700000&mps=1000&gprj=2",
      opens: "aim",
    });
    expect(chibanzuFor({ pref: "福島県", name: "郡山市" }, 37.4, 140.36)).toMatchObject({
      url: "https://www.sonicweb-asp.jp/koriyama2/map?theme=th_18&pos=140.360000%2C37.400000&scale=1000",
      opens: "aim",
    });
    // 市のページのリンクと同じテーマ・レイヤ
    expect(chibanzuFor({ pref: "大阪府", name: "八尾市" }, 34.626, 135.6)).toMatchObject({
      name: "八尾市の地番図",
      url: "https://www.sonicweb-asp.jp/yao/map?theme=th_17&pos=135.600000%2C34.626000&scale=1000&layers=th_17%2Cblank",
      opens: "aim",
    });
    expect(chibanzuFor({ pref: "長崎県", name: "長崎市" }, 32.75, 129.88)?.url).toBe(
      "https://www.sonicweb-asp.jp/nagasakicity/map?theme=th_5&pos=129.880000%2C32.750000&scale=1000",
    );
    // 郡山市の利用条件は、不動産取引の資料にすること・営利目的の利用を認めていない
    expect(chibanzuFor({ pref: "福島県", name: "郡山市" }, 37.4, 140.36)?.tip).toMatch(/不動産取引の資料.*営利目的/);
  });

  it("場所を渡せない市は、市のページか地図の入口を開き、そこからの手順を添える（entry）", () => {
    const chiba = chibanzuFor({ pref: "千葉県", name: "千葉市" }, 35.6, 140.12);
    expect(chiba).toMatchObject({
      name: "千葉市の土地調査図・公図副本",
      url: "https://www.city.chiba.jp/zaiseikyoku/zeimu/kazeikanri/koteishisan_zumen.html",
      opens: "entry",
    });
    expect(chiba?.tip).toContain("索引図");
    // 場所によらず同じ入口
    expect(chibanzuFor({ pref: "千葉県", name: "千葉市" }, 35.55, 140.2)?.url).toBe(chiba?.url);
    const higashiosaka = chibanzuFor({ pref: "大阪府", name: "東大阪市" }, 34.68, 135.6);
    expect(higashiosaka).toMatchObject({ name: "東大阪市の地籍図", url: "https://www.city.higashiosaka.lg.jp/0000028446.html", opens: "entry" });
    expect(higashiosaka?.tip).toContain("営利目的");
    const entries = [
      ["埼玉県", "川口市"],
      ["山梨県", "甲府市"],
      ["大阪府", "吹田市"],
      ["大阪府", "枚方市"],
      ["兵庫県", "尼崎市"],
      ["兵庫県", "明石市"],
    ] as const;
    for (const [pref, name] of entries) expect(chibanzuFor({ pref, name }, 35, 135)?.opens, name).toBe("entry");
  });

  it("地番図が見つかっていない・入れていない市区町村は無し", () => {
    expect(chibanzuFor({ pref: "東京都", name: "千代田区" }, 35.6895, 139.7441)).toBeUndefined();
    // 横浜市の地籍図（ちせぴょん）は金沢区の一部の地区だけなので入れていない。窓口で見るだけの市も入れない
    expect(chibanzuFor({ pref: "神奈川県", name: "横浜市" }, 35.33, 139.62)).toBeUndefined();
    expect(chibanzuFor({ pref: "大阪府", name: "大阪市" }, 34.69, 135.5)).toBeUndefined();
  });

  it("地番図を書いた市町村（都県名＋市区町村名）が、市区町村の一覧にある", () => {
    const names = new Set(MUNICIPALITIES.map((m) => `${m.pref}${m.name}`));
    for (const key of CHIBANZU_CITIES) expect(names, key).toContain(key);
  });

  it("どの市町村も https で開き、入口しか開けない・場所で開くか確かめていない地図には手順を添える", () => {
    for (const key of CHIBANZU_CITIES) {
      const m = MUNICIPALITIES.find((x) => `${x.pref}${x.name}` === key)!;
      const c = chibanzuFor(m, 35, 135)!;
      expect(c.url, key).toMatch(/^https:\/\//);
      if (c.opens !== "place") expect(c.tip, key).toBeTruthy();
    }
  });
});
