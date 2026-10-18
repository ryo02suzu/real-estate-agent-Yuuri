import { describe, expect, it } from "vitest";
import { MUNICIPALITIES } from "./municipalities";
import { SUIDO_CITIES, suidoFor } from "./suido";

describe("上下水道の台帳の地図", () => {
  it("公開している市町村は、下水道・上水道の台帳を物件の場所で開く", () => {
    const asaka = suidoFor({ pref: "埼玉県", name: "朝霞市" }, 35.7972, 139.5937);
    expect(asaka).toEqual([
      { kind: "下水道", name: "朝霞市の下水道台帳図", url: "https://www2.wagmap.jp/asaka/Map?mid=15&mpx=139.593700&mpy=35.797200&mps=1000&gprj=2" },
      { kind: "上水道", name: "朝霞市の水道管網図", url: "https://www2.wagmap.jp/asaka/Map?mid=14&mpx=139.593700&mpy=35.797200&mps=1000&gprj=2" },
    ]);
    expect(suidoFor({ pref: "千葉県", name: "柏市" }, 35.8676, 139.9757)[0].url).toBe(
      "https://www.sonicweb-asp.jp/kashiwa/map?theme=th_11&pos=139.975700%2C35.867600&scale=1000",
    );
    expect(suidoFor({ pref: "東京都", name: "町田市" }, 35.546552, 139.438774)).toEqual([
      { kind: "下水道", name: "町田市の下水道台帳図", url: "https://machida.kukanjoho.jp/webgis/?mp=45&z=18&ll=35.546552%2C139.438774" },
    ]);
    expect(suidoFor({ pref: "神奈川県", name: "川崎市" }, 35.5308, 139.7029)[0].url).toBe("https://kawasaki.geocloud.jp/webgis/?mp=36&z=18&ll=35.530800%2C139.702900");
    expect(suidoFor({ pref: "神奈川県", name: "相模原市" }, 35.5715, 139.373)[0].name).toBe("相模原市の下水道施設台帳平面図");
    expect(suidoFor({ pref: "千葉県", name: "我孫子市" }, 35.8695, 140.0103)[0].url).toBe("https://abiko.geocloud.jp/mp/30?z=18&ll=35.869500,140.010300");
    expect(suidoFor({ pref: "埼玉県", name: "深谷市" }, 36.1873, 139.2705)[0].url).toBe("https://fukaya.geocloud.jp/webgis/?mp=39&z=18&ll=36.187300%2C139.270500");
    expect(suidoFor({ pref: "埼玉県", name: "白岡市" }, 36.0245, 139.6698).map((l) => l.name)).toEqual(["白岡市の公共下水道台帳", "白岡市の上水道台帳"]);
    expect(suidoFor({ pref: "東京都", name: "国立市" }, 35.6902, 139.446)[0].url).toBe("https://kunitachi.geocloud.jp/webgis/?mp=9&z=18&ll=35.690200%2C139.446000");
    expect(suidoFor({ pref: "茨城県", name: "笠間市" }, 36.3472, 140.3058).map((l) => l.kind)).toEqual(["下水道", "上水道"]);
    expect(suidoFor({ pref: "群馬県", name: "藤岡市" }, 36.2606, 139.0762)[0].url).toBe("https://www2.wagmap.jp/fujioka/Map?mid=15&mpx=139.076200&mpy=36.260600&mps=1000&gprj=2");
  });

  it("台帳の地図が見つかっていない市区町村は空", () => {
    expect(suidoFor({ pref: "東京都", name: "千代田区" }, 35.6895, 139.7441)).toEqual([]);
  });

  it("台帳の地図を書いた市区町村（都県名＋市区町村名）が、市区町村の一覧にある", () => {
    const names = new Set(MUNICIPALITIES.map((m) => `${m.pref}${m.name}`));
    for (const key of SUIDO_CITIES) expect(names, key).toContain(key);
  });
});
