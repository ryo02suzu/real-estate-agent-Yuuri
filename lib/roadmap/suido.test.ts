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
  });

  it("台帳の地図が見つかっていない市区町村は空", () => {
    expect(suidoFor({ pref: "東京都", name: "千代田区" }, 35.6895, 139.7441)).toEqual([]);
  });

  it("台帳の地図を書いた市区町村（都県名＋市区町村名）が、市区町村の一覧にある", () => {
    const names = new Set(MUNICIPALITIES.map((m) => `${m.pref}${m.name}`));
    for (const key of SUIDO_CITIES) expect(names, key).toContain(key);
  });
});
